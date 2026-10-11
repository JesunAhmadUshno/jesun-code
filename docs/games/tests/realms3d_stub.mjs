/* REALMS 3D headless smoke-test stubs (QA-GAP-1).
   Minimal browser-environment fakes so the extracted realms3d module boots in
   plain Node with real three@0.160.0 but NO renderer and NO network.
   No production code is touched; this module only installs globals before the
   game module is imported.
   WEBGL CONTEXT-LOSS RESILIENCE v1 (test-only): stub elements record their
   listeners and support dispatchEvent, and every stub GL canvas is exposed
   via globalThis.__glcanvases ([0] is the harness boot; the DPR-clamp second
   boot appends its own), so the harness can drive synthetic
   webglcontextlost/restored events on the real instance without a GPU. */

export function installStubs() {
  const listeners = {};
  const els = new Map();

  function ctx2d() {
    const grad = { addColorStop() {} };
    return {
      createLinearGradient() { return grad; },
      createRadialGradient() { return grad; },
      fillRect() {}, clearRect() {}, drawImage() {}, fillText() {},
      beginPath() {}, closePath() {}, arc() {}, arcTo() {}, ellipse() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, rect() {},
      save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
      setTransform() {}, resetTransform() {}, clip() {}, setLineDash() {},
      getLineDash() { return []; },
      measureText() { return { width: 0 }; },
      fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
      canvas: null,
    };
  }

  function makeEl(id) {
    const cls = new Set();
    const elListeners = {};
    const el = {
      id: id || '',
      style: {},
      textContent: '',
      innerHTML: '',
      className: '',
      width: 0,
      height: 0,
      classList: {
        add(c) { cls.add(c); },
        remove(c) { cls.delete(c); },
        contains(c) { return cls.has(c); },
        toggle(c, force) {
          if (force === undefined) { if (cls.has(c)) cls.delete(c); else cls.add(c); }
          else if (force) cls.add(c); else cls.delete(c);
          return cls.has(c);
        },
      },
      appendChild() {},
      removeChild() {},
      addEventListener(type, fn) { (elListeners[type] = elListeners[type] || []).push(fn); },
      removeEventListener(type, fn) { elListeners[type] = (elListeners[type] || []).filter(f => f !== fn); },
      dispatchEvent(ev) { for (const fn of elListeners[ev && ev.type] || []) fn(ev); return true; },
      getContext() { return ctx2d(); },
      toDataURL() { return 'data:image/png;base64,STUB'; },  // Phase 5 cooking: food icon sheet slice
      requestPointerLock() { return undefined; },
      click() {},
      focus() {},
    };
    return el;
  }

  const documentStub = {
    getElementById(id) {
      if (!els.has(id)) els.set(id, makeEl(id));
      return els.get(id);
    },
    createElement(tag) { return makeEl('dyn:' + tag); },
    addEventListener() {},
    removeEventListener() {},
    pointerLockElement: null,
    hidden: false,
    visibilityState: 'visible',
    body: makeEl('body'),
  };

  const store = new Map();
  const localStorageStub = {
    getItem(k) { return store.has(String(k)) ? store.get(String(k)) : null; },
    setItem(k, v) { store.set(String(k), String(v)); },
    removeItem(k) { store.delete(String(k)); },
    clear() { store.clear(); },
    _dump() { return Object.fromEntries(store); },
  };

  function audioParam() {
    return {
      value: 0,
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
      linearRampToValueAtTime() {},
      setTargetAtTime() {},
    };
  }
  function audioNode() {
    return {
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
      frequency: audioParam(),
      gain: audioParam(),
      Q: audioParam(),
      playbackRate: audioParam(),
      type: '',
      value: 0,
      buffer: null,
      getChannelData() { return new Float32Array(256); },
    };
  }
  class FakeAudioContext {
    constructor() {
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.state = 'running';
      this.destination = audioNode();
    }
    createOscillator() { return audioNode(); }
    createGain() { return audioNode(); }
    createBiquadFilter() { return audioNode(); }
    createBuffer(ch, n) {
      return { getChannelData() { return new Float32Array(n); }, duration: n / 44100 };
    }
    createBufferSource() { return audioNode(); }
    resume() { return Promise.resolve(); }
  }

  /* manual clock: the harness advances it once per simulated frame so dt is
     deterministic across runs */
  let fakeNow = 0;
  globalThis.performance = { now: () => fakeNow };
  const clock = {
    now() { return fakeNow; },
    advance(ms) { fakeNow += ms; },
  };

  globalThis.document = documentStub;
  globalThis.localStorage = localStorageStub;
  globalThis.AudioContext = FakeAudioContext;
  globalThis.webkitAudioContext = FakeAudioContext;
  globalThis.requestAnimationFrame = () => 0;   // harness drives tick() manually
  globalThis.cancelAnimationFrame = () => {};
  globalThis.addEventListener = (t, fn) => {
    (listeners[t] = listeners[t] || []).push(fn);
  };
  globalThis.removeEventListener = () => {};
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  globalThis.devicePixelRatio = 1;
  Object.defineProperty(globalThis, 'navigator',
    { value: { maxTouchPoints: 0, userAgent: 'node-smoke' }, configurable: true });
  globalThis.window = globalThis;

  /* fake WebGLRenderer: satisfies the boot path (setSize, domElement,
     shadowMap flags) without any GPU. Rendering is never asserted. */
  class StubRenderer {
    constructor() {
      this.domElement = makeEl('glcanvas');
      /* WEBGL CONTEXT-LOSS RESILIENCE v1 (test-only): keep every stub canvas
         so the harness can drive synthetic webglcontextlost/restored events
         on the real instance without a GPU. __glcanvases[0] is the harness
         boot; later boots (e.g. the DPR-clamp second boot) append. */
      (globalThis.__glcanvases = globalThis.__glcanvases || []).push(this.domElement);
      globalThis.__glcanvas = this.domElement;
      this.shadowMap = {};
      this.outputColorSpace = '';
      this.toneMapping = 0;
    }
    setSize() {}
    setPixelRatio() {}
    setClearColor() {}
    render() { globalThis.__renderCount = (globalThis.__renderCount || 0) + 1; }
    dispose() {}
  }
  globalThis.__StubRenderer = StubRenderer;

  return {
    els,
    getEl(id) { return documentStub.getElementById(id); },
    listeners,
    localStorage: localStorageStub,
    clock,
    fireGlobal(type, event) {
      for (const fn of listeners[type] || []) fn(event || {});
    },
  };
}
