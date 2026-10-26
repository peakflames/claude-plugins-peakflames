import datetime as dt
import unittest

from fixtures import FixtureRepo, record_data, to_toml, tor_lifecycle as tl


class RecordSchemaTests(unittest.TestCase):
    def problems(self, kind, /, filename=None, **overrides):
        data = record_data(kind, "Abc1234", **overrides)
        return tl.validate_record(filename or "2026-10-21-Abc1234.toml", data)

    def assertProblem(self, problems, fragment):
        self.assertTrue(any(fragment in p for p in problems), f"{fragment!r} not in {problems}")

    def test_every_kind_valid(self):
        for kind in tl.KINDS:
            with self.subTest(kind=kind):
                self.assertEqual(self.problems(kind), [])

    def test_common_fields_required(self):
        for key in ("title", "reason", "approved_by"):
            with self.subTest(key=key):
                self.assertProblem(self.problems("pending", **{key: None}), f"`{key}`")
        self.assertProblem(self.problems("pending", refs=None), "`refs`")
        self.assertEqual(self.problems("pending", refs=[]), [])

    def test_bad_enums(self):
        self.assertProblem(self.problems("pending", kind="amend"), "`kind`")
        self.assertProblem(self.problems("pending", approved_via="email"), "`approved_via`")

    def test_filename_id_and_date_must_agree(self):
        self.assertProblem(self.problems("pending", filename="notes.toml"), "file name")
        self.assertProblem(self.problems("pending", id="CR-Zzz9999"), "does not match the file name suffix")
        self.assertProblem(self.problems("pending", date=dt.date(2026, 1, 1)), "does not match the file name date")
        self.assertProblem(self.problems("pending", date="2026-10-21"), "bare TOML date")
        self.assertProblem(self.problems("pending", id="CR-short"), "CR-<7")

    def test_reword_requires_evidence_and_equivalence(self):
        self.assertProblem(self.problems("reword", evidence=None), "[evidence]")
        self.assertProblem(self.problems("reword", equivalence=None), "`equivalence`")
        self.assertProblem(self.problems("reword", evidence={"commit": "1a2b3c4", "result": "maybe",
                                                              "tests": ["t"]}), "`result`")
        self.assertProblem(self.problems("reword", evidence={"commit": "1a2b3c4", "result": "pass"}), "`tests`")
        historical = {"commit": "1a2b3c4", "result": "historical"}
        self.assertEqual(self.problems("reword", evidence=historical), [])
        self.assertProblem(self.problems("reword", changes=[{"tor": "TOR-01-Abc1234", "from": "XYZ",
                                                            "to": "1" * 12}]), "`from`")

    def test_pending_requires_owner(self):
        self.assertProblem(self.problems("pending", owner=None), "`owner`")
        self.assertProblem(self.problems("pending", tracker=12), "`tracker`")
        self.assertEqual(self.problems("pending", tracker="PROJ-12"), [])

    def test_retire_requires_removal(self):
        self.assertProblem(self.problems("retire", removal=None), "removal")
        self.assertProblem(self.problems("retire", removal="later"), "removal")
        self.assertEqual(self.problems("retire", removal="code"), [])

    def test_keywords_required_except_reword(self):
        for kind in ("supersede", "retire", "pending"):
            with self.subTest(kind=kind):
                self.assertProblem(self.problems(kind, keywords=None), "`keywords`")
                self.assertProblem(self.problems(kind, keywords=[]), "`keywords`")

    def test_supersede_change_fields(self):
        change = {"tor": "TOR-01-Abc1234", "feature_file": "01-cli.feature.md",
                  "fingerprint": "a" * 12, "text": "Scenario: old"}
        self.assertProblem(self.problems("supersede", changes=[change]), "`successors`")
        bad = {**change, "successors": ["TOR-1-x"]}
        self.assertProblem(self.problems("supersede", changes=[bad]), "malformed IDs")
        nofp = {**change, "successors": ["TOR-01-Succ001"], "fingerprint": "A" * 12}
        self.assertProblem(self.problems("supersede", changes=[nofp]), "`fingerprint`")

    def test_changes_required_and_unique(self):
        self.assertProblem(self.problems("pending", changes=None), "[[changes]]")
        self.assertProblem(self.problems("pending", changes=[]), "[[changes]]")
        self.assertProblem(self.problems("pending", tors=["TOR-01-Abc1234", "TOR-01-Abc1234"]), "twice")
        self.assertProblem(self.problems("pending", tors=["TOR-24 set"]), "`tor`")


class LoadRecordsTests(unittest.TestCase):
    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)

    def test_no_changes_folder(self):
        self.assertEqual(tl.load_records(self.repo.root), [])

    def test_loads_sorted_by_date_then_id(self):
        self.repo.record("retire", "Zzzzzz1", "2026-10-20")
        self.repo.record("reword", "Aaaaaa1", "2026-10-20")
        self.repo.record("supersede", "Mmmmmm1", "2026-07-28")
        records = tl.load_records(self.repo.root)
        self.assertEqual([r.id for r in records], ["CR-Mmmmmm1", "CR-Aaaaaa1", "CR-Zzzzzz1"])
        self.assertEqual(records[0].tors, ["TOR-01-Abc1234"])
        self.assertEqual(records[0].date, dt.date(2026, 7, 28))

    def test_toml_written_by_fixture_round_trips(self):
        data = record_data("supersede", "Mmmmmm1", reason="Line one.\nLine \"two\".")
        import tomllib
        self.assertEqual(tomllib.loads(to_toml(data)), data)

    def test_all_problems_reported_together(self):
        self.repo.record("pending", "Ok00001")
        self.repo.write("docs/requirements/changes/2026-10-21-Syntax1.toml", "id = [")
        self.repo.record("pending", "NoOwner", owner=None)
        self.repo.record("retire", "NoRemov", removal=None)
        with self.assertRaises(tl.DataError) as ctx:
            tl.load_records(self.repo.root)
        text = str(ctx.exception)
        self.assertEqual(len(ctx.exception.problems), 3, text)
        for name in ("Syntax1", "NoOwner", "NoRemov"):
            self.assertIn(name, text)

    def test_duplicate_record_id_across_files(self):
        self.repo.record("pending", "Dup0001", "2026-10-21")
        self.repo.write("docs/requirements/changes/2026-10-22-Dup0001.toml",
                        to_toml(record_data("pending", "Dup0001", "2026-10-22")))
        with self.assertRaises(tl.DataError) as ctx:
            tl.load_records(self.repo.root)
        self.assertIn("also used by", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
