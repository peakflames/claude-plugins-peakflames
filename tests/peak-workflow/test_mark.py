"""`mark`: the one writer of verified:, unverified:, reverified:, and requirements: appends."""
import unittest

from fixtures import FixtureRepo, parse_tsv, scenario, tor_lifecycle as tl

A1, A2, A3, NEW, GONE = "TOR-01-Alpha01", "TOR-01-Bravo01", "TOR-01-Charl01", "TOR-01-Newid01", "TOR-01-Gone001"
S1, S2, S3, SN = (scenario(A1, "The tool shall run"), scenario(A2, "The tool shall print help"),
                  scenario(A3, "The tool shall exit 0"), scenario(NEW, "The tool shall print color help"))
SIDECAR = "docs/implementation-plan/status/epic-cMpl001.md"


class MarkTests(unittest.TestCase):
    def setUp(self):
        self.repo = repo = FixtureRepo()
        self.addCleanup(repo.cleanup)
        repo.feature("01", "core", [S1, S2, S3, SN])
        repo.sidecar("cMpl001", status="Complete", requirements=[A1, A2, A3], owner="Fixture Author",
                     waived=f"{A3} → oThr002", verified={A1: "0" * 12}, unverified={A2: "2026-09-01 wrong exit code"})
        repo.commit("fixture")

    def read(self):
        return (self.repo.root / SIDECAR).read_text(encoding="utf-8")

    def mark(self, *args):
        return self.repo.cli("mark", "cMpl001", "--today", "2026-10-26", *args)

    def test_pass_writes_current_fingerprint_and_clears_unverified(self):
        result = self.mark("--pass", A1, "--pass", A2, "--reverified")
        self.assertEqual(result.returncode, 0, result.stderr)
        sc = tl.parse_sidecar("cMpl001", self.read())
        self.assertEqual(sc.verified, {A1: S1.fp(), A2: S2.fp()})
        self.assertEqual(sc.unverified, {})
        self.assertEqual(sc.reverified, "2026-10-26")
        self.assertEqual((sc.status, sc.requirements, sc.waived), ("Complete", [A1, A2, A3], {A3: "oThr002"}))
        self.assertNotIn("unverified:", self.read())
        self.assertEqual(parse_tsv(result.stdout)[-1], ("cMpl001", "reverified", "2026-10-26"))

    def test_fail_moves_a_line_to_unverified(self):
        self.assertEqual(self.mark("--fail", A1, "  shows 10 rows, not 25 ").returncode, 0)
        sc = tl.parse_sidecar("cMpl001", self.read())
        self.assertEqual(sc.verified, {})
        self.assertEqual(sc.unverified, {A2: "2026-09-01 wrong exit code", A1: "2026-10-26 shows 10 rows, not 25"})
        self.assertEqual(sc.reverified, "—")

    def test_append_successor_then_pass_it(self):
        self.assertEqual(self.mark("--append", NEW, "--pass", NEW).returncode, 0)
        sc = tl.parse_sidecar("cMpl001", self.read())
        self.assertEqual(sc.requirements, [A1, A2, A3, NEW])
        self.assertEqual(sc.verified, {A1: "0" * 12, NEW: SN.fp()})
        self.assertEqual(self.mark("--append", NEW).returncode, 0)  # idempotent
        self.assertEqual(tl.parse_sidecar("cMpl001", self.read()).requirements, [A1, A2, A3, NEW])

    def test_flags_take_several_ids(self):
        self.assertEqual(self.mark("--append", NEW, "--pass", A1, A2, NEW).returncode, 0)
        sc = tl.parse_sidecar("cMpl001", self.read())
        self.assertEqual(set(sc.verified), {A1, A2, NEW})

    def test_pass_replaces_an_existing_line_in_place(self):
        self.mark("--pass", A1)
        self.mark("--pass", A1)
        self.assertEqual(self.read().count(A1 + ":"), 1)

    def test_creates_blocks_and_reverified_line_on_a_bare_sidecar(self):
        self.repo.sidecar("cMpl001", status="Implemented", requirements=[A1, A2])
        self.assertEqual(self.mark("--pass", A1, "--pass", A2).returncode, 0)
        sc = tl.parse_sidecar("cMpl001", self.read())
        self.assertEqual(list(sc.verified), [A1, A2])
        self.assertEqual(sc.status, "Implemented")

    def test_refusals_leave_the_file_alone(self):
        before = self.read()
        for args in (("--pass", NEW), ("--pass", A3), ("--append", GONE), ("--pass", "TOR-24"),
                     ("--pass", A1, "--fail", A1, "x"), ("--fail", A1, " "), ()):
            result = self.mark(*args)
            self.assertEqual(result.returncode, 2, args)
            self.assertTrue(result.stderr.startswith("error:"), args)
        self.assertEqual(self.read(), before)
        self.assertEqual(self.repo.cli("mark", "nOpe001", "--pass", A1).returncode, 2)


if __name__ == "__main__":
    unittest.main()
