import unittest

from fixtures import FixtureRepo, tor_lifecycle as tl


class StampTests(unittest.TestCase):
    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)

    def test_missing_stamp_is_format_zero(self):
        stamp = tl.load_stamp(self.repo.root)
        self.assertEqual((stamp.format, stamp.disputed_threshold_days, stamp.present), (0, 30, False))

    def test_format_without_lifecycle_defaults_threshold(self):
        self.repo.stamp(2)
        stamp = tl.load_stamp(self.repo.root)
        self.assertEqual((stamp.format, stamp.disputed_threshold_days, stamp.present), (2, 30, True))

    def test_lifecycle_threshold(self):
        self.repo.stamp(2, disputed_threshold_days=14)
        self.assertEqual(tl.load_stamp(self.repo.root).disputed_threshold_days, 14)

    def test_invalid_stamps(self):
        for text in ("format = -1\n", 'format = "2"\n', "format = true\n", "nothing = 1\n",
                     "format = 2\n[lifecycle]\ndisputed_threshold_days = -3\n",
                     "format = 2\nlifecycle = 5\n", "format = ["):
            with self.subTest(text=text):
                self.repo.write("docs/.peak-workflow.toml", text)
                with self.assertRaises(tl.DataError):
                    tl.load_stamp(self.repo.root)

    def test_plugin_format(self):
        self.assertEqual(tl.PLUGIN_FORMAT, 2)


FULL = """status: Complete
owner: Fixture Author
implemented: 2026-10-20
completed: 2026-10-24
handoff: session-handoffs/epic-cou6RVf-complete.md
requirements: TOR-14-Qm4rT8v, TOR-20-6noQsOJ, TOR-20-nJbzjmw
waived: TOR-20-nJbzjmw → H58WL5u
retires: CR-p2Lk9Vb
reverified: 2026-10-25
verified:
  TOR-14-Qm4rT8v: 7c1d9e04ab32
  TOR-20-6noQsOJ: 0be4f5a21c77
unverified:
  TOR-20-6noQsOJ: 2026-10-25 Then clause no longer holds
"""


class SidecarTests(unittest.TestCase):
    def test_full_sidecar(self):
        sc = tl.parse_sidecar("cou6RVf", FULL)
        self.assertEqual(sc.status, "Complete")
        self.assertEqual(sc.owner, "Fixture Author")
        self.assertEqual(sc.requirements, ["TOR-14-Qm4rT8v", "TOR-20-6noQsOJ", "TOR-20-nJbzjmw"])
        self.assertEqual(sc.verified, {"TOR-14-Qm4rT8v": "7c1d9e04ab32", "TOR-20-6noQsOJ": "0be4f5a21c77"})
        self.assertEqual(sc.unverified, {"TOR-20-6noQsOJ": "2026-10-25 Then clause no longer holds"})
        self.assertEqual(sc.waived, {"TOR-20-nJbzjmw": "H58WL5u"})
        self.assertEqual(sc.retires, ["CR-p2Lk9Vb"])
        self.assertEqual(sc.reverified, "2026-10-25")
        self.assertEqual(sc.extra, {})

    def test_minimal_not_started(self):
        sc = tl.parse_sidecar("x", "status: Not Started\nowner: —\nrequirements: —\n")
        self.assertEqual((sc.status, sc.requirements, sc.verified, sc.waived), ("Not Started", [], {}, {}))
        self.assertEqual(sc.completed, "—")

    def test_ascii_arrow_and_multiple_waivers(self):
        sc = tl.parse_sidecar("x", "waived: TOR-01-Abc1234 -> e1, TOR-01-Def5678 → e2\n")
        self.assertEqual(sc.waived, {"TOR-01-Abc1234": "e1", "TOR-01-Def5678": "e2"})

    def test_unknown_keys_kept_verbatim(self):
        sc = tl.parse_sidecar("x", "status: Complete\nmigration_source: epic-workflow\n")
        self.assertEqual(sc.extra, {"migration_source": "epic-workflow"})

    def test_malformed_lines_all_reported(self):
        bad = ("status: Complete\nrequirements: TOR-24 set\nverified:\n  TOR-01-Abc1234: nothex\n"
               "  stray indented\nwaived: TOR-01-Abc1234\nretires: p2Lk9Vb\njust words\n")
        with self.assertRaises(tl.DataError) as ctx:
            tl.parse_sidecar("x", bad, "status/epic-x.md")
        self.assertEqual(len(ctx.exception.problems), 6, ctx.exception.problems)
        self.assertTrue(all(p.startswith("status/epic-x.md: line") for p in ctx.exception.problems))

    def test_block_key_with_inline_value_rejected(self):
        with self.assertRaises(tl.DataError):
            tl.parse_sidecar("x", "verified: TOR-01-Abc1234 7c1d9e04ab32\n")

    def test_load_sidecars_from_repo(self):
        with FixtureRepo() as repo:
            self.assertEqual(tl.load_sidecars(repo.root), {})
            repo.sidecar("aB3dE5f", "Complete", ["TOR-01-Abc1234"], {"TOR-01-Abc1234": "a" * 12})
            repo.sidecar("Zz9Yy8x")
            sidecars = tl.load_sidecars(repo.root)
            self.assertEqual(sorted(sidecars), ["Zz9Yy8x", "aB3dE5f"])
            self.assertEqual(sidecars["aB3dE5f"].verified, {"TOR-01-Abc1234": "a" * 12})


if __name__ == "__main__":
    unittest.main()


class SectionTests(unittest.TestCase):
    """A Scenario's section is the banner in force at its Scenario line (Plan 9 dry-run finding)."""

    TEXT = "\n".join([
        "Feature: Sync", "",
        "# " + "-" * 40, "# Sync", "# " + "-" * 40, "",
        "Scenario: [TOR-02-Syn0001] The app shall sync", "    Given a", "    Then b", "",
        "# " + "-" * 40, "# Safety", "# " + "-" * 40, "",
        "Scenario: [TOR-02-Saf0001] The app shall stop", "    Given c", "    Then d", "",
    ])

    def test_last_scenario_before_a_banner_keeps_its_own_section(self):
        sections = {p.tor: p.section for p in tl.parse_requirements(self.TEXT)}
        self.assertEqual(sections, {"TOR-02-Syn0001": "Sync", "TOR-02-Saf0001": "Safety"})
