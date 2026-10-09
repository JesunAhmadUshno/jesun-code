/* CLEAN WORLD verification: boots the real realms3d.html module in Node
   with the same stubs as the smoke harness, then measures
   spacing/density/clear-zones numerically. */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from './vendor/three.module.js';
import { installStubs } from './realms3d_stub.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = join(HERE, '..', 'realms3d.html');
const BOOT = join(HERE, '.r3d_cleanworld_test.mjs');

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log('PASS - ' + name + (detail ? ' :: ' + detail : ''));
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
  updateTerrainChunks, redistributeFlora, redistributeAmenities,
  amenityCenterFor, amenityTypeFor, amenityAccepted, terrainHeight, inNoFlora,
  FLORA, AMEN, AMEN_DEF, ZONE_PADS, ZONE_PAD_COLORS,
  CHUNK, HALFGRID, player, coverPts,
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

const CHUNK = G.CHUNK, HALFGRID = G.HALFGRID;
function instPos(mesh, i) {
  const a = mesh.instanceMatrix.array;
  return [a[i * 16 + 12], a[i * 16 + 14]];
}
function snapFlora() {
  const trees = [], rocks = [];
  const tm = G.FLORA.trunks, rm = G.FLORA.rocks;
  /* PERF-2a: slots [0, nf) are the static forest-landmark pines (densely
     clustered by design, exempt from wild spacing rules); the wild
     redistributed trees live at [nf, count), same set this check measured
     before the consolidation. */
  const wild0 = G.FLORA.nf || 0;
  for (let i = wild0; i < tm.count; i++) trees.push(instPos(tm, i));
  for (let i = 0; i < rm.count; i++) rocks.push(instPos(rm, i));
  return { trees, rocks };
}
function snapAmen() {
  const out = [];
  for (const k in G.AMEN.active)
    for (const a of G.AMEN.active[k])
      out.push({ x: a.x, z: a.z, gx: a.gx, gz: a.gz, type: k, yaw: a.yaw });
  return out;
}
function goChunk(pcx, pcz) {
  G.player.position.set(pcx * CHUNK, 0, pcz * CHUNK);
  G.updateTerrainChunks();
}

/* sample 3 chunk centers: origin, +x/+z, -x/+z (covers city-adjacent, wild) */
const samples = [[0, 0], [11, 6], [-9, 13]];
const snaps = [];
for (const [cx, cz] of samples) {
  goChunk(cx, cz);
  snaps.push({ cx, cz, flora: snapFlora(), amen: snapAmen() });
}
/* revisit: identical on every revisit */
let revisitOk = true;
for (const s of snaps) {
  goChunk(s.cx, s.cz);
  const f2 = JSON.stringify(snapFlora()), a2 = JSON.stringify(snapAmen());
  if (f2 !== JSON.stringify(s.flora) || a2 !== JSON.stringify(s.amen)) revisitOk = false;
}
check('flora + amenities identical on revisit', revisitOk);

/* aggregate across samples (chunks may overlap between samples; dedupe by pos key) */
const treeSet = new Map(), rockSet = new Map();
for (const s of snaps) {
  for (const [x, z] of s.flora.trees) treeSet.set(x.toFixed(3) + ',' + z.toFixed(3), [x, z]);
  for (const [x, z] of s.flora.rocks) rockSet.set(x.toFixed(3) + ',' + z.toFixed(3), [x, z]);
}
const trees = [...treeSet.values()], rocks = [...rockSet.values()];
console.log('measured: trees=' + trees.length + ' rocks=' + rocks.length +
  ' samples=' + samples.length);

/* 1. tree counts per chunk in 0..2, min tree-tree spacing >= 10m */
{
  const byChunk = new Map();
  for (const [x, z] of trees) {
    const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    if (!byChunk.has(k)) byChunk.set(k, []);
    byChunk.get(k).push([x, z]);
  }
  let maxPer = 0, minD2 = Infinity;
  for (const [, pts] of byChunk) {
    maxPer = Math.max(maxPer, pts.length);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i][0] - pts[j][0], dz = pts[i][1] - pts[j][1];
        minD2 = Math.min(minD2, dx * dx + dz * dz);
      }
  }
  check('trees per chunk <= 2', maxPer <= 2, 'max=' + maxPer);
  check('min tree-tree dist >= 10m', minD2 >= 99.99, 'min=' + Math.sqrt(minD2).toFixed(2) + 'm');
}

/* 2. rocks per chunk in 0..1, min rock-to-tree dist >= 6m (same chunk) */
{
  const rockChunk = new Map(), treeChunk = new Map();
  for (const [x, z] of rocks) {
    const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    rockChunk.set(k, (rockChunk.get(k) || 0) + 1);
  }
  for (const [x, z] of trees) {
    const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    if (!treeChunk.has(k)) treeChunk.set(k, []);
    treeChunk.get(k).push([x, z]);
  }
  let maxRocks = 0;
  for (const [, n] of rockChunk) maxRocks = Math.max(maxRocks, n);
  check('rocks per chunk <= 1', maxRocks <= 1, 'max=' + maxRocks);
  let minD2 = Infinity;
  for (const [x, z] of rocks) {
    const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    const tp = treeChunk.get(k) || [];
    for (const [tx, tz] of tp) {
      const dx = x - tx, dz = z - tz;
      minD2 = Math.min(minD2, dx * dx + dz * dz);
    }
  }
  check('min rock-to-tree dist >= 6m', minD2 >= 35.99, 'min=' + Math.sqrt(minD2).toFixed(2) + 'm');
}

/* 3. amenity clear zones: zero flora within 14m of any amenity center */
{
  const centers = [];
  for (const s of snaps)
    for (let gx = s.cx - HALFGRID - 1; gx <= s.cx + HALFGRID + 1; gx++)
      for (let gz = s.cz - HALFGRID - 1; gz <= s.cz + HALFGRID + 1; gz++) {
        const c = G.amenityCenterFor(gx, gz);
        if (c) centers.push([c.x, c.z]);
      }
  let minD2 = Infinity, viol = 0;
  for (const [x, z] of [...trees, ...rocks])
    for (const [cx, cz] of centers) {
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 < minD2) minD2 = d2;
      if (d2 < 196 - 1e-6) viol++;
    }
  check('zero flora within 14m of amenity centers', viol === 0,
    'viol=' + viol + ' nearest=' + Math.sqrt(minD2).toFixed(2) + 'm');
}

/* 4. cross-type spacing: no two amenities within 1 chunk (chebyshev >= 2) */
{
  const all = [];
  for (const s of snaps) all.push(...s.amen);
  let minCheb = Infinity, pair = null;
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const c = Math.max(Math.abs(all[i].gx - all[j].gx), Math.abs(all[i].gz - all[j].gz));
      if (c < minCheb) { minCheb = c; pair = [all[i].type, all[j].type]; }
    }
  check('no two amenities within 1 chunk', minCheb >= 2,
    'min chebyshev=' + minCheb + ' pair=' + JSON.stringify(pair) + ' total=' + all.length);
}

/* 5. winner-take-all is a pure function of chunk coords */
{
  let pure = true;
  for (let gx = -20; gx <= 20 && pure; gx++)
    for (let gz = -20; gz <= 20 && pure; gz++) {
      const a = G.amenityCenterFor(gx, gz), b = G.amenityCenterFor(gx, gz);
      if (JSON.stringify(a) !== JSON.stringify(b)) pure = false;
    }
  check('amenityCenterFor pure/deterministic', pure);
}

/* 6. zone pads: exactly one per active amenity, muted colors only */
{
  let total = 0;
  for (const k in G.AMEN.active) total += G.AMEN.active[k].length;
  goChunk(samples[2][0], samples[2][1]);   // settle on last sample
  check('pads count == active amenities', G.ZONE_PADS.count === total,
    'pads=' + G.ZONE_PADS.count + ' amenities=' + total);
  check('pads instanceColor allocated', !!G.ZONE_PADS.instanceColor);
  const allowed = new Set(Object.values(G.ZONE_PAD_COLORS).map(c => c.getHexString()));
  const arr = G.ZONE_PADS.instanceColor.array;
  const seen = new Set();
  for (let i = 0; i < G.ZONE_PADS.count; i++) {
    const hex = new THREE.Color(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).getHexString();
    seen.add(hex);
    if (!allowed.has(hex)) { failures++; console.log('FAIL - pad color not muted :: ' + hex); break; }
  }
  console.log('pad colors used: ' + [...seen].join(','));
  check('pads are InstancedMesh (+1 draw call)', G.ZONE_PADS.isInstancedMesh === true);
  check('pads castShadow=false frustumCulled=false',
    G.ZONE_PADS.castShadow === false && G.ZONE_PADS.frustumCulled === false);
}

/* 7. caps respected: pads capacity covers worst case */
check('pad capacity >= max active', G.ZONE_PADS.instanceMatrix.count >= 31,
  'capacity=' + G.ZONE_PADS.instanceMatrix.count);

console.log(failures === 0 ? 'CLEANWORLD ALL GREEN' : 'CLEANWORLD ' + failures + ' FAILURES');
process.exit(failures ? 1 : 0);
