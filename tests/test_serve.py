"""v3.0 M2 serve package: differential tests (spec docs/spec-serve.md).

Every case runs through the bootstrap interpreter AND the self-hosted
Jesun.Code walker; the outputs must match byte for byte. Follows the
tests/test_sitegen.py pattern via InlineSandbox.
"""

import os
import sys
import json
import re
import shutil
import socket
import subprocess
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from selfhost_harness import InlineSandbox, LINE_RE  # noqa: E402

HDR = 'bring in "jweb"\nbring in "sitegen"\nbring in "serve"\n'
SITE = 'serve_site with "Acme" and "https://acme.example" and "v1.0.0"\n'


class ServeCase(unittest.TestCase):
    def check(self, src, expected):
        box = InlineSandbox()
        try:
            boot, selfhost = box.run(src)
        finally:
            box.close()
        self.assertEqual(
            (selfhost[0], LINE_RE.sub("Line N", selfhost[1])),
            (boot[0], LINE_RE.sub("Line N", boot[1])),
            f"differ:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )
        self.assertEqual(boot[0], 0, f"bootstrap failed: {boot!r}")
        self.assertEqual(boot[1], expected)

    def check_fails(self, src, message):
        box = InlineSandbox()
        try:
            boot, selfhost = box.run(src)
        finally:
            box.close()
        self.assertEqual(
            (selfhost[0], LINE_RE.sub("Line N", selfhost[1])),
            (boot[0], LINE_RE.sub("Line N", boot[1])),
            f"differ:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )
        self.assertNotEqual(boot[0], 0, f"expected failure: {boot!r}")
        self.assertIn(message, boot[1])


class SiteTest(ServeCase):
    def test_site_builds_table(self):
        self.check(
            HDR + 's is serve_site with "Acme" and "https://acme.example" and "v1.0.0"\n'
            'show s["name"]\nshow s["site_url"]\nshow s["version"]\n',
            "Acme\nhttps://acme.example\nv1.0.0\n",
        )

    def test_site_twice_fails(self):
        self.check_fails(
            HDR + SITE + SITE,
            "serve_site was already called; one site per app.",
        )

    def test_site_nontext_fails(self):
        self.check_fails(
            HDR + 'serve_site with "Acme" and "https://acme.example" and 7\n',
            "serve_site needs a name, a url, and a version, all text.",
        )


class RouteTest(ServeCase):
    def test_route_malformed_fails(self):
        self.check_fails(
            HDR + 'serve_route with "GET" and 7\n',
            'serve_route needs "METHOD /path", like "GET /hello".',
        )

    def test_route_no_slash_fails(self):
        self.check_fails(
            HDR + 'serve_route with "GET hello" and 7\n',
            'serve_route needs "METHOD /path", like "GET /hello".',
        )

    def test_route_handler_not_function_fails(self):
        self.check_fails(
            HDR + 'serve_route with "GET /hello" and "nope"\n',
            "the route handler has to be a function, but this is \"nope\".",
        )

    def test_route_registers(self):
        self.check(
            HDR + 'to h with request\n    give back "hi"\nserve_route with "GET /hello" and h\nshow "registered"\n',
            "registered\n",
        )


class StartTest(ServeCase):
    def test_start_bad_port_text_fails(self):
        self.check_fails(
            HDR + 'serve_start with "eighty"\n',
            'serve_start needs a port number from 1 to 65535, but this is "eighty".',
        )

    def test_start_bad_port_zero_fails(self):
        self.check_fails(
            HDR + "serve_start with 0\n",
            "serve_start needs a port number from 1 to 65535, but this is 0.",
        )

    def test_start_bad_port_huge_fails(self):
        self.check_fails(
            HDR + "serve_start with 70000\n",
            "serve_start needs a port number from 1 to 65535, but this is 70000.",
        )


class PageTest(ServeCase):
    def test_page_shape(self):
        self.check(
            HDR + SITE
            + 'resp is serve_page with "Hello" and "<main><h1>Hi</h1></main>"\n'
            + 'show resp["status"]\n'
            + 'show resp["headers"]["content-type"]\n'
            + 'doc is resp["body"]\n'
            + 'if doc contains "<!DOCTYPE html>" then\n    show "doctype ok"\n'
            + 'otherwise\n    fail with "no doctype."\n'
            + 'if doc contains "<title>Hello</title>" then\n    show "title ok"\n'
            + 'otherwise\n    fail with "no title."\n'
            + 'if doc contains "<main><h1>Hi</h1></main>" then\n    show "body ok"\n'
            + 'otherwise\n    fail with "no body."\n'
            + 'if doc contains "app.js" then\n    fail with "app.js leaked into a dynamic page."\n'
            + 'otherwise\n    show "no app.js"\n'
            + 'if doc contains "<script" then\n    fail with "a plain page must ship zero script tags."\n'
            + 'otherwise\n    show "zero js"\n',
            "200\ntext/html; charset=utf-8\ndoctype ok\ntitle ok\nbody ok\nno app.js\nzero js\n",
        )

    def test_page_canonical_at_route(self):
        self.check(
            HDR + SITE
            + 'resp is serve_page_at with "/hello" and "Hello" and "<main></main>"\n'
            + 'doc is resp["body"]\n'
            + 'if doc contains "https://acme.example/hello" then\n    show "canonical ok"\n'
            + 'otherwise\n    fail with "canonical wrong."\n',
            "canonical ok\n",
        )

    def test_page_needs_title(self):
        self.check_fails(
            HDR + SITE + 'serve_page with "" and "<main></main>"\n',
            "a page needs a title, but this one is missing.",
        )

    def test_page_body_not_text_fails(self):
        self.check_fails(
            HDR + SITE + 'serve_page with "T" and 42\n',
            "a page body has to be text, but this is 42.",
        )

    def test_page_needs_site(self):
        self.check_fails(
            HDR + 'serve_page with "T" and "<main></main>"\n',
            "serve_site has to be called first",
        )


if __name__ == "__main__":
    unittest.main()


class IslandTest(ServeCase):
    HDR2 = 'bring in "jweb"\nbring in "js"\nbring in "sitegen"\nbring in "serve"\n'

    def test_island_shape(self):
        self.check(
            self.HDR2 + SITE
            + 'w is serve_island with "like-btn" and "<button>Hi</button>" and "alert(1);"\n'
            + 'if w contains "<button>Hi</button>" then\n    show "html ok"\n'
            + 'otherwise\n    fail with "island lost its html."\n'
            + 'if w contains "<script>" and w contains "alert(1);" then\n    show "script ok"\n'
            + 'otherwise\n    fail with "island lost its script."\n',
            "html ok\nscript ok\n",
        )

    def test_island_bad_id_fails(self):
        self.check_fails(
            self.HDR2 + 'serve_island with "9lives" and "<b></b>" and "x();"\n',
            '"9lives" is not a valid island id. Use letters, numbers, dashes, and underscores, starting with a letter.',
        )

    def test_island_script_not_text_fails(self):
        self.check_fails(
            self.HDR2 + 't is a new table\nserve_island with "ok" and "<b></b>" and t\n',
            "an island script has to be text, but this is a table.",
        )


class TableTest(ServeCase):
    HDR3 = ('bring in "jweb"\nbring in "sitegen"\nbring in "html"\n'
            'bring in "sqlite"\nbring in "time"\nbring in "serve"\n')
    DB = 'db is open_database with "serve_test.db"\n'
    DECL = 't is serve_table with "todos" and [["task", "text"], ["done", "true/false"]]\n'

    def test_table_declaration(self):
        self.check(
            self.HDR3 + self.DECL
            + 'show t["version"]\n'
            + 'show t["history"][0]["sql"]\n'
            + 'show length of t["fields"]\n'
            + 'show t["fields"][0][0]\nshow t["fields"][1][1]\n',
            "1\nCREATE TABLE todos (id INTEGER PRIMARY KEY, task TEXT, done INTEGER)\n"
            "2\ntask\ntrue/false\n",
        )

    def test_table_bad_name_fails(self):
        self.check_fails(
            self.HDR3 + 'serve_table with "my table" and []\n',
            '"my table" is not a valid table name. Use letters, numbers, '
            "and underscores, starting with a letter.",
        )

    def test_field_bad_name_fails(self):
        self.check_fails(
            self.HDR3 + 'serve_table with "ok" and [["first name", "text"]]\n',
            '"first name" is not a valid field name. Use letters, numbers, '
            "and underscores, starting with a letter.",
        )

    def test_field_bad_kind_fails(self):
        self.check_fails(
            self.HDR3 + 'serve_table with "ok" and [["a", "email"]]\n',
            '"email" is not a field kind. Use "text", "number", or "true/false".',
        )

    def test_field_duplicate_fails(self):
        self.check_fails(
            self.HDR3 + 'serve_table with "ok" and [["a", "text"], ["a", "text"]]\n',
            'the table "ok" already has a field called "a".',
        )

    def test_add_field(self):
        self.check(
            self.HDR3 + self.DECL
            + 'serve_add_field with t and "priority" and "number"\n'
            + 'show t["version"]\n'
            + 'show t["history"][1]["sql"]\n'
            + 'show length of t["fields"]\n',
            "2\nALTER TABLE todos ADD COLUMN priority REAL\n3\n",
        )

    def test_add_field_bad_kind_fails(self):
        self.check_fails(
            self.HDR3 + self.DECL + 'serve_add_field with t and "p" and "email"\n',
            '"email" is not a field kind. Use "text", "number", or "true/false".',
        )

    def test_add_field_duplicate_fails(self):
        self.check_fails(
            self.HDR3 + self.DECL + 'serve_add_field with t and "task" and "text"\n',
            'the table "todos" already has a field called "task".',
        )

    def test_add_field_bad_name_fails(self):
        self.check_fails(
            self.HDR3 + self.DECL + 'serve_add_field with t and "no good" and "text"\n',
            '"no good" is not a valid field name. Use letters, numbers, '
            "and underscores, starting with a letter.",
        )

    def test_migrate_idempotent(self):
        self.check(
            self.HDR3 + self.DB + self.DECL
            + 'serve_add_field with t and "priority" and "number"\n'
            + 'm1 is serve_migrate with db and t\n'
            + 'm2 is serve_migrate with db and t\n'
            + 'show m1\nshow m2\n'
            + 'h is serve_migrations with db and "todos"\n'
            + 'show length of h\n'
            + 'show h[0]["version"]\nshow h[1]["version"]\n',
            "[1, 2]\n[]\n2\n1\n2\n",
        )

    def test_migrate_applies_missing_only(self):
        self.check(
            self.HDR3 + self.DB + self.DECL
            + 'm1 is serve_migrate with db and t\n'
            + 'serve_add_field with t and "priority" and "number"\n'
            + 'm2 is serve_migrate with db and t\n'
            + 'show m1\nshow m2\n',
            "[1]\n[2]\n",
        )

    def test_serve_all_null_is_nothing(self):
        self.check(
            self.HDR3 + self.DB + self.DECL
            + 'serve_migrate with db and t\n'
            + 'db_run with db and "INSERT INTO todos (task, done) VALUES (?, ?)" and ["Buy milk", nothing]\n'
            + 'rows is serve_all with db and t\n'
            + 'show length of rows\n'
            + 'show rows[0]["task"]\n'
            + 'if rows[0]["done"] is nothing then\n    show "null ok"\n',
            "1\nBuy milk\nnull ok\n",
        )

    def test_migration_refused(self):
        self.check_fails(
            self.HDR3 + self.DB
            + 'db_run with db and "CREATE TABLE todos (x TEXT)" and nothing\n'
            + self.DECL
            + 'serve_migrate with db and t\n',
            "the database said: table todos already exists",
        )


class FormTest(ServeCase):
    HDR = 'bring in "jweb"\nbring in "serve"\n'

    def test_form_decodes(self):
        self.check(
            self.HDR + 'f is serve_form with {"body": "task=Buy+milk&done=true"}\n'
            + 'show f["task"]\nshow f["done"]\n',
            "Buy milk\ntrue\n",
        )

    def test_form_empty_body(self):
        self.check(
            self.HDR + 'f is serve_form with {"body": ""}\nshow kind of f\n',
            "table\n",
        )

    def test_form_missing_body(self):
        self.check(
            self.HDR + 'f is serve_form with {"headers": {}}\nshow kind of f\n',
            "table\n",
        )

    def test_form_hostile_never_fails(self):
        self.check(
            self.HDR + 'f is serve_form with {"body": "%zz=%&a+b=c+d"}\n'
            + 'show f["a b"]\nshow kind of f\n',
            "c d\ntable\n",
        )


class GuardTest(ServeCase):
    HDR = 'bring in "jweb"\nbring in "serve"\n'

    def test_guard_no_user(self):
        self.check(
            self.HDR + 'g is serve_guard with {"cookies": {}}\n'
            + 'if g is nothing then\n    show "nothing"\n',
            "nothing\n",
        )

    def test_guard_with_user(self):
        self.check(
            self.HDR + 'jweb_sessions["t1"] is {"user": "jesun"}\n'
            + 'g is serve_guard with {"cookies": {"jesun_session": "t1"}}\n'
            + 'show g\n',
            "jesun\n",
        )


class AdminTest(ServeCase):
    HDR3 = ('bring in "jweb"\nbring in "sitegen"\nbring in "html"\n'
            'bring in "sqlite"\nbring in "time"\nbring in "serve"\n')
    SETUP = (
        HDR3
        + 'serve_site with "Todos" and "https://todos.example" and "v1.0.0"\n'
        + 'db is open_database with "serve_test.db"\n'
        + 't is serve_table with "todos" and [["task", "text"]]\n'
        + 'serve_migrate with db and t\n'
        + 'serve_admin with db and t\n'
    )

    def test_admin_list_shape(self):
        self.check(
            self.SETUP
            + 'resp is serve_admin_list with {"path": "/admin/todos", "cookies": {}}\n'
            + 'show resp["status"]\n'
            + 'if resp["body"] contains "<table>" then\n    show "table"\n'
            + 'otherwise\n    fail with "no table."\n'
            + 'if resp["body"] contains "action=\\"/admin/todos\\"" then\n    show "form"\n'
            + 'otherwise\n    fail with "no form."\n',
            "200\ntable\nform\n",
        )

    def test_admin_double_fails(self):
        self.check_fails(
            self.SETUP + 'serve_admin with db and t\n',
            'the admin for "todos" is already registered.',
        )

    def test_admin_create_and_delete(self):
        self.check(
            self.SETUP
            + 'c is serve_admin_create with {"path": "/admin/todos", "cookies": {}, "body": "task=Write+tests"}\n'
            + 'show c["status"]\nshow c["headers"]["location"]\n'
            + 'rows is serve_all with db and t\nshow length of rows\nshow rows[0]["task"]\n'
            + 'id1 is text of rows[0]["id"]\n'
            + 'd is serve_admin_delete with {"path": "/admin/todos/delete", "cookies": {}, "body": "id=" + id1}\n'
            + 'show d["status"]\n'
            + 'show length of (serve_all with db and t)\n',
            "302\n/admin/todos\n1\nWrite tests\n302\n0\n",
        )

    def test_admin_escapes_html(self):
        self.check(
            self.SETUP
            + 'serve_admin_create with {"path": "/admin/todos", "cookies": {}, "body": "task=%3Cscript%3E"}\n'
            + 'resp is serve_admin_list with {"path": "/admin/todos", "cookies": {}}\n'
            + 'if resp["body"] contains "&lt;script&gt;" then\n    show "escaped"\n'
            + 'otherwise\n    fail with "not escaped."\n'
            + 'if resp["body"] contains "<script>" then\n    fail with "raw html leaked."\n'
            + 'otherwise\n    show "clean"\n',
            "escaped\nclean\n",
        )


class LiveTest(unittest.TestCase):
    """Subprocess servers on loopback ports, raw socket clients, no
    network dependency. Each live case runs on BOTH interpreters
    (spec section 10)."""

    REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    JESUN_PY = os.path.join(REPO, "jesun.py")
    JESUN_JC = os.path.join(REPO, "jesun.jc")

    LIKE_APP = """bring in "jweb"
bring in "sitegen"
bring in "js"
bring in "serve"

serve_site with "Likes" and "https://likes.example" and "v1.0.0"

likes is {"count": 0}

to like_api with request
    likes["count"] is likes["count"] + 1
    give back json_response with {"likes": likes["count"]}

serve_route with "POST /api/like" and like_api

code is dom_ready with (on_event with "click" and "like-btn" and (js_fetch with "/api/like" and "POST" and "null"))
btn is serve_island with "like-btn" and "<button id=\\"like-btn\\">Like</button>" and code

to home with request
    give back serve_page with "Likes" and ("<main><h1>Likes</h1>" + btn + "</main>")

serve_route with "GET /" and home
serve_start with {PORT}
"""

    ADMIN_APP = """bring in "jweb"
bring in "sitegen"
bring in "html"
bring in "sqlite"
bring in "time"
bring in "serve"

serve_site with "Todos" and "https://todos.example" and "v1.0.0"

db is open_database with "admintest.db"
todos is serve_table with "todos" and [["task", "text"], ["done", "true/false"]]
serve_add_field with todos and "priority" and "number"
m1 is serve_migrate with db and todos
m2 is serve_migrate with db and todos
show m1
show m2
serve_admin with db and todos
serve_start with {PORT}
"""

    def free_port(self):
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        return port

    def start_server(self, app_src, walker):
        tmp = tempfile.mkdtemp(prefix="serve_live_")
        app_path = os.path.join(tmp, "app.jc")
        with open(app_path, "w") as f:
            f.write(app_src)
        if walker:
            cmd = [sys.executable, self.JESUN_PY, self.JESUN_JC, app_path]
        else:
            cmd = [sys.executable, self.JESUN_PY, app_path]
        proc = subprocess.Popen(
            cmd, cwd=tmp, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )
        return tmp, proc

    def wait_up(self, port, proc, timeout=60):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if proc.poll() is not None:
                self.fail(f"server died on start: {proc.stdout.read()[-2000:]}")
            try:
                s = socket.create_connection(("127.0.0.1", port), timeout=1)
                s.close()
                return
            except OSError:
                time.sleep(0.3)
        self.fail("server did not come up in time")

    def raw(self, port, method, path, body=b""):
        s = socket.create_connection(("127.0.0.1", port), timeout=15)
        try:
            head = (
                f"{method} {path} HTTP/1.1\r\nHost: x\r\n"
                f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n"
            ).encode() + body
            s.sendall(head)
            resp = b""
            while True:
                chunk = s.recv(65536)
                if not chunk:
                    break
                resp += chunk
            return resp
        finally:
            s.close()

    def stop(self, tmp, proc):
        try:
            proc.terminate()
            out = proc.communicate(timeout=10)[0]
        except Exception:
            proc.kill()
            out = proc.communicate()[0]
        shutil.rmtree(tmp, ignore_errors=True)
        return out or ""

    def live_like(self, walker):
        port = self.free_port()
        tmp, proc = self.start_server(
            self.LIKE_APP.replace("{PORT}", str(port)), walker
        )
        try:
            self.wait_up(port, proc)
            get = self.raw(port, "GET", "/")
            head, _, body = get.partition(b"\r\n\r\n")
            self.assertIn(b"200", head.split(b"\r\n")[0])
            self.assertIn(b"<title>Likes</title>", body)
            self.assertEqual(
                body.count(b"<script"), 1, "one script tag: the island's only"
            )
            p1 = self.raw(port, "POST", "/api/like")
            p2 = self.raw(port, "POST", "/api/like")
            self.assertEqual(
                json.loads(p1.partition(b"\r\n\r\n")[2].decode()), {"likes": 1}
            )
            self.assertEqual(
                json.loads(p2.partition(b"\r\n\r\n")[2].decode()), {"likes": 2}
            )
        finally:
            self.stop(tmp, proc)

    def test_live_like_bootstrap(self):
        self.live_like(False)

    def test_live_like_walker(self):
        self.live_like(True)

    def live_admin(self, walker):
        port = self.free_port()
        tmp, proc = self.start_server(
            self.ADMIN_APP.replace("{PORT}", str(port)), walker
        )
        try:
            self.wait_up(port, proc)
            get = self.raw(port, "GET", "/admin/todos")
            self.assertIn(b"200", get.split(b"\r\n")[0])
            self.assertIn(b"<table>", get)
            c = self.raw(port, "POST", "/admin/todos", b"task=Write+tests&done=true")
            self.assertIn(b"302", c.split(b"\r\n")[0])
            self.assertIn(b"location: /admin/todos", c.lower())
            get2 = self.raw(port, "GET", "/admin/todos")
            self.assertIn(b"Write tests", get2)
            m = re.search(rb'name="id" value="(\d+)"', get2)
            self.assertIsNotNone(m, "delete form carries the row id")
            d = self.raw(port, "POST", "/admin/todos/delete", b"id=" + m.group(1))
            self.assertIn(b"302", d.split(b"\r\n")[0])
            get3 = self.raw(port, "GET", "/admin/todos")
            self.assertNotIn(b"Write tests", get3)
        finally:
            out = self.stop(tmp, proc)
        self.assertIn("[1, 2]", out, "first migrate applied versions 1 and 2")
        self.assertIn("[]", out, "second migrate applied nothing")

    def test_live_admin_bootstrap(self):
        self.live_admin(False)

    def test_live_admin_walker(self):
        self.live_admin(True)
