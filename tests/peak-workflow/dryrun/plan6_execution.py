"""Build the Plan 6 dry-run fixture: the Plan 5 orders app (develop checked out) plus the epics
start-epic and quick-fix are exercised on.

    python3.11 tests/peak-workflow/dryrun/plan6_execution.py <dest>

`dest` must be outside the repo (or under tmp/). Adds to develop:

- jRfd09 (Not Started) still anchors TOR-02-Rfnd001, superseded by TOR-02-Rfnd002 after the epic
  was planned (the swap missed it: F `open-epic-retired`); tests/test_refund.py cites the old ID
  (start-epic 6.2 Replace + a `sweep` retarget step).
- lDue11 (Not Started) anchors TOR-02-Due0001 (Specified) — the in-epic amendment case.
- mNoA12 (Not Started) has no Requirements Anchors section (Q16 stop).
- hRmXls7 (from Plan 5) is the removal epic; aSkel01 (Complete) owns TOR-01-Ver0001, the
  quick-fix supersede target; cSort03 (In Progress) owns TOR-02-Sort001, the own-branch A case.
"""
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from fixtures import FixtureRepo, record_data, scenario, to_toml  # noqa: E402

dest = Path(sys.argv[1]).resolve()
TODAY = dt.date.today()
subprocess.run([sys.executable, str(HERE / "plan5_states.py"), str(dest)], check=True, capture_output=True)


def ago(days: int) -> str:
    return (TODAY - dt.timedelta(days=days)).isoformat()


O = "docs/requirements/02-orders.feature.md"
OT = "docs/requirements/02-orders.feature.tracing.json"
RFND_V1 = scenario("TOR-02-Rfnd001", "The application shall refund a cancelled order in full",
                   "Given a cancelled order whose total is $12.50", 'When the user clicks "Refund"',
                   'Then a refund of "$12.50" is recorded against the order')
RFND_V2 = scenario("TOR-02-Rfnd002", "The application shall refund a cancelled order minus a 5% restocking fee",
                   "Given a cancelled order whose total is $20.00", 'When the user clicks "Refund"',
                   'Then a refund of "$19.00" is recorded against the order')

r = FixtureRepo.open(dest)
r.checkout("develop")


def add_scenario(block: str, replace: str | None = None) -> None:
    text = (r.root / O).read_text(encoding="utf-8")
    if replace:
        assert replace in text
        text = text.replace(replace, block)
    else:
        head, fence = text.rsplit("```", 1)
        text = head.rstrip("\n") + "\n\n" + block + "\n```" + fence
    r.write(O, text)


def tracing(add: list[str], drop: list[str] = ()) -> None:
    data = json.loads((r.root / OT).read_text(encoding="utf-8"))
    data["requirements"] = [e for e in data["requirements"] if e["id"] not in drop] + [
        {"id": t, "traces_to": {"vision": [{"section": "§6", "paraphrase": "Order detail actions."}],
                                "conops": [], "claude_md": []}} for t in add]
    r.write(OT, json.dumps(data, indent=2) + "\n")


def spec(epic, name, anchors, extra="", section=True):
    rows = "\n".join(f"| {tor} | `{O}` |" for tor in anchors)
    table = f"## Requirements Anchors\n\n| TOR ID | Feature File |\n|--------|--------------|\n{rows}\n" if section else ""
    return f"""# Epic {epic}: {name}

**Phase:** 3 — Money
**Status:** Not Started
**Dependencies:** —
**Planned by:** Fixture Author
**Planned:** {ago(20)}
**Plan branch:** docs/money

---

## Description

{name} for the bakery order book.

{table}{extra}
## Key Components

- `app/__init__.py`
"""


# ---- 20 days ago: phase 3 planned (refunds, due dates, a legacy epic with no anchors). --------
add_scenario(RFND_V1.render())
tracing([RFND_V1.tor])
r.write("docs/implementation-plan/phase-3-money/index.md", """# Phase 3: Money

| Epic | Name | Dependencies |
|------|------|--------------|
| jRfd09 | [Refunds](epic-jRfd09-refunds.md) | — |
| lDue11 | [Due dates](epic-lDue11-due-dates.md) | — |
| mNoA12 | [Receipt reprint](epic-mNoA12-receipt-reprint.md) | — |
""")
r.write("docs/implementation-plan/phase-3-money/epic-jRfd09-refunds.md", spec("jRfd09", "Refunds", [RFND_V1.tor]))
r.write("docs/implementation-plan/phase-3-money/epic-lDue11-due-dates.md",
        spec("lDue11", "Due dates", ["TOR-02-Due0001"]))
r.write("docs/implementation-plan/phase-3-money/epic-mNoA12-receipt-reprint.md",
        spec("mNoA12", "Receipt reprint", [], section=False,
             extra="## Acceptance Criteria\n\n- [ ] Staff can reprint a receipt from the Order Detail (S-02)\n"))
r.sidecar("jRfd09", requirements=[RFND_V1.tor])
r.sidecar("lDue11", requirements=["TOR-02-Due0001"])
r.sidecar("mNoA12", requirements=None)
r.write("tests/test_refund.py", '''import unittest


class RefundTests(unittest.TestCase):
    @unittest.skip("prototype — refunds not built yet")
    def test_full_refund(self):
        """TOR-02-Rfnd001: a cancelled $12.50 order refunds $12.50."""


if __name__ == "__main__":
    unittest.main()
''')
r.commit("docs: plan phase 3 — refunds, due dates, receipt reprint", ago(20))

# ---- 5 days ago: the refund rule changed on a docs/ branch that missed jRfd09's anchors. ---------
add_scenario(RFND_V2.render(), replace=RFND_V1.render())
tracing([RFND_V2.tor], drop=[RFND_V1.tor])
rec = record_data("supersede", "Sp0Rfnd", ago(5), tors=[RFND_V1.tor], title="Restocking fee on refunds",
                  reason="Cancelled custom cakes cost the shop; refunds keep a 5% restocking fee.",
                  keywords=["refund", "restocking fee"])
rec["changes"] = [{"tor": RFND_V1.tor, "feature_file": "02-orders.feature.md", "fingerprint": RFND_V1.fp(),
                   "successors": [RFND_V2.tor], "traced_to": ["vision §6"], "text": RFND_V1.render()}]
r.write(f"docs/requirements/changes/{ago(5)}-Sp0Rfnd.toml", to_toml(rec))
r.commit("docs: refunds keep a 5% restocking fee", ago(5))
print(dest)
