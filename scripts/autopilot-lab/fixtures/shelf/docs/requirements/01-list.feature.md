Feature: 1.0 Reading List
    As a reader
    I want to add books to one local list and mark them finished
    So that I always know what I have read and what is still waiting


# --------------------------------------------------------------------------------------------------
# Adding Books
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-01-Ad1Bk3m] The tool shall add a book to shelf.json in the current directory when invoked with add, a title, an author and a page count
    Given the current directory contains no file named 'shelf.json'
    And the user passes the commandline args 'add "Dune" --author "Frank Herbert" --pages 412'
    When the Tool is Run
    Then the file 'shelf.json' should be valid JSON whose 'books' array has exactly 1 entry
    And that entry should have exactly the keys 'title', 'author', 'pages' and 'finished'
    And its 'title' should equal "Dune", its 'author' should equal "Frank Herbert", its 'pages' should equal the number 412 and its 'finished' should be null
    And the standard output should contain the string "Added Dune"
    And the exit code should be 0

Scenario: [TOR-01-Ad2Dp6n] The tool shall refuse to add a book whose title is already on the list
    Given a 'shelf.json' holding these books:
        | title | author        | pages | finished |
        | Dune  | Frank Herbert | 412   | null     |
    And the user passes the commandline args 'add "Dune" --author "F. Herbert" --pages 400'
    When the Tool is Run
    Then the 'books' array in 'shelf.json' should still have exactly 1 entry, with the author "Frank Herbert"
    And the standard error should be exactly one line
    And that line should start with "Error: " and contain the string "Dune"
    And the exit code should be 1


# --------------------------------------------------------------------------------------------------
# Listing Books
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-01-Ls3Nm8p] The tool shall print the books numbered from 1 in the order they were added, with the date beside each finished book, when invoked with list
    Given a 'shelf.json' holding these books:
        | title    | author         | pages | finished   |
        | Dune     | Frank Herbert  | 412   | null       |
        | Piranesi | Susanna Clarke | 250   | 2026-09-06 |
    And the user passes the commandline args 'list'
    When the Tool is Run
    Then the standard output should be exactly these lines, in order:
        """
        1. Dune — Frank Herbert
        2. Piranesi — Susanna Clarke (finished 2026-09-06)
        """
    And the exit code should be 0


# --------------------------------------------------------------------------------------------------
# Finishing Books
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-01-Fn4Dt2q] The tool shall record the given date against a book when invoked with finish, the book's number and a date
    Given a 'shelf.json' holding these books:
        | title    | author         | pages | finished |
        | Dune     | Frank Herbert  | 412   | null     |
        | Piranesi | Susanna Clarke | 250   | null     |
    And the user passes the commandline args 'finish 2 --on 2026-10-14'
    When the Tool is Run
    Then the 'finished' value of the second entry of the 'books' array in 'shelf.json' should equal "2026-10-14"
    And the 'finished' value of the first entry should still be null
    And the standard output should contain the string "Finished Piranesi"
    And the exit code should be 0

Scenario: [TOR-01-Fn5Rg7r] The tool shall print one line naming the number and what to do when asked to finish a book number that is not on the list
    Given a 'shelf.json' holding these books:
        | title | author        | pages | finished |
        | Dune  | Frank Herbert | 412   | null     |
    And the user passes the commandline args 'finish 7 --on 2026-10-14'
    When the Tool is Run
    Then the standard error should be exactly one line
    And that line should start with "Error: " and contain the string "7"
    And the file 'shelf.json' should be unchanged
    And the exit code should be 1
