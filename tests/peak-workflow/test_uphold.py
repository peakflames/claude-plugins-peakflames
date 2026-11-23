"""`uphold` records: the owner decides a disputed requirement stands as written (Plan 7b)."""
import unittest

from fixtures import FixtureRepo, record_data, scenario, to_toml, tor_lifecycle as tl

A1, A2 = "TOR-01-Alpha01", "TOR-01-Bravo01"
S1, S2 = scenario(A1, "The tool shall run"), scenario(A2, "The tool shall print help")


class UpholdSchemaTests(unittest.TestCase):
    def problems(self, **overrides):
        return tl.validate_record("2026-10-26-Uph0001.toml", record_data("uphold", "Uph0001", "2026-10-26", **overrides))

    def test_valid(self):
        self.assertEqual(self.problems(), [])

    def test_must_name_a_record_and_carry_a_fingerprint(self):
        self.assertTrue(any("closes in `refs`" in p for p in self.problems(refs=["issue #4"])))
        self.assertTrue(any("`keywords`" in p for p in self.problems(keywords=None)))
        bad = [{"tor": A1, "feature_file": "01-core.feature.md", "fingerprint": "nope"}]
        self.assertTrue(any("fingerprint" in p for p in self.problems(changes=bad)))


class UpholdProjectTests(unittest.TestCase):
    def setUp(self):
        self.repo = repo = FixtureRepo()
        self.addCleanup(repo.cleanup)
        repo.feature("01", "core", [S1, S2])
        repo.sidecar("E1aaaaa", "Complete", [A1, A2], verified={A1: S1.fp(), A2: S2.fp()})
        repo.record("pending", "Pnd0001", "2026-08-01", tors=[A1],
                    changes=[{"tor": A1, "feature_file": "01-core.feature.md", "fingerprint": S1.fp()}])
        repo.commit("dispute")

    def uphold(self, tors, refs=("CR-Pnd0001",), suffix="Uph0001"):
        data = record_data("uphold", suffix, "2026-10-26", tors=tors, refs=list(refs), title="Run stays as written",
                           reason="The bakery confirmed the requirement.", keywords=["run", "upheld"],
                           changes=[{"tor": t, "feature_file": "01-core.feature.md",
                                     "fingerprint": {A1: S1.fp(), A2: S2.fp()}[t]} for t in tors])
        return self.repo.write(f"docs/requirements/changes/2026-10-26-{suffix}.toml", to_toml(data))

    def test_closes_the_dispute(self):
        self.assertEqual(self.repo.states()[A1]["state"], "Disputed")
        self.uphold([A1])
        self.assertEqual(self.repo.states()[A1]["state"], "Verified")
        self.assertNotIn("disputed", {f.get("kind") for f in self.repo.check()})
        self.assertEqual(self.repo.cli("validate").returncode, 0)

    def test_validate_requires_a_pending_record_on_the_same_requirement(self):
        path = self.uphold([A2])
        result = self.repo.cli("validate", str(path))
        self.assertEqual(result.returncode, 1)
        self.assertIn("no pending record in `refs` names it", result.stdout)
        self.uphold([A1], refs=("CR-Nope001",), suffix="Uph0002")
        self.assertIn("no pending record", self.repo.cli("validate", "docs/requirements/changes/2026-10-26-Uph0002.toml").stdout)

    def test_search_finds_the_decision(self):
        self.uphold([A1])
        code, rows = self.repo.json_cli("search", "upheld")
        self.assertEqual((code, [r["kind"] for r in rows]), (1, ["uphold"]))
        _, rows = self.repo.json_cli("search", "fixture")
        self.assertEqual({r["record"]: r["closed_by"] for r in rows}, {"CR-Pnd0001": "CR-Uph0001"})
        self.assertIn("pending (closed by CR-Uph0001)", self.repo.cli("search", "fixture").stdout)


if __name__ == "__main__":
    unittest.main()


class PrototypeCorrectionTests(unittest.TestCase):
    """A correction an autopilot prototype run took on a session's proposal: recorded as such, listed
    as not approved until the owner keeps it (an `uphold` naming the record) or changes it."""
    OLD = "TOR-01-Oldone1"

    def setUp(self):
        self.repo = repo = FixtureRepo()
        self.addCleanup(repo.cleanup)
        repo.feature("01", "core", [S1, S2])
        repo.sidecar("E1aaaaa", "Complete", [A1, A2], verified={A1: S1.fp(), A2: S2.fp()})
        repo.record("supersede", "Proto01", "2026-11-23", tors=[self.OLD], approved_via="prototype-run",
                    approved_by="autopilot (prototype run)",
                    changes=[{"tor": self.OLD, "feature_file": "01-core.feature.md", "fingerprint": "a" * 12,
                              "successors": [A1], "text": f"Scenario: [{self.OLD}] The tool shall walk"}])
        repo.commit("a prototype run corrected a requirement")

    def keep(self, tors, refs=("CR-Proto01",)):
        data = record_data("uphold", "Keep001", "2026-11-24", tors=tors, refs=list(refs), title="The correction stays",
                           reason="The owner read the corrected requirement and kept it.", keywords=["run"],
                           approved_via="docs-branch", approved_by="Pat Owner",
                           changes=[{"tor": t, "feature_file": "01-core.feature.md",
                                     "fingerprint": {A1: S1.fp(), A2: S2.fp()}[t]} for t in tors])
        return self.repo.write("docs/requirements/changes/2026-11-24-Keep001.toml", to_toml(data))

    def test_the_record_is_valid_and_the_requirement_is_listed_as_not_approved(self):
        self.assertEqual(self.repo.cli("validate").returncode, 0)
        row = self.repo.states()[A1]
        self.assertEqual(row["state"], "Verified")  # verified as it now reads; whether it should read so is the owner's
        self.assertEqual(row["unapproved_change"], {"record": "CR-Proto01", "date": "2026-11-23", "replaces": [self.OLD]})
        self.assertNotIn("unapproved_change", self.repo.states()[A2])

    def test_keeping_it_is_an_uphold_that_names_the_record(self):
        path = self.keep([A1])
        result = self.repo.cli("validate", str(path))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("unapproved_change", self.repo.states()[A1])

    def test_an_uphold_for_another_requirement_does_not_approve_it(self):
        path = self.keep([A2])
        self.assertNotEqual(self.repo.cli("validate", str(path)).returncode, 0)
        self.assertIn("unapproved_change", self.repo.states()[A1])

    def test_a_person_approved_correction_is_never_listed(self):
        self.repo.record("supersede", "Owner01", "2026-11-23", tors=["TOR-01-Oldtwo2"],
                         changes=[{"tor": "TOR-01-Oldtwo2", "feature_file": "01-core.feature.md", "fingerprint": "b" * 12,
                                   "successors": [A2], "text": "Scenario: [TOR-01-Oldtwo2] old"}])
        self.assertNotIn("unapproved_change", self.repo.states()[A2])

    def test_keep_writes_the_uphold_for_the_owner(self):
        # Named by the requirement as it now reads, or by the one it replaced (what a run's question named).
        for name in (A1, self.OLD):
            repo = self.repo
            result = repo.cli("keep", name, "--by", "Pat Owner", "--via", "epic-branch", "--today", "2026-11-24")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            path = result.stdout.strip().splitlines()[-1]
            self.assertRegex(path, r"^docs/requirements/changes/2026-11-24-[A-Za-z0-9]{7}\.toml$")
            self.assertEqual(repo.cli("validate").returncode, 0)
            self.assertNotIn("unapproved_change", repo.states()[A1])
            text = (repo.root / path).read_text(encoding="utf-8")
            for part in ('kind = "uphold"', 'approved_by = "Pat Owner"', 'approved_via = "epic-branch"', "CR-Proto01", A1):
                self.assertIn(part, text)
            # Nothing left to keep: said plainly, nothing written.
            again = repo.cli("keep", name, "--by", "Pat Owner")
            self.assertEqual(again.returncode, 1)
            self.assertIn("no correction", again.stderr + again.stdout)
            (repo.root / path).unlink()

    def test_keep_needs_a_name(self):
        self.assertEqual(self.repo.cli("keep", A1, "--by", " ").returncode, 2)
