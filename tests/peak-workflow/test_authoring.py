"""Plan 4 authoring commands: `validate`, `search`, `text`."""
import unittest

from fixtures import FixtureRepo, parse_tsv, record_data, scenario, to_toml, tor_lifecycle as tl

OLD, LIVE = "TOR-01-Old0001", "TOR-01-Live001"


class ValidateTests(unittest.TestCase):
    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)

    def test_valid_record_is_ok(self):
        self.repo.record("pending", "Abc1234")
        result = self.repo.cli("validate", "docs/requirements/changes/2026-10-21-Abc1234.toml")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(parse_tsv(result.stdout),
                         [("docs/requirements/changes/2026-10-21-Abc1234.toml", "ok")])

    def test_schema_problems_are_findings(self):
        self.repo.write("docs/requirements/changes/2026-10-21-Bad0001.toml",
                        to_toml(record_data("retire", "Bad0001", removal=None)))
        result = self.repo.cli("validate")
        self.assertEqual(result.returncode, 1)
        self.assertIn("removal", result.stdout)

    def test_bad_toml_and_missing_file(self):
        self.repo.write("docs/requirements/changes/2026-10-21-Bad0002.toml", "id = \n")
        result = self.repo.cli("validate", "docs/requirements/changes/2026-10-21-Bad0002.toml",
                               "docs/requirements/changes/2026-10-21-None000.toml")
        self.assertEqual(result.returncode, 1)
        self.assertIn("not valid TOML", result.stdout)
        self.assertIn("no such file", result.stdout)

    def test_record_id_clash_with_another_file(self):
        self.repo.record("pending", "Abc1234")
        self.repo.write("docs/requirements/changes/2026-10-22-Abc1234.toml",
                        to_toml(record_data("pending", "Abc1234", "2026-10-22")))
        result = self.repo.cli("validate", "docs/requirements/changes/2026-10-22-Abc1234.toml")
        self.assertEqual(result.returncode, 1)
        self.assertIn("also used by 2026-10-21-Abc1234.toml", result.stdout)

    def test_record_outside_changes_folder(self):
        self.repo.write("docs/2026-10-21-Abc1234.toml", to_toml(record_data("pending", "Abc1234")))
        result = self.repo.cli("validate", "docs/2026-10-21-Abc1234.toml")
        self.assertEqual(result.returncode, 1)
        self.assertIn("records live in docs/requirements/changes/", result.stdout)

    def test_no_records_is_ok(self):
        self.assertEqual(self.repo.cli("validate").returncode, 0)


class SearchTests(unittest.TestCase):
    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)
        self.repo.record("retire", "Csv0001", "2026-10-20", tors=[OLD], title="Remove the legacy CSV export",
                         reason="The export API replaced it.", keywords=["CSV", "legacy export"])
        self.repo.record("reword", "Rew0001", tors=[LIVE], title="CSV wording")  # rewords never match
        self.repo.record("pending", "Pen0001", tors=[LIVE], title="Dark mode toggle is wrong",
                         reason="Descoped at wrapup.", keywords=["theme"])

    def search(self, *terms):
        return self.repo.cli("search", *terms)

    def test_keyword_title_and_reason_match_case_insensitively(self):
        for term in ("csv", "Legacy-Export", "export api", "THEME", "descoped"):
            with self.subTest(term=term):
                self.assertEqual(self.search(term).returncode, 1)

    def test_whole_words_only(self):
        self.assertEqual(self.search("CS").returncode, 0)
        self.assertEqual(self.search("dark-mode").returncode, 1)

    def test_output_names_record_kind_tors_and_terms(self):
        rows = parse_tsv(self.search("csv", "unrelated").stdout)
        self.assertEqual(rows, [("CR-Csv0001", "2026-10-20", "retire", OLD, "Remove the legacy CSV export",
                                 "matched: csv")])

    def test_json_carries_reason(self):
        code, rows = self.repo.json_cli("search", "theme")
        self.assertEqual(code, 1)
        self.assertEqual(rows[0]["record"], "CR-Pen0001")
        self.assertEqual(rows[0]["reason"], "Descoped at wrapup.")

    def test_no_hit(self):
        result = self.search("barcode")
        self.assertEqual((result.returncode, result.stdout), (0, ""))


class TextTests(unittest.TestCase):
    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)
        self.v1 = scenario(LIVE, "The tool shall print 10 rows per page", "Given 30 rows",
                           "When the user lists rows", "Then 10 rows are shown",
                           verification="operator-observed")
        self.other = scenario("TOR-01-Next001", "The tool shall exit 0")
        self.repo.feature("01", "cli", [self.v1, self.other], banner="Paging")
        self.repo.sidecar("ep00001", status="Complete", requirements=[LIVE], verified={LIVE: self.v1.fp()})
        self.v1_sha = self.repo.commit("verified", "2026-09-01")
        self.v2 = scenario(LIVE, "The tool shall print 25 rows per page", "Given 30 rows",
                           "When the user lists rows", "Then 25 rows are shown")
        self.repo.feature("01", "cli", [self.v2, self.other], banner="Paging")
        self.repo.commit("edit in place", "2026-10-01")

    def test_current_block_verbatim(self):
        result = self.repo.cli("text", LIVE)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.rstrip("\n"), self.v2.render())

    def test_block_stops_before_trailing_banner_and_fence(self):
        text = "Feature: x\n\n" + self.v1.render() + "\n\n# ----\n# Next\n# ----\n```\nprose\n"
        self.assertEqual(tl.scenario_block(text, LIVE), self.v1.render())

    def test_rev_reads_history_and_json_has_fingerprint(self):
        code, row = self.repo.json_cli("text", LIVE, "--rev", self.v1_sha)
        self.assertEqual(code, 0)
        self.assertEqual(row["text"], self.v1.render())
        self.assertEqual(row["fingerprint"], self.v1.fp())
        self.assertEqual(row["feature_file"], "01-cli.feature.md")

    def test_verified_recovers_the_version_the_epic_verified(self):
        code, row = self.repo.json_cli("text", LIVE, "--verified")
        self.assertEqual(code, 0)
        self.assertEqual(row["text"], self.v1.render())
        self.assertEqual(row["commit"], self.v1_sha)
        self.assertEqual((row["epic"], row["fingerprint"]), ("ep00001", self.v1.fp()))

    def test_verified_without_a_verified_line(self):
        result = self.repo.cli("text", "TOR-01-Next001", "--verified")
        self.assertEqual(result.returncode, 1)
        self.assertIn("no Complete epic", result.stderr)

    def test_unknown_and_malformed_ids(self):
        self.assertEqual(self.repo.cli("text", "TOR-01-Nope000").returncode, 1)
        self.assertEqual(self.repo.cli("text", "TOR-1").returncode, 2)


if __name__ == "__main__":
    unittest.main()
