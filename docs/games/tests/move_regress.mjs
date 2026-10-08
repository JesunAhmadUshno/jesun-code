import { loadPyodide } from 'pyodide';
import fs from 'fs';
import path from 'path';

const GAMES = path.resolve(import.meta.dirname, '..');
const DRIVER = path.join(import.meta.dirname, 'driver.py');
let failures = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' | ' + extra : ''));
  if (!cond) failures++;
}

async function main() {
  const pyodide = await loadPyodide();
  pyodide.FS.mkdirTree('/jc');
  for (const f of ['jesun.py', 'realms.jc']) {
    pyodide.FS.writeFile('/jc/' + f, fs.readFileSync(path.join(GAMES, 'jc', f), 'utf-8'));
  }
  await pyodide.runPythonAsync(fs.readFileSync(DRIVER, 'utf-8'));
  if (pyodide.globals.get('BOOT_ERROR')) throw new Error('boot');
  const parse = (raw) => JSON.parse(raw);
  const startFn = pyodide.globals.get('start_game');
  const pumpFn = pyodide.globals.get('pump');
  const run = (src) => pyodide.runPythonAsync(src);
  const P = async () => { await run('P=(interp.global_env.vars["G"]["px"],interp.global_env.vars["G"]["py"])'); return pyodide.globals.get('P').toString(); };

  // TEST 1: fresh boot, WASD/arrows move the player (driver tokens)
  let res = parse(startFn(424242, 2));
  check('boot ok', res.ok);
  // clear a straight test lane east of spawn for deterministic movement
  await run(`
g = interp.global_env.vars["G"]
grid = g["grid"]
for k in range(1, 6):
    grid[15][15+k] = 0
for n in g["npcs"]:
    n["x"], n["y"] = 5, 5
`);
  const p0 = await P();
  res = parse(pumpFn(['d'])); // driver token for D / ArrowRight
  check('D moves east from fresh boot', (await P()) !== p0, `${p0} -> ${await P()}`);
  const p1 = await P();
  res = parse(pumpFn(['a']));
  check('A moves back west', (await P()) !== p1);
  // W and S: clear lanes
  await run(`grid = interp.global_env.vars["G"]["grid"]
g = interp.global_env.vars["G"]
grid[g["py"]-1][g["px"]] = 0
grid[g["py"]+1][g["px"]] = 0`);
  const p2 = await P();
  res = parse(pumpFn(['w']));
  check('W moves north', (await P()) !== p2);
  const p3 = await P();
  res = parse(pumpFn(['s']));
  check('S moves south', (await P()) !== p3);

  // TEST 2: spawn is never boxed, cave reachable, across seeds
  let boxed = 0, unreach = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r2 = parse(startFn(seed * 131, 2));
    await run(`
g = interp.global_env.vars["G"]
grid = g["grid"]
WALK = (0,3,6,7)
BOXED = all(grid[y][x] not in WALK for x,y in [(15,14),(15,16),(14,15),(16,15)])
seen = set(); stack = [(15,15)]
while stack:
    x,y = stack.pop()
    if (x,y) in seen or not (0<=x<60 and 0<=y<42) or grid[y][x] not in WALK: continue
    seen.add((x,y))
    stack += [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]
CAVE_OK = (50,34) in seen or (51,34) in seen or (50,35) in seen or (51,35) in seen
`);
    if (pyodide.globals.get('BOXED')) boxed++;
    if (!pyodide.globals.get('CAVE_OK')) unreach++;
  }
  check('spawn never boxed (30 seeds)', boxed === 0, `boxed=${boxed}`);
  check('cave reachable (30 seeds)', unreach === 0, `unreachable=${unreach}`);

  // TEST 3: rescue hardening - strand player on water with bad lpx/lpy, WASD must recover
  res = parse(startFn(99, 2));
  await run(`
g = interp.global_env.vars["G"]
grid = g["grid"]
grid[20][20] = 2; grid[20][21] = 2; grid[21][20] = 2
g["px"] = 20; g["py"] = 20; g["lpx"] = 21; g["lpy"] = 20
`);
  const sp0 = await P();
  res = parse(pumpFn(['w']));
  const sp1 = await P();
  // after rescue, player must be on walkable tile
  await run(`
g = interp.global_env.vars["G"]
RW = g["grid"][g["py"]][g["px"]] in (0,3,6,7)
`);
  check('stranded player rescued to walkable', pyodide.globals.get('RW') === true, `${sp0} -> ${sp1}`);
  // and the NEXT move works (no permanent dead state)
  await run(`
g = interp.global_env.vars["G"]
grid = g["grid"]
for dx,dy in [(0,-1),(0,1),(-1,0),(1,0)]:
    grid[g["py"]+dy][g["px"]+dx] = 0
for n in g["npcs"]: n["x"], n["y"] = 5, 5
`);
  const sp2 = await P();
  res = parse(pumpFn(['d']));
  check('movement works after rescue', (await P()) !== sp2);

  // TEST 4: E adjacent to NPC opens dialogue (Elder Marla specifically)
  res = parse(startFn(7, 2));
  await run(`
g = interp.global_env.vars["G"]
marla = [n for n in g["npcs"] if n.get("nkind")=="elder"][0]
g["px"], g["py"] = marla["x"]+1, marla["y"]
marla["tick"] = 0
`);
  res = parse(pumpFn(['e']));
  const talked = JSON.stringify(res.msgs).includes('Elder Marla');
  check('E adjacent to Elder Marla opens dialogue', talked, JSON.stringify(res.msgs).slice(-120));

  // TEST 5: block then wander then E still talks (the reported soft-lock)
  res = parse(startFn(7, 2));
  await run(`
g = interp.global_env.vars["G"]
marla = [n for n in g["npcs"] if n.get("nkind")=="elder"][0]
grid = g["grid"]
grid[20][20] = 0
grid[20][19] = 0
marla["x"], marla["y"] = 20, 20
marla["tick"] = 0
g["px"], g["py"] = 19, 20
for dx,dy in [(0,-1),(0,1),(-1,0),(1,0),(1,-1),(1,1)]:
    if grid[20+dy][20+dx] not in (0,3,6,7): grid[20+dy][20+dx] = 0
`);
  res = parse(pumpFn(['d'])); // walk into Marla -> blocked
  const blocked = JSON.stringify(res.msgs).includes('blocks the way');
  // Marla wanders one tile away before E
  await run(`
g = interp.global_env.vars["G"]
marla = [n for n in g["npcs"] if n.get("nkind")=="elder"][0]
marla["x"], marla["y"] = 21, 21
`);
  res = parse(pumpFn(['e']));
  const talked2 = JSON.stringify(res.msgs).includes('Elder Marla');
  check('blocked by Marla', blocked);
  check('E still talks after she wanders (no soft-lock)', talked2, JSON.stringify(res.msgs).slice(-140));

  // TEST 6: M still works (no regression)
  res = parse(pumpFn(['m']));
  check('M registers', JSON.stringify(res.msgs).includes('open sky'));

  console.log(failures === 0 ? 'ALL GREEN' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FAIL: ' + (e && e.message || e)); process.exit(1); });
