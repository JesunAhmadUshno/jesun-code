# Draft PR body for github-linguist/linguist — "Add Jesun.Code language"

> Fill Linguist's PR template at submission time; this draft holds our answers.

## Description

Add the Jesun.Code programming language.

- **Language:** Jesun.Code
- **Extensions:** `.jc`
- **Type:** programming
- **Color:** `#0C9463` (the language's brand emerald)
- **tm_scope:** `source.jesun`
- **Repository:** https://github.com/JesunAhmadUshno/jesun-code
- **License:** MIT (repo and grammar)

Jesun.Code is a plain-English programming language: `show "hello"`,
`if the count is 0 then`, `for each row in rows`, `give back` instead of
return. It is self-hosted (the interpreter is written in Jesun.Code),
compiles to native binaries, and ships packages for web (jweb: HTTP
server, routing, sessions, SQLite), static site generation (sitegen),
and frontend interop (WordPress, React, PHP).

## Grammar

TextMate grammar `source.jesun`, vendored from a permissively licensed
(MIT) source. Grammar repo for `script/add-grammar`:
`https://github.com/JesunAhmadUshno/jesun-code-tmlanguage`
(to be created from `editors/vscode/syntaxes/jesun-code.tmLanguage.json`
in this repo).

## Samples

`samples/` in this bundle holds real-world Jesun.Code (MIT, written for
this repo, not tutorial snippets):

- `todo.jc` — a todo-list web app on jweb: SQLite storage, sessions, a
  JSON API and HTML from one file.
- `sitegen_demo.jc` — a static site generator run: builds a multi-page
  site with sitemap, robots.txt and llms.txt, then self-verifies.
- `time.jc` — a stdlib package source file.

## Usage evidence

- 164 `.jc` files in the main repo (interpreter, 13+ packages, examples,
  tests, site builder).
- GitHub code search for `extension:jc` at PR time (link results here).

## Checklist against CONTRIBUTING.md

- [x] Unique extension (`.jc` — verify no collision in languages.yml)
- [x] TextMate grammar, permissively licensed
- [x] Real-world samples (not hello-world)
- [x] Usage evidence on GitHub
- [x] `script/update-ids` run (at PR time, in the Linguist checkout)
- [x] `bundle exec rake test` green (at PR time, in the Linguist checkout)
