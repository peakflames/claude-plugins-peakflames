# ledger — Concept of Operations

## 1. Users

A single user at their own computer, in a terminal, in the folder where they keep their budget.

## 2. Operating Environment

Node.js 22 or later on macOS, Linux or Windows. No network, except the currency conversion's
`--live` option. The ledger is the file `ledger.json` in the current directory.

## 3. Inputs

- **A bank CSV export.** The first line is the header `date,amount,description`. Dates are
  either `YYYY-MM-DD` or `MM/DD/YYYY` (month and day may be one or two digits). Amounts are
  decimal numbers with up to two decimal places, negative for money spent. A field may be
  enclosed in double quotes, and everything inside the quotes — including spaces — is part of
  the field.
- **`rules.txt`** in the current directory: one rule per line, `<category>: /<pattern>/`,
  for example `groceries: /SAFEWAY/`. Blank lines and lines starting with `#` are ignored.
- **`rates.csv`** in the current directory: the header `currency,rate`, then one line per
  currency, where the rate is how many units of that currency one unit of the ledger's
  currency buys, for example `EUR,0.92`.
- **The rates address**, in the environment variable `LEDGER_RATES_URL`: an address that
  returns the same content as `rates.csv`. Used only with `--live`.
- **The settings file**: the file named by the environment variable `LEDGERRC`, or else
  `.ledgerrc` in the user's home directory. JSON with the optional keys `currency` (three
  capital letters) and `ratesUrl` (text).

## 4. Outputs

- `ledger.json`: `{"transactions": [{"date": "YYYY-MM-DD", "amountCents": <integer>, "description": "<text>"}]}`.
  After categorising, each transaction also has `"category": "<text>"`.
- Text reports on standard output.
- `chart.html` (or the file the user names): one self-contained HTML page with an inline SVG
  bar chart.

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

1. The user writes category rules once in `rules.txt` (for example, groceries match `SAFEWAY`)
   and runs `ledger categorize`. Each transaction gets the category of the first rule that
   matches its description, however the bank capitalised or spaced it; the description itself
   is left exactly as stored. Transactions no rule matches are `uncategorized`.
2. The user runs `ledger summary --month 2026-10` and sees a total per category, with refunds
   reducing the category they belong to.
3. Years later the ledger holds every transaction since the user started, and the summary still
   appears without a noticeable wait.

### S3 — See the amounts in another currency

1. The user keeps a `rates.csv` and runs `ledger convert --to EUR`. The tool prints every
   transaction with its amount converted and rounded to whole cents.
2. When the user wants today's rates, they run `ledger convert --to EUR --live`. The tool
   fetches the rates from the configured address instead of reading `rates.csv`. If the address
   cannot be reached, the tool says so and suggests running without `--live`.

### S4 — Look at the month as a picture

1. The user runs `ledger chart --month 2026-10 --out chart.html`.
2. The user opens `chart.html` in a browser and sees one bar per category, each labelled with
   the category and its total, tall in proportion to the money spent, with nothing overlapping.

### S5 — Find out what the tool can do, and fix a broken settings file

1. The user runs `ledger --help` and sees every command with a one-line description.
2. The user runs `ledger config`. If the settings file is missing or correct the tool says the
   settings are fine. If it is not valid JSON, or holds a key the tool does not know, the tool
   prints one line naming the file, the problem and what to do.
