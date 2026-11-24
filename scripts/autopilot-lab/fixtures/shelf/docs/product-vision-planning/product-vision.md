# shelf — Product Vision

## 1. Problem

People who read a lot lose track of what they have read, what they meant to read next and how
much they got through. Reading apps want an account and sell the list back as advertising; a
note on the phone has no order and no totals.

## 2. Who It Is For

One reader who is comfortable typing a command in a terminal and wants their reading list to
be a plain file on their own computer.

## 3. Goals

1. Keep the reading list in one local file (`shelf.json`): add a book, see the list, and mark
   a book finished on a date.
2. Write the reading list as a page the reader can open in a browser and take in at a glance.
3. Draw how many pages were finished each month as a chart.
4. Tell the reader in plain words when their settings file is wrong.
5. Hand the list to other programs as a CSV file.

## 4. Principles

- **Faithful record.** A title and an author are stored exactly as typed.
- **A glance is enough.** The pages are for a person to look at. Whether they read well is
  judged by a person opening them, not by a test.
- **One date format.** Dates are ISO `YYYY-MM-DD`.
- **Local and private.** No network access, no accounts, no telemetry. The pages load nothing
  from anywhere else.

## 5. Out of Scope

Book lookups, cover images, ratings, shared lists and syncing between computers.
