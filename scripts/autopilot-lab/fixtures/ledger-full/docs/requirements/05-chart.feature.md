Feature: 5.0 Spending Chart
    As a person tracking a household budget
    I want the month's spending drawn as a bar chart
    So that I can see at a glance which categories take the most money


# --------------------------------------------------------------------------------------------------
# Writing the Chart
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-05-Ch1Wr4s] The tool shall write an HTML file holding one inline SVG bar per category of the requested month when invoked with chart, a month and an output file
    Given a categorized 'ledger.json' holding these transactions:
        | date       | amountCents | description  | category  |
        | 2026-10-01 | -1250       | COFFEE SHOP  | coffee    |
        | 2026-10-03 | -4510       | SAFEWAY #123 | groceries |
        | 2026-10-11 | -6000       | CITY POWER   | utilities |
    And the user passes the commandline args 'chart --month 2026-10 --out chart.html'
    When the Tool is Run
    Then the file 'chart.html' should contain exactly one '<svg' element
    And that element should contain exactly 3 '<rect' elements with the class 'bar'
    And the standard output should contain the string "Wrote chart.html"
    And the exit code should be 0

Scenario: [TOR-05-Ch2Lb7t] The tool shall label each bar with its category and its total
    Given a categorized 'ledger.json' holding these transactions:
        | date       | amountCents | description  | category  |
        | 2026-10-01 | -1250       | COFFEE SHOP  | coffee    |
        | 2026-10-03 | -4510       | SAFEWAY #123 | groceries |
    And the user passes the commandline args 'chart --month 2026-10 --out chart.html'
    When the Tool is Run
    Then the SVG in 'chart.html' should contain a '<text' element containing "coffee" and "12.50"
    And a '<text' element containing "groceries" and "45.10"
    And the exit code should be 0

Scenario: [TOR-05-Ch4Sc9v] The tool shall write a chart file that is complete in itself, with no script and nothing loaded from anywhere else
    Given a categorized 'ledger.json' holding these transactions:
        | date       | amountCents | description  | category  |
        | 2026-10-03 | -4510       | SAFEWAY #123 | groceries |
    And the user passes the commandline args 'chart --month 2026-10 --out chart.html'
    When the Tool is Run
    Then the file 'chart.html' should not contain the string "<script"
    And it should not contain the string "http://" or the string "https://" other than the SVG namespace 'http://www.w3.org/2000/svg'
    And the exit code should be 0


# --------------------------------------------------------------------------------------------------
# Reading the Chart
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-05-Ch3Lk2u] The chart shall be readable when opened in a browser, with each bar's height in proportion to its total and no label overlapping another label or a bar
    # Verification: operator-observed
    Given a 'chart.html' written by 'chart --month 2026-10 --out chart.html' from a ledger holding the transactions of 'samples/october.csv' categorized with 'samples/rules.txt'
    When the user opens 'chart.html' in a web browser
    Then the user should see one bar per category
    And the tallest bar should be the category with the largest total, and a bar with half that total should look half as tall
    And every label should be readable in full, with no label drawn over another label or over a bar
