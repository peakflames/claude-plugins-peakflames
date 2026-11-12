Feature: 2.0 Reading Page
    As a reader
    I want my reading list written as a page I can open in a browser
    So that I can take in the whole list at a glance


# --------------------------------------------------------------------------------------------------
# Writing the Page
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-02-Pg1Wr5s] The tool shall write an HTML file naming every book and its author when invoked with page and an output file
    Given a 'shelf.json' holding these books:
        | title    | author         | pages | finished   |
        | Dune     | Frank Herbert  | 412   | null       |
        | Piranesi | Susanna Clarke | 250   | 2026-09-06 |
    And the user passes the commandline args 'page --out shelf.html'
    When the Tool is Run
    Then the file 'shelf.html' should contain the strings "Dune", "Frank Herbert", "Piranesi" and "Susanna Clarke"
    And the standard output should contain the string "Wrote shelf.html"
    And the exit code should be 0

Scenario: [TOR-02-Pg2Sc8t] The tool shall write a page file that is complete in itself, with no script and nothing loaded from anywhere else
    Given a 'shelf.json' holding these books:
        | title | author        | pages | finished |
        | Dune  | Frank Herbert | 412   | null     |
    And the user passes the commandline args 'page --out shelf.html'
    When the Tool is Run
    Then the file 'shelf.html' should not contain the string "<script"
    And it should not contain the string "://"
    And the exit code should be 0

Scenario: [TOR-02-Pg3Es4u] The tool shall write a title holding the characters &, < or > so that a browser shows them as typed
    Given a 'shelf.json' holding these books:
        | title                   | author     | pages | finished |
        | Fish & Chips <A Memoir> | N. O. Body | 150   | null     |
    And the user passes the commandline args 'page --out shelf.html'
    When the Tool is Run
    Then the file 'shelf.html' should contain the string "Fish &amp; Chips &lt;A Memoir&gt;"
    And it should not contain the string "<A Memoir>"
    And the exit code should be 0


# --------------------------------------------------------------------------------------------------
# Reading the Page
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-02-Pg4Gl9v] The reading page shall let a person tell the finished books from the unfinished ones at a glance when opened in a browser
    # Verification: operator-observed
    Given a 'shelf.html' written by 'page --out shelf.html' from the reading list in 'samples/shelf.json'
    When the user opens 'shelf.html' in a web browser
    Then the user should see every book's title and author
    And the user should be able to tell which books are finished and which are not without reading the dates
    And the page should be comfortable to read, with nothing cramped, clipped or overlapping
