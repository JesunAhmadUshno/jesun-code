# Contributing to Jesun.Code

Short version: keep it human.

- Every user-visible word must read like plain English. Errors say
  `Line N:` followed by a sentence a person would say. No tracebacks,
  no leaked internals, ever.
- No em dashes anywhere in code, docs, or strings. Use hyphens, colons,
  or commas.
- The standard library is the only dependency of `jesun.py`.
  Type-hint everything.
- Every bug fix ships with a regression test. Every new feature ships
  with example programs and tests asserting byte-exact output.
- Run the full suite before pushing: `python3 -m unittest discover -s tests`
- Update the spec in `docs/` and the `README.md` tour when the language
  changes. Update `CHANGELOG.md`.
- The spec is the contract. If the code and the spec disagree, fix the
  code, or change the spec deliberately and say why.
