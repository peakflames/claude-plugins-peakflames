#!/usr/bin/env python3
"""tor_lifecycle.py — deterministic requirements-lifecycle mechanics for peak-workflow.

Skills call this through the `tor-lifecycle` wrapper, never directly:

    sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" <command> [args]

It is the only implementation of the fingerprint normalization rules (stated in
capture-requirements). Standard library only; Python 3.11+.

Exit codes: 0 ok, 1 findings (e.g. an unknown ID), 2 usage or data error, 3 interpreter.
"""
from __future__ import annotations

import sys

if sys.version_info < (3, 11):  # keep this file parseable by older interpreters
    sys.stderr.write(
        "tor_lifecycle.py needs Python 3.11 or newer; this is Python %d.%d.\n"
        "Run it through the tor-lifecycle wrapper, which finds a suitable interpreter.\n"
        % sys.version_info[:2]
    )
    sys.exit(3)

import argparse
import datetime as dt
import hashlib
import os
import re
import subprocess
import tomllib
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

# The project format this plugin version reads and writes (docs/.peak-workflow.toml `format`).
PLUGIN_FORMAT = 2

EXIT_OK, EXIT_FINDINGS, EXIT_DATA, EXIT_INTERPRETER = 0, 1, 2, 3

REQ_DIR = "docs/requirements"
CHANGES_DIR = "docs/requirements/changes"
STATUS_DIR = "docs/implementation-plan/status"
STAMP_PATH = "docs/.peak-workflow.toml"
FEATURE_GLOB = "*.feature.md"
DEFAULT_DISPUTED_DAYS = 30

TOR_RE = re.compile(r"^TOR-\d{2}-[A-Za-z0-9]{7}$")
TOR_ANY = re.compile(r"TOR-\d{2}-[A-Za-z0-9]{7}")
CR_RE = re.compile(r"^CR-[A-Za-z0-9]{7}$")
FP_RE = re.compile(r"^[0-9a-f]{12}$")
RECORD_NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]{7})\.toml$")

# Fingerprint rules — see #20 "Fingerprint definition". Do not change without an upgrade step:
# every saved `verified:` fingerprint depends on them.
SCEN = re.compile(r"^\s*Scenario:\s*\[(TOR-\d{2}-[A-Za-z0-9]{7})\]\s*(.*)$")
FEAT = re.compile(r"^\s*Feature:")
VERIF = re.compile(r"^\s*#\s*Verification:")

# Below this many files the process pool costs more than it saves.
POOL_MIN_FILES = 4


class DataError(Exception):
    """Project data that cannot be read (exit 2). `problems` lists one message per defect."""

    def __init__(self, problems: list[str] | str):
        self.problems = [problems] if isinstance(problems, str) else list(problems)
        super().__init__("\n".join(self.problems))


# --------------------------------------------------------------------------------------------
# Fingerprints and titles
# --------------------------------------------------------------------------------------------

def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _digest(body: list[str]) -> str:
    return hashlib.sha256(normalize(" ".join(body)).encode()).hexdigest()[:12]


def parse_scenarios(text: str) -> list[tuple[str, str, str]]:
    """Return (tor, title, fingerprint) for every Scenario in a feature file's text.

    Body = the title after the `[TOR-…]` prefix, then every line up to the next `Scenario:` or
    `Feature:` line, minus blank lines and comment lines (the `# Verification:` tag is kept).
    """
    out: list[tuple[str, str, str]] = []
    tor: str | None = None
    title = ""
    body: list[str] = []

    def flush() -> None:
        if tor:
            out.append((tor, title, _digest(body)))

    # Split on newlines only (as universal-newline file reading does), not str.splitlines(),
    # which also breaks on form feeds and U+2028 and would change the hash.
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if m := SCEN.match(line):
            flush()
            tor, title, body = m.group(1), m.group(2).strip(), [m.group(2)]
        elif FEAT.match(line):
            flush()
            tor, title, body = None, "", []
        elif tor and line.strip() and (VERIF.match(line) or not line.lstrip().startswith("#")):
            body.append(line.strip())
    flush()
    return out


def fingerprint_text(text: str) -> list[tuple[str, str]]:
    return [(tor, fp) for tor, _title, fp in parse_scenarios(text)]


def _parse_file(path: str) -> list[tuple[str, str, str]]:
    return parse_scenarios(Path(path).read_text(encoding="utf-8"))


def parse_files(paths: list[str]) -> list[list[tuple[str, str, str]]]:
    """Parse feature files in the working tree, one process-pool task per file."""
    missing = [p for p in paths if not Path(p).is_file()]
    if missing:
        raise DataError([f"{p}: no such feature file" for p in missing])
    if len(paths) < POOL_MIN_FILES:
        return [_parse_file(p) for p in paths]
    with ProcessPoolExecutor(max_workers=min(len(paths), os.cpu_count() or 1)) as pool:
        return list(pool.map(_parse_file, paths))


def _run_git(root: Path, args: list[str]) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True,
                              encoding="utf-8")
    except FileNotFoundError:
        raise DataError("git is not installed or not on PATH") from None


def git(root: Path, *args: str, check: bool = True) -> str:
    proc = _run_git(root, list(args))
    if check and proc.returncode != 0:
        raise DataError(f"git {' '.join(args)}: {proc.stderr.strip()}")
    return proc.stdout


def show_at(root: Path, rev: str, relpath: str) -> str | None:
    """File text at `rev`, or None when the file does not exist there."""
    proc = _run_git(root, ["show", f"{rev}:{relpath}"])
    return proc.stdout if proc.returncode == 0 else None


def feature_files_at(root: Path, rev: str) -> list[str]:
    names = git(root, "ls-tree", "--name-only", rev, f"{REQ_DIR}/").splitlines()
    return sorted(n for n in names if n.endswith(".feature.md"))


def parse_files_at(root: Path, rev: str, relpaths: list[str]) -> list[list[tuple[str, str, str]]]:
    """Parse feature files as they were at `rev`; git reads run in a thread pool."""
    git(root, "rev-parse", "--verify", "--quiet", f"{rev}^{{commit}}")
    with ThreadPoolExecutor(max_workers=min(max(len(relpaths), 1), 16)) as pool:
        texts = list(pool.map(lambda p: show_at(root, rev, p), relpaths))
    missing = [p for p, t in zip(relpaths, texts) if t is None]
    if missing:
        raise DataError([f"{p}: not present at {rev}" for p in missing])
    return [parse_scenarios(t) for t in texts]


def feature_files(root: Path) -> list[str]:
    return sorted(str(p) for p in (root / REQ_DIR).glob(FEATURE_GLOB))


@dataclass
class LiveRequirement:
    tor: str
    title: str
    fingerprint: str
    feature_file: str  # file name only, as records cite it


def live_requirements(root: Path) -> dict[str, LiveRequirement]:
    """Every live requirement in the working tree. Duplicate IDs are a data error."""
    paths = feature_files(root)
    live: dict[str, LiveRequirement] = {}
    dupes: list[str] = []
    for path, scenarios in zip(paths, parse_files(paths)):
        for tor, title, fp in scenarios:
            if tor in live:
                dupes.append(f"{tor}: defined in both {live[tor].feature_file} and {Path(path).name}")
            live[tor] = LiveRequirement(tor, title, fp, Path(path).name)
    if dupes:
        raise DataError(dupes)
    return live


# --------------------------------------------------------------------------------------------
# Project stamp
# --------------------------------------------------------------------------------------------

@dataclass
class Stamp:
    format: int = 0
    disputed_threshold_days: int = DEFAULT_DISPUTED_DAYS
    present: bool = False


def load_stamp(root: Path) -> Stamp:
    """Read docs/.peak-workflow.toml. A missing file is format 0 (any peak-workflow ≤ 2.1)."""
    path = root / STAMP_PATH
    if not path.is_file():
        return Stamp()
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise DataError(f"{STAMP_PATH}: not valid TOML ({exc})") from None
    problems = []
    fmt = data.get("format")
    if not _is_int(fmt) or fmt < 0:
        problems.append(f"{STAMP_PATH}: `format` must be a whole number ≥ 0")
    lifecycle = data.get("lifecycle", {})
    days = lifecycle.get("disputed_threshold_days", DEFAULT_DISPUTED_DAYS) if isinstance(lifecycle, dict) else None
    if not isinstance(lifecycle, dict):
        problems.append(f"{STAMP_PATH}: `[lifecycle]` must be a table")
    elif not _is_int(days) or days < 0:
        problems.append(f"{STAMP_PATH}: `[lifecycle] disputed_threshold_days` must be a whole number ≥ 0")
    if problems:
        raise DataError(problems)
    return Stamp(format=fmt, disputed_threshold_days=days, present=True)


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


# --------------------------------------------------------------------------------------------
# Change Records
# --------------------------------------------------------------------------------------------

KINDS = ("reword", "supersede", "retire", "pending")
APPROVED_VIA = ("docs-branch", "epic-branch", "wrapup", "quick-fix", "migration")
EVIDENCE_RESULTS = ("pass", "fail", "historical")


@dataclass
class Record:
    id: str
    date: dt.date
    kind: str
    path: str
    data: dict = field(repr=False)

    @property
    def changes(self) -> list[dict]:
        return self.data["changes"]

    @property
    def tors(self) -> list[str]:
        return [c["tor"] for c in self.changes]


def load_records(root: Path) -> list[Record]:
    """Load and validate every docs/requirements/changes/*.toml, sorted by (date, id).

    All defects across all files are collected into one DataError.
    """
    folder = root / CHANGES_DIR
    if not folder.is_dir():
        return []
    records, problems = [], []
    for path in sorted(folder.glob("*.toml")):
        rel = f"{CHANGES_DIR}/{path.name}"
        try:
            data = tomllib.loads(path.read_text(encoding="utf-8"))
        except tomllib.TOMLDecodeError as exc:
            problems.append(f"{rel}: not valid TOML ({exc})")
            continue
        found = validate_record(path.name, data)
        if found:
            problems.extend(f"{rel}: {p}" for p in found)
        else:
            records.append(Record(data["id"], data["date"], data["kind"], rel, data))
    ids: dict[str, str] = {}
    for r in records:
        if r.id in ids:
            problems.append(f"{r.path}: record ID {r.id} is also used by {ids[r.id]}")
        ids[r.id] = r.path
    if problems:
        raise DataError(problems)
    return sorted(records, key=lambda r: (r.date, r.id))


def validate_record(filename: str, data: dict) -> list[str]:
    """Schema check for one Change Record. Returns plain-English problems (empty = valid)."""
    p: list[str] = []

    def need_str(table: dict, key: str, where: str = "") -> None:
        value = table.get(key)
        if not isinstance(value, str) or not value.strip():
            p.append(f"{where}`{key}` is required (text)")

    def need_str_list(table: dict, key: str, where: str = "", allow_empty: bool = False,
                      pattern: re.Pattern | None = None) -> None:
        value = table.get(key)
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            p.append(f"{where}`{key}` is required (a list of text)")
        elif not value and not allow_empty:
            p.append(f"{where}`{key}` must not be empty")
        elif pattern:
            bad = [v for v in value if not pattern.match(v)]
            if bad:
                p.append(f"{where}`{key}` has malformed IDs: {', '.join(bad)}")

    def need_fp(table: dict, key: str, where: str) -> None:
        value = table.get(key)
        if not isinstance(value, str) or not FP_RE.match(value):
            p.append(f"{where}`{key}` must be a 12-character lowercase hex fingerprint")

    m = RECORD_NAME.match(filename)
    if not m:
        p.append("file name must be <YYYY-MM-DD>-<7 alphanumerics>.toml")

    rid = data.get("id")
    if not isinstance(rid, str) or not CR_RE.match(rid):
        p.append("`id` must be CR-<7 alphanumerics>")
    elif m and rid != f"CR-{m.group(2)}":
        p.append(f"`id` {rid} does not match the file name suffix {m.group(2)}")

    date = data.get("date")
    if not isinstance(date, dt.date) or isinstance(date, dt.datetime):
        p.append("`date` is required (a bare TOML date, e.g. 2026-10-21)")
    elif m and date.isoformat() != m.group(1):
        p.append(f"`date` {date.isoformat()} does not match the file name date {m.group(1)}")

    kind = data.get("kind")
    if kind not in KINDS:
        p.append(f"`kind` must be one of: {', '.join(KINDS)}")
    need_str(data, "title")
    need_str(data, "reason")
    if data.get("approved_via") not in APPROVED_VIA:
        p.append(f"`approved_via` must be one of: {', '.join(APPROVED_VIA)}")
    need_str(data, "approved_by")
    need_str_list(data, "refs", allow_empty=True)

    if kind in ("supersede", "retire", "pending"):
        need_str_list(data, "keywords")
    if kind == "reword":
        need_str(data, "equivalence")
        ev = data.get("evidence")
        if not isinstance(ev, dict):
            p.append("a reword needs an `[evidence]` table (commit, result, tests)")
        else:
            need_str(ev, "commit", "[evidence] ")
            if ev.get("result") not in EVIDENCE_RESULTS:
                p.append(f"[evidence] `result` must be one of: {', '.join(EVIDENCE_RESULTS)}")
            if ev.get("result") != "historical":
                need_str_list(ev, "tests", "[evidence] ")
    if kind == "retire" and data.get("removal") not in ("code", "none"):
        p.append('a retire needs `removal = "code"` (still in code) or `removal = "none"` (already gone)')
    if kind == "pending":
        need_str(data, "owner")
        if "tracker" in data and not isinstance(data["tracker"], str):
            p.append("`tracker` must be text when present")

    changes = data.get("changes")
    if not isinstance(changes, list) or not changes or not all(isinstance(c, dict) for c in changes):
        p.append("at least one `[[changes]]` table is required")
        return p
    seen = set()
    for i, ch in enumerate(changes, 1):
        where = f"[[changes]] #{i} "
        tor = ch.get("tor")
        if not isinstance(tor, str) or not TOR_RE.match(tor):
            p.append(f"{where}`tor` must be a TOR-NN-XXXXXXX ID")
        elif tor in seen:
            p.append(f"{where}names {tor} twice in one record")
        else:
            seen.add(tor)
        if kind == "reword":
            need_fp(ch, "from", where)
            need_fp(ch, "to", where)
        elif kind in ("supersede", "retire", "pending"):
            need_str(ch, "feature_file", where)
            need_fp(ch, "fingerprint", where)
        if kind == "supersede":
            need_str_list(ch, "successors", where, pattern=TOR_RE)
            need_str(ch, "text", where)
        if kind == "retire":
            need_str(ch, "text", where)
            if "traced_to" in ch:
                need_str_list(ch, "traced_to", where, allow_empty=True)
    return p


# --------------------------------------------------------------------------------------------
# Epic status sidecars
# --------------------------------------------------------------------------------------------

@dataclass
class Sidecar:
    epic: str
    status: str = ""
    owner: str = "—"
    implemented: str = "—"
    completed: str = "—"
    handoff: str = "—"
    requirements: list[str] = field(default_factory=list)
    verified: dict[str, str] = field(default_factory=dict)          # TOR -> fingerprint
    unverified: dict[str, str] = field(default_factory=dict)        # TOR -> "YYYY-MM-DD reason"
    waived: dict[str, str] = field(default_factory=dict)            # TOR -> successor epic
    retires: list[str] = field(default_factory=list)                # CR IDs
    reverified: str = "—"
    extra: dict[str, str] = field(default_factory=dict)             # unknown keys, verbatim


SIDECAR_SCALARS = ("status", "owner", "implemented", "completed", "handoff", "reverified")
SIDECAR_BLOCKS = ("verified", "unverified")
KEY_LINE = re.compile(r"^([A-Za-z_][\w-]*):\s*(.*?)\s*$")
BLOCK_LINE = re.compile(r"^\s+(TOR-\d{2}-[A-Za-z0-9]{7}):\s*(.*?)\s*$")
WAIVED_ITEM = re.compile(r"^(TOR-\d{2}-[A-Za-z0-9]{7})\s*(?:→|->)\s*(\S+)$")


def _id_list(value: str) -> list[str]:
    value = value.strip()
    if value in ("", "—", "-"):
        return []
    return [v.strip() for v in value.split(",") if v.strip()]


def parse_sidecar(epic: str, text: str, where: str = "") -> Sidecar:
    """Parse one status sidecar. Raises DataError naming every malformed line."""
    sc = Sidecar(epic=epic)
    problems: list[str] = []
    block: str | None = None
    prefix = f"{where}: " if where else ""
    for n, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        if line[0].isspace():
            m = BLOCK_LINE.match(line)
            if block is None or not m:
                problems.append(f"{prefix}line {n}: unexpected indented line {line.strip()!r}")
                continue
            tor, value = m.groups()
            if block == "verified" and not FP_RE.match(value):
                problems.append(f"{prefix}line {n}: {tor} needs a 12-character fingerprint, got {value!r}")
                continue
            getattr(sc, block)[tor] = value
            continue
        block = None
        m = KEY_LINE.match(line)
        if not m:
            problems.append(f"{prefix}line {n}: expected `key: value`, got {line!r}")
            continue
        key, value = m.groups()
        if key in SIDECAR_BLOCKS:
            if value:
                problems.append(f"{prefix}line {n}: `{key}:` takes one indented `TOR-…: …` line per requirement")
            block = key
        elif key in SIDECAR_SCALARS:
            setattr(sc, key, value)
        elif key == "requirements":
            sc.requirements = _id_list(value)
            bad = [t for t in sc.requirements if not TOR_RE.match(t)]
            if bad:
                problems.append(f"{prefix}line {n}: `requirements:` has non-TOR entries: {', '.join(bad)}")
        elif key == "retires":
            sc.retires = _id_list(value)
            bad = [c for c in sc.retires if not CR_RE.match(c)]
            if bad:
                problems.append(f"{prefix}line {n}: `retires:` has non-record entries: {', '.join(bad)}")
        elif key == "waived":
            for item in _id_list(value):
                wm = WAIVED_ITEM.match(item)
                if wm:
                    sc.waived[wm.group(1)] = wm.group(2)
                else:
                    problems.append(f"{prefix}line {n}: `waived:` entry {item!r} is not `TOR-… → <epic>`")
        else:
            sc.extra[key] = value
    if problems:
        raise DataError(problems)
    return sc


def load_sidecars(root: Path) -> dict[str, Sidecar]:
    folder = root / STATUS_DIR
    if not folder.is_dir():
        return {}
    sidecars, problems = {}, []
    for path in sorted(folder.glob("epic-*.md")):
        epic = path.name[len("epic-"):-len(".md")]
        try:
            sidecars[epic] = parse_sidecar(epic, path.read_text(encoding="utf-8"),
                                           f"{STATUS_DIR}/{path.name}")
        except DataError as exc:
            problems.extend(exc.problems)
    if problems:
        raise DataError(problems)
    return sidecars


# --------------------------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------------------------

def find_root(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).resolve()
    try:
        proc = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True)
    except FileNotFoundError:  # no git: commands that need history report it when they run
        return Path.cwd().resolve()
    return Path(proc.stdout.strip()).resolve() if proc.returncode == 0 else Path.cwd().resolve()


def cmd_fingerprint(args: argparse.Namespace, root: Path) -> int:
    if args.rev:
        rels = [_repo_relative(root, f) for f in args.files] or feature_files_at(root, args.rev)
        results = parse_files_at(root, args.rev, rels)
    else:
        results = parse_files(args.files or feature_files(root))
    for scenarios in results:
        for tor, _title, fp in scenarios:
            print(f"{tor}\t{fp}")
    return EXIT_OK


def _repo_relative(root: Path, path: str) -> str:
    rel = os.path.relpath(Path(path).resolve(), root)
    if rel.startswith(".."):
        raise DataError(f"{path}: outside the repository at {root}")
    return Path(rel).as_posix()


def describe_gone(tor: str, records: list[Record]) -> str | None:
    """'superseded in CR-… (date) by …' or 'retired in CR-… (date)' from the latest such record."""
    for rec in reversed(records):
        if rec.kind not in ("supersede", "retire") or tor not in rec.tors:
            continue
        when = f"in {rec.id} ({rec.date.isoformat()})"
        if rec.kind == "retire":
            return f"retired {when}"
        change = next(c for c in rec.changes if c["tor"] == tor)
        return f"superseded {when} by {', '.join(change['successors'])}"
    return None


def cmd_titles(args: argparse.Namespace, root: Path) -> int:
    ids = [i for raw in args.ids for i in _id_list(raw)]
    bad = [i for i in ids if not TOR_RE.match(i)]
    if bad:
        raise DataError([f"{i}: not a TOR-NN-XXXXXXX ID" for i in bad])
    live = live_requirements(root)
    records: list[Record] | None = None
    unknown = 0
    for tor in ids:
        if tor in live:
            print(f"{tor}\t{live[tor].title}")
            continue
        if records is None:
            records = load_records(root)
        gone = describe_gone(tor, records)
        if gone is None:
            unknown += 1
            gone = "unknown — not in any feature file or change record"
        print(f"{tor}\t({gone})")
    return EXIT_FINDINGS if unknown else EXIT_OK


def cmd_version(args: argparse.Namespace, root: Path) -> int:
    print(f"python\t{'.'.join(map(str, sys.version_info[:3]))}\t{sys.executable}")
    print(f"format\t{PLUGIN_FORMAT}")
    return EXIT_OK


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tor-lifecycle", description=__doc__.split("\n\n")[0])
    parser.add_argument("--root", help="project root (default: the enclosing git repository)")
    sub = parser.add_subparsers(dest="command", required=True)

    fp = sub.add_parser("fingerprint", help="print TOR-ID<TAB>fingerprint per scenario")
    fp.add_argument("files", nargs="*", help=f"feature files (default: {REQ_DIR}/{FEATURE_GLOB})")
    fp.add_argument("--rev", help="read the files as they were at this commit")
    fp.set_defaults(func=cmd_fingerprint)

    ti = sub.add_parser("titles", help="print TOR-ID<TAB>current title (or what retired it)")
    ti.add_argument("ids", nargs="+", help="TOR IDs, space- or comma-separated")
    ti.set_defaults(func=cmd_titles)

    ve = sub.add_parser("version", help="print the interpreter and the project format this plugin writes")
    ve.set_defaults(func=cmd_version)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args, find_root(args.root))
    except DataError as exc:
        for problem in exc.problems:
            print(f"error: {problem}", file=sys.stderr)
        return EXIT_DATA


if __name__ == "__main__":
    sys.exit(main())
