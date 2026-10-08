# REALMS bridge tests

`move_regress.mjs` drives the exact browser bridge flow (the same
`DRIVER_PY` glue from `realms.html`, the same `press`/`tick` tokens the
driver sends) under Node+Pyodide. It boots fresh and asserts:

- WASD tokens move the player from a fresh boot (overworld)
- spawn is never boxed in (30 seeds)
- the cave stays reachable: the meandering river cannot sever the path (30 seeds)
- a stranded player is rescued to walkable ground and keeps moving
- E adjacent to an NPC (Elder Marla) opens dialogue
- E still talks to a blocking NPC after it wanders a step (no soft-lock)
- M still registers

`driver.py` is the extracted driver glue; re-extract it from `realms.html`
if the bridge changes.

Run: `npm i pyodide` once in this directory (or anywhere on the module
path), then `node move_regress.mjs`. All checks must print PASS.
