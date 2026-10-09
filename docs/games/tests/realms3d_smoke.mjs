/* REALMS 3D headless smoke-test harness (QA-GAP-1).
   Boots the real realms3d.html module script in Node against vendored
   three@0.160.0 with stubbed browser globals (see realms3d_stub.mjs), then
   drives the real entry points and asserts behavior. Production file is never
   modified; the harness extracts and rewrites a COPY of the module source.

   Run: node realms3d_smoke.mjs   (from docs/games/tests/)
   Every check prints PASS or FAIL. Exit code is non-zero if any check fails.
*/

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from './vendor/three.module.js';
import { installStubs } from './realms3d_stub.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = join(HERE, '..', 'realms3d.html');
const BOOT = join(HERE, '.r3d_boot.mjs');

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log('PASS - ' + name);
  else { failures++; console.log('FAIL - ' + name + (detail ? ' :: ' + detail : '')); }
}

/* ---------- static file checks (STANDARDS.md) ---------- */
const html = readFileSync(HTML, 'utf8');
check('static: no TODO/FIXME markers', !/\b(TODO|FIXME)\b/.test(html));
check('static: no em dashes', !html.includes('—'));
{
  const urls = [...new Set(html.match(/https?:\/\/[^"' )]+/g) || [])];
  const ok = urls.length === 1 && urls[0] === 'https://unpkg.com/three@0.160.0/build/three.module.js';
  check('static: single allowed CDN URL', ok, urls.join(', '));
}

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
/* ---- QA-GAP-1 test shim: exposes module internals to the harness.
        Appended to the extracted COPY only; realms3d.html is untouched. ---- */
globalThis.__R3D = {
  tick, startMission, currentTarget, damageEnemy, shoot, fireTracer,
  carEnter, carExit, openShop, closeShop, buyItem,
  busEnter, busExit, busTakeWheel, busRebuildRoute, busDoorWorld, mountToggle,
  busDwellService, BUSNPC, BUS,
  saveGame, loadSave, collectSave, newGame, setHeat, playing, terrainHeight,
  MS, MISSIONS, SHOP_ITEMS, SHOPS, WEAPONS, CAR, P, player, camera, keys,
  enemies, tracers, enemyMeshes, objRing, objIcon,
  SAVE_KEY,
  DIFF, diffEval, animals,
  get cash() { return cash; }, set cash(v) { cash = v; },
  get kills() { return kills; }, set kills(v) { kills = v; },
  get curWeapon() { return curWeapon; }, set curWeapon(v) { curWeapon = v; },
  get fireCd() { return fireCd; }, set fireCd(v) { fireCd = v; },
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
  check('boot: module imports and runs to tick()', !!G);
} catch (e) {
  console.log('FAIL - boot: module threw :: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  process.exit(1);
} finally {
  try { unlinkSync(BOOT); } catch (e) {}
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function frame(n) {
  for (let i = 0; i < n; i++) { stubs.clock.advance(16.667); G.tick(); }
}
const groundY = (x, z) => G.terrainHeight(x, z);

/* ================= 1. MISSION ACTIVATION ================= */
{
  G.P.godT = 9999; G.P.dead = false; G.P.hp = 100;
  const cash0 = G.cash, kills0 = G.kills;
  check('mission: starts IDLE', G.MS.state === 'IDLE' && G.MS.idx === -1);
  G.startMission(0);                                   // real entry: FIRST BLOOD
  check('mission: accept activates state', G.MS.state === 'ACTIVE' && G.MS.idx === 0);
  frame(3);
  check('mission: objective marker visible', G.objRing.visible === true && G.currentTarget() !== null);
  // simulate the objective through the real kill path: 2 rushers + 1 shooter
  const victims = [G.enemies[0], G.enemies[1], G.enemies[2]];
  const alive = victims.every(e => e.state !== 'dead');
  const expectedPay = 25 + 25 + 35;                    // rusher/rusher/shooter
  if (alive) for (const e of victims) G.damageEnemy(e, 999);
  check('mission: 3 kills via damageEnemy', alive && victims.every(e => e.state === 'dead'));
  check('mission: completion flips state + done flag',
    G.MS.state === 'IDLE' && G.MS.idx === -1 && G.MS.done[0] === true);
  check('mission: reward cash lands (100 mission + 85 kills)',
    G.cash === cash0 + 100 + expectedPay && G.kills === kills0 + 3,
    'cash=' + G.cash + ' expected=' + (cash0 + 185));
  G.setHeat(0, true);                                  // kills added heat; keep later tests clean
}

/* ================= 2. CAR DRIVE ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999;
  const px = G.CAR.pos.x + 2, pz = G.CAR.pos.z;
  G.player.position.set(px, groundY(px, pz), pz);       // inside the 4u enter radius
  frame(1);
  G.carEnter();                                        // real entry
  check('car: enter puts player inside', G.CAR.driving === true && G.player.visible === false);
  const start = G.CAR.pos.clone();
  G.keys.KeyW = true;
  frame(120);                                          // ~2 s of arcade-physics driving
  G.keys.KeyW = false;
  const moved = G.CAR.pos.distanceTo(start);
  check('car: 120 frames of throttle moves the car', moved > 5, 'moved=' + moved.toFixed(2) + 'u');
  check('car: still driving, player hidden', G.CAR.driving === true && G.player.visible === false);
  G.carExit();                                         // real exit
  check('car: exit returns player on foot',
    G.CAR.driving === false && G.player.visible === true);
}

/* ================= 3. SHOP PURCHASE ================= */
{
  G.newGame();                                         // clean slate: cash 0, no weapons
  G.cash = 1000;
  const S = G.SHOPS[0];                                // PATCH CLINIC at spawn
  G.player.position.set(S.x, groundY(S.x, S.z), S.z);  // walk into the trigger
  let opened = false;
  for (let i = 0; i < 40 && !opened; i++) { frame(1); opened = G.shopOpen; }
  check('shop: proximity opens the panel', opened);
  G.buyItem(0);                                        // cheapest gun: SHOTGUN $300
  check('shop: buys cheapest gun, exact price deducted',
    G.cash === 700 && G.WEAPONS.shotgun.owned === true && G.curWeapon === 'shotgun',
    'cash=' + G.cash);
  G.cash = 10;
  G.buyItem(1);                                        // SMG $500, cannot afford
  check('shop: unaffordable purchase refused, cash unchanged',
    G.cash === 10 && G.WEAPONS.smg.owned === false, 'cash=' + G.cash);
  G.closeShop();
}

/* ================= 4. SAVE / LOAD ROUND-TRIP ================= */
{
  G.player.position.set(12.34, groundY(12.34, 56.78), 56.78);
  G.cash = 1234; G.kills = 7; G.P.hp = 100;
  G.saveGame();                                        // real path -> localStorage stub
  const raw = stubs.localStorage.getItem(G.SAVE_KEY);
  check('save: envelope written to localStorage', !!raw && raw.includes('"cash":1234'));
  G.cash = 0; G.kills = 0;
  G.player.position.set(0, groundY(0, 0), 0);
  G.loadSave();                                        // real path
  check('save/load: position round-trips exactly',
    G.player.position.x === 12.34 && G.player.position.z === 56.78,
    'x=' + G.player.position.x + ' z=' + G.player.position.z);
  check('save/load: cash and kills round-trip exactly',
    G.cash === 1234 && G.kills === 7, 'cash=' + G.cash + ' kills=' + G.kills);
}

/* ================= 5. WEAPON TRACER KILLS ================= */
{
  G.curWeapon = 'rifle'; G.fireCd = 0;
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999;
  G.setHeat(0, true);
  // park every other enemy far away so the ray hits only our target
  for (const e of G.enemies) {
    if (e !== G.enemies[4]) e.group.position.set(100, groundY(100, -100), -100);
  }
  const brute = G.enemies[4];                          // $60 reward type
  check('tracer: target brute is live', brute.type === 'brute' && brute.state !== 'dead');
  frame(3);                                            // settle camera + instanced matrices
  // place the brute on the screen-center ray, past the player, and probe the
  // exact hitscan until the brute is the first living hit
  const dir = G.camera.getWorldDirection(new THREE.Vector3());
  const camPos = G.camera.position.clone();
  const chest = G.player.position.clone(); chest.y += 1.9;
  const baseD = camPos.distanceTo(chest);
  const rc = new THREE.Raycaster(); rc.far = 90;
  const center = new THREE.Vector2(0, 0);
  let placed = false;
  for (const extra of [5, 6, 4, 7, 3, 8]) {
    const tp = camPos.clone().addScaledVector(dir, baseD + extra);
    brute.group.position.set(tp.x, groundY(tp.x, tp.z), tp.z);
    frame(2);                                          // re-pose instanced matrices
    rc.setFromCamera(center, G.camera);
    const hits = rc.intersectObjects(G.enemyMeshes, false);
    const first = hits.map(h => h.object.userData.enemyOf[h.instanceId])
      .find(ee => ee && ee.state !== 'dead');
    if (first === brute) { placed = true; break; }
  }
  check('tracer: brute placed on the live fire ray', placed);
  for (const t of G.tracers) t.life = 0;               // clear any stray tracer life
  const cash0 = G.cash, kills0 = G.kills;
  brute.hp = 1;
  G.fireCd = 0;
  G.shoot();                                           // real fire path, aim forced by placement
  check('tracer: shot spawns a live tracer', G.tracers.some(t => t.life > 0));
  check('tracer: brute takes damage and dies', brute.state === 'dead');
  check('tracer: kill credits exact brute reward ($60)',
    G.kills === kills0 + 1 && G.cash === cash0 + 60,
    'cash delta=' + (G.cash - cash0));
}

/* ================= 6. BUS ROUTE + BOARD + DRIVE ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999; G.cash = 100;
  G.setHeat(0, true);
  G.player.position.set(0, groundY(0, 0), 0);          // anchor chunk (0,0)
  frame(3);                                            // busUpdate builds the route
  check('bus: route activates near spawn', G.BUS.active === true && G.BUS.route.length >= 2,
    'stops=' + G.BUS.route.length);
  const r1 = JSON.stringify(G.BUS.route), key1 = G.BUS.routeKey;
  G.BUS.anchorCx = 1e9; G.BUS.routeKey = '';            // force a rebuild on next frame
  frame(1);
  check('bus: route is deterministic on revisit',
    G.BUS.routeKey === key1 && JSON.stringify(G.BUS.route) === r1);
  check('bus: stop labels carry the route number',
    G.BUS.route.every(s => s.label.indexOf(String(G.BUS.routeNo)) === 0),
    'no=' + G.BUS.routeNo);
  // walk to the door while the bus dwells at its first stop
  const door = G.busDoorWorld();
  G.player.position.set(door.x, groundY(door.x, door.z), door.z);
  frame(2);
  check('bus: board prompt appears at the door', G.BUS.hintOn === true);
  G.busEnter();                                        // real entry
  check('bus: boarding rides + charges $2 fare',
    G.BUS.riding === true && G.player.visible === false && G.cash === 98,
    'cash=' + G.cash);
  G.mountToggle();                                     // E while riding: take the wheel
  check('bus: E while riding takes the wheel',
    G.BUS.driving === true && G.BUS.riding === false);
  const start = G.BUS.pos.clone();
  G.keys.KeyW = true;
  frame(90);                                           // ~1.5 s of bus-throttle driving
  G.keys.KeyW = false;
  const moved = G.BUS.pos.distanceTo(start);
  check('bus: player-driven bus moves under throttle', moved > 3, 'moved=' + moved.toFixed(2) + 'u');
  G.mountToggle();                                     // E while driving: get off
  check('bus: E while driving exits on foot',
    G.BUS.driving === false && G.BUS.riding === false && G.player.visible === true);
  // NPC passengers: park an NPC at the door and run the dwell service
  const origRandom = Math.random;
  Math.random = () => 0.99;                            // never alight: isolate boarding
  const door2 = G.busDoorWorld();
  const npc0 = G.BUSNPC.npcs[0];
  npc0.pos.set(door2.x, G.terrainHeight(door2.x, door2.z), door2.z);
  npc0.state = 'IDLE';
  G.busDwellService();
  check('bus: nearby NPC boards during dwell',
    G.BUS.boarded.length === 1 && G.BUS.passengers === 1 && npc0.busRidden === true,
    'boarded=' + G.BUS.boarded.length);
  const hideCalls = [];
  const origHide = G.BUSNPC.hideNPC;
  G.BUSNPC.hideNPC = (i, hide) => { hideCalls.push([i, hide]); origHide(i, hide); };
  Math.random = () => 0;                               // always alight
  G.busDwellService();
  Math.random = origRandom;
  G.BUSNPC.hideNPC = origHide;
  check('bus: alighting NPC is unhidden at the door',
    hideCalls.some(c => c[0] === 0 && c[1] === false) && npc0.state === 'WALK');
}

/* ================= 7. HIGHER IQ (Phase 3) ================= */
{
  const resetBrains = () => {
    for (const e of G.enemies) {
      e.seeT = 0; e.scanT = 0; e.wasSpotted = false; e.live = false;
      e.aware = false; e.aggroT = 0; e.attackCd = 0; e.state = 'wander';
      e.hp = e.cfg.hp; e.speed = 0; e.stagger = 0; e.kbT = 0; e.coverT = 0;
      e.group.position.set(100, G.terrainHeight(100, -100), -100);
    }
    G.DIFF.tier = 0; G.DIFF.kills = 0; G.DIFF.deaths = 0; G.DIFF.dmg = 0; G.DIFF.t = 0;
    G.P.dead = false; G.P.hp = 100; G.P.godT = 9999;
    G.setHeat(0, true);
    G.player.position.set(0, G.terrainHeight(0, 0), 0);
  };

  /* 7a. flank: at tier 1+, the non-leader engaged enemy strafes wide */
  resetBrains();
  G.DIFF.tier = 1;
  const e0 = G.enemies[0], e1 = G.enemies[1];   // rushers: idx 0 leads, idx 1 flanks
  e0.group.position.set(-3, G.terrainHeight(-3, 20), 20);
  e1.group.position.set(3, G.terrainHeight(3, 20), 20);
  G.damageEnemy(e0, 1); G.damageEnemy(e1, 1);   // aggroT=6 on both, both alive
  frame(45);
  const flankX = e1.group.position.x;
  check('ai: flank offset applied to non-leader',
    e1.live === true && flankX < 1.4,
    'x=' + flankX.toFixed(2) + ' live=' + e1.live + ' (straight charge would sit near x=2.3)');

  /* 7b. wounded retreat: a brute under 30% HP kites away from the player */
  resetBrains();
  const brute = G.enemies[4];
  brute.group.position.set(0, G.terrainHeight(0, 10), 10);
  const wd0 = Math.hypot(brute.group.position.x, brute.group.position.z);
  G.damageEnemy(brute, 7);                       // hp 8 -> 1 (< 30%): wounded, aggroT=6
  frame(60);
  const wd1 = Math.hypot(brute.group.position.x, brute.group.position.z);
  check('ai: wounded retreat moves away', wd1 > wd0 + 1,
    'd0=' + wd0.toFixed(2) + ' d1=' + wd1.toFixed(2));

  /* 7c. backup: a spotter alerts enemies within 40m to the last known pos */
  resetBrains();
  G.DIFF.tier = 2;                               // backup unlocks at tier 2+
  const spotter = G.enemies[0], backup = G.enemies[2];
  spotter.group.position.set(0, G.terrainHeight(0, 15), 15);
  backup.group.position.set(35, G.terrainHeight(35, 30), 30);   // 46u from player, 38u from spotter
  frame(60);   // spotter holds LoS for 1s (>= 0.45s reaction) -> calls backup
  const lkD = Math.hypot(backup.lastKnown.x, backup.lastKnown.z);
  check('ai: backup alerts converge on last known position',
    backup.aggroT > 0 && lkD < 2,
    'aggroT=' + backup.aggroT.toFixed(2) + ' lastKnown=(' +
    backup.lastKnown.x.toFixed(1) + ',' + backup.lastKnown.z.toFixed(1) + ')');

  /* 7d. difficulty tier responds to the rolling stats */
  resetBrains();
  G.diffEval();
  const tierCalm = G.DIFF.tier;
  G.DIFF.kills = 10;                             // dominant: score 20 -> tier 3
  G.diffEval();
  const tierHot = G.DIFF.tier;
  const chipHot = stubs.getEl('diffchip').textContent;
  G.DIFF.kills = 0; G.DIFF.deaths = 2; G.DIFF.dmg = 100;   // struggling: score -10 -> tier 0
  G.diffEval();
  const tierCold = G.DIFF.tier;
  check('ai: difficulty tier responds to stats',
    tierCalm === 0 && tierHot === 3 && tierCold === 0 && chipHot === 'AI TIER 3',
    'tiers=' + tierCalm + '/' + tierHot + '/' + tierCold + ' chip=' + chipHot);
  resetBrains();

  /* 7e. NPC flee targets an amenity center when wanted heat > 0 */
  globalThis.__lastShotAt = 0; globalThis.__lastViolenceAt = 0;   // isolate the heat path
  G.setHeat(1, true);
  frame(5);
  const n6 = G.BUSNPC.npcs[6];                   // spawn-zone walker
  const tgt = G.BUSNPC.nearestAmenity(n6.pos.x, n6.pos.z);
  const fleeOk = n6.state === 'FLEE' && tgt !== null &&
    Math.abs(n6.fleeTX - tgt.x) < 0.01 && Math.abs(n6.fleeTZ - tgt.z) < 0.01;
  check('ai: NPC flee targets an amenity center', fleeOk,
    'state=' + n6.state + ' tgt=' + (tgt ? tgt.x.toFixed(1) + ',' + tgt.z.toFixed(1) : 'null'));
  G.setHeat(0, true);

  /* 7f. animal herd separation: two cows pushed together drift apart */
  G.BUS.active = false; G.BUS.speed = 0;         // park the bus: isolate herd steering
  const cows = G.animals.filter(a => a.kind === 'cow');
  const c0 = cows[0], c1 = cows[1];
  c0.pos.set(60, G.terrainHeight(60, 60), 60);
  c1.pos.set(60.5, G.terrainHeight(60.5, 60), 60);
  for (const c of [c0, c1]) {
    c.fleeT = 0; c.grazeT = 0; c.mode = 'walk'; c.t = 999;
    c.target.set(90, 0, 60); c.trotT = 0; c.mountLocked = false;
  }
  const sep0 = Math.hypot(c0.pos.x - c1.pos.x, c0.pos.z - c1.pos.z);
  frame(120);
  const sep1 = Math.hypot(c0.pos.x - c1.pos.x, c0.pos.z - c1.pos.z);
  check('ai: animal herd separation maintained', sep0 < 1 && sep1 >= 1.5,
    'sep0=' + sep0.toFixed(2) + ' sep1=' + sep1.toFixed(2));
  resetBrains();
}

/* ---------- zero console errors ---------- */
check('boot+tests: zero console errors/warnings in stub env',
  consoleProblems.length === 0, consoleProblems.slice(0, 3).join(' | '));

console.error = origErr; console.warn = origWarn;
console.log(failures === 0 ? 'SMOKE RESULT: ALL GREEN' : 'SMOKE RESULT: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
