# ledger — Concept of Operations

## 1. Users

A single user at their own computer, in a terminal, in the folder where they keep their budget.

## 2. Operating Environment

Node.js 22 or later on macOS, Linux or Windows. No network. The ledger is the file
`ledger.json` in the current directory.

## 3. Inputs

A bank CSV export. The first line is the header `date,amount,description`. Dates are either
`YYYY-MM-DD` or `MM/DD/YYYY` (month and day may be one or two digits). Amounts are decimal
numbers with up to two decimal places, negative for money spent. A field may be enclosed in
double quotes, and everything inside the quotes — including spaces — is part of the field.

## 4. Outputs

`ledger.json`: `{"transactions": [{"date": "YYYY-MM-DD", "amountCents": <integer>, "description": "<text>"}]}`.

## 5. Operational Scenarios

### S1 — Import a month of transactions

1. The user downloads the month's CSV export from their bank's website.
2. The user runs `ledger import bank.csv`. The tool adds every row to `ledger.json`, creating
   the file if it does not exist, and prints how many transactions it imported.
3. The user opens `ledger.json` and sees each transaction with an ISO date, the amount in whole
   cents, and the description exactly as the bank wrote it.
4. Later the user downloads an export that overlaps the previous one and imports it. Rows
   already in the ledger — same date, amount and description — are skipped, and the tool says
   how many it skipped.

### S2 — See where the money went

1. The user writes category rules once (for example, groceries match `SAFEWAY`).
2. The user asks for a month's summary and sees a total per category, with refunds reducing
   the category they belong to.
