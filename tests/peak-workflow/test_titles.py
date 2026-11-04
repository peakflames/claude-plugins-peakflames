import unittest

from fixtures import FixtureRepo, parse_tsv, scenario

LIVE, NEW = "TOR-01-Live001", "TOR-01-Succ001"
OLD, GONE, NOWHERE = "TOR-01-Old0001", "TOR-02-Gone001", "TOR-03-Nowhere"


class TitlesTests(unittest.TestCase):
    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)
        self.repo.feature("01", "cli", [scenario(LIVE, "The tool shall print its version"),
                                        scenario(NEW, "The tool shall alert on a malformed list")])
        self.repo.record("supersede", "k3P9xQa", "2026-07-28", tors=[OLD])
        self.repo.record("pending", "Wq7nR2c", "2026-10-01", tors=[GONE])
        self.repo.record("retire", "p2Lk9Vb", "2026-10-20", tors=[GONE])

    def titles(self, *ids):
        return self.repo.cli("titles", *ids)

    def test_live_title(self):
        result = self.titles(LIVE)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(parse_tsv(result.stdout), [(LIVE, "The tool shall print its version")])

    def test_superseded_names_record_date_and_successor(self):
        [(tor, text)] = parse_tsv(self.titles(OLD).stdout)
        self.assertEqual(text, f"(superseded in CR-k3P9xQa (2026-07-28) by {NEW})")

    def test_retired_uses_latest_retiring_record_not_pending(self):
        [(tor, text)] = parse_tsv(self.titles(GONE).stdout)
        self.assertEqual(text, "(retired in CR-p2Lk9Vb (2026-10-20))")

    def test_comma_and_space_separated_ids_keep_order(self):
        result = self.titles(f"{OLD}, {LIVE}", GONE)
        self.assertEqual([r[0] for r in parse_tsv(result.stdout)], [OLD, LIVE, GONE])
        self.assertEqual(result.returncode, 0)

    def test_unknown_id_is_a_finding(self):
        result = self.titles(LIVE, NOWHERE)
        self.assertEqual(result.returncode, 1)
        self.assertIn("unknown", parse_tsv(result.stdout)[1][1])

    def test_malformed_id_is_usage_error(self):
        result = self.titles("TOR-24 set")
        self.assertEqual(result.returncode, 2)

    def test_live_ids_do_not_need_valid_records(self):
        self.repo.write("docs/requirements/changes/2026-10-22-Broken1.toml", "not = [valid")
        self.assertEqual(self.titles(LIVE).returncode, 0)
        self.assertEqual(self.titles(OLD).returncode, 2)


if __name__ == "__main__":
    unittest.main()
