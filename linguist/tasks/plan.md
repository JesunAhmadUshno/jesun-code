# Implementation Plan: Linguist recognition bundle

Source: `linguist/SPEC.md`. Method: planning-and-task-breakdown.

## Overview

Bring the Linguist submission bundle to industry grade: a self-validating
bundle, a push-ready grammar-repo payload, hardened samples, and a clean
commit. The two external gates (grammar-repo creation tap, Ruby tooling run)
stay explicitly out of scope for this build.

## Architecture decisions

- `validate.py` is the bundle's executable spec: every claim in SPEC.md's
  testing strategy becomes an assertion. No claim without a check.
- `grammar-repo/` is a complete repo payload, not notes: Jesun's tap
  becomes `git init && git push`, nothing else.
- Grammar stays byte-identical to the VS Code extension source; the
  payload copies it at build time.

## Task list

### Phase 1: Executable spec

- [ ] Task 1: Write `linguist/validate.py` (6 assertions from SPEC.md)
- [ ] Task 2: Run it, fix failures, commit bundle

### Checkpoint: bundle validates

- [ ] `python3 linguist/validate.py` green on clean checkout

### Phase 2: Grammar-repo payload

- [ ] Task 3: Build `linguist/grammar-repo/` (grammar copy, MIT LICENSE,
        package.json, README with Linguist attribution)

### Phase 3: Samples + docs

- [ ] Task 4: Harden samples (each parses via repo interpreter; record
        line counts; drop anything toy-like)
- [ ] Task 5: Update `linguist/README.md` status (collision cleared,
        SPEC.md pointer, remaining gates)

### Checkpoint: complete

- [ ] All SPEC.md success criteria achievable except the two external gates
- [ ] Review (five-axis + security) done, findings addressed
- [ ] Bundle committed; no uncommitted changes

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Grammar has only 7 top-level patterns; reviewers may call highlighting thin | Med | Payload documents pattern count honestly; extension grammar is the canonical source and improves independently |
| Upstream wants broader adoption evidence | Med | PR body preempts with file count + code-search link; cannot resolve here |
| `jesun.py --check` flag may not exist | Low | validate.py falls back to a non-executing parse via the interpreter API |

## Open questions

- Which machine runs the Ruby tooling (carried from SPEC.md Q2).
