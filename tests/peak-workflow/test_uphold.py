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
