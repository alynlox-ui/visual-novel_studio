// dom_stub.js — 供 Node 冒烟测试共用的 DOM / 浏览器桩
const store = {};
const mkClassList = () => {
  const s = new Set();
  return {
    add: x => s.add(x), remove: x => s.delete(x),
    toggle: (x, f) => { if (f === undefined) { s.has(x) ? s.delete(x) : s.add(x); } else { f ? s.add(x) : s.delete(x); } },
    contains: x => s.has(x),
  };
};
const mkEl = () => {
  const el = {
    _cls: mkClassList(),
    style: { setProperty() {}, getPropertyValue: () => null, removeProperty() {} }, dataset: {}, children: [],
    classList: null, innerHTML: '', textContent: '', value: '', disabled: false,
    src: '', volume: 1, loop: false, muted: false, title: '', type: '', href: '',
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    remove() {}, focus() {}, click() {}, play() { return Promise.resolve(); }, pause() {},
    setAttribute() {}, getAttribute() { return null; },
    getContext() { return new Proxy({}, { get: (t, p) => (p === 'canvas' ? { width: 0, height: 0 } : (typeof p === 'string' ? mkEl() : undefined)) }); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; },
    get isConnected() { return true; },
  };
  Object.defineProperty(el, 'classList', { get: () => el._cls });
  return el;
};
function installDomStubs() {
  global.window = global;
  global.self = global;
  global.addEventListener = () => {};
  global.removeEventListener = () => {};
  global.document = {
    querySelector: () => mkEl(),
    querySelectorAll: () => [],
    getElementById: () => mkEl(),
    createElement: () => mkEl(),
    createElementNS: () => mkEl(),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: { classList: mkClassList(), appendChild() {}, style: {} },
    documentElement: { style: {} },
    title: '',
  };
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  global.performance = { now: () => Date.now() };
  global.requestAnimationFrame = () => 0;
  global.cancelAnimationFrame = () => {};
  global.devicePixelRatio = 1;
  global.innerWidth = 1440; global.innerHeight = 900;
  global.Image = function () { const i = mkEl(); i.addEventListener = () => {}; return i; };
  global.Audio = function () { return mkEl(); };
  global.navigator = { userAgent: 'test', vibrate: () => {} };
  global.alert = () => {};
  global.confirm = () => true;
  global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
  global.Blob = function () {};
  global.FileReader = function () { this.readAsText = () => {}; };
}
module.exports = { installDomStubs, store, mkEl };
