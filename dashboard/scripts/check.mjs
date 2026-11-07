// Known-answer check, run by `npm run build` before vite:
// re-derives the dashboard's numbers from repo files and re-runs the
// browser's differential logic against the real interpreters.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { build, REPO } from './data.mjs';
import { compare, normalize, ladder, slowdown } from '../src/lib.js';

const d = JSON.parse(fs.readFileSync(new URL('../src/data.json', import.meta.url), 'utf8'));
assert.deepEqual(d, build(), 'src/data.json is stale; run node scripts/data.mjs');

// 1. Classification: counts add up and match the ids listed per bucket.
const c = d.classification;
const sum = Object.values(c.counts).reduce((a, b) => a + b, 0);
assert.equal(sum, c.classified);
assert.equal(c.tests.length, c.classified);
for (const [b, n] of Object.entries(c.counts)) assert.equal(c.tests.filter((t) => t.bucket === b).length, n, b);

// 2. Python agrees with node on the facts parsed out of the repo.
const py = (code) => execFileSync('python3', ['-c', code], { cwd: REPO, encoding: 'utf8' }).trim();
assert.equal(py('import jesun; print(jesun.VERSION)'), d.version);
assert.equal(+py('import jesun; print(len(jesun.BANGLA_KEYWORDS))'), d.keywords.length);
const pyDefs = JSON.parse(py("import glob,re,json; print(json.dumps({f.split('/')[-1][:-3]: len(re.findall(r'^\\s*def test_', open(f).read(), re.M)) for f in glob.glob('tests/test_*.py')}))"));
for (const t of d.tests) assert.equal(t.defs, pyDefs[t.module], t.module);
assert.equal(d.tests.length, Object.keys(pyDefs).length);
assert.equal(py("import sys; sys.path.insert(0, 'tests'); import selfhost_harness as h; print(h.LINE_RE.sub('Line N', 'Line 12: x Line 3'))"), normalize('Line 12: x Line 3'));
assert.equal(d.lineRe, 'Line \\d+');

// 3. The browser's compare() reproduces the harness verdict on real runs.
const run = (args) => { const r = spawnSync('python3', args, { cwd: REPO, encoding: 'utf8', input: 'Ada\n', timeout: 60000 }); return { code: r.status, out: r.stdout }; };
const verdicts = {};
for (const ex of ['loops', 'native_closures', 'bangla_demo', 'native_fib', 'native_hello']) {
  const boot = run(['jesun.py', `examples/${ex}.jc`]), self = run(['jesun.py', 'jesun.jc', `examples/${ex}.jc`]);
  verdicts[ex] = compare(boot, self);
  const harnessEqual = boot.code === self.code && boot.out === self.out;
  assert.equal(verdicts[ex] === 'identical', harnessEqual, ex);
}
assert.equal(verdicts.loops, 'identical');
assert.equal(verdicts.native_fib, 'diverged'); // walker recursion guard, pinned gap spec 9.1

// 4. Release ladder and bench derive cleanly.
const L = ladder(d.releases, 600, 200, { l: 40, r: 10, t: 10, b: 20 });
assert.equal(L.max, Math.max(...d.releases.map((r) => r.tests ?? 0)));
assert.ok(d.releases.every((r, i, a) => !i || r.date >= a[i - 1].date), 'releases in date order');
const loop = d.bench.programs.find((p) => p.program === 'loop_20000');
assert.equal(loop.output, '20000\n');
assert.ok(slowdown(loop) > 1);
for (const p of d.bench.programs) for (const leg of ['bootstrap', 'selfhosted', 'cpython']) {
  const s = [...p[`${leg}_runs_s`]].sort((a, b) => a - b);
  assert.equal(s[(s.length - 1) / 2], p[`${leg}_median_s`], `${p.program} ${leg} median`);
}
console.log('check ok', { classified: c.classified, green: c.counts['differential-green'], verdicts, loopSlowdown: slowdown(loop).toFixed(1) });
