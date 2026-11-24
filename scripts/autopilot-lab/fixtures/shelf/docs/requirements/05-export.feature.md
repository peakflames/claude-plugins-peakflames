Feature: 5.0 CSV Export
    As a reader
    I want my reading list written as a CSV file
    So that I can open it in a spreadsheet or hand it to another program


# --------------------------------------------------------------------------------------------------
# Writing the File
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-05-Ex1Wr4e] The tool shall write a CSV file with a header line and one line per book, in the order the books were added, when invoked with export and an output file
    Given a 'shelf.json' holding these books:
        | title    | author         | pages | finished   |
        | Dune     | Frank Herbert  | 412   | null       |
        | Piranesi | Susanna Clarke | 250   | 2026-09-06 |
    And the user passes the commandline args 'export --out books.csv'
    When the Tool is Run
    Then the file 'books.csv' should be exactly these lines, in order:
        """
        title,author,pages,finished
        Dune,Frank Herbert,412,
        Piranesi,Susanna Clarke,250,2026-09-06
        """
    And the exit code should be 0

Scenario: [TOR-05-Ex2Qt7f] The tool shall enclose a field holding a comma or a double quote in double quotes, writing each double quote inside it twice
    Given a 'shelf.json' holding these books:
        | title                   | author      | pages | finished |
        | Eats, Shoots & Leaves   | Lynne Truss | 209   | null     |
        | The "Good" Book         | A. Writer   | 120   | null     |
    And the user passes the commandline args 'export --out books.csv'
    When the Tool is Run
    Then the second line of 'books.csv' should be exactly:
        """
        "Eats, Shoots & Leaves",Lynne Truss,209,
        """
    And the third line of 'books.csv' should be exactly:
        """
        "The ""Good"" Book",A. Writer,120,
        """
    And the exit code should be 0

Scenario: [TOR-05-Ex3Ov2g] The tool shall leave an existing file untouched and print one line naming it and what to do when the output file already exists
    Given a 'shelf.json' holding these books:
        | title | author        | pages | finished |
        | Dune  | Frank Herbert | 412   | null     |
    And a file at 'books.csv' with content:
        """
        keep me
        """
    And the user passes the commandline args 'export --out books.csv'
    When the Tool is Run
    Then the file 'books.csv' should still be exactly the line "keep me"
    And the standard error should be exactly one line
    And that line should start with "Error: " and contain the string "books.csv"
    And the exit code should be 1
