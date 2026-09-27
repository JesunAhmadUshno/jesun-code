# Jesun.Code spec v1.2: jweb (the native web framework)

Status: approved by the founder 2026-09-26 20:00 EDT ("Start v1.2 jweb now").
Founder's law: one language, all solutions. The framework below is written
in Jesun.Code itself. The Python bridge is used only for raw primitives
(socket syscalls, the sqlite3 driver), exactly as v1.0's `jesun.jc` used it
only for file I/O and subprocess. The bridge never counts as the solution.

Honest framing: jweb apps run on the `jesun` interpreter (bootstrap or
self-hosted). `jesun build` transpiles the v1.1 core subset; tables, JSON,
and jweb are interpreter-first. Native transpile support is future work
(see ROADMAP).

## 1. Tables: the native key-value type

Tables give Jesun.Code keyed data. They are values like text and lists:
mutable, reference-shared, nestable, deeply comparable.

```jesun
user is a new table
user["name"] is "Jesun"
user["age"] is 29

point is {"x": 10, "y": 20}
show point["x"]                 note 10
show keys of point              note ["x", "y"]
```

Rules:

- `a new table` makes an empty table. `{}` is the same empty table.
- `{"name": "Jesun", "age": 29}` is a table literal. Keys must be text;
  a non-text key is a plain-English error at the line that built it:
  `Line 3: a table key has to be text, but this one is a number.`
- Get with `t["key"]`. A missing key gives back `nothing` (never an error).
  Getting from something that is not a table is an error:
  `Line 4: I can only look up keys in a table, but this is text.`
- Set with `t["key"] is value` (subscript assignment; also works on lists:
  `friends[0] is "Mara"`). Setting a key on a non-table is an error.
- `keys of t` gives the keys as a list, in the order they were first set.
  `keys of` now also accepts native tables (it previously needed a Python
  dictionary from the bridge; that still works).
- `t contains "name"` is true when the key exists (extends `contains`).
- `show t` prints JSON style: `{"name": "Jesun", "age": 29}`. Nested tables
  and lists render inside. Text escapes the same way `json of` escapes.
- `t1 is t2` compares tables deeply: same keys with deeply equal values.
- Tables are references: `b is a` then `b["x"] is 1` changes what `a` sees.
- Iteration: `for each k in keys of t` then `t[k]`.

New reserved words: `new`, `table`, `json`, `parse`.
(`import json` still works: the import statement accepts these words as
module names.)

Bangla flavor: `new` is `নতুন`, `table` is `সারণি`, `json` is `জেসন`,
`parse` is `বিশ্লেষণ`. `a new table` reads `একটি নতুন সারণি`.

## 2. JSON: `parse json` and `json of`

```jesun
data is parse json "{\"name\": \"Jesun\", \"tags\": [\"ai\", \"data\"]}"
show data["tags"][0]            note ai
back is json of data
show back                       note {"name":"Jesun","tags":["ai","data"]}
```

Rules:

- `parse json text` reads one JSON value. Objects become tables, arrays
  become lists, `null` becomes `nothing`. Bad input is a plain-English
  error with a character position:
  `Line 2: that text is not valid JSON (it breaks at character 7).`
- `json of value` writes canonical JSON: objects (tables) with keys in
  insertion order, no spaces, non-ASCII escaped as `\uXXXX`, numbers as
  JSON numbers (`1.0` stays `1.0`, never `1`). Text escapes `"`, `\`,
  and control characters.
- `json of` refuses values with no JSON shape (functions, agents,
  terminals, database handles, foreign objects):
  `Line 5: I cannot turn a function into JSON.`
- Round trip: `parse json (json of v)` deeply equals `v` for tables,
  lists, text, numbers, true/false, nothing.
- The self-hosted interpreter (`jesun.jc`) implements the same JSON
  reader and writer in Jesun.Code itself; the differential suite keeps
  both byte-identical on the pinned corpus.

## 3. jweb: the framework (`bring in "jweb"`)

jweb is a standard-library package: `packages/jweb/jweb.jc` in the repo,
resolved by `bring in "jweb"` with no download. Its bridge imports are
raw primitives only: `socket` (raw sockets), `builtins` (bytes, int, len,
getattr, chr, tuple), `uuid` (random 128-bit session ids), and `sys`
(stderr for handler-failure logging). Every bit of framework logic
(request parsing, routing, sessions, responses) is Jesun.Code. A minimal app:

```jesun
bring in "jweb"

to hello with request
    name is request["query"]["name"]
    if name is nothing then
        name is "stranger"
    give back "<h1>Hello, " + name + "!</h1>"

add_route with "GET /hello" and hello
serve with 8080
```

Run it with `jesun app.jc`, open http://localhost:8080/hello?name=Jesun.

### 3.1 Routes

- `add_route with "METHOD /path" and handler` registers a handler. The handler
  is a one-input function; the request table is its input.
- Paths may carry `:name` segments: `add_route with "GET /users/:id" and show_user`
  then `request["params"]["id"]` is the segment text.
- First registered route wins when two patterns match. No match gives a
  plain 404 page ("nothing lives at /here").
- Method match is exact (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`).

### 3.2 Requests

The handler receives one table:

| key | value |
|---|---|
| `method` | `"GET"` etc. |
| `path` | `"/hello"` (no query string) |
| `query` | table of query parameters (URL-decoded) |
| `headers` | table of headers, names lowercased |
| `cookies` | table of cookie name to value |
| `body` | request body as text (`""` when none) |
| `params` | table of `:name` path parameters |

Repeated query keys keep the last value. Malformed percent-escapes are
kept as-is, never an error.

### 3.3 Responses

- Giving back text answers `200` with `content-type: text/html; charset=utf-8`.
- Giving back a table answers with control:
  `{"status": 404, "body": "missing", "headers": {"content-type": "text/plain"}}`.
  Missing keys default: status 200, empty headers table, body `""`.
- `redirect_to with "/there"` gives back the 302 table for that path.
- Handler failures never kill the server: the client gets a plain-English
  500 page and the failure is logged to stderr with the route and line.
- Bodies are capped at 1 MiB; a bigger body gets a plain `413` answer.
  Headers are capped at 100 lines / 64 KiB total.

### 3.4 Sessions

```jesun
to visit with request
    s is session_of with request
    n is s["visits"]
    if n is nothing then
        n is 0
    s["visits"] is n + 1
    give back "visit number " + text of s["visits"]
```

- `session_of with request` gives a table backed by the `jesun_session`
  cookie. The table auto-saves when the handler gives back.
- Default store is in-memory (gone when the server stops). A sqlite-backed
  store is a documented extension (see section 4 example).
- Cookie values are random 128-bit ids; ids are validated before use.

### 3.5 Static files

`serve_files with "public" and "/static"` registers a route serving files under
the `public` folder at `/static/...`. `..` segments and absolute paths
are rejected with `403`; unknown extensions get
`application/octet-stream`. Directory listings are never served.

## 4. sqlite (`bring in "sqlite"`)

A standard-library package (`packages/sqlite/sqlite.jc`). Its only bridge
import is `sqlite3`; all API shaping is Jesun.Code.

```jesun
bring in "sqlite"

db is open_database with "app.db"
db_run with db and "CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY, task TEXT, done INTEGER)" and nothing
db_run with db and "INSERT INTO todos (task, done) VALUES (?, ?)" and ["Buy milk", 0]
rows is db_query with db and "SELECT id, task, done FROM todos" and nothing
for each r in rows
    show r["task"]
close_database with db
```

Rules:

- `open_database with path` opens (creating) a sqlite file. The path must stay
  inside the working folder: absolute paths and `..` are refused in
  plain English (same sandbox rule as file I/O).
- `db_run with db and sql and params` / `db_query with db and sql and params`
  run one statement / give back a list of tables (column name to value;
  NULL becomes `nothing`). Jesun.Code has no optional or overloaded
  parameters, so a bare statement passes `nothing` for params:
  `db_run with db and sql and nothing` (amended 2026-09-26: the two-arg
  form in the first draft of this spec cannot exist in the language).
- Parameters are `?` placeholders with a list of values. Never build SQL
  by joining user text; the docs say so and the example shows the `?` way.
- Exactly one statement per call; a second statement is refused
  (`Line 6: run one SQL statement per call; this text holds 2.`).
- Every database error speaks plain English with the line number, never
  a traceback.
- `close_database with db` closes the handle. Using a closed handle is a
  plain-English error.

## 5. Standard-library packages

`bring in "name"` now resolves in two places, in order:

1. The installed packages dir (`~/.jesun-code/packages`, or
   `JESUN_CODE_HOME`), as before.
2. The standard library: `packages/` next to the interpreter
   (`python jesun.py` from source, or bundled with the `jesun` binary).

`jweb` and `sqlite` ship as standard-library packages. `use` (fetch from
GitHub) is unchanged and still only for third-party packages.

## 6. Test plan (spec 9.2a: everything differential-green)

- `tests/test_v12.py`: tables (literal, get/set, missing key, `keys of`,
  `contains`, nesting, deep equality, reference sharing, `show`
  rendering, errors), JSON (parse/stringify, canonical forms, round
  trip, error positions, refusals), `attempt` (ok/fail shapes, exact error
  text, signal passthrough, nesting, Bangla), stdlib `bring in` (jweb and
  sqlite resolve without download).
- Self-host fixtures: `tests/fixtures/selfhost/table_*.jc`,
  `json_*.jc`; the differential harness runs each through bootstrap and
  `jesun.jc`.
- jweb live tests: servers started on loopback ports in subprocesses,
  exercised with raw socket clients (no network dependency); routes,
  params, query, JSON API, sessions (cookie round trip), 404/500/413,
  static files with `..` rejection. Run through both interpreters.
- sqlite live tests: temp-dir databases; CRUD, params, NULL to nothing,
  multi-statement refusal, sandbox escape refusal, closed-handle error.
- Fuzzer: table/JSON syntax added to `tests/fuzz.py`; differential fuzz
  for the JSON reader against Python's `json` on generated inputs.
- Full suite green after every chunk: `python3 -m unittest discover -s tests`.

## 7. `attempt`: failure as a value (added 2026-09-26, required by section 3.3)

`attempt <expr>` evaluates the expression and never fails itself. It gives
back a table:

```jesun
outcome is attempt risky_call
if outcome["ok"] then
    show outcome["value"]
otherwise
    show "it broke: " + outcome["error"]
```

- Success: `{"ok": true, "value": <the value>}`.
- Failure: `{"ok": false, "error": "Line 5: <the plain-English message>"}`.
  The error text is exactly what the program would have printed.
- Only plain-English failures (`fail`, unknown names, type errors, bridge
  errors) are caught. Control signals (`give back`, `stop`, `skip`) pass
  through untouched: `attempt` around a function that gives back still
  gives back.
- `attempt` nests: an inner `attempt` catches first.
- Bangla: `চেষ্টা`.

Why it exists: section 3.3 promises that a failing jweb handler gets a
500 page instead of killing the server. Jesun.Code has no try/catch, so
the framework needs this one primitive. It is a core language feature
(implemented in the bootstrap and in `jesun.jc`), not a bridge cheat:
the walker's evaluator hands its operand AST (plain data) to a
guarded-call service in the bootstrap, which runs the walker's own
evaluator on it with the in-flight environment recovered from the call
stack, and turns a plain-English failure into data. No user program
text ever reaches Python. Both interpreters agree byte for byte.

## 8. Examples

- `examples/hello_web.jc`: the minimal app from section 3 (verified live).
- `examples/todo.jc`: a todo list app: sqlite storage, sessions for a
  visitor counter, JSON API at `/api/todos`, HTML at `/`. The v1.2
  flagship demo: a practical tool, not a toy.
