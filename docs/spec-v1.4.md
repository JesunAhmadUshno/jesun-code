# Jesun.Code spec v1.4: interop packages (the world's stacks, in Jesun.Code)

Status: approved by the founder 2026-09-28 02:45 EDT ("Carry forward we
shouldn't be stopping now"). This supersedes the v1.3 maintenance
stand-down.

Founder's law: one language, all solutions. The three packages below
are written in Jesun.Code itself and resolved by `bring in`. The Python
bridge carries no domain logic at all: for `wordpress` it imports only
raw transport primitives (`urllib.request`, `base64`, `builtins`), the
same boundary the `sqlite` package drew in v1.2 (raw driver in, every
rule and every error message in Jesun.Code). `react` and `php` are pure text generation: the builders import
nothing and touch no driver. Only the two scaffolders import one raw
primitive (`os.makedirs`) to create folders. The
bridge never counts as the solution; for the builders it
is not even in the room.

Honest framing: interop packages run on the `jesun` interpreter
(bootstrap or self-hosted). `jesun build` native transpile support for
the bridge-touching parts is future work (see ROADMAP).

Fuzzer note: v1.4 adds no new syntax and no new keywords, so the
grammar fuzzers need no new shapes. Coverage comes from the
differential package suite (`tests/test_interop.py`): every case runs
through both interpreters via `InlineSandbox` and must agree byte for
byte. The wordpress cases run against a fixture HTTP server on
127.0.0.1 (ephemeral port, started by the test); no live network in the
suite.

Keyword-collision scan (standing lesson): the dotted bridge attributes
used are `urlopen`, `Request`, `b64encode`, `add_header`, `status`,
`decode`. `read` is a Jesun.Code keyword, so response bodies are read
through `bmod.getattr(response, "read")` (the `http` package
precedent). The `with`-call argument rule holds: demos bind call
results to variables before string building.

## 1. `wordpress`: the WordPress REST API client (`bring in "wordpress"`)

`packages/wordpress/wordpress.jc`. Talks to any WordPress site's REST
API (`/wp-json/wp/v2`). Authentication is Application Passwords
(Users > Profile > Application Passwords in wp-admin); the package
never sees wp-admin itself.

```jesun
bring in "wordpress"

site is wp_site with "https://example.com/wp-json" and "jesun" and "abcd efgh ijkl"
posts is wp_posts with site and 5
show posts[0]["title"]
note Hello from Jesun.Code

mine is wp_create_post with site and "Draft from code" and "<p>written in Jesun.Code</p>"
show mine["link"]
note https://example.com/?p=42
```

### 1.1 Functions

- `wp_site with base and user and password`: `base` must be text, else
  `Line 0: in the "wordpress" package: the site address has to be text.`
  A trailing `/` is stripped. Returns a table
  `{"base": base, "auth": "Basic <base64(user:password)>"}`; when user
  or password is `nothing`, `auth` is `nothing` (public read-only).
- `wp_get with site and path`: GETs `site["base"] + path` with the auth
  header when present, 10s timeout. Returns the body text. Failures are
  plain-English, tagged `in the "wordpress" package:`:
  - the site cannot be reached:
    `I could not reach the WordPress site at "<base>".`
  - HTTP 401: `the site refused the login. Check the user name and
    application password.`
  - HTTP 404: `the site has no "<path>" (nothing there).`
  - any other HTTP error:
    `the site answered with an error (HTTP <code>).`
  - the body is not JSON where JSON is expected:
    `the site answered "<path>" with text I cannot read as JSON.`
- `wp_posts with site and count`: GETs
  `/wp/v2/posts?per_page=<count>&_fields=...`. `count` is `nothing` for
  the default 10, otherwise a whole number 1-100, else
  `Line 0: in the "wordpress" package: the post count has to be a whole number from 1 to 100.` Returns a list of
  `{"id", "title", "slug", "status", "date", "link"}` with the
  `{"rendered": ...}` wrappers unwrapped.
- `wp_post with site and id`: one post by id; a missing id fails with
  the 404 shape above.
- `wp_search with site and text`: `/wp/v2/search?search=<text>` gives a
  list of `{"id", "title", "url", "kind"}` (`kind` is the WP `subtype`).
- `wp_comments with site and post`: `/wp/v2/comments?post=<id>` gives a
  list of `{"id", "author", "date", "content"}` (rendered unwrapped).
- `wp_create_post with site and title and content`: POSTs
  `/wp/v2/posts` with `{"title", "content", "status": "draft"}` as JSON
  and the auth header. Needs a login:
  `creating a post needs a login. Connect with a user name and an
  application password.` Returns `{"id", "link", "status"}`.

Status-code detection: the bridge raises on HTTP errors and the
interpreter turns that into `the python call failed: HTTP Error
<NNN>: ...`; the package reads the code out of that text with `split`
(the transport primitive cannot report codes any other way without
growing the bridge). A failure with no `HTTP Error` in it is the
unreachable shape.

### 1.2 Demo

`examples/wp_client_demo.jc`: connects to the fixture shape (or a real
site address given as `arguments[0]`), lists the latest 5 posts, and
prints one. Verified through the binary against the local fixture.

## 2. `react`: React/JSX builders and scaffolding (`bring in "react"`)

`packages/react/react.jc`. The builders are pure Jesun.Code with no imports; `scaffold_app` alone imports one raw primitive (`os.makedirs`) to create the app folders, because `write ... to file` requires the parent folder to exist (spec v0.4). Every emitted file is pure text built in Jesun.Code.

Brace rule: Jesun.Code string interpolation treats `{`...`}` as an expression, so literal JSX braces inside string literals are written doubled: `{{title}}` in source renders as `{title}`. A lone `}` needs no escape.
Emits React component code as text and scaffolds runnable Vite apps.

```jesun
bring in "react"

card is component with "Card" and ["title", "body"] and [
    jsx_element with "article" and {"className": "card"} and [
        jsx_element with "h2" and nothing and [jsx_text with "{title}"],
        jsx_element with "p" and nothing and [jsx_text with "{body}"]
    ]
]
show card
note function Card({ title, body }) {
note   return (
note     <article className="card"><h2>{title}</h2><p>{body}</p></article>
note   );
note }
```

### 2.1 Functions

- `jsx_escape with content`: escapes `&`, `<`, `>`, `"` for JSX text.
  Non-text fails:
  `Line 0: in the "react" package: jsx_escape needs text, but this is a number.`
- `jsx_props with props`: a table rendered as ` key="escaped"` pairs in
  insertion order (`nothing` gives `""`). Same kind rules as the `html`
  package's `attrs_text`.
- `jsx_element with tag and props and children`: `<tag props>children</tag>`.
  Tag must match `[A-Za-z][A-Za-z0-9]*`. `children` is text (raw, so
  builders compose) or a list of text (joined); `nothing` gives a
  self-closing `<tag props />`.
- `jsx_text with content`: escaped JSX text (for literal copy, not
  `{expressions}`).
- `component with name and props and body`: `name` must match
  `[A-Z][A-Za-z0-9]*`, else
  `Line 0: in the "react" package: "<name>" is not a valid component name.`
  `props` is a list of text; `body` is text or a list of text. Emits the
  function-component skeleton above.
- `state_hook with name and initial`: `const [name, setName] =
  useState(<json of initial>);` (`name` must be a valid identifier;
  `set` + capitalized).
- `scaffold_app with name`: writes a Vite skeleton under `./<name>/`
  (`package.json`, `index.html`, `src/main.jsx`, `src/App.jsx`) using
  file I/O (the working-folder sandbox applies). Returns the list of
  written paths. `name` must match `[a-z][a-z0-9-]*`.

### 2.2 Demo

`examples/react_demo.jc`: builds the `Card` component above and
scaffolds `demo-app`; verified through the binary (files land in the
sandbox, component text byte-identical to the interpreter leg).

## 3. `php`: PHP and Laravel helpers (`bring in "php"`)

`packages/php/php.jc`. The builders are pure Jesun.Code with no imports; `php_scaffold` alone imports one raw primitive (`os.makedirs`) to create the project folders (same reason as `scaffold_app`). Every emitted file is pure text built in Jesun.Code. Emits PHP/Laravel code as text: routes, controllers, Blade pages.

```jesun
bring in "php"

show php_route with "get" and "/posts" and "PostController@index"
note Route::get('/posts', [PostController::class, 'index']);

show controller with "PostController" and ["index", "show"]
note <?php
note class PostController extends Controller
note {
note     public function index()
note     {
note         // TODO: list
note     }
note ...
```

### 3.1 Functions

- `php_escape with content`: `&` to `&amp;`, `<` to `&lt;`, `>` to
  `&gt;`, `"` to `&quot;`, `'` to `&#039;` (the `htmlspecialchars`
  set). Non-text fails with the package tag.
- `php_route with method and path and action`: `method` must be one of
  `get post put patch delete` (case-insensitive), else
  `Line 0: in the "php" package: "<method>" is not an HTTP method. Use get, post, put, patch, or delete.`
  `action` is `"Controller@method"` or `"Controller::method"`. Emits
  `Route::<Method>('<path>', [<Controller>::class, '<method>']);`.
- `controller with name and actions`: `name` must match
  `[A-Z][A-Za-z0-9]*`; `actions` a list of text (each a valid method
  name). Emits the class skeleton with one method stub per action.
- `blade_page with title and body`: emits a Blade layout (`@yield`
  content section, escaped title).
- `php_scaffold with name`: writes `./<name>/routes.php` (three sample
  routes) and `./<name>/PostController.php`; returns the paths.

### 3.2 Demo

`examples/php_demo.jc`: emits a `PostController` with index/show and a
route table for a blog; verified through the binary.

## 4. Test plan (`tests/test_interop.py`)

Differential like `tests/test_frontend.py`: every case through both
interpreters via `InlineSandbox`, byte-identical outputs, exact
expected text (no substring-only assertions, per the standing lesson).

- wordpress: a fixture `http.server` in the test process serves canned
  WP REST JSON on 127.0.0.1 (ephemeral port): posts list, one post,
  404 post, search, comments, create (201 with auth, 401 without),
  plus a bad-JSON path. Cases: list, one, missing (404 shape),
  search, comments, create with auth, create without auth (401
  shape), create without login (needs-a-login shape),
  unreachable host (points at a closed port), bad base type,
  count validation.
- react: escape order, props rendering, element/void composition,
  component name validation, state hook, scaffold writes files
  (asserted via the sandbox, both legs).
- php: escape order, route methods + invalid method, controller
  skeleton, blade page, scaffold writes files.

## 5. Docs and web

README (interop section), CHANGELOG (v1.4.0 entry on release),
ROADMAP (v1.4 rung marked shipped on release). Site: version pill and
FAQ interop Q&A move with the release, not before (standing web
orders). Blog: one release post minimum when v1.4.0 ships.
