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
{
  const emoteSrc = html.slice(
    html.indexOf('/* ================= EMOTES (Phase 5)'),
    html.indexOf('/* --- melee punch'));
  check('static: emote code creates no THREE objects', emoteSrc.length > 1000 && !/new THREE\./.test(emoteSrc),
    emoteSrc.length + ' chars');
  check('static: single renderer.render call site',
    (html.match(/renderer\.render\(/g) || []).length === 1);
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
  taxiEnter, taxiExit, txRebuild, txDoorWorld, crRebuild, ambRebuild,
  CR, TX, AMB, HORSE, emBodyIM, toastEl, W,
  bikeEnter, bikeExit, bikeRebuild, BIKE, bikeBodyIM, bikeHintEl,
  bcEnter, bcExit, bcRebuild, BC, bcBodyIM, bcHintEl,
  scEnter, scExit, scRebuild, SC, scBodyIM, scHintEl,
  saveGame, loadSave, collectSave, newGame, setHeat, playing, terrainHeight,
  MS, MISSIONS, SHOP_ITEMS, SHOPS, WEAPONS, CAR, P, player, camera, keys,
  enemies, tracers, enemyMeshes, objRing, objIcon,
  SAVE_KEY,
  DIFF, diffEval, animals,
  birds, wingL, wingR, PET, tamePet, releasePet, acquirePrey, petRejoin,
  petHintEl, petChipEl, birdFlockTick,
  get cash() { return cash; }, set cash(v) { cash = v; },
  get kills() { return kills; }, set kills(v) { kills = v; },
  get curWeapon() { return curWeapon; }, set curWeapon(v) { curWeapon = v; },
  get fireCd() { return fireCd; }, set fireCd(v) { fireCd = v; },
  get shopOpen() { return shopOpen; },
  fireEmote, emoteCancel, doPunch, hurtPlayer, EMOTES, EMOTE_ORDER, EMO,
  eyeMesh, pupMesh, mouthMesh, armL, armR, elbowL, elbowR,
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

/* ================= 8. EMERGENCY + SERVICE VEHICLES (Phase 5) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999; G.cash = 100;
  G.setHeat(0, true);
  G.player.position.set(0, groundY(0, 0), 0);          // anchor chunk (0,0)
  frame(3);                                            // emUpdate builds all three units
  check('em: cruiser patrol activates',
    G.CR.active === true && G.CR.patrol.length === 6 && G.CR.pursuing === false,
    'stops=' + G.CR.patrol.length);
  const p1 = JSON.stringify(G.CR.patrol);
  G.CR.anchorCx = 1e9; G.CR.routeKey = '';             // force a rebuild on next frame
  frame(1);
  check('em: cruiser patrol is deterministic on revisit',
    G.CR.routeKey === '0,0' && JSON.stringify(G.CR.patrol) === p1);
  check('em: taxi route activates',
    G.TX.active === true && G.TX.route.length >= 2, 'stops=' + G.TX.route.length);
  const t1 = JSON.stringify(G.TX.route);
  G.TX.anchorCx = 1e9; G.TX.routeKey = '';             // force a rebuild on next frame
  frame(1);
  check('em: taxi route is deterministic on revisit',
    G.TX.routeKey === '0,0' && JSON.stringify(G.TX.route) === t1);
  check('em: ambulance pad placed', G.AMB.placed === true,
    'pad=(' + G.AMB.x.toFixed(1) + ',' + G.AMB.z.toFixed(1) + ')');
  const ax = G.AMB.x, az = G.AMB.z;
  G.AMB.key = '';                                      // force a rebuild on next frame
  frame(1);
  check('em: ambulance pad is deterministic on revisit',
    Math.abs(G.AMB.x - ax) < 1e-9 && Math.abs(G.AMB.z - az) < 1e-9);
  check('em: one shared body InstancedMesh holds all three units',
    G.emBodyIM.isInstancedMesh === true);

  /* cruiser pursuit at heat >= 1 */
  G.setHeat(1, true);
  frame(30);
  check('em: cruiser pursues at heat >= 1', G.CR.pursuing === true);

  /* bust pressure: park the cruiser on the player, pressure must rise */
  G.P.godT = 0;
  G.CR.pos.set(G.player.position.x + 5, 0, G.player.position.z);
  G.CR.pos.y = G.terrainHeight(G.CR.pos.x, G.CR.pos.z);
  frame(20);
  check('em: bust pressure rises within 8m at heat >= 1', G.CR.bustPress > 0,
    'press=' + G.CR.bustPress.toFixed(3));
  check('em: pull-over toast fires on contact',
    G.toastEl.textContent.indexOf('PULL OVER') >= 0, G.toastEl.textContent);
  /* force the bust: pressure at 1 triggers the existing BUSTED hook */
  const cashBefore = G.cash;
  G.CR.bustPress = 1;
  frame(2);
  check('em: bust pressure at 1 triggers BUSTED (heat 0, cash seized)',
    G.W.heat === 0 && G.cash < cashBefore,
    'heat=' + G.W.heat + ' cash=' + G.cash);

  /* ambulance triage: teleport to the pad; hysteresis keeps it there */
  G.P.godT = 9999; G.P.hp = 50; G.P.dead = false;
  const padX = G.AMB.x, padZ = G.AMB.z, padY = G.AMB.y;
  G.BUS.active = false; G.BUS.speed = 0;               // park the bus: isolate the toast check
  G.BUS.anchorCx = Math.floor(padX / 48); G.BUS.anchorCz = Math.floor(padZ / 48);
  G.player.position.set(padX, padY, padZ);
  frame(2);
  check('em: ambulance pad sticks under the player (no chunk-cross pop)',
    Math.abs(G.AMB.x - padX) < 1e-9 && Math.abs(G.AMB.z - padZ) < 1e-9,
    'moved=' + Math.hypot(G.AMB.x - padX, G.AMB.z - padZ).toFixed(2));
  frame(120);                                          // ~2 s on the pad: 4 HP/s
  check('em: triage regen heals inside 10m', G.P.hp > 50 && G.P.hp <= 58.5,
    'hp=' + G.P.hp.toFixed(1));
  G.AMB.toastT = 5.9; G.AMB.healed = 12;               // toast is due almost now
  frame(20);
  check('em: triage HUD toast fires',
    G.toastEl.textContent.indexOf('TRIAGE +') >= 0, G.toastEl.textContent);

  /* taxi: board prompt, $5 fare, exit */
  G.P.hp = 100; G.cash = 100; G.P.godT = 9999;
  G.player.position.set(0, groundY(0, 0), 0);          // anchor chunk (0,0)
  frame(3);
  const s0 = G.TX.route[0];
  G.TX.pos.set(s0.x, G.terrainHeight(s0.x, s0.z), s0.z);
  G.TX.speed = 0; G.TX.stopIdx = 0; G.TX.heading = 0;  // hold it at the stop
  const door = G.txDoorWorld().clone();
  G.player.position.set(door.x, groundY(door.x, door.z), door.z);
  frame(2);                                            // anchor may rebuild: taxi holds position
  check('em: taxi board prompt appears at the door', G.TX.hintOn === true);
  G.taxiEnter();                                       // real entry
  check('em: taxi boarding rides + charges $5 fare',
    G.TX.riding === true && G.player.visible === false && G.cash === 95,
    'cash=' + G.cash);
  check('em: taxi fare toast',
    G.toastEl.textContent.indexOf('TAXI FARE $5 PAID') >= 0, G.toastEl.textContent);
  G.mountToggle();                                     // E while riding: get out
  check('em: E while riding exits the taxi',
    G.TX.riding === false && G.player.visible === true);
  G.setHeat(0, true);
}

/* ================= 9. EMOTES (Phase 5) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.CAR.driving = false; G.HORSE.riding = false;
  G.BUS.driving = false; G.BUS.riding = false; G.TX.riding = false;
  G.player.visible = true;
  const press = (code) => {
    stubs.fireGlobal('keydown', { code, preventDefault() {} });
    stubs.fireGlobal('keyup', { code });
  };
  const order = ['wave', 'dance', 'laugh', 'angry', 'cheer', 'bow'];
  const names = ['WAVE', 'DANCE', 'LAUGH', 'ANGRY', 'CHEER', 'BOW'];
  const codes = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyG', 'KeyB'];
  let keysOk = true, keysDetail = '';
  for (let i = 0; i < 6; i++) {
    press(codes[i]);
    if (G.EMO.key !== order[i] || G.toastEl.textContent !== names[i]) {
      keysOk = false; keysDetail = codes[i] + '->' + G.EMO.key; break;
    }
  }
  check('emote: all six keys fire their emote + toast', keysOk, keysDetail);
  check('emote: six emotes authored in the data table',
    G.EMOTE_ORDER.length === 6 && Object.keys(G.EMOTES).length === 6);
  /* pose: wave raises the right arm off the locomotion baseline */
  G.fireEmote('wave'); frame(30);
  check('emote: wave raises the right arm (partial-body overlay)',
    G.EMO.key === 'wave' && G.armR.rotation.x < -1.0,
    'armRx=' + G.armR.rotation.x.toFixed(2));
  /* interrupt: a new trigger restarts, no stacking */
  const tBefore = G.EMO.t;
  G.fireEmote('dance');
  check('emote: trigger interrupts and restarts',
    G.EMO.key === 'dance' && G.EMO.t === 0 && tBefore > 0,
    'tBefore=' + tBefore.toFixed(2));
  /* combat wins: punch and firing kill the emote instantly */
  G.fireEmote('wave'); frame(10);
  G.doPunch();
  check('emote: punch cancels emote instantly', G.EMO.key === null);
  frame(40);                                            // let the punch finish
  G.fireEmote('cheer'); frame(5);
  G.fireCd = 0; G.shoot();
  check('emote: firing cancels emote instantly', G.EMO.key === null);
  /* taking a hit cancels */
  G.fireEmote('bow'); frame(5);
  const hp0 = G.P.hp;
  G.hurtPlayer(5);
  check('emote: taking a hit cancels emote',
    G.EMO.key === null && G.P.hp === hp0 - 5, 'hp=' + G.P.hp);
  G.P.hp = 100; G.P.dead = false;
  /* guards: no emote while driving or dead */
  G.CAR.driving = true;
  G.fireEmote('wave');
  check('emote: blocked while driving', G.EMO.key === null);
  G.CAR.driving = false;
  G.P.dead = true;
  G.fireEmote('wave');
  check('emote: blocked while dead', G.EMO.key === null);
  G.P.dead = false;
  /* facial: laugh squints the merged eyes and lifts the mouth, then restores */
  G.fireEmote('laugh'); frame(20);
  check('emote: laugh squints the merged eyes',
    G.eyeMesh.scale.y < 0.9 && G.pupMesh.scale.y < 0.9,
    'eyeSY=' + G.eyeMesh.scale.y.toFixed(2));
  check('emote: laugh lifts the mouth into a smile',
    G.mouthMesh.scale.x > 1.1 && G.mouthMesh.position.y > 1.615,
    'mouthY=' + G.mouthMesh.position.y.toFixed(3));
  frame(220);                                           // past the 2.4s duration
  check('emote: emote ends on its own after its duration', G.EMO.key === null);
  check('emote: facial features restored after end',
    G.eyeMesh.scale.y === 1 && G.eyeMesh.position.y === 0 &&
    G.pupMesh.scale.y === 1 && G.pupMesh.position.y === 0 &&
    G.mouthMesh.scale.x === 1 && G.mouthMesh.position.y === 1.615);
  check('emote: body lean and fist scale restored after end',
    G.player.rotation.x === 0 && G.player.rotation.z === 0);
  /* draw-call budget: exactly one renderer.render per tick, even mid-emote */
  G.fireEmote('dance');
  globalThis.__renderCount = 0;
  frame(30);
  const renders = globalThis.__renderCount;
  G.emoteCancel();
  check('emote: exactly one render per tick during an emote (zero new draw sites)',
    renders === 30, 'renders=' + renders);
}

/* ================= 10. WILDLIFE (Phase 5) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999; G.setHeat(0, true);
  G.CAR.driving = false; G.HORSE.riding = false;
  G.BUS.driving = false; G.BUS.riding = false; G.TX.riding = false;
  G.player.visible = true; G.DIFF.tier = 0;
  const press = (code) => {
    stubs.fireGlobal('keydown', { code, preventDefault() {} });
    stubs.fireGlobal('keyup', { code });
  };
  const parkEnemies = (x, z) => {
    for (const e of G.enemies) {
      e.seeT = 0; e.scanT = 0; e.wasSpotted = false; e.live = false;
      e.aware = false; e.aggroT = 0; e.attackCd = 0; e.state = 'wander';
      e.prey = null; e.preyCd = 0; e.hp = e.cfg.hp; e.speed = 0;
      e.group.position.set(x, groundY(x, z), z);
    }
  };

  /* 10a. draw-call budget: the bike adds the single allowed InstancedMesh
         (41 after the PERF-2 consolidation: 46 -> 41; flora 7->3 meshes,
         lootBoxes folded into the shared pickupBoxes mesh), then the bicycle
         adds its one (41 -> 42), then the scooter adds its one (42 -> 43);
         one render site per tick */
  const imCount = (html.match(/new THREE\.InstancedMesh/g) || []).length;
  check('wildlife: exactly one new InstancedMesh vs main (43: the bike body + the bicycle body + the scooter body)', imCount === 43, 'count=' + imCount);
  globalThis.__renderCount = 0; frame(30);
  check('wildlife: exactly one render per tick', globalThis.__renderCount === 30,
    'renders=' + globalThis.__renderCount);

  /* 10b. birds flock: neighbor spread stays bounded over 600 frames */
  frame(600);
  let maxD2 = 0;
  for (let i = 0; i < G.birds.length; i++)
    for (let j = i + 1; j < G.birds.length; j++) {
      const a = G.birds[i], b = G.birds[j];
      const d2 = (a.ox - b.ox) * (a.ox - b.ox) + (a.oz - b.oz) * (a.oz - b.oz);
      if (d2 > maxD2) maxD2 = d2;
    }
  check('wildlife: bird flock spread stays bounded over 600 frames',
    Math.sqrt(maxD2) < 90, 'maxSpread=' + Math.sqrt(maxD2).toFixed(1) + 'm');
  let spdOk = true;
  for (const u of G.birds) { const s = Math.hypot(u.vx, u.vz); if (s < 2.9 || s > 7.1) spdOk = false; }
  check('wildlife: bird cruise speed stays in the 3..7 m/s band', spdOk);

  /* 10c. predator diverts to the nearest animal when the player is far */
  parkEnemies(50, 50);
  G.player.position.set(0, groundY(0, 0), 0);   // ~71m: outside every alert radius
  let testDeer = null;
  for (const a of G.animals) {
    if (a.kind === 'deer' && !testDeer && !a.mountLocked && a !== G.PET.a) { testDeer = a; continue; }
    if ((a.kind === 'deer' || a.kind === 'horse') && a !== G.PET.a) {
      a.pos.set(200, G.terrainHeight(200, 200), 200); a.fleeT = 0;
    }
  }
  testDeer.zone = { x0: -200, x1: 200, z0: -200, z1: 200 };   // room to bolt
  testDeer.pos.set(58, groundY(58, 55), 55);
  testDeer.fleeT = 0; testDeer.mode = 'idle'; testDeer.t = 999;
  const e0 = G.enemies[0];   // rusher: 6.8 m/s chase
  const d0 = Math.hypot(testDeer.pos.x - 50, testDeer.pos.z - 50);
  frame(120);
  const d1 = Math.hypot(testDeer.pos.x - e0.group.position.x, testDeer.pos.z - e0.group.position.z);
  check('wildlife: predator acquires the nearest animal as prey',
    e0.prey === testDeer && e0.aware === false, 'preyAcquired=' + (e0.prey === testDeer));
  check('wildlife: predator closes distance on its prey',
    d1 < d0 - 0.5, 'd0=' + d0.toFixed(1) + ' d1=' + d1.toFixed(1));

  /* 10d. prey flees: the bolt carries it beyond 15m from a slower predator */
  parkEnemies(150, 150);
  const eB = G.enemies[4];   // brute: 2.4 m/s chase, slower than the 6 m/s bolt
  eB.group.position.set(60, groundY(60, 58), 58);
  testDeer.pos.set(62, groundY(62, 60), 60); testDeer.fleeT = 0;
  let pdMax = 0;
  for (let i = 0; i < 240; i++) {
    frame(1);
    const d = Math.hypot(testDeer.pos.x - eB.group.position.x, testDeer.pos.z - eB.group.position.z);
    if (d > pdMax) pdMax = d;
  }
  check('wildlife: prey bolts beyond 15m from the predator', pdMax > 15,
    'maxD=' + pdMax.toFixed(1) + 'm');

  /* 10e. tame via E: horse at 2.5m (inside 3m tame, outside 2.2m ride) */
  parkEnemies(150, 150);
  G.player.position.set(0, groundY(0, 0), 0);
  G.player.rotation.y = Math.PI;
  const horse = G.animals.find(a => a.kind === 'horse' && !a.mountLocked);
  for (const a of G.animals) {
    if (a !== horse && (a.kind === 'deer' || a.kind === 'horse')) {
      a.pos.set(200, G.terrainHeight(200, 200), 200); a.fleeT = 0;
    }
  }
  horse.pos.set(2.5, groundY(2.5, 0), 0); horse.fleeT = 0; horse.mode = 'idle'; horse.t = 999;
  frame(2);
  check('wildlife: tame prompt raises for the nearby horse',
    G.PET.hintOn === true && G.PET.nearA === horse);
  G.BUS.hintOn = false; G.TX.hintOn = false;   // isolate: E must reach the pet branch
  press('KeyE');
  check('wildlife: E tames the prompted animal',
    G.PET.a === horse && G.toastEl.textContent === 'PET TAMED' &&
    G.petChipEl.style.display === 'block' && horse.fleeR === 0,
    'pet=' + (G.PET.a && G.PET.a.kind));

  /* 10f. pet follows: distance shrinks */
  G.player.position.set(30, groundY(30, 0), 0);
  const petD0 = Math.hypot(horse.pos.x - 30, horse.pos.z);
  frame(180);
  const petD1 = Math.hypot(horse.pos.x - G.player.position.x, horse.pos.z - G.player.position.z);
  check('wildlife: pet follows the player (distance shrinks)',
    petD1 < petD0 - 3 && G.PET.mode === 'follow',
    'd0=' + petD0.toFixed(1) + ' d1=' + petD1.toFixed(1) + ' mode=' + G.PET.mode);

  /* 10g. pet waits while the player is mounted, resumes on dismount */
  G.CAR.driving = true;
  frame(1);
  const waitToast = G.toastEl.textContent === 'PET WAITING';
  const wx = horse.pos.x, wz = horse.pos.z;
  frame(59);
  const wMoved = Math.hypot(horse.pos.x - wx, horse.pos.z - wz);
  check('wildlife: pet waits while the player drives (toast on transition, no follow)',
    G.PET.mode === 'wait' && waitToast && wMoved < 0.01,
    'mode=' + G.PET.mode + ' moved=' + wMoved.toFixed(3));
  G.CAR.driving = false;
  frame(5);
  check('wildlife: pet resumes follow after dismount', G.PET.mode === 'follow');

  /* 10h. save/load round-trip retames the pet at its saved offset */
  G.saveGame();
  const raw = stubs.localStorage.getItem(G.SAVE_KEY);
  check('wildlife: save persists the pet (kind + offset)',
    /"pet":"(deer|horse):-?\d/.test(raw));
  G.releasePet(true);
  check('wildlife: release clears the pet', G.PET.a === null && G.petChipEl.style.display === 'none');
  G.loadSave();
  const savedPet = JSON.parse(raw).data.pet.split(':');
  const ex = G.player.position.x + (+savedPet[1]), ez = G.player.position.z + (+savedPet[2]);
  const offErr = G.PET.a ?
    Math.hypot(G.PET.a.pos.x - ex, G.PET.a.pos.z - ez) : 999;
  check('wildlife: load retames the pet at its saved offset',
    G.PET.a !== null && G.PET.a.kind === 'horse' && offErr < 0.5,
    'kind=' + (G.PET.a && G.PET.a.kind) + ' offErr=' + offErr.toFixed(2));

  /* 10i. taming a second pet releases the first (exactly one) */
  const oldPet = G.PET.a;
  oldPet.pos.set(100, groundY(100, 100), 100); oldPet.fleeT = 0;
  const horse2 = G.animals.find(a => a.kind === 'horse' && a !== oldPet && !a.mountLocked);
  for (const a of G.animals) {
    if (a !== oldPet && a !== horse2 && (a.kind === 'deer' || a.kind === 'horse')) {
      a.pos.set(200, G.terrainHeight(200, 200), 200); a.fleeT = 0;
    }
  }
  horse2.pos.set(G.player.position.x + 2.5, 0, G.player.position.z);
  horse2.pos.y = groundY(horse2.pos.x, horse2.pos.z);
  horse2.fleeT = 0; horse2.mode = 'idle'; horse2.t = 999;
  frame(2);
  G.BUS.hintOn = false; G.TX.hintOn = false;
  press('KeyE');
  check('wildlife: taming a second pet releases the first (exactly one pet)',
    G.PET.a === horse2 && oldPet.fleeR === 0,
    'petIsHorse2=' + (G.PET.a === horse2));

  /* 10j. weapon guard: no animal mesh is in the player hitscan target list */
  const animalMeshes = new Set();
  for (const a of G.animals) { animalMeshes.add(a.imBody); animalMeshes.add(a.imHead); animalMeshes.add(a.imLegs); }
  check('wildlife: pet can never be hit by player weapons (no animal mesh raycast)',
    !G.enemyMeshes.some(m => animalMeshes.has(m)));
}

/* ================= 11. MOTORCYCLE (Phase 5) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.CAR.driving = false; G.HORSE.riding = false;
  G.BUS.driving = false; G.BUS.riding = false; G.TX.riding = false;
  G.player.visible = true;
  G.player.position.set(0, groundY(0, 0), 0);          // anchor chunk (0,0)
  frame(3);                                            // bikeUpdate seeds the 3 slots
  check('bike: three seeded slots placed near amenities',
    G.BIKE.slots.length === 3 && G.BIKE.slots.every(s => s.placed === true),
    G.BIKE.slots.map(s => '(' + s.x.toFixed(0) + ',' + s.z.toFixed(0) + ')').join(' '));
  check('bike: one shared body InstancedMesh holds all three slots',
    G.bikeBodyIM.isInstancedMesh === true);
  const imCount2 = (html.match(/new THREE\.InstancedMesh/g) || []).length;
  check('bike: InstancedMesh count is 42 or 43 (one allowed for the bike, one for the bicycle, one for the scooter; 46 -> 41 after PERF-2)',
    imCount2 === 42 || imCount2 === 43, 'count=' + imCount2);

  /* determinism on revisit: same player spot, forced rebuild, identical pads */
  const poses = G.BIKE.slots.map(s => [s.x, s.z, s.yaw]);
  G.BIKE.anchorCx = 1e9; G.BIKE.anchorCz = 1e9; G.BIKE.key = '';   // force rebuild
  frame(1);
  const samePose = (s, p) =>
    Math.abs(s.x - p[0]) < 1e-9 && Math.abs(s.z - p[1]) < 1e-9 && Math.abs(s.yaw - p[2]) < 1e-9;
  check('bike: pads are deterministic on rebuild',
    G.BIKE.slots.every((s, i) => samePose(s, poses[i])));

  /* hysteresis: move slot 0 away, stand on it, rebuild must keep it there */
  const s0 = G.BIKE.slots[0];
  s0.x += 30; s0.z += 30;
  G.player.position.set(s0.x, groundY(s0.x, s0.z), s0.z);
  G.BIKE.anchorCx = 1e9; G.BIKE.anchorCz = 1e9; G.BIKE.key = '';
  frame(1);
  check('bike: pad sticks under the player (no chunk-cross pop)',
    Math.abs(G.BIKE.slots[0].x - s0.x) < 1e-9 && Math.abs(G.BIKE.slots[0].z - s0.z) < 1e-9);

  /* ride: E near the bike enters */
  G.player.position.set(0, groundY(0, 0), 0);
  G.BIKE.anchorCx = 1e9; G.BIKE.anchorCz = 1e9; G.BIKE.key = '';
  frame(2);
  const bx = G.BIKE.slots[0].x, bz = G.BIKE.slots[0].z;
  G.player.position.set(bx, groundY(bx, bz), bz);       // exactly on slot 0: nearest wins
  frame(2);
  check('bike: RIDE hint appears near a parked bike',
    G.BIKE.hintOn === true && G.BIKE.nearIdx === 0 && G.bikeHintEl.style.opacity === 1);
  G.bikeEnter();                                       // real entry
  check('bike: E near bike enters (BIKE.driving true)',
    G.BIKE.driving === true && G.player.visible === false);
  check('bike: mount toast fires', G.toastEl.textContent === 'MOTORCYCLE');

  /* throttle moves the bike */
  const start = G.BIKE.pos.clone();
  G.keys.KeyW = true;
  frame(120);                                          // ~2 s of throttle
  G.keys.KeyW = false;
  const moved = G.BIKE.pos.distanceTo(start);
  check('bike: 120 frames of throttle moves the bike', moved > 5, 'moved=' + moved.toFixed(2) + 'u');
  check('bike: still driving, player hidden',
    G.BIKE.driving === true && G.player.visible === false);

  /* nitro boost engages and lifts the 30 cap */
  G.BIKE.speed = 28; G.BIKE.boostCd = 0; G.BIKE.boostT = 0;
  G.keys.KeyW = true;
  frame(10);                                           // settle at the cap
  const vCap = G.BIKE.speed;
  G.keys.ShiftLeft = true;
  frame(40);                                           // boost burns (~0.67 s)
  const engaged = G.BIKE.boostT > 0;
  G.keys.ShiftLeft = false; G.keys.KeyW = false;
  const vBoost = G.BIKE.speed;
  check('bike: nitro boost engages and lifts speed past the cap',
    engaged && vCap <= 30.01 && vBoost > vCap + 3,
    'engaged=' + engaged + ' vCap=' + vCap.toFixed(1) + ' vBoost=' + vBoost.toFixed(1));

  /* lean changes sign with left/right steering */
  G.BIKE.speed = 20;
  G.keys.KeyW = true; G.keys.KeyD = true;
  frame(60);
  const leanR = G.BIKE.lean;
  G.keys.KeyD = false; G.keys.KeyA = true;
  frame(60);
  const leanL = G.BIKE.lean;
  G.keys.KeyA = false; G.keys.KeyW = false;
  check('bike: lean changes sign with left/right steering',
    leanR < -0.05 && leanL > 0.05,
    'leanR=' + leanR.toFixed(3) + ' leanL=' + leanL.toFixed(3));

  /* exit returns the player on foot */
  G.bikeExit();                                        // real exit
  check('bike: exit returns player on foot',
    G.BIKE.driving === false && G.player.visible === true);
  check('bike: dismount toast fires', G.toastEl.textContent === 'ON FOOT');

  /* draw-call budget: exactly one renderer.render per tick */
  globalThis.__renderCount = 0;
  frame(30);
  check('bike: exactly one render per tick', globalThis.__renderCount === 30,
    'renders=' + globalThis.__renderCount);
}

/* ================= 12. BICYCLE (Phase 5) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.CAR.driving = false; G.HORSE.riding = false;
  G.BUS.driving = false; G.BUS.riding = false; G.TX.riding = false;
  G.BIKE.driving = false; G.BC.driving = false;
  G.player.visible = true;
  G.player.position.set(0, groundY(0, 0), 0);          // anchor chunk (0,0)
  frame(3);                                            // bcUpdate seeds the 3 slots
  check('bicycle: three seeded slots placed near amenities',
    G.BC.slots.length === 3 && G.BC.slots.every(s => s.placed === true),
    G.BC.slots.map(s => '(' + s.x.toFixed(0) + ',' + s.z.toFixed(0) + ')').join(' '));
  check('bicycle: one shared body InstancedMesh holds all three slots',
    G.bcBodyIM.isInstancedMesh === true);
  const imCount3 = (html.match(/new THREE\.InstancedMesh/g) || []).length;
  check('bicycle: InstancedMesh count is 43 (one allowed for the bicycle: 41 -> 42; the scooter makes 43)',
    imCount3 === 43, 'count=' + imCount3);

  /* determinism on revisit: same player spot, forced rebuild, identical pads */
  const bcPoses = G.BC.slots.map(s => [s.x, s.z, s.yaw]);
  G.BC.anchorCx = 1e9; G.BC.anchorCz = 1e9; G.BC.key = '';   // force rebuild
  frame(1);
  const bcSamePose = (s, p) =>
    Math.abs(s.x - p[0]) < 1e-9 && Math.abs(s.z - p[1]) < 1e-9 && Math.abs(s.yaw - p[2]) < 1e-9;
  check('bicycle: pads are deterministic on rebuild',
    G.BC.slots.every((s, i) => bcSamePose(s, bcPoses[i])));

  /* hysteresis: move slot 0 away, stand on it, rebuild must keep it there */
  const bcS0 = G.BC.slots[0];
  bcS0.x += 30; bcS0.z += 30;
  G.player.position.set(bcS0.x, groundY(bcS0.x, bcS0.z), bcS0.z);
  G.BC.anchorCx = 1e9; G.BC.anchorCz = 1e9; G.BC.key = '';
  frame(1);
  check('bicycle: pad sticks under the player (no chunk-cross pop)',
    Math.abs(G.BC.slots[0].x - bcS0.x) < 1e-9 && Math.abs(G.BC.slots[0].z - bcS0.z) < 1e-9);

  /* ride: E near the bicycle enters */
  G.player.position.set(0, groundY(0, 0), 0);
  G.BC.anchorCx = 1e9; G.BC.anchorCz = 1e9; G.BC.key = '';
  frame(2);
  const bcx = G.BC.slots[0].x, bcz = G.BC.slots[0].z;
  G.player.position.set(bcx, groundY(bcx, bcz), bcz);   // exactly on slot 0: nearest wins
  frame(2);
  check('bicycle: RIDE hint appears near a parked bicycle',
    G.BC.hintOn === true && G.BC.nearIdx === 0 && G.bcHintEl.style.opacity === 1);
  G.bcEnter();                                       // real entry
  check('bicycle: E near bicycle enters (BC.driving true)',
    G.BC.driving === true && G.player.visible === false);
  check('bicycle: mount toast fires', G.toastEl.textContent === 'BICYCLE');

  /* pedal moves the bicycle */
  const bcStart = G.BC.pos.clone();
  G.keys.KeyW = true;
  frame(120);                                          // ~2 s of pedaling
  G.keys.KeyW = false;
  const bcMoved = G.BC.pos.distanceTo(bcStart);
  check('bicycle: 120 frames of pedal moves the bicycle', bcMoved > 5, 'moved=' + bcMoved.toFixed(2) + 'u');

  /* lean changes sign with left/right steering (motorcycle sign convention) */
  G.BC.speed = 12;
  G.keys.KeyW = true; G.keys.KeyD = true;
  frame(60);
  const bcLeanR = G.BC.lean;
  G.keys.KeyD = false; G.keys.KeyA = true;
  frame(60);
  const bcLeanL = G.BC.lean;
  G.keys.KeyA = false; G.keys.KeyW = false;
  check('bicycle: lean changes sign with left/right steering',
    bcLeanR < -0.05 && bcLeanL > 0.05,
    'leanR=' + bcLeanR.toFixed(3) + ' leanL=' + bcLeanL.toFixed(3));

  /* pedal-mash drains the stamina gauge; empty stamina forces the coast */
  G.BC.stam = 1; G.BC.exhausted = false; G.BC.mashT = 0; G.BC.prevShift = false;
  G.BC.speed = 8;
  for (let k = 0; k < 9; k++) { G.keys.ShiftLeft = true; frame(1); G.keys.ShiftLeft = false; frame(1); }
  check('bicycle: repeated SHIFT mashing drains stamina',
    G.BC.stam < 0.3, 'stam=' + G.BC.stam.toFixed(2));
  check('bicycle: empty stamina forces the coast (exhausted)',
    G.BC.exhausted === true);

  /* wheelie: hard pedal from standstill pitches the front up */
  G.BC.stam = 1; G.BC.exhausted = false; G.BC.speed = 0; G.BC.wheelieT = 0;
  G.keys.KeyW = true;
  frame(5);
  check('bicycle: wheelie lifts on hard pedal from standstill',
    G.BC.wheelieT > 0, 'wheelieT=' + G.BC.wheelieT.toFixed(2));
  G.keys.KeyW = false;

  /* exit returns the player on foot */
  G.bcExit();                                        // real exit
  check('bicycle: exit returns player on foot',
    G.BC.driving === false && G.player.visible === true);
  check('bicycle: dismount toast fires', G.toastEl.textContent === 'ON FOOT');

  /* draw-call budget: exactly one renderer.render per tick */
  globalThis.__renderCount = 0;
  frame(30);
  check('bicycle: exactly one render per tick', globalThis.__renderCount === 30,
    'renders=' + globalThis.__renderCount);
}

/* ================= 13. SCOOTER (Phase 5) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.CAR.driving = false; G.HORSE.riding = false;
  G.BUS.driving = false; G.BUS.riding = false; G.TX.riding = false;
  G.BIKE.driving = false; G.BC.driving = false; G.SC.driving = false;
  G.player.visible = true;
  G.player.position.set(0, groundY(0, 0), 0);          // anchor chunk (0,0)
  frame(3);                                            // scUpdate seeds the 3 slots
  check('scooter: three seeded slots placed near amenities',
    G.SC.slots.length === 3 && G.SC.slots.every(s => s.placed === true),
    G.SC.slots.map(s => '(' + s.x.toFixed(0) + ',' + s.z.toFixed(0) + ')').join(' '));
  check('scooter: one shared body InstancedMesh holds all three slots',
    G.scBodyIM.isInstancedMesh === true);
  const imCount4 = (html.match(/new THREE\.InstancedMesh/g) || []).length;
  check('scooter: InstancedMesh count is 43 (one allowed for the scooter: 42 -> 43)',
    imCount4 === 43, 'count=' + imCount4);

  /* determinism on revisit: same player spot, forced rebuild, identical pads */
  const scPoses = G.SC.slots.map(s => [s.x, s.z, s.yaw]);
  G.SC.anchorCx = 1e9; G.SC.anchorCz = 1e9; G.SC.key = '';   // force rebuild
  frame(1);
  const scSamePose = (s, p) =>
    Math.abs(s.x - p[0]) < 1e-9 && Math.abs(s.z - p[1]) < 1e-9 && Math.abs(s.yaw - p[2]) < 1e-9;
  check('scooter: pads are deterministic on rebuild',
    G.SC.slots.every((s, i) => scSamePose(s, scPoses[i])));

  /* hysteresis: move slot 0 away, stand on it, rebuild must keep it there */
  const scS0 = G.SC.slots[0];
  scS0.x += 30; scS0.z += 30;
  G.player.position.set(scS0.x, groundY(scS0.x, scS0.z), scS0.z);
  G.SC.anchorCx = 1e9; G.SC.anchorCz = 1e9; G.SC.key = '';
  frame(1);
  check('scooter: pad sticks under the player (no chunk-cross pop)',
    Math.abs(G.SC.slots[0].x - scS0.x) < 1e-9 && Math.abs(G.SC.slots[0].z - scS0.z) < 1e-9);

  /* ride: E near the scooter enters */
  G.player.position.set(0, groundY(0, 0), 0);
  G.SC.anchorCx = 1e9; G.SC.anchorCz = 1e9; G.SC.key = '';
  frame(2);
  const scx = G.SC.slots[0].x, scz = G.SC.slots[0].z;
  G.player.position.set(scx, groundY(scx, scz), scz);   // exactly on slot 0: nearest wins
  frame(2);
  check('scooter: RIDE hint appears near a parked scooter',
    G.SC.hintOn === true && G.SC.nearIdx === 0 && G.scHintEl.style.opacity === 1);
  G.scEnter();                                       // real entry
  check('scooter: E near scooter enters (SC.driving true)',
    G.SC.driving === true && G.player.visible === false);
  check('scooter: mount toast fires', G.toastEl.textContent === 'SCOOTER');

  /* kick-push: press edges (not holds) add speed bursts */
  const scStart = G.SC.pos.clone();
  for (let k = 0; k < 4; k++) { G.keys.KeyW = true; frame(1); G.keys.KeyW = false; frame(24); }
  G.keys.KeyW = false;
  const scMoved = G.SC.pos.distanceTo(scStart);
  check('scooter: kick presses move the scooter', scMoved > 5, 'moved=' + scMoved.toFixed(2) + 'u');

  /* coast decay between kicks: no input, speed falls */
  const scCoastSpd = G.SC.speed;
  frame(120);
  check('scooter: speed coasts down between kicks',
    G.SC.speed < scCoastSpd * 0.6, 'from=' + scCoastSpd.toFixed(2) + ' to=' + G.SC.speed.toFixed(2));

  /* lean changes sign with left/right steering (bicycle sign convention).
     Teleport back to the slot and face away from the amenity so the free
     run cannot eat the speed on a collider; refresh speed before each
     phase so the lean target stays well above the threshold. */
  G.SC.pos.set(G.SC.slots[0].x, G.SC.slots[0].y, G.SC.slots[0].z);
  G.SC.heading = Math.atan2(Math.cos(G.SC.slots[0].yaw), Math.sin(G.SC.slots[0].yaw));
  G.SC.hitCd = 0; G.SC.lean = 0; G.SC.steer = 0;
  G.SC.speed = 18;
  G.keys.KeyW = false; G.keys.KeyD = true;
  frame(45);
  const scLeanR = G.SC.lean;
  G.SC.speed = 18;
  G.keys.KeyD = false; G.keys.KeyA = true;
  frame(45);
  const scLeanL = G.SC.lean;
  G.keys.KeyA = false;
  check('scooter: lean changes sign with left/right steering',
    scLeanR < -0.05 && scLeanL > 0.05,
    'leanR=' + scLeanR.toFixed(3) + ' leanL=' + scLeanL.toFixed(3));

  /* bunny-hop: SPACE press edge pops the scooter vertically while riding */
  G.keys.Space = true;
  frame(1);
  G.keys.Space = false;
  frame(8);
  check('scooter: SPACE bunny-hop pops while riding',
    G.SC.hopY > 0.1, 'hopY=' + G.SC.hopY.toFixed(2));
  frame(60);                                           // lands cleanly
  check('scooter: bunny-hop lands back on the ground', G.SC.hopY === 0);

  /* exit returns the player on foot */
  G.scExit();                                        // real exit
  check('scooter: exit returns player on foot',
    G.SC.driving === false && G.player.visible === true);
  check('scooter: dismount toast fires', G.toastEl.textContent === 'ON FOOT');

  /* draw-call budget: exactly one renderer.render per tick */
  globalThis.__renderCount = 0;
  frame(30);
  check('scooter: exactly one render per tick', globalThis.__renderCount === 30,
    'renders=' + globalThis.__renderCount);
}

/* ---------- zero console errors ---------- */
check('boot+tests: zero console errors/warnings in stub env',
  consoleProblems.length === 0, consoleProblems.slice(0, 3).join(' | '));

console.error = origErr; console.warn = origWarn;
console.log(failures === 0 ? 'SMOKE RESULT: ALL GREEN' : 'SMOKE RESULT: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
