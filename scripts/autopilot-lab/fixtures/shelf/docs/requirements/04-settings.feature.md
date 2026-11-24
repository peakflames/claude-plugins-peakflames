Feature: 4.0 Settings File
    As a reader
    I want the tool to tell me when my settings file is wrong
    So that I never have to read the source to fix it


# --------------------------------------------------------------------------------------------------
# Checking the Settings File
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-04-Cf1Ok3a] The tool shall confirm a valid settings file when invoked with config
    Given a file at 'my.shelfrc' with content:
        """
        {"pageTitle": "What I read", "finishedLast": true}
        """
    And the environment variable 'SHELFRC' is the path of that file
    And the user passes the commandline args 'config'
    When the Tool is Run
    Then the standard output should contain the string "Settings OK"
    And the exit code should be 0

Scenario: [TOR-04-Cf2Er6b] The tool shall print one line naming the file, the problem and what to do when the settings file is not valid JSON
    Given a file at 'my.shelfrc' with content:
        """
        {"pageTitle": "What I read",
        """
    And the environment variable 'SHELFRC' is the path of that file
    And the user passes the commandline args 'config'
    When the Tool is Run
    Then the standard error should be exactly one line
    And that line should start with "Error: " and contain the string "my.shelfrc"
    And the standard output should be empty
    And the exit code should be 1

Scenario: [TOR-04-Cf3Uk9c] The tool shall print one line naming the key when the settings file holds a key it does not know
    Given a file at 'my.shelfrc' with content:
        """
        {"pageTitle": "What I read", "colour": "blue"}
        """
    And the environment variable 'SHELFRC' is the path of that file
    And the user passes the commandline args 'config'
    When the Tool is Run
    Then the standard error should be exactly one line
    And that line should start with "Error: " and contain the string "colour"
    And the standard output should be empty
    And the exit code should be 1

Scenario: [TOR-04-Cf4Ty2d] The tool shall print one line naming the key when a setting holds a value of the wrong kind
    Given a file at 'my.shelfrc' with content:
        """
        {"finishedLast": "yes"}
        """
    And the environment variable 'SHELFRC' is the path of that file
    And the user passes the commandline args 'config'
    When the Tool is Run
    Then the standard error should be exactly one line
    And that line should start with "Error: " and contain the string "finishedLast"
    And the standard output should be empty
    And the exit code should be 1
