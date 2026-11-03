"""Build the Plan 5 dry-run fixture: the Plan 4 orders app grown to hold every derived requirement
state, every finding letter A–F, and a docs/ branch whose capture-requirements run left an
unassigned supersede successor and a `removal = "code"` retire record with no removal epic.

    python3.11 tests/peak-workflow/dryrun/plan5_states.py <dest> [--behind]

`dest` must be outside the repo (or under tmp/). Record and commit dates are relative to today, so
the Disputed ages (10, 45, and 2 days; Safety) hold whenever it is built. `--behind` stamps
format 1 (the Format Guard's `behind` verdict, for status's degraded mode).

develop:  every live state (see EXPECTED below) + Superseded, Retired, Retired removal pending
          (with a Not Started removal epic). Findings A, B, C, D, E, F.
docs/q4-requirements (checked out): supersede TOR-02-Tax0001 → TOR-02-Tax0002 (unassigned; its
          predecessor's epic is Complete), retire TOR-02-Slip001 (`removal = "code"`, no epic), a
          guard requirement TOR-02-Slip002, a "shall remove" requirement TOR-02-Slip003 (must never
          be anchored), and the discovery changelog that run archived (.processed).
"""
import datetime as dt
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures import FixtureRepo, record_data, scenario, to_toml  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith("--")]
BEHIND = "--behind" in sys.argv
dest = Path(args[0]).resolve()
TODAY = dt.date.today()


def ago(days: int) -> str:
    return (TODAY - dt.timedelta(days=days)).isoformat()


S = scenario
VER = S("TOR-01-Ver0001", "The web application shall expose its name and semantic version at GET /version as JSON",
        "Given the application is running", "When a client sends GET /version",
        'Then the response is 200 with JSON {"name": "orders", "version": "1.0.0"}')
LIST_V1 = S("TOR-02-List001", "The application shall list orders with customer, total, and status columns on the Orders List (S-01)",
            "Given 3 orders exist", "When the user opens the Orders List (S-01)",
            "Then 3 rows are shown with Customer, Total, and Status columns")
LIST_V2 = S("TOR-02-List001", "The application shall list the orders with Customer, Total, and Status columns on the Orders List (S-01)",
            "Given three orders exist", "When the user opens the Orders List (S-01)",
            "Then three rows are shown with the Customer, Total, and Status columns")
PAGE_V1 = S("TOR-02-Page010", "The application shall show at most 10 orders per page on the Orders List (S-01)",
            "Given 30 orders exist", "When the user opens the Orders List (S-01)",
            "Then exactly 10 order rows are visible", 'And a "Next page" button is shown')
PAGE_V2 = S("TOR-02-Page010", "The application shall show at most 25 orders per page on the Orders List (S-01)",
            "Given 30 orders exist", "When the user opens the Orders List (S-01)",
            "Then exactly 25 order rows are visible", 'And a "Next page" button is shown')
SORT = S("TOR-02-Sort001", "The application shall sort the Orders List (S-01) by customer name ascending",
         "Given orders for customers Zed, Amy, and Max exist", "When the user opens the Orders List (S-01)",
         "Then the rows are ordered Amy, Max, Zed")
TOT = S("TOR-02-Tot0001", "The application shall show the order's grand total on the Order Detail (S-02)",
        "Given an order with two lines of $5.00 and $7.50", "When the user opens that order's Order Detail (S-02)",
        'Then the Total field shows "$12.50"')
STAT = S("TOR-02-Stat001", "The application shall offer a Status filter with the options All, Open, and Shipped on the Orders List (S-01)",
         "Given the Orders List (S-01) is open", "When the user opens the Status filter select",
         "Then the options are exactly All, Open, and Shipped")
MAIL = S("TOR-02-Mail001", "The application shall email the customer when their order is marked Shipped",
         "Given an open order for a customer with an email address", "When the user marks the order Shipped",
         "Then one email is sent to that address naming the order number")
ARCH = S("TOR-02-Arch001", "The application shall hide archived orders from the Orders List (S-01) by default",
         "Given 2 open orders and 1 archived order exist", "When the user opens the Orders List (S-01)",
         "Then 2 rows are shown")
NOTE = S("TOR-02-Note001", "The application shall save a free-text note on the Order Detail (S-02)",
         "Given an open order", 'When the user types "Leave at back door" in the Note field and clicks "Save note"',
         'Then reopening the Order Detail (S-02) shows "Leave at back door"')
RCPT = S("TOR-02-Rcpt001", "The application shall attach a PDF receipt to the shipped email",
         "Given an order marked Shipped", "When the shipped email is sent",
         "Then it carries one PDF attachment named receipt-<order number>.pdf")
DUE = S("TOR-02-Due0001", "The application shall show each order's due date on the Orders List (S-01)",
        "Given an order due on 2026-12-01", "When the user opens the Orders List (S-01)",
        'Then that order\'s row shows "Due 1 Dec"')
DISP_A = S("TOR-02-Cncl001", "The application shall let the user cancel an open order from the Order Detail (S-02)",
           "Given an open order", 'When the user clicks "Cancel order" and confirms',
           "Then the order's status is Cancelled")
DISP_B = S("TOR-02-Disc001", "The application shall apply a 10% discount to orders over $100",
           "Given an order whose lines total $120.00", "When the user opens its Order Detail (S-02)",
           'Then the Total field shows "$108.00"')
TAX_V1 = S("TOR-02-Tax0001", "The application shall add 8% sales tax to the order total",
           "Given an order whose lines total $10.00", "When the user opens its Order Detail (S-02)",
           'Then the Total field shows "$10.80"')
TAX_V2 = S("TOR-02-Tax0002", "The application shall add the sales tax rate configured for the shop to the order total",
           "Given the shop's tax rate is set to 9.5%", "And an order whose lines total $10.00",
           "When the user opens its Order Detail (S-02)", 'Then the Total field shows "$10.95"')
SLIP = S("TOR-02-Slip001", "The application shall print a packing slip from the Order Detail (S-02)",
         "Given an open order", 'When the user clicks "Print slip"',
         "Then the browser print dialog opens with the order's lines and address")
SLIP_GUARD = S("TOR-02-Slip002", "The application shall answer GET /orders/<id>/slip with HTTP 404",
               "Given any order", "When a client sends GET /orders/<id>/slip",
               "Then the response is 404")
SLIP_REMOVE = S("TOR-02-Slip003", "The application shall remove the packing-slip printer module",
                "Given the codebase", "When the release is built",
                "Then app/slip.py does not exist")
BULK = S("TOR-02-Bulk001", "The application shall mark several selected orders Shipped at once",
         "Given 3 selected open orders", 'When the user clicks "Mark shipped"', "Then all 3 are Shipped")
FAX = S("TOR-02-Fax0001", "The application shall fax the order to the kitchen",
        "Given a new order", "When it is saved", "Then one fax is sent to the kitchen number")
CSV1 = S("TOR-03-Csv0001", "The application shall export the visible orders as a CSV file from the Export Dialog (S-03)",
         "Given the Orders List (S-01) shows 3 orders", 'When the user clicks "Export CSV" in the Export Dialog (S-03)',
         "Then a file orders.csv downloads with a header row and 3 data rows")
CSV3 = S("TOR-03-Csv0003", "The application shall export every order matching the Status filter as a CSV file from the Export Dialog (S-03)",
         "Given 30 orders match the Status filter", 'When the user clicks "Export CSV" in the Export Dialog (S-03)',
         "Then a file orders.csv downloads with a header row and 30 data rows")
CSV2 = S("TOR-03-Csv0002", "The application shall name the CSV columns Customer, Total, and Status in that order",
         "Given the Export Dialog (S-03) is open", 'When the user clicks "Export CSV"',
         "Then the CSV header row is exactly Customer,Total,Status")
XLS = S("TOR-03-Xls0001", "The application shall export the visible orders as an Excel workbook",
        "Given the Orders List (S-01) shows 3 orders", 'When the user clicks "Export Excel"',
        "Then a file orders.xlsx downloads with 3 data rows")
SAFE = S("TOR-04-Priv001", "The application shall never include another customer's order in a customer's email",
         "Given orders for customers Amy and Max", "When Amy's order is marked Shipped",
         "Then the email to Amy names no order of Max's", verification="automated test")

EXPECTED = {  # develop, by derived state (states --json)
    "Verified": [VER, TOT, CSV2, TAX_V1, SLIP], "Verified (reworded)": [LIST_V2],
    "Changed since verified": [PAGE_V2], "Verification failed": [MAIL],
    "Verified (legacy, unfingerprinted)": [STAT], "Disputed": [DISP_A, DISP_B, SAFE],
    "In Progress": [SORT], "Paused": [ARCH], "Implemented": [NOTE], "Planned": [CSV3],
    "Waived": [RCPT], "Specified": [DUE], "Superseded": [CSV1], "Retired": [FAX],
    "Retired, removal pending": [XLS],
}

CLAUDE_MD = """# CLAUDE.md — Orders

## Project Overview

A small web app for a bakery to track customer orders.

## Tech Stack

- Python 3.11 standard library HTTP server (fixture)

## Testing

- Test command: `python3 -m unittest discover -s tests -v`

## Tool Hygiene & Operability

- **Project type:** Web app
- **Version exposure:** GET `/version` returns JSON `{"name", "version"}`
- **Version single source of truth:** `app/__init__.py`
- **Version stamped at log startup:** N/A — fixture
- **Logging convention:** N/A — fixture
- **Exit code convention:** N/A — not a CLI tool
- **stdout / stderr discipline:** N/A — not a CLI tool
- **Error message standard:** N/A — fixture

## UX Baseline

- **Design system:** shadcn/ui
- **Screen states:** N/A — fixture
- **Keyboard & focus:** N/A — fixture
- **Forms:** N/A — fixture
- **Destructive actions:** N/A — fixture
- **Progress feedback:** N/A — fixture
- **Layout floor:** N/A — fixture
- **Contrast:** N/A — fixture
- **Reduced motion:** N/A — fixture
- **Navigation:** N/A — fixture
- **Responsiveness budget:** N/A
- **Undo:** N/A

## Verification & Quality Gates

- **Test directories:** `tests/`

## Git Workflow

- Base branch: `develop`. Planning on `docs/<name>`, epics on `feature/epic-<id>-<name>`, fixes on `hotfix/<slug>`.

## Design & Planning Documents

- [Product Vision](docs/product-vision-planning/product-vision.md)
- [Concept of Operations](docs/product-vision-planning/concept-of-operations.md)
- [Requirements Baseline](docs/requirements/) — TOR feature files and tracing sidecars
"""

VISION = """# Orders — Product Vision & Brief

**Document Version:** 1.2
**Date:** {date}
**Status:** Approved

---

## 1. Product Name
Orders — a one-screen order book for a small bakery.

## 2. Problem Statement
The bakery tracks orders on paper. Orders get lost, totals are added by hand, and nobody knows
which orders have shipped.

## 3. Target Users
| Group | Need |
|---|---|
| Counter staff | See and update orders fast |

## 4. Vision Statement
Every order is visible, totalled, and tracked from open to shipped.

## 5. Goals & Success Criteria (MVP)
| Goal | Success criterion |
|---|---|
| G1 Find any order fast | Orders list loads with paging and sorting |
| G2 Correct totals | Totals, tax, and discounts are computed, never typed |
| G3 Track shipping | Status filter and shipped emails with receipts |
| G4 Share the order book | CSV export for the accountant |

## 6. MVP Scope Summary
- Orders list (paging, sorted by customer, status filter, due dates, archived hidden)
- Order detail with grand total, tax at the shop's configured rate, discounts, notes, cancel
- Shipped email with a PDF receipt; never another customer's data
- CSV export of every order matching the filter

## 7. Out of Scope for MVP
- Payments
- Packing slips (dropped in Q4 — the courier prints labels)

## 8. Key Business Scenarios
1. Staff find an order. 2. Staff ship an order. 3. Staff export orders for the accountant.

## 9. Design Direction
- shadcn/ui table, plain and dense

## 10. Data Strategy
- SQLite file on the shop PC

## 11. Backlog / Future Vision
- SMS notifications
"""

CONOPS = """# Orders — Concept of Operations (ConOps)

**Document Version:** 1.3
**Date:** {date}
**Status:** Approved
**Companion:** product-vision.md

---

## 1. Purpose & Scope
How counter staff use Orders day to day.

## 2. Current State ("As-Is")
Paper order book.

## 3. Proposed System ("To-Be")
A web order book on the shop PC.

## 4. User Roles & Profiles
| Role | Questions |
|---|---|
| Counter staff | Where is this order? Has it shipped? |

## 5. Operational Scenarios

### Scenario 1: Find an order
**Actor:** Counter staff
**Trigger:** A customer asks about an order
**Goal:** Find it

**Steps:**
1. On the Orders List (S-01), staff see orders sorted by customer name, 25 per page, with due dates.
2. Staff pick Shipped in the "Status" filter select (All, Open, Shipped).
3. Staff click an order row; the Order Detail (S-02) shows its lines, tax at the shop's rate, discount, and grand total.

**Outcome:** The order is found.
**Screens:** S-01 Orders List, S-02 Order Detail

### Scenario 2: Ship an order
**Actor:** Counter staff
**Trigger:** An order leaves the shop
**Goal:** Mark it shipped

**Steps:**
1. On the Order Detail (S-02), staff click the "Mark shipped" button.
2. The customer receives an email naming the order number, with a PDF receipt.

**Outcome:** The customer knows the order shipped.
**Screens:** S-02 Order Detail

### Scenario 3: Export for the accountant
**Actor:** Counter staff
**Trigger:** Month end
**Goal:** Hand the order book to the accountant

**Steps:**
1. On the Orders List (S-01), staff click the "Export…" button; the Export Dialog (S-03) opens.
2. Staff click "Export CSV"; orders.csv downloads with every order matching the filter.

**Outcome:** The accountant has the month's orders.
**Screens:** S-01 Orders List, S-03 Export Dialog

## 6. System Interfaces & Data Flows
Browser → app → SQLite. Email via SMTP.

## 7. Functional Summary
| Area | Features |
|---|---|
| Orders | list, paging, sorting, status filter, due dates, detail, total, tax, discount, notes, cancel |
| Shipping | mark shipped, email, receipt |
| Export | CSV export |

## 8. Operational Constraints & Assumptions
| Constraint | Value |
|---|---|
| Users | 1–3 staff on one PC |

## 9. Glossary
| Term | Meaning |
|---|---|
| Order | A customer's purchase of baked goods |
"""

SCREENS = """# Orders — Screen Inventory

**Document Version:** 1.0
**Companion:** concept-of-operations.md

## Screen Inventory

| Screen ID | Name | Wireframe | Purpose | Entry points | Primary actions | Data shown | States | Serves |
|---|---|---|---|---|---|---|---|---|
| S-01 | Orders List | wireframes/S-01-orders-list.html | Find orders | Nav "Orders" | "Status" filter select, "Next page" button, "Export…" button, order row link | Table: Customer, Total, Status, Due | loading / empty / error / populated | S1.1, S1.2, S3.1 |
| S-02 | Order Detail | wireframes/S-02-order-detail.html | See and ship one order | S-01 order row | "Mark shipped" button, "Cancel order" button, "Save note" button | Lines, Tax, Discount, Total, Note | loading / empty / error / populated | S1.3, S2.1 |
| S-03 | Export Dialog | wireframes/S-03-export-dialog.html | Export orders as CSV | S-01 "Export…" button | "Export CSV" button, "Cancel" button | Row count | n/a — not data-bearing | S3.2 |
"""

WIREFRAME = """<!doctype html><html><head><title>{name}</title><style>body{{font-family:system-ui;color:#222;background:#fff}}</style></head>
<body><h1>{name}</h1><p>Grayscale wireframe (fixture).</p></body></html>
"""

APP = '''"""Orders fixture app logic."""
__version__ = "1.0.0"
TAX_RATE = 0.08


def page(orders, size=25):
    return orders[:size]


def sort_orders(orders):
    return sorted(orders, key=lambda o: o["customer"])


def total(lines):
    gross = sum(lines)
    if gross > 100:
        gross *= 0.9
    return round(gross * (1 + TAX_RATE), 2)


def to_csv(orders):
    rows = ["Customer,Total,Status"] + [f"{o['customer']},{o['total']:.2f},{o['status']}" for o in orders]
    return "\\n".join(rows) + "\\n"


def to_xlsx(orders):
    return b"PK" + bytes(len(orders))
'''

SLIP_PY = '''"""Packing slips (TOR-02-Slip001)."""


def slip_html(order):
    return "<h1>Packing slip</h1>" + "".join(f"<p>{line}</p>" for line in order["lines"])
'''

TESTS = '''import unittest

from app import page, sort_orders, to_csv, to_xlsx, total


class OrdersTests(unittest.TestCase):
    def test_grand_total(self):
        """TOR-02-Tot0001 and TOR-02-Tax0001: lines plus 8% tax."""
        self.assertEqual(total([10.00]), 10.80)

    def test_sorted_by_customer(self):
        """TOR-02-Sort001"""
        names = [o["customer"] for o in sort_orders([{"customer": c} for c in ("Zed", "Amy", "Max")])]
        self.assertEqual(names, ["Amy", "Max", "Zed"])

    def test_page_size(self):
        """TOR-02-Page010"""
        self.assertEqual(len(page(list(range(30)))), 25)

    def test_bulk_ship(self):
        """TOR-02-Gone999: dangling — no such requirement."""


class ExportTests(unittest.TestCase):
    def test_csv_rows(self):
        """TOR-03-Csv0001"""
        orders = [{"customer": c, "total": 1.0, "status": "Open"} for c in "ABC"]
        self.assertEqual(len(to_csv(orders).splitlines()), 4)

    def test_csv_header(self):
        """TOR-03-Csv0002"""
        self.assertEqual(to_csv([]).splitlines()[0], "Customer,Total,Status")

    def test_xlsx(self):
        """TOR-03-Xls0001"""
        self.assertTrue(to_xlsx([]).startswith(b"PK"))


if __name__ == "__main__":
    unittest.main()
'''

SLIP_TEST = '''import unittest

from app.slip import slip_html


class SlipTests(unittest.TestCase):
    def test_slip_lists_lines(self):
        """TOR-02-Slip001"""
        self.assertIn("<p>bread</p>", slip_html({"lines": ["bread"]}))


if __name__ == "__main__":
    unittest.main()
'''

ARCHITECTURE = """# Architecture — Orders

## Overview
A single-process Python HTTP server over a SQLite file.

## Modules
- `app/__init__.py` — order logic: paging, sorting, totals, CSV export
"""

DESIGN_NOTES = """# Design Notes — Orders

## 1. Totals are computed server-side
Totals are never typed; `total()` is the only place they are computed.
"""


def tracing(nn, name, tors):
    return json.dumps({
        "feature_id": nn, "feature_file": f"{nn}-{name}.feature.md",
        "generator": "haiku-sub-agent via /peak-workflow:capture-requirements",
        "requirements": [{"id": t.tor, "traces_to": {"vision": [{"section": "§6", "paraphrase": "Serves the scope."}],
                                                      "conops": [], "claude_md": []}} for t in tors],
        "coverage_gaps": []}, indent=2) + "\n"


def spec(epic, name, phase, tors, status, deps="—", extra=""):
    """Complete specs keep the pre-3.0 title column (history); open ones are two-column."""
    if status == "Complete":
        rows = "\n".join(f"| {t.tor} | `docs/requirements/{ff}` | {t.title} |" for t, ff in tors)
        table = "| TOR ID | Feature File | Scenario Title |\n|--------|--------------|----------------|\n" + rows
    elif tors:
        rows = "\n".join(f"| {t.tor} | `docs/requirements/{ff}` |" for t, ff in tors)
        table = "| TOR ID | Feature File |\n|--------|--------------|\n" + rows
    else:
        table = "None — a removal epic; see Removal."
    return f"""# Epic {epic}: {name}

**Phase:** {phase}
**Status:** {status}
**Dependencies:** {deps}
**Planned by:** Fixture Author
**Planned:** {ago(60)}
**Plan branch:** docs/mvp

---

## Description

{name} for the bakery order book.

## Requirements Anchors

{table}
{extra}
## Key Components

- `app/__init__.py`
"""


O, E, A, P = "02-orders.feature.md", "03-export.feature.md", "01-app.feature.md", "04-privacy.feature.md"


def write_features(r, orders, export):
    r.feature("01", "app", [VER], banner="Tool Hygiene & Operability")
    r.feature("02", "orders", orders, banner="Orders")
    r.feature("03", "export", export, banner="CSV Export")
    r.feature("04", "privacy", [SAFE], banner="Safety")
    r.write("docs/requirements/01-app.feature.tracing.json", tracing("01", "app", [VER]))
    r.write("docs/requirements/02-orders.feature.tracing.json", tracing("02", "orders", orders))
    r.write("docs/requirements/03-export.feature.tracing.json", tracing("03", "export", export))
    r.write("docs/requirements/04-privacy.feature.tracing.json", tracing("04", "privacy", [SAFE]))


def record(r, kind, suffix, date, **kw):
    data = record_data(kind, suffix, date, **kw)
    r.write(f"docs/requirements/changes/{date}-{suffix}.toml", to_toml(data))
    return f"CR-{suffix}"


if dest.exists():
    shutil.rmtree(dest)
r = FixtureRepo()

# ---- Commit 1 (60 days ago): the MVP plan, wrapped up. ------------------------------------------
r.write("CLAUDE.md", CLAUDE_MD)
r.stamp(1 if BEHIND else 2, disputed_threshold_days=30)
r.write("docs/product-vision-planning/product-vision.md", VISION.format(date=ago(60)))
r.write("docs/product-vision-planning/concept-of-operations.md", CONOPS.format(date=ago(60)))
r.write("docs/product-vision-planning/ux/screens.md", SCREENS)
for sid, slug, name in (("S-01", "orders-list", "Orders List"), ("S-02", "order-detail", "Order Detail"),
                        ("S-03", "export-dialog", "Export Dialog")):
    r.write(f"docs/product-vision-planning/ux/wireframes/{sid}-{slug}.html", WIREFRAME.format(name=name))
r.write("docs/requirements/README.md", "# Requirements Baseline\n\nSee /peak-workflow:capture-requirements.\n")
r.write("docs/architecture.md", ARCHITECTURE)
r.write("docs/design-notes.md", DESIGN_NOTES)
ORDERS_V1 = [LIST_V1, PAGE_V1, SORT, TOT, STAT, MAIL, ARCH, NOTE, RCPT, DUE, DISP_A, DISP_B, TAX_V1, SLIP, BULK, FAX]
EXPORT_V1 = [CSV1, CSV2, XLS]
write_features(r, ORDERS_V1, EXPORT_V1)
r.write("docs/implementation-plan/index.md", "# Implementation Plan\n\nSee the phase indexes under `phase-*/index.md`.\n")
r.write("docs/implementation-plan/README.md", "# Orders — Implementation Plan\n\nRun `/peak-workflow:status`.\n")
r.write("docs/implementation-plan/phase-1-mvp/index.md", """# Phase 1: MVP

| Epic | Name | Dependencies |
|------|------|--------------|
| aSkel01 | [Walking skeleton and orders list](epic-aSkel01-walking-skeleton.md) | — |
| bShip02 | [Detail, shipping, and export](epic-bShip02-detail-shipping-export.md) | aSkel01 |
| cSort03 | [Sorting](epic-cSort03-sorting.md) | aSkel01 |
""")
r.write("docs/implementation-plan/phase-1-mvp/epic-aSkel01-walking-skeleton.md",
        spec("aSkel01", "Walking skeleton and orders list", "1 — MVP",
             [(VER, A), (LIST_V1, O), (PAGE_V1, O), (DISP_A, O), (BULK, O)], "Complete"))
SHIP = [(TOT, O), (STAT, O), (MAIL, O), (RCPT, O), (DISP_B, O), (TAX_V1, O), (SLIP, O), (FAX, O),
        (CSV1, E), (CSV2, E), (XLS, E), (SAFE, P)]
r.write("docs/implementation-plan/phase-1-mvp/epic-bShip02-detail-shipping-export.md",
        spec("bShip02", "Detail, shipping, and export", "1 — MVP", SHIP, "Complete", "Epic aSkel01 (skeleton)"))
r.write("docs/implementation-plan/phase-1-mvp/epic-cSort03-sorting.md",
        spec("cSort03", "Sorting", "1 — MVP", [(SORT, O)], "In Progress", "Epic aSkel01 (skeleton)"))
r.write("docs/implementation-plan/phase-2-extend/index.md", """# Phase 2: Extend

| Epic | Name | Dependencies |
|------|------|--------------|
| dArch04 | [Archive](epic-dArch04-archive.md) | aSkel01 |
| eNote05 | [Order notes](epic-eNote05-order-notes.md) | bShip02 |
""")
r.write("docs/implementation-plan/phase-2-extend/epic-dArch04-archive.md",
        spec("dArch04", "Archive", "2 — Extend", [(ARCH, O)], "Paused", "Epic aSkel01 (skeleton)"))
r.write("docs/implementation-plan/phase-2-extend/epic-eNote05-order-notes.md",
        spec("eNote05", "Order notes", "2 — Extend", [(NOTE, O)], "Implemented", "Epic bShip02 (detail)"))
r.sidecar("aSkel01", status="Complete", requirements=[VER.tor, LIST_V1.tor, PAGE_V1.tor, DISP_A.tor, BULK.tor],
          verified={t.tor: t.fp() for t in (VER, LIST_V1, PAGE_V1, DISP_A, BULK)},
          owner="Fixture Author", implemented=ago(55), completed=ago(55),
          handoff="session-handoffs/epic-aSkel01-complete.md")
ship_verified = {t.tor: t.fp() for t, _ in SHIP if t not in (STAT, MAIL, RCPT)}
r.sidecar("bShip02", status="Complete", requirements=[t.tor for t, _ in SHIP],
          verified=ship_verified, unverified={MAIL.tor: f"{ago(20)} no email is sent when the customer has two addresses"},
          waived=f"{RCPT.tor} → gExp06", reverified=ago(20),
          owner="Fixture Author", implemented=ago(50), completed=ago(50),
          handoff="session-handoffs/epic-bShip02-complete.md")
r.sidecar("cSort03", status="In Progress", requirements=[SORT.tor], owner="Fixture Author")
r.sidecar("dArch04", status="Paused", requirements=[ARCH.tor], owner="Fixture Author",
          handoff="session-handoffs/epic-dArch04-paused.md")
r.sidecar("eNote05", status="Implemented", requirements=[NOTE.tor], owner="Fixture Author",
          implemented=ago(3), handoff="session-handoffs/epic-eNote05-implemented.md")
r.write("docs/implementation-plan/session-handoffs/epic-aSkel01-complete.md",
        "# Epic aSkel01 — Complete\n\n## Key Decisions\n- Paging is a server-side slice.\n")
r.write("docs/implementation-plan/session-handoffs/epic-bShip02-complete.md",
        "# Epic bShip02 — Complete\n\n## Key Decisions\n- Email goes through a single `send_mail()` wrapper.\n"
        "- Excel export writes a minimal xlsx by hand (no openpyxl).\n")
r.write("docs/implementation-plan/session-handoffs/epic-dArch04-paused.md",
        f"# Epic dArch04: Archive — Session Handoff (Paused)\n\n**Paused:** {ago(12)}\n**Reason:** end of session\n")
r.write("docs/implementation-plan/session-handoffs/epic-eNote05-implemented.md",
        "# Epic eNote05 — Implemented\n\n## TOR Coverage\n| TOR | Result |\n|---|---|\n| TOR-02-Note001 | PASS |\n")
r.write("app/__init__.py", APP.replace("size=25", "size=10"))
r.write("app/slip.py", SLIP_PY)
r.write("tests/test_orders.py", TESTS.replace("), 25)", "), 10)"))
r.write("tests/test_slip.py", SLIP_TEST)
r.write(".gitignore", "__pycache__/\n")
r.commit("docs: MVP plan, requirements, and wrapped-up epics", ago(50))

# ---- Commit 2 (30 days ago): Q3 changes merged — supersede, retires, reword, and two bypasses. ---
reword = record_data("reword", "Rw0List", ago(30), tors=[LIST_V1.tor], title="Orders List wording",
                     reason="Spell out the numbers; same behavior.")
reword["changes"] = [{"tor": LIST_V1.tor, "from": LIST_V1.fp(), "to": LIST_V2.fp()}]
reword["evidence"] = {"commit": "1a2b3c4", "result": "pass", "tests": ["tests/test_orders.py"]}
r.write(f"docs/requirements/changes/{ago(30)}-Rw0List.toml", to_toml(reword))
sup = record_data("supersede", "Sp0Csv1", ago(30), tors=[CSV1.tor], title="Export every matching order",
                  reason="The accountant needs the whole month, not one page.", keywords=["csv", "export", "page"])
sup["changes"] = [{"tor": CSV1.tor, "feature_file": E, "fingerprint": CSV1.fp(), "successors": [CSV3.tor],
                   "text": CSV1.render()}]
r.write(f"docs/requirements/changes/{ago(30)}-Sp0Csv1.toml", to_toml(sup))
fax = record_data("retire", "Rt0Fax1", ago(30), tors=[FAX.tor], title="No kitchen fax",
                  reason="The kitchen reads the order screen.", keywords=["fax", "kitchen"])
fax["changes"] = [{"tor": FAX.tor, "feature_file": O, "fingerprint": FAX.fp(), "traced_to": ["vision §6"], "text": FAX.render()}]
r.write(f"docs/requirements/changes/{ago(30)}-Rt0Fax1.toml", to_toml(fax))
xls = record_data("retire", "Rt0Xls1", ago(30), tors=[XLS.tor], title="Drop Excel export",
                  reason="CSV covers the accountant; the hand-written xlsx breaks.", keywords=["excel", "xlsx", "export"])
xls["removal"] = "code"
xls["changes"] = [{"tor": XLS.tor, "feature_file": E, "fingerprint": XLS.fp(), "traced_to": ["vision §6"], "text": XLS.render()}]
r.write(f"docs/requirements/changes/{ago(30)}-Rt0Xls1.toml", to_toml(xls))
ORDERS_V2 = [LIST_V2, PAGE_V2, SORT, TOT, STAT, MAIL, ARCH, NOTE, RCPT, DUE, DISP_A, DISP_B, TAX_V1, SLIP]
write_features(r, ORDERS_V2, [CSV3, CSV2])  # PAGE edited in place (A + D); BULK deleted with no record (B)
r.write("docs/implementation-plan/phase-2-extend/index.md", """# Phase 2: Extend

| Epic | Name | Dependencies |
|------|------|--------------|
| dArch04 | [Archive](epic-dArch04-archive.md) | aSkel01 |
| eNote05 | [Order notes](epic-eNote05-order-notes.md) | bShip02 |
| gExp06 | [Full CSV export](epic-gExp06-full-csv-export.md) | bShip02 |
| hRmXls7 | [Remove Excel export](epic-hRmXls7-remove-excel-export.md) | — |
""")
r.write("docs/implementation-plan/phase-2-extend/epic-gExp06-full-csv-export.md",
        spec("gExp06", "Full CSV export", "2 — Extend", [(CSV3, E)], "Not Started", "Epic bShip02 (export)"))
removal = f"""
## Removal

**Retires:** CR-Rt0Xls1 — Drop Excel export ({ago(30)})
**Retired requirements:** {XLS.tor} — no longer requirements; their text is in the record
**Code to remove:** `app/__init__.py` (`to_xlsx`), `tests/test_orders.py` (`test_xlsx`)
**Done when:** `tor-lifecycle sweep {XLS.tor}` reports nothing, the code above is gone, and every
guard requirement in Requirements Anchors passes.
"""
r.write("docs/implementation-plan/phase-2-extend/epic-hRmXls7-remove-excel-export.md",
        spec("hRmXls7", "Remove Excel export", "2 — Extend", [], "Not Started", "—", extra=removal))
r.sidecar("gExp06", status="Not Started", requirements=[CSV3.tor])
r.sidecar("hRmXls7", status="Not Started", requirements=None, retires="CR-Rt0Xls1")
r.write("app/__init__.py", APP)
r.write("tests/test_orders.py", TESTS)
r.commit("docs: Q3 requirement changes, 25 per page", ago(30))

# ---- Commit 3 (today): disputes recorded on develop. ----------------------------------------------
for suffix, tor, days, title in (("Pd0Cncl", DISP_A, 10, "Cancel may need a reason"),
                                 ("Pd0Disc", DISP_B, 45, "Discount threshold is disputed"),
                                 ("Pd0Priv", SAFE, 2, "Receipts may leak other customers' totals")):
    pend = record_data("pending", suffix, ago(days), tors=[tor.tor], title=title,
                       reason="Owner believes the requirement is wrong; not yet decided.", keywords=["dispute"])
    ff = P if tor is SAFE else O
    pend["changes"] = [{"tor": tor.tor, "feature_file": ff, "fingerprint": tor.fp()}]
    r.write(f"docs/requirements/changes/{ago(days)}-{suffix}.toml", to_toml(pend))
r.commit("docs: record three disputed requirements", ago(0))

# ---- docs/q4-requirements: what capture-requirements left for plan-project. -----------------------
r.checkout("docs/q4-requirements", create=True)
tax = record_data("supersede", "Sp0Tax1", ago(0), tors=[TAX_V1.tor], title="Configurable tax rate",
                  reason="The county raised the rate; the shop sets it now.", keywords=["tax", "rate"])
tax["changes"] = [{"tor": TAX_V1.tor, "feature_file": O, "fingerprint": TAX_V1.fp(), "successors": [TAX_V2.tor],
                   "text": TAX_V1.render()}]
r.write(f"docs/requirements/changes/{ago(0)}-Sp0Tax1.toml", to_toml(tax))
slip = record_data("retire", "Rt0Slip", ago(0), tors=[SLIP.tor], title="No packing slips",
                   reason="The courier prints labels; nobody uses the slip.", keywords=["slip", "packing", "print"])
slip["removal"] = "code"
slip["changes"] = [{"tor": SLIP.tor, "feature_file": O, "fingerprint": SLIP.fp(), "traced_to": ["vision §6"], "text": SLIP.render()}]
r.write(f"docs/requirements/changes/{ago(0)}-Rt0Slip.toml", to_toml(slip))
ORDERS_V3 = [LIST_V2, PAGE_V2, SORT, TOT, STAT, MAIL, ARCH, NOTE, RCPT, DUE, DISP_A, DISP_B, TAX_V2, SLIP_GUARD, SLIP_REMOVE]
write_features(r, ORDERS_V3, [CSV3, CSV2])
stamp = TODAY.strftime("%Y%m%d") + "-0900"
r.write(f"docs/product-vision-planning/changelogs/discovery-changelog-{stamp}.md.processed", f"""# Discovery Changelog — {stamp}

## Change Summary
| Type | Capability | Detail |
|---|---|---|
| Modified | Sales tax | The shop sets the tax rate (was a fixed 8%) |
| Removed | Packing slips | The courier prints labels |

## New Capabilities Identified
- Configurable tax rate on the Order Detail (S-02) total
- A slip URL that answers 404 once slips are gone

## Priority Signal
1. Configurable tax rate — the county change takes effect next month; plan it first.
2. Packing-slip removal — after the tax epic.
""")
r.write("docs/product-vision-planning/product-vision.md", VISION.format(date=ago(0)))
r.write("docs/product-vision-planning/concept-of-operations.md", CONOPS.format(date=ago(0)))
r.commit("docs: Q4 requirements — configurable tax, no packing slips")
shutil.move(str(r.root), str(dest))
print(dest)
