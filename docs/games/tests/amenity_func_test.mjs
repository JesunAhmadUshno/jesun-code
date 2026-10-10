/* Phase 3 amenity functional tests (scratch QA, not committed).
   Boots the real realms3d.html module in Node with the same stubs as the
   smoke harness, then exercises the new amenity systems directly. */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from './vendor/three.module.js';
import { installStubs } from './realms3d_stub.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = join(HERE, '..', 'realms3d.html');
const BOOT = join(HERE, '.r3d_amen_test.mjs');

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log('PASS - ' + name);
  else { failures++; console.log('FAIL - ' + name + (detail ? ' :: ' + detail : '')); }
}

const html = readFileSync(HTML, 'utf8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
let src = m[1];
src = src.replace(
  "import * as THREE from 'three';",
  "import * as THREE from './vendor/three.module.js';"
);
src = src.replace('new THREE.WebGLRenderer', 'new __StubRenderer');
src += `
globalThis.__R3D = {
  tick, carEnter, carExit, openRest, closeShop, buyItem, openShop,
  carAmenityHit, carAmenityRepair, redistributeAmenities, updateCarCondHUD,
  amenityTypeFor, amenityAccepted, placeAmenity, playing, terrainHeight, newGame,
  AMEN, AMEN_DEF, REST_ITEMS, SHOP_ITEMS, restCool,
  CAR, P, player, keys,
  get cash() { return cash; }, set cash(v) { cash = v; },
  get shopOpen() { return shopOpen; },
  get SHOP_LIST() { return SHOP_LIST; },
};
`;
writeFileSync(BOOT, src);
const stubs = installStubs();
stubs.getEl('overlay').classList.add('hidden');
let G = null;
try {
  await import(pathToFileURL(BOOT).href);
  G = globalThis.__R3D;
  check('boot ok', !!G);
} catch (e) {
  console.log('FAIL - boot threw :: ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e));
  process.exit(1);
} finally {
  try { unlinkSync(BOOT); } catch (e) {}
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function frame(n) { for (let i = 0; i < n; i++) { stubs.clock.advance(16.667); G.tick(); } }
const groundY = (x, z) => G.terrainHeight(x, z);
frame(5);   // settle: chunk recycle ran, amenities placed

/* 1. amenities stream with chunks */
{
  const tot = Object.values(G.AMEN.active).reduce((n, a) => n + a.length, 0);
  check('amenities placed near spawn', tot >= 1, 'total=' + tot);   // CLEAN WORLD: winner-take-all thins POIs; spawn view is deterministically 1
  let meshOk = true;
  for (const k in G.AMEN.active) {
    const def = G.AMEN_DEF[k];
    if (def.mesh.count !== G.AMEN.active[k].length) meshOk = false;
  }
  check('instanced mesh counts match active lists', meshOk);
  check('colliders registered', G.AMEN.colliders.length > 0, 'n=' + G.AMEN.colliders.length);
  let spawnClean = true;
  for (const k in G.AMEN.active)
    for (const a of G.AMEN.active[k])
      if (Math.abs(a.gx) <= 1 && Math.abs(a.gz) <= 1) spawnClean = false;
  check('no amenities in spawn-district chunks', spawnClean);
}

/* 2. determinism: same chunk set twice -> identical; revisit -> identical */
function snap() {
  const o = {};
  for (const k in G.AMEN.active) o[k] = G.AMEN.active[k].map(a => [a.x.toFixed(3), a.z.toFixed(3), a.yaw.toFixed(4)]);
  return JSON.stringify(o);
}
{
  G.redistributeAmenities(7, -4);
  const s1 = snap();
  G.redistributeAmenities(7, -4);
  const s2 = snap();
  check('redistribute is deterministic', s1 === s2);
  G.redistributeAmenities(30, 30);
  G.redistributeAmenities(7, -4);
  const s3 = snap();
  check('revisit regenerates identically', s1 === s3);
}

/* helper: find a chunk with a given amenity type */
function findChunk(type) {
  for (let gx = -12; gx <= 12; gx++)
    for (let gz = -12; gz <= 12; gz++)
      if (G.amenityTypeFor(gx, gz) === type && G.amenityAccepted(gx, gz, type)) return [gx, gz];
  return null;
}

/* 3. car damage: ramming a collider at speed hurts the hull */
{
  const col = G.AMEN.colliders[0];
  check('has a collider to ram', !!col);
  if (col) {
    G.CAR.hp = 100; G.CAR.armor = 0; G.CAR.hitCd = 0; G.CAR.speed = 15;
    G.CAR.pos.set(col.x, groundY(col.x, col.z), col.z);   // inside the collider
    G.carAmenityHit(0.016);
    check('hard hit damages hull', G.CAR.hp < 100, 'hp=' + G.CAR.hp);
    const pushed = Math.hypot(G.CAR.pos.x - col.x, G.CAR.pos.z - col.z);
    check('car pushed out of collider', pushed >= col.r + 1.15 - 0.01, 'd=' + pushed.toFixed(2));
    // armor soaks first
    G.CAR.hp = 100; G.CAR.armor = 50; G.CAR.hitCd = 0; G.CAR.speed = 15;
    G.CAR.pos.set(col.x, groundY(col.x, col.z), col.z);
    const hpBefore = G.CAR.hp;
    G.carAmenityHit(0.016);
    check('armor soaks damage first', G.CAR.hp === hpBefore && G.CAR.armor === 14,
      'hp=' + G.CAR.hp + ' armor=' + G.CAR.armor);
    G.CAR.speed = 0; G.CAR.armor = 0;
  }
}

/* 4. gas station: pad repairs hull over time */
{
  const c = findChunk('gas');
  check('a gas chunk exists', !!c);
  if (c) {
    G.redistributeAmenities(c[0], c[1]);
    const g = G.AMEN.active.gas[0];
    check('gas amenity placed', !!g);
    if (g) {
      G.CAR.hp = 40; G.CAR.armor = 0;
      G.CAR.pos.set(g.x, groundY(g.x, g.z), g.z);
      for (let i = 0; i < 400; i++) G.carAmenityRepair(0.016, i * 0.016 + 100);
      check('gas pad repairs to full', G.CAR.hp === 100, 'hp=' + G.CAR.hp);
    }
  }
}

/* 5. garage: instant full repair + 50 armor, 8s cooldown */
{
  const c = findChunk('garage');
  check('a garage chunk exists', !!c);
  if (c) {
    G.redistributeAmenities(c[0], c[1]);
    const g = G.AMEN.active.garage[0];
    check('garage amenity placed', !!g);
    if (g) {
      g.cool = 0;
      G.CAR.hp = 30; G.CAR.armor = 0;
      G.CAR.pos.set(g.x, groundY(g.x, g.z), g.z);
      G.carAmenityRepair(0.016, 1000);
      check('garage refits hull + armor', G.CAR.hp === 100 && G.CAR.armor === 50,
        'hp=' + G.CAR.hp + ' armor=' + G.CAR.armor);
      G.CAR.hp = 30;
      G.carAmenityRepair(0.016, 1001);   // within cooldown: no refit
      check('garage cooldown respected', G.CAR.hp === 30, 'hp=' + G.CAR.hp);
    }
  }
}

/* 6. restaurant: walk-in opens diner menu, cheap heal + full heal */
{
  const c = findChunk('rest');
  check('a restaurant chunk exists', !!c);
  if (c) {
    G.redistributeAmenities(c[0], c[1]);
    const r = G.AMEN.active.rest[0];
    check('restaurant placed', !!r);
    if (r) {
      G.P.dead = false; G.P.hp = 50; G.cash = 100;
      G.CAR.driving = false;
      G.player.position.set(r.x, groundY(r.x, r.z), r.z);
      let opened = false;
      for (let i = 0; i < 40 && !opened; i++) { frame(1); opened = G.shopOpen; }
      check('walk-in opens restaurant panel', opened);
      check('diner menu is active', G.SHOP_LIST === G.REST_ITEMS);
      G.buyItem(0);   // DINER MEAL +40 HP $15
      check('meal heals 40 for $15', G.P.hp === 90 && G.cash === 85, 'hp=' + G.P.hp + ' cash=' + G.cash);
      G.buyItem(1);   // FULL HEAL $40
      check('full heal to 100 for $40', G.P.hp === 100 && G.cash === 45, 'hp=' + G.P.hp + ' cash=' + G.cash);
      G.closeShop();
      check('panel closes', G.shopOpen === false);
      // regular shop still sells the shotgun for $300
      G.cash = 1000; G.openShop(0);
      check('shop menu restored after diner', G.SHOP_LIST === G.SHOP_ITEMS);
      G.buyItem(0);
      check('shop still sells shotgun $300', G.cash === 700);
      G.closeShop();
    }
  }
}

/* 7. wrecked engine: no throttle at 0 hull */
{
  G.newGame();
  frame(2);
  const px = G.CAR.pos.x + 2, pz = G.CAR.pos.z;
  G.player.position.set(px, groundY(px, pz), pz);
  frame(1);
  G.carEnter();
  G.CAR.hp = 0;
  const sx = G.CAR.pos.x, sz = G.CAR.pos.z;
  G.keys.KeyW = true;
  frame(60);
  G.keys.KeyW = false;
  const moved = Math.hypot(G.CAR.pos.x - sx, G.CAR.pos.z - sz);
  check('wrecked car does not move', moved < 0.01, 'moved=' + moved.toFixed(3));
  G.carExit();
}

/* 8. landmark: chip shows near a tower */
{
  const c = findChunk('land');
  check('a landmark chunk exists', !!c);
  if (c) {
    G.redistributeAmenities(c[0], c[1]);
    const L = G.AMEN.active.land[0];
    check('landmark placed', !!L);
    if (L) {
      G.P.dead = false;
      G.player.position.set(L.x + 30, groundY(L.x + 30, L.z), L.z);
      frame(30);   // >0.25s so the chip tick fires
      const chip = stubs.getEl('landchip');
      const txt = stubs.getEl('landtxt');
      check('landmark chip visible', chip.style.display === 'block', 'display=' + chip.style.display);
      check('chip names tower + chunk coords', /TOWER \d+M C\(/.test(txt.textContent), txt.textContent);
      // tower is tall
      let top = -1e9;
      const posA = L ? G.AMEN_DEF.land.mesh.geometry.attributes.position : null;
      if (posA) for (let i = 0; i < posA.count; i++) top = Math.max(top, posA.getY(i));
      check('tower is tall (visible from far)', top > 30, 'top=' + top.toFixed(1));
    }
  }
}

/* 9. Phase 5 gas/garage props: collider entries + merged prop geometry */
{
  const gasC = G.AMEN_DEF.gas.colliders, garC = G.AMEN_DEF.garage.colliders;
  check('gas has 4 prop colliders', gasC.length === 11, 'n=' + gasC.length);
  check('garage has 5 prop colliders', garC.length === 9, 'n=' + garC.length);
  const gasGeo = G.AMEN_DEF.gas.build(), garGeo = G.AMEN_DEF.garage.build();
  const gasVerts = gasGeo.attributes.position.count, garVerts = garGeo.attributes.position.count;
  check('gas geo carries prop detail', gasVerts > 300, 'verts=' + gasVerts);
  check('garage geo carries prop detail', garVerts > 300, 'verts=' + garVerts);
  check('gas builder is deterministic',
    G.AMEN_DEF.gas.build().attributes.position.count === gasVerts);
  check('garage builder is deterministic',
    G.AMEN_DEF.garage.build().attributes.position.count === garVerts);
  let propsClear = true;
  for (const [ox, oz] of gasC.slice(7)) if (Math.hypot(ox, oz) < 6.6) propsClear = false;
  for (const [ox, oz] of garC.slice(4)) if (Math.hypot(ox, oz) < 5.6) propsClear = false;
  check('prop colliders stay clear of repair zones', propsClear);
}

console.log(failures === 0 ? 'AMENITY TESTS: ALL GREEN' : 'AMENITY TESTS: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
