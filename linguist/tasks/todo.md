# Tasks: Linguist recognition bundle

## Task 1: Write linguist/validate.py

**Description:** Implement the 6 assertions from SPEC.md testing strategy
as an executable self-check.

**Acceptance criteria:**
- [ ] Parses languages.yml and asserts type/color/extensions/tm_scope/ace_mode
- [ ] Checks .jc against live upstream languages.yml (cached copy OK)
- [ ] Parses grammar JSON, asserts scopeName == source.jesun
- [ ] Each sample parses via the repo interpreter without executing
- [ ] Greps bundle for secret patterns, fails on hits
- [ ] Asserts grammar-repo/ payload completeness

**Verification:** `python3 linguist/validate.py` exits 0 on current tree.

**Dependencies:** None. **Files:** `linguist/validate.py`. **Scope:** S.

## Task 2: Run validate.py, fix, commit bundle

**Description:** Green the validator, then commit the whole linguist/
directory (SPEC.md, plan, tasks, validator).

**Acceptance criteria:**
- [ ] validate.py green
- [ ] `git status --porcelain linguist/` empty after commit

**Verification:** `git log --oneline -1 -- linguist/` shows the commit.

**Dependencies:** Task 1. **Files:** `linguist/`. **Scope:** S.

## Task 3: Build linguist/grammar-repo/ payload

**Description:** Complete push-ready payload for
JesunAhmadUshno/jesun-code-tmlanguage: grammar copy (byte-identical to
editors/vscode/syntaxes/jesun-code.tmLanguage.json), MIT LICENSE,
package.json (name/version/engines), README with Linguist attribution.

**Acceptance criteria:**
- [ ] Grammar file present and byte-identical to VS Code source
- [ ] LICENSE is MIT with Jesun.Ai attribution
- [ ] package.json valid JSON with name jesun-code-tmlanguage
- [ ] README explains the repo exists to vendor the grammar to Linguist

**Verification:** validate.py payload assertions pass.

**Dependencies:** Task 1. **Files:** `linguist/grammar-repo/`. **Scope:** S.

## Task 4: Harden samples

**Description:** Confirm each sample parses via the interpreter, record
line counts in README, replace anything toy-like with real repo code.

**Acceptance criteria:**
- [ ] All samples parse without executing
- [ ] No sample is a hello-world; each demonstrates real syntax
- [ ] Line counts recorded

**Verification:** validate.py sample assertions pass.

**Dependencies:** Task 1. **Files:** `linguist/samples/`. **Scope:** S.

## Task 5: Update linguist/README.md status

**Description:** Status section reflects reality: collision cleared
2026-10-01, SPEC.md is the contract, validate.py is the gate, remaining
gates are the tap + Ruby tooling.

**Acceptance criteria:**
- [ ] Status section current and dated
- [ ] No stale blocker claims

**Verification:** Read-through matches repo state.

**Dependencies:** Tasks 2-4. **Files:** `linguist/README.md`. **Scope:** XS.
