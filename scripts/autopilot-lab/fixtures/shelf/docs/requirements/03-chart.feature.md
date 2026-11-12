Feature: 3.0 Pages Chart
    As a reader
    I want the pages I finished each month drawn as a bar chart
    So that I can see at a glance how much I read and when


# --------------------------------------------------------------------------------------------------
# Writing the Chart
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-03-Ch1Wr3w] The tool shall write an HTML file holding one inline SVG bar per month in which a book was finished when invoked with chart and an output file
    Given a 'shelf.json' holding these books:
        | title       | author           | pages | finished   |
        | Dune        | Frank Herbert    | 412   | 2026-08-19 |
        | Piranesi    | Susanna Clarke   | 250   | 2026-09-06 |
        | Emma        | Jane Austen      | 474   | 2026-09-27 |
        | Middlemarch | George Eliot     | 880   | null       |
    And the user passes the commandline args 'chart --out chart.html'
    When the Tool is Run
    Then the file 'chart.html' should contain exactly one '<svg' element
    And that element should contain exactly 2 '<rect' elements with the class 'bar'
    And the standard output should contain the string "Wrote chart.html"
    And the exit code should be 0

Scenario: [TOR-03-Ch2Lb6x] The tool shall label each bar with its month and the pages finished in that month
    Given a 'shelf.json' holding these books:
        | title    | author         | pages | finished   |
        | Dune     | Frank Herbert  | 412   | 2026-08-19 |
        | Piranesi | Susanna Clarke | 250   | 2026-09-06 |
        | Emma     | Jane Austen    | 474   | 2026-09-27 |
    And the user passes the commandline args 'chart --out chart.html'
    When the Tool is Run
    Then the SVG in 'chart.html' should contain a '<text' element containing "2026-08" and "412"
    And a '<text' element containing "2026-09" and "724"
    And the exit code should be 0

Scenario: [TOR-03-Ch3Sc1y] The tool shall write a chart file that is complete in itself, with no script and nothing loaded from anywhere else
    Given a 'shelf.json' holding these books:
        | title | author        | pages | finished   |
        | Dune  | Frank Herbert | 412   | 2026-08-19 |
    And the user passes the commandline args 'chart --out chart.html'
    When the Tool is Run
    Then the file 'chart.html' should not contain the string "<script"
    And it should not contain the string "://" other than in the 'xmlns' attribute of the '<svg' element
    And the exit code should be 0


# --------------------------------------------------------------------------------------------------
# Reading the Chart
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-03-Ch4Lk7z] The chart shall be readable when opened in a browser, with each bar's height in proportion to its pages and no label overlapping another label or a bar
    # Verification: operator-observed
    Given a 'chart.html' written by 'chart --out chart.html' from the reading list in 'samples/shelf.json'
    When the user opens 'chart.html' in a web browser
    Then the user should see one bar per month in which a book was finished
    And the tallest bar should be the month with the most pages, and a bar with half those pages should look half as tall
    And every label should be readable in full, with no label drawn over another label or over a bar
