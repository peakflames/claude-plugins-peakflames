"""Plan 3: the format guard (`format`), stamp writes (`--init`, `--set`), step 0001's backfill
(`provenance`), the in-flight branch warning (`inflight`), and a format-0 → 1 upgrade run twice."""
import os
import unittest

from fixtures import FixtureRepo, parse_tsv, tor_lifecycle as tl

SPEC = """# Epic {id}: {name}

**Phase:** 1 — Core
**Status:** Not Started
**Dependencies:** —
{extra}
---

## Description

Builds {name}.

## Requirements Anchors

| TOR ID | Scenario |
|---|---|
"""
OLD_SIDECAR = "status: {status}\nimplemented: —\ncompleted: —\nhandoff: —\nrequirements: —\n"


def spec(epic: str, name: str, extra: str = "") -> str:
    return SPEC.format(id=epic, name=name, extra=extra)


def commit_as(repo: FixtureRepo, author: str, message: str, date: str) -> str:
    """Commit everything as `author` on `date` (author and committer date)."""
    repo.git("add", "-A")
    os.environ["GIT_AUTHOR_DATE"] = os.environ["GIT_COMMITTER_DATE"] = f"{date}T12:00:00"
    try:
        repo.git("-c", f"user.name={author}", "commit", "-q", "-m", message)
    finally:
        del os.environ["GIT_AUTHOR_DATE"], os.environ["GIT_COMMITTER_DATE"]
    return repo.git("rev-parse", "HEAD")


PHASE = "docs/implementation-plan/phase-1-core"


def build_format0(repo: FixtureRepo) -> None:
    """A peak-workflow ≤ 2.1 project: no stamp, specs without provenance lines, sidecars
    without `owner:`. Epic Aaaa001 was planned on docs/plan, Bbbb002 committed on develop,
    Cccc003 was renamed after planning, Dddd004 already has provenance (written by 2.1)."""
    repo.write("README.md", "project\n")
    commit_as(repo, "Fixture Author", "init", "2026-01-01")
    repo.checkout("docs/plan", create=True)
    repo.write(f"{PHASE}/epic-Aaaa001-login.md", spec("Aaaa001", "Login"))
    repo.write("docs/implementation-plan/status/epic-Aaaa001.md", OLD_SIDECAR.format(status="Complete"))
    repo.write(f"{PHASE}/epic-Cccc003-export-csv.md", spec("Cccc003", "Export"))
    repo.write("docs/implementation-plan/status/epic-Cccc003.md", OLD_SIDECAR.format(status="Not Started"))
    commit_as(repo, "Pat Planner", "plan", "2026-02-03")
    repo.checkout("develop")
    repo.merge("docs/plan", "Merge branch 'docs/plan' into develop")
    repo.write(f"{PHASE}/epic-Bbbb002-search.md", spec("Bbbb002", "Search", "**Planned by:** —\n"))
    repo.write("docs/implementation-plan/status/epic-Bbbb002.md", OLD_SIDECAR.format(status="Not Started"))
    commit_as(repo, "Sam Solo", "add search epic", "2026-03-04")
    repo.git("mv", f"{PHASE}/epic-Cccc003-export-csv.md", f"{PHASE}/epic-Cccc003-export.md")
    commit_as(repo, "Sam Solo", "rename export epic", "2026-03-05")
    repo.write(f"{PHASE}/epic-Dddd004-share.md", spec(
        "Dddd004", "Share", "**Planned by:** Lee Lead\n**Planned:** 2026-04-01\n**Plan branch:** docs/share\n"))
    repo.write("docs/implementation-plan/status/epic-Dddd004.md",
               "status: Not Started\nowner: —\nimplemented: —\ncompleted: —\nhandoff: —\nrequirements: —\n")
    commit_as(repo, "Lee Lead", "add share epic", "2026-04-02")


def header(repo: FixtureRepo, rel: str) -> dict[str, str]:
    return tl.header_values((repo.root / rel).read_text(encoding="utf-8"))


class FormatGuardTests(unittest.TestCase):
    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)

    def verdict(self):
        result = self.repo.cli("format")
        return result.returncode, result.stdout.splitlines()[0].removeprefix("verdict: ")

    def test_empty_repo_is_new(self):
        self.assertEqual(self.verdict(), (0, "new"))

    def test_readme_stubs_alone_are_new(self):
        self.repo.write("docs/requirements/README.md", "stub\n")
        self.repo.write("docs/implementation-plan/README.md", "stub\n")
        self.assertEqual(self.verdict(), (0, "new"))

    def test_artifacts_without_stamp_are_format_0(self):
        self.repo.write(f"{PHASE}/epic-Aaaa001-login.md", spec("Aaaa001", "Login"))
        result = self.repo.cli("format")
        self.assertEqual(result.returncode, 1)
        self.assertIn("verdict: behind", result.stdout)
        self.assertIn("project: 0 (no stamp)", result.stdout)
        self.assertIn("/peak-workflow:upgrade", result.stdout)

    def test_current_behind_ahead(self):
        self.repo.stamp(tl.PLUGIN_FORMAT)
        self.assertEqual(self.verdict(), (0, "current"))
        self.repo.stamp(tl.PLUGIN_FORMAT - 1)
        self.assertEqual(self.verdict(), (1, "behind"))
        self.repo.stamp(tl.PLUGIN_FORMAT + 1)
        code, verdict = self.verdict()
        self.assertEqual((code, verdict), (1, "ahead"))
        self.assertIn("Update the plugin", self.repo.cli("format").stdout)

    def test_shipped_steps_reach_the_plugin_format(self):
        # Forward-only steps: a released build ships one per format up to PLUGIN_FORMAT, so a
        # project that is behind can always be upgraded by this build.
        steps = self.repo.root / "steps"
        steps.mkdir()
        (steps / "0001-epic-provenance.md").write_text("x")
        (steps / "README.txt").write_text("x")
        self.assertEqual(tl.shipped_format(steps), 1)
        self.assertEqual(tl.shipped_format(), tl.PLUGIN_FORMAT)

    def test_single_index_layout_is_not_peak_workflow(self):
        self.repo.write("docs/implementation-plan/index.md",
                        "| Phase | Epic | Name | Status |\n|---|---|---|---|\n| 1 | 1 | Login | Complete |\n")
        self.repo.stamp(tl.PLUGIN_FORMAT)
        self.assertEqual(self.verdict(), (1, "not-peak-workflow"))

    def test_phase_table_without_status_is_fine(self):
        self.repo.write("docs/implementation-plan/index.md", "| Phase | Epic | Name |\n")
        self.repo.stamp(tl.PLUGIN_FORMAT)
        self.assertEqual(self.verdict(), (0, "current"))

    def test_malformed_stamp_exit_2(self):
        self.repo.write("docs/.peak-workflow.toml", "format = 'two'\n")
        self.assertEqual(self.repo.cli("format").returncode, 2)


class StampWriteTests(unittest.TestCase):
    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)

    def stamp_text(self):
        return (self.repo.root / "docs/.peak-workflow.toml").read_text(encoding="utf-8")

    def test_init_stamps_a_new_project_with_lifecycle(self):
        result = self.repo.cli("format", "--init")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(parse_tsv(result.stdout)[0], ("stamped", str(tl.PLUGIN_FORMAT), "docs/.peak-workflow.toml"))
        self.assertEqual(self.stamp_text(),
                         f"format = {tl.PLUGIN_FORMAT}\n\n[lifecycle]\ndisputed_threshold_days = 30\n")
        again = self.repo.cli("format", "--init")
        self.assertEqual((again.returncode, again.stdout.split("\t")[0]), (0, "already-stamped"))

    def test_init_refuses_an_unstamped_existing_project(self):
        self.repo.write("docs/requirements/01-core.feature.md", "Feature: x\n")
        result = self.repo.cli("format", "--init")
        self.assertEqual(result.returncode, 1)
        self.assertTrue(result.stdout.startswith("not-stamped"))
        self.assertIn("/peak-workflow:upgrade", result.stdout)
        self.assertFalse((self.repo.root / "docs/.peak-workflow.toml").exists())

    def test_init_reports_an_old_stamp(self):
        self.repo.stamp(1)
        result = self.repo.cli("format", "--init")
        self.assertEqual(result.returncode, 1)
        self.assertIn("already-stamped\t1", result.stdout)

    def test_set_moves_forward_and_keeps_the_rest(self):
        self.repo.stamp(0, disputed_threshold_days=14)
        self.assertEqual(self.repo.cli("format", "--set", "1").returncode, 0)
        self.assertEqual(self.stamp_text(), "format = 1\n\n[lifecycle]\ndisputed_threshold_days = 14\n")
        back = self.repo.cli("format", "--set", "0")
        self.assertEqual(back.returncode, 2)
        self.assertIn("only move forward", back.stderr)
        self.assertEqual(self.repo.cli("format", "--set", str(tl.PLUGIN_FORMAT + 1)).returncode, 2)

    def test_set_creates_a_missing_stamp_with_lifecycle(self):
        self.assertEqual(self.repo.cli("format", "--set", "1").returncode, 0)
        self.assertEqual(self.stamp_text(), "format = 1\n\n[lifecycle]\ndisputed_threshold_days = 30\n")


class ProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)
        build_format0(self.repo)

    def test_dry_run_lists_pending_files(self):
        code, rows = self.repo.json_cli("provenance")
        self.assertEqual(code, 1)
        self.assertEqual({(r["path"], r["kind"]) for r in rows}, {
            (f"{PHASE}/epic-Aaaa001-login.md", "spec"), (f"{PHASE}/epic-Bbbb002-search.md", "spec"),
            (f"{PHASE}/epic-Cccc003-export.md", "spec"),
            ("docs/implementation-plan/status/epic-Aaaa001.md", "sidecar"),
            ("docs/implementation-plan/status/epic-Bbbb002.md", "sidecar"),
            ("docs/implementation-plan/status/epic-Cccc003.md", "sidecar")})
        self.assertEqual(self.repo.git("status", "--porcelain"), "")

    def test_values_come_from_git(self):
        self.repo.cli("provenance", "--write")
        login = header(self.repo, f"{PHASE}/epic-Aaaa001-login.md")
        self.assertEqual((login["Planned by"], login["Planned"], login["Plan branch"]),
                         ("Pat Planner", "2026-02-03", "docs/plan"))
        search = header(self.repo, f"{PHASE}/epic-Bbbb002-search.md")  # `—` replaced; trunk commit
        self.assertEqual((search["Planned by"], search["Planned"], search["Plan branch"]),
                         ("Sam Solo", "2026-03-04", "develop"))
        export = header(self.repo, f"{PHASE}/epic-Cccc003-export.md")  # followed across the rename
        self.assertEqual((export["Planned by"], export["Planned"], export["Plan branch"]),
                         ("Pat Planner", "2026-02-03", "docs/plan"))

    def test_lines_land_after_dependencies_in_order(self):
        self.repo.cli("provenance", "--write")
        text = (self.repo.root / f"{PHASE}/epic-Aaaa001-login.md").read_text(encoding="utf-8")
        self.assertIn("**Dependencies:** —\n**Planned by:** Pat Planner\n**Planned:** 2026-02-03\n"
                      "**Plan branch:** docs/plan\n\n---\n", text)
        side = (self.repo.root / "docs/implementation-plan/status/epic-Aaaa001.md").read_text(encoding="utf-8")
        self.assertTrue(side.startswith("status: Complete\nowner: —\nimplemented: —\n"))

    def test_existing_values_and_owner_untouched(self):
        rel = f"{PHASE}/epic-Dddd004-share.md"
        before = (self.repo.root / rel).read_text(encoding="utf-8")
        self.repo.cli("provenance", "--write")
        self.assertEqual((self.repo.root / rel).read_text(encoding="utf-8"), before)
        self.assertNotIn("epic-Dddd004", self.repo.git("status", "--porcelain"))

    def test_skip_leaves_an_epic_alone(self):
        code, rows = self.repo.json_cli("provenance", "--skip", "Aaaa001,Cccc003")
        self.assertEqual({r["epic"] for r in rows}, {"Bbbb002"})

    def test_lookalike_spec_is_not_followed_to_another_epic(self):
        # Replacing one epic's spec with another's in one commit reads as a rename to git.
        self.repo.remove(f"{PHASE}/epic-Aaaa001-login.md")
        self.repo.write(f"{PHASE}/epic-Ffff006-login.md", spec("Ffff006", "Login"))
        commit_as(self.repo, "Kim Replan", "replan login", "2026-05-06")
        self.repo.cli("provenance", "--write")
        new = header(self.repo, f"{PHASE}/epic-Ffff006-login.md")
        self.assertEqual((new["Planned by"], new["Planned"]), ("Kim Replan", "2026-05-06"))

    def test_untracked_spec_gets_dashes(self):
        self.repo.write(f"{PHASE}/epic-Eeee005-new.md", spec("Eeee005", "New"))
        self.repo.cli("provenance", "--write")
        new = header(self.repo, f"{PHASE}/epic-Eeee005-new.md")
        self.assertEqual((new["Planned by"], new["Planned"], new["Plan branch"]), ("—", "—", "—"))
        self.assertEqual(self.repo.cli("provenance").returncode, 0)

    def test_pull_request_merge_subject(self):
        self.assertEqual(tl.merge_branch("Merge pull request #12 from acme/docs/plan-v2"), "docs/plan-v2")
        self.assertEqual(tl.merge_branch("Merge remote-tracking branch 'origin/docs/x'"), "docs/x")
        self.assertIsNone(tl.merge_branch("plan the thing"))


class UpgradeRunTests(unittest.TestCase):
    """What the upgrade runner does for step 0001, run twice: the second run changes nothing."""

    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)
        build_format0(self.repo)

    def run_step_0001(self):
        detect = self.repo.cli("provenance")
        if detect.returncode == 1:
            self.assertEqual(self.repo.cli("provenance", "--write").returncode, 0)
        self.assertEqual(self.repo.cli("format", "--set", "1").returncode, 0)
        if self.repo.git("status", "--porcelain"):
            self.repo.commit("chore(upgrade): step 0001 epic-provenance")
        return detect.returncode

    def test_format0_to_1_idempotent(self):
        self.repo.checkout("docs/upgrade-format-1", create=True)
        self.assertEqual(self.run_step_0001(), 1)
        first = self.repo.git("rev-parse", "HEAD")
        changed = self.repo.git("show", "--name-only", "--format=", "HEAD").splitlines()
        self.assertIn("docs/.peak-workflow.toml", changed)
        self.assertEqual(len(changed), 7)  # 3 specs, 3 sidecars, the stamp
        self.assertEqual(tl.load_stamp(self.repo.root).format, 1)
        verdict = self.repo.cli("format").stdout
        self.assertIn("project: 1", verdict)
        # second run: detect is clean, nothing to commit
        self.assertEqual(self.run_step_0001(), 0)
        self.assertEqual(self.repo.git("rev-parse", "HEAD"), first)
        self.assertEqual(self.repo.git("status", "--porcelain"), "")

    def test_already_satisfied_project_only_gets_the_stamp(self):
        self.repo.cli("provenance", "--write")
        self.repo.commit("someone backfilled by hand")
        self.assertEqual(self.run_step_0001(), 0)
        self.assertEqual(self.repo.git("show", "--name-only", "--format=", "HEAD"), "docs/.peak-workflow.toml")


class InflightTests(unittest.TestCase):
    def setUp(self):
        self.repo = repo = FixtureRepo()
        self.addCleanup(repo.cleanup)
        build_format0(repo)
        repo.checkout("feature/epic-Bbbb002-search", create=True)
        repo.write("docs/implementation-plan/status/epic-Bbbb002.md",
                   OLD_SIDECAR.format(status="In Progress"))
        repo.write("src/search.py", "pass\n")
        repo.commit("start search")
        repo.checkout("develop")

    def test_lists_unmerged_branches_touching_paths(self):
        result = self.repo.cli("inflight", "docs/implementation-plan")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(parse_tsv(result.stdout), [
            ("feature/epic-Bbbb002-search", "docs/implementation-plan/status/epic-Bbbb002.md")])

    def test_step_globs_ignore_other_planning_files(self):
        self.repo.checkout("docs/phase-2", create=True)
        self.repo.write("docs/implementation-plan/phase-2-more/index.md", "| Epic |\n")
        self.repo.commit("phase 2 index")
        self.repo.checkout("develop")
        result = self.repo.cli("inflight", "docs/implementation-plan/phase-*/epic-*.md",
                               "docs/implementation-plan/status/epic-*.md")
        self.assertEqual(parse_tsv(result.stdout), [
            ("feature/epic-Bbbb002-search", "docs/implementation-plan/status/epic-Bbbb002.md")])

    def test_upgrade_branches_are_never_in_flight(self):
        self.repo.checkout("docs/upgrade-format-1", create=True)
        self.repo.write("docs/implementation-plan/status/epic-Aaaa001.md", "status: Complete\nowner: —\n")
        self.repo.commit("upgrade")
        self.repo.checkout("develop")
        result = self.repo.cli("inflight", "docs/implementation-plan/status/epic-*.md")
        self.assertNotIn("docs/upgrade-format-1", result.stdout)

    def test_other_paths_and_merged_branches_are_quiet(self):
        self.assertEqual(self.repo.cli("inflight", "docs/requirements").returncode, 0)
        self.repo.merge("feature/epic-Bbbb002-search")
        result = self.repo.cli("inflight", "docs/implementation-plan")
        self.assertEqual((result.returncode, result.stdout), (0, ""))


if __name__ == "__main__":
    unittest.main()
