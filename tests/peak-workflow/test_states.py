"""Derived requirement states (#20 "Derived requirement states"): one test per table row."""
import unittest

from fixtures import FixtureRepo, scenario

T = {k: f"TOR-01-{k:0<7}" for k in (
    "Verif", "Rewrd", "Rehis", "Chang", "Disp", "Vfail", "Legcy", "Spec", "Plan", "Prog", "Paus",
    "Impl", "Waiv", "Wsucc", "Succ", "Dover", "Drenew", "Dres")}
T["Dsafe"] = "TOR-02-Dsafe00"
GONE = {k: f"TOR-01-{k:0<7}" for k in ("Super", "Retd", "Rcode", "Rdone", "Rprog", "Wgone")}


def sc(key, title=None, *steps):
    return scenario(T[key], title or f"The tool shall do {key}", *steps)


class DerivedStateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo = repo = FixtureRepo()
        old = {k: sc(k) for k in T if k != "Dsafe"}
        new = dict(old)
        for k in ("Rewrd", "Rehis", "Chang"):
            new[k] = sc(k, f"The tool shall do {k} differently")
        repo.feature("01", "core", list(new.values()))
        repo.feature("02", "safety", [sc("Dsafe")], banner="Safety")
        fp = {k: v.fp() for k, v in old.items()}

        repo.sidecar("E1aaaaa", "Complete",
                     [T[k] for k in ("Verif", "Rewrd", "Rehis", "Chang", "Disp", "Vfail", "Waiv",
                                     "Wsucc", "Dover", "Drenew", "Dres")] + [GONE["Super"], GONE["Wgone"]],
                     verified={T[k]: fp[k] for k in ("Verif", "Rewrd", "Rehis", "Chang", "Disp",
                                                     "Dover", "Drenew", "Dres")},
                     unverified={T["Vfail"]: "2026-10-20 Then clause fails"},
                     waived=f"{T['Waiv']} → E7aaaaa, {T['Wsucc']} → E3aaaaa, {GONE['Wgone']} → E3aaaaa")
        repo.sidecar("E2aaaaa", "Complete", [T["Legcy"], T["Dsafe"]], retires="CR-Rdone00")
        repo.sidecar("E3aaaaa", "Not Started", [T["Plan"], T["Wsucc"], T["Succ"]])
        repo.sidecar("E4aaaaa", "In Progress", [T["Prog"]], retires="CR-Rprog00")
        repo.sidecar("E5aaaaa", "Paused", [T["Paus"]])
        repo.sidecar("E6aaaaa", "Implemented", [T["Impl"]])
        repo.sidecar("E7aaaaa", "Not Started", [])

        repo.record("reword", "Rewrd00", "2026-10-01", changes=[
            {"tor": T["Rewrd"], "from": fp["Rewrd"], "to": new["Rewrd"].fp()}])
        repo.record("reword", "Rehis00", "2026-10-01", changes=[
            {"tor": T["Rehis"], "from": fp["Rehis"], "to": new["Rehis"].fp()}],
            evidence={"commit": "abc1234", "result": "historical"})
        repo.record("pending", "Disp000", "2026-10-20", tors=[T["Disp"]])
        repo.record("pending", "Dover00", "2026-09-01", tors=[T["Dover"]])
        repo.record("pending", "Dsafe00", "2026-10-26", tors=[T["Dsafe"]])
        repo.record("pending", "Drenew0", "2026-08-01", tors=[T["Drenew"]])
        repo.record("pending", "Drenew1", "2026-10-10", tors=[T["Drenew"]], refs=["CR-Drenew0"])
        repo.record("pending", "Dres000", "2026-08-01", tors=[T["Dres"]])
        repo.record("reword", "Dres001", "2026-10-02", refs=["CR-Dres000"], changes=[
            {"tor": T["Dres"], "from": "0" * 12, "to": "1" * 12}])
        repo.record("supersede", "Super00", "2026-07-28", tors=[GONE["Super"]], changes=[
            {"tor": GONE["Super"], "feature_file": "01-core.feature.md", "fingerprint": "a" * 12,
             "successors": [T["Succ"]], "text": "Scenario: old"}])
        repo.record("retire", "Retd000", "2026-10-01", tors=[GONE["Retd"]])
        repo.record("retire", "Rcode00", "2026-10-01", tors=[GONE["Rcode"]], removal="code")
        repo.record("retire", "Rdone00", "2026-10-01", tors=[GONE["Rdone"]], removal="code")
        repo.record("retire", "Rprog00", "2026-10-01", tors=[GONE["Rprog"]], removal="code")
        repo.record("retire", "Wgone00", "2026-10-01", tors=[GONE["Wgone"]])
        repo.commit("fixture")
        cls.code, cls.report = repo.json_cli("states", "--today", "2026-10-26")
        cls.rows = {r["tor"]: r for r in cls.report["requirements"]}

    @classmethod
    def tearDownClass(cls):
        cls.repo.cleanup()

    def state(self, tor):
        return self.rows[tor]["state"]

    def test_verified(self):
        self.assertEqual(self.state(T["Verif"]), "Verified")
        self.assertTrue(self.rows[T["Verif"]]["counts_as_verified"])
        self.assertEqual(self.rows[T["Verif"]]["epic"], "E1aaaaa")

    def test_verified_reworded_needs_passing_evidence(self):
        self.assertEqual(self.state(T["Rewrd"]), "Verified (reworded)")
        self.assertEqual(self.rows[T["Rewrd"]]["reword_records"], ["CR-Rewrd00"])
        self.assertEqual(self.state(T["Rehis"]), "Changed since verified")

    def test_changed_since_verified(self):
        row = self.rows[T["Chang"]]
        self.assertEqual(row["state"], "Changed since verified")
        self.assertFalse(row["counts_as_verified"])

    def test_disputed(self):
        row = self.rows[T["Disp"]]
        self.assertEqual((row["state"], row["underlying_state"]), ("Disputed", "Verified"))
        self.assertFalse(row["counts_as_verified"])
        self.assertEqual(row["dispute"]["age_days"], 6)
        self.assertFalse(row["dispute"]["overdue"])

    def test_disputed_overdue_after_threshold(self):
        self.assertTrue(self.rows[T["Dover"]]["dispute"]["overdue"])
        self.assertEqual(self.rows[T["Dover"]]["dispute"]["age_days"], 55)

    def test_safety_disputed_is_overdue_immediately(self):
        info = self.rows[T["Dsafe"]]["dispute"]
        self.assertEqual((info["age_days"], info["threshold_days"], info["safety"], info["overdue"]),
                         (0, 0, True, True))

    def test_renewal_restarts_the_clock(self):
        info = self.rows[T["Drenew"]]["dispute"]
        self.assertEqual((info["record"], info["age_days"], info["overdue"]), ("CR-Drenew1", 16, False))

    def test_resolved_pending_is_not_disputed(self):
        self.assertIsNone(self.rows[T["Dres"]]["dispute"])
        self.assertNotEqual(self.state(T["Dres"]), "Disputed")

    def test_verification_failed(self):
        self.assertEqual(self.state(T["Vfail"]), "Verification failed")
        self.assertIn("Then clause fails", self.rows[T["Vfail"]]["unverified"])

    def test_legacy_unfingerprinted_counts_as_verified(self):
        row = self.rows[T["Legcy"]]
        self.assertEqual(row["state"], "Verified (legacy, unfingerprinted)")
        self.assertTrue(row["counts_as_verified"])

    def test_open_epic_states(self):
        self.assertEqual(self.state(T["Spec"]), "Specified")
        self.assertEqual(self.state(T["Plan"]), "Planned")
        self.assertEqual(self.state(T["Prog"]), "In Progress")
        self.assertEqual(self.state(T["Paus"]), "Paused")
        self.assertEqual(self.state(T["Impl"]), "Implemented")

    def test_waived(self):
        self.assertEqual(self.state(T["Waiv"]), "Waived")
        self.assertEqual(self.rows[T["Waiv"]]["waived_to"], ["E7aaaaa"])
        self.assertEqual(self.state(T["Wsucc"]), "Planned")  # the successor epic lists it

    def test_superseded_and_successor(self):
        row = self.rows[GONE["Super"]]
        self.assertEqual((row["state"], row["successors"], row["live"]), ("Superseded", [T["Succ"]], False))
        self.assertEqual(self.state(T["Succ"]), "Planned")

    def test_retired(self):
        self.assertEqual(self.state(GONE["Retd"]), "Retired")
        self.assertEqual(self.state(GONE["Rdone"]), "Retired")

    def test_retired_removal_pending(self):
        self.assertEqual(self.state(GONE["Rcode"]), "Retired, removal pending")
        self.assertEqual(self.state(GONE["Rprog"]), "Retired, removal pending")
        self.assertEqual(self.rows[GONE["Rprog"]]["removal_epics"], ["E4aaaaa"])

    def test_q17_waived_retired_tor_is_history(self):
        self.assertEqual(self.state(GONE["Wgone"]), "Retired")

    def test_denominator_is_live_set_only(self):
        summary = self.report["summary"]
        self.assertEqual(summary["live"], len(T))
        verified = {"Verif", "Rewrd", "Legcy", "Dres"}
        self.assertEqual(summary["verified"], len(verified))
        self.assertEqual(summary["verified_percent"], round(100 * len(verified) / len(T), 1))
        self.assertEqual(self.code, 0)

    def test_text_output(self):
        result = self.repo.cli("states", "--today", "2026-10-26")
        self.assertIn(f"{T['Verif']}\tVerified\tE1aaaaa\t", result.stdout)
        self.assertIn(f"4 of {len(T)} live requirements verified", result.stdout)


if __name__ == "__main__":
    unittest.main()


class HistoricalRecordsTests(unittest.TestCase):
    """`historical_records` names only the unproven links of the chain (Plan 9 dry-run pass 8)."""

    def test_a_passing_reword_after_a_historical_one_is_not_listed(self):
        with FixtureRepo() as repo:
            v1, v2, v3 = (scenario("TOR-01-Hist001", f"The tool shall sync within {n} seconds")
                          for n in (60, 30, 20))
            repo.feature("01", "core", [v3])
            repo.sidecar("E1aaaaa", "Complete", ["TOR-01-Hist001"], verified={"TOR-01-Hist001": v1.fp()})
            repo.record("reword", "Hist000", "2026-10-01", changes=[
                {"tor": "TOR-01-Hist001", "from": v1.fp(), "to": v2.fp()}],
                evidence={"commit": "abc1234", "result": "historical"})
            repo.record("reword", "Pass000", "2026-10-02", changes=[
                {"tor": "TOR-01-Hist001", "from": v2.fp(), "to": v3.fp()}])
            repo.commit("fixture")
            _code, report = repo.json_cli("states", "--today", "2026-10-26")
            row = next(r for r in report["requirements"] if r["tor"] == "TOR-01-Hist001")
            self.assertEqual(row["state"], "Changed since verified")
            self.assertEqual(row["historical_records"], ["CR-Hist000"])
