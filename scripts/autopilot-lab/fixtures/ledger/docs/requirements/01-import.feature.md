Feature: 1.0 CSV Import
    As a person tracking a household budget
    I want to load my bank's CSV export into one local ledger file
    So that every later report works from complete, exact, trustworthy data


# --------------------------------------------------------------------------------------------------
# Importing Transactions
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-01-Kq7Rm2x] The tool shall import every data row of a CSV file as a transaction in ledger.json in the current directory when invoked with import and a file path
    Given the current directory contains no file named 'ledger.json'
    And a file at 'bank.csv' with content:
        """
        date,amount,description
        2026-10-01,-12.50,COFFEE SHOP
        2026-10-02,2500.00,PAYROLL
        """
    And the user passes the commandline args 'import bank.csv'
    When the Tool is Run
    Then the file 'ledger.json' should be valid JSON whose 'transactions' array has exactly 2 entries
    And each entry should have exactly the keys 'date', 'amountCents' and 'description'
    And the standard output should contain the string "Imported 2 transactions"
    And the exit code should be 0

Scenario: [TOR-01-Zb4Nw9T] The tool shall store each imported date in ISO YYYY-MM-DD form whether the CSV writes it as YYYY-MM-DD or as MM/DD/YYYY
    Given the current directory contains no file named 'ledger.json'
    And a file at 'bank.csv' with content:
        """
        date,amount,description
        10/03/2026,-45.10,GROCERY
        2026-10-04,-8.00,BUS FARE
        1/5/2026,-3.25,PARKING
        """
    And the user passes the commandline args 'import bank.csv'
    When the Tool is Run
    Then the 'date' values of the 'transactions' array in 'ledger.json' should be, in order:
        | date       |
        | 2026-10-03 |
        | 2026-10-04 |
        | 2026-01-05 |
    And the exit code should be 0

Scenario: [TOR-01-Hd3Yc8L] The tool shall store each imported amount as a whole number of cents, negative for money spent and positive for money received
    Given the current directory contains no file named 'ledger.json'
    And a file at 'bank.csv' with content:
        """
        date,amount,description
        2026-10-01,-45.10,GROCERY
        2026-10-02,2500,PAYROLL
        2026-10-03,0.5,INTEREST
        2026-10-04,-0.07,BANK FEE
        """
    And the user passes the commandline args 'import bank.csv'
    When the Tool is Run
    Then the 'amountCents' values of the 'transactions' array in 'ledger.json' should be JSON integers, in order:
        | amountCents |
        | -4510       |
        | 250000      |
        | 50          |
        | -7          |
    And the exit code should be 0

Scenario: [TOR-01-Vp6Js1G] The tool shall store each imported description verbatim, with its letter case, punctuation and surrounding spaces unchanged
    Given the current directory contains no file named 'ledger.json'
    And a file at 'bank.csv' with content:
        """
        date,amount,description
        2026-10-03,-45.10,"  SAFEWAY #123 "
        """
    And the user passes the commandline args 'import bank.csv'
    When the Tool is Run
    Then the 'description' of the only entry in the 'transactions' array in 'ledger.json' should equal the string "  SAFEWAY #123 " exactly, with the two leading spaces and the one trailing space kept
    And the exit code should be 0


# --------------------------------------------------------------------------------------------------
# Duplicate Handling
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-01-Xt5Fa0M] The tool shall skip a row whose date, amount and description all match a transaction already in the ledger, so importing overlapping files never double-counts
    Given a 'ledger.json' produced by importing a file 'october.csv' with content:
        """
        date,amount,description
        2026-10-01,-12.50,COFFEE SHOP
        2026-10-02,2500.00,PAYROLL
        """
    And a file at 'overlap.csv' with content:
        """
        date,amount,description
        10/02/2026,2500,PAYROLL
        2026-10-05,-30.00,PHARMACY
        """
    And the user passes the commandline args 'import overlap.csv'
    When the Tool is Run
    Then the 'transactions' array in 'ledger.json' should have exactly 3 entries
    And exactly 1 entry should have the description "PAYROLL"
    And the standard output should contain the string "Imported 1 transactions (1 duplicates skipped)"
    And the exit code should be 0
