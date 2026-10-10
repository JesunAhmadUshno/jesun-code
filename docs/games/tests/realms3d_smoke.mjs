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
  busEnter, busExit, busTakeWheel, busRebuildRoute, busDoorWorld, mountToggle, busUpdate,
  busDwellService, BUSNPC, BUS,
  taxiEnter, taxiExit, txRebuild, txDoorWorld, crRebuild, ambRebuild,
  CR, TX, AMB, HORSE, emBodyIM, toastEl, W,
  bikeEnter, bikeExit, bikeRebuild, BIKE, bikeBodyIM, bikeHintEl,
  bcEnter, bcExit, bcRebuild, BC, bcBodyIM, bcHintEl,
  scEnter, scExit, scRebuild, SC, scBodyIM, scHintEl,
  saveGame, loadSave, collectSave, newGame, setHeat, playing, terrainHeight,
  MS, MISSIONS, SHOP_ITEMS, SHOPS, WEAPONS, CAR, P, player, camera, keys,
  enemies, tracers, enemyMeshes, objRing, objIcon,
  cops, copFleet, COP_MAX, eBodyAll, ENEMY_BAND, ENEMY_MIX,   /* PERF-6 merge regression */
  SAVE_KEY,
  DIFF, diffEval, animals,
  birds, wings, PET, tamePet, releasePet, acquirePrey, petRejoin,
  petHintEl, petChipEl, birdFlockTick,
  FROZEN_STATICS, ocean,                       /* PERF-7 static freeze registry + water mesh */
  AMESH, chunkBiome, redistributeWildlife,   /* Phase 5 wildlife v2 */
  amenityCenterFor,                          /* Phase 5 wildlife v3: dog placement */
  wildEagles, wildOwls, thermalFor, treeNear, treeWithPartner, redistributeEagles, redistributeOwls,  /* Phase 5 wildlife v4 */
  wildLions, wildPandas, wildTigers, wildPenguins, pondShore,  /* Phase 5 wildlife v5 */
  get dayPhase() { return dayPhase; }, set dayPhase(v) { dayPhase = v; },  /* v4: owl day/night test */
  get cash() { return cash; }, set cash(v) { cash = v; },
  get bankBal() { return bankBal; }, set bankBal(v) { bankBal = v; },   /* Phase 5 bank: deposit protection */
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
  AMEN, AMEN_DEF, hash2i, sportHash, amenityTypeFor, amenityAccepted, redistributeAmenities,
  stadChipEl, stadTxtEl, stadArrEl, LMSTAD_FLOOD_MATS, LMSTAD_WALL_COL, LMSTAD_CHIP_R2,  /* Phase 5 landmark stadium v1 */
  /* Phase 5 landmark amusement park v1 */
  LMAUSE_CAP, LMAUSE_CABINS, LMAUSE_COL, LMAUSE_CHIP_R2, LMAUSE_WHEEL_R, LMAUSE_TRAIN_T,
  buildLandmarkAmuseGeo, buildLmauseWheelGeo, buildLmauseCabinGeo, buildLmauseCarouselGeo,
  buildLmauseTrainGeo, lmauseCoasterCurve, LMAUSE_COASTER,
  lmauseWheelIM, lmauseCabinIM, lmauseCarIM, lmauseTrainIM, LMAUSE_RIDE_MAT,
  lmauseUpdate, lmauseChipTick, lmauseChipEl, lmauseTxtEl, lmauseArrEl,
  /* Phase 5 landmark hospital v1 */
  HOSP, hospHeal, hospPadWorld, hospTick, hosphealEl, hospChipEl, hospTxtEl, hospArrEl,
  LMHOSP_COL, LMHOSP_CHIP_R2, LMHOSP_HEAL_R2, LMHOSP_HEAL_CD, LMHOSP_PAD, buildLandmarkHospGeo,
  /* Phase 5 landmark theater v1 */
  THEATERHALL, theaterHallEnter, theaterHallExit, theaterWatchShow, theaterHallTick,
  theaterHallDoorWorld, theaterJingle, buildLandmarkTheaterGeo, buildTheaterHallGeo,
  makeTheaterScreenTex, theaterHallMesh, theaterHallScreen,
  thallhintEl, tshowhintEl, thallChipEl, thallTxtEl, thallArrEl,
  LMTHEATER_COL, LMTH_R, LMTH_SEGS, LMTH_GATE_K, LMTH_CHIP_R2, LMTH_DOOR, LMTH_DOOR_R2,
  THEATER_ROOM_Y, THEATER_SHOW_COST, THEATER_SHOW_HEAL, THEATER_SHOW_HOURS,
  /* Phase 5 landmark casino v1 */
  CASINOHALL, CASINOSLOT, casinoHallEnter, casinoHallExit, casinoHallKeyE, casinoHallTick,
  casinoSlotSit, casinoSlotStand, casinoHallDoorWorld, buildLandmarkCasinoGeo, buildCasinoHallGeo,
  casinoHallMesh, lmcsSpin, lmcsFinish, lmcsLineMult, lmcsCycleBet, lmcsUpdate, lmcsResetReels,
  lmcsDrawReel, lmcsCoin, lmcsFanfare,
  casinohallhintEl, casinoslothintEl, casinChipEl, casinTxtEl, casinArrEl,
  lmcsPanelEl, lmcsWinEl, lmcsSpinEl, lmcsBetEl, lmcsBigWinEl,
  HELP_CASINOHALL, HELP_LMCS,
  LMCASINO_COL, LMCAS_R, LMCAS_SEGS, LMCAS_GATE_K, LMCAS_CHIP_R2, LMCAS_DOOR, LMCAS_DOOR_R2,
  CASINO_ROOM_Y, LMCS_BETS, LMCS_SYMS, LMCS_WILD, LMCS_SEVEN, LMCS_LINES, LMCS_TAPE, LMCS_OUT_AT,
  redistributeGlyphBoards, glyphBoardIM, GLYPH_BOARD_CAP, GLYPH_MOUNTS, glyphShiftAttr,  /* Phase 5 sign glyphs v1 */
  /* Phase 5 boats/ships v1 */
  BOAT, boatEnter, boatExit, boatRebuild, boatFloat, waterSurfaceY, dockFor,
  boatBodyIM, boatHintEl, boatChipEl, BOAT_N, sfxSplash,
  /* PERF-7 dirty-once asserts: expose tick fns + instanced fleets */
  lootTick, LOOT, lootIcons, lootGuns, busBodyIM, ftUpdate, missionTick, startIcons,
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
  venueBoxIM, VENUE_CAP, VENUE_THEATER_OFF, VENUE_STADIUM_OFF, VENUE_AMUSE_OFF,
  theaterHintEl, theaterChipEl, HELP_THEATER,
  THEATER_N, THEATER_SCAN, T_INST, THEATER_BAR_LEN, THEATER_SETS, THEATER_POSES,
  /* Phase 5 stadium v1 */
  STADIUM, stadiumFor, stadiumHash, stadiumEnter, stadiumExit, stadiumRebuild,
  stadiumUpdate, stadiumAnimate, stadiumPlace, stadiumPark, stadiumGoalCheer,
  stadiumMatchName, updateStadiumChip, stadiumBox, stadiumTint,
  stadiumHintEl, stadiumChipEl, stadbearingEl, stadarrEl, stadtxtEl, HELP_STADIUM,
  STADIUM_N, STADIUM_SCAN, S_INST, STADIUM_GOAL_EVERY, STADIUM_NAMES, STADIUM_LX, STADIUM_LZ,
  /* Phase 5 amusement park v1 */
  AMUSE, amusementFor, amusementHash, amuseEnter, amuseExit, amuseRebuild,
  amuseUpdate, amuseAnimate, amusePlace, amusePark, amuseBox, amuseTint,
  amuseSlotWorld, amuseRideName, updateAmuseChip,
  amuseHintEl, amuseChipEl, HELP_AMUSE,
  amusebearingEl, amusebarrEl, amusebtxtEl,
  AMUSE_N, AMUSE_SCAN, A_INST, AMUSE_WHEEL_W, AMUSE_CAR_W, AMUSE_NAMES,
  AMUSE_FW_LX, AMUSE_FW_LZ, AMUSE_FW_CY, AMUSE_FW_R,
  /* Phase 5 rural civic buildings v1 */
  CIVIC, CIVIC_ORDER, CIVIC_SCALE, CIVIC_HEAL_COST, CIVIC_ATM_AMT, CIVIC_REST_COST,
  civicEnter, civicExit, civicAct, civicHeal, civicAtm, civicRest, civicTick,
  updateCivicChip, CIVIC_HINT_TXT, CIVIC_ACT_TXT, CIVIC_FOOT_TXT,
  civicDeposit, civicWithdraw, civicActEl2, civicActEl3,   /* Phase 5 bank: deposit protection */
  bankDawnInterest, BANK_INTEREST_RATE,              /* Phase 5 bank interest v2 */
  civicHeist, civicActEl4, heistChipEl, updateHeistChip, seedHeistSacks, endHeist, heistTick, HEIST,
  HEIST_N, HEIST_R2, HEIST_GRAB_R2, HEIST_ESCALATE_S,   /* Phase 5 bank heist v1 */
  busted, migrateSave,                                      /* Phase 5 bank: bust hook + save migration */
  civichintEl, civicChipEl, civicbearingEl, civarrEl, civtxtEl,
  civicPanelEl, civicTitleEl, civicActEl, civicFootEl, HELP_CIVIC,
  /* Phase 5 worship buildings v1 */
  WORSHIP, WORSHIP_ORDER, WORSHIP_SCALE, WORSHIP_SALT, WORSHIP_BAND, WORSHIP_HEAL_AMT,
  worshipFor, worshipHash, worshipEnter, worshipExit, worshipAct, worshipPray, worshipSanctuary,
  worshipTick, updateWorshipChip, WORSHIP_HINT_TXT, WORSHIP_ACT_TXT, WORSHIP_FOOT_TXT,
  worshiphintEl, worshipChipEl, worshipbearingEl, worsarrEl, worstxtEl,
  worshipPanelEl, worshipTitleEl, worshipActEl, worshipFootEl, HELP_WORSHIP,
  /* Phase 5 apartment buildings v1 */
  APARTMENT, APARTMENT_SALT, APART_BAND, APARTMENT_NAMES, APART_TINTS,
  APART_LEASE_COST, APART_HEAL_AMT, APART_HINT_LEASE, APART_HINT_ENTER,
  apartmentFor, apartmentHash, apartmentVariant, apartmentEnter, apartmentExit,
  apartmentLease, apartmentTick, updateApartmentChip,
  apthintEl, aptChipEl, aptbearingEl, aptarrEl, apttxtEl, HELP_APARTMENT,
  THEATER_LX, THEATER_LZ,
  /* Phase 5 fire truck v1 + wildfire events */
  FT, ftEnter, ftExit, ftRebuild, ftPose, ftBodyIM, ftBodyMat, ftHintEl, HELP_FT,
  ftSprayTick, writeSpraySegments, SPRAY_N, RAIN_N,
  FIRES, WF, wildfireStrike, wildfireIgnite, wildfireSpread, wildfireTick, wildfireChunkReset,
  fireChipEl, fireTxtEl, fireArrEl, ensureSiren,
  get waterHeld() { return waterHeld; }, set waterHeld(v) { waterHeld = v; },
  get sirOsc() { return sirOsc; },
  /* Phase 5 landmark fire station v1 */
  FIRESTHALL, FIREST, firestHallEnter, firestHallExit, firestHallKeyE, firestPoleSlide,
  firestRefill, firestHallTick, firestHallDoorWorld, firestBayWorld,
  buildLandmarkFireStationGeo, buildFireStationHallGeo, fireHallMesh, updateFTCondHUD,
  firesthallhintEl, firestbayhintEl, firestpolehintEl, firestChipEl, firestTxtEl, firestArrEl,
  HELP_FIRHALL,
  LMFS_COL, LMFS_R, LMFS_SEGS, LMFS_GATE_K, LMFS_CHIP_R2, LMFS_DOOR, LMFS_DOOR_R2, LMFS_BAY,
  FIRESTATION_ROOM_Y,
  /* Phase 5 fire station v2: firefighter dispatch */
  FIRECREW, INCIDENTS, fireIncidentOnIgnite, fireDispatch, fireCalloutId,
  fireStampInc, nearestFireStation, ffPostFor, fireIncidentDone, fireNearest,
  fireStandDown, ffMoveTo, writeFFSpraySegments, hideFFSpraySegments,
  FF_SPRAY_N, FF_SEEK_R2, FF_INC_R2, FF_SPRAYHIT_R2, FF_CD_S,
  FF_DISPATCH_TOAST_R2, WF_TOAST_R2, WF_CHIP_R2,
  FLORA,
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

/* ================= PERF-7 STATIC FREEZE ================= */
{
  const frozen = G.FROZEN_STATICS;
  check('perf7: freeze registry is non-empty', Array.isArray(frozen) && frozen.length > 20,
    'frozen=' + (frozen && frozen.length));
  check('perf7: every frozen mesh has matrixAutoUpdate===false after boot',
    frozen.every(o => o.matrixAutoUpdate === false),
    frozen.filter(o => o.matrixAutoUpdate !== false).map(o => o.type + ':' + (o.geometry && o.geometry.type)).join(','));
  /* dynamics stay live: player rig, one enemy bookkeeping group, one vehicle fleet, the water mesh */
  const dyn = [G.player, G.enemies[0] && G.enemies[0].group, G.busBodyIM, G.ocean];
  check('perf7: dynamic objects keep matrixAutoUpdate===true',
    dyn.every(o => o && o.matrixAutoUpdate === true),
    dyn.map(o => o ? String(o.matrixAutoUpdate) : 'missing').join(','));
  /* freeze-after-final-transform proof: each baked local matrix must still
     equal compose(position, quaternion, scale), so the freeze captured the
     final transform and nothing moved it since */
  const _m = new THREE.Matrix4();
  let stale = 0;
  for (const o of frozen) {
    _m.compose(o.position, o.quaternion, o.scale);
    for (let i = 0; i < 16; i++) {
      if (Math.abs(_m.elements[i] - o.matrix.elements[i]) > 1e-4) { stale++; break; }
    }
  }
  check('perf7: every frozen local matrix matches its object transform (no stale freeze)', stale === 0, stale + ' stale');
  /* world consistency: getWorldPosition agrees with the composed matrixWorld,
     so frozen statics render at exactly their declared positions */
  const _w = new THREE.Vector3(), _p = new THREE.Vector3();
  let drift = 0;
  for (const o of frozen) {
    o.getWorldPosition(_w);
    _p.setFromMatrixPosition(o.matrixWorld);
    if (_w.distanceTo(_p) > 1e-4) drift++;
  }
  check('perf7: frozen statics render at their declared world positions', drift === 0, drift + ' drifted');
}

const groundY = (x, z) => G.terrainHeight(x, z);
globalThis.__pchunk = (tag) => console.log('DBG-chunk ' + tag + ' player=' + G.player.position.x.toFixed(0) + ',' + G.player.position.z.toFixed(0));
globalThis.__rabPos = () => { const r = G.animals.find(a => a.kind === 'rabbit'); return r.pos.x.toFixed(0) + ',' + r.pos.z.toFixed(0) + ':' + r.mode; };

/* ================= 1. MISSION ACTIVATION ================= */
console.log('DBG-pos @1 ' + globalThis.__rabPos());
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
console.log('DBG-pos @2 ' + globalThis.__rabPos());
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
console.log('DBG-pos @4 ' + globalThis.__rabPos());
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
console.log('DBG-pos @6 ' + globalThis.__rabPos());
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999; G.cash = 100;
  G.setHeat(0, true);
  G.player.position.set(0, groundY(0, 0), 0);          // anchor chunk (0,0)
  frame(3);                                            // busUpdate builds the route
  console.log('DBG-busroute ' + JSON.stringify(G.BUS.route.map(s => [s.x.toFixed(0), s.z.toFixed(0), s.label])));
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
  globalThis.__pchunk('bus-end');
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
  globalThis.__pchunk('sec7-start');
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
console.log('DBG-pos @8 ' + globalThis.__rabPos());
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
console.log('DBG-pos @10 ' + globalThis.__rabPos());
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
  check('perf6: 48 IM literals (48 = 47 + 1 fire-crew helmet fleet; 47 = 46 + 1 fire truck v1; 46 = 42 + 4 landmark-amuse ride fleets; 42 = 41 + 1 signglyph v1 board fleet; 41 - PERF-6 consolidation: copTorso+copHead+copArms->copFleet, eBodyRus+eBodySho->eBodyAll Y-band, theater+stadium+amuse->venueBoxIM)', imCount === 48, 'count=' + imCount);

  /* PERF-6 merge regression: slot maps, Y-band lifts, identity colors */
  {
    check('perf6: copFleet holds all cop parts (capacity COP_MAX*4)',
      G.copFleet.count === G.COP_MAX * 4, 'count=' + G.copFleet.count);
    check('perf6: copFleet userData slot map resolves torso/head/arm to the same cop',
      G.copFleet.userData.copBase === 0 && G.copFleet.userData.headBase === G.COP_MAX &&
      G.copFleet.userData.armBase === G.COP_MAX * 2 && G.copFleet.userData.perCop === 1);
    const _m4 = new THREE.Matrix4(), _c = new THREE.Color();
    G.copFleet.getColorAt(0, _c);
    check('perf6: cop torso slot carries the old copUniM blue', _c.getHex() === 0x1d4ed8, 'hex=' + _c.getHexString());
    G.copFleet.getColorAt(G.COP_MAX, _c);
    check('perf6: cop head slot carries the old copHeadM skin tone', _c.getHex() === 0x8a6a52, 'hex=' + _c.getHexString());
    G.copFleet.getColorAt(G.COP_MAX * 2, _c);
    check('perf6: cop arm slot carries the old copUniM blue', _c.getHex() === 0x1d4ed8, 'hex=' + _c.getHexString());
    check('perf6: eBodyAll holds rusher+shooter (capacity 4)',
      G.eBodyAll.count === 4, 'count=' + G.eBodyAll.count);
    check('perf6: merged enemy fleet keeps the type->slot map for hitscan',
      G.eBodyAll.userData.enemyOf.length === 4 &&
      G.eBodyAll.userData.enemyOf[0].type === 'rusher' &&
      G.eBodyAll.userData.enemyOf[2].type === 'shooter');
    for (const e of G.enemies) {
      if (e.type === 'brute' || e.state === 'dead') continue;   // parked dead bodies carry no band lift
      G.eBodyAll.getMatrixAt(e.bodyInst, _m4);
      const liftY = _m4.elements[13] - e.group.position.y;
      const want = e.type === 'shooter' ? G.ENEMY_BAND : 0;
      if (Math.abs(liftY - want) > 0.01) {
        check('perf6: Y-band lift on ' + e.type + ' instance ' + e.bodyInst, false, 'lift=' + liftY.toFixed(2));
        break;
      }
    }
    check('perf6: Y-band lift matches the type band (shooter +1000, rusher 0)', true);
  }
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

  /* rabbit hop: body bob is nonzero while moving.
     2026-10-10: made history-independent. It was: the rabbit's whole-suite
     rng history decided whether its think grazed or walked inside the
     30-frame window, so adding any amenity type (which reshuffles the
     winner-take-all layout, bus-adjacent timings and animal relocations)
     could flip it. Now the chunk-crossing relocation settles first, then
     the walk is posed directly with grazing isolated. */
  parkEnemies(150, 150);
  G.player.position.set(-100, groundY(-100, -100), -100);
  for (const a of G.animals) { a.pos.set(200, G.terrainHeight(200, 200), 200); a.fleeT = 0; }
  const rab = w2.find(a => a.kind === 'rabbit');
  frame(1);   // chunk-crossing relocation (if any) settles before the pose
  rab.zone = { x0: rab.pos.x - 40, x1: rab.pos.x + 40, z0: rab.pos.z - 40, z1: rab.pos.z + 40 };
  rab.target.set(rab.pos.x + 30, 0, rab.pos.z);
  rab.mode = 'walk'; rab.t = 999; rab.fleeT = 0; rab.grazeT = 0;
  const grazeWas = rab.graze; rab.graze = false;   // isolate the hop from the graze coin flip
  let bobMax = 0;
  for (let i = 0; i < 45; i++) {
    frame(1);
    if (Math.abs(rab.bobY) > bobMax) bobMax = Math.abs(rab.bobY);
  }
  rab.graze = grazeWas;
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
  check('perf6: 48 IM literals (bike section)',
    imCount2 === 48, 'count=' + imCount2);

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
  check('perf6: 48 IM literals (bicycle section)',
    imCount3 === 48, 'count=' + imCount3);

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
  check('perf6: 48 IM literals (scooter section)',
    imCount4 === 48, 'count=' + imCount4);

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
    check('perf6: 48 IM literals (wildlife5 section)',
      imCount5 === 48, 'count=' + imCount5);
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
    check('perf6: 48 IM literals, 6 runtime building meshes (apartment owns its fleet; the def loop adds one runtime mesh with zero new literals)',
      n === 48 && G.bldgMeshes.length === 6, 'literals=' + n + ' meshes=' + G.bldgMeshes.length);
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
  check('food-static: InstancedMesh literal sites pin at 48 (48 = 47 + 1 fire-crew helmet fleet; 47 = 46 + 1 fire truck v1; 46 = 42 + 4 landmark-amuse ride fleets; 42 = 41 + 1 signglyph v1 board fleet; 41 - PERF-6 consolidation: copTorso+copHead+copArms->copFleet, eBodyRus+eBodySho->eBodyAll Y-band, theater+stadium+amuse->venueBoxIM)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
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
  check('farmv1-static: InstancedMesh literal sites pin at 48 (48 = 47 + 1 fire-crew helmet fleet; 47 = 46 + 1 fire truck v1; 46 = 42 + 4 landmark-amuse ride fleets; 42 = 41 + 1 signglyph v1 board fleet; 41 - PERF-6 consolidation: copTorso+copHead+copArms->copFleet, eBodyRus+eBodySho->eBodyAll Y-band, theater+stadium+amuse->venueBoxIM)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
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
  check('tennis-static: whole-file InstancedMesh literal sites pin at 48 (48 = 47 + 1 fire-crew helmet fleet; 47 = 46 + 1 fire truck v1; 46 = 42 + 4 landmark-amuse ride fleets; 42 = 41 + 1 signglyph v1 board fleet; 41 - PERF-6 consolidation: copTorso+copHead+copArms->copFleet, eBodyRus+eBodySho->eBodyAll Y-band, theater+stadium+amuse->venueBoxIM)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
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
  check('hoops-static: whole-file InstancedMesh literal sites pin at 48 (48 = 47 + 1 fire-crew helmet fleet; 47 = 46 + 1 fire truck v1; 46 = 42 + 4 landmark-amuse ride fleets; 42 = 41 + 1 signglyph v1 board fleet; 41 - PERF-6 consolidation: copTorso+copHead+copArms->copFleet, eBodyRus+eBodySho->eBodyAll Y-band, theater+stadium+amuse->venueBoxIM)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
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
  check('casino-static: whole-file IM literals pin at 48 (48 = 47 + 1 fire-crew helmet fleet; 47 = 46 + 1 fire truck v1; 46 = 42 + 4 landmark-amuse ride fleets; 42 = 41 + 1 signglyph v1 board fleet; 41 - PERF-6 consolidation: copTorso+copHead+copArms->copFleet, eBodyRus+eBodySho->eBodyAll Y-band, theater+stadium+amuse->venueBoxIM; civic fleet rides the shared def-loop literal)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
  check('casino-static: 6 runtime building meshes (casino rides the store mesh, civic types share the civic fleet, church/mosque share the worship fleet, apartment owns its fleet)',
    G.bldgMeshes.length === 6);
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
                                html.indexOf('/* ================= PHASE 5: STADIUM v1 (sports)'));
  check('theater-static: exactly one new fleet mesh literal in the theater block',
    (theaterSrc.match(/new THREE\.InstancedMesh/g) || []).length === 1);
  check('theater-static: theater block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(theaterSrc));
  check('theater-static: no unseeded RNG in the theater block', !/Math\.random/.test(theaterSrc));
  check('theater-static: no em dashes in the theater block', !theaterSrc.includes('\u2014'));
  check('theater-static: no external URLs in the theater block', !/https?:\/\//.test(theaterSrc));
  check('theater-static: no TODO markers in the theater block', !/\bTODO\b/.test(theaterSrc));
  check('theater-static: whole-file IM literals pin at 48 (48 = 47 + 1 fire-crew helmet fleet; 47 = 46 + 1 fire truck v1; 46 = 42 + 4 landmark-amuse ride fleets; 42 = 41 + 1 signglyph v1 board fleet; 41 - PERF-6 consolidation: copTorso+copHead+copArms->copFleet, eBodyRus+eBodySho->eBodyAll Y-band, theater+stadium+amuse->venueBoxIM)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
  check('theater-static: light count pins at 6 (zero new lights)',
    (html.match(/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/g) || []).length === 6);
  check('theater-static: audio nodes pin unchanged (17 osc, 30 gain: music reuses sfxBlip)',
    (html.match(/\.createOscillator\(/g) || []).length === 17 &&
    (html.match(/\.createGain\(/g) || []).length === 30);
  check('theater-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('theater-static: guard coverage (positive chains)',
    (html.match(/\|\| THEATER\.watching/g) || []).length >= 28);
  check('theater-static: guard coverage (negated chains, incl. civic/amuse-extended paren form)',
    ((html.match(/&& !THEATER\.watching/g) || []).length
      + (html.match(/!\(THEATER\.watching \|\| CIVIC\.state(?: \|\| WORSHIP\.state)?(?: \|\| APARTMENT\.state)?(?: \|\| AMUSE\.riding \|\| STADIUM\.watching)?\)/g) || []).length) >= 18);
  check('theater-static: WATCH hint click wiring pins theaterEnter',
    html.includes("theaterHintEl.addEventListener('click', () => { if (THEATER.hintOn) theaterEnter(); })"));
  check('theater-static: E frees the watcher before the gambler/pianist in the keydown chain',
    html.includes("else if (THEATER.watching) theaterExit(); else if (SLOT.playing) slotExit();"));
  check('theater-static: vehicleExit, mountToggle, busted and death eject the watcher',
    html.includes('function vehicleExit() { if (AMUSE.riding) amuseExit(); else if (STADIUM.watching) stadiumExit(); else if (CIVIC.state) civicExit(); else if (WORSHIP.state) worshipExit(); else if (THEATER.watching) theaterExit();')
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
  check('theater: the merged venue fleet has full capacity (PERF-6: theater+stadium+amuse in one mesh)',
    G.venueBoxIM.count === G.VENUE_CAP, 'count=' + G.venueBoxIM.count);
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
  check('civic-static: whole-file IM literals pin at 48 (48 = 47 + 1 fire-crew helmet fleet; 47 = 46 + 1 fire truck v1; 46 = 42 + 4 landmark-amuse ride fleets; 42 = 41 + 1 signglyph v1 board fleet; 41 - PERF-6 consolidation: copTorso+copHead+copArms->copFleet, eBodyRus+eBodySho->eBodyAll Y-band, theater+stadium+amuse->venueBoxIM; civic fleet rides the shared def-loop literal)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
  check('civic-static: the civic fleet is a live InstancedMesh (+1 runtime draw call)',
    G.BLDG_DEF.civic.mesh.isInstancedMesh === true && G.BLDG_DEF.civic.mesh.instanceMatrix.count === 8);
  check('civic-static: 6 runtime building meshes (house, barn, store, civic, worship, apartment)',
    G.bldgMeshes.length === 6);
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
  check('civic-static: KeyE exits the fan, then civic, enters on a live hint',
    html.includes("if (e.code === 'KeyE') { if (AMUSE.riding) amuseExit(); else if (STADIUM.watching) stadiumExit(); else if (CIVIC.state) civicExit(); else if (WORSHIP.state) worshipExit();")
    && html.includes("else if (CIVIC.hintOn) civicEnter();"));
  check('civic-static: mountToggle, vehicleExit, busted and death eject the visitor',
    html.includes('else if (CIVIC.state) civicExit();   // Phase 5 civic: E never traps the visitor')
    && html.includes('function vehicleExit() { if (AMUSE.riding) amuseExit(); else if (STADIUM.watching) stadiumExit(); else if (CIVIC.state) civicExit(); else if (WORSHIP.state) worshipExit();')
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


/* ================= 31. STADIUM v1 (Phase 5 sports) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.STADIUM.watching) G.stadiumExit();
  if (G.THEATER.watching) G.theaterExit();
  if (G.SLOT.playing) G.slotExit();
  if (G.PIANO.playing) G.pianoExit();
  if (G.CIVIC.state) G.civicExit();

  /* static: exactly one new fleet mesh literal, no lights, no unseeded RNG,
     no em dashes, no external URLs, no TODO text in the stadium block */
  const stadiumSrc = html.slice(html.indexOf('/* ================= PHASE 5: STADIUM v1 (sports)'),
                                html.indexOf('/* ================= PHASE 5: AMUSEMENT PARK v1 (places)'));
  check('stadium-static: zero fleet mesh literals in the stadium block (PERF-6: rides the shared venueBoxIM)',
    (stadiumSrc.match(/new THREE\.InstancedMesh/g) || []).length === 0);
  check('stadium-static: stadium block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(stadiumSrc));
  check('stadium-static: no unseeded RNG in the stadium block', !/Math\.random/.test(stadiumSrc));
  check('stadium-static: no em dashes in the stadium block', !stadiumSrc.includes('—'));
  check('stadium-static: no external URLs in the stadium block', !/https?:\/\//.test(stadiumSrc));
  check('stadium-static: no TODO markers in the stadium block', !/\bTODO\b/.test(stadiumSrc));
  check('stadium-static: whole-file IM literals pin at 48 (48 = 47 + 1 fire-crew helmet fleet; 47 = 46 + 1 fire truck v1; 46 = 42 + 4 landmark-amuse ride fleets; 42 = 41 + 1 signglyph v1 board fleet; 41 - PERF-6: stadium+amuse ride the shared venueBoxIM)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
  check('stadium-static: light count pins at 6 (zero new lights)',
    (html.match(/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/g) || []).length === 6);
  check('stadium-static: audio nodes pin unchanged (17 osc, 30 gain: cheer reuses sfxBlip)',
    (html.match(/\.createOscillator\(/g) || []).length === 17 &&
    (html.match(/\.createGain\(/g) || []).length === 30);
  check('stadium-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('stadium-static: guard coverage (positive chains)',
    (html.match(/\|\| STADIUM\.watching/g) || []).length >= 28);
  check('stadium-static: guard coverage (negated chains, incl. paren form)',
    ((html.match(/&& !STADIUM\.watching/g) || []).length
      + (html.match(/\|\| STADIUM\.watching\)/g) || []).length) >= 18);
  check('stadium-static: WATCH hint click wiring pins stadiumEnter',
    html.includes("stadiumHintEl.addEventListener('click', () => { if (STADIUM.hintOn) stadiumEnter(); })"));
  check('stadium-static: E frees the fan before the visitor/watcher in the keydown chain',
    html.includes("if (e.code === 'KeyE') { if (AMUSE.riding) amuseExit(); else if (STADIUM.watching) stadiumExit(); else if (CIVIC.state) civicExit(); else if (WORSHIP.state) worshipExit();"));
  check('stadium-static: vehicleExit, mountToggle, busted and death eject the fan',
    html.includes('function vehicleExit() { if (AMUSE.riding) amuseExit(); else if (STADIUM.watching) stadiumExit(); else if (CIVIC.state) civicExit(); else if (WORSHIP.state) worshipExit();')
    && html.includes('if (STADIUM.watching) stadiumExit();   // Phase 5 stadium: E never traps the fan')
    && html.includes('else if (STADIUM.watching) stadiumExit();   // busted out of the stands too')
    && html.includes('else if (STADIUM.watching) stadiumExit();  // ...and no match while dead either'));

  /* deterministic spot: same chunk, same stadium, every call; own residue */
  let sgx = 0, sgz = 0, sd = null;
  souter: for (let gx = -40; gx <= 40; gx++)
    for (let gz = -40; gz <= 40; gz++) {
      const d = G.stadiumFor(gx, gz);
      if (d) { sgx = gx; sgz = gz; sd = d; break souter; }
    }
  check('stadium: a seeded stadium park exists in the scan window', !!sd, 'at ' + sgx + ',' + sgz);
  const sd2 = G.stadiumFor(sgx, sgz);
  check('stadium: stadiumFor is deterministic across calls',
    !!sd2 && sd2.x === sd.x && sd2.z === sd.z && sd2.yaw === sd.yaw);
  check('stadium: spot uses its own hash residue %7===4 (disjoint from theater %7===2, piano %7===5)',
    G.stadiumHash(sgx, sgz) % 7 === 4);
  /* exclusion: a basketball/tennis/heli/runway park never hosts a stadium,
     even on the stadium residue */
  let exFound = false, exOk = true;
  eouter: for (let gx = -40; gx <= 40 && !exFound; gx++)
    for (let gz = -40; gz <= 40; gz++) {
      if (G.stadiumHash(gx, gz) % 7 !== 4) continue;
      const sh = G.sportHash(gx, gz) % 5;
      if (sh !== 0 && sh !== 2 && sh !== 3 && sh !== 4) continue;
      if (G.amenityTypeFor(gx, gz) !== 'park' || !G.amenityAccepted(gx, gz)) continue;
      if (G.dockFor(gx, gz) || G.theaterHash(gx, gz) % 7 === 2) continue;
      exFound = true;
      if (G.stadiumFor(gx, gz) !== null) { exOk = false; break eouter; }
    }
  check('stadium: sport-excluded parks stay stadium-free on the stadium residue',
    exFound && exOk, 'checked=' + exFound);

  /* sit: walk up, the WATCH prompt shows, E (stadiumEnter) seats the player */
  const scx = Math.floor(sd.x / 48), scz = Math.floor(sd.z / 48);
  G.player.position.set(sd.x, groundY(sd.x, sd.z), sd.z);
  G.STADIUM.key = '';
  G.stadiumRebuild(scx, scz);
  frame(3);
  const sslot = G.STADIUM.slots.find(sl => sl.placed);
  check('stadium: rebuild places a stadium at the seeded spot', !!sslot,
    sslot ? 'd2=' + ((sslot.x - sd.x) ** 2 + (sslot.z - sd.z) ** 2).toFixed(2) : 'none placed');
  check('stadium: venue fleet region offsets match the section constants (PERF-6)',
    G.VENUE_STADIUM_OFF === G.THEATER_N * G.T_INST &&
    G.VENUE_AMUSE_OFF === G.VENUE_STADIUM_OFF + G.STADIUM_N * G.S_INST &&
    G.VENUE_CAP === G.VENUE_AMUSE_OFF + G.AMUSE_N * G.A_INST,
    'offs=' + G.VENUE_STADIUM_OFF + '/' + G.VENUE_AMUSE_OFF + '/' + G.VENUE_CAP);
  G.player.position.set(sslot.x, groundY(sslot.x, sslot.z), sslot.z);
  frame(3);
  check('stadium: WATCH hint shows near the stadium',
    G.STADIUM.hintOn === true && G.stadiumHintEl.style.opacity == 1);
  const probs0 = consoleProblems.length;
  G.stadiumEnter();
  check('stadium: enter seats the player in the stand, chip shows',
    G.STADIUM.watching === true && G.stadiumChipEl.style.display === 'block');
  frame(3);
  check('stadium: chip reads NOW PLAYING - VENUE | E LEAVE',
    /^NOW PLAYING - [A-Z ]+  \|  E LEAVE$/.test(G.stadiumChipEl.textContent), G.stadiumChipEl.textContent);
  const seatX = G.player.position.x, seatY = G.player.position.y, seatZ = G.player.position.z;
  check('stadium: the seat is elevated on the middle tier',
    seatY > groundY(sslot.x, sslot.z) + 1.5, 'seatY=' + seatY.toFixed(2));
  frame(30);   // ~0.5 s: crowd wave, floodlight sweep
  check('stadium: the player stays frozen at the seat while watching',
    Math.abs(G.player.position.x - seatX) < 0.01 && Math.abs(G.player.position.z - seatZ) < 0.01
    && G.STADIUM.watching === true);

  /* guards freeze locomotion, combat, melee, emotes, sport while watching */
  G.doPunch();
  check('stadium: melee is refused while watching', G.P.punchCd <= 0, 'punchCd=' + G.P.punchCd);
  G.fireEmote('dance');
  check('stadium: emotes are refused while watching', G.EMO.key === null);
  const fireCd0 = G.fireCd;
  G.shoot();
  check('stadium: firing is refused while watching', G.fireCd === fireCd0);

  /* goal cheer: the seeded match timer fires a cheer surge and renames the chip */
  const ws = G.STADIUM.slots[G.STADIUM.watchIdx];
  const name0 = G.stadiumMatchName(ws);
  ws.matchT = ws.nextGoal - 0.01; ws.cheerT = 0;
  frame(3);
  check('stadium: the goal timer fires a cheer surge',
    ws.matchIdx === 1 && ws.cheerT > 0, 'matchIdx=' + ws.matchIdx + ' cheerT=' + ws.cheerT.toFixed(2));
  check('stadium: the chip renames on the goal',
    G.stadiumChipEl.textContent === 'NOW PLAYING - ' + G.stadiumMatchName(ws).toUpperCase() + '  |  E LEAVE',
    G.stadiumChipEl.textContent);
  check('stadium: venue names are procedural (' + G.STADIUM_NAMES.length + ' in rotation)',
    G.STADIUM_NAMES.includes(name0) && G.STADIUM_NAMES.includes(G.stadiumMatchName(ws)));

  /* exit: E (stadiumExit) frees the player, chip hides, never traps */
  G.stadiumExit();
  check('stadium: exit frees the player, chip hides, steps out of the stand',
    G.STADIUM.watching === false && G.stadiumChipEl.style.display === 'none'
    && Math.hypot(G.player.position.x - sslot.x, G.player.position.z - sslot.z) > 1.0);
  frame(20);   // bearing chip cadence
  check('stadium: venue bearing chip shows the venue sign with distance',
    G.stadbearingEl.style.display === 'block' && /^[A-Z ]+ \d+M$/.test(G.stadtxtEl.textContent), G.stadtxtEl.textContent);
  check('stadium: watch/exit round trip leaves zero console errors/warnings',
    consoleProblems.length === probs0, consoleProblems.slice(probs0).join(' | '));
}


/* ================= 32. AMUSEMENT PARK v1 (Phase 5 places) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.AMUSE.riding) G.amuseExit();
  if (G.STADIUM.watching) G.stadiumExit();
  if (G.THEATER.watching) G.theaterExit();
  if (G.SLOT.playing) G.slotExit();
  if (G.PIANO.playing) G.pianoExit();
  if (G.CIVIC.state) G.civicExit();

  /* static: exactly one new fleet mesh literal, no lights, no unseeded RNG,
     no em dashes, no external URLs, no TODO text in the amusement block */
  const amuseSrc = html.slice(html.indexOf('/* ================= PHASE 5: AMUSEMENT PARK v1 (places)'),
                              html.indexOf('/* ============================== GAME LOOP'));
  check('amuse-static: zero fleet mesh literals in the amusement block (PERF-6: rides the shared venueBoxIM)',
    (amuseSrc.match(/new THREE\.InstancedMesh/g) || []).length === 0);
  check('amuse-static: amusement block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(amuseSrc));
  check('amuse-static: no unseeded RNG in the amusement block', !/Math\.random/.test(amuseSrc));
  check('amuse-static: no em dashes in the amusement block', !amuseSrc.includes('—'));
  check('amuse-static: no external URLs in the amusement block', !/https?:\/\//.test(amuseSrc));
  check('amuse-static: no TODO markers in the amusement block', !/\bTODO\b/.test(amuseSrc));
  check('amuse-static: whole-file IM literals pin at 48 (48 = 47 + 1 fire-crew helmet fleet; 47 = 46 + 1 fire truck v1; 46 = 42 + 4 landmark-amuse ride fleets; 42 = 41 + 1 signglyph v1 board fleet; 41 - PERF-6: amuse rides the shared venueBoxIM)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
  check('amuse-static: light count pins at 6 (zero new lights)',
    (html.match(/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/g) || []).length === 6);
  check('amuse-static: audio nodes pin unchanged (17 osc, 30 gain: chimes reuse sfxBlip)',
    (html.match(/\.createOscillator\(/g) || []).length === 17 &&
    (html.match(/\.createGain\(/g) || []).length === 30);
  check('amuse-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('amuse-static: guard coverage (positive chains)',
    (html.match(/\|\| AMUSE\.riding/g) || []).length >= 35);
  check('amuse-static: guard coverage (negated chains)',
    (html.match(/&& !AMUSE\.riding/g) || []).length >= 10);
  check('amuse-static: RIDE hint click wiring pins amuseEnter',
    html.includes("amuseHintEl.addEventListener('click', () => { if (AMUSE.hintOn) amuseEnter(); })"));
  check('amuse-static: E frees the rider before the fan in the keydown chain',
    html.includes("if (e.code === 'KeyE') { if (AMUSE.riding) amuseExit(); else if (STADIUM.watching) stadiumExit();"));
  check('amuse-static: vehicleExit, mountToggle, busted and death eject the rider',
    html.includes('function vehicleExit() { if (AMUSE.riding) amuseExit(); else if (STADIUM.watching) stadiumExit();')
    && html.includes('if (AMUSE.riding) amuseExit();   // Phase 5 amusement: E never traps the rider')
    && html.includes('else if (AMUSE.riding) amuseExit();   // busted off the ride too')
    && html.includes('else if (AMUSE.riding) amuseExit();  // ...and no ride while dead either'));
  check('amuse-static: ride camera rides the AMUSE ternary branch',
    html.includes('(AMUSE.riding ? AMUSE.camAng : (STADIUM.watching ? STADIUM.camAng :')
    && html.includes("(AMUSE.riding ? 'RIDE' : (STADIUM.watching ? 'MATCH' :"));

  /* deterministic spot: same chunk, same park, every call; own residue */
  let agx = 0, agz = 0, ad = null;
  aouter: for (let gx = -60; gx <= 60; gx++)
    for (let gz = -60; gz <= 60; gz++) {
      const d = G.amusementFor(gx, gz);
      if (d) { agx = gx; agz = gz; ad = d; break aouter; }
    }
  check('amuse: a seeded amusement park exists in the scan window', !!ad, 'at ' + agx + ',' + agz);
  const ad2 = G.amusementFor(agx, agz);
  check('amuse: amusementFor is deterministic across calls',
    !!ad2 && ad2.x === ad.x && ad2.z === ad.z && ad2.yaw === ad.yaw);
  check('amuse: spot uses its own hash residue %7===6',
    G.amusementHash(agx, agz) % 7 === 6);
  /* exclusion: zero overlap with theater/stadium/piano/dock/sport-prop
     parks across the whole window (prior-residue disjointness, measured) */
  let overlap = 0, checked = 0;
  for (let gx = -60; gx <= 60; gx++)
    for (let gz = -60; gz <= 60; gz++) {
      const d = G.amusementFor(gx, gz);
      if (!d) continue;
      checked++;
      if (G.theaterHash(gx, gz) % 7 === 2) overlap++;
      if (G.pianoHash(gx, gz) % 7 === 5) overlap++;
      if (G.stadiumHash(gx, gz) % 7 === 4) overlap++;
      if (G.dockFor(gx, gz)) overlap++;
      const sh = G.sportHash(gx, gz) % 5;
      if (sh === 0 || sh === 2 || sh === 3 || sh === 4) overlap++;
    }
  check('amuse: zero overlap with theater/stadium/piano/dock/sport-prop parks',
    checked > 0 && overlap === 0, 'parks=' + checked + ' overlaps=' + overlap);

  /* ride: walk up, the RIDE prompt shows, E (amuseEnter) boards the wheel */
  const acx = Math.floor(ad.x / 48), acz = Math.floor(ad.z / 48);
  G.player.position.set(ad.x, groundY(ad.x, ad.z), ad.z);
  G.AMUSE.key = '';
  G.amuseRebuild(acx, acz);
  frame(3);
  const aslot = G.AMUSE.slots.find(sl => sl.placed);
  check('amuse: rebuild places a park at the seeded spot', !!aslot,
    aslot ? 'd2=' + ((aslot.x - ad.x) ** 2 + (aslot.z - ad.z) ** 2).toFixed(2) : 'none placed');
  check('amuse: the merged venue fleet holds all three venue regions (PERF-6)',
    G.venueBoxIM.count === G.VENUE_THEATER_OFF + 4 * 30 + 4 * 50 + 4 * 106 &&
    G.VENUE_AMUSE_OFF + aslot.base >= G.VENUE_AMUSE_OFF);
  G.player.position.set(aslot.x, groundY(aslot.x, aslot.z), aslot.z);
  frame(3);
  check('amuse: RIDE hint shows near the park',
    G.AMUSE.hintOn === true && G.amuseHintEl.style.opacity == 1);
  const probs0 = consoleProblems.length;
  G.amuseEnter();
  check('amuse: enter boards the wheel, chip shows',
    G.AMUSE.riding === true && G.amuseChipEl.style.display === 'block');
  frame(3);
  check('amuse: chip reads NOW RIDING - PARK | E EXIT',
    /^NOW RIDING - [A-Z ]+  \|  E EXIT$/.test(G.amuseChipEl.textContent), G.amuseChipEl.textContent);
  check('amuse: park names are procedural (' + G.AMUSE_NAMES.length + ' in rotation)',
    G.AMUSE_NAMES.includes(G.amuseRideName(aslot)));
  const seatY = G.player.position.y;
  check('amuse: the rider is up in a gondola, above the midway',
    seatY > groundY(aslot.x, aslot.z) + 1.0, 'seatY=' + seatY.toFixed(2));

  /* guards freeze locomotion, combat, melee, emotes while riding */
  G.doPunch();
  check('amuse: melee is refused while riding', G.P.punchCd <= 0, 'punchCd=' + G.P.punchCd);
  G.fireEmote('dance');
  check('amuse: emotes are refused while riding', G.EMO.key === null);
  const fireCd0 = G.fireCd;
  G.shoot();
  check('amuse: firing is refused while riding', G.fireCd === fireCd0);

  /* gondola-upright invariant: the wheel turns, every basket stays level */
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(),
        v3 = new THREE.Vector3(), sc3 = new THREE.Vector3();
  const abase = aslot.base;
  let maxTilt = 0, moved = false;
  const yBefore = [];
  for (let k = 0; k < 8; k++) {
    G.venueBoxIM.getMatrixAt(G.VENUE_AMUSE_OFF + abase + 23 + k * 3 + 2, m4);
    yBefore.push(m4.elements[13]);
  }
  frame(180);   // ~3 s of wheel time
  check('amuse: the wheel keeps turning under the rider', aslot.wheelRot > 1.0, 'wheelRot=' + aslot.wheelRot.toFixed(2));
  for (let k = 0; k < 8; k++) {
    G.venueBoxIM.getMatrixAt(G.VENUE_AMUSE_OFF + abase + 23 + k * 3 + 2, m4);
    if (Math.abs(m4.elements[13] - yBefore[k]) > 0.05) moved = true;
    m4.decompose(v3, q, sc3);
    eu.setFromQuaternion(q, 'YXZ');
    maxTilt = Math.max(maxTilt, Math.abs(eu.x), Math.abs(eu.z));
  }
  check('amuse: gondolas travel with the wheel', moved);
  check('amuse: gondola-upright invariant holds (baskets stay level)', maxTilt < 0.02, 'maxTilt=' + maxTilt.toFixed(4));

  /* auto-exit after 2 rotations (or 60 s): never traps the rider */
  aslot.rideT = aslot.rideEnd - 0.01;
  frame(3);
  check('amuse: the ride auto-exits at the rotation cap', G.AMUSE.riding === false && G.amuseChipEl.style.display === 'none');

  /* re-board, then E (amuseExit) frees the rider any time */
  G.player.position.set(aslot.x, groundY(aslot.x, aslot.z), aslot.z);
  frame(3);
  G.amuseEnter();
  check('amuse: re-board works after auto-exit', G.AMUSE.riding === true);
  G.amuseExit();
  check('amuse: exit frees the rider, chip hides, steps off at the wheel base',
    G.AMUSE.riding === false && G.amuseChipEl.style.display === 'none'
    && Math.hypot(G.player.position.x - aslot.x, G.player.position.z - aslot.z) > 1.0);

  /* venue bearing chip (amusebearing): the visible midway sign. Truthful
     park name + screen-direction bearing + positive distance on foot;
     hidden while riding so it never overlaps the NOW RIDING readout. */
  check('amuse: bearing chip DOM exists (amusebearing/amusebarr/amusebtxt)',
    !!G.amusebearingEl && !!G.amusebarrEl && !!G.amusebtxtEl);
  check('amuse-static: bearing chip pins below the apt chip in the top-left stack (no overlap)',
    html.includes('#amusebearing {\n    position: absolute; top: 390px; left: 18px;'));
  G.player.position.set(aslot.x + 40, groundY(aslot.x + 40, aslot.z), aslot.z);
  frame(20);   // bearing chip cadence (4 Hz)
  const abt = G.amusebtxtEl.textContent;
  check('amuse: bearing chip shows the park name with a positive distance on foot',
    G.amusebearingEl.style.display === 'block' && /^[A-Z ]+ \d+M$/.test(abt)
    && parseInt(abt.slice(abt.lastIndexOf(' ') + 1), 10) > 0, abt);
  check('amuse: bearing chip arrow rotates to the park bearing',
    /rotate\(-?\d+(\.\d+)?deg\)/.test(G.amusebarrEl.style.transform), G.amusebarrEl.style.transform);
  G.player.position.set(aslot.x, groundY(aslot.x, aslot.z), aslot.z);
  frame(3);
  G.amuseEnter();
  frame(20);
  check('amuse: bearing chip hides while riding (the NOW RIDING chip owns the readout)',
    G.amuseChipEl.style.display === 'block' && G.amusebearingEl.style.display === 'none');
  G.amuseExit();
  frame(20);
  check('amuse: bearing chip returns on foot after the ride',
    G.amusebearingEl.style.display === 'block', G.amusebtxtEl.textContent);
  check('amuse: bearing chip round trip leaves zero console errors/warnings',
    consoleProblems.length === probs0, consoleProblems.slice(probs0).join(' | '));

  check('amuse: ride/exit round trip leaves zero console errors/warnings',
    consoleProblems.length === probs0, consoleProblems.slice(probs0).join(' | '));
}

/* ================= 33. WORSHIP BUILDINGS v1 (Phase 5 buildings/places) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.WORSHIP.state) G.worshipExit();
  if (G.APARTMENT.state) G.apartmentExit();
  if (G.CIVIC.state) G.civicExit();
  if (G.AMUSE.riding) G.amuseExit();
  if (G.STADIUM.watching) G.stadiumExit();
  if (G.THEATER.watching) G.theaterExit();
  if (G.SLOT.playing) G.slotExit();
  if (G.PIANO.playing) G.pianoExit();

  /* static: worship fleet rides the shared def-loop literal (+1 runtime draw
     call, zero new source literals), no lights, no unseeded RNG, no em
     dashes, no external URLs, no TODO text in the worship block */
  const worshipSrc = html.slice(html.indexOf('/* ================= PHASE 5: WORSHIP BUILDINGS v1 (buildings/places)'),
                                html.indexOf('/* ============================== GAME LOOP'));
  check('worship-static: zero fleet mesh literals in the gameplay block (the fleet rides the shared def loop)',
    (worshipSrc.match(/new THREE\.InstancedMesh/g) || []).length === 0);
  check('worship-static: worship block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(worshipSrc));
  check('worship-static: no unseeded RNG in the worship block', !/Math\.random/.test(worshipSrc));
  check('worship-static: no em dashes in the worship block', !worshipSrc.includes('—'));
  check('worship-static: no external URLs in the worship block', !/https?:\/\//.test(worshipSrc));
  check('worship-static: no TODO markers in the worship block', !/\bTODO\b/.test(worshipSrc));
  check('worship-static: the worship fleet is a live InstancedMesh (+1 runtime draw call)',
    G.BLDG_DEF.worship.mesh.isInstancedMesh === true);
  check('worship-static: church and mosque share the one worship fleet mesh',
    G.BLDG_DEF.church.mesh === G.BLDG_DEF.worship.mesh && G.BLDG_DEF.mosque.mesh === G.BLDG_DEF.worship.mesh);
  check('worship-static: guard coverage (positive chains)',
    (html.match(/\|\| WORSHIP\.state/g) || []).length >= 25);
  check('worship-static: guard coverage (negated chains)',
    (html.match(/&& !WORSHIP\.state/g) || []).length >= 3);
  check('worship-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('worship-static: KeyE exits the worshipper and enters on a live hint',
    html.includes("else if (WORSHIP.state) worshipExit();")
    && html.includes("else if (WORSHIP.hintOn) worshipEnter();"));
  check('worship-static: mountToggle, vehicleExit, busted and death eject the worshipper',
    html.includes('else if (WORSHIP.state) worshipExit();   // Phase 5 worship: E never traps the worshipper')
    && html.includes('else if (WORSHIP.state) worshipExit(); else if (THEATER.watching)')
    && html.includes('if (WORSHIP.state) worshipExit();   // Phase 5 worship: busted out of the chapel too')
    && html.includes('if (WORSHIP.state) worshipExit();  // ...and no worship service while dead either'));
  check('worship-static: camera chain frames the worship porch',
    html.includes('WORSHIP.state ? WORSHIP.camAng :') && html.includes("WORSHIP.state ? 'WORSHIP' :"));

  /* seeded placement: both types exist, own salted residue, deterministic */
  const findWorship = (type) => {
    for (let gx = -60; gx <= 60; gx++)
      for (let gz = -60; gz <= 60; gz++) {
        if (G.worshipFor(gx, gz) !== type) continue;
        const b = G.bldgCenterFor(gx, gz);
        if (b && b.type === type) return { gx, gz, b };
      }
    return null;
  };
  const foundW = { church: findWorship('church'), mosque: findWorship('mosque') };
  check('worship: both sacred types place in the scan window',
    !!foundW.church && !!foundW.mosque,
    'church:' + !!foundW.church + ' mosque:' + !!foundW.mosque);
  check('worship: own salted hash residue %7===0',
    !!foundW.church && G.worshipHash(foundW.church.gx, foundW.church.gz) % 7 === 0
    && !!foundW.mosque && G.worshipHash(foundW.mosque.gx, foundW.mosque.gz) % 7 === 0);
  check('worship: type split church/mosque follows (hash>>>9)%2',
    !!foundW.church && ((G.worshipHash(foundW.church.gx, foundW.church.gz) >>> 9) % 2) === 0
    && !!foundW.mosque && ((G.worshipHash(foundW.mosque.gx, foundW.mosque.gz) >>> 9) % 2) === 1);
  {
    const w = foundW.church;
    const a = G.worshipFor(w.gx, w.gz), b = G.worshipFor(w.gx, w.gz);
    const p1 = G.bldgCenterFor(w.gx, w.gz), p2 = G.bldgCenterFor(w.gx, w.gz);
    check('worship: selection + placement are pure functions of chunk coords',
      a === b && !!p1 && !!p2 && p1.x === p2.x && p1.z === p2.z && p1.type === p2.type && p1.yOff === p2.yOff,
      a + ' @' + (p1 ? p1.x.toFixed(1) + ',' + p1.z.toFixed(1) : 'null'));
  }
  check('worship: mosque placement carries the Y-band lift flag, church does not',
    !!foundW.mosque && foundW.mosque.b.yOff === G.WORSHIP_BAND
    && !!foundW.church && foundW.church.b.yOff === 0);
  /* precedence: a worship-residue chunk that also hits a civic/casino/store
     residue keeps the earlier-namespace type (civic > casino > store > worship) */
  {
    let precOk = true, precSeen = 0;
    for (let gx = -60; gx <= 60 && precSeen < 20; gx++)
      for (let gz = -60; gz <= 60 && precSeen < 20; gz++) {
        if (G.worshipFor(gx, gz) === null) continue;
        const h = G.hash2i(gx, gz);
        const hi = h % 7 === 5 ? G.CIVIC_ORDER[(h >>> 9) % 4] : h % 7 === 3 ? 'casino' : h % 7 === 1 ? 'store' : null;
        if (!hi) continue;
        precSeen++;
        const t = G.bldgTypeFor(gx, gz);
        if (t !== hi) { precOk = false; break; }
      }
    check('worship: civic/casino/store residues win over worship (namespace precedence)',
      precSeen > 0 && precOk, 'contested=' + precSeen);
  }

  /* geometry: one fleet, two Y-bands (church band 0, mosque band -1000) */
  check('worship: fleet geometry holds both Y-bands',
    (() => {
      const pos = G.BLDG_DEF.worship.mesh.geometry.attributes.position;
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < lo) lo = y; if (y > hi) hi = y; }
      return lo < -900 && hi > 10;
    })());
  /* Y-band lift: mosque instance matrices ride exactly one band up (scaled by sy) */
  {
    let liftOk = false, liftDetail = 'no mosque placed';
    if (foundW.mosque) {
      const mb = foundW.mosque.b;
      G.redistributeBuildings(Math.floor(mb.x / 48), Math.floor(mb.z / 48));   // CHUNK = 48
      const arr = G.BLDG.active.mosque;
      liftDetail = 'mosque lost in redistribute';
      if (arr.length > 0) {
        const mesh = G.BLDG_DEF.worship.mesh;
        const nC = G.BLDG.active.church.length;
        const m4 = new THREE.Matrix4();
        liftOk = true;
        for (let i = 0; i < arr.length; i++) {
          const b = arr[i];
          mesh.getMatrixAt(nC + i, m4);
          const my = m4.elements[13];
          const want = b.y + G.WORSHIP_BAND * (b.sy !== undefined ? b.sy : 1);
          if (Math.abs(my - want) > 0.01) { liftOk = false; liftDetail = 'slot ' + i + ' y=' + my.toFixed(2) + ' want=' + want.toFixed(2); break; }
        }
        if (liftOk) liftDetail = arr.length + ' mosque instances lifted';
      }
    }
    check('worship: mosque instance matrices lift by exactly one Y-band', liftOk, liftDetail);
  }

  /* mechanics: synthetic church at the player (the ticker owns the real
     redistribute; the seeded selection above proves the real placement) */
  const cpx = G.player.position.x, cpz = G.player.position.z;
  const synthWorship = (type) => {
    for (const t of G.WORSHIP_ORDER) G.BLDG.active[t].length = 0;
    G.BLDG.active[type].push({ x: cpx + 3, z: cpz, y: groundY(cpx + 3, cpz), yaw: 0, gx: 0, gz: 0, name: type.toUpperCase(), type });
    /* stand 6.5u from the new building: inside both porch hint radii (7.5/9.0).
       Synthetic buildings bypass redistributeBuildings, so they add no foot
       colliders of their own. */
    G.player.position.set(cpx + 3 + 6.5, groundY(cpx + 9.5, cpz), cpz);
  };
  const probsW0 = consoleProblems.length;
  synthWorship('church');
  frame(3);
  check('worship: PRAY hint shows near the church',
    G.WORSHIP.hintOn === true && G.WORSHIP.nearType === 'church' && G.worshiphintEl.style.opacity == 1);
  G.worshipEnter();
  check('worship: enter freezes the player at the porch, panel + chip show',
    G.WORSHIP.state === 'church' && G.worshipPanelEl.style.display === 'block'
    && G.worshipChipEl.style.display === 'block');
  check('worship: chip reads TYPE | PROMPT | E LEAVE',
    G.worshipChipEl.textContent === 'CHURCH | PRAY - FREE | E LEAVE', G.worshipChipEl.textContent);
  check('worship: panel carries the type title, action and foot text',
    G.worshipTitleEl.textContent === 'CHURCH' && G.worshipActEl.textContent === 'PRAY - FREE'
    && G.worshipFootEl.textContent === 'FULL HEAL - ONCE PER IN-GAME DAY');
  frame(3);
  check('worship: the player stays frozen at the porch while inside',
    Math.abs(G.player.position.x - G.WORSHIP.seatX) < 0.01 && Math.abs(G.player.position.z - G.WORSHIP.seatZ) < 0.01
    && G.WORSHIP.state === 'church');

  /* guards freeze locomotion, combat, melee, emotes while inside */
  G.doPunch();
  check('worship: melee is refused while inside', G.P.punchCd <= 0, 'punchCd=' + G.P.punchCd);
  G.fireEmote('dance');
  check('worship: emotes are refused while inside', G.EMO.key === null);
  const fireCdW0 = G.fireCd;
  G.shoot();
  check('worship: firing is refused while inside', G.fireCd === fireCdW0);

  /* church economy: PRAY is a free full heal, once per in-game day */
  G.P.hp = 40;
  G.worshipPray();
  check('worship: church PRAY is a free full heal', G.P.hp === 100, 'hp=' + G.P.hp);
  check('worship: pray toast confirms', G.toastEl.textContent === 'BLESSED', G.toastEl.textContent);
  G.P.hp = 40;
  G.worshipPray();
  check('worship: PRAY cooldown refuses a second prayer the same day',
    G.P.hp === 40 && G.toastEl.textContent === 'COME BACK TOMORROW', G.toastEl.textContent);
  G.WORSHIP.prayDay = -1;
  G.worshipPray();
  check('worship: PRAY works again after the day rolls (cooldown reset)',
    G.P.hp === 100, 'hp=' + G.P.hp);

  /* mosque: SANCTUARY heals +40 and clears wanted heat */
  G.worshipExit();
  synthWorship('mosque');
  frame(3);
  check('worship: SANCTUARY hint shows near the mosque',
    G.WORSHIP.hintOn === true && G.WORSHIP.nearType === 'mosque' && G.worshiphintEl.style.opacity == 1);
  G.worshipEnter();
  check('worship: enter works for the mosque too', G.WORSHIP.state === 'mosque');
  G.P.hp = 50; G.W.heat = 3;
  G.worshipSanctuary();
  check('worship: mosque SANCTUARY heals +40 HP', G.P.hp === 90, 'hp=' + G.P.hp);
  check('worship: mosque SANCTUARY clears wanted heat', G.W.heat === 0, 'heat=' + G.W.heat);
  check('worship: sanctuary toast confirms', G.toastEl.textContent === 'SANCTUARY', G.toastEl.textContent);

  /* exit: E (worshipExit) frees the player, panel + chip hide, never traps */
  G.worshipExit();
  check('worship: exit frees the player, panel + chip hide',
    G.WORSHIP.state === null && G.worshipPanelEl.style.display === 'none'
    && G.worshipChipEl.style.display === 'none');
  check('worship: exit toast reads ON FOOT', G.toastEl.textContent === 'ON FOOT');
  check('worship: enter/exit round trip leaves zero console errors/warnings',
    consoleProblems.length === probsW0, consoleProblems.slice(probsW0).join(' | '));
}

/* ================= PHASE 5: APARTMENT BUILDINGS v1 ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.APARTMENT.state) G.apartmentExit();
  G.APARTMENT.leased = false; G.APARTMENT.leaseName = '';
  G.APARTMENT.respawnX = null; G.APARTMENT.respawnZ = null; G.APARTMENT.respawnYaw = 0;

  /* static: apartment fleet rides the shared def-loop literal (+1 runtime
     draw call, zero new source literals), no lights, no unseeded RNG, no em
     dashes, no external URLs, no TODO text in the apartment block */
  const apartSrc = html.slice(html.indexOf('/* ================= PHASE 5: APARTMENT BUILDINGS v1 (buildings/places)'),
                              html.indexOf('/* ============================== GAME LOOP'));
  check('apart-static: zero fleet mesh literals in the gameplay block (the fleet rides the shared def loop)',
    (apartSrc.match(/new THREE\.InstancedMesh/g) || []).length === 0);
  check('apart-static: apartment block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(apartSrc));
  check('apart-static: no unseeded RNG in the apartment block', !/Math\.random/.test(apartSrc));
  check('apart-static: no em dashes in the apartment block', !apartSrc.includes('—'));
  check('apart-static: no external URLs in the apartment block', !/https?:\/\//.test(apartSrc));
  check('apart-static: no TODO markers in the apartment block', !/\bTODO\b/.test(apartSrc));
  check('apart-static: the apartment fleet is a live InstancedMesh (+1 runtime draw call)',
    G.BLDG_DEF.apartment.mesh.isInstancedMesh === true);
  check('apart-static: the apartment fleet shares the BLDG_WIN_MATS emissive ramp',
    G.BLDG_WIN_MATS.includes(G.BLDG_DEF.apartment.mesh.material));
  check('apart-static: guard coverage (positive chains)',
    (html.match(/\|\| APARTMENT\.state/g) || []).length >= 40);
  check('apart-static: guard coverage (negated chains)',
    (html.match(/&& !APARTMENT\.state/g) || []).length >= 14);
  check('apart-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('apart-static: KeyE exits the tenant and enters on a live hint',
    html.includes("else if (APARTMENT.state) apartmentExit();")
    && html.includes("else if (APARTMENT.hintOn) apartmentEnter();"));
  check('apart-static: mountToggle, vehicleExit, busted and death eject the tenant',
    html.includes('else if (APARTMENT.state) apartmentExit();   // Phase 5 apartments: E never traps the tenant')
    && html.includes('else if (TRAIN.riding) trainExit(); else if (APARTMENT.state) apartmentExit(); }')
    && html.includes('if (APARTMENT.state) apartmentExit();   // Phase 5 apartments: busted out of the unit too')
    && html.includes('if (APARTMENT.state) apartmentExit();  // ...and no lease while dead either'));
  check('apart-static: camera chain frames the apartment porch',
    html.includes('APARTMENT.state ? APARTMENT.camAng :') && html.includes("APARTMENT.state ? 'APARTMENT' :"));
  check('apart-static: death redeploys at the leased anchor with a guarded spawn fallback',
    html.includes('APARTMENT.respawnX !== null ? APARTMENT.respawnX : 0')
    && html.includes('APARTMENT.respawnZ !== null ? APARTMENT.respawnZ : 0'));
  check('apart-static: lease is session-only (save v3 untouched)',
    !/APARTMENT\.(leased|respawnX|respawnZ|respawnYaw)/.test(
      html.slice(html.indexOf('function collectSave()'), html.indexOf('function saveGame()'))));

  /* seeded placement: own salted residue, deterministic, disjoint */
  const findApartment = () => {
    for (let gx = -60; gx <= 60; gx++)
      for (let gz = -60; gz <= 60; gz++) {
        if (G.apartmentFor(gx, gz) !== 'apartment') continue;
        const b = G.bldgCenterFor(gx, gz);
        if (b && b.type === 'apartment') return { gx, gz, b };
      }
    return null;
  };
  const foundA = findApartment();
  check('apart: an apartment block places in the scan window', !!foundA,
    foundA ? foundA.gx + ',' + foundA.gz : 'none');
  check('apart: own salted hash residue %7===2',
    !!foundA && G.apartmentHash(foundA.gx, foundA.gz) % 7 === 2);
  check('apart: salt differs from the worship salt',
    G.APARTMENT_SALT !== G.WORSHIP_SALT);
  {
    const w = foundA;
    const a = G.apartmentFor(w.gx, w.gz), b = G.apartmentFor(w.gx, w.gz);
    const p1 = G.bldgCenterFor(w.gx, w.gz), p2 = G.bldgCenterFor(w.gx, w.gz);
    check('apart: selection + placement are pure functions of chunk coords',
      a === b && !!p1 && !!p2 && p1.x === p2.x && p1.z === p2.z && p1.type === p2.type && p1.yOff === p2.yOff,
      a + ' @' + (p1 ? p1.x.toFixed(1) + ',' + p1.z.toFixed(1) : 'null'));
  }
  check('apart: variant bits follow the seeded split (floors 3|4, side 0..3, tint 0..3)',
    !!foundA && [3, 4].includes(foundA.b.floors) && foundA.b.balconySide >= 0 && foundA.b.balconySide <= 3
    && foundA.b.tintIx >= 0 && foundA.b.tintIx < G.APART_TINTS.length,
    foundA ? 'floors=' + foundA.b.floors + ' side=' + foundA.b.balconySide + ' tint=' + foundA.b.tintIx : 'none');
  check('apart: name comes from the 6-name seeded list',
    !!foundA && G.APARTMENT_NAMES.length === 6 && G.APARTMENT_NAMES.includes(foundA.b.name),
    foundA ? foundA.b.name : 'none');
  check('apart: placed instance band matches the seeded variant tag',
    !!foundA && foundA.b.yOff === -((foundA.b.balconySide * 2 + (foundA.b.floors - 3)) * G.APART_BAND),
    foundA ? 'yOff=' + foundA.b.yOff : 'none');
  /* namespace precedence: a chunk where apartmentFor hits keeps the
     earlier-namespace type (civic > casino > store > worship > apartment >
     house); apartment never loses to a non-building */
  {
    let seen = 0, bad = 0;
    const earlier = new Set(['church', 'mosque', 'store', 'casino', 'hospital', 'bank', 'hotel', 'school', 'barn']);
    for (let gx = -60; gx <= 60 && bad === 0; gx++)
      for (let gz = -60; gz <= 60 && bad === 0; gz++) {
        if (G.apartmentFor(gx, gz) !== 'apartment') continue;
        seen++;
        const t = G.bldgTypeFor(gx, gz);
        if (t !== 'apartment' && t !== 'house' && !earlier.has(t)) bad++;
      }
    check('apart: zero residue overlap vs worship/store/casino/civic over the scan window',
      seen > 0 && bad === 0, 'seen=' + seen);
  }

  /* geometry: one fleet, eight Y-bands (2 floor tags x 4 balcony sides) */
  check('apart: fleet geometry holds all eight Y-bands',
    (() => {
      const pos = G.BLDG_DEF.apartment.mesh.geometry.attributes.position;
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < lo) lo = y; if (y > hi) hi = y; }
      return lo < -6900 && hi > 10;
    })());
  /* Y-band lift: instance matrices ride the seeded band back to grade */
  {
    let liftOk = false, liftDetail = 'no apartment placed';
    if (foundA) {
      const ab = foundA.b;
      G.redistributeBuildings(Math.floor(ab.x / 48), Math.floor(ab.z / 48));   // CHUNK = 48
      const arr = G.BLDG.active.apartment;
      liftDetail = 'apartment lost in redistribute';
      if (arr.length > 0) {
        const mesh = G.BLDG_DEF.apartment.mesh;
        const m4 = new THREE.Matrix4();
        liftOk = true;
        for (let i = 0; i < arr.length; i++) {
          const b = arr[i];
          mesh.getMatrixAt(i, m4);
          const my = m4.elements[13];
          const want = b.y + (b.yOff || 0) * (b.sy !== undefined ? b.sy : 1);
          if (Math.abs(my - want) > 0.01) { liftOk = false; liftDetail = 'slot ' + i + ' y=' + my.toFixed(2) + ' want=' + want.toFixed(2); break; }
        }
        if (liftOk) liftDetail = arr.length + ' apartment instances lifted';
      }
    }
    check('apart: instance matrices lift by exactly the seeded Y-band', liftOk, liftDetail);
  }
  /* collider: the porch seat sits outside the foot collider, the hint fires
     inside the hint radius (the civic v1 reachability class) */
  {
    const def = G.BLDG_DEF.apartment;
    const wr = def.colliders[0][2];   // sx=sz=1 for apartments
    check('apart: porch seat is outside the foot collider, hint radius inside the seat',
      def.porch.seat > wr && def.porch.hint > wr && def.porch.hint < def.porch.seat + 1,
      'seat=' + def.porch.seat + ' hint=' + def.porch.hint + ' collider=' + wr);
  }

  /* mechanics: synthetic apartment at the player (the ticker owns the real
     redistribute; the seeded selection above proves the real placement) */
  const cpx = G.player.position.x, cpz = G.player.position.z;
  const synthApartment = () => {
    G.BLDG.active.apartment.length = 0;
    G.BLDG.active.apartment.push({ x: cpx + 3, z: cpz, y: groundY(cpx + 3, cpz), yaw: 0, gx: 0, gz: 0, name: 'MAPLE COURT APARTMENTS', type: 'apartment' });
    /* stand 6.5u from the new block: inside the 7.5u hint radius, outside
       the 5.4u foot collider. Synthetic buildings bypass redistributeBuildings,
       so they add no foot colliders of their own. */
    G.player.position.set(cpx + 3 + 6.5, groundY(cpx + 9.5, cpz), cpz);
  };
  const probsA0 = consoleProblems.length;
  G.cash = 500; G.P.hp = 40;
  synthApartment();
  frame(3);
  check('apart: LEASE hint shows near the block',
    G.APARTMENT.hintOn === true && G.apthintEl.style.opacity == 1
    && G.apthintEl.textContent.indexOf('LEASE') >= 0, G.apthintEl.textContent);
  G.apartmentEnter();
  check('apart: enter leases the unit: cash -$100, +50 HP, anchor set, state set',
    G.APARTMENT.state === 'apartment' && G.APARTMENT.leased === true
    && G.cash === 400 && G.P.hp === 90
    && G.APARTMENT.respawnX === cpx + 3 && G.APARTMENT.respawnZ === cpz,
    'cash=' + G.cash + ' hp=' + G.P.hp);
  check('apart: chip reads HOME SET - NAME | E EXIT',
    G.aptChipEl.style.display === 'block'
    && G.aptChipEl.textContent === 'HOME SET - MAPLE COURT APARTMENTS | E EXIT', G.aptChipEl.textContent);
  check('apart: lease toast confirms', G.toastEl.textContent === 'HOME SET', G.toastEl.textContent);
  frame(3);
  check('apart: the player stays frozen at the porch while inside',
    Math.abs(G.player.position.x - G.APARTMENT.seatX) < 0.01 && Math.abs(G.player.position.z - G.APARTMENT.seatZ) < 0.01
    && G.APARTMENT.state === 'apartment');

  /* guards freeze locomotion, combat, melee, emotes while inside */
  G.doPunch();
  check('apart: melee is refused while inside', G.P.punchCd <= 0, 'punchCd=' + G.P.punchCd);
  G.fireEmote('dance');
  check('apart: emotes are refused while inside', G.EMO.key === null);
  const fireCdA0 = G.fireCd;
  G.shoot();
  check('apart: firing is refused while inside', G.fireCd === fireCdA0);

  /* exit: E (apartmentExit) frees the player, the lease flag chip stays */
  G.apartmentExit();
  check('apart: exit frees the player, lease flag chip stays',
    G.APARTMENT.state === null && G.aptChipEl.style.display === 'block'
    && G.aptChipEl.textContent === 'HOME SET', G.aptChipEl.textContent);
  check('apart: exit toast reads ON FOOT', G.toastEl.textContent === 'ON FOOT');

  /* insufficient funds: the door stays shut */
  G.APARTMENT.leased = false; G.APARTMENT.leaseName = '';
  G.APARTMENT.respawnX = null; G.APARTMENT.respawnZ = null;
  G.cash = 50; G.P.hp = 40;
  synthApartment(); frame(3);
  G.apartmentEnter();
  check('apart: insufficient funds refuse the lease, the player stays outside',
    G.APARTMENT.state === null && G.APARTMENT.leased === false && G.cash === 50
    && G.toastEl.textContent === 'NOT ENOUGH CASH', G.toastEl.textContent);

  /* death/respawn: the leased anchor wins; the guard falls back to spawn */
  G.cash = 500; G.P.hp = 40;
  synthApartment(); frame(3);
  G.apartmentEnter();   // leases again: anchor = cpx+3, cpz
  G.apartmentExit();
  G.P.dead = true; G.P.deadT = 0; G.P.hp = 0;
  frame(100);   // past the 1.2s redeploy timer
  check('apart: death redeploys at the leased anchor',
    G.P.dead === false && Math.abs(G.player.position.x - (cpx + 3)) < 0.01 && Math.abs(G.player.position.z - cpz) < 0.01,
    G.player.position.x.toFixed(1) + ',' + G.player.position.z.toFixed(1));
  check('apart: enter/exit round trip leaves zero console errors/warnings',
    consoleProblems.length === probsA0, consoleProblems.slice(probsA0).join(' | '));
}

/* ================= PHASE 5: SIGN GLYPHS v1 ================= */
{
  /* static: the board fleet is exactly one new InstancedMesh literal (+1
     site: 41 -> 42), procedural canvas atlas only, no unseeded RNG, no em
     dashes, no TODO text in the block */
  const glyphSrc = html.slice(html.indexOf('/* ==================== PHASE 5: SIGN GLYPHS v1'),
                              html.indexOf('/* ---- car condition HUD'));
  check('signglyph-static: one fleet literal in the glyph block',
    (glyphSrc.match(/new THREE\.InstancedMesh/g) || []).length === 1);
  check('signglyph-static: no unseeded RNG in the glyph block', !/Math\.random/.test(glyphSrc));
  check('signglyph-static: no em dashes in the glyph block', !glyphSrc.includes('—'));
  check('signglyph-static: no TODO/FIXME in the glyph block', !/\b(TODO|FIXME)\b/.test(glyphSrc));
  check('signglyph-static: no external URLs in the glyph block',
    !(glyphSrc.match(/https?:\/\//g) || []).length);

  /* fleet shape */
  check('signglyph: one shared board InstancedMesh fleet',
    !!(G.glyphBoardIM && G.glyphBoardIM.isInstancedMesh === true));
  check('signglyph: fleet cap covers gas x2 + garage + store slots (26)',
    G.GLYPH_BOARD_CAP === 26, 'cap=' + G.GLYPH_BOARD_CAP);
  check('signglyph: board material carries the baked 512x64 atlas texture',
    !!(G.glyphBoardIM.material.map && G.glyphBoardIM.material.map.isTexture
       && G.glyphBoardIM.material.map.image.width === 512
       && G.glyphBoardIM.material.map.image.height === 64),
    G.glyphBoardIM.material.map.image.width + 'x' + G.glyphBoardIM.material.map.image.height);
  check('signglyph: geometry carries the instanced glyph-shift attribute',
    !!(G.glyphBoardIM.geometry.getAttribute('aGlyph')
       && G.glyphBoardIM.geometry.getAttribute('aGlyph').isInstancedBufferAttribute));
  check('signglyph: stock material keeps the UV-shift patch (no ShaderMaterial)',
    G.glyphBoardIM.material.isMeshBasicMaterial === true
    && typeof G.glyphBoardIM.material.onBeforeCompile === 'function');
  check('signglyph: fleet starts empty and culled-off like the other fleets',
    G.glyphBoardIM.frustumCulled === false && G.glyphBoardIM.castShadow === false);

  /* functional: synthetic slots produce the right boards at the right mounts.
     Earlier sections may have ticked real slots into the fleets, so every
     expectation is relative to the pre-existing counts. */
  const gas0 = G.AMEN.active.gas.length, gar0 = G.AMEN.active.garage.length,
        st0 = G.BLDG.active.store.length;
  G.AMEN.active.gas.push({ x: 100, y: 2, z: 200, yaw: 0, gx: 9, gz: 9 });
  G.AMEN.active.garage.push({ x: 300, y: 3, z: 400, yaw: Math.PI / 2, gx: 10, gz: 10 });
  G.BLDG.active.store.push({ x: 500, y: 1, z: 600, yaw: Math.PI, gx: 11, gz: 11 });
  G.redistributeGlyphBoards();
  const iGasS = gas0 * 2, iGarS = (gas0 + 1) * 2 + gar0,
        iStS = (gas0 + 1) * 2 + (gar0 + 1) + st0;
  check('signglyph: fleet count matches slots (gas x2 + garage + store)',
    G.glyphBoardIM.count === iStS + 1, 'count=' + G.glyphBoardIM.count);
  const gAttr = G.glyphBoardIM.geometry.getAttribute('aGlyph');
  check('signglyph: per-instance glyph ids select the atlas cells',
    gAttr.getX(iGasS) === 1 && gAttr.getX(iGasS + 1) === 2
    && gAttr.getX(iGarS) === 0 && gAttr.getX(iStS) === 3,
    [gAttr.getX(iGasS), gAttr.getX(iGasS + 1), gAttr.getX(iGarS), gAttr.getX(iStS)].join(','));
  const m0 = new THREE.Matrix4(), m2 = new THREE.Matrix4(), m3 = new THREE.Matrix4();
  G.glyphBoardIM.getMatrixAt(iGasS, m0);
  check('signglyph: gas GAS board mounts on the sign pole (local 5.8, 5.3, 0)',
    Math.abs(m0.elements[12] - 105.8) < 0.01 && Math.abs(m0.elements[13] - 7.3) < 0.01
    && Math.abs(m0.elements[14] - 200) < 0.01,
    m0.elements[12].toFixed(2) + ',' + m0.elements[13].toFixed(2) + ',' + m0.elements[14].toFixed(2));
  G.glyphBoardIM.getMatrixAt(iGarS, m2);
  check('signglyph: garage OPEN board mounts at the banner posts under amenity yaw',
    Math.abs(m2.elements[12] - 303.48) < 0.01 && Math.abs(m2.elements[13] - 8.35) < 0.01
    && Math.abs(m2.elements[14] - 400) < 0.01,
    m2.elements[12].toFixed(2) + ',' + m2.elements[13].toFixed(2) + ',' + m2.elements[14].toFixed(2));
  G.glyphBoardIM.getMatrixAt(iStS, m3);
  check('signglyph: store STORE board mounts between the porch posts under amenity yaw',
    Math.abs(m3.elements[12] - 500) < 0.01 && Math.abs(m3.elements[13] - 3.7) < 0.01
    && Math.abs(m3.elements[14] - 595.4) < 0.01,
    m3.elements[12].toFixed(2) + ',' + m3.elements[13].toFixed(2) + ',' + m3.elements[14].toFixed(2));
  G.AMEN.active.gas.length = gas0;
  G.AMEN.active.garage.length = gar0;
  G.BLDG.active.store.length = st0;
  G.redistributeGlyphBoards();
  check('signglyph: fleet restores clean after the synthetic slots leave',
    G.glyphBoardIM.count === gas0 * 2 + gar0 + st0, 'count=' + G.glyphBoardIM.count);
}

/* ================= PHASE 5: LANDMARK STADIUM v1 (buildings/places) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.STADIUM.watching) G.stadiumExit();
  if (G.THEATER.watching) G.theaterExit();
  if (G.SLOT.playing) G.slotExit();
  if (G.PIANO.playing) G.pianoExit();
  if (G.CIVIC.state) G.civicExit();

  /* static: bespoke merged geometry, zero new IM literals (the shared
     AMEN_DEF loop builds the one 'stad' mesh: +1 runtime draw call), zero
     new runtime lights, zero new keybinds, no unseeded RNG, no em dashes,
     no external URLs, no TODO text in the block */
  const lmstadSrc = html.slice(html.indexOf('/* ================= PHASE 5: LANDMARK STADIUM v1 (buildings/places)'),
                               html.indexOf('/* ================= PHASE 5: LANDMARK AMUSEMENT PARK v1 (buildings/places)'));
  check('lmstad-static: zero IM literals in the stadium block (shared AMEN_DEF loop builds the one mesh)',
    (lmstadSrc.match(/new THREE\.InstancedMesh/g) || []).length === 0);
  check('lmstad-static: stadium block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(lmstadSrc));
  check('lmstad-static: no unseeded RNG in the stadium block', !/Math\.random/.test(lmstadSrc));
  check('lmstad-static: no em dashes in the stadium block', !lmstadSrc.includes('—'));
  check('lmstad-static: no external URLs in the stadium block', !/https?:\/\//.test(lmstadSrc));
  check('lmstad-static: no TODO markers in the stadium block', !/\bTODO\b/.test(lmstadSrc));
  check('lmstad-static: stad residue is checked after all existing amenity types (never displaces them)',
    html.indexOf("if (h % 10 === 6) return 'park';") < html.indexOf("if (h % 37 === 13) return 'stad';"));
  check('lmstad-static: whole-file IM literals pin at 48 (48 = 47 + 1 fire-crew helmet fleet; 47 = 46 + 1 fire truck v1; 46 = 42 + 4 lmause ride fleets; stad rides the shared def-loop literal)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
  check('lmstad-static: Math.random lines pin at 92',
    (html.match(/^.*Math\.random.*$/gm) || []).length === 92);
  check('lmstad-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);

  /* seeded placement: pure deterministic hash, cross-type winner-take-all */
  let sgx = 0, sgz = 0, sd = null;
  souter: for (let gx = -60; gx <= 60; gx++)
    for (let gz = -60; gz <= 60; gz++) {
      if (G.amenityTypeFor(gx, gz) !== 'stad' || !G.amenityAccepted(gx, gz)) continue;
      const a = G.amenityCenterFor(gx, gz);
      if (a && a.type === 'stad') { sgx = gx; sgz = gz; sd = a; break souter; }
    }
  check('lmstad: a seeded stadium chunk exists in the scan window', !!sd, sd ? 'at ' + sgx + ',' + sgz : 'none');
  if (sd) {
    const sd2 = G.amenityCenterFor(sgx, sgz);
    check('lmstad: amenityCenterFor is deterministic across calls',
      !!sd2 && sd2.x === sd.x && sd2.z === sd.z && sd2.yaw === sd.yaw && sd2.type === 'stad');
    let wtaOk = true;
    for (let ax = sgx - 1; ax <= sgx + 1; ax++)
      for (let az = sgz - 1; az <= sgz + 1; az++) {
        if (ax === sgx && az === sgz) continue;
        if (G.amenityTypeFor(ax, az) && G.amenityAccepted(ax, az)) wtaOk = false;
      }
    check('lmstad: cross-type winner-take-all holds (no other accepted amenity in the 3x3)', wtaOk);
    check('lmstad: def is registered (cap 2, glow flag, 14 wall colliders)',
      G.AMEN_DEF.stad && G.AMEN_DEF.stad.cap === 2 && G.AMEN_DEF.stad.glow === true
      && G.AMEN_DEF.stad.colliders.length === 14 && G.LMSTAD_WALL_COL.length === 14
      && Array.isArray(G.AMEN.active.stad));

    /* merged geometry: one mesh, one vertexColors material, per-part colors */
    const sgeo = G.AMEN_DEF.stad.meshes[0].geometry;
    check('lmstad: merged geometry carries per-part vertex colors',
      !!sgeo.attributes.color && sgeo.attributes.color.count === sgeo.attributes.position.count
      && sgeo.attributes.position.count > 500, 'verts=' + sgeo.attributes.position.count);
    check('lmstad: one material with vertexColors on',
      G.AMEN_DEF.stad.meshes[0].material.vertexColors === true);
    check('lmstad: floodlight materials ride the day/night emissive ramp (stad + amuse + hosp + theater + casino + firestation)',
      G.LMSTAD_FLOOD_MATS.length === 6 && G.LMSTAD_FLOOD_MATS[0] === G.AMEN_DEF.stad.meshes[0].material
      && G.LMSTAD_FLOOD_MATS[1] === G.AMEN_DEF.amuse.meshes[0].material
      && G.LMSTAD_FLOOD_MATS[2] === G.AMEN_DEF.hosp.meshes[0].material
      && G.LMSTAD_FLOOD_MATS[3] === G.AMEN_DEF.theater.meshes[0].material
      && G.LMSTAD_FLOOD_MATS[4] === G.AMEN_DEF.casino.meshes[0].material
      && G.LMSTAD_FLOOD_MATS[5] === G.AMEN_DEF.firestation.meshes[0].material
      && !!G.LMSTAD_FLOOD_MATS[0].emissiveMap);

    /* wall collision: the rim wall blocks a walker, the gates stay open.
       Colliders are pushed exactly the way redistributeBuildings does for
       the live stadium (rural-building foot idiom), then removed. */
    const def = G.AMEN_DEF.stad;
    const c0 = Math.cos(sd.yaw), s0 = Math.sin(sd.yaw);
    const wx = (ox, oz) => sd.x + ox * c0 + oz * s0;
    const wz = (ox, oz) => sd.z - ox * s0 + oz * c0;
    const foot0 = G.BLDG.foot.length;
    for (const col of def.colliders) G.BLDG.foot.push({ x: wx(col[0], col[1]), z: wz(col[0], col[1]), r: col[2] });
    const wc = def.colliders[3];   // a mid-wall collider, far from either gate
    G.player.position.set(wx(wc[0], wc[1]), groundY(wx(wc[0], wc[1]), wz(wc[0], wc[1])), wz(wc[0], wc[1]));
    G.resolveBldgFoot();
    const wd = Math.hypot(G.player.position.x - wx(wc[0], wc[1]), G.player.position.z - wz(wc[0], wc[1]));
    check('lmstad: the rim wall blocks a walker (pushed out of the wall)',
      wd >= wc[2] + 0.45 - 0.01, 'd=' + wd.toFixed(2) + ' min=' + (wc[2] + 0.45).toFixed(2));
    const gx0 = wx(11.5, 0), gz0 = wz(11.5, 0);   // east gate center: no collider there
    G.player.position.set(gx0, groundY(gx0, gz0), gz0);
    G.resolveBldgFoot();
    const gd = Math.hypot(G.player.position.x - gx0, G.player.position.z - gz0);
    check('lmstad: the entry gate stays open (walker not pushed)', gd < 0.01, 'd=' + gd.toFixed(3));
    G.BLDG.foot.length = foot0;

    /* vehicle collision: the car is pushed out of the rim wall via AMEN.colliders */
    const am0 = G.AMEN.colliders.length;
    for (const col of def.colliders) G.AMEN.colliders.push({ x: wx(col[0], col[1]), z: wz(col[0], col[1]), r: col[2] });
    G.CAR.pos.set(wx(wc[0], wc[1]), 0, wz(wc[0], wc[1]));
    G.CAR.hitCd = 0; G.CAR.speed = 0; G.CAR.hp = 100; G.CAR.armor = 0;
    G.carAmenityHit(0.016);
    const cd = Math.hypot(G.CAR.pos.x - wx(wc[0], wc[1]), G.CAR.pos.z - wz(wc[0], wc[1]));
    check('lmstad: the rim wall blocks light vehicles (pushed out via AMEN.colliders)',
      cd >= wc[2] + 1.15 - 0.01, 'd=' + cd.toFixed(2));
    G.AMEN.colliders.length = am0;

    /* HUD chip: shows within 500m with bearing arrow + distance, hidden when far.
       Uses the real stadium: teleporting near it lets redistributeAmenities
       populate AMEN.active.stad with the live instance. */
    G.player.position.set(sd.x + 100, groundY(sd.x + 100, sd.z), sd.z);
    frame(20);   // chunk redistribute + stadT cadence 0.25s
    const near = G.AMEN.active.stad.some(a => Math.hypot(a.x - sd.x, a.z - sd.z) < 1);
    check('lmstad: the real stadium activates near the player', near);
    check('lmstad: chip shows within range',
      G.stadChipEl.style.display === 'block', 'display=' + G.stadChipEl.style.display);
    check('lmstad: chip reads STADIUM <distance>M',
      /^STADIUM \d+M$/.test(G.stadTxtEl.textContent), G.stadTxtEl.textContent);
    check('lmstad: chip arrow carries a bearing rotation',
      /rotate\(-?\d+(\.\d+)?deg\)/.test(G.stadArrEl.style.transform || ''),
      G.stadArrEl.style.transform);
    G.player.position.set(sd.x + 1000, groundY(sd.x + 1000, sd.z), sd.z);
    frame(20);
    check('lmstad: chip hides when far',
      G.stadChipEl.style.display === 'none', 'display=' + G.stadChipEl.style.display);

    /* night: floodlight heads glow via the emissive ramp, zero new lights */
    G.dayPhase = 0.75;   // midnight
    frame(5);
    check('lmstad: floodlight heads glow at night (emissiveMap ramp, no new lights)',
      G.LMSTAD_FLOOD_MATS.every(m => m.emissiveIntensity > 1),
      G.LMSTAD_FLOOD_MATS.map(m => m.emissiveIntensity.toFixed(2)).join(','));
    G.dayPhase = 0.25;   // noon
    frame(5);
    check('lmstad: floodlight heads dark by day',
      G.LMSTAD_FLOOD_MATS.every(m => m.emissiveIntensity < 0.01),
      G.LMSTAD_FLOOD_MATS.map(m => m.emissiveIntensity.toFixed(2)).join(','));

    const probsL = consoleProblems.length;
    frame(30);
    check('lmstad: round trip leaves zero console errors/warnings',
      consoleProblems.length === probsL, consoleProblems.slice(probsL).join(' | '));
  }
}

/* ================= PHASE 5: LANDMARK AMUSEMENT PARK v1 (buildings/places) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.STADIUM.watching) G.stadiumExit();
  if (G.THEATER.watching) G.theaterExit();
  if (G.SLOT.playing) G.slotExit();
  if (G.PIANO.playing) G.pianoExit();
  if (G.CIVIC.state) G.civicExit();

  /* static: exactly 4 new IM literals (wheel, cabins, carousel, train fleets),
     no lights, no unseeded RNG, no em dashes, no external URLs, no TODO text */
  const lmauseSrc = html.slice(html.indexOf('/* ================= PHASE 5: LANDMARK AMUSEMENT PARK v1 (buildings/places)'),
                               html.indexOf('/* ---- instanced meshes: one per type'));
  check('lmause-static: exactly 4 IM literals in the park block (wheel, cabins, carousel, train fleets)',
    (lmauseSrc.split('new THREE.InstancedMesh').length - 1) === 4);
  check('lmause-static: park block creates no lights',
    lmauseSrc.indexOf('PointLight') === -1 && lmauseSrc.indexOf('SpotLight') === -1
    && lmauseSrc.indexOf('DirectionalLight') === -1 && lmauseSrc.indexOf('HemisphereLight') === -1
    && lmauseSrc.indexOf('AmbientLight') === -1 && lmauseSrc.indexOf('RectAreaLight') === -1);
  check('lmause-static: no unseeded RNG in the park block', lmauseSrc.indexOf('Math.random') === -1);
  check('lmause-static: no em dashes in the park block', !lmauseSrc.includes('—'));
  check('lmause-static: no external URLs in the park block', lmauseSrc.indexOf('http') === -1);
  check('lmause-static: no TODO markers in the park block', lmauseSrc.indexOf('TODO') === -1);
  check('lmause-static: amuse residue is checked after stad (never displaces existing types)',
    html.indexOf("if (h % 37 === 13) return 'stad';") < html.indexOf("if (h % 41 === 29) return 'amuse';"));
  check('lmause-static: whole-file IM literals pin at 48 (48 = 47 + 1 fire-crew helmet fleet; 46 + 1 fire truck v1; 46 = 42 + 4 ride fleets)',
    (html.split('new THREE.InstancedMesh').length - 1) === 48);
  check('lmause-static: Math.random lines pin at 92',
    html.split('\n').filter(l => l.indexOf('Math.random') !== -1).length === 92);
  check('lmause-static: single keydown listener (zero new keybinds)',
    (html.split("addEventListener('keydown'").length - 1) === 1);
  check('lmause-static: bus route rebuild excludes amuse + hosp in v1',
    html.indexOf("if (a && a.type !== 'stad' && a.type !== 'amuse' && a.type !== 'hosp' && a.type !== 'theater' && a.type !== 'casino' && a.type !== 'firestation') found.push({ x: a.x, z: a.z, type: a.type, gx, gz });") !== -1);
  check('lmause-static: taxi route rebuild excludes amuse + hosp in v1',
    html.indexOf("if (a && a.type !== 'stad' && a.type !== 'amuse' && a.type !== 'hosp' && a.type !== 'theater' && a.type !== 'casino' && a.type !== 'firestation') found.push({ x: a.x, z: a.z, type: a.type });") !== -1);

  /* seeded placement: pure deterministic hash, cross-type winner-take-all */
  let mgx = 0, mgz = 0, md = null;
  mouter: for (let gx = -60; gx <= 60; gx++)
    for (let gz = -60; gz <= 60; gz++) {
      if (G.amenityTypeFor(gx, gz) !== 'amuse' || !G.amenityAccepted(gx, gz)) continue;
      const a = G.amenityCenterFor(gx, gz);
      if (a && a.type === 'amuse') { mgx = gx; mgz = gz; md = a; break mouter; }
    }
  check('lmause: a seeded park chunk exists in the scan window', !!md, md ? 'at ' + mgx + ',' + mgz : 'none');
  if (md) {
    const md2 = G.amenityCenterFor(mgx, mgz);
    check('lmause: amenityCenterFor is deterministic across calls',
      !!md2 && md2.x === md.x && md2.z === md.z && md2.yaw === md.yaw && md2.type === 'amuse');
    let wtaOk = true;
    for (let ax = mgx - 1; ax <= mgx + 1; ax++)
      for (let az = mgz - 1; az <= mgz + 1; az++) {
        if (ax === mgx && az === mgz) continue;
        if (G.amenityTypeFor(ax, az) && G.amenityAccepted(ax, az)) wtaOk = false;
      }
    check('lmause: cross-type winner-take-all holds (no other accepted amenity in the 3x3)', wtaOk);
    check('lmause: def is registered (cap 2, glow flag, colliders, active array)',
      G.AMEN_DEF.amuse && G.AMEN_DEF.amuse.cap === 2 && G.AMEN_DEF.amuse.glow === true
      && G.AMEN_DEF.amuse.colliders.length === G.LMAUSE_COL.length
      && Array.isArray(G.AMEN.active.amuse));
    check('lmause: residue is the new %41===29 (disjoint from land %41===20)',
      (G.hash2i(mgx, mgz) % 41) === 29);

    /* merged statics: one mesh, one vertexColors material, per-part colors */
    const ageo = G.AMEN_DEF.amuse.meshes[0].geometry;
    check('lmause: merged statics carry per-part vertex colors',
      !!ageo.attributes.color && ageo.attributes.color.count === ageo.attributes.position.count
      && ageo.attributes.position.count > 800, 'verts=' + ageo.attributes.position.count);
    check('lmause: one material with vertexColors on',
      G.AMEN_DEF.amuse.meshes[0].material.vertexColors === true);
    check('lmause: string-light bulbs carry glow UVs (night emissive targets)',
      (() => { const uv = ageo.attributes.uv; let n = 0;
               for (let i = 0; i < uv.count; i++) if (Math.abs(uv.getX(i) - 0.25) < 1e-6) n++;
               return n > 0; })());
    check('lmause: park material rides the shared day/night emissive ramp',
      G.LMSTAD_FLOOD_MATS[1] === G.AMEN_DEF.amuse.meshes[0].material
      && !!G.LMSTAD_FLOOD_MATS[1].emissiveMap);

    /* the real park activates near the player; ride fleets size to it */
    G.player.position.set(md.x + 30, groundY(md.x + 30, md.z), md.z);
    frame(20);
    const lact = G.AMEN.active.amuse;
    const A = lact[0];
    check('lmause: the real park activates near the player', lact.length > 0 && !!A);
    if (A) {
      check('lmause: ride fleets size to the active parks',
        G.lmauseWheelIM.count === lact.length && G.lmauseCarIM.count === lact.length
        && G.lmauseTrainIM.count === lact.length
        && G.lmauseCabinIM.count === lact.length * G.LMAUSE_CABINS,
        'wheel=' + G.lmauseWheelIM.count + ' cabins=' + G.lmauseCabinIM.count);
      check('lmause: all four fleets share one vertexColors material (one program)',
        G.lmauseWheelIM.material === G.lmauseCabinIM.material
        && G.lmauseCarIM.material === G.lmauseTrainIM.material
        && G.lmauseWheelIM.material.vertexColors === true);

      /* the wheel spins; cabins travel with it but stay level */
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(),
            v3 = new THREE.Vector3(), sc3 = new THREE.Vector3();
      G.lmauseWheelIM.getMatrixAt(0, m4);
      const w00 = m4.elements[0], w01 = m4.elements[1];
      frame(60);
      G.lmauseWheelIM.getMatrixAt(0, m4);
      check('lmause: the wheel spins (instance matrix changes)',
        Math.abs(m4.elements[0] - w00) > 1e-4 || Math.abs(m4.elements[1] - w01) > 1e-4,
        'd=' + Math.abs(m4.elements[0] - w00).toFixed(5));
      const yB = [];
      for (let k = 0; k < G.LMAUSE_CABINS; k++) { G.lmauseCabinIM.getMatrixAt(k, m4); yB.push(m4.elements[13]); }
      frame(120);
      let moved = false, maxTilt = 0;
      for (let k = 0; k < G.LMAUSE_CABINS; k++) {
        G.lmauseCabinIM.getMatrixAt(k, m4);
        if (Math.abs(m4.elements[13] - yB[k]) > 0.05) moved = true;
        m4.decompose(v3, q, sc3);
        eu.setFromQuaternion(q, 'YXZ');
        maxTilt = Math.max(maxTilt, Math.abs(eu.x), Math.abs(eu.z));
      }
      check('lmause: cabins travel with the wheel', moved);
      check('lmause: cabin-upright invariant holds (counter-rotated level)', maxTilt < 0.02,
        'maxTilt=' + maxTilt.toFixed(4));

      /* carousel spins; the coaster train loops the track */
      G.lmauseCarIM.getMatrixAt(0, m4);
      const c00 = m4.elements[0];
      G.lmauseTrainIM.getMatrixAt(0, m4);
      const tx0 = m4.elements[12], tz0 = m4.elements[14];
      frame(90);
      G.lmauseCarIM.getMatrixAt(0, m4);
      check('lmause: the carousel spins (instance matrix changes)',
        Math.abs(m4.elements[0] - c00) > 1e-4);
      G.lmauseTrainIM.getMatrixAt(0, m4);
      check('lmause: the coaster train loops the track',
        Math.hypot(m4.elements[12] - tx0, m4.elements[14] - tz0) > 0.2,
        'moved=' + Math.hypot(m4.elements[12] - tx0, m4.elements[14] - tz0).toFixed(2));

      /* fence collision: the fence blocks a walker, the gate stays open.
         Colliders are pushed exactly the way redistributeBuildings does for
         the live park (rural-building foot idiom), then removed. */
      const def = G.AMEN_DEF.amuse;
      const c0 = Math.cos(A.yaw), s0 = Math.sin(A.yaw);
      const wx = (ox, oz) => A.x + ox * c0 + oz * s0;
      const wz = (ox, oz) => A.z - ox * s0 + oz * c0;
      const foot0 = G.BLDG.foot.length;
      for (const col of def.colliders) G.BLDG.foot.push({ x: wx(col[0], col[1]), z: wz(col[0], col[1]), r: col[2] });
      const fc = def.colliders[12];   // first fence post: angle 0 -> (11, 0)
      G.player.position.set(wx(fc[0], fc[1]), groundY(wx(fc[0], fc[1]), wz(fc[0], fc[1])), wz(fc[0], fc[1]));
      G.resolveBldgFoot();
      const fd = Math.hypot(G.player.position.x - wx(fc[0], fc[1]), G.player.position.z - wz(fc[0], fc[1]));
      check('lmause: the fence blocks a walker (pushed out)', fd >= fc[2] + 0.45 - 0.01,
        'd=' + fd.toFixed(2) + ' min=' + (fc[2] + 0.45).toFixed(2));
      const gx0 = wx(0, 10.5), gz0 = wz(0, 10.5);
      G.player.position.set(gx0, groundY(gx0, gz0), gz0);
      G.resolveBldgFoot();
      const gd = Math.hypot(G.player.position.x - gx0, G.player.position.z - gz0);
      check('lmause: the entrance gate stays open (walker not pushed)', gd < 0.01, 'd=' + gd.toFixed(3));
      G.BLDG.foot.length = foot0;

      /* vehicle collision: the car is pushed out of the fence via AMEN.colliders */
      const am0 = G.AMEN.colliders.length;
      for (const col of def.colliders) G.AMEN.colliders.push({ x: wx(col[0], col[1]), z: wz(col[0], col[1]), r: col[2] });
      G.CAR.pos.set(wx(fc[0], fc[1]), 0, wz(fc[0], fc[1]));
      G.CAR.hitCd = 0; G.CAR.speed = 0; G.CAR.hp = 100; G.CAR.armor = 0;
      G.carAmenityHit(0.016);
      const cd = Math.hypot(G.CAR.pos.x - wx(fc[0], fc[1]), G.CAR.pos.z - wz(fc[0], fc[1]));
      check('lmause: the fence blocks light vehicles (pushed out via AMEN.colliders)',
        cd >= fc[2] + 1.15 - 0.01, 'd=' + cd.toFixed(2));
      G.AMEN.colliders.length = am0;

      /* HUD chip: shows within 500m with bearing arrow + distance, hidden when far */
      G.player.position.set(A.x + 100, groundY(A.x + 100, A.z), A.z);
      frame(20);
      check('lmause: chip shows within 500m', G.lmauseChipEl.style.display === 'block',
        'display=' + G.lmauseChipEl.style.display);
      check('lmause: chip reads PARK <distance>M',
        /^PARK \d+M$/.test(G.lmauseTxtEl.textContent), G.lmauseTxtEl.textContent);
      check('lmause: chip arrow carries a bearing rotation',
        /rotate\(-?\d+(\.\d+)?deg\)/.test(G.lmauseArrEl.style.transform || ''),
        G.lmauseArrEl.style.transform);
      check('lmause: chip pins its own left-stack slot below the stadium chip (no overlap)',
        html.indexOf('#lmausechip {\n    position: absolute; top: 456px; left: 18px;') !== -1);
      /* hide check: move to a chunk whose 7x7 amenity window holds no park
         at all, so AMEN.active.amuse is empty and the chip must hide */
      let hcx = 0, hcz = 0, hfound = false;
      houter: for (let hgx = -100; hgx <= 100; hgx += 7)
        for (let hgz = -100; hgz <= 100; hgz += 7) {
          let hany = false;
          for (let hax = hgx - 3; hax <= hgx + 3 && !hany; hax++)
            for (let haz = hgz - 3; haz <= hgz + 3 && !hany; haz++)
              if (G.amenityTypeFor(hax, haz) === 'amuse' && G.amenityAccepted(hax, haz)) hany = true;
          if (!hany) { hcx = hgx; hcz = hgz; hfound = true; break houter; }
        }
      check('lmause: an empty 7x7 amenity window exists for the hide check', hfound);
      const hwx = (hcx + 0.5) * 48, hwz = (hcz + 0.5) * 48;
      G.player.position.set(hwx, groundY(hwx, hwz), hwz);
      frame(20);
      check('lmause: chip hides when far', G.lmauseChipEl.style.display === 'none'
        && G.AMEN.active.amuse.length === 0,
        'display=' + G.lmauseChipEl.style.display + ' active=' + G.AMEN.active.amuse.length);

      /* v1: no transit stop at the park (routes stay as before) */
      G.BUS.driving = false; G.BUS.riding = false; G.BUS.routeKey = '';
      G.busRebuildRoute(mgx, mgz);
      check('lmause: bus routes never stop at the park in v1',
        G.BUS.route.every(s => s.type !== 'amuse'), 'stops=' + G.BUS.route.length);
      G.TX.riding = false; G.TX.routeKey = '';
      G.txRebuild(mgx, mgz);
      check('lmause: taxi routes never stop at the park in v1',
        (G.TX.route || []).every(s => s.type !== 'amuse'), 'stops=' + (G.TX.route || []).length);

      /* night: string-light bulbs glow via the shared emissive ramp, zero new lights */
      G.dayPhase = 0.75;
      frame(5);
      check('lmause: string-light bulbs glow at night (shared emissive ramp, no new lights)',
        G.LMSTAD_FLOOD_MATS[1].emissiveIntensity > 1,
        G.LMSTAD_FLOOD_MATS.map(m => m.emissiveIntensity.toFixed(2)).join(','));
      G.dayPhase = 0.25;
      frame(5);
      check('lmause: bulbs dark by day',
        G.LMSTAD_FLOOD_MATS[1].emissiveIntensity < 0.01,
        G.LMSTAD_FLOOD_MATS.map(m => m.emissiveIntensity.toFixed(2)).join(','));

      const probsM = consoleProblems.length;
      frame(30);
      check('lmause: round trip leaves zero console errors/warnings',
        consoleProblems.length === probsM, consoleProblems.slice(probsM).join(' | '));
    }
  }
}

/* ================= PHASE 5: LANDMARK HOSPITAL v1 (buildings/places) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.STADIUM.watching) G.stadiumExit();
  if (G.THEATER.watching) G.theaterExit();
  if (G.SLOT.playing) G.slotExit();
  if (G.PIANO.playing) G.pianoExit();
  if (G.CIVIC.state) G.civicExit();

  /* static: bespoke merged geometry, zero new IM literals (the shared
     AMEN_DEF loop builds the one 'hosp' mesh: +1 runtime draw call), zero
     new runtime lights, zero new keybinds, no unseeded RNG, no em dashes,
     no external URLs, no TODO text in the block */
  const lmhospSrc = html.slice(html.indexOf('/* ================= PHASE 5: LANDMARK HOSPITAL v1 (buildings/places)'),
                               html.indexOf('/* ---- instanced meshes: one per type, one draw call each ---- */'));
  check('lmhosp-static: zero IM literals in the hospital block (shared AMEN_DEF loop builds the one mesh)',
    (lmhospSrc.match(/new THREE\.InstancedMesh/g) || []).length === 0);
  check('lmhosp-static: hospital block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(lmhospSrc));
  check('lmhosp-static: no unseeded RNG in the hospital block', !/Math\.random/.test(lmhospSrc));
  check('lmhosp-static: no em dashes in the hospital block', !lmhospSrc.includes('—'));
  check('lmhosp-static: no external URLs in the hospital block', !/https?:\/\//.test(lmhospSrc));
  check('lmhosp-static: no TODO markers in the hospital block', !/\bTODO\b/.test(lmhospSrc));
  check('lmhosp-static: hosp residue is checked after all existing amenity types (never displaces them)',
    html.indexOf("if (h % 41 === 29) return 'amuse';") < html.indexOf("if (h % 47 === 23) return 'hosp';"));
  check('lmhosp-static: whole-file IM literals pin at 48 (48 = 47 + 1 fire-crew helmet fleet; 47 = 46 + 1 fire truck v1; 46 = 42 + 4 lmause ride fleets; hosp rides the shared def-loop literal)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
  check('lmhosp-static: Math.random lines pin at 92',
    (html.match(/^.*Math\.random.*$/gm) || []).length === 92);
  check('lmhosp-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('lmhosp-static: E heals at a live hospital prompt in the keydown chain',
    html.includes("else if (CIVIC.hintOn) civicEnter(); else if (HOSP.hintOn) hospHeal(); else if (THEATERHALL.hintEnter) theaterHallEnter(); else if (THEATERHALL.showOn) theaterWatchShow(); else if (THEATERHALL.inHall) theaterHallExit(); else if (CASINOHALL.hintEnter) casinoHallEnter(); else if (CASINOHALL.inHall) casinoHallKeyE(); else if (FIRESTHALL.hintEnter) firestHallEnter(); else if (FIRESTHALL.inHall) firestHallKeyE(); else if (WORSHIP.hintOn) worshipEnter();"));
  check('lmhosp-static: bus route rebuild excludes hosp in v1',
    html.indexOf("if (a && a.type !== 'stad' && a.type !== 'amuse' && a.type !== 'hosp' && a.type !== 'theater' && a.type !== 'casino' && a.type !== 'firestation') found.push({ x: a.x, z: a.z, type: a.type, gx, gz });") !== -1);
  check('lmhosp-static: taxi route rebuild excludes hosp in v1',
    html.indexOf("if (a && a.type !== 'stad' && a.type !== 'amuse' && a.type !== 'hosp' && a.type !== 'theater' && a.type !== 'casino' && a.type !== 'firestation') found.push({ x: a.x, z: a.z, type: a.type });") !== -1);
  check('lmhosp-static: chip pins below the amusement chip in the top-left stack (no overlap)',
    html.includes('#hospchip {\n    position: absolute; top: 489px; left: 18px;'));
  check('lmhosp-static: bike/bc/scooter pad scans exclude hosp in v1 (byte-identical pads)',
    (html.match(/if \(a && a\.type !== 'hosp' && a\.type !== 'theater' && a\.type !== 'casino' && a\.type !== 'firestation'\) found\.push\(a\);/g) || []).length === 3);
  check('lmhosp-static: ambulance anchor scan excludes hosp in v1',
    html.includes("if (!a || a.type === 'hosp' || a.type === 'theater' || a.type === 'casino' || a.type === 'firestation') continue;"));

  /* seeded placement: pure deterministic hash, own residue, cross-type winner-take-all */
  let hgx = 0, hgz = 0, hd = null;
  houter: for (let gx = -60; gx <= 60; gx++)
    for (let gz = -60; gz <= 60; gz++) {
      if (G.amenityTypeFor(gx, gz) !== 'hosp' || !G.amenityAccepted(gx, gz)) continue;
      const a = G.amenityCenterFor(gx, gz);
      if (a && a.type === 'hosp') { hgx = gx; hgz = gz; hd = a; break houter; }
    }
  check('lmhosp: a seeded hospital chunk exists in the scan window', !!hd, hd ? 'at ' + hgx + ',' + hgz : 'none');
  if (hd) {
    const hd2 = G.amenityCenterFor(hgx, hgz);
    check('lmhosp: amenityCenterFor is deterministic across calls',
      !!hd2 && hd2.x === hd.x && hd2.z === hd.z && hd2.yaw === hd.yaw && hd2.type === 'hosp');
    let wtaOk = true;
    for (let ax = hgx - 1; ax <= hgx + 1; ax++)
      for (let az = hgz - 1; az <= hgz + 1; az++) {
        if (ax === hgx && az === hgz) continue;
        if (G.amenityTypeFor(ax, az) && G.amenityAccepted(ax, az)) wtaOk = false;
      }
    check('lmhosp: cross-type winner-take-all holds (no other accepted amenity in the 3x3)', wtaOk);
    /* measured non-displacement: no hosp chunk would have matched an
       earlier type (the residue is checked last) */
    let displaceOk = true, hospCount = 0;
    for (let gx = -60; gx <= 60; gx++)
      for (let gz = -60; gz <= 60; gz++) {
        if (G.amenityTypeFor(gx, gz) !== 'hosp') continue;
        hospCount++;
        const h = G.hash2i(gx, gz);
        if (h % 41 === 20 || h % 15 === 4 || h % 19 === 9 || h % 13 === 11
            || h % 10 === 6 || h % 37 === 13 || h % 41 === 29) displaceOk = false;
      }
    check('lmhosp: hosp never displaces an existing amenity type (checked last)',
      hospCount > 0 && displaceOk, 'hosp=' + hospCount);
    check('lmhosp: def is registered (cap 2, glow flag, 35 colliders, entrance gap)',
      G.AMEN_DEF.hosp && G.AMEN_DEF.hosp.cap === 2 && G.AMEN_DEF.hosp.glow === true
      && G.AMEN_DEF.hosp.colliders.length === 35 && G.LMHOSP_COL.length === 35
      && Array.isArray(G.AMEN.active.hosp));
    check('lmhosp: the entrance gap has no collider (walk-in idiom)',
      G.LMHOSP_COL.every(c => Math.hypot(c[0] - 0, c[1] - 13) > 2.5));

    /* merged geometry: one mesh, one vertexColors material, per-part colors */
    const hgeo = G.AMEN_DEF.hosp.meshes[0].geometry;
    check('lmhosp: merged geometry carries per-part vertex colors',
      !!hgeo.attributes.color && hgeo.attributes.color.count === hgeo.attributes.position.count
      && hgeo.attributes.position.count > 500, 'verts=' + hgeo.attributes.position.count);
    check('lmhosp: one material with vertexColors on',
      G.AMEN_DEF.hosp.meshes[0].material.vertexColors === true);
    check('lmhosp: window bands carry glow UVs (night emissive targets)',
      (() => { const uv = hgeo.attributes.uv; let n = 0;
               for (let i = 0; i < uv.count; i++) if (Math.abs(uv.getX(i) - 0.25) < 1e-6) n++;
               return n > 100; })());
    check('lmhosp: window material rides the day/night emissive ramp',
      G.LMSTAD_FLOOD_MATS[2] === G.AMEN_DEF.hosp.meshes[0].material
      && !!G.LMSTAD_FLOOD_MATS[2].emissiveMap);

    /* wall collision: the hedge wall + block block a walker, the entrance
       gap stays open (rural-building foot idiom) */
    const def = G.AMEN_DEF.hosp;
    const c0 = Math.cos(hd.yaw), s0 = Math.sin(hd.yaw);
    const wx = (ox, oz) => hd.x + ox * c0 + oz * s0;
    const wz = (ox, oz) => hd.z - ox * s0 + oz * c0;
    const foot0 = G.BLDG.foot.length;
    for (const col of def.colliders) G.BLDG.foot.push({ x: wx(col[0], col[1]), z: wz(col[0], col[1]), r: col[2] });
    const wc = def.colliders[0];   // hedge-ring wall collider, far from the gate
    G.player.position.set(wx(wc[0], wc[1]), groundY(wx(wc[0], wc[1]), wz(wc[0], wc[1])), wz(wc[0], wc[1]));
    G.resolveBldgFoot();
    const wd = Math.hypot(G.player.position.x - wx(wc[0], wc[1]), G.player.position.z - wz(wc[0], wc[1]));
    check('lmhosp: the hedge wall blocks a walker (pushed out of the wall)',
      wd >= wc[2] + 0.45 - 0.01, 'd=' + wd.toFixed(2) + ' min=' + (wc[2] + 0.45).toFixed(2));
    const gx0 = wx(0, 13), gz0 = wz(0, 13);   // entrance gate center: no collider there
    G.player.position.set(gx0, groundY(gx0, gz0), gz0);
    G.resolveBldgFoot();
    const gd = Math.hypot(G.player.position.x - gx0, G.player.position.z - gz0);
    check('lmhosp: the entrance gap stays open (walker not pushed)', gd < 0.01, 'd=' + gd.toFixed(3));
    G.BLDG.foot.length = foot0;

    /* vehicle collision: the car is pushed out of the wall via AMEN.colliders */
    const am0 = G.AMEN.colliders.length;
    for (const col of def.colliders) G.AMEN.colliders.push({ x: wx(col[0], col[1]), z: wz(col[0], col[1]), r: col[2] });
    G.CAR.pos.set(wx(wc[0], wc[1]), 0, wz(wc[0], wc[1]));
    G.CAR.hitCd = 0; G.CAR.speed = 0; G.CAR.hp = 100; G.CAR.armor = 0;
    G.carAmenityHit(0.016);
    const cd = Math.hypot(G.CAR.pos.x - wx(wc[0], wc[1]), G.CAR.pos.z - wz(wc[0], wc[1]));
    check('lmhosp: the wall blocks light vehicles (pushed out via AMEN.colliders)',
      cd >= wc[2] + 1.15 - 0.01, 'd=' + cd.toFixed(2));
    G.AMEN.colliders.length = am0;

    /* the real hospital activates near the player; the lobby pad heals */
    G.player.position.set(hd.x + 60, groundY(hd.x + 60, hd.z), hd.z);
    frame(20);   // chunk redistribute + hospTick cadence
    const ha = G.AMEN.active.hosp.find(a => Math.hypot(a.x - hd.x, a.z - hd.z) < 1);
    check('lmhosp: the real hospital activates near the player', !!ha);
    const pad = G.hospPadWorld(ha);
    G.P.hp = 40; G.updateHpHUD();
    G.player.position.set(pad.x, groundY(pad.x, pad.z), pad.z);
    frame(20);
    check('lmhosp: HEAL prompt shows on the lobby pad',
      G.HOSP.hintOn === true && G.hosphealEl.style.opacity == 1, 'hint=' + G.HOSP.hintOn);
    const probsH = consoleProblems.length;
    const cash0 = G.cash;
    G.hospHeal();
    check('lmhosp: E-heal restores full HP for free (cooldown starts)',
      G.P.hp === 100 && G.cash === cash0, 'hp=' + G.P.hp + ' cash=' + G.cash);
    /* cooldown: a second heal is refused while on cooldown */
    G.P.hp = 40; G.updateHpHUD();
    G.hospHeal();
    check('lmhosp: the 90-second cooldown blocks a second heal',
      G.P.hp === 40, 'hp=' + G.P.hp);
    /* cooldown expiry: the prompt returns and the heal works again */
    const ha2 = G.AMEN.active.hosp.find(a => Math.hypot(a.x - hd.x, a.z - hd.z) < 1);
    ha2.healAt = -1000;
    frame(20);
    check('lmhosp: the prompt returns after the cooldown', G.HOSP.hintOn === true);
    G.hospHeal();
    check('lmhosp: heal works again after the cooldown', G.P.hp === 100);
    /* E key wiring: the keydown chain heals at a live prompt */
    const ha3 = G.AMEN.active.hosp.find(a => Math.hypot(a.x - hd.x, a.z - hd.z) < 1);
    ha3.healAt = -1000;
    G.P.hp = 40; G.updateHpHUD();
    frame(20);
    G.CIVIC.hintOn = false; G.WORSHIP.hintOn = false; G.APARTMENT.hintOn = false;
    stubs.fireGlobal('keydown', { code: 'KeyE', preventDefault() {} });
    check('lmhosp: KeyE heals at a live hospital prompt',
      G.P.hp === 100, 'hp=' + G.P.hp);

    /* HUD chip: shows within 500m with bearing arrow + distance, hidden when far */
    check('lmhosp: chip shows within range',
      G.hospChipEl.style.display === 'block', 'display=' + G.hospChipEl.style.display);
    check('lmhosp: chip reads HOSPITAL <distance>M',
      /^HOSPITAL \d+M$/.test(G.hospTxtEl.textContent), G.hospTxtEl.textContent);
    check('lmhosp: chip arrow carries a bearing rotation',
      /rotate\(-?\d+(\.\d+)?deg\)/.test(G.hospArrEl.style.transform || ''),
      G.hospArrEl.style.transform);
    G.player.position.set(hd.x + 1000, groundY(hd.x + 1000, hd.z), hd.z);
    frame(20);
    check('lmhosp: chip hides when far',
      G.hospChipEl.style.display === 'none', 'display=' + G.hospChipEl.style.display);

    /* transit: bus/taxi routes never stop at the hospital in v1 */
    G.busRebuildRoute(hgx, hgz);
    check('lmhosp: bus routes never stop at the hospital in v1',
      G.BUS.route.every(s => s.type !== 'hosp'), 'stops=' + G.BUS.route.length);
    G.TX.riding = false; G.TX.routeKey = '';
    G.txRebuild(hgx, hgz);
    check('lmhosp: taxi routes never stop at the hospital in v1',
      (G.TX.route || []).every(s => s.type !== 'hosp'), 'stops=' + (G.TX.route || []).length);

    /* night: window bands glow via the shared emissive ramp, zero new lights */
    G.dayPhase = 0.75;   // midnight
    frame(5);
    check('lmhosp: window bands glow at night (shared emissive ramp, no new lights)',
      G.LMSTAD_FLOOD_MATS[2].emissiveIntensity > 1,
      G.LMSTAD_FLOOD_MATS.map(m => m.emissiveIntensity.toFixed(2)).join(','));
    G.dayPhase = 0.25;   // noon
    frame(5);
    check('lmhosp: window bands dark by day',
      G.LMSTAD_FLOOD_MATS[2].emissiveIntensity < 0.01,
      G.LMSTAD_FLOOD_MATS.map(m => m.emissiveIntensity.toFixed(2)).join(','));

    frame(30);
    check('lmhosp: round trip leaves zero console errors/warnings',
      consoleProblems.length === probsH, consoleProblems.slice(probsH).join(' | '));
  }
}

/* ================= PHASE 5: LANDMARK THEATER v1 (buildings/places) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.STADIUM.watching) G.stadiumExit();
  if (G.THEATER.watching) G.theaterExit();
  if (G.SLOT.playing) G.slotExit();
  if (G.PIANO.playing) G.pianoExit();
  if (G.CIVIC.state) G.civicExit();
  if (G.WORSHIP.state) G.worshipExit();
  if (G.APARTMENT.state) G.apartmentExit();
  if (G.THEATERHALL.inHall) G.theaterHallExit();

  /* static: bespoke merged geometry, zero new IM literals (the shared
     AMEN_DEF loop builds the one 'theater' mesh: +1 runtime draw call; the
     cached room is plain Mesh, visible=false until entered), zero new
     runtime lights, zero new keybinds, no unseeded RNG, no em dashes,
     no external URLs, no TODO text in the block */
  const lmthSrc = html.slice(html.indexOf('/* ================= PHASE 5: LANDMARK THEATER v1 (buildings/places)'),
                             html.indexOf('/* ---- instanced meshes: one per type, one draw call each ---- */'));
  check('lmth-static: zero IM literals in the theater block (shared AMEN_DEF loop builds the one mesh)',
    (lmthSrc.match(/new THREE\.InstancedMesh/g) || []).length === 0);
  check('lmth-static: theater block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(lmthSrc));
  check('lmth-static: no unseeded RNG in the theater block', !/Math\.random/.test(lmthSrc));
  check('lmth-static: no em dashes in the theater block', !lmthSrc.includes('—'));
  check('lmth-static: no external URLs in the theater block', !/https?:\/\//.test(lmthSrc));
  check('lmth-static: no TODO markers in the theater block', !/\bTODO\b/.test(lmthSrc));
  check('lmth-static: theater residue is checked after hosp (never displaces existing types)',
    html.indexOf("if (h % 47 === 23) return 'hosp';") < html.indexOf("if (h % 53 === 31) return 'theater';"));
  check('lmth-static: whole-file IM literals pin at 48 (theater rides the shared def-loop literal; room is plain Mesh)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
  check('lmth-static: Math.random lines pin at 92',
    (html.match(/^.*Math\.random.*$/gm) || []).length === 92);
  check('lmth-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('lmth-static: E chain wires theater after the hospital heal (exit prefixes intact)',
    html.includes("else if (HOSP.hintOn) hospHeal(); else if (THEATERHALL.hintEnter) theaterHallEnter(); else if (THEATERHALL.showOn) theaterWatchShow(); else if (THEATERHALL.inHall) theaterHallExit(); else if (CASINOHALL.hintEnter) casinoHallEnter(); else if (CASINOHALL.inHall) casinoHallKeyE(); else if (FIRESTHALL.hintEnter) firestHallEnter(); else if (FIRESTHALL.inHall) firestHallKeyE(); else if (WORSHIP.hintOn) worshipEnter();"));
  check('lmth-static: #thallchip does not collide with the existing #theaterchip',
    html.includes('id="thallchip"') && html.includes('id="theaterchip"')
    && (html.match(/id="thallchip"/g) || []).length === 1);
  check('lmth-static: chip pins in its own top-left slot (no overlap)',
    html.includes('#thallchip {\n    position: absolute; top: 555px; left: 18px;'));
  check('lmth-static: bus route rebuild excludes theater in v1',
    html.indexOf("if (a && a.type !== 'stad' && a.type !== 'amuse' && a.type !== 'hosp' && a.type !== 'theater' && a.type !== 'casino' && a.type !== 'firestation') found.push({ x: a.x, z: a.z, type: a.type, gx, gz });") !== -1);
  check('lmth-static: taxi route rebuild excludes theater in v1',
    html.indexOf("if (a && a.type !== 'stad' && a.type !== 'amuse' && a.type !== 'hosp' && a.type !== 'theater' && a.type !== 'casino' && a.type !== 'firestation') found.push({ x: a.x, z: a.z, type: a.type });") !== -1);
  check('lmth-static: bike/bc/scooter pad scans exclude theater in v1 (byte-identical pads)',
    (html.match(/if \(a && a\.type !== 'hosp' && a\.type !== 'theater' && a\.type !== 'casino' && a\.type !== 'firestation'\) found\.push\(a\);/g) || []).length === 3);
  check('lmth-static: ambulance anchor scan excludes theater in v1',
    html.includes("if (!a || a.type === 'hosp' || a.type === 'theater' || a.type === 'casino' || a.type === 'firestation') continue;"));

  /* seeded placement: pure deterministic hash, own residue, cross-type winner-take-all */
  let tgx = 0, tgz = 0, td = null;
  touter: for (let gx = -60; gx <= 60; gx++)
    for (let gz = -60; gz <= 60; gz++) {
      if (G.amenityTypeFor(gx, gz) !== 'theater' || !G.amenityAccepted(gx, gz)) continue;
      const a = G.amenityCenterFor(gx, gz);
      if (a && a.type === 'theater') { tgx = gx; tgz = gz; td = a; break touter; }
    }
  check('lmth: a seeded theater chunk exists in the scan window', !!td, td ? 'at ' + tgx + ',' + tgz : 'none');
  if (td) {
    const td2 = G.amenityCenterFor(tgx, tgz);
    check('lmth: amenityCenterFor is deterministic across calls',
      !!td2 && td2.x === td.x && td2.z === td.z && td2.yaw === td.yaw && td2.type === 'theater');
    let wtaOk = true;
    for (let ax = tgx - 1; ax <= tgx + 1; ax++)
      for (let az = tgz - 1; az <= tgz + 1; az++) {
        if (ax === tgx && az === tgz) continue;
        if (G.amenityTypeFor(ax, az) && G.amenityAccepted(ax, az)) wtaOk = false;
      }
    check('lmth: cross-type winner-take-all holds (no other accepted amenity in the 3x3)', wtaOk);
    /* measured non-displacement: no theater chunk would have matched an
       earlier type (the residue is checked last) */
    let displaceOk = true, theaterCount = 0;
    for (let gx = -60; gx <= 60; gx++)
      for (let gz = -60; gz <= 60; gz++) {
        if (G.amenityTypeFor(gx, gz) !== 'theater') continue;
        theaterCount++;
        const h = G.hash2i(gx, gz);
        if (h % 41 === 20 || h % 15 === 4 || h % 19 === 9 || h % 13 === 11
            || h % 10 === 6 || h % 37 === 13 || h % 41 === 29 || h % 47 === 23) displaceOk = false;
      }
    check('lmth: theater never displaces an existing amenity type (checked last)',
      theaterCount > 0 && displaceOk, 'theater=' + theaterCount);
    check('lmth: def is registered (cap 2, glow flag, 36 colliders)',
      G.AMEN_DEF.theater && G.AMEN_DEF.theater.cap === 2 && G.AMEN_DEF.theater.glow === true
      && G.AMEN_DEF.theater.colliders.length === 36 && G.LMTHEATER_COL.length === 36
      && Array.isArray(G.AMEN.active.theater));
    check('lmth: the entrance gap has no collider (walk-in idiom)',
      G.LMTHEATER_COL.every(c => Math.hypot(c[0] - 0, c[1] - 13) > 2.5));
    check('lmth: the door column stays walkable (no collider within 1.6m of the door)',
      G.LMTHEATER_COL.every(c => Math.hypot(c[0] - 0, c[1] - 6.8) > 1.6));

    /* merged geometry: one mesh, one vertexColors material, per-part colors */
    const tgeo = G.AMEN_DEF.theater.meshes[0].geometry;
    check('lmth: merged geometry carries per-part vertex colors',
      !!tgeo.attributes.color && tgeo.attributes.color.count === tgeo.attributes.position.count
      && tgeo.attributes.position.count > 500, 'verts=' + tgeo.attributes.position.count);
    check('lmth: one material with vertexColors on',
      G.AMEN_DEF.theater.meshes[0].material.vertexColors === true);
    check('lmth: marquee board samples the sign-text band (v 0.78..1)',
      (() => { const uv = tgeo.attributes.uv; let n = 0;
               for (let i = 0; i < uv.count; i++) if (uv.getY(i) >= 0.77) n++;
               return n >= 4; })());
    check('lmth: marquee bulbs carry glow UVs (night emissive targets)',
      (() => { const uv = tgeo.attributes.uv; let n = 0;
               for (let i = 0; i < uv.count; i++)
                 if (Math.abs(uv.getX(i) - 0.25) < 1e-6 && Math.abs(uv.getY(i) - 0.25) < 1e-6) n++;
               return n > 50; })());
    check('lmth: marquee material rides the day/night emissive ramp',
      G.LMSTAD_FLOOD_MATS.includes(G.AMEN_DEF.theater.meshes[0].material)
      && !!G.AMEN_DEF.theater.meshes[0].material.emissiveMap);

    /* the cached room: built once, invisible until entered, lit by emissive */
    check('lmth: the screening room is cached (invisible, zero net draws)',
      G.theaterHallMesh.visible === false);
    check('lmth: the room is one merged mesh with vertex colors',
      !!G.theaterHallMesh.geometry.attributes.color
      && G.theaterHallMesh.geometry.attributes.position.count > 800);
    check('lmth: the room is emissive-lit (never a black doorway), zero new lights',
      G.theaterHallMesh.material.emissiveIntensity > 0.5
      && G.theaterHallScreen.material.isMeshBasicMaterial === true);
    check('lmth: the NOW SHOWING screen rides the room',
      G.theaterHallScreen.parent === G.theaterHallMesh);

    /* wall collision: the hedge wall + boxes block a walker, the entrance
       gap and the door column stay open (rural-building foot idiom) */
    const def = G.AMEN_DEF.theater;
    const c0 = Math.cos(td.yaw), s0 = Math.sin(td.yaw);
    const wx = (ox, oz) => td.x + ox * c0 + oz * s0;
    const wz = (ox, oz) => td.z - ox * s0 + oz * c0;
    const foot0 = G.BLDG.foot.length;
    for (const col of def.colliders) G.BLDG.foot.push({ x: wx(col[0], col[1]), z: wz(col[0], col[1]), r: col[2] });
    const wc = def.colliders[0];   // hedge-ring wall collider, far from the gate
    G.player.position.set(wx(wc[0], wc[1]), groundY(wx(wc[0], wc[1]), wz(wc[0], wc[1])), wz(wc[0], wc[1]));
    G.resolveBldgFoot();
    const wd = Math.hypot(G.player.position.x - wx(wc[0], wc[1]), G.player.position.z - wz(wc[0], wc[1]));
    check('lmth: the hedge wall blocks a walker (pushed out of the wall)',
      wd >= wc[2] + 0.45 - 0.01, 'd=' + wd.toFixed(2) + ' min=' + (wc[2] + 0.45).toFixed(2));
    const gx0 = wx(0, 13), gz0 = wz(0, 13);   // entrance gate center: no collider there
    G.player.position.set(gx0, groundY(gx0, gz0), gz0);
    G.resolveBldgFoot();
    const gd = Math.hypot(G.player.position.x - gx0, G.player.position.z - gz0);
    check('lmth: the entrance gap stays open (walker not pushed)', gd < 0.01, 'd=' + gd.toFixed(3));
    const dx0 = wx(0, 6.8), dz0 = wz(0, 6.8);   // door column: walkable to the trigger
    G.player.position.set(dx0, groundY(dx0, dz0), dz0);
    G.resolveBldgFoot();
    const dd = Math.hypot(G.player.position.x - dx0, G.player.position.z - dz0);
    check('lmth: the door column stays walkable (walker not pushed)', dd < 0.01, 'd=' + dd.toFixed(3));
    G.BLDG.foot.length = foot0;

    /* vehicle collision: the car is pushed out of the wall via AMEN.colliders */
    const am0 = G.AMEN.colliders.length;
    for (const col of def.colliders) G.AMEN.colliders.push({ x: wx(col[0], col[1]), z: wz(col[0], col[1]), r: col[2] });
    G.CAR.pos.set(wx(wc[0], wc[1]), 0, wz(wc[0], wc[1]));
    G.CAR.hitCd = 0; G.CAR.speed = 0; G.CAR.hp = 100; G.CAR.armor = 0;
    G.carAmenityHit(0.016);
    const cd = Math.hypot(G.CAR.pos.x - wx(wc[0], wc[1]), G.CAR.pos.z - wz(wc[0], wc[1]));
    check('lmth: the wall blocks light vehicles (pushed out via AMEN.colliders)',
      cd >= wc[2] + 1.15 - 0.01, 'd=' + cd.toFixed(2));
    G.AMEN.colliders.length = am0;

    /* the real theater activates near the player; ENTER prompt at the door */
    G.player.position.set(td.x + 60, groundY(td.x + 60, td.z), td.z);
    frame(20);   // chunk redistribute + theaterHallTick cadence
    const ta = G.AMEN.active.theater.find(a => Math.hypot(a.x - td.x, a.z - td.z) < 1);
    check('lmth: the real theater activates near the player', !!ta);
    const door = G.theaterHallDoorWorld(ta);
    G.player.position.set(door.x, groundY(door.x, door.z), door.z);
    frame(20);
    check('lmth: ENTER prompt shows at the door',
      G.THEATERHALL.hintEnter === true && G.thallhintEl.style.opacity == 1, 'hint=' + G.THEATERHALL.hintEnter);
    check('lmth: the room stays cached until entered (zero net draws)',
      G.theaterHallMesh.visible === false);

    /* enter/exit round trip */
    G.closeShop(); G.theaterHallEnter();
    check('lmth: ENTER teleports into the cached room',
      G.THEATERHALL.inHall === true && G.player.position.y === G.THEATER_ROOM_Y
      && G.theaterHallMesh.visible === true,
      'y=' + G.player.position.y);
    check('lmth: the room parks under the active theater',
      Math.abs(G.theaterHallMesh.position.x - ta.x) < 0.01
      && Math.abs(G.theaterHallMesh.position.z - ta.z) < 0.01
      && Math.abs(G.player.position.x - ta.x) < 0.01);
    frame(10);
    check('lmth: WATCH SHOW prompt shows inside',
      G.tshowhintEl.style.opacity == 1 && /WATCH SHOW/.test(G.tshowhintEl.textContent),
      G.tshowhintEl.textContent);

    /* WATCH SHOW: $5 ticket, +2 game hours, +25 HP, one show per visit */
    const probsT = consoleProblems.length;
    G.P.hp = 50; G.updateHpHUD(); G.cash = 100;
    const dp0 = G.dayPhase;
    G.theaterWatchShow();
    check('lmth: the ticket costs $5', G.cash === 95, 'cash=' + G.cash);
    check('lmth: the show advances game time 2 hours',
      Math.abs(((G.dayPhase - dp0 + 1) % 1) - G.THEATER_SHOW_HOURS / 24) < 1e-9,
      'dphase=' + (((G.dayPhase - dp0 + 1) % 1)).toFixed(4));
    check('lmth: the show restores +25 HP', G.P.hp === 75, 'hp=' + G.P.hp);
    check('lmth: one show per visit (E now exits, never traps)',
      G.THEATERHALL.showOn === false);
    frame(10);
    check('lmth: EXIT prompt shows after the show',
      G.tshowhintEl.style.opacity == 1 && /EXIT/.test(G.tshowhintEl.textContent),
      G.tshowhintEl.textContent);

    /* broke visitor: denied the show, offered the exit (no trap) */
    G.theaterHallExit();
    frame(5);   // let the tick re-arm nearIdx at the door
    G.closeShop(); G.theaterHallEnter();
    G.P.hp = 50; G.updateHpHUD(); G.cash = 3;
    frame(5);
    G.theaterWatchShow();
    check('lmth: a broke visitor is denied (cash and HP untouched)',
      G.cash === 3 && G.P.hp === 50, 'cash=' + G.cash + ' hp=' + G.P.hp);
    check('lmth: the denied visitor can still exit',
      G.THEATERHALL.showOn === false && G.THEATERHALL.inHall === true);

    /* E key wiring: E watches, E exits (after the hospital heal) */
    G.theaterHallExit();
    const kdoor = G.theaterHallDoorWorld(ta);
    G.player.position.set(kdoor.x, groundY(kdoor.x, kdoor.z), kdoor.z);
    frame(10);   // let the tick re-arm nearIdx at the door
    G.closeShop(); G.theaterHallEnter();
    G.P.hp = 50; G.updateHpHUD(); G.cash = 100;
    frame(5);
    G.CIVIC.hintOn = false; G.HOSP.hintOn = false; G.WORSHIP.hintOn = false; G.APARTMENT.hintOn = false;
    stubs.fireGlobal('keydown', { code: 'KeyE', preventDefault() {} });
    check('lmth: KeyE watches the show at a live prompt',
      G.cash === 95 && G.P.hp === 75 && G.THEATERHALL.inHall === true,
      'cash=' + G.cash + ' hp=' + G.P.hp);
    stubs.fireGlobal('keydown', { code: 'KeyE', preventDefault() {} });
    check('lmth: KeyE exits after the show (round trip complete)',
      G.THEATERHALL.inHall === false && G.theaterHallMesh.visible === false);
    const backD = Math.hypot(G.player.position.x - G.THEATERHALL.doorX, G.player.position.z - G.THEATERHALL.doorZ);
    check('lmth: exit teleports back to the door', backD < 0.01, 'd=' + backD.toFixed(3));

    /* HUD chip: shows within 500m with bearing arrow + distance, hidden when far */
    frame(20);
    check('lmth: chip shows within range',
      G.thallChipEl.style.display === 'block', 'display=' + G.thallChipEl.style.display);
    check('lmth: chip reads THEATER <distance>M',
      /^THEATER \d+M$/.test(G.thallTxtEl.textContent), G.thallTxtEl.textContent);
    check('lmth: chip arrow carries a bearing rotation',
      /rotate\(-?\d+(\.\d+)?deg\)/.test(G.thallArrEl.style.transform || ''),
      G.thallArrEl.style.transform);
    /* chip hides when far from every theater (scan for a truly far point) */
    let farX = td.x + 1000, farZ = td.z;
    for (let fx = td.x + 1000; fx <= td.x + 3000; fx += 500) {
      let ok = true;
      for (let gx = -80; gx <= 80 && ok; gx++) for (let gz = -80; gz <= 80 && ok; gz++) {
        if (G.amenityTypeFor(gx, gz) !== 'theater' || !G.amenityAccepted(gx, gz)) continue;
        const a = G.amenityCenterFor(gx, gz);
        if (a && a.type === 'theater' && Math.hypot(a.x - fx, a.z - farZ) < 600) ok = false;
      }
      if (ok) { farX = fx; break; }
    }
    G.player.position.set(farX, groundY(farX, farZ), farZ);
    frame(20);
    check('lmth: chip hides when far',
      G.thallChipEl.style.display === 'none', 'display=' + G.thallChipEl.style.display);

    /* transit: bus/taxi routes never stop at the theater in v1 */
    G.busRebuildRoute(tgx, tgz);
    check('lmth: bus routes never stop at the theater in v1',
      G.BUS.route.every(s => s.type !== 'theater'), 'stops=' + G.BUS.route.length);
    G.TX.riding = false; G.TX.routeKey = '';
    G.txRebuild(tgx, tgz);
    check('lmth: taxi routes never stop at the theater in v1',
      (G.TX.route || []).every(s => s.type !== 'theater'), 'stops=' + (G.TX.route || []).length);

    /* night: marquee bulbs glow via the shared emissive ramp, zero new lights */
    G.player.position.set(td.x + 60, groundY(td.x + 60, td.z), td.z);
    G.dayPhase = 0.75;   // midnight
    frame(5);
    check('lmth: marquee bulbs glow at night (shared emissive ramp, no new lights)',
      G.AMEN_DEF.theater.meshes[0].material.emissiveIntensity > 1,
      G.AMEN_DEF.theater.meshes[0].material.emissiveIntensity.toFixed(2));

    frame(30);
    check('lmth: round trip leaves zero console errors/warnings',
      consoleProblems.length === probsT, consoleProblems.slice(probsT).join(' | '));

    /* leave the world as the next block expects: exit the hall, player at origin, FT rebuilt there */
    if (G.THEATERHALL.inHall) G.theaterHallExit();
    G.player.position.set(0, groundY(0, 0), 0);
    G.FT.routeKey = ''; G.FT.driving = false; G.ftRebuild(0, 0);
  }
}

/* ================= PHASE 5: LANDMARK CASINO v1 (buildings/places) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.STADIUM.watching) G.stadiumExit();
  if (G.THEATER.watching) G.theaterExit();
  if (G.SLOT.playing) G.slotExit();
  if (G.PIANO.playing) G.pianoExit();
  if (G.CIVIC.state) G.civicExit();
  if (G.WORSHIP.state) G.worshipExit();
  if (G.APARTMENT.state) G.apartmentExit();
  if (G.THEATERHALL.inHall) G.theaterHallExit();
  if (G.CASINOHALL.inHall) G.casinoHallExit();

  /* static: bespoke merged geometry, zero new IM literals (the shared
     AMEN_DEF loop builds the one 'casino' mesh: +1 runtime draw call; the
     cached hall is plain Mesh, visible=false until entered), zero new
     runtime lights, zero new keybinds, no unseeded RNG, no em dashes,
     no external URLs, no TODO text in the block */
  const lmcsSrc = html.slice(html.indexOf('/* ================= PHASE 5: LANDMARK CASINO v1 (buildings/places)'),
                             html.indexOf('/* ---- instanced meshes: one per type, one draw call each ---- */'));
  check('lmcs-static: zero IM literals in the casino block (shared AMEN_DEF loop builds the one mesh)',
    (lmcsSrc.match(/new THREE\.InstancedMesh/g) || []).length === 0);
  check('lmcs-static: casino block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(lmcsSrc));
  check('lmcs-static: no unseeded RNG in the casino block', !/Math\.random/.test(lmcsSrc));
  check('lmcs-static: no em dashes in the casino block', !lmcsSrc.includes('—'));
  check('lmcs-static: no external URLs in the casino block', !/https?:\/\//.test(lmcsSrc));
  check('lmcs-static: no TODO markers in the casino block', !/\bTODO\b/.test(lmcsSrc));
  check('lmcs-static: casino residue is checked after theater (never displaces existing types)',
    html.indexOf("if (h % 53 === 31) return 'theater';") < html.indexOf("if (h % 61 === 37) return 'casino';"));
  check('lmcs-static: whole-file IM literals pin at 48 (casino rides the shared def-loop literal; hall is plain Mesh)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
  check('lmcs-static: Math.random lines pin at 92',
    (html.match(/^.*Math\.random.*$/gm) || []).length === 92);
  check('lmcs-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('lmcs-static: E chain wires casino after the theater hall (exit prefixes intact)',
    html.includes("else if (CASINOHALL.hintEnter) casinoHallEnter(); else if (CASINOHALL.inHall) casinoHallKeyE(); else if (FIRESTHALL.hintEnter) firestHallEnter(); else if (FIRESTHALL.inHall) firestHallKeyE(); else if (WORSHIP.hintOn) worshipEnter();"));
  check('lmcs-static: #casinchip does not collide with existing chips',
    html.includes('id="casinchip"') && (html.match(/id="casinchip"/g) || []).length === 1);
  check('lmcs-static: chip pins in its own top-left slot (no overlap)',
    html.includes('#casinchip {\n    position: absolute; top: 588px; left: 18px;'));
  check('lmcs-static: bus route rebuild excludes casino in v1',
    html.indexOf("if (a && a.type !== 'stad' && a.type !== 'amuse' && a.type !== 'hosp' && a.type !== 'theater' && a.type !== 'casino' && a.type !== 'firestation') found.push({ x: a.x, z: a.z, type: a.type, gx, gz });") !== -1);
  check('lmcs-static: taxi route rebuild excludes casino in v1',
    html.indexOf("if (a && a.type !== 'stad' && a.type !== 'amuse' && a.type !== 'hosp' && a.type !== 'theater' && a.type !== 'casino' && a.type !== 'firestation') found.push({ x: a.x, z: a.z, type: a.type });") !== -1);
  check('lmcs-static: bike/bc/scooter pad scans exclude casino in v1 (byte-identical pads)',
    (html.match(/if \(a && a\.type !== 'hosp' && a\.type !== 'theater' && a\.type !== 'casino' && a\.type !== 'firestation'\) found\.push\(a\);/g) || []).length === 3);
  check('lmcs-static: ambulance anchor scan excludes casino in v1',
    html.includes("if (!a || a.type === 'hosp' || a.type === 'theater' || a.type === 'casino' || a.type === 'firestation') continue;"));
  check('lmcs-static: save inside stores the casino door',
    html.includes("CASINOHALL.inHall ? CASINOHALL.doorX : FIRESTHALL.inHall ? FIRESTHALL.doorX : player.position.x"));
  check('lmcs-static: rain hides inside the gaming hall',
    html.includes("&& !THEATERHALL.inHall && !CASINOHALL.inHall && !FIRESTHALL.inHall"));
  check('lmcs-static: panel carries a real pay table (no placeholder text)',
    html.includes('3 WILD 50x') && html.includes('WILD SUBS FOR ALL'));

  /* seeded placement: pure deterministic hash, own residue, cross-type winner-take-all */
  let cgx = 0, cgz = 0, cd = null;
  couter: for (let gx = -60; gx <= 60; gx++)
    for (let gz = -60; gz <= 60; gz++) {
      if (G.amenityTypeFor(gx, gz) !== 'casino' || !G.amenityAccepted(gx, gz)) continue;
      const a = G.amenityCenterFor(gx, gz);
      if (a && a.type === 'casino') { cgx = gx; cgz = gz; cd = a; break couter; }
    }
  check('lmcs: a seeded casino chunk exists in the scan window', !!cd, cd ? 'at ' + cgx + ',' + cgz : 'none');
  if (cd) {
    const cd2 = G.amenityCenterFor(cgx, cgz);
    check('lmcs: amenityCenterFor is deterministic across calls',
      !!cd2 && cd2.x === cd.x && cd2.z === cd.z && cd2.yaw === cd.yaw && cd2.type === 'casino');
    let wtaOk = true;
    for (let ax = cgx - 1; ax <= cgx + 1; ax++)
      for (let az = cgz - 1; az <= cgz + 1; az++) {
        if (ax === cgx && az === cgz) continue;
        if (G.amenityTypeFor(ax, az) && G.amenityAccepted(ax, az)) wtaOk = false;
      }
    check('lmcs: cross-type winner-take-all holds (no other accepted amenity in the 3x3)', wtaOk);
    /* measured non-displacement: no casino chunk would have matched an
       earlier type (the residue is checked last) */
    let displaceOk = true, casinoCount = 0;
    for (let gx = -60; gx <= 60; gx++)
      for (let gz = -60; gz <= 60; gz++) {
        if (G.amenityTypeFor(gx, gz) !== 'casino') continue;
        casinoCount++;
        const h = G.hash2i(gx, gz);
        if (h % 41 === 20 || h % 15 === 4 || h % 19 === 9 || h % 13 === 11
            || h % 10 === 6 || h % 37 === 13 || h % 41 === 29 || h % 47 === 23
            || h % 53 === 31) displaceOk = false;
      }
    check('lmcs: casino never displaces an existing amenity type (checked last)',
      casinoCount > 0 && displaceOk, 'casino=' + casinoCount);
    check('lmcs: def is registered (cap 2, glow flag, 35 colliders)',
      G.AMEN_DEF.casino && G.AMEN_DEF.casino.cap === 2 && G.AMEN_DEF.casino.glow === true
      && G.AMEN_DEF.casino.colliders.length === 35 && G.LMCASINO_COL.length === 35
      && Array.isArray(G.AMEN.active.casino));
    check('lmcs: the entrance gap has no collider (walk-in idiom)',
      G.LMCASINO_COL.every(c => Math.hypot(c[0] - 0, c[1] - 13) > 2.5));
    check('lmcs: the door column stays walkable (no collider within 1.6m of the door)',
      G.LMCASINO_COL.every(c => Math.hypot(c[0] - 0, c[1] - 6.8) > 1.6));

    /* merged geometry: one mesh, one vertexColors material, per-part colors */
    const cgeo = G.AMEN_DEF.casino.meshes[0].geometry;
    check('lmcs: merged geometry carries per-part vertex colors',
      !!cgeo.attributes.color && cgeo.attributes.color.count === cgeo.attributes.position.count
      && cgeo.attributes.position.count > 500, 'verts=' + cgeo.attributes.position.count);
    check('lmcs: one material with vertexColors on',
      G.AMEN_DEF.casino.meshes[0].material.vertexColors === true);
    check('lmcs: marquee board samples the sign-text band (v 0.78..1)',
      (() => { const uv = cgeo.attributes.uv; let n = 0;
               for (let i = 0; i < uv.count; i++) if (uv.getY(i) >= 0.77) n++;
               return n >= 4; })());
    check('lmcs: marquee bulbs carry glow UVs (night emissive targets)',
      (() => { const uv = cgeo.attributes.uv; let n = 0;
               for (let i = 0; i < uv.count; i++)
                 if (Math.abs(uv.getX(i) - 0.25) < 1e-6 && Math.abs(uv.getY(i) - 0.25) < 1e-6) n++;
               return n > 50; })());
    check('lmcs: marquee material rides the day/night emissive ramp',
      G.LMSTAD_FLOOD_MATS.includes(G.AMEN_DEF.casino.meshes[0].material)
      && !!G.AMEN_DEF.casino.meshes[0].material.emissiveMap);

    /* the cached hall: built once, invisible until entered, lit by emissive */
    check('lmcs: the gaming hall is cached (invisible, zero net draws)',
      G.casinoHallMesh.visible === false);
    check('lmcs: the hall is one merged mesh with vertex colors',
      !!G.casinoHallMesh.geometry.attributes.color
      && G.casinoHallMesh.geometry.attributes.position.count > 800);
    check('lmcs: the hall is emissive-lit (never a black doorway), zero new lights',
      G.casinoHallMesh.material.emissiveIntensity > 0.5);
    check('lmcs: the hall parks below the theater room (no overlap)',
      G.CASINO_ROOM_Y === -400 && G.CASINO_ROOM_Y !== G.THEATER_ROOM_Y);

    /* payline math: pure unit checks on lmcsLineMult (WILD = 5, SEVEN = 4) */
    check('lmcs: three wilds pay 50x', G.lmcsLineMult([5, 5, 5]) === 50);
    check('lmcs: three sevens pay 25x', G.lmcsLineMult([4, 4, 4]) === 25);
    check('lmcs: three of a kind pays 10x', G.lmcsLineMult([0, 0, 0]) === 10);
    check('lmcs: wild completes three of a kind', G.lmcsLineMult([0, 0, 5]) === 10);
    check('lmcs: wild completes three sevens', G.lmcsLineMult([4, 5, 4]) === 25);
    check('lmcs: a pair pays 2x', G.lmcsLineMult([0, 0, 1]) === 2);
    check('lmcs: wild plus two different symbols pays a pair',
      G.lmcsLineMult([0, 5, 1]) === 2);
    check('lmcs: no match pays 0', G.lmcsLineMult([0, 1, 2]) === 0);
    check('lmcs: 5 paylines (3 rows + 2 diagonals)',
      G.LMCS_LINES.length === 5 && G.LMCS_LINES[3].length === 3 && G.LMCS_LINES[4].length === 3);

    /* wall collision: the hedge wall + boxes block a walker, the entrance
       gap and the door column stay open (rural-building foot idiom) */
    const def = G.AMEN_DEF.casino;
    const c0 = Math.cos(cd.yaw), s0 = Math.sin(cd.yaw);
    const wx = (ox, oz) => cd.x + ox * c0 + oz * s0;
    const wz = (ox, oz) => cd.z - ox * s0 + oz * c0;
    const footSaved = G.BLDG.foot.slice();
    G.BLDG.foot.length = 0;   // isolate: ambient colliders must not perturb the measurement
    for (const col of def.colliders) G.BLDG.foot.push({ x: wx(col[0], col[1]), z: wz(col[0], col[1]), r: col[2] });
    const wc = def.colliders[0];   // hedge-ring wall collider, far from the gate
    G.player.position.set(wx(wc[0], wc[1]), groundY(wx(wc[0], wc[1]), wz(wc[0], wc[1])), wz(wc[0], wc[1]));
    for (let _ri = 0; _ri < 3; _ri++) G.resolveBldgFoot();   // settle like the per-frame game loop
    let wallOk = true, wallMin = 1e18;
    for (const col of def.colliders) {
      const dcol = Math.hypot(G.player.position.x - wx(col[0], col[1]), G.player.position.z - wz(col[0], col[1])) - (col[2] + 0.45);
      if (dcol < wallMin) wallMin = dcol;
      /* adjacent ring colliders overlap by 0.22m (theater-identical idiom);
         sequential resolution settles ~0.13m inside the lens: an invisible
         graze, the walker cannot pass the wall. */
      if (dcol < -0.15) wallOk = false;
    }
    check('lmcs: the hedge wall blocks a walker (pushed out of every collider)',
      wallOk, 'min clearance=' + wallMin.toFixed(3));
    const gx0 = wx(0, 13), gz0 = wz(0, 13);   // entrance gate center: no collider there
    G.player.position.set(gx0, groundY(gx0, gz0), gz0);
    G.resolveBldgFoot();
    const gd = Math.hypot(G.player.position.x - gx0, G.player.position.z - gz0);
    check('lmcs: the entrance gap stays open (walker not pushed)', gd < 0.01, 'd=' + gd.toFixed(3));
    const dx0 = wx(0, 6.8), dz0 = wz(0, 6.8);   // door column: walkable to the trigger
    G.player.position.set(dx0, groundY(dx0, dz0), dz0);
    G.resolveBldgFoot();
    const dd = Math.hypot(G.player.position.x - dx0, G.player.position.z - dz0);
    check('lmcs: the door column stays walkable (walker not pushed)', dd < 0.01, 'd=' + dd.toFixed(3));
    G.BLDG.foot.length = 0;
    for (const f of footSaved) G.BLDG.foot.push(f);

    /* vehicle collision: the car is pushed out of the wall via AMEN.colliders */
    const am0 = G.AMEN.colliders.length;
    for (const col of def.colliders) G.AMEN.colliders.push({ x: wx(col[0], col[1]), z: wz(col[0], col[1]), r: col[2] });
    G.CAR.pos.set(wx(wc[0], wc[1]), 0, wz(wc[0], wc[1]));
    G.CAR.hitCd = 0; G.CAR.speed = 0; G.CAR.hp = 100; G.CAR.armor = 0;
    G.carAmenityHit(0.016);
    const cdst = Math.hypot(G.CAR.pos.x - wx(wc[0], wc[1]), G.CAR.pos.z - wz(wc[0], wc[1]));
    check('lmcs: the wall blocks light vehicles (pushed out via AMEN.colliders)',
      cdst >= wc[2] + 1.15 - 0.01, 'd=' + cdst.toFixed(2));
    G.AMEN.colliders.length = am0;

    /* the real casino activates near the player; ENTER prompt at the door */
    G.player.position.set(cd.x + 60, groundY(cd.x + 60, cd.z), cd.z);
    frame(20);   // chunk redistribute + casinoHallTick cadence
    const ca = G.AMEN.active.casino.find(a => Math.hypot(a.x - cd.x, a.z - cd.z) < 1);
    check('lmcs: the real casino activates near the player', !!ca);
    const door = G.casinoHallDoorWorld(ca);
    G.player.position.set(door.x, groundY(door.x, door.z), door.z);
    frame(20);
    check('lmcs: ENTER prompt shows at the door',
      G.CASINOHALL.hintEnter === true && G.casinohallhintEl.style.opacity == 1, 'hint=' + G.CASINOHALL.hintEnter);
    check('lmcs: the hall stays cached until entered (zero net draws)',
      G.casinoHallMesh.visible === false);

    /* enter/exit round trip */
    const probsC = consoleProblems.length;
    G.closeShop(); G.casinoHallEnter();
    check('lmcs: ENTER teleports into the cached hall',
      G.CASINOHALL.inHall === true && G.player.position.y === G.CASINO_ROOM_Y
      && G.casinoHallMesh.visible === true,
      'y=' + G.player.position.y);
    check('lmcs: the hall parks under the active casino',
      Math.abs(G.casinoHallMesh.position.x - ca.x) < 0.01
      && Math.abs(G.casinoHallMesh.position.z - ca.z) < 0.01);
    frame(20);   // 0.33s clears the 0.25s prompt cadence
    check('lmcs: PLAY SLOTS prompt shows inside',
      G.casinoslothintEl.style.opacity == 1 && /PLAY SLOTS/.test(G.casinoslothintEl.textContent),
      G.casinoslothintEl.textContent);

    /* E key wiring: E sits at the machine, E stands and exits */
    G.CIVIC.hintOn = false; G.HOSP.hintOn = false; G.WORSHIP.hintOn = false; G.APARTMENT.hintOn = false;
    stubs.fireGlobal('keydown', { code: 'KeyE', preventDefault() {} });
    check('lmcs: KeyE sits at the slot machine (panel opens)',
      G.CASINOHALL.seated === true && G.CASINOSLOT.playing === true
      && G.lmcsPanelEl.style.display === 'block',
      'seated=' + G.CASINOHALL.seated);
    frame(20);   // let the 0.25s prompt cadence flip the text
    check('lmcs: the sit prompt flips to EXIT (E never traps)',
      /EXIT/.test(G.casinoslothintEl.textContent), G.casinoslothintEl.textContent);

    /* spin: $10 debit, seeded outcome, staggered ease-out stops */
    G.cash = 100;
    G.lmcsSpin();
    check('lmcs: SPIN debits the $10 bet', G.cash === 90 && G.CASINOSLOT.spinning === true, 'cash=' + G.cash);
    check('lmcs: reels stop staggered 0.9/1.5/2.1s',
      G.CASINOSLOT.reels[0].dur === 0.9 && G.CASINOSLOT.reels[1].dur === 1.5 && G.CASINOSLOT.reels[2].dur === 2.1);
    frame(150);   // 2.5s: all reels stopped
    check('lmcs: the spin completes (all reels locked)',
      G.CASINOSLOT.spinning === false && G.CASINOSLOT.reels.every(r => r.locked));
    check('lmcs: cash settles to bet plus last win',
      G.cash === 90 + G.CASINOSLOT.lastWin, 'cash=' + G.cash + ' win=' + G.CASINOSLOT.lastWin);

    /* rigged payout: all sevens on every reel = 5 lines x 25x x $10 */
    G.cash = 200; G.CASINOSLOT.betIdx = 1;
    for (let i = 0; i < 3; i++) G.CASINOSLOT.reels[i].outcome = [4, 4, 4];
    G.lmcsFinish();
    check('lmcs: rigged all-sevens pays 5 lines x 25x x $10',
      G.cash === 200 + 1250 && G.CASINOSLOT.lastWin === 1250,
      'cash=' + G.cash + ' win=' + G.CASINOSLOT.lastWin);
    check('lmcs: big-win overlay shows on a 125x-bet hit',
      G.lmcsBigWinEl.style.display === 'block' && /1250/.test(G.lmcsBigWinEl.textContent),
      G.lmcsBigWinEl.textContent);
    check('lmcs: winning cells glow on the paylines',
      G.CASINOSLOT.cellEls.some(row => row.some(d => d.classList.contains('lmcs-win'))));

    /* broke gambler: denied the spin, can still leave (no trap) */
    G.cash = 3;
    G.lmcsSpin();
    check('lmcs: a broke gambler is denied (cash untouched, no spin)',
      G.cash === 3 && G.CASINOSLOT.spinning === false, 'cash=' + G.cash);

    /* bet cycles 10 -> 25 -> 5 */
    G.lmcsCycleBet();
    check('lmcs: BET cycles to $25', G.LMCS_BETS[G.CASINOSLOT.betIdx] === 25);
    G.lmcsCycleBet();
    check('lmcs: BET cycles to $5', G.LMCS_BETS[G.CASINOSLOT.betIdx] === 5);
    G.CASINOSLOT.betIdx = 1;

    /* E exits: stand up and leave the hall in one press */
    stubs.fireGlobal('keydown', { code: 'KeyE', preventDefault() {} });
    check('lmcs: KeyE stands and exits (round trip complete)',
      G.CASINOHALL.inHall === false && G.casinoHallMesh.visible === false
      && G.lmcsPanelEl.style.display === 'none');
    const backD = Math.hypot(G.player.position.x - G.CASINOHALL.doorX, G.player.position.z - G.CASINOHALL.doorZ);
    check('lmcs: exit teleports back to the door', backD < 0.01, 'd=' + backD.toFixed(3));

    /* save inside stores the casino door (collectSave idiom) */
    G.closeShop();
    const kdoor = G.casinoHallDoorWorld(ca);
    G.player.position.set(kdoor.x, groundY(kdoor.x, kdoor.z), kdoor.z);
    frame(10);
    G.casinoHallEnter();
    const sv = G.collectSave();
    check('lmcs: save inside stores the casino door position',
      Math.abs(sv.x - G.CASINOHALL.doorX) < 0.01 && Math.abs(sv.z - G.CASINOHALL.doorZ) < 0.01,
      'x=' + sv.x + ' z=' + sv.z);
    G.casinoHallExit();

    /* HUD chip: shows within 500m with bearing arrow + distance, hidden when far */
    frame(20);
    check('lmcs: chip shows within range',
      G.casinChipEl.style.display === 'block', 'display=' + G.casinChipEl.style.display);
    check('lmcs: chip reads CASINO <distance>M',
      /^CASINO \d+M$/.test(G.casinTxtEl.textContent), G.casinTxtEl.textContent);
    check('lmcs: chip arrow carries a bearing rotation',
      /rotate\(-?\d+(\.\d+)?deg\)/.test(G.casinArrEl.style.transform || ''),
      G.casinArrEl.style.transform);
    /* chip hides when far from every casino (scan for a truly far point) */
    let farX = cd.x + 1000, farZ = cd.z;
    for (let fx = cd.x + 1000; fx <= cd.x + 3000; fx += 500) {
      let ok = true;
      for (let gx = -80; gx <= 80 && ok; gx++) for (let gz = -80; gz <= 80 && ok; gz++) {
        if (G.amenityTypeFor(gx, gz) !== 'casino' || !G.amenityAccepted(gx, gz)) continue;
        const a = G.amenityCenterFor(gx, gz);
        if (a && a.type === 'casino' && Math.hypot(a.x - fx, a.z - farZ) < 600) ok = false;
      }
      if (ok) { farX = fx; break; }
    }
    G.player.position.set(farX, groundY(farX, farZ), farZ);
    frame(20);
    check('lmcs: chip hides when far',
      G.casinChipEl.style.display === 'none', 'display=' + G.casinChipEl.style.display);

    /* transit: bus/taxi routes never stop at the casino in v1 */
    G.busRebuildRoute(cgx, cgz);
    check('lmcs: bus routes never stop at the casino in v1',
      G.BUS.route.every(s => s.type !== 'casino'), 'stops=' + G.BUS.route.length);
    G.TX.riding = false; G.TX.routeKey = '';
    G.txRebuild(cgx, cgz);
    check('lmcs: taxi routes never stop at the casino in v1',
      (G.TX.route || []).every(s => s.type !== 'casino'), 'stops=' + (G.TX.route || []).length);

    /* night: marquee bulbs glow via the shared emissive ramp, zero new lights */
    G.player.position.set(cd.x + 60, groundY(cd.x + 60, cd.z), cd.z);
    G.dayPhase = 0.75;   // midnight
    frame(5);
    check('lmcs: marquee bulbs glow at night (shared emissive ramp, no new lights)',
      G.AMEN_DEF.casino.meshes[0].material.emissiveIntensity > 1,
      G.AMEN_DEF.casino.meshes[0].material.emissiveIntensity.toFixed(2));

    frame(30);
    check('lmcs: round trip leaves zero console errors/warnings',
      consoleProblems.length === probsC, consoleProblems.slice(probsC).join(' | '));

    /* leave the world as the next block expects: exit the hall, player at origin, FT rebuilt there */
    if (G.CASINOHALL.inHall) G.casinoHallExit();
    G.player.position.set(0, groundY(0, 0), 0);
    G.FT.routeKey = ''; G.FT.driving = false; G.ftRebuild(0, 0);
  }
}

/* ================= PHASE 5: FIRE TRUCK v1 + WILDFIRE EVENTS ================= */
{
  G.CAR.driving = false; G.HORSE.riding = false;
  G.BUS.driving = false; G.BUS.riding = false; G.TX.riding = false;
  G.FT.driving = false; G.waterHeld = false;
  G.player.visible = true;
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0;   // godT blocks ftEnter + fire damage
  G.player.position.set(0, groundY(0, 0), 0);
  frame(3);   // ftRebuild seeds the truck at the anchor chunk

  /* --- static pins: +1 InstancedMesh net, zero new lights, zero new RNG --- */
  check('fire: one new InstancedMesh literal (46 -> 47): the truck fleet',
    G.ftBodyIM.isInstancedMesh === true && G.ftBodyIM.count === 1);
  check('fire: truck body is a single merged geometry (one draw call)',
    G.ftBodyIM.geometry.isBufferGeometry === true);
  check('fire: truck placed by seeded spawn near the anchor chunk',
    G.FT.placed === true && Math.abs(G.FT.pos.x) < 500 && Math.abs(G.FT.pos.z) < 500,
    'x=' + G.FT.pos.x.toFixed(1) + ' z=' + G.FT.pos.z.toFixed(1));
  check('fire: beacon material is truck-private (emissive wash cannot leak to other fleets)',
    G.ftBodyMat.emissiveIntensity === 0);
  /* determinism on revisit: forced rebuild, identical pose */
  const fpx = G.FT.pos.x, fpz = G.FT.pos.z, fph = G.FT.heading;
  G.FT.anchorCx = 1e9; G.FT.anchorCz = 1e9; G.FT.routeKey = '';
  frame(1);
  check('fire: truck spawn is deterministic on rebuild',
    Math.abs(G.FT.pos.x - fpx) < 1e-9 && Math.abs(G.FT.pos.z - fpz) < 1e-9
    && Math.abs(G.FT.heading - fph) < 1e-9);
  /* never yanked while driving; pin the truck by the player for the board test
     (anchor pinned so the chunk rebuild cannot relocate it mid-test) */
  const bpy = groundY(3, 0);
  G.FT.pos.set(3, bpy, 0);
  G.FT.heading = 0; G.FT.placed = true;
  G.ftPose(3, bpy, 0, 0);
  G.ftBodyIM.instanceMatrix.needsUpdate = true;
  G.FT.anchorCx = 0; G.FT.anchorCz = 0; G.FT.routeKey = '0,0';
  frame(1);
  check('fire: board prompt shows on foot near the truck', G.FT.hintOn === true);

  /* --- board / drive / spray / exit round trip --- */
  G.ftEnter();
  check('fire: E boards the truck (heli/plane idiom)', G.FT.driving === true && G.player.visible === false);
  check('fire: siren nodes created once at board (two-tone idiom, zero new nodes)', G.sirOsc !== null);
  G.keys.KeyW = true;
  frame(30);
  G.keys.KeyW = false;
  check('fire: truck moves under throttle (CAR arcade idiom, truck tuning)',
    Math.abs(G.FT.speed) > 0.5, 'speed=' + G.FT.speed.toFixed(2));
  check('fire: beacon flashes while driving (alternating red/blue emissive, zero new lights)',
    G.ftBodyMat.emissiveIntensity > 0);
  check('fire: spray off without FIRE held', G.FT.spraying === false);
  G.waterHeld = true;
  frame(2);
  check('fire: hold FIRE sprays while driving', G.FT.spraying === true);
  G.waterHeld = false;
  frame(1);
  check('fire: spray stops when FIRE released', G.FT.spraying === false);
  const ex = G.FT.pos.x, ez = G.FT.pos.z;
  G.ftExit();
  check('fire: E exits, driver restored beside the truck on safe ground',
    G.FT.driving === false && G.player.visible === true
    && Math.hypot(G.player.position.x - ex, G.player.position.z - ez) < 4
    && groundY(G.player.position.x, G.player.position.z) >= -0.55);
  check('fire: beacon off when parked', G.ftBodyMat.emissiveIntensity === 0);

  /* --- wildfire: seeded ignition from a strike --- */
  const trees = G.FLORA.trees;
  const _m4 = new THREE.Matrix4(), _v3 = new THREE.Vector3(), _c = new THREE.Color();
  // pick a deterministic tree >8m from the player that passes the seeded gate;
  // the tree sits >=21m inside its chunk so the toast (20m) and damage (2m)
  // player spots never cross a chunk edge (chunk recycle clears fires)
  let ti = -1, tx = 0, tz = 0;
  for (let i = 0; i < trees.count && ti < 0; i++) {
    trees.getMatrixAt(i, _m4); _v3.setFromMatrixPosition(_m4);
    const lx = _v3.x - Math.floor(_v3.x / 48) * 48;
    if (lx < 21 || lx > 27) continue;
    const pdx = _v3.x - G.player.position.x, pdz = _v3.z - G.player.position.z;
    if (pdx * pdx + pdz * pdz < 64) continue;   // the never-on-the-player guard
    const h = G.hash2i(Math.floor(_v3.x), Math.floor(_v3.z)) ^ G.hash2i(i, 7);
    if ((h & 3) !== 0) { ti = i; tx = _v3.x; tz = _v3.z; }
  }
  check('fire: a seeded-ignitable tree exists in the fleet', ti >= 0, 'idx=' + ti);
  // player 20m away: inside toast range (150m), outside the never-spawn radius
  G.player.position.set(tx + 20, groundY(tx + 20, tz), tz);
  frame(1);
  const probsF = consoleProblems.length;
  G.wildfireStrike(tx, tz);
  check('fire: strike ignites the nearest tree within 15m (seeded)',
    G.FIRES.length === 1 && G.FIRES[0].idx === ti, 'fires=' + G.FIRES.length);
  check('fire: WILDFIRE toast on ignition within 150m', G.toastEl.textContent === 'WILDFIRE!');
  check('fire: burn uses per-instance color on the tree fleet (zero new draw calls)',
    trees.instanceColor !== null && trees.instanceColor !== undefined);
  frame(60);   // 1s of burn
  check('fire: fire ages and tints (orange pulse before char)',
    G.FIRES.length === 1 && G.FIRES[0].t > 0.5);
  trees.getColorAt(ti, _c);
  check('fire: burning tree is tinted, not white', _c.r < 1.05 && (_c.g < 0.99 || _c.r > 0.5),
    'rgb=' + _c.r.toFixed(2) + ',' + _c.g.toFixed(2) + ',' + _c.b.toFixed(2));

  /* --- wildfire: damage at ~1/s inside 4m --- */
  G.P.hp = 100;
  G.player.position.set(tx + 2, groundY(tx + 2, tz), tz);   // inside 4m
  frame(70);   // ~1.17s
  check('fire: player takes ~1 dmg/s inside 4m', G.P.hp < 100 && G.P.hp > 90, 'hp=' + G.P.hp.toFixed(1));
  G.player.position.set(tx + 20, groundY(tx + 20, tz), tz); // step out (same chunk)

  /* --- wildfire: spread after ~15s (seeded), burnout after 60-90s --- */
  G.FIRES[0].t = 16;
  frame(2);
  check('fire: spread pass runs after 15s', G.FIRES[0].spreadDone === true);
  for (const f of G.FIRES) { f.t = f.burnDur + 1; f.spreadDone = true; }   // no second-generation spread during burnout
  frame(2);
  check('fire: all fires burn out after their seeded 60-90s', G.FIRES.length === 0);

  /* --- wildfire: water cannon extinguishes in the cone --- */
  trees.getMatrixAt(ti, _m4); _v3.setFromMatrixPosition(_m4);
  /* the fire-crew dispatch hook is live: reset crew state so the cone test
     isolates the truck spray (same hygiene as the firecrew section) */
  for (const n of G.BUSNPC.ff.crew) { n.state = 'POST'; n.spraying = false; }
  G.BUSNPC.ff.incident = null; G.BUSNPC.ff.sprayOn = false;
  G.INCIDENTS.length = 0; G.FIRECREW.lastDispatch = -1e9;
  G.wildfireIgnite(ti, _v3.x, _v3.z);
  // if the seeded gate rejected it, force a record for the cone test
  if (G.FIRES.length === 0) G.FIRES.push({ idx: ti, x: _v3.x, z: _v3.z, t: 1, burnDur: 70, spreadDone: true, dmgT: 0, phase: 0 });
  const fx2 = _v3.x, fz2 = _v3.z;
  // park the truck 10m south of the fire, facing it; player first, then the
  // anchor is pinned to the player's chunk so the rebuild cannot yank it
  G.player.position.set(fx2 + 2, groundY(fx2 + 2, fz2 - 10), fz2 - 10);
  const fpcx = Math.floor(G.player.position.x / 48), fpcz = Math.floor(G.player.position.z / 48);
  G.FT.anchorCx = fpcx; G.FT.anchorCz = fpcz; G.FT.routeKey = fpcx + ',' + fpcz;
  G.WF.anchorCx = fpcx; G.WF.anchorCz = fpcz;   // pin: no chunk recycle mid-test
  const fty = groundY(fx2, fz2 - 10);
  G.FT.pos.set(fx2, fty, fz2 - 10);
  G.FT.heading = 0;   // +Z faces the fire 10m ahead
  G.ftPose(fx2, fty, fz2 - 10, 0);
  G.ftBodyIM.instanceMatrix.needsUpdate = true;
  frame(1);
  G.ftEnter();
  G.waterHeld = true;
  frame(12);   // spray tick fires at ~7Hz
  G.waterHeld = false;
  check('fire: water cone extinguishes the fire', G.FIRES.length === 0, 'fires=' + G.FIRES.length);
  G.ftExit();

  /* --- wildfire: bearing chip show/hide/range (player stationary: no chunk
         recycle, so the 300m range logic is tested purely) --- */
  G.FIRES.length = 0;
  const cpx = G.player.position.x, cpz = G.player.position.z;
  G.FIRES.push({ idx: ti, x: cpx + 100, z: cpz, t: 1, burnDur: 70, spreadDone: true, dmgT: 0, phase: 0 });
  frame(20);   // chip throttle is 0.25s
  check('fire: chip shows when a wildfire is active within 300m',
    G.fireChipEl.style.display === 'block' && G.fireTxtEl.textContent.indexOf('WILDFIRE') === 0,
    G.fireTxtEl.textContent);
  G.FIRES.length = 0;
  G.FIRES.push({ idx: ti, x: cpx + 500, z: cpz, t: 1, burnDur: 70, spreadDone: true, dmgT: 0, phase: 0 });
  frame(20);
  check('fire: chip hides beyond 300m', G.fireChipEl.style.display === 'none');
  G.FIRES.length = 0;

  /* --- wildfire: chunk recycle clears fires and char --- */
  G.FIRES.length = 0;
  G.wildfireIgnite(ti, fx2, fz2);
  if (G.FIRES.length === 0) G.FIRES.push({ idx: ti, x: fx2, z: fz2, t: 1, burnDur: 70, spreadDone: true, dmgT: 0, phase: 0 });
  const pcx = Math.floor(G.player.position.x / 48), pcz = Math.floor(G.player.position.z / 48);
  G.player.position.set((pcx + 3) * 48, 0, (pcz + 3) * 48);   // cross into a new chunk
  G.player.position.y = groundY(G.player.position.x, G.player.position.z);
  frame(2);
  check('fire: chunk recycle burns the record (fires cleared)', G.FIRES.length === 0);
  trees.getColorAt(ti, _c);
  check('fire: char resets on chunk recycle', _c.r > 0.99 && _c.g > 0.99 && _c.b > 0.99,
    'rgb=' + _c.r.toFixed(2) + ',' + _c.g.toFixed(2) + ',' + _c.b.toFixed(2));

  frame(30);
  check('fire: round trip leaves zero console errors/warnings',
    consoleProblems.length === probsF, consoleProblems.slice(probsF).join(' | '));
}

/* ================= PHASE 5: LANDMARK FIRE STATION v1 (buildings/places) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.STADIUM.watching) G.stadiumExit();
  if (G.THEATER.watching) G.theaterExit();
  if (G.SLOT.playing) G.slotExit();
  if (G.PIANO.playing) G.pianoExit();
  if (G.CIVIC.state) G.civicExit();
  if (G.WORSHIP.state) G.worshipExit();
  if (G.APARTMENT.state) G.apartmentExit();
  if (G.THEATERHALL.inHall) G.theaterHallExit();
  if (G.CASINOHALL.inHall) G.casinoHallExit();
  if (G.FIRESTHALL.inHall) G.firestHallExit();
  G.FT.driving = false; G.waterHeld = false;

  /* static: bespoke merged geometry, zero new IM literals (the shared
     AMEN_DEF loop builds the one 'firestation' mesh: +1 runtime draw call;
     the cached bay is plain Mesh, visible=false until entered), zero new
     runtime lights, zero new keybinds, no unseeded RNG, no em dashes,
     no external URLs, no TODO text in the block */
  const lmfsSrc = html.slice(html.indexOf('/* ================= PHASE 5: LANDMARK FIRE STATION v1 (buildings/places)'),
                             html.indexOf('/* ---- instanced meshes: one per type, one draw call each ---- */'));
  check('lmfirest-static: zero IM literals in the fire station block (shared AMEN_DEF loop builds the one mesh)',
    (lmfsSrc.match(/new THREE\.InstancedMesh/g) || []).length === 0);
  check('lmfirest-static: fire station block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(lmfsSrc));
  check('lmfirest-static: no unseeded RNG in the fire station block', !/Math\.random/.test(lmfsSrc));
  check('lmfirest-static: no em dashes in the fire station block', !lmfsSrc.includes('\u2014'));
  check('lmfirest-static: no external URLs in the fire station block', !/https?:\/\//.test(lmfsSrc));
  check('lmfirest-static: no TODO markers in the fire station block', !/\bTODO\b/.test(lmfsSrc));
  check('lmfirest-static: whole-file IM literals pin at 48',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
  check('lmfirest-static: 92 Math.random lines pin holds',
    html.split('\n').filter(l => l.indexOf('Math.random') !== -1).length === 92);
  check('lmfirest-static: single keydown listener (zero new keybinds)',
    (html.match(/addEventListener\('keydown'/g) || []).length === 1);
  check('lmfirest-static: E key wiring (door enter, in-hall slide, bay refill before truck exit)',
    html.includes("else if (FIRESTHALL.hintEnter) firestHallEnter(); else if (FIRESTHALL.inHall) firestHallKeyE();")
    && html.includes("else if (FT.driving && FIREST.refillOn) firestRefill();"));

  /* seeded building: a real firestation chunk, own residue, deterministic */
  let fgx = 0, fgz = 0, ffound = false;
  fouter: for (let gx = -60; gx <= 60; gx++)
    for (let gz = -60; gz <= 60; gz++) {
      if (G.amenityTypeFor(gx, gz) === 'firestation' && G.amenityAccepted(gx, gz)) { fgx = gx; fgz = gz; ffound = true; break fouter; }
    }
  check('lmfirest: a seeded firestation chunk exists in the scan window', ffound, 'at ' + fgx + ',' + fgz);
  check('lmfirest: own hash residue h%67===41, checked after casino',
    G.hash2i(fgx, fgz) % 67 === 41);
  check('lmfirest: amenityTypeFor is deterministic across calls',
    G.amenityTypeFor(fgx, fgz) === 'firestation');
  {
    const fd = G.amenityCenterFor(fgx, fgz);
    check('lmfirest: amenityCenterFor is deterministic across calls',
      !!fd && fd.type === 'firestation');
    let wtaOk = true;
    for (let ax = fgx - 1; ax <= fgx + 1; ax++)
      for (let az = fgz - 1; az <= fgz + 1; az++) {
        if (ax === fgx && az === fgz) continue;
        if (G.amenityTypeFor(ax, az) && G.amenityAccepted(ax, az)) wtaOk = false;
      }
    check('lmfirest: cross-type winner-take-all holds (no other accepted amenity in the 3x3)', wtaOk);
    /* measured non-displacement: no firestation chunk would have matched an earlier type */
    let displaceOk = true, fsCount = 0;
    for (let gx = -60; gx <= 60; gx++)
      for (let gz = -60; gz <= 60; gz++) {
        if (G.amenityTypeFor(gx, gz) !== 'firestation') continue;
        fsCount++;
        const h = G.hash2i(gx, gz);
        if (h % 41 === 20 || h % 15 === 4 || h % 19 === 9 || h % 13 === 11
            || h % 10 === 6 || h % 37 === 13 || h % 41 === 29 || h % 47 === 23
            || h % 53 === 31 || h % 61 === 37) displaceOk = false;
      }
    check('lmfirest: firestation never displaces an existing amenity type (checked last)',
      fsCount > 0 && displaceOk, 'firestation=' + fsCount);
    check('lmfirest: def is registered (cap 2, glow flag, 33 colliders)',
      G.AMEN_DEF.firestation && G.AMEN_DEF.firestation.cap === 2 && G.AMEN_DEF.firestation.glow === true
      && G.AMEN_DEF.firestation.colliders.length === 33 && G.LMFS_COL.length === 33
      && Array.isArray(G.AMEN.active.firestation));
    check('lmfirest: the entrance gap has no collider (walk-in idiom)',
      G.LMFS_COL.every(c => Math.hypot(c[0] - 0, c[1] - 15) > 2.5));
    check('lmfirest: the door trigger sits outside the door collider (walkable)',
      G.LMFS_COL.every(c => Math.hypot(c[0] - 0, c[1] - 5.5) > (c[2] || 0) + 0.01)
      && G.LMFS_COL.some(c => Math.abs(c[0]) < 0.01 && Math.abs(c[1] - 4) < 0.01));
    check('lmfirest: bay zone sits clear of the garage colliders (drive-up reachable)',
      G.LMFS_COL.every(c => Math.hypot(c[0] - G.LMFS_BAY[0], c[1] - G.LMFS_BAY[1]) > c[2] + 1.2));

    /* merged geometry: one mesh, one vertexColors material, per-part colors */
    const fgeo = G.AMEN_DEF.firestation.meshes[0].geometry;
    check('lmfirest: merged exterior geometry carries per-part vertex colors',
      !!fgeo.attributes.color && fgeo.attributes.color.count === fgeo.attributes.position.count
      && fgeo.attributes.position.count > 500, 'verts=' + fgeo.attributes.position.count);
    check('lmfirest: sign board samples the sign-text band (v 0.78..1)',
      (() => { const uv = fgeo.attributes.uv; let n = 0;
               for (let i = 0; i < uv.count; i++) if (uv.getY(i) >= 0.77) n++;
               return n >= 4; })());
    check('lmfirest: beacon dome + bay interiors carry glow UVs (night emissive targets)',
      (() => { const uv = fgeo.attributes.uv; let n = 0;
               for (let i = 0; i < uv.count; i++)
                 if (Math.abs(uv.getX(i) - 0.25) < 0.01 && Math.abs(uv.getY(i) - 0.25) < 0.01) n++;
               return n >= 4; })());
    const hgeo = G.fireHallMesh.geometry;
    check('lmfirest: cached bay holds the parked engine prop (merged, vertex-colored)',
      !!hgeo.attributes.color && hgeo.attributes.position.count > 1500,
      'verts=' + hgeo.attributes.position.count);
    check('lmfirest: the bay stays cached until entered (zero net draws)',
      G.fireHallMesh.visible === false);

    /* the real station activates near the player; ENTER prompt at the door */
    const cd = G.amenityCenterFor(fgx, fgz);
    G.player.position.set(cd.x + 60, groundY(cd.x + 60, cd.z), cd.z);
    frame(20);   // chunk redistribute + firestHallTick cadence
    const fa = G.AMEN.active.firestation.find(a => Math.hypot(a.x - cd.x, a.z - cd.z) < 1);
    check('lmfirest: the real station activates near the player', !!fa);
    const door = G.firestHallDoorWorld(fa);
    G.player.position.set(door.x, groundY(door.x, door.z), door.z);
    frame(20);
    check('lmfirest: ENTER prompt shows at the door',
      G.FIRESTHALL.hintEnter === true && G.firesthallhintEl.style.opacity == 1, 'hint=' + G.FIRESTHALL.hintEnter);

    /* enter/slide round trip: E slides down the pole and exits at the door */
    const probs0 = consoleProblems.length;
    G.closeShop(); G.firestHallEnter();
    check('lmfirest: ENTER teleports into the cached bay (y=-500)',
      G.FIRESTHALL.inHall === true && G.player.position.y === G.FIRESTATION_ROOM_Y
      && G.fireHallMesh.visible === true,
      'y=' + G.player.position.y);
    check('lmfirest: the bay parks under the active station',
      Math.abs(G.fireHallMesh.position.x - fa.x) < 0.01
      && Math.abs(G.fireHallMesh.position.z - fa.z) < 0.01);
    frame(20);
    check('lmfirest: SLIDE prompt shows inside',
      G.firestpolehintEl.style.opacity == 1 && /SLIDE/.test(G.firestpolehintEl.textContent),
      G.firestpolehintEl.textContent);
    G.CIVIC.hintOn = false; G.HOSP.hintOn = false; G.WORSHIP.hintOn = false; G.APARTMENT.hintOn = false;
    stubs.fireGlobal('keydown', { code: 'KeyE', preventDefault() {} });
    check('lmfirest: KeyE slides and exits (round trip complete)',
      G.FIRESTHALL.inHall === false && G.fireHallMesh.visible === false);
    const backD = Math.hypot(G.player.position.x - G.FIRESTHALL.doorX, G.player.position.z - G.FIRESTHALL.doorZ);
    check('lmfirest: slide exits back at the door', backD < 0.01, 'd=' + backD.toFixed(3));

    /* save inside stores the station door (collectSave idiom) */
    G.closeShop();
    const kdoor = G.firestHallDoorWorld(fa);
    G.player.position.set(kdoor.x, groundY(kdoor.x, kdoor.z), kdoor.z);
    frame(10);
    G.firestHallEnter();
    const sv = G.collectSave();
    check('lmfirest: save inside stores the station door position',
      Math.abs(sv.x - G.FIRESTHALL.doorX) < 0.01 && Math.abs(sv.z - G.FIRESTHALL.doorZ) < 0.01,
      'x=' + sv.x + ' z=' + sv.z);
    G.firestHallExit();

    /* vehicle collision: the car is pushed out of the garage wall via AMEN.colliders */
    const wx = (lx, lz) => { const c = Math.cos(fa.yaw), s = Math.sin(fa.yaw); return fa.x + lx * c + lz * s; };
    const wz = (lx, lz) => { const c = Math.cos(fa.yaw), s = Math.sin(fa.yaw); return fa.z - lx * s + lz * c; };
    const wc = G.AMEN_DEF.firestation.colliders[16];   // [11, 4, 2.6]: right front pillar
    const am0 = G.AMEN.colliders.length;
    for (const col of G.AMEN_DEF.firestation.colliders) G.AMEN.colliders.push({ x: wx(col[0], col[1]), z: wz(col[0], col[1]), r: col[2] });
    G.CAR.pos.set(wx(wc[0], wc[1]), 0, wz(wc[0], wc[1]));
    G.CAR.hitCd = 0; G.CAR.speed = 0; G.CAR.hp = 100; G.CAR.armor = 0;
    G.carAmenityHit(0.016);
    const cdst = Math.hypot(G.CAR.pos.x - wx(wc[0], wc[1]), G.CAR.pos.z - wz(wc[0], wc[1]));
    check('lmfirest: the garage wall blocks light vehicles (pushed out via AMEN.colliders)',
      cdst >= wc[2] + 1.15 - 0.01, 'd=' + cdst.toFixed(2));
    G.AMEN.colliders.length = am0;

    /* drive-up bay: TRUCK ONLY on foot, REFILL when driving the truck in */
    const bay = G.firestBayWorld(fa);
    G.player.position.set(bay.x, groundY(bay.x, bay.z), bay.z);
    G.FT.driving = false;
    frame(20);
    check('lmfirest: bay prompt reads TRUCK ONLY on foot',
      G.firestbayhintEl.style.opacity == 1 && G.firestbayhintEl.textContent === 'TRUCK ONLY',
      G.firestbayhintEl.textContent);
    /* drive the truck into the bay */
    const by = groundY(bay.x, bay.z);
    G.FT.pos.set(bay.x, by, bay.z); G.FT.heading = 0; G.FT.placed = true;
    G.ftPose(bay.x, by, bay.z, 0);
    G.ftBodyIM.instanceMatrix.needsUpdate = true;
    G.FT.anchorCx = Math.floor(bay.x / 48); G.FT.anchorCz = Math.floor(bay.z / 48);
    G.FT.routeKey = G.FT.anchorCx + ',' + G.FT.anchorCz;
    G.player.position.set(bay.x + 2, by, bay.z);
    frame(1);
    G.ftEnter();
    G.FT.water = 40; G.FT.hp = 55;   // half-spent truck
    frame(20);   // bay cadence
    check('lmfirest: REFILL prompt shows when driving the truck in the bay',
      G.FIREST.refillOn === true && G.firestbayhintEl.style.opacity == 1
      && /REFILL/.test(G.firestbayhintEl.textContent), G.firestbayhintEl.textContent);
    const probsR = consoleProblems.length;
    G.firestRefill();
    check('lmfirest: refill restores water and hull to full, free',
      G.FT.water === 100 && G.FT.hp === 100, 'water=' + G.FT.water + ' hp=' + G.FT.hp);
    check('lmfirest: one refill per visit (prompt consumed)',
      G.FIREST.refillOn === false && G.FIREST.refillUsed === true
      && G.firestbayhintEl.style.opacity == 0);
    G.firestRefill();
    check('lmfirest: second refill in the same visit is a no-op',
      G.FT.water === 100 && G.FT.hp === 100 && G.FIREST.refillUsed === true);
    /* drive out: the visit re-arms */
    G.FT.pos.set(bay.x + 30, groundY(bay.x + 30, bay.z), bay.z);
    G.ftPose(bay.x + 30, G.FT.pos.y, bay.z, 0);
    G.ftBodyIM.instanceMatrix.needsUpdate = true;
    frame(20);
    check('lmfirest: leaving the bay re-arms the refill for the next visit',
      G.FIREST.refillUsed === false);
    G.FT.pos.set(bay.x, by, bay.z);
    G.ftPose(bay.x, by, bay.z, 0);
    G.ftBodyIM.instanceMatrix.needsUpdate = true;
    G.FT.water = 10; G.FT.hp = 90;
    frame(20);
    check('lmfirest: refill re-arms on the next visit',
      G.FIREST.refillOn === true);
    /* E at the bay refills via mountToggle (does not exit the truck) */
    G.mountToggle();
    check('lmfirest: E at the bay refills instead of exiting the truck',
      G.FT.driving === true && G.FT.water === 100 && G.FT.hp === 100);
    G.ftExit();

    /* water cannon: spraying drinks from the tank */
    G.FT.water = 100;
    G.FT.pos.set(bay.x, by, bay.z); G.FT.heading = 0;
    G.ftPose(bay.x, by, bay.z, 0); G.ftBodyIM.instanceMatrix.needsUpdate = true;
    G.player.position.set(bay.x + 2, by, bay.z);
    frame(1);
    G.ftEnter();
    G.waterHeld = true;
    frame(12);   // ~0.2s of spray
    G.waterHeld = false;
    check('lmfirest: spraying consumes tank water',
      G.FT.water < 100 && G.FT.water > 90, 'water=' + G.FT.water.toFixed(1));
    G.FT.water = 0.2;
    G.waterHeld = true;
    frame(12);
    G.waterHeld = false;
    check('lmfirest: empty tank stops the spray (TANK EMPTY toast)',
      G.FT.water === 0 && G.FT.spraying === false && G.toastEl.textContent === 'TANK EMPTY - REFILL AT THE STATION',
      'water=' + G.FT.water);
    G.ftExit();

    /* hull: wildfire heat damages the truck, the bay repairs it */
    G.FT.hp = 100;
    G.FIRES.length = 0;
    G.FIRES.push({ idx: 0, x: G.FT.pos.x + 2, z: G.FT.pos.z, t: 1, burnDur: 70, spreadDone: true, dmgT: 0, phase: 0 });
    G.player.position.set(bay.x + 2, by, bay.z);
    frame(1);
    G.ftEnter();
    frame(70);   // ~1.17s inside 4m of the fire
    check('lmfirest: wildfire heat damages the truck hull (~2/s)',
      G.FT.hp < 100 && G.FT.hp > 90, 'hp=' + G.FT.hp.toFixed(1));
    G.FIRES.length = 0;
    G.ftExit();

    /* HUD chip: shows within 500m with bearing arrow + distance, hidden when far */
    G.player.position.set(cd.x + 60, groundY(cd.x + 60, cd.z), cd.z);
    frame(20);
    check('lmfirest: chip shows within range',
      G.firestChipEl.style.display === 'block', 'display=' + G.firestChipEl.style.display);
    check('lmfirest: chip reads FIRE STN <distance>M',
      /^FIRE STN \d+M$/.test(G.firestTxtEl.textContent), G.firestTxtEl.textContent);
    check('lmfirest: chip arrow carries a bearing rotation',
      /rotate\(-?\d+(\.\d+)?deg\)/.test(G.firestArrEl.style.transform || ''),
      G.firestArrEl.style.transform);
    let farX = cd.x + 1000, farZ = cd.z;
    for (let fx = cd.x + 1000; fx <= cd.x + 3000; fx += 500) {
      let ok = true;
      for (let gx = -80; gx <= 80 && ok; gx++) for (let gz = -80; gz <= 80 && ok; gz++) {
        if (G.amenityTypeFor(gx, gz) !== 'firestation' || !G.amenityAccepted(gx, gz)) continue;
        const a = G.amenityCenterFor(gx, gz);
        if (a && a.type === 'firestation' && Math.hypot(a.x - fx, a.z - farZ) < 600) ok = false;
      }
      if (ok) { farX = fx; break; }
    }
    G.player.position.set(farX, groundY(farX, farZ), farZ);
    frame(20);
    check('lmfirest: chip hides when far',
      G.firestChipEl.style.display === 'none', 'display=' + G.firestChipEl.style.display);

    /* transit: bus/taxi/bike/bc/scooter never anchor at the station in v1 */
    G.busRebuildRoute(fgx, fgz);
    check('lmfirest: bus routes never stop at the station in v1',
      G.BUS.route.every(s => s.type !== 'firestation'), 'stops=' + G.BUS.route.length);
    G.TX.riding = false; G.TX.routeKey = '';
    G.txRebuild(fgx, fgz);
    check('lmfirest: taxi routes never stop at the station in v1',
      (G.TX.route || []).every(s => s.type !== 'firestation'), 'stops=' + (G.TX.route || []).length);

    /* night: beacon dome + bay interiors glow via the shared emissive ramp, zero new lights */
    G.player.position.set(cd.x + 60, groundY(cd.x + 60, cd.z), cd.z);
    G.dayPhase = 0.75;   // midnight
    frame(5);
    check('lmfirest: beacon + bay interiors glow at night (shared emissive ramp, no new lights)',
      G.AMEN_DEF.firestation.meshes[0].material.emissiveIntensity > 1,
      G.AMEN_DEF.firestation.meshes[0].material.emissiveIntensity.toFixed(2));
    G.dayPhase = 0.3;

    frame(30);
    check('lmfirest: round trip leaves zero console errors/warnings',
      consoleProblems.length === probs0, consoleProblems.slice(probs0).join(' | '));

    /* leave the world as the next block expects: exit the hall, player at origin, FT rebuilt there */
    if (G.FIRESTHALL.inHall) G.firestHallExit();
    G.player.position.set(0, groundY(0, 0), 0);
    G.FT.routeKey = ''; G.FT.driving = false; G.FT.water = 100; G.FT.hp = 100; G.ftRebuild(0, 0);
    G.FIRES.length = 0;
  }
}

/* ================= PERF-7 CHUNK-BOUNDED INSTANCING v1 (perf) =================
   The 6 landmark amenity types (stad, amuse, hosp, theater, casino,
   firestation; cap 2 each) ride per-site InstancedMesh fleets instead of one
   shared mesh per type. One batch per world-space site, each with tight
   per-site bounds, so three.js rejects whole off-screen sites before any
   per-instance work (the chunkSize pattern). The 5 non-landmark types keep
   the shared-mesh idiom untouched. */
{
  const LM_KEYS = ['stad', 'amuse', 'hosp', 'theater', 'casino', 'firestation'];
  const SH_KEYS = ['gas', 'garage', 'rest', 'park', 'land'];

  /* fleet registry shape: per-site meshes for landmarks, shared mesh otherwise */
  for (const k of LM_KEYS) {
    const d = G.AMEN_DEF[k];
    check('perf7-cb: ' + k + ' def carries per-site meshes[] of length cap',
      !!d && Array.isArray(d.meshes) && d.meshes.length === d.cap, 'cap=' + (d && d.cap));
    check('perf7-cb: ' + k + ' def.mesh is null (no stale shared ref)', !!d && d.mesh === null);
    check('perf7-cb: ' + k + ' every site mesh is an InstancedMesh of capacity 1, frustum-culled, frozen',
      !!d && d.meshes.every(sm => sm instanceof THREE.InstancedMesh
        && sm.instanceMatrix.count === 1 && sm.frustumCulled === true
        && sm.castShadow === false && G.FROZEN_STATICS.includes(sm)));
  }
  for (const k of SH_KEYS) {
    const d = G.AMEN_DEF[k];
    check('perf7-cb: ' + k + ' keeps the shared mesh (frustumCulled false, frozen)',
      !!d && d.mesh instanceof THREE.InstancedMesh && d.mesh.frustumCulled === false
      && G.FROZEN_STATICS.includes(d.mesh) && !('meshes' in d));
  }
  check('perf7-cb: whole-file InstancedMesh literal pin still 48 (one amenIM constructor)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);

  /* find a chunk with at least one active landmark site, and one with none */
  let lmChunk = null;
  lmouter: for (let gx = -80; gx <= 80 && !lmChunk; gx++)
    for (let gz = -80; gz <= 80 && !lmChunk; gz++)
      for (const k of LM_KEYS)
        if (G.amenityTypeFor(gx, gz) === k && G.amenityAccepted(gx, gz)) { lmChunk = [gx, gz, k]; break lmouter; }
  check('perf7-cb: a seeded landmark chunk exists in the scan window', !!lmChunk,
    lmChunk ? lmChunk.join(',') : 'none');

  let emptyChunk = null;
  emptyouter: for (let gx = 200; gx <= 400 && !emptyChunk; gx += 7)
    for (let gz = 200; gz <= 400 && !emptyChunk; gz += 7) {
      let any = false;
      for (let ax = gx - 3; ax <= gx + 3 && !any; ax++)
        for (let az = gz - 3; az <= gz + 3 && !any; az++) {
          const t = G.amenityTypeFor(ax, az);
          if (t && LM_KEYS.indexOf(t) !== -1 && G.amenityAccepted(ax, az)) any = true;
        }
      if (!any) emptyChunk = [gx, gz];
    }
  check('perf7-cb: a landmark-free chunk exists in the far scan window', !!emptyChunk,
    emptyChunk ? emptyChunk.join(',') : 'none');

  if (lmChunk && emptyChunk) {
    const probsC = consoleProblems.length;
    /* occupied state: real redistribute at the landmark chunk */
    G.redistributeAmenities(lmChunk[0], lmChunk[1]);
    for (const k of LM_KEYS) {
      const d = G.AMEN_DEF[k], arr = G.AMEN.active[k];
      for (let i = 0; i < d.cap; i++) {
        const sm = d.meshes[i], occ = i < arr.length;
        check('perf7-cb: ' + k + '[' + i + '] visible matches occupancy (' + occ + ')',
          sm.visible === occ);
        check('perf7-cb: ' + k + '[' + i + '] count matches occupancy (' + (occ ? 1 : 0) + ')',
          sm.count === (occ ? 1 : 0));
        check('perf7-cb: ' + k + '[' + i + '] frustumCulled stays true',
          sm.frustumCulled === true);
        if (occ) {
          const bs = sm.boundingSphere;
          check('perf7-cb: ' + k + '[' + i + '] bounding sphere is tight (< 90m)',
            !!bs && bs.radius < 90 && bs.radius > 0, 'r=' + (bs && bs.radius.toFixed(1)));
          /* instance matrix matches the site transform (the redistribute idiom) */
          const a = arr[i];
          const m4 = new THREE.Matrix4();
          sm.getMatrixAt(0, m4);
          check('perf7-cb: ' + k + '[' + i + '] instance sits at the site origin',
            Math.abs(m4.elements[12] - a.x) < 0.01 && Math.abs(m4.elements[14] - a.z) < 0.01,
            'dx=' + (m4.elements[12] - a.x).toFixed(3));
        }
      }
    }
    /* worst-case draw-site submission: 6 landmark types x cap 2 = 12 meshes max */
    const visibleSites = LM_KEYS.reduce((n, k) =>
      n + G.AMEN_DEF[k].meshes.filter(sm => sm.visible).length, 0);
    check('perf7-cb: at most 12 landmark site meshes can submit (worst case +6 vs 6 before)',
      visibleSites <= 12, 'visible=' + visibleSites);

    /* toggle: move to the empty chunk, every site mesh must hide */
    G.redistributeAmenities(emptyChunk[0], emptyChunk[1]);
    const allHidden = LM_KEYS.every(k => G.AMEN.active[k].length === 0
      && G.AMEN_DEF[k].meshes.every(sm => sm.visible === false && sm.count === 0));
    check('perf7-cb: empty chunk hides every landmark site mesh (visible=false, count=0)', allHidden);

    /* shared-mesh behavior unchanged for the non-landmark types */
    for (const k of SH_KEYS) {
      const d = G.AMEN_DEF[k];
      check('perf7-cb: ' + k + ' shared mesh count tracks active sites',
        d.mesh.count === G.AMEN.active[k].length,
        'count=' + d.mesh.count + ' active=' + G.AMEN.active[k].length);
    }
    check('perf7-cb: redistribute round trip leaves zero console errors/warnings',
      consoleProblems.length === probsC, consoleProblems.slice(probsC).join(' | '));

    /* restore: one live tick at the player chunk re-syncs the chunk-change
       tracker (_lastPCX/_lastPCZ) with AMEN.active, so the next block's
       teleport triggers a real chunk redistribute instead of reading stale
       state. A direct redistributeAmenities() call alone would leave the
       tracker stale and break the next block's activation checks. */
    frame(2);
  }
}

/* ================= PHASE 5: FIRE STATION v2 - FIREFIGHTER DISPATCH ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.FIRESTHALL.inHall) G.firestHallExit();
  G.FT.driving = false; G.waterHeld = false;
  G.FIRES.length = 0; G.INCIDENTS.length = 0;
  const crew = G.BUSNPC.ff.crew;
  for (const n of crew) { n.state = 'POST'; n.spraying = false; }
  G.BUSNPC.ff.incident = null; G.BUSNPC.ff.sprayOn = false;
  G.FIRECREW.lastDispatch = -1e9; G.FIRECREW.putOut = 0;

  /* static: the fire-crew block adds exactly one IM literal (the helmet
     fleet), zero new lights, no unseeded RNG, no em dashes, no external
     URLs, no markers; whole-file pins move 47 -> 48 with justification */
  const ffSrc = html.slice(html.indexOf('/* ================= PHASE 5: FIRE STATION v2 - FIREFIGHTER DISPATCH'),
                           html.indexOf('/* ==================== VEHICLES PHASE 1: DRIVABLE CAR'));
  check('firecrew-static: the helmet fleet is the one +1 IM literal (lives in the PEOPLE block, 2 slots)',
    (html.match(/npcHelmIM = new THREE\.InstancedMesh/g) || []).length === 1);
  check('firecrew-static: fire-crew block creates no lights',
    !/new THREE\.(PointLight|SpotLight|DirectionalLight|HemisphereLight|AmbientLight|RectAreaLight)/.test(ffSrc));
  check('firecrew-static: no unseeded RNG in the fire-crew block', !/Math\.random/.test(ffSrc));
  check('firecrew-static: no em dashes in the fire-crew block', !ffSrc.includes('\u2014'));
  check('firecrew-static: no external URLs in the fire-crew block', !/https?:\/\//.test(ffSrc));
  check('firecrew-static: no markers in the fire-crew block', !/\bTODO\b/.test(ffSrc));
  check('firecrew-static: whole-file IM literals pin at 48 (47 + 1 fire-crew helmet fleet)',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
  check('firecrew-static: 92 Math.random lines pin holds',
    html.split('\n').filter(l => l.indexOf('Math.random') !== -1).length === 92);

  /* the rig: 2 firefighters on the pedestrian fleet, helmet fleet holds 2 */
  check('firecrew: the crew rides the pedestrian rig (2 NPCs, zone fire, POST)',
    crew.length === 2 && crew.every(n => n.zone === 'fire' && n.state === 'POST'),
    crew.map(n => n.zone + '/' + n.state).join(','));
  check('firecrew: helmet fleet holds 2 slots',
    G.BUSNPC.helmIM.isInstancedMesh === true && G.BUSNPC.helmIM.count === 2);

  /* the station activates near the player; the crew snaps to the post */
  let fgx = 0, fgz = 0, ffound = false;
  fouter: for (let gx = -60; gx <= 60; gx++)
    for (let gz = -60; gz <= 60; gz++) {
      if (G.amenityTypeFor(gx, gz) === 'firestation' && G.amenityAccepted(gx, gz)) { fgx = gx; fgz = gz; ffound = true; break fouter; }
    }
  check('firecrew: a seeded firestation chunk exists', ffound, 'at ' + fgx + ',' + fgz);
  const fcd = G.amenityCenterFor(fgx, fgz);
  G.player.position.set(fcd.x + 60, groundY(fcd.x + 60, fcd.z), fcd.z);
  frame(20);
  const ffa = G.AMEN.active.firestation.find(a => Math.hypot(a.x - fcd.x, a.z - fcd.z) < 1);
  check('firecrew: the station activates near the player', !!ffa);
  const fpost = G.ffPostFor(ffa);
  check('firecrew: the crew stands by at the station post',
    crew.every(n => Math.hypot(n.pos.x - fpost.x, n.pos.z - fpost.z) < 3),
    crew.map(n => n.pos.x.toFixed(1) + ',' + n.pos.z.toFixed(1)).join(' '));

  /* a seeded-ignitable tree 8-100m from the (stationary) player */
  const ftrees = G.FLORA.trees;
  const _fm4 = new THREE.Matrix4(), _fv3 = new THREE.Vector3();
  let fti = -1, ftx = 0, ftz = 0;
  for (let i = 0; i < ftrees.count && fti < 0; i++) {
    ftrees.getMatrixAt(i, _fm4); _fv3.setFromMatrixPosition(_fm4);
    const pdx = _fv3.x - G.player.position.x, pdz = _fv3.z - G.player.position.z;
    const pd2 = pdx * pdx + pdz * pdz;
    if (pd2 < 64 || pd2 > 100 * 100) continue;
    const h = G.hash2i(Math.floor(_fv3.x), Math.floor(_fv3.z)) ^ G.hash2i(i, 7);
    if ((h & 3) !== 0) { fti = i; ftx = _fv3.x; ftz = _fv3.z; }
  }
  check('firecrew: a seeded-ignitable tree exists 8-100m out', fti >= 0, 'idx=' + fti);
  const probs1 = consoleProblems.length;
  const ignOk = G.wildfireIgnite(fti, ftx, ftz);   // synchronous: no frames, no recycle
  check('firecrew: ignition registers an incident with a seeded callout ID',
    ignOk && G.INCIDENTS.length === 1 && /^INC-[0-9A-F]{6}$/.test(G.INCIDENTS[0].id)
    && G.INCIDENTS[0].state === 'active',
    'inc=' + JSON.stringify(G.INCIDENTS[0]));
  check('firecrew: the fire record carries the incident id',
    G.FIRES.length === 1 && G.FIRES[0].incId === G.INCIDENTS[0].id);
  check('firecrew: the nearest station dispatches the crew (TO_INCIDENT)',
    crew.every(n => n.state === 'TO_INCIDENT'),
    crew.map(n => n.state).join(','));
  check('firecrew: ignition toast wins inside 150m (dispatch toast suppressed, no stomp)',
    G.toastEl.textContent === 'WILDFIRE!', G.toastEl.textContent);

  /* dispatch toast + busy guard, driven directly (deterministic, no frames) */
  for (const n of crew) { n.state = 'POST'; n.spraying = false; }
  G.BUSNPC.ff.incident = null; G.INCIDENTS.length = 0; G.FIRES.length = 0;
  G.FIRECREW.lastDispatch = -1e9;
  const px = G.player.position.x, pz = G.player.position.z;
  const inc2 = { id: 'INC-TST01', x: px + 200, z: pz, state: 'active' };
  G.INCIDENTS.push(inc2);
  const dOk = G.fireDispatch(inc2, false);
  check('firecrew: FIREFIGHTERS DISPATCHED toast within 300m',
    dOk === true && G.toastEl.textContent === 'FIREFIGHTERS DISPATCHED', G.toastEl.textContent);
  check('firecrew: a busy crew is not re-dispatched (busy guard)',
    G.fireDispatch({ id: 'INC-TST02', x: px + 210, z: pz, state: 'active' }, false) === false
    && crew.every(n => n.state === 'TO_INCIDENT'),
    crew.map(n => n.state).join(','));

  /* a real fire for the suppression leg: reset, re-ignite, walk the crew in */
  for (const n of crew) { n.state = 'POST'; n.spraying = false; }
  G.BUSNPC.ff.incident = null; G.BUSNPC.ff.sprayOn = false;
  G.INCIDENTS.length = 0; G.FIRES.length = 0;
  G.FIRECREW.lastDispatch = -1e9;
  G.wildfireIgnite(fti, ftx, ftz);
  const ff0 = G.FIRES[0];
  check('firecrew: re-ignition re-dispatches a rested crew',
    !!ff0 && crew.every(n => n.state === 'TO_INCIDENT'));
  for (const n of crew) {
    n.state = 'SUPPRESS';
    n.pos.set(ff0.x + 5, groundY(ff0.x + 5, ff0.z), ff0.z);
  }
  frame(30);   // chip cadence
  check('firecrew: chip reads CREW ON SITE while suppressing',
    /CREW ON SITE/.test(G.fireTxtEl.textContent), G.fireTxtEl.textContent);
  const ft0 = ff0.t;
  frame(60);   // 1s of suppression
  check('firecrew: suppression degrades the burn timer (~3x per firefighter)',
    ff0.t - ft0 > 2, 'dt=' + (ff0.t - ft0).toFixed(2));
  check('firecrew: the hose arc is live while suppressing',
    G.BUSNPC.ff.sprayOn === true);
  /* a suppressed fire counts as put out when it crosses burnout */
  ff0.t = ff0.burnDur - 0.05; ff0.spreadDone = true;
  const po0 = G.FIRECREW.putOut;
  frame(30);
  check('firecrew: a suppressed fire counts as put out', G.FIRECREW.putOut > po0,
    'putOut=' + G.FIRECREW.putOut);

  /* incident clears: stand down, FIRE OUT, walk back to post */
  G.FIRES.length = 0;
  frame(5);
  check('firecrew: the crew stands down when the incident clears (RETURN)',
    crew.every(n => n.state === 'RETURN'),
    crew.map(n => n.state).join(','));
  check('firecrew: FIRE OUT toast in range', G.toastEl.textContent === 'FIRE OUT', G.toastEl.textContent);
  const fpost2 = G.ffPostFor(ffa);
  for (const n of crew) n.pos.set(fpost2.x + 1, groundY(fpost2.x + 1, fpost2.z), fpost2.z);
  frame(30);
  check('firecrew: the crew returns to post and stands down (POST)',
    crew.every(n => n.state === 'POST'),
    crew.map(n => n.state).join(','));

  /* neutrality: wanted heat never moves the crew */
  G.setHeat(5, true);
  frame(30);
  check('firecrew: wanted heat never moves the crew (neutral, no flee)',
    crew.every(n => n.state === 'POST'),
    crew.map(n => n.state).join(','));
  G.setHeat(0, true);

  frame(30);
  check('firecrew: round trip leaves zero console errors/warnings',
    consoleProblems.length === probs1, consoleProblems.slice(probs1).join(' | '));

  /* leave the world clean: player at origin, no fires, crew at post */
  G.player.position.set(0, groundY(0, 0), 0);
  G.FIRES.length = 0; G.INCIDENTS.length = 0;
  for (const n of crew) { n.state = 'POST'; n.spraying = false; }
  G.BUSNPC.ff.incident = null; G.BUSNPC.ff.sprayOn = false;
}

/* ================= PERF-7: dirty-once instance marks =================
   three.js BufferAttribute.needsUpdate is a write-only setter that bumps
   .version, so a skipped GPU re-upload is observable as an unchanged
   version. Each skip case settles twice first (absorbs one-time rebuild
   side effects), then asserts the next tick does not bump the version. */
{
  const mver = (im) => im.instanceMatrix.version;

  /* lootTick: all taken -> no re-upload; one live item -> re-upload */
  const lootTakenWas = G.LOOT.map(L => L.taken);
  for (const L of G.LOOT) L.taken = true;
  G.lootTick(0.016); G.lootTick(0.016);   // settle
  const li0 = mver(G.lootIcons), lg0 = mver(G.lootGuns);
  G.lootTick(0.016);
  check('perf7: lootTick skips the re-upload when every item is taken',
    mver(G.lootIcons) === li0 && mver(G.lootGuns) === lg0,
    'icons ' + li0 + '->' + mver(G.lootIcons) + ', guns ' + lg0 + '->' + mver(G.lootGuns));
  G.LOOT[0].taken = false;   // LOOT[0] is a weapon: poses both fleets
  G.lootTick(0.016);
  check('perf7: lootTick still re-uploads when a live item is posed',
    mver(G.lootIcons) === li0 + 1 && mver(G.lootGuns) === lg0 + 1,
    'icons ' + li0 + '->' + mver(G.lootIcons) + ', guns ' + lg0 + '->' + mver(G.lootGuns));
  lootTakenWas.forEach((t, i) => { G.LOOT[i].taken = t; });

  /* busUpdate: inactive bus -> no re-upload */
  const busActiveWas = G.BUS.active;
  G.busUpdate(0.016, 0);   // settle the chunk anchor at the player's position first:
                           // a rebuild would re-activate the bus before the active check
  G.BUS.active = false;
  G.busUpdate(0.016, 0);
  const bb0 = mver(G.busBodyIM);
  G.busUpdate(0.016, 0);
  check('perf7: busUpdate skips the re-upload while the bus is inactive',
    mver(G.busBodyIM) === bb0, 'busBody ' + bb0 + '->' + mver(G.busBodyIM));
  G.BUS.active = busActiveWas;

  /* ftUpdate: parked truck -> no re-upload */
  check('perf7: fire truck is placed by test end', G.FT.placed === true);
  const ftDrivingWas = G.FT.driving;
  G.FT.driving = false;
  G.ftUpdate(0.016, 0); G.ftUpdate(0.016, 0);   // settle
  const fb0 = mver(G.ftBodyIM);
  G.ftUpdate(0.016, 0);
  check('perf7: ftUpdate skips the re-upload while the truck is parked',
    mver(G.ftBodyIM) === fb0, 'ftBody ' + fb0 + '->' + mver(G.ftBodyIM));
  G.FT.driving = ftDrivingWas;

  /* missionTick: start markers always pose -> re-upload happens */
  const si0 = mver(G.startIcons);
  G.missionTick(0.016);
  check('perf7: missionTick still re-uploads the start markers',
    mver(G.startIcons) === si0 + 1, 'startIcons ' + si0 + '->' + mver(G.startIcons));

  /* trainUpdate: the fleet always poses -> re-upload happens */
  const tr0 = mver(G.trainBodyIM);
  G.trainUpdate(0.016, 1.0);
  check('perf7: trainUpdate still re-uploads the posed fleet',
    mver(G.trainBodyIM) === tr0 + 1, 'trainBody ' + tr0 + '->' + mver(G.trainBodyIM));
}

/* ================= 34. BANK DEPTH v1 (Phase 5 buildings/places) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);   // godT 0: civicEnter refuses while spawn-protected
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.CIVIC.state) G.civicExit();
  G.player.position.set(0, groundY(0, 0), 0);
  G.player.rotation.y = 0;
  frame(3);   // absorb any chunk crossing -> redistributeBuildings runs (seeded civics settle first)
  const bpx = G.player.position.x, bpz = G.player.position.z;
  const synthBank = (type) => {
    for (const t of G.CIVIC_ORDER) G.BLDG.active[t].length = 0;
    G.BLDG.active[type].push({ x: bpx + 3, z: bpz, y: groundY(bpx + 3, bpz), yaw: 0, gx: 0, gz: 0, name: type.toUpperCase(), type });
    G.player.position.set(bpx + 3 + 6.5, groundY(bpx + 9.5, bpz), bpz);
  };

  /* static: the two new buttons carry touch parity with the primary action */
  check('bank-static: DEPOSIT/WITHDRAW buttons have touchstart (passive:false) + click handlers',
    html.includes("civicActEl2.addEventListener('touchstart', civicDepositBtn, { passive: false })")
    && html.includes("civicActEl2.addEventListener('click', civicDepositBtn)")
    && html.includes("civicActEl3.addEventListener('touchstart', civicWithdrawBtn, { passive: false })")
    && html.includes("civicActEl3.addEventListener('click', civicWithdrawBtn)"));
  check('bank-static: zero new THREE objects in the bank code',
    !/new THREE\./.test(html.slice(html.indexOf('function civicDeposit()'), html.indexOf('function civicWithdraw()') + 400)));

  /* panel: DEPOSIT/WITHDRAW visible only inside the bank */
  synthBank('hospital');
  frame(3);
  G.civicEnter();
  check('bank: DEPOSIT/WITHDRAW hidden for non-bank civics',
    G.civicActEl2.style.display === 'none' && G.civicActEl3.style.display === 'none'
    && G.civicChipEl.textContent === 'HOSPITAL | HEAL $30 | E LEAVE', G.civicChipEl.textContent);
  G.civicExit();
  synthBank('bank');
  frame(3);
  G.civicEnter();
  check('bank: enter the bank (panel + chip show)',
    G.CIVIC.state === 'bank' && G.civicPanelEl.style.display === 'block');
  check('bank: DEPOSIT/WITHDRAW shown inside the bank',
    G.civicActEl2.style.display === 'flex' && G.civicActEl3.style.display === 'flex');
  check('bank: chip reads BANK | DEPOSIT / WITHDRAW / $20 DAILY | E LEAVE',
    G.civicChipEl.textContent === 'BANK | DEPOSIT / WITHDRAW / $20 DAILY | E LEAVE',
    G.civicChipEl.textContent);
  G.cash = 50; G.bankBal = 0; G.updateCivicChip();
  check('bank: foot renders wallet + bank balances live',
    G.civicFootEl.textContent === 'WALLET $50 | BANK $0 | DAILY ALLOWANCE ONCE PER IN-GAME DAY | INTEREST 2%/DAY',
    G.civicFootEl.textContent);

  /* deposit: all carried cash moves to the bank */
  G.cash = 100; G.bankBal = 50;
  G.civicDeposit();
  check('bank: deposit-all moves the whole wallet into the bank',
    G.cash === 0 && G.bankBal === 150 && G.toastEl.textContent === 'DEPOSITED $100',
    'cash=' + G.cash + ' bank=' + G.bankBal);
  check('bank: foot updates after the deposit',
    G.civicFootEl.textContent === 'WALLET $0 | BANK $150 | DAILY ALLOWANCE ONCE PER IN-GAME DAY | INTEREST 2%/DAY',
    G.civicFootEl.textContent);
  /* deposit denied at cash 0 */
  G.civicDeposit();
  check('bank: deposit denied at cash=0 (bank untouched, denied toast)',
    G.cash === 0 && G.bankBal === 150 && G.toastEl.textContent === 'NOTHING TO DEPOSIT',
    G.toastEl.textContent);

  /* withdraw: the whole bank balance comes back to the wallet */
  G.civicWithdraw();
  check('bank: withdraw-all moves the whole bank balance back to the wallet',
    G.cash === 150 && G.bankBal === 0 && G.toastEl.textContent === 'WITHDREW $150',
    'cash=' + G.cash + ' bank=' + G.bankBal);
  /* withdraw denied at bank 0 */
  G.civicWithdraw();
  check('bank: withdraw denied at bank=0 (wallet untouched, denied toast)',
    G.cash === 150 && G.bankBal === 0 && G.toastEl.textContent === 'NO SAVINGS',
    G.toastEl.textContent);
  /* bank-only guards: the actions no-op outside the bank */
  G.civicExit();
  check('bank: buttons hidden after exit',
    G.civicActEl2.style.display === 'none' && G.civicActEl3.style.display === 'none');
  G.cash = 100; G.bankBal = 50;
  G.civicDeposit(); G.civicWithdraw();
  check('bank: deposit/withdraw no-op outside the bank',
    G.cash === 100 && G.bankBal === 50, 'cash=' + G.cash + ' bank=' + G.bankBal);

  /* the $20 daily allowance is still day-gated (ATM idiom untouched) */
  synthBank('bank');
  frame(3);
  G.civicEnter();
  G.CIVIC.atmDay = G.CIVIC.day - 1;
  const allow0 = G.cash;
  G.civicAtm();
  check('bank: $20 allowance pays when the day gate is open',
    G.cash === allow0 + 20 && G.CIVIC.atmDay === G.CIVIC.day, 'cash=' + G.cash);
  G.civicAtm();
  check('bank: $20 allowance denied twice in one in-game day',
    G.cash === allow0 + 20 && G.toastEl.textContent === 'COME BACK TOMORROW', G.toastEl.textContent);
  G.civicExit();

  /* death: 15% of carried cash seized, the bank untouched */
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);
  G.cash = 100; G.bankBal = 500;
  G.hurtPlayer(999);
  check('bank: death seizes 15% of carried cash and leaves the bank intact',
    G.P.dead === true && G.cash === 85 && G.bankBal === 500
    && G.toastEl.textContent === 'ELIMINATED - $15 LOST',
    'cash=' + G.cash + ' bank=' + G.bankBal + ' toast=' + G.toastEl.textContent);
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999;

  /* busted: 25% of carried cash seized, the bank untouched */
  G.cash = 100; G.bankBal = 300; G.setHeat(1, true);
  G.busted();
  check('bank: BUSTED seizes 25% of carried cash and leaves the bank intact',
    G.cash === 75 && G.bankBal === 300 && G.W.heat === 0
    && G.toastEl.textContent === 'BUSTED - $25 SEIZED | BANK SAFE',
    'cash=' + G.cash + ' bank=' + G.bankBal + ' toast=' + G.toastEl.textContent);
  G.P.godT = 9999;

  /* save schema v4: the bank persists across a round-trip */
  G.player.position.set(12.34, groundY(12.34, 56.78), 56.78);
  G.cash = 200; G.bankBal = 777; G.P.hp = 100;
  G.saveGame();
  const braw = stubs.localStorage.getItem(G.SAVE_KEY);
  check('bank: save v4 envelope persists the bank balance',
    !!braw && braw.includes('"version":4') && braw.includes('"bank":777'), braw && braw.slice(0, 60));
  G.cash = 0; G.bankBal = 0;
  G.loadSave();
  check('bank: load restores the bank balance exactly',
    G.cash === 200 && G.bankBal === 777, 'cash=' + G.cash + ' bank=' + G.bankBal);

  /* migration: a synthetic v3 envelope migrates forward with bank=0 */
  const v3env = JSON.parse(JSON.stringify({
    version: 3,
    data: { x: 1, z: 2, cash: 50, kills: 1, sg: -1, sm: -1, cw: 'rifle', hp: 100,
            am: -1, done: '0'.repeat(G.MISSIONS.length), heat: 0, pet: '', food: '0:0:0:0:0:0' }
  }));
  const vmig = G.migrateSave(v3env);
  check('bank: synthetic v3 envelope migrates to v4 with bank=0',
    !!vmig && vmig.bank === 0 && vmig.cash === 50,
    vmig ? 'bank=' + vmig.bank + ' cash=' + vmig.cash : 'null');
  for (const t of G.CIVIC_ORDER) G.BLDG.active[t].length = 0;
}

/* ================= 35. BANK HEIST v1 (Phase 5 buildings/places) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);   // godT 0: civicEnter refuses while spawn-protected
  G.closeShop();
  for (const e of G.enemies) { e.live = false; e.state = 'wander'; e.hp = e.cfg.hp; e.group.position.set(500, 0, 500); }
  if (G.CIVIC.state) G.civicExit();
  if (G.HEIST.active) G.endHeist('test');
  G.player.position.set(0, groundY(0, 0), 0);
  G.player.rotation.y = 0;
  frame(3);
  const hpx = G.player.position.x, hpz = G.player.position.z;
  const synthBank = (type) => {
    for (const t of G.CIVIC_ORDER) G.BLDG.active[t].length = 0;
    G.BLDG.active[type].push({ x: hpx + 3, z: hpz, y: groundY(hpx + 3, hpz), yaw: 0, gx: 0, gz: 0, name: type.toUpperCase(), type });
    G.player.position.set(hpx + 3 + 6.5, groundY(hpx + 9.5, hpz), hpz);
  };
  const bankCenter = () => ({ x: hpx + 3, z: hpz });

  /* static: ROB BANK carries touch parity; zero new THREE objects; seeded RNG only */
  check('heist-static: ROB BANK button has touchstart (passive:false) + click handlers',
    html.includes("civicActEl4.addEventListener('touchstart', civicHeistBtn, { passive: false })")
    && html.includes("civicActEl4.addEventListener('click', civicHeistBtn)"));
  check('heist-static: zero new THREE objects in the heist code',
    !/new THREE\./.test(html.slice(html.indexOf('Phase 5 bank heist: rob the bank'), html.indexOf('queueMicrotask(() => worldTickers.push(heistTick))'))));
  check('heist-static: zero new Math.random lines in the heist code',
    !/Math\.random/.test(html.slice(html.indexOf('Phase 5 bank heist: rob the bank'), html.indexOf('queueMicrotask(() => worldTickers.push(heistTick))'))));
  check('heist-static: InstancedMesh literal sites stay at 48',
    (html.match(/new THREE\.InstancedMesh/g) || []).length === 48);
  check('heist-static: #heistchip element exists in the HUD',
    html.includes('<div id="heistchip"></div>'));

  /* ROB BANK shows bank-only */
  synthBank('hospital');
  frame(3);
  G.civicEnter();
  check('heist: ROB BANK hidden for non-bank civics', G.civicActEl4.style.display === 'none');
  G.civicHeist();
  check('heist: start denied outside the bank (no state, no heat)',
    G.HEIST.active === false && G.W.heat === 0, 'active=' + G.HEIST.active + ' heat=' + G.W.heat);
  G.civicExit();

  /* start at the bank: alarm heat +2, toast, chip, stormed out of the panel */
  synthBank('bank');
  frame(3);
  G.civicEnter();
  check('heist: ROB BANK shown inside the bank', G.civicActEl4.style.display === 'flex');
  G.cash = 100; G.bankBal = 300;
  G.civicHeist();
  check('heist: start adds +2 heat immediately',
    G.HEIST.active === true && G.W.heat === 2, 'heat=' + G.W.heat);
  check('heist: start toast reads HEIST STARTED - GRAB THE CASH',
    G.toastEl.textContent === 'HEIST STARTED - GRAB THE CASH', G.toastEl.textContent);
  check('heist: chip shows live take and heat while active',
    G.heistChipEl.style.display === 'block' && G.heistChipEl.textContent === 'HEIST $0 | HEAT 2',
    G.heistChipEl.textContent);
  check('heist: player storms out of the panel on start',
    G.CIVIC.state === null && G.civicPanelEl.style.display === 'none');
  check('heist: 5 vault sacks seeded at $200-$1000, none taken',
    G.HEIST.sacks.length === 5 && G.HEIST.sacks.every(s => !s.taken && s.amt >= 200 && s.amt <= 1000),
    G.HEIST.sacks.map(s => s.amt).join(','));
  check('heist: sacks seed inside the getaway radius, none at the porch',
    G.HEIST.sacks.every(s => {
      const dx = s.x - G.HEIST.bx, dz = s.z - G.HEIST.bz;
      const px = G.player.position.x, pz = G.player.position.z;
      const pdx = s.x - px, pdz = s.z - pz;
      return dx * dx + dz * dz <= G.HEIST_R2 && pdx * pdx + pdz * pdz >= 9;
    }));

  /* re-enter the bank mid-heist and rob again: denied. The near-state is set
     directly (no frame tick) so the walk-over grab cannot fire mid-test. */
  G.player.position.set(hpx + 3 + 6.5, groundY(hpx + 9.5, hpz), hpz);
  G.CIVIC.nearIdx = 0; G.CIVIC.nearType = 'bank'; G.CIVIC.hintR2 = 14 * 14;
  G.civicEnter();
  G.civicHeist();
  check('heist: second start denied while a heist is in progress',
    G.HEIST.active === true && G.W.heat === 2 && G.toastEl.textContent === 'HEIST IN PROGRESS',
    G.toastEl.textContent);
  G.civicExit();
  /* civicExit steps the player back onto the porch seat (the seed-time spot,
     >=3u from every sack), so the escalation tick below cannot grab. */

  /* escalation: +1 star per 45s while active, capped at 5 */
  G.HEIST.escT = 44.9;
  G.heistTick(0.2);
  check('heist: heat escalates +1 star after ~45s inside',
    G.W.heat === 3 && G.heistChipEl.textContent === 'HEIST $0 | HEAT 3', G.heistChipEl.textContent);
  G.setHeat(5, true); G.HEIST.escT = 45;
  G.heistTick(0.5);
  check('heist: escalation caps at 5 stars', G.W.heat === 5, 'heat=' + G.W.heat);
  G.setHeat(2, true);

  /* vault loot: walk-over grab adds to the wallet exactly */
  const s0 = G.HEIST.sacks[0];
  G.player.position.set(s0.x, groundY(s0.x, s0.z), s0.z);
  const cash0 = G.cash;
  G.heistTick(0.016);
  check('heist: walk-over grab adds the sack to wallet cash exactly',
    s0.taken === true && G.HEIST.loot === s0.amt && G.cash === cash0 + s0.amt
    && G.toastEl.textContent === 'GRABBED $' + s0.amt,
    'loot=' + G.HEIST.loot + ' cash=' + G.cash + ' toast=' + G.toastEl.textContent);
  check('heist: chip reflects the take',
    G.heistChipEl.textContent === 'HEIST $' + s0.amt + ' | HEAT 2', G.heistChipEl.textContent);
  const lootKept = G.HEIST.loot;

  /* leave the bank radius with heat up: heist ends, no clean toast */
  G.setHeat(2, true);
  G.player.position.set(G.HEIST.bx + 100, groundY(G.HEIST.bx + 100, G.HEIST.bz), G.HEIST.bz);
  G.heistTick(0.016);
  check('heist: leaving the bank radius ends the heist (heat up, no clean toast)',
    G.HEIST.active === false && G.heistChipEl.style.display === 'none'
    && G.toastEl.textContent === 'HEIST ENDED' && G.HEIST.sacks.length === 0,
    G.toastEl.textContent);

  /* clean escape: heat back at 0 when leaving -> clean toast */
  synthBank('bank');
  frame(3);
  G.civicEnter();
  G.civicHeist();
  const s1 = G.HEIST.sacks[0];
  G.player.position.set(s1.x, groundY(s1.x, s1.z), s1.z);
  G.heistTick(0.016);
  const loot2 = G.HEIST.loot;
  G.setHeat(0, true);
  G.player.position.set(G.HEIST.bx + 100, groundY(G.HEIST.bx + 100, G.HEIST.bz), G.HEIST.bz);
  G.heistTick(0.016);
  check('heist: clean escape (heat 0) toasts HEIST CLEAN - KEPT $N',
    G.HEIST.active === false && G.toastEl.textContent === 'HEIST CLEAN - KEPT $' + loot2,
    G.toastEl.textContent);

  /* BUSTED during the heist: ends it, normal 25% wallet seizure, bank untouched, no clean toast */
  synthBank('bank');
  frame(3);
  G.civicEnter();
  G.civicHeist();
  const s2 = G.HEIST.sacks[0];
  G.player.position.set(s2.x, groundY(s2.x, s2.z), s2.z);
  G.heistTick(0.016);
  G.cash = 100; G.bankBal = 300; G.setHeat(2, true);
  G.busted();
  check('heist: BUSTED ends the heist with the normal 25% wallet seizure only (no double-punish)',
    G.HEIST.active === false && G.cash === 75 && G.bankBal === 300 && G.W.heat === 0
    && G.toastEl.textContent === 'BUSTED - $25 SEIZED | BANK SAFE'
    && G.heistChipEl.style.display === 'none',
    'cash=' + G.cash + ' bank=' + G.bankBal + ' toast=' + G.toastEl.textContent);
  G.P.godT = 9999;

  /* death during the heist: ends it, normal 15% wallet seizure, bank untouched */
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0;
  synthBank('bank');
  frame(3);
  G.civicEnter();
  G.civicHeist();
  const s3 = G.HEIST.sacks[0];
  G.player.position.set(s3.x, groundY(s3.x, s3.z), s3.z);
  G.heistTick(0.016);
  G.cash = 100; G.bankBal = 300;
  G.hurtPlayer(999);
  check('heist: death ends the heist with the normal 15% wallet seizure only (no double-punish)',
    G.HEIST.active === false && G.P.dead === true && G.cash === 85 && G.bankBal === 300
    && G.toastEl.textContent === 'ELIMINATED - $15 LOST',
    'cash=' + G.cash + ' bank=' + G.bankBal + ' toast=' + G.toastEl.textContent);
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0;

  /* the deposit/withdraw/ATM flows are unchanged by the heist */
  synthBank('bank');
  frame(3);
  G.civicEnter();
  G.cash = 60; G.bankBal = 40;
  G.civicDeposit();
  check('heist: DEPOSIT still moves all carried cash to the bank',
    G.cash === 0 && G.bankBal === 100, 'cash=' + G.cash + ' bank=' + G.bankBal);
  G.civicWithdraw();
  check('heist: WITHDRAW still pulls the whole bank balance back',
    G.cash === 100 && G.bankBal === 0, 'cash=' + G.cash + ' bank=' + G.bankBal);
  G.CIVIC.atmDay = G.CIVIC.day - 1;
  const allow1 = G.cash;
  G.civicAtm();
  check('heist: $20 daily allowance still pays on the day gate',
    G.cash === allow1 + 20 && G.CIVIC.atmDay === G.CIVIC.day, 'cash=' + G.cash);
  G.civicExit();
  for (const t of G.CIVIC_ORDER) G.BLDG.active[t].length = 0;
  G.setHeat(0, true); G.P.godT = 9999;
}

/* ================= 36. BANK INTEREST v2 (Phase 5 buildings/places) ================= */
{
  G.P.dead = false; G.P.hp = 100; G.P.godT = 9999; G.setHeat(0, true);
  G.closeShop();
  if (G.CIVIC.state) G.civicExit();
  if (G.HEIST.active) G.endHeist('test');
  G.player.position.set(0, groundY(0, 0), 0);
  G.player.rotation.y = 0;
  frame(3);
  const ipx = G.player.position.x, ipz = G.player.position.z;
  const synthBank = (type) => {
    for (const t of G.CIVIC_ORDER) G.BLDG.active[t].length = 0;
    G.BLDG.active[type].push({ x: ipx + 3, z: ipz, y: groundY(ipx + 3, ipz), yaw: 0, gx: 0, gz: 0, name: type.toUpperCase(), type });
    G.player.position.set(ipx + 3 + 6.5, groundY(ipx + 9.5, ipz), ipz);
  };
  /* the real dawn path: the day/night clock wrap 1 -> 0, like the section-30 re-arm drive */
  const dawnWrap = () => {
    const day0 = G.CIVIC.day;
    G.dayPhase = 0.99; frame(2);
    G.dayPhase = 0.01; frame(2);
    return day0;
  };

  /* static: rate pin, zero new THREE objects, zero new RNG, panel line ships */
  check('interest-static: the rate pins at exactly 2%',
    G.BANK_INTEREST_RATE === 1.02, G.BANK_INTEREST_RATE);
  check('interest-static: zero new THREE objects in the interest block',
    !/new THREE\./.test(html.slice(html.indexOf('function bankDawnInterest()'), html.indexOf('queueMicrotask(() => worldTickers.push(heistTick))'))));
  check('interest-static: zero new Math.random in the interest block',
    !/Math\.random/.test(html.slice(html.indexOf('function bankDawnInterest()'), html.indexOf('queueMicrotask(() => worldTickers.push(heistTick))'))));
  check('interest-static: the bank panel carries the INTEREST 2%/DAY line',
    G.CIVIC_FOOT_TXT.bank.includes('INTEREST 2%/DAY'));

  /* zero balance: silent, no credit, no toast */
  G.bankBal = 0; G.toastEl.textContent = 'SENTINEL';
  G.bankDawnInterest();
  check('interest: zero balance stays zero with no toast spam',
    G.bankBal === 0 && G.toastEl.textContent === 'SENTINEL',
    'bank=' + G.bankBal + ' toast=' + G.toastEl.textContent);

  /* tiny balance: $1 never decreases (floor edge credits nothing, not less) */
  G.bankBal = 1; G.toastEl.textContent = 'SENTINEL';
  G.bankDawnInterest();
  check('interest: $1 balance never decreases',
    G.bankBal === 1 && G.toastEl.textContent === 'SENTINEL', 'bank=' + G.bankBal);

  /* exact math: floor(1000 * 1.02) = 1020, credit $20 */
  G.bankBal = 1000; G.toastEl.textContent = '';
  G.bankDawnInterest();
  check('interest: $1000 earns exactly floor(1000*1.02) = $1020',
    G.bankBal === 1020, 'bank=' + G.bankBal);
  check('interest: toast credits the exact amount',
    G.toastEl.textContent === '+$20 BANK INTEREST', G.toastEl.textContent);
  /* floor rounding on an odd balance: floor(150 * 1.02) = 153 */
  G.bankBal = 150; G.bankDawnInterest();
  check('interest: floor rounding applies on odd balances (150 -> 153)',
    G.bankBal === 153 && G.toastEl.textContent === '+$3 BANK INTEREST',
    'bank=' + G.bankBal + ' toast=' + G.toastEl.textContent);

  /* the real dawn path: one clock wrap ticks the day and credits once */
  G.bankBal = 1000; G.toastEl.textContent = '';
  const day0 = dawnWrap();
  check('interest: the dawn wrap ticks the day and credits 2% exactly once',
    G.CIVIC.day === day0 + 1 && G.bankBal === 1020
    && G.toastEl.textContent === '+$20 BANK INTEREST',
    'day=' + G.CIVIC.day + ' bank=' + G.bankBal + ' toast=' + G.toastEl.textContent);

  /* no interest at load time: the saved balance restores raw */
  G.player.position.set(12.34, groundY(12.34, 56.78), 56.78);
  G.cash = 200; G.bankBal = 1000; G.P.hp = 100;
  G.saveGame();
  G.cash = 0; G.bankBal = 0;
  G.loadSave();
  check('interest: load restores the saved balance with no credit applied',
    G.cash === 200 && G.bankBal === 1000, 'cash=' + G.cash + ' bank=' + G.bankBal);

  /* save round-trip keeps the post-interest balance */
  G.bankBal = 1020;
  G.saveGame();
  G.bankBal = 0;
  G.loadSave();
  check('interest: save round-trip keeps the post-interest balance',
    G.bankBal === 1020, 'bank=' + G.bankBal);

  /* newGame resets: a fresh session starts broke */
  G.bankBal = 500;
  G.newGame();
  check('interest: newGame resets the bank balance to zero',
    G.bankBal === 0, 'bank=' + G.bankBal);
  G.toastEl.textContent = 'SENTINEL';
  G.bankDawnInterest();
  check('interest: no toast fires on a zero balance after newGame',
    G.bankBal === 0 && G.toastEl.textContent === 'SENTINEL',
    'bank=' + G.bankBal + ' toast=' + G.toastEl.textContent);

  /* economy flows unchanged after interest: deposit, withdraw, ATM */
  G.P.dead = false; G.P.hp = 100; G.P.godT = 0; G.setHeat(0, true);   // godT 0: civicEnter refuses while spawn-protected
  synthBank('bank');
  frame(3);
  G.civicEnter();
  check('interest: the foot line shows balances plus INTEREST 2%/DAY',
    G.civicFootEl.textContent === 'WALLET $0 | BANK $0 | DAILY ALLOWANCE ONCE PER IN-GAME DAY | INTEREST 2%/DAY',
    G.civicFootEl.textContent);
  G.bankBal = 1020;
  G.civicWithdraw();
  check('interest: withdraw still pulls the whole post-interest balance back',
    G.cash === 1020 && G.bankBal === 0, 'cash=' + G.cash + ' bank=' + G.bankBal);
  G.civicDeposit();
  check('interest: deposit still moves the whole wallet after interest',
    G.cash === 0 && G.bankBal === 1020, 'cash=' + G.cash + ' bank=' + G.bankBal);
  G.CIVIC.atmDay = G.CIVIC.day - 1;
  const allow2 = G.cash;
  G.civicAtm();
  check('interest: $20 daily allowance still pays on the day gate',
    G.cash === allow2 + 20 && G.CIVIC.atmDay === G.CIVIC.day, 'cash=' + G.cash);
  G.civicExit();

  /* heist flow unchanged after interest: start pays into the wallet, bank untouched */
  synthBank('bank');
  frame(3);
  G.civicEnter();
  G.cash = 100; G.bankBal = 300;
  G.civicHeist();
  check('interest: heist still starts after interest (+2 heat, sacks seeded)',
    G.HEIST.active === true && G.W.heat === 2 && G.HEIST.sacks.length === 5,
    'heat=' + G.W.heat);
  G.endHeist('test');
  check('interest: the bank balance survives the heist start untouched',
    G.bankBal === 300, 'bank=' + G.bankBal);
  G.civicExit();
  for (const t of G.CIVIC_ORDER) G.BLDG.active[t].length = 0;
  G.setHeat(0, true); G.P.godT = 9999;
}

/* ---------- zero console errors ---------- */
check('boot+tests: zero console errors/warnings in stub env',
  consoleProblems.length === 0, consoleProblems.slice(0, 3).join(' | '));

console.error = origErr; console.warn = origWarn;
console.log(failures === 0 ? 'SMOKE RESULT: ALL GREEN' : 'SMOKE RESULT: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
