// flow_geometry_smoke_test.js - committed edges must start at their visible output ports
const fs = require('fs');
const { installDomStubs } = require('./dom_stub.js');
installDomStubs();

const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) process.exit(1);

const TEST = `
;(function () {
  const out = [];
  const check = (name, condition, actual) => out.push((condition ? '  PASS ' : '  FAIL ')+name+(actual ? ' '+JSON.stringify(actual) : ''));
  const makeSvgElement = tag => ({
    tag, attrs: {}, dataset: {}, children: [], textContent: '', innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] ?? null; },
    appendChild(child) { this.children.push(child); return child; },
    querySelectorAll() { return []; },
  });
  const flowWorld = makeSvgElement('g');
  const oldQuerySelector = document.querySelector;
  const oldCreateElementNS = document.createElementNS;
  try {
    document.querySelector = selector => selector === '#flowWorld' ? flowWorld : oldQuerySelector(selector);
    document.createElementNS = (ns, tag) => makeSvgElement(tag);
    project = {
      startScene: 'source',
      scenes: [
        { id: 'source', name: 'Source', x: 100, y: 100, next: 'next-target',
          autoBranches: [{ target: 'auto-target', cond: 'true' }],
          choices: [{ id: 'choice-1', text: 'Choice', target: 'choice-target' }] },
        { id: 'next-target', name: 'Next', x: 100, y: 360, next: '', autoBranches: [], choices: [] },
        { id: 'auto-target', name: 'Auto', x: 340, y: 360, next: '', autoBranches: [], choices: [] },
        { id: 'choice-target', name: 'Choice', x: 580, y: 360, next: '', autoBranches: [], choices: [] },
      ],
    };
    selectedSceneId = 'source';
    pendingFlowLink = null;
    renderFlow();

    const startOf = type => {
      const edge = flowWorld.children.find(el => el.attrs.class === 'flow-edge flow-edge-' + type);
      const m = edge && edge.attrs.d && edge.attrs.d.match(/^M\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)/);
      return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
    };
    const expected = {
      next: { x: 100 + NODE_W, y: 100 + 24 },
      auto: { x: 100 + NODE_W, y: 100 + 40 },
      choice: { x: 100 + NODE_W, y: 100 + 56 },
    };
    for (const type of ['next', 'auto', 'choice']) {
      const actual = startOf(type);
      check(type + ' edge starts at visible ' + type + ' port', actual && actual.x === expected[type].x && actual.y === expected[type].y, { actual, expected: expected[type] });
    }
  } catch (error) {
    out.push('  FAIL fatal ' + error.stack);
  } finally {
    document.querySelector = oldQuerySelector;
    document.createElementNS = oldCreateElementNS;
  }
  console.log(out.join('\\n'));
  const failures = out.filter(line => line.includes('FAIL')).length;
  console.log('========== Flow geometry smoke: ' + (out.length - failures) + ' passed / ' + failures + ' failed ==========');
  process.exit(failures ? 1 : 0);
})();`;

try {
  eval(match[1] + '\n' + TEST);
} catch (error) {
  console.error(error.stack);
  process.exit(1);
}
