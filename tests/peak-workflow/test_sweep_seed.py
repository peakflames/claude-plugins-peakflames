import unittest

from fixtures import FixtureRepo, parse_tsv, scenario, tor_lifecycle as tl

A1, A2, A3, NEW = "TOR-01-Alpha01", "TOR-01-Bravo01", "TOR-01-Charl01", "TOR-01-Newid01"


class SweepTests(unittest.TestCase):
    def setUp(self):
        self.repo = repo = FixtureRepo()
        self.addCleanup(repo.cleanup)
        old2 = scenario(A2, "The tool shall print help")
        repo.feature("01", "core", [scenario(A1, "The tool shall run"), scenario(NEW, "The tool shall print color help")])
        repo.record("supersede", "Sp00001", changes=[{"tor": A2, "feature_file": "01-core.feature.md",
                                                       "fingerprint": old2.fp(), "successors": [NEW], "text": "x"}])
        repo.record("retire", "Rt00001", tors=[A3], removal="code")
        repo.write("tests/test_help.py", f"# {A2}\n# {A1}\n# {A3} and {A2}\n")
        repo.write("src/export.py", f"# {A3}\n")
        repo.write("docs/implementation-plan/phase-1/epic-x.md", f"{A2}\n")
        repo.write("docs/implementation-plan/session-handoffs/epic-x-complete.md", f"{A2}\n")
        repo.commit("fixture")

    def test_lists_test_and_source_citations_only(self):
        result = self.repo.cli("sweep")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(parse_tsv(result.stdout), [
            (A2, "tests/test_help.py:1", f"superseded by {NEW} (CR-Sp00001)"),
            (A2, "tests/test_help.py:3", f"superseded by {NEW} (CR-Sp00001)"),
            (A3, "src/export.py:1", "retired (CR-Rt00001)"),
            (A3, "tests/test_help.py:3", "retired (CR-Rt00001)"),
        ])

    def test_filter_by_ids_and_json(self):
        code, rows = self.repo.json_cli("sweep", A3)
        self.assertEqual(code, 1)
        self.assertEqual({(r["path"], r["kind"], r["record"]) for r in rows},
                         {("src/export.py", "retire", "CR-Rt00001"), ("tests/test_help.py", "retire", "CR-Rt00001")})

    def test_zero_hits_exit_0(self):
        self.repo.write("tests/test_help.py", "# clean\n")
        self.repo.remove("src/export.py")
        result = self.repo.cli("sweep")
        self.assertEqual((result.returncode, result.stdout), (0, ""))


class SeedTests(unittest.TestCase):
    def setUp(self):
        self.repo = repo = FixtureRepo()
        self.addCleanup(repo.cleanup)
        self.v1 = [scenario(A1, "The tool shall run"), scenario(A2, "The tool shall print help"),
                   scenario(A3, "The tool shall print its version")]
        repo.feature("01", "core", self.v1)
        repo.sidecar("Epic001", "Not Started", [A1, A2, A3])
        repo.sidecar("Epic002", "Not Started", [A3])
        repo.commit("plan")
        repo.sidecar("Epic001", "In Progress", [A1, A2, A3])
        repo.commit("start")
        repo.sidecar("Epic001", "Complete", [A1, A2, A3], waived=f"{A3} → Epic002")
        self.done = repo.commit("wrapup")
        self.v2 = [self.v1[0], scenario(A2, "The tool shall print brief help"), self.v1[2]]
        repo.feature("01", "core", self.v2)
        repo.commit("edit after verification")

    def test_completion_commit(self):
        self.assertEqual(tl.completion_commit(self.repo.root, "Epic001"), self.done)
        self.assertIsNone(tl.completion_commit(self.repo.root, "Epic002"))

    def test_seed_fingerprints_at_completion(self):
        code, rows = self.repo.json_cli("seed")
        self.assertEqual(code, 0)
        self.assertEqual([(r["epic"], r["tor"], r["fingerprint"], r["commit"]) for r in rows], [
            ("Epic001", A1, self.v1[0].fp(), self.done), ("Epic001", A2, self.v1[1].fp(), self.done)])

    def test_write_then_check_surfaces_changed_since_verified(self):
        self.repo.cli("seed", "--write")
        sc = tl.load_sidecars(self.repo.root)["Epic001"]
        self.assertEqual(sc.verified, {A1: self.v1[0].fp(), A2: self.v1[1].fp()})
        self.assertEqual(sc.status, "Complete")
        self.assertEqual(self.repo.states()[A2]["state"], "Changed since verified")
        self.assertEqual([f["tor"] for f in self.repo.check() if f["letter"] == "D"], [A2])
        again = self.repo.cli("seed")
        self.assertEqual(again.stdout, "")  # idempotent: nothing left to seed

    def test_requirement_missing_at_completion_stays_legacy(self):
        self.repo.feature("01", "core", self.v2 + [scenario(NEW, "The tool shall export")])
        self.repo.sidecar("Epic001", "Complete", [A1, A2, A3, NEW], waived=f"{A3} → Epic002")
        rows = {r["tor"]: r for r in self.repo.json_cli("seed")[1]}
        self.assertIsNone(rows[NEW]["fingerprint"])
        self.assertEqual(rows[NEW]["reason"], "not in the feature files at completion")

    def test_uncommitted_completion_is_legacy(self):
        self.repo.sidecar("Epic002", "Complete", [A3])
        rows = [r for r in self.repo.json_cli("seed")[1] if r["epic"] == "Epic002"]
        self.assertEqual(rows[0]["reason"], "no completion commit")

    def test_write_verified_extends_existing_block(self):
        text = "status: Complete\nverified:\n  TOR-01-Alpha01: aaaaaaaaaaaa\nreverified: 2026-10-01\n"
        out = tl.write_verified(text, {A2: "b" * 12})
        self.assertEqual(out, "status: Complete\nverified:\n  TOR-01-Alpha01: aaaaaaaaaaaa\n"
                              f"  {A2}: bbbbbbbbbbbb\nreverified: 2026-10-01\n")
        self.assertEqual(tl.write_verified("status: Complete\n", {A2: "b" * 12}),
                         f"status: Complete\nverified:\n  {A2}: bbbbbbbbbbbb\n")


if __name__ == "__main__":
    unittest.main()
