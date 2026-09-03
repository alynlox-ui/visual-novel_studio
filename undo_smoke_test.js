// undo_smoke_test.js — 编辑器撤销/重做冒烟测试（真实 debounce 计时器 + 直接快照提交做深度用例）
const fs = require('fs');
const { installDomStubs } = require('./dom_stub.js');
installDomStubs();
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.log('FAIL: no script tag'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TEST = `
;(async function(){
  const results = [];
  const check = (name, cond, extra) => { results.push((cond ? '  ✓ ' : '  ✗ FAIL: ') + name + (extra ? ' ' + JSON.stringify(extra) : '')); };
  try {
    // boot 已完成（脚本末尾 boot()），project=示例草稿
    check('boot 基线：undoStack=1', undoStack.length === 1, { len: undoStack.length });
    check('撤销/重做按钮已注入 header', (html.match(/id="btnUndo"/g) || []).length === 1 && (html.match(/id="btnRedo"/g) || []).length === 1);
    const s0name = project.scenes[0].name; // 放学后
    // ---- 编辑 1：改名 scenes[0]（走真实 debounce 提交点）----
    project.scenes[0].name = '改名X';
    saveEditor();
    await sleep(560);
    check('编辑1 已提交：undoStack=2', undoStack.length === 2, { len: undoStack.length });
    // ---- 编辑 2：改名 scenes[1] ----
    project.scenes[1].name = '改名Y';
    saveEditor();
    await sleep(560);
    check('编辑2 已提交：undoStack=3', undoStack.length === 3, { len: undoStack.length });
    // ---- 撤销 1：回到编辑1后的状态 ----
    undoEditor();
    check('撤销1：scenes[0]=改名X, scenes[1]=校门口', project.scenes[0].name === '改名X' && project.scenes[1].name === '校门口', { s0: project.scenes[0].name, s1: project.scenes[1].name });
    check('撤销1 后 redoStack=1', redoStack.length === 1, { len: redoStack.length });
    // ---- 撤销 2：回到基线示例 ----
    undoEditor();
    check('撤销2：scenes[0]=放学后', project.scenes[0].name === s0name, { s0: project.scenes[0].name });
    check('撤销2 后 undoStack=1（撤销按钮应禁用）', undoStack.length === 1);
    // ---- 重做 1 / 2 ----
    redoEditor();
    check('重做1：scenes[0]=改名X', project.scenes[0].name === '改名X', { s0: project.scenes[0].name });
    redoEditor();
    check('重做2：scenes[1]=改名Y', project.scenes[1].name === '改名Y', { s1: project.scenes[1].name });
    check('重做2 后 redoStack=0', redoStack.length === 0);
    const before = project.scenes[1].name;
    redoEditor();
    check('无可重做时状态不变且不崩', project.scenes[1].name === before);
    // ---- 撤销后新编辑会清空 redo ----
    undoEditor();
    check('撤销后 redoStack=1', redoStack.length === 1);
    project.scenes[0].name = '分支新编辑';
    commitUndoSnapshot();
    check('新编辑清空 redoStack', redoStack.length === 0, { len: redoStack.length });
    // ---- 新建项目重置基线 ----
    newProject(); renderAll(); editorResetBaseline();
    check('新建后基线重置 undoStack=1', undoStack.length === 1 && project.title === '未命名作品', { len: undoStack.length });
    // ---- 连续相同状态不重复入栈 ----
    project.scenes[0].name = 'A'; commitUndoSnapshot();
    project.scenes[0].name = 'A'; commitUndoSnapshot();
    check('相同状态不重复入栈：undoStack=2', undoStack.length === 2, { len: undoStack.length });
    // ---- 深度限制：UNDO_LIMIT（直接快照提交）----
    for (let i = 0; i < UNDO_LIMIT + 10; i++) { project.scenes[0].name = 'N' + i; commitUndoSnapshot(); }
    check('栈深度被限制在 UNDO_LIMIT=60', undoStack.length === UNDO_LIMIT, { len: undoStack.length });
  } catch (e) {
    console.log('FATAL:', e.stack);
    results.push('  ✗ FATAL ' + e.message);
  }
  console.log(results.join('\\n'));
  const fails = results.filter(r => r.indexOf('✗') >= 0).length;
  console.log('========== 撤销/重做冒烟：' + (results.length - fails) + ' 通过 / ' + fails + ' 失败 ==========');
  process.exit(fails ? 1 : 0);
})();
`;
try {
  eval(m[1] + '\n' + TEST);
} catch (e) {
  console.error('EVAL/BOOT ERROR:', e.stack);
  process.exit(1);
}
