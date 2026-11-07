# Research review: Jesun.Code

A review of this repo against a PhD-style rubric for a programming-language
contribution, written 2026-11-07 at v2.0.0. Jesun.Code is a product (a
language, two interpreters, a C transpiler, tooling), so engineering rigor
is graded alongside research rigor. Grades: **strong**, **adequate**,
**weak**, **missing**. Every number here comes from a committed file named
next to it.

## Summary

The engineering is unusually disciplined for a solo language: a second
interpreter written in the language itself, a differential protocol that
holds it to byte-identical output, and a checker that refuses untagged
tests. The research claim is not yet evaluated: "reads like plain English"
is a design goal with no study behind it. This pass fixed the cheap gaps
(machine-readable results, a benchmark, a core grammar, a counting bug,
related work, a live dashboard) and names what the rest would cost.

## Rubric

| Criterion | Grade | Evidence | Gap and what closes it |
| :--- | :--- | :--- | :--- |
| Research question | weak | README: "If a sentence makes sense to a person, it should make sense to the machine." | Stated as a slogan, not a testable question. Closing it: write one, for example "Do first-time programmers write correct Jesun.Code programs faster, and understand its error messages better, than Python?" |
| Hypotheses | missing | None written. | Pre-register 2 or 3 hypotheses with effect sizes before any study (see Method). Cost: writing only. |
| Method | missing (user claim) / strong (self-hosting claim) | Self-hosting: `tests/selfhost_harness.py` runs every program through `python jesun.py` and `python jesun.py jesun.jc` and compares exit code and stdout. | Readability needs a human study: about 30 to 60 novices, randomized to Jesun.Code or Python, 4 to 6 short tasks, measuring correctness, time, and error-message comprehension. Needs ethics approval and participant time, no compute. |
| Baselines | weak | Now: `results/bench.json` compares the bootstrap, the self-hosted walker and plain CPython on 3 programs. | No readability baseline (Python, Hedy, Quorum). The benchmark lacks the native C path: add a `jesun build` leg to `scripts/bench.py` on a machine with `cc` (seconds of compute). |
| Statistics and uncertainty | weak | Bench reports a median of 5 fresh-process runs and keeps all 5 raw times. Classification is a census, not a sample. | No spread or interval is reported for timings. Cheap: report min/max or a bootstrap interval from the raw runs already stored. A user study would need a pre-registered analysis (mixed-effects model on task correctness). |
| Reproducibility | adequate | `python3 tests/check_classification.py --json` and `python3 scripts/bench.py` regenerate `results/`; CI now fails if the classification drifts; the dashboard's build re-derives every number (`dashboard/scripts/check.mjs`). | The full suite takes over 5 minutes locally, so "all green" rests on CI. Per-module timings are not recorded: run each `tests/test_*.py` separately in CI with `time` and commit the table (about 10 minutes of CI). |
| Threats to validity | adequate | Pinned gaps, divergences and exclusions are documented per test with spec references (`results/classification.json`). The dashboard has a limitations window. | Missing: construct validity of "plain English" (whose English? native and non-native speakers, Bangla speakers for the Bangla flavor). Needs the user study above, with participant language recorded. |
| Related work | weak (was missing) | README "Related work" now names COBOL, HyperTalk, AppleScript, Inform 7, Hedy and Quorum. | No literature review. Closing it: a 1 to 2 page review of natural-language programming and novice-language evaluation (Pane and Myers on non-programmers' natural expression, Stefik and Siebert on syntax and novices, Hermans on Hedy), read from the papers, not from memory. |
| Limitations | adequate | ROADMAP "Honest framing" and "What v0.x is, honestly" sections in README. | Self-hosting has 46 pinned exclusions, 8 gaps and 2 divergences with no plan or metric to close them. Closing it: a tracked issue per bucket and a target count per release. |
| Formal definition | weak (was missing) | `docs/grammar-v0.1.md`: EBNF for the v0.1 core and four parser-resolved ambiguities, each checked against `jesun.py`. | Only the core is covered and nothing checks the EBNF mechanically. Closing it: generate a parser from the EBNF with a PEG tool and run it on `examples/` and the test fixtures against `jesun.py` (minutes of CPU). |

## Engineering rigor

| Criterion | Grade | Evidence | Gap |
| :--- | :--- | :--- | :--- |
| Test suite | strong, with one break | 23 modules, 767 `def test_` methods; 711 loaded and classified. | `tests/test_platform_arcade.py` imports `platform_harness`, which was never committed (its first commit, `9eee806`, already lacks it), so its 64 tests never run and the full CI suite errors on import. Closing it: commit the harness, or mark the module a pinned exclusion until it exists. Needs the author's harness code. |
| Differential testing | strong | 655 of 711 classified tests are differential-green. The dashboard repeats the protocol live in the browser. | None beyond the pinned buckets above. |
| Counting honesty | fixed in this pass | `check_classification.py` used to count the failed import as one differential-green test (712 / 656). It now reports load errors separately (711 / 655). | ROADMAP and release notes still carry hand-typed per-release counts. Closing it: generate them at release time from `results/classification.json`. |
| Performance | weak (was missing) | `results/bench.json`: on a 20000-step loop the self-hosted walker takes 2415 ms against 75 ms for the bootstrap (about 32 times), on one aarch64 machine. | Tiny programs, one machine. Closing it: a small benchmark set (10 programs, including string and list work) on two machines, under a minute each. |
| Coverage | missing | None measured. | Run `coverage run -m unittest discover -s tests` in CI and commit the summary (about 10 minutes of CI, no paid service). |
| Fuzzing | weak | 7 `tests/fuzz*.py` scripts exist. | Not in CI, no recorded run counts or findings. Closing it: a nightly CI job with a fixed seed and iteration count, writing `results/fuzz.json`. |
| Security | adequate | jpm refuses `..` escapes and uses timeouts (ROADMAP v0.4); the walker refuses to read outside its folder. | No threat model for the Python bridge, which runs arbitrary Python by design. Writing one is documentation only. |

## Blocked or not shown

- v3.0 Serve and the playground soak are unreleased and blocked on the
  founder (ROADMAP "Blocked on the founder"). No soak numbers exist, so
  none are shown anywhere.
- Game tick medians quoted in commit messages (for example the v3 town
  commit) are not in a results file, so the dashboard does not show them.
  Closing it: have the game bridge suite write its timings to
  `results/`.

## What changed in this pass

1. `tests/check_classification.py --json` writes `results/classification.json`, and stops counting a failed import as a passing test.
2. `scripts/bench.py` writes `results/bench.json`.
3. `docs/grammar-v0.1.md` adds a core EBNF with checked ambiguities.
4. README: live dashboard link, corrected test receipts, related work.
5. CI checks that the classification results stay current; `pages.yml` builds the dashboard next to the product site.
6. `dashboard/`: the live dashboard, whose build fails if any number on it stops matching the repo.
