"""Build the Plan 9 release-gate dry-run fixtures.

    python3.11 tests/peak-workflow/dryrun/plan9_release.py greenfield <dest>   empty git repo (develop)
    python3.11 tests/peak-workflow/dryrun/plan9_release.py brownfield <dest>   Plan 8 fixture, format 0
    python3.11 tests/peak-workflow/dryrun/plan9_release.py upgraded <dest>     the same, upgraded to
        format 2 the way the runner does it (steps 0001 + 0002, branch merged --no-ff into develop),
        plus a CLAUDE.md with quality gates so start-epic / wrapup-epic / quick-fix can run

dest must be outside the repo, or under tmp/.
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
from fixtures import FixtureRepo  # noqa: E402
import plan8_project_a as pa  # noqa: E402

CLAUDE_MD = """# CLAUDE.md — Notes

## Project Overview

A notes app (fixture): quick capture, sync between devices, CSV export.

**Project type:** Library

## Tech Stack

- Python 3.11, standard library only; tests with `unittest`

## Verification & Quality Gates

- **Build:** none
- **Tests:** `python3 -m unittest discover -s tests -v`
- **Lint:** none
- **Test directories:** `tests/`

## Git Workflow

- Base branch `develop`; release line `main`. Solo mode: local `--no-ff` merges.
"""


def greenfield(dest: Path) -> FixtureRepo:
    dest.mkdir(parents=True, exist_ok=False)
    r = FixtureRepo.open(dest)
    r.git("init", "-q", "-b", "develop")
    r.git("config", "user.name", "Fixture Author")
    r.git("config", "user.email", "fixture@example.com")
    r.git("config", "commit.gpgsign", "false")
    return r


def upgraded(dest: Path) -> FixtureRepo:
    from test_migrate import run_step_0002  # noqa: PLC0415

    r = pa.build(dest)
    r.checkout("docs/upgrade-format-2", create=True)
    assert r.cli("provenance", "--write").returncode == 0
    r.cli("format", "--set", "1")
    r.commit("chore(upgrade): step 0001 epic-provenance")
    run_step_0002(r)
    r.checkout("develop")
    r.git("merge", "-q", "--no-ff", "-m", "Merge branch 'docs/upgrade-format-2' into develop",
          "docs/upgrade-format-2")
    r.git("branch", "-q", "-d", "docs/upgrade-format-2")
    r.write("CLAUDE.md", CLAUDE_MD)
    r.write("tests/__init__.py", "")
    r.write(".gitignore", "__pycache__/\n")
    r.write("docs/architecture.md", "# Architecture\n\nOne Python package, `app/`; tests in `tests/`.\n")
    r.write("docs/design-notes.md", "# Design Notes\n")
    for test in sorted((r.root / "tests").glob("test_*.py")):  # bare functions → TestCase methods
        lines = test.read_text(encoding="utf-8").splitlines()
        body = ["    " + line if line else line for line in lines]
        test.write_text("import unittest\n\n\nclass Tests(unittest.TestCase):\n"
                        + "\n".join(body).replace("():", "(self):") + "\n", encoding="utf-8")
    r.commit("chore: quality gates for the dry-run")
    return r


if __name__ == "__main__":
    mode, dest = sys.argv[1], Path(sys.argv[2]).resolve()
    build = {"greenfield": greenfield, "brownfield": pa.build, "upgraded": upgraded}[mode]
    print(build(dest).root)
