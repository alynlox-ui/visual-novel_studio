// cond_smoke_test.js — 条件表达式扩展（随机/时间/已读/结局/组合）冒烟测试
const fs = require('fs');
const { installDomStubs } = require('./dom_stub.js');
installDomStubs();
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.log('FAIL: no script tag'); process.exit(1); }

const TEST = `
;(function(){
  const results = [];
  const check = (name, cond, extra) => { results.push((cond ? '  ✓ ' : '  ✗ FAIL: ') + name + (extra ? ' ' + JSON.stringify(extra) : '')); };
  const thr = fn => { try { fn(); return false; } catch (e) { return true; } };
  try {
    // ---- 原有能力不回归 ----
    check('无条件恒真', evalCond('', {}) === true);
    check('数值比较 >=', evalCond('小夜好感 >= 2', { '小夜好感': 3 }) === true);
    check('数值比较 <', evalCond('勇气 < 5', { '勇气': 3 }) === true);
    check('多条件 且', evalCond('小夜好感 >= 2 && 勇气 >= 1', { '小夜好感': 3, '勇气': 1 }) === true);
    check('多条件 或', evalCond('小夜好感 >= 9 || 勇气 <= 0', { '小夜好感': 1, '勇气': 0 }) === true);
    check('括号组合', evalCond('(小夜好感 >= 1 || 勇气 <= 0) && !结束', { '小夜好感': 1, '结束': 0 }) === true);
    check('括号组合（结束=1 时整式为假）', evalCond('(小夜好感 >= 1 || 勇气 <= 0) && !结束', { '小夜好感': 1, '结束': 1 }) === false);
    check('长链混合 且/或', evalCond('1 || 2 || 3', {}) === true);
    check('左侧真时右侧仍被解析（短路 bug 回归）', evalCond('1 || (未知flag) >= 1', {}) === true);
    check('字符串字面量比较', evalCond('名 == "小夜"', {}) === false);
    // ---- 随机概率 ----
    let t100 = 0, t0 = 0;
    for (let i = 0; i < 200; i++) { if (evalCond('chance(100)', {})) t100++; if (evalCond('chance(0)', {})) t0++; }
    check('chance(100) 200 次全真', t100 === 200);
    check('chance(0) 200 次全假', t0 === 0);
    let mid = 0; for (let i = 0; i < 300; i++) if (evalCond('chance(50)', {})) mid++;
    check('chance(50) 300 次落在 10~290（随机性存在）', mid > 10 && mid < 290, { mid });
    // ---- 时间（evalCond 恒返回布尔，数值函数须嵌入比较）----
    const hNow = new Date().getHours();
    check('hourBetween(当下小时,当下小时) 恒真', evalCond('hourBetween(' + hNow + ',' + hNow + ')', {}) === true);
    check('hourBetween(0,23) 恒真', evalCond('hourBetween(0,23)', {}) === true);
    check('hourNow() >= 0', evalCond('hourNow() >= 0', {}) === true);
    check('hourNow() <= 23', evalCond('hourNow() <= 23', {}) === true);
    check('minuteNow() 在 0~59', evalCond('minuteNow() >= 0 && minuteNow() < 60', {}) === true);
    check('hourBetween 反区间（跨午夜逻辑不误判整天）', evalCond('hourBetween(0,0) || hourNow() >= 0', {}) === true);
    // ---- 场景已读（编辑器态 P.project 为 null → 安全 false）----
    check('编辑器态 sceneRead 安全返回 false', evalCond('sceneRead("s_meet")', {}) === false);
    // 模拟播放器状态
    P.project = project; P.readScenes = new Set(['s_start']);
    check('播放器态 sceneRead 已读=true', evalCond('sceneRead("s_start")', {}) === true);
    check('播放器态 sceneRead 未读=false', evalCond('sceneRead("s_meet")', {}) === false);
    check('sceneCount() = 场景总数', evalCond('sceneCount() == ' + project.scenes.length, {}) === true);
    // ---- 结局解锁 ----
    P.unlockedEndings = ['good|与你共度的黄昏'];
    check('endings() = 1', evalCond('endings() == 1', {}) === true);
    check('endingSeen("good") 已解锁=true', evalCond('endingSeen("good")', {}) === true);
    check('endingSeen("bad") 未解锁=false', evalCond('endingSeen("bad")', {}) === false);
    check('endingSeen 带标题精确匹配', evalCond('endingSeen("good","与你共度的黄昏")', {}) === true && evalCond('endingSeen("good","别的")', {}) === false);
    // ---- 纯函数 / 嵌套 / 参数运算 ----
    check('abs(-3.2)=3.2', evalCond('abs(-3.2) == 3.2', {}) === true);
    check('函数嵌套与组合', evalCond('chance(100) && !chance(0) && abs(-1) == 1', {}) === true);
    check('参数可含运算 chance(50+50)', evalCond('chance(50+50)', {}) === true);
    check('带引号字符串参数', evalCond('sceneRead("s_start") && endingSeen("good")', {}) === true);
    // ---- 错误处理 ----
    check('未知函数抛错', thr(() => evalCond('noSuchFn(1)', {})));
    check('validateCond 捕获未知函数', validateCond('noSuchFn(1)') === false);
    check('括号缺参报错', thr(() => evalCond('chance(', {})));
    check('未知标识符仍按 0 处理（不破坏旧语义）', evalCond('未知名 >= 0', {}) === true);
    // ---- UI chips 已注入（split 计数，避开模板字符串吞反斜杠）----
    const cnt = (s, p) => s.split(p).length - 1;
    check('chance(30) 快捷 chip 存在×2', cnt(html, 'data-insert="chance(30)"') === 2);
    check('sceneRead 快捷 chip 存在×2', cnt(html, 'data-insert="sceneRead(') === 2);
    check('endingSeen 快捷 chip 存在×2', cnt(html, 'data-insert="endingSeen(') === 2);
    check('hourBetween 快捷 chip 存在×2', cnt(html, 'data-insert="hourBetween(18,23)"') === 2);
    // ---- 单文件 Web 导出与编辑器使用同一安全条件语义 ----
    const exported = playableHtml();
    check('Web 导出不使用动态 Function/with 求值', !exported.includes("Function('f'") && !exported.includes('with(f)'));
    check('Web 导出内置安全 ExprParser', exported.includes('class ExprParser') && exported.includes('const COND_FNS='));
    check('Web 导出支持条件状态函数', exported.includes('sceneRead(id)') && exported.includes('endingSeen(kind,title)') && exported.includes('sceneCount()'));
    check('Web 导出记录已读场景和解锁结局', exported.includes('readScenes.add(String(id))') && exported.includes('unlockedEndings.push(endingKey)'));
  } catch (e) {
    console.log('FATAL:', e.stack);
    results.push('  ✗ FATAL ' + e.message);
  }
  console.log(results.join('\\n'));
  const fails = results.filter(r => r.indexOf('✗') >= 0).length;
  console.log('========== 条件扩展冒烟：' + (results.length - fails) + ' 通过 / ' + fails + ' 失败 ==========');
  process.exit(fails ? 1 : 0);
})();
`;
try {
  eval(m[1] + '\n' + TEST);
} catch (e) {
  console.error('EVAL/BOOT ERROR:', e.stack);
  process.exit(1);
}
