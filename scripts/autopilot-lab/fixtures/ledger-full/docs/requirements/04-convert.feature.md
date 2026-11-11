Feature: 4.0 Currency Conversion
    As a person tracking a household budget
    I want to see my transactions in another currency
    So that I can compare spending while living or travelling abroad


# --------------------------------------------------------------------------------------------------
# Converting from a Rates File
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-04-Cv1Rt3m] The tool shall print every transaction with its amount converted at the rate in rates.csv when invoked with convert and a currency
    Given a 'ledger.json' produced by importing a file 'bank.csv' with content:
        """
        date,amount,description
        2026-10-01,-10.00,COFFEE SHOP
        2026-10-02,200.00,PAYROLL
        """
    And a file at 'rates.csv' with content:
        """
        currency,rate
        EUR,0.50
        """
    And the user passes the commandline args 'convert --to EUR'
    When the Tool is Run
    Then the standard output should have one line per transaction, in ledger order
    And the first line should contain "2026-10-01", "-5.00 EUR" and "COFFEE SHOP"
    And the second line should contain "2026-10-02", "100.00 EUR" and "PAYROLL"
    And the file 'ledger.json' should be unchanged
    And the exit code should be 0

Scenario: [TOR-04-Rd2Hf6n] The tool shall round each converted amount to whole cents, with half a cent rounded away from zero
    Given a 'ledger.json' produced by importing a file 'bank.csv' with content:
        """
        date,amount,description
        2026-10-01,-0.05,BANK FEE
        2026-10-02,0.05,INTEREST
        2026-10-03,-1.00,PARKING
        """
    And a file at 'rates.csv' with content:
        """
        currency,rate
        EUR,0.5
        GBP,0.794
        """
    And the user passes the commandline args 'convert --to EUR'
    When the Tool is Run
    Then the first line should contain "-0.03 EUR"
    And the second line should contain "0.03 EUR"
    And the third line should contain "-0.50 EUR"
    And the exit code should be 0

Scenario: [TOR-04-Uk3Cr9p] The tool shall stop with an error that names the currency and what to do when rates.csv has no rate for it
    Given a 'ledger.json' produced by importing a file 'bank.csv' with content:
        """
        date,amount,description
        2026-10-01,-10.00,COFFEE SHOP
        """
    And a file at 'rates.csv' with content:
        """
        currency,rate
        EUR,0.50
        """
    And the user passes the commandline args 'convert --to JPY'
    When the Tool is Run
    Then the standard error should contain the string "JPY"
    And the standard output should be empty
    And the exit code should be 1


# --------------------------------------------------------------------------------------------------
# Live Rates
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-04-Lv4Ft2q] The tool shall fetch the rates from the address in LEDGER_RATES_URL instead of reading rates.csv when invoked with convert and the live option
    Given a 'ledger.json' produced by importing a file 'bank.csv' with content:
        """
        date,amount,description
        2026-10-01,-10.00,COFFEE SHOP
        """
    And the current directory contains no file named 'rates.csv'
    And the environment variable 'LEDGER_RATES_URL' is 'https://rates.example.com/latest.csv'
    And the rates service at that address is reachable over the internet and returns:
        """
        currency,rate
        EUR,0.25
        """
    And the user passes the commandline args 'convert --to EUR --live'
    When the Tool is Run
    Then the only line of the standard output should contain "-2.50 EUR"
    And the exit code should be 0

Scenario: [TOR-04-Lf5Er7r] The tool shall stop with an error that suggests running without the live option when the rates address cannot be reached
    Given a 'ledger.json' produced by importing a file 'bank.csv' with content:
        """
        date,amount,description
        2026-10-01,-10.00,COFFEE SHOP
        """
    And the environment variable 'LEDGER_RATES_URL' is 'http://127.0.0.1:9/latest.csv'
    And nothing answers at that address
    And the user passes the commandline args 'convert --to EUR --live'
    When the Tool is Run
    Then the standard error should contain the string "--live"
    And the standard output should be empty
    And the exit code should be 1
