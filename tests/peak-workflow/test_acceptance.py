"""Plan 8 contributor kit: the redacting acceptance runner prints counts, IDs, letters, and timings,
and never requirement text."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_migrate import run_step_0002

sys.path.insert(0, str(Path(__file__).resolve().parent / "dryrun"))
import plan8_project_a as pa  # noqa: E402

RUNNER = Path(__file__).resolve().parent / "acceptance" / "run.py"
sys.path.insert(0, str(RUNNER.parent))
import run as acceptance  # noqa: E402


def runner(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(RUNNER), *args], capture_output=True, text=True)


class AcceptanceRunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="pw-accept-"))
        cls.repo = pa.build(cls.tmp / "project")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def assert_redacted(self, out: str):
        self.assertNotIn(pa.CANARY, out)
        for s in (pa.WRD_V2, pa.TMO_V2, pa.CRT):
            self.assertNotIn(s.title, out)
        self.assertNotIn("ops review", out)

    def test_1_baseline_leaves_the_project_alone(self):
        head = self.repo.git("rev-parse", "HEAD")
        result = runner("baseline", str(self.repo.root), "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_redacted(result.stdout)
        report = json.loads(result.stdout)
        self.assertEqual(report["format"], "behind")
        self.assertEqual(report["inventory"]["removed"], ["TOR-03-Csv0001"])
        self.assertEqual(report["inventory"]["edited"], ["TOR-01-Pre0001", "TOR-02-Wrd0001"])
        self.assertEqual(report["states_after_seed"]["changed_since_verified"], ["TOR-02-Wrd0001 (bSync02)"])
        self.assertEqual(report["check_after_seed"]["ids"]["C"][0], "TOR-03-Csv0001")
        self.assertIn("migrate scan", report["timings"])
        self.assertEqual(self.repo.git("rev-parse", "HEAD"), head)
        self.assertEqual(self.repo.git("status", "--porcelain"), "")
        self.assert_redacted(runner("baseline", str(self.repo.root)).stdout)

    def test_2_after_the_upgrade(self):
        self.repo.checkout("docs/upgrade-format-2", create=True)
        self.repo.cli("provenance", "--write")
        self.repo.cli("format", "--set", "1")
        self.repo.commit("chore(upgrade): step 0001 epic-provenance")
        run_step_0002(self.repo)
        result = runner("after", str(self.repo.root), "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_redacted(result.stdout)
        report = json.loads(result.stdout)
        self.assertEqual(report["format"], "current")
        self.assertEqual(report["rerun_pending"], {})
        self.assertEqual(report["fingerprints"]["changed"], [])
        self.assertEqual(report["fingerprints"]["removed"], ["TOR-02-Old0001", "TOR-03-Imp0001"])
        self.assertEqual(report["records"]["with_migration_source"], 0)
        self.assertEqual(report["validate"]["problems"], 0)
        self.assertEqual(report["states"]["changed_since_verified"], ["TOR-02-Wrd0001 (bSync02)"])
        self.assertEqual(report["check"]["counts"], {"A": 0, "B": 0, "C": 1, "D": 1, "E": 0, "F": 1})
        self.assertEqual(len(report["upgrade_commits"]), 6)

    def test_3_redaction_check_blocks_a_leak(self):
        protected = acceptance.protected_text(self.repo.root)
        self.assertTrue(any(pa.CANARY in p for p in protected))
        leak = {"note": f"The app shall show note dates in ISO 8601 form ({pa.CANARY})"}
        text = acceptance.render(leak)
        self.assertTrue([p for p in protected if p in text])


if __name__ == "__main__":
    unittest.main()
