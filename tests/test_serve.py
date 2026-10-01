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


JWEB_HDR = 'bring in "jweb"\n'
LIVE_HDR = 'bring in "jweb"\nbring in "sitegen"\nbring in "js"\nbring in "serve"\n'
THREE_HDR = 'bring in "threejs"\n'
SCENE_HDR = 'bring in "jweb"\nbring in "sitegen"\nbring in "js"\nbring in "serve"\nbring in "threejs"\n'
LIVE_SITE = 'serve_site with "Acme" and "https://acme.example" and "v1.0.0"\n'
RENDER_FNS = (
    'to render_count with state\n'
    '    give back "<p>" + (text of state["n"]) + "</p>"\n'
    'to bump with state and event\n'
    '    state["n"] is state["n"] + 1\n'
    '    give back render_count with state\n'
)


class SseBridgeTest(ServeCase):
    """jweb SSE bridge: helpers, sender validation (spec section 5.1,
    error rows 13-14), and the 128-stream cap (row 31)."""

    def test_helpers_load_and_pair_is_opaque(self):
        self.check(
            JWEB_HDR + 'helpers is jweb_sse_helpers\n'
            'show (length of (keys of helpers)) is greater than 5\n'
            'pair is jweb_sse_pair\n'
            'show kind of pair\n'
            'show jweb_sse_dead with pair\n',
            "true\npython value\nfalse\n",
        )

    def test_sender_queues_frames(self):
        self.check(
            JWEB_HDR + 'jweb_sse_use with jweb_sse_pair\n'
            'show jweb_sse_sender with "render" and "<p>hi</p>"\n'
            'show jweb_sse_sender with "render" and "a\\nb"\n',
            "true\ntrue\n",
        )

    def test_sender_newline_in_name_fails(self):
        self.check_fails(
            JWEB_HDR + 'jweb_sse_use with jweb_sse_pair\n'
            'jweb_sse_sender with "a\\nb" and "x"\n',
            "an event name cannot hold a new line.",
        )

    def test_sender_nontext_name_fails(self):
        self.check_fails(
            JWEB_HDR + 'jweb_sse_use with jweb_sse_pair\n'
            'jweb_sse_sender with 42 and "x"\n',
            "an event name has to be text, but this is 42.",
        )

    def test_sender_nontext_data_fails(self):
        self.check_fails(
            JWEB_HDR + 'jweb_sse_use with jweb_sse_pair\n'
            'jweb_sse_sender with "render" and {"a": 1}\n',
            "stream data has to be text, but this is a table.",
        )

    def test_stream_cap_is_503(self):
        self.check(
            JWEB_HDR + 'to fake_setup with pipe and request\n'
            '    give back nothing\n'
            'tmp is jweb_state["streams"]\n'
            'repeat 128 times\n'
            '    push "dummy" to tmp\n'
            'jweb_state["streams"] is tmp\n'
            'resp is jweb_sse_stream with {"path": "/x"} and fake_setup\n'
            'show resp["status"]\n'
            'show resp["body"]\n',
            "503\nthe server is full; try again soon.\n",
        )

    def test_session_id_prefers_cookie(self):
        self.check(
            JWEB_HDR + 'show jweb_session_id with {"cookies": {"jesun_session": "abc"}}\n'
            'show jweb_session_id with {"cookies": a new table}\n',
            "abc\n\n",
        )


class LiveViewTest(ServeCase):
    """serve_live validation (spec 3.4, error rows 10-12), the JSON event
    parser, the client script, and the POST 400/410 paths (no sockets)."""

    def test_state_must_be_table(self):
        self.check_fails(
            LIVE_HDR + LIVE_SITE + RENDER_FNS
            + 'req is {"path": "/c", "cookies": a new table}\n'
            + 'serve_live with req and "T" and 42 and render_count and bump\n',
            "live view state has to be a table, but this is 42.",
        )

    def test_render_must_be_function(self):
        self.check_fails(
            LIVE_HDR + LIVE_SITE + RENDER_FNS
            + 'req is {"path": "/c", "cookies": a new table}\n'
            + 'serve_live with req and "T" and {"n": 0} and "oops" and bump\n',
            'a live view needs a render function, but this is "oops".',
        )

    def test_on_event_must_be_function(self):
        self.check_fails(
            LIVE_HDR + LIVE_SITE + RENDER_FNS
            + 'req is {"path": "/c", "cookies": a new table}\n'
            + 'serve_live with req and "T" and {"n": 0} and render_count and "oops"\n',
            'a live view needs an event function, but this is "oops".',
        )

    def test_page_registers_routes_and_renders(self):
        self.check(
            LIVE_HDR + LIVE_SITE + RENDER_FNS
            + 'req is {"path": "/count", "cookies": a new table}\n'
            + 'resp is serve_live with req and "Counter" and {"n": 0} and render_count and bump\n'
            + 'show resp["status"]\n'
            + 'body is resp["body"]\n'
            'show body contains "serve-live"\n'
            'show body contains "EventSource"\n'
            'show body contains "/count/events"\n',
            "200\ntrue\ntrue\ntrue\n",
        )

    def test_parse_event_shapes(self):
        self.check(
            LIVE_HDR
            + 'show serve_parse_event with "{{\\"event\\": \\"bump\\"}}"\n'
            + 'show serve_parse_event with "  {{ \\"event\\" : \\"x\\" }}  "\n'
            + 'show serve_parse_event with "garbage"\n'
            + 'show serve_parse_event with "{{\\"nope\\": 1}}"\n'
            + 'show serve_parse_event with "{{\\"event\\": 42}}"\n'
            + 'show serve_parse_event with 42\n',
            "bump\nx\nnothing\nnothing\nnothing\nnothing\n",
        )

    def test_parse_event_escapes(self):
        self.check(
            LIVE_HDR
            + 'show serve_parse_event with "{{\\"event\\": \\"a\\\\nb\\"}}"\n'
            + 'show serve_parse_event with "{{\\"event\\": \\"say \\\\\\"hi\\\\\\"\\"}}"\n',
            "a\nb\nsay \"hi\"\n",
        )

    def test_post_garbage_is_400(self):
        self.check(
            LIVE_HDR + LIVE_SITE
            + 'req is {"path": "/c/events", "cookies": a new table, "body": "not json"}\n'
            + 'resp is serve_live_post with req\n'
            + 'show resp["status"]\n'
            + 'show resp["body"]\n',
            '400\n{"error": "that event was not JSON."}\n',
        )

    def test_post_without_stream_is_410(self):
        self.check(
            LIVE_HDR + LIVE_SITE
            + 'req is {"path": "/c/events", "cookies": a new table, "body": "{{\\"event\\": \\"bump\\"}}"}\n'
            + 'resp is serve_live_post with req\n'
            + 'show resp["status"]\n'
            + 'show resp["body"]\n',
            '410\n{"error": "the live view is gone; reload the page."}\n',
        )

    def test_stream_without_ctx_is_410(self):
        self.check(
            LIVE_HDR + LIVE_SITE
            + 'req is {"path": "/c/events", "cookies": a new table}\n'
            + 'resp is serve_live_stream with req\n'
            + 'show resp["status"]\n',
            "410\n",
        )


class ThreeTest(ServeCase):
    """threejs package: spec section 6 boundary table (rows 21-30) plus
    a golden script and page."""

    def test_box_needs_positive_number(self):
        self.check_fails(
            THREE_HDR + 'three_box with "big"\n',
            'three_box needs a number above 0, but this is "big".',
        )

    def test_sphere_rejects_negative(self):
        self.check_fails(
            THREE_HDR + 'three_sphere with -1\n',
            "three_sphere needs a number above 0, but this is -1.",
        )

    def test_material_rejects_empty(self):
        self.check_fails(
            THREE_HDR + 'three_material with ""\n',
            "three_material needs a color name, but it is empty.",
        )

    def test_material_rejects_injection(self):
        self.check_fails(
            THREE_HDR + 'three_material with "red;alert(1)"\n',
            '"red;alert(1)" is not a safe color. Use letters, digits, and "#".',
        )

    def test_material_rejects_nontext(self):
        self.check_fails(
            THREE_HDR + 'three_material with 42\n',
            "three_material needs a color name, but this is 42.",
        )

    def test_bad_mesh_name(self):
        self.check_fails(
            THREE_HDR + 'scene is three_scene\n'
            'three_add_mesh with scene and "9box" and "g" and "m"\n',
            '"9box" is not a valid object name. Use letters, numbers, and underscores, starting with a letter.',
        )

    def test_bad_light_kind(self):
        self.check_fails(
            THREE_HDR + 'scene is three_scene\n'
            'three_light with scene and "moon"\n',
            '"moon" is not a light kind. Use "sun" or "soft".',
        )

    def test_spin_missing_mesh(self):
        self.check_fails(
            THREE_HDR + 'scene is three_scene\n'
            'three_spin with scene and "box"\n',
            'there is no mesh called "box" in this scene.',
        )

    def test_script_needs_camera(self):
        self.check_fails(
            THREE_HDR + 'scene is three_scene\n'
            'three_script with scene\n',
            "a scene needs a camera before it can be rendered. Call three_camera_at first.",
        )

    def test_camera_needs_numbers(self):
        self.check_fails(
            THREE_HDR + 'scene is three_scene\n'
            'three_camera_at with scene and 0 and "high" and 6\n',
            "camera positions have to be numbers, but one is text.",
        )

    def test_script_golden(self):
        self.check(
            THREE_HDR + 'scene is three_scene\n'
            'three_camera_at with scene and 0 and 1 and 6\n'
            'three_light with scene and "sun"\n'
            'three_light with scene and "soft"\n'
            'box is three_box with 2\n'
            'mat is three_material with "red"\n'
            'three_add_mesh with scene and "box" and box and mat\n'
            'three_spin with scene and "box"\n'
            'show three_script with scene\n',
            "import * as THREE from 'three';\n"
            "const scene = new THREE.Scene();\n"
            "const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);\n"
            "camera.position.set(0, 1, 6);\n"
            "const sun = new THREE.DirectionalLight(0xffffff, 1); sun.position.set(5, 10, 7); scene.add(sun);\n"
            "scene.add(new THREE.AmbientLight(0xffffff, 0.6));\n"
            'const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: "red" }));\n'
            "scene.add(box);\n"
            "const renderer = new THREE.WebGLRenderer({ antialias: true });\n"
            "renderer.setSize(window.innerWidth, window.innerHeight);\n"
            'document.getElementById("scene").appendChild(renderer.domElement);\n'
            "function animate() { requestAnimationFrame(animate); box.rotation.x += 0.01; box.rotation.y += 0.01; renderer.render(scene, camera); } animate();\n",
        )

    def test_page_golden(self):
        self.check(
            THREE_HDR + 'scene is three_scene\n'
            'three_camera_at with scene and 0 and 1 and 6\n'
            'show three_page with "Spin <b>" and scene\n',
            "<!DOCTYPE html>\n"
            '<html lang="en">\n'
            "<head>\n"
            '<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            "<title>Spin &lt;b&gt;</title>\n"
            '<script type="importmap">\n'
            '{"imports": {"three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}\n'
            "</script>\n"
            "</head>\n"
            "<body>\n"
            '<div id="scene" style="width: 100vw; height: 100vh; margin: 0;"></div>\n'
            '<script type="module">\n'
            "import * as THREE from 'three';\n"
            "const scene = new THREE.Scene();\n"
            "const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);\n"
            "camera.position.set(0, 1, 6);\n"
            "const renderer = new THREE.WebGLRenderer({ antialias: true });\n"
            "renderer.setSize(window.innerWidth, window.innerHeight);\n"
            'document.getElementById("scene").appendChild(renderer.domElement);\n'
            "function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); } animate();\n"
            "</script>\n"
            "</body>\n"
            "</html>\n\n",
        )

    def test_serve_scene_page(self):
        self.check(
            SCENE_HDR + LIVE_SITE
            + 'scene is three_scene\n'
            + 'three_camera_at with scene and 0 and 1 and 6\n'
            + 'resp is serve_scene with "Spin" and scene\n'
            + 'show resp["status"]\n'
            + 'body is resp["body"]\n'
            'show body contains "importmap"\n'
            'show body contains "three.module.js"\n'
            'show body contains "<title>Spin</title>"\n',
            "200\ntrue\ntrue\ntrue\n",
        )


class LiveSseTest(LiveTest):
    """End-to-end SSE: page, stream, bump, 400, 410, on both interpreters
    (spec v3.0 section 10). The POST lands while the stream is open:
    that is the section 5.2 contract."""

    SSE_APP = """bring in "jweb"
bring in "sitegen"
bring in "js"
bring in "serve"

serve_site with "Counter" and "https://counter.example" and "v1.0.0"

to render_count with state
    give back "<p>count is " + (text of state["n"]) + "</p>"

to bump with state and event
    state["n"] is state["n"] + 1
    give back render_count with state

to counter_page with request
    give back serve_live with request and "Counter" and {"n": 0} and render_count and bump

serve_route with "GET /count" and counter_page
serve_start with {PORT}
"""

    def raw_cookie(self, port, method, path, cookie, body=b""):
        s = socket.create_connection(("127.0.0.1", port), timeout=15)
        try:
            head = (
                f"{method} {path} HTTP/1.1\r\nHost: x\r\n"
                f"Cookie: {cookie}\r\n"
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

    def read_frame(self, f):
        lines = []
        while True:
            line = f.readline().decode()
            if line in ("", "\n", "\r\n"):
                break
            lines.append(line)
        return "".join(lines)

    def live_sse(self, walker):
        port = self.free_port()
        tmp, proc = self.start_server(
            self.SSE_APP.replace("{PORT}", str(port)), walker
        )
        try:
            self.wait_up(port, proc)
            get = self.raw(port, "GET", "/count")
            head, _, body = get.partition(b"\r\n\r\n")
            header = head.decode()
            self.assertIn("200", header.split("\r\n")[0])
            self.assertIn("SameSite=Lax", header, "session cookie is Lax (spec 9)")
            self.assertIn(b'id="serve-live"', body)
            self.assertIn(b"EventSource", body)
            m = re.search(r"jesun_session=([0-9a-f]+)", header)
            self.assertTrue(m, "page sets the session cookie")
            cookie = "jesun_session=" + m.group(1)

            s = socket.create_connection(("127.0.0.1", port), timeout=15)
            try:
                s.sendall(
                    f"GET /count/events HTTP/1.1\r\nHost: x\r\n"
                    f"Cookie: {cookie}\r\nConnection: keep-alive\r\n\r\n".encode()
                )
                f = s.makefile("rb")
                status = f.readline().decode()
                self.assertIn("200", status)
                headers = {}
                while True:
                    line = f.readline().decode().strip()
                    if not line:
                        break
                    k, _, v = line.partition(":")
                    headers[k.strip().lower()] = v.strip()
                self.assertEqual(headers.get("content-type"), "text/event-stream")
                frame1 = self.read_frame(f)
                self.assertIn("event: render", frame1)
                self.assertIn("<p>count is 0</p>", frame1)

                post = self.raw_cookie(
                    port, "POST", "/count/events", cookie, b'{"event": "bump"}'
                )
                self.assertIn(b'"ok": true', post.partition(b"\r\n\r\n")[2])
                frame2 = self.read_frame(f)
                self.assertIn("event: render", frame2)
                self.assertIn("<p>count is 1</p>", frame2)

                bad = self.raw_cookie(
                    port, "POST", "/count/events", cookie, b"not json"
                )
                self.assertTrue(bad.startswith(b"HTTP/1.1 400"))
            finally:
                s.close()

            gone = self.raw(port, "GET", "/count/events")
            self.assertTrue(gone.startswith(b"HTTP/1.1 410"))
        finally:
            self.stop(tmp, proc)

    def test_live_sse_bootstrap(self):
        self.live_sse(False)

    def test_live_sse_walker(self):
        self.live_sse(True)


class FenceTest(ServeCase):
    """v3.0 M4: the playground fence (spec section 9).

    serve_run_fenced runs untrusted source in a child process: 5s
    timeout, sandbox cwd, 64 KiB output cap, unshare -n network cut
    where the host allows it. Every case is differential
    (bootstrap + self-hosted walker must agree byte for byte); the
    child is the bootstrap runtime on both legs because sys.argv[0]
    is jesun.py either way.
    """

    FENCE_HDR = 'bring in "jweb"\nbring in "sitegen"\nbring in "serve"\n'

    def test_fence_ok(self):
        # net_isolated must agree with the module-level unshare probe
        src = (
            self.FENCE_HDR
            + 'r is serve_run_fenced with "show 6 * 7"\n'
            + 'show r["ok"]\n'
            + 'show r["output"]\n'
            + 'show r["timed_out"]\n'
            + 'a is r["net_isolated"]\n'
            + 'b is serve_fence_unshare\n'
            + 'if a is b then\n'
            + '    show "consistent"\n'
            + 'otherwise\n'
            + '    show "INCONSISTENT"\n'
        )
        self.check(src, "true\n42\n\nfalse\nconsistent\n")

    def test_fence_error_plain_english(self):
        src = (
            self.FENCE_HDR
            + 'r is serve_run_fenced with "show nosuchname"\n'
            + 'show r["ok"]\n'
            + 'show r["output"]\n'
            + 'show r["timed_out"]\n'
        )
        self.check(
            src, 'false\nLine 1: I do not know the word "nosuchname".\n\nfalse\n'
        )

    def test_fence_timeout(self):
        src = (
            self.FENCE_HDR
            + 'r is serve_run_fenced with "import time as tmod\\ntmod.sleep(30)"\n'
            + 'show r["ok"]\n'
            + 'show r["timed_out"]\n'
            + 'show r["output"]\n'
        )
        self.check(
            src,
            "false\ntrue\n"
            "that program took too long; the fence stopped it after 5 seconds.\n",
        )

    def test_fence_output_cap(self):
        child = (
            '"s is \\"\\"\\nrepeat 7000 times\\n'
            '    s is s + \\"0123456789\\"\\nshow s"'
        )
        src = (
            self.FENCE_HDR
            + "r is serve_run_fenced with " + child + "\n"
            + 'show r["ok"]\n'
            + 'show length of r["output"]\n'
            + 'show (r["output"]) contains "(output cut at 64 KiB)"\n'
        )
        # 70001 chars of output: capped at 65536 + the 23-char cut note.
        self.check(src, "true\n65559\ntrue\n")

    def test_fence_sandbox_cwd(self):
        src = (
            self.FENCE_HDR
            + 'r is serve_run_fenced with "import os as osmod\\nshow osmod.getcwd()"\n'
            + 'show (r["output"]) contains "jc_fence_"\n'
        )
        self.check(src, "true\n")

    def test_fence_net_isolation(self):
        child = (
            '"import socket as smod\\nimport builtins as bmod\\n'
            'p is bmod.eval(\\"lambda: __import__(\\\'socket\\\').'
            'create_connection((\\\'8.8.8.8\\\', 53), timeout=3)\\")\\n'
            'r is attempt p()\\nshow r[\\"ok\\"]"'
        )
        src = (
            self.FENCE_HDR
            + "f is serve_run_fenced with " + child + "\n"
            + "net_ok is true\n"
            + 'if f["net_isolated"] then\n'
            + '    if f["output"] is "false\\n" then\n'
            + "        net_ok is true\n"
            + "    otherwise\n"
            + "        net_ok is false\n"
            + "show net_ok\n"
        )
        # Where unshare works the child cannot dial out; elsewhere the
        # fence reports net_isolated false and the check is vacuous.
        self.check(src, "true\n")

    def test_run_route_guards(self):
        # The route's own guards, called directly: empty body is 400,
        # a body over 1 MiB is 413. (Over HTTP, jweb's too_big fires
        # first; this exercises the route branch itself.)
        src = (
            self.FENCE_HDR
            + 'import builtins as tbmod\n'
            + 'big is tbmod.eval("chr(120) * 1048577")\n'
            + 'r400 is serve_run_route with {"method": "POST", "path": "/run", "body": ""}\n'
            + 'show r400["status"]\n'
            + 'r413 is serve_run_route with {"method": "POST", "path": "/run", "body": big}\n'
            + 'show r413["status"]\n'
            + 'show (r413["body"]) contains "over 1 MiB"\n'
        )
        self.check(src, "400\n413\ntrue\n")

    def test_fence_rejects(self):
        src = (
            self.FENCE_HDR
            + 'a is attempt serve_run_fenced with ""\n'
            + 'show a["ok"]\n'
            + 'show a["error"]\n'
            + 'b is attempt serve_run_fenced with 42\n'
            + 'show b["ok"]\n'
            + 'show b["error"]\n'
        )
        self.check(
            src,
            "false\n"
            'Line 0: in the "serve" package: '
            "fenced source is empty; there is nothing to run.\n"
            "false\n"
            'Line 0: in the "serve" package: '
            "fenced source has to be text, but this is 42.\n",
        )


class LiveRunTest(LiveTest):
    """POST /run live: source in, fenced output out as JSON."""

    RUN_APP = (
        'bring in "jweb"\nbring in "sitegen"\nbring in "serve"\n'
        'serve_site with "Run" and "https://run.example" and "v1.0.0"\n'
        "serve_run_api\nserve_start with {PORT}\n"
    )

    def live_run(self, walker):
        port = self.free_port()
        tmp, proc = self.start_server(
            self.RUN_APP.replace("{PORT}", str(port)), walker
        )
        try:
            self.wait_up(port, proc)
            get = self.raw(port, "GET", "/run")
            head, _, body = get.partition(b"\r\n\r\n")
            self.assertIn(b"200", head.split(b"\r\n")[0])
            self.assertIn(b"Run Jesun.Code in the fence", body)

            post = self.raw(port, "POST", "/run", b"show 40 + 2")
            head, _, pbody = post.partition(b"\r\n\r\n")
            self.assertIn(b"200", head.split(b"\r\n")[0])
            data = json.loads(pbody.decode())
            self.assertTrue(data["ok"])
            self.assertEqual(data["output"], "42\n")
            self.assertFalse(data["timed_out"])
            self.assertIn("net_isolated", data)

            post2 = self.raw(port, "POST", "/run", b"show nosuchname")
            data2 = json.loads(post2.partition(b"\r\n\r\n")[2].decode())
            self.assertFalse(data2["ok"])
            self.assertIn("I do not know the word", data2["output"])

            post3 = self.raw(port, "POST", "/run", b"")
            self.assertTrue(post3.startswith(b"HTTP/1.1 400"))

            # No live >1 MiB check here: jweb answers 413 before
            # routing (covered by tests/test_jweb.py), and a client
            # racing that early close sees RST instead of the status.
            # The route's own 1 MiB guard is tested directly below.
        finally:
            self.stop(tmp, proc)

    def test_live_run_bootstrap(self):
        self.live_run(False)

    def test_live_run_walker(self):
        self.live_run(True)
