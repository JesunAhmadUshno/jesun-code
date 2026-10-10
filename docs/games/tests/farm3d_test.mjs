/* REALMS 3D farming smoke tests (Phase 5 food/farming, 2026-10-09).
   Boots the real realms3d.html module script in Node against vendored
   three@0.160.0 with the same stub harness as realms3d_smoke.mjs, then
   asserts the farming feature. Every check prints PASS/FAIL, non-zero exit
   on any FAIL.

   Run: node farm3d_test.mjs   (from docs/games/tests/)
*/

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from './vendor/three.module.js';
import { installStubs } from './realms3d_stub.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = join(HERE, '..', 'realms3d.html');
const BOOT = join(HERE, '.r3d_farm_boot.mjs');

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log('PASS - ' + name);
  else { failures++; console.log('FAIL - ' + name + (detail ? ' :: ' + detail : '')); }
}

/* ---------- static file checks ---------- */
const html = readFileSync(HTML, 'utf8');
check('farm-static: no TODO/FIXME markers', !/\b(TODO|FIXME)\b/.test(html));
check('farm-static: no em dashes', !html.includes('—'));
check('farm-static: seeded PRNG only (Math.random lines 92 = 91 + 1 boat splash noise)',
  (html.match(/^.*Math\.random.*$/gm) || []).length === 92,
  'lines=' + (html.match(/^.*Math\.random.*$/gm) || []).length);
{
  const imCount = (html.match(/new THREE\.InstancedMesh/g) || []).length;
  check('perf5: 44 IM literals after PERF-5 consolidation (48 - trunks/fol merge - npcLegIM into limbIM - copGuns into limbIM - eBodyBru IM to Mesh)', imCount === 44, 'count=' + imCount);
}
check('farm-static: single renderer.render call site',
  (html.match(/renderer\.render\(/g) || []).length === 1);

/* ---------- console error capture ---------- */
const consoleProblems = [];
const origErr = console.error, origWarn = console.warn;
console.error = (...a) => { consoleProblems.push('error: ' + a.join(' ')); origErr(...a); };
console.warn = (...a) => { consoleProblems.push('warn: ' + a.join(' ')); origWarn(...a); };

/* ---------- extract + rewrite a COPY of the module script ---------- */
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.log('FAIL - extract module script :: no module block found'); process.exit(1); }
let src = m[1];
src = src.replace(
  "import * as THREE from 'three';",
  "import * as THREE from './vendor/three.module.js';"
);
src = src.replace('new THREE.WebGLRenderer', 'new __StubRenderer');
src += `
/* ---- farm test shim: exposes module internals to this harness.
        Appended to the extracted COPY only; realms3d.html is untouched. ---- */
globalThis.__R3D = {
  tick, terrainHeight, playing, toastEl, farmHintEl,
  farmPlotCenterFor, cropStageFor, farmTryHarvest, farmHarvest,
  redistributeFarm, farmRectDist, farmPlotMatureCount, resolveFarmFoot,
  FPLOT, CROP_IM, CROP_MAT, CROP_TIME, ZONE_PADS, FARM_PLOT_CAP,
  FARM_MATURE_NEED, FARM_COOL, FARM_STAGE_LEN, FARM_PER_PLOT,
  farmFallow, farmTryPlant, farmPlant, cycleFarmSeed,   /* Phase 5 farming v1 */
  CROPS, FARM_SEED_ORDER, farmChipEl, updateFarmChip,
  player, P, CAR, HORSE, BUS, TX, BIKE, BC, SC, PET,
  get cash() { return cash; }, set cash(v) { cash = v; },
  get shopOpen() { return shopOpen; },
};
`;
writeFileSync(BOOT, src);

/* ---------- install stubs, then boot the game ---------- */
const stubs = installStubs();
stubs.getEl('overlay').classList.add('hidden');   // dismiss title overlay: playing() true
let G = null;
try {
  await import(pathToFileURL(BOOT).href);
  G = globalThis.__R3D;
  check('farm-boot: module imports and runs to tick()', !!G);
} catch (e) {
  console.log('FAIL - farm-boot: module threw :: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  process.exit(1);
} finally {
  try { unlinkSync(BOOT); } catch (e) {}
}

const groundY = (x, z) => G.terrainHeight(x, z);
function frame(n) {
  for (let i = 0; i < n; i++) { stubs.clock.advance(16.667); G.tick(); }
}
const press = (code) => {
  stubs.fireGlobal('keydown', { code, preventDefault() {} });
  stubs.fireGlobal('keyup', { code });
};

G.P.godT = 9999; G.P.dead = false; G.P.hp = 100;
G.setHeat ? G.setHeat(0, true) : 0;

/* ================= 1. PLOT DETERMINISM ================= */
let plotChunk = null, plot0 = null;
for (let gx = -12; gx <= 12 && !plot0; gx++)
  for (let gz = -12; gz <= 12 && !plot0; gz++) {
    const p = G.farmPlotCenterFor(gx, gz);
    if (p) { plotChunk = [gx, gz]; plot0 = p; }
  }
check('farm: at least one farm plot exists in the surveyed area', !!plot0,
  plotChunk ? 'chunk=' + plotChunk : 'none found');
if (plot0) {
  const again = G.farmPlotCenterFor(plotChunk[0], plotChunk[1]);
  check('farm: plot placement is deterministic (same chunk, same plot)',
    JSON.stringify(plot0) === JSON.stringify(again),
    JSON.stringify(plot0) + ' vs ' + JSON.stringify(again));
  /* revisit purity: redistribute, then the same chunk yields the same plot */
  G.player.position.set(plot0.x, groundY(plot0.x, plot0.z), plot0.z);
  frame(3);   // chunk crossing -> redistributeFarm
  const revisit = G.farmPlotCenterFor(plotChunk[0], plotChunk[1]);
  check('farm: plot is identical after a chunk-crossing revisit',
    JSON.stringify(plot0) === JSON.stringify(revisit));
  const active = G.FPLOT.active.find(p => p.gx === plotChunk[0] && p.gz === plotChunk[1]);
  check('farm: active plots hold the redistributed plot', !!active,
    'active=' + G.FPLOT.active.length);
  check('farm: crop instances are chunk-scoped (plots x 24)',
    G.CROP_IM.count === G.FPLOT.active.length * 24,
    'count=' + G.CROP_IM.count + ' plots=' + G.FPLOT.active.length);
}

/* ================= 2. GROWTH-STAGE PURITY ================= */
{
  const a = G.cropStageFor(3, -2, 5, 100);
  const b = G.cropStageFor(3, -2, 5, 100);
  check('farm: cropStageFor is a pure function (same args, same stage)', a === b, 'a=' + a + ' b=' + b);
  check('farm: stage is always 0..2', a >= 0 && a <= 2);
  const seen = new Set();
  for (let t = 0; t <= 600; t += 5) seen.add(G.cropStageFor(3, -2, 5, t));
  check('farm: stages cycle sprout -> growing -> mature over time',
    seen.has(0) && seen.has(1) && seen.has(2), 'seen=' + [...seen].join(','));
  /* harvest cooldown forces sprout, then expires back to the time-based stage */
  G.FPLOT.harvestT.set('3,-2', 100);
  check('farm: post-harvest cooldown forces stage 0',
    G.cropStageFor(3, -2, 5, 120) === 0, 't=120 hv=100 cool=' + G.FARM_COOL);
  const withCool = G.cropStageFor(3, -2, 5, 200);   // t - hv = 100 > cool: expired
  G.FPLOT.harvestT.delete('3,-2');
  check('farm: expired cooldown returns to the pure time-based stage',
    withCool === G.cropStageFor(3, -2, 5, 200),
    'withCool=' + withCool);
}

/* ================= 3 + 4. HARVEST CASH + E RE-ARM ================= */
if (plot0) {
  const p = G.FPLOT.active.find(q => q.gx === plotChunk[0] && q.gz === plotChunk[1]);
  /* find a farm-clock time with enough mature plants */
  let ripeT = -1;
  for (let t = 0; t <= 600 && ripeT < 0; t += 5) {
    if (G.farmPlotMatureCount(p, t) >= G.FARM_MATURE_NEED) ripeT = t;
  }
  check('farm: a ripe moment exists for the plot', ripeT >= 0, 'ripeT=' + ripeT);
  if (ripeT >= 0) {
    G.FPLOT.t = ripeT;
    G.player.position.set(p.x, groundY(p.x, p.z), p.z);
    frame(15);   // farmTick cadence settles nearIdx / nearMature
    check('farm: E prompt raises near the ripe plot',
      G.FPLOT.nearIdx >= 0 && G.FPLOT.nearMature === true &&
      G.farmHintEl.style.opacity === 1 &&
      G.farmHintEl.textContent === 'HARVEST [E]',
      'nearIdx=' + G.FPLOT.nearIdx + ' mature=' + G.FPLOT.nearMature);
    const cash0 = G.cash;
    press('KeyE');   // the real E path
    const delta = G.cash - cash0;
    check('farm: E harvests the ripe plot (+$15..$25 cash)',
      delta >= 15 && delta <= 25, 'delta=' + delta);
    check('farm: harvest toast fires',
      G.toastEl.textContent.indexOf('HARVEST +$') === 0, G.toastEl.textContent);
    /* E re-arm (farming v1): the same press inside the fallow window replants
       the plot with the selected seed (free). Planting wins over pet-tame. */
    frame(15);   // let the stage repaint + hint recompute see the fallow state
    check('farm: plot is fallow right after harvest',
      G.farmFallow(p, G.FPLOT.t) === true);
    check('farm: fallow hint offers planting',
      G.farmHintEl.textContent === 'PLANT CORN [E]',
      G.farmHintEl.textContent);
    G.PET.hintOn = true;   // a tame prompt is up: planting still wins
    const cash1 = G.cash;
    const planted = G.farmTryPlant();
    G.PET.hintOn = false;
    check('farm: planting wins over pet-tame near a fallow plot', planted === true);
    check('farm: plant toast names the seed', G.toastEl.textContent === 'PLANTED CORN (FREE SEEDS)',
      G.toastEl.textContent);
    check('farm: planting is free (cash unchanged)', G.cash === cash1, 'cash=' + G.cash);
    check('farm: planted type is recorded on the plot',
      G.FPLOT.planted.get(p.gx + ',' + p.gz) === 'corn');
    check('farm: planted plot restarts at sprout',
      G.farmPlotMatureCount(p, G.FPLOT.t) === 0);
    /* the replant window closes after FARM_COOL seconds */
    G.FPLOT.t += G.FARM_COOL + 1;
    frame(15);
    check('farm: fallow window expires after the cooldown',
      G.farmFallow(p, G.FPLOT.t) === false);
    /* past the window the E press is harvest-or-NOT-RIPE again (phase-dependent) */
    const cash2 = G.cash;
    frame(15);
    if (G.FPLOT.nearMature) {
      press('KeyE');
      const d2 = G.cash - cash2;
      check('farm: E harvests the replanted plot once ripe (+$15..$25)',
        d2 >= 15 && d2 <= 25, 'delta=' + d2);
    } else {
      press('KeyE');
      check('farm: E on a growing plot shows NOT RIPE YET, cash unchanged',
        G.toastEl.textContent === 'NOT RIPE YET' && G.cash === cash2,
        'toast=' + G.toastEl.textContent + ' cash=' + G.cash);
    }
  }
}

/* ================= 5. FOOT COLLISION ================= */
if (plot0) {
  const p = G.FPLOT.active.find(q => q.gx === plotChunk[0] && q.gz === plotChunk[1]);
  G.player.position.set(p.x, groundY(p.x, p.z), p.z);   // dead center of the crops
  frame(2);
  const d = G.farmRectDist(p, G.player.position.x, G.player.position.z);
  check('farm: player is pushed out of the plot rect (foot collision)',
    d >= 0.4, 'edgeDist=' + d.toFixed(2) + 'm');
}

/* ================= 6. PERF: 1 RENDER/TICK + SWAY CLOCK ================= */
{
  globalThis.__renderCount = 0;
  const t0 = G.CROP_TIME.value;
  frame(30);
  check('farm: exactly one render per tick', globalThis.__renderCount === 30,
    'renders=' + globalThis.__renderCount);
  check('farm: shader wind clock advances with the tick', G.CROP_TIME.value > t0,
    't0=' + t0.toFixed(2) + ' t1=' + G.CROP_TIME.value.toFixed(2));
}

/* ================= 7. ZERO CONSOLE ERRORS ================= */
check('farm: zero console errors/warnings in stub env', consoleProblems.length === 0,
  consoleProblems.slice(0, 3).join(' | '));

console.log(failures === 0 ? 'FARM SMOKE RESULT: ALL GREEN' : 'FARM SMOKE RESULT: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
