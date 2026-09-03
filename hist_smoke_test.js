// hist_smoke_test.js — 项目版本历史（快照/回滚/对比/自动快照）冒烟测试
const fs = require('fs');
const { installDomStubs, store } = require('./dom_stub.js');
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
    const key = 'gvn_hist_' + project.id;
    check('无历史时版本列表为空', (await histLoad()).versions.length === 0);
    check('版本按钮已注入 header', (html.match(/id="btnHist"/g) || []).length === 1);
    check('版本模态已注入 DOM', (html.match(/id="histModal"/g) || []).length === 1);
    // ---- 手动快照 v1 ----
    const v1 = await histSnapshot({ tag: 'v1-初稿', note: '测试', auto: false });
    check('手动快照 v1 成功', !!v1 && v1.tag === 'v1-初稿' && v1.auto === false);
    check('快照已持久化到存储', !!store[key] && JSON.parse(store[key]).versions.length === 1);
    // ---- 修改后自动快照 ----
    const origTitle = project.title;
    project.scenes[0].name = '改过的场景';
    const v2 = await histSnapshotAuto('新建项目前自动快照');
    check('自动快照 v2 成功且 auto=true', !!v2 && v2.auto === true);
    check('版本数=2', (await histLoad()).versions.length === 2);
    // ---- 状态未变不重复快照 ----
    const dup = await histSnapshot({ tag: '重复', note: '', auto: false });
    check('相同状态不重复入栈：返回顶部版本', dup.id === (await histLoad()).versions[0].id && (await histLoad()).versions.length === 2);
    // ---- 回滚到 v1 ----
    await histRestore(v1.id);
    check('回滚后场景名还原', project.scenes[0].name === '放学后', { name: project.scenes[0].name });
    check('回滚后标题不变（同项目）', project.title === origTitle);
    // ---- 再次修改并建 v3，对比 v2 vs v3 ----
    project.scenes[0].name = '终稿场景';
    const v3 = await histSnapshot({ tag: 'v3-终稿', auto: false });
    let cmpThrow = false;
    try {
      const ids = [v2.id, v3.id];
      // 直接驱动对比逻辑（经 histSelectedIds 会读 DOM，改为直接调内部逻辑：
      // 这里用两个快照调用 histCompare 前的算法验证——临时把选中注入 DOM 不可行，
      // 因此改测：histLoad 两份数据 + 场景级差异断言。
      const rec = await histLoad();
      const A = rec.versions.find(x => x.id === v2.id);
      const B = rec.versions.find(x => x.id === v3.id);
      const pa = migrateProject(JSON.parse(A.json));
      const pb = migrateProject(JSON.parse(B.json));
      const nameA = pa.scenes.find(s => s.id === 's_start').name;
      const nameB = pb.scenes.find(s => s.id === 's_start').name;
      check('对比数据源：v2 场景名=' + nameA + '，v3 场景名=' + nameB, nameA === '改过的场景' && nameB === '终稿场景');
    } catch (e) { cmpThrow = true; console.log('  cmp throw:', e.message); }
    check('对比数据读取不抛错', !cmpThrow);
    // ---- 删除 v2 ----
    await histDelete(v2.id);
    check('删除后版本数=2（v1、v3）', (await histLoad()).versions.length === 2);
    check('被删的 v2 已不存在', !(await histLoad()).versions.some(x => x.id === v2.id));
    // ---- 超大项目防爆：>512KB 拒记 ----
    project.scenes[0].text = 'x'.repeat(600 * 1024);
    const huge = await histSnapshot({ tag: 'huge', auto: false });
    check('超大项目拒绝快照（返回 null）', huge === null);
    check('超大快照未污染列表（仍为 2 份）', (await histLoad()).versions.length === 2);
    // 还原场景文本避免影响后续
    project.scenes[0].text = '';
    // ---- 容量裁剪：超 4MB 总量时淘汰最旧（用 2 份 ~2.6MB 验证）----
    project.scenes[1].text = 'y'.repeat(300 * 1024); // ~300KB*…不足以压 4MB，改用直接注入模拟
    const recBig = await histLoad();
    recBig.versions = recBig.versions.map((x, i) => ({ ...x, json: JSON.stringify({ pad: 'z'.repeat(2.2 * 1024 * 1024), id: x.id }) }));
    // 手动调用 histPersist 后再次 snapshot 触发裁剪
    await histPersist(recBig);
    project.scenes[1].text = '';
    const vTrim = await histSnapshot({ tag: 'trim-test', auto: false });
    check('超总量后新快照仍可写入', !!vTrim);
    const after = await histLoad();
    const total = after.versions.reduce((s, x) => s + (x.json ? x.json.length : 0), 0);
    check('总量裁剪到 ≤4MB', total <= 4 * 1024 * 1024, { total: Math.round(total / 1024 / 1024 * 10) / 10 + 'MB' });
    check('裁剪后保留最新（trim-test 在列）', after.versions.some(x => x.tag === 'trim-test'));
  } catch (e) {
    console.log('FATAL:', e.stack);
    results.push('  ✗ FATAL ' + e.message);
  }
  console.log(results.join('\\n'));
  const fails = results.filter(r => r.indexOf('✗') >= 0).length;
  console.log('========== 版本历史冒烟：' + (results.length - fails) + ' 通过 / ' + fails + ' 失败 ==========');
  process.exit(fails ? 1 : 0);
})();
`;
try {
  eval(m[1] + '\n' + TEST);
} catch (e) {
  console.error('EVAL/BOOT ERROR:', e.stack);
  process.exit(1);
}
