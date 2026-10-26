"""Plan 8: step 0002 mechanics (`migrate scan|records|strip|sidecars|finish`, `fingerprint --against`,
`check --by-epic`) and a "Project A-like" fixture upgraded from format 0 to 2, twice."""
import json
import sys
import unittest
from pathlib import Path

from fixtures import FixtureRepo, Scenario, feature_text, parse_tsv, tor_lifecycle as tl

sys.path.insert(0, str(Path(__file__).resolve().parent / "dryrun"))
import plan8_project_a as pa  # noqa: E402

TODAY = "2026-10-26"
FILE = "docs/requirements/01-core.feature.md"


class ProseScanTests(unittest.TestCase):
    TEXT = "\n".join([
        "# Core", "", "> SUPERSEDED banner in the Markdown preamble", "", "```gherkin",
        "Feature: 1.0 Core", "    As a user", "    I want things", "    So that value", "",
        "# ----", "# UX Baseline", "# ----", "# Note: reference screen — Orders List (S-01)", "",
        "Scenario: [TOR-01-Aaa0001] The tool shall do A",
        "    #", "    # Note:", "    #   AMENDED v1.8: wording.", "    #",
        "    # Verification: automated",
        "    Given a", '    """', "    # not a comment: doc string content", '    """', "    Then b",
        "", "# TODO stray comment", "Scenario: [TOR-01-Bbb0002] The tool shall do B",
        "    # Note: B is fast because it caches.", "    Given a", "    Then b", "",
        "# ----", "# Later", "# MODIFIED v1.8: section moved", "# ----", "",
        "Scenario: [TOR-01-Ccc0003] The tool shall do C", "    Given a", "    Then c", "```",
        "REVISED after the fence: part of C's fingerprint", ""])

    def test_items_kinds_and_owners(self):
        items = tl.scan_prose(FILE, self.TEXT)
        got = [(it.line, it.kind, it.tor, it.strip) for it in items]
        self.assertEqual(got, [
            (3, "outside", None, True),             # preamble: safe to strip
            (17, "marker", "TOR-01-Aaa0001", True),  # the `#` / Note / `#` run
            (28, "comment", "TOR-01-Bbb0002", True),  # directly above B's Scenario line
            (30, "note", "TOR-01-Bbb0002", True),
            (36, "banner", None, True),
            (43, "outside", None, False),           # after the last Scenario: in C's fingerprint
        ])
        self.assertEqual(items[1].end, 20)
        self.assertEqual(items[1].summary, "AMENDED v1.8: wording.")

    def test_strip_keeps_fingerprints_and_kept_lines(self):
        new, _n = tl.strip_feature_text(FILE, self.TEXT)
        self.assertEqual(tl.parse_requirements(new), tl.parse_requirements(self.TEXT))
        for kept in ("# Note: reference screen", "# Verification: automated", "# not a comment",
                     "# Later", "REVISED after the fence", "# UX Baseline"):
            self.assertIn(kept, new)
        for gone in ("AMENDED", "TODO", "caches", "MODIFIED", "SUPERSEDED banner"):
            self.assertNotIn(gone, new)

    def test_unfenced_title_before_feature_is_kept(self):
        text = "# Core requirements\n# SUPERSEDED file banner\n\nFeature: 1.0 Core\n\n" \
               "Scenario: [TOR-01-Aaa0001] The tool shall do A\n    # stray\n    Then a\n"
        self.assertEqual([(it.line, it.kind) for it in tl.scan_prose(FILE, text)], [(2, "marker"), (7, "comment")])

    def test_strip_drops_a_banner_left_empty(self):
        text = feature_text("01", "Core", [Scenario("TOR-01-Aaa0001", "The tool shall do A")], fenced=False)
        text = text.replace("Scenario:", "# ----\n# MODIFIED v1.2: reorganised\n# ----\n\nScenario:")
        new, _n = tl.strip_feature_text(FILE, text)
        self.assertNotIn("MODIFIED", new)
        self.assertNotIn("# ----\n# ----", new)

    def test_strip_refuses_a_section_change(self):
        with FixtureRepo() as repo:
            repo.write(FILE, "\n".join([
                "Feature: 1.0 Core", "", "# ----", "# Safety", "# ----", "",
                "Scenario: [TOR-01-Aaa0001] The tool shall never do A", "    Then no A", "",
                "# ----", "# SUPERSEDED section — Ops", "# ----", "",
                "Scenario: [TOR-01-Bbb0002] The tool shall do B", "    Then b", ""]))
            result = repo.cli("migrate", "strip", "--write")
            self.assertEqual(result.returncode, 2)
            self.assertIn("TOR-01-Bbb0002", result.stderr)


class AnchorTableTests(unittest.TestCase):
    LIVE = {"TOR-01-Aaa0001": tl.LiveRequirement("TOR-01-Aaa0001", "A", "0" * 12, "01-core.feature.md")}

    def test_three_columns_become_two(self):
        text = ("## Requirements Anchors\n\n| TOR ID | Feature File | Scenario Title |\n|---|---|---|\n"
                "| TOR-01-Aaa0001 | `docs/requirements/01-core.feature.md` | The tool shall \\| do A |\n\n## Next\n")
        self.assertEqual(tl.strip_anchor_titles(text, self.LIVE),
                         "## Requirements Anchors\n\n| TOR ID | Feature File |\n|--------|--------------|\n"
                         "| TOR-01-Aaa0001 | `docs/requirements/01-core.feature.md` |\n\n## Next\n")

    def test_title_only_table_gains_the_feature_file(self):
        text = "## Requirements Anchors\n\n| TOR ID | Scenario |\n|---|---|\n| TOR-01-Aaa0001 | A |\n| TOR-01-Gone001 | G |\n"
        out = tl.strip_anchor_titles(text, self.LIVE)
        self.assertIn("| TOR-01-Aaa0001 | `docs/requirements/01-core.feature.md` |", out)
        self.assertIn("| TOR-01-Gone001 | — |", out)

    def test_two_column_table_is_left_alone(self):
        text = "## Requirements Anchors\n\n| TOR ID | Feature File |\n|---|---|\n| TOR-01-Aaa0001 | x |\n"
        self.assertEqual(tl.strip_anchor_titles(text, self.LIVE), text)


class HelperFlagTests(unittest.TestCase):
    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)

    def test_fingerprint_against(self):
        a, b = Scenario("TOR-01-Aaa0001", "The tool shall do A"), Scenario("TOR-01-Bbb0002", "The tool shall do B")
        self.repo.feature("01", "core", [a, b])
        before = self.repo.write("before.tsv", self.repo.cli("fingerprint").stdout)
        self.repo.feature("01", "core", [a])
        result = self.repo.cli("fingerprint", "--against", str(before))
        self.assertEqual((result.returncode, parse_tsv(result.stdout)),
                         (1, [("TOR-01-Bbb0002", "removed", "no change record"), ("identical", "1")]))
        self.repo.record("retire", "Rt00001", tors=["TOR-01-Bbb0002"])
        self.assertEqual(self.repo.cli("fingerprint", "--against", str(before)).returncode, 0)
        self.repo.feature("01", "core", [Scenario(a.tor, "The tool shall do A twice")])
        result = self.repo.cli("fingerprint", "--against", str(before))
        self.assertEqual(result.returncode, 1)
        self.assertIn("TOR-01-Aaa0001\tchanged", result.stdout)

    def test_check_by_epic(self):
        a = Scenario("TOR-01-Aaa0001", "The tool shall do A")
        self.repo.feature("01", "core", [a])
        self.repo.sidecar("aEpic01", status="Complete", requirements=[a.tor], verified={a.tor: "0" * 12})
        self.repo.write("docs/implementation-plan/phase-1-core/epic-aEpic01-alpha.md", "# Epic aEpic01: Alpha\n")
        self.repo.write("tests/test_x.py", "# TOR-01-Nope001\n")
        self.repo.commit("x")
        out = self.repo.cli("check", "--by-epic", "--today", TODAY).stdout
        self.assertIn("Epic aEpic01 (alpha) — Alpha (1)\n  - D. TOR-01-Aaa0001 changed", out)
        self.assertIn("No epic (1)\n  - C. tests/test_x.py:1 cites TOR-01-Nope001", out)
        self.assertTrue(out.rstrip().endswith("2 finding(s) (1 C, 1 D); 0 blocking."))

    def test_duplicate_sidecar_key_is_a_data_error(self):
        # A clean git merge of an in-flight branch can leave a second `owner:` line.
        self.repo.write("docs/implementation-plan/status/epic-aEpic01.md",
                        "status: In Progress\nowner: —\nrequirements: —\nowner: Dev Two\n")
        for args in (("migrate", "scan"), ("check",), ("states",)):
            result = self.repo.cli(*args)
            self.assertEqual(result.returncode, 2, args)
            self.assertIn("line 4: `owner:` appears twice (also line 2); delete line 2 (`owner: —`) and keep `owner: Dev Two`", result.stderr)

    def test_sidecar_keys_and_finish(self):
        self.repo.sidecar("aEpic01", status="Complete", requirements=["TOR-01-Aaa0001"],
                          superseded_by="TOR-01-Bbb0002", reverified="2026-01-01")
        self.repo.write("docs/requirements/changes/2026-10-21-Pnd0001.toml",
                        "migration_source = \"x\"\n" + (self.repo.root / self.repo.record(
                            "pending", "Pnd0001", tors=["TOR-01-Aaa0001"])).read_text())
        self.assertEqual(self.repo.cli("migrate", "sidecars").returncode, 1)
        self.repo.cli("migrate", "sidecars", "--write")
        side = (self.repo.root / "docs/implementation-plan/status/epic-aEpic01.md").read_text()
        self.assertNotIn("superseded_by", side)
        self.assertIn("reverified: 2026-01-01", side)
        self.assertEqual(self.repo.cli("migrate", "finish", "--write").returncode, 0)
        self.assertNotIn("migration_source",
                         (self.repo.root / "docs/requirements/changes/2026-10-21-Pnd0001.toml").read_text())
        self.assertEqual(self.repo.cli("migrate", "finish").returncode, 0)


def run_step_0002(repo: FixtureRepo, plan: dict | None = None) -> list[str]:
    """What step 0002 does, phase by phase, as the runner applies it. Returns the commit subjects."""
    scratch = Path(repo.git("rev-parse", "--absolute-git-dir")) / "peak-workflow-0002"
    scratch.mkdir(exist_ok=True)
    subjects = []

    def commit(phase: str) -> None:
        if repo.git("status", "--porcelain"):
            subjects.append(f"chore(upgrade): step 0002 requirements-lifecycle — {phase}")
            repo.commit(subjects[-1])

    if repo.cli("migrate", "scan", "--base", "develop", "--today", TODAY).returncode == 0:
        return subjects
    if not (scratch / "before.tsv").exists():
        (scratch / "before.tsv").write_text(repo.cli("fingerprint").stdout)
    _code, scan = repo.json_cli("migrate", "scan", "--base", "develop", "--today", TODAY)
    (scratch / "plan.json").write_text(json.dumps(plan or pa.classification(scan)))
    result = repo.cli("migrate", "records", "--plan", str(scratch / "plan.json"), "--base", "develop",
                      "--today", TODAY, "--write")
    assert result.returncode == 0, result.stderr
    assert repo.cli("validate").returncode == 0
    commit("change records")
    assert repo.cli("migrate", "strip", "--write").returncode == 0
    against = repo.cli("fingerprint", "--against", str(scratch / "before.tsv"))
    assert against.returncode == 0, against.stdout
    commit("strip notes and titles")
    repo.cli("seed", "--write")
    commit("seed verified fingerprints")
    repo.cli("migrate", "sidecars", "--write")
    commit("normalize sidecar keys")
    repo.cli("migrate", "finish", "--write")
    repo.cli("format", "--set", "2")
    subjects.append("chore(upgrade): step 0002 requirements-lifecycle")
    repo.commit(subjects[-1])
    return subjects


class ProjectAUpgradeTests(unittest.TestCase):
    """The Plan 8 "Project A-like" fixture, upgraded from format 0 to 2 the way the runner does it."""

    @classmethod
    def setUpClass(cls):
        import tempfile
        cls.tmp = Path(tempfile.mkdtemp(prefix="pw-plan8-"))
        cls.repo = repo = pa.build(cls.tmp / "fx")
        cls.base_sha = repo.git("rev-parse", "develop")
        repo.checkout("docs/upgrade-format-2", create=True)
        cls.before_fp = dict(parse_tsv(repo.cli("fingerprint").stdout))
        cls.before_check = repo.check("--base", "develop")
        assert repo.cli("provenance", "--write").returncode == 0
        repo.cli("format", "--set", "1")
        repo.commit("chore(upgrade): step 0001 epic-provenance")
        cls.step1_sha = repo.git("rev-parse", "HEAD")
        cls.subjects = run_step_0002(repo)
        cls.head = repo.git("rev-parse", "HEAD")

    @classmethod
    def tearDownClass(cls):
        import shutil
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_01_before_the_upgrade(self):
        letters = sorted({(f["letter"], f.get("tor")) for f in self.before_check if f["letter"] in "AB"})
        self.assertEqual(letters, [("A", "TOR-01-Pre0001"), ("A", "TOR-02-Wrd0001"), ("B", "TOR-03-Csv0001")])

    def test_02_one_commit_per_phase(self):
        self.assertEqual([s.split("— ")[-1] for s in self.subjects], [
            "change records", "strip notes and titles", "seed verified fingerprints", "normalize sidecar keys",
            "chore(upgrade): step 0002 requirements-lifecycle"])
        self.assertEqual(self.repo.cli("format").stdout.splitlines()[0], "verdict: current")

    def test_03_fingerprints_identical_for_survivors(self):
        after = dict(parse_tsv(self.repo.cli("fingerprint").stdout))
        self.assertEqual(set(self.before_fp) - set(after), {"TOR-02-Old0001", "TOR-03-Imp0001"})
        self.assertEqual({t: self.before_fp[t] for t in after}, after)

    def test_04_seed_surfaces_exactly_the_planted_stale_set(self):
        states = self.repo.states()
        stale = {t for t, r in states.items() if r["state"] == "Changed since verified"}
        self.assertEqual(stale, pa.STALE)
        self.assertEqual(states["TOR-02-Tmo0001"]["state"], "Disputed")
        self.assertEqual(states["TOR-02-Tmo0001"]["underlying_state"], "Verified")
        self.assertEqual(len(states["TOR-02-Wrd0001"]["historical_records"]), 1)
        self.assertEqual(states["TOR-01-Pre0001"]["state"], "Verified")  # edited before verification
        self.assertEqual({t for t, r in states.items() if r["state"] == "Superseded"},
                         {"TOR-02-Old0001", "TOR-03-Csv0001"})
        self.assertEqual(states["TOR-03-Imp0001"]["state"], "Retired")
        self.assertEqual({r["state"] for t, r in states.items() if t in ("TOR-03-Prn0001", "TOR-01-Tag0001",
                                                                          "TOR-03-Shr0001", "TOR-02-New0001")},
                         {"In Progress", "Implemented", "Paused", "Planned"})

    def test_05_check_shows_the_planted_findings_only(self):
        findings = self.repo.check()
        self.assertEqual([(f["letter"], f.get("tor") or f.get("epic")) for f in findings],
                         [("C", "cExp03"), ("D", "TOR-02-Wrd0001"), ("F", "TOR-02-Tmo0001")])
        self.assertIn(pa.DANGLING, findings[0]["message"])
        by_epic = self.repo.cli("check", "--by-epic", "--today", TODAY).stdout
        self.assertIn("Epic bSync02 (sync) — Sync (2)", by_epic)
        self.assertIn("Epic cExp03 (export) — Export (1)", by_epic)
        # The pre-3.0 edit is recorded but unproven: the owner decides meaning before any reverify.
        self.assertIn("recorded without test evidence). If its meaning changed: /peak-workflow:capture-requirements "
                      "TOR-02-Wrd0001; if not, re-check it: /peak-workflow:wrapup-epic bSync02 reverify",
                      findings[1]["message"])

    def test_06_records_validate_and_carry_no_migration_source(self):
        result = self.repo.cli("validate")
        self.assertEqual(result.returncode, 0, result.stdout)
        records = tl.load_records(self.repo.root)
        self.assertEqual(sorted((r.kind, tuple(r.tors)) for r in records), [
            ("pending", ("TOR-02-Tmo0001",)), ("retire", ("TOR-03-Imp0001",)),
            ("reword", ("TOR-01-Pre0001",)), ("reword", ("TOR-02-Wrd0001",)),
            ("supersede", ("TOR-02-Old0001",)), ("supersede", ("TOR-03-Csv0001",))])
        for r in records:
            self.assertEqual(r.data["approved_via"], "migration")
            self.assertNotIn("migration_source", r.data)
            self.assertTrue(any(ref.startswith("commit ") for ref in r.data["refs"]), r.id)
        reword = next(r for r in records if r.kind == "reword" and r.tors == ["TOR-02-Wrd0001"])
        self.assertEqual(reword.data["evidence"]["result"], "historical")
        csv = next(r for r in records if r.tors == ["TOR-03-Csv0001"])
        self.assertIn("text and date", csv.changes[0]["text"])  # verbatim, from git history

    def test_07_feature_tracing_and_specs_are_clean(self):
        root = self.repo.root
        scan = self.repo.json_cli("migrate", "scan", "--base", "develop")[1]
        self.assertFalse(scan["pending"], scan["counts"])
        self.assertNotIn("TOR-02-Old0001", (root / "docs/requirements/02-sync.feature.md").read_text())
        raw = (root / "docs/requirements/01-notes.feature.tracing.json").read_text()
        self.assertTrue(raw.isascii() and "\\u00a7" in raw)  # the file's own escaping is kept
        tracing = json.loads(raw)
        self.assertNotIn("generated", tracing)
        crt = tracing["requirements"][0]
        self.assertEqual(list(crt)[:2], ["id", "rationale"])
        self.assertTrue(all("title" not in r for r in tracing["requirements"]))
        sync = json.loads((root / "docs/requirements/02-sync.feature.tracing.json").read_text())
        self.assertNotIn("TOR-02-Old0001", {r["id"] for r in sync["requirements"]})
        for epic in ("dNext04-merge-and-csv", "eWip05-print", "fImp06-tags", "hPau08-share"):
            spec = (root / f"docs/implementation-plan/phase-2-more/epic-{epic}.md").read_text()
            self.assertIn("| TOR ID | Feature File |\n", spec, epic)
            self.assertNotIn("Scenario Title", spec, epic)

    def test_08_complete_epics_only_gain_verified_lines(self):
        for epic in ("aCore01", "bSync02", "cExp03"):
            rel = f"docs/implementation-plan/status/epic-{epic}.md"
            spec = next(self.repo.root.glob(f"docs/implementation-plan/phase-*/epic-{epic}-*.md")).relative_to(self.repo.root)
            self.assertEqual(self.repo.git("diff", self.step1_sha, "HEAD", "--", str(spec)), "", epic)
            old = self.repo.git("show", f"{self.step1_sha}:{rel}").splitlines()
            new = (self.repo.root / rel).read_text().splitlines()
            self.assertEqual([ln for ln in old if not ln.startswith("superseded_by:")],
                             new[:len(old) - (epic == "cExp03")], epic)
            self.assertTrue(all(ln == "verified:" or ln.startswith("  TOR-") for ln in new[len(old) - (epic == "cExp03"):]))

    def test_09_rerun_is_a_no_op(self):
        self.assertEqual(run_step_0002(self.repo), [])
        plan = json.loads((Path(self.repo.git("rev-parse", "--absolute-git-dir")) / "peak-workflow-0002/plan.json").read_text())
        for action in ("records", "strip", "sidecars", "finish"):
            args = ["--plan", str(Path(self.repo.git("rev-parse", "--absolute-git-dir")) / "peak-workflow-0002/plan.json"),
                    "--base", "develop"] if action == "records" else []
            result = self.repo.cli("migrate", action, *args, "--write")
            self.assertEqual(result.returncode, 0, (action, result.stderr))
        self.assertTrue(plan["supersede"])
        self.assertEqual(self.repo.cli("seed", "--write").stdout.strip(), "")
        self.assertEqual(self.repo.git("status", "--porcelain"), "")
        self.assertEqual(self.repo.git("rev-parse", "HEAD"), self.head)

    def test_10_unclassified_prose_is_refused(self):
        with FixtureRepo() as other:
            fresh = pa.build(other.root)
            _code, scan = fresh.json_cli("migrate", "scan", "--base", "develop")
            plan = pa.classification(scan)
            plan["drop"] = plan["drop"][1:]
            plan["supersede"][0]["successors"] = ["TOR-02-Nope999"]
            path = fresh.write(".plan.json", json.dumps(plan))
            result = fresh.cli("migrate", "records", "--plan", str(path))
            self.assertEqual(result.returncode, 2)
            self.assertIn("not classified", result.stderr)
            self.assertIn("TOR-02-Nope999 is not a live requirement", result.stderr)
            self.assertFalse((fresh.root / "docs/requirements/changes").exists())

    def test_11_an_unexplained_edit_gets_a_generic_historical_reword(self):
        with FixtureRepo() as other:
            fresh = pa.build(other.root)
            _code, scan = fresh.json_cli("migrate", "scan", "--base", "develop")
            plan = pa.classification(scan)
            wrd = plan["history"].pop()  # no History entry for Wrd0001: its note is dropped instead
            plan["drop"] += wrd["sources"]
            path = fresh.write(".plan.json", json.dumps(plan))
            code, rows = fresh.json_cli("migrate", "records", "--plan", str(path), "--write", "--today", TODAY)
            rec = next(r for r in tl.load_records(fresh.root) if r.tors == ["TOR-02-Wrd0001"])
            self.assertEqual(rec.data["title"], "Edited in place before 3.0: docs: v1.8 wording cascade")
            self.assertEqual(rec.data["evidence"]["result"], "historical")
            self.assertTrue(rec.data["migration_source"].startswith("git "))
            self.assertEqual([f for f in fresh.check() if f["letter"] == "A"], [])


if __name__ == "__main__":
    unittest.main()
