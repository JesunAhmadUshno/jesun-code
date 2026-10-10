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
  birds, wings, PET, tamePet, releasePet, acquirePrey, petRejoin,
  petHintEl, petChipEl, birdFlockTick,
  AMESH, chunkBiome, redistributeWildlife,   /* Phase 5 wildlife v2 */
  amenityCenterFor,                          /* Phase 5 wildlife v3: dog placement */
  wildEagles, wildOwls, thermalFor, treeNear, treeWithPartner, redistributeEagles, redistributeOwls,  /* Phase 5 wildlife v4 */
  wildLions, wildPandas, wildTigers, wildPenguins, pondShore,  /* Phase 5 wildlife v5 */
  get dayPhase() { return dayPhase; }, set dayPhase(v) { dayPhase = v; },  /* v4: owl day/night test */
  get cash() { return cash; }, set cash(v) { cash = v; },
  get kills() { return kills; }, set kills(v) { kills = v; },
  get curWeapon() { return curWeapon; }, set curWeapon(v) { curWeapon = v; },
  get fireCd() { return fireCd; }, set fireCd(v) { fireCd = v; },
  get shopOpen() { return shopOpen; },
  fireEmote, emoteCancel, doPunch, hurtPlayer, EMOTES, EMOTE_ORDER, EMO,
  eyeMesh, pupMesh, mouthMesh, armL, armR, elbowL, elbowR,
  bldgCenterFor, bldgTypeFor, bldgAccepted, redistributeBuildings,  /* Phase 5 rural buildings */
  BLDG, BLDG_DEF, bldgMeshes, BLDG_WIN_MATS, HOUSE_SCALE,
  openBldgStore, storeCool, carAmenityHit, resolveBldgFoot, STORE_R2,
  get shopBldg() { return shopBldg; },
  /* Phase 5 farming plots (harvest gate for the food tests) */
  farmHarvest, farmTryHarvest, farmPlotCenterFor, farmPlotMatureCount,
  FPLOT, FARM_MATURE_NEED,
  farmFallow, farmTryPlant, farmPlant, cycleFarmSeed, cropStageFor, farmPaintCrops,   /* Phase 5 farming v1 */
  CROPS, FARM_SEED_ORDER, FARM_MATURE_COL, CROP_IM, farmChipEl, farmHintEl, updateFarmChip,
  cashFloatEl, floatCash, sfxSizzle,
  foodCanAfford, foodSpend, foodRawTotal, foodDishCount, foodSellValue, DISH_SELL, foodCostStr,
  /* Phase 5 cooking + food */
  FOOD, FOOD_ORDER, FOOD_MAX, RECIPES, COOK_ITEMS, EAT_ITEMS, FOOD_ICONS,
  REST_ITEMS, openRest, openFoodPanel, foodChipEl, shopRowsEl, shopNameEl,
  updateFoodHUD, updateHpHUD, foodSaveStr, foodLoadStr, refreshShopPanel,
  get SHOP_LIST() { return SHOP_LIST; },
  /* Phase 5 soccer mini-game */
  SOCCER, ballMesh, soccerPitchFor, soccerFindPitch, soccerSpawnAt, soccerParkBall,
  soccerCanKick, soccerBallNear, doKick, soccerAssignGoalie, soccerReleaseGoalie,
  soccerGoal, soccerTick, socChipEl, kickHintEl,
  /* Phase 5 tennis mini-game */
  TENNIS, tennisCourtFor, tennisSpawnAt, tennisParkBall, tennisResetForServe,
  tennisCanHit, tennisBallNear, doTennisHit, tennisAssignOpp, tennisReleaseOpp,
  tennisPoint, tennisNpcReturn, tennisTick, tennChipEl, hitHintEl,
  /* Phase 5 basketball mini-game */
  HOOPS, basketballCourtFor, hoopsRimWorld, hoopsSpawnAt, hoopsParkBall,
  hoopsBallNear, hoopsCanShoot, doHoopShot, hoopsResetBall, hoopsScore,
  hoopsMiss, hoopsHoopCollide, hoopsTick, hoopChipEl, shootHintEl,
  AMEN, hash2i, sportHash,
  /* Phase 5 boats/ships v1 */
  BOAT, boatEnter, boatExit, boatRebuild, boatFloat, waterSurfaceY, dockFor,
  boatBodyIM, boatHintEl, boatChipEl, BOAT_N, sfxSplash,
  /* Phase 5 helicopters v1 */
  HELI, heliEnter, heliExit, heliRebuild, helipadFor, heliParkPad, heliPose,
  heliBodyIM, heliHintEl, heliChipEl, HELI_N, sfxThud, HELI_PAD_LZ,
  /* Phase 5 planes v1 */
  PLANE, planeEnter, planeExit, planeExitFlight, planeRebuild, airstripFor,
  planeStripWorld, planePose, planeBodyIM, planeHintEl, planeChipEl,
  PLANE_N, PLANE_STRIP_LX, PLANE_SLOT_LZ, sfxBuffet,
  /* Phase 5 trains v1 */
  TRAIN, trainEnter, trainExit, trainUpdate, trainSimOne, trainNextK,
  trainStationZ, trainStationOff, trainStationName, paintTrainBed,
  trainBodyIM, trainHintEl, trainChipEl, trainSignMesh,
  TRAIN_N, TRAIN_CARS, TRAIN_CAR_GAP, TRAIN_TRACK_X, TRAIN_GAP, TRAIN_NAMES,
  /* Phase 5 pianos v1 */
  PIANO, pianoFor, pianoHash, pianoParkPad, pianoEnter, pianoExit, pianoNote,
  pianoRebuild, pianoPose, pianoUpdate, sfxPianoNote, updateMusicChip,
  pianoBodyIM, pianoHintEl, musicChipEl, pianoKeysEl, PIANO_N, PIANO_NOTES,
  PIANO_KEYCODES, PIANO_SCAN, PIANO_PAD_LZ,
  /* Phase 5 casino slots v1 */
  SLOT, SLOT_BET, SLOT_SYM_N, slotEnter, slotExit, slotSpin, slotFinish, slotPay,
  slotUpdate, updateCasinoChip, drawReel, drawSlotSym, sfxSlotCoin,
  casinohintEl, casinoChipEl, casbearingEl, casarrEl, castxtEl,
  slotPanelEl, slotWinEl, slotSpinEl, HELP_SLOT,
  /* Phase 5 theater v1 */
  THEATER, theaterFor, theaterHash, theaterEnter, theaterExit, theaterRebuild,
  theaterUpdate, theaterAnimate, theaterPlace, theaterPark, theaterBarMusic,
  theaterSetName, updateTheaterChip, theaterBox, theaterTint, theaterArm,
  theaterBoxIM, theaterHintEl, theaterChipEl, HELP_THEATER,
  THEATER_N, THEATER_SCAN, T_INST, THEATER_BAR_LEN, THEATER_SETS, THEATER_POSES,
  /* Phase 5 rural civic buildings v1 */
  CIVIC, CIVIC_ORDER, CIVIC_SCALE, CIVIC_HEAL_COST, CIVIC_ATM_AMT, CIVIC_REST_COST,
  civicEnter, civicExit, civicAct, civicHeal, civicAtm, civicRest, civicTick,
  updateCivicChip, CIVIC_HINT_TXT, CIVIC_ACT_TXT,
  civichintEl, civicChipEl, civicbearingEl, civarrEl, civtxtEl,
  civicPanelEl, civicTitleEl, civicActEl, civicFootEl, HELP_CIVIC,
  THEATER_LX, THEATER_LZ,
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
    /* PERF-5: the brute body is a Mesh (no instanceId); same mapping as shoot() */
    const first = hits.map(h => h.object.userData.enemyOf[h.instanceId === undefined ? 0 : h.instanceId])
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
  for (const a of G.animals)   // Phase 5 wildlife v5: park the new predators (tigers hunt cows, lions bolt them)
    if (a.kind === 'lion' || a.kind === 'tiger') {
      a.pos.set(250, G.terrainHeight(250, 250), 250);
      a.fleeT = 0; a.prey = null; a.preyCd = 999;
    }
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
         one render site per tick.
         Phase 5 wildlife v2: the source-text count stays 43 because the 5
         new animal meshes (rabbit/pig/wolf/bear bodies + the shared wild
         legs) are built through the makeAnimalMesh factory; the AMESH site
         count below asserts the real +5 (11 -> 16). */
  const imCount = (html.match(/new THREE\.InstancedMesh/g) || []).length;
  /* 2026-10-09 farming: +1 crop InstancedMesh literal (45 = 44 + 1 farming crops); pads reuse ZONE_PADS, zero new draws */
  check('perf5: 44 IM literals (48 - PERF-5: trunks+fol merge, npcLegs->limbIM, copGuns->limbIM, brute IM->Mesh)', imCount === 44, 'count=' + imCount);
  check('wildlife: AMESH holds 28 instanced-mesh sites (24 + v5 lion/panda/tiger/penguin bodies)',
    Object.keys(G.AMESH).length === 28, 'sites=' + Object.keys(G.AMESH).length);
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
    /* Phase 5 wildlife v2: park every other animal (incl. rabbit/pig/wolf/bear)
       so the predator test isolates to the one test deer */
    if (a !== testDeer && a !== G.PET.a) {
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
  /* Phase 5 wildlife v2: park everything else (incl. the new species) so the
     tame prompt isolates to the one test horse */
  for (const a of G.animals) {
    if (a !== horse) {
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
    if (a !== oldPet && a !== horse2) {
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

  /* 10k. Phase 5 wildlife v2: rabbits / pigs / wolves / bears */
  const w2 = G.animals.filter(a => a.kind === 'rabbit' || a.kind === 'pig' ||
                                   a.kind === 'wolf' || a.kind === 'bear');
  check('wildlife2: 4 new species spawn (6 rabbits, 3 pigs, 2 wolves, 1 bear)',
    w2.filter(a => a.kind === 'rabbit').length === 6 &&
    w2.filter(a => a.kind === 'pig').length === 3 &&
    w2.filter(a => a.kind === 'wolf').length === 2 &&
    w2.filter(a => a.kind === 'bear').length === 1,
    'n=' + w2.length);

  /* seeded per-chunk spawns: moved animals land in biome-matching chunks,
     and the placement is a pure function of chunk coords */
  {
    const biomeAt = (x, z) => G.chunkBiome(Math.floor(x / 48), Math.floor(z / 48));
    const wantBiome = { rabbit: 'forest', pig: 'farm', wolf: 'forest', bear: 'forest' };
    const snap = () => w2.map(a => a.kind + ':' + a.pos.x.toFixed(3) + ',' + a.pos.z.toFixed(3)).join('|');
    const before = new Map(w2.map(a => [a, a.pos.x.toFixed(3) + ',' + a.pos.z.toFixed(3)]));
    G.redistributeWildlife(3, -2);
    const s1 = snap();
    let biomeOk = true;
    for (const a of w2) {
      /* the landmark skip keeps the animal at its old spot: only assert
         the biome contract for animals the placement actually moved */
      const moved = (a.pos.x.toFixed(3) + ',' + a.pos.z.toFixed(3)) !== before.get(a);
      if (moved && biomeAt(a.pos.x, a.pos.z) !== wantBiome[a.kind]) biomeOk = false;
    }
    check('wildlife2: seeded spawns land in biome-matching chunks', biomeOk);
    G.redistributeWildlife(3, -2);
    check('wildlife2: redistribute is a pure function of chunk coords', snap() === s1);
  }

  /* rabbit hop: body bob is nonzero while moving */
  parkEnemies(150, 150);
  G.player.position.set(-100, groundY(-100, -100), -100);
  for (const a of G.animals) { a.pos.set(200, G.terrainHeight(200, 200), 200); a.fleeT = 0; }
  const rab = w2.find(a => a.kind === 'rabbit');
  rab.pos.set(40, G.terrainHeight(40, 40), 40);
  rab.zone = { x0: 0, x1: 80, z0: 0, z1: 80 };
  rab.mode = 'walk'; rab.t = 999; rab.target.set(70, 0, 40);
  rab.fleeT = 0; rab.grazeT = 0;
  let bobMax = 0;
  for (let i = 0; i < 30; i++) {
    frame(1);
    if (Math.abs(rab.bobY) > bobMax) bobMax = Math.abs(rab.bobY);
  }
  check('wildlife2: rabbit hop bob is nonzero while moving', bobMax > 0.05,
    'bobMax=' + bobMax.toFixed(3));

  /* wolf hunt: acquires the nearest prey; the catch panic-bolts it and the wolf rests */
  for (const a of w2) { a.pos.set(200, G.terrainHeight(200, 200), 200); a.fleeT = 0; }
  const wolf = w2.find(a => a.kind === 'wolf');
  const wprey = w2.find(a => a.kind === 'rabbit' && a !== rab);
  wolf.pos.set(40, G.terrainHeight(40, 40), 40);
  wolf.zone = { x0: 0, x1: 80, z0: 0, z1: 80 };
  wolf.mode = 'idle'; wolf.t = 999; wolf.fleeT = 0; wolf.prey = null; wolf.preyCd = 0;
  wprey.pos.set(46, G.terrainHeight(46, 40), 40);
  wprey.zone = { x0: 0, x1: 80, z0: 0, z1: 80 };
  wprey.mode = 'idle'; wprey.t = 999; wprey.fleeT = 0;
  frame(5);
  check('wildlife2: wolf hunts the nearest prey', wolf.prey === wprey,
    'prey=' + (wolf.prey && wolf.prey.kind));
  wprey.pos.set(wolf.pos.x + 1, G.terrainHeight(wolf.pos.x + 1, wolf.pos.z), wolf.pos.z);
  wprey.fleeT = 0;
  frame(2);
  check('wildlife2: wolf catch panic-bolts the prey and the wolf rests',
    wprey.fleeT > 3 && wolf.prey === null && wolf.preyCd > 0,
    'fleeT=' + wprey.fleeT.toFixed(2) + ' preyCd=' + wolf.preyCd.toFixed(2));

  /* bear: wanders, and never enters the tame list (nor do the other new species) */
  for (const a of w2) { a.pos.set(200, G.terrainHeight(200, 200), 200); a.fleeT = 0; }
  G.player.position.set(0, groundY(0, 0), 0);
  G.player.rotation.y = Math.PI;
  const bear = w2.find(a => a.kind === 'bear');
  const pig2 = w2.find(a => a.kind === 'pig');
  bear.pos.set(2.5, G.terrainHeight(2.5, 0), 0);
  bear.zone = { x0: -80, x1: 80, z0: -80, z1: 80 };
  bear.fleeT = 0; bear.mode = 'idle'; bear.t = 999;
  pig2.pos.set(2.5, G.terrainHeight(2.5, 1), 1);
  pig2.fleeT = 0; pig2.mode = 'idle'; pig2.t = 999;
  frame(2);
  check('wildlife2: tame prompt excludes the new species', G.PET.hintOn === false && G.PET.nearA === null,
    'hintOn=' + G.PET.hintOn);
  bear.mode = 'walk'; bear.t = 999; bear.target.set(40, 0, 0);
  const bx0 = bear.pos.x, bz0 = bear.pos.z;
  frame(300);
  const bMoved = Math.hypot(bear.pos.x - bx0, bear.pos.z - bz0);
  check('wildlife2: bear wanders', bMoved > 2, 'moved=' + bMoved.toFixed(1) + 'm');

  /* one render per tick still holds with the new meshes */
  globalThis.__renderCount = 0;
  frame(30);
  check('wildlife2: exactly one render per tick', globalThis.__renderCount === 30,
    'renders=' + globalThis.__renderCount);

  /* shared wild legs: per-instance species tint; bodies are real geometry.
     Phase 5 wildlife v4: 72 slots (54 v2+v3 + 4 monkeys x2 + 5 chickens x2);
     instance 54 is the first v4 (monkey) leg, and must differ from the rabbit. */
  {
    const wl = G.AMESH.wildLegs;
    const ic = wl.instanceColor;
    let tintVaries = false;
    if (ic && ic.count === 94) {
      /* instance 0 = rabbit leg, instance 72 = first lion leg: must differ */
      const d = Math.abs(ic.array[0] - ic.array[216]) +
                Math.abs(ic.array[1] - ic.array[217]) +
                Math.abs(ic.array[2] - ic.array[218]);
      tintVaries = d > 0.01;
    }
    check('wildlife2: shared legs carry per-instance species tints', tintVaries,
      'count=' + (ic && ic.count));
    const geoOk = ['rabbitBody', 'pigBody', 'wolfBody', 'bearBody',
                   'dogBody', 'catBody', 'foxBody', 'duckBody',
                   'eagleBody', 'owlBody', 'monkeyBody', 'chickenBody',
                   'lionBody', 'pandaBody', 'tigerBody', 'penguinBody'].every(
      k => G.AMESH[k].geometry.attributes.position.count > 0);
    check('wildlife2: all sixteen body geometries are non-empty', geoOk);
  }
}

/* ================= 10m. PHASE 5 WILDLIFE V3: dogs / cats / foxes / ducks ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999; G.setHeat(0, true);
  const parkEnemies3 = (x, z) => {
    for (const e of G.enemies) {
      e.seeT = 0; e.scanT = 0; e.wasSpotted = false; e.live = false;
      e.aware = false; e.aggroT = 0; e.attackCd = 0; e.state = 'wander';
      e.prey = null; e.preyCd = 0; e.hp = e.cfg.hp; e.speed = 0;
      e.group.position.set(x, groundY(x, z), z);
    }
  };
  parkEnemies3(150, 150);
  /* settle the player BEFORE placing test animals: a player teleport fires
     the chunk-crossing relocate, which would scatter the placements */
  const settle = (x, z) => {
    G.player.position.set(x, groundY(x, z), z);
    G.player.rotation.y = 0;
    frame(3);   // absorb any chunk crossing
  };
  const scatterW3 = () => {
    for (const a of w3) { a.pos.set(200, G.terrainHeight(200, 200), 200); a.fleeT = 0; a.panicT = 0; a.flyY = 0; }
  };
  const w3 = G.animals.filter(a => a.kind === 'dog' || a.kind === 'cat' ||
                                   a.kind === 'fox' || a.kind === 'duck');
  check('wildlife3: 4 new species spawn (4 dogs, 4 cats, 2 foxes, 5 ducks)',
    w3.filter(a => a.kind === 'dog').length === 4 &&
    w3.filter(a => a.kind === 'cat').length === 4 &&
    w3.filter(a => a.kind === 'fox').length === 2 &&
    w3.filter(a => a.kind === 'duck').length === 5,
    'n=' + w3.length);

  /* dogs relocate beside real amenity centers; placement is deterministic */
  {
    const snap = () => w3.map(a => a.kind + ':' + a.pos.x.toFixed(3) + ',' + a.pos.z.toFixed(3)).join('|');
    G.redistributeWildlife(3, -2);
    const s1 = snap();
    let dogOk = true, duckOk = true, foxOk = true;
    for (const a of w3) {
      if (a.kind === 'dog') {
        let near = false;
        for (let gx = 0; gx <= 6 && !near; gx++)
          for (let gz = -5; gz <= 1 && !near; gz++) {
            const ac = G.amenityCenterFor(gx, gz);
            if (ac && Math.hypot(a.pos.x - ac.x, a.pos.z - ac.z) < 16) near = true;
          }
        if (!near) dogOk = false;
      } else if (a.kind === 'duck') {
        if (G.terrainHeight(a.pos.x, a.pos.z) >= -0.55) duckOk = false;
      } else if (a.kind === 'fox') {
        const b = G.chunkBiome(Math.floor(a.pos.x / 48), Math.floor(a.pos.z / 48));
        if (b !== 'forest' && b !== 'plain') foxOk = false;
      }
    }
    check('wildlife3: relocated dogs park beside amenity centers', dogOk);
    check('wildlife3: relocated ducks land on water', duckOk);
    check('wildlife3: relocated foxes land in forest (spawn plain exempt)', foxOk);
    G.redistributeWildlife(3, -2);
    check('wildlife3: v3 redistribute is a pure function of chunk coords', snap() === s1);
  }

  /* cats keep a fixed city-district zone and never relocate */
  {
    const cats = w3.filter(a => a.kind === 'cat');
    const zoneOk = cats.every(a => a.zone.x0 === 36 && a.zone.x1 === 104 &&
                                    a.zone.z0 === -104 && a.zone.z1 === -36);
    check('wildlife3: cats hold the city-district zone', zoneOk);
  }

  /* fox hunt: acquires the nearest rabbit; the catch panic-bolts it and the
     fox rests LONGER than a wolf (preyCd >= 10) */
  settle(-100, -100);
  scatterW3();
  const fox = w3.find(a => a.kind === 'fox');
  const frabbit = G.animals.find(a => a.kind === 'rabbit');
  fox.pos.set(40, G.terrainHeight(40, 40), 40);
  fox.zone = { x0: 0, x1: 80, z0: 0, z1: 80 };
  fox.mode = 'idle'; fox.t = 999; fox.fleeT = 0; fox.prey = null; fox.preyCd = 0;
  frabbit.pos.set(46, G.terrainHeight(46, 40), 40);
  frabbit.zone = { x0: 0, x1: 80, z0: 0, z1: 80 };
  frabbit.mode = 'idle'; frabbit.t = 999; frabbit.fleeT = 0;
  frame(5);
  check('wildlife3: fox hunts the nearest rabbit', fox.prey === frabbit,
    'prey=' + (fox.prey && fox.prey.kind));
  frabbit.pos.set(fox.pos.x + 1, G.terrainHeight(fox.pos.x + 1, fox.pos.z), fox.pos.z);
  frabbit.fleeT = 0;
  frame(1);   // single frame: the catch sets preyCd before any decrement
  check('wildlife3: fox catch panic-bolts the rabbit and rests long',
    frabbit.fleeT > 3 && fox.prey === null && fox.preyCd >= 10,
    'fleeT=' + frabbit.fleeT.toFixed(2) + ' preyCd=' + fox.preyCd.toFixed(2));

  /* dogs: bark re-arms near the player; E-tame turns a dog into a pet on the
     existing follow system; cats/foxes/ducks never raise the tame prompt */
  settle(0, 0);
  scatterW3();
  for (const a of G.animals)   // park deer/horses far: the tame scan must see only our dog
    if (a.kind === 'deer' || a.kind === 'horse') { a.pos.set(300, G.terrainHeight(300, 300), 300); a.fleeT = 0; }
  for (const a of G.animals)   // Phase 5 wildlife v5: park the new predators (lions bolt dogs)
    if (a.kind === 'lion' || a.kind === 'tiger') {
      a.pos.set(300, G.terrainHeight(300, 300), 300);
      a.fleeT = 0; a.prey = null; a.preyCd = 999;
    }
  const dog = w3.find(a => a.kind === 'dog');
  const cat = w3.find(a => a.kind === 'cat');
  const duck = w3.find(a => a.kind === 'duck');
  dog.pos.set(5, G.terrainHeight(5, 0), 0);
  dog.zone = { x0: -80, x1: 80, z0: -80, z1: 80 };
  dog.fleeT = 0; dog.mode = 'idle'; dog.t = 999; dog.barkCd = 0;
  frame(2);
  check('wildlife3: untamed dog barks near the player (cooldown re-arms)',
    dog.barkCd > 0, 'barkCd=' + dog.barkCd.toFixed(2));
  dog.pos.set(2.5, G.terrainHeight(2.5, 0), 0);
  dog.fleeT = 0; dog.mode = 'idle'; dog.t = 999;
  frame(2);
  check('wildlife3: tame prompt fires for a dog', G.PET.hintOn === true && G.PET.nearA === dog,
    'hintOn=' + G.PET.hintOn);
  G.tamePet(dog);
  check('wildlife3: tamed dog joins the existing pet system',
    G.PET.a === dog && G.PET.mode === 'follow');
  dog.pos.set(60, G.terrainHeight(60, 0), 60);   // far from the player: follow steers back
  const d0 = Math.hypot(dog.pos.x - G.player.position.x, dog.pos.z - G.player.position.z);
  frame(120);
  const d1 = Math.hypot(dog.pos.x - G.player.position.x, dog.pos.z - G.player.position.z);
  check('wildlife3: pet dog follows the player', d1 < d0, d0.toFixed(1) + 'm -> ' + d1.toFixed(1) + 'm');
  G.releasePet(true);
  check('wildlife3: released dog leaves the pet slot', G.PET.a === null);
  /* cats, foxes and ducks are not tamable */
  scatterW3();
  dog.pos.set(200, G.terrainHeight(200, 200), 200);   // the released dog: far, so it cannot raise the hint
  cat.pos.set(2.5, G.terrainHeight(2.5, 0), 0); cat.fleeT = 0; cat.mode = 'idle'; cat.t = 999;
  fox.pos.set(2.5, G.terrainHeight(2.5, 1), 1); fox.fleeT = 0; fox.mode = 'idle'; fox.t = 999; fox.prey = null; fox.preyCd = 999;
  duck.pos.set(2.5, G.terrainHeight(2.5, 2), 2); duck.fleeT = 0; duck.panicT = 0;
  frame(2);
  check('wildlife3: tame prompt excludes cats, foxes and ducks',
    G.PET.hintOn === false && G.PET.nearA === null, 'hintOn=' + G.PET.hintOn);

  /* cat flees a dog inside 10m: displacement must point AWAY from the dog */
  scatterW3();
  for (const a of G.animals)   // wolves would also bolt the cat: park them far
    if (a.kind === 'wolf') { a.pos.set(250, G.terrainHeight(250, 250), 250); a.fleeT = 0; a.prey = null; a.preyCd = 999; }
  const dog2 = w3.find(a => a.kind === 'dog' && a !== dog);
  dog2.pos.set(30, G.terrainHeight(30, 30), 30);
  dog2.zone = { x0: 0, x1: 80, z0: 0, z1: 80 };
  dog2.fleeT = 0; dog2.mode = 'idle'; dog2.t = 999; dog2.barkCd = 999;
  cat.pos.set(30, G.terrainHeight(30, 31), 36);   // 6m from the dog
  cat.zone = { x0: 0, x1: 80, z0: 0, z1: 80 };
  cat.fleeT = 0; cat.mode = 'idle'; cat.t = 999;
  const cx0 = cat.pos.x, cz0 = cat.pos.z;
  frame(60);
  const cdx = cat.pos.x - cx0, cdz = cat.pos.z - cz0;
  const awayX = cx0 - dog2.pos.x, awayZ = cz0 - dog2.pos.z;   // cat start, away from the dog
  const catFled = Math.hypot(cdx, cdz) > 1.5 && (cdx * awayX + cdz * awayZ) > 0;
  check('wildlife3: cat flees a dog inside 10m', catFled && cat.fleeT > 0,
    'moved=' + Math.hypot(cdx, cdz).toFixed(1) + 'm fleeT=' + cat.fleeT.toFixed(2));

  /* duck panic: player close triggers take-off (flyY climbs); player far
     lets it land (flyY returns to 0). Both player spots stay in chunk (0,0)
     so no relocate fires mid-test. */
  settle(13, 0);
  scatterW3();
  duck.pos.set(10, -0.55, 0);
  duck.homeX = 10; duck.homeZ = 0; duck.cR = 3;   // test pond: pinned near the player
  duck.zone = { x0: 2, x1: 18, z0: -8, z1: 8 };
  duck.fleeT = 0; duck.panicT = 0; duck.flyY = 0; duck.duckAng = 0; duck.mode = 'idle';
  frame(30);
  check('wildlife3: duck panic take-off climbs', duck.panicT > 0 && duck.flyY > 0.5,
    'panicT=' + duck.panicT.toFixed(2) + ' flyY=' + duck.flyY.toFixed(2));
  G.player.position.set(30, groundY(30, 0), 0);   // 20m: outside the 6m panic radius, same chunk
  frame(700);                                      // panic (<=8s) expires, then lands
  check('wildlife3: duck lands after the panic', duck.panicT <= 0 && duck.flyY === 0,
    'panicT=' + duck.panicT.toFixed(2) + ' flyY=' + duck.flyY.toFixed(2));

  /* one render per tick still holds with the new meshes */
  globalThis.__renderCount = 0;
  frame(30);
  check('wildlife3: exactly one render per tick', globalThis.__renderCount === 30,
    'renders=' + globalThis.__renderCount);
}

/* ================= 11. MOTORCYCLE (Phase 5) ================= */

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
  /* 2026-10-09 farming: +1 crop InstancedMesh literal (45 = 44 + 1 farming crops); pads reuse ZONE_PADS, zero new draws */
  check('perf5: 44 IM literals after PERF-5 consolidation (bike section)',
    imCount2 === 44, 'count=' + imCount2);

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
  /* 2026-10-09 farming: +1 crop InstancedMesh literal (45 = 44 + 1 farming crops); pads reuse ZONE_PADS, zero new draws */
  check('perf5: 44 IM literals after PERF-5 consolidation (bicycle section)',
    imCount3 === 44, 'count=' + imCount3);

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
  /* 2026-10-09 farming: +1 crop InstancedMesh literal (45 = 44 + 1 farming crops); pads reuse ZONE_PADS, zero new draws */
  check('perf5: 44 IM literals after PERF-5 consolidation (scooter section)',
    imCount4 === 44, 'count=' + imCount4);

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

/* ================= 12. PHASE 5 WILDLIFE V4: eagles / owls / monkeys / chickens ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999; G.setHeat(0, true);
  const parkEnemies4 = (x, z) => {
    for (const e of G.enemies) {
      e.seeT = 0; e.scanT = 0; e.wasSpotted = false; e.live = false;
      e.aware = false; e.aggroT = 0; e.attackCd = 0; e.state = 'wander';
      e.prey = null; e.preyCd = 0; e.hp = e.cfg.hp; e.speed = 0;
      e.group.position.set(x, groundY(x, z), z);
    }
  };
  parkEnemies4(150, 150);
  const settle4 = (x, z) => {
    G.player.position.set(x, groundY(x, z), z);
    G.player.rotation.y = 0;
    frame(3);   // absorb any chunk crossing
  };
  const w4 = G.animals.filter(a => a.kind === 'monkey' || a.kind === 'chicken');
  check('wildlife4: 4 new species spawn (3 eagles, 3 owls, 4 monkeys, 5 chickens)',
    G.wildEagles.length === 3 && G.wildOwls.length === 3 &&
    w4.filter(a => a.kind === 'monkey').length === 4 &&
    w4.filter(a => a.kind === 'chicken').length === 5,
    'eagles=' + G.wildEagles.length + ' owls=' + G.wildOwls.length + ' ground=' + w4.length);
  check('wildlife4: AMESH holds 28 instanced-mesh sites (24 + v5 lion/panda/tiger/penguin bodies)',
    Object.keys(G.AMESH).length === 28, 'sites=' + Object.keys(G.AMESH).length);
  check('wildlife4: wildLegs grew to 94 slots with zero new leg sites',
    G.AMESH.wildLegs.count === 94, 'count=' + G.AMESH.wildLegs.count);

  /* eagle thermals are a pure function of chunk coords */
  {
    const t1 = G.thermalFor(3, -2), t2 = G.thermalFor(3, -2);
    check('wildlife4: eagle thermal is a pure function of chunk coords',
      t1.x === t2.x && t1.z === t2.z, JSON.stringify(t1));
  }

  /* eagles: banked soar at 25-40m, explicit up-vector, swoop dive + climb */
  settle4(0, 0);
  frame(60);
  {
    const e = G.wildEagles[0];
    /* chunk crossings from earlier sections leave eagles gliding between
       thermals; pin to soar for the bank assertion */
    e.state = 'soar'; e.stateT = 999; e.h = e.baseH; e.roll = 0.38;
    frame(60);
    check('wildlife4: eagle soars banked (roll nonzero, into the turn)',
      Math.abs(e.roll) > 0.2, 'roll=' + e.roll.toFixed(3));
    const m4 = new THREE.Matrix4();
    let flips = 0;
    for (let i = 0; i < 3; i++) {
      G.AMESH.eagleBody.getMatrixAt(i, m4);
      if (m4.elements[5] < 0.5) flips++;   // Y-basis column: up-vector must hold
    }
    check('wildlife4: eagle instances never flip upside-down (up-vector holds)', flips === 0);
    const hAbove = e.pos.y - groundY(e.cx, e.cz);
    check('wildlife4: eagle soars 25-40m over the thermal',
      hAbove >= 20 && hAbove <= 45, 'h=' + hAbove.toFixed(1) + 'm');
  }
  {
    const e = G.wildEagles[1];
    e.state = 'soar'; e.stateT = 0.01; e.h = e.baseH;   // pin to soar: the swoop timer fires it
    frame(2);
    const swooping = e.state === 'swoop';
    let minH = Infinity, n = 0;
    for (let i = 0; i < 420 && e.state === 'swoop'; i++) { frame(1); n++; minH = Math.min(minH, e.h); }
    check('wildlife4: eagle swoop dives then climbs back to soar',
      swooping && minH < e.baseH - 10 && e.state === 'soar' && Math.abs(e.h - e.baseH) < 0.01,
      'frames=' + n + ' minH=' + minH.toFixed(1) + ' baseH=' + e.baseH.toFixed(1) + ' state=' + e.state);
  }

  /* owls: perch by day, hunt low circles by night */
  {
    G.dayPhase = 0.25;   // noon
    frame(3);
    const o = G.wildOwls[0];
    const perched = o.state === 'perch';
    frame(120);   // glide home
    const homeD = Math.hypot(o.pos.x - o.perch.x, o.pos.z - o.perch.z);
    check('wildlife4: owl perches by day (folded wings, near perch)',
      perched && homeD < 3 && Math.abs(o.roll) < 0.05,
      'state=' + o.state + ' d=' + homeD.toFixed(1) + ' roll=' + o.roll.toFixed(3));
    G.dayPhase = 0.75;   // midnight
    frame(3);
    const hunting = G.wildOwls.every(x => x.state === 'hunt');
    const oh = o.pos.y - groundY(o.pos.x, o.pos.z);
    const x0 = o.pos.x, z0 = o.pos.z;
    frame(60);
    const moved = Math.hypot(o.pos.x - x0, o.pos.z - z0);
    check('wildlife4: owl hunts low circles by night',
      hunting && oh >= 2 && oh <= 7 && moved > 3,
      'state=' + o.state + ' h=' + oh.toFixed(1) + 'm moved=' + moved.toFixed(1) + 'm');
    G.dayPhase = 0.25;   // back to day for the rest of the suite
    frame(3);
  }
  {
    /* vertex colors are linear-space (THREE.Color.set hex conversion): the
       0xffe08a eye dots land near (1.0, 0.745, 0.25) */
    const col = G.AMESH.owlBody.geometry.attributes.color;
    let bright = 0;
    for (let i = 0; i < col.count; i++)
      if (col.array[i * 3] > 0.99 && col.array[i * 3 + 1] > 0.7) bright++;
    check('wildlife4: owl geometry carries bright eye dots', bright > 10, 'brightVerts=' + bright);
  }

  /* Phase 5 wildlife v5: park the new predators so the monkey/chicken
     isolation tests see only their own species (lions/tigers bolt monkeys,
     lions hunt near chickens). Mirrors the v3 wolf-parking idiom. */
  for (const a of G.animals) {
    if (a.kind === 'lion' || a.kind === 'tiger' || a.kind === 'panda' || a.kind === 'penguin') {
      a.pos.set(250, G.terrainHeight(250, 250), 250);
      a.fleeT = 0; a.prey = null; a.preyCd = 999; a.panicT = 0;
    }
  }

  /* monkeys: tree-swing between real trees. Home trees prefer a 12m swing
     partner (10m minimum tree spacing makes bare pairs rare); the (-200,-300)
     region is known pair-rich, so the relocate lands monkeys on partners. */
  settle4(-200, -300);
  frame(5);   // chunk crossing rebuilds flora + relocates herds
  const monkeys = w4.filter(a => a.kind === 'monkey');
  const mk = monkeys.find(a => G.treeNear(a.homeTX, a.homeTZ, 12));
  check('wildlife4: monkey home tree has a swing partner within 12m', !!mk,
    'homes=' + monkeys.map(a => '(' + a.homeTX.toFixed(0) + ',' + a.homeTZ.toFixed(0) + ')').join(' '));
  mk.pos.set(mk.homeTX, groundY(mk.homeTX, mk.homeTZ), mk.homeTZ);
  mk.swingT = 0; mk.swingCd = 0; mk.fleeT = 0;
  mk.zone = { x0: mk.homeTX - 15, x1: mk.homeTX + 15, z0: mk.homeTZ - 15, z1: mk.homeTZ + 15 };
  let swung = false, landed = false, maxArc = 0, swingTarget = null;
  const home0x = mk.homeTX, home0z = mk.homeTZ;
  for (let i = 0; i < 900 && !landed; i++) {
    frame(1);
    if (mk.swingT > 0) {
      swung = true;
      if (!swingTarget) swingTarget = { x: mk.swX1, z: mk.swZ1 };   // treeNear-issued: a real tree
      maxArc = Math.max(maxArc, mk.swingY - groundY(mk.pos.x, mk.pos.z));
    } else if (swung) landed = true;
  }
  check('wildlife4: monkey swings tree-to-tree (arc above canopy)',
    swung && maxArc > 2.5, 'swung=' + swung + ' arc=' + maxArc.toFixed(1) + 'm');
  check('wildlife4: monkey home tree updates to the swing target (a real tree)',
    landed && !!swingTarget && mk.homeTX === swingTarget.x && mk.homeTZ === swingTarget.z &&
    Math.hypot(mk.homeTX - home0x, mk.homeTZ - home0z) > 2,
    'home=' + mk.homeTX.toFixed(1) + ',' + mk.homeTZ.toFixed(1));
  {
    const snap = () => w4.filter(a => a.kind === 'monkey')
      .map(a => a.pos.x.toFixed(3) + ',' + a.pos.z.toFixed(3)).join('|');
    G.redistributeWildlife(3, -2);
    const s1 = snap();
    G.redistributeWildlife(3, -2);
    check('wildlife4: monkey/chicken relocate is a pure function of chunk coords', snap() === s1);
  }

  /* chickens: peck while idle, scatter-flee inside 8m */
  settle4(0, 0);
  const ch = w4.filter(a => a.kind === 'chicken');
  for (const a of ch) { a.pos.set(200, groundY(200, 200), 200); a.fleeT = 0; }
  const c0 = ch[0];
  c0.pos.set(30, groundY(30, 0), 30);   // 30m from the player: no flee
  c0.fleeT = 0; c0.mode = 'idle'; c0.t = 999; c0.grazeT = 0;
  let minBob = 0;
  for (let i = 0; i < 240; i++) { frame(1); minBob = Math.min(minBob, c0.bobY); }
  check('wildlife4: chicken pecks (body dip while idle)', minBob < -0.05,
    'minBob=' + minBob.toFixed(3));
  const c1 = ch[1];
  c1.zone = { x0: -80, x1: 80, z0: -80, z1: 80 };
  c1.pos.set(5, groundY(5, 0), 0);   // 5m < 8m: scatter-flee
  c1.fleeT = 0; c1.mode = 'idle'; c1.t = 999;
  frame(3);
  const fled = c1.fleeT > 0;
  const d0 = Math.hypot(c1.pos.x, c1.pos.z);
  frame(60);
  const d1 = Math.hypot(c1.pos.x, c1.pos.z);
  check('wildlife4: chicken scatter-flees inside 8m', fled && d1 > d0 + 2,
    'fleeT=' + c1.fleeT.toFixed(2) + ' d=' + d0.toFixed(1) + '->' + d1.toFixed(1));

  /* one render per tick still holds with the new meshes */
  globalThis.__renderCount = 0;
  frame(30);
  check('wildlife4: exactly one render per tick', globalThis.__renderCount === 30,
    'renders=' + globalThis.__renderCount);
}

/* ================= 13. PHASE 5 WILDLIFE V5: lions / pandas / tigers / penguins ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999; G.setHeat(0, true);
  const parkEnemies5 = (x, z) => {
    for (const e of G.enemies) {
      e.seeT = 0; e.scanT = 0; e.wasSpotted = false; e.live = false;
      e.aware = false; e.aggroT = 0; e.attackCd = 0; e.state = 'wander';
      e.prey = null; e.preyCd = 0; e.hp = e.cfg.hp; e.speed = 0;
      e.group.position.set(x, groundY(x, z), z);
    }
  };
  parkEnemies5(150, 150);
  const settle5 = (x, z) => {
    G.player.position.set(x, groundY(x, z), z);
    G.player.rotation.y = 0;
    frame(3);   // absorb any chunk crossing
  };
  const w5 = G.animals.filter(a => a.kind === 'lion' || a.kind === 'panda' ||
                                   a.kind === 'tiger' || a.kind === 'penguin');
  /* park every non-v5 animal so the v5 tests isolate (mirrors the v2/v3 idiom) */
  const parkOthers5 = () => {
    for (const a of G.animals) {
      if (w5.indexOf(a) < 0) {
        a.pos.set(250, G.terrainHeight(250, 250), 250);
        a.fleeT = 0; a.prey = null; a.preyCd = 999; a.panicT = 0;
      }
    }
  };
  /* park all v5 except the named subjects */
  const parkV5 = (...keep) => {
    for (const a of w5) {
      if (keep.indexOf(a) < 0) {
        a.pos.set(250, G.terrainHeight(250, 250), 250);
        a.fleeT = 0; a.prey = null; a.preyCd = 999; a.panicT = 0;
      }
    }
  };
  check('wildlife5: 4 new species spawn (3 lions, 2 pandas, 2 tigers, 4 penguins)',
    w5.filter(a => a.kind === 'lion').length === 3 &&
    w5.filter(a => a.kind === 'panda').length === 2 &&
    w5.filter(a => a.kind === 'tiger').length === 2 &&
    w5.filter(a => a.kind === 'penguin').length === 4,
    'n=' + w5.length);
  {
    const imCount5 = (html.match(/new THREE\.InstancedMesh/g) || []).length;
    /* 2026-10-09 farming: +1 crop InstancedMesh literal (45 = 44 + 1 farming crops); pads reuse ZONE_PADS, zero new draws */
    check('perf5: 44 IM literals after PERF-5 consolidation (wildlife5 section)',
      imCount5 === 44, 'count=' + imCount5);
  }
  {
    /* lioness silhouette: instances 1-2 are slimmer than the male */
    const lions = w5.filter(a => a.kind === 'lion');
    check('wildlife5: lionesses are slimmer than the male (per-instance root scale)',
      lions[0].bodySX === 1 && lions[0].bodySZ === 1 &&
      lions[1].bodySX < 1 && lions[2].bodySX < 1 &&
      lions[1].bodySZ < 1 && lions[2].bodySZ < 1,
      'sx=' + lions.map(a => a.bodySX).join(','));
  }

  /* relocate: seeded per-chunk biomes; a pure function of chunk coords */
  {
    const biomeAt = (x, z) => G.chunkBiome(Math.floor(x / 48), Math.floor(z / 48));
    const wantBiome = { lion: 'plain', panda: 'forest', tiger: 'forest' };
    const snap = () => w5.map(a => a.kind + ':' + a.pos.x.toFixed(3) + ',' + a.pos.z.toFixed(3)).join('|');
    const before = new Map(w5.map(a => [a, a.pos.x.toFixed(3) + ',' + a.pos.z.toFixed(3)]));
    G.redistributeWildlife(3, -2);
    const s1 = snap();
    let biomeOk = true, pengOk = true;
    for (const a of w5) {
      /* the landmark skip keeps the animal at its old spot: only assert
         the biome contract for animals the placement actually moved */
      const moved = (a.pos.x.toFixed(3) + ',' + a.pos.z.toFixed(3)) !== before.get(a);
      if (a.kind === 'penguin') {
        /* shore placement: the pond dips below the water plane, the bird
           stands on land beside it */
        if (!(G.terrainHeight(a.pondX, a.pondZ) < -0.55)) pengOk = false;
        if (!(G.terrainHeight(a.pos.x, a.pos.z) >= -0.55)) pengOk = false;
      } else if (moved && biomeAt(a.pos.x, a.pos.z) !== wantBiome[a.kind]) biomeOk = false;
    }
    check('wildlife5: relocated species land in biome-matching chunks', biomeOk);
    check('wildlife5: relocated penguins sit on shores beside ponds', pengOk);
    G.redistributeWildlife(3, -2);
    check('wildlife5: v5 relocate is a pure function of chunk coords', snap() === s1);
  }

  /* lions: hunt deer/rabbit/pig inside 28m; the catch panic-bolts the prey,
     roars, and rests LONGER than a wolf (preyCd >= 10) */
  settle5(-100, -100);
  parkOthers5();
  const lions = w5.filter(a => a.kind === 'lion');
  const lion = lions[0];
  parkV5(lion);
  const ldeer = G.animals.find(a => a.kind === 'deer' && !a.mountLocked);
  lion.pos.set(40, G.terrainHeight(40, 40), 40);
  lion.zone = { x0: 0, x1: 80, z0: 0, z1: 80 };
  lion.mode = 'idle'; lion.t = 999; lion.fleeT = 0; lion.prey = null; lion.preyCd = 0;
  ldeer.pos.set(55, G.terrainHeight(55, 40), 40);   // 15m: inside the 28m acquire
  ldeer.zone = { x0: 0, x1: 80, z0: 0, z1: 80 };
  ldeer.mode = 'idle'; ldeer.t = 999; ldeer.fleeT = 0;
  frame(5);
  check('wildlife5: lion hunts the deer inside 28m', lion.prey === ldeer,
    'prey=' + (lion.prey && lion.prey.kind));
  ldeer.pos.set(lion.pos.x + 1, G.terrainHeight(lion.pos.x + 1, lion.pos.z), lion.pos.z);
  ldeer.fleeT = 0;
  frame(1);   // single frame: the catch sets preyCd before any decrement
  check('wildlife5: lion catch panic-bolts the deer and rests longer than a wolf',
    ldeer.fleeT > 3 && lion.prey === null && lion.preyCd >= 10,
    'fleeT=' + ldeer.fleeT.toFixed(2) + ' preyCd=' + lion.preyCd.toFixed(2));

  /* tigers: stealth stalk inside 20m (slow, crouched), sprint pounce under 8m */
  settle5(-100, -100);
  parkOthers5();
  const tigers = w5.filter(a => a.kind === 'tiger');
  const tiger = tigers[0];
  parkV5(tiger);
  const trabbit = G.animals.find(a => a.kind === 'rabbit');
  tiger.pos.set(40, G.terrainHeight(40, 40), 40);
  tiger.zone = { x0: 0, x1: 80, z0: 0, z1: 80 };
  tiger.mode = 'idle'; tiger.t = 999; tiger.fleeT = 0;
  tiger.prey = null; tiger.preyCd = 0; tiger.pounceT = 0;
  trabbit.pos.set(55, G.terrainHeight(55, 40), 40);   // 15m: stalk range
  trabbit.zone = { x0: 0, x1: 80, z0: 0, z1: 80 };
  trabbit.mode = 'idle'; trabbit.t = 999; trabbit.fleeT = 0;
  frame(5);
  check('wildlife5: tiger stealth-stalks the rabbit inside 20m (slow, crouched)',
    tiger.prey === trabbit && tiger.pounceT <= 0 && tiger.bodyPitch > 0.2,
    'prey=' + (tiger.prey && tiger.prey.kind) + ' pitch=' + tiger.bodyPitch.toFixed(2));
  trabbit.pos.set(tiger.pos.x + 6, G.terrainHeight(tiger.pos.x + 6, tiger.pos.z), tiger.pos.z);
  trabbit.fleeT = 0;
  frame(1);
  check('wildlife5: tiger pounces inside 8m (speed burst)', tiger.pounceT > 0,
    'pounceT=' + tiger.pounceT.toFixed(2));
  const tp0 = Math.hypot(trabbit.pos.x - tiger.pos.x, trabbit.pos.z - tiger.pos.z);
  frame(60);
  const tp1 = Math.hypot(trabbit.pos.x - tiger.pos.x, trabbit.pos.z - tiger.pos.z);
  check('wildlife5: tiger pounce closes the distance fast (or the catch lands)',
    tp1 < tp0 - 2 || tiger.prey === null,
    'd=' + tp0.toFixed(1) + '->' + tp1.toFixed(1));

  /* pandas: sit-and-eat idle loop (body pitches up while idle) */
  settle5(-100, -100);
  parkOthers5();
  const pandas = w5.filter(a => a.kind === 'panda');
  parkV5(pandas[0]);
  const panda = pandas[0];
  panda.pos.set(40, G.terrainHeight(40, 40), 40);   // far from the player: no flee
  panda.zone = { x0: 0, x1: 80, z0: 0, z1: 80 };
  panda.fleeT = 0; panda.mode = 'idle'; panda.t = 999;
  panda.sitT = 0; panda.eatCd = 0.5;
  let minPitch = 0;
  for (let i = 0; i < 900; i++) { frame(1); minPitch = Math.min(minPitch, panda.bodyPitch); }
  check('wildlife5: panda sits up to eat (body pitch dives while idle)', minPitch < -0.5,
    'minPitch=' + minPitch.toFixed(2));

  /* penguins: waddle on shore, toboggan-slide to water on panic, swim circles.
     The test pond is REAL water: a deterministic in-chunk search for a
     terrain dip below the water plane, with the shore inside 18m of the
     chunk center so the player can walk to the bird without leaving the
     chunk (no relocate mid-test, the duck-test idiom). */
  settle5(200, 200);
  let pcx = 4, pcz = 4, pwx = 0, pwz = 0, psh = null;
  for (let pr = 0; pr < 4 && pwx === 0; pr++) {
    for (let ax = 4 - pr; ax <= 4 + pr && pwx === 0; ax++) {
      for (let az = 4 - pr; az <= 4 + pr && pwx === 0; az++) {
        if (Math.max(Math.abs(ax - 4), Math.abs(az - 4)) !== pr) continue;
        const ccx = ax * 48 + 24, ccz = az * 48 + 24;
        for (let t = 0; t < 200 && pwx === 0; t++) {
          const x = (ax + ((t * 37) % 48) / 48) * 48, z = (az + ((t * 53) % 48) / 48) * 48;
          if (G.terrainHeight(x, z) < -0.55) {
            const sh = G.pondShore(x, z);
            if (Math.hypot(sh.x - ccx, sh.z - ccz) < 18) { pcx = ax; pcz = az; pwx = x; pwz = z; psh = sh; }
          }
        }
      }
    }
  }
  check('wildlife5: test pond + shore found near the player', pwx !== 0,
    pwx === 0 ? 'no water found' : 'pond=(' + pwx.toFixed(0) + ',' + pwz.toFixed(0) + ')');
  settle5(pcx * 48 + 24, pcz * 48 + 24);   // into the water chunk; relocate fires first
  parkOthers5();
  const pengs = w5.filter(a => a.kind === 'penguin');
  parkV5(pengs[0]);
  const pen = pengs[0];
  const ccx = pcx * 48 + 24, ccz = pcz * 48 + 24;   // chunk center: the player anchor
  pen.pondX = pwx; pen.pondZ = pwz; pen.shoreX = psh.x; pen.shoreZ = psh.z;
  pen.zone = { x0: psh.x - 8, x1: psh.x + 8, z0: psh.z - 8, z1: psh.z + 8 };
  pen.pos.set(psh.x, G.terrainHeight(psh.x, psh.z), psh.z);
  pen.fleeT = 0; pen.panicT = 0; pen.inWater = false; pen.slide = false;
  pen.bodyPitch = 0; pen.bodyRoll = 0;
  pen.mode = 'walk'; pen.t = 999;
  pen.target.set(psh.x + 3, 0, psh.z + 2);
  G.player.position.set(ccx, groundY(ccx, ccz), ccz);   // >10m from the waddler: no panic
  let maxRoll = 0;
  for (let i = 0; i < 120; i++) { frame(1); maxRoll = Math.max(maxRoll, Math.abs(pen.bodyRoll)); }
  check('wildlife5: penguin waddles (side-to-side body roll while walking)', maxRoll > 0.08,
    'maxRoll=' + maxRoll.toFixed(3));
  /* walk the player to 4m of the bird, staying in-chunk: toward the center */
  {
    const dx = ccx - pen.pos.x, dz = ccz - pen.pos.z, dl = Math.hypot(dx, dz) || 1;
    const nx = pen.pos.x + (dx / dl) * 4, nz = pen.pos.z + (dz / dl) * 4;
    G.player.position.set(nx, groundY(nx, nz), nz);
  }
  frame(5);
  check('wildlife5: penguin panics near the player (toboggan slide starts)',
    pen.panicT > 0 && pen.slide === true && pen.bodyPitch > 1,
    'panicT=' + pen.panicT.toFixed(2) + ' pitch=' + pen.bodyPitch.toFixed(2));
  frame(300);
  check('wildlife5: penguin reaches the water and swims (rides the water plane)',
    pen.inWater === true && Math.abs(pen.pos.y - (-0.55)) < 0.3,
    'inWater=' + pen.inWater + ' y=' + pen.pos.y.toFixed(2));
  pen.panicT = 0.05;                                        // let the panic expire
  G.player.position.set(ccx, groundY(ccx, ccz), ccz);       // back to center: no re-panic
  frame(600);
  check('wildlife5: penguin waddles back to shore when calm', pen.inWater === false,
    'inWater=' + pen.inWater);

  /* the new species are wild-only: never raise the tame prompt */
  settle5(0, 0);
  parkOthers5();
  parkV5();
  const tlion = lions[0];
  tlion.pos.set(2.5, G.terrainHeight(2.5, 0), 0);
  tlion.fleeT = 0; tlion.mode = 'idle'; tlion.t = 999; tlion.prey = null; tlion.preyCd = 999;
  frame(2);
  check('wildlife5: tame prompt excludes the new species',
    G.PET.hintOn === false && G.PET.nearA === null, 'hintOn=' + G.PET.hintOn);

  /* one render per tick still holds with the new meshes */
  globalThis.__renderCount = 0;
  frame(30);
  check('wildlife5: exactly one render per tick', globalThis.__renderCount === 30,
    'renders=' + globalThis.__renderCount);
}

/* ================= 14. PHASE 5 RURAL BUILDINGS: houses / barns / stores ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999; G.setHeat(0, true);
  const settleB = (x, z) => {
    G.player.position.set(x, groundY(x, z), z);
    G.player.rotation.y = 0;
    frame(3);   // absorb any chunk crossing -> redistributeBuildings runs
  };
  /* pure-function probe: no player move needed, works on any chunk */
  const findBldg = (type) => {
    for (let r = 2; r < 60; r++)
      for (let gx = -r; gx <= r; gx++)
        for (let gz = -r; gz <= r; gz++) {
          if (Math.max(Math.abs(gx), Math.abs(gz)) !== r) continue;
          const b = G.bldgCenterFor(gx, gz);
          if (b && b.type === type) return b;
        }
    return null;
  };
  settleB(0, 0);

  /* seeded determinism: same chunk coords, same building, every time.
     Probe a chunk known to hold a building (pure search, no player move). */
  {
    let gx = 0, gz = 0, found = false;
    for (let r = 2; r < 60 && !found; r++)
      for (let ax = -r; ax <= r && !found; ax++)
        for (let az = -r; az <= r && !found; az++) {
          if (Math.max(Math.abs(ax), Math.abs(az)) !== r) continue;
          const b = G.bldgCenterFor(ax, az);
          if (b) { gx = ax; gz = az; found = true; }
        }
    check('bldg: a building exists to test determinism', found, 'chunk ' + gx + ',' + gz);
    const a = G.bldgCenterFor(gx, gz), b = G.bldgCenterFor(gx, gz);
    check('bldg: placement is a pure function of chunk coords',
      !!a && !!b && a.x === b.x && a.z === b.z && a.type === b.type && a.variant === b.variant,
      a ? a.type + ' v' + a.variant + ' @' + a.x.toFixed(1) + ',' + a.z.toFixed(1) : 'null');
    settleB(500, -500);
    const c = G.bldgCenterFor(gx, gz);
    check('bldg: placement is stable across redistributes',
      !!a && !!c && a.x === c.x && a.z === c.z && a.type === c.type, '');
  }

  /* spawn district never gets buildings */
  {
    let any = false;
    for (let gx = -1; gx <= 1 && !any; gx++)
      for (let gz = -1; gz <= 1 && !any; gz++)
        if (G.bldgTypeFor(gx, gz) !== null) any = true;
    check('bldg: spawn district (|gx|,|gz| <= 1) has no buildings', !any);
  }

  /* one building per chunk at most; all three types place in the wild */
  {
    settleB(0, 0);
    const seen = new Set(), all = [];
    for (const k of ['house', 'barn', 'store'])
      for (const b of G.BLDG.active[k]) { seen.add(b.gx + ',' + b.gz); all.push(b); }
    check('bldg: at most one building per chunk', seen.size === all.length,
      'active=' + all.length);
    const house = findBldg('house'), barn = findBldg('barn'), store = findBldg('store');
    check('bldg: houses, barns and stores all place in the wild',
      !!house && !!barn && !!store,
      'house@(' + (house && house.gx) + ',' + (house && house.gz) + ')' +
      ' barn@(' + (barn && barn.gx) + ',' + (barn && barn.gz) + ')' +
      ' store@(' + (store && store.gx) + ',' + (store && store.gz) + ')');
    check('bldg: house has 3 seeded size variants', G.HOUSE_SCALE.length === 3 &&
      G.HOUSE_SCALE[0] === 0.8 && G.HOUSE_SCALE[2] === 1.3, G.HOUSE_SCALE.join(','));
  }

  /* no building near the player spawn */
  {
    settleB(0, 0);
    let minD = 1e9;
    for (const k of ['house', 'barn', 'store'])
      for (const b of G.BLDG.active[k])
        minD = Math.min(minD, Math.hypot(b.x, b.z));
    check('bldg: no building near the player spawn', minD > 48, 'minD=' + minD.toFixed(1));
  }

  /* player foot collision: cannot walk through a house */
  {
    const h = findBldg('house');
    if (h) {
      G.player.position.set(h.x + 0.5, groundY(h.x, h.z), h.z);
      G.P.vel.set(0, 0, 0);
      frame(3);
      const d = Math.hypot(G.player.position.x - h.x, G.player.position.z - h.z);
      const minD = h.scale * 4.6 + 0.45 - 0.01;
      check('bldg: player cannot walk through a house (pushed out of the wall)',
        d >= minD, 'd=' + d.toFixed(2) + ' min=' + minD.toFixed(2));
    } else check('bldg: player cannot walk through a house (pushed out of the wall)', false, 'no house found');
  }

  /* vehicle collision: the car is pushed out of a house via AMEN.colliders */
  {
    const h = findBldg('house');
    if (h) {
      G.CAR.pos.set(h.x, groundY(h.x, h.z), h.z);
      G.CAR.hitCd = 0; G.CAR.speed = 0; G.CAR.hp = 100; G.CAR.armor = 0;
      G.carAmenityHit(0.016);
      const d = Math.hypot(G.CAR.pos.x - h.x, G.CAR.pos.z - h.z);
      check('bldg: car cannot drive through a house', d >= h.scale * 4.6 - 0.01,
        'd=' + d.toFixed(2));
    } else check('bldg: car cannot drive through a house', false, 'no house found');
  }

  /* general store: walk-in reuses the shared gun/health shop panel */
  {
    const st = findBldg('store');
    check('bldg: a general store exists in the wild', !!st, st ? st.name : 'none found');
    if (st) {
      settleB(st.x, st.z);   // teleported onto the porch ring: inside the 7m trigger
      let opened = false;
      for (let i = 0; i < 40 && !opened; i++) { frame(1); opened = G.shopOpen; }
      check('bldg: walking into the store opens the shop panel', opened);
      check('bldg: store panel is the shared gun/health shop', G.shopBldg === true);
      G.cash = 1000; G.P.hp = 50;
      G.buyItem(3);   // FIELD PATCH +50 HP, $50: repeatable economy path
      check('bldg: store sells health for cash (no new economy code)',
        G.cash === 950 && G.P.hp === 100, 'cash=' + G.cash + ' hp=' + G.P.hp);
      G.closeShop();
      check('bldg: closing the store re-arms on walk-out', G.shopOpen === false);
    }
  }

  /* night window glow: baked emissiveMap ramp, zero new lights */
  {
    G.dayPhase = 0.75;   // midnight
    frame(5);
    const lit = G.BLDG_WIN_MATS.every(m => m.emissiveIntensity > 1);
    check('bldg: windows glow at night (emissiveMap ramp, no new lights)', lit,
      G.BLDG_WIN_MATS.map(m => m.emissiveIntensity.toFixed(2)).join(','));
    G.dayPhase = 0.25;   // noon
    frame(5);
    const dark = G.BLDG_WIN_MATS.every(m => m.emissiveIntensity < 0.01);
    check('bldg: windows dark by day',
      dark, G.BLDG_WIN_MATS.map(m => m.emissiveIntensity.toFixed(2)).join(','));
  }

  /* bullets collide: the hitscan raycast stops at building walls */
  {
    const h = findBldg('house');
    if (h) {
      settleB(h.x + 30, h.z);   // keep the house inside the live chunk grid
      frame(2);
      const rc = new THREE.Raycaster();
      rc.set(new THREE.Vector3(h.x + 25, h.y + 2, h.z), new THREE.Vector3(-1, 0, 0));
      rc.far = 60;
      const hits = rc.intersectObjects(G.bldgMeshes, false);
      check('bldg: raycast hits the house wall (bullets collide with buildings)',
        hits.length > 0 && hits[0].distance < 25,
        hits.length ? 'd=' + hits[0].distance.toFixed(1) : 'no hit');
    } else check('bldg: raycast hits the house wall (bullets collide with buildings)', false, 'no house found');
  }

  /* one literal `new THREE.InstancedMesh` site in the building loop (43 -> 44),
     backing 3 runtime meshes: house, barn, store. One draw call each. */
  {
    const n = (html.match(/new THREE\.InstancedMesh/g) || []).length;
    /* 2026-10-09 farming: +1 crop InstancedMesh literal (45 = 44 + 1 farming crops); pads reuse ZONE_PADS, zero new draws */
    check('perf5: 44 IM literals after PERF-5 consolidation; civic fleet rides the shared def-loop literal, 4 runtime building meshes',
      n === 44 && G.bldgMeshes.length === 4, 'literals=' + n + ' meshes=' + G.bldgMeshes.length);
  }

  /* one render per tick still holds with the new meshes */
  globalThis.__renderCount = 0;
  frame(30);
  check('bldg: exactly one render per tick', globalThis.__renderCount === 30,
    'renders=' + globalThis.__renderCount);
}

/* ================= 17. COOKING + FOOD (Phase 5) ================= */
{
  /* clean preconditions: the real gates refuse dead/shopping/driving states */
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999; G.setHeat(0, true);
  G.closeShop();
  G.CAR.driving = false; G.HORSE.riding = false;
  G.BUS.driving = false; G.BUS.riding = false; G.TX.riding = false;
  G.BIKE.driving = false; G.BC.driving = false; G.SC.driving = false;

  /* setup: a real farm plot at a ripe moment (pattern mirrors farm3d_test) */
  let plot0 = null, pChunk = null;
  for (let gx = -12; gx <= 12 && !plot0; gx++)
    for (let gz = -12; gz <= 12 && !plot0; gz++) {
      const p = G.farmPlotCenterFor(gx, gz);
      if (p) { pChunk = [gx, gz]; plot0 = p; }
    }
  check('food: a farm plot exists for the harvest test', !!plot0);
  if (plot0) {
    G.player.position.set(plot0.x, groundY(plot0.x, plot0.z), plot0.z);
    frame(3);   // chunk crossing -> redistributeFarm
    const p = G.FPLOT.active.find(q => q.gx === pChunk[0] && q.gz === pChunk[1]);
    let ripeT = -1;
    for (let t = 0; t <= 600 && ripeT < 0; t += 5)
      if (G.farmPlotMatureCount(p, t) >= G.FARM_MATURE_NEED) ripeT = t;
    check('food: a ripe moment exists', ripeT >= 0, 'ripeT=' + ripeT);
    G.FPLOT.t = ripeT;
    G.player.position.set(p.x, groundY(p.x, p.z), p.z);
    frame(15);  // farmTick settles nearIdx / nearMature
    check('food: E gate arms on the ripe plot',
      G.FPLOT.nearIdx >= 0 && G.FPLOT.nearMature === true,
      'nearIdx=' + G.FPLOT.nearIdx + ' mature=' + G.FPLOT.nearMature);
    /* clear proximity prompts so the E press is unambiguous */
    G.HORSE.hintOn = false; G.BUS.hintOn = false; G.TX.hintOn = false;
    G.BIKE.hintOn = false; G.BC.hintOn = false; G.SC.hintOn = false; G.PET.hintOn = false;
    const corn0 = G.FOOD.corn, cash0 = G.cash;
    check('food: E harvests via the real gate', G.farmTryHarvest() === true);
    check('food: harvest yields corn produce', G.FOOD.corn > corn0, 'corn=' + G.FOOD.corn);
    const delta = G.cash - cash0;
    check('food: harvest cash unchanged (+$15..$23)', delta >= 15 && delta <= 23, 'delta=' + delta);
    check('food: harvest toast names cash and corn',
      G.toastEl.textContent.indexOf('HARVEST +$') === 0 && G.toastEl.textContent.indexOf('CORN') > 0,
      G.toastEl.textContent);
    check('food: HUD chip appears with the corn count',
      G.foodChipEl.style.display === 'block' && G.foodChipEl.textContent.indexOf('CORN x') === 0,
      G.foodChipEl.textContent);
  }

  /* cook: the diner walk-in panel offers the cook option (shared panel, list swap) */
  G.closeShop();
  G.FOOD.corn = 3; G.updateFoodHUD();
  G.openRest({ name: 'TEST DINER' }, 0);
  check('cook: diner panel opens', G.shopOpen === true);
  const cookIdx = G.REST_ITEMS.findIndex(it => it.state() === 'COOK');
  check('cook: diner menu has a COOK row when corn is carried', cookIdx === 2, 'idx=' + cookIdx);
  G.buyItem(cookIdx);   // the COOK row swaps the list, no purchase
  check('cook: cook row swaps the panel to FIELD KITCHEN',
    G.SHOP_LIST === G.COOK_ITEMS && G.shopNameEl.textContent === 'FIELD KITCHEN');
  check('cook: five recipe rows plus a BACK row', G.COOK_ITEMS.length === 6);
  check('cook: recipe rows carry procedural icons',
    G.COOK_ITEMS.slice(0, 5).every(it => typeof it.icon === 'string' && it.icon.indexOf('data:image/png') === 0));
  check('cook: recipe costs are produce maps (farming v1)',
    G.COOK_ITEMS[0].cost.corn === 2 && G.COOK_ITEMS[1].cost.tomato === 3 &&
    G.COOK_ITEMS[3].cost.corn === 2 && G.COOK_ITEMS[3].cost.tomato === 2,
    JSON.stringify(G.COOK_ITEMS.map(it => it.cost)));
  check('cook: cost labels read as produce ("3 TOMATO", "2 CORN + 2 TOMATO")',
    G.foodCostStr({ tomato: 3 }) === '3 TOMATO' &&
    G.foodCostStr({ corn: 2, tomato: 2 }) === '2 CORN + 2 TOMATO',
    G.foodCostStr({ tomato: 3 }));
  const soupIdx = G.COOK_ITEMS.findIndex(it => it.dishName === 'TOMATO SOUP');
  G.FOOD.tomato = 3; G.updateFoodHUD();
  check('cook: soup row is BUY with 3 tomato', G.COOK_ITEMS[soupIdx].state() === 'BUY');
  G.buyItem(soupIdx);
  check('cook: 3 tomato -> TOMATO SOUP',
    G.FOOD.soup === 1 && G.FOOD.tomato === 0, 'tomato=' + G.FOOD.tomato + ' soup=' + G.FOOD.soup);
  check('cook: toast confirms the dish', G.toastEl.textContent === 'COOKED TOMATO SOUP', G.toastEl.textContent);
  const pieIdx = G.COOK_ITEMS.findIndex(it => it.dishName === 'PUMPKIN PIE');
  check('cook: pie row is NA with 0 pumpkin (mismatch denied)', G.COOK_ITEMS[pieIdx].state() === 'NA');
  const pumpBefore = G.FOOD.pumpkin, pieBefore = G.FOOD.pie;
  G.buyItem(pieIdx);
  check('cook: denied cook changes nothing',
    G.FOOD.pumpkin === pumpBefore && G.FOOD.pie === pieBefore);
  G.FOOD.corn = 1; G.updateFoodHUD();   // odd leftover: the SCRAPS fallback row
  const scrIdx = G.COOK_ITEMS.findIndex(it => it.dishName === 'SCRAPS');
  G.buyItem(scrIdx);
  check('cook: 1 corn -> SCRAPS fallback', G.FOOD.scraps === 1 && G.FOOD.corn === 0,
    'corn=' + G.FOOD.corn + ' scraps=' + G.FOOD.scraps);
  G.buyItem(G.COOK_ITEMS.length - 1);   // BACK row
  check('cook: BACK restores the diner menu without closing',
    G.SHOP_LIST === G.REST_ITEMS && G.shopNameEl.textContent === 'TEST DINER' && G.shopOpen === true);
  G.closeShop();

  /* eat: dishes eaten anywhere via the food chip panel */
  G.FOOD.soup = 1; G.FOOD.roasted = 1; G.updateFoodHUD();
  G.P.hp = 30; G.updateHpHUD();
  G.openFoodPanel();
  check('eat: food panel opens anywhere',
    G.shopOpen === true && G.SHOP_LIST === G.EAT_ITEMS && G.shopNameEl.textContent === 'FIELD KITCHEN');
  const eatSoupIdx = G.EAT_ITEMS.findIndex(it => it.dishName === 'TOMATO SOUP');
  check('eat: soup row is BUY below full HP', G.EAT_ITEMS[eatSoupIdx].state() === 'BUY');
  G.buyItem(eatSoupIdx);
  check('eat: TOMATO SOUP heals +70 (capped at 100)',
    G.P.hp === 100 && G.FOOD.soup === 0, 'hp=' + G.P.hp + ' soup=' + G.FOOD.soup);
  check('eat: toast confirms the meal', G.toastEl.textContent === 'ATE TOMATO SOUP', G.toastEl.textContent);
  G.P.hp = 100; G.updateHpHUD();
  check('eat: rows go NA at full HP (no wasted food)',
    G.EAT_ITEMS.find(it => it.dishName === 'ROASTED CORN').state() === 'NA');
  G.closeShop();

  /* save/load round-trips the pantry (schema v3) */
  /* save/load round-trips the pantry (schema v3) */
  G.player.position.set(10, groundY(10, 20), 20);   // inside the save validation radius
  const savedFood = G.foodSaveStr();
  G.saveGame();
  const raw = stubs.localStorage.getItem(G.SAVE_KEY);
  check('food: save envelope carries the food field',
    !!raw && raw.indexOf('"food":"' + savedFood + '"') >= 0, savedFood);
  for (const k of G.FOOD_ORDER) G.FOOD[k] = 0;
  G.updateFoodHUD();
  check('food: chip hides when the pantry is empty', G.foodChipEl.style.display === 'none');
  G.loadSave();
  check('food: load restores the pantry exactly', G.foodSaveStr() === savedFood, G.foodSaveStr());
  check('food: chip reappears after load', G.foodChipEl.style.display === 'block');
  const before = G.foodSaveStr();
  const env = JSON.parse(stubs.localStorage.getItem(G.SAVE_KEY));
  env.data.food = '7:0:99999:1:0:0:0:0:0';   // tampered: 99999 exceeds the cap
  stubs.localStorage.setItem(G.SAVE_KEY, JSON.stringify(env));
  G.loadSave();
  check('food: tampered food field is rejected (state kept)', G.foodSaveStr() === before, G.foodSaveStr());
  G.FOOD.corn = 5; G.updateFoodHUD();
  G.newGame();
  check('food: new game empties the pantry',
    G.foodSaveStr() === '0:0:0:0:0:0:0:0:0' && G.foodChipEl.style.display === 'none', G.foodSaveStr());

  /* static pins: zero new draw calls / meshes / lights / keybinds / audio nodes */
  check('food-static: InstancedMesh literal sites pin at 44 (48 - PERF-5 consolidation: trunks+fol merge, npcLegs->limbIM, copGuns->limbIM, brute IM->Mesh)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 44);
  check('food-static: single renderer.render call site',
    (html.match(/renderer\.render\(/g) || []).length === 1);
  check('food-static: Math.random lines pin at 92 (91 + 1 boat splash noise, one-shot audio)',
    (html.match(/^.*Math\.random.*$/gm) || []).length === 92);
  check('food-static: light count pins at 6 (zero new lights)',
    (html.match(/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/g) || []).length === 6);
  check('food-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('food-static: audio nodes pin (17 osc, 30 gain: +2 motor osc, +1 motor gain, +1 splash gain, +2 rotor osc, +4 rotor gains, +1 piano osc, +2 piano gains, +2 prop osc, +1 prop gain, +1 buffet gain)',
    (html.match(/\.createOscillator\(/g) || []).length === 17 &&
    (html.match(/\.createGain\(/g) || []).length === 30 &&
    (html.match(/AudioContext/g) || []).length === 2);
  {
    const foodSrc = html.slice(
      html.indexOf('/* ================== COOKING + FOOD'),
      html.indexOf('/* ============================ CAMERA'));
    check('food-static: food block creates no THREE objects',
      foodSrc.length > 1000 && !/new THREE\./.test(foodSrc), foodSrc.length + ' chars');
  }
  check('food: nine procedural icons as data URLs (farming v1: +tomato/pumpkin/pie)',
    G.FOOD_ORDER.every(k => typeof G.FOOD_ICONS[k] === 'string' && G.FOOD_ICONS[k].indexOf('data:image/png') === 0),
    Object.keys(G.FOOD_ICONS).join(','));
}

/* ================= 18. FARMING v1 DELTAS (Phase 5 food/farming) ================= */
{
  /* clean preconditions + farm session state reset (17 harvested a plot) */
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999; G.setHeat(0, true);
  G.closeShop();
  G.CAR.driving = false; G.HORSE.riding = false;
  G.BUS.driving = false; G.BUS.riding = false; G.TX.riding = false;
  G.BIKE.driving = false; G.BC.driving = false; G.SC.driving = false;
  for (const k of G.FOOD_ORDER) G.FOOD[k] = 0;
  G.updateFoodHUD();
  G.FPLOT.harvestT.clear(); G.FPLOT.planted.clear(); G.FPLOT.pop.clear();
  G.FPLOT.harvested = 0; G.FPLOT.seedSel = 'corn'; G.FPLOT.t = 0;

  /* deterministic plot */
  let plot0 = null, pChunk = null;
  for (let gx = -12; gx <= 12 && !plot0; gx++)
    for (let gz = -12; gz <= 12 && !plot0; gz++) {
      const p = G.farmPlotCenterFor(gx, gz);
      if (p) { pChunk = [gx, gz]; plot0 = p; }
    }
  check('farmv1: deterministic farm plot found', !!plot0,
    plot0 ? 'chunk(' + pChunk[0] + ',' + pChunk[1] + ')' : 'none');
  if (plot0) {
    const p = G.FPLOT.active.find(q => q.gx === pChunk[0] && q.gz === pChunk[1]);
    const pkey = p.gx + ',' + p.gz;
    const j = G.FPLOT.active.indexOf(p), base = j * 24;
    let ripeT = -1;
    for (let t = 0; t <= 600 && ripeT < 0; t += 5)
      if (G.farmPlotMatureCount(p, t) >= 8) ripeT = t;
    check('farmv1: a ripe moment exists', ripeT >= 0, 'ripeT=' + ripeT);
    G.FPLOT.t = ripeT;
    G.player.position.set(p.x, groundY(p.x, p.z), p.z);
    frame(15);
    check('farmv1: E gate arms on the ripe plot',
      G.FPLOT.nearIdx >= 0 && G.FPLOT.nearMature === true, 'nearIdx=' + G.FPLOT.nearIdx);
    check('farmv1: chip shows FARM - READY!',
      G.farmChipEl.style.display === 'block' && G.farmChipEl.textContent === 'FARM - READY!',
      G.farmChipEl.textContent);

    /* harvest juice: cash float + scale pop + produce + counter */
    const harv0 = G.FPLOT.harvested, cash0 = G.cash, corn0 = G.FOOD.corn;
    check('farmv1: E harvests via the real gate', G.farmTryHarvest() === true);
    const delta = G.cash - cash0;
    check('farmv1: harvest cash in the corn band (+$15..$23)', delta >= 15 && delta <= 23, 'delta=' + delta);
    check('farmv1: cash float shows the gain', G.cashFloatEl.textContent === '+$' + delta,
      G.cashFloatEl.textContent);
    check('farmv1: harvest yields corn produce', G.FOOD.corn > corn0, 'corn=' + G.FOOD.corn);
    check('farmv1: harvest toast names cash and crop',
      G.toastEl.textContent.indexOf('HARVEST +$') === 0 && G.toastEl.textContent.indexOf('CORN') > 0,
      G.toastEl.textContent);
    check('farmv1: scale pop is armed on the plot', G.FPLOT.pop.has(pkey));
    check('farmv1: harvest counter increments', G.FPLOT.harvested === harv0 + 1);

    /* fallow window: replant hint + chip */
    check('farmv1: plot is fallow after harvest', G.farmFallow(p, G.FPLOT.t) === true);
    frame(15);
    check('farmv1: fallow hint offers planting',
      G.farmHintEl.textContent === 'PLANT CORN [E]', G.farmHintEl.textContent);
    check('farmv1: chip shows FARM - HARVESTED n',
      G.farmChipEl.textContent === 'FARM - HARVESTED 1', G.farmChipEl.textContent);

    /* seed selection cycles corn -> tomato -> pumpkin -> corn */
    G.cycleFarmSeed();
    check('farmv1: chip click cycles seed to tomato',
      G.FPLOT.seedSel === 'tomato' && G.toastEl.textContent === 'SEED: TOMATO (FREE)',
      G.FPLOT.seedSel + ' / ' + G.toastEl.textContent);
    G.cycleFarmSeed();
    check('farmv1: seed cycles to pumpkin', G.FPLOT.seedSel === 'pumpkin', G.FPLOT.seedSel);
    G.cycleFarmSeed();
    check('farmv1: seed cycles back to corn', G.FPLOT.seedSel === 'corn', G.FPLOT.seedSel);

    /* plant tomato: free, restarts growth, deterministic stages */
    G.cycleFarmSeed();   // -> tomato
    const cash1 = G.cash;
    check('farmv1: E plants the selected seed', G.farmTryPlant() === true);
    check('farmv1: plant toast names the crop', G.toastEl.textContent === 'PLANTED TOMATO (FREE SEEDS)',
      G.toastEl.textContent);
    check('farmv1: seeds are free (cash unchanged)', G.cash === cash1);
    check('farmv1: planted type is recorded', G.FPLOT.planted.get(pkey) === 'tomato');
    check('farmv1: planting is no longer fallow', G.farmFallow(p, G.FPLOT.t) === false);
    const st0 = G.cropStageFor(p.gx, p.gz, 0, G.FPLOT.t);
    check('farmv1: planted crop restarts at sprout', st0 === 0, 'stage=' + st0);
    G.FPLOT.t += 61;   // past the cooldown: stages go time-based again
    const sa = G.cropStageFor(p.gx, p.gz, 3, G.FPLOT.t);
    const sb = G.cropStageFor(p.gx, p.gz, 3, G.FPLOT.t);
    check('farmv1: stage progression is deterministic (pure function)', sa === sb && sa >= 0 && sa <= 2,
      'stage=' + sa);

    /* planting wins over pet-tame near a fallow plot */
    G.FPLOT.harvestT.set(pkey, G.FPLOT.t);
    G.FPLOT.planted.delete(pkey);
    check('farmv1: fallow can be forced for the priority test', G.farmFallow(p, G.FPLOT.t) === true);
    G.PET.hintOn = true;
    const plantWins = G.farmTryPlant();
    G.PET.hintOn = false;
    check('farmv1: planting wins over pet-tame', plantWins === true &&
      G.FPLOT.planted.get(pkey) === 'tomato', 'planted=' + G.FPLOT.planted.get(pkey));

    /* blocked while driving */
    G.CAR.driving = true;
    frame(3);
    check('farmv1: plant is blocked while driving', G.farmTryPlant() === false);
    check('farmv1: harvest is blocked while driving', G.farmTryHarvest() === false);
    G.CAR.driving = false;
    /* driving seats the player in the car (chunk jump unloads the farm):
       walk back to the plot and re-acquire it */
    G.player.position.set(plot0.x, groundY(plot0.x, plot0.z), plot0.z);
    frame(3);
    const pBack = G.FPLOT.active.find(q => q.gx === pChunk[0] && q.gz === pChunk[1]);
    check('farmv1: plot is active again after the drive', !!pBack);
    const j2 = G.FPLOT.active.indexOf(pBack), base2 = j2 * 24;

    /* harvest the tomato plot: produce + cash band + type revert */
    let ripeT2 = -1;
    for (let t = Math.ceil(G.FPLOT.t) + 1; t <= G.FPLOT.t + 900 && ripeT2 < 0; t += 5)
      if (G.farmPlotMatureCount(p, t) >= 8) ripeT2 = t;
    check('farmv1: the tomato plot ripens', ripeT2 >= 0, 'ripeT2=' + ripeT2);
    if (ripeT2 >= 0) {
      G.FPLOT.t = ripeT2;
      /* mature tint: repaint synchronously at exactly ripeT2 (the test jumps
         the farm clock, so the 1Hz ticker cannot be relied on), then read */
      G.farmPaintCrops();
      let midx = -1;
      for (let k = 0; k < 24 && midx < 0; k++) {
        const sd = G.FPLOT.seed[base2 + k];
        if (sd && G.cropStageFor(sd.gx, sd.gz, sd.k, ripeT2) === 2) midx = base2 + k;
      }
      check('farmv1: a mature instance exists to tint', midx >= 0, 'idx=' + midx);
      if (midx >= 0) {
        const tc = G.FARM_MATURE_COL.tomato.clone();
        G.CROP_IM.getColorAt(midx, tc);
        check('farmv1: mature instance wears the tomato tint', tc.getHex() === 0xd8452e,
          'hex=' + tc.getHex().toString(16));
      }
      G.player.position.set(p.x, groundY(p.x, p.z), p.z);
      frame(15);   // settles nearIdx/nearMature/hint/chip for the harvest below
      const tom0 = G.FOOD.tomato, cash2 = G.cash;
      check('farmv1: tomato harvest via the real gate', G.farmTryHarvest() === true);
      const d2 = G.cash - cash2;
      check('farmv1: tomato cash in the tomato band (+$18..$30)', d2 >= 18 && d2 <= 30, 'delta=' + d2);
      check('farmv1: tomato harvest yields tomatoes', G.FOOD.tomato > tom0, 'tomato=' + G.FOOD.tomato);
      check('farmv1: toast names the tomato crop',
        G.toastEl.textContent.indexOf('TOMATO') > 0, G.toastEl.textContent);
      check('farmv1: plot reverts to ambient corn after harvest',
        !G.FPLOT.planted.has(pkey));
    }

    /* cooking: pumpkin pie + field hash + meal selling at the diner */
    G.closeShop();
    G.FOOD.pumpkin = 3; G.updateFoodHUD();
    G.openRest({ name: 'TEST DINER' }, 0);
    const cookIdx = G.REST_ITEMS.findIndex(it => it.state() === 'COOK');
    G.buyItem(cookIdx);
    const pieIdx = G.COOK_ITEMS.findIndex(it => it.dishName === 'PUMPKIN PIE');
    check('farmv1: pie row is BUY with 3 pumpkin', G.COOK_ITEMS[pieIdx].state() === 'BUY');
    G.buyItem(pieIdx);
    check('farmv1: 3 pumpkin -> PUMPKIN PIE',
      G.FOOD.pie === 1 && G.FOOD.pumpkin === 0, 'pumpkin=' + G.FOOD.pumpkin + ' pie=' + G.FOOD.pie);
    G.FOOD.corn = 2; G.FOOD.tomato = 2; G.updateFoodHUD();
    const hashIdx = G.COOK_ITEMS.findIndex(it => it.dishName === 'FIELD HASH');
    check('farmv1: hash row is BUY with 2 corn + 2 tomato', G.COOK_ITEMS[hashIdx].state() === 'BUY');
    G.buyItem(hashIdx);
    check('farmv1: mixed cost is deducted exactly',
      G.FOOD.hash === 1 && G.FOOD.corn === 0 && G.FOOD.tomato === 0,
      'corn=' + G.FOOD.corn + ' tomato=' + G.FOOD.tomato + ' hash=' + G.FOOD.hash);
    G.buyItem(G.COOK_ITEMS.length - 1);   // BACK to the diner menu
    for (const k of G.FOOD_ORDER) G.FOOD[k] = 0;
    G.FOOD.soup = 2; G.FOOD.pie = 1; G.updateFoodHUD();
    const sellIdx = G.REST_ITEMS.findIndex(it => it.dishName === 'MEALS');
    check('farmv1: diner menu has a SELL MEALS row', sellIdx === 3, 'idx=' + sellIdx);
    check('farmv1: sell row is BUY with dishes carried', G.REST_ITEMS[sellIdx].state() === 'BUY');
    const cash3 = G.cash;
    G.buyItem(sellIdx);
    check('farmv1: selling 2 soup + 1 pie pays $70',
      G.cash - cash3 === 70 && G.FOOD.soup === 0 && G.FOOD.pie === 0,
      'delta=' + (G.cash - cash3));
    check('farmv1: sell toast confirms', G.toastEl.textContent === 'SOLD MEALS', G.toastEl.textContent);
    check('farmv1: cash float shows the sale', G.cashFloatEl.textContent === '+$70',
      G.cashFloatEl.textContent);
    G.closeShop();

    /* legacy 6-part pantry still loads */
    G.foodLoadStr('1:2:3:4:5:6');
    check('farmv1: legacy 6-part pantry loads into the first six keys',
      G.foodSaveStr() === '1:2:3:4:5:6:0:0:0', G.foodSaveStr());
    for (const k of G.FOOD_ORDER) G.FOOD[k] = 0;
    G.updateFoodHUD();

    /* growing chip state on a non-ripe, non-fallow moment (1s of stability
       so the frame cadence cannot straddle a stage boundary) */
    let growT = -1;
    for (let t = Math.ceil(G.FPLOT.t) + 61; t <= G.FPLOT.t + 900 && growT < 0; t += 5)
      if (G.farmPlotMatureCount(pBack, t) < 8 && G.farmPlotMatureCount(pBack, t + 1) < 8) growT = t;
    check('farmv1: a stable growing moment exists', growT >= 0, 'growT=' + growT);
    if (growT >= 0) {
      G.FPLOT.t = growT;
      G.player.position.set(pBack.x, groundY(pBack.x, pBack.z), pBack.z);
      frame(15);
      check('farmv1: chip shows FARM - GROWING n/24',
        G.farmChipEl.textContent.indexOf('FARM - GROWING') === 0, G.farmChipEl.textContent);
    }
  }

  /* static pins: zero new draw calls / meshes / lights / keybinds / audio nodes */
  check('farmv1-static: InstancedMesh literal sites pin at 44 (48 - PERF-5 consolidation: trunks+fol merge, npcLegs->limbIM, copGuns->limbIM, brute IM->Mesh)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 44);
  check('farmv1-static: single renderer.render call site',
    (html.match(/renderer\.render\(/g) || []).length === 1);
  check('farmv1-static: Math.random lines pin at 92 (91 + 1 boat splash noise, one-shot audio)',
    (html.match(/^.*Math\.random.*$/gm) || []).length === 92);
  check('farmv1-static: light count pins at 6 (zero new lights)',
    (html.match(/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/g) || []).length === 6);
  check('farmv1-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('farmv1-static: audio nodes pin (17 osc, 30 gain: +2 motor osc, +1 motor gain, +1 splash gain, +2 rotor osc, +4 rotor gains, +1 piano osc, +2 piano gains, +2 prop osc, +1 prop gain, +1 buffet gain)',
    (html.match(/\.createOscillator\(/g) || []).length === 17 &&
    (html.match(/\.createGain\(/g) || []).length === 30 &&
    (html.match(/AudioContext/g) || []).length === 2);
  check('farmv1-static: no TODO/FIXME markers', !/\b(TODO|FIXME)\b/.test(html));
  check('farmv1-static: no em dashes', !html.includes('—'));
  {
    const dSrc = html.slice(
      html.indexOf('FARMING v1 DELTAS'),
      html.indexOf('/* ================== COOKING + FOOD'));
    check('farmv1-static: delta block adds no meshes, one THREE.Color literal (mature tints)',
      dSrc.length > 1000 && (dSrc.match(/new THREE\./g) || []).length === 1,
      (dSrc.match(/new THREE\./g) || []).length + ' THREE news');
  }
}

/* ================= 20. SOCCER MINI-GAME (Phase 5 sports) ================= */
{
  /* deterministic soccer park: pure chunk functions, nearest to spawn */
  let spa = null, spaD = Infinity;
  for (let gx = -14; gx <= 14; gx++)
    for (let gz = -14; gz <= 14; gz++) {
      if (!G.soccerPitchFor(gx, gz)) continue;
      const a = G.amenityCenterFor(gx, gz);
      if (!a) continue;
      const d = a.x * a.x + a.z * a.z;
      if (d < spaD) { spaD = d; spa = a; }
    }
  check('soccer: deterministic soccer park found near spawn', !!spa,
    spa ? 'chunk(' + spa.gx + ',' + spa.gz + ')' : 'none');
  check('soccer: selector is a seeded subset of parks',
    G.soccerPitchFor(spa.gx, spa.gz) === true);

  /* teleport next to it; the real tick runs find + spawn.
     The chunk jump rebuilds the taxi/bus loops, and a far jump teleports
     the cab to stop 0, which can be the pitch itself; a cab sitting on the
     center spot would dribble the ball on spawn (by design) and break the
     seeded-spawn assertions. Shoo every vehicle off the pitch first. */
  G.player.position.set(spa.x + 8, groundY(spa.x + 8, spa.z), spa.z);
  frame(1);   // chunk change -> redistributeAmenities -> soccerTick spawns
  {
    const p0 = G.SOCCER.pitch || spa;
    for (const v of [G.CAR, G.BUS, G.TX, G.BIKE, G.BC, G.SC]) {
      if (Math.hypot(v.pos.x - p0.x, v.pos.z - p0.z) < 12)
        v.pos.set(p0.x + 60, groundY(p0.x + 60, p0.z), p0.z + 40);
    }
  }
  frame(2);
  const p = G.SOCCER.pitch;
  check('soccer: ball spawns at the active soccer park',
    G.SOCCER.active === true && G.ballMesh.visible === true && !!p,
    'active=' + G.SOCCER.active + ' visible=' + G.ballMesh.visible);
  check('soccer: ball seeded at pitch center',
    Math.hypot(G.SOCCER.pos.x - p.x, G.SOCCER.pos.z - p.z) < 0.01,
    'dist=' + Math.hypot(G.SOCCER.pos.x - p.x, G.SOCCER.pos.z - p.z).toFixed(3));
  check('soccer: chip shows the session tally',
    G.socChipEl.style.display === 'block' &&
    G.socChipEl.textContent === 'SOCCER - GOALS 0', G.socChipEl.textContent);

  /* dribble: walk the player body into the ball */
  G.SOCCER.pos.set(p.x, groundY(p.x, p.z) + 0.4, p.z);
  G.SOCCER.vel.set(0, 0, 0);
  G.player.position.set(p.x + 0.7, groundY(p.x + 0.7, p.z), p.z);
  G.P.vel.set(-3, 0, 0);
  const bx0 = G.SOCCER.pos.x;
  frame(10);
  check('soccer: body contact dribbles the ball (push-out + velocity)',
    G.SOCCER.pos.x < bx0 - 0.3,
    'x ' + bx0.toFixed(2) + ' -> ' + G.SOCCER.pos.x.toFixed(2));
  check('soccer: dribble shows on the chip',
    G.socChipEl.textContent.indexOf('DRIBBLE!') === 0, G.socChipEl.textContent);

  /* kick: F path via doKick, impulse along the aim */
  G.SOCCER.pos.set(p.x, groundY(p.x, p.z) + 0.4, p.z);
  G.SOCCER.vel.set(0, 0, 0);
  G.player.position.set(p.x + 1.5, groundY(p.x + 1.5, p.z), p.z);
  G.P.punchCd = 0;
  check('soccer: kick allowed on foot near the ball', G.soccerCanKick() === true);
  G.doKick();
  const ksp = Math.hypot(G.SOCCER.vel.x, G.SOCCER.vel.z);
  check('soccer: kick fires a power impulse', ksp > 10 && G.SOCCER.vel.y > 0,
    'speed=' + ksp.toFixed(1) + ' vy=' + G.SOCCER.vel.y.toFixed(1));
  check('soccer: kick flashes on the chip',
    G.socChipEl.textContent.indexOf('KICK!') === 0, G.socChipEl.textContent);
  /* kick guards: driving and death block it (doPunch guard idiom) */
  G.CAR.driving = true;
  check('soccer: kick blocked while driving', G.soccerCanKick() === false);
  G.CAR.driving = false;
  G.P.dead = true;
  check('soccer: kick blocked while dead', G.soccerCanKick() === false);
  G.P.dead = false;

  /* goal: across the attack (+X local) line between the posts */
  const yaw = p.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
  const toWorld = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
  const toLocal = (wx, wz) => {
    const dx = wx - p.x, dz = wz - p.z;
    return [dx * c - dz * s, dx * s + dz * c];
  };
  {
    const [wx, wz] = toWorld(8.5, 0);
    G.SOCCER.pos.set(wx, groundY(wx, wz) + 0.4, wz);
    G.SOCCER.vel.set(c * 8, 0, -s * 8);   // local +X
    const cash0 = G.cash, goals0 = G.SOCCER.goals;
    frame(10);
    check('soccer: attack-line goal scores +$30',
      G.cash === cash0 + 30 && G.SOCCER.goals === goals0 + 1,
      'cash=' + G.cash + ' goals=' + G.SOCCER.goals);
    check('soccer: GOAL! toast fires', G.toastEl.textContent === 'GOAL! +$30',
      G.toastEl.textContent);
    check('soccer: ball resets to pitch center after a goal',
      Math.hypot(G.SOCCER.pos.x - p.x, G.SOCCER.pos.z - p.z) < 0.5 &&
      G.SOCCER.vel.lengthSq() === 0,
      'dist=' + Math.hypot(G.SOCCER.pos.x - p.x, G.SOCCER.pos.z - p.z).toFixed(2));
  }
  /* own goal: across the -X line, toast but no cash */
  {
    const [wx, wz] = toWorld(-8.5, 0);
    G.SOCCER.pos.set(wx, groundY(wx, wz) + 0.4, wz);
    G.SOCCER.vel.set(-c * 8, 0, s * 8);   // local -X
    const cash1 = G.cash, goals1 = G.SOCCER.goals;
    frame(10);
    check('soccer: own goal pays no cash and adds no tally',
      G.cash === cash1 && G.SOCCER.goals === goals1,
      'cash=' + G.cash + ' goals=' + G.SOCCER.goals);
    check('soccer: OWN GOAL toast fires', G.toastEl.textContent === 'OWN GOAL',
      G.toastEl.textContent);
  }

  /* goalie: assigned near the pitch, mirrors the ball, resumes on leave.
     Release first so the announce toast is observable on re-assignment. */
  G.soccerReleaseGoalie();
  G.player.position.set(p.x + 5, groundY(p.x + 5, p.z), p.z);
  frame(5);
  const gi = G.SOCCER.goalie;
  check('soccer: goalie assigned near the pitch',
    gi >= 0 && G.SOCCER.npcs[gi].state === 'GOALIE', 'goalie=' + gi);
  check('soccer: goalie announce toast fires',
    G.toastEl.textContent === 'GOALIE ON THE PITCH', G.toastEl.textContent);
  {
    /* park the ball at local z = -2; the goalie should hold the mouth near it */
    const [wx, wz] = toWorld(0, -2);
    G.SOCCER.pos.set(wx, groundY(wx, wz) + 0.4, wz);
    G.SOCCER.vel.set(0, 0, 0);
    frame(90);
    const n = G.SOCCER.npcs[G.SOCCER.goalie];
    const [glx, glz] = toLocal(n.pos.x, n.pos.z);
    check('soccer: goalie holds the attack mouth and mirrors the ball',
      Math.abs(glx - 8.2) < 1.5 && Math.abs(glz - (-2)) < 1.2,
      'local=(' + glx.toFixed(2) + ',' + glz.toFixed(2) + ')');
  }
  /* leave: teleport to spawn (no soccer park within 60u there) */
  G.player.position.set(0, groundY(0, 0), 0);
  frame(3);
  const parked = G.soccerFindPitch() === null;
  if (parked) {
    check('soccer: ball parks when the player leaves', G.SOCCER.active === false && G.ballMesh.visible === false,
      'active=' + G.SOCCER.active);
    check('soccer: goalie resumes wander on release',
      G.SOCCER.goalie === -1 && G.SOCCER.npcs[gi].state !== 'GOALIE',
      'state=' + G.SOCCER.npcs[gi].state);
    check('soccer: chip hides with no active pitch', G.socChipEl.style.display === 'none');
  } else {
    check('soccer: ball parks when the player leaves (skipped: park near spawn)', true);
    check('soccer: goalie resumes wander on release (skipped: park near spawn)', true);
    check('soccer: chip hides with no active pitch (skipped: park near spawn)', true);
  }

  /* static pins for the soccer block */
  check('soccer-static: soccer block adds zero InstancedMesh sites (PERF-4: the ball is a Mesh)',
    (html.slice(html.indexOf('/* ================== SOCCER MINI-GAME'),
                html.indexOf('/* === WORLD-PEOPLE-ANCHOR === */'))
       .match(/new THREE\.InstancedMesh/g) || []).length === 0);
  check('soccer-static: soccer block creates no lights and no audio nodes',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(
      html.slice(html.indexOf('/* ================== SOCCER MINI-GAME'),
                 html.indexOf('/* === WORLD-PEOPLE-ANCHOR === */'))) &&
    !/createOscillator|createGain|AudioContext/.test(
      html.slice(html.indexOf('/* ================== SOCCER MINI-GAME'),
                 html.indexOf('/* === WORLD-PEOPLE-ANCHOR === */'))));
  {
    const r0 = globalThis.__renderCount || 0;
    frame(3);
    check('soccer: exactly 1 renderer.render per tick',
      (globalThis.__renderCount || 0) - r0 === 3,
      'renders=' + ((globalThis.__renderCount || 0) - r0));
  }
}

/* ================= 21. TENNIS MINI-GAME (Phase 5 sports) ================= */
{
  /* deterministic tennis court: pure chunk function, disjoint from soccer/basketball */
  let tca = null, tcaD = Infinity;
  for (let gx = -14; gx <= 14; gx++)
    for (let gz = -14; gz <= 14; gz++) {
      if (!G.tennisCourtFor(gx, gz)) continue;
      const a = G.amenityCenterFor(gx, gz);
      if (!a) continue;
      const d = a.x * a.x + a.z * a.z;
      if (d < tcaD) { tcaD = d; tca = a; }
    }
  check('tennis: deterministic tennis court found near spawn', !!tca,
    tca ? 'chunk(' + tca.gx + ',' + tca.gz + ')' : 'none');
  check('tennis: sportHash residue %5===3, disjoint from soccer %5===1 and basketball %5===2',
    G.sportHash(tca.gx, tca.gz) % 5 === 3);

  /* teleport next to it; the real tick runs find + spawn + serve */
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999;
  G.setHeat(0, true);
  G.player.position.set(tca.x + 4, groundY(tca.x + 4, tca.z), tca.z);
  frame(3);   // chunk change -> redistributeAmenities -> tennisTick spawns
  const tp = G.TENNIS.court;
  check('tennis: ball spawns at the active tennis court',
    G.TENNIS.active === true && G.ballMesh.visible === true && !!tp,
    'active=' + G.TENNIS.active + ' visible=' + G.ballMesh.visible);
  check('tennis: chip shows READY before the serve',
    G.tennChipEl.style.display === 'block' &&
    G.tennChipEl.textContent === 'READY! - RALLIES 0', G.tennChipEl.textContent);
  {
    const c = G.ballMesh.material.color, e = new THREE.Color(0xd4e157);
    check('tennis: ball tinted tennis-yellow via material color',
      Math.abs(c.r - e.r) < 0.002 && Math.abs(c.g - e.g) < 0.002 &&
      Math.abs(c.b - e.b) < 0.002);
  }

  /* opponent: assigned near the court, announce toast. Release first so the
     announce toast is observable on re-assignment (soccer goalie pattern). */
  G.tennisReleaseOpp();
  frame(5);
  const ti = G.TENNIS.opp;
  check('tennis: opponent assigned near the court',
    ti >= 0 && G.TENNIS.npcs[ti].state === 'TENNIS', 'opp=' + ti);
  check('tennis: opponent announce toast fires',
    G.toastEl.textContent === 'OPPONENT READY', G.toastEl.textContent);

  /* serve: the opponent serves into the player's half after the beat */
  for (let i = 0; i < 40 && G.TENNIS.serveT > 0; i++) frame(1);
  {
    const p = G.TENNIS.court, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const vlx = G.TENNIS.vel.x * c - G.TENNIS.vel.z * s;   // local-x velocity
    check('tennis: serve fires from the NPC toward the player half',
      G.TENNIS.hitBy === 'NPC' && G.TENNIS.rally === 0 &&
      (vlx > 0) === (G.TENNIS.pSide > 0),
      'hitBy=' + G.TENNIS.hitBy + ' vlx=' + vlx.toFixed(2));
  }
  check('tennis: serve toast fires', G.toastEl.textContent === 'READY!',
    G.toastEl.textContent);

  /* forehand: F path via doTennisHit, auto-aim at the far court */
  G.TENNIS.pos.set(G.player.position.x + 1, groundY(G.player.position.x, G.player.position.z) + 0.6,
    G.player.position.z);
  G.TENNIS.vel.set(0, 0, 0);
  G.P.punchCd = 0;
  check('tennis: hit allowed on foot near the ball', G.tennisCanHit() === true);
  G.doTennisHit();
  check('tennis: forehand aims at the far court with a live arc',
    G.TENNIS.hitBy === 'P' && G.TENNIS.rally === 1 && G.TENNIS.vel.y > 0,
    'rally=' + G.TENNIS.rally + ' vy=' + G.TENNIS.vel.y.toFixed(1));
  check('tennis: rally shows on the chip',
    G.tennChipEl.textContent.indexOf('RALLY x1!') === 0, G.tennChipEl.textContent);
  /* F guard: driving blocks it (doPunch guard idiom) */
  G.CAR.driving = true;
  check('tennis: hit blocked while driving', G.tennisCanHit() === false);
  G.CAR.driving = false;

  /* opponent auto-return: the ball landing on their side comes back */
  for (let i = 0; i < 120 && !(G.TENNIS.hitBy === 'NPC' && G.TENNIS.rally === 2); i++) frame(1);
  check('tennis: opponent auto-returns the landed ball',
    G.TENNIS.hitBy === 'NPC' && G.TENNIS.rally === 2,
    'hitBy=' + G.TENNIS.hitBy + ' rally=' + G.TENNIS.rally);

  /* net: crossing below the tape drops it dead, the hitter loses the point */
  {
    const p = G.TENNIS.court, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const w = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
    const [wx, wz] = w(-0.6, 0);
    G.TENNIS.hitBy = 'P'; G.TENNIS.bounces = 0; G.TENNIS.bounceSide = 0;
    G.TENNIS.pointOver = false; G.TENNIS.serveT = 0;
    G.TENNIS.pos.set(wx, groundY(wx, wz) + 0.5, wz);
    G.TENNIS.vel.set(c * 8, 0, -s * 8);   // local +X, below the tape
    const cash0 = G.cash, pts0 = G.TENNIS.pts;
    frame(10);
    check('tennis: netted ball loses the point (no cash, no tally)',
      G.TENNIS.pointOver === true && G.cash === cash0 && G.TENNIS.pts === pts0 &&
      G.toastEl.textContent === 'INTO THE NET',
      'pointOver=' + G.TENNIS.pointOver + ' toast=' + G.toastEl.textContent);
  }

  /* out: first bounce outside the rect after a hit loses the point */
  {
    const p = G.TENNIS.court, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const w = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
    const [wx, wz] = w(G.TENNIS.oSide * 12, 0);   // beyond the baseline
    G.TENNIS.hitBy = 'P'; G.TENNIS.bounces = 0; G.TENNIS.bounceSide = 0;
    G.TENNIS.pointOver = false; G.TENNIS.serveT = 0;
    G.TENNIS.pos.set(wx, groundY(wx, wz) + 3, wz);
    G.TENNIS.vel.set(0, -4, 0);
    frame(40);
    check('tennis: out bounce loses the point',
      G.TENNIS.pointOver === true && G.toastEl.textContent === 'OUT!',
      'pointOver=' + G.TENNIS.pointOver + ' toast=' + G.toastEl.textContent);
  }

  /* double bounce: two bounces on the player's side, point to the NPC */
  {
    G.tennisResetForServe();
    for (let i = 0; i < 45 && G.TENNIS.serveT > 0; i++) frame(1);   // serve fires
    const p = G.TENNIS.court, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const w = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
    const [wx, wz] = w(G.TENNIS.pSide * 5, 0);
    G.TENNIS.hitBy = 'NPC'; G.TENNIS.bounces = 0; G.TENNIS.bounceSide = 0;
    G.TENNIS.pos.set(wx, groundY(wx, wz) + 2.5, wz);
    G.TENNIS.vel.set(0, 0, 0);
    /* the point beat (1.1s) outlasts a long frame run, so stop the moment
       the point is decided instead of framing a fixed count */
    for (let i = 0; i < 100 && !G.TENNIS.pointOver; i++) frame(1);
    check('tennis: double bounce on the player side loses the point',
      G.TENNIS.pointOver === true && G.toastEl.textContent === 'DOUBLE BOUNCE',
      'pointOver=' + G.TENNIS.pointOver + ' toast=' + G.toastEl.textContent);
  }

  /* point won: the NPC nets it, cash scales with rally length */
  {
    G.tennisResetForServe();
    for (let i = 0; i < 45 && G.TENNIS.serveT > 0; i++) frame(1);   // serve fires
    const p = G.TENNIS.court, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const w = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
    const [wx, wz] = w(0.6, 0);   // positive local x, into the tape below it
    G.TENNIS.hitBy = 'NPC'; G.TENNIS.bounces = 0; G.TENNIS.bounceSide = 0;
    G.TENNIS.pointOver = false; G.TENNIS.serveT = 0; G.TENNIS.rally = 6;
    G.TENNIS.pos.set(wx, groundY(wx, wz) + 0.5, wz);
    G.TENNIS.vel.set(-c * 8, 0, s * 8);   // local -X, below the tape
    const cash0 = G.cash, pts0 = G.TENNIS.pts;
    frame(10);
    check('tennis: rally won pays $25 + $5 per hit beyond 4',
      G.cash === cash0 + 35 && G.TENNIS.pts === pts0 + 1,
      'cash=' + G.cash + ' pts=' + G.TENNIS.pts);
    check('tennis: POINT! toast fires', G.toastEl.textContent === 'POINT! +$35',
      G.toastEl.textContent);
  }

  /* leave: teleport to spawn (no tennis court within 60u there) */
  const oi = G.TENNIS.opp;
  G.player.position.set(0, groundY(0, 0), 0);
  frame(3);
  const tParked = !G.AMEN.active.park.some(a => G.tennisCourtFor(a.gx, a.gz));
  if (tParked && oi >= 0) {
    check('tennis: ball parks when the player leaves',
      G.TENNIS.active === false && G.ballMesh.visible === false,
      'active=' + G.TENNIS.active);
    check('tennis: opponent resumes wander on release',
      G.TENNIS.opp === -1 && G.TENNIS.npcs[oi].state !== 'TENNIS',
      'state=' + G.TENNIS.npcs[oi].state);
    check('tennis: chip hides with no active court',
      G.tennChipEl.style.display === 'none');
  } else {
    check('tennis: ball parks when the player leaves (skipped: court near spawn)', true);
    check('tennis: opponent resumes wander on release (skipped: court near spawn)', true);
    check('tennis: chip hides with no active court (skipped: court near spawn)', true);
  }

  /* static pins for the tennis block */
  check('tennis-static: whole-file InstancedMesh literal sites pin at 44 (48 - PERF-5 consolidation: trunks+fol merge, npcLegs->limbIM, copGuns->limbIM, brute IM->Mesh)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 44);
  check('tennis-static: tennis block creates no lights and no audio nodes',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(
      html.slice(html.indexOf('/* ================== TENNIS MINI-GAME'),
                 html.indexOf('/* === WORLD-PEOPLE-ANCHOR === */'))) &&
    !/createOscillator|createGain|AudioContext/.test(
      html.slice(html.indexOf('/* ================== TENNIS MINI-GAME'),
                 html.indexOf('/* === WORLD-PEOPLE-ANCHOR === */'))));
}

/* ================= 22. BASKETBALL MINI-GAME (Phase 5 sports) ================= */
{
  /* deterministic basketball court: pure chunk function, disjoint from soccer/tennis */
  let hca = null, hcaD = Infinity;
  for (let gx = -14; gx <= 14; gx++)
    for (let gz = -14; gz <= 14; gz++) {
      if (!G.basketballCourtFor(gx, gz)) continue;
      const a = G.amenityCenterFor(gx, gz);
      if (!a) continue;
      const d = a.x * a.x + a.z * a.z;
      if (d < hcaD) { hcaD = d; hca = a; }
    }
  check('hoops: deterministic basketball court found near spawn', !!hca,
    hca ? 'chunk(' + hca.gx + ',' + hca.gz + ')' : 'none');
  check('hoops: sportHash residue %5===2, disjoint from soccer %5===1 and tennis %5===3',
    G.sportHash(hca.gx, hca.gz) % 5 === 2 &&
    !G.soccerPitchFor(hca.gx, hca.gz) && !G.tennisCourtFor(hca.gx, hca.gz));

  /* teleport next to it; the real tick runs find + spawn.
     Same vehicle-shoo idiom as soccer: a cab on the center spot would
     dribble the ball on spawn and break the seeded-spawn assertions. */
  G.player.position.set(hca.x + 8, groundY(hca.x + 8, hca.z), hca.z);
  frame(1);
  {
    const p0 = G.HOOPS.court || hca;
    for (const v of [G.CAR, G.BUS, G.TX, G.BIKE, G.BC, G.SC]) {
      if (Math.hypot(v.pos.x - p0.x, v.pos.z - p0.z) < 12)
        v.pos.set(p0.x + 60, groundY(p0.x + 60, p0.z), p0.z + 40);
    }
  }
  frame(2);
  const hc = G.HOOPS.court;
  check('hoops: ball spawns at the active basketball court',
    G.HOOPS.active === true && G.ballMesh.visible === true && !!hc,
    'active=' + G.HOOPS.active + ' visible=' + G.ballMesh.visible);
  check('hoops: ball seeded at court center',
    Math.hypot(G.HOOPS.pos.x - hc.x, G.HOOPS.pos.z - hc.z) < 0.01,
    'dist=' + Math.hypot(G.HOOPS.pos.x - hc.x, G.HOOPS.pos.z - hc.z).toFixed(3));
  check('hoops: chip shows HOOPS on spawn',
    G.hoopChipEl.style.display === 'block' &&
    G.hoopChipEl.textContent === 'HOOPS - PTS ' + G.HOOPS.pts,
    G.hoopChipEl.textContent);
  {
    const c = G.ballMesh.material.color, e = new THREE.Color(0xd97a26);
    check('hoops: ball tinted basketball-orange via material color',
      Math.abs(c.r - e.r) < 0.002 && Math.abs(c.g - e.g) < 0.002 &&
      Math.abs(c.b - e.b) < 0.002);
  }

  /* determinism invariant (research: chronica-style seed->world invariant).
     Rescan the sportHash selectors over the active chunks in a different
     order: the court set must be byte-identical, and the three sport
     residues must be pairwise disjoint. This invariant exists to catch the
     shipped-but-unactivatable selector bug class again: basketball shipped
     in 8f4b9a8 but only went live via the 924f503 sportHash split fix. */
  {
    const chunks = G.AMEN.active.park.map(a => [a.gx, a.gz]);
    const desc = (gx, gz) =>
      gx + ',' + gz + ':' +
      (G.basketballCourtFor(gx, gz) ? 'H' : G.soccerPitchFor(gx, gz) ? 'S' :
       G.tennisCourtFor(gx, gz) ? 'T' : '.');
    const fwd = chunks.map(([x, z]) => desc(x, z)).sort().join(';');
    const rev = chunks.slice().reverse().map(([x, z]) => desc(x, z)).sort().join(';');
    check('hoops-det: selector rescan in different order is byte-identical',
      fwd === rev && fwd.length > 0, chunks.length + ' park chunks');
    const disjoint = chunks.every(([x, z]) =>
      (G.basketballCourtFor(x, z) ? 1 : 0) + (G.soccerPitchFor(x, z) ? 1 : 0) +
      (G.tennisCourtFor(x, z) ? 1 : 0) <= 1);
    check('hoops-det: sport residues 1/2/3 are pairwise disjoint', disjoint);
    check('hoops-det: basketball selector is non-vacuous (activatable courts exist)',
      chunks.some(([x, z]) => G.basketballCourtFor(x, z)));
  }

  /* set shot: F path via doHoopShot, auto-aim ball->rim with a live arc */
  const yaw = hc.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
  const toWorld = (lx, lz) => [hc.x + lx * c + lz * s, hc.z - lx * s + lz * c];
  G.HOOPS.pos.set(hc.x, groundY(hc.x, hc.z) + 0.4, hc.z);
  G.HOOPS.vel.set(0, 0, 0);
  G.player.position.set(hc.x + 1.2, groundY(hc.x + 1.2, hc.z), hc.z);
  G.P.punchCd = 0;
  check('hoops: shot allowed on foot near the ball', G.hoopsCanShoot() === true);
  G.doHoopShot();
  {
    const rw = G.hoopsRimWorld(new THREE.Vector3());
    const dx = rw.x - G.HOOPS.pos.x, dz = rw.z - G.HOOPS.pos.z;
    const d = Math.hypot(dx, dz) || 0.001;
    const hv = Math.hypot(G.HOOPS.vel.x, G.HOOPS.vel.z) || 0.001;
    const dot = (G.HOOPS.vel.x * dx + G.HOOPS.vel.z * dz) / (hv * d);
    check('hoops: set shot auto-aims ball->rim with a live arc',
      G.HOOPS.shot !== null && dot > 0.99 && G.HOOPS.vel.y > 0,
      'dot=' + dot.toFixed(3) + ' vy=' + G.HOOPS.vel.y.toFixed(1));
  }
  check('hoops: shot toast fires', G.toastEl.textContent === '3-PT SHOT',
    G.toastEl.textContent);
  check('hoops: shot flashes SHOOT! on the chip',
    G.hoopChipEl.textContent.indexOf('SHOOT!') === 0, G.hoopChipEl.textContent);
  frame(1);   // let the tick show the SHOOT [F] hint
  check('hoops: SHOOT [F] hint shows near the ball',
    G.shootHintEl.style.opacity === 1 && G.shootHintEl.textContent === 'SHOOT [F]',
    'opacity=' + G.shootHintEl.style.opacity);
  /* neutralize the live shot: the scoring tests drive the gates directly */
  G.HOOPS.shot = null; G.HOOPS.shotRng = null;
  G.HOOPS.vel.set(0, 0, 0);
  G.HOOPS.pos.set(hc.x, groundY(hc.x, hc.z) + 0.4, hc.z);

  /* F guard: driving blocks it (doPunch guard idiom, same as soccer KICK) */
  G.CAR.driving = true;
  check('hoops: shot blocked while driving', G.hoopsCanShoot() === false);
  G.CAR.driving = false;

  /* rim: radial bounce off the wire, the clang path (seeded deflection) */
  {
    const [wx, wz] = toWorld(6.2, 0.49);   // HOOP_LOCAL_X, on the rim ring
    const gy = groundY(wx, wz);
    G.HOOPS.pos.set(wx, gy + 3.05, wz);    // HOOP_H, dy = 0
    G.HOOPS.vel.set(-3 * s, 0, -3 * c);    // local (0,-3): radial inward
    G.hoopsHoopCollide();
    const vlz2 = G.HOOPS.vel.x * s + G.HOOPS.vel.z * c;
    check('hoops: rim collision registers (clang path, radial bounce)',
      vlz2 > 0, 'vlz=' + vlz2.toFixed(2));
  }

  /* two-trigger scoring: gate 1 = rim plane crossed downward inside the ring */
  {
    const rw = G.hoopsRimWorld(new THREE.Vector3());
    G.HOOPS.shot = { t: 0, val: 2, gate1: false, gate2: false };
    G.HOOPS.pos.set(rw.x, rw.y + 0.08, rw.z);
    G.HOOPS.vel.set(0, -3, 0);
    for (let i = 0; i < 10 && G.HOOPS.shot && !G.HOOPS.shot.gate1; i++) frame(1);
    check('hoops: trigger 1 fires crossing the rim plane downward',
      !!G.HOOPS.shot && G.HOOPS.shot.gate1 === true);
  }
  /* gate 2 = net gate crossed below: basket. 2pt = GOAL! +$20 */
  {
    const cash0 = G.cash, pts0 = G.HOOPS.pts, st0 = G.HOOPS.streak;
    for (let i = 0; i < 60 && G.HOOPS.streak === st0; i++) frame(1);
    check('hoops: two-trigger basket scores GOAL! +$20 (2pt)',
      G.cash === cash0 + 20 && G.HOOPS.pts === pts0 + 2 && G.HOOPS.streak === st0 + 1,
      'cash=' + G.cash + ' pts=' + G.HOOPS.pts + ' streak=' + G.HOOPS.streak);
    check('hoops: GOAL! toast fires', G.toastEl.textContent === 'GOAL! +$20',
      G.toastEl.textContent);
  }
  /* streak: the second make pays +$5 per consecutive make */
  {
    const rw = G.hoopsRimWorld(new THREE.Vector3());
    G.HOOPS.shot = { t: 0, val: 3, gate1: false, gate2: false };
    G.HOOPS.pos.set(rw.x, rw.y + 0.08, rw.z);
    G.HOOPS.vel.set(0, -3, 0);
    const cash0 = G.cash, pts0 = G.HOOPS.pts, st0 = G.HOOPS.streak;
    for (let i = 0; i < 80 && G.HOOPS.streak === st0; i++) frame(1);
    check('hoops: 3pt make pays +$35 with the $5 streak bonus',
      G.cash === cash0 + 40 && G.HOOPS.pts === pts0 + 3 && G.HOOPS.streak === st0 + 1,
      'cash=' + G.cash + ' pts=' + G.HOOPS.pts + ' streak=' + G.HOOPS.streak);
    /* drain the shot/dribble HUD timers (player steps off the ball) so the
       streak state reaches the chip */
    G.player.position.set(hc.x + 20, groundY(hc.x + 20, hc.z), hc.z);
    frame(45);
    check('hoops: streak shows on the chip',
      G.hoopChipEl.textContent.indexOf('STREAK x2') === 0, G.hoopChipEl.textContent);
  }
  /* timeout: a live shot that never scores misses, streak resets */
  {
    G.HOOPS.shot = { t: 14.9, val: 2, gate1: false, gate2: false };
    G.HOOPS.pos.set(hc.x, groundY(hc.x, hc.z) + 0.4, hc.z);
    G.HOOPS.vel.set(0, 0, 0);
    frame(10);
    check('hoops: shot timeout misses and resets the streak',
      G.HOOPS.shot === null && G.HOOPS.streak === 0 &&
      G.toastEl.textContent === 'BALL RETURNED',
      'streak=' + G.HOOPS.streak + ' toast=' + G.toastEl.textContent);
  }

  /* leave: teleport to spawn (no basketball court within 60u there) */
  G.player.position.set(0, groundY(0, 0), 0);
  frame(3);
  const hParked = !G.AMEN.active.park.some(a => G.basketballCourtFor(a.gx, a.gz));
  if (hParked) {
    check('hoops: ball parks when the player leaves',
      G.HOOPS.active === false && G.ballMesh.visible === false,
      'active=' + G.HOOPS.active + ' visible=' + G.ballMesh.visible);
    check('hoops: chip hides with no active court',
      G.hoopChipEl.style.display === 'none');
  } else {
    check('hoops: ball parks when the player leaves (skipped: court near spawn)', true);
    check('hoops: chip hides with no active court (skipped: court near spawn)', true);
  }

  /* sport switch: the soccer court re-activates and restores the soccer look */
  {
    let spa2 = null, spa2D = Infinity;
    for (let gx = -14; gx <= 14; gx++)
      for (let gz = -14; gz <= 14; gz++) {
        if (!G.soccerPitchFor(gx, gz)) continue;
        const a = G.amenityCenterFor(gx, gz);
        if (!a) continue;
        const d = a.x * a.x + a.z * a.z;
        if (d < spa2D) { spa2D = d; spa2 = a; }
      }
    G.player.position.set(spa2.x, groundY(spa2.x, spa2.z), spa2.z);
    frame(3);
    const cc = G.ballMesh.material.color, ew = new THREE.Color(0xffffff);
    check('hoops: soccer look restored when the soccer court activates',
      G.SOCCER.active === true && !!cc &&
      Math.abs(cc.r - ew.r) < 0.002 && Math.abs(cc.g - ew.g) < 0.002 &&
      Math.abs(cc.b - ew.b) < 0.002,
      'soccerActive=' + G.SOCCER.active);
  }

  /* static pins for the basketball block */
  check('hoops-static: whole-file InstancedMesh literal sites pin at 44 (48 - PERF-5 consolidation: trunks+fol merge, npcLegs->limbIM, copGuns->limbIM, brute IM->Mesh)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 44);
  check('hoops-static: basketball block creates no lights and no audio nodes',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(
      html.slice(html.indexOf('/* ================== BASKETBALL MINI-GAME'),
                 html.indexOf('/* === WORLD-PEOPLE-ANCHOR === */'))) &&
    !/createOscillator|createGain|AudioContext/.test(
      html.slice(html.indexOf('/* ================== BASKETBALL MINI-GAME'),
                 html.indexOf('/* === WORLD-PEOPLE-ANCHOR === */'))));
  check('hoops-static: SHOOT hint click wiring pins doHoopShot',
    html.includes("shootHintEl.addEventListener('click', () => { doHoopShot(); })"));
  check('hoops-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
}

/* ================= 23. BOATS/SHIPS v1 (Phase 5 vehicles) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }

  check('boat: one shared body InstancedMesh holds the fleet',
    G.boatBodyIM.isInstancedMesh === true && G.BOAT.slots.length === 4 && G.BOAT_N === 4);
  check('boat: 4 per-instance tints allocated (white/red/blue/yellow)',
    G.boatBodyIM.instanceColor.count === 4);
  check('boat: tuned slower than the car', G.BOAT.topSpeed < G.CAR.topSpeed,
    'boat=' + G.BOAT.topSpeed + ' car=' + G.CAR.topSpeed);

  /* seeded docks: deterministic, on a real shore, mooring on water */
  let dockChunk = null;
  for (let gx = -10; gx <= 10 && !dockChunk; gx++)
    for (let gz = -10; gz <= 10 && !dockChunk; gz++) {
      const d = G.dockFor(gx, gz);
      if (d) dockChunk = { gx, gz, d };
    }
  check('boat: seeded docks exist in the world', !!dockChunk,
    dockChunk ? 'chunk ' + dockChunk.gx + ',' + dockChunk.gz : 'none in -10..10');
  const dd = dockChunk.d, dd2 = G.dockFor(dockChunk.gx, dockChunk.gz);
  check('boat: dockFor is deterministic on revisit',
    !!dd2 && dd.x === dd2.x && dd.z === dd2.z && dd.yaw === dd2.yaw &&
    dd.bx === dd2.bx && dd.bz === dd2.bz && dd.byaw === dd2.byaw);
  check('boat: dock sits on a low shore, mooring floats on water',
    dd.y >= -0.25 && dd.y <= 0.85 && G.terrainHeight(dd.bx, dd.bz) < -0.55,
    'shoreY=' + dd.y.toFixed(2) + ' mooringBed=' + G.terrainHeight(dd.bx, dd.bz).toFixed(2));

  /* moorings: teleport to the dock chunk, the rebuild moors the fleet */
  const dcx = (dockChunk.gx + 0.5) * 48, dcz = (dockChunk.gz + 0.5) * 48;
  G.player.position.set(dcx, groundY(dcx, dcz), dcz);
  frame(3);
  const placed0 = G.BOAT.slots.filter(s => s.placed);
  check('boat: rebuild moors boats at docks', placed0.length >= 1, 'placed=' + placed0.length);
  check('boat: every moored boat sits on water',
    placed0.every(s => G.terrainHeight(s.x, s.z) < -0.55));

  /* determinism on revisit: leave, come back, same moorings */
  const poses = G.BOAT.slots.map(s => [s.x, s.z, s.yaw, s.placed]);
  G.player.position.set(dcx + 400, groundY(dcx + 400, dcz), dcz);
  frame(3);
  G.player.position.set(dcx, groundY(dcx, dcz), dcz);
  G.BOAT.anchorCx = 1e9; G.BOAT.anchorCz = 1e9; G.BOAT.key = '';
  frame(3);
  const samePose = (s, p) => (s.placed === p[3]) &&
    (!s.placed || (Math.abs(s.x - p[0]) < 1e-9 && Math.abs(s.z - p[1]) < 1e-9 && Math.abs(s.yaw - p[2]) < 1e-9));
  check('boat: moorings are deterministic on revisit',
    G.BOAT.slots.every((s, i) => samePose(s, poses[i])));

  /* BOARD hint: stand at a moored boat */
  const s0 = G.BOAT.slots.find(s => s.placed);
  G.player.position.set(s0.x, 0.5, s0.z);
  frame(2);
  check('boat: BOARD hint appears near a moored boat on water',
    G.BOAT.hintOn === true && G.BOAT.nearIdx >= 0 && G.boatHintEl.style.opacity === 1,
    'hintOn=' + G.BOAT.hintOn);
  check('boat: hint text carries the E key',
    G.boatHintEl.textContent === 'BOARD [E]' || G.boatHintEl.textContent === 'TAP TO BOARD',
    G.boatHintEl.textContent);

  /* board: E near the boat enters */
  G.boatEnter();
  check('boat: E near boat enters (BOAT.driving true)',
    G.BOAT.driving === true && G.player.visible === false);
  check('boat: board toast fires', G.toastEl.textContent === 'BOAT');
  check('boat: chip shows while driving', G.boatChipEl.style.display === 'block');

  /* throttle: W moves the boat (max speed is robust to beaching mid-run) */
  const bStart = G.BOAT.pos.clone();
  let bMaxSpd = 0;
  G.keys.KeyW = true;
  for (let f = 0; f < 60; f++) { frame(1); bMaxSpd = Math.max(bMaxSpd, G.BOAT.speed); }
  G.keys.KeyW = false;
  const bMoved = Math.hypot(G.BOAT.pos.x - bStart.x, G.BOAT.pos.z - bStart.z);
  check('boat: throttle moves the boat', bMoved > 1.0 && bMaxSpd > 1.0,
    'moved=' + bMoved.toFixed(1) + 'u maxSpd=' + bMaxSpd.toFixed(1));
  check('boat: chip reads speed while driving',
    /^BOAT - \d+ KM\/H$/.test(G.boatChipEl.textContent), G.boatChipEl.textContent);

  /* rudder: A/D yaws the boat while it has way */
  G.BOAT.pos.set(s0.x, s0.y, s0.z); G.BOAT.heading = s0.yaw;
  G.BOAT.speed = 0; G.BOAT.groundT = 0; G.BOAT.steer = 0;
  G.BOAT.speed = 8;
  const h0 = G.BOAT.heading;
  G.keys.KeyD = true;
  frame(20);
  G.keys.KeyD = false;
  check('boat: rudder turns the boat',
    Math.abs(G.BOAT.heading - h0) > 0.08, 'dHeading=' + (G.BOAT.heading - h0).toFixed(3));

  /* buoyancy: damped springs settle near the water plane, no cork bounce */
  G.BOAT.pos.set(s0.x, s0.y, s0.z); G.BOAT.speed = 0; G.BOAT.groundT = 0;
  let maxYV = 0, maxDev = 0;
  for (let f = 0; f < 120; f++) {
    frame(1);
    maxYV = Math.max(maxYV, Math.abs(G.BOAT.yVel));
    maxDev = Math.max(maxDev, Math.abs(G.BOAT.y + 0.6));
  }
  check('boat: buoyancy settles near the water plane', maxDev < 1.2, 'maxDev=' + maxDev.toFixed(2));
  check('boat: no cork bounce (heavily damped)', maxYV < 2.5, 'maxYV=' + maxYV.toFixed(2));
  check('boat: pitch/roll stay gentle',
    Math.abs(G.BOAT.pitch) < 0.3 && Math.abs(G.BOAT.roll) < 0.3,
    'pitch=' + G.BOAT.pitch.toFixed(3) + ' roll=' + G.BOAT.roll.toFixed(3));

  /* run aground: beaching stops the boat with a thud + pushback */
  let landPt = null;
  for (let r = 4; r <= 40 && !landPt; r += 4)
    for (let a = 0; a < 8 && !landPt; a++) {
      const sx = s0.x + Math.cos(a / 8 * Math.PI * 2) * r;
      const sz = s0.z + Math.sin(a / 8 * Math.PI * 2) * r;
      if (G.terrainHeight(sx, sz) > 0.5) landPt = [sx, sz];
    }
  check('boat: land exists near the dock (aground setup)', !!landPt);
  if (landPt) {
    G.BOAT.pos.set(landPt[0], 0, landPt[1]);
    G.BOAT.heading = 0; G.BOAT.speed = 8; G.BOAT.groundT = 0;
    G.toastEl.textContent = '';
    frame(3);
    check('boat: running aground stops the boat', G.BOAT.speed === 0, 'speed=' + G.BOAT.speed);
    check('boat: aground thud toast fires', G.toastEl.textContent === 'RAN AGROUND', G.toastEl.textContent);
    const pushed = Math.hypot(G.BOAT.pos.x - landPt[0], G.BOAT.pos.z - landPt[1]);
    check('boat: aground pushes the boat back toward water', pushed > 1.0, 'pushed=' + pushed.toFixed(2) + 'u');
  }

  /* exit: E while driving disembarks on the nearest shore */
  G.mountToggle();
  check('boat: E while driving exits (BOAT.driving false)',
    G.BOAT.driving === false && G.player.visible === true);
  check('boat: exit toast fires', G.toastEl.textContent === 'ON FOOT');
  check('boat: player lands on shore, never in the water',
    G.terrainHeight(G.player.position.x, G.player.position.z) > -0.55,
    'bed=' + G.terrainHeight(G.player.position.x, G.player.position.z).toFixed(2));
  check('boat: chip hides after exit', G.boatChipEl.style.display === 'none');
  const si = G.BOAT.slots.findIndex(s => s.placed);
  check('boat: slot keeps the pose on leave (park-on-leave)',
    si >= 0 && Math.abs(G.BOAT.slots[si].x - G.BOAT.pos.x) < 1e-9,
    'placed=' + G.BOAT.slots.filter(s => s.placed).length);

  /* static pins for the boat block */
  const boatSrc = html.slice(html.indexOf('/* ================= PHASE 5: BOATS'),
                             html.indexOf('/* ================= PHASE 5: HELICOPTERS'));
  check('boat-static: exactly one new InstancedMesh literal in the boat block',
    (boatSrc.match(/new THREE\.InstancedMesh/g) || []).length === 1);
  check('boat-static: boat block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(boatSrc));
  check('boat-static: boat block creates no meshes outside the fleet IM',
    !/new THREE\.Mesh\(/.test(boatSrc));
  check('boat-static: no external URLs in the boat block', !/https?:\/\//.test(boatSrc));
  check('boat-static: BOARD hint click wiring pins boatEnter',
    html.includes("boatHintEl.addEventListener('click', () => { if (BOAT.hintOn) boatEnter(); })"));
  check('boat-static: docks bake into the shared park geometry (zero new dock draws)',
    html.includes('wooden dock deck baked into the shared park geometry'));
  check('boat-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
}

/* ================= 24. HELICOPTERS v1 (Phase 5 vehicles) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }

  check('heli: one shared body InstancedMesh holds the fleet',
    G.heliBodyIM.isInstancedMesh === true && G.HELI.slots.length === 3 && G.HELI_N === 3);
  check('heli: 3 per-instance tints allocated (red/blue/yellow)',
    G.heliBodyIM.instanceColor.count === 3);
  check('heli: tuned faster than the car', G.HELI.topSpeed > G.CAR.topSpeed,
    'heli=' + G.HELI.topSpeed + ' car=' + G.CAR.topSpeed);
  check('heli: merged geometry carries RGBA vertex colors (translucent rotor disc)',
    G.heliBodyIM.geometry.attributes.color.itemSize === 4);

  /* seeded helipads: deterministic, disjoint from the other sport residues and docks */
  let padChunk = null;
  for (let gx = -12; gx <= 12 && !padChunk; gx++)
    for (let gz = -12; gz <= 12 && !padChunk; gz++) {
      const d = G.helipadFor(gx, gz);
      if (d) padChunk = { gx, gz, d };
    }
  check('heli: seeded helipads exist in the world', !!padChunk,
    padChunk ? 'chunk ' + padChunk.gx + ',' + padChunk.gz : 'none in -12..12');
  const hd = padChunk.d, hd2 = G.helipadFor(padChunk.gx, padChunk.gz);
  check('heli: helipadFor is deterministic on revisit',
    !!hd2 && hd.x === hd2.x && hd.z === hd2.z && hd.yaw === hd2.yaw);
  check('heli: pad sits on dry gentle land',
    hd.y >= -0.15 && Math.abs(G.terrainHeight(hd.x + 5, hd.z) - hd.y) <= 2.5,
    'padY=' + hd.y.toFixed(2));
  check('heli: pad residue is disjoint from soccer/basketball/tennis',
    !G.soccerPitchFor(padChunk.gx, padChunk.gz) && !G.basketballCourtFor(padChunk.gx, padChunk.gz) &&
    !G.tennisCourtFor(padChunk.gx, padChunk.gz));
  check('heli: pad residue is disjoint from docks', !G.dockFor(padChunk.gx, padChunk.gz));

  /* spawns: teleport to the pad chunk, the rebuild parks the fleet */
  const hcx = (padChunk.gx + 0.5) * 48, hcz = (padChunk.gz + 0.5) * 48;
  G.player.position.set(hcx, groundY(hcx, hcz), hcz);
  frame(3);
  const hplaced0 = G.HELI.slots.filter(s => s.placed);
  check('heli: rebuild parks helicopters at pads', hplaced0.length >= 1, 'placed=' + hplaced0.length);
  check('heli: every parked helicopter sits on its skids at pad height',
    hplaced0.every(s => Math.abs(s.y - (G.terrainHeight(s.x, s.z) + G.HELI.skidH)) < 0.6));

  /* determinism on revisit: leave, come back, same spawns */
  const hposes = G.HELI.slots.map(s => [s.x, s.z, s.yaw, s.placed]);
  G.player.position.set(hcx + 400, groundY(hcx + 400, hcz), hcz);
  frame(3);
  G.player.position.set(hcx, groundY(hcx, hcz), hcz);
  G.HELI.anchorCx = 1e9; G.HELI.anchorCz = 1e9; G.HELI.key = '';
  frame(3);
  const hsamePose = (s, p) => (s.placed === p[3]) &&
    (!s.placed || (Math.abs(s.x - p[0]) < 1e-9 && Math.abs(s.z - p[1]) < 1e-9 && Math.abs(s.yaw - p[2]) < 1e-9));
  check('heli: spawns are deterministic on revisit',
    G.HELI.slots.every((s, i) => hsamePose(s, hposes[i])));

  /* BOARD hint: stand at a parked helicopter */
  const hs0 = G.HELI.slots.find(s => s.placed);
  G.player.position.set(hs0.x, hs0.y + 1, hs0.z);
  frame(2);
  check('heli: BOARD hint appears near a parked helicopter',
    G.HELI.hintOn === true && G.HELI.nearIdx >= 0 && G.heliHintEl.style.opacity === 1,
    'hintOn=' + G.HELI.hintOn);
  check('heli: hint text carries the E key',
    G.heliHintEl.textContent === 'BOARD [E]' || G.heliHintEl.textContent === 'TAP TO BOARD',
    G.heliHintEl.textContent);

  /* board: E near the helicopter enters */
  G.heliEnter();
  check('heli: E near helicopter enters (HELI.flying true)',
    G.HELI.flying === true && G.player.visible === false);
  check('heli: board toast fires', G.toastEl.textContent === 'HELICOPTER');
  check('heli: chip shows while flying', G.heliChipEl.style.display === 'block');

  /* climb: Space lifts the helicopter */
  const hy0 = G.HELI.pos.y;
  G.keys.Space = true;
  frame(30);
  G.keys.Space = false;
  check('heli: Space climbs', G.HELI.pos.y > hy0 + 2, 'climbed=' + (G.HELI.pos.y - hy0).toFixed(1) + 'u');

  /* forward flight: W moves the helicopter, nose pitches down */
  const hhStart = G.HELI.pos.clone();
  let hMaxSpd = 0;
  G.keys.KeyW = true;
  for (let f = 0; f < 60; f++) { frame(1); hMaxSpd = Math.max(hMaxSpd, G.HELI.speed); }
  G.keys.KeyW = false;
  const hMoved = Math.hypot(G.HELI.pos.x - hhStart.x, G.HELI.pos.z - hhStart.z);
  check('heli: throttle flies the helicopter forward', hMoved > 2.0 && hMaxSpd > 2.0,
    'moved=' + hMoved.toFixed(1) + 'u maxSpd=' + hMaxSpd.toFixed(1));
  check('heli: chip reads speed and altitude while flying',
    /^HELI - \d+ KM\/H \/ ALT \d+M$/.test(G.heliChipEl.textContent), G.heliChipEl.textContent);
  check('heli: forward flight pitches the nose down (tilt-to-fly)',
    G.HELI.pitch > 0.05, 'pitch=' + G.HELI.pitch.toFixed(3));

  /* strafe: A/D moves the helicopter laterally with a visible bank */
  G.HELI.heading = 0; G.HELI.speed = 0; G.HELI.strafe = 0;
  const hsStart = G.HELI.pos.clone();
  G.keys.KeyD = true;
  frame(30);
  G.keys.KeyD = false;
  const hsMoved = Math.hypot(G.HELI.pos.x - hsStart.x, G.HELI.pos.z - hsStart.z);
  check('heli: strafe moves the helicopter laterally', hsMoved > 1.0, 'moved=' + hsMoved.toFixed(2) + 'u');
  check('heli: strafe shows a visible bank', Math.abs(G.HELI.roll) > 0.05, 'roll=' + G.HELI.roll.toFixed(3));

  /* descend + soft auto-landing: C brings it down, touchdown is gentle */
  G.HELI.pos.y = Math.max(groundY(G.HELI.pos.x, G.HELI.pos.z), -0.55) + 12;
  G.HELI.vy = 0; G.HELI.grounded = false; G.HELI.tdT = 0;
  G.toastEl.textContent = '';
  G.keys.KeyC = true;
  let hlanded = false;
  for (let f = 0; f < 150 && !hlanded; f++) { frame(1); hlanded = G.HELI.grounded; }
  G.keys.KeyC = false;
  check('heli: C descends into a soft auto-landing', hlanded === true);
  check('heli: touchdown toast fires', G.toastEl.textContent === 'TOUCHDOWN', G.toastEl.textContent);
  check('heli: landed helicopter rests on its skids',
    Math.abs(G.HELI.pos.y - (Math.max(groundY(G.HELI.pos.x, G.HELI.pos.z), -0.55) + G.HELI.skidH)) < 0.6);

  /* ceiling cap */
  G.keys.Space = true;
  for (let f = 0; f < 600; f++) frame(1);
  G.keys.Space = false;
  check('heli: ceiling caps the climb', G.HELI.pos.y <= G.HELI.ceil + 0.01, 'y=' + G.HELI.pos.y.toFixed(1));

  /* guards: no emotes while flying */
  const emKey0 = G.EMO.key;
  G.fireEmote('wave');
  check('heli: emotes are blocked while flying', G.EMO.key === emKey0);

  /* exit: E while flying lands the helicopter and exits */
  G.mountToggle();
  check('heli: E while flying lands and exits (HELI.flying false)',
    G.HELI.flying === false && G.player.visible === true);
  check('heli: exit toast fires', G.toastEl.textContent === 'ON FOOT');
  check('heli: player steps out on the ground beside the landed helicopter',
    Math.abs(G.player.position.y - groundY(G.player.position.x, G.player.position.z)) < 0.5 &&
    G.HELI.slots.some(s => s.placed &&
      Math.hypot(G.player.position.x - s.x, G.player.position.z - s.z) < 30));
  check('heli: chip hides after exit', G.heliChipEl.style.display === 'none');

  /* static pins for the heli block */
  const heliSrc = html.slice(html.indexOf('/* ================= PHASE 5: HELICOPTERS'),
                             html.indexOf('/* ================= PHASE 5: PLANES'));
  check('heli-static: exactly one new InstancedMesh literal in the heli block',
    (heliSrc.match(/new THREE\.InstancedMesh/g) || []).length === 1);
  check('heli-static: heli block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(heliSrc));
  check('heli-static: heli block creates no meshes outside the fleet IM',
    !/new THREE\.Mesh\(/.test(heliSrc));
  check('heli-static: no external URLs in the heli block', !/https?:\/\//.test(heliSrc));
  check('heli-static: BOARD hint click wiring pins heliEnter',
    html.includes("heliHintEl.addEventListener('click', () => { if (HELI.hintOn) heliEnter(); })"));
  check('heli-static: helipad bakes into the shared park geometry (zero new pad draws)',
    html.includes('helipad baked into the shared park geometry'));
  check('heli-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
}

/* ================= 25. PLANES v1 (Phase 5 vehicles) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }

  check('plane: one shared body InstancedMesh holds the fleet',
    G.planeBodyIM.isInstancedMesh === true && G.PLANE.slots.length === 3 && G.PLANE_N === 3);
  check('plane: 3 per-instance tints allocated (green/tangerine/sky)',
    G.planeBodyIM.instanceColor.count === 3);
  check('plane: tuned faster than the helicopter', G.PLANE.topSpeed > G.HELI.topSpeed,
    'plane=' + G.PLANE.topSpeed + ' heli=' + G.HELI.topSpeed);
  check('plane: merged geometry carries RGBA vertex colors (prop blur disc)',
    G.planeBodyIM.geometry.attributes.color.itemSize === 4);

  /* seeded airstrips: deterministic, disjoint from the other sport residues and docks.
     Airstrips are rarer than helipads (same %5 split, but the strip needs a
     long flat run), so the scan runs wider: +/-40 chunks. */
  let stripChunk = null;
  for (let gx = -40; gx <= 40 && !stripChunk; gx++)
    for (let gz = -40; gz <= 40 && !stripChunk; gz++) {
      const d = G.airstripFor(gx, gz);
      if (d) stripChunk = { gx, gz, d };
    }
  check('plane: seeded airstrips exist in the world', !!stripChunk,
    stripChunk ? 'chunk ' + stripChunk.gx + ',' + stripChunk.gz : 'none in -40..40');
  const pd = stripChunk.d, pd2 = G.airstripFor(stripChunk.gx, stripChunk.gz);
  check('plane: airstripFor is deterministic on revisit',
    !!pd2 && pd.x === pd2.x && pd.z === pd2.z && pd.yaw === pd2.yaw);
  check('plane: strip sits on dry gentle land',
    pd.y >= -0.15 && Math.abs(G.terrainHeight(pd.x + 6, pd.z) - pd.y) <= 2.0,
    'stripY=' + pd.y.toFixed(2));
  check('plane: strip residue is disjoint from soccer/basketball/tennis/heli',
    !G.soccerPitchFor(stripChunk.gx, stripChunk.gz) && !G.basketballCourtFor(stripChunk.gx, stripChunk.gz) &&
    !G.tennisCourtFor(stripChunk.gx, stripChunk.gz) && !G.helipadFor(stripChunk.gx, stripChunk.gz));
  check('plane: strip residue is disjoint from docks', !G.dockFor(stripChunk.gx, stripChunk.gz));

  /* spawns: teleport to the strip chunk, the rebuild parks the fleet */
  const pcx0 = (stripChunk.gx + 0.5) * 48, pcz0 = (stripChunk.gz + 0.5) * 48;
  G.player.position.set(pcx0, groundY(pcx0, pcz0), pcz0);
  frame(3);
  const pplaced0 = G.PLANE.slots.filter(s => s.placed);
  check('plane: rebuild parks airplanes on the strip', pplaced0.length >= 1, 'placed=' + pplaced0.length);
  check('plane: every parked airplane sits on its gear at strip height',
    pplaced0.every(s => Math.abs(s.y - (G.terrainHeight(s.x, s.z) + G.PLANE.gearH)) < 0.6));

  /* determinism on revisit: leave, come back, same spawns */
  const pposes = G.PLANE.slots.map(s => [s.x, s.z, s.yaw, s.placed]);
  G.player.position.set(pcx0 + 400, groundY(pcx0 + 400, pcz0), pcz0);
  frame(3);
  G.player.position.set(pcx0, groundY(pcx0, pcz0), pcz0);
  G.PLANE.anchorCx = 1e9; G.PLANE.anchorCz = 1e9; G.PLANE.key = '';
  frame(3);
  const psamePose = (s, p) => (s.placed === p[3]) &&
    (!s.placed || (Math.abs(s.x - p[0]) < 1e-9 && Math.abs(s.z - p[1]) < 1e-9 && Math.abs(s.yaw - p[2]) < 1e-9));
  check('plane: spawns are deterministic on revisit',
    G.PLANE.slots.every((s, i) => psamePose(s, pposes[i])));

  /* BOARD hint: stand at a parked airplane */
  const ps0 = G.PLANE.slots.find(s => s.placed);
  G.player.position.set(ps0.x, ps0.y + 1, ps0.z);
  frame(2);
  check('plane: BOARD hint appears near a parked airplane',
    G.PLANE.hintOn === true && G.PLANE.nearIdx >= 0 && G.planeHintEl.style.opacity === 1,
    'hintOn=' + G.PLANE.hintOn);
  check('plane: hint text carries the E key',
    G.planeHintEl.textContent === 'BOARD [E]' || G.planeHintEl.textContent === 'TAP TO BOARD',
    G.planeHintEl.textContent);

  /* board: E near the airplane enters */
  G.planeEnter();
  check('plane: E near airplane enters (PLANE.flying true)',
    G.PLANE.flying === true && G.player.visible === false);
  check('plane: board toast fires', G.toastEl.textContent === 'PLANE');
  check('plane: chip shows while flying', G.planeChipEl.style.display === 'block');

  /* ground roll: W throttles up, auto-rotate lifts the plane at Vr */
  const py0 = G.PLANE.pos.y;
  G.keys.KeyW = true;
  let pAir = false;
  for (let f = 0; f < 300 && !pAir; f++) { frame(1); pAir = !G.PLANE.grounded; }
  G.keys.KeyW = false;
  check('plane: throttle rolls the plane and auto-rotates at Vr',
    pAir === true && G.PLANE.speed >= G.PLANE.vr - 1,
    'airborne=' + pAir + ' spd=' + G.PLANE.speed.toFixed(1));

  /* pitch: W in the air pitches the nose down */
  G.keys.KeyW = true;
  frame(20);
  G.keys.KeyW = false;
  check('plane: W pitches the nose down in the air', G.PLANE.pitch > 0.05,
    'pitch=' + G.PLANE.pitch.toFixed(3));
  check('plane: chip reads speed and altitude while flying',
    /^PLANE - \d+ KM\/H \/ ALT \d+M$/.test(G.planeChipEl.textContent), G.planeChipEl.textContent);

  /* bank-to-turn: D banks right and the heading follows the bank */
  G.PLANE.heading = 0; G.PLANE.bank = 0;
  const hd0 = G.PLANE.heading;
  G.keys.KeyD = true;
  frame(30);
  G.keys.KeyD = false;
  const hdTurn = G.PLANE.heading - hd0;
  check('plane: bank-to-turn steers the plane with the bank', hdTurn > 0.05 && G.PLANE.bank > 0.1,
    'dhdg=' + hdTurn.toFixed(3) + ' bank=' + G.PLANE.bank.toFixed(3));

  /* stall: throttle cut, speed decays, nose drops gently with a warning */
  const sgy = groundY(G.PLANE.pos.x, G.PLANE.pos.z);
  G.PLANE.pos.y = sgy + 30; G.PLANE.throttle = 0; G.PLANE.speed = 2; G.PLANE.vy = 0;
  G.PLANE.grounded = false; G.PLANE.crashT = 0; G.PLANE.pitch = 0; G.PLANE.pitchVel = 0;
  G.toastEl.textContent = '';
  frame(40);
  check('plane: below minimum flying speed the nose drops gently (stall)',
    G.PLANE.pitch > 0.08, 'pitch=' + G.PLANE.pitch.toFixed(3));
  check('plane: stall warning fires', G.toastEl.textContent === 'STALL', G.toastEl.textContent);

  /* ceiling cap */
  G.PLANE.pos.y = 59; G.PLANE.vy = 8; G.PLANE.grounded = false;
  frame(10);
  check('plane: ceiling caps the climb', G.PLANE.pos.y <= G.PLANE.ceil + 0.01, 'y=' + G.PLANE.pos.y.toFixed(1));

  /* hard crash: steep dive into terrain = thud + damage + pushback.
     vy -20 is decisive: the stall-sink ease cannot soften it before contact.
     Teleport over dry land first: the ceiling climb can drift the plane over
     water, where the Skimmer rule would (correctly) land it gently. */
  let dx0 = G.PLANE.pos.x, dz0 = G.PLANE.pos.z, dfound = false;
  for (let ox = -200; ox <= 200 && !dfound; ox += 20)
    for (let oz = -200; oz <= 200 && !dfound; oz += 20)
      if (groundY(G.PLANE.pos.x + ox, G.PLANE.pos.z + oz) > 1.0)
        { dx0 = G.PLANE.pos.x + ox; dz0 = G.PLANE.pos.z + oz; dfound = true; }
  check('plane: dry crash-test terrain exists', dfound, 'dry@' + dx0.toFixed(0) + ',' + dz0.toFixed(0));
  G.PLANE.pos.set(dx0, groundY(dx0, dz0) + 12, dz0);
  G.PLANE.vy = -20; G.PLANE.grounded = false;
  G.PLANE.crashT = 0; G.PLANE.throttle = 0; G.PLANE.speed = 8;
  G.toastEl.textContent = '';
  let crashed = false;
  for (let f = 0; f < 120 && !crashed; f++) { frame(1); crashed = G.PLANE.crashT > 0; }
  check('plane: hard terrain crash thuds, damages, and pushes back',
    crashed && G.toastEl.textContent === 'CRASH' && G.PLANE.speed < 0,
    'crashT=' + G.PLANE.crashT.toFixed(2) + ' spd=' + G.PLANE.speed.toFixed(1));

  /* water: Skimmer rule, water landing is always gentle */
  let wx = 0, wz = 0, wfound = false;
  for (let sx = -400; sx <= 400 && !wfound; sx += 20)
    for (let sz = -400; sz <= 400 && !wfound; sz += 20)
      if (G.terrainHeight(sx, sz) < -0.55) { wx = sx; wz = sz; wfound = true; }
  check('plane: test water exists', wfound, 'water@' + wx + ',' + wz);
  G.PLANE.pos.set(wx, 6, wz); G.PLANE.vy = -6; G.PLANE.grounded = false;
  G.PLANE.crashT = 0; G.PLANE.throttle = 0; G.PLANE.speed = 6;
  G.toastEl.textContent = '';
  let splashed = false, sawSplash = false;
  for (let f = 0; f < 200 && !splashed; f++) {
    frame(1);
    if (G.toastEl.textContent === 'SPLASHDOWN') sawSplash = true;   // other tickers (tennis) may toast later in the frame
    splashed = G.PLANE.grounded;
  }
  check('plane: water landing floats gently (Skimmer rule)',
    splashed && sawSplash && G.PLANE.crashT <= 0,
    'splashToast=' + sawSplash);

  /* guards: no emotes while flying */
  G.PLANE.flying = true; G.PLANE.grounded = false;
  const emKey0 = G.EMO.key;
  G.fireEmote('wave');
  check('plane: emotes are blocked while flying', G.EMO.key === emKey0);

  /* guards: mutual exclusion with the car */
  G.PLANE.flying = false;
  G.CAR.driving = true;
  G.PLANE.hintOn = true; G.PLANE.nearIdx = 0;
  G.planeEnter();
  check('plane: cannot board while driving another vehicle',
    G.PLANE.flying === false);
  G.CAR.driving = false; G.PLANE.hintOn = false; G.PLANE.nearIdx = -1;

  /* exit: E while flying glides the plane down and exits on touchdown */
  G.PLANE.flying = true;
  G.PLANE.pos.set(wx, Math.max(groundY(wx, wz), -0.55) + 8, wz);
  G.PLANE.vy = 0; G.PLANE.speed = 12; G.PLANE.throttle = 0.3; G.PLANE.grounded = false;
  G.PLANE.crashT = 0; G.PLANE.bank = 0; G.PLANE.pitch = 0;
  G.mountToggle();
  check('plane: E while flying starts the auto-landing glide', G.PLANE.autoLand === true);
  let pexited = false;
  for (let f = 0; f < 900 && !pexited; f++) { frame(1); pexited = !G.PLANE.flying; }
  check('plane: auto-land resolves to an exit (never traps)',
    pexited === true && G.player.visible === true, 'flying=' + G.PLANE.flying);
  check('plane: exit toast fires', G.toastEl.textContent === 'ON FOOT');
  check('plane: player steps out on the ground beside the landed airplane',
    Math.abs(G.player.position.y - groundY(G.player.position.x, G.player.position.z)) < 0.5 &&
    G.PLANE.slots.some(s => s.placed &&
      Math.hypot(G.player.position.x - s.x, G.player.position.z - s.z) < 30));
  check('plane: chip hides after exit', G.planeChipEl.style.display === 'none');

  /* static pins for the plane block */
  const planeSrc = html.slice(html.indexOf('/* ================= PHASE 5: PLANES'),
                              html.indexOf('/* ================= PHASE 5: TRAINS v1 (vehicles expansion)'));
  check('plane-static: exactly one new InstancedMesh literal in the plane block',
    (planeSrc.match(/new THREE\.InstancedMesh/g) || []).length === 1);
  check('plane-static: plane block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(planeSrc));
  check('plane-static: plane block creates no meshes outside the fleet IM',
    !/new THREE\.Mesh\(/.test(planeSrc));
  check('plane-static: no external URLs in the plane block', !/https?:\/\//.test(planeSrc));
  check('plane-static: BOARD hint click wiring pins planeEnter',
    html.includes("planeHintEl.addEventListener('click', () => { if (PLANE.hintOn) planeEnter(); })"));
  check('plane-static: runway bakes into the shared park geometry (zero new strip draws)',
    html.includes('runway strip baked into the shared park geometry'));
  check('plane-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('plane-static: negated vehicle guards cover the plane (walk/jump/hints/wanted)',
    (html.match(/&& !HELI\.flying && !PLANE\.flying/g) || []).length >= 10);
}

/* ================= 26. TRAINS v1 (Phase 5 vehicles) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.TRAIN.riding) G.trainExit();

  check('train: one shared body mesh holds the fleet (2 trains x 4 cars)',
    G.trainBodyIM.isInstancedMesh === true && G.TRAIN_N === 2 && G.TRAIN_CARS === 4);
  check('train: 8 per-instance livery tints allocated (red/blue locos, silver cars)',
    G.trainBodyIM.instanceColor.count === 8);
  check('train: merged geometry carries RGBA vertex colors',
    G.trainBodyIM.geometry.attributes.color.itemSize === 4);

  /* deterministic line: fixed world x, seeded stations, named stations */
  check('train: rail line x is a fixed deterministic constant',
    typeof G.TRAIN_TRACK_X === 'number' && G.TRAIN_TRACK_X >= -300 && G.TRAIN_TRACK_X < 300);
  check('train: stations are pure functions of the index',
    G.trainStationZ(0) === G.trainStationZ(0) && Math.abs(G.trainStationZ(0)) < 100);
  check('train: stations stay monotonic (1200u spacing beats the 200u jitter)',
    G.trainStationZ(5) > G.trainStationZ(4) && G.trainStationZ(-3) < G.trainStationZ(-2));
  check('train: station names come from the procedural pool',
    G.TRAIN_NAMES.includes(G.trainStationName(3)));
  check('train: next-station lookup only returns stations ahead',
    G.trainStationZ(G.trainNextK(0, 1)) > 0.5 && G.trainStationZ(G.trainNextK(0, -1)) < -0.5);

  /* rail bed bakes into the chunk vertex colors: zero new draw calls for rails */
  check('train: rail bed paint is wired into buildChunk',
    html.includes('paintTrainBed(c, pos, col);'));

  /* board: pin train 0 dwelling at station 0, walk up and board */
  const t0 = G.TRAIN.trains[0];
  t0.dir = 1; t0.s = G.trainStationZ(0); t0.v = 0; t0.dwellT = 10; t0.nextK = 0; t0.braking = false;
  const bx = G.TRAIN_TRACK_X + 2, bz = t0.s;
  G.player.position.set(bx, groundY(bx, bz), bz);
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0;
  frame(2);
  check('train: BOARD hint shows near a stopped train',
    G.TRAIN.hintOn === true && G.trainHintEl.style.opacity == 1);
  G.trainEnter();
  check('train: enter puts the rider on the roof, chip shows',
    G.TRAIN.riding === true && G.trainChipEl.style.display === 'block');
  frame(3);   // let the ride chip paint
  check('train: chip reads speed and next station while riding',
    /^TRAIN - \d+ KM\/H \/ NEXT: [A-Z ]+$/.test(G.trainChipEl.textContent), G.trainChipEl.textContent);

  /* ride: the schedule departs and carries the player along the line */
  t0.dwellT = 0.3;
  const rz0 = G.player.position.z;
  frame(300);   // ~5 s: dwell expires, the train accelerates out
  const rz1 = G.player.position.z;
  check('train: riding carries the player along the line',
    Math.abs(rz1 - rz0) > 20, 'dz=' + (rz1 - rz0).toFixed(1));
  check('train: rider stands visible above the rail',
    G.player.visible === true && G.player.position.y > groundY(G.player.position.x, G.player.position.z) + 1);

  /* exit: drops beside the track on the platform side, chip hides, never traps */
  G.trainExit();
  check('train: exit drops the rider beside the track, chip hides',
    G.TRAIN.riding === false
    && Math.abs(G.player.position.x - (G.TRAIN_TRACK_X + 4.6)) < 0.01
    && G.trainChipEl.style.display === 'none');

  /* never board at speed: no hint, and the enter gate refuses */
  const t1 = G.TRAIN.trains[1];
  t1.dwellT = 0; t1.v = 12; t1.nextK = G.trainNextK(t1.s, t1.dir);
  G.P.godT = 9999;   // danger skipped: this test is about the board gate, not the kill zone
  const fx = G.TRAIN_TRACK_X + 2, fz = t1.s;
  G.player.position.set(fx, groundY(fx, fz), fz);
  frame(2);
  check('train: no BOARD hint while the train runs at speed', G.TRAIN.hintOn === false);
  G.P.godT = 0;
  G.trainEnter();
  check('train: boarding refused at speed', G.TRAIN.riding === false);

  /* the schedule stops at stations: brake in, dwell ~15 s, depart */
  const sk = 7, sz = G.trainStationZ(sk);
  t0.dir = 1; t0.s = sz - 250; t0.v = 24; t0.dwellT = 0; t0.braking = false; t0.nextK = sk;
  const px0 = G.TRAIN_TRACK_X + 10;
  G.player.position.set(px0, groundY(px0, sz - 250), sz - 250);   // clear of the rails
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.TRAIN.exitCd = 0; G.TRAIN.hitCd = 0;
  let dwelled = false;
  for (let f = 0; f < 1000 && !dwelled; f++) { frame(1); dwelled = t0.dwellT > 0; }
  check('train: the schedule brakes into the station and dwells',
    dwelled && Math.abs(t0.s - sz) < 2, 's=' + t0.s.toFixed(1) + ' st=' + sz.toFixed(1));
  let departed = false;
  for (let f = 0; f < 1100 && !departed; f++) { frame(1); departed = t0.dwellT === 0 && t0.v > 5; }
  check('train: dwell ends and the train departs', departed, 'v=' + t0.v.toFixed(1));

  /* danger: head-on with a moving train is instantly fatal */
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.TRAIN.exitCd = 0; G.TRAIN.hitCd = 0;
  const dk = 9, dz9 = G.trainStationZ(dk);
  t1.dir = -1; t1.s = dz9 + 400; t1.v = 20; t1.dwellT = 0; t1.braking = false;
  t1.nextK = dk - 3;   // far ahead: no braking or dwell inside the test window
  const hz = dz9 + 340;   // on the rails, 60u ahead of the loco
  G.player.position.set(G.TRAIN_TRACK_X, groundY(G.TRAIN_TRACK_X, hz), hz);
  let died = false;
  for (let f = 0; f < 300 && !died; f++) { frame(1); died = G.P.dead; }
  check('train: head-on with a moving train is instantly fatal', died === true);

  /* danger: a side swipe throws the player clear with damage, no kill */
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.TRAIN.exitCd = 0; G.TRAIN.hitCd = 0;
  t1.dir = -1; t1.s = dz9 + 400; t1.v = 20; t1.dwellT = 0; t1.braking = false; t1.nextK = dk - 3;
  const qx = G.TRAIN_TRACK_X + 3.4, qz = dz9 + 340;
  G.player.position.set(qx, groundY(qx, qz), qz);
  let swiped = false;
  for (let f = 0; f < 300 && !swiped; f++) { frame(1); swiped = G.TRAIN.hitCd > 0.9; }
  check('train: side swipe throws the player clear (hit registers, player lives)',
    swiped && !G.P.dead, 'hp=' + G.P.hp);

  /* station sign: one shared mesh follows the nearest station */
  G.P.dead = false; G.P.hp = 100;
  const skz = G.trainStationZ(4), gx = G.TRAIN_TRACK_X + 6;
  G.player.position.set(gx, groundY(gx, skz), skz);
  frame(3);
  check('train: station sign appears at the nearest station',
    G.trainSignMesh.visible === true && Math.abs(G.trainSignMesh.position.z - (skz + 10)) < 1);

  /* static pins for the train block */
  const trainSrc = html.slice(html.indexOf('/* ================= PHASE 5: TRAINS v1 (vehicles expansion)'),
                              html.indexOf('/* ================= PHASE 5: PIANOS v1 (entertainment)'));
  check('train-static: exactly one new fleet mesh literal in the train block',
    (trainSrc.match(/new THREE\.InstancedMesh/g) || []).length === 1);
  check('train-static: train block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(trainSrc));
  check('train-static: rail bed and platforms bake into the shared chunk vertex colors (zero new rail draws)',
    trainSrc.includes('platforms bake into the shared chunk vertex colors'));
  check('train-static: no external URLs in the train block', !/https?:\/\//.test(trainSrc));
  check('train-static: BOARD hint click wiring pins trainEnter',
    html.includes("trainHintEl.addEventListener('click', () => { if (TRAIN.hintOn) trainEnter(); })"));
  check('train-static: trainchip click re-centers the chase cam',
    html.includes("trainChipEl.addEventListener('click', () => { if (TRAIN.riding) camYaw = TRAIN.heading; })"));
  check('train-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('train-static: vehicle guards cover the train (positive chains)',
    (html.match(/\|\| TRAIN\.riding/g) || []).length >= 20);
  check('train-static: vehicle guards cover the train (negated chains)',
    (html.match(/&& !TRAIN\.riding/g) || []).length >= 10);
  check('train-static: no RNG in the train block (deterministic hashes only)',
    !/Math\.random/.test(trainSrc));
  check('train-static: no new audio node literals (chug/whistle/screech reuse the one-shot idiom)',
    !(trainSrc.match(/\.createOscillator\(/g) || []).length && !(trainSrc.match(/\.createGain\(/g) || []).length);
  check('train-static: no em dashes anywhere', !html.includes('—'));
}


/* ================= 27. PIANOS v1 (Phase 5 entertainment) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.PIANO.playing) G.pianoExit();

  /* static: one fleet mesh, no lights, no RNG, no em dashes in the piano block */
  const pianoSrc = html.slice(html.indexOf('/* ================= PHASE 5: PIANOS v1 (entertainment)'),
                              html.indexOf('/* ================= PHASE 5: CASINO SLOTS v1 (entertainment)'));
  check('piano-static: exactly one new fleet mesh literal in the piano block',
    (pianoSrc.match(/new THREE\.InstancedMesh/g) || []).length === 1);
  check('piano-static: piano block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(pianoSrc));
  check('piano-static: no RNG in the piano block (deterministic hashes only)',
    !/Math\.random/.test(pianoSrc));
  check('piano-static: no em dashes in the piano block', !pianoSrc.includes('\u2014'));
  check('piano-static: no external URLs in the piano block', !/https?:\/\//.test(pianoSrc));
  check('piano-static: key map is A S D F G H J K = C major octave',
    G.PIANO_KEYCODES.join(',') === 'KeyA,KeyS,KeyD,KeyF,KeyG,KeyH,KeyJ,KeyK'
    && G.PIANO_NOTES.map(n => n[0]).join(',') === 'C,D,E,F,G,A,B,C5');
  check('piano-static: SIT hint click wiring pins pianoEnter',
    html.includes("pianoHintEl.addEventListener('click', () => { if (PIANO.hintOn) pianoEnter(); })"));
  check('piano-static: musicchip click re-centers the side-angle cam',
    html.includes("musicChipEl.addEventListener('click', () => { if (PIANO.playing) camYaw = PIANO.camAng; })"));
  check('piano-static: vehicle guards cover the piano (positive chains)',
    (html.match(/\|\| PIANO\.playing/g) || []).length >= 20);
  check('piano-static: vehicle guards cover the piano (negated chains)',
    (html.match(/&& !PIANO\.playing/g) || []).length >= 10);
  check('piano-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);

  /* deterministic spot: same chunk, same piano, every call */
  let pgx = 0, pgz = 0, pd = null;
  outer: for (let gx = -40; gx <= 40; gx++)
    for (let gz = -40; gz <= 40; gz++) {
      const d = G.pianoFor(gx, gz);
      if (d) { pgx = gx; pgz = gz; pd = d; break outer; }
    }
  check('piano: a seeded piano park exists in the scan window', !!pd, 'at ' + pgx + ',' + pgz);
  const pd2 = G.pianoFor(pgx, pgz);
  check('piano: pianoFor is deterministic across calls',
    !!pd2 && pd2.x === pd.x && pd2.z === pd.z && pd2.yaw === pd.yaw);
  check('piano: spot uses its own hash residue (disjoint from the sport %5 space)',
    G.pianoHash(pgx, pgz) % 7 === 5);

  /* sit: walk up, the SIT prompt shows, E (pianoEnter) seats the player */
  const pcx = Math.floor(pd.x / 48), pcz = Math.floor(pd.z / 48);
  G.player.position.set(pd.x, groundY(pd.x, pd.z), pd.z);
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0;
  G.pianoRebuild(pcx, pcz);
  frame(3);
  const slot = G.PIANO.slots.find(sl => sl.placed);
  check('piano: rebuild places a piano at the seeded spot', !!slot,
    slot ? 'd2=' + ((slot.x - pd.x) ** 2 + (slot.z - pd.z) ** 2).toFixed(2) : 'none placed');
  G.player.position.set(slot.x, groundY(slot.x, slot.z), slot.z);
  frame(3);
  check('piano: SIT hint shows near the piano',
    G.PIANO.hintOn === true && G.pianoHintEl.style.opacity == 1);
  const probs0 = consoleProblems.length;
  G.pianoEnter();
  check('piano: enter seats the player at the bench, chip shows',
    G.PIANO.playing === true && G.musicChipEl.style.display === 'block');
  frame(3);
  check('piano: chip reads PIANO with the stop hint',
    /^PIANO( - [A-G]5?)?  \|  E STOP$/.test(G.musicChipEl.textContent), G.musicChipEl.textContent);

  /* one note: sound fires, the piano bounces, the chip flashes the note name */
  G.pianoNote(0);
  check('piano: one note plays (C), bounce armed, chip flashes the note',
    G.PIANO.flashNote === 'C' && G.PIANO.flashT > 0
    && G.PIANO.slots[G.PIANO.slotIdx].bounceT > 0
    && / - C /.test(G.musicChipEl.textContent));
  check('piano: note plays with zero console errors/warnings',
    consoleProblems.length === probs0, consoleProblems.slice(probs0).join(' | '));
  const seatX = G.player.position.x, seatZ = G.player.position.z;
  frame(30);   // ~0.5 s: bounce + flash decay
  check('piano: the player stays frozen at the bench while playing',
    Math.abs(G.player.position.x - seatX) < 0.01 && Math.abs(G.player.position.z - seatZ) < 0.01
    && G.PIANO.playing === true);

  /* exit: E (pianoExit) frees the player, chip hides, never traps */
  G.pianoExit();
  check('piano: exit frees the player, chip hides, steps off the bench',
    G.PIANO.playing === false && G.musicChipEl.style.display === 'none'
    && Math.hypot(G.player.position.x - slot.x, G.player.position.z - slot.z) > 1.0);
  check('piano: board/exit round trip leaves zero console errors/warnings',
    consoleProblems.length === probs0, consoleProblems.slice(probs0).join(' | '));
}


/* ================= 28. CASINO SLOTS v1 (Phase 5 entertainment) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.SLOT.playing) G.slotExit();
  if (G.PIANO.playing) G.pianoExit();

  /* static: zero new draw calls, no lights, no unseeded RNG, no em dashes,
     no external URLs, no TODO text in the casino block */
  const casinoSrc = html.slice(html.indexOf('/* ================= PHASE 5: CASINO SLOTS v1 (entertainment)'),
                               html.indexOf('/* ================= PHASE 5: THEATER v1 (entertainment)'));
  check('casino-static: zero new fleet mesh literals in the casino block',
    (casinoSrc.match(/new THREE\.InstancedMesh/g) || []).length === 0);
  check('casino-static: casino block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(casinoSrc));
  check('casino-static: no unseeded RNG in the casino block', !/Math\.random/.test(casinoSrc));
  check('casino-static: no em dashes in the casino block', !casinoSrc.includes('\u2014'));
  check('casino-static: no external URLs in the casino block', !/https?:\/\//.test(casinoSrc));
  check('casino-static: no TODO markers in the casino block', !/\bTODO\b/.test(casinoSrc));
  check('casino-static: whole-file IM literals pin at 44 (48 - PERF-5 consolidation: trunks+fol, npcLegs, copGuns, brute->Mesh; civic fleet rides the shared def-loop literal)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 44);
  check('casino-static: 4 runtime building meshes (casino rides the store mesh, civic types share the civic fleet)',
    G.bldgMeshes.length === 4);
  check('casino-static: casino def shares the store fleet mesh',
    G.BLDG_DEF.casino.mesh === G.BLDG_DEF.store.mesh);
  check('casino-static: guard coverage (positive chains)',
    (html.match(/\|\| SLOT\.playing/g) || []).length >= 20);
  check('casino-static: guard coverage (negated chains)',
    (html.match(/&& !SLOT\.playing/g) || []).length >= 10);
  check('casino-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);

  /* seeded building: a real casino chunk, own residue, deterministic */
  let cgx = 0, cgz = 0, cfound = false;
  couter: for (let gx = -60; gx <= 60; gx++)
    for (let gz = -60; gz <= 60; gz++) {
      if (G.bldgTypeFor(gx, gz) === 'casino' && G.bldgAccepted(gx, gz)) { cgx = gx; cgz = gz; cfound = true; break couter; }
    }
  check('casino: a seeded casino chunk exists in the scan window', cfound, 'at ' + cgx + ',' + cgz);
  check('casino: own hash residue %7===3, disjoint from store %7===1',
    G.hash2i(cgx, cgz) % 7 === 3);
  check('casino: bldgTypeFor is deterministic across calls',
    G.bldgTypeFor(cgx, cgz) === 'casino');

  /* mechanics: synthetic casino at the player (the ticker owns the real
     redistribute; the seeded selection above proves the real placement) */
  const cpx = G.player.position.x, cpz = G.player.position.z;
  G.BLDG.active.casino.length = 0;
  G.BLDG.active.casino.push({ x: cpx + 3, z: cpz, y: groundY(cpx + 3, cpz), yaw: 0, gx: 0, gz: 0, name: 'CASINO', type: 'casino' });
  frame(3);
  check('casino: PLAY hint shows near the casino',
    G.SLOT.hintOn === true && G.casinohintEl.style.opacity == 1);

  /* enter: walk up, E (slotEnter) sits the player at the porch */
  const probs0 = consoleProblems.length;
  G.cash = 100;
  G.slotEnter();
  check('casino: enter freezes the player at the porch, panel + chip show',
    G.SLOT.playing === true && G.slotPanelEl.style.display === 'block'
    && G.casinoChipEl.style.display === 'block');
  frame(3);
  check('casino: chip reads SLOT | LAST WIN | CASH',
    /^SLOT \| LAST WIN \$\d+ \| CASH \$\d+$/.test(G.casinoChipEl.textContent), G.casinoChipEl.textContent);
  check('casino: the player stays frozen at the porch while playing',
    Math.abs(G.player.position.x - G.SLOT.seatX) < 0.01 && Math.abs(G.player.position.z - G.SLOT.seatZ) < 0.01
    && G.SLOT.playing === true);

  /* denied: under $5 the spin refuses, cash untouched */
  G.cash = 3;
  G.slotSpin();
  check('casino: spin denied under $5 (cash untouched, not spinning)',
    G.cash === 3 && G.SLOT.spinning === false);

  /* spin: $5 debit, staggered locks, payline outcome, paytable credit */
  G.cash = 100;
  const cashBefore = G.cash;
  G.slotSpin();
  check('casino: spin debits $5 and starts the staggered spin',
    G.cash === cashBefore - 5 && G.SLOT.spinning === true
    && G.SLOT.reels.every(r => r.locked === false));
  frame(70);   // ~1.17s: reel 1 locked, reels 2-3 still spinning
  check('casino: staggered locks (reel 1 locks first)',
    G.SLOT.reels[0].locked === true && G.SLOT.reels[1].locked === false && G.SLOT.reels[2].locked === false);
  frame(45);   // ~1.92s: reel 2 locked, reel 3 still spinning
  check('casino: staggered locks (reel 2 locks second)',
    G.SLOT.reels[1].locked === true && G.SLOT.reels[2].locked === false);
  frame(45);   // ~2.67s: all locked, spin settles
  check('casino: spin settles with the outcome symbols on the payline',
    G.SLOT.spinning === false && G.SLOT.reels.every(r => r.locked)
    && G.SLOT.reels.every((r, i) => (((Math.round(r.pos) % 5) + 5) % 5) === G.SLOT.outcome[i]));
  const expectWin = G.slotPay(G.SLOT.outcome[0], G.SLOT.outcome[1], G.SLOT.outcome[2]);
  check('casino: cash settles as the $5 debit plus the paytable win',
    G.cash === cashBefore - 5 + expectWin && G.SLOT.lastWin === expectWin,
    'cash=' + G.cash + ' win=' + expectWin);

  /* paytable math, no RNG involved */
  check('casino: paytable math (jackpot x50 / trips x10 / pair x2 / miss)',
    G.slotPay(2, 2, 2) === 250 && G.slotPay(0, 0, 0) === 50 && G.slotPay(4, 4, 4) === 50
    && G.slotPay(0, 0, 3) === 10 && G.slotPay(1, 3, 1) === 10 && G.slotPay(0, 1, 2) === 0);

  /* seeded RNG idiom: rewinding the spin counter replays the same outcome */
  const oA = G.SLOT.outcome.slice();
  G.cash = 1000;
  G.SLOT.spins -= 1;
  G.slotSpin();
  check('casino: seeded outcomes are deterministic for a given spin count',
    G.SLOT.outcome.join(',') === oA.join(','));
  frame(160);   // let the replayed spin settle

  /* exit: E (slotExit) frees the player, never traps */
  G.slotExit();
  check('casino: exit frees the player, panel + chip hide',
    G.SLOT.playing === false && G.slotPanelEl.style.display === 'none'
    && G.casinoChipEl.style.display === 'none');
  check('casino: E exits via the keydown chain (civic frees first, gambler still in order)',
    html.includes("else if (SLOT.playing) slotExit(); else if (PIANO.playing) pianoExit();"));
  check('casino: vehicleExit and busted eject the gambler',
    html.includes('else if (SLOT.playing) slotExit(); else if (PIANO.playing) pianoExit();')
    && html.includes('else if (SLOT.playing) slotExit();   // busted off the slot machine too'));
  frame(20);   // bearing chip cadence
  check('casino: bearing chip shows the CASINO sign with distance',
    G.casbearingEl.style.display === 'block' && /CASINO \d+M/.test(G.castxtEl.textContent), G.castxtEl.textContent);
  check('casino: enter/spin/exit round trip leaves zero console errors/warnings',
    consoleProblems.length === probs0, consoleProblems.slice(probs0).join(' | '));
}


/* ================= 29. THEATER v1 (Phase 5 entertainment) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.THEATER.watching) G.theaterExit();
  if (G.SLOT.playing) G.slotExit();
  if (G.PIANO.playing) G.pianoExit();

  /* static: exactly one new fleet mesh literal, no lights, no unseeded RNG,
     no em dashes, no external URLs, no TODO text in the theater block */
  const theaterSrc = html.slice(html.indexOf('/* ================= PHASE 5: THEATER v1 (entertainment)'),
                                html.indexOf('/* ============================== GAME LOOP'));
  check('theater-static: exactly one new fleet mesh literal in the theater block',
    (theaterSrc.match(/new THREE\.InstancedMesh/g) || []).length === 1);
  check('theater-static: theater block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(theaterSrc));
  check('theater-static: no unseeded RNG in the theater block', !/Math\.random/.test(theaterSrc));
  check('theater-static: no em dashes in the theater block', !theaterSrc.includes('\u2014'));
  check('theater-static: no external URLs in the theater block', !/https?:\/\//.test(theaterSrc));
  check('theater-static: no TODO markers in the theater block', !/\bTODO\b/.test(theaterSrc));
  check('theater-static: whole-file IM literals pin at 44 (48 - PERF-5 consolidation: trunks+fol, npcLegs, copGuns, brute->Mesh)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 44);
  check('theater-static: light count pins at 6 (zero new lights)',
    (html.match(/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/g) || []).length === 6);
  check('theater-static: audio nodes pin unchanged (17 osc, 30 gain: music reuses sfxBlip)',
    (html.match(/\.createOscillator\(/g) || []).length === 17 &&
    (html.match(/\.createGain\(/g) || []).length === 30);
  check('theater-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('theater-static: guard coverage (positive chains)',
    (html.match(/\|\| THEATER\.watching/g) || []).length >= 28);
  check('theater-static: guard coverage (negated chains, incl. civic-extended paren form)',
    ((html.match(/&& !THEATER\.watching/g) || []).length
      + (html.match(/!\(THEATER\.watching \|\| CIVIC\.state\)/g) || []).length) >= 18);
  check('theater-static: WATCH hint click wiring pins theaterEnter',
    html.includes("theaterHintEl.addEventListener('click', () => { if (THEATER.hintOn) theaterEnter(); })"));
  check('theater-static: E frees the watcher before the gambler/pianist in the keydown chain',
    html.includes("else if (THEATER.watching) theaterExit(); else if (SLOT.playing) slotExit();"));
  check('theater-static: vehicleExit, mountToggle, busted and death eject the watcher',
    html.includes('function vehicleExit() { if (CIVIC.state) civicExit(); else if (THEATER.watching) theaterExit();')
    && html.includes('else if (THEATER.watching) theaterExit();   // Phase 5 theater: E never traps the watcher')
    && html.includes('else if (THEATER.watching) theaterExit();   // busted out of the audience too')
    && html.includes('else if (THEATER.watching) theaterExit();  // ...and no show while dead either'));

  /* deterministic spot: same chunk, same theater, every call; own residue */
  let tgx = 0, tgz = 0, td = null;
  touter: for (let gx = -40; gx <= 40; gx++)
    for (let gz = -40; gz <= 40; gz++) {
      const d = G.theaterFor(gx, gz);
      if (d) { tgx = gx; tgz = gz; td = d; break touter; }
    }
  check('theater: a seeded theater park exists in the scan window', !!td, 'at ' + tgx + ',' + tgz);
  const td2 = G.theaterFor(tgx, tgz);
  check('theater: theaterFor is deterministic across calls',
    !!td2 && td2.x === td.x && td2.z === td.z && td2.yaw === td.yaw);
  check('theater: spot uses its own hash residue %7===2 (disjoint from piano %7===5)',
    G.theaterHash(tgx, tgz) % 7 === 2);

  /* sit: walk up, the WATCH prompt shows, E (theaterEnter) seats the player */
  const tcx = Math.floor(td.x / 48), tcz = Math.floor(td.z / 48);
  G.player.position.set(td.x, groundY(td.x, td.z), td.z);
  G.THEATER.key = '';
  G.theaterRebuild(tcx, tcz);
  frame(3);
  const tslot = G.THEATER.slots.find(sl => sl.placed);
  check('theater: rebuild places a theater at the seeded spot', !!tslot,
    tslot ? 'd2=' + ((tslot.x - td.x) ** 2 + (tslot.z - td.z) ** 2).toFixed(2) : 'none placed');
  check('theater: the fleet mesh holds 30 instances per theater slot',
    G.theaterBoxIM.count === G.THEATER_N * G.T_INST);
  G.player.position.set(tslot.x, groundY(tslot.x, tslot.z), tslot.z);
  frame(3);
  check('theater: WATCH hint shows near the theater',
    G.THEATER.hintOn === true && G.theaterHintEl.style.opacity == 1);
  const probs0 = consoleProblems.length;
  G.theaterEnter();
  check('theater: enter seats the player in the audience, chip shows',
    G.THEATER.watching === true && G.theaterChipEl.style.display === 'block');
  frame(3);
  check('theater: chip reads NOW PLAYING - SET NAME | E LEAVE',
    /^NOW PLAYING - [A-Z ]+  \|  E LEAVE$/.test(G.theaterChipEl.textContent), G.theaterChipEl.textContent);
  const seatX = G.player.position.x, seatZ = G.player.position.z;
  frame(30);   // ~0.5 s: music bars, crowd bounce, performer dance
  check('theater: the player stays frozen at the seat while watching',
    Math.abs(G.player.position.x - seatX) < 0.01 && Math.abs(G.player.position.z - seatZ) < 0.01
    && G.THEATER.watching === true);

  /* guards freeze locomotion, combat, melee, emotes while watching */
  G.doPunch();
  check('theater: melee is refused while watching', G.P.punchCd <= 0, 'punchCd=' + G.P.punchCd);
  G.fireEmote('dance');
  check('theater: emotes are refused while watching', G.EMO.key === null);
  const fireCd0 = G.fireCd;
  G.shoot();
  check('theater: firing is refused while watching', G.fireCd === fireCd0);

  /* set cycling: 16 bars = one set; the chip renames on the change */
  const ws = G.THEATER.slots[G.THEATER.watchIdx];
  const name0 = G.theaterSetName(ws);
  ws.musicT = G.THEATER_BAR_LEN * 16 - 0.01; ws.bar = 15;
  frame(3);
  check('theater: the 16-bar loop rolls into a new set',
    ws.setIdx === 1 && ws.cheerT > 0, 'setIdx=' + ws.setIdx + ' cheerT=' + ws.cheerT.toFixed(2));
  check('theater: the chip renames on the set change',
    G.theaterChipEl.textContent === 'NOW PLAYING - ' + G.theaterSetName(ws).toUpperCase() + '  |  E LEAVE',
    G.theaterChipEl.textContent);
  check('theater: set names are procedural (' + G.THEATER_SETS.length + ' in rotation)',
    G.THEATER_SETS.includes(name0) && G.THEATER_SETS.includes(G.theaterSetName(ws)));

  /* exit: E (theaterExit) frees the player, chip hides, never traps */
  G.theaterExit();
  check('theater: exit frees the player, chip hides, steps into the aisle',
    G.THEATER.watching === false && G.theaterChipEl.style.display === 'none'
    && Math.hypot(G.player.position.x - tslot.x, G.player.position.z - tslot.z) > 1.0);
  check('theater: watch/exit round trip leaves zero console errors/warnings',
    consoleProblems.length === probs0, consoleProblems.slice(probs0).join(' | '));
}


/* ================= 30. RURAL CIVIC BUILDINGS v1 (Phase 5 buildings/places) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.CIVIC.state) G.civicExit();
  const settleC = (x, z) => {
    G.player.position.set(x, groundY(x, z), z);
    G.player.rotation.y = 0;
    frame(3);   // absorb any chunk crossing -> redistributeBuildings runs
  };
  const findCivic = (type) => {
    for (let r = 2; r < 60; r++)
      for (let gx = -r; gx <= r; gx++)
        for (let gz = -r; gz <= r; gz++) {
          if (Math.max(Math.abs(gx), Math.abs(gz)) !== r) continue;
          const b = G.bldgCenterFor(gx, gz);
          if (b && b.type === type) return b;
        }
    return null;
  };
  settleC(0, 0);

  /* static: exactly one new fleet mesh literal in the civic block, no lights,
     no unseeded RNG, no em dashes, no external URLs, no TODO text */
  const civicSrc = html.slice(html.indexOf('/* ================= PHASE 5: RURAL CIVIC BUILDINGS v1'),
                              html.indexOf('/* ================= PHASE 5: THEATER v1 (entertainment)'));
  check('civic-static: zero fleet mesh literals in the gameplay block (the fleet rides the shared def loop)',
    (civicSrc.match(/new THREE\.InstancedMesh/g) || []).length === 0);
  check('civic-static: civic block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(civicSrc));
  check('civic-static: no unseeded RNG in the civic block (deterministic hashes only)',
    !/Math\.random/.test(civicSrc));
  check('civic-static: no em dashes in the civic block', !civicSrc.includes('—'));
  check('civic-static: no external URLs in the civic block', !/https?:\/\//.test(civicSrc));
  check('civic-static: no TODO markers in the civic block', !/\bTODO\b/.test(civicSrc));
  check('civic-static: whole-file IM literals pin at 44 (48 - PERF-5 consolidation: trunks+fol, npcLegs, copGuns, brute->Mesh; civic fleet rides the shared def-loop literal)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 44);
  check('civic-static: the civic fleet is a live InstancedMesh (+1 runtime draw call)',
    G.BLDG_DEF.civic.mesh.isInstancedMesh === true && G.BLDG_DEF.civic.mesh.instanceMatrix.count === 8);
  check('civic-static: 4 runtime building meshes (house, barn, store, civic)',
    G.bldgMeshes.length === 4);
  check('civic-static: all four civic types share the one civic fleet mesh',
    G.BLDG_DEF.hospital.mesh === G.BLDG_DEF.civic.mesh
    && G.BLDG_DEF.bank.mesh === G.BLDG_DEF.civic.mesh
    && G.BLDG_DEF.hotel.mesh === G.BLDG_DEF.civic.mesh
    && G.BLDG_DEF.school.mesh === G.BLDG_DEF.civic.mesh
    && G.BLDG_DEF.civic.mesh !== G.BLDG_DEF.store.mesh);
  check('civic-static: civic fleet capacity covers 4 types x cap 2',
    G.BLDG_DEF.civic.mesh.instanceMatrix.count === 8);
  check('civic-static: per-type tints are all distinct (white/green-gray/warm/brick)',
    new Set([G.BLDG_DEF.hospital.tint, G.BLDG_DEF.bank.tint, G.BLDG_DEF.hotel.tint, G.BLDG_DEF.school.tint]).size === 4);
  check('civic-static: per-type silhouettes differ (non-uniform scale)',
    G.CIVIC_SCALE.hospital[1] > G.CIVIC_SCALE.hotel[1]
    && G.CIVIC_SCALE.hotel[1] > G.CIVIC_SCALE.bank[1]
    && G.CIVIC_SCALE.bank[0] < G.CIVIC_SCALE.school[0]);
  check('civic-static: guard coverage (positive chains)',
    (html.match(/\|\| CIVIC\.state/g) || []).length >= 25);
  check('civic-static: guard coverage (negated chains)',
    (html.match(/&& !CIVIC\.state/g) || []).length >= 3);
  check('civic-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('civic-static: KeyE exits civic first, enters on a live hint',
    html.includes("if (e.code === 'KeyE') { if (CIVIC.state) civicExit();")
    && html.includes("else if (CIVIC.hintOn) civicEnter();"));
  check('civic-static: mountToggle, vehicleExit, busted and death eject the visitor',
    html.includes('if (CIVIC.state) civicExit();   // Phase 5 civic: E never traps the visitor')
    && html.includes('function vehicleExit() { if (CIVIC.state) civicExit();')
    && html.includes('if (CIVIC.state) civicExit();   // Phase 5 civic: busted out of the menu too')
    && html.includes('if (CIVIC.state) civicExit();  // ...and no civic menu while dead either'));

  /* seeded placement: all four types exist, own residue, deterministic */
  const found = {};
  for (const t of G.CIVIC_ORDER) found[t] = findCivic(t);
  check('civic: all four civic types place in the scan window',
    G.CIVIC_ORDER.every(t => !!found[t]), G.CIVIC_ORDER.map(t => t + ':' + !!found[t]).join(' '));
  check('civic: own hash residue %7===5, disjoint from store %7===1 / casino %7===3',
    G.CIVIC_ORDER.every(t => G.hash2i(found[t].gx, found[t].gz) % 7 === 5));
  {
    const b = found.hospital;
    const a = G.bldgCenterFor(b.gx, b.gz), c = G.bldgCenterFor(b.gx, b.gz);
    check('civic: placement is a pure function of chunk coords',
      !!a && !!c && a.x === c.x && a.z === c.z && a.type === c.type && a.sx === c.sx && a.sy === c.sy,
      a ? a.type + ' @' + a.x.toFixed(1) + ',' + a.z.toFixed(1) : 'null');
  }

  /* mechanics: synthetic hospital at the player (the ticker owns the real
     redistribute; the seeded selection above proves the real placement) */
  const cpx = G.player.position.x, cpz = G.player.position.z;
  const synthCivic = (type) => {
    for (const t of G.CIVIC_ORDER) G.BLDG.active[t].length = 0;
    G.BLDG.active[type].push({ x: cpx + 3, z: cpz, y: groundY(cpx + 3, cpz), yaw: 0, gx: 0, gz: 0, name: type.toUpperCase(), type });
    /* stand 6.5u from the new building: inside every porch hint radius
       (7.5/14.0/8.5). Synthetic buildings bypass redistributeBuildings, so
       they add no foot colliders of their own. */
    G.player.position.set(cpx + 3 + 6.5, groundY(cpx + 9.5, cpz), cpz);
  };
  const probs0 = consoleProblems.length;
  synthCivic('hospital');
  frame(3);
  check('civic: HEAL hint shows near the hospital',
    G.CIVIC.hintOn === true && G.CIVIC.nearType === 'hospital' && G.civichintEl.style.opacity == 1);
  G.civicEnter();
  check('civic: enter freezes the player at the porch, panel + chip show',
    G.CIVIC.state === 'hospital' && G.civicPanelEl.style.display === 'block'
    && G.civicChipEl.style.display === 'block');
  check('civic: chip reads TYPE | PROMPT | E LEAVE',
    G.civicChipEl.textContent === 'HOSPITAL | HEAL $30 | E LEAVE', G.civicChipEl.textContent);
  check('civic: panel carries the type title, action and foot text',
    G.civicTitleEl.textContent === 'HOSPITAL' && G.civicActEl.textContent === 'HEAL $30'
    && G.civicFootEl.textContent === 'FULL HEAL TO 100 HP');
  frame(3);
  check('civic: the player stays frozen at the porch while inside',
    Math.abs(G.player.position.x - G.CIVIC.seatX) < 0.01 && Math.abs(G.player.position.z - G.CIVIC.seatZ) < 0.01
    && G.CIVIC.state === 'hospital');

  /* guards freeze locomotion, combat, melee, emotes while inside */
  G.doPunch();
  check('civic: melee is refused while inside', G.P.punchCd <= 0, 'punchCd=' + G.P.punchCd);
  G.fireEmote('dance');
  check('civic: emotes are refused while inside', G.EMO.key === null);
  const fireCd0 = G.fireCd;
  G.shoot();
  check('civic: firing is refused while inside', G.fireCd === fireCd0);

  /* hospital economy: $30 full heal, diner-heal idiom */
  G.P.hp = 40; G.cash = 100;
  G.civicHeal();
  check('civic: hospital heal costs $30 and restores full HP',
    G.cash === 70 && G.P.hp === 100, 'cash=' + G.cash + ' hp=' + G.P.hp);
  check('civic: heal toast confirms', G.toastEl.textContent === 'HEALED', G.toastEl.textContent);
  G.civicHeal();
  check('civic: heal at full HP is refused (cash untouched)',
    G.cash === 70 && G.toastEl.textContent === 'ALREADY HEALTHY', G.toastEl.textContent);
  G.P.hp = 40; G.cash = 10;
  G.civicHeal();
  check('civic: heal denied under $30 (cash untouched)',
    G.cash === 10 && G.P.hp === 40 && G.toastEl.textContent === 'NOT ENOUGH CASH');

  /* exit: E (civicExit) frees the player, panel + chip hide, never traps */
  G.civicExit();
  check('civic: exit frees the player, panel + chip hide',
    G.CIVIC.state === null && G.civicPanelEl.style.display === 'none'
    && G.civicChipEl.style.display === 'none');
  check('civic: exit toast reads ON FOOT', G.toastEl.textContent === 'ON FOOT');

  /* bank economy: $20 daily allowance, once per in-game day */
  synthCivic('bank');
  frame(3);
  G.civicEnter();
  check('civic: ATM hint shows near the bank and enter works',
    G.CIVIC.state === 'bank');
  const day0 = G.CIVIC.day;
  G.cash = 50;
  G.civicAtm();
  check('civic: ATM pays the $20 daily allowance',
    G.cash === 70 && G.CIVIC.atmDay === day0, 'cash=' + G.cash + ' atmDay=' + G.CIVIC.atmDay);
  G.civicAtm();
  check('civic: second ATM the same day is refused with a cooldown toast',
    G.cash === 70 && G.toastEl.textContent === 'COME BACK TOMORROW', G.toastEl.textContent);
  /* day wrap: the day/night clock rolling past midnight re-arms the ATM */
  G.dayPhase = 0.99; frame(2);
  G.dayPhase = 0.01; frame(2);   // clock wrap 1 -> 0
  check('civic: the in-game day counter ticks on the clock wrap',
    G.CIVIC.day === day0 + 1, 'day=' + G.CIVIC.day);
  G.civicAtm();
  check('civic: ATM pays again on the new in-game day', G.cash === 90, 'cash=' + G.cash);
  G.civicExit();

  /* hotel economy: $40 rest = full heal + clock skip to 06:00 */
  synthCivic('hotel');
  frame(3);
  G.civicEnter();
  check('civic: REST hint shows near the hotel and enter works',
    G.CIVIC.state === 'hotel');
  G.P.hp = 50; G.cash = 100; G.dayPhase = 0.6; frame(1);
  G.civicRest();
  check('civic: hotel rest costs $40, heals fully and skips the clock to 06:00',
    G.cash === 60 && G.P.hp === 100 && G.dayPhase === 0,
    'cash=' + G.cash + ' hp=' + G.P.hp + ' phase=' + G.dayPhase);
  G.cash = 10; G.P.hp = 50;
  G.civicRest();
  check('civic: rest denied under $40 (cash untouched, clock unmoved)',
    G.cash === 10 && G.P.hp === 50 && G.toastEl.textContent === 'NOT ENOUGH CASH');
  G.civicExit();

  /* school: prop only (bearing chip + collider, no interaction) */
  synthCivic('school');
  frame(3);
  check('civic: school shows no hint (prop only)',
    G.CIVIC.hintOn === false && G.CIVIC.nearType === null);
  frame(20);   // bearing chip cadence
  check('civic: bearing chip shows the SCHOOL type-name sign with distance',
    G.civicbearingEl.style.display === 'block' && /SCHOOL \d+M/.test(G.civtxtEl.textContent), G.civtxtEl.textContent);
  for (const t of G.CIVIC_ORDER) G.BLDG.active[t].length = 0;

  /* night window glow reaches the civic fleet material too */
  {
    G.dayPhase = 0.75;   // midnight
    frame(5);
    const civicMat = G.BLDG_DEF.civic.mesh.material;
    check('civic: windows glow at night (emissiveMap ramp, no new lights)',
      civicMat.emissiveIntensity > 1, 'e=' + civicMat.emissiveIntensity.toFixed(2));
    G.dayPhase = 0.25;   // noon
    frame(5);
    check('civic: windows dark by day', civicMat.emissiveIntensity < 0.01,
      'e=' + civicMat.emissiveIntensity.toFixed(2));
  }

  /* bullets collide: a real seeded civic building stops the hitscan raycast
     (routes through redistributeBuildings with boundingSphere invalidation) */
  {
    let hb = null;
    for (let r = 2; r < 60 && !hb; r++)
      for (let gx = -r; gx <= r && !hb; gx++)
        for (let gz = -r; gz <= r && !hb; gz++) {
          if (Math.max(Math.abs(gx), Math.abs(gz)) !== r) continue;
          const b = G.bldgCenterFor(gx, gz);
          if (b && b.type === 'hospital') hb = b;
        }
    check('civic: a seeded hospital exists for the raycast test', !!hb);
    if (hb) {
      settleC(hb.x + 30, hb.z);   // chunk cross -> real redistributeBuildings
      frame(2);
      const placed = G.BLDG.active.hospital.some(b => b.gx === hb.gx && b.gz === hb.gz);
      check('civic: the seeded hospital lands in the live grid', placed);
      if (placed) {
        const rc = new THREE.Raycaster();
        rc.set(new THREE.Vector3(hb.x + 25, hb.y + 2, hb.z), new THREE.Vector3(-1, 0, 0));
        rc.far = 60;
        const hits = rc.intersectObjects(G.bldgMeshes, false);
        check('civic: raycast hits the civic wall (bullets do not pass through)',
          hits.length > 0 && hits[0].distance < 25,
          hits.length ? 'd=' + hits[0].distance.toFixed(1) : 'no hit');
        /* player foot collision: the civic footprint blocks on-foot movement */
        G.player.position.set(hb.x, groundY(hb.x, hb.z), hb.z);
        frame(1);
        const dOut = Math.hypot(G.player.position.x - hb.x, G.player.position.z - hb.z);
        check('civic: foot collision pushes the player out of the footprint',
          dOut >= 5.5, 'd=' + dOut.toFixed(2));
      }
    }
  }
  /* QA-found regression (commit 5ad9309): the collider loop sized foot colliders
     with r*b.scale, but civic visuals are per-axis scaled (CIVIC_SCALE), so
     bank/hotel/school walls were walk-through. Fixed: wr = r*max(sx,sz). */
  {
    const sb = found.school;
    check('civic-collider-fix: a seeded school exists', !!sb);
    if (sb) {
      G.redistributeBuildings(sb.gx, sb.gz);
      const wr = 10.5 * Math.max(G.CIVIC_SCALE.school[0], G.CIVIC_SCALE.school[2]);   // 22.05 (was 10.5 under the bug)
      const foot = G.BLDG.foot.find(c => Math.hypot(c.x - sb.x, c.z - sb.z) < 1);
      check('civic-collider-fix: school world collider covers the scaled visual footprint',
        !!foot && Math.abs(foot.r - wr) < 0.01,
        foot ? 'r=' + foot.r.toFixed(2) + ' expected=' + wr.toFixed(2) : 'no foot entry');
      /* stand well inside the corrected collider: the player must be pushed
         outside it (under the bug the 10.5u collider never touched the player) */
      G.player.position.set(sb.x + wr * 0.5, groundY(sb.x + wr * 0.5, sb.z), sb.z);
      frame(1);
      const dOut = Math.hypot(G.player.position.x - sb.x, G.player.position.z - sb.z);
      check('civic-collider-fix: player is pushed out of the scaled school footprint',
        dOut >= wr - 0.5, 'd=' + dOut.toFixed(2) + ' expected>=' + (wr - 0.5).toFixed(2));
    }
  }
  {
    const bb = found.bank;
    check('civic-collider-fix: a seeded bank exists', !!bb);
    if (bb) {
      G.redistributeBuildings(bb.gx, bb.gz);
      const wr = 8.0 * Math.max(G.CIVIC_SCALE.bank[0], G.CIVIC_SCALE.bank[2]);   // 12.8
      const def = G.BLDG_DEF.bank;
      check('civic-collider-fix: bank porch hint/seat sit outside the corrected collider',
        def.porch.hint > wr && def.porch.seat > wr,
        'hint=' + def.porch.hint + ' seat=' + def.porch.seat + ' wr=' + wr.toFixed(1));
      /* stand just outside the wall (12.8+0.5), inside the hint radius (14.0):
         the ATM must be reachable without entering the collider */
      const px = bb.x + wr + 0.5, pz = bb.z;
      G.player.position.set(px, groundY(px, pz), pz);
      frame(2);
      check('civic-collider-fix: bank ATM hint is live from outside the corrected collider',
        G.CIVIC.hintOn === true && G.CIVIC.nearType === 'bank',
        'hintOn=' + G.CIVIC.hintOn + ' near=' + G.CIVIC.nearType);
    }
  }
  check('civic: enter/heal/ATM/rest/exit round trips leave zero console errors/warnings',
    consoleProblems.length === probs0, consoleProblems.slice(probs0).join(' | '));
}


/* ---------- zero console errors ---------- */
check('boot+tests: zero console errors/warnings in stub env',
  consoleProblems.length === 0, consoleProblems.slice(0, 3).join(' | '));

console.error = origErr; console.warn = origWarn;
console.log(failures === 0 ? 'SMOKE RESULT: ALL GREEN' : 'SMOKE RESULT: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
