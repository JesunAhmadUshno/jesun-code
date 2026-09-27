"""Differential tests for the jweb package (spec v1.2 section 3).

A real jweb server runs on each interpreter (bootstrap and self-hosted
walker) as a subprocess on a loopback port; a raw-socket client exercises
routes, params, query strings, JSON, sessions, 404/500/413, and static
files. The normalized responses must be identical on both sides.
"""

import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from selfhost_harness import JESUN_PY, JESUN_JC, REPO  # noqa: E402

APP_SRC = """\
bring in "jweb"

to hello with request
    give back ok with "<h1>hello from jweb</h1>"

to echo_name with request
    give back json_response with {"name": request["params"]["name"], "q": request["query"]["q"]}

to kaboom with request
    fail with "deliberate boom"

to visit_count with request
    sess is session_of with request
    if not (sess contains "n") then
        sess["n"] is 0
    sess["n"] is sess["n"] + 1
    give back ok with "visits: " + text of sess["n"]

add_route with "GET /hello" and hello
add_route with "GET /users/:name" and echo_name
add_route with "GET /boom" and kaboom
add_route with "GET /visits" and visit_count
serve_files with "webroot" and "/static"

serve with 0
"""

SID_RE = re.compile(r"jesun_session=[0-9a-f]+")


def normalize(raw):
    return SID_RE.sub("jesun_session=SID", raw)


def raw_request(port, path, headers="", method="GET", body="", timeout=60):
    s = socket.create_connection(("127.0.0.1", port), timeout=timeout)
    try:
        head = (
            "%s %s HTTP/1.1\r\nHost: test\r\nConnection: close\r\n%s\r\n"
            % (method, path, headers)
        )
        s.sendall(head.encode("utf-8") + body.encode("utf-8"))
        data = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
    finally:
        s.close()
    return data.decode("utf-8", errors="replace")


def battery(port):
    """Run the full client battery; returns normalized (status, body) pairs."""
    out = []

    def get(path, headers="", method="GET", body=""):
        txt = raw_request(port, path, headers, method, body)
        head, _, body_text = txt.partition("\r\n\r\n")
        status = head.split("\r\n")[0]
        return (status, body_text, head)

    def norm(triple):
        return tuple(normalize(x) for x in triple)

    out.append(("hello",) + norm(get("/hello")[:2]))
    out.append(("params",) + norm(get("/users/jesun?q=hi")[:2]))
    out.append(("missing",) + norm(get("/nope")[:2]))
    out.append(("boom",) + norm(get("/boom")[:2]))
    out.append(("static",) + norm(get("/static/hi.html")[:2]))
    out.append(("traversal",) + norm(get("/static/../app.jc")[:2]))
    out.append(("static404",) + norm(get("/static/gone.html")[:2]))
    big = get("/big", "Content-Length: 2000000\r\n", "POST", "x" * 64)
    out.append(("toobig",) + norm(big[:2]))

    # Session round trip: first visit sets the cookie, later visits reuse it.
    s1, b1, h1 = get("/visits")
    m = re.search(r"(?im)^set-cookie:\s*([^\r;]+)", h1)
    assert m, "first /visits response sets a session cookie"
    cookie = "Cookie: %s\r\n" % m.group(1)
    s2, b2 = get("/visits", cookie)[:2]
    s3, b3 = get("/visits", cookie)[:2]
    out.append(("visit1",) + norm((s1, b1)))
    out.append(("visit2",) + norm((s2, b2)))
    out.append(("visit3",) + norm((s3, b3)))
    return out


class JWebServer(unittest.TestCase):
    """One server per interpreter; the batteries must agree exactly."""

    def _seed_home(self, home):
        dest = os.path.join(home, "packages", "github.com", "u", "jweb")
        os.makedirs(dest, exist_ok=True)
        shutil.copy(
            os.path.join(REPO, "packages", "jweb", "jweb.jc"),
            os.path.join(dest, "jweb.jc"),
        )

    def _start(self, cmd, home, cwd):
        env = dict(os.environ)
        env["JESUN_CODE_HOME"] = home
        proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        port = None
        deadline = time.time() + 180
        buf = ""
        while time.time() < deadline:
            chunk = proc.stdout.read(1)
            if not chunk:
                break
            buf += chunk
            if "\n" in buf:
                line, buf = buf.split("\n", 1)
                m = re.search(r"listening on 127\.0\.0\.1:(\d+)", line)
                if m:
                    port = int(m.group(1))
                    break
        self.assertIsNotNone(port, "server never printed its listening port")
        # The port is listening once the line is printed.
        return proc, port

    def _run_side(self, interp):
        home = tempfile.mkdtemp(prefix="jweb_home_")
        cwd = tempfile.mkdtemp(prefix="jweb_cwd_")
        self.addCleanup(shutil.rmtree, home, ignore_errors=True)
        self.addCleanup(shutil.rmtree, cwd, ignore_errors=True)
        self._seed_home(home)
        webroot = os.path.join(cwd, "webroot")
        os.makedirs(webroot)
        with open(os.path.join(webroot, "hi.html"), "w") as fh:
            fh.write("<h1>static hi</h1>\n")
        with open(os.path.join(cwd, "app.jc"), "w") as fh:
            fh.write(APP_SRC)
        if interp == "boot":
            cmd = [sys.executable, JESUN_PY, "app.jc"]
        else:
            cmd = [sys.executable, JESUN_PY, JESUN_JC, "app.jc"]
        proc, port = self._start(cmd, home, cwd)

        def stop_server():
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()

        self.addCleanup(stop_server)
        try:
            return battery(port)
        finally:
            stop_server()

    def test_differential_battery(self):
        boot = self._run_side("boot")
        walker = self._run_side("walker")
        self.assertEqual(walker, boot)

    def test_statuses_and_shapes(self):
        rows = dict((r[0], r[1:]) for r in self._run_side("boot"))
        self.assertEqual(rows["hello"][0], "HTTP/1.1 200 OK")
        self.assertIn("hello from jweb", rows["hello"][1])
        self.assertEqual(rows["params"][0], "HTTP/1.1 200 OK")
        self.assertIn('"name":"jesun"', rows["params"][1])
        self.assertIn('"q":"hi"', rows["params"][1])
        self.assertEqual(rows["missing"][0], "HTTP/1.1 404 Not Found")
        self.assertIn("Nothing lives at /nope", rows["missing"][1])
        self.assertEqual(rows["boom"][0], "HTTP/1.1 500 Internal Server Error")
        self.assertNotIn("deliberate boom", rows["boom"][1])
        self.assertEqual(rows["static"][0], "HTTP/1.1 200 OK")
        self.assertIn("static hi", rows["static"][1])
        self.assertEqual(rows["traversal"][0], "HTTP/1.1 403 Forbidden")
        self.assertEqual(rows["static404"][0], "HTTP/1.1 404 Not Found")
        self.assertEqual(rows["toobig"][0], "HTTP/1.1 413 Content Too Large")
        self.assertEqual(rows["visit1"][1], "visits: 1")
        self.assertEqual(rows["visit2"][1], "visits: 2")
        self.assertEqual(rows["visit3"][1], "visits: 3")


if __name__ == "__main__":
    unittest.main()
