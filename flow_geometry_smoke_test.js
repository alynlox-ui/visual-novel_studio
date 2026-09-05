// flow_geometry_smoke_test.js - curved edges and drag previews stay anchored to visible ports
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
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    removeChild(child) { this.children = this.children.filter(item => item !== child); child.parentNode = null; },
    querySelectorAll() { return []; },
  });
  const flowWorld = makeSvgElement('g');
  const flowDragLayer = makeSvgElement('g');
  const flowSvg = makeSvgElement('svg');
  const svgListeners = {};
  flowSvg.addEventListener = (type, handler) => { svgListeners[type] = handler; };
  flowSvg.setPointerCapture = () => {};
  flowSvg.getBoundingClientRect = () => ({left:0,top:0,width:1000,height:700,right:1000,bottom:700});
  const oldQuerySelector = document.querySelector;
  const oldCreateElementNS = document.createElementNS;
  const oldElementFromPoint = document.elementFromPoint;
  try {
    document.querySelector = selector => selector === '#flowWorld' ? flowWorld : (selector === '#flowDragLayer' ? flowDragLayer : (selector === '#flowSvg' ? flowSvg : oldQuerySelector(selector)));
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

    const geometryOf = type => {
      const edge = flowWorld.children.find(el => el.attrs.class === 'flow-edge flow-edge-' + type);
      const values = edge && edge.attrs.d && edge.attrs.d.match(/-?[\\d.]+/g).map(Number);
      if (!values || values.length !== 8) return null;
      const [x1,y1,c1x,c1y,c2x,c2y,x2,y2] = values;
      const midpoint = {
        x: (x1 + 3*c1x + 3*c2x + x2) / 8,
        y: (y1 + 3*c1y + 3*c2y + y2) / 8,
      };
      const chordMidpoint = { x: (x1+x2)/2, y: (y1+y2)/2 };
      return {
        start: { x:x1, y:y1 },
        arcHeight: Math.hypot(midpoint.x-chordMidpoint.x,midpoint.y-chordMidpoint.y),
      };
    };
    const expected = {
      next: { x: 100 + NODE_W, y: 100 + 24 },
      auto: { x: 100 + NODE_W, y: 100 + 40 },
      choice: { x: 100 + NODE_W, y: 100 + 56 },
    };
    for (const type of ['next', 'auto', 'choice']) {
      const geometry = geometryOf(type);
      check(type + ' edge starts at visible ' + type + ' port', geometry && geometry.start.x === expected[type].x && geometry.start.y === expected[type].y, { actual: geometry&&geometry.start, expected: expected[type] });
      check(type + ' edge has a visible arc', geometry && geometry.arcHeight >= 20, { arcHeight: geometry&&geometry.arcHeight, minimum:20 });
    }
    const shortChoiceValues=flowCurveD({x:0,y:0},{x:100,y:0},'choice',0,2).match(/-?[\\d.]+/g).map(Number);
    const [,sy,sc1x,sc1y,sc2x,sc2y,,ey]=shortChoiceValues;
    const shortMidY=(sy+3*sc1y+3*sc2y+ey)/8;
    check('short parallel choice keeps a visible arc',Math.abs(shortMidY)>=20,{arcHeight:Math.abs(shortMidY),minimum:20});

    flowTx=20;flowTy=20;flowK=1;
    document.elementFromPoint=()=>null;
    initFlowEvents();
    const sourcePorts = flowWorld.children
      .filter(el => el.tag === 'g')
      .flatMap(el => el.children)
      .filter(el => el.dataset && el.dataset.from === 'source' && el.dataset.portType);
    for (const [index,type] of ['next','auto','choice'].entries()) {
      const port=sourcePorts.find(el=>el.dataset.portType===type);
      port.closest = selector => selector === '.flow-port' ? port : null;
      svgListeners.pointerdown({button:0,pointerId:7+index,clientX:999,clientY:699,target:port,preventDefault(){},stopPropagation(){}});
      applyFlowTransform();
      const preview = flowDragLayer.children.find(el => el.attrs.class === 'link-drag');
      check(type+' drag preview shares the transformed graph coordinates',!!preview&&flowDragLayer.attrs.transform===flowWorld.attrs.transform,{dragTransform:flowDragLayer.attrs.transform,worldTransform:flowWorld.attrs.transform});
      check(type+' drag preview starts at its port on pointerdown',preview&&Number(preview.attrs.x1)===expected[type].x&&Number(preview.attrs.y1)===expected[type].y,{actual:preview&&{x:Number(preview.attrs.x1),y:Number(preview.attrs.y1)},expected:expected[type]});
      svgListeners.pointerup({clientX:999,clientY:699});
    }
  } catch (error) {
    out.push('  FAIL fatal ' + error.stack);
  } finally {
    document.querySelector = oldQuerySelector;
    document.createElementNS = oldCreateElementNS;
    document.elementFromPoint = oldElementFromPoint;
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
