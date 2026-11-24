# ledger — Product Vision

## 1. Problem

Bank websites show transactions one account and one month at a time, and budgeting apps want
your bank password. People who just want to know where the money went end up maintaining a
spreadsheet by hand, and it drifts from the bank statement within weeks.

## 2. Who It Is For

One person managing a household budget who is comfortable typing a command in a terminal and
can download a CSV export from their bank.

## 3. Goals

1. Get every bank transaction into one local file (`ledger.json`) with a single command, and
   make repeating that command safe — a transaction is never counted twice.
2. Sort transactions into spending categories with simple rules the user writes once.
3. Show a monthly summary of spending per category.

## 4. Principles

- **Faithful record.** The ledger stores what the bank reported. Descriptions are kept exactly
  as written; rules and reports interpret them without changing what is stored.
- **Exact money.** Amounts are whole cents, never fractions. Money spent is negative and money
  received is positive.
- **Refunds net against spending.** A refund is a positive amount in the category it came
  from, and it reduces that category's spending total for the month — it is never reported as
  income and never dropped.
- **One date format.** Dates are stored as ISO `YYYY-MM-DD`, whatever the bank exports.
- **Local and private.** No network access, no accounts, no telemetry. The data is one JSON
  file in the folder the user runs the tool in.

## 5. Out of Scope

Bank connections, multiple currencies, shared or multi-user ledgers, and a graphical interface.
