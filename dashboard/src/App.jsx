import { useMemo, useState, useEffect, useCallback } from 'react';
import data from './data.json';
import { compare, DRIVER, ladder, slowdown } from './lib.js';

const REPO = 'https://github.com/JesunAhmadUshno/jesun-code';
const blob = (p) => `${REPO}/blob/main/${p}`;
const SITE = '/jesun-code/';
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const C = data.classification;
const green = C.counts['differential-green'] ?? 0;
const totalDefs = data.tests.reduce((a, t) => a + t.defs, 0);
const loaded = data.tests.reduce((m, t) => ({ ...m, [t.module]: 0 }), {});
C.tests.forEach((t) => { const m = t.id.split('.')[0]; if (m in loaded) loaded[m] += 1; });
const byName = Object.fromEntries(data.examples.map((e) => [e.name, e]));
const runnable = data.examples.filter((e) => e.browser);
const answers = (s) => s.split('|').map((x) => x.trim()).join('\n') + '\n';

const SECTIONS = [['top', 'Overview', '◎'], ['playground', 'Playground', '▶'], ['diff', 'Differential', '⇄'], ['classes', 'Classification', '▤'],
  ['tests', 'Tests', '▥'], ['bench', 'Speed', '◷'], ['ladder', 'Releases', '↗'], ['grammar', 'Grammar', 'অ'], ['native', 'Native', '⚙'], ['limits', 'Limits', '!']];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.08 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

// Charts redraw with a narrower viewBox on phones so their text stays readable.
function useNarrow() {
  const q = '(max-width: 760px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const f = () => setNarrow(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return narrow;
}

function MenuBar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  return (
    <div className="menubar" role="banner">
      <span className="apple" aria-hidden="true">◆</span>
      <a className="app" href="#top">Jesun.Code</a>
      <a className="m" href={SITE}>Product site</a>
      <a className="m" href={`${SITE}games/`}>Games</a>
      <a className="m" href={blob('docs/spec-v2.0.md')}>Spec</a>
      <a className="m" href={`${REPO}/releases`}>Releases</a>
      <span className="spacer" />
      <span className="status"><i /> v{data.version}</span>
      <a href={REPO}>GitHub ↗</a>
      <span className="clock">{now.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
    </div>
  );
}

function Dock() {
  const [active, setActive] = useState('top');
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-45% 0px -50% 0px' });
    SECTIONS.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);
  return (
    <nav className="dock" aria-label="Sections">
      {SECTIONS.map(([id, label, icon]) => (
        <a key={id} href={`#${id}`} className={active === id ? 'on' : ''} aria-current={active === id ? 'true' : undefined}>
          <span className="ico" aria-hidden="true">{icon}</span><span className="lbl">{label}</span>
        </a>
      ))}
    </nav>
  );
}

// Pyodide is fetched only when someone presses Run: the page itself loads no external script.
let pyPromise = null;
function loadRuntime(onStatus) {
  if (!pyPromise) {
    pyPromise = (async () => {
      onStatus('Downloading Pyodide 0.26.4 (about 10 MB, once)…');
      await new Promise((ok, fail) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
        s.integrity = 'sha384-i3R37b3tF+HWudsUf1VSEOY2YxwSNMqY8DQa9Z0O3xh+NkJ9o+yjcGyIi5huj+nB';
        s.crossOrigin = 'anonymous';
        s.onload = ok; s.onerror = () => fail(new Error('Could not download Pyodide from cdn.jsdelivr.net.'));
        document.head.appendChild(s);
      });
      const [py, [{ default: jesunPy }, { default: jesunJc }]] = await Promise.all([
        window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' }),
        Promise.all([import('../../jesun.py?raw'), import('../../jesun.jc?raw')]),
      ]);
      onStatus('Starting jesun.py…');
      py.FS.mkdirTree('/home/pyodide/jc');
      py.FS.writeFile('/home/pyodide/jc/jesun.py', jesunPy);
      py.FS.writeFile('/home/pyodide/jc/jesun.jc', jesunJc);
      await py.runPythonAsync(DRIVER);
      const runJc = py.globals.get('run_jc');
      return (src, args, stdin) => {
        py.FS.writeFile('/home/pyodide/jc/prog.jc', src);
        const r = runJc(args, stdin);
        const [code, out, ms] = r.toJs(); r.destroy();
        return { code, out, ms };
      };
    })();
    pyPromise.catch(() => { pyPromise = null; });
  }
  return pyPromise;
}

function useRunner() {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn) => {
    setBusy(true);
    try {
      const exec = await loadRuntime(setStatus);
      setStatus('');
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      return fn(exec);
    } catch (e) {
      setStatus(e.message || String(e));
      return null;
    } finally { setBusy(false); }
  }, []);
  return { status, busy, run };
}

export default function App() {
  useReveal();
  const [prog, setProg] = useState({ name: 'loops', src: byName.loops.src });
  const [stdin, setStdin] = useState('Ada');
  const openProgram = (name, src) => { setProg({ name, src }); document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth' }); };
  return (
    <div className="wrap">
      <MenuBar />
      <div className="glow" aria-hidden="true" />
      <Hero />
      <Playground prog={prog} setProg={setProg} stdin={stdin} setStdin={setStdin} />
      <Differential prog={prog} stdin={stdin} />
      <Classification />
      <Tests />
      <Bench />
      <Ladder />
      <Grammar openProgram={openProgram} />
      <Examples prog={prog} openProgram={openProgram} />
      <Native />
      <Limits />
      <Dock />
      <footer>
        Code: MIT. Every number on this page is read from repo files at build time (<code>tests/</code>, <code>results/</code>, <code>ROADMAP.md</code>, <code>jesun.py</code>, <code>examples/</code>).
        Recorded results carry their date; the playground and differential runner execute the real <code>jesun.py</code> and <code>jesun.jc</code> in your browser.
      </footer>
    </div>
  );
}

function Hero() {
  return (
    <header className="card hero window" id="top" data-title="jesun-code - README">
      <div className="head">
        <p className="eyebrow">A programming language · v{data.version}</p>
        <span className="pill info">● {data.loc['jesun.jc'].toLocaleString()}-line self-hosted interpreter</span>
      </div>
      <h1>A plain-English language that <em>hosts itself</em>.</h1>
      <p className="sub">
        Jesun.Code reads like sentences: <code>name is "Ada"</code>, <code>repeat 3 times</code>, <code>give back a + b</code>.
        It has a {data.loc['jesun.py'].toLocaleString()}-line Python interpreter (the bootstrap) and a second interpreter written in Jesun.Code itself.
        Of {C.classified} classified tests, {green} must produce byte-identical output through both. Run either one below, in your browser.
      </p>
      <div className="actions">
        <a className="btn primary" href="#playground">Open the playground</a>
        <a className="btn ghost" href={SITE}>Product site</a>
        <span className="hint">Install from <a href={`${REPO}/releases`}>GitHub releases</a>, or run <code>python3 jesun.py</code></span>
      </div>
      <div className="tiles">
        <div className="tile"><div className="num">{pct(green / C.classified)}</div><div className="cap">of {C.classified} classified tests are differential-green ({green}), recorded {C.date}</div></div>
        <div className="tile"><div className="num">{data.tests.length}</div><div className="cap">test modules, {totalDefs} <code>def test_</code> methods</div></div>
        <div className="tile"><div className="num">{data.examples.length}</div><div className="cap">example programs, {runnable.length} runnable in this page</div></div>
        <div className="tile"><div className="num">{data.jcFiles}</div><div className="cap"><code>.jc</code> files in the repo</div></div>
      </div>
    </header>
  );
}

function Playground({ prog, setProg, stdin, setStdin }) {
  const { status, busy, run } = useRunner();
  const [res, setRes] = useState(null);
  const ex = byName[prog.name];
  const blocked = ex && !ex.browser;
  const go = async () => {
    const r = await run((exec) => exec(prog.src, ['prog.jc'], answers(stdin)));
    if (r) setRes(r);
  };
  return (
    <section id="playground" className="card window reveal" data-title="playground.jc - live">
      <div className="head">
        <div>
          <p className="eyebrow">Live, in your browser</p>
          <h2>Write a sentence, press Run, and the real interpreter answers.</h2>
          <p className="sub">
            Pressing Run downloads Pyodide (CPython compiled to WebAssembly, the same pin the product's games use) and runs the repo's <code>jesun.py</code> on your program, exactly as <code>python3 jesun.py prog.jc</code> would.
            Nothing is simulated, and errors are the language's own plain-English messages.
          </p>
        </div>
        <span className={`pill ${busy ? 'warn' : res ? 'good' : 'info'}`}>{busy ? 'running…' : res ? `ran in ${res.ms.toFixed(0)} ms` : 'idle'}</span>
      </div>
      <div className="controls">
        <div className="field"><label htmlFor="ex-pick">Example</label>
          <select id="ex-pick" value={ex ? prog.name : ''} onChange={(e) => setProg({ name: e.target.value, src: byName[e.target.value].src })}>
            {!ex && <option value="">(your edit)</option>}
            {data.examples.map((e) => <option key={e.name} value={e.name}>{e.name}.jc{e.browser ? '' : ' (source only)'}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="stdin">Answers to ask prompts, split with |</label>
          <input id="stdin" type="text" value={stdin} onChange={(e) => setStdin(e.target.value)} />
        </div>
      </div>
      <div className="grid2">
        <div>
          <label htmlFor="src" className="hint">Program (editable)</label>
          <textarea id="src" className="code" spellCheck="false" value={prog.src} onChange={(e) => setProg({ name: '', src: e.target.value })} />
        </div>
        <div>
          <p className="hint" style={{ margin: 0 }}>Output</p>
          <pre className="term" aria-live="polite">{status ? <span className="dim">{status}</span>
            : blocked ? <span className="dim">{`${prog.name}.jc needs ${ex.needs.join(', ') || 'things a browser tab does not have'}, so it shows as source only. Its output is not faked here.`}</span>
            : res ? res.out || <span className="dim">(no output, exit code {res.code})</span>
            : <span className="dim">Press Run. The first run downloads the runtime; later runs take milliseconds.</span>}</pre>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={go} disabled={busy || blocked}>{busy ? 'Running…' : 'Run'}</button>
            {res && <span className="hint">exit code {res.code} · {res.ms.toFixed(1)} ms measured in your browser</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

const VERDICT = {
  identical: ['good', 'Byte-identical', 'Same exit code and the same bytes on stdout: the harness’s differential-green condition.'],
  'identical-modulo-line': ['warn', 'Identical after Line N', 'Only line numbers in error messages differ; the pinned-gap helpers normalise these with LINE_RE.'],
  diverged: ['bad', 'Diverged', 'The two interpreters disagree. That is a real finding, shown as it happened.'],
};

function Differential({ prog, stdin }) {
  const { status, busy, run } = useRunner();
  const [res, setRes] = useState(null);
  const ex = byName[prog.name];
  const blocked = ex && !ex.browser;
  const go = async () => {
    const r = await run((exec) => {
      const boot = exec(prog.src, ['prog.jc'], answers(stdin));
      const self = exec(prog.src, ['jesun.jc', 'prog.jc'], answers(stdin));
      return { boot, self, verdict: compare(boot, self), name: prog.name || 'your edit' };
    });
    if (r) setRes(r);
  };
  const v = res && VERDICT[res.verdict];
  return (
    <section id="diff" className="card window reveal" data-title="jesun.jc - differential, live">
      <div className="head">
        <div>
          <p className="eyebrow">Live differential test</p>
          <h2>The same program through both interpreters, compared byte for byte.</h2>
          <p className="sub">
            Left: <code>python jesun.py prog.jc</code>, the Python bootstrap. Right: <code>python jesun.py jesun.jc prog.jc</code>, the interpreter written in Jesun.Code running your program.
            This is the protocol in <a href={blob('tests/selfhost_harness.py')}>selfhost_harness.py</a>. It runs whatever is in the playground editor above.
          </p>
        </div>
        {v && <span className={`pill ${v[0]}`}>● {v[1]}</span>}
      </div>
      <div className="actions" style={{ marginTop: 0, marginBottom: 16 }}>
        <button className="btn primary" onClick={go} disabled={busy || blocked}>{busy ? 'Running both…' : `Compare ${prog.name ? `${prog.name}.jc` : 'your edit'}`}</button>
        <span className="hint">{status || (blocked ? 'This example cannot run in a browser; pick one marked runnable.' : v ? v[2] : 'Try native_fib.jc: the self-hosted walker hits its recursion guard (pinned gap, spec 9.1).')}</span>
      </div>
      <div className="legs">
        {[['Bootstrap · jesun.py', res?.boot], ['Self-hosted · jesun.jc', res?.self]].map(([t, r]) => (
          <div key={t}>
            <h3>{t} <small>{r ? `exit ${r.code} · ${r.ms.toFixed(0)} ms` : ''}</small></h3>
            <pre className="term">{r ? r.out || <span className="dim">(no output)</span> : <span className="dim">not run yet</span>}</pre>
          </div>
        ))}
      </div>
      {res && <p className="hint" style={{ marginTop: 12 }}>
        Timings measured just now in your browser (WebAssembly): the self-hosted leg took {(res.self.ms / Math.max(0.1, res.boot.ms)).toFixed(1)}× the bootstrap on {res.name}.
        Recorded native-CPython timings are in the Speed window.
      </p>}
    </section>
  );
}

const BUCKETS = [['differential-green', 'good'], ['pinned gap', 'warn'], ['pinned divergence', 'warn'], ['pinned exclusion', 'info']];
function Classification() {
  const [bucket, setBucket] = useState('pinned gap');
  const [q, setQ] = useState('');
  const rows = C.tests.filter((t) => t.bucket === bucket && t.id.toLowerCase().includes(q.toLowerCase()));
  return (
    <section id="classes" className="card window reveal" data-title="check_classification.py - recorded">
      <div className="head">
        <div>
          <p className="eyebrow">Recorded {C.date} · Python {C.python}</p>
          <h2>Every test is tagged, and the exceptions are named.</h2>
          <p className="sub">
            <a href={blob('tests/check_classification.py')}>check_classification.py</a> sorts each test into one of four buckets and fails if a tag does not match the code.
            This is its JSON output (<a href={blob('results/classification.json')}>results/classification.json</a>), not a live run.
            {C.load_errors?.length ? <> It also reports {C.load_errors.length} module that does not import ({C.load_errors.map((m) => <code key={m}>{m}</code>)}), so those tests are not counted at all.</> : null}
          </p>
        </div>
      </div>
      <div className="bars">
        {BUCKETS.map(([b, tone]) => (
          <div className="bar-row" key={b}>
            <div className="lab"><span>{b}</span><b>{C.counts[b] ?? 0} ({pct((C.counts[b] ?? 0) / C.classified)})</b></div>
            <div className="track"><div className="fill" style={{ width: `${((C.counts[b] ?? 0) / C.classified) * 100}%`, background: `var(--${tone === 'info' ? 'primary' : tone})` }} /></div>
          </div>
        ))}
      </div>
      <div className="controls" style={{ marginTop: 18, alignItems: 'end' }}>
        <div className="seg" role="group" aria-label="Bucket">
          {BUCKETS.map(([b]) => <button key={b} aria-pressed={bucket === b} onClick={() => setBucket(b)}>{b.replace('differential-', '').replace('pinned ', '')}</button>)}
        </div>
        <div className="field"><label htmlFor="tq">Search test ids</label><input id="tq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. selfhost, fleet, bangla" /></div>
      </div>
      <p className="hint">{rows.length} of {C.counts[bucket] ?? 0} {bucket} tests{rows.length > 200 ? ' (first 200 shown)' : ''}</p>
      <ul className="idlist">
        {rows.slice(0, 200).map((t) => <li key={t.id}>{t.id}<span>{t.ref}</span></li>)}
      </ul>
    </section>
  );
}

function Tests() {
  const [hover, setHover] = useState(null);
  const rows = data.tests;
  const narrow = useNarrow();
  const W = narrow ? 400 : 960, rowH = 22, pad = { l: narrow ? 160 : 190, r: narrow ? 40 : 70, t: 8, b: 8 }, H = rows.length * rowH + pad.t + pad.b;
  const max = Math.max(...rows.map((r) => Math.max(r.defs, loaded[r.module])));
  const x = (v) => pad.l + (v / max) * (W - pad.l - pad.r);
  const mismatch = rows.filter((r) => r.defs !== loaded[r.module]);
  return (
    <section id="tests" className="card window reveal" data-title="tests/ - computed at build">
      <p className="eyebrow">Computed at build time from tests/test_*.py</p>
      <h2>{totalDefs} test methods written, {C.tests.length} loaded by unittest.</h2>
      <p className="sub">
        Bars count <code>def test_</code> lines per module. The dot marks how many tests unittest actually loaded for that module in the recorded classification run.
        They differ in {mismatch.length} modules: {mismatch.map((m, i) => <span key={m.module}>{i ? ', ' : ''}<code>{m.module}</code> ({m.defs} written, {loaded[m.module]} loaded)</span>)}.
        Shared base classes multiply tests; a module that fails to import loads none.
      </p>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Test methods per module for ${rows.length} test modules`} onMouseLeave={() => setHover(null)}>
        {rows.map((r, i) => {
          const y = pad.t + i * rowH;
          return (
            <g key={r.module} onMouseEnter={() => setHover(r)}>
              <rect x={0} y={y} width={W} height={rowH} fill="transparent" />
              <text x={pad.l - 10} y={y + 15} textAnchor="end" style={{ fill: hover?.module === r.module ? 'var(--text)' : undefined }}>{r.module}</text>
              <rect x={pad.l} y={y + 4} width={Math.max(1, x(r.defs) - pad.l)} height={rowH - 8} rx="4" fill="var(--primary)" opacity={hover && hover.module !== r.module ? 0.35 : 0.85} />
              <circle cx={x(loaded[r.module])} cy={y + rowH / 2} r="4" fill={r.defs === loaded[r.module] ? 'var(--good)' : 'var(--bad)'} stroke="var(--surface-strong)" strokeWidth="1.5" />
              <text x={x(Math.max(r.defs, loaded[r.module])) + 8} y={y + 15}>{r.defs}</text>
            </g>
          );
        })}
      </svg>
      <div className="tip" aria-live="polite">{hover ? <><span className="mono">{hover.module}</span>: {hover.defs} methods written, {loaded[hover.module]} loaded by unittest</> : 'Hover a bar to compare written and loaded counts.'}</div>
    </section>
  );
}

function Bench() {
  const B = data.bench;
  const legs = [['bootstrap', 'jesun.py (bootstrap)', 'var(--primary)'], ['selfhosted', 'jesun.jc (self-hosted)', 'var(--warn)'], ['cpython', 'plain CPython equivalent', 'var(--good)']];
  const max = Math.max(...B.programs.flatMap((p) => legs.map(([l]) => p[`${l}_median_s`])));
  const loop = B.programs.find((p) => p.program === 'loop_20000');
  return (
    <section id="bench" className="card window reveal" data-title="scripts/bench.py - recorded">
      <div className="head">
        <div>
          <p className="eyebrow">Recorded {B.date} · {B.machine.system} {B.machine.machine} · Python {B.machine.python}</p>
          <h2>Self-hosting costs about {Math.round(slowdown(loop))}× on a tight loop.</h2>
          <p className="sub">
            Median of {B.runs_per_leg} fresh-process runs per leg, start-up included (<a href={blob('results/bench.json')}>results/bench.json</a>). The empty program is pure start-up.
            One machine, small programs: read this as an order of magnitude, not a benchmark suite.
          </p>
        </div>
      </div>
      <div className="bars">
        {B.programs.map((p) => (
          <div key={p.program} style={{ marginBottom: 10 }}>
            <h3 className="mono" style={{ fontSize: 13 }}>{p.program}</h3>
            {legs.map(([l, label, c]) => (
              <div className="bar-row" key={l}>
                <div className="lab"><span>{label}</span><b>{(p[`${l}_median_s`] * 1000).toFixed(0)} ms</b></div>
                <div className="track"><div className="fill" style={{ width: `${(p[`${l}_median_s`] / max) * 100}%`, background: c }} /></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Ladder() {
  const [hover, setHover] = useState(null);
  const narrow = useNarrow();
  const W = narrow ? 400 : 960, H = 280, pad = { l: 40, r: narrow ? 24 : 24, t: 20, b: 34 };
  const L = useMemo(() => ladder(data.releases, W, H, pad), [W]); // eslint-disable-line react-hooks/exhaustive-deps
  const ticks = [0, 100, 200, 300, 400].filter((t) => t <= L.max);
  return (
    <section id="ladder" className="card window reveal" data-title="ROADMAP.md - recorded">
      <p className="eyebrow">Recorded from ROADMAP.md “Shipped”</p>
      <h2>Tests grew from {L.pts[0].tests} to {L.pts[L.pts.length - 1].tests} across {L.pts.length} releases in two days.</h2>
      <p className="sub">
        Each step is a release with the test count the roadmap records for it ({L.pts[0].date} to {L.pts[L.pts.length - 1].date}). These counts were written by hand at release time, so they are history, not a re-run.
        Later releases (v1.3 onward) do not state a count there, so they are not plotted.
      </p>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Step chart of test count per release" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => <g key={t}><line className="axis" x1={pad.l} x2={W - pad.r} y1={L.y(t)} y2={L.y(t)} /><text x={pad.l - 8} y={L.y(t) + 4} textAnchor="end">{t}</text></g>)}
        <path d={L.d} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
        {L.pts.map((p, i) => (
          <g key={p.version} onMouseEnter={() => setHover(p)} onFocus={() => setHover(p)} tabIndex="0">
            <circle cx={p.x} cy={p.y} r={hover?.version === p.version ? 7 : 5} fill="var(--primary)" stroke="var(--surface-strong)" strokeWidth="2" />
            {(!narrow || i % 2 === 0) && <text x={p.x} y={H - 10} textAnchor="middle">{p.version}</text>}
          </g>
        ))}
      </svg>
      <div className="tip" aria-live="polite">{hover ? <><b>{hover.version}</b> ({hover.date}): {hover.what}. {hover.tests} tests.</> : 'Hover or focus a release to read its milestone.'}</div>
    </section>
  );
}

function Grammar({ openProgram }) {
  const [q, setQ] = useState('');
  const rows = data.keywords.filter((k) => !q || [k.en, k.bn, k.token].some((s) => s.toLowerCase().includes(q.toLowerCase())));
  return (
    <section id="grammar" className="card window reveal" data-title="grammar - English | Bangla">
      <p className="eyebrow">Computed at build time from jesun.py</p>
      <h2>The whole language on one page, in two languages.</h2>
      <div className="grid2" style={{ marginTop: 12 }}>
        <div>
          <p className="sub" style={{ marginTop: 0 }}>The README’s “language in one page”. Load it into the playground and run it.</p>
          <pre className="term src">{data.onePage}</pre>
          <div className="actions" style={{ marginTop: 12 }}><button className="btn ghost" onClick={() => openProgram('', data.onePage)}>Open in playground</button></div>
        </div>
        <div>
          <p className="sub" style={{ marginTop: 0 }}>
            With <code>use bangla</code> as the first line, {data.keywords.length} Bangla words replace their English keywords one for one; the grammar does not change (<code>BANGLA_KEYWORDS</code> in <a href={blob('jesun.py')}>jesun.py</a>).
          </p>
          <div className="field" style={{ marginBottom: 10 }}><label htmlFor="kq">Search keywords</label><input id="kq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="show, repeat, দেখাও…" /></div>
          <div className="kw">
            <table>
              <thead><tr><th>English</th><th>Bangla</th><th>Token</th></tr></thead>
              <tbody>{rows.map((k) => <tr key={k.bn}><td className="mono">{k.en}</td><td className="bn">{k.bn}</td><td className="mono">{k.token}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="hint">{rows.length} of {data.keywords.length} keywords</p>
        </div>
      </div>
    </section>
  );
}

function Examples({ prog, openProgram }) {
  return (
    <section className="card window reveal" data-title="examples/ - build-time import">
      <p className="eyebrow">{data.examples.length} programs from examples/</p>
      <h2>{runnable.length} examples run in this page; the rest need a real machine.</h2>
      <p className="sub">Pick one to load it into the playground. Programs that need an AI provider, tmux, the network or host tools show their source only.</p>
      <div className="gallery" style={{ marginTop: 14 }}>
        {data.examples.map((e) => (
          <button key={e.name} aria-pressed={prog.name === e.name} onClick={() => openProgram(e.name, e.src)}>
            <b>{e.name}.jc</b>
            <span className="tags">
              {e.browser ? <span className="pill good">runs here</span> : (e.needs.length ? e.needs : ['source only']).map((n) => <span key={n} className="pill warn">{n}</span>)}
              {e.ask && <span className="pill info">asks</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Native() {
  const buildTests = data.tests.find((t) => t.module === 'test_build');
  return (
    <section id="native" className="card window reveal" data-title="jesun_build.py - native path">
      <p className="eyebrow">Not run on this page</p>
      <h2>A third path: Jesun.Code to C11 to a native binary.</h2>
      <p className="sub">
        <code>jesun build prog.jc</code> transpiles to C11 with <a href={blob('jesun_build.py')}>jesun_build.py</a> ({data.loc['jesun_build.py'].toLocaleString()} lines) and compiles with the system <code>cc</code>; <code>test_build.py</code> holds {buildTests?.defs} tests for it.
        A browser has no C compiler and the repo commits no generated C, so this page shows no compile output rather than a pretend one. The <code>native_*.jc</code> examples run here through the interpreter instead.
      </p>
      <ol className="steps" style={{ marginTop: 16 }}>
        <li><span className="n">1</span><div><b>Parse</b><div className="hint">The bootstrap parser in <code>jesun.py</code> builds the syntax tree.</div></div></li>
        <li><span className="n">2</span><div><b>Emit C11</b><div className="hint"><code>jesun_build.py</code> walks the tree and writes C with no bundled runtime.</div></div></li>
        <li><span className="n">3</span><div><b>Compile</b><div className="hint"><code>cc</code> produces the binary. Spec: <a href={blob('docs/spec-v1.1.md')}>spec-v1.1.md</a>.</div></div></li>
      </ol>
    </section>
  );
}

function Limits() {
  const gaps = C.counts['pinned gap'] ?? 0, div = C.counts['pinned divergence'] ?? 0, exc = C.counts['pinned exclusion'] ?? 0;
  const items = [
    ['“Plain English” is untested on people', 'No readability study, novice comparison or error-message comprehension test exists yet. The claim is a design goal, not a result.'],
    ['Self-hosting is incomplete by design', `${gaps} pinned gaps, ${div} pinned divergences and ${exc} pinned exclusions are documented in the specs; they are not hidden, but there is no plan to close them yet.`],
    ['One test module does not import', `${C.load_errors.join(', ')} needs a platform_harness module that is not in the repo, so its tests never run.`],
    ['The full suite is CI-only', 'Locally the whole suite runs past five minutes, so “all green” rests on CI runs, not on anything this page re-ran.'],
    ['Small benchmarks, one machine', `Speed numbers are ${data.bench.programs.length} tiny programs on one ${data.bench.machine.machine} machine. Browser timings vary with your device.`],
    ['Recorded history is hand-written', 'Per-release test counts come from ROADMAP.md prose written at release time.'],
  ];
  return (
    <section id="limits" className="card window reveal" data-title="threats_to_validity">
      <p className="eyebrow">Limitations</p>
      <h2>What this page does not show.</h2>
      <div className="grid2" style={{ marginTop: 16 }}>
        {items.map(([t, d]) => (
          <div className="tile" key={t}><h3>{t}</h3><p className="hint" style={{ margin: 0, fontSize: 13 }}>{d}</p></div>
        ))}
      </div>
      <div className="docs" style={{ marginTop: 20 }}>
        {[['docs/research-review.md', 'Research review', 'Graded gaps and what closes them'], ['docs/grammar-v0.1.md', 'Core grammar', 'EBNF for the v0.1 core'], ['ROADMAP.md', 'Roadmap', 'Shipped and next'], ['CHANGELOG.md', 'Changelog', 'Every release']].map(([p, t, d]) => <a key={p} href={blob(p)}><b>{t}</b><small>{d}</small></a>)}
      </div>
    </section>
  );
}
