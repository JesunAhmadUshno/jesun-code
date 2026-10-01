# GitHub Linguist submission bundle — Jesun.Code

Goal: GitHub recognizes `.jc` as the Jesun.Code language, with syntax
highlighting on github.com and the language showing on the repo's
language bar. That is what "GitHub acknowledges our language" means in
practice.

## What is ready

- `languages.yml` — the entry snippet for Linguist's `languages.yml`.
- `samples/` — three real-world `.jc` files (MIT): a jweb todo app, a
  sitegen site build, a stdlib package source.
- `pr_body.md` — draft PR body with our answers filled in.
- Grammar source: `editors/vscode/syntaxes/jesun-code.tmLanguage.json`
  (`source.jesun`, MIT licensed, ships in the VS Code extension).

## What is NOT done yet (blockers, in order)

1. **Grammar repo.** Linguist vendors grammars with
   `script/add-grammar <grammar-repo-url>`. Create
   `JesunAhmadUshno/jesun-code-tmlanguage` from the VS Code grammar
   (MIT), then reference it. (Needs Jesun's tap: new public repo.)
2. **Extension collision check.** Verify `.jc` is not already claimed in
   Linguist's `languages.yml`. If it is, we need a disambiguation
   heuristic in `heuristics.yml` plus two samples per language.
3. **Usage evidence.** Linguist only adds extensions with sufficient
   usage on GitHub. We have 164 `.jc` files in one repo (2026-09-30);
   gather the `extension:jc` code-search link at PR time. If reviewers
   want broader adoption, the PR waits until more repos use `.jc`.
4. **Run Linguist's own tooling.** In a Linguist checkout:
   `script/add-grammar`, `script/update-ids`, `bundle exec rake test`.
   Needs Ruby/bundler; do it on a machine with them installed.
5. **Open the PR** with the template filled (draft in `pr_body.md`).

## Timeline expectations (from precedent: IRIS, LUMOS, Zexus)

- Initial review: 1–2 weeks. Revision cycles: 2–4 weeks.
- Merge, if accepted: 1–3 months. GitHub.com deployment: 1–2 weeks
  after merge. This is GitHub's process; we cannot expedite it.

## After acceptance

- Add to the repo's `.gitattributes`:
  `*.jc linguist-language="Jesun.Code" linguist-detectable=true`
- Add the language badge to README.
- Announce it (it is a real milestone: the language bar says Jesun.Code).

## Contract and self-check

- `SPEC.md` is the contract (spec-driven-development).
- `validate.py` is the executable gate: `python3 linguist/validate.py`
  must exit 0 before any commit touching this directory.
- `tasks/plan.md` + `tasks/todo.md` are the plan (planning-and-task-breakdown).

## Status

2026-10-01: industry-grade pass complete. `validate.py` green (26 checks:
entry fields, grammar scope, all 3 samples parse, no secrets, payload
complete). Collision check cleared twice against live upstream
languages.yml: `.jc` unclaimed (evidence:
`collision-check-2026-10-01.txt`). Grammar-repo payload
(`grammar-repo/`) is push-ready.

Remaining external gates: (a) create
`JesunAhmadUshno/jesun-code-tmlanguage` from `grammar-repo/` (needs
Jesun's tap); (b) run Linguist's Ruby tooling (`script/add-grammar`,
`script/update-ids`, `bundle exec rake test`) on a Ruby machine;
(c) open the upstream PR. No PR opened yet.
