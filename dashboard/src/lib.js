// Pure logic shared by the page and scripts/check.mjs.

// tests/selfhost_harness.py: the differential check is exact equality of
// (exit code, stdout); its pinned-gap helpers first rewrite LINE_RE ("Line \d+")
// to "Line N". compare() reports which of the two the outputs satisfy.
export const normalize = (s) => s.replace(/Line \d+/g, 'Line N');
export function compare(boot, self) {
  if (boot.code === self.code && boot.out === self.out) return 'identical';
  if (boot.code === self.code && normalize(boot.out) === normalize(self.out)) return 'identical-modulo-line';
  return 'diverged';
}

// The Python driver run inside Pyodide: the same calls the CLI makes
// (jesun.main([...])), with stdout and stdin swapped for in-memory buffers.
export const DRIVER = `
import io, sys, contextlib, os, time
os.chdir('/home/pyodide/jc')
if '/home/pyodide/jc' not in sys.path: sys.path.insert(0, '/home/pyodide/jc')
import jesun
def run_jc(args, stdin_text):
    buf = io.StringIO()
    old_in = sys.stdin
    sys.stdin = io.StringIO(stdin_text)
    t0 = time.perf_counter()
    try:
        with contextlib.redirect_stdout(buf):
            try:
                code = jesun.main(list(args))
            except SystemExit as e:
                code = e.code if isinstance(e.code, int) else 1
    finally:
        sys.stdin = old_in
    return [code or 0, buf.getvalue(), (time.perf_counter() - t0) * 1000]
`;

// SVG step-chart geometry for the release ladder (also checked in node).
export function ladder(releases, W, H, pad) {
  const pts = releases.filter((r) => r.tests != null);
  const max = Math.max(...pts.map((r) => r.tests));
  const x = (i) => pad.l + (i / Math.max(1, pts.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  let d = '';
  pts.forEach((r, i) => { d += i ? ` H${x(i)} V${y(r.tests)}` : `M${x(0)} ${y(r.tests)}`; });
  return { pts: pts.map((r, i) => ({ ...r, x: x(i), y: y(r.tests) })), d, max, y };
}

export const slowdown = (row) => row.selfhosted_median_s / row.bootstrap_median_s;
