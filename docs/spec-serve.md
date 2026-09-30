# Jesun.Code spec: Serve (the full-stack web framework)

Status: M1 spec, drafted 2026-09-30, awaiting founder approval. NOTHING
below is built. No code lands until the founder approves this document;
that is the spec-first gate, and it holds.

Founder's law: one language, all solutions. Serve is written in
Jesun.Code itself: `packages/serve/serve.jc`, used with
`bring in "serve"`. The Python bridge carries no domain logic. Where a
new primitive is unavoidable (one persistent-connection primitive in
jweb), it is specified as an interface contract in section 5, and the
contract is the whole of what the bridge may do.

Honest framing: Serve runs on the `jesun` interpreter (bootstrap or
self-hosted), like jweb (spec v1.2). It is interpreter-first; native
`jesun build` support for tables, JSON, and the web packages is future
work (see section 12). Serve does not replace the static site: the
`docs/` site stays generated-and-static on GitHub Pages (the sitegen
pipeline owns that claim). Serve is for what static cannot do: forms,
APIs, live pages, data-backed apps, 3D scenes. The hybrid hosting
story (static on Pages, dynamic services on a small host) is the
documented deployment model; section 1 says why.

Naming: the framework package is `serve`. `jweb` stays the transport
layer (sockets, parsing, routing, sessions, responses). The app brings
in both: `bring in "jweb"` then `bring in "serve"`.

## 1. Vision and non-goals

Serve is the web framework that reads like English. One developer
writes one file in plain Jesun.Code and gets: server-rendered pages,
JSON APIs, fenced interactive widgets, live pages whose state lives on
the server, an English data layer with migrations and a derived admin,
and 3D scenes. Zero JavaScript by default; interactivity is always
opt-in per widget; the browser is a thin renderer, never a second
application to keep in sync.

Serve is a COMPOSITE package (first of its kind, deliberately): it is
specified to be used with `jweb`, `sitegen`, `js`, `html`, and `sqlite`
brought in alongside it, and it calls their functions (`add_route`,
`sitegen_page`, `script_tag`, `escape_html`, `open_database`).
Rationale: the "packages never import other packages" convention (spec
v1.5) exists so small builders carry their tiny helpers instead of
depending on each other. Serve's chrome (full page assembly) is not
tiny, and duplicating `sitegen_page` would guarantee drift between the
static site and the dynamic framework. The composite exception is
narrow: serve calls only the named functions in section 3.7, every
serve-defined name is prefixed `serve_` or `three_` so `bring in` order
can never collide, and serve defines NO name that jweb already defines
(in particular, serve does not define `serve`; the entry point is
`serve_start`, section 3.1).

Non-goals (what Serve is not):

- Not a static site generator. That is sitegen's job; serve renders at
  request time.
- Not a client-side framework. There is no router, no virtual DOM, no
  bundle step in the developer's loop. JavaScript is an emission
  target (via the `js` package), never an authoring language.
- Not an ORM for every database. The English data layer targets
  SQLite only (spec v1.2 section 4). Postgres-shaped ambitions are
  section 12.
- Not realtime infrastructure. Live views are one documented pattern
  (server-sent events, section 3.4); chat-at-scale, presence, and
  pub/sub are not in scope.
- Not a 3D engine. The Scene abstraction describes a scene graph in
  English and emits three.js code (section 6); the browser runs
  three.js, Jesun.Code never rasterizes a triangle.

## 2. Principles

The seven distilled principles. Each is a rule the implementation must
obey; a design that breaks one does not ship.

1. **Server renders first; the browser receives HTML.** Pages are
   complete HTML when they leave the server. Zero JavaScript ships by
   default. Rationale: content pages do not need a runtime to be read;
   shipping one is pure waste, and it is the single biggest performance
   and complexity win the best frameworks converged on (Astro islands,
   React server components). Serve makes the fast default the only
   default.

2. **One home for state: the server.** Interactive state lives in the
   handler's tables, on the server. The client is a thin renderer that
   patches the DOM when the server says so. Rationale: every duplicated
   client state is a synchronization bug waiting to happen. The JSON
   API between your own frontend and backend is accidental complexity;
   serve deletes it for the framework's own widgets (Phoenix LiveView's
   lesson).

3. **English sentences are the API.** Every framework operation reads
   as a sentence; every error reads as a sentence. Rationale: this is
   the language's founding promise, and a framework is where it is
   tested hardest. `serve_route with "GET /hello" and hello` must be
   learnable by reading it aloud. If an API needs a paragraph to
   explain, the API is wrong.

4. **Conventions are English words, not magic.** A table called
   `todos` is served by code that says `todos`; a route that says
   `GET /users/:id` puts the id in `request["params"]["id"]`. Nothing
   happens because of a hidden naming spell. Rationale: Rails proved
   convention beats configuration, and also proved metaprogramming
   magic unreadable. Serve keeps the first lesson and refuses the
   second: if a behavior cannot be explained in one sentence, it is
   rejected in review.

5. **Data in sentences, schema in history.** Fields are declared once
   in English; the declaration yields storage, migrations, and an
   admin page. Migrations are a readable, ordered history, not a
   diffed mystery. Rationale: Django's real product was never the ORM;
   it was migrations-as-history plus the admin-for-free. Declaring a
   thing once and getting three things back is the batteries-included
   bar.

6. **Islands, not applications.** Interactive widgets are fenced,
   named, and hydrated only where placed. The page never becomes an
   app. Rationale: hydrating a whole tree for one button is the waste
   principle 1 already condemned. An island is a contract: this HTML,
   this script, this JSON route, nothing else.

7. **One language, three surfaces.** Page (HTML), data (SQLite), and
   scene (3D) share one vocabulary and one file. Interop happens by
   emission: like the v1.4.0 `react` package, serve generates the
   target ecosystem's code (three.js) from English rather than
   reimplementing the ecosystem. Rationale: the founder's law, applied
   to the hardest surfaces. Rewriting three.js in Jesun.Code would be
   vanity; describing a scene in English and emitting correct three.js
   is leverage.

Explicit rejections (things the best frameworks do that Serve refuses,
with the reason):

- **Client-first SPAs and full-page hydration.** Split-brained by
  construction; betrays principles 1 and 2. Rejected outright.
- **TypeScript-style annotations.** `id: string` and
  `Promise<User | null>` are the opposite of readable-by-a-non-programmer.
  Serve adapts what typing actually buys (early errors, refactor
  safety) through the interpreter's kind-checked plain-English
  failures and `note` contracts, not through annotation syntax.
  Rejected as syntax; kept as safety.
- **Magic metaprogramming** (Rails-style `method_missing`, decorator
  stacks, implicit hooks). If a non-programmer cannot trace what a
  line does by reading it, it does not ship.
- **A second language for the frontend.** Any design that requires
  hand-written JavaScript for core behavior breaks the founder's law.
  JavaScript is emitted via the `js` package, never authored.
- **Mandatory bundlers and build maximalism.** The interpreter is the
  runtime. `serve_start with 8080` serves; no build step may be
  required to see a page.

## 3. The six abstractions

Each abstraction is specified as: the exact sentences, a complete
working example, and how it composes with the others. Every sentence
below parses with the EXISTING grammar (function definitions with
`to`, calls with `with`/`and`, `give back`, `is`, tables, `for each`,
`if`/`then`/`otherwise`). Prettier sugar (`route "GET /" to home`)
is proposed in Appendix A, flagged as optional, and required by no
milestone.

### 3.1 Route

`serve_route with "METHOD /path" and handler` registers a handler,
delegating to jweb's `add_route`. The path language is jweb's,
unchanged: `:name` segments land in `request["params"]`, a trailing
`/*` captures the rest as `params["splat"]`, first registered route
wins, no match is jweb's plain 404. Method match is exact.

`serve_start with port` prints the serve banner and starts jweb's
`serve with port`. (serve defines no `serve`; jweb owns that name.)

Complete example, the smallest serve app:

```jesun
bring in "jweb"
bring in "sitegen"
bring in "serve"

serve_site with "Acme" and "https://acme.example" and "v1.0.0"

to hello with request
    name is request["query"]["name"]
    if name is nothing then
        name is "stranger"
    give back serve_page with "Hello" and ("<main><h1>Hello, " + name + "!</h1></main>")

serve_route with "GET /hello" and hello
serve_start with 8080
```

Run it with `python3 jesun.py app.jc`, open
http://localhost:8080/hello?name=Jesun.

Composes with: everything below registers through `serve_route`.
Static files keep working: `serve_files with "public" and "/static"`
(jweb's, unchanged) serves CSS/JS/images with the `..` sandbox.

### 3.2 Page

Pages are server-rendered HTML, complete on arrival, zero JavaScript.

- `serve_site with name and url and version`: call once per app. It
  builds the sitegen site table serve wraps every page in (name for
  the nav brand, url for canonicals and OG tags, version for the
  version pill). Calling it twice is a failure (section 8).
- `serve_page with title and body`: gives back a jweb response table
  (`status` 200, `content-type: text/html; charset=utf-8`). The body
  is the full document: `sitegen_head` + `sitegen_nav` + your `body` +
  `sitegen_footer`, composed from the real sitegen builders (composite
  package, section 1). Your `body` passes through raw, exactly like
  sitegen: it is authored HTML. User input inside it MUST be escaped
  by you with `escape_html` (the `html` package); serve never
  re-escapes authored markup.
- `serve_page_at with route and title and body`: same, but the
  canonical and OG url are `url + route` instead of the site root.
  Use it when the handler knows its route and wants correct SEO tags.
- For JSON, use jweb's `json_response with data` directly; serve does
  not wrap it. For redirects, jweb's `redirect_to with path`.

Complete example, a marketing page plus a JSON API:

```jesun
bring in "jweb"
bring in "sitegen"
bring in "html"
bring in "serve"

serve_site with "Acme" and "https://acme.example" and "v1.0.0"

to home with request
    give back serve_page_at with "/" and "Acme" and "<main><h1>Acme</h1><p>Plain and simple.</p></main>"

to api_status with request
    out is {"ok": true, "version": "v1.0.0"}
    give back json_response with out

serve_route with "GET /" and home
serve_route with "GET /api/status" and api_status
serve_start with 8080
```

Composes with: Island (section 3.3) and Scene (section 3.6) produce
fragments that `serve_page` wraps; Live view (3.4) is a page with a
stream attached; the admin (3.5) serves pages.

### 3.3 Island

An island is a fenced interactive widget: named HTML plus its own
script, hydrated only where placed. The page around it ships zero
JavaScript of its own.

- `serve_island with id and html and script`: `id` is the widget's
  HTML id (validated, section 8); `html` is the widget markup (raw,
  authored); `script` is already-built JavaScript text, assembled
  with the `js` package (`dom_ready`, `on_event`, `js_fetch`,
  `js_string`). Gives back `html` followed by the `<script>` tag, so
  it drops straight into a `serve_page` body.
- The script calls back to JSON routes you register with
  `serve_route` (usually `POST`). The island contract: this HTML,
  this script, these routes, nothing else. An island MUST NOT reach
  outside its own id (enforced by review, not by code; the emitted
  script is text and the browser does not sandbox it, section 9 says
  this plainly).

Complete example, a like button backed by a session counter:

```jesun
bring in "jweb"
bring in "js"
bring in "sitegen"
bring in "serve"

serve_site with "Likes" and "https://likes.example" and "v1.0.0"

to like_page with request
    widget is serve_island with "like-btn" and "<button id=\"like-btn\">Likes: 0</button>" and (dom_ready with (on_event with "click" and "like-btn" and "fetch(\"/api/like\", {{method: \"POST\"}}).then(function(r) {{ return r.json(); }}).then(function(d) {{ document.getElementById(\"like-btn\").textContent = \"Likes: \" + d.likes; }});"))
    give back serve_page with "Likes" and ("<main><h1>Press it.</h1>" + widget + "</main>")

to api_like with request
    s is session_of with request
    n is s["likes"]
    if n is nothing then
        n is 0
    s["likes"] is n + 1
    out is {"likes": s["likes"]}
    give back json_response with out

serve_route with "GET /" and like_page
serve_route with "POST /api/like" and api_like
serve_start with 8080
```

Composes with: Route (the JSON callback), Page (the wrapper),
sessions (per-visitor state, jweb's `session_of`).

### 3.4 Live view

A live view is a page whose state lives on the server. The browser
holds an EventSource stream; the server pushes re-rendered HTML; the
client patches one `<div>`. No client state, no JSON API between your
own frontend and backend. Requires the jweb SSE primitive (section 5);
everything else is library code.

- `serve_live with request and title and state and render and on_event`:
  call it from the GET handler for the page's route.
  - `state` is a table of plain values (text, numbers, true/false,
    nothing, lists and tables of those). It is the initial state;
    serve copies it shallowly per session.
  - `render` is a one-input function: `render with state` gives back
    the widget HTML text. Interactive elements carry
    `data-event="name"` attributes; the emitted client script
    delegates clicks on `[data-event]` to POST the event name.
  - `on_event` is a two-input function:
    `on_event with state and event` updates the state table in place
    and gives back the new widget HTML text. `event` is a table with
    at least `event["name"]`.
  - Gives back the full page response: `<div id="serve-live">` +
    initial render + the client script (EventSource on
    `<route>/events`, click delegation POSTing
    `{"event": name}` as JSON).
  - First call for a route registers the sub-routes
    `GET <route>/events` (the stream) and `POST <route>/events`
    (client events). Later calls reuse them.
- Stream protocol (client-visible): `text/event-stream`; event
  `render` carries a full widget HTML replacement for `#serve-live`;
  event `ping` is a keep-alive comment every 25 seconds.
- POST `/events` with JSON `{"event": "bump"}`: looks up the stream by
  session; unknown JSON is a 400; a session with no open stream is a
  410 with `{"error": "the live view is gone; reload the page."}`.

Complete example, a shared-nothing counter (per-visitor state):

```jesun
bring in "jweb"
bring in "js"
bring in "sitegen"
bring in "serve"

serve_site with "Counter" and "https://counter.example" and "v1.0.0"

to counter_render with state
    give back "<h1>" + text of state["count"] + "</h1><button data-event=\"bump\">Bump</button>"

to counter_bump with state and event
    if event["name"] is "bump" then
        state["count"] is state["count"] + 1
    give back counter_render with state

to counter_page with request
    state is {"count": 0}
    give back serve_live with request and "Counter" and state and counter_render and counter_bump

serve_route with "GET /counter" and counter_page
serve_start with 8080
```

Composes with: Route (the page route), Page (the wrapper; a live view
IS a page), sessions (streams are keyed by session id).

### 3.5 Table (the English data layer)

Declare fields once in English; get storage, migrations, and an admin
page. Built on the `sqlite` package (spec v1.2 section 4); every rule
below is library code, no new syntax.

- `serve_table with name and fields`: `name` is validated (letters,
  numbers, underscores; starts with a letter). `fields` is a list of
  `[name, kind]` pairs; `kind` is one of `"text"`, `"number"`,
  `"true/false"`, mapping to SQLite `TEXT`, `REAL`, `INTEGER`.
  Gives back a declaration table carrying the name, the fields, and
  its migration history, starting at version 1 with the
  `CREATE TABLE` statement.
- `serve_add_field with declaration and name and kind`: validates,
  bumps the declaration version, and appends
  `ALTER TABLE <name> ADD COLUMN <field> <TYPE>` to the history.
  The declaration is the single source of truth; the history is
  readable data, never a diffed mystery.
- `serve_migrate with db and declaration`: creates the
  `_serve_migrations` table if missing; reads applied versions for
  this table; applies each missing migration in order with `db_run`;
  records `(table, version, sql, applied-date)` per migration. Gives
  back the list of applied versions (empty when already current).
  Re-running is a no-op: migrations apply at most once, ever.
- `serve_migrations with db and name`: gives back the applied history
  for a table as a list of tables, oldest first.
- `serve_all with db and declaration`: `SELECT` of every row as a
  list of tables (column name to value; NULL is `nothing`).
- `serve_admin with db and declaration`: registers three routes and
  serves the derived admin page (a `serve_page`):
  - `GET /admin/<name>`: a table of all rows, a create form (one
    input per field), and a delete button per row. Plain HTML forms,
    zero JavaScript.
  - `POST /admin/<name>`: creates a row from the form fields
    (parsed with `serve_form`, below), redirects back to the list.
  - `POST /admin/<name>/delete`: deletes the row whose `id` the form
    posted, redirects back.
  Handlers resolve the declaration through the module-level
  `serve_registry` table (name to `{db, declaration}`), filled by
  `serve_admin`.
- `serve_form with request`: parses a `application/x-www-form-urlencoded`
  body into a table (same decoding rules as jweb query parsing:
  `+` is a space, malformed escapes kept as-is).
- `serve_guard with request`: gives back `session_of`'s `"user"` value,
  or `nothing`. Handlers protect pages with:
  two lines: `guard is serve_guard with request`, then
  `if guard is nothing then give back redirect_to with "/login"`.

Complete example, todos with an admin back office:

```jesun
bring in "jweb"
bring in "sitegen"
bring in "html"
bring in "sqlite"
bring in "serve"

serve_site with "Todos" and "https://todos.example" and "v1.0.0"

db is open_database with "todos.db"
todos is serve_table with "todos" and [["task", "text"], ["done", "true/false"]]
serve_add_field with todos and "priority" and "number"
serve_migrate with db and todos
serve_admin with db and todos

to home with request
    rows is serve_all with db and todos
    items is ""
    for each r in rows
        items is items + "<li>" + (escape_html with r["task"]) + "</li>"
    give back serve_page with "Todos" and ("<main><h1>Todos</h1><ul>" + items + "</ul><p><a href=\"/admin/todos\">Admin</a></p></main>")

serve_route with "GET /" and home
serve_start with 8080
```

Composes with: Route, Page, sessions (guard), the `sqlite` package.
The admin page is the framework proving principle 5: declare once,
get storage, history, and a back office.

### 3.6 Scene

A 3D scene described in English, emitted as three.js code. Follows the
v1.4.0 `react` package pattern exactly: pure Jesun.Code text builders,
no imports, no bridge; inputs validated with plain-English errors;
builders compose because fragments stay text. Jesun.Code never
rasterizes; the browser runs three.js.

- `three_scene`: gives back an empty scene table:
  `{"objects": [], "camera": nothing, "lights": [], "spins": []}`.
- `three_box with size`: `size` a number above 0, else failure. Gives
  back the geometry expression text
  `new THREE.BoxGeometry(2, 2, 2)`.
- `three_sphere with radius`: same validation; gives back
  `new THREE.SphereGeometry(1, 32, 32)`.
- `three_material with color`: `color` non-empty text of safe
  characters (letters, `#`, digits), else failure. Gives back
  `new THREE.MeshStandardMaterial({{ color: "crimson" }})`.
- `three_add_mesh with scene and name and geometry and material`:
  `name` a valid JS identifier (letters, digits, `_`, `$`; starts
  with a letter or `_`), else failure. Appends
  `const box = new THREE.Mesh(<geometry>, <material>);` and
  `scene.add(box);` to the scene's objects.
- `three_camera_at with scene and x and y and z`: numbers, else
  failure. Sets the scene camera:
  `const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);`
  plus `camera.position.set(0, 1, 6);`.
- `three_light with scene and kind`: `kind` `"sun"` gives
  `const sun = new THREE.DirectionalLight(0xffffff, 1); sun.position.set(5, 10, 7); scene.add(sun);`;
  `"soft"` gives `scene.add(new THREE.AmbientLight(0xffffff, 0.6));`.
  Anything else is a failure.
- `three_spin with scene and name`: `name` a valid identifier naming
  a mesh added earlier, else failure. The render loop rotates it
  (`<name>.rotation.x += 0.01; <name>.rotation.y += 0.01;` per frame).
- `three_script with scene`: the full module script: the three.js
  import, scene, camera (required, failure if missing), lights,
  objects, renderer, and the `requestAnimationFrame` loop.
- `three_page with title and scene`: the full HTML page: doctype,
  head with the title, an importmap pinning `three@0.160.0`, a
  full-viewport container, and `<script type="module">` with the
  script. No other JavaScript on the page.
- `serve_scene with title and scene`: the serve-level sentence; gives
  back the jweb response table wrapping `three_page`.

The emission boundary (English to three.js) is specified
exhaustively in section 6.

Complete example, the spinning box:

```jesun
bring in "jweb"
bring in "serve"
bring in "threejs"

to demo with request
    scene is three_scene
    three_add_mesh with scene and "box" and (three_box with 2) and (three_material with "crimson")
    three_camera_at with scene and 0 and 1 and 6
    three_light with scene and "sun"
    three_spin with scene and "box"
    give back serve_scene with "Spinning box" and scene

serve_route with "GET /demo" and demo
serve_start with 8080
```

Composes with: Route, Page (a scene page IS a page). A scene can sit
inside a larger page body too: `three_script with scene` drops into
any `serve_page` body with a `<div id="scene"></div>` container (the
script targets the container by id; section 6).

### 3.7 The composite call list (exact)

serve.jc calls these foreign functions and no others. If a builder
needs anything else, this list grows by spec amendment, never by
convenience.

- jweb: `add_route`, `serve` (via `serve_start`), `json_response`,
  `redirect_to`, `session_of`, `serve_files`, `ok`,
  `jweb_session_id` (new, section 5), `jweb_sse_stream` (new,
  section 5).
- sitegen: `sitegen_head`, `sitegen_nav`, `sitegen_footer`.
- js: `script_tag`, `dom_ready`, `on_event`, `js_fetch`, `js_string`.
- html: `escape_html`.
- sqlite: `open_database`, `db_run`, `db_query`.
- time: `time_wait` (SSE keep-alive only).

### 3.8 Grammar note

Every sentence in sections 3.1-3.6 uses only existing grammar:
`to`-definitions, `with`/`and` calls (any arity), `give back`,
`is`, table/list literals, `for each`, `if`/`then`/`otherwise`,
`push x to y`, `repeat while`, string interpolation with `{name}`
(`{{` for a literal brace). No milestone requires a grammar change.
Nicer sentences are proposed, with exact grammars, in Appendix A;
all are optional.

## 4. Request lifecycle

One request, sentence by sentence, naming the layer that acts. jweb
does 1-6 and 8-13; serve lives entirely in step 7 (plus the builders
that shape what step 7 gives back).

1. Bytes arrive. jweb's accept loop takes the connection (10s socket
   timeout; a silent client is dropped, never hung).
2. `jweb_read_request` reads until `\r\n\r\n`. Head over 64 KiB is a
   failure (the `attempt` in the serve loop turns it into a 500; the
   server keeps going).
3. `jweb_parse_request` splits the request line (`that request line
   makes no sense` if it has fewer than two words), separates path
   from query string, URL-decodes the query (`+` is a space;
   malformed escapes kept as-is, never an error), lowercases header
   names (over 100 header lines is a failure), and parses the
   `Cookie` header. The request table is born:
   `method`, `path`, `query`, `headers`, `cookies`, `body` (`""`
   for now), `params` (filled in step 5).
4. The body is read per `Content-Length`. Over 1 MiB sets `too_big`
   and the client gets a plain 413 (`That body is too big.`).
5. `jweb_match_route` walks the registered routes in order:
   exact method, segment-by-segment path match, `:name` segments
   captured into `params`, a trailing `*` capturing the rest as
   `params["splat"]`. First match wins. No match: jweb's 404 page
   (`Nothing lives at /here`).
6. `req["params"]` is set from the match. The session is NOT touched:
   no cookie is read, no session created, until user code asks.
7. THE SERVE STEP. The handler runs inside `attempt`:
   `outcome is attempt handler with req`. The handler is serve
   builders, user code, or both: it reads the request table and gives
   back text (a page), a response table (control), or an sse table
   (section 5). `session_of with request` may create a session here;
   `serve_guard` may bounce to login; `serve_live` may register
   sub-routes. A handler failure never kills the server: the client
   gets the plain-English 500 page and the route plus line are logged
   to stderr.
8. `jweb_normalize_response` shapes the answer: text becomes
   `ok` (200, `text/html; charset=utf-8`); a table takes spec
   defaults (status 200, empty headers, empty body); anything else
   becomes the 500 page.
9. NEW (section 5): if the response table contains the key `"sse"`,
   jweb does NOT send it normally. It calls
   `jweb_sse_stream with request and resp["setup"]`, which sends the
   event-stream headers and runs the stream.
10. If a session was created during the handler
    (`pending_cookie` is set), the `set-cookie` header
    (`jesun_session=<id>; Path=/; HttpOnly`) is added to the response,
    including SSE responses.
11. `jweb_send` writes the status line, `content-length`,
    `connection: close`, the headers, a blank line, and the body.
    (SSE responses instead get `connection: keep-alive` and the open
    stream from step 9.)
12. The connection closes. Streams stay open until the setup function
    gives back or the client goes away (a failed send ends the stream
    silently).
13. The accept loop takes the next connection. NOTHING in steps 1-12
    may hold the loop: section 5's concurrency contract.

## 5. The jweb extension contract

Three additions to jweb, specified as interface contracts. The
implementation is M3's work; the contract is the whole of what may be
added. No other jweb changes are in scope.

### 5.1 `jweb_sse_stream with request and setup` (new primitive)

- `setup` is a one-or-two-input Jesun.Code function. jweb calls it as
  `setup with push and request`, where `push` is a table and
  `request` is the step-3 request table.
- Before calling setup, jweb sends exactly:
  `HTTP/1.1 200 OK`, `content-type: text/event-stream`,
  `cache-control: no-cache`, `connection: keep-alive`, then the blank
  line. If `pending_cookie` is set (section 4 step 10), the
  `set-cookie` header goes out with these headers.
- The setup function sends a frame by calling the function stored at
  `push["send"]`: bind it first (`sender is push["send"]`), then
  `ok is sender with name and data`. The call writes one SSE frame:
  `event: <name>`, then one `data: <line>` per line of `data`, then a
  blank line, flushed to the socket. It gives back `true`. If the
  client is gone (the write fails), it gives back `false` and the
  setup function SHOULD give back promptly; jweb then closes the
  connection silently.
- `name` must be text without line breaks; a name holding `\r` or
  `\n` is a plain-English failure (section 8). `data` must be text;
  embedded newlines become separate `data:` lines per the SSE
  format (never a failure, never raw newlines on the wire).
- When setup gives back (for any reason), jweb closes the
  connection. A setup that never gives back holds the stream open;
  that is the intended use (live views), and it is why 5.2 exists.
- Dispatch: `jweb_handle_conn` checks the normalized response for the
  `"sse"` key BEFORE `jweb_send`. When present, `resp["setup"]` must
  be a function (else the 500 page); jweb calls this primitive and
  skips the normal send entirely.

### 5.2 Concurrency contract (hard dependency)

jweb's reference server is a single-threaded accept loop today
(`serve with port`). A held-open stream MUST NOT block other
requests: while one client streams, another client's GET, POST, and
`/events` calls must all be served. This is a behavioral contract on
jweb, acceptance-tested in M3 (section 11): one open stream plus a
concurrent POST round-trip, both green, on both interpreters.

Anticipated mechanism (not mandated): one thread per connection via a
minimal bridge primitive, with all framework logic staying in
Jesun.Code. If threads are used, the shared `serve_streams` registry
MUST NOT be read-modify-written across steps: register (GET), lookup
(POST), and clear (disconnect) are single table operations, each
atomic under the GIL for the reference implementation. The spec
documents the limit honestly: M3's concurrency is correct for the
demo and dogfood load; production hardening (locks, backpressure,
stream caps) is future work, section 12.

### 5.3 `jweb_session_id with request` (new primitive)

Gives back the session id text for the request's session, creating a
session (and the pending cookie) exactly as `session_of` does when
none exists. Rationale: live views key streams by session id, and
`session_of` gives back the table, not the id. Small, total, no new
failure modes beyond session_of's own.

## 6. The threejs package: emission boundary

`packages/threejs/threejs.jc`, used with `bring in "threejs"`. It
follows the v1.4.0 `react` package pattern exactly, and reviewers
check the checklist:

- Pure Jesun.Code: NO imports, no bridge. (The react package imports
  `os`/`builtins` only for `scaffold_app`'s folder creation; threejs
  has no scaffolder, so it imports nothing at all.)
- Kind helpers named `three_article` / `three_describe`, same shapes
  as `react_article` / `react_describe`.
- Every builder validates its inputs and fails in plain English
  (section 8); valid inputs never fail.
- Builders compose as text: geometry/material expressions are text,
  the scene collects statement text, `three_script` assembles.

The boundary table. Left: the English sentence. Right: the exact
three.js emitted (variables: S size, R radius, C color, N name,
X/Y/Z numbers, K camera constant).

| English | three.js emitted |
|---|---|
| `three_scene` | (no output; gives back the scene table) |
| `three_box with S` | `new THREE.BoxGeometry(S, S, S)` |
| `three_sphere with R` | `new THREE.SphereGeometry(R, 32, 32)` |
| `three_material with C` | `new THREE.MeshStandardMaterial({ color: "C" })` |
| `three_add_mesh with scene and N and G and M` | `const N = new THREE.Mesh(G, M);` then `scene.add(N);` |
| `three_camera_at with scene and X and Y and Z` | `const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);` then `camera.position.set(X, Y, Z);` |
| `three_light with scene and "sun"` | `const sun = new THREE.DirectionalLight(0xffffff, 1); sun.position.set(5, 10, 7); scene.add(sun);` |
| `three_light with scene and "soft"` | `scene.add(new THREE.AmbientLight(0xffffff, 0.6));` |
| `three_spin with scene and N` | registers N; the loop emits `N.rotation.x += 0.01; N.rotation.y += 0.01;` per frame |
| `three_script with scene` | the full module script (below) |
| `three_page with title and scene` | the full HTML page (below) |

`three_script with scene` assembles, in order: the scene line
(`const scene = new THREE.Scene();`), the camera block (REQUIRED;
missing camera is a failure, section 8), the light lines, the object
lines, the renderer block
(`const renderer = new THREE.WebGLRenderer({{ antialias: true }}); renderer.setSize(window.innerWidth, window.innerHeight); document.getElementById("scene").appendChild(renderer.domElement);`),
and the loop
(`function animate() {{ requestAnimationFrame(animate); <spin lines> renderer.render(scene, camera); }} animate();`),
prefixed with `import * as THREE from 'three';`.

`three_page with title and scene` wraps the script in the full page:
`<!DOCTYPE html>`, `<head>` with charset, viewport, and the escaped
title, an importmap pinning the CDN build
(`three@0.160.0`, `three/addons/`), `<div id="scene">` styled to the
viewport, and `<script type="module">` holding the script. The page
ships no other JavaScript.

Validation rules (all failures in section 8): sizes and radii are
numbers above 0; coordinates are numbers; colors are non-empty text
of letters, `#`, and digits; mesh names are valid JS identifiers
(letters, digits, `_`, `$`; first character not a digit);
`three_spin` names a mesh already added; the camera is set before
`three_script`.

The pinned CDN version (`0.160.0`) changes only by spec amendment;
unpinned `latest` is forbidden (reproducibility).

## 7. The English data layer (detail)

Field kinds and their SQLite types:

| kind (English) | SQLite type | Jesun.Code round trip |
|---|---|---|
| `"text"` | `TEXT` | text stays text |
| `"number"` | `REAL` | numbers stay numbers (`1.0` stays `1.0`) |
| `"true/false"` | `INTEGER` | `true` is 1, `false` is 0, back again |

Names (tables, fields): non-empty text; first character a letter;
rest letters, digits, `_`. Anything else is a failure (section 8).
Because names are validated, DDL is built by joining validated
identifiers only; user text NEVER reaches DDL except through
`?` parameters. Injection-safe by construction.

Migration algorithm (`serve_migrate with db and declaration`), in
order:

1. `CREATE TABLE IF NOT EXISTS _serve_migrations (tname TEXT, version INTEGER, sql TEXT, applied TEXT)`.
2. Read applied versions: `SELECT version FROM _serve_migrations WHERE tname = ?` with the table name.
3. For each migration in the declaration's history, oldest first,
   whose version is not applied: `db_run` the migration SQL with
   `nothing` for params, then `INSERT INTO _serve_migrations`
   the `(tname, version, sql, today)` row. `today` is
   `time_today` (the `time` package, `YYYY-MM-DD`).
4. Give back the list of versions applied by this call (empty list
   when already current).

The declaration's history is data the developer can read:
`serve_migrations with db and name` gives back the applied rows as
tables (`tname`, `version`, `sql`, `applied`), oldest first. The
history answers "how did this table get its shape" without a
migration diff tool.

The derived admin (`serve_admin with db and declaration`):

- Registers `GET /admin/<name>`: a `serve_page` titled
  `<Name> admin`: a `<table>` of all rows (one column per field,
  values escaped with `escape_html`), a create `<form>` (one
  labeled input per field, `method="post"`,
  `action="/admin/<name>"`), and per row a delete form posting to
  `/admin/<name>/delete` with a hidden `id`.
- Registers `POST /admin/<name>`: reads the form with `serve_form`,
  builds the `INSERT` with `?` placeholders from the declared
  fields (missing fields become `nothing`/NULL; extra form fields
  are ignored), redirects to the list.
- Registers `POST /admin/<name>/delete`: deletes by the posted
  `id` (`?` parameter), redirects to the list.
- All three handlers resolve `{db, declaration}` from the
  module-level `serve_registry` table, keyed by table name, filled
  by `serve_admin`. Registering admin for the same table twice is a
  failure (section 8).

`serve_form with request`: parses an
`application/x-www-form-urlencoded` body into a table. Decoding
rules are jweb's query rules exactly: split on `&`, first `=` wins,
`+` becomes a space, percent-decoding, malformed escapes kept as-is.
A missing or empty body gives back an empty table, never a failure.

`serve_guard with request`: gives back `(session_of with request)["user"]`,
or `nothing` when unset. The login pattern from the research report
uses it with `redirect_to`; session fixation is closed by
`jweb_rotate_session` (section 5.3) at the moment the app marks the
session authenticated.

## 8. Error table

Every failure speaks plain English with the line number, never a
traceback (the interpreter supplies the `Line N:` prefix; messages
below are the text after it). Every row is a differential test in
`tests/test_serve.py` (section 10). Kinds use the article helper
style (`an agent`, `a number`, `text` bare), matching the existing
packages.

Route:

1. `serve_route` route malformed: `serve_route needs "METHOD /path",
   like "GET /hello".`
2. Handler not a function: `the route handler has to be a function,
   but this is an agent.`
3. `serve_start` port not a number 1-65535: `serve_start needs a port
   number from 1 to 65535, but this is "eighty".`

Page:

4. `serve_site` called twice: `serve_site was already called; one
   site per app.`
5. `serve_site` argument not text: `serve_site needs a name, a url,
   and a version, all text.`
6. Page title missing or empty: `a page needs a title, but this one
   is missing.`
7. Page body not text: `a page body has to be text, but this is a
   number.`

Island:

8. Island id invalid: `"9lives" is not a valid island id. Use
   letters, numbers, dashes, and underscores, starting with a
   letter.`
9. Island script not text: `an island script has to be text, but this
   is a table.`

Live view:

10. `render` not a function: `a live view needs a render function,
    but this is text.`
11. `on_event` not a function: `a live view needs an event function,
    but this is text.`
12. `state` not a table: `live view state has to be a table, but this
    is text.`
13. SSE event name with a line break: `an event name cannot hold a new
    line.`
14. Stream data not text: `stream data has to be text, but this is a
    table.`
15. Live POST body not JSON: answered 400, not a failure:
    `{"error": "that event was not JSON."}`
16. Live POST with no open stream: answered 410, not a failure:
    `{"error": "the live view is gone; reload the page."}`

Table (data layer):

17. Table name invalid: `"my table" is not a valid table name. Use
    letters, numbers, and underscores, starting with a letter.`
18. Field kind unknown: `"email" is not a field kind. Use "text",
    "number", or "true/false".`
19. Field name invalid: `"first name" is not a valid field name. Use
    letters, numbers, and underscores, starting with a letter.`
20. Duplicate field: `the table "todos" already has a field called
    "task".`
21. Admin registered twice: `the admin for "todos" is already
    registered.`
22. A migration the database refuses: the database's own words, via
    sqlite's shaping: `the database said: <words>`.

Scene (threejs):

23. `three_box` size: `three_box needs a number above 0, but this is
    "big".`
24. `three_sphere` radius: `three_sphere needs a number above 0, but
    this is a table.`
25. `three_material` color not text: `three_material needs a color
    name, but this is a number.` Empty or unsafe: `three_material
    needs a color name, but it is empty.` /
    `"crimson!" is not a safe color. Use letters, digits, and "#".`
26. Mesh name invalid: `"9box" is not a valid object name. Use
    letters, numbers, and underscores, starting with a letter.`
27. Light kind unknown: `"moon" is not a light kind. Use "sun" or
    "soft".`
28. Spin of an unknown mesh: `there is no mesh called "box" in this
    scene.`
29. Script with no camera: `a scene needs a camera before it can be
    rendered. Call three_camera_at first.`
30. Camera coordinate not a number: `camera positions have to be
    numbers, but one is text.`

Streams (reference limits, section 9):

31. More than 128 concurrent streams: answered 503, not a failure:
    `too many live views open right now; try again in a moment.`

## 9. Security

Sessions: ids are random 128-bit values (jweb, real); the cookie is
`HttpOnly` (real); serve sets `SameSite=Lax` on the session cookie
(new in the cookie string, one line). Session data lives server-side
only; the cookie is an id, never state. On the login transition the
app MUST call `jweb_rotate_session` (section 5.3); the auth example in
section 7 does. `Secure` is intentionally NOT set by the framework:
serve cannot detect TLS, and a wrong `Secure` flag silently kills
sessions. Deployment is behind a TLS-terminating reverse proxy; the
proxy owns `Secure` and HSTS. This is documented, not assumed.

Input handling: user text goes into HTML only through `escape_html`;
page bodies are raw by design (authored, like sitegen) and the spec
says so twice so nobody forgets. SQL values go through `?`
parameters only; DDL identifiers come from validated names only
(section 7). `serve_form` never fails on hostile bodies; malformed
escapes are kept as-is (jweb's rule).

What the framework refuses: paths with `..` or absolute paths
(`serve_files` answers 403, jweb's rule); bodies over 1 MiB (413);
more than 128 concurrent streams (503, section 8 row 31); reflecting
error text to clients (the 500 page is fixed text); executing
anything the client sent as code. There is exactly one exception to
the last refusal: the M4 playground, and it is fenced by contract:
untrusted source runs in a child process with a 5-second timeout, a
working-folder sandbox, no network, output capped at 64 KiB, and
failures returned as plain-English text. The playground fence is an
M4 acceptance item, not an M2 feature.

Island honesty: an island's script is text the browser runs. Serve
emits only what the `js`-package builders produce (values escaped so
they cannot break out of their `<script>` tag: `<` becomes `\x3c`),
but the browser does not sandbox the script. What the script does is
the developer's responsibility; the spec states this plainly instead
of implying a sandbox that does not exist.

## 10. Testing contract

`tests/test_serve.py`, differential like `test_sitegen.py`: every
case runs through the bootstrap interpreter AND the self-hosted
walker via `InlineSandbox`; outputs must match byte for byte.
Coverage:

- Every builder's output shape: `serve_page` (doctype, head, nav,
  footer present; title in place), `serve_island` (html + one script
  tag), `serve_table` (declaration + version-1 history),
  `serve_migrate` SQL strings (against a temp-dir database),
  `three_script` / `three_page` (importmap pinned, camera block,
  spin lines), `serve_form` decoding.
- Every error-table row (section 8) with its exact message.
- Migration idempotency: migrate twice, second call applies nothing.
- The admin route shapes (list/create/delete) against a temp database
  without a server (call the handlers with fake request tables).

Live tests (subprocess servers on loopback ports, raw socket clients,
no network dependency; run through BOTH interpreters):

- GET a page: 200, title present, zero script tags.
- Island round-trip: GET the page, POST the JSON route twice, counts
  come back 1 then 2.
- Admin round-trip: create a row, see it listed, delete it, see it
  gone.
- Live view: GET the page (200), GET `/events` and read the first
  `render` frame, POST `{"event": "bump"}`, read the next `render`
  frame showing the bump. Then the 5.2 contract: while a stream is
  open, a second client's GET still answers.
- jweb's existing guarantees still hold: 404, 500 (failing handler),
  413, `..` rejection on static files.

Fuzz targets (extend, do not invent a new harness):

- The HTTP request fuzzer covers the SSE handshake path (weird
  header casing, missing blank line, split reads).
- `serve_form` bodies: random bytes; must never fail, only decode.
- `three_valid_name` / color validation: hostile strings; must fail
  validation, never emit.
- Migration DDL: hostile field/table names; must fail validation,
  never reach SQL.

Green means: `python3 -m unittest discover -s tests` fully green
after every meaningful chunk, differential cases byte-identical,
live tests passing on both interpreters. A chunk that breaks green
does not commit.

## 11. Acceptance criteria (M1-M5, falsifiable)

M1, Spec: this document is approved by the founder (his explicit
yes). Falsifiable corollary: no `packages/serve/`, no `threejs`
package, no section-5 primitive exists before that yes.

M2, Core (Route, Page, Island, Table + admin; section 3.1-3.3, 3.5):

1. `tests/test_serve.py` covers every M2 API sentence and every M2
   error-table row; all green on both interpreters.
2. Live, both interpreters: the like-button example serves GET / at
   200 with the title and zero script tags outside the island; two
   POSTs to /api/like answer `{"likes": 1}` then `{"likes": 2}`.
3. Live: the todos example migrates on a fresh temp database
   (versions [1, 2] applied), the admin lists/creates/deletes a row,
   and a second migrate call applies nothing.
4. Full suite green. README, CHANGELOG, ROADMAP updated; no public
   framework claim beyond the repo.

M3, Motion (Live view + 3D; sections 3.4, 3.6, 5):

1. `jweb_sse_stream` and `jweb_session_id` implemented exactly per
   section 5; the 5.2 concurrency test passes (open stream + concurrent
   POST, both served, both interpreters).
2. Live: the counter example: GET /counter is 200; GET
   /counter/events yields a `render` frame; POST
   `/counter/events` with `{"event": "bump"}` yields the next
   `render` frame with the count incremented; POST with garbage JSON
   is 400; POST with no stream is 410.
3. `threejs` emission boundary table fully tested differentially;
   the spinning-box page verified in a real browser (page loads,
   canvas present, no console errors).
4. Section-10 fuzz targets extended and clean.
5. Full suite green.

M4, Dogfood (one real dynamic thing):

1. The playground API (POST Jesun.Code source, get the output,
   fenced per section 9) runs on a small host for 7 continuous days.
2. Zero 500s attributable to framework faults across the soak; every
   request logged; p99 latency documented. Any framework fault
   restarts the 7-day clock. (App faults do not; the 500 page plus
   stderr log is the framework working as specified.)

M5, Release:

1. Version bump, README/CHANGELOG/ROADMAP, release blog post, Linux
   binary check, full suite green.
2. The public "our site runs on our framework" claim is made ONLY
   here, WITH the hybrid hosting story documented (static marketing
   on Pages; dynamic services on the small host) and M4's soak
   numbers published. A claim without the numbers does not ship.

## 12. Not in scope

WebSocket (SSE is the persistent connection, section 5); HTTP/2;
TLS termination (the reverse proxy's job); client-side routing and
SPAs; TypeScript-style annotations (rejected, section 2); databases
beyond SQLite; multi-tenancy; background jobs; email; file uploads
above 1 MiB; native (`jesun build`) support for serve (interpreter-first,
like jweb); production concurrency hardening beyond the M3 contract
(locks, backpressure, horizontal scaling); presence/pub-sub/chat
primitives; rebuilding the static `docs/` site in serve (sitegen owns
that claim; serve is for what static cannot do).

## Appendix A: proposed grammar sugar (optional)

None of this is required by any milestone. Each item gives the exact
grammar and the exact desugaring; the sugar adds no semantics.

A.1 `route "GET /hello" to hello`: statement. Grammar: the word
`route`, a text literal, the word `to`, a function name. Desugars to
`serve_route with "GET /hello" and hello`.

A.2 `page titled "T" with "body"`: expression. Grammar: the word
`page`, the word `titled`, a text literal, `with`, a text expression.
Desugars to `serve_page with "T" and "body"`.

A.3 `island "like-btn" with "html" and "script"`: expression.
Grammar: the word `island`, a text literal, `with`, two text
expressions joined by `and`. Desugars to
`serve_island with "like-btn" and "html" and "script"`.

Adoption rule: sugar lands only with differential parser tests and a
spec amendment naming the milestone. Until then, Appendix A is a
sketch, not a promise.

## Amendments

(Dated amendments go here, newest last. The spec is append-only like
every workspace file.)
