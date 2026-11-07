// Reads repo files and writes src/data.json. Every number on the dashboard
// comes from here (or is computed live in the browser); nothing is typed.
// Run: node scripts/data.mjs   (npm run build runs it first)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

// Examples verified to run under Pyodide in the browser (stdin-free or with a
// prefilled answer). Everything else is shown as source only, with the reason.
export const BROWSER = ['hello', 'cheer', 'decisions', 'functions', 'lists', 'loops', 'nesting',
  'native_fib', 'native_closures', 'native_hello', 'bangla_demo', 'native_bangla', 'file_demo', 'native_files'];

export function needsOf(src) {
  const n = [];
  if (/\bask ai\b|^\s*agent\b|\bagent [A-Z"]|\bfleet\b/m.test(src)) n.push('AI provider');
  if (/\bterminal\b|read key/.test(src)) n.push('tmux / terminal');
  if (/bring in "(jweb|serve|http)"|use "github/.test(src)) n.push('network');
  if (/bring in "(php|react|wordpress|sqlite)"|\bpython\b/.test(src)) n.push('host tools');
  if (/bring in "(window|game|threejs|js|html|template|sitegen)"/.test(src)) n.push('packages');
  return n;
}

export function testCounts() {
  return fs.readdirSync(path.join(REPO, 'tests')).filter((f) => /^test_.*\.py$/.test(f)).sort()
    .map((f) => ({ module: f.slice(0, -3), defs: (read(`tests/${f}`).match(/^\s*def test_/gm) || []).length }))
    .sort((a, b) => b.defs - a.defs || a.module.localeCompare(b.module));
}

export function releases() {
  const shipped = read('ROADMAP.md').split('## Shipped')[1].split('\n## ')[0];
  return shipped.split(/\n- /).slice(1).map((b) => {
    const t = b.replace(/\s+/g, ' ');
    const m = t.match(/^\*\*(v[\d.]+) \((\d{4}-\d\d-\d\d)\):?\s*([^*]*)\*\*:?\s*(.*)$/);
    if (!m) return null;
    const tests = [...t.matchAll(/(\d+) tests/g)].map((x) => +x[1]);
    const what = (m[3] || m[4].split(/(?<=\.) /)[0]).replace(/`/g, '').replace(/\.$/, '');
    return { version: m[1], date: m[2], tests: tests.length ? tests[tests.length - 1] : null, what };
  }).filter(Boolean);
}

export function keywords() {
  const py = read('jesun.py');
  const table = (name) => {
    const body = py.split(`${name}: dict[str, str] = {`)[1].split('\n}')[0].replace(/#.*$/gm, '');
    return [...body.matchAll(/"([^"]+)":\s*"([A-Z_]+)"/g)].map((m) => [m[1], m[2]]);
  };
  const en = table('KEYWORDS'), bn = table('BANGLA_KEYWORDS');
  return bn.map(([word, tok]) => ({ token: tok, en: en.filter(([, t]) => t === tok).map(([w]) => w).join(' / '), bn: word }));
}

export function build() {
  const classification = JSON.parse(read('results/classification.json'));
  const bench = JSON.parse(read('results/bench.json'));
  const examples = fs.readdirSync(path.join(REPO, 'examples')).filter((f) => f.endsWith('.jc')).sort().map((f) => {
    const name = f.slice(0, -3), src = read(`examples/${f}`);
    return { name, src, browser: BROWSER.includes(name), needs: needsOf(src), ask: /^\s*ask "/m.test(src) };
  });
  const countJc = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') return n;
    const p = path.join(dir, e.name);
    return n + (e.isDirectory() ? countJc(p) : e.name.endsWith('.jc') ? 1 : 0);
  }, 0);
  const readme = read('README.md');
  const onePage = readme.split('## The language in one page')[1].split('```jesun\n')[1].split('```')[0];
  const lines = (p) => read(p).split('\n').length - 1;
  return {
    version: read('jesun.py').match(/^VERSION = "([^"]+)"/m)[1],
    tests: testCounts(),
    classification,
    bench,
    releases: releases(),
    keywords: keywords(),
    examples,
    jcFiles: countJc(REPO),
    onePage,
    loc: { 'jesun.py': lines('jesun.py'), 'jesun.jc': lines('jesun.jc'), 'jesun_build.py': lines('jesun_build.py') },
    lineRe: read('tests/selfhost_harness.py').match(/LINE_RE = re\.compile\(r"([^"]+)"\)/)[1],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const d = build();
  fs.writeFileSync(new URL('../src/data.json', import.meta.url), JSON.stringify(d));
  console.log('data ok', { version: d.version, modules: d.tests.length, classified: d.classification.classified, releases: d.releases.length, keywords: d.keywords.length, examples: d.examples.length, jcFiles: d.jcFiles });
}
