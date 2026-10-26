"""Build the Plan 7 dry-run fixture: the Plan 6 project plus Implemented epics on feature branches
for wrapup-epic, and Complete epics with stale requirements for reverify.

    python3.11 tests/peak-workflow/dryrun/plan7_wrapup.py <dest>

`dest` must be outside the repo (or under tmp/). develop is checked out at the end. Adds:

- nGft13 (feature/epic-nGft13-gift-messages, Implemented): TOR-02-Gift001 (a 40-character gift
  message that must be *rejected* when longer — the code truncates; the owner will amend) and
  TOR-02-Gift002 (gift wrap price — the owner is unsure; record as pending).
- qDsc15 (feature/epic-qDsc15-discount-rounding, Implemented): owns TOR-02-Rnd0001 and adds a
  test that also cites TOR-02-Disc001 (Disputed, 45 days — overdue): the branch touches it.
- rPrv16 (feature/epic-rPrv16-email-footer, Implemented): owns TOR-02-Foot001 and adds a test that
  also cites TOR-04-Priv001 (a Disputed Safety requirement).
- hRmXls7 (feature/epic-hRmXls7-remove-excel-export, Implemented): `to_xlsx` removed, but
  tests/test_orders.py still cites TOR-03-Xls0001 (one `sweep` hit).
- Reverify: bShip02 (Complete) owns TOR-03-Csv0002, reworded with only `historical` evidence —
  Changed since verified with no A finding, and the code still meets it (PASS); and TOR-02-Mail001,
  Verification failed, with no code sending email (FAIL). aSkel01's TOR-02-Page010 is Changed since
  verified *and* edited without a record (reverify must stop and send it to capture-requirements).
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
subprocess.run([sys.executable, str(HERE / "plan6_execution.py"), str(dest)], check=True, capture_output=True)


def ago(days: int) -> str:
    return (TODAY - dt.timedelta(days=days)).isoformat()


O = "docs/requirements/02-orders.feature.md"
OT = "docs/requirements/02-orders.feature.tracing.json"
GIFT1 = scenario("TOR-02-Gift001", "The application shall reject a gift message longer than 40 characters on the Order Detail (S-02)",
                 "Given an open order", 'When the user types a 41-character gift message and clicks "Save note"',
                 'Then the message is not saved', 'And the error "Gift messages are limited to 40 characters" is shown')
GIFT2 = scenario("TOR-02-Gift002", "The application shall add $3.00 to the order total when gift wrap is selected",
                 "Given an open order whose lines total $10.00", 'When the user ticks "Gift wrap"',
                 'Then the Total field shows "$13.00" before tax')

ROUND = scenario("TOR-02-Rnd0001", "The application shall round every order total to whole cents",
                 "Given an order whose discounted total is $108.004", "When the user opens its Order Detail (S-02)",
                 'Then the Total field shows "$108.00" before tax')
FOOT = scenario("TOR-02-Foot001", "The application shall sign the shipped email \"The Bakery\"",
                "Given an order marked Shipped", "When the shipped email is sent",
                'Then its last line is "-- The Bakery"')

r = FixtureRepo.open(dest)
r.checkout("develop")


def add_scenarios(blocks: list[str]) -> None:
    text = (r.root / O).read_text(encoding="utf-8")
    head, fence = text.rsplit("```", 1)
    r.write(O, head.rstrip("\n") + "\n\n" + "\n\n".join(blocks) + "\n```" + fence)
    data = json.loads((r.root / OT).read_text(encoding="utf-8"))
    for b in blocks:
        tor = b.split("[", 1)[1].split("]", 1)[0]
        data["requirements"].append({"id": tor, "traces_to": {"vision": [{"section": "§6", "paraphrase": "Order detail."}],
                                                              "conops": [], "claude_md": []}})
    r.write(OT, json.dumps(data, indent=2) + "\n")


def spec(epic, name, anchors, status="Not Started", extra=""):
    rows = "\n".join(f"| {tor} | `{ff}` |" for tor, ff in anchors)
    table = f"| TOR ID | Feature File |\n|--------|--------------|\n{rows}" if anchors else \
        "None — a removal epic; see Removal."
    return f"""# Epic {epic}: {name}

**Phase:** 4 — Polish
**Status:** {status}
**Dependencies:** —
**Planned by:** Fixture Author
**Planned:** {ago(15)}
**Plan branch:** docs/polish

---

## Description

{name} for the bakery order book.

## Requirements Anchors

{table}
{extra}
## Key Components

- `app/__init__.py`
"""


def handoff(epic, name, rows, deferrals="Count: 0\n\nNone"):
    table = "\n".join(f"| {t} | PASS | tests/test_{epic}.py |" for t in rows)
    return f"""# Epic {epic}: {name} — Implemented

## What Was Built

{name}.

## Deferrals

{deferrals}

## Key Files

| File | Purpose |
|------|---------|
| `app/__init__.py` | {name} |

## Spec Deviations

| TOR ID | As-Written | As-Implemented | Reason |
|--------|------------|----------------|--------|

## Key Decisions

- None.

## TOR Coverage (self-assessment)

| TOR | Verdict | Evidence |
|-----|---------|----------|
{table}

## Verification Results (self-assessment)

- Tests: PASS
"""


EPICS = [("nGft13", "gift-messages", "Gift messages", [(GIFT1.tor, O), (GIFT2.tor, O)]),
         ("qDsc15", "discount-rounding", "Discount rounding", [(ROUND.tor, O)]),
         ("rPrv16", "email-footer", "Email footer", [(FOOT.tor, O)])]

# ---- 15 days ago: phase 4 planned on develop. ------------------------------------------------------
add_scenarios([GIFT1.render(), GIFT2.render(), ROUND.render(), FOOT.render()])
index = "# Phase 4: Polish\n\n| Epic | Name | Dependencies |\n|------|------|--------------|\n" + "".join(
    f"| {e} | [{n}](epic-{e}-{s}.md) | — |\n" for e, s, n, _ in EPICS)
r.write("docs/implementation-plan/phase-4-polish/index.md", index)
for e, s, n, anchors in EPICS:
    r.write(f"docs/implementation-plan/phase-4-polish/epic-{e}-{s}.md", spec(e, n, anchors))
    r.sidecar(e, requirements=[t for t, _ in anchors])
r.commit("docs: plan phase 4 — gift messages, discount rounding, email footer", ago(15))

# ---- 10 days ago: a wording-only edit to TOR-03-Csv0002, recorded with historical evidence only. ---
E = "docs/requirements/03-export.feature.md"
CSV2_OLD = "Scenario: [TOR-03-Csv0002] The application shall name the CSV columns Customer, Total, and Status in that order"
CSV2_NEW = "Scenario: [TOR-03-Csv0002] The application shall label the CSV columns Customer, Total, and Status, in that order"
text = (r.root / E).read_text(encoding="utf-8")
assert CSV2_OLD in text
from tor_lifecycle import fingerprint_text  # noqa: E402
old_fp = dict(fingerprint_text(text))["TOR-03-Csv0002"]
r.write(E, text.replace(CSV2_OLD, CSV2_NEW))
new_fp = dict(fingerprint_text((r.root / E).read_text(encoding="utf-8")))["TOR-03-Csv0002"]
rw = record_data("reword", "Rw0Csv2", ago(10), tors=["TOR-03-Csv0002"], title="CSV columns are labelled",
                 reason="Wording only: 'label' matches the Export Dialog copy.")
rw["changes"] = [{"tor": "TOR-03-Csv0002", "from": old_fp, "to": new_fp}]
rw["evidence"] = {"commit": "0000000", "result": "historical"}
r.write(f"docs/requirements/changes/{ago(10)}-Rw0Csv2.toml", to_toml(rw))
r.commit("docs: reword TOR-03-Csv0002 (historical evidence)", ago(10))

APP = (r.root / "app/__init__.py").read_text(encoding="utf-8")
TESTS = (r.root / "tests/test_orders.py").read_text(encoding="utf-8")


def implement(epic, slug, name, anchors, files, rows):
    r.checkout("develop")
    r.checkout(f"feature/epic-{epic}-{slug}", create=True)
    for path, text in files.items():
        if text is None:
            r.remove(path)
        else:
            r.write(path, text)
    r.sidecar(epic, status="Implemented", requirements=[t for t, _ in anchors], owner="Fixture Author",
              implemented=ago(1), handoff=f"session-handoffs/epic-{epic}-implemented.md")
    spec_path = f"docs/implementation-plan/phase-4-polish/epic-{epic}-{slug}.md"
    if (r.root / spec_path).exists():
        r.write(spec_path, (r.root / spec_path).read_text().replace("**Status:** Not Started", f"**Status:** Implemented — {ago(1)}"))
    r.write(f"docs/implementation-plan/session-handoffs/epic-{epic}-implemented.md", handoff(epic, name, rows))
    r.commit(f"feat(epic-{epic}): {name.lower()}", ago(1))


implement("nGft13", "gift-messages", "Gift messages", EPICS[0][3], {
    "app/gift.py": '''"""Gift messages and gift wrap."""
GIFT_WRAP = 3.00


def save_gift_message(order, text):
    order["gift_message"] = text[:40]  # truncates instead of rejecting
    return order


def total_with_wrap(lines, wrap):
    return round(sum(lines) + (GIFT_WRAP if wrap else 0), 2)
''',
    "tests/test_gift.py": '''import unittest

from app.gift import save_gift_message, total_with_wrap


class GiftTests(unittest.TestCase):
    def test_long_message(self):
        """TOR-02-Gift001"""
        order = save_gift_message({}, "x" * 41)
        self.assertEqual(len(order["gift_message"]), 40)

    def test_gift_wrap(self):
        """TOR-02-Gift002"""
        self.assertEqual(total_with_wrap([10.00], True), 13.00)


if __name__ == "__main__":
    unittest.main()
'''}, [GIFT1.tor, GIFT2.tor])

implement("qDsc15", "discount-rounding", "Discount rounding", EPICS[1][3], {
    "app/__init__.py": APP.replace("gross *= 0.9", "gross = round(gross * 0.9, 2)"),
    "tests/test_discount.py": '''import unittest

from app import total


class DiscountTests(unittest.TestCase):
    def test_rounded_to_cents(self):
        """TOR-02-Rnd0001, with the TOR-02-Disc001 discount: $120.00 of lines → $108.00 before tax."""
        self.assertEqual(total([120.00]), round(108.00 * 1.08, 2))


if __name__ == "__main__":
    unittest.main()
'''}, [ROUND.tor])

implement("rPrv16", "email-footer", "Email footer", EPICS[2][3], {
    "app/mail.py": '''"""Shipped email (fixture)."""


def shipped_email(order):
    return f"Order {order['number']} has shipped.\\n-- The Bakery"
''',
    "tests/test_mail.py": '''import unittest

from app.mail import shipped_email


class MailTests(unittest.TestCase):
    def test_signature(self):
        """TOR-02-Foot001 (and TOR-04-Priv001: the footer names no other order)."""
        body = shipped_email({"number": "A-1"})
        self.assertEqual(body.splitlines()[-1], "-- The Bakery")
        self.assertNotIn("M-", body)


if __name__ == "__main__":
    unittest.main()
'''}, [FOOT.tor])

# ---- the removal epic: code gone, one test still cites the retired ID. ---------------------------
r.checkout("develop")
r.checkout("feature/epic-hRmXls7-remove-excel-export", create=True)
r.write("app/__init__.py", APP.replace('\n\ndef to_xlsx(orders):\n    return b"PK" + bytes(len(orders))\n', "\n"))
r.write("tests/test_orders.py", TESTS.replace("from app import page, sort_orders, to_csv, to_xlsx, total",
                                              "from app import page, sort_orders, to_csv, total").replace(
    '''    def test_xlsx(self):
        """TOR-03-Xls0001"""
        self.assertTrue(to_xlsx([]).startswith(b"PK"))
''', '''    def test_no_xlsx(self):
        """TOR-03-Xls0001 is retired: the Excel export is gone."""
        import app
        self.assertFalse(hasattr(app, "to_xlsx"))
'''))
r.sidecar("hRmXls7", status="Implemented", requirements=None, retires="CR-Rt0Xls1", owner="Fixture Author",
          implemented=ago(1), handoff="session-handoffs/epic-hRmXls7-implemented.md")
sp = "docs/implementation-plan/phase-2-extend/epic-hRmXls7-remove-excel-export.md"
r.write(sp, (r.root / sp).read_text().replace("**Status:** Not Started", f"**Status:** Implemented — {ago(1)}"))
r.write("docs/implementation-plan/session-handoffs/epic-hRmXls7-implemented.md",
        handoff("hRmXls7", "Remove Excel export", []))
r.commit("feat(epic-hRmXls7): remove the Excel export", ago(1))
r.checkout("develop")
print(dest)
