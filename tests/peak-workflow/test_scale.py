"""Q14 scale fixture: ~800 TORs, ~60 Complete epics, ~400 commits.

Targets: `fingerprint` ≤ 2s; `check` and `seed` ≤ 10s each. The fixture plants a Project A-like
result: after seeding, 16 requirements are Changed since verified (each edit carries a historical
reword record, as migration writes them) and one test cites a dangling ID (finding C).
"""
import string
import subprocess
import time
import unittest

from fixtures import WRAPPER, FixtureRepo, feature_text, scenario, to_toml, record_data

FILES, PER_FILE, EPICS, EDITED = 40, 20, 60, 16
TARGET = {"fingerprint": 2.0, "check": 10.0, "seed": 10.0}


def tor(f, i):
    alphabet = string.ascii_letters
    return f"TOR-{f:02d}-Sc{alphabet[f % 52]}{i:04d}"


def scen(f, i, edited=False):
    title = f"The tool shall handle case {f}.{i}" + (" within two seconds" if edited else "")
    return scenario(tor(f, i), title, f"Given state {i}", f"When action {f} happens",
                    f"Then outcome {f}.{i} is observed")


def feature(f, edited=()):
    return feature_text(f"{f:02d}", f"Area {f}", [scen(f, i, (f, i) in edited) for i in range(PER_FILE)])


class ScaleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo = repo = FixtureRepo()
        all_tors = [(f, i) for f in range(1, FILES + 1) for i in range(PER_FILE)]
        per_epic = -(-len(all_tors) // EPICS)
        epics = {f"Ep{n:05d}": all_tors[n * per_epic:(n + 1) * per_epic] for n in range(EPICS)}
        path = lambda f: f"docs/requirements/{f:02d}-area-{f}.feature.md"
        side = lambda e, status: (f"status: {status}\nowner: —\nimplemented: —\ncompleted: —\nhandoff: —\n"
                                  f"requirements: {', '.join(tor(f, i) for f, i in epics[e])}\n")
        commits = [("init", {"README.md": "# scale\n"})]
        commits += [(f"docs: feature {f}", {path(f): feature(f)}) for f in range(1, FILES + 1)]
        names = list(epics)
        for chunk in range(0, EPICS, 10):
            commits.append(("plan", {f"docs/implementation-plan/status/epic-{e}.md": side(e, "Not Started")
                                     for e in names[chunk:chunk + 10]}))
        for e in names:
            sp = f"docs/implementation-plan/status/epic-{e}.md"
            commits.append((f"start {e}", {sp: side(e, "In Progress")}))
            commits.append((f"build {e}", {f"tests/test_{e}.py": "".join(
                f"def test_{f}_{i}():  # {tor(f, i)}\n    pass\n" for f, i in epics[e])}))
            commits.append((f"wrapup {e}", {sp: side(e, "Complete")}))
        cls.edited = all_tors[5::50][:EDITED]
        edited_files = sorted({f for f, _ in cls.edited})
        for f in edited_files:
            records = {}
            for g, i in cls.edited:
                if g == f:
                    rec = record_data("reword", f"Hx{g:02d}{i:03d}", "2026-10-20", changes=[{
                        "tor": tor(g, i), "from": scen(g, i).fp(), "to": scen(g, i, True).fp()}],
                        evidence={"commit": "abc1234", "result": "historical"}, approved_via="migration")
                    records[f"docs/requirements/changes/2026-10-20-Hx{g:02d}{i:03d}.toml"] = to_toml(rec)
            commits.append((f"amend feature {f}", {path(f): feature(f, set(cls.edited)), **records}))
        commits.append(("typo", {"tests/test_typo.py": "# TOR-99-Dangle1\n"}))
        n = 0
        while len(commits) < 400:
            commits.append((f"refactor {n}", {f"src/mod_{n % 25}.py": f"VERSION = {n}\n"}))
            n += 1
        repo.fast_import(commits)
        cls.commit_count = int(repo.git("rev-list", "--count", "HEAD"))

    @classmethod
    def tearDownClass(cls):
        cls.repo.cleanup()

    def timed(self, *args):
        start = time.perf_counter()
        result = subprocess.run(["sh", str(WRAPPER), *args], cwd=self.repo.root, capture_output=True, text=True)
        return result, time.perf_counter() - start

    def test_1_fixture_shape(self):
        self.assertEqual(self.commit_count, 400)

    def test_2_fingerprint_under_target(self):
        result, secs = self.timed("fingerprint")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(result.stdout.splitlines()), FILES * PER_FILE)
        self.assertLessEqual(secs, TARGET["fingerprint"], f"fingerprint took {secs:.2f}s")

    def test_3_seed_then_check_under_target(self):
        result, secs = self.timed("seed", "--write")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLessEqual(secs, TARGET["seed"], f"seed took {secs:.2f}s")
        self.assertEqual(len(result.stdout.splitlines()), FILES * PER_FILE)

        result, secs = self.timed("check", "--json", "--today", "2026-10-26")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertLessEqual(secs, TARGET["check"], f"check took {secs:.2f}s")
        import json
        counts = json.loads(result.stdout)["counts"]
        self.assertEqual(counts, {"A": 0, "B": 0, "C": 1, "D": EDITED, "E": 0, "F": 0})

        _code, states = self.repo.json_cli("states")
        by_state = states["summary"]["by_state"]
        self.assertEqual(by_state, {"Changed since verified": EDITED, "Verified": FILES * PER_FILE - EDITED})
        print(f"\n  scale: fingerprint/seed/check timings within Q14 targets; "
              f"{states['summary']['verified']} Verified / {EDITED} Changed since verified / 1 finding C")


if __name__ == "__main__":
    unittest.main()
