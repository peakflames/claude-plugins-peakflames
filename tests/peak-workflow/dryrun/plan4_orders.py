"""Build the Plan 4 dry-run fixture: a small orders web app, format 2, two Complete epics, one
Not Started epic, and one in-place edit of a verified requirement on develop (no record).

    python3.11 tests/peak-workflow/dryrun/plan4_orders.py <dest>   (dest outside the repo, or under tmp/)
"""
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fixtures import FixtureRepo, scenario  # noqa: E402

dest = Path(sys.argv[1]).resolve()

VER = scenario("TOR-01-Ver0001", "The web application shall expose its name and semantic version at GET /version as JSON",
               "Given the application is running", "When a client sends GET /version",
               'Then the response is 200 with JSON {"name": "orders", "version": "1.0.0"}')
LIST = scenario("TOR-02-List001", "The application shall list orders with customer, total, and status columns on the Orders List (S-01)",
                "Given 3 orders exist", "When the user opens the Orders List (S-01)",
                "Then 3 rows are shown with Customer, Total, and Status columns")
PAGE_V1 = scenario("TOR-02-Page010", "The application shall show at most 10 orders per page on the Orders List (S-01)",
                   "Given 30 orders exist", "When the user opens the Orders List (S-01)",
                   "Then exactly 10 order rows are visible", "And a \"Next page\" button is shown")
PAGE_V2 = scenario("TOR-02-Page010", "The application shall show at most 25 orders per page on the Orders List (S-01)",
                   "Given 30 orders exist", "When the user opens the Orders List (S-01)",
                   "Then exactly 25 order rows are visible", "And a \"Next page\" button is shown")
SORT = scenario("TOR-02-Sort001", "The application shall sort the Orders List (S-01) by customer name ascending",
                "Given orders for customers Zed, Amy, and Max exist", "When the user opens the Orders List (S-01)",
                "Then the rows are ordered Amy, Max, Zed")
TOT = scenario("TOR-02-Tot0001", "The application shall show the order's grand total on the Order Detail (S-02)",
               "Given an order with two lines of $5.00 and $7.50", "When the user opens that order's Order Detail (S-02)",
               "Then the Total field shows \"$12.50\"")
STAT = scenario("TOR-02-Stat001", "The application shall offer a Status filter with the options All, Open, and Shipped on the Orders List (S-01)",
                "Given the Orders List (S-01) is open", "When the user opens the Status filter select",
                "Then the options are exactly All, Open, and Shipped")
MAIL = scenario("TOR-02-Mail001", "The application shall email the customer when their order is marked Shipped",
                "Given an open order for a customer with an email address", "When the user marks the order Shipped",
                "Then one email is sent to that address naming the order number")
CSV1 = scenario("TOR-03-Csv0001", "The application shall export the visible orders as a CSV file from the Export Dialog (S-03)",
                "Given the Orders List (S-01) shows 3 orders", "When the user clicks \"Export CSV\" in the Export Dialog (S-03)",
                "Then a file orders.csv downloads with a header row and 3 data rows")
CSV2 = scenario("TOR-03-Csv0002", "The application shall name the CSV columns Customer, Total, and Status in that order",
                "Given the Export Dialog (S-03) is open", "When the user clicks \"Export CSV\"",
                "Then the CSV header row is exactly Customer,Total,Status")
ARCH = scenario("TOR-02-Arch001", "The application shall hide archived orders from the Orders List (S-01) by default",
                "Given 2 open orders and 1 archived order exist", "When the user opens the Orders List (S-01)",
                "Then 2 rows are shown")

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

## Git Workflow

- Base branch: `develop`. Planning on `docs/<name>`, epics on `feature/epic-<id>-<name>`, fixes on `hotfix/<slug>`.
"""

VISION = """# Orders — Product Vision & Brief

**Document Version:** 1.0
**Date:** 2026-09-01
**Status:** Approved

---

## 1. Product Name
Orders — a one-screen order book for a small bakery.

## 2. Problem Statement
The bakery tracks orders on paper. Orders get lost, totals are added by hand, and nobody knows
which orders have shipped.

- Lost orders at busy times
- Hand-added totals with mistakes
- No view of what has shipped

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
| G2 Correct totals | Totals are computed, never typed |
| G3 Track shipping | Status filter and shipped emails |
| G4 Share the order book | CSV export for the accountant |

## 6. MVP Scope Summary
- Orders list (paging 10 per page, sorted by customer, status filter All/Open/Shipped)
- Order detail with grand total
- Shipped email to the customer
- CSV export of the visible orders

## 7. Out of Scope for MVP
- Payments
- Inventory

## 8. Key Business Scenarios
1. Staff find an order. 2. Staff ship an order. 3. Staff export orders for the accountant.

## 9. Design Direction
- shadcn/ui table, plain and dense

## 10. Data Strategy
- SQLite file on the shop PC

## 11. Backlog / Future Vision
- SMS notifications
- Order archiving
"""

CONOPS = """# Orders — Concept of Operations (ConOps)

**Document Version:** 1.1
**Date:** 2026-09-01
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
1. On the Orders List (S-01), staff see orders sorted by customer name, 10 per page.
2. Staff pick Shipped in the "Status" filter select (All, Open, Shipped).
3. Staff click an order row; the Order Detail (S-02) shows its lines and grand total.

**Outcome:** The order is found.
**Screens:** S-01 Orders List, S-02 Order Detail

### Scenario 2: Ship an order
**Actor:** Counter staff
**Trigger:** An order leaves the shop
**Goal:** Mark it shipped

**Steps:**
1. On the Order Detail (S-02), staff click the "Mark shipped" button.
2. The customer receives an email naming the order number.

**Outcome:** The customer knows the order shipped.
**Screens:** S-02 Order Detail

### Scenario 3: Export for the accountant
**Actor:** Counter staff
**Trigger:** Month end
**Goal:** Hand the order book to the accountant

**Steps:**
1. On the Orders List (S-01), staff click the "Export…" button; the Export Dialog (S-03) opens.
2. Staff click "Export CSV"; orders.csv downloads with Customer, Total, Status columns.

**Outcome:** The accountant has the month's orders.
**Screens:** S-01 Orders List, S-03 Export Dialog

## 6. System Interfaces & Data Flows
Browser → app → SQLite. Email via SMTP.

## 7. Functional Summary
| Area | Features |
|---|---|
| Orders | list, paging, sorting, status filter, detail, total |
| Shipping | mark shipped, email |
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
**Date:** 2026-09-01
**Companion:** concept-of-operations.md v1.1

## App Shell

Site header with one nav item (Orders).

## Screen Inventory

| Screen ID | Name | Wireframe | Purpose | Entry points | Primary actions | Data shown | States | Serves |
|---|---|---|---|---|---|---|---|---|
| S-01 | Orders List | wireframes/S-01-orders-list.html | Find orders | Nav "Orders" | "Status" filter select, "Next page" button, "Export…" button, order row link | Table: Customer, Total, Status | loading / empty / error / populated | S1.1, S1.2, S3.1 |
| S-02 | Order Detail | wireframes/S-02-order-detail.html | See and ship one order | S-01 order row | "Mark shipped" button | Lines, Total | loading / empty / error / populated | S1.3, S2.1 |
| S-03 | Export Dialog | wireframes/S-03-export-dialog.html | Export orders as CSV | S-01 "Export…" button | "Export CSV" button, "Cancel" button | Row count | n/a — not data-bearing | S3.2 |

## States

### S-01 Orders List
- loading: skeleton rows · empty: "No orders yet" · error: "Could not load orders" + "Retry" · populated: table

### S-02 Order Detail
- loading / empty / error / populated as S-01

### S-03 Export Dialog
- populated only

## Flows

### Scenario 1: Find an order
```mermaid
flowchart LR
  S01[Orders List] -->|click order row| S02[Order Detail]
```

### Scenario 2: Ship an order
```mermaid
flowchart LR
  S02[Order Detail] -->|click Mark shipped| S02
```

### Scenario 3: Export for the accountant
```mermaid
flowchart LR
  S01[Orders List] -->|click Export…| S03[Export Dialog]
```
"""

WIREFRAME = """<!doctype html><html><head><title>{name}</title><style>body{{font-family:system-ui;color:#222;background:#fff}}</style></head>
<body><h1>{name}</h1><p>Grayscale wireframe (fixture).</p></body></html>
"""

APP = '''"""Orders fixture app logic."""
__version__ = "1.0.0"


def page(orders, size=25):
    return orders[:size]


def sort_orders(orders):
    return sorted(orders, key=lambda o: o["customer"])


def total(lines):
    return sum(lines)


def to_csv(orders):
    rows = ["Customer,Total,Status"] + [f"{o['customer']},{o['total']:.2f},{o['status']}" for o in orders]
    return "\\n".join(rows) + "\\n"
'''

TESTS = '''import unittest

from app import page, sort_orders, to_csv, total


class OrdersTests(unittest.TestCase):
    def test_grand_total(self):
        """TOR-02-Tot0001: the Total field shows the sum of the lines."""
        self.assertEqual(f"${total([5.00, 7.50]):.2f}", "$12.50")

    def test_sorted_by_customer(self):
        """TOR-02-Sort001"""
        names = [o["customer"] for o in sort_orders([{"customer": c} for c in ("Zed", "Amy", "Max")])]
        self.assertEqual(names, ["Amy", "Max", "Zed"])

    def test_page_size(self):
        """TOR-02-Page010"""
        self.assertEqual(len(page(list(range(30)))), 25)


class ExportTests(unittest.TestCase):
    def test_csv_rows(self):
        """TOR-03-Csv0001"""
        orders = [{"customer": c, "total": 1.0, "status": "Open"} for c in "ABC"]
        self.assertEqual(len(to_csv(orders).splitlines()), 4)

    def test_csv_header(self):
        """TOR-03-Csv0002"""
        self.assertEqual(to_csv([]).splitlines()[0], "Customer,Total,Status")


if __name__ == "__main__":
    unittest.main()
'''


def tracing(nn, name, entries):
    return json.dumps({
        "feature_id": nn, "feature_file": f"{nn}-{name}.feature.md",
        "generator": "haiku-sub-agent via /peak-workflow:capture-requirements",
        "requirements": [{"id": tor, "traces_to": {"vision": [{"section": v, "paraphrase": "Serves the goal."}],
                                                    "conops": [{"scenario": c.split(".")[0], "step": int(c.split(".")[1]),
                                                                "paraphrase": "Serves the step."}] if c else [],
                                                    "claude_md": []}}
                         for tor, v, c in entries],
        "coverage_gaps": []}, indent=2) + "\n"


def spec(epic, slug, name, phase, tors, status):
    rows = "\n".join(f"| {t.tor} | `docs/requirements/{ff}` | {t.title} |" for t, ff in tors)
    return f"""# Epic {epic}: {name}

**Phase:** 1 — {phase}
**Status:** {status}
**Dependencies:** none
**Planned by:** Fixture Author
**Planned:** 2026-09-01
**Plan branch:** docs/mvp

---

## Description

{name} for the bakery order book.

## Requirements Anchors

| TOR ID | Feature File | Scenario Title |
|--------|--------------|----------------|
{rows}

## Key Components

- `app/__init__.py`
"""


if dest.exists():
    shutil.rmtree(dest)
repo = FixtureRepo()
r = repo
r.write("CLAUDE.md", CLAUDE_MD)
r.stamp(2, disputed_threshold_days=30)
r.write("docs/product-vision-planning/product-vision.md", VISION)
r.write("docs/product-vision-planning/concept-of-operations.md", CONOPS)
r.write("docs/product-vision-planning/ux/screens.md", SCREENS)
for sid, slug, name in (("S-01", "orders-list", "Orders List"), ("S-02", "order-detail", "Order Detail"),
                        ("S-03", "export-dialog", "Export Dialog")):
    r.write(f"docs/product-vision-planning/ux/wireframes/{sid}-{slug}.html", WIREFRAME.format(name=name))
r.write("docs/requirements/README.md", "# Requirements Baseline\n\nSee /peak-workflow:capture-requirements.\n")
r.feature("01", "app", [VER], banner="Tool Hygiene & Operability")
r.feature("02", "orders", [LIST, PAGE_V1, SORT, TOT, STAT, MAIL, ARCH], banner="Orders")
r.feature("03", "export", [CSV1, CSV2], banner="CSV Export")
r.write("docs/requirements/01-app.feature.tracing.json", tracing("01", "app", [("TOR-01-Ver0001", "§6", None)]))
r.write("docs/requirements/02-orders.feature.tracing.json", tracing("02", "orders", [
    ("TOR-02-List001", "§6", "S1.1"), ("TOR-02-Page010", "§6", "S1.1"), ("TOR-02-Sort001", "§6", "S1.1"),
    ("TOR-02-Tot0001", "§5", "S1.3"), ("TOR-02-Stat001", "§6", "S1.2"), ("TOR-02-Mail001", "§6", "S2.2"),
    ("TOR-02-Arch001", "§11", None)]))
r.write("docs/requirements/03-export.feature.tracing.json", tracing("03", "export", [
    ("TOR-03-Csv0001", "§6", "S3.2"), ("TOR-03-Csv0002", "§6", "S3.2")]))
r.write("docs/implementation-plan/index.md", "# Implementation Plan\n\nSee the phase indexes under `phase-*/index.md`.\n")
r.write("docs/implementation-plan/phase-1-mvp/index.md", """# Phase 1 — MVP

| Epic | Name | Dependencies |
|------|------|--------------|
| aSkel01 | Walking skeleton and orders list | — |
| bShip02 | Detail, shipping, and export | aSkel01 |
| cSort03 | Sorting and archive | aSkel01 |
""")
O, E, A = "02-orders.feature.md", "03-export.feature.md", "01-app.feature.md"
r.write("docs/implementation-plan/phase-1-mvp/epic-aSkel01-walking-skeleton.md",
        spec("aSkel01", "walking-skeleton", "Walking skeleton and orders list", "MVP",
             [(VER, A), (LIST, O), (PAGE_V1, O)], "Complete"))
r.write("docs/implementation-plan/phase-1-mvp/epic-bShip02-detail-shipping-export.md",
        spec("bShip02", "detail-shipping-export", "Detail, shipping, and export", "MVP",
             [(TOT, O), (STAT, O), (MAIL, O), (CSV1, E), (CSV2, E)], "Complete"))
r.write("docs/implementation-plan/phase-1-mvp/epic-cSort03-sorting-archive.md",
        spec("cSort03", "sorting-archive", "Sorting and archive", "MVP", [(SORT, O), (ARCH, O)], "Not Started"))
r.sidecar("aSkel01", status="Complete", requirements=[VER.tor, LIST.tor, PAGE_V1.tor],
          verified={VER.tor: VER.fp(), LIST.tor: LIST.fp(), PAGE_V1.tor: PAGE_V1.fp()},
          owner="Fixture Author", implemented="2026-09-10", completed="2026-09-10",
          handoff="session-handoffs/epic-aSkel01-complete.md")
r.sidecar("bShip02", status="Complete", requirements=[TOT.tor, STAT.tor, MAIL.tor, CSV1.tor, CSV2.tor],
          verified={t.tor: t.fp() for t in (TOT, STAT, MAIL, CSV1, CSV2)},
          owner="Fixture Author", implemented="2026-09-20", completed="2026-09-20",
          handoff="session-handoffs/epic-bShip02-complete.md")
r.sidecar("cSort03", status="Not Started", requirements=[SORT.tor, ARCH.tor])
r.write("app/__init__.py", APP.replace("size=25", "size=10"))
r.write("tests/test_orders.py", TESTS.replace("), 25)", "), 10)"))
r.write(".gitignore", "__pycache__/\n")
r.commit("docs: MVP plan, requirements, and two Complete epics", "2026-09-20")
# The bypass this plan's TOR-ID mode repairs: a verified requirement edited in place, no record.
r.feature("02", "orders", [LIST, PAGE_V2, SORT, TOT, STAT, MAIL, ARCH], banner="Orders")
r.write("app/__init__.py", APP)
r.write("tests/test_orders.py", TESTS)
r.commit("tweak: 25 orders per page", "2026-10-01")
shutil.move(str(r.root), str(dest))
print(dest)
