"""Differential tests for the sqlite package (spec v1.2 section 4).

Every test runs through the bootstrap (jesun.py) and the self-hosted
walker (jesun.jc) via InlineSandbox, so each leg gets its own working
folder: the .db files never leak across legs, and the sandbox rule
("stays inside the working folder") is exercised for real on both.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from selfhost_harness import InlineSandbox  # noqa: E402


def run_case(src):
    box = InlineSandbox()
    try:
        boot, selfhost = box.run(src)
    finally:
        box.close()
    return boot, selfhost


class Sqlite(unittest.TestCase):
    def check(self, src, expected):
        boot, selfhost = run_case(src)
        self.assertEqual(
            selfhost, boot,
            f"differs:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )
        self.assertEqual(boot[1], expected)
        return boot

    SETUP = (
        'bring in "sqlite"\n'
        'db is open_database with "t.db"\n'
        'db_run with db and "CREATE TABLE todos '
        '(id INTEGER PRIMARY KEY, task TEXT, done INTEGER)" and nothing\n'
    )

    def test_crud_roundtrip(self):
        self.check(
            self.SETUP
            + 'db_run with db and "INSERT INTO todos (task, done) VALUES (?, ?)" and ["Buy milk", 0]\n'
            + 'db_run with db and "INSERT INTO todos (task, done) VALUES (?, ?)" and ["Ship v1.2", 1]\n'
            + 'rows is db_query with db and "SELECT id, task, done FROM todos ORDER BY id" and nothing\n'
            + 'show length of rows\n'
            + 'show rows[0]["task"]\n'
            + 'show text of rows[1]["id"] + "/" + rows[1]["task"] + "/" + text of rows[1]["done"]\n'
            + 'close_database with db\n'
            + 'show "done"\n',
            "2\nBuy milk\n2/Ship v1.2/1\ndone\n",
        )

    def test_null_roundtrip(self):
        self.check(
            'bring in "sqlite"\n'
            'db is open_database with "n.db"\n'
            'db_run with db and "CREATE TABLE m (a TEXT, b INTEGER)" and nothing\n'
            'db_run with db and "INSERT INTO m (a, b) VALUES (?, ?)" and [nothing, nothing]\n'
            'rows is db_query with db and "SELECT a, b FROM m" and nothing\n'
            'show rows[0]["a"] is nothing\n'
            'show rows[0]["b"] is nothing\n'
            'close_database with db\n',
            "true\ntrue\n",
        )

    def test_true_false_params(self):
        self.check(
            'bring in "sqlite"\n'
            'db is open_database with "b.db"\n'
            'db_run with db and "CREATE TABLE f (v INTEGER)" and nothing\n'
            'db_run with db and "INSERT INTO f (v) VALUES (?)" and [true]\n'
            'db_run with db and "INSERT INTO f (v) VALUES (?)" and [false]\n'
            'rows is db_query with db and "SELECT v FROM f ORDER BY v" and nothing\n'
            'show text of rows[0]["v"] + "," + text of rows[1]["v"]\n'
            'close_database with db\n',
            "0,1\n",
        )

    def test_persistence_across_open(self):
        self.check(
            'bring in "sqlite"\n'
            'db is open_database with "p.db"\n'
            'db_run with db and "CREATE TABLE k (v TEXT)" and nothing\n'
            'db_run with db and "INSERT INTO k (v) VALUES (?)" and ["kept"]\n'
            'close_database with db\n'
            'db2 is open_database with "p.db"\n'
            'rows is db_query with db2 and "SELECT v FROM k" and nothing\n'
            'show rows[0]["v"]\n'
            'close_database with db2\n',
            "kept\n",
        )

    def test_sandbox_escape_refused(self):
        self.check(
            'bring in "sqlite"\n'
            'r is attempt open_database with "../evil.db"\n'
            'show r["ok"]\n'
            'show r["error"]\n',
            'false\n'
            'Line 0: in the "sqlite" package: '
            'I cannot open "../evil.db": it leaves the current folder.\n',
        )

    def test_absolute_path_refused(self):
        self.check(
            'bring in "sqlite"\n'
            'r is attempt open_database with "/tmp/evil.db"\n'
            'show r["ok"]\n'
            'show r["error"]\n',
            'false\n'
            'Line 0: in the "sqlite" package: '
            'I cannot open "/tmp/evil.db": it leaves the current folder.\n',
        )

    def test_multi_statement_refused(self):
        self.check(
            'bring in "sqlite"\n'
            'db is open_database with "s.db"\n'
            'r is attempt db_run with db and "CREATE TABLE t (a TEXT); DROP TABLE t" and nothing\n'
            'show r["ok"]\n'
            'show r["error"]\n'
            'close_database with db\n',
            'false\n'
            'Line 0: in the "sqlite" package: '
            'run one SQL statement per call; this text holds 2.\n',
        )

    def test_no_such_table(self):
        self.check(
            'bring in "sqlite"\n'
            'db is open_database with "s.db"\n'
            'r is attempt db_query with db and "SELECT * FROM nope" and nothing\n'
            'show r["ok"]\n'
            'show r["error"]\n'
            'close_database with db\n',
            'false\n'
            'Line 0: in the "sqlite" package: '
            'the database said: no such table: nope\n',
        )

    def test_table_param_refused(self):
        self.check(
            'bring in "sqlite"\n'
            'db is open_database with "s.db"\n'
            'db_run with db and "CREATE TABLE t (a TEXT)" and nothing\n'
            'r is attempt db_run with db and "INSERT INTO t (a) VALUES (?)" and [{"x": 1}]\n'
            'show r["ok"]\n'
            'show r["error"]\n'
            'close_database with db\n',
            'false\n'
            'Line 0: in the "sqlite" package: '
            'I cannot put a table into a query. '
            'Use text, numbers, true/false, or nothing.\n',
        )

    def test_closed_handle_refused(self):
        self.check(
            'bring in "sqlite"\n'
            'db is open_database with "s.db"\n'
            'close_database with db\n'
            'r is attempt db_run with db and "CREATE TABLE t (a TEXT)" and nothing\n'
            'show r["ok"]\n'
            'show r["error"]\n',
            'false\n'
            'Line 0: in the "sqlite" package: '
            'that database is closed. Open it again with open_database.\n',
        )

    def test_not_a_database(self):
        self.check(
            'bring in "sqlite"\n'
            'r is attempt db_run with "nope" and "SELECT 1" and nothing\n'
            'show r["ok"]\n'
            'show r["error"]\n',
            'false\n'
            'Line 0: in the "sqlite" package: '
            'that is not a database. Open one with open_database.\n',
        )

    def test_bad_syntax(self):
        self.check(
            'bring in "sqlite"\n'
            'db is open_database with "s.db"\n'
            'r is attempt db_run with db and "CREATE TABL t (a TEXT)" and nothing\n'
            'show r["ok"]\n'
            'show r["error"]\n'
            'close_database with db\n',
            'false\n'
            'Line 0: in the "sqlite" package: '
            'the database said: near "TABL": syntax error\n',
        )


if __name__ == "__main__":
    unittest.main()
