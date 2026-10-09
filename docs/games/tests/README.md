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

## REALMS 3D headless smoke tests (QA-GAP-1)

`realms3d_smoke.mjs` boots the real `realms3d.html` module script in Node
against vendored `three@0.160.0` (`vendor/three.module.js`, npm dist, no
network) with browser globals stubbed by `realms3d_stub.mjs`
(document/canvas/localStorage/AudioContext/requestAnimationFrame/performance/
pointer lock; WebGLRenderer replaced by a no-op stub). The module is extracted
from a COPY of the HTML; `realms3d.html` itself is never modified. It drives
the real entry points and asserts, each printing PASS/FAIL, non-zero exit on
any FAIL:

- static: 0 TODO/FIXME, 0 em dashes, single allowed CDN URL
- boot: module imports and runs to tick() with zero console errors/warnings
- mission: startMission(0) activates, objective marker shows, 3 kills via
  damageEnemy complete it and land $100 + $85 kill pay
- car: carEnter within the 4u radius, 120 frames of throttle move the car,
  carExit puts the player back on foot
- shop: proximity opens the panel, cheapest gun buys for exactly $300,
  a $500 buy at $10 cash is refused with cash unchanged
- save/load: position/cash/kills round-trip exactly through localStorage
- tracer: rifle shot at a ray-placed brute spawns a tracer, kills it,
  credits exactly $60

Run: `node realms3d_smoke.mjs`. All checks must print PASS.
