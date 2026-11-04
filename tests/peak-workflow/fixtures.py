"""Fixture builder for peak-workflow tests: tmpdir git repos holding a scripted project history.

Reused by every 3.0 plan. Typical use:

    with FixtureRepo() as repo:
        repo.feature("01", "cli", [scenario("TOR-01-Abc1234", "The tool shall ...")])
        repo.sidecar("aB3dE5f", status="Complete", requirements=["TOR-01-Abc1234"])
        sha = repo.commit("plan")
        result = repo.cli("fingerprint")
"""
from __future__ import annotations

import datetime as dt
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = REPO_ROOT / "plugins" / "peak-workflow" / "scripts"
SCRIPT = SCRIPTS / "tor_lifecycle.py"
WRAPPER = SCRIPTS / "tor-lifecycle"

sys.path.insert(0, str(SCRIPTS))
import tor_lifecycle  # noqa: E402  (re-exported for tests)


@dataclass
class Scenario:
    tor: str
    title: str
    steps: list[str] = field(default_factory=lambda: [
        "Given a precondition", "When an action happens", "Then an outcome is observed"])
    verification: str | None = None
    note: list[str] | None = None  # lines of a `# Note:` block (legacy prose)

    def render(self) -> str:
        lines = [f"Scenario: [{self.tor}] {self.title}"]
        if self.note:
            lines += ["    #", "    # Note:"] + [f"    #   {n}" for n in self.note] + ["    #"]
        if self.verification:
            lines.append(f"    # Verification: {self.verification}")
        lines += [f"    {s}" for s in self.steps]
        return "\n".join(lines)

    def fp(self) -> str:
        """This Scenario's fingerprint, computed by the helper under test."""
        [(_tor, fp)] = tor_lifecycle.fingerprint_text(self.render())
        return fp


def scenario(tor: str, title: str, *steps: str, **kw) -> Scenario:
    return Scenario(tor, title, list(steps), **kw) if steps else Scenario(tor, title, **kw)


def feature_text(nn: str, title: str, scenarios: list[Scenario], banner: str | None = None,
                 fenced: bool = True) -> str:
    head = [f"Feature: {int(nn)}.0 {title}", "    As a user", "    I want things", "    So that value", ""]
    if banner:
        head += ["# " + "-" * 40, f"# {banner}", "# " + "-" * 40, ""]
    body = "\n\n".join(s.render() for s in scenarios)
    gherkin = "\n".join(head) + "\n" + body + "\n"
    if fenced:
        return f"# {title}\n\n```gherkin\n{gherkin}```\n"
    return gherkin


def toml_value(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, str):
        if "\n" in value:
            return '"""\n' + value.replace("\\", "\\\\").replace('"""', '\\"""') + '"""'
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
    if isinstance(value, list):
        return "[" + ", ".join(toml_value(v) for v in value) + "]"
    raise TypeError(f"no TOML form for {value!r}")


def to_toml(data: dict) -> str:
    """Minimal TOML writer: scalars and lists, then [tables], then [[arrays of tables]]."""
    out, tables, arrays = [], [], []
    for key, value in data.items():
        if isinstance(value, dict):
            tables.append((key, value))
        elif isinstance(value, list) and value and all(isinstance(v, dict) for v in value):
            arrays.append((key, value))
        else:
            out.append(f"{key} = {toml_value(value)}")
    for key, table in tables:
        out += ["", f"[{key}]"] + [f"{k} = {toml_value(v)}" for k, v in table.items()]
    for key, items in arrays:
        for item in items:
            out += ["", f"[[{key}]]"] + [f"{k} = {toml_value(v)}" for k, v in item.items()]
    return "\n".join(out) + "\n"


def record_data(kind: str, suffix: str, date: str = "2026-10-21", /, tors: list[str] | None = None,
                **overrides) -> dict:
    """A schema-valid Change Record of `kind`; `overrides` replace or (with None) delete keys.

    The first three parameters are positional-only so `kind=`, `date=` can be overridden."""
    tors = tors or ["TOR-01-Abc1234"]
    data: dict = {
        "id": f"CR-{suffix}", "date": dt.date.fromisoformat(date), "kind": kind,
        "title": f"A {kind} record", "reason": "Because the fixture says so.",
        "approved_via": "docs-branch", "approved_by": "A. Maintainer", "refs": ["issue #1"],
    }
    if kind in ("supersede", "retire", "pending", "uphold"):
        data["keywords"] = ["fixture"]
    if kind == "reword":
        data["equivalence"] = "No plausible implementation passes one version and fails the other."
        data["evidence"] = {"commit": "1a2b3c4", "result": "pass", "tests": ["test/a.test.ts"]}
        data["changes"] = [{"tor": t, "from": "0" * 12, "to": "1" * 12} for t in tors]
    elif kind == "supersede":
        data["changes"] = [{"tor": t, "feature_file": "01-core.feature.md", "fingerprint": "a" * 12,
                            "successors": ["TOR-01-Succ001"], "text": f"Scenario: [{t}] old"} for t in tors]
    elif kind == "retire":
        data["removal"] = "none"
        data["changes"] = [{"tor": t, "feature_file": "01-core.feature.md", "fingerprint": "b" * 12,
                            "traced_to": ["vision G1"], "text": f"Scenario: [{t}] old"} for t in tors]
    elif kind == "pending":
        data["owner"] = "A. Maintainer"
        data["changes"] = [{"tor": t, "feature_file": "01-core.feature.md", "fingerprint": "c" * 12}
                           for t in tors]
    elif kind == "uphold":
        data["refs"] = ["CR-Pnd0001"]
        data["changes"] = [{"tor": t, "feature_file": "01-core.feature.md", "fingerprint": "c" * 12}
                           for t in tors]
    for key, value in overrides.items():
        if value is None:
            data.pop(key, None)
        else:
            data[key] = value
    return data


class FixtureRepo:
    """A throwaway git repository with helpers to write peak-workflow artifacts and commit them."""

    def __init__(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="pw-fixture-")).resolve()
        self.git("init", "-q", "-b", "develop")
        self.git("config", "user.name", "Fixture Author")
        self.git("config", "user.email", "fixture@example.com")
        self.git("config", "commit.gpgsign", "false")

    @classmethod
    def open(cls, path: Path) -> "FixtureRepo":
        """Wrap an existing fixture repository (e.g. one a dry-run builder made) to add history."""
        repo = cls.__new__(cls)
        repo.root = Path(path).resolve()
        return repo

    def __enter__(self) -> "FixtureRepo":
        return self

    def __exit__(self, *exc) -> None:
        self.cleanup()

    def cleanup(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)

    # -- files -----------------------------------------------------------------------------

    def write(self, relpath: str, text: str) -> Path:
        path = self.root / relpath
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def remove(self, relpath: str) -> None:
        (self.root / relpath).unlink()

    def feature(self, nn: str, name: str, scenarios: list[Scenario], **kw) -> Path:
        return self.write(f"docs/requirements/{nn}-{name}.feature.md",
                          feature_text(nn, name.replace("-", " ").title(), scenarios, **kw))

    def sidecar(self, epic: str, status: str = "Not Started", requirements: list[str] | None = None,
                verified: dict[str, str] | None = None, unverified: dict[str, str] | None = None,
                **lines: str) -> Path:
        """Write status/epic-<epic>.md. Extra keyword lines (owner=, waived=, retires=, ...) follow."""
        out = [f"status: {status}", f"owner: {lines.pop('owner', '—')}",
               f"implemented: {lines.pop('implemented', '—')}",
               f"completed: {lines.pop('completed', '—')}", f"handoff: {lines.pop('handoff', '—')}",
               f"requirements: {', '.join(requirements) if requirements else '—'}"]
        out += [f"{k}: {v}" for k, v in lines.items()]
        if verified:
            out.append("verified:")
            out += [f"  {tor}: {fp}" for tor, fp in verified.items()]
        if unverified:
            out.append("unverified:")
            out += [f"  {tor}: {why}" for tor, why in unverified.items()]
        return self.write(f"docs/implementation-plan/status/epic-{epic}.md", "\n".join(out) + "\n")

    def record(self, kind: str, suffix: str, date: str = "2026-10-21", /, **kw) -> Path:
        data = record_data(kind, suffix, date, **kw)
        return self.write(f"docs/requirements/changes/{date}-{suffix}.toml", to_toml(data))

    def stamp(self, fmt: int, **lifecycle) -> Path:
        text = f"format = {fmt}\n"
        if lifecycle:
            text += "\n[lifecycle]\n" + "".join(f"{k} = {v}\n" for k, v in lifecycle.items())
        return self.write("docs/.peak-workflow.toml", text)

    # -- git -------------------------------------------------------------------------------

    def git(self, *args: str) -> str:
        env = {**os.environ, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}
        proc = subprocess.run(["git", "-C", str(self.root), *args], capture_output=True,
                              text=True, env=env, check=True)
        return proc.stdout.strip()

    def commit(self, message: str, date: str | None = None) -> str:
        """Stage everything and commit; returns the commit SHA. `date` is an ISO date."""
        self.git("add", "-A")
        if date:
            stamp = f"{date}T12:00:00"
            os.environ["GIT_AUTHOR_DATE"] = os.environ["GIT_COMMITTER_DATE"] = stamp
        try:
            self.git("commit", "-q", "--allow-empty", "-m", message)
        finally:
            if date:
                del os.environ["GIT_AUTHOR_DATE"], os.environ["GIT_COMMITTER_DATE"]
        return self.git("rev-parse", "HEAD")

    def fast_import(self, commits: list[tuple[str, dict[str, str | None]]], start: int = 1767225600) -> None:
        """Build a linear history on `develop` quickly: one (message, {path: text or None}) per
        commit, one day apart from `start` (epoch seconds). The working tree is reset to the tip."""
        out = bytearray()
        for n, (message, files) in enumerate(commits, 1):
            msg = message.encode()
            out += (f"commit refs/heads/develop\nmark :{n}\n"
                    f"committer Fixture Author <fixture@example.com> {start + n * 86400} +0000\n"
                    f"data {len(msg)}\n").encode() + msg + b"\n"
            for path, text in files.items():
                if text is None:
                    out += f"D {path}\n".encode()
                else:
                    data = text.encode()
                    out += f"M 100644 inline {path}\ndata {len(data)}\n".encode() + data + b"\n"
        subprocess.run(["git", "-C", str(self.root), "fast-import", "--quiet"], input=bytes(out), check=True)
        self.git("reset", "-q", "--hard", "develop")

    def checkout(self, branch: str, create: bool = False) -> None:
        self.git("checkout", "-q", *(["-b"] if create else []), branch)

    def merge(self, branch: str, message: str | None = None) -> str:
        """`git merge --no-ff` into the current branch; returns the merge commit SHA."""
        self.git("merge", "-q", "--no-ff", "-m", message or f"Merge {branch}", branch)
        return self.git("rev-parse", "HEAD")

    def json_cli(self, *args: str) -> tuple[int, object]:
        """Run a `--json` command; returns (exit code, parsed output)."""
        import json
        result = self.cli(*args, "--json")
        if result.returncode not in (0, 1):
            raise AssertionError(f"{args} exited {result.returncode}: {result.stderr}")
        return result.returncode, json.loads(result.stdout)

    def check(self, *args: str, today: str = "2026-10-26") -> list[dict]:
        return self.json_cli("check", "--today", today, *args)[1]["findings"]

    def states(self, today: str = "2026-10-26") -> dict[str, dict]:
        return {r["tor"]: r for r in self.json_cli("states", "--today", today)[1]["requirements"]}

    # -- running the helper ----------------------------------------------------------------

    def cli(self, *args: str, python: str | None = None) -> subprocess.CompletedProcess:
        """Run tor_lifecycle.py in the repo; returns the CompletedProcess (text output)."""
        return subprocess.run([python or sys.executable, str(SCRIPT), *args], cwd=self.root,
                              capture_output=True, text=True)


def parse_tsv(stdout: str) -> list[tuple[str, ...]]:
    return [tuple(line.split("\t")) for line in stdout.splitlines() if line]
