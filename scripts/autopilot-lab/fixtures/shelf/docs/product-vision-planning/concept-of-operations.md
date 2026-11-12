# shelf — Concept of Operations

## 1. Users

A single reader at their own computer, in a terminal, in the folder where they keep the list.

## 2. Operating Environment

Node.js 22 or later on macOS, Linux or Windows. No network. The reading list is the file
`shelf.json` in the current directory.

## 3. Inputs

Commands typed by the reader: `add`, `list`, `finish`, `page`, `chart` and `config`. An
optional settings file: the file named by the `SHELFRC` environment variable, or else
`.shelfrc` in the reader's home directory. It is JSON and may hold `pageTitle` (text) and
`finishedLast` (true or false).

## 4. Outputs

`shelf.json`: `{"books": [{"title": "<text>", "author": "<text>", "pages": <integer>, "finished": "YYYY-MM-DD" | null}]}`.
Books are numbered from 1 in the order they were added. `page` and `chart` each write one HTML
file that is complete in itself.

## 5. Operational Scenarios

### S1 — Keep the list

1. The reader runs `shelf add "Dune" --author "Frank Herbert" --pages 412`. The tool adds the
   book to `shelf.json`, creating the file if it does not exist, and says so.
2. The reader runs `shelf list` and sees every book, numbered, in the order it was added, with
   the date beside each finished one.
3. The reader finishes a book and runs `shelf finish 2 --on 2026-10-14`. The tool records the
   date against book 2.

### S2 — Look at the reading list as a page

1. The reader runs `shelf page --out shelf.html`.
2. The reader opens `shelf.html` in a browser and sees every book with its author. Without
   reading the dates they can tell which books are finished and which are still to read.

### S3 — See how much was read each month

1. The reader runs `shelf chart --out chart.html`.
2. The reader opens `chart.html` in a browser and sees one bar per month in which a book was
   finished, each labelled with the month and the pages finished in it, tall in proportion to
   the pages, with nothing overlapping.

### S4 — Check the settings file

1. The reader runs `shelf config`. If the settings file is missing or correct the tool says the
   settings are fine. If it is not valid JSON, holds a key the tool does not know, or holds a
   value of the wrong kind, the tool prints one line naming the file, the problem and what to do.
