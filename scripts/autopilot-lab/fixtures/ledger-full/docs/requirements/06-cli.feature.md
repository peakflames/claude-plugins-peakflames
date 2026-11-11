Feature: 6.0 Help and Settings
    As a person tracking a household budget
    I want the tool to explain itself and to tell me when my settings file is wrong
    So that I never have to read the source to use it


# --------------------------------------------------------------------------------------------------
# Help
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-06-Hp1Us5w] The tool shall print its usage, with a line for each command, when invoked with the help flag
    Given the user passes the commandline args '--help'
    When the Tool is Run
    Then the first line of the standard output should start with "Usage: ledger"
    And the standard output should contain a line that starts with two spaces and then "config"
    And the standard output should contain the string "--version"
    And the standard error should be empty
    And the exit code should be 0

Scenario: [TOR-06-Hp2Nc8x] The tool shall print its usage to the standard error when invoked with no arguments
    Given the user passes no commandline args
    When the Tool is Run
    Then the standard error should contain the string "Usage: ledger"
    And the standard output should be empty
    And the exit code should be 2


# --------------------------------------------------------------------------------------------------
# Settings File
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-06-Cf3Vd2y] The tool shall confirm a valid settings file when invoked with config
    Given a file at 'my.ledgerrc' with content:
        """
        {"currency": "EUR", "ratesUrl": "https://rates.example.com/latest.csv"}
        """
    And the environment variable 'LEDGERRC' is the path of that file
    And the user passes the commandline args 'config'
    When the Tool is Run
    Then the standard output should contain the string "Settings OK"
    And the exit code should be 0

Scenario: [TOR-06-Cf4Er6z] The tool shall print one line naming the file, the problem and what to do when the settings file is not valid JSON
    Given a file at 'my.ledgerrc' with content:
        """
        {"currency": "EUR",
        """
    And the environment variable 'LEDGERRC' is the path of that file
    And the user passes the commandline args 'config'
    When the Tool is Run
    Then the standard error should be exactly one line
    And that line should start with "Error: " and contain the string "my.ledgerrc"
    And the standard output should be empty
    And the exit code should be 1

Scenario: [TOR-06-Cf5Uk9A] The tool shall print one line naming the key when the settings file holds a key it does not know
    Given a file at 'my.ledgerrc' with content:
        """
        {"currency": "EUR", "colour": "blue"}
        """
    And the environment variable 'LEDGERRC' is the path of that file
    And the user passes the commandline args 'config'
    When the Tool is Run
    Then the standard error should be exactly one line
    And that line should start with "Error: " and contain the string "colour"
    And the standard output should be empty
    And the exit code should be 1
