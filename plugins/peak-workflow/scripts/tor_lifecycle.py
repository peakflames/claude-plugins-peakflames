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

    if start:  # Branch-scoped A and B: every change since the branch start needs a branch record.
        by_tor = {}
        for f in findings:
            by_tor.setdefault((f.letter, f.tor), f)
        branch_project = Project(root, p.stamp, p.live, branch_records, p.sidecars, p.today)
        for tor, then in start.live.items():
            now = p.live.get(tor)
            if now and now.fingerprint != then.fingerprint and branch_project.reword_chain(
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

    # D — changed since verified.
    for sc in p.sidecars.values():
        if sc.status != "Complete":
            continue
        for tor, saved in sc.verified.items():
            req = p.live.get(tor)
            if req and saved != req.fingerprint and p.reword_chain(tor, saved, req.fingerprint, True) is None:
                then = start.live.get(tor) if start else None
                findings.append(Finding("D", f"{tor} changed after epic {sc.epic} verified it. Re-check "
                                        f"it: /peak-workflow:wrapup-epic {sc.epic} reverify", tor=tor,
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
            out.append(Finding("F", f"{tor} is known to be wrong and still marked done "
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


def _today(args: argparse.Namespace) -> dt.date | None:
    try:
        return dt.date.fromisoformat(args.today) if args.today else None
    except ValueError:
        raise DataError(f"--today {args.today}: expected YYYY-MM-DD") from None


def _print_json(data) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False))


FINDING_HEADINGS = {
    "A": "A. Unrecorded change", "B": "B. Unrecorded removal", "C": "C. Dangling ID",
    "D": "D. Changed since verified", "E": "E. Retired ID still cited", "F": "F. Housekeeping",
}


def cmd_check(args: argparse.Namespace, root: Path) -> int:
    report = run_check(load_project(root, _today(args)), args.base)
    if args.json:
        _print_json(report)
    else:
        for letter, heading in FINDING_HEADINGS.items():
            rows = [f for f in report["findings"] if f["letter"] == letter]
            if rows:
                print(f"{heading} ({len(rows)})")
                for f in rows:
                    mark = "[this branch, blocking] " if f["blocking"] else (
                        "[this branch] " if f["own_branch"] else "")
                    print(f"  - {mark}{f['message']}")
        total = sum(report["counts"].values())
        scope = f" (branch since {report['merge_base'][:7]})" if report["merge_base"] else ""
        print(f"{total} finding(s){scope}; {report['blocking']} blocking." if total
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

    ch = sub.add_parser("check", help="health check: findings A-F (exit 1 when any)")
    ch.add_argument("--base", help="base branch; marks findings this branch introduced (since the merge base)")
    ch.add_argument("--json", action="store_true")
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
