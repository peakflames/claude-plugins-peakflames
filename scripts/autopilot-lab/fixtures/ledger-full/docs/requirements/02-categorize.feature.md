Feature: 2.0 Categorization Rules
    As a person tracking a household budget
    I want each transaction sorted into a spending category by rules I write once
    So that reports can total my spending by category without my editing the ledger by hand


# --------------------------------------------------------------------------------------------------
# Applying Rules
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-02-Rc1Ld5a] The tool shall give every transaction in ledger.json a category from the rules in rules.txt when invoked with categorize
    Given a 'ledger.json' produced by importing a file 'bank.csv' with content:
        """
        date,amount,description
        2026-10-01,-12.50,COFFEE SHOP
        2026-10-03,-45.10,SAFEWAY #123
        """
    And a file at 'rules.txt' with content:
        """
        groceries: /SAFEWAY/
        coffee: /COFFEE/
        """
    And the user passes the commandline args 'categorize'
    When the Tool is Run
    Then the 'category' values of the 'transactions' array in 'ledger.json' should be, in order:
        | category  |
        | coffee    |
        | groceries |
    And the standard output should contain the string "Categorized 2 transactions"
    And the exit code should be 0

Scenario: [TOR-02-Fm2Wn8b] The tool shall use the first rule in rules.txt that matches when more than one rule matches a description
    Given a 'ledger.json' produced by importing a file 'bank.csv' with content:
        """
        date,amount,description
        2026-10-03,-45.10,SAFEWAY FUEL STATION
        """
    And a file at 'rules.txt' with content:
        """
        fuel: /FUEL/
        groceries: /SAFEWAY/
        """
    And the user passes the commandline args 'categorize'
    When the Tool is Run
    Then the 'category' of the only entry in the 'transactions' array in 'ledger.json' should be "fuel"
    And the exit code should be 0

Scenario: [TOR-02-Un3Ct6c] The tool shall give the category uncategorized to a transaction no rule matches
    Given a 'ledger.json' produced by importing a file 'bank.csv' with content:
        """
        date,amount,description
        2026-10-20,-31.40,PHARMACY
        """
    And a file at 'rules.txt' with content:
        """
        groceries: /SAFEWAY/
        """
    And the user passes the commandline args 'categorize'
    When the Tool is Run
    Then the 'category' of the only entry in the 'transactions' array in 'ledger.json' should be "uncategorized"
    And the exit code should be 0

Scenario: [TOR-02-Ci4Ws7d] The tool shall match rules without regard to letter case or to extra spaces in a description, and shall leave the stored description unchanged
    Given a 'ledger.json' produced by importing a file 'bank.csv' with content:
        """
        date,amount,description
        2026-10-07,-20.00,"  safeway   #88 "
        """
    And a file at 'rules.txt' with content:
        """
        groceries: /SAFEWAY #88/
        """
    And the user passes the commandline args 'categorize'
    When the Tool is Run
    Then the 'category' of the only entry in the 'transactions' array in 'ledger.json' should be "groceries"
    And the 'description' of that entry should still equal the string "  safeway   #88 " exactly, with its lower case, its two leading spaces, its three inner spaces and its one trailing space kept
    And the exit code should be 0


# --------------------------------------------------------------------------------------------------
# Missing Rules
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-02-Mr5Er9e] The tool shall stop with an error that names the missing file and what to do when rules.txt does not exist
    Given a 'ledger.json' produced by importing a file 'bank.csv' with content:
        """
        date,amount,description
        2026-10-01,-12.50,COFFEE SHOP
        """
    And the current directory contains no file named 'rules.txt'
    And the user passes the commandline args 'categorize'
    When the Tool is Run
    Then the standard error should contain the string "rules.txt"
    And the standard output should be empty
    And the transaction in 'ledger.json' should have no 'category' key
    And the exit code should be 1
