/* Bridge test: overworld 3D scene build under Node+Pyodide, exact driver flow.
   Boots, enables gl3d, pumps the same press/tick tokens the driver sends,
   asserts cam3do + knight + terrain in the display list, measures ms/tick. */
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
  if (pyodide.globals.get('BOOT_ERROR')) throw new Error('boot: ' + pyodide.globals.get('BOOT_ERROR'));
  const parse = (raw) => JSON.parse(raw);
  const startFn = pyodide.globals.get('start_game');
  const pumpFn = pyodide.globals.get('pump');
  const run = (src) => pyodide.runPythonAsync(src);

  // enable the WebGL path exactly like the driver boot does
  let res = parse(startFn(424242, 2));
  check('boot ok', res.ok);
  await run('jesun.run_source(\'G["gl3d"] is true\', interp)');
  res = parse(await (async () => { await run('jesun.run_source("tick", interp)'); return (await run('_snap()')); })());
  check('tick ok with gl3d', res.ok, res.error || '');
  const ops = res.dl.map(c => c[0]);
  check('cam3do emitted', ops.includes('cam3do'));
  const models = res.dl.filter(c => c[0] === 'model3d').map(c => c[1]);
  check('knight model emitted', models.includes('knight'));
  const texes = new Set(res.dl.filter(c => c[0] === 'quad3d').map(c => c[13]));
  check('grass terrain emitted', texes.has('grass'));
  check('hud over3d flag', res.hud.over3d === 1);

  // walk around the overworld with driver tokens, time each tick
  const keys = ['w', 'a', 's', 'd', 'space', 'e', 'q'];
  let ms = [];
  for (let i = 0; i < 120; i++) {
    const k = keys[i % keys.length];
    const t0 = Date.now();
    res = parse(pumpFn([k]));
    ms.push(Date.now() - t0);
    if (!res.ok) { check('pump tick ' + i, false, res.error); break; }
  }
  ms.sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  check('120 overworld-3D ticks, zero errors', res.ok);
  console.log(`overworld-3D scene build: avg ${avg.toFixed(1)}ms/tick, p95 ${ms[Math.floor(ms.length * 0.95)].toFixed(1)}ms/tick (budget 120ms)`);
  check('avg under 120ms budget', avg < 120);

  // FPP 3D still works after the shared renderGL refactor (enter dungeon, M)
  await run('jesun.run_source("enter_dungeon", interp)');
  res = parse(pumpFn(['m']));
  const ops2 = res.dl.map(c => c[0]);
  check('dungeon FPP emits cam3d', ops2.includes('cam3d'));
  const tex2 = new Set(res.dl.filter(c => c[0] === 'quad3d').map(c => c[13]));
  check('dungeon floor/wall quads intact', tex2.has('floor') && tex2.has('wall'));

  console.log(failures === 0 ? 'ALL GREEN' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
