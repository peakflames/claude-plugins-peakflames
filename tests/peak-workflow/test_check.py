"""Health check findings A–F (#20 "Health check"), branch scoping, and the decision-test table."""
import unittest

from fixtures import FixtureRepo, scenario

A1, A2, A3 = "TOR-01-Alpha01", "TOR-01-Bravo01", "TOR-01-Charl01"
NEW = "TOR-01-Newid01"
STEPS = ("Given a settings file exists", "When the user saves", "Then the change is stored")


def base_scenarios():
    return [scenario(A1, "The tool shall save settings", *STEPS),
            scenario(A2, "The tool shall print help"),
            scenario(A3, "The tool shall print its version")]


def letters(findings, letter=None, tor=None):
    return [f for f in findings if (letter is None or f["letter"] == letter)
            and (tor is None or f.get("tor") == tor)]


class CheckCase(unittest.TestCase):
    """A repo with one feature file merged on develop and a Complete epic that verified it."""

    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)
        self.scen = base_scenarios()
        self.repo.feature("01", "core", self.scen)
        self.repo.sidecar("Epic001", "Complete", [A1, A2], verified={s.tor: s.fp() for s in self.scen[:2]})
        self.repo.sidecar("Epic002", "Not Started", [A3])
        self.repo.commit("baseline")

    def rewrite(self, *scenarios):
        self.repo.feature("01", "core", list(scenarios))

    def edited(self, tor, title=None, *steps):
        return [scenario(s.tor, title or s.title, *(steps or s.steps)) if s.tor == tor else s
                for s in self.scen]


class CleanAndExitCodes(CheckCase):
    def test_clean_project(self):
        result = self.repo.cli("check", "--today", "2026-10-26")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("No findings", result.stdout)

    def test_findings_exit_1_with_text_headings(self):
        self.rewrite(*self.edited(A1, "The tool shall save settings twice"))
        self.repo.commit("edit")
        result = self.repo.cli("check", "--today", "2026-10-26")
        self.assertEqual(result.returncode, 1)
        self.assertIn("A. Unrecorded change (1)", result.stdout)
        self.assertIn("D. Changed since verified (1)", result.stdout)

    def test_invalid_record_is_data_error(self):
        self.repo.write("docs/requirements/changes/2026-10-21-Broken1.toml", "kind = 'x'\n")
        self.assertEqual(self.repo.cli("check").returncode, 2)


class FindingA(CheckCase):
    def test_direct_edit_on_develop(self):
        self.rewrite(*self.edited(A1, "The tool shall save settings to the store"))
        self.repo.commit("edit on develop")
        [a] = letters(self.repo.check(), "A")
        self.assertEqual(a["tor"], A1)
        self.assertFalse(a["own_branch"])
        self.assertIn("edited without a change record", a["message"])

    def test_uncommitted_edit_counts(self):
        self.rewrite(*self.edited(A3, "The tool shall print its build number"))
        self.assertEqual(len(letters(self.repo.check(), "A", A3)), 1)

    def test_case_punctuation_comment_edit_is_not_a_change(self):
        self.rewrite(*self.edited(A1, "THE TOOL SHALL SAVE SETTINGS.", "Given a settings-file exists,",
                                  "When the user saves", "Then the change is stored!"))
        self.repo.commit("cleanup")
        self.assertEqual(self.repo.check(), [])

    def test_reword_record_explains_change(self):
        new = self.edited(A1, "The tool shall save settings to the store")
        self.rewrite(*new)
        self.repo.record("reword", "Rw00001", changes=[{"tor": A1, "from": self.scen[0].fp(), "to": new[0].fp()}],
                         evidence={"commit": "abc1234", "result": "historical"})
        self.repo.commit("reword")
        found = self.repo.check()
        self.assertEqual(letters(found, "A"), [])
        self.assertEqual(len(letters(found, "D")), 1)  # historical evidence is not proof

    def test_reword_chain_with_gap_is_still_a_finding(self):
        mid = self.edited(A1, "The tool shall save settings v2")
        end = self.edited(A1, "The tool shall save settings v3")
        self.rewrite(*end)
        self.repo.record("reword", "Rw00002", changes=[{"tor": A1, "from": mid[0].fp(), "to": end[0].fp()}])
        self.repo.commit("reword missing a link")
        self.assertEqual(len(letters(self.repo.check(), "A", A1)), 1)

    def test_baseline_is_text_when_first_merged(self):
        self.repo.checkout("feature/epic-x", create=True)
        self.rewrite(*self.scen, scenario(NEW, "The tool shall export v1"))
        self.repo.commit("add on branch")
        self.rewrite(*self.scen, scenario(NEW, "The tool shall export v2"))
        self.repo.commit("free edit before merge")
        self.assertEqual(letters(self.repo.check("--base", "develop"), "A"), [])
        self.repo.checkout("develop")
        self.repo.merge("feature/epic-x")
        self.assertEqual(letters(self.repo.check(), "A"), [])
        self.rewrite(*self.scen, scenario(NEW, "The tool shall export v3"))
        self.repo.commit("edit after merge")
        self.assertEqual(len(letters(self.repo.check(), "A", NEW)), 1)

    def test_own_branch_marking_and_blocking(self):
        self.rewrite(*self.edited(A2, "The tool shall print long help"))
        self.repo.commit("legacy debt on develop")
        self.repo.checkout("hotfix/x", create=True)
        self.rewrite(*[scenario(s.tor, "The tool shall print its version and date") if s.tor == A3
                       else s for s in self.edited(A2, "The tool shall print long help")])
        self.repo.commit("unrecorded edit on branch")
        found = {f["tor"]: f for f in letters(self.repo.check("--base", "develop"), "A")}
        self.assertFalse(found[A2]["own_branch"])
        self.assertFalse(found[A2]["blocking"])
        self.assertTrue(found[A3]["own_branch"])
        self.assertTrue(found[A3]["blocking"])
        text = self.repo.cli("check", "--base", "develop").stdout
        self.assertIn("[this branch, blocking]", text)

    def test_branch_reword_record_clears_own_branch_finding(self):
        self.repo.checkout("hotfix/x", create=True)
        new = self.edited(A3, "The tool shall print the version")
        self.rewrite(*new)
        self.repo.record("reword", "Rw00003", approved_via="quick-fix",
                         changes=[{"tor": A3, "from": self.scen[2].fp(), "to": new[2].fp()}])
        self.assertEqual(letters(self.repo.check("--base", "develop"), "A"), [])


class FindingB(CheckCase):
    def test_unrecorded_removal(self):
        self.rewrite(*self.scen[:2])
        self.repo.commit("delete A3")
        [b] = letters(self.repo.check(), "B")
        self.assertEqual((b["tor"], b["own_branch"]), (A3, False))

    def test_retire_record_explains_removal(self):
        self.rewrite(*self.scen[:2])
        self.repo.record("retire", "Rt00001", tors=[A3])
        self.repo.sidecar("Epic002", "Not Started", [])
        self.repo.commit("retire A3")
        self.assertEqual(self.repo.check(), [])

    def test_own_branch_removal_blocks(self):
        self.repo.checkout("hotfix/x", create=True)
        self.rewrite(*self.scen[:2])
        [b] = letters(self.repo.check("--base", "develop"), "B")
        self.assertTrue(b["blocking"])

    def test_record_from_before_branch_does_not_cover_branch_removal(self):
        self.repo.record("retire", "Rt00002", tors=[A3])
        self.repo.commit("record without deletion")
        self.repo.checkout("hotfix/x", create=True)
        self.rewrite(*self.scen[:2])
        self.assertTrue(letters(self.repo.check("--base", "develop"), "B")[0]["own_branch"])


class FindingC(CheckCase):
    def test_test_cites_unknown_id(self):
        self.repo.write("tests/test_cli.py", f"# {A1}\n# TOR-09-Nowhere\n")
        self.repo.commit("tests")
        [c] = letters(self.repo.check(), "C")
        self.assertEqual((c["tor"], c["path"], c["line"]), ("TOR-09-Nowhere", "tests/test_cli.py", 2))

    def test_malformed_sidecar_entry(self):
        self.repo.sidecar("Epic003", "Not Started", ["TOR-24 set"])
        [c] = letters(self.repo.check(), "C")
        self.assertIn("'TOR-24 set', which is not a requirement ID", c["message"])

    def test_history_files_are_not_scanned(self):
        self.repo.write("docs/implementation-plan/session-handoffs/epic-x-complete.md", "TOR-09-Nowhere\n")
        self.repo.write("CHANGELOG.md", "TOR-09-Nowhere\n")
        self.assertEqual(self.repo.check(), [])

    def test_own_branch_citation(self):
        self.repo.write("tests/old_test.py", "# TOR-09-Oldtypo\n")
        self.repo.commit("legacy typo")
        self.repo.checkout("hotfix/x", create=True)
        self.repo.write("src/new.py", "# TOR-09-Newtypo\n")
        found = {f["tor"]: f for f in letters(self.repo.check("--base", "develop"), "C")}
        self.assertFalse(found["TOR-09-Oldtypo"]["own_branch"])
        self.assertTrue(found["TOR-09-Newtypo"]["blocking"])


class FindingD(CheckCase):
    def test_changed_after_verification(self):
        self.rewrite(*self.edited(A2, "The tool shall print brief help"))
        self.repo.commit("edit")
        [d] = letters(self.repo.check(), "D")
        self.assertEqual((d["tor"], d["epic"]), (A2, "Epic001"))
        self.assertIn("/peak-workflow:wrapup-epic Epic001 reverify", d["message"])
        self.assertFalse(d["blocking"])

    def test_proven_reword_clears_d(self):
        new = self.edited(A2, "The tool shall print brief help")
        self.rewrite(*new)
        self.repo.record("reword", "Rw00004", changes=[{"tor": A2, "from": self.scen[1].fp(), "to": new[1].fp()}])
        self.assertEqual(self.repo.check(), [])

    def test_own_branch_d_is_marked_but_not_blocking(self):
        self.repo.checkout("hotfix/x", create=True)
        self.rewrite(*self.edited(A2, "The tool shall print brief help"))
        [d] = letters(self.repo.check("--base", "develop"), "D")
        self.assertTrue(d["own_branch"])
        self.assertFalse(d["blocking"])


class FindingE(CheckCase):
    def setUp(self):
        super().setUp()
        self.rewrite(self.scen[0], scenario(NEW, "The tool shall print help in color"), self.scen[2])
        self.repo.record("supersede", "Sp00001", changes=[{
            "tor": A2, "feature_file": "01-core.feature.md", "fingerprint": self.scen[1].fp(),
            "successors": [NEW], "text": "Scenario: old"}])
        self.repo.write("tests/test_help.py", f"def test_help():  # {A2}\n    pass\n")
        self.repo.write("docs/implementation-plan/phase-1/epic-Epic001.md", f"| {A2} | 01-core |\n")
        self.repo.commit("supersede A2")

    def test_retired_id_cited_by_tests(self):
        found = self.repo.check()
        [e] = letters(found, "E")
        self.assertEqual((e["tor"], e["path"], e["line"]), (A2, "tests/test_help.py", 1))
        self.assertIn(f"replaced by {NEW}", e["message"])
        self.assertEqual(letters(found, "A") + letters(found, "B") + letters(found, "C"), [])

    def test_own_branch_e(self):
        self.repo.checkout("hotfix/x", create=True)
        self.repo.write("src/help.py", f"# {A2}\n")
        found = {f["path"]: f for f in letters(self.repo.check("--base", "develop"), "E")}
        self.assertFalse(found["tests/test_help.py"]["own_branch"])
        self.assertTrue(found["src/help.py"]["own_branch"])
        self.assertFalse(found["src/help.py"]["blocking"])


class FindingF(CheckCase):
    def kinds(self, found):
        return sorted(f["kind"] for f in letters(found, "F"))

    def test_disputed_age_and_overdue(self):
        self.repo.record("pending", "Pd00001", "2026-09-01", tors=[A1])
        [f] = letters(self.repo.check(), "F")
        self.assertEqual(f["kind"], "disputed")
        self.assertEqual((f["detail"]["age_days"], f["detail"]["overdue"]), (55, True))
        self.assertIn(f"/peak-workflow:capture-requirements {A1}", f["message"])

    def test_threshold_from_stamp(self):
        self.repo.stamp(2, disputed_threshold_days=90)
        self.repo.record("pending", "Pd00001", "2026-09-01", tors=[A1])
        self.assertFalse(letters(self.repo.check(), "F")[0]["detail"]["overdue"])

    def test_removal_epic_missing(self):
        self.rewrite(*self.scen[:2])
        self.repo.sidecar("Epic002", "Not Started", [])
        self.repo.record("retire", "Rt00001", tors=[A3], removal="code")
        self.assertEqual(self.kinds(self.repo.check()), ["removal-missing"])
        self.repo.sidecar("Epic009", "Not Started", [], retires="CR-Rt00001")
        self.assertEqual(self.kinds(self.repo.check()), [])

    def test_open_epic_lists_retired_id(self):
        self.rewrite(*self.scen[:2])
        self.repo.record("retire", "Rt00001", tors=[A3])
        self.assertEqual(self.kinds(self.repo.check()), ["open-epic-retired"])

    def test_two_records_remove_one_requirement(self):
        self.rewrite(*self.scen[:2])
        self.repo.sidecar("Epic002", "Not Started", [])
        self.repo.record("retire", "Rt00001", tors=[A3])
        self.repo.record("retire", "Rt00002", "2026-10-22", tors=[A3])
        self.assertEqual(self.kinds(self.repo.check()), ["multiple-records"])

    def test_two_open_pendings(self):
        self.repo.record("pending", "Pd00001", tors=[A3])
        self.repo.record("pending", "Pd00002", tors=[A3])
        self.assertEqual(self.kinds(self.repo.check()), ["disputed", "multiple-records"])

    def test_feature_number_reused(self):
        self.repo.record("retire", "Rt00003", tors=["TOR-01-Oldfile"],
                         changes=[{"tor": "TOR-01-Oldfile", "feature_file": "01-legacy.feature.md",
                                   "fingerprint": "b" * 12, "text": "Scenario: old"}])
        self.assertEqual(self.kinds(self.repo.check()), ["feature-number-reused"])

    def test_retired_id_reused(self):
        self.repo.record("retire", "Rt00004", tors=[A3])
        self.assertIn("id-reused", self.kinds(self.repo.check()))

    def test_multi_owner_tor_split(self):
        self.repo.sidecar("Epic003", "Not Started", [A3])
        [f] = letters(self.repo.check(), "F")
        self.assertEqual((f["kind"], f["detail"]["epics"]), ("multi-owner", ["Epic002", "Epic003"]))

    def test_waiver_is_not_a_second_owner(self):
        self.repo.sidecar("Epic001", "Complete", [A1, A2, A3], verified={s.tor: s.fp() for s in self.scen[:2]},
                          waived=f"{A3} → Epic002")
        self.assertEqual(self.repo.check(), [])

    def test_q17_waived_retired_tor_is_history(self):
        self.rewrite(*self.scen[:2])
        self.repo.sidecar("Epic002", "Not Started", [])
        self.repo.sidecar("Epic001", "Complete", [A1, A2, A3], verified={s.tor: s.fp() for s in self.scen[:2]},
                          waived=f"{A3} → Epic002")
        self.repo.record("retire", "Rt00005", tors=[A3])
        self.assertEqual(self.repo.check(), [])


# Decision-test table (#20 "Decision test"): (row, old steps, new steps). Every row except the
# first is a meaning change. Edited in place without a record it must raise A; done with
# supersede mechanics (new ID in place, record, open epics swapped) it must be clean.
ROWS = [
    ("Em dash and comma cleanup", ("Given a file — with data", "Then it loads"),
     ("Given a file, with data", "Then it loads"), "none"),
    ("Label-only rename, citing tests pass", ("Given the settings file label", "Then it shows"),
     ("Given the settings store label", "Then it shows"), "reword"),
    ("Rename where a Given arranges a file", ("Given a settings file on disk", "Then it loads"),
     ("Given a settings store in the database", "Then it loads"), "supersede"),
    ("Exactly four fields widened", ("Then the record has exactly four fields",),
     ("Then the record has four fields plus images",), "supersede"),
    ("Cookie attribute value changed", ("Then the cookie is SameSite=Lax",),
     ("Then the cookie is SameSite=Strict",), "supersede"),
    ("At most 10 per page to 25", ("Then at most 10 items show per page",),
     ("Then at most 25 items show per page",), "supersede"),
    ("Setup clause withdrawn", ("Given the cache is warm", "When the user opens", "Then it shows"),
     ("When the user opens", "Then it shows"), "supersede"),
    ("Data validation dropped at wrapup", ("Then invalid rows are rejected", "And valid rows are saved"),
     ("Then valid rows are saved",), "supersede"),
    ("Modal replaced by inline sections", ("Then a modal dialog opens",),
     ("Then the sections expand inline",), "supersede"),
]


class DecisionTestRows(unittest.TestCase):
    def build(self, old_steps, status="Complete"):
        repo = FixtureRepo()
        self.addCleanup(repo.cleanup)
        old = scenario(A1, "The tool shall behave", *old_steps)
        repo.feature("01", "core", [old])
        repo.sidecar("Epic001", status, [A1], verified={A1: old.fp()} if status == "Complete" else None)
        repo.commit("baseline")
        return repo, old

    def test_in_place_edit_without_record(self):
        for row, old_steps, new_steps, outcome in ROWS:
            with self.subTest(row=row):
                repo, _old = self.build(old_steps)
                repo.feature("01", "core", [scenario(A1, "The tool shall behave", *new_steps)])
                found = repo.check()
                self.assertEqual(len(letters(found, "A")), 0 if outcome == "none" else 1)

    def test_recorded_outcome_is_clean(self):
        for row, old_steps, new_steps, outcome in ROWS:
            with self.subTest(row=row):
                repo, old = self.build(old_steps, "Not Started" if row.startswith("At most") else "Complete")
                if outcome == "supersede":
                    new = scenario(NEW, "The tool shall behave", *new_steps)
                    repo.feature("01", "core", [new])
                    repo.record("supersede", "Sp00001", approved_via="wrapup" if "wrapup" in row else "docs-branch",
                                changes=[{"tor": A1, "feature_file": "01-core.feature.md", "fingerprint": old.fp(),
                                          "successors": [NEW], "text": old.render()}])
                    if row.startswith("At most"):  # open epic: swap the old ID for its successor
                        repo.sidecar("Epic001", "Not Started", [NEW])
                    states = repo.states()
                    self.assertEqual(states[A1]["state"], "Superseded")
                    self.assertFalse(states[A1]["counts_as_verified"])
                else:
                    new = scenario(A1, "The tool shall behave", *new_steps)
                    repo.feature("01", "core", [new])
                    if outcome == "reword":
                        repo.record("reword", "Rw00001", changes=[{"tor": A1, "from": old.fp(), "to": new.fp()}])
                        self.assertEqual(repo.states()[A1]["state"], "Verified (reworded)")
                    else:
                        self.assertEqual(new.fp(), old.fp())
                self.assertEqual(repo.check(), [])

    def test_quick_fix_supersede_appends_successor_to_complete_epic(self):
        repo, old = self.build(ROWS[4][1])
        new = scenario(NEW, "The tool shall behave", *ROWS[4][2])
        repo.feature("01", "core", [new])
        repo.record("supersede", "Sp00002", approved_via="quick-fix", changes=[{
            "tor": A1, "feature_file": "01-core.feature.md", "fingerprint": old.fp(),
            "successors": [NEW], "text": old.render()}])
        repo.sidecar("Epic001", "Complete", [A1, NEW], verified={A1: old.fp(), NEW: new.fp()})
        repo.commit("quick-fix")
        self.assertEqual(repo.check(), [])
        states = repo.states()
        self.assertEqual((states[A1]["state"], states[NEW]["state"]), ("Superseded", "Verified"))


if __name__ == "__main__":
    unittest.main()
