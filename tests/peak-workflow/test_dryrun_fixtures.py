"""The Plan 5 dry-run fixture holds every derived requirement state and every finding letter."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from fixtures import SCRIPT

BUILDER = Path(__file__).resolve().parent / "dryrun" / "plan5_states.py"
STATES = {"Verified", "Verified (reworded)", "Changed since verified", "Disputed", "Verification failed",
          "Verified (legacy, unfingerprinted)", "Specified", "Planned", "In Progress", "Paused",
          "Implemented", "Waived", "Superseded", "Retired", "Retired, removal pending"}


def run(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *args], cwd=root, capture_output=True, text=True)


class Plan5FixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="pw-plan5-"))
        cls.root = cls.tmp / "fx"
        subprocess.run([sys.executable, str(BUILDER), str(cls.root)], check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def git(self, *args):
        subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)

    def test_develop_holds_every_state_and_letter(self):
        self.git("checkout", "-q", "develop")
        states = json.loads(run(self.root, "states", "--json").stdout)
        self.assertEqual(set(states["summary"]["by_state"]), STATES)
        disputes = {r["tor"]: r["dispute"] for r in states["requirements"] if r["state"] == "Disputed"}
        self.assertEqual(sorted((d["overdue"], d["safety"]) for d in disputes.values()),
                         [(False, False), (True, False), (True, True)])
        check = json.loads(run(self.root, "check", "--json").stdout)
        self.assertTrue(all(check["counts"][letter] for letter in "ABCDEF"), check["counts"])
        self.assertNotIn("removal-missing", {f.get("kind") for f in check["findings"]})

    def test_docs_branch_leaves_a_successor_and_a_missing_removal_epic(self):
        self.git("checkout", "-q", "docs/q4-requirements")
        rows = {r["tor"]: r for r in json.loads(run(self.root, "states", "--json").stdout)["requirements"]}
        self.assertEqual(rows["TOR-02-Tax0002"]["state"], "Specified")
        self.assertEqual(rows["TOR-02-Tax0001"]["state"], "Superseded")
        self.assertEqual(rows["TOR-02-Slip001"]["state"], "Retired, removal pending")
        check = json.loads(run(self.root, "check", "--json").stdout)
        missing = [f["detail"]["record"] for f in check["findings"] if f.get("kind") == "removal-missing"]
        self.assertEqual(missing, ["CR-Rt0Slip"])

    def test_behind_variant(self):
        dest = self.tmp / "behind"
        subprocess.run([sys.executable, str(BUILDER), str(dest), "--behind"], check=True, capture_output=True)
        result = run(dest, "format")
        self.assertEqual(result.returncode, 1)
        self.assertIn("verdict: behind", result.stdout)
        self.assertEqual(run(dest, "states", "--json").returncode, 0)


class Plan6FixtureTests(unittest.TestCase):
    """The Plan 6 fixture: a superseded anchor on an open epic, a Specified anchor to amend, an
    epic with no anchors, and the Plan 5 removal epic."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="pw-plan6-"))
        cls.root = cls.tmp / "fx"
        subprocess.run([sys.executable, str(BUILDER.with_name("plan6_execution.py")), str(cls.root)],
                       check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_execution_cases(self):
        rows = {r["tor"]: r for r in json.loads(run(self.root, "states", "--json").stdout)["requirements"]}
        self.assertEqual(rows["TOR-02-Rfnd001"]["state"], "Superseded")
        self.assertEqual(rows["TOR-02-Rfnd002"]["state"], "Specified")
        self.assertEqual((rows["TOR-02-Due0001"]["state"], rows["TOR-02-Due0001"]["epic"]), ("Planned", "lDue11"))
        self.assertEqual((rows["TOR-01-Ver0001"]["state"], rows["TOR-01-Ver0001"]["epic"]), ("Verified", "aSkel01"))
        check = json.loads(run(self.root, "check", "--json").stdout)
        self.assertIn("open-epic-retired", {f.get("kind") for f in check["findings"]})
        sweep = json.loads(run(self.root, "sweep", "--json").stdout)
        self.assertIn(("TOR-02-Rfnd001", "tests/test_refund.py"), {(r["tor"], r["path"]) for r in sweep})
        sidecar = (self.root / "docs/implementation-plan/status/epic-mNoA12.md").read_text()
        self.assertIn("requirements: —", sidecar)
        self.assertEqual(run(self.root, "validate").returncode, 0)


if __name__ == "__main__":
    unittest.main()
