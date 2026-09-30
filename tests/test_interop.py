"""v1.4 interop milestone: differential tests for the wordpress package.

Every case runs through the bootstrap interpreter AND the self-hosted
Jesun.Code walker; the outputs must match byte for byte. The wordpress
cases run against a fixture HTTP server on 127.0.0.1 (ephemeral port,
started once per test class); no live network in the suite.
"""

import base64
import json
import os
import socket
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from selfhost_harness import InlineSandbox  # noqa: E402

POSTS = [
    {
        "id": 7,
        "date": "2026-09-30T10:00:00",
        "slug": "hello-code",
        "status": "publish",
        "link": "http://127.0.0.1/x/?p=7",
        "title": {"rendered": "Hello from Jesun.Code"},
        "content": {"rendered": "<p>written in sentences</p>"},
    },
    {
        "id": 8,
        "date": "2026-09-29T10:00:00",
        "slug": "second-post",
        "status": "draft",
        "link": "http://127.0.0.1/x/?p=8",
        "title": {"rendered": "Second post"},
        "content": {"rendered": "<p>more</p>"},
    },
]

GOOD_AUTH = "Basic " + base64.b64encode(b"jesun:secret").decode("ascii")


class WPHandler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_raw(self, code, raw, ctype="text/plain"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.startswith("/wp-json/wp/v2/posts/7"):
            self._send(200, POSTS[0])
        elif self.path.startswith("/wp-json/wp/v2/posts/999"):
            self._send(
                404,
                {
                    "code": "rest_post_invalid_id",
                    "message": "Invalid post ID.",
                    "data": {"status": 404},
                },
            )
        elif self.path.startswith("/wp-json/wp/v2/posts"):
            self._send(200, POSTS)
        elif self.path.startswith("/wp-json/wp/v2/search"):
            self._send(
                200,
                [
                    {
                        "id": 7,
                        "title": "Hello from Jesun.Code",
                        "url": "http://127.0.0.1/x/?p=7",
                        "type": "post",
                        "subtype": "post",
                    }
                ],
            )
        elif self.path.startswith("/wp-json/wp/v2/comments"):
            self._send(
                200,
                [
                    {
                        "id": 3,
                        "date": "2026-09-30T11:00:00",
                        "author_name": "Ada",
                        "content": {"rendered": "Nice work."},
                    }
                ],
            )
        elif self.path.startswith("/wp-json/wp/v2/badjson"):
            self._send_raw(200, b"this is not json {")
        else:
            self._send(
                404,
                {
                    "code": "rest_no_route",
                    "message": "No route was found.",
                    "data": {"status": 404},
                },
            )

    def do_POST(self):
        if self.path == "/wp-json/wp/v2/posts":
            if self.headers.get("Authorization") != GOOD_AUTH:
                self._send(
                    401,
                    {
                        "code": "rest_forbidden",
                        "message": "Sorry, you are not allowed to do that.",
                        "data": {"status": 401},
                    },
                )
                return
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
            self._send(
                201,
                {
                    "id": 42,
                    "date": "2026-09-30T12:00:00",
                    "slug": "draft-from-code",
                    "status": payload.get("status", "draft"),
                    "link": "http://127.0.0.1/x/?p=42",
                    "title": {"rendered": payload.get("title", "")},
                    "content": {"rendered": payload.get("content", "")},
                },
            )
        else:
            self._send(
                404,
                {
                    "code": "rest_no_route",
                    "message": "No route was found.",
                    "data": {"status": 404},
                },
            )

    def log_message(self, *args):
        pass


def free_port():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


class WordpressTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), WPHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever)
        cls.thread.daemon = True
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.port}/wp-json"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join()

    def check(self, src, expected):
        box = InlineSandbox()
        try:
            boot, selfhost = box.run(src)
        finally:
            box.close()
        self.assertEqual(
            selfhost,
            boot,
            f"differ:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )
        self.assertEqual(boot[0], 0, f"bootstrap failed: {boot!r}")
        self.assertEqual(boot[1], expected)

    def site_src(self, auth='"jesun" and "secret"', base=None):
        return (
            'bring in "wordpress"\n'
            f'site is wp_site with "{base or self.base}" and {auth}\n'
        )

    # ---------- site handles ----------

    def test_wp_site_strips_slash_and_builds_auth(self):
        self.check(
            self.site_src(base=self.base + "/") + 'show site["base"]\nshow site["auth"]\n',
            self.base + "\n" + GOOD_AUTH + "\n",
        )

    def test_wp_site_public_has_no_auth(self):
        self.check(
            self.site_src(auth="nothing and nothing") + 'show site["auth"]\n',
            "nothing\n",
        )

    def test_wp_site_bad_base(self):
        self.check(
            'bring in "wordpress"\n'
            'r is attempt wp_site with 5 and nothing and nothing\n'
            'show r["ok"]\nshow r["error"]\n',
            "false\n"
            'Line 0: in the "wordpress" package: '
            "the site address has to be text.\n",
        )

    # ---------- posts ----------

    def test_wp_posts_list(self):
        self.check(
            self.site_src()
            + "posts is wp_posts with site and 5\n"
            'show posts[0]["title"]\n'
            'show posts[1]["status"]\n'
            "show length of posts\n",
            "Hello from Jesun.Code\ndraft\n2\n",
        )

    def test_wp_posts_default_count(self):
        self.check(
            self.site_src() + "posts is wp_posts with site and nothing\nshow length of posts\n",
            "2\n",
        )

    def test_wp_posts_bad_count(self):
        self.check(
            self.site_src()
            + 'r is attempt wp_posts with site and 0\n'
            'show r["ok"]\nshow r["error"]\n',
            "false\n"
            'Line 0: in the "wordpress" package: '
            "the post count has to be a whole number from 1 to 100.\n",
        )

    def test_wp_post_one(self):
        self.check(
            self.site_src()
            + "p is wp_post with site and 7\n"
            'show p["title"]\nshow p["slug"]\nshow p["link"]\n',
            "Hello from Jesun.Code\nhello-code\nhttp://127.0.0.1/x/?p=7\n",
        )

    def test_wp_post_missing(self):
        self.check(
            self.site_src()
            + 'r is attempt wp_post with site and 999\n'
            'show r["ok"]\nshow r["error"]\n',
            "false\n"
            'Line 0: in the "wordpress" package: the site has no '
            '"/wp/v2/posts/999?_fields=id,date,slug,status,link,title,content" '
            "(nothing there).\n",
        )

    # ---------- search and comments ----------

    def test_wp_search(self):
        self.check(
            self.site_src()
            + 'hits is wp_search with site and "hello world"\n'
            'show hits[0]["title"]\nshow hits[0]["kind"]\nshow hits[0]["url"]\n',
            "Hello from Jesun.Code\npost\nhttp://127.0.0.1/x/?p=7\n",
        )

    def test_wp_comments(self):
        self.check(
            self.site_src()
            + "cs is wp_comments with site and 7\n"
            'show cs[0]["author"]\nshow cs[0]["content"]\n',
            "Ada\nNice work.\n",
        )

    # ---------- create ----------

    def test_wp_create_post(self):
        self.check(
            self.site_src()
            + 'made is wp_create_post with site and "Draft from code" and "<p>hi</p>"\n'
            'show made["id"]\nshow made["status"]\nshow made["link"]\n',
            "42\ndraft\nhttp://127.0.0.1/x/?p=42\n",
        )

    def test_wp_create_post_bad_auth(self):
        self.check(
            self.site_src(auth='"jesun" and "wrong"')
            + 'r is attempt wp_create_post with site and "T" and "C"\n'
            'show r["ok"]\nshow r["error"]\n',
            "false\n"
            'Line 0: in the "wordpress" package: '
            "the site refused the login. "
            "Check the user name and application password.\n",
        )

    def test_wp_create_post_no_login(self):
        self.check(
            self.site_src(auth="nothing and nothing")
            + 'r is attempt wp_create_post with site and "T" and "C"\n'
            'show r["ok"]\nshow r["error"]\n',
            "false\n"
            'Line 0: in the "wordpress" package: '
            "creating a post needs a login. "
            "Connect with a user name and an application password.\n",
        )

    # ---------- failure shapes ----------

    def test_wp_unreachable(self):
        port = free_port()
        self.check(
            self.site_src(base=f"http://127.0.0.1:{port}/wp-json")
            + 'r is attempt wp_posts with site and 5\n'
            'show r["ok"]\nshow r["error"]\n',
            "false\n"
            'Line 0: in the "wordpress" package: '
            f'I could not reach the WordPress site at "http://127.0.0.1:{port}/wp-json".\n',
        )

    def test_wp_bad_json(self):
        self.check(
            self.site_src()
            + 'r is attempt wp_get_json with site and "/wp/v2/badjson"\n'
            'show r["ok"]\nshow r["error"]\n',
            "false\n"
            'Line 0: in the "wordpress" package: the site answered '
            '"/wp/v2/badjson" with text I cannot read as JSON.\n',
        )


if __name__ == "__main__":
    unittest.main()



class ReactTest(unittest.TestCase):
    """Differential tests for packages/react/react.jc (spec v1.4 section 2).

    Pure builders: no fixture server needed. Each case runs on both
    interpreter legs; outputs must be byte-identical and exactly equal
    to the expectation. JSX braces in .jc string literals are written
    doubled ({{ }}) because { } is the interpolation syntax.
    """

    def setUp(self):
        self.box = InlineSandbox()

    def tearDown(self):
        self.box.close()

    def react_src(self):
        return 'bring in "react"\n'

    def check(self, src, expected):
        boot, walker = self.box.run(self.react_src() + src)
        self.assertEqual(
            walker,
            boot,
            f"differ:\nbootstrap={boot!r}\nwalker={walker!r}",
        )
        self.assertEqual(boot[0], 0, f"bootstrap failed: {boot!r}")
        self.assertEqual(boot[1], expected)

    def test_jsx_escape(self):
        self.check(
            'show jsx_escape with "<b>&\\"q\\""\n',
            "&lt;b&gt;&amp;&quot;q&quot;\n",
        )

    def test_jsx_props(self):
        self.check(
            'show jsx_props with {"className": "card", "hidden": true, "tabIndex": 1}\n',
            ' className="card" hidden="true" tabIndex="1"\n',
        )

    def test_jsx_element_void(self):
        self.check(
            'show jsx_element with "br" and nothing and nothing\n',
            "<br />\n",
        )

    def test_jsx_element_children(self):
        self.check(
            'show jsx_element with "p" and {"className": "lede"} and "Hello"\n',
            '<p className="lede">Hello</p>\n',
        )

    def test_component_card(self):
        self.check(
            'card is component with "Card" and ["title", "body"] and '
            '"<article className=\\"card\\"><h2>{{title}}</h2><p>{{body}}</p></article>"\n'
            "show card\n",
            "function Card({ title, body }) {\n"
            "  return (\n"
            '    <article className="card"><h2>{title}</h2><p>{body}</p></article>\n'
            "  );\n"
            "}\n",
        )

    def test_component_bad_name(self):
        self.check(
            'r is attempt component with "card" and [] and "x"\n'
            'show r["ok"]\nshow r["error"]\n',
            "false\n"
            'Line 0: in the "react" package: "card" is not a valid component name.\n',
        )

    def test_state_hook(self):
        self.check(
            'show state_hook with "count" and 0\n',
            "const [count, setCount] = useState(0);\n",
        )

    def test_state_hook_text_initial(self):
        self.check(
            'show state_hook with "name" and "Ada"\n',
            'const [name, setName] = useState("Ada");\n',
        )

    def test_scaffold_app(self):
        boot, walker = self.box.run(
            self.react_src()
            + 'paths is scaffold_app with "blog-thing"\n'
            "show paths\n"
            'read file "./blog-thing/src/App.jsx" giving app\n'
            "show app\n"
        )
        expected = (
            "[./blog-thing/package.json, ./blog-thing/index.html, "
            "./blog-thing/src/main.jsx, ./blog-thing/src/App.jsx]\n"
            "export default function App() {\n"
            "  return (\n"
            "    <main>\n"
            "      <h1>blog-thing</h1>\n"
            "      <p>Built with Jesun.Code.</p>\n"
            "    </main>\n"
            "  )\n"
            "}\n"
            "\n"
        )
        self.assertEqual(walker, boot, f"differ:\nbootstrap={boot!r}\nwalker={walker!r}")
        self.assertEqual(boot[0], 0, f"bootstrap failed: {boot!r}")
        self.assertEqual(boot[1], expected)

    def test_scaffold_app_bad_name(self):
        self.check(
            'r is attempt scaffold_app with "BlogThing"\n'
            'show r["ok"]\nshow r["error"]\n',
            "false\n"
            'Line 0: in the "react" package: "BlogThing" is not a valid app name. '
            "Use lowercase letters, numbers, and dashes.\n",
        )

class PhpTest(unittest.TestCase):
    """Differential tests for packages/php/php.jc (spec v1.4 section 3)."""

    def setUp(self):
        self.box = InlineSandbox()

    def tearDown(self):
        self.box.close()

    def php_src(self):
        return 'bring in "php"\n'

    def check(self, src, expected):
        boot, walker = self.box.run(self.php_src() + src)
        self.assertEqual(
            walker,
            boot,
            f"differ:\nbootstrap={boot!r}\nwalker={walker!r}",
        )
        self.assertEqual(boot[0], 0, f"bootstrap failed: {boot!r}")
        self.assertEqual(boot[1], expected)

    def test_php_escape(self):
        self.check(
            'show php_escape with "it\'s <b>"\n',
            "it&#039;s &lt;b&gt;\n",
        )

    def test_php_route(self):
        self.check(
            'show php_route with "get" and "/posts" and "PostController@index"\n',
            "Route::get('/posts', [PostController::class, 'index']);\n",
        )

    def test_php_route_uppercase_method(self):
        self.check(
            'show php_route with "POST" and "/posts" and "PostController@store"\n',
            "Route::post('/posts', [PostController::class, 'store']);\n",
        )

    def test_php_route_bad_method(self):
        self.check(
            'r is attempt php_route with "fetch" and "/x" and "C@m"\n'
            'show r["ok"]\nshow r["error"]\n',
            "false\n"
            'Line 0: in the "php" package: "fetch" is not a supported route method.\n',
        )

    def test_controller(self):
        self.check(
            'show controller with "PostController" and ["index", "show"]\n',
            "<?php\n"
            "\n"
            "class PostController extends Controller\n"
            "{\n"
            "    public function index()\n"
            "    {\n"
            "        // index\n"
            "    }\n"
            "\n"
            "    public function show()\n"
            "    {\n"
            "        // show\n"
            "    }\n"
            "}\n"
            "\n",
        )

    def test_controller_bad_name(self):
        self.check(
            'r is attempt controller with "postController" and []\n'
            'show r["ok"]\nshow r["error"]\n',
            "false\n"
            'Line 0: in the "php" package: "postController" is not a valid controller name.\n',
        )

    def test_blade_page(self):
        self.check(
            'show blade_page with "My Blog" and "<h1>Welcome</h1>"\n',
            "<x-layout>\n"
            '    <x-slot name="title">My Blog</x-slot>\n'
            "    <h1>Welcome</h1>\n"
            "</x-layout>\n",
        )

    def test_php_scaffold(self):
        boot, walker = self.box.run(
            self.php_src()
            + 'paths is php_scaffold with "my-blog"\n'
            "show paths\n"
            'read file "./my-blog/routes.php" giving routes\n'
            "show routes\n"
        )
        expected = (
            "[./my-blog/routes.php, ./my-blog/app/PostController.php, "
            "./my-blog/views/home.blade.php]\n"
            "<?php\n"
            "\n"
            "use App\\Http\\Controllers\\PostController;\n"
            "\n"
            "Route::get('/posts', [PostController::class, 'index']);\n"
            "\n"
        )
        self.assertEqual(walker, boot, f"differ:\nbootstrap={boot!r}\nwalker={walker!r}")
        self.assertEqual(boot[0], 0, f"bootstrap failed: {boot!r}")
        self.assertEqual(boot[1], expected)

    def test_php_scaffold_bad_name(self):
        self.check(
            'r is attempt php_scaffold with "MyBlog"\n'
            'show r["ok"]\nshow r["error"]\n',
            "false\n"
            'Line 0: in the "php" package: "MyBlog" is not a valid project name. '
            "Use lowercase letters, numbers, and dashes.\n",
        )
