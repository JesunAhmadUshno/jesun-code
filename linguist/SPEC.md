# Spec: GitHub Linguist recognition for Jesun.Code

Method: spec-driven-development (agent-skills). Status: approved for full
pipeline run by founder directive 2026-10-01 ("do all the", industry grade).

## Assumptions (stated up front)

1. The target is github-linguist/linguist `main`, PR from a fork.
2. `.jc` stays unclaimed (verified free 2026-10-01 against live languages.yml).
3. The grammar stays MIT licensed; the repo stays MIT licensed.
4. Creating the public grammar repo needs Jesun's tap (new public repo).
5. Linguist's own Ruby tooling runs on a Ruby machine, not this one.

## Objective

GitHub recognizes `.jc` as the Jesun.Code language: syntax highlighting on
github.com file views and the Jesun.Code language on the repo language bar.
Success is the upstream PR merged and deployed, not the PR opened.

Users: every visitor of the jesun-code repo and every future `.jc` author.

## Tech stack

- Submission entry: YAML snippet for Linguist `lib/linguist/languages.yml`.
- Grammar: TextMate JSON, scope `source.jesun`, vendored via
  `script/add-grammar` from `JesunAhmadUshno/jesun-code-tmlanguage`.
- Samples: real-world `.jc` files, MIT.
- Validation here: Python 3 (stdlib). Upstream gate: Ruby/bundler rake.

## Commands

```
Validate bundle:  python3 linguist/validate.py
Check collision:  python3 linguist/check_collision.py
Commit:           git add linguist/ && git commit -m "linguist: ..."
Upstream (Ruby machine):
  script/add-grammar https://github.com/JesunAhmadUshno/jesun-code-tmlanguage
  script/update-ids
  bundle exec rake test
```

## Project structure

```
linguist/
  SPEC.md            this file
  README.md          bundle overview + status
  languages.yml      entry snippet for upstream languages.yml
  pr_body.md         draft PR body
  samples/           real-world .jc samples (MIT)
  grammar-repo/      payload for JesunAhmadUshno/jesun-code-tmlanguage
  validate.py        bundle self-check (YAML/JSON/samples/collision)
  tasks/plan.md      implementation plan (planning-and-task-breakdown)
  tasks/todo.md      task list
```

## Code style

- YAML: 2-space indent, double-quoted color, extensions listed one per line.
- Grammar JSON stays byte-identical to the VS Code extension grammar;
  improvements land in the extension first, then re-export.
- Samples are real repo code, unmodified except a header comment.

## Testing strategy

`validate.py` asserts, all must pass:

1. `languages.yml` parses; has type/color/extensions/tm_scope/ace_mode.
2. `.jc` claims no other language in the live upstream languages.yml.
3. Grammar JSON parses; `scopeName == "source.jesun"`; >= 1 pattern.
4. Every sample parses as Jesun.Code through the repo interpreter
   (`python3 jesun.py --check` or equivalent non-executing parse).
5. No secrets/tokens in any bundle file (grep for key patterns).
6. `grammar-repo/` payload complete: grammar, LICENSE (MIT), package.json,
   README with Linguist attribution.

Upstream gate (Ruby machine, at PR time): `bundle exec rake test` green.

## Boundaries

- Always: run `validate.py` before any commit touching linguist/;
  keep the grammar byte-identical to the VS Code source.
- Ask first: creating the public grammar repo (Jesun's tap);
  opening the upstream PR (founder decision).
- Never: commit secrets; vendor a grammar with a non-permissive license;
  claim recognition before the upstream merge deploys.

## Success criteria (testable)

- [ ] `validate.py` green on a clean checkout.
- [ ] Grammar repo exists at JesunAhmadUshno/jesun-code-tmlanguage (MIT).
- [ ] Upstream PR opened with template filled; `bundle exec rake test`
      green in the PR's CI.
- [ ] PR merged; github.com highlights `.jc` and the language bar
      shows Jesun.Code (verified live on the repo page).

## Open questions

- Q1: Does the reviewer want broader adoption evidence beyond 164 files
  in one repo? (Cannot answer in advance; PR text preempts it.)
- Q2: Which machine runs the Ruby tooling? (Needs Jesun's call.)
