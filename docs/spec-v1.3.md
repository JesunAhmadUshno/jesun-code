{% raw %}
<!-- Pages note: this spec documents {{ }}/{% %} template syntax, so the whole file is wrapped in raw tags. GitHub Pages renders every .md through Liquid (optional-front-matter default); an unclosed {{ fails the build. Keep the wrapper. -->
# Jesun.Code spec v1.3: frontend (the native frontend stack)

Status: approved by the founder 2026-09-26 22:36 EDT ("Start v1.3 frontend
now"). This supersedes the v1.2 maintenance stand-down.

Founder's law: one language, all solutions. Everything below is written
in Jesun.Code itself, as standard-library packages resolved by
`bring in`. The Python bridge carries no frontend logic at all: the
three packages import nothing, touch no driver, and run identically on
the bootstrap and the self-hosted walker. The bridge never counts as the
solution; here it is not even in the room.

Honest framing: frontend apps run on the `jesun` interpreter (bootstrap
or self-hosted). The packages are interpreter-first; `jesun build`
native transpile support for them is future work (see ROADMAP).

Fuzzer note: v1.3 adds no new syntax and no new keywords, so the grammar
fuzzers need no new shapes. Coverage comes from the differential package
suite (`tests/test_frontend.py`): every case runs through both
interpreters via `InlineSandbox` and must agree byte for byte.

## 1. `html`: the HTML DSL (`bring in "html"`)

`packages/html/html.jc`. Builders return text. Escaping is on by default:
content passed to the convenience builders is HTML-escaped, so pages are
XSS-safe unless the author deliberately composes raw HTML with `element`.

```jesun
bring in "html"

show paragraph with "5 < 6, so this is safe."
note <p>5 &lt; 6, so this is safe.</p>

nav is element with "nav" and nothing and [link_to with "/" and "Home", link_to with "/about" and "About"]
show nav
note <nav><a href="/">Home</a><a href="/about">About</a></nav>

show page with "Hello" and (paragraph with "Hi.")
note <!DOCTYPE html>
note <html>
note <head>
note <meta charset="utf-8">
note <title>Hello</title>
note </head>
note <body>
note <p>Hi.</p>
note </body>
note </html>
```

### 1.1 Functions

- `escape_html with content`: `&` to `&amp;`, `<` to `&lt;`, `>` to
  `&gt;`, `"` to `&quot;` (in that order). Non-text input fails:
  `Line 0: in the "html" package: escape_html needs text, but this is a number.`
- `attrs_text with attrs`: renders a table of attributes as
  ` key="escaped"` pairs in insertion order. `nothing` gives `""`.
  Values of kind text, number, or true/false render as text; `nothing`
  renders as `""`; anything else fails with its kind named.
  A non-table, non-nothing `attrs` fails.
- `element with tag and attrs and children`: `<tag attrs>children</tag>`.
  `tag` must match `[A-Za-z][A-Za-z0-9]*`, else:
  `Line 0: in the "html" package: "9lives" is not a valid HTML tag name.`
  `children` is text (used raw, so `element` calls compose) or a list of
  text (joined). Anything else fails.
- `void_element with tag and attrs`: `<tag attrs>` with no closing tag,
  for `img`, `input`, `br`, `hr`, `meta`, `link`. Same tag/attr rules.
- `text_node with content`: the escaped text, for mixing raw text into
  `element` children: `element with "div" and nothing and [text_node
  with "a < b"]` gives `<div>a &lt; b</div>`.
- Convenience builders (every text argument escaped):
  - `heading with level and content`: `level` 1-6, else
    `Line 0: in the "html" package: a heading level has to be a whole number from 1 to 6.`
  - `paragraph with content`
  - `link_to with url and content`: `<a href="url">content</a>`
  - `image with src and alt`: `<img src="src" alt="alt">`
  - `unordered_list with items` / `ordered_list with items`: `items` is
    a list of text; each item escaped and wrapped in `<li>`.
  - `button with label`: `<button>label</button>`
  - `input_field with name and input_type`:
    `<input type="input_type" name="name">`
  - `form with action and method and content`:
    `<form action="action" method="method">content</form>`; `content` is
    raw (compose it from the builders above).
  - `data_table with headers and rows`: `headers` a list of text,
    `rows` a list of lists of text; renders `<table>` with `<th>` and
    `<td>` cells, all escaped.
  - `style_block with css`: `<style>css</style>`; `css` is code, used raw.
- `page with title and content`: the full document. `title` escaped.
  `content` raw (the page body, composed from builders). Exact shape:
  `<!DOCTYPE html>` then `<html>`, `<head>` with
  `<meta charset="utf-8">` and `<title>`, then `<body>`, the content,
  then the closing tags, each on its own line.

### 1.2 Rules

- Builders never emit a traceback. Every failure is `fail with` at the
  caller's line, tagged `in the "html" package:`.
- No em dashes in emitted HTML or in error text (house rule).
- The package imports nothing: zero bridge, pure Jesun.Code.

## 2. `template`: templates (`bring in "template"`)

`packages/template/template.jc`. Templates are text files (or inline
text) with `{{ }}` placeholders, `{% for %}` loops, and `{% if %}`
conditionals, rendered against a table of data. All substituted values
are HTML-escaped: templates are safe to render with untrusted data.

```jesun
bring in "template"

note In a Jesun.Code string, "{{" renders "{" and "}}" renders "}", so an
note inline template doubles every brace. Real templates live in files
note (render_file) and are written with single braces.
source is "<h1>{{{{title}}}}</h1><ul>{{% for t in todos %}}<li>{{{{t.task}}}}{{% if t.done %}} (done){{% endif %}}</li>{{% endfor %}}</ul>"
data is {"title": "Todos <3", "todos": [{"task": "Buy milk", "done": true}, {"task": "Ship v1.3", "done": false}]}
show render_template with source and data
note <h1>Todos &lt;3</h1><ul><li>Buy milk (done)</li><li>Ship v1.3</li></ul>
```

### 2.1 Tags

- `{{ name }}`: looks up `name` in the data table (whitespace inside the
  braces is ignored). Dotted names walk tables: `{{t.task}}` is
  `data["t"]["task"]`. A missing name, or a `nothing` anywhere on the
  path, renders as `""`. Values of kind text are HTML-escaped; numbers
  and true/false render as text; lists, tables, functions, agents, and
  anything else fail:
  `Line 0: in the "template" package: I cannot put a table into "{{t}}". Use text, numbers, true/false, or nothing.`
- `{% for item in items %} ... {% endfor %}`: `items` resolves like a
  placeholder name and must be a list, else:
  `Line 0: in the "template" package: "{% for %}" needs a list, but "todos" is text.`
  The body renders once per element with `item` bound. Loops nest; the
  innermost binding wins. An empty list renders nothing.
- `{% if name %} ... {% else %} ... {% endif %}`: `name` resolves like a
  placeholder. Falsy is `nothing`, `false`, `""`, and `[]`; everything
  else is truthy. `{% else %}` is optional.
- `render_file with path and data`: reads the file with the
  interpreter's `read file` (its errors surface unchanged), then
  renders. Paths follow the same working-folder rule as file I/O.

### 2.2 Errors

Template syntax errors are `fail with` at the `render_template` /
`render_file` call line, carrying the character position in the
template:

- `Line 0: in the "template" package: "{{" at character 12 is never closed.`
- `Line 0: in the "template" package: "{%" at character 30 is never closed.`
- `Line 0: in the "template" package: "{% for %}" is never closed (character 8).` (same shape for `{% if %}`)
- `Line 0: in the "template" package: I do not know the tag "{% while %}" (character 8).`
- `Line 0: in the "template" package: "{% endfor %}" without "{% for %}" (character 40).`
- `Line 0: in the "template" package: "{% endif %}" without "{% if %}" (character 40).`
- `Line 0: in the "template" package: "{% for %}" needs "item in list" (character 8).`
- A literal `{{` cannot be written in a template in v1.3 (documented
  limit; compose it with the html DSL instead).

### 2.3 Rules

- Same zero-bridge rule as `html`: the package imports nothing.
- Rendering is deterministic: same source and data give byte-identical
  output on both interpreters (pinned by the differential suite).

## 3. `js`: JS interop (`bring in "js"`)

`packages/js/js.jc`. Jesun.Code writes the frontend JavaScript: string
escaping, value serialization, script tags, event wiring, and `fetch`
calls against jweb JSON routes. The JS is text; the browser runs it.
Jesun.Code never executes JS itself.

```jesun
bring in "js"

code is dom_ready with (on_event with "click" and "go" and ("fetch("/api/todos").then(function(r) { return r.json(); });"))
show script_tag with code
note <script>
note document.addEventListener("DOMContentLoaded", function() {
note document.getElementById("go").addEventListener("click", function() {
note fetch("/api/todos").then(function(r) { return r.json(); });
note });
note });
note </script>
```

### 3.1 Functions

- `js_string with content`: a JS string literal (`"..."`). Escapes `\`,
  `"`, newline, carriage return, tab, and `<` (as `\x3c`, which kills
  `</script>` breakout inside script tags). Non-text fails.
- `js_value with value`: a Jesun value as a JS literal. Text becomes
  `js_string`; numbers render as numbers; true/false become
  `true`/`false`; `nothing` becomes `null`; lists become `[...]` and
  tables become `{"k": v}` (keys must be text), nested to a depth of 5
  (deeper fails: `Line 0: in the "js" package: that value nests too deep
  to turn into JavaScript.`). The cap of 5 sits below the self-hosted
  walker's recursion budget, so both interpreters report this error
  instead of their own depth guard. Functions, agents, and anything else fail
  with the kind named.
- `script_tag with code`: `<script>\ncode\n</script>`. `code` is raw JS.
- `dom_ready with code`:
  `document.addEventListener("DOMContentLoaded", function() {\ncode\n});`
- `on_event with event and element_id and code`:
  `document.getElementById("id").addEventListener("event", function() {\ncode\n});`
  The id is embedded with `js_string`, so quotes in ids cannot break out.
- `js_fetch with url and method and body_expr`:
  `fetch("url", {method: "method", headers: {"Content-Type": "application/json"}, body: body_expr})`.
  `body_expr` is a raw JS expression (for example
  `JSON.stringify({task: task})`); `"null"` sends no body. The url and
  method are embedded with `js_string`.

### 3.2 Rules

- The package imports nothing: zero bridge.
- Emitted JS is inert text until a browser runs it; the package makes no
  claim about what the JS does, only that the escaping rules above hold
  (pinned by tests, including a `</script>` breakout attempt).

## 4. Bangla flavor

v1.3 follows the v1.2 precedent: Bangla lives at the keyword level
(shipped in v0.5/v1.0), and the packages expose English function names
like `jweb` and `sqlite` do. No Bangla function aliases in v1.3; the
template `{% %}` and `{{ }}` markers are language-neutral.

## 5. The flagship demo: `examples/todo_frontend.jc`

The v1.2 `todo.jc` rebuilt with a real frontend, all in Jesun.Code:

- `bring in` jweb, sqlite, html, template, js.
- `GET /` renders `examples/todo_template.html` (placeholders, a
  `{% for %}` over the todos, `{% if %}` for the done marker) inside
  `page with`, with the script built by the `js` package: the add form
  posts via `js_fetch` to `POST /api/todos`, and each todo carries a
  toggle button wired by `on_event` to `POST /api/todos/:id/toggle`.
- `POST /api/todos` and `POST /api/todos/:id/toggle` are the v1.2 JSON
  API unchanged.
- Verified live through the frozen binary: serve on a loopback port,
  curl `GET /` (page carries the DSL-built list, the escaped visit
  counter, and the script), curl `POST /api/todos`, curl the toggle,
  curl `GET /` again and see the new todo rendered.

## 6. Test plan (`tests/test_frontend.py`)

Differential through `InlineSandbox` (bootstrap vs `jesun.jc`), like
`test_sqlite.py`:

- html: escaping order (`&` first), `element` composition and raw
  children, `void_element`, `text_node`, every convenience builder,
  `page` exact shape, and every documented error message.
- template: placeholders (spacing, missing, nothing, dotted, escaping),
  for loops (empty, nested, non-list error), if/else (truthy/falsy
  table), every documented syntax error with its position, and
  `render_file` through a real file.
- js: `js_string` escapes including the `</script>` breakout case,
  `js_value` for every kind (nested, too-deep, refusal), `script_tag`,
  `dom_ready`, `on_event`, `js_fetch`.
- One live end-to-end: the demo app serves on a loopback port under
  each interpreter; the page, the API, and the toggle agree.

## 7. Docs and site

README (frontend section), CHANGELOG (v1.3.0 entry), ROADMAP (v1.3
marked shipped on release), the site (version pill, blog release post,
FAQ frontend Q&A, sitemap, llms.txt). Minimum one blog post per
release, in Anvil's voice.
{% endraw %}
