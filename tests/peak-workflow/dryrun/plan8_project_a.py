"""Build the Plan 8 fixture: a "Project A-like" peak-workflow 2.1 project (format 0, no stamp).

It holds what step 0002 must migrate: 2.1-era `# Note:` prose (rationale, AMENDED / REVISED /
SUPERSEDED / MODIFIED / CHANGE-CONTROL), titles in tracing sidecars and spec anchor tables,
Complete epics with recoverable completion commits, one in-place edit after verification
(TOR-02-Wrd0001), one edit before verification (TOR-01-Pre0001), a requirement deleted without a
record (TOR-03-Csv0001), one "pending change-control" note (TOR-02-Tmo0001), one ad hoc sidecar
key (`superseded_by:` on cExp03), and one dangling `TOR-24 set` entry (cExp03).

    python3.11 tests/peak-workflow/dryrun/plan8_project_a.py <dest>   (dest outside the repo, or under tmp/)

`classification(scan)` returns the owner-approved plan an agent would propose for `migrate records`.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures import FixtureRepo, Scenario  # noqa: E402

RULE = "# " + "-" * 60
CANARY = "Zanzibar-quokka"  # appears in a title: the acceptance runner must never print it

# Requirements (v1 = first merged text; v2 = after an in-place edit).
CRT = Scenario("TOR-01-Crt0001", "The app shall create a note from the quick-capture box",
               ["Given the notes list is open", "When the user types text and presses Enter",
                "Then a new note with that text is listed first"],
               note=["titles are optional: quick capture matters more than structure."])
FMT = Scenario("TOR-01-Fmt0001", f"The app shall show note dates in ISO 8601 form ({CANARY})",
               ["Given a note created on 2026-03-04", "When the notes list is shown",
                "Then the note's date reads 2026-03-04"])
PRE_V1 = Scenario("TOR-01-Pre0001", "The app shall limit a note to 100 characters",
                  ["Given the quick-capture box", "When the user types 101 characters",
                   "Then the 101st character is rejected"])
PRE_V2 = Scenario("TOR-01-Pre0001", "The app shall limit a note to 500 characters",
                  ["Given the quick-capture box", "When the user types 501 characters",
                   "Then the 501st character is rejected"],
                  note=["REVISED v1.2: limit raised from 100 to 500 characters (support tickets)."])
DEL = Scenario("TOR-01-Del0001", "The app shall delete a note after the user confirms",
               ["Given a note exists", "When the user deletes it and confirms",
                "Then the note is no longer listed"])
TAG = Scenario("TOR-01-Tag0001", "The app shall let the user tag a note",
               ["Given a note exists", "When the user adds the tag work", "Then the note shows the tag work"])

WRD_V1 = Scenario("TOR-02-Wrd0001", "The app shall sync changed notes within 60 seconds",
                  ["Given two signed-in devices", "When a note changes on one",
                   "Then the other shows the change within 60 seconds"])
WRD_V2 = Scenario("TOR-02-Wrd0001", "The app shall sync changed notes within 30 seconds",
                  ["Given two signed-in devices", "When a note changes on one",
                   "Then the other shows the change within 30 seconds"],
                  note=["AMENDED v1.8: interval tightened to 30 seconds after the ops review."])
TMO_V1 = Scenario("TOR-02-Tmo0001", "The app shall abandon a sync attempt after 10 seconds without a reply",
                  ["Given the sync server does not answer", "When a sync starts",
                   "Then the attempt ends after 10 seconds and is retried later"])
TMO_V2 = Scenario(TMO_V1.tor, TMO_V1.title, TMO_V1.steps,
                  note=["CHANGE-CONTROL pending: ops wants the timeout raised to 30 seconds;",
                        "not approved yet. Do not change until decided."])
OLD_V1 = Scenario("TOR-02-Old0001", "The app shall ask the user to pick a version when two devices edit one note",
                  ["Given a note edited offline on two devices", "When both sync",
                   "Then the user is asked which version to keep"])
OLD_V2 = Scenario(OLD_V1.tor, OLD_V1.title, OLD_V1.steps,
                  note=["SUPERSEDED by TOR-02-New0001 in v1.6: conflicts now resolve last-writer-wins."])
NEW = Scenario("TOR-02-New0001", "The app shall keep the most recent edit when two devices edit one note",
               ["Given a note edited offline on two devices", "When both sync",
                "Then the edit with the later timestamp is kept on both"])
SAF = Scenario("TOR-02-Saf0001", "The app shall never delete a local note because of a sync error",
               ["Given a sync that fails mid-transfer", "When the app recovers",
                "Then every local note is still present"], verification="automated")

CSV1 = Scenario("TOR-03-Csv0001", "The app shall export notes as CSV with the columns text and date",
                ["Given 2 notes", "When the user exports CSV", "Then the header row is text,date"])
CSV2 = Scenario("TOR-03-Csv0002", "The app shall export notes as CSV with the columns Text, Created, and Tags",
                ["Given 2 notes", "When the user exports CSV", "Then the header row is Text,Created,Tags"])
IMP_V1 = Scenario("TOR-03-Imp0001", "The app shall import notes from a CSV file",
                  ["Given a CSV file with 3 rows", "When the user imports it", "Then 3 notes are added"])
IMP_V2 = Scenario(IMP_V1.tor, IMP_V1.title, IMP_V1.steps,
                  note=["REVISED v1.6: import was dropped from scope; this requirement no longer applies."])
PDF = Scenario("TOR-03-Pdf0001", "The app shall export a note as PDF",
               ["Given a note", "When the user exports it as PDF", "Then a PDF with the note's text downloads"])
PRN = Scenario("TOR-03-Prn0001", "The app shall print a note",
               ["Given a note", "When the user prints it", "Then the print dialog shows the note's text"])
SHR = Scenario("TOR-03-Shr0001", "The app shall share a note as a link",
               ["Given a note", "When the user shares it", "Then a link to a read-only copy is copied"])

STALE = {"TOR-02-Wrd0001"}           # Changed since verified after the migration
EDITED = {"TOR-01-Pre0001", "TOR-02-Wrd0001"}  # edited in place on the trunk (historical rewords)
DANGLING = "TOR-24 set"


def feature(nn: str, title: str, sections: list[tuple[list[str] | None, list[Scenario]]],
            above: dict[str, list[str]] | None = None) -> str:
    """A fenced 2.1-era feature file. `sections` = (banner lines or None, scenarios);
    `above` puts comment lines directly above a Scenario line."""
    above = above or {}
    out = [f"Feature: {int(nn)}.0 {title}", "    As a note taker", "    I want my notes everywhere",
           "    So that I never lose a thought", ""]
    for banner, scenarios in sections:
        if banner:
            out += ["", RULE] + [f"# {b}" for b in banner] + [RULE, ""]
        for s in scenarios:
            out += [f"# {c}" for c in above.get(s.tor, [])] + [s.render(), ""]
    return f"# {title}\n\n```gherkin\n" + "\n".join(out).rstrip("\n") + "\n```\n"


def tracing(nn: str, name: str, scenarios: list[Scenario], drift: dict[str, str] | None = None) -> str:
    drift = drift or {}
    return json.dumps({
        "feature_id": nn, "feature_file": f"{nn}-{name}.feature.md", "generated": "2026-01-10",
        "generator": "haiku-sub-agent via /peak-workflow:capture-requirements",
        "requirements": [{"id": s.tor, "title": drift.get(s.tor, s.title), "traces_to": {
            "vision": [{"section": "§2 — Goals", "paraphrase": "Serves the capture goal."}],
            "conops": [{"scenario": "S1", "step": 2, "paraphrase": "The user captures a note."}],
            "claude_md": []}} for s in scenarios],
        "coverage_gaps": []}, indent=2) + "\n"


def f01(pre: Scenario, banner_marker: bool = False) -> str:
    banner = ["Editing"] + (["MODIFIED v1.8: section reorganised; Delete moved here."] if banner_marker else [])
    tag = Scenario(TAG.tor, TAG.title, TAG.steps)
    return feature("01", "Notes", [(["Capture"], [CRT, FMT, pre]), (banner, [DEL, tag])],
                   above={TAG.tor: ["TODO: tighten the wording once tagging ships"]} if banner_marker else None)


def f02(wrd: Scenario, tmo: Scenario, old: Scenario, new: bool) -> str:
    sync = [wrd, tmo, old] + ([NEW] if new else [])
    return feature("02", "Sync", [(["Sync"], sync), (["Safety"], [SAF])])


def f03(stage: int) -> str:
    """1: CSV v1 + import; 2: CSV v2 replaces v1, import marked dropped."""
    if stage == 1:
        return feature("03", "Export", [(None, [CSV1, IMP_V1, PDF, PRN, SHR])])
    return feature("03", "Export", [(None, [CSV2, IMP_V2, PDF, PRN, SHR])],
                   above={CSV2.tor: ["Note: replaces TOR-03-Csv0001, removed in v1.6 (header names changed)."]})


SPEC = """# Epic {id}: {name}

**Phase:** {phase}
**Status:** {status}
**Dependencies:** —

---

## Description

Builds {name}.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria for this epic.

| TOR ID | Feature File | Scenario Title |
|--------|--------------|----------------|
{rows}

## Key Components

- `app/{slug}.py`
"""

FILES = {"01": "01-notes.feature.md", "02": "02-sync.feature.md", "03": "03-export.feature.md"}
EPICS = {  # id: (slug, name, phase dir, scenarios)
    "aCore01": ("capture", "Capture", "phase-1-core", [CRT, FMT, PRE_V2, DEL]),
    "bSync02": ("sync", "Sync", "phase-1-core", [WRD_V1, TMO_V1, OLD_V1, SAF]),
    "cExp03": ("export", "Export", "phase-2-more", [CSV1, IMP_V1, PDF]),
    "dNext04": ("merge-and-csv", "Merge and CSV v2", "phase-2-more", [NEW, CSV2]),
    "eWip05": ("print", "Print", "phase-2-more", [PRN]),
    "fImp06": ("tags", "Tags", "phase-2-more", [TAG]),
    "hPau08": ("share", "Share", "phase-2-more", [SHR]),
}


def spec(epic: str, status: str = "Not Started") -> tuple[str, str]:
    slug, name, phase, scens = EPICS[epic]
    rows = "\n".join(f"| {s.tor} | `docs/requirements/{FILES[s.tor[4:6]]}` | {s.title} |" for s in scens)
    return (f"docs/implementation-plan/{phase}/epic-{epic}-{slug}.md",
            SPEC.format(id=epic, name=name, phase=phase, status=status, rows=rows, slug=slug))


def sidecar(epic: str, status: str, extra: str = "", reqs: str | None = None) -> tuple[str, str]:
    ids = reqs or ", ".join(s.tor for s in EPICS[epic][3])
    done = status in ("Implemented", "Complete")
    return (f"docs/implementation-plan/status/epic-{epic}.md",
            f"status: {status}\nimplemented: {'2026-05-01' if done else '—'}\n"
            f"completed: {'2026-05-01' if status == 'Complete' else '—'}\nhandoff: —\nrequirements: {ids}\n{extra}")


def commit(r: FixtureRepo, message: str, date: str, author: str = "Fixture Author") -> str:
    r.git("add", "-A")
    os.environ["GIT_AUTHOR_DATE"] = os.environ["GIT_COMMITTER_DATE"] = f"{date}T12:00:00"
    try:
        r.git("-c", f"user.name={author}", "commit", "-q", "-m", message)
    finally:
        del os.environ["GIT_AUTHOR_DATE"], os.environ["GIT_COMMITTER_DATE"]
    return r.git("rev-parse", "HEAD")


def branch(r: FixtureRepo, name: str, files: dict[str, str | None], message: str, date: str,
           author: str = "Fixture Author") -> None:
    """Commit `files` on a new branch off develop and merge it --no-ff (2.1's merge = approval)."""
    r.checkout("develop")
    r.checkout(name, create=True)
    for path, text in files.items():
        if text is None:
            r.remove(path)
        else:
            r.write(path, text)
    commit(r, message, date, author)
    r.checkout("develop")
    os.environ["GIT_AUTHOR_DATE"] = os.environ["GIT_COMMITTER_DATE"] = f"{date}T13:00:00"
    try:
        r.git("merge", "-q", "--no-ff", "-m", f"Merge branch '{name}' into develop", name)
    finally:
        del os.environ["GIT_AUTHOR_DATE"], os.environ["GIT_COMMITTER_DATE"]
    r.git("branch", "-q", "-d", name)


def build(dest: Path) -> FixtureRepo:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    r = FixtureRepo.open(dest)
    r.git("init", "-q", "-b", "develop")
    r.git("config", "user.name", "Fixture Author")
    r.git("config", "user.email", "fixture@example.com")
    r.git("config", "commit.gpgsign", "false")
    r.write("README.md", "# Notes\n")
    r.write("CLAUDE.md", "# CLAUDE.md — Notes\n\n## Project Overview\n\nA notes app (fixture).\n")
    r.write("docs/product-vision-planning/product-vision.md", "# Vision\n\n## §2 — Goals\n\nCapture fast.\n")
    commit(r, "init", "2026-01-05")

    req = "docs/requirements"
    branch(r, "docs/requirements-baseline", {
        f"{req}/01-notes.feature.md": f01(PRE_V1),
        f"{req}/01-notes.feature.tracing.json": tracing("01", "notes", [CRT, FMT, PRE_V1, DEL, TAG],
                                                         drift={"TOR-01-Del0001": "Delete a note"}),
        f"{req}/02-sync.feature.md": f02(WRD_V1, TMO_V1, OLD_V1, new=False),
        f"{req}/02-sync.feature.tracing.json": tracing("02", "sync", [WRD_V1, TMO_V1, OLD_V1, SAF]),
        f"{req}/03-export.feature.md": f03(1),
        f"{req}/03-export.feature.tracing.json": tracing("03", "export", [CSV1, IMP_V1, PDF, PRN, SHR]),
    }, "docs: requirements baseline", "2026-01-10", "Pat Planner")

    plan = {}
    for epic in ("aCore01", "bSync02", "cExp03", "eWip05", "fImp06", "hPau08"):
        path, text = spec(epic)
        plan[path] = text.replace("TOR-01-Pre0001 | `docs/requirements/01-notes.feature.md` | The app shall limit a note to 500",
                                  "TOR-01-Pre0001 | `docs/requirements/01-notes.feature.md` | The app shall limit a note to 100")
        plan.update([sidecar(epic, "Not Started")])
    branch(r, "docs/plan", plan, "docs: implementation plan", "2026-01-12", "Pat Planner")

    # aCore01: the limit is revised (REVISED note) before the epic is verified.
    branch(r, "docs/revise-limit", {f"{req}/01-notes.feature.md": f01(PRE_V2)},
           "docs: raise the note limit to 500", "2026-02-01", "Pat Planner")
    for epic, date in (("aCore01", "2026-02-20"), ("bSync02", "2026-03-10"), ("cExp03", "2026-04-02")):
        slug = EPICS[epic][0]
        files = dict([sidecar(epic, "Complete")])
        files[f"app/{slug}.py"] = f"# {epic}\n"
        files[f"tests/test_{slug}.py"] = "".join(
            f"def test_{s.tor[-7:].lower()}():  # {s.tor}\n    pass\n" for s in EPICS[epic][3]
            if s.tor not in ("TOR-02-Old0001", "TOR-03-Csv0001", "TOR-03-Imp0001"))
        branch(r, f"feature/epic-{epic}-{slug}", files, f"feat(epic-{epic}): {slug} complete", date, "Dev One")

    # v1.6: Old0001 superseded in prose (New0001 added), CSV v1 replaced by v2 (v1 deleted, no
    # record), import dropped in prose; Project B-style ad hoc key on cExp03; dNext04 planned.
    files = {f"{req}/02-sync.feature.md": f02(WRD_V1, TMO_V1, OLD_V2, new=True),
             f"{req}/02-sync.feature.tracing.json": tracing("02", "sync", [WRD_V1, TMO_V1, OLD_V1, SAF, NEW]),
             f"{req}/03-export.feature.md": f03(2),
             f"{req}/03-export.feature.tracing.json": tracing("03", "export", [CSV2, IMP_V1, PDF, PRN, SHR]),
             **dict([spec("dNext04"), sidecar("dNext04", "Not Started")])}
    path, text = sidecar("cExp03", "Complete", extra="superseded_by: TOR-03-Csv0002\n",
                         reqs="TOR-03-Csv0001, TOR-03-Imp0001, TOR-03-Pdf0001, " + DANGLING)
    files[path] = text
    branch(r, "docs/v1.6-changes", files, "docs: v1.6 requirement changes", "2026-05-15", "Pat Planner")

    # v1.8: Wrd0001 edited in place after bSync02 verified it (AMENDED note); a MODIFIED banner
    # marker and a stray TODO comment; the CHANGE-CONTROL pending note on Tmo0001.
    branch(r, "docs/v1.8-wording", {
        f"{req}/01-notes.feature.md": f01(PRE_V2, banner_marker=True),
        f"{req}/02-sync.feature.md": f02(WRD_V2, TMO_V2, OLD_V2, new=True),
    }, "docs: v1.8 wording cascade", "2026-07-01", "Pat Planner")

    # Open epics in every non-Complete status.
    for epic, status in (("eWip05", "In Progress"), ("fImp06", "Implemented"), ("hPau08", "Paused")):
        path, text = sidecar(epic, status)
        r.write(path, text)
        sp, st = spec(epic)
        r.write(sp, st.replace("**Status:** Not Started", f"**Status:** {status}"))
    commit(r, "chore: epic statuses", "2026-08-01", "Dev One")
    return r


def classification(scan: dict) -> dict:
    """The owner-approved plan for `migrate records`, keyed off `migrate scan --json` output."""
    def src(snippet: str) -> str:
        hits = [p["id"] for p in scan["prose"] if snippet in p["text"]]
        assert len(hits) == 1, (snippet, hits)
        return hits[0]
    key = next(k["source"] for k in scan["sidecar_keys"] if k["key"] == "superseded_by")
    return {
        "rationale": [{"tor": "TOR-01-Crt0001", "text": "Titles are optional: quick capture matters more than structure.",
                       "sources": [src("titles are optional")]}],
        "history": [
            {"tors": ["TOR-01-Pre0001"], "title": "Note limit raised from 100 to 500 characters (v1.2)",
             "reason": "Support tickets showed 100 characters cut notes off.", "sources": [src("REVISED v1.2")]},
            {"tors": ["TOR-02-Wrd0001"], "title": "Sync interval tightened to 30 seconds (v1.8)",
             "reason": "Ops review asked for faster sync.", "sources": [src("AMENDED v1.8")]}],
        "supersede": [
            {"tors": ["TOR-02-Old0001"], "successors": ["TOR-02-New0001"],
             "title": "Conflicts resolve last-writer-wins instead of asking the user",
             "reason": "v1.6: asking on every conflict confused users.",
             "keywords": ["conflict", "last-writer-wins"], "sources": [src("SUPERSEDED by TOR-02-New0001")]},
            {"tors": ["TOR-03-Csv0001"], "successors": ["TOR-03-Csv0002"],
             "title": "CSV export header names changed", "reason": "v1.6 renamed the CSV columns.",
             "keywords": ["CSV", "export", "header"], "sources": [src("replaces TOR-03-Csv0001"), key]}],
        "retire": [{"tors": ["TOR-03-Imp0001"], "removal": "none", "title": "CSV import dropped from scope",
                    "reason": "v1.6 dropped import; it was never built beyond a stub.",
                    "keywords": ["import", "CSV"], "sources": [src("REVISED v1.6")]}],
        "pending": [{"tors": ["TOR-02-Tmo0001"], "title": "Sync timeout may rise from 10 to 30 seconds",
                     "reason": "Ops asked to raise the timeout; not approved yet.",
                     "keywords": ["timeout", "sync"], "sources": [src("CHANGE-CONTROL pending")]}],
        "drop": [src("MODIFIED v1.8"), src("TODO: tighten")],
    }


if __name__ == "__main__":
    print(build(Path(sys.argv[1]).resolve()).root)
