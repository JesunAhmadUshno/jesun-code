/* REALMS 3D wildlife soak: 10k frames, track errors + pet/enemy anomalies.
   Boot pattern mirrors realms3d_smoke.mjs. Run from docs/games/tests/. */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from './vendor/three.module.js';
import { installStubs } from './realms3d_stub.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = join(HERE, '..', 'realms3d.html');
const BOOT = join(HERE, '.r3d_soak.mjs');

const problems = [];
const origErr = console.error, origWarn = console.warn;
console.error = (...a) => { problems.push('error: ' + a.join(' ')); };
console.warn = (...a) => { problems.push('warn: ' + a.join(' ')); };

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
  tick, PET, tamePet, releasePet, acquirePrey, birds, animals, enemies,
  player, P, CAR, BUS, TX, HORSE, terrainHeight, playing, setHeat, toastEl,
};
`;
writeFileSync(BOOT, src);
const stubs = installStubs();
stubs.getEl('overlay').classList.add('hidden');
await import(pathToFileURL(BOOT).href);
const G = globalThis.__R3D;
unlinkSync(BOOT);

const V = (x, z) => { G.player.position.set(x, G.terrainHeight(x, z), z); };
V(0, 0);
G.P.godT = 9999; G.setHeat(0, true);

/* tame a horse as the pet, then walk the player around */
const horse = G.animals.find(a => a.kind === 'horse' && !a.mountLocked);
horse.pos.set(2.5, G.terrainHeight(2.5, 0), 0); horse.fleeT = 0;
for (let i = 0; i < 3; i++) { stubs.clock.advance(16.667); G.tick(); }
G.tamePet(horse);

let maxPetJump = 0, petNaN = 0, enemyNaN = 0, birdNaN = 0;
let petWaitStuck = 0, preyNullHunt = 0;
let lastPX = horse.pos.x, lastPZ = horse.pos.z;
const N = 10000;
for (let f = 0; f < N; f++) {
  /* wander the player on a slow circle so the pet follows across chunks */
  const t = f / 60;
  const px = Math.cos(t * 0.11) * 60, pz = Math.sin(t * 0.11) * 60;
  V(px, pz);
  if (f === 5000) { G.CAR.driving = true; }    /* mid-soak: mount -> pet must wait */
  if (f === 6500) { G.CAR.driving = false; }  /* dismount -> pet must resume */
  stubs.clock.advance(16.667);
  G.tick();
  const p = horse.pos;
  if (!isFinite(p.x) || !isFinite(p.z) || !isFinite(p.y)) petNaN++;
  const jump = Math.hypot(p.x - lastPX, p.z - lastPZ);
  if (jump > maxPetJump) maxPetJump = jump;
  lastPX = p.x; lastPZ = p.z;
  if (f > 6800) {
    const pd = Math.hypot(horse.pos.x - G.player.position.x, horse.pos.z - G.player.position.z);
    if (pd < 120 && G.PET.mode !== 'follow') petWaitStuck++;   /* 120m rule: waiting far away is correct */
  }
  for (const e of G.enemies) {
    const gp = e.group.position;
    if (!isFinite(gp.x) || !isFinite(gp.z)) enemyNaN++;
    if (e.prey && (e.prey === G.PET.a)) preyNullHunt++;  /* pet must never be prey */
  }
  for (const u of G.birds) {
    if (!isFinite(u.ox) || !isFinite(u.oz) || !isFinite(u.vx) || !isFinite(u.vz)) birdNaN++;
  }
}
console.error = origErr; console.warn = origWarn;
console.log('soak frames: ' + N);
console.log('console errors/warnings: ' + problems.length +
  (problems.length ? ' :: ' + problems.slice(0, 3).join(' | ') : ''));
console.log('pet NaN positions: ' + petNaN);
console.log('pet max per-frame jump: ' + maxPetJump.toFixed(3) + 'm');
console.log('pet stuck in wait after dismount (frames): ' + petWaitStuck);
console.log('enemy NaN positions: ' + enemyNaN);
console.log('enemy hunting the pet (frames): ' + preyNullHunt);
console.log('bird NaN state: ' + birdNaN);
const ok = problems.length === 0 && petNaN === 0 && enemyNaN === 0 &&
  birdNaN === 0 && petWaitStuck === 0 && preyNullHunt === 0 && maxPetJump < 2;
console.log(ok ? 'SOAK RESULT: ALL GREEN' : 'SOAK RESULT: ANOMALIES FOUND');
process.exit(ok ? 0 : 1);
