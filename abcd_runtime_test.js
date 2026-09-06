'use strict';
/* abcd_runtime_test.js — A/B/D 导出运行时行为断言（区域限定，不做整文件 includes 误报）。
   只允许触碰的区域：standaloneEnhancements 函数文本（导出增强器）与 playableHtml 函数文本（导出模板）。
   断言对象是这些区域里真实存在的行为标记，并对「组装后的导出脚本」做编译门禁，
   而不是仅检查整份 index.html 是否含某字符串。 */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const SA_START = 'function standaloneEnhancements(api){';
const PH_START = 'function playableHtml(){';
const EXP_START = 'function exportPlayable(){';
const sa0 = html.indexOf(SA_START);
const ph0 = html.indexOf(PH_START);
const exp0 = html.indexOf(EXP_START, ph0);
if (sa0 < 0 || ph0 < 0 || exp0 < 0 || ph0 < sa0 || exp0 < ph0) throw new Error('导出区域边界缺失：standaloneEnhancements/playableHtml/exportPlayable');
const SA = html.slice(sa0, ph0);      // 增强器（注入导出文件的函数文本）
const PH = html.slice(ph0, exp0);     // playableHtml 导出模板（含内嵌运行时 + 导出 CSS）

let pass = 0, fail = 0;
function ck(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  ← ' + extra : '')); }
}
function has(txt, sub) { return txt.indexOf(sub) >= 0; }

console.log('== A. 画廊 / 收藏解锁（导出增强器内） ==');
ck('gallery 打开函数存在 galleryPanel', has(SA, 'function galleryPanel(){'));
ck('画廊标签行 overlay id=galleryTabRow', has(SA, "row.id='galleryTabRow'"));
ck('图块 galTile 与锁定层 galLock', has(SA, "tile.className='galTile'") && has(SA, "lk.className='galLock'"));
ck('锁定条目只显示 🔒，不渲染媒体', has(SA, "if(locked){const lk=document.createElement('div')"));
ck('解锁条件用 api.evalCond 对真实状态求值（非仅语法）', has(SA, 'api.evalCond(e.condition)') && has(SA, 'e.condition?!!api.evalCond'));
ck('解锁记录按项目持久化 vns_exp_gallery_+PID', has(SA, "'vns_exp_gallery_'+PID") && has(SA, 'localStorage.setItem(unlockKey'));
ck('再次打开/重开页面后解锁保留（先读存储再渲染）', has(SA, 'loadUnlocks()') && has(SA, 'let unlocked=loadUnlocks()'));
ck('每句/选择推进都重新求值解锁（非仅场景切换）', has(SA, 'if(!restoring)galleryEval();'));
ck('结局收藏/成就/CG/音乐四个分类标签', has(SA, "'cgs'") && has(SA, "'music'") && has(SA, "'endings'") && has(SA, "'achievements'"));

console.log('== B. 主页：logo / 菜单定位与排序 / bgm / 开场 ==');
ck('home.logo 渲染为 #homeLogo（标题上方）', has(SA, "im.id='homeLogo'") && has(SA, 'tEl.insertBefore(im,tEl.firstChild)'));
ck('menuPositions 百分比以 CSS left/top 应用', has(SA, "el.style.left=pos.x+'%'") && has(SA, "el.style.top=pos.y+'%'"));
ck('按钮绝对定位变换（translate -50%）在导出 CSS 中', has(PH, '.tbtn{position:absolute;transform:translate(-50%,-50%)'));
ck('按 experience.homeMenu 顺序重排标题按钮', has(SA, 'function titleMenuKeys()') && has(SA, 'titleEl.appendChild(frag)'));
ck('homeMenu 缺席/为空时回退默认菜单', has(SA, 'auth||MDEFAULT'));
ck('gallery/章节按钮由 homeMenu 可见性过滤', has(SA, "if(k==='gallery')return") && has(SA, "if(k==='chapters')return"));
ck('home.bgm 创建 #homeBgm 并循环', has(SA, "bgmEl.id='homeBgm'") && has(SA, 'bgmEl.loop=true') && has(SA, "bgmEl.className='vns-bgm'"));
ck('bgm 仅首次用户交互后播放（gesture 门）', has(SA, 'function markGesture()') && has(SA, 'gesture&&!paused&&!panel') && has(SA, 'document.addEventListener(\'click\',markGesture,true)'));
ck('bgm 被通用媒体循环排除（不误暂停）', has(SA, "audio:not(.vns-bgm),video"));
ck('开场 overlay id=opening，enabled+image 才显示', has(SA, "ov.id='opening'") && has(SA, "if(!o.enabled||!o.image)return"));
ck('开场 duration 后淡出，可点击跳过', has(SA, "ov.classList.add('fade')") && has(SA, 'ov.onclick=dismiss') && has(SA, 'setTimeout(dismiss,Math.max(0,Number(o.duration)||900))'));

console.log('== D. 进度：自动存档 / 继续 / 章节 / 已读快进 ==');
ck('自动存档写入独立槽 key+0（区分手动 1..12）', has(SA, 'localStorage.setItem(key+0') && has(SA, 'for(let i=1;i<=12;i++)'));
ck('每场景/选择推进触发自动存档', has(SA, 'function autoSave()') && has(SA, "(was===''||sceneChanged||chNow||endNow||choiceWasVisible)"));
ck('手动存档不覆盖自动槽（槽列表仅 1..12）', has(SA, "button('slot'+i,(loading?'读取 ':'保存 ')+i"));
ck('继续按钮优先读自动存档 read(0)', has(SA, 'const s0=read(0)') && has(SA, 'if(s0&&PROJECT.scenes.some(x=>x.id===s0.sceneId)){load(0);return;}'));
ck('章节面板章节列表 id=chaptersList', has(SA, "box.id='chaptersList'"));
ck('章节仅 visited(sceneVisited) 解锁，场景缺失锁定', has(SA, 'api.sceneVisited(ch.sceneId)') && has(SA, 'missing?')); 
ck('解锁章节点击后跳 chapter.sceneId（jumpChapter）', has(SA, 'if(api.jumpChapter(ch.id))closePanel();'));
ck('章节选择开关 chapterSelection 控制按钮出现', has(SA, "if(k==='chapters')return chapterSelOn"));
ck('skipRead 开启时快进只能用于已读行', has(SA, 'skipReadOn&&!skip') && has(SA, 'api.hasRead(st3.sceneId,st3.di)'));
ck('skipRead 遇未读台词自动停下转正常打字', has(SA, "if(skip&&skipReadOn){const st3=api.capture();") && has(SA, '{skip=false;auto=false;return;}'));

console.log('== 导出模板运行时（playableHtml 内嵌 core） ==');
ck('enhancements 由 standaloneEnhancements.toString() 注入', has(PH, 'const enhancements=standaloneEnhancements.toString();'));
ck('运行时维护持久化已读日志 readLog', has(PH, 'readLog=new Set()') && has(PH, "localStorage.getItem('vns_exp_read_'+PID)"));
ck('章节访问快照 chapterSnaps（先到先存）', has(PH, 'chapterSnaps={}') && has(PH, 'chapterSnaps[c0.id]={flags:JSON.parse'));
ck('core api 暴露 markRead/hasRead/sceneVisited', has(PH, 'markRead:(sid,di)') && has(PH, 'hasRead:(sid,di)') && has(PH, 'sceneVisited:sid'));
ck('core api 暴露 evalCond（真实状态条件求值）', has(PH, 'evalCond:x') && has(PH, 'try{return cond(x);}catch(e){return false;}'));
ck('core api 暴露 jumpChapter（restore 快照/基线 + go）', has(PH, 'jumpChapter:cid') && has(PH, "go(ch.sceneId);return true;}}"));
ck('api.restore 全程标记 inRestore（防快照污染）', has(PH, 'inRestore=true;try{') && has(PH, '}finally{inRestore=false;}'));
ck('导出 CSS 含开场/画廊/锁定层样式', has(PH, '#opening{') && has(PH, '.galGrid{') && has(PH, '.galLock{'));

console.log('== 组装后的导出脚本编译门禁（真实产物语法） ==');
(function () {
  const data = '{"id":"t","title":"x","scenes":[],"startScene":"","flags":{},"home":{},"experience":{}}';
  const tplOpen = PH.indexOf('`', PH.indexOf('data+'));
  const tplEnd = PH.indexOf("${'</'}", tplOpen);
  if (tplOpen < 0 || tplEnd < 0) throw new Error('导出模板边界缺失');
  const code = PH.slice(tplOpen + 1, tplEnd);
  if (code.indexOf('${enhancements}') < 0) throw new Error('导出模板中缺少 ${enhancements} 注入点');
  const body = 'const PROJECT=' + data + code.replace('${enhancements}', SA);
  try { new Function(body); }
  catch (e) { fail++; console.log('  ✗ 导出脚本编译失败：' + e.message); return; }
  pass++; console.log('  ✓ 导出脚本（core + standaloneEnhancements 注入后）通过编译');
})();

console.log('\nabcd_runtime_test 合计：通过 ' + pass + ' / 失败 ' + fail);
if (fail > 0) process.exit(1);
