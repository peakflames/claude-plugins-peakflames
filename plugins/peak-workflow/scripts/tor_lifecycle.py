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
import json
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


@dataclass(frozen=True)
class ParsedScenario:
    tor: str
    title: str
    fingerprint: str
    section: str | None  # the section banner the Scenario sits under, e.g. "Safety"


DASHES = re.compile(r"^-{3,}$")


def parse_requirements(text: str) -> list[ParsedScenario]:
    """Every Scenario in a feature file's text, with its fingerprint and section banner.

    Fingerprint body = the title after the `[TOR-…]` prefix, then every line up to the next
    `Scenario:` or `Feature:` line, minus blank lines and comment lines (the `# Verification:` tag
    is kept). A section banner is a comment line right after a `# ----` rule, or a bare `# Safety`.
    """
    out: list[ParsedScenario] = []
    tor: str | None = None
    title = ""
    body: list[str] = []
    section: str | None = None
    after_rule = False

    def flush() -> None:
        if tor:
            out.append(ParsedScenario(tor, title, _digest(body), section))

    # Split on newlines only (as universal-newline file reading does), not str.splitlines(),
    # which also breaks on form feeds and U+2028 and would change the hash.
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = line.strip()
        if stripped.startswith("#"):
            content = stripped.lstrip("#").strip()
            if DASHES.match(content):
                after_rule = True
            else:
                if content and (after_rule or content.lower() == "safety") and not line[:1].isspace():
                    section = content
                after_rule = False
        elif stripped:
            after_rule = False
        if m := SCEN.match(line):
            flush()
            tor, title, body = m.group(1), m.group(2).strip(), [m.group(2)]
        elif FEAT.match(line):
            flush()
            tor, title, body = None, "", []
        elif tor and stripped and (VERIF.match(line) or not line.lstrip().startswith("#")):
            body.append(stripped)
    flush()
    return out


def parse_scenarios(text: str) -> list[tuple[str, str, str]]:
    """(tor, title, fingerprint) for every Scenario in a feature file's text."""
    return [(p.tor, p.title, p.fingerprint) for p in parse_requirements(text)]


def fingerprint_text(text: str) -> list[tuple[str, str]]:
    return [(tor, fp) for tor, _title, fp in parse_scenarios(text)]


def _parse_file(path: str) -> list[tuple[str, str, str]]:
    return parse_scenarios(Path(path).read_text(encoding="utf-8"))


def _parse_file_full(path: str) -> list[ParsedScenario]:
    return parse_requirements(Path(path).read_text(encoding="utf-8"))


def parse_files(paths: list[str], full: bool = False) -> list[list]:
    """Parse feature files in the working tree, one process-pool task per file.

    Returns (tor, title, fingerprint) tuples per file, or ParsedScenario objects when `full`.
    """
    missing = [p for p in paths if not Path(p).is_file()]
    if missing:
        raise DataError([f"{p}: no such feature file" for p in missing])
    func = _parse_file_full if full else _parse_file
    if len(paths) < POOL_MIN_FILES:
        return [func(p) for p in paths]
    with ProcessPoolExecutor(max_workers=min(len(paths), os.cpu_count() or 1)) as pool:
        return list(pool.map(func, paths))


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
    section: str | None = None

    @property
    def safety(self) -> bool:
        return bool(self.section) and self.section.lower().startswith("safety")


def _collect_live(named: list[tuple[str, list[ParsedScenario]]]) -> dict[str, LiveRequirement]:
    live: dict[str, LiveRequirement] = {}
    dupes: list[str] = []
    for name, scenarios in named:
        for p in scenarios:
            if p.tor in live:
                dupes.append(f"{p.tor}: defined in both {live[p.tor].feature_file} and {name}")
            live[p.tor] = LiveRequirement(p.tor, p.title, p.fingerprint, name, p.section)
    if dupes:
        raise DataError(dupes)
    return live


def live_requirements(root: Path) -> dict[str, LiveRequirement]:
    """Every live requirement in the working tree. Duplicate IDs are a data error."""
    paths = feature_files(root)
    return _collect_live([(Path(p).name, sc) for p, sc in zip(paths, parse_files(paths, full=True))])


def live_requirements_at(root: Path, rev: str) -> dict[str, LiveRequirement]:
    """The live set as it was at commit `rev` (read in one `git cat-file --batch`)."""
    rels = feature_files_at(root, rev)
    texts = read_blobs(root, [f"{rev}:{r}" for r in rels])
    return _collect_live([(Path(r).name, parse_requirements(t or "")) for r, t in zip(rels, texts)])


def read_blobs(root: Path, specs: list[str]) -> list[str | None]:
    """Read many `<rev>:<path>` objects with one `git cat-file --batch`; None when missing."""
    if not specs:
        return []
    try:
        proc = subprocess.run(["git", "-C", str(root), "cat-file", "--batch"],
                              input="".join(f"{s}\n" for s in specs).encode(), capture_output=True)
    except FileNotFoundError:
        raise DataError("git is not installed or not on PATH") from None
    data, pos, out = proc.stdout, 0, []
    for _spec in specs:
        nl = data.index(b"\n", pos)
        header = data[pos:nl].decode("utf-8", "replace").split()
        pos = nl + 1
        if len(header) != 3 or header[1] != "blob":
            out.append(None)
            if len(header) == 3:  # a tree or commit: skip its content
                pos += int(header[2]) + 1
            continue
        size = int(header[2])
        out.append(data[pos:pos + size].decode("utf-8", "replace"))
        pos += size + 1
    return out


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

KINDS = ("reword", "supersede", "retire", "pending", "uphold")
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

    if kind in ("supersede", "retire", "pending", "uphold"):
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
    if kind == "uphold" and isinstance(data.get("refs"), list) and not any(
            isinstance(r, str) and CR_ANY.search(r) for r in data["refs"]):
        p.append("an uphold must list the pending record it closes in `refs` (CR-…)")
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
        elif kind in ("supersede", "retire", "pending", "uphold"):
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
    malformed: list[str] = field(default_factory=list)              # bad `requirements:` entries (lenient)


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


def parse_sidecar(epic: str, text: str, where: str = "", lenient: bool = False) -> Sidecar:
    """Parse one status sidecar. Raises DataError naming every malformed line.

    With `lenient`, non-TOR entries in `requirements:` are kept in `malformed` (finding C) instead.
    """
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
            if bad and lenient:
                sc.malformed = bad
                sc.requirements = [t for t in sc.requirements if TOR_RE.match(t)]
            elif bad:
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


def load_sidecars(root: Path, lenient: bool = False) -> dict[str, Sidecar]:
    folder = root / STATUS_DIR
    if not folder.is_dir():
        return {}
    sidecars, problems = {}, []
    for path in sorted(folder.glob("epic-*.md")):
        epic = path.name[len("epic-"):-len(".md")]
        try:
            sidecars[epic] = parse_sidecar(epic, path.read_text(encoding="utf-8"),
                                           f"{STATUS_DIR}/{path.name}", lenient)
        except DataError as exc:
            problems.extend(exc.problems)
    if problems:
        raise DataError(problems)
    return sidecars


# --------------------------------------------------------------------------------------------
# History and citations
# --------------------------------------------------------------------------------------------

TRUNK_CANDIDATES = ("develop", "main", "master")
HISTORY_PREFIXES = ("docs/requirements/changes/", "docs/implementation-plan/session-handoffs/")
PLANNING_PREFIXES = ("docs/requirements/", "docs/implementation-plan/", "docs/product-vision-planning/")
STATUS_ORDER = {"Not Started": 0, "Paused": 1, "In Progress": 2, "Implemented": 3, "Complete": 4}
STATUS_STATE = {"Not Started": "Planned", "Paused": "Paused", "In Progress": "In Progress",
                "Implemented": "Implemented"}
VERIFIED_STATES = ("Verified", "Verified (reworded)", "Verified (legacy, unfingerprinted)")
CR_ANY = re.compile(r"CR-[A-Za-z0-9]{7}")


def resolve_trunk(root: Path, base: str | None) -> str | None:
    """The base branch whose first-parent history defines "merged". None for an empty repo."""
    for ref in ([base] if base else [*TRUNK_CANDIDATES, "HEAD"]):
        if _run_git(root, ["rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"]).returncode == 0:
            return ref
    if base:
        raise DataError(f"--base {base}: no such branch or commit")
    return None


@dataclass
class TrunkHistory:
    """Requirements as they first appeared on the trunk's first-parent history."""
    first: dict[str, tuple[str, str, str]] = field(default_factory=dict)  # tor -> (sha, date, fp)
    seen: set[str] = field(default_factory=set)


def trunk_history(root: Path, trunk: str | None) -> TrunkHistory:
    """One `git log` over feature-file changes plus one `cat-file --batch` for their contents."""
    hist = TrunkHistory()
    if trunk is None:
        return hist
    log = git(root, "log", "--first-parent", "-m", "--reverse", "--no-renames",
              "--format=%x01%H %cs", "--name-status", trunk, "--", f"{REQ_DIR}/*.feature.md")
    plan: list[tuple[str, str, str]] = []  # (sha, date, path) in commit order
    for block in log.split("\x01")[1:]:
        lines = [ln for ln in block.splitlines() if ln.strip()]
        sha, date = lines[0].split()
        for ln in lines[1:]:
            status, _, path = ln.partition("\t")
            if status[:1] in ("A", "M") and path.endswith(".feature.md"):
                plan.append((sha, date, path))
    texts = read_blobs(root, [f"{sha}:{path}" for sha, _date, path in plan])
    for (sha, date, _path), text in zip(plan, texts):
        for p in parse_requirements(text or ""):
            hist.seen.add(p.tor)
            hist.first.setdefault(p.tor, (sha, date, p.fingerprint))
    return hist


@dataclass(frozen=True)
class Citation:
    path: str
    line: int
    tor: str


def grep_citations(root: Path, rev: str | None = None) -> list[Citation]:
    """Every TOR ID mention in text files: the working tree (tracked + untracked, not ignored)
    or a commit. History files (Change Records, handoffs, changelogs) are skipped."""
    args = ["grep", "-n", "-o", "-w", "-I", "-z"]
    args += ["-E", r"TOR-[0-9]{2}-[A-Za-z0-9]{7}"] if rev else ["--untracked", "-E", r"TOR-[0-9]{2}-[A-Za-z0-9]{7}"]
    if rev:
        args.append(rev)
    proc = _run_git(root, args)
    if proc.returncode not in (0, 1):
        raise DataError(f"git grep: {proc.stderr.strip()}")
    out = []
    prefix = f"{rev}:" if rev else ""
    for row in proc.stdout.splitlines():
        parts = row.split("\0")
        if len(parts) != 3:
            continue
        path = parts[0][len(prefix):] if prefix and parts[0].startswith(prefix) else parts[0]
        if is_history(path):
            continue
        out.append(Citation(path, int(parts[1]), parts[2]))
    return out


def is_history(path: str) -> bool:
    return path.startswith(HISTORY_PREFIXES) or Path(path).name.upper().startswith("CHANGELOG")


def is_sweep_scope(path: str) -> bool:
    """Tests and source: everything outside the planning folders (and outside history)."""
    return not path.startswith(PLANNING_PREFIXES) and not is_history(path)


# --------------------------------------------------------------------------------------------
# Project model and derived requirement states
# --------------------------------------------------------------------------------------------

@dataclass
class Project:
    root: Path
    stamp: Stamp
    live: dict[str, LiveRequirement]
    records: list[Record]
    sidecars: dict[str, Sidecar]
    today: dt.date

    def __post_init__(self) -> None:
        referenced = {cr for r in self.records for ref in r.data.get("refs", [])
                      for cr in CR_ANY.findall(ref) if cr != r.id}
        # Open pending = not resolved (reword/supersede/retire refs it) and not renewed (a newer
        # pending refs it).
        self.open_pending = [r for r in self.records if r.kind == "pending" and r.id not in referenced]
        self.gone: dict[str, Record] = {}  # tor -> latest supersede/retire record naming it
        for r in self.records:
            if r.kind in ("supersede", "retire"):
                for tor in r.tors:
                    self.gone[tor] = r
        self.recorded = {t for r in self.records for t in r.tors} | {
            s for r in self.records if r.kind == "supersede" for c in r.changes for s in c["successors"]}

    def reword_chain(self, tor: str, start: str, end: str, proven_only: bool) -> list[Record] | None:
        """Reword records leading from fingerprint `start` to `end` for `tor`, or None."""
        if start == end:
            return []
        edges: dict[str, list[tuple[str, Record]]] = {}
        for r in self.records:
            if r.kind != "reword" or (proven_only and r.data["evidence"].get("result") != "pass"):
                continue
            for c in r.changes:
                if c["tor"] == tor:
                    edges.setdefault(c["from"], []).append((c["to"], r))
        frontier, seen = [(start, [])], {start}
        while frontier:
            fp, path = frontier.pop(0)
            for nxt, rec in edges.get(fp, []):
                if nxt == end:
                    return path + [rec]
                if nxt not in seen:
                    seen.add(nxt)
                    frontier.append((nxt, path + [rec]))
        return None

    def owners(self, tor: str) -> list[Sidecar]:
        """Epics listing `tor` that do not waive it."""
        return [s for s in self.sidecars.values() if tor in s.requirements and tor not in s.waived]

    def disputes(self, tor: str) -> list[Record]:
        return [r for r in self.open_pending if tor in r.tors]

    def dispute_info(self, tor: str) -> dict | None:
        recs = self.disputes(tor)
        if not recs or tor not in self.live:
            return None
        oldest = min(recs, key=lambda r: r.date)
        age = (self.today - oldest.date).days
        safety = self.live[tor].safety
        threshold = 0 if safety else self.stamp.disputed_threshold_days
        return {"record": oldest.id, "date": oldest.date.isoformat(), "age_days": age,
                "threshold_days": threshold, "safety": safety,
                "overdue": safety or age > threshold, "owner": oldest.data.get("owner")}


def load_project(root: Path, today: dt.date | None = None) -> Project:
    return Project(root, load_stamp(root), live_requirements(root), load_records(root),
                   load_sidecars(root, lenient=True), today or dt.date.today())


def requirement_state(project: Project, tor: str) -> dict:
    """One row of the derived-state table (#20 "Derived requirement states")."""
    p = project
    if tor not in p.live:
        rec = p.gone.get(tor)
        if rec is None:
            return {"tor": tor, "live": False, "state": "Unknown", "counts_as_verified": False}
        row = {"tor": tor, "live": False, "record": rec.id, "date": rec.date.isoformat(),
               "counts_as_verified": False}
        if rec.kind == "supersede":
            change = next(c for c in rec.changes if c["tor"] == tor)
            return {**row, "state": "Superseded", "successors": change["successors"]}
        state = "Retired"
        if rec.data.get("removal") == "code" and not any(
                rec.id in s.retires and s.status == "Complete" for s in p.sidecars.values()):
            state = "Retired, removal pending"
        return {**row, "state": state, "removal_epics": sorted(
            s.epic for s in p.sidecars.values() if rec.id in s.retires)}

    req = p.live[tor]
    row = {"tor": tor, "live": True, "title": req.title, "feature_file": req.feature_file,
           "safety": req.safety, "epic": None, "epics": [], "dispute": p.dispute_info(tor)}
    owners = p.owners(tor)
    row["epics"] = sorted(s.epic for s in owners)
    waivers = [s for s in p.sidecars.values() if tor in s.waived]
    if not owners:
        if waivers:
            state = "Waived"
            row["waived_to"] = sorted({s.waived[tor] for s in waivers})
        else:
            state = "Specified"
    else:
        best = max(owners, key=lambda s: STATUS_ORDER.get(s.status, -1))
        row["epic"] = best.epic
        complete = [s for s in owners if s.status == "Complete"]
        if complete:
            failed = [s for s in complete if tor in s.unverified]
            saved = next(((s, s.verified[tor]) for s in complete if tor in s.verified), None)
            if failed:
                state, row["epic"] = "Verification failed", failed[0].epic
                row["unverified"] = failed[0].unverified[tor]
            elif saved is None:
                state = "Verified (legacy, unfingerprinted)"
            else:
                row["epic"], row["verified_fingerprint"] = saved[0].epic, saved[1]
                if saved[1] == req.fingerprint:
                    state = "Verified"
                elif (chain := p.reword_chain(tor, saved[1], req.fingerprint, proven_only=True)) is not None:
                    state = "Verified (reworded)"
                    row["reword_records"] = [r.id for r in chain]
                else:
                    state = "Changed since verified"
                    if (hist := p.reword_chain(tor, saved[1], req.fingerprint, proven_only=False)) is not None:
                        row["historical_records"] = [r.id for r in hist]  # recorded, but unproven
        else:
            state = STATUS_STATE.get(best.status, f"Unknown epic status ({best.status})")
    if row["dispute"]:
        row["underlying_state"], state = state, "Disputed"
    row["state"] = state
    row["counts_as_verified"] = state in VERIFIED_STATES
    return row


def derive_states(project: Project) -> dict:
    live_rows = [requirement_state(project, t) for t in project.live]
    gone_rows = [requirement_state(project, t) for t in sorted(project.gone) if t not in project.live]
    counts: dict[str, int] = {}
    for r in live_rows + gone_rows:
        counts[r["state"]] = counts.get(r["state"], 0) + 1
    verified = sum(r["counts_as_verified"] for r in live_rows)
    return {
        "format": project.stamp.format, "plugin_format": PLUGIN_FORMAT,
        "today": project.today.isoformat(),
        "summary": {"live": len(live_rows), "verified": verified,
                    "verified_percent": round(100 * verified / len(live_rows), 1) if live_rows else 0.0,
                    "by_state": dict(sorted(counts.items()))},
        "requirements": live_rows + gone_rows,
    }


# --------------------------------------------------------------------------------------------
# Health check (findings A–F)
# --------------------------------------------------------------------------------------------

@dataclass
class Finding:
    letter: str
    message: str
    tor: str | None = None
    epic: str | None = None
    path: str | None = None
    line: int | None = None
    kind: str = ""
    own_branch: bool = False
    detail: dict = field(default_factory=dict)

    @property
    def blocking(self) -> bool:
        """Blocks wrapup-epic and quick-fix: A, B, or C introduced by this branch."""
        return self.own_branch and self.letter in "ABC"

    def as_dict(self) -> dict:
        d = {k: v for k, v in self.__dict__.items() if v not in (None, "", {})}
        d["own_branch"], d["blocking"] = self.own_branch, self.blocking
        return d


@dataclass
class BranchStart:
    """The merge base of HEAD with --base: what this branch started from."""
    sha: str
    live: dict[str, LiveRequirement]
    record_paths: set[str]
    citations: set[tuple[str, str]]  # (path, tor)
    sidecar_texts: dict[str, str]    # epic -> sidecar text at the merge base


def branch_start(root: Path, base: str) -> BranchStart:
    sha = git(root, "merge-base", base, "HEAD").strip()
    with ThreadPoolExecutor(max_workers=3) as pool:
        live_f = pool.submit(live_requirements_at, root, sha)
        names_f = pool.submit(git, root, "ls-tree", "-r", "--name-only", sha, "--",
                              CHANGES_DIR, STATUS_DIR)
        cites_f = pool.submit(grep_citations, root, sha)
        names = names_f.result().splitlines()
        status_paths = [n for n in names if n.startswith(STATUS_DIR + "/epic-")]
        texts = read_blobs(root, [f"{sha}:{n}" for n in status_paths])
        return BranchStart(
            sha, live_f.result(), {n for n in names if n.startswith(CHANGES_DIR + "/")},
            {(c.path, c.tor) for c in cites_f.result()},
            {Path(n).name[len("epic-"):-len(".md")]: t or "" for n, t in zip(status_paths, texts)})


def run_check(project: Project, base: str | None = None) -> dict:
    root, p = project.root, project
    trunk = resolve_trunk(root, base)
    with ThreadPoolExecutor(max_workers=3) as pool:
        hist_f = pool.submit(trunk_history, root, trunk)
        cites_f = pool.submit(grep_citations, root)
        start_f = pool.submit(branch_start, root, base) if base else None
        hist, citations = hist_f.result(), cites_f.result()
        start = start_f.result() if start_f else None
    findings: list[Finding] = []
    branch_records = [r for r in p.records if start and r.path not in start.record_paths]

    # A — unrecorded change, against the text when the ID first merged to the trunk.
    for tor, req in p.live.items():
        if tor in hist.first:
            sha, date, fp = hist.first[tor]
            if fp != req.fingerprint and p.reword_chain(tor, fp, req.fingerprint, proven_only=False) is None:
                findings.append(Finding("A", f"{tor} was edited without a change record, so nobody "
                                        f"can tell whether its meaning changed (text as merged {date}, "
                                        f"commit {sha[:7]}).", tor=tor, path=f"{REQ_DIR}/{req.feature_file}",
                                        detail={"merged_commit": sha, "merged_fingerprint": fp,
                                                "fingerprint": req.fingerprint}))
    # B — unrecorded removal.
    for tor in sorted(hist.seen - set(p.live) - set(p.gone)):
        findings.append(Finding("B", f"{tor} was deleted without a record of why. Add one so the "
                                "idea is not re-proposed later.", tor=tor))

    if start:  # Branch-scoped A and B: every change since the branch start needs a branch record,
        # except restoring a requirement to its text as first merged (undoing an unrecorded edit).
        by_tor = {}
        for f in findings:
            by_tor.setdefault((f.letter, f.tor), f)
        branch_project = Project(root, p.stamp, p.live, branch_records, p.sidecars, p.today)
        for tor, then in start.live.items():
            now = p.live.get(tor)
            restored = now and tor in hist.first and hist.first[tor][2] == now.fingerprint
            if now and not restored and now.fingerprint != then.fingerprint and branch_project.reword_chain(
                    tor, then.fingerprint, now.fingerprint, proven_only=False) is None:
                f = by_tor.get(("A", tor)) or Finding(
                    "A", f"{tor} was edited on this branch without a change record.", tor=tor,
                    path=f"{REQ_DIR}/{now.feature_file}")
                if ("A", tor) not in by_tor:
                    findings.append(f)
                f.own_branch = True
            elif now is None and tor not in branch_project.gone:
                f = by_tor.get(("B", tor)) or Finding(
                    "B", f"{tor} was deleted on this branch without a retire or supersede record.", tor=tor)
                if ("B", tor) not in by_tor:
                    findings.append(f)
                f.own_branch = True

    # C — dangling IDs: cited, but neither live nor in any record.
    for c in citations:
        if c.tor not in p.live and c.tor not in p.recorded:
            findings.append(Finding("C", f"{c.path}:{c.line} cites {c.tor}, which is not a live "
                                    "requirement and is not in any change record.", tor=c.tor,
                                    path=c.path, line=c.line,
                                    own_branch=bool(start) and (c.path, c.tor) not in start.citations))
    for sc in p.sidecars.values():
        for bad in sc.malformed:
            findings.append(Finding("C", f"Epic {sc.epic} lists '{bad}', which is not a requirement ID.",
                                    epic=sc.epic, path=f"{STATUS_DIR}/epic-{sc.epic}.md",
                                    own_branch=bool(start) and bad not in start.sidecar_texts.get(sc.epic, "")))

    # D — changed since verified. With an A finding too, reverify would ratify the unrecorded edit.
    edited = {f.tor for f in findings if f.letter == "A"}
    for sc in p.sidecars.values():
        if sc.status != "Complete":
            continue
        for tor, saved in sc.verified.items():
            req = p.live.get(tor)
            if req and saved != req.fingerprint and p.reword_chain(tor, saved, req.fingerprint, True) is None:
                then = start.live.get(tor) if start else None
                hist = p.reword_chain(tor, saved, req.fingerprint, False) if tor not in edited else None
                nxt = (f"Decide first whether its meaning changed: /peak-workflow:capture-requirements {tor}"
                       if tor in edited else
                       f"Its rewording ({', '.join(r.id for r in hist)}) has no test evidence. If its meaning "
                       f"changed: /peak-workflow:capture-requirements {tor}; if not, re-check it: "
                       f"/peak-workflow:wrapup-epic {sc.epic} reverify" if hist else
                       f"Re-check it: /peak-workflow:wrapup-epic {sc.epic} reverify")
                findings.append(Finding("D", f"{tor} changed after epic {sc.epic} verified it. {nxt}", tor=tor,
                                        epic=sc.epic, own_branch=bool(then) and then.fingerprint != req.fingerprint,
                                        detail={"verified_fingerprint": saved, "fingerprint": req.fingerprint}))

    # E — retired or superseded IDs still cited by tests or source.
    for c in citations:
        if c.tor in p.gone and c.tor not in p.live and is_sweep_scope(c.path):
            findings.append(Finding("E", f"{c.path}:{c.line} still cites {c.tor}, "
                                    f"{_gone_phrase(p, c.tor)}.", tor=c.tor, path=c.path, line=c.line,
                                    own_branch=bool(start) and (c.path, c.tor) not in start.citations))

    findings += housekeeping(p)
    order = {letter: i for i, letter in enumerate("ABCDEF")}
    findings.sort(key=lambda f: (order[f.letter], f.tor or "", f.epic or "", f.path or "", f.line or 0))
    counts = {letter: sum(f.letter == letter for f in findings) for letter in "ABCDEF"}
    return {"trunk": trunk, "base": base, "merge_base": start.sha if start else None,
            "counts": counts, "blocking": sum(f.blocking for f in findings),
            "findings": [f.as_dict() for f in findings]}


def _gone_phrase(p: Project, tor: str) -> str:
    rec = p.gone[tor]
    if rec.kind == "supersede":
        change = next(c for c in rec.changes if c["tor"] == tor)
        return f"which was replaced by {', '.join(change['successors'])} ({rec.id})"
    return f"which was retired ({rec.id})"


def housekeeping(p: Project) -> list[Finding]:
    """Finding F: disputed requirements, missing removal epics, open epics citing retired IDs,
    duplicate records, reused IDs and feature numbers, and requirements owned by several epics."""
    out: list[Finding] = []
    for tor in p.live:
        info = p.dispute_info(tor)
        if info:
            due = "overdue" if info["overdue"] else f"due after {info['threshold_days']} days"
            safety = "; a Safety requirement blocks immediately" if info["safety"] else ""
            done = [s for s in p.owners(tor) if s.status == "Complete"]
            how = (" and failed verification" if any(tor in s.unverified for s in done)
                   else " and still marked done" if done else "")
            out.append(Finding("F", f"{tor} is known to be wrong{how} "
                               f"({info['record']}, {info['age_days']} days old, {due}{safety}). Next "
                               f"step: /peak-workflow:capture-requirements {tor}", tor=tor,
                               kind="disputed", detail=info))
        if tor in p.gone:
            out.append(Finding("F", f"{tor} is live again although {p.gone[tor].id} removed it. A "
                               "reintroduced requirement needs a new ID.", tor=tor, kind="id-reused"))
        owners = p.owners(tor)
        if len(owners) > 1:
            names = ", ".join(sorted(s.epic for s in owners))
            out.append(Finding("F", f"{tor} is owned by more than one epic ({names}). Each requirement "
                               "should have exactly one owner.", tor=tor, kind="multi-owner",
                               detail={"epics": sorted(s.epic for s in owners)}))
    for r in p.records:
        if r.kind == "retire" and r.data.get("removal") == "code" and not any(
                r.id in s.retires for s in p.sidecars.values()):
            out.append(Finding("F", f"{r.id} retired {', '.join(r.tors)} but the code is still there "
                               "and no epic removes it. Plan a removal epic with /peak-workflow:add.",
                               kind="removal-missing", detail={"record": r.id}))
    for sc in p.sidecars.values():
        if sc.status == "Complete":
            continue
        for tor in sc.requirements:
            if tor in p.gone and tor not in p.live:
                out.append(Finding("F", f"Epic {sc.epic} ({sc.status}) still lists {tor}, "
                                   f"{_gone_phrase(p, tor)}.", tor=tor, epic=sc.epic, kind="open-epic-retired"))
    removing: dict[str, list[str]] = {}
    pending: dict[str, list[str]] = {}
    for r in p.records:
        for tor in r.tors:
            if r.kind in ("supersede", "retire"):
                removing.setdefault(tor, []).append(r.id)
    for r in p.open_pending:
        for tor in r.tors:
            pending.setdefault(tor, []).append(r.id)
    for label, table in (("remove", removing), ("dispute", pending)):
        for tor, ids in sorted(table.items()):
            if len(ids) > 1:
                out.append(Finding("F", f"{tor} has {len(ids)} records that {label} it ({', '.join(ids)}). "
                                   "Keep one; a correction is a new record that refs the old one.",
                                   tor=tor, kind="multiple-records", detail={"records": ids}))
    live_files = {f.split("-", 1)[0]: f for f in {r.feature_file for r in p.live.values()}}
    reported = set()
    for r in p.records:
        for c in r.changes:
            ff = c.get("feature_file")
            if not ff:
                continue
            nn = ff.split("-", 1)[0]
            if nn in live_files and live_files[nn] != ff and (nn, ff) not in reported:
                reported.add((nn, ff))
                out.append(Finding("F", f"Feature number {nn} is reused: {live_files[nn]} is live, but "
                                   f"{r.id} names {ff}. Feature numbers are never reused.",
                                   path=f"{REQ_DIR}/{live_files[nn]}", kind="feature-number-reused"))
    return out


# --------------------------------------------------------------------------------------------
# Sweep and seed
# --------------------------------------------------------------------------------------------

def run_sweep(project: Project, ids: list[str] | None = None) -> list[dict]:
    """Test and source citations of superseded or retired IDs (optionally only `ids`)."""
    p = project
    wanted = set(ids) if ids else None
    rows = []
    for c in grep_citations(p.root):
        if c.tor in p.gone and c.tor not in p.live and is_sweep_scope(c.path) and (
                wanted is None or c.tor in wanted):
            rec = p.gone[c.tor]
            change = next(ch for ch in rec.changes if ch["tor"] == c.tor)
            rows.append({"tor": c.tor, "path": c.path, "line": c.line, "kind": rec.kind,
                         "record": rec.id, "successors": change.get("successors", [])})
    return sorted(rows, key=lambda r: (r["tor"], r["path"], r["line"]))


def completion_commit(root: Path, epic: str) -> str | None:
    """The first commit that set the epic's sidecar to `status: Complete`."""
    out = git(root, "log", "--reverse", "--format=%H", "-G^status: *Complete", "HEAD", "--",
              f"{STATUS_DIR}/epic-{epic}.md", check=False).split()
    return out[0] if out else None


def run_seed(project: Project) -> list[dict]:
    """For each Complete epic, fingerprint its requirements at the commit that completed it.

    Only requirements without a `verified:` line are seeded; waived ones are skipped. A requirement
    absent at that commit (or an epic with no recoverable completion) stays legacy, unfingerprinted.
    """
    p, root = project, project.root
    epics = [s for s in p.sidecars.values() if s.status == "Complete"
             and any(t not in s.verified and t not in s.waived for t in s.requirements)]
    with ThreadPoolExecutor(max_workers=min(max(len(epics), 1), 16)) as pool:
        commits = dict(zip([s.epic for s in epics], pool.map(lambda s: completion_commit(root, s.epic), epics)))
        distinct = sorted({c for c in commits.values() if c})
        trees = dict(zip(distinct, pool.map(lambda c: live_requirements_at(root, c), distinct)))
    rows = []
    for sc in epics:
        sha = commits[sc.epic]
        for tor in sc.requirements:
            if tor in sc.verified or tor in sc.waived:
                continue
            then = trees.get(sha, {}).get(tor) if sha else None
            rows.append({"epic": sc.epic, "tor": tor, "commit": sha,
                         "fingerprint": then.fingerprint if then else None,
                         "reason": None if then else ("no completion commit" if not sha
                                                      else "not in the feature files at completion")})
    return rows


def write_verified(text: str, lines: dict[str, str]) -> str:
    """Add `  TOR: fp` lines to a sidecar's `verified:` block (created at the end if absent)."""
    rows = text.rstrip("\n").split("\n")
    new = [f"  {tor}: {fp}" for tor, fp in lines.items()]
    try:
        at = next(i for i, ln in enumerate(rows) if ln.rstrip() == "verified:")
    except StopIteration:
        return "\n".join(rows + ["verified:"] + new) + "\n"
    end = at + 1
    while end < len(rows) and rows[end][:1].isspace() and rows[end].strip():
        end += 1
    return "\n".join(rows[:end] + new + rows[end:]) + "\n"


def mark_sidecar(text: str, *, append: list[str], verified: dict[str, str], unverified: dict[str, str],
                 reverified: str | None) -> str:
    """Rewrite a sidecar's `requirements:` (append only), `verified:`, `unverified:`, and
    `reverified:` lines; every other line stays as it was. `verified` maps TOR -> fingerprint (a
    PASS: drops its `unverified:` line); `unverified` maps TOR -> "YYYY-MM-DD reason" (a FAIL:
    drops its `verified:` line)."""
    rows = text.rstrip("\n").split("\n")
    out: list[str] = []
    blocks: dict[str, dict[str, str]] = {"verified": {}, "unverified": {}}
    i = 0
    while i < len(rows):
        line = rows[i]
        m = KEY_LINE.match(line) if line[:1] and not line[0].isspace() else None
        key = m.group(1) if m else None
        if key in SIDECAR_BLOCKS:  # lift the block out; re-emitted below
            i += 1
            while i < len(rows) and rows[i][:1].isspace() and rows[i].strip():
                bm = BLOCK_LINE.match(rows[i])
                blocks[key][bm.group(1)] = bm.group(2)
                i += 1
            continue
        if key == "requirements" and append:
            ids = _id_list(m.group(2))
            ids += [t for t in append if t not in ids]
            line = f"requirements: {', '.join(ids)}"
        if key == "reverified" and reverified:
            line, reverified = f"reverified: {reverified}", None
        out.append(line)
        i += 1
    while out and not out[-1].strip():
        out.pop()
    if reverified:
        at = next((n + 1 for n, ln in enumerate(out) if ln.startswith("requirements:")), len(out))
        out.insert(at, f"reverified: {reverified}")
    for tor, fp in verified.items():
        blocks["verified"][tor] = fp
        blocks["unverified"].pop(tor, None)
    for tor, why in unverified.items():
        blocks["unverified"][tor] = why
        blocks["verified"].pop(tor, None)
    for key in SIDECAR_BLOCKS:
        if blocks[key]:
            out += [f"{key}:"] + [f"  {tor}: {value}" for tor, value in blocks[key].items()]
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------------------------
# Project format (the guard every skill runs) and upgrade-step mechanics
# --------------------------------------------------------------------------------------------

LEGACY_INDEX = "docs/implementation-plan/index.md"
LEGACY_TABLE = re.compile(r"^\|\s*Phase\s*\|\s*Epic\s*\|", re.M)
LEGACY_STATUS = re.compile(r"\|\s*Status\s*\|")
# Files that mean a project already has peak-workflow planning (README stubs do not count).
ARTIFACT_GLOBS = ("docs/requirements/*.feature.md", f"{STATUS_DIR}/epic-*.md",
                  "docs/implementation-plan/phase-*/epic-*.md",
                  "docs/product-vision-planning/product-vision.md",
                  "docs/product-vision-planning/concept-of-operations.md")
UPDATE_HINT = "/plugin marketplace update peakflames-plugins"
STEPS_DIR = Path(__file__).resolve().parent.parent / "skills" / "upgrade" / "steps"
STEP_NAME = re.compile(r"^(\d{4})-[\w-]+\.md$")


def shipped_format(steps_dir: Path = STEPS_DIR) -> int:
    """The highest format the upgrade steps in this build reach (0 when none ship). A released
    build ships one step per format up to PLUGIN_FORMAT (the tests hold it to that)."""
    nums = [int(m.group(1)) for p in steps_dir.glob("*.md") if (m := STEP_NAME.match(p.name))]
    return max(nums, default=0)


@dataclass
class FormatStatus:
    verdict: str        # current | new | behind | ahead | not-peak-workflow
    project: int
    plugin: int
    stamped: bool
    message: str


def has_artifacts(root: Path) -> bool:
    return any(next(root.glob(pattern), None) is not None for pattern in ARTIFACT_GLOBS)


def is_legacy_layout(root: Path) -> bool:
    """The single-index layout from before peak-workflow existed: a status table in index.md."""
    path = root / LEGACY_INDEX
    if not path.is_file():
        return False
    text = path.read_text(encoding="utf-8", errors="replace")
    return bool(LEGACY_TABLE.search(text) and LEGACY_STATUS.search(text))


def format_status(root: Path) -> FormatStatus:
    """Compare the project's stamp with PLUGIN_FORMAT. A missing stamp is format 0, unless the
    project has no peak-workflow files yet (`new`: setup will stamp it)."""
    plugin = PLUGIN_FORMAT
    if is_legacy_layout(root):
        return FormatStatus("not-peak-workflow", 0, plugin, False,
                            f"{LEGACY_INDEX} holds a status table — the single-index layout from before "
                            "peak-workflow — which is not a peak-workflow layout. This plugin cannot "
                            "read or upgrade it.")
    stamp = load_stamp(root)
    n = stamp.format
    if not stamp.present and not has_artifacts(root):
        return FormatStatus("new", 0, plugin, False,
                            f"No peak-workflow files yet. /peak-workflow:setup stamps this project at "
                            f"format {plugin}.")
    if n == plugin:
        return FormatStatus("current", n, plugin, stamp.present, f"Project format {n} — up to date.")
    if n < plugin:
        where = (f"This project's files are on format {n}" if stamp.present else
                 f"This project has no format stamp ({STAMP_PATH}), so its files are on format 0")
        return FormatStatus("behind", n, plugin, stamp.present,
                            f"{where}; this plugin needs format {plugin}.\n"
                            "Run /peak-workflow:upgrade — it shows each step before applying it.")
    return FormatStatus("ahead", n, plugin, True,
                        f"This project's files are on format {n}, newer than this plugin understands "
                        f"(format {plugin}).\nUpdate the plugin ({UPDATE_HINT}), restart Claude Code, "
                        "and run the command again.")


STAMP_FORMAT_LINE = re.compile(r"^format\s*=.*$", re.M)


def write_stamp_format(root: Path, n: int, lifecycle: bool = False) -> None:
    """Set `format = n` in the stamp, keeping everything else. `lifecycle` adds the default
    `[lifecycle]` table to a new stamp."""
    path = root / STAMP_PATH
    if path.is_file():
        text = path.read_text(encoding="utf-8")
        if STAMP_FORMAT_LINE.search(text):
            text = STAMP_FORMAT_LINE.sub(f"format = {n}", text, count=1)
        else:
            text = f"format = {n}\n" + text
    else:
        text = f"format = {n}\n"
        if lifecycle:
            text += f"\n[lifecycle]\ndisputed_threshold_days = {DEFAULT_DISPUTED_DAYS}\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    load_stamp(root)  # what was written must read back


# -- Step 0001: epic provenance ---------------------------------------------------------------

PROVENANCE_KEYS = ("Planned by", "Planned", "Plan branch")
HEADER_LINE = re.compile(r"^\*\*([^*:]+):\*\*\s*(.*?)\s*$")
# Anchors for inserting a missing provenance line, latest first (the plan-project spec order).
HEADER_ANCHORS = ("Plan branch", "Planned", "Planned by", "Dependencies", "Status", "Phase")
MERGE_SUBJECTS = (re.compile(r"^Merge branch '([^']+)'"),
                  re.compile(r"^Merge remote-tracking branch '(?:[^/']+/)?([^']+)'"),
                  re.compile(r"^Merge pull request #\d+ from [^/\s]+/(\S+)"))
EMPTY_VALUES = ("", "—", "-")


def spec_epic_id(relpath: str) -> str:
    """`.../epic-<id>-<slug>.md` → `<id>`."""
    return Path(relpath).name[len("epic-"):].removesuffix(".md").split("-", 1)[0]


def merge_branch(subject: str) -> str | None:
    for pattern in MERGE_SUBJECTS:
        m = pattern.match(subject)
        if m:
            return m.group(1)
    return None


def spec_added_by(root: Path, relpath: str) -> tuple[str, str, str] | None:
    """(sha, author, date) of the commit that added the spec, following renames of the same epic.
    `git log --follow` also pairs a new spec with a similar existing one (a copy, or a rename
    from another epic's spec — templated specs look alike), so those count as the add."""
    log = git(root, "log", "--follow", "--name-status", "--format=%x01%H%x09%an%x09%as", "--", relpath,
              check=False)
    epic = spec_epic_id(relpath)
    last = None
    for block in log.split("\x01")[1:]:
        lines = [ln for ln in block.splitlines() if ln.strip()]
        last = tuple(lines[0].split("\t"))
        status = lines[1].split("\t") if len(lines) > 1 else ["M"]
        if status[0].startswith("A") or status[0].startswith("C"):
            return last
        if status[0].startswith("R") and spec_epic_id(status[1]) != epic:
            return last
    return last


def spec_origin(root: Path, relpath: str, trunk: str | None, trunk_line: set[str]) -> dict[str, str]:
    """Who added the spec, when (author date), and the branch it was planned on, from git.
    The branch is read from the trunk merge that brought the adding commit in; a commit made on
    the trunk itself names the trunk. Anything git cannot tell is `—`."""
    origin = spec_added_by(root, relpath)
    if origin is None:
        return {k: "—" for k in PROVENANCE_KEYS}
    sha, author, date = origin
    branch = "—"
    if trunk and trunk != "HEAD":
        if sha in trunk_line:
            branch = trunk
        else:
            path = git(root, "log", "--first-parent", "--ancestry-path", "--format=%s",
                       f"{sha}..{trunk}", check=False).splitlines()
            branch = (merge_branch(path[-1]) if path else None) or "—"
    return {"Planned by": author or "—", "Planned": date or "—", "Plan branch": branch}


def backfill_header(text: str, values: dict[str, str]) -> str:
    """Fill missing or `—` provenance lines in a spec header; never overwrite a real value."""
    lines = text.split("\n")
    for key in PROVENANCE_KEYS:
        end = next((i for i, ln in enumerate(lines)
                    if ln.startswith("## ") or ln.strip() == "---"), len(lines))
        present = {}
        for i in range(end):
            m = HEADER_LINE.match(lines[i])
            if m:
                present.setdefault(m.group(1), (i, m.group(2)))
        new = f"**{key}:** {values[key]}"
        if key in present:
            i, current = present[key]
            if current in EMPTY_VALUES and values[key] not in EMPTY_VALUES:
                lines[i] = new
            continue
        anchor = next((present[a][0] for a in HEADER_ANCHORS if a in present), None)
        if anchor is None:
            title = next((i for i in range(end) if lines[i].startswith("# ")), None)
            anchor = -1 if title is None else (title + 1 if title + 1 < len(lines) and not lines[title + 1].strip()
                                               else title)
        lines.insert(anchor + 1, new)
    return "\n".join(lines)


def header_values(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for ln in text.split("\n"):
        if ln.startswith("## ") or ln.strip() == "---":
            break
        m = HEADER_LINE.match(ln)
        if m:
            values.setdefault(m.group(1), m.group(2))
    return values


def backfill_owner(text: str) -> str:
    """Add `owner: —` after `status:` when the sidecar has no owner line."""
    rows = text.split("\n")
    if any(KEY_LINE.match(r) and r.split(":", 1)[0] == "owner" for r in rows):
        return text
    at = next((i + 1 for i, r in enumerate(rows) if r.startswith("status:")), 0)
    rows.insert(at, "owner: —")
    return "\n".join(rows)


def run_provenance(root: Path, base: str | None = None, skip: set[str] | None = None) -> list[dict]:
    """Every spec and sidecar step 0001 would change, with the new text. Idempotent: a file is
    listed only when the rewrite differs from what is on disk."""
    skip = skip or set()
    trunk = resolve_trunk(root, base)
    trunk_line = set(git(root, "rev-list", "--first-parent", trunk).split()) if trunk else set()
    specs = sorted(p.relative_to(root).as_posix()
                   for p in root.glob("docs/implementation-plan/phase-*/epic-*.md"))
    specs = [s for s in specs if spec_epic_id(s) not in skip]
    with ThreadPoolExecutor(max_workers=8) as pool:
        origins = list(pool.map(lambda rel: spec_origin(root, rel, trunk, trunk_line), specs))
    rows = []
    for rel, origin in zip(specs, origins):
        old = (root / rel).read_text(encoding="utf-8")
        new = backfill_header(old, origin)
        if new != old:
            before, after = header_values(old), header_values(new)
            rows.append({"path": rel, "epic": spec_epic_id(rel), "kind": "spec", "text": new,
                         "lines": {k: after[k] for k in PROVENANCE_KEYS if before.get(k) != after.get(k)}})
    for path in sorted((root / STATUS_DIR).glob("epic-*.md")) if (root / STATUS_DIR).is_dir() else []:
        epic = path.name[len("epic-"):-len(".md")]
        if epic in skip:
            continue
        old = path.read_text(encoding="utf-8")
        new = backfill_owner(old)
        if new != old:
            rows.append({"path": path.relative_to(root).as_posix(), "epic": epic, "kind": "sidecar",
                         "text": new, "lines": {"owner": "—"}})
    return rows


def inflight_branches(root: Path, base: str | None, paths: list[str]) -> list[tuple[str, str]]:
    """(branch, path) for each local or remote branch, not yet merged into the base, whose
    changes since the merge base touch one of `paths`."""
    trunk = resolve_trunk(root, base)
    if trunk is None:
        return []
    current = git(root, "branch", "--show-current", check=False)
    tip = git(root, "rev-parse", trunk)
    refs = git(root, "for-each-ref", "--format=%(refname:short)%09%(objectname)",
               "refs/heads", "refs/remotes").splitlines()
    out = []
    for row in refs:
        ref, sha = row.split("\t")
        if ref in (trunk, current, f"origin/{trunk}", "origin") or ref.endswith("/HEAD") or sha == tip:
            continue
        if ref.split("/", 1)[-1].startswith("docs/upgrade-") or ref.startswith("docs/upgrade-"):
            continue  # an upgrade's own branch, merged or not, is not someone's work in flight
        if _run_git(root, ["merge-base", "--is-ancestor", sha, trunk]).returncode == 0:
            continue
        changed = git(root, "diff", "--name-only", f"{trunk}...{sha}", "--", *paths, check=False)
        out += [(ref, p) for p in changed.splitlines() if p]
    return out


# -- Step 0002: requirements lifecycle --------------------------------------------------------

LIFECYCLE_MARKERS = re.compile(r"\b(AMENDED|REVISED|SUPERSEDED|MODIFIED|CHANGE[- ]CONTROL)\b", re.I)
RULE_LINE = re.compile(r"^[-=]{3,}$")
REFERENCE_SCREEN = re.compile(r"^Note:\s*reference screens?\b", re.I)
AD_HOC_KEYS = ("superseded_by", "supersession_note", "revised", "revision-reason", "revision_reason")
SPEC_GLOB = "docs/implementation-plan/phase-*/epic-*.md"
ANCHORS_HEADING = "## Requirements Anchors"
MIGRATION_SOURCE_LINE = re.compile(r"^migration_source\s*=.*\n?", re.M)
HISTORICAL_EQUIVALENCE = ("Not assessed: an edit made before 3.0, recorded by the migration from git history. "
                          "Historical evidence counts as unproven.")
ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"


@dataclass
class ProseItem:
    """A run of lifecycle prose in a feature file: `# Note:` blocks, change markers, other comments."""
    file: str          # repo-relative path
    line: int          # first line (1-based)
    end: int           # last line
    kind: str          # marker | note | comment | banner | outside
    tor: str | None    # the requirement it sits in (None = file level)
    text: str
    strip: bool = True  # False: left in place (removing it would change a fingerprint)

    @property
    def id(self) -> str:
        return f"{self.file}:{self.line}"

    @property
    def summary(self) -> str:
        """The first line that says something (a bare `Note:` heading is skipped)."""
        lines = [ln for ln in self.text.split("\n") if ln.strip()]
        return next((ln for ln in lines if ln.strip().lower() != "note:"), lines[0] if lines else "")


def _gherkin_mask(lines: list[str]) -> list[bool]:
    """True for lines inside the Gherkin: inside ```gherkin fences, or every line of an unfenced file."""
    if not any(ln.strip().startswith("```gherkin") for ln in lines):
        return [True] * len(lines)
    mask, inside = [], False
    for ln in lines:
        s = ln.strip()
        if s.startswith("```"):
            mask.append(False)
            inside = s.startswith("```gherkin") and not inside
            continue
        mask.append(inside)
    return mask


def scan_prose(rel: str, text: str) -> list[ProseItem]:
    """Lifecycle prose in one feature file. Kept: section banners and their rules, `# Verification:`,
    the `# Note: reference screen` line, a bare `# Safety`, and comment lines inside doc strings."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    mask = _gherkin_mask(lines)
    items: list[ProseItem] = []
    tor: str | None = None
    first_scenario = next((i for i, ln in enumerate(lines) if SCEN.match(ln)), len(lines))
    group: list[int] = []
    held_empty: list[int] = []
    in_banner = banner_text = in_doc = seen_feature = False

    def close() -> None:
        nonlocal group
        if group:
            body = [lines[i].strip().lstrip("#").strip() for i in group]
            kind = ("marker" if any(LIFECYCLE_MARKERS.search(b) for b in body) else
                    "note" if any(b.lower().startswith("note:") for b in body) else "comment")
            items.append(ProseItem(rel, group[0] + 1, group[-1] + 1, kind, tor,
                                   "\n".join(b for b in body if b)))
        group = []

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not mask[i]:
            close()
            held_empty = []
            if stripped and LIFECYCLE_MARKERS.search(stripped):
                items.append(ProseItem(rel, i + 1, i + 1, "outside", None, stripped, strip=i < first_scenario))
            continue
        if stripped.startswith('"""'):
            in_doc = not in_doc
        if in_doc or stripped.startswith('"""'):
            close()
            continue
        if m := SCEN.match(line):
            close()
            tor = m.group(1)
        elif FEAT.match(line):
            close()
            tor, seen_feature = None, True
        if not stripped.startswith("#"):
            close()
            held_empty = []
            if stripped:
                in_banner = False
            elif banner_text:
                in_banner = banner_text = False
            continue
        content = stripped.lstrip("#").strip()
        if RULE_LINE.match(content):
            close()
            held_empty = []
            if in_banner and banner_text:
                in_banner = banner_text = False
            else:
                in_banner, banner_text = True, False
            continue
        if in_banner:
            banner_text = True
            if LIFECYCLE_MARKERS.search(content):
                items.append(ProseItem(rel, i + 1, i + 1, "banner", None, content))
            continue
        if not content:
            (group if group else held_empty).append(i)
            continue
        if VERIF.match(line) or REFERENCE_SCREEN.match(content) or content.lower() == "safety" or (
                not seen_feature and not LIFECYCLE_MARKERS.search(content)):  # e.g. a Markdown title
            close()
            held_empty = []
            continue
        if not group:
            group = held_empty
        held_empty = []
        group.append(i)
    close()
    # A note directly above a Scenario line (no blank line between) belongs to that Scenario.
    for item in items:
        nxt = item.end  # 0-based index of the line after the item
        if nxt < len(lines) and (m := SCEN.match(lines[nxt])):
            item.tor = m.group(1)
    return items


def tracing_files(root: Path) -> list[Path]:
    return sorted((root / REQ_DIR).glob("*.feature.tracing.json"))


def load_tracing(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DataError(f"{REQ_DIR}/{path.name}: not valid JSON ({exc})") from None
    if not isinstance(data, dict) or not isinstance(data.get("requirements", []), list):
        raise DataError(f"{REQ_DIR}/{path.name}: expected an object with a `requirements` list")
    return data


def dump_tracing(data: dict, original: str = "") -> str:
    """JSON as the sidecar writer would have it; a file that was pure ASCII (\\u escapes) stays so."""
    return json.dumps(data, indent=2, ensure_ascii=original.isascii() if original else False) + "\n"


def split_row(line: str) -> list[str]:
    """Cells of a Markdown table row (escaped pipes stay in their cell)."""
    body = line.strip()
    body = body[1:] if body.startswith("|") else body
    body = body[:-1] if body.endswith("|") and not body.endswith("\\|") else body
    return [c.strip() for c in re.split(r"(?<!\\)\|", body)]


def strip_anchor_titles(text: str, live: dict[str, LiveRequirement]) -> str:
    """Drop title columns from a spec's Requirements Anchors table; add a Feature File column when
    the table has none. Every other line is kept."""
    lines = text.split("\n")
    try:
        start = next(i for i, ln in enumerate(lines) if ln.strip() == ANCHORS_HEADING)
    except StopIteration:
        return text
    head = next((i for i in range(start + 1, len(lines))
                 if lines[i].startswith("## ") or lines[i].lstrip().startswith("|")), None)
    if head is None or lines[head].startswith("## ") or head + 1 >= len(lines):
        return text
    cols = split_row(lines[head])
    idcol = next((n for n, c in enumerate(cols) if "tor" in c.lower()), 0)
    titles = [n for n, c in enumerate(cols) if n != idcol and re.search(r"title|scenario", c, re.I)
              and "feature" not in c.lower()]
    has_ff = any("feature" in c.lower() for c in cols)
    if not titles and has_ff:
        return text
    end = head + 2
    while end < len(lines) and lines[end].lstrip().startswith("|"):
        end += 1
    keep = [n for n in range(len(cols)) if n not in titles]

    def row(cells: list[str]) -> str:
        return "| " + " | ".join(cells) + " |"

    new_head = [cols[n] for n in keep]
    rows = [split_row(ln) for ln in lines[head + 2:end]]
    new_rows = [[r[n] if n < len(r) else "" for n in keep] for r in rows]
    if not has_ff:
        at = keep.index(idcol) + 1
        new_head.insert(at, "Feature File")
        for r, orig in zip(new_rows, rows):
            ids = TOR_ANY.findall(orig[idcol] if idcol < len(orig) else "")
            req = live.get(ids[0]) if ids else None
            r.insert(at, f"`{REQ_DIR}/{req.feature_file}`" if req else "—")
    sep = "|" + "|".join("-" * (len(c) + 2) for c in new_head) + "|"
    lines[head:end] = [row(new_head), sep] + [row(r) for r in new_rows]
    return "\n".join(lines)


def spec_paths(root: Path) -> list[Path]:
    return sorted(root.glob(SPEC_GLOB))


@dataclass
class TrunkVersions:
    """Every fingerprint change of every requirement along the trunk's first-parent history."""
    events: dict[str, list[dict]] = field(default_factory=dict)   # tor -> [{sha, date, subject, from, to}]
    first: dict[str, str] = field(default_factory=dict)           # tor -> first fingerprint
    last: dict[str, tuple[str, str]] = field(default_factory=dict)  # tor -> (sha, path) last seen
    removed: dict[str, dict] = field(default_factory=dict)        # tor -> {sha, date, subject}


def trunk_versions(root: Path, trunk: str | None) -> TrunkVersions:
    out = TrunkVersions()
    if trunk is None:
        return out
    log = git(root, "log", "--first-parent", "-m", "--reverse", "--no-renames",
              "--format=%x01%H %cs %s", "--name-status", trunk, "--", f"{REQ_DIR}/*.feature.md")
    commits: list[tuple[str, str, str, list[tuple[str, str]]]] = []
    for block in log.split("\x01")[1:]:
        lines = [ln for ln in block.splitlines() if ln.strip()]
        sha, date, *rest = lines[0].split(" ", 2)
        files = []
        for ln in lines[1:]:
            status, _, path = ln.partition("\t")
            if path.endswith(".feature.md"):
                files.append((status[:1], path))
        commits.append((sha, date, rest[0] if rest else "", files))
    specs = [f"{sha}:{path}" for sha, _d, _s, files in commits for st, path in files if st in "AM"]
    texts = iter(read_blobs(root, specs))
    file_tors: dict[str, dict[str, str]] = {}  # path -> {tor: fp}
    where: dict[str, set[str]] = {}            # tor -> paths holding it
    current: dict[str, str] = {}               # tor -> fp
    for sha, date, subject, files in commits:
        touched: set[str] = set()
        for status, path in files:
            new = {} if status not in "AM" else {
                p.tor: p.fingerprint for p in parse_requirements(next(texts) or "")}
            old = file_tors.get(path, {})
            for tor in old.keys() - new.keys():
                where.get(tor, set()).discard(path)
                touched.add(tor)
            for tor, fp in new.items():
                where.setdefault(tor, set()).add(path)
                out.last[tor] = (sha, path)
                out.removed.pop(tor, None)
                if tor not in out.first:
                    out.first[tor] = fp
                elif current.get(tor) not in (None, fp):
                    out.events.setdefault(tor, []).append(
                        {"sha": sha, "date": date, "subject": subject, "from": current[tor], "to": fp})
                current[tor] = fp
            file_tors[path] = new
        for tor in touched:
            if not where.get(tor):
                out.removed[tor] = {"sha": sha, "date": date, "subject": subject}
                current.pop(tor, None)
    return out


@dataclass
class MigrationScan:
    trunk: str | None
    prose: list[ProseItem]
    tracing: list[dict]       # {path, titles, generated}
    specs: list[dict]         # {path, epic, status}
    sidecar_keys: list[dict]  # {path, epic, key, value, source}
    edits: list[dict]         # {tor, sha, date, subject, from, to}
    removed: list[dict]       # {tor, sha, date, feature_file}
    seed: list[dict]          # seedable rows
    sources: list[str]        # records still carrying migration_source

    @property
    def pending(self) -> bool:
        return bool([p for p in self.prose if p.strip] or self.tracing or self.specs or self.sidecar_keys
                    or self.edits or self.removed or self.seed or self.sources)

    def counts(self) -> dict[str, int]:
        return {"prose": sum(p.strip for p in self.prose), "kept": sum(not p.strip for p in self.prose),
                "tracing": len(self.tracing), "specs": len(self.specs), "sidecar_keys": len(self.sidecar_keys),
                "edits": len(self.edits), "removed": len(self.removed), "seed": len(self.seed),
                "migration_source": len(self.sources)}


def migration_prerequisites(root: Path) -> list[str]:
    """#20 Migration 1: tracing JSON parses, Scenario IDs are unique, records and sidecars load."""
    problems: list[str] = []
    for path in tracing_files(root):
        try:
            load_tracing(path)
        except DataError as exc:
            problems += exc.problems
    for loader in (live_requirements, load_records, lambda r: load_sidecars(r, lenient=True)):
        try:
            loader(root)
        except DataError as exc:
            problems += exc.problems
    return problems


def unexplained_edits(p: Project, tv: TrunkVersions) -> list[dict]:
    """Trunk edits of live requirements whose first-merged text no record chain explains (finding A)."""
    rows = []
    for tor, req in sorted(p.live.items()):
        first = tv.first.get(tor)
        if first is None or first == req.fingerprint or p.reword_chain(tor, first, req.fingerprint, False) is not None:
            continue
        events = list(tv.events.get(tor, []))
        last = events[-1]["to"] if events else first
        if last != req.fingerprint:  # edited on this branch after the trunk tip
            head = git(p.root, "rev-parse", "HEAD").strip()
            events.append({"sha": head, "date": p.today.isoformat(), "subject": "working tree",
                           "from": last, "to": req.fingerprint})
        rows += [{"tor": tor, **e} for e in events]
    return rows


def scan_migration(root: Path, base: str | None = None, today: dt.date | None = None) -> MigrationScan:
    problems = migration_prerequisites(root)
    if problems:
        raise DataError(problems)
    p = load_project(root, today)
    trunk = resolve_trunk(root, base)
    tv = trunk_versions(root, trunk)
    prose = []
    for path in feature_files(root):
        prose += scan_prose(_repo_relative(root, path), Path(path).read_text(encoding="utf-8"))
    tracing = []
    for path in tracing_files(root):
        data = load_tracing(path)
        titles = sum(isinstance(r, dict) and "title" in r for r in data.get("requirements", []))
        if titles or "generated" in data:
            tracing.append({"path": f"{REQ_DIR}/{path.name}", "titles": titles, "generated": "generated" in data})
    specs = []
    for path in spec_paths(root):
        epic = spec_epic_id(path.name)
        status = p.sidecars[epic].status if epic in p.sidecars else "—"
        text = path.read_text(encoding="utf-8")
        if status != "Complete" and strip_anchor_titles(text, p.live) != text:
            specs.append({"path": path.relative_to(root).as_posix(), "epic": epic, "status": status})
    keys = []
    for epic, sc in sorted(p.sidecars.items()):
        for key in AD_HOC_KEYS:
            if key in sc.extra:
                rel = f"{STATUS_DIR}/epic-{epic}.md"
                keys.append({"path": rel, "epic": epic, "key": key, "value": sc.extra[key], "source": f"{rel}:{key}"})
    removed = []
    for tor in sorted(set(tv.removed) - set(p.live) - set(p.gone)):
        removed.append({"tor": tor, **tv.removed[tor], "feature_file": Path(tv.last[tor][1]).name})
    seed = [r for r in run_seed(p) if r["fingerprint"]]
    sources = [r.path for r in p.records if "migration_source" in r.data]
    return MigrationScan(trunk, prose, tracing, specs, keys, unexplained_edits(p, tv), removed, seed, sources)


def _toml_str(value: str, multiline: bool = False) -> str:
    esc = value.replace("\\", "\\\\").replace('"', '\\"')
    if multiline and "\n" in value:
        return '"""\n' + esc + '"""'
    esc = esc.replace("\n", "\\n").replace("\t", "\\t").replace("\r", "\\r")
    return '"' + re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", lambda m: f"\\u{ord(m.group()):04x}", esc) + '"'


def _toml_value(value, multiline: bool = False) -> str:
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, list):
        return "[" + ", ".join(_toml_value(v) for v in value) + "]"
    return _toml_str(str(value), multiline)


def record_toml(data: dict) -> str:
    """A Change Record as TOML: scalars, then [evidence], then [[changes]]."""
    out = []
    for key, value in data.items():
        if key not in ("evidence", "changes"):
            out.append(f"{key} = {_toml_value(value, key in ('reason',))}")
    if "evidence" in data:
        out += ["", "[evidence]"] + [f"{k} = {_toml_value(v)}" for k, v in data["evidence"].items()]
    for ch in data["changes"]:
        out += ["", "[[changes]]"] + [f"{k} = {_toml_value(v, k == 'text')}" for k, v in ch.items()]
    text = "\n".join(out) + "\n"
    if tomllib.loads(text) != data:  # what we write must read back exactly
        raise DataError(f"record {data.get('id')}: TOML round trip failed")
    return text


def _traced_to(entry: dict | None) -> list[str]:
    if not entry:
        return []
    t = entry.get("traces_to") or {}
    out = [f"vision {v.get('section')}" for v in t.get("vision", []) if isinstance(v, dict) and v.get("section")]
    for c in t.get("conops", []):
        if isinstance(c, dict) and c.get("scenario"):
            out.append(f"conops {c['scenario']}" + (f".{c['step']}" if c.get("step") is not None else ""))
    out += [f"CLAUDE.md {c.get('section')} — {c.get('line')}" for c in t.get("claude_md", [])
            if isinstance(c, dict) and c.get("section")]
    return out


def _note_commit(root: Path, item: ProseItem) -> str | None:
    """The commit that introduced a note's first line (`git log -S`)."""
    needle = item.summary.removeprefix("Note:").strip()
    if not needle:
        return None
    out = git(root, "log", "--reverse", "--format=%H", "-S", needle, "HEAD", "--", item.file, check=False).split()
    return out[0] if out else None


PLAN_LISTS = ("rationale", "history", "supersede", "retire", "pending")


def load_plan(path: str) -> dict:
    try:
        plan = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DataError(f"{path}: cannot read the classification ({exc})") from None
    if not isinstance(plan, dict):
        raise DataError(f"{path}: expected a JSON object")
    problems = []
    for key in plan:
        if key not in (*PLAN_LISTS, "drop"):
            problems.append(f"plan: unknown key `{key}` (expected {', '.join(PLAN_LISTS)}, drop)")
    for key in PLAN_LISTS:
        if not isinstance(plan.get(key, []), list) or not all(isinstance(e, dict) for e in plan.get(key, [])):
            problems.append(f"plan: `{key}` must be a list of objects")
    if not isinstance(plan.get("drop", []), list):
        problems.append("plan: `drop` must be a list of source IDs")
    if problems:
        raise DataError(problems)
    return {k: plan.get(k, []) for k in (*PLAN_LISTS, "drop")}


def _new_suffix(taken: set[str]) -> str:
    import secrets
    while True:
        s = "".join(secrets.choice(ALNUM) for _ in range(7))
        if s not in taken:
            taken.add(s)
            return s


def delete_scenario(text: str, tor: str, prose: list[ProseItem]) -> str:
    """Remove a Scenario block, the prose attached to it, and one separating blank line."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    start = next(i for i, ln in enumerate(lines) if (m := SCEN.match(ln)) and m.group(1) == tor)
    block = scenario_block(text, tor) or ""
    end = start + len(block.split("\n"))  # exclusive
    attached = [p for p in prose if p.tor == tor and p.end == start]  # directly above the Scenario line
    if attached:
        start = attached[0].line - 1
    if start > 0 and not lines[start - 1].strip() and (end >= len(lines) or not lines[end].strip()):
        start -= 1
    return "\n".join(lines[:start] + lines[end:])


def apply_migration_records(root: Path, plan: dict, base: str | None, today: dt.date, write: bool) -> list[dict]:
    """#20 Migration 4: write the owner-approved classification as Change Records (approved_via =
    "migration", each carrying `migration_source`), move rationale into tracing entries, delete
    already-retired requirements, and record every unexplained trunk edit as a historical reword.
    Idempotent: requirements already recorded are skipped."""
    scan = scan_migration(root, base, today)
    p = load_project(root, today)
    tv = trunk_versions(root, scan.trunk)
    approver = git(root, "config", "user.name", check=False).strip()
    if not approver:
        raise DataError("git config user.name is not set; records name their approver (approved_by)")
    problems: list[str] = []

    # Every source must be classified: strippable prose, ad hoc sidecar keys, unrecorded removals.
    cited = set(plan["drop"]) | {s for key in PLAN_LISTS for e in plan[key] for s in e.get("sources", [])}
    by_id = {it.id: it for it in scan.prose}
    for it in scan.prose:
        if it.strip and it.id not in cited:
            problems.append(f"{it.id}: {it.kind} not classified (cite it in an entry's `sources` or in `drop`)")
    for k in scan.sidecar_keys:
        if k["source"] not in cited:
            problems.append(f"{k['source']}: ad hoc sidecar key not classified")
    removing = {t for key in ("supersede", "retire") for e in plan[key] for t in e.get("tors", [])}
    for r in scan.removed:
        if r["tor"] not in removing:
            problems.append(f"{r['tor']}: deleted before 3.0 without a record — add a supersede or retire entry")

    removed_ids = {r["tor"]: r for r in scan.removed}
    deleting: set[str] = set()
    for key in PLAN_LISTS:
        for n, e in enumerate(plan[key], 1):
            where = f"plan {key} #{n}"
            tors = [e["tor"]] if key == "rationale" else e.get("tors", [])
            if key == "rationale":
                if not isinstance(e.get("tor"), str) or not isinstance(e.get("text"), str) or not e["text"].strip():
                    problems.append(f"{where}: needs `tor` and `text`")
                    continue
            elif not tors or not all(isinstance(t, str) for t in tors):
                problems.append(f"{where}: needs a non-empty `tors` list")
                continue
            for t in tors:
                gone = t in p.gone and t not in p.live
                if key in ("supersede", "retire"):
                    if t not in p.live and t not in removed_ids and not gone:
                        problems.append(f"{where}: {t} is neither live nor a requirement deleted from the trunk")
                    if t in p.live:
                        deleting.add(t)
                elif t not in p.live:
                    problems.append(f"{where}: {t} is not a live requirement")
            if key in ("history", "supersede", "retire", "pending"):
                for field_ in ("title", "reason"):
                    if not isinstance(e.get(field_), str) or not e[field_].strip():
                        problems.append(f"{where}: `{field_}` is required")
            if key in ("supersede", "retire", "pending"):
                kw = e.get("keywords")
                if not isinstance(kw, list) or not kw or not all(isinstance(k, str) and k.strip() for k in kw):
                    problems.append(f"{where}: `keywords` must be a non-empty list")
            if key == "supersede":
                succ = e.get("successors")
                if not isinstance(succ, list) or not succ:
                    problems.append(f"{where}: `successors` must be a non-empty list")
                else:
                    problems += [f"{where}: successor {s} is not a live requirement" for s in succ if s not in p.live]
            if key == "retire" and e.get("removal") not in ("code", "none"):
                problems.append(f'{where}: `removal` must be "code" or "none"')
    for key in ("rationale", "history", "pending"):
        for e in plan[key]:
            for t in ([e.get("tor")] if key == "rationale" else e.get("tors", [])):
                if t in deleting:
                    problems.append(f"plan {key}: {t} is being superseded or retired")
    for e in plan["supersede"]:
        problems += [f"plan supersede: successor {s} is itself being removed" for s in e.get("successors", [])
                     if s in deleting]
    if problems:
        raise DataError(problems)

    taken = {r.id[3:] for r in p.records}
    records: list[dict] = []
    common = {"approved_via": "migration", "approved_by": approver}

    def source_of(e: dict) -> str:
        parts = []
        for s in e.get("sources", []):
            it = by_id.get(s)
            first = it.summary if it else ""
            parts.append(f"{s}: {first}" if first else s)
        return "; ".join(parts) or "git history"

    def refs_of(e: dict, extra: list[str] = ()) -> list[str]:
        shas = list(extra)
        for s in e.get("sources", []):
            if s in by_id and (sha := _note_commit(root, by_id[s])):
                shas.append(sha)
        return list(dict.fromkeys(f"commit {s[:12]}" for s in shas)) + [r for r in e.get("refs", []) if isinstance(r, str)]

    def new_record(kind: str, e: dict, changes: list[dict], extra_refs: list[str] = (), **fields) -> dict:
        suffix = _new_suffix(taken)
        data = {"id": f"CR-{suffix}", "date": today, "kind": kind, "title": e["title"].strip(),
                "reason": e["reason"].strip(), **fields, **common, "refs": refs_of(e, extra_refs)}
        if kind in ("supersede", "retire", "pending"):
            data["keywords"] = [k.strip() for k in e["keywords"]]
        if kind == "retire":
            data["removal"] = e["removal"]
        data["migration_source"] = source_of(e)
        data["changes"] = changes
        return data

    texts: dict[str, str] = {}  # feature file name -> current text (edited in memory)

    def current_text(name: str) -> str:
        if name not in texts:
            texts[name] = (root / REQ_DIR / name).read_text(encoding="utf-8")
        return texts[name]

    def old_version(tor: str) -> tuple[str, str, str]:
        """(feature file, fingerprint, verbatim block) as the requirement last read."""
        if tor in p.live:
            req = p.live[tor]
            return req.feature_file, req.fingerprint, scenario_block(current_text(req.feature_file), tor) or ""
        sha, path = tv.last[tor]
        text = show_at(root, sha, path) or ""
        fp = next(x.fingerprint for x in parse_requirements(text) if x.tor == tor)
        return Path(path).name, fp, scenario_block(text, tor) or ""

    tracing_entries: dict[str, dict] = {}
    for path in tracing_files(root):
        for entry in load_tracing(path).get("requirements", []):
            if isinstance(entry, dict) and isinstance(entry.get("id"), str):
                tracing_entries.setdefault(entry["id"], entry)

    # Supersede and retire: requirements already retired in prose, or deleted before 3.0.
    for key in ("supersede", "retire"):
        for e in plan[key]:
            changes, extra = [], []
            for t in e["tors"]:
                if t in p.gone and t not in p.live:
                    continue  # already recorded (a re-run)
                ff, fp, block = old_version(t)
                ch = {"tor": t, "feature_file": ff, "fingerprint": fp}
                if key == "supersede":
                    ch["successors"] = list(e["successors"])
                else:
                    ch["traced_to"] = _traced_to(tracing_entries.get(t))
                ch["text"] = block
                changes.append(ch)
                if t in removed_ids:
                    extra.append(removed_ids[t]["sha"])
            if changes:
                records.append(new_record(key, e, changes, extra))

    # Pending: open change-control prose becomes a dispute.
    open_named = {t for r in p.open_pending for t in r.tors}
    for e in plan["pending"]:
        tors = [t for t in e["tors"] if t not in open_named]
        if not tors:
            continue
        fields = {"owner": (e.get("owner") or approver).strip()}
        if isinstance(e.get("tracker"), str) and e["tracker"].strip():
            fields["tracker"] = e["tracker"].strip()
        changes = [{"tor": t, "feature_file": p.live[t].feature_file, "fingerprint": p.live[t].fingerprint}
                   for t in tors]
        records.append(new_record("pending", e, changes, **fields))

    # Historical rewords: one record per trunk commit (and history entry) that edited requirements.
    reasons = {t: e for e in plan["history"] for t in e["tors"]}
    groups: dict[tuple[str, int], list[dict]] = {}
    for ev in scan.edits:
        e = reasons.get(ev["tor"])
        groups.setdefault((ev["sha"], id(e) if e else 0), []).append(ev)
    for (sha, _), evs in groups.items():
        subject = evs[0]["subject"]
        if subject.startswith("Merge") and evs[0]["subject"] != "working tree":
            inner = git(root, "log", "-1", "--no-merges", "--format=%s", f"{sha}^1..{sha}", "--",
                        f"{REQ_DIR}/*.feature.md", check=False).strip()
            subject = inner or subject
        e = reasons.get(evs[0]["tor"]) or {
            "title": f"Edited in place before 3.0: {subject}"[:200],
            "reason": f"Recorded by the 3.0 migration from git history (commit {sha[:12]}, {evs[0]['date']}). "
                      "No note in the feature files explained this edit."}
        rec = new_record("reword", {**e, "sources": e.get("sources", [])},
                         [{"tor": ev["tor"], "from": ev["from"], "to": ev["to"]} for ev in evs], [sha],
                         equivalence=HISTORICAL_EQUIVALENCE, evidence={"commit": sha[:12], "result": "historical"})
        if not e.get("sources"):
            rec["migration_source"] = f"git {sha[:12]}"
        records.append(rec)

    # Validate everything before writing anything.
    problems = []
    for rec in records:
        name = f"{rec['date'].isoformat()}-{rec['id'][3:]}.toml"
        problems += [f"{rec['id']}: {x}" for x in validate_record(name, rec)]
    if problems:
        raise DataError(problems)
    rows = [{"record": r["id"], "kind": r["kind"], "tors": [c["tor"] for c in r["changes"]], "title": r["title"],
             "path": f"{CHANGES_DIR}/{r['date'].isoformat()}-{r['id'][3:]}.toml"} for r in records]
    rationale = {e["tor"]: e["text"].strip() for e in plan["rationale"]}
    rows += [{"record": None, "kind": "rationale", "tors": [t], "title": text, "path": None}
             for t, text in rationale.items()]
    rows += [{"record": None, "kind": "delete", "tors": [t], "title": "", "path": f"{REQ_DIR}/{p.live[t].feature_file}"}
             for t in sorted(deleting)]
    if not write:
        return [{**r, "record": "new" if r["record"] else None, "path": None if r["record"] else r["path"]}
                for r in rows]

    for rec, row in zip(records, rows):
        path = root / row["path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(record_toml(rec), encoding="utf-8")
    for t in sorted(deleting):
        name = p.live[t].feature_file
        texts[name] = delete_scenario(current_text(name), t,
                                      [it for it in scan.prose if it.file == f"{REQ_DIR}/{name}"])
        # later deletions in the same file re-scan the edited text
        scan.prose = [it for it in scan.prose if it.file != f"{REQ_DIR}/{name}"] + scan_prose(
            f"{REQ_DIR}/{name}", texts[name])
    for name, text in texts.items():
        path = root / REQ_DIR / name
        if not parse_requirements(text):  # whole-file retirement: the file and its tracing go
            path.unlink()
            tracing = path.with_name(name.removesuffix(".md") + ".tracing.json")
            if tracing.exists():
                tracing.unlink()
        else:
            path.write_text(text, encoding="utf-8")
    gone = {c["tor"] for r in records if r["kind"] in ("supersede", "retire") for c in r["changes"]}
    for path in tracing_files(root):
        data = load_tracing(path)
        reqs = data.get("requirements", [])
        new_reqs = []
        for entry in reqs:
            tid = entry.get("id") if isinstance(entry, dict) else None
            if tid in gone:
                continue
            if tid in rationale:
                entry = {k: v for k, v in entry.items() if k != "rationale"}
                items = list(entry.items())
                at = next((n + 1 for n, (k, _v) in enumerate(items) if k == "id"), 0)
                items.insert(at, ("rationale", rationale[tid]))
                entry = dict(items)
            new_reqs.append(entry)
        if new_reqs != reqs:
            data["requirements"] = new_reqs
            path.write_text(dump_tracing(data, path.read_text(encoding="utf-8")), encoding="utf-8")
    bad = [f"{rel}: {x}" for rel, probs in validate_record_files(root, []) for x in probs]
    if bad:
        raise DataError(bad)
    return rows


def strip_feature_text(rel: str, text: str) -> tuple[str, int]:
    """Remove strippable lifecycle prose; drop a banner left empty. Returns (text, lines removed)."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    drop: set[int] = set()
    for it in scan_prose(rel, text):
        if not it.strip:
            continue
        a, b = it.line - 1, it.end - 1
        drop.update(range(a, b + 1))
        if it.kind != "banner" and a > 0 and not lines[a - 1].strip() and b + 1 < len(lines) and not lines[b + 1].strip():
            drop.add(b + 1)
    kept = [ln for i, ln in enumerate(lines) if i not in drop]
    # A banner whose only text was a marker leaves two rules side by side: drop them.
    out: list[str] = []
    i = 0
    while i < len(kept):
        a, b = kept[i].strip(), kept[i + 1].strip() if i + 1 < len(kept) else ""
        if a.startswith("#") and b.startswith("#") and RULE_LINE.match(a.lstrip("#").strip()) \
                and RULE_LINE.match(b.lstrip("#").strip()):
            i += 2
            if i < len(kept) and not kept[i].strip() and out and not out[-1].strip():
                i += 1
            continue
        out.append(kept[i])
        i += 1
    return "\n".join(out), len(lines) - len(out)


def run_strip(root: Path) -> list[dict]:
    """#20 Migration 5: notes out of feature files, `title`/`generated` out of tracing, title columns
    out of every non-Complete spec. Refuses when any requirement's fingerprint or section would change."""
    p = load_project(root)
    rows = []
    problems = []
    for path in feature_files(root):
        rel = _repo_relative(root, path)
        old = Path(path).read_text(encoding="utf-8")
        new, n = strip_feature_text(rel, old)
        if new == old:
            continue
        before = [(x.tor, x.fingerprint, x.section) for x in parse_requirements(old)]
        after = [(x.tor, x.fingerprint, x.section) for x in parse_requirements(new)]
        if before != after:
            changed = sorted({b[0] for b, a in zip(before, after) if b != a} | ({b[0] for b in before} ^ {a[0] for a in after}))
            problems.append(f"{rel}: stripping would change {', '.join(changed) or 'the requirements'} — "
                            "edit the prose by hand, then re-run")
            continue
        rows.append({"kind": "feature", "path": rel, "lines": n, "text": new})
    for path in tracing_files(root):
        data = load_tracing(path)
        reqs = data.get("requirements", [])
        titles = sum(isinstance(r, dict) and "title" in r for r in reqs)
        if not titles and "generated" not in data:
            continue
        data.pop("generated", None)
        data["requirements"] = [{k: v for k, v in r.items() if k != "title"} if isinstance(r, dict) else r for r in reqs]
        rows.append({"kind": "tracing", "path": f"{REQ_DIR}/{path.name}", "lines": titles,
                     "text": dump_tracing(data, path.read_text(encoding="utf-8"))})
    for path in spec_paths(root):
        epic = spec_epic_id(path.name)
        if epic in p.sidecars and p.sidecars[epic].status == "Complete":
            continue  # Complete specs are history
        old = path.read_text(encoding="utf-8")
        new = strip_anchor_titles(old, p.live)
        if new != old:
            rows.append({"kind": "spec", "path": path.relative_to(root).as_posix(), "lines": 0, "text": new})
    if problems:
        raise DataError(problems)
    return rows


def strip_sidecar_keys(text: str) -> str:
    return "\n".join(ln for ln in text.split("\n")
                     if not ((m := KEY_LINE.match(ln)) and not ln[:1].isspace() and m.group(1) in AD_HOC_KEYS))


def cmd_migrate(args: argparse.Namespace, root: Path) -> int:
    today = _today(args) or dt.date.today()
    if args.action == "scan":
        scan = scan_migration(root, args.base, today)
        if args.json:
            _print_json({"trunk": scan.trunk, "pending": scan.pending, "counts": scan.counts(),
                         "prose": [{**it.__dict__, "id": it.id} for it in scan.prose],
                         "tracing": scan.tracing, "specs": scan.specs, "sidecar_keys": scan.sidecar_keys,
                         "edits": scan.edits, "removed": scan.removed,
                         "seed": [{k: r[k] for k in ("epic", "tor", "fingerprint")} for r in scan.seed],
                         "migration_source": scan.sources})
        else:
            for it in scan.prose:
                print("\t".join(["prose" if it.strip else "kept", it.id, it.kind, it.tor or "—", it.summary]))
            for t in scan.tracing:
                print(f"tracing\t{t['path']}\ttitles: {t['titles']}{'; generated' if t['generated'] else ''}")
            for s in scan.specs:
                print(f"spec\t{s['path']}\t{s['epic']}\t{s['status']}")
            for k in scan.sidecar_keys:
                print(f"sidecar-key\t{k['source']}\t{k['value']}")
            for e in scan.edits:
                print(f"edit\t{e['tor']}\t{e['sha'][:12]}\t{e['date']}\t{e['subject']}")
            for r in scan.removed:
                print(f"removed\t{r['tor']}\t{r['feature_file']}\t{r['sha'][:12]}\t{r['date']}\t{r['subject']}")
            for r in scan.seed:
                print(f"seed\t{r['epic']}\t{r['tor']}")
            for s in scan.sources:
                print(f"migration-source\t{s}")
            c = scan.counts()
            print("pending: " + ", ".join(f"{k} {v}" for k, v in c.items() if v and k != "kept") if scan.pending
                  else "satisfied")
        return EXIT_FINDINGS if scan.pending else EXIT_OK
    if args.action == "records":
        if not args.plan:
            raise DataError("migrate records needs the classification file: --plan <file>")
        rows = apply_migration_records(root, load_plan(args.plan), args.base, today, args.write)
        if args.json:
            _print_json(rows)
        else:
            for r in rows:
                print("\t".join([r["kind"], r["record"] or "—", ", ".join(r["tors"]), r["title"]]))
        return EXIT_OK
    if args.action == "strip":
        rows = run_strip(root)
    elif args.action == "sidecars":
        rows = []
        for path in sorted((root / STATUS_DIR).glob("epic-*.md")) if (root / STATUS_DIR).is_dir() else []:
            old = path.read_text(encoding="utf-8")
            new = strip_sidecar_keys(old)
            if new != old:
                gone = [ln.split(":", 1)[0] for ln in old.split("\n") if ln not in new.split("\n") and ln.strip()]
                rows.append({"kind": "sidecar", "path": path.relative_to(root).as_posix(),
                             "lines": len(gone), "keys": gone, "text": new})
    else:  # finish
        rows = []
        for path in sorted((root / CHANGES_DIR).glob("*.toml")) if (root / CHANGES_DIR).is_dir() else []:
            old = path.read_text(encoding="utf-8")
            new = MIGRATION_SOURCE_LINE.sub("", old)
            if new != old:
                rows.append({"kind": "record", "path": f"{CHANGES_DIR}/{path.name}", "lines": 1, "text": new})
    if args.write:
        for r in rows:
            (root / r["path"]).write_text(r["text"], encoding="utf-8")
        if args.action == "finish":
            bad = [f"{rel}: {x}" for rel, probs in validate_record_files(root, []) for x in probs]
            if bad:
                raise DataError(bad)
    if args.json:
        _print_json([{k: v for k, v in r.items() if k != "text"} for r in rows])
    else:
        for r in rows:
            detail = (", ".join(r["keys"]) if "keys" in r else "title column" if r["kind"] == "spec" else
                      f"{r['lines']} title(s)" + ("" if r["lines"] else ", generated") if r["kind"] == "tracing" else
                      "migration_source" if r["kind"] == "record" else f"{r['lines']} line(s)")
            print(f"{r['kind']}\t{r['path']}\t{detail}")
    return EXIT_OK if args.write or not rows else EXIT_FINDINGS


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


# -- Authoring: record validation, the re-litigation search, scenario text ----------------------

def validate_record_files(root: Path, paths: list[str]) -> list[tuple[str, list[str]]]:
    """(path, problems) per record file: TOML, schema, and record-ID clashes with every other
    record in the changes folder. Empty problems = valid."""
    targets = [Path(p) if Path(p).is_absolute() else root / p for p in paths] or sorted(
        (root / CHANGES_DIR).glob("*.toml"))
    by_id: dict[str, list[str]] = {}
    pending_tors: dict[str, set[str]] = {}  # pending record ID -> the TORs it names
    for path in sorted((root / CHANGES_DIR).glob("*.toml")):
        try:
            other = tomllib.loads(path.read_text(encoding="utf-8"))
        except (tomllib.TOMLDecodeError, OSError):
            continue
        rid = other.get("id")
        if isinstance(rid, str):
            by_id.setdefault(rid, []).append(path.name)
            if other.get("kind") == "pending" and isinstance(other.get("changes"), list):
                pending_tors[rid] = {c.get("tor") for c in other["changes"] if isinstance(c, dict)}
    out = []
    for path in targets:
        rel = _repo_relative(root, str(path))
        if not path.is_file():
            out.append((rel, ["no such file"]))
            continue
        try:
            data = tomllib.loads(path.read_text(encoding="utf-8"))
        except tomllib.TOMLDecodeError as exc:
            out.append((rel, [f"not valid TOML ({exc})"]))
            continue
        problems = validate_record(path.name, data)
        if not rel.startswith(CHANGES_DIR + "/") or path.parent.name != "changes":
            problems.append(f"records live in {CHANGES_DIR}/")
        rid = data.get("id")
        clashes = [n for n in by_id.get(rid, []) if n != path.name] if isinstance(rid, str) else []
        if clashes:
            problems.append(f"record ID {rid} is also used by {', '.join(clashes)}")
        if data.get("kind") == "uphold" and not problems:
            named = {cr for ref in data["refs"] if isinstance(ref, str) for cr in CR_ANY.findall(ref)}
            for ch in data["changes"]:
                if not any(ch["tor"] in pending_tors.get(cr, ()) for cr in named):
                    problems.append(f"{ch['tor']}: no pending record in `refs` names it — an uphold "
                                    "closes a pending record on the same requirement")
        out.append((rel, problems))
    return out


SEARCH_KINDS = ("supersede", "retire", "pending", "uphold")


def search_records(records: list[Record], terms: list[str]) -> list[dict]:
    """Re-litigation guard: supersede, retire, pending, and uphold records whose title, reason, or
    keywords mention any of `terms` (case, punctuation, and spacing ignored; whole words)."""
    wanted = [(t, normalize(t)) for t in terms if normalize(t)]
    closed_by: dict[str, str] = {}  # pending record ID -> the later record that refs it
    for r in records:
        for ref in r.data.get("refs", []):
            for cr in CR_ANY.findall(ref):
                if cr != r.id:
                    closed_by.setdefault(cr, r.id)
    rows = []
    for r in records:
        if r.kind not in SEARCH_KINDS:
            continue
        hay = " " + normalize(" ".join([r.data["title"], r.data["reason"], *r.data.get("keywords", [])])) + " "
        hits = [t for t, n in wanted if f" {n} " in hay]
        if hits:
            rows.append({"record": r.id, "date": r.date.isoformat(), "kind": r.kind, "tors": r.tors,
                         "title": r.data["title"], "reason": r.data["reason"].strip(),
                         "matched": hits, "path": r.path,
                         "closed_by": closed_by.get(r.id) if r.kind == "pending" else None})
    return rows


FENCE = re.compile(r"^\s*```")


def scenario_block(text: str, tor: str) -> str | None:
    """The `Scenario: [tor]` block verbatim: its line through its last step. Stops at the next
    Scenario or Feature line, a code fence, or a `---` rule; trailing blank and comment lines
    (the next section's banner) are dropped."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    start = next((i for i, ln in enumerate(lines) if (m := SCEN.match(ln)) and m.group(1) == tor), None)
    if start is None:
        return None
    end = start + 1
    while end < len(lines) and not (SCEN.match(lines[end]) or FEAT.match(lines[end]) or FENCE.match(lines[end])
                                    or lines[end].strip() == "---"):
        end += 1
    block = lines[start:end]
    while block and (not block[-1].strip() or block[-1].lstrip().startswith("#")):
        block.pop()
    return "\n".join(ln.rstrip() for ln in block)


def verified_version(root: Path, tor: str) -> dict | None:
    """The scenario text an owning Complete epic verified: the newest version on HEAD's history
    of the requirement's feature file whose fingerprint equals the saved `verified:` value."""
    project = load_project(root)
    saved = next(((s.epic, s.verified[tor]) for s in sorted(project.sidecars.values(), key=lambda s: s.epic)
                  if s.status == "Complete" and tor in s.verified), None)
    if saved is None:
        return None
    epic, fp = saved
    req = project.live.get(tor)
    files = [f"{REQ_DIR}/{req.feature_file}"] if req else [f"{REQ_DIR}/{FEATURE_GLOB}"]
    log = git(root, "log", "--format=%x01%H", "--name-only", "--no-renames", "HEAD", "--", *files, check=False)
    plan = []
    for block in log.split("\x01")[1:]:
        lines = [ln for ln in block.splitlines() if ln.strip()]
        plan += [(lines[0], p) for p in lines[1:] if p.endswith(".feature.md")]
    for (sha, path), text in zip(plan, read_blobs(root, [f"{s}:{p}" for s, p in plan])):
        if text and any(p.tor == tor and p.fingerprint == fp for p in parse_requirements(text)):
            return {"tor": tor, "epic": epic, "fingerprint": fp, "commit": sha,
                    "feature_file": Path(path).name, "text": scenario_block(text, tor)}
    return {"tor": tor, "epic": epic, "fingerprint": fp, "commit": None, "feature_file": None, "text": None}


def cmd_fingerprint(args: argparse.Namespace, root: Path) -> int:
    if args.rev:
        rels = [_repo_relative(root, f) for f in args.files] or feature_files_at(root, args.rev)
        results = parse_files_at(root, args.rev, rels)
    else:
        results = parse_files(args.files or feature_files(root))
    now = {tor: fp for scenarios in results for tor, _title, fp in scenarios}
    if args.against:
        try:
            before = dict(row.split("\t")[:2] for row in Path(args.against).read_text(encoding="utf-8").splitlines()
                          if row.strip())
        except (OSError, ValueError) as exc:
            raise DataError(f"--against {args.against}: expected `fingerprint` output ({exc})") from None
        gone = {t: r for r in load_records(root) if r.kind in ("supersede", "retire") for t in r.tors}
        bad = 0
        for tor, fp in before.items():
            if tor not in now:
                rec = gone.get(tor)
                bad += rec is None
                print(f"{tor}\tremoved\t{rec.id if rec else 'no change record'}")
            elif now[tor] != fp:
                bad += 1
                print(f"{tor}\tchanged\t{fp}\t{now[tor]}")
        same = sum(1 for t, fp in before.items() if now.get(t) == fp)
        print(f"identical\t{same}")
        return EXIT_FINDINGS if bad else EXIT_OK
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


def _today(args: argparse.Namespace) -> dt.date | None:
    try:
        return dt.date.fromisoformat(args.today) if args.today else None
    except ValueError:
        raise DataError(f"--today {args.today}: expected YYYY-MM-DD") from None


def _print_json(data) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False))


FINDING_HEADINGS = {
    "A": "A. Unrecorded change", "B": "B. Unrecorded removal", "C": "C. Dangling ID",
    "D": "D. Changed since verified", "E": "E. Retired or superseded ID still cited", "F": "F. Housekeeping",
}


def finding_epic(project: Project, f: dict) -> str | None:
    """The epic a finding belongs to: its own, else the epic that owns (or listed) its requirement."""
    if f.get("epic"):
        return f["epic"]
    tor = f.get("tor")
    if not tor:
        return None
    owners = project.owners(tor) or [s for s in project.sidecars.values() if tor in s.requirements]
    return min((s.epic for s in owners), default=None)


def epic_label(root: Path, epic: str) -> str:
    """`<id> (<slug>) — <Name>` from the epic's spec (its file name and `# Epic <id>: <Name>` heading),
    or the bare ID when there is no spec."""
    spec = next(iter(sorted(root.glob(f"docs/implementation-plan/phase-*/epic-{epic}-*.md"))), None)
    if spec is None:
        return epic
    label = f"{epic} ({spec.stem[len('epic-') + len(epic) + 1:]})"
    heading = next((ln for ln in spec.read_text(encoding="utf-8").splitlines() if ln.startswith("# ")), "")
    name = heading.split(":", 1)[1].strip() if ":" in heading else ""
    return f"{label} — {name}" if name else label


def cmd_check(args: argparse.Namespace, root: Path) -> int:
    project = load_project(root, _today(args))
    report = run_check(project, args.base)
    if args.json:
        _print_json(report)
    elif args.by_epic:
        groups: dict[str | None, list[dict]] = {}
        for f in report["findings"]:
            groups.setdefault(finding_epic(project, f), []).append(f)
        for epic in sorted(groups, key=lambda e: (e is None, e or "")):
            rows = groups[epic]
            print(f"Epic {epic_label(root, epic)} ({len(rows)})" if epic else f"No epic ({len(rows)})")
            for f in rows:
                print(f"  - {f['letter']}. {f['message']}")
    else:
        for letter, heading in FINDING_HEADINGS.items():
            rows = [f for f in report["findings"] if f["letter"] == letter]
            if rows:
                print(f"{heading} ({len(rows)})")
                for f in rows:
                    mark = "[this branch, blocking] " if f["blocking"] else (
                        "[this branch] " if f["own_branch"] else "")
                    print(f"  - {mark}{f['message']}")
    if not args.json:
        total = sum(report["counts"].values())
        scope = f" (branch since {report['merge_base'][:7]})" if report["merge_base"] else ""
        letters = ", ".join(f"{n} {k}" for k, n in report["counts"].items() if n)
        print(f"{total} finding(s){scope} ({letters}); {report['blocking']} blocking." if total
              else f"No findings{scope}.")
    return EXIT_FINDINGS if report["findings"] else EXIT_OK


def cmd_states(args: argparse.Namespace, root: Path) -> int:
    report = derive_states(load_project(root, _today(args)))
    if args.json:
        _print_json(report)
        return EXIT_OK
    for r in report["requirements"]:
        print("\t".join([r["tor"], r["state"], r.get("epic") or "—", r.get("title", "")]))
    s = report["summary"]
    print(f"{s['verified']} of {s['live']} live requirements verified ({s['verified_percent']}%).")
    return EXIT_OK


def cmd_sweep(args: argparse.Namespace, root: Path) -> int:
    ids = [i for raw in args.ids for i in _id_list(raw)]
    bad = [i for i in ids if not TOR_RE.match(i)]
    if bad:
        raise DataError([f"{i}: not a TOR-NN-XXXXXXX ID" for i in bad])
    rows = run_sweep(load_project(root), ids or None)
    if args.json:
        _print_json(rows)
    else:
        for r in rows:
            what = f"superseded by {', '.join(r['successors'])}" if r["kind"] == "supersede" else "retired"
            print(f"{r['tor']}\t{r['path']}:{r['line']}\t{what} ({r['record']})")
    return EXIT_FINDINGS if rows else EXIT_OK


def cmd_seed(args: argparse.Namespace, root: Path) -> int:
    rows = run_seed(load_project(root))
    if args.write:
        by_epic: dict[str, dict[str, str]] = {}
        for r in rows:
            if r["fingerprint"]:
                by_epic.setdefault(r["epic"], {})[r["tor"]] = r["fingerprint"]
        for epic, lines in by_epic.items():
            path = root / STATUS_DIR / f"epic-{epic}.md"
            path.write_text(write_verified(path.read_text(encoding="utf-8"), lines), encoding="utf-8")
    if args.json:
        _print_json(rows)
    else:
        for r in rows:
            print("\t".join([r["epic"], r["tor"], r["fingerprint"] or "legacy",
                             (r["commit"] or "—")[:12] if r["fingerprint"] else r["reason"]]))
    return EXIT_OK


def cmd_mark(args: argparse.Namespace, root: Path) -> int:
    """Record verification results in one epic's sidecar (wrapup Step 2.2, reverify, quick-fix)."""
    epic = args.epic
    path = root / STATUS_DIR / f"epic-{epic}.md"
    if not path.is_file():
        raise DataError(f"{STATUS_DIR}/epic-{epic}.md does not exist")
    text = path.read_text(encoding="utf-8")
    sc = parse_sidecar(epic, text, f"{STATUS_DIR}/epic-{epic}.md")
    ids = lambda raw: [i for r in raw for i in _id_list(r)]  # noqa: E731
    append, passes = ids(args.append), ids(args.passes)
    fails = {tor: reason.strip() for tor, reason in args.fail}
    named = append + passes + list(fails)
    if not named and not args.reverified:
        raise DataError("nothing to do: give --append, --pass, --fail, or --reverified")
    live = live_requirements(root)
    owned = set(sc.requirements) | set(append)
    problems = [f"{t}: not a TOR-NN-XXXXXXX ID" for t in named if not TOR_RE.match(t)]
    problems += [f"{t}: not a live requirement" for t in named if TOR_RE.match(t) and t not in live]
    problems += [f"{t}: not in epic {epic}'s requirements:" for t in passes + list(fails) if t not in owned]
    problems += [f"{t}: epic {epic} waives it (waived requirements get no verified: line)"
                 for t in passes + list(fails) if t in sc.waived]
    problems += [f"{t}: both --pass and --fail" for t in passes if t in fails]
    problems += [f"{t}: --fail needs a reason" for t, why in fails.items() if not why]
    if problems:
        raise DataError(problems)
    today = (_today(args) or dt.date.today()).isoformat()
    new = mark_sidecar(text, append=append, verified={t: live[t].fingerprint for t in passes},
                       unverified={t: f"{today} {why}" for t, why in fails.items()},
                       reverified=today if args.reverified else None)
    parse_sidecar(epic, new, f"{STATUS_DIR}/epic-{epic}.md")  # never write a sidecar we cannot read
    path.write_text(new, encoding="utf-8")
    for t in append:
        print(f"{epic}\trequirements\t+{t}" if t not in sc.requirements else f"{epic}\trequirements\t{t} (already listed)")
    for t in passes:
        print(f"{epic}\tverified\t{t}: {live[t].fingerprint}")
    for t, why in fails.items():
        print(f"{epic}\tunverified\t{t}: {today} {why}")
    if args.reverified:
        print(f"{epic}\treverified\t{today}")
    return EXIT_OK


def cmd_format(args: argparse.Namespace, root: Path) -> int:
    if args.init:
        st = format_status(root)
        if st.verdict == "new":
            write_stamp_format(root, PLUGIN_FORMAT, lifecycle=True)
            print(f"stamped\t{PLUGIN_FORMAT}\t{STAMP_PATH}")
            return EXIT_OK
        if st.stamped and st.verdict in ("current", "behind", "ahead"):
            print(f"already-stamped\t{st.project}\t{STAMP_PATH}")
            print(st.message)
            return EXIT_OK if st.verdict == "current" else EXIT_FINDINGS
        print(f"not-stamped\t{st.project}\t{STAMP_PATH}")
        print(st.message if st.verdict == "not-peak-workflow" else
              "This project already has peak-workflow files but no format stamp, so it is on format 0. "
              "It is not stamped here: run /peak-workflow:upgrade, which checks each step and stamps it.")
        return EXIT_FINDINGS
    if args.set is not None:
        stamp = load_stamp(root)
        if not 0 <= args.set <= PLUGIN_FORMAT:
            raise DataError(f"--set {args.set}: this plugin knows formats 0 to {PLUGIN_FORMAT}")
        if args.set < stamp.format:
            raise DataError(f"--set {args.set}: the project is already on format {stamp.format}; "
                            "upgrades only move forward")
        write_stamp_format(root, args.set, lifecycle=not stamp.present)
        print(f"stamped\t{args.set}\t{STAMP_PATH}")
        return EXIT_OK
    st = format_status(root)
    print(f"verdict: {st.verdict}")
    print(f"project: {st.project}{'' if st.stamped else ' (no stamp)'}")
    print(f"plugin: {st.plugin}")
    print(st.message)
    return EXIT_OK if st.verdict in ("current", "new") else EXIT_FINDINGS


def cmd_provenance(args: argparse.Namespace, root: Path) -> int:
    skip = {i for raw in args.skip for i in _id_list(raw)}
    rows = run_provenance(root, args.base, skip)
    if args.write:
        for r in rows:
            (root / r["path"]).write_text(r["text"], encoding="utf-8")
    if args.json:
        _print_json([{k: v for k, v in r.items() if k != "text"} for r in rows])
    else:
        for r in rows:
            print("\t".join([r["path"], "; ".join(f"{k}: {v}" for k, v in r["lines"].items())]))
    return EXIT_OK if args.write or not rows else EXIT_FINDINGS


def cmd_inflight(args: argparse.Namespace, root: Path) -> int:
    rows = inflight_branches(root, args.base, args.paths)
    for branch, path in rows:
        print(f"{branch}\t{path}")
    return EXIT_FINDINGS if rows else EXIT_OK


def cmd_validate(args: argparse.Namespace, root: Path) -> int:
    rows = validate_record_files(root, args.files)
    for rel, problems in rows:
        if problems:
            for problem in problems:
                print(f"{rel}\t{problem}")
        else:
            print(f"{rel}\tok")
    return EXIT_FINDINGS if any(problems for _rel, problems in rows) else EXIT_OK


def cmd_search(args: argparse.Namespace, root: Path) -> int:
    rows = search_records(load_records(root), args.terms)
    if args.json:
        _print_json(rows)
    else:
        for r in rows:
            kind = f"{r['kind']} (closed by {r['closed_by']})" if r["closed_by"] else r["kind"]
            print("\t".join([r["record"], r["date"], kind, ", ".join(r["tors"]), r["title"],
                             "matched: " + ", ".join(r["matched"])]))
    return EXIT_FINDINGS if rows else EXIT_OK


def cmd_text(args: argparse.Namespace, root: Path) -> int:
    if not TOR_RE.match(args.tor):
        raise DataError(f"{args.tor}: not a TOR-NN-XXXXXXX ID")
    if args.verified:
        row = verified_version(root, args.tor)
        if row is None:
            print(f"{args.tor}: no Complete epic has a verified: line for it.", file=sys.stderr)
            return EXIT_FINDINGS
        if row["text"] is None:
            print(f"{args.tor}: no version on this branch's history has the fingerprint epic "
                  f"{row['epic']} verified ({row['fingerprint']}).", file=sys.stderr)
            return EXIT_FINDINGS
    else:
        rel = None
        if args.rev:
            texts = {r: show_at(root, args.rev, r) for r in feature_files_at(root, args.rev)}
        else:
            texts = {_repo_relative(root, p): Path(p).read_text(encoding="utf-8") for p in feature_files(root)}
        for rel_path, text in texts.items():
            block = scenario_block(text or "", args.tor)
            if block is not None:
                rel = rel_path
                break
        if rel is None:
            print(f"{args.tor}: not in any feature file{' at ' + args.rev if args.rev else ''}.", file=sys.stderr)
            return EXIT_FINDINGS
        [(_tor, fp)] = [x for x in fingerprint_text(texts[rel]) if x[0] == args.tor]
        row = {"tor": args.tor, "fingerprint": fp, "commit": args.rev, "feature_file": Path(rel).name,
               "text": block}
    if args.json:
        _print_json(row)
    else:
        print(row["text"])
    return EXIT_OK


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
    fp.add_argument("--against", metavar="FILE",
                    help="compare with an earlier `fingerprint` output; exit 1 when a surviving requirement "
                         "changed or one disappeared without a change record")
    fp.set_defaults(func=cmd_fingerprint)

    ti = sub.add_parser("titles", help="print TOR-ID<TAB>current title (or what retired it)")
    ti.add_argument("ids", nargs="+", help="TOR IDs, space- or comma-separated")
    ti.set_defaults(func=cmd_titles)

    ch = sub.add_parser("check", help="health check: findings A-F (exit 1 when any)")
    ch.add_argument("--base", help="base branch; marks findings this branch introduced (since the merge base)")
    ch.add_argument("--json", action="store_true")
    ch.add_argument("--by-epic", action="store_true", help="group the findings by epic (text output)")
    ch.add_argument("--today", help=argparse.SUPPRESS)
    ch.set_defaults(func=cmd_check)

    st = sub.add_parser("states", help="derived state of every requirement")
    st.add_argument("--json", action="store_true")
    st.add_argument("--today", help=argparse.SUPPRESS)
    st.set_defaults(func=cmd_states)

    sw = sub.add_parser("sweep", help="tests and source citing superseded or retired IDs (exit 1 when any)")
    sw.add_argument("ids", nargs="*", help="only these IDs (default: every retired or superseded ID)")
    sw.add_argument("--json", action="store_true")
    sw.set_defaults(func=cmd_sweep)

    se = sub.add_parser("seed", help="fingerprint Complete epics' requirements at their completion commit")
    se.add_argument("--write", action="store_true", help="add the results to the sidecars' verified: blocks")
    se.add_argument("--json", action="store_true")
    se.set_defaults(func=cmd_seed)

    mk = sub.add_parser("mark", help="record verification results in an epic's sidecar (verified:, unverified:, "
                                     "reverified:, requirements: append)")
    mk.add_argument("epic", help="epic ID (docs/implementation-plan/status/epic-<id>.md)")
    mk.add_argument("--pass", dest="passes", action="extend", nargs="+", default=[], metavar="TOR",
                    help="write a verified: line with the current fingerprint (drops its unverified: line)")
    mk.add_argument("--fail", action="append", nargs=2, default=[], metavar=("TOR", "REASON"),
                    help="write an unverified: line dated today (drops its verified: line)")
    mk.add_argument("--append", action="extend", nargs="+", default=[], metavar="TOR",
                    help="add a live requirement to requirements: (never removes one)")
    mk.add_argument("--reverified", action="store_true", help="set reverified: to today")
    mk.add_argument("--today", help=argparse.SUPPRESS)
    mk.set_defaults(func=cmd_mark)

    fo = sub.add_parser("format", help="compare the project's format stamp with this plugin's (exit 1 unless current or new)")
    mode = fo.add_mutually_exclusive_group()
    mode.add_argument("--init", action="store_true",
                      help="stamp a project that has no peak-workflow files yet (setup)")
    mode.add_argument("--set", type=int, metavar="N", help="move the stamp forward to format N (upgrade)")
    fo.set_defaults(func=cmd_format)

    pv = sub.add_parser("provenance", help="step 0001: spec Planned by/Planned/Plan branch and sidecar owner lines to backfill (exit 1 when any)")
    pv.add_argument("--base", help="base branch (default: develop, main, master)")
    pv.add_argument("--skip", action="append", default=[], help="epic IDs to leave alone, space- or comma-separated")
    pv.add_argument("--write", action="store_true", help="apply the backfill")
    pv.add_argument("--json", action="store_true")
    pv.set_defaults(func=cmd_provenance)

    inf = sub.add_parser("inflight", help="unmerged branches that touch the given paths (exit 1 when any)")
    inf.add_argument("paths", nargs="+", help="files or folders")
    inf.add_argument("--base", help="base branch (default: develop, main, master)")
    inf.set_defaults(func=cmd_inflight)

    va = sub.add_parser("validate", help="schema-check Change Records (exit 1 when any problem)")
    va.add_argument("files", nargs="*", help=f"record files (default: every {CHANGES_DIR}/*.toml)")
    va.set_defaults(func=cmd_validate)

    sr = sub.add_parser("search", help="re-litigation guard: supersede/retire/pending/uphold records whose title, "
                                        "reason, or keywords mention a term (exit 1 when any)")
    sr.add_argument("terms", nargs="+", help="words or phrases (quote a phrase)")
    sr.add_argument("--json", action="store_true")
    sr.set_defaults(func=cmd_search)

    tx = sub.add_parser("text", help="print a requirement's Scenario block verbatim (exit 1 when not found)")
    tx.add_argument("tor")
    where = tx.add_mutually_exclusive_group()
    where.add_argument("--rev", help="as it was at this commit")
    where.add_argument("--verified", action="store_true",
                       help="the version an owning Complete epic verified (matched by its saved fingerprint)")
    tx.add_argument("--json", action="store_true")
    tx.set_defaults(func=cmd_text)

    mg = sub.add_parser("migrate", help="step 0002 (requirements lifecycle) mechanics; exit 1 when work is pending")
    mg.add_argument("action", choices=("scan", "records", "strip", "sidecars", "finish"),
                    help="scan: prerequisites + inventory (the detect); records: write the classified Change "
                         "Records (--plan); strip: notes, tracing titles, spec title columns; sidecars: ad hoc "
                         "keys; finish: drop migration_source from records")
    mg.add_argument("--plan", help="records: the owner-approved classification (JSON)")
    mg.add_argument("--base", help="base branch (default: develop, main, master)")
    mg.add_argument("--write", action="store_true", help="apply (default: preview)")
    mg.add_argument("--json", action="store_true")
    mg.add_argument("--today", help=argparse.SUPPRESS)
    mg.set_defaults(func=cmd_migrate)

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
