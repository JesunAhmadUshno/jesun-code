# PR body for github-linguist/linguist — "Add Jesun.Code language"

> Paste into the upstream PR, filling the two pending URLs after the
> grammar repo is created. The usage-evidence section is honest about
> where the numbers stand; do not inflate it.

## Description

Add the Jesun.Code programming language: a plain-English language
(`show "hello"`, `if the count is 0 then`, `give back` instead of
return), self-hosted, compiling to native binaries, with packages for
web (jweb: HTTP server, routing, sessions, SQLite), static site
generation, and frontend interop.

## Checklist

- [ ] **I am adding a new language.**
  - [ ] The extension of the new language is used in hundreds of repositories on GitHub.com.
    - Search results for each extension:
      - https://github.com/search?type=code&q=NOT+is%3Afork+path%3A*.jc+%22give+back%22
    - **Honest status (2026-10-01):** `extension:jc "give back"` (a keyword
      distinctive to Jesun.Code) returns 48 code results across 2
      repositories, both owned by the language author
      (`JesunAhmadUshno/jesun-code`, `JesunAhmadUshno/Jesun_Dev`).
      The "hundreds of repositories" bar is NOT met today. The broader
      `extension:jc` search returns ~1,176 results, but those are
      overwhelmingly another language (jacy, HouQiming) plus editor
      config files, not Jesun.Code.
  - [x] I have included a real-world usage sample for all extensions added in this PR:
    - Sample source(s):
      - `samples/todo.jc` — a todo-list web app on jweb: SQLite storage,
        sessions, a JSON API and HTML from one file (56 lines).
      - `samples/sitegen_demo.jc` — a static site generator run: builds
        a multi-page site with sitemap, robots.txt and llms.txt, then
        self-verifies (78 lines).
      - `samples/time.jc` — a stdlib package source file (17 lines).
    - Sample license(s): MIT (written for this submission).
  - [ ] I have included a syntax highlighting grammar:
        https://github.com/JesunAhmadUshno/jesun-code-tmlanguage
        (PENDING: repo to be created from
        `editors/vscode/syntaxes/jesun-code.tmLanguage.json`, MIT)
  - [x] I have added a color
    - Hex value: `#0C9463`
    - Rationale: the language's brand emerald, used across the project
      site and editor theme.
  - [ ] I have updated the heuristics to distinguish my language from others using the same extension.
    - Not required: no language currently in `languages.yml` claims
      `.jc` (verified 2026-10-01 against upstream main). Real-world
      `.jc` usage by jacy exists outside Linguist; if maintainers want
      a heuristic, one can be added distinguishing `give back` /
      `bring in` / `to <name>` (Jesun.Code) from jacy's
      `import "..."` / `__c_function` style.

## languages.yml entry (alphabetical: between JCL and JFlex)

```yaml
Jesun.Code:
  type: programming
  color: "#0C9463"
  extensions:
    - ".jc"
  tm_scope: source.jesun
  ace_mode: text
```

`language_id` omitted per CONTRIBUTING.md ("Omit the language_id field
for now"); assigned by `script/update-ids` at PR time. Expected value
for `Jesun.Code` per the script's algorithm
(`SHA256(name) mod (2**30 - 1)`): 303685207.

## Local verification done (2026-10-01)

- Bundle validator: 27/27 green (`python3 linguist/validate.py`).
- Grammar parses as JSON, scope `source.jesun`, 7 top-level patterns,
  byte-identical to the VS Code source.
- Upstream `script/update-ids` algorithm reproduced in Python;
  expected id 303685207 recorded above.
- Upstream test suite (`bundle exec rake test`) and
  `script/add-grammar` still need a Ruby machine; Ruby is not installed
  on this VM (apt has no ruby package). Run before submitting.
