Feature: 3.0 Monthly Summary
    As a person tracking a household budget
    I want a total per category for one month
    So that I can see where the money went


# --------------------------------------------------------------------------------------------------
# Summarising a Month
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-03-Sm1Tb4f] The tool shall print a row per category with its total for the requested month when invoked with summary and a month
    Given a categorized 'ledger.json' holding these transactions:
        | date       | amountCents | description  | category  |
        | 2026-10-01 | -1250       | COFFEE SHOP  | coffee    |
        | 2026-10-03 | -4510       | SAFEWAY #123 | groceries |
        | 2026-10-07 | -2000       | SAFEWAY #88  | groceries |
    And the user passes the commandline args 'summary --month 2026-10'
    When the Tool is Run
    Then the standard output should have exactly one row for 'coffee' showing 12.50
    And exactly one row for 'groceries' showing 65.10
    And the rows should be in alphabetical order of category
    And the exit code should be 0

Scenario: [TOR-03-Mo2Fl7g] The tool shall count only the transactions dated in the requested month
    Given a categorized 'ledger.json' holding these transactions:
        | date       | amountCents | description  | category  |
        | 2026-09-30 | -900        | SAFEWAY #123 | groceries |
        | 2026-10-03 | -4510       | SAFEWAY #123 | groceries |
        | 2026-11-01 | -700        | SAFEWAY #123 | groceries |
    And the user passes the commandline args 'summary --month 2026-10'
    When the Tool is Run
    Then the row for 'groceries' should show 45.10
    And the exit code should be 0

Scenario: [TOR-03-Em3Pt2h] The tool shall say that a month has no transactions instead of printing an empty table
    Given a categorized 'ledger.json' holding these transactions:
        | date       | amountCents | description  | category  |
        | 2026-10-03 | -4510       | SAFEWAY #123 | groceries |
    And the user passes the commandline args 'summary --month 2026-08'
    When the Tool is Run
    Then the standard output should contain the string "No transactions in 2026-08"
    And the exit code should be 0

Scenario: [TOR-03-Bd4Mn5j] The tool shall reject a month that is not written as YYYY-MM
    Given the user passes the commandline args 'summary --month October'
    When the Tool is Run
    Then the standard error should contain the string "YYYY-MM"
    And the standard output should be empty
    And the exit code should be 2


# --------------------------------------------------------------------------------------------------
# Large Ledgers
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-03-Pf5Tn8k] The tool shall print the summary of one month of a ten-year ledger of 2,000,000 transactions in under 10 seconds
    Given a categorized 'ledger.json' holding 2,000,000 transactions spread evenly over the ten years 2017 to 2026
    And the user passes the commandline args 'summary --month 2026-10'
    When the Tool is Run
    Then the summary should be printed in under 10 seconds
    And the exit code should be 0
