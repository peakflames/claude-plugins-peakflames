#!/usr/bin/env python3
"""Redacting acceptance runner for the peak-workflow 3.0 requirements-lifecycle upgrade.

A contributor runs it on a real project they cannot share. It prints counts, requirement and epic
IDs, finding letters, record kinds, and timings — never requirement text, titles, notes, record
reasons, file contents, or file names. See docs/uat/lifecycle-acceptance.md.

    python3.11 tests/peak-workflow/acceptance/run.py baseline <project> [--base BRANCH] [--json]
    python3.11 tests/peak-workflow/acceptance/run.py after <upgraded-copy> [--before REV] [--base BRANCH] [--json]

`baseline` never touches <project>: it clones it to a scratch folder, reads it there, and seeds
fingerprints in the clone to preview what the upgrade will surface. `after` reads a copy that
`/peak-workflow:upgrade` has already brought to format 2 and changes nothing.

Exit codes: 0 report printed; 2 usage or setup error; 4 the redaction check found protected text in
the report (nothing is printed).
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HELPER = Path(__file__).resolve().parents[3] / "plugins" / "peak-workflow" / "scripts" / "tor_lifecycle.py"
TOR = re.compile(r"TOR-\d{2}-[A-Za-z0-9]{7}")
LETTERS = "ABCDEF"


class Setup(Exception):
    pass


def sh(root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run(list(args), cwd=root, capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise Setup(f"{args[0]} {args[1] if len(args) > 1 else ''} failed (exit {proc.returncode})")
    return proc


def helper(root: Path, timings: dict, label: str, *args: str) -> subprocess.CompletedProcess:
    start = time.perf_counter()
    proc = subprocess.run([sys.executable, str(HELPER), *args], cwd=root, capture_output=True, text=True)
    timings[label] = round(time.perf_counter() - start, 2)
    return proc


def load(proc: subprocess.CompletedProcess):
    if proc.returncode not in (0, 1):
        raise Setup(f"helper exited {proc.returncode} ({len(proc.stderr.splitlines())} error line(s); "
                    "run the command in the project to read them)")
    return json.loads(proc.stdout)


def _strings(value) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [s for v in value.values() for s in _strings(v)]
    if isinstance(value, list):
        return [s for v in value for s in _strings(v)]
    return []


def protected_text(root: Path) -> set[str]:
    """Strings that must never reach the report: requirement titles and steps, notes, tracing
    paraphrases and rationale, and record titles, reasons, and texts — each line of at least two
    words and 12 characters, with TOR IDs and Gherkin keywords removed."""
    import tomllib
    raw: list[str] = []
    req = root / "docs" / "requirements"
    for path in req.glob("*.feature.md"):
        raw += path.read_text(encoding="utf-8", errors="replace").splitlines()
    for path in req.glob("*.tracing.json"):
        try:
            raw += _strings(json.loads(path.read_text(encoding="utf-8")).get("requirements", []))
        except (json.JSONDecodeError, AttributeError):
            pass
    for path in (req / "changes").glob("*.toml"):
        try:
            data = tomllib.loads(path.read_text(encoding="utf-8"))
        except tomllib.TOMLDecodeError:
            continue
        raw += _strings({k: data.get(k) for k in ("title", "reason", "equivalence", "migration_source", "keywords")})
        raw += _strings([c.get("text") for c in data.get("changes", []) if isinstance(c, dict)])
    out: set[str] = set()
    for text in raw:
        for line in text.splitlines():
            line = TOR.sub("", line)
            line = re.sub(r"^\s*(#+|>|\*\*|Scenario:\s*\[\]|Feature:|Given|When|Then|And|But)\s*", "", line).strip()
            line = line.strip(" #|`\"'[]:{},=-*")
            if len(line) >= 12 and " " in line:
                out.add(line)
    return out


def findings_summary(report: dict) -> dict:
    out = {"counts": report["counts"], "ids": {}}
    for letter in LETTERS:
        ids = sorted({f.get("tor") or f.get("epic") or "—" for f in report["findings"] if f["letter"] == letter})
        if ids:
            out["ids"][letter] = ids
    out["f_kinds"] = sorted({f.get("kind", "") for f in report["findings"] if f["letter"] == "F"})
    return out


def states_summary(states: dict) -> dict:
    rows = states["requirements"]
    return {"live": states["summary"]["live"], "verified": states["summary"]["verified"],
            "by_state": states["summary"]["by_state"],
            "changed_since_verified": sorted(f"{r['tor']} ({r.get('epic') or '—'})" for r in rows
                                             if r["state"] == "Changed since verified"),
            "disputed": sorted(r["tor"] for r in rows if r["state"] == "Disputed"),
            "verification_failed": sorted(r["tor"] for r in rows if r["state"] == "Verification failed")}


def trunk_of(root: Path, base: str | None) -> str:
    for ref in ([base] if base else ["develop", "main", "master"]):
        if sh(root, "git", "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}", check=False).returncode == 0:
            return ref
    raise Setup("no develop, main, or master branch (pass --base)")


def baseline(project: Path, base: str | None) -> dict:
    tmp = Path(tempfile.mkdtemp(prefix="pw-acceptance-"))
    try:
        clone = tmp / "clone"
        sh(tmp, "git", "clone", "--quiet", "--no-hardlinks", str(project), str(clone))
        for name in ("develop", "main", "master"):
            if sh(clone, "git", "rev-parse", "--verify", "--quiet", f"origin/{name}", check=False).returncode == 0 and \
                    sh(clone, "git", "rev-parse", "--verify", "--quiet", name, check=False).returncode != 0:
                sh(clone, "git", "branch", "--quiet", name, f"origin/{name}")
        trunk = trunk_of(clone, base)
        sh(clone, "git", "checkout", "--quiet", trunk)
        sh(clone, "git", "config", "user.name", "Acceptance Runner")
        sh(clone, "git", "config", "user.email", "acceptance@example.invalid")
        t: dict = {}
        report: dict = {"mode": "baseline", "base": trunk,
                        "commits": int(sh(clone, "git", "rev-list", "--count", "HEAD").stdout)}
        fmt = helper(clone, t, "format", "format")
        report["format"] = fmt.stdout.splitlines()[0].removeprefix("verdict: ") if fmt.stdout else f"exit {fmt.returncode}"
        fp = helper(clone, t, "fingerprint", "fingerprint")
        report["requirements"] = len(fp.stdout.splitlines()) if fp.returncode == 0 else None
        scan = helper(clone, t, "migrate scan", "migrate", "scan", "--json", "--base", trunk)
        if scan.returncode == 2:
            report["prerequisites"] = {"ok": False, "problems": len(scan.stderr.splitlines()),
                                       "ids": sorted(set(TOR.findall(scan.stderr)))}
            report["timings"] = t
            return report
        data = load(scan)
        report["prerequisites"] = {"ok": True}
        kinds: dict[str, int] = {}
        for p in data["prose"]:
            kinds[p["kind"]] = kinds.get(p["kind"], 0) + 1
        report["inventory"] = {**data["counts"], "prose_kinds": kinds,
                               "prose_files": len({p["file"] for p in data["prose"]}),
                               "sidecar_keys_by_key": sorted({k["key"] for k in data["sidecar_keys"]}),
                               "edited": sorted({e["tor"] for e in data["edits"]}),
                               "removed": [r["tor"] for r in data["removed"]]}
        report["check_before"] = findings_summary(load(helper(clone, t, "check (before)", "check", "--json")))
        seed = helper(clone, t, "seed --write", "seed", "--write", "--json")
        rows = load(seed)
        report["seed"] = {"rows": len(rows), "fingerprinted": sum(1 for r in rows if r["fingerprint"]),
                          "legacy": sum(1 for r in rows if not r["fingerprint"]),
                          "complete_epics": len({r["epic"] for r in rows})}
        report["states_after_seed"] = states_summary(load(helper(clone, t, "states", "states", "--json")))
        report["check_after_seed"] = findings_summary(load(helper(clone, t, "check", "check", "--json")))
        report["timings"] = t
        report["_protected"] = protected_text(project)
        return report
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def after(copy: Path, before: str | None, base: str | None) -> dict:
    t: dict = {}
    trunk = trunk_of(copy, base)
    report: dict = {"mode": "after", "base": trunk}
    fmt = helper(copy, t, "format", "format")
    report["format"] = fmt.stdout.splitlines()[0].removeprefix("verdict: ") if fmt.stdout else f"exit {fmt.returncode}"
    if before is None:
        firsts = sh(copy, "git", "log", "--reverse", "--format=%H", "--grep=^chore(upgrade): step 0001",
                    "--grep=^chore(upgrade): step 0002", "HEAD").stdout.split()
        if not firsts:
            raise Setup("no chore(upgrade) commits on this branch's history (pass --before REV)")
        before = firsts[0] + "^"
    report["upgrade_commits"] = [s for s in sh(copy, "git", "log", "--reverse", "--format=%s",
                                                f"{before}..HEAD").stdout.splitlines()
                                 if s.startswith("chore(upgrade): step ")]
    scan = helper(copy, t, "migrate scan", "migrate", "scan", "--json", "--base", trunk)
    report["rerun_pending"] = load(scan)["counts"] if scan.returncode == 1 else (
        {} if scan.returncode == 0 else f"exit {scan.returncode}")
    old = dict(line.split("\t") for line in helper(copy, t, "fingerprint --rev", "fingerprint", "--rev",
                                                    before).stdout.splitlines() if line)
    now = dict(line.split("\t") for line in helper(copy, t, "fingerprint", "fingerprint").stdout.splitlines() if line)
    report["fingerprints"] = {"before": len(old), "after": len(now),
                              "identical": sum(1 for k, v in now.items() if old.get(k) == v),
                              "changed": sorted(k for k, v in now.items() if k in old and old[k] != v),
                              "new": sorted(set(now) - set(old)), "removed": sorted(set(old) - set(now))}
    val = helper(copy, t, "validate", "validate")
    rows = [ln.split("\t") for ln in val.stdout.splitlines() if ln]
    report["validate"] = {"exit": val.returncode, "ok": sum(1 for r in rows if r[-1] == "ok"),
                          "problems": sum(1 for r in rows if r[-1] != "ok")}
    kinds: dict[str, int] = {}
    leftover = 0
    for path in sorted((copy / "docs/requirements/changes").glob("*.toml")):
        text = path.read_text(encoding="utf-8")
        m = re.search(r'^kind = "(\w+)"', text, re.M)
        via = re.search(r'^approved_via = "([\w-]+)"', text, re.M)
        key = f"{m.group(1) if m else '?'} ({via.group(1) if via else '?'})"
        kinds[key] = kinds.get(key, 0) + 1
        leftover += "migration_source" in text
    report["records"] = {"by_kind": dict(sorted(kinds.items())), "with_migration_source": leftover}
    report["states"] = states_summary(load(helper(copy, t, "states", "states", "--json")))
    report["check"] = findings_summary(load(helper(copy, t, "check", "check", "--json")))
    report["timings"] = t
    report["_protected"] = protected_text(copy)
    return report


def render(report: dict) -> str:
    lines = []

    def emit(key, value, indent=0):
        pad = "  " * indent
        if isinstance(value, dict):
            lines.append(f"{pad}{key}:")
            for k, v in value.items():
                emit(k, v, indent + 1)
        elif isinstance(value, list):
            lines.append(f"{pad}{key}: {', '.join(map(str, value)) if value else '—'}")
        else:
            lines.append(f"{pad}{key}: {value}")

    for key, value in report.items():
        emit(key, value)
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("mode", choices=("baseline", "after"))
    ap.add_argument("project", type=Path)
    ap.add_argument("--base", help="base branch (default: develop, main, master)")
    ap.add_argument("--before", help="after: the commit before the upgrade (default: parent of the first step commit)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    if sys.version_info < (3, 11):
        print("Python 3.11 or newer is required.", file=sys.stderr)
        return 2
    root = args.project.resolve()
    if not (root / ".git").exists():
        print(f"{root}: not a git repository", file=sys.stderr)
        return 2
    try:
        report = baseline(root, args.base) if args.mode == "baseline" else after(root, args.before, args.base)
    except Setup as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    protected = report.pop("_protected", set())
    text = json.dumps(report, indent=2) + "\n" if args.json else render(report)
    leaks = [p for p in protected if p in text]
    if leaks:
        print(f"redaction check failed: {len(leaks)} protected string(s) would appear in the report; "
              "nothing was printed. Please report this to the maintainer (without the output).", file=sys.stderr)
        return 4
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
