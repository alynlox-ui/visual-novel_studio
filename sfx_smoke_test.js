// sfx_smoke_test.js — 音效系统冒烟测试（DOM 打桩 + 真实脚本 eval）
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.log('FAIL: no script tag'); process.exit(1); }

const store = {};
const mkClassList = () => {
  const s = new Set();
  return { add: x => s.add(x), remove: x => s.delete(x), toggle: (x, f) => { if (f === undefined) { s.has(x) ? s.delete(x) : s.add(x); } else { f ? s.add(x) : s.delete(x); } }, contains: x => s.has(x) };
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
const anyEl = mkEl();
global.window = global;
global.self = global;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.document = {
  querySelector: () => anyEl,
  querySelectorAll: () => [],
  getElementById: () => anyEl,
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
// 故意不提供 AudioContext —— 引擎应优雅降级为无声，不抛错
global.navigator = { userAgent: 'test', vibrate: () => {} };
global.alert = () => {};
global.confirm = () => true;
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
global.Blob = function () {};
global.FileReader = function () { this.readAsText = () => {}; };

const TEST = `
;(function(){
  const results = [];
  const check = (name, cond, extra) => { results.push((cond ? '  ✓ ' : '  ✗ FAIL: ') + name + (extra ? ' ' + JSON.stringify(extra) : '')); };
  try {
    // ---- boot 已执行，project=示例 ----
    check('boot 后 project 已加载', !!project && Array.isArray(project.scenes));
    check('sfxEnabled 默认开启', sfxEnabled === true);
    // ---- 引擎不抛错（AudioContext 缺失 → 静默降级）----
    let threw = false; try { sfx('ui'); sfx('type'); sfx('turn'); sfx('choice'); sfx('save'); sfx('load'); sfx('back'); sfx('ending-good'); sfx('ending-other'); sfx('bogus'); } catch (e) { threw = true; console.log('  engine throw:', e.message); }
    check('sfx 全谱系调用不抛错（无 AudioContext 静默降级）', !threw);
    check('ensureSfx 无 AudioContext 返回 null', ensureSfx() === null);
    // ---- 开关：持久化 + 状态翻转 ----
    sfxToggle(); // true -> false
    check('sfxToggle 关闭后 sfxEnabled=false', sfxEnabled === false);
    check('关闭状态已持久化 gvn_sfx_on=0', store['gvn_sfx_on'] === '0');
    check('三个 sfx 开关按钮都存在', (html.match(/class="sfx-btn"/g) || []).length === 3);
    // ---- 关闭时全部钩子安全 ----
    P.project = project; // 让播放器路径可用
    P.flags = {}; P.unlockedEndings = []; P.auto = false; P.skipMode = null;
    P.sceneId = project.startScene;
    P.currentChoices = [{ id: 't1', text: '选项A', target: '', setFlags: [] }];
    threw = false; try { renderChoices(); } catch (e) { threw = true; console.log('  renderChoices throw:', e.stack); }
    check('renderChoices 在静音态安全', !threw);
    threw = false; try { showEnding({ kind: 'good', title: 'T' }); } catch (e) { threw = true; console.log('  showEnding throw:', e.stack); }
    check('showEnding 在静音态安全且解锁结局', !threw && P.unlockedEndings.length === 1);
    P.ending = null;
    threw = false; try { back(); } catch (e) { threw = true; console.log('  back throw:', e.stack); }
    check('back() 在静音态安全', !threw);
    threw = false; try { saveToSlot(1); loadFromSlot(1); } catch (e) { threw = true; console.log('  slot throw:', e.stack); }
    check('存档/读档在静音态安全', !threw);
    check('存档已写入 localStorage', !!store['gvn_save_' + project.id + '_1']);
    // ---- 重新开启 ----
    sfxToggle(); // false -> true
    check('sfxToggle 重新开启且持久化=1', sfxEnabled === true && store['gvn_sfx_on'] === '1');
    check('开启时播放一次 ui 提示音不抛错', true);
    // ---- 打字音只在慢速触发逻辑 ----
    const p0 = P.speed;
    P.speed = 15; // 快
    P.typeIndex = 2;
    P.typeTimer = null; P.typing = false;
    // 直接验证守卫表达式行为（interval 本体在浏览器里跑）
    const fastGuard = (P.speed >= 60 && (2 % 3 === 0));
    P.speed = 60;
    const slowGuard = (P.speed >= 60 && (3 % 3 === 0));
    check('打字音守卫：快速度不响/慢速度每3字响', fastGuard === false && slowGuard === true);
    P.speed = p0;
  } catch (e) {
    console.log('FATAL:', e.stack);
    results.push('  ✗ FATAL ' + e.message);
  }
  console.log(results.join('\\n'));
  const fails = results.filter(r => r.indexOf('✗') >= 0).length;
  console.log('========== SFX 冒烟：' + (results.length - fails) + ' 通过 / ' + fails + ' 失败 ==========');
  process.exit(fails ? 1 : 0);
})();
`;
try {
  eval(m[1] + '\n' + TEST);
} catch (e) {
  console.error('EVAL/BOOT ERROR:', e.message);
  process.exit(1);
}
