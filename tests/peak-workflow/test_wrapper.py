"""The tor-lifecycle POSIX wrapper: interpreter probe order, too-old Python, none found."""
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from fixtures import SCRIPT, WRAPPER

# A fake interpreter: answers the wrapper's version probe with VERSION (exit 0 only if >= 3.11),
# otherwise reports how it was invoked. Shell builtins only, so PATH can hold nothing else.
SHIM = """#!/bin/sh
for a in "$@"; do
  case $a in -c) echo "{version}"; [ {ok} = 1 ]; exit $? ;; esac
done
echo "ran-by {name} $*"
"""


class WrapperTests(unittest.TestCase):
    def setUp(self):
        self.bin = Path(tempfile.mkdtemp(prefix="pw-shims-"))
        self.addCleanup(shutil.rmtree, self.bin, True)

    def shim(self, name, version):
        major, minor = map(int, version.split(".")[:2])
        path = self.bin / name
        path.write_text(SHIM.format(name=name, version=version, ok=int((major, minor) >= (3, 11))))
        path.chmod(0o755)

    def run_wrapper(self, *args):
        return subprocess.run(["/bin/sh", str(WRAPPER), *args], capture_output=True, text=True,
                              env={"PATH": str(self.bin)})

    def test_python3_preferred(self):
        self.shim("python3", "3.12.1")
        self.shim("py", "3.13.0")
        self.shim("python", "3.13.0")
        out = self.run_wrapper("fingerprint", "a b.feature.md")
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.strip(), f"ran-by python3 {SCRIPT} fingerprint a b.feature.md")

    def test_old_python3_falls_through_to_py_launcher(self):
        self.shim("python3", "3.9.6")
        self.shim("py", "3.12.0")
        out = self.run_wrapper("titles", "TOR-01-Abc1234")
        self.assertEqual(out.stdout.strip(), f"ran-by py -3 {SCRIPT} titles TOR-01-Abc1234")

    def test_falls_through_to_python(self):
        self.shim("python", "3.11.0")
        out = self.run_wrapper("version")
        self.assertEqual(out.stdout.strip(), f"ran-by python {SCRIPT} version")

    def test_all_too_old_prints_hint_naming_them(self):
        self.shim("python3", "3.9.6")
        self.shim("python", "2.7.18")
        out = self.run_wrapper("version")
        self.assertEqual(out.returncode, 3)
        self.assertEqual(out.stdout, "")
        self.assertIn("needs Python 3.11 or newer", out.stderr)
        self.assertIn("python3 (3.9.6)", out.stderr)
        self.assertIn("python (2.7.18)", out.stderr)

    def test_none_found(self):
        out = self.run_wrapper("version")
        self.assertEqual(out.returncode, 3)
        self.assertIn("Install a current Python", out.stderr)
        self.assertNotIn("too old", out.stderr)

    def test_real_interpreter_passes_exit_codes_through(self):
        real = Path(sys.executable)
        (self.bin / "python3").symlink_to(real)
        ok = self.run_wrapper("version")
        self.assertEqual(ok.returncode, 0, ok.stderr)
        self.assertIn("format\t2", ok.stdout)
        self.assertEqual(self.run_wrapper("no-such-command").returncode, 2)

    def test_script_self_check_on_old_interpreter(self):
        old = shutil.which("python3", path="/usr/bin")
        if not old or subprocess.run([old, "-c", "import sys; sys.exit(sys.version_info >= (3, 11))"]).returncode:
            self.skipTest("no pre-3.11 interpreter at /usr/bin/python3")
        out = subprocess.run([old, str(SCRIPT), "version"], capture_output=True, text=True)
        self.assertEqual(out.returncode, 3)
        self.assertIn("needs Python 3.11", out.stderr)


if __name__ == "__main__":
    unittest.main()
