/* Bridge test: REALMS 3D Jesun.Code edition under Node+Pyodide.
   Boots realms3d.jc through the real driver flow, pumps ticks, asserts the
   display-list contract (chunks, env, cam, models), movement, streaming,
   and measures ms per tick (steady state and chunk-build ticks). */
import { loadPyodide } from 'pyodide';
import fs from 'fs';
import path from 'path';

const GAMES = path.resolve(import.meta.dirname, '..');
let failures = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' | ' + extra : ''));
  if (!cond) failures++;
}

async function main() {
  const pyodide = await loadPyodide();
  pyodide.FS.mkdirTree('/jc');
  for (const f of ['jesun.py', 'realms3d.jc']) {
    pyodide.FS.writeFile('/jc/' + f, fs.readFileSync(path.join(GAMES, 'jc', f), 'utf-8'));
  }
  await pyodide.runPythonAsync(fs.readFileSync(path.join(GAMES, 'tests', 'driver3d.py'), 'utf-8'));
  if (pyodide.globals.get('BOOT_ERROR')) throw new Error('boot: ' + pyodide.globals.get('BOOT_ERROR'));
  const parse = (raw) => JSON.parse(raw);
  const startFn = pyodide.globals.get('start_game');
  const pumpFn = pyodide.globals.get('pump');

  let t0 = performance.now();
  let res = parse(startFn(424242));
  const startMs = performance.now() - t0;
  check('boot + first tick ok', res.ok, res.error || '');
  const bootHud = res.hud;
  const seedOp = res.dl.find((c) => c[0] === 'seed');
  check('seed op emitted on first tick with the world seed', !!seedOp && seedOp[1] === 424242, seedOp ? String(seedOp[1]) : 'missing');
  const ops = res.dl.map((c) => c[0]);
  const chunks = res.dl.filter((c) => c[0] === 'chunk');
  check('exactly 1 chunk op on first tick (one build per tick)', chunks.length === 1, 'got ' + chunks.length);
  check('chunk heights are 81', chunks.every((c) => c[3].length === 81));
  check('chunk props are a list', chunks.every((c) => Array.isArray(c[4])));
  // The radius-2 window (25 chunks) fills one build per scan pass: scans run
  // on chunk change or every 20 ticks, so idle pumping fills it slowly.
  const seenFill = new Set(chunks.map((c) => c[1] + ',' + c[2]));
  let totalProps = 0;
  for (let i = 0; i < 520; i++) {
    res = parse(pumpFn([]));
    for (const c of res.dl.filter((x) => x[0] === 'chunk')) { seenFill.add(c[1] + ',' + c[2]); totalProps += c[4].length; }
  }
  check('radius-2 window fills to 25 chunks', seenFill.size === 25, 'got ' + seenFill.size);
  check('props exist across the window', totalProps > 40, 'got ' + totalProps);
  check('env op present', ops.includes('env'));
  check('cam op present', ops.includes('cam'));
  const models = res.dl.filter((c) => c[0] === 'model');
  check('player model present', models.some((m) => m[1] === 'player'));
  check('6 wolf models present', models.filter((m) => m[1] === 'wolf').length === 6);
  check('hud hp 100 at boot', bootHud.hp === 100, 'got ' + bootHud.hp);
  check('hud clock format', /^\d\d:\d\d$/.test(bootHud.clock), bootHud.clock);
  check('hud hostiles 6', bootHud.hostiles === 6);
  const p0 = models.find((m) => m[1] === 'player');
  console.log('INFO first tick (seed + 1 chunk build) ms: ' + startMs.toFixed(1));

  // Movement: hold W for 30 ticks (1 s). Heading starts 235, so x falls, z rises.
  let steadyMs = 0;
  for (let i = 0; i < 30; i++) {
    t0 = performance.now();
    res = parse(pumpFn(['w']));
    steadyMs += performance.now() - t0;
  }
  check('walk ticks ok', res.ok, res.error || '');
  const p1 = res.dl.find((c) => c[0] === 'model' && c[1] === 'player');
  check('player moved forward', p1[3] < p0[3] - 2 && p1[5] > p0[5] + 1,
    'from (' + p0[3].toFixed(1) + ',' + p0[5].toFixed(1) + ') to (' + p1[3].toFixed(1) + ',' + p1[5].toFixed(1) + ')');
  console.log('INFO steady tick ms avg: ' + (steadyMs / 30).toFixed(2));

  // Streaming: keep walking; new chunks must arrive and old ones leave.
  const seen = new Set(chunks.map((c) => c[1] + ',' + c[2]));
  let newChunks = 0, goneChunks = 0, buildMs = 0, buildTicks = 0;
  for (let i = 0; i < 500; i++) {
    t0 = performance.now();
    res = parse(pumpFn(['w']));
    const ms = performance.now() - t0;
    const nc = res.dl.filter((c) => c[0] === 'chunk');
    if (nc.length) { buildMs += ms; buildTicks++; }
    for (const c of nc) { const k = c[1] + ',' + c[2]; if (!seen.has(k)) { newChunks++; seen.add(k); } }
    goneChunks += res.dl.filter((c) => c[0] === 'chunkgone').length;
  }
  check('streamed new chunks while walking', newChunks >= 3, 'new ' + newChunks);
  check('evicted old chunks while walking', goneChunks >= 3, 'gone ' + goneChunks);
  if (buildTicks) console.log('INFO chunk-build tick ms avg: ' + (buildMs / buildTicks).toFixed(1) + ' over ' + buildTicks + ' ticks');

  // Time: 300 idle ticks = 10 s of game time = 30 clock minutes of a 480 s day... dayfrac step is 1/14400 per tick, so 300 ticks is 0.0208 of a day = 30 min.
  const clock0 = res.hud.clock;
  for (let i = 0; i < 300; i++) res = parse(pumpFn([]));
  check('clock advanced after 300 ticks', res.hud.clock !== clock0, clock0 + ' -> ' + res.hud.clock);

  // Combat plumbing: attack key must not error; wolves must still tick.
  res = parse(pumpFn(['f']));
  check('attack tick ok', res.ok, res.error || '');
  check('wolves still modeled', res.dl.some((c) => c[0] === 'model' && c[1] === 'wolf'));

  console.log(failures === 0 ? 'ALL GREEN' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('ERROR', e); process.exit(1); });
