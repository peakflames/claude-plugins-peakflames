import hashlib
import re
import unittest

from fixtures import FixtureRepo, feature_text, parse_tsv, scenario, tor_lifecycle as tl


# ---- #20 reference sketch, verbatim apart from the entry point (cross-check oracle) ----------
SCEN = re.compile(r"^\s*Scenario:\s*\[(TOR-\d{2}-[A-Za-z0-9]{7})\]\s*(.*)$")
FEAT = re.compile(r"^\s*Feature:")
VERIF = re.compile(r"^\s*#\s*Verification:")

def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()

def reference_fingerprints(path: str) -> list[tuple[str, str]]:
    out, tor, body = [], None, []
    def flush():
        if tor:
            out.append((tor, hashlib.sha256(normalize(" ".join(body)).encode()).hexdigest()[:12]))
    for line in open(path, encoding="utf-8"):
        if m := SCEN.match(line):
            flush(); tor, body = m.group(1), [m.group(2)]
        elif FEAT.match(line):
            flush(); tor, body = None, []
        elif tor and line.strip() and (VERIF.match(line) or not line.lstrip().startswith("#")):
            body.append(line.strip())
    flush()
    return out
# ---------------------------------------------------------------------------------------------


T1, T2, T3 = "TOR-01-Abc1234", "TOR-01-Def5678", "TOR-02-Ghi9012"
BASE = scenario(T1, "The tool shall print its version",
                "Given the tool is installed", "When the user runs `tool --version`",
                "Then the version string is printed")


def fp_of(sc) -> str:
    [(tor, fp)] = tl.fingerprint_text(feature_text("01", "Cli", [sc]))
    return fp


class NormalizationTests(unittest.TestCase):
    def setUp(self):
        self.base = fp_of(BASE)

    def same(self, sc):
        self.assertEqual(fp_of(sc), self.base)

    def differs(self, sc):
        self.assertNotEqual(fp_of(sc), self.base)

    def test_format(self):
        self.assertRegex(self.base, r"^[0-9a-f]{12}$")

    def test_case_change_keeps_fingerprint(self):
        self.same(scenario(T1, "THE TOOL SHALL PRINT ITS VERSION", *[s.upper() for s in BASE.steps]))

    def test_punctuation_change_keeps_fingerprint(self):
        self.same(scenario(T1, "The tool shall print its version.",
                           "Given the tool is installed,", "When the user runs 'tool --version'",
                           "Then the version string is printed!"))

    def test_whitespace_change_keeps_fingerprint(self):
        sc = scenario(T1, "The  tool shall   print its version",
                      "  Given the tool   is installed", "When the user runs `tool --version`",
                      "", "Then the version string is printed   ")
        self.same(sc)

    def test_comment_and_note_edits_keep_fingerprint(self):
        self.same(scenario(T1, BASE.title, *BASE.steps, note=["AMENDED 2026-07-01: wording", "see #12"]))

    def test_step_wording_change_alters_fingerprint(self):
        self.differs(scenario(T1, BASE.title, "Given the tool is installed",
                              "When the user runs `tool -V`", "Then the version string is printed"))

    def test_title_change_alters_fingerprint(self):
        self.differs(scenario(T1, "The tool shall print its full version", *BASE.steps))

    def test_verification_tag_is_part_of_fingerprint(self):
        tagged = scenario(T1, BASE.title, *BASE.steps, verification="automated")
        self.differs(tagged)
        self.assertNotEqual(fp_of(tagged), fp_of(scenario(T1, BASE.title, *BASE.steps,
                                                           verification="operator-observed")))

    def test_feature_line_ends_scenario(self):
        text = feature_text("01", "Cli", [BASE], fenced=False)
        extended = text + "Feature: 2.0 Other\n    As a user\n    Given trailing text\n"
        self.assertEqual(tl.fingerprint_text(extended), [(T1, self.base)])

    def test_next_scenario_ends_scenario(self):
        two = feature_text("01", "Cli", [BASE, scenario(T2, "The tool shall print help")])
        self.assertEqual(tl.fingerprint_text(two)[0], (T1, self.base))

    def test_crlf_matches_lf(self):
        text = feature_text("01", "Cli", [BASE])
        self.assertEqual(tl.fingerprint_text(text.replace("\n", "\r\n")), tl.fingerprint_text(text))

    def test_parse_scenarios_returns_titles(self):
        [(tor, title, fp)] = tl.parse_scenarios(feature_text("01", "Cli", [BASE]))
        self.assertEqual((tor, title, fp), (T1, BASE.title, self.base))


class FingerprintCliTests(unittest.TestCase):
    def setUp(self):
        self.repo = FixtureRepo()
        self.addCleanup(self.repo.cleanup)

    def write_project(self, n_files=2):
        for i in range(1, n_files + 1):
            nn = f"{i:02d}"
            self.repo.feature(nn, f"area-{i}", [
                scenario(f"TOR-{nn}-Aaaaa{i:02d}", f"The tool shall do thing {i}",
                         verification="automated"),
                scenario(f"TOR-{nn}-Bbbbb{i:02d}", f"The tool shall do other thing {i}",
                         note=["legacy prose"]),
            ], banner="Safety" if i == 1 else None)

    def test_default_glob_matches_reference_sketch(self):
        self.write_project(3)
        result = self.repo.cli("fingerprint")
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = []
        for path in sorted((self.repo.root / "docs/requirements").glob("*.feature.md")):
            expected += reference_fingerprints(str(path))
        self.assertEqual(parse_tsv(result.stdout), expected)
        self.assertEqual(len(expected), 6)

    def test_process_pool_matches_serial(self):
        self.write_project(tl.POOL_MIN_FILES + 3)
        paths = tl.feature_files(self.repo.root)
        pooled = tl.parse_files(paths)
        serial = [tl._parse_file(p) for p in paths]
        self.assertEqual(pooled, serial)

    def test_explicit_files(self):
        self.write_project(2)
        result = self.repo.cli("fingerprint", "docs/requirements/02-area-2.feature.md")
        self.assertEqual([t for t, _ in parse_tsv(result.stdout)], ["TOR-02-Aaaaa02", "TOR-02-Bbbbb02"])

    def test_missing_file_is_data_error(self):
        result = self.repo.cli("fingerprint", "docs/requirements/99-nope.feature.md")
        self.assertEqual(result.returncode, 2)
        self.assertIn("no such feature file", result.stderr)

    def test_rev_reads_history(self):
        self.write_project(2)
        v1 = self.repo.commit("v1")
        before = parse_tsv(self.repo.cli("fingerprint").stdout)
        self.repo.feature("01", "area-1", [scenario("TOR-01-Aaaaa01", "The tool shall do a new thing")])
        self.repo.commit("v2")
        after = parse_tsv(self.repo.cli("fingerprint").stdout)
        self.assertNotEqual(before, after)
        at_v1 = self.repo.cli("fingerprint", "--rev", v1)
        self.assertEqual(at_v1.returncode, 0, at_v1.stderr)
        self.assertEqual(parse_tsv(at_v1.stdout), before)
        one = self.repo.cli("fingerprint", "--rev", v1, "docs/requirements/01-area-1.feature.md")
        self.assertEqual(parse_tsv(one.stdout), before[:2])

    def test_rev_ignores_uncommitted_edits(self):
        self.write_project(1)
        v1 = self.repo.commit("v1")
        committed = self.repo.cli("fingerprint").stdout
        self.repo.feature("01", "area-1", [scenario("TOR-01-Aaaaa01", "Edited, not committed")])
        self.assertEqual(self.repo.cli("fingerprint", "--rev", v1).stdout, committed)

    def test_rev_missing_file_or_bad_rev_is_data_error(self):
        self.write_project(1)
        v1 = self.repo.commit("v1")
        missing = self.repo.cli("fingerprint", "--rev", v1, "docs/requirements/09-x.feature.md")
        self.assertEqual(missing.returncode, 2)
        self.assertIn("not present at", missing.stderr)
        self.assertEqual(self.repo.cli("fingerprint", "--rev", "no-such-rev").returncode, 2)

    def test_runs_from_subdirectory(self):
        self.write_project(1)
        self.repo.commit("v1")
        sub = self.repo.root / "docs"
        import subprocess, sys
        from fixtures import SCRIPT
        result = subprocess.run([sys.executable, str(SCRIPT), "fingerprint"], cwd=sub,
                                capture_output=True, text=True)
        self.assertEqual(len(parse_tsv(result.stdout)), 2, result.stderr)

    def test_duplicate_ids_rejected_by_live_loader(self):
        self.repo.feature("01", "a", [scenario(T1, "One")])
        self.repo.feature("02", "b", [scenario(T1, "Two")])
        with self.assertRaises(tl.DataError) as ctx:
            tl.live_requirements(self.repo.root)
        self.assertIn(T1, str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
