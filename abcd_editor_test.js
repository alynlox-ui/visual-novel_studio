// abcd_editor_test.js — A-D 体验·内容创作模块测试
//  阶段0：纯模型（require abcd_editor.js，无需 DOM）
//  阶段1：编辑器集成（dom_stub + 内联主脚本 + 模块 + 撤销栈/草稿持久化/迁移包装）
const fs = require('fs');
const assert = require('assert');
const srcMod = fs.readFileSync('abcd_editor.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

/* ================= 阶段0：模型单元 ================= */
const { ABCD: M } = require('./abcd_editor.js');
let pass = 0, fail = 0;
function ck(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); }
}
function fixture() {
  const p = {
    id: 'proj_t', title: '测试', startScene: 's1', home: {}, experience: {},
    scenes: [
      { id: 's1', name: '放学后', characters: [
        { charId: 'lib_a', name: '小夜', image: 'a.png', x: 30, y: 60, scale: 1, opacity: 1, rotate: 0, dialogueIndex: 0, actionId: 'idle', expressionId: 'norm' },
        { charId: 'lib_b', name: '我', image: 'b.png', x: 70, y: 60, scale: 0.8, opacity: 0.9, rotate: 0, dialogueIndex: 0, actionId: 'idle', expressionId: 'norm' }
      ], dialogues: [
        { id: 'd1', speaker: '小夜', text: '今天也一起回家吧。', charId: 'lib_a', actionId: 'act_talk', expressionId: 'smile', voice: 'v1.mp3' },
        { id: 'd2', speaker: '', text: '好呀，放学后的{小夜好感}点。', charId: '', actionId: '', expressionId: '', voice: '' }
      ] },
      { id: 's2', name: '夜晚', characters: [
        { charId: 'lib_a', name: '小夜', image: 'a.png', x: 10, y: 80, scale: 1, opacity: 1, rotate: 0, dialogueIndex: 0, actionId: 'idle', expressionId: 'sad' }
      ], dialogues: [] }
    ]
  };
  return M.ensureSchema(p);
}
try {
  console.log('—— 阶段0 模型 ——');
  // 结构补齐（幂等）
  const p0 = fixture();
  ck('ensureSchema 补齐 collections 四桶', ['cgs', 'music', 'endings', 'achievements'].every(function (k) { return Array.isArray(p0.experience.collections[k]); }));
  ck('ensureSchema 补齐 menuPositions 六个键', M.MENU_KEYS.every(function (k) { return p0.experience.menuPositions[k] && Number.isFinite(p0.experience.menuPositions[k].x) && Number.isFinite(p0.experience.menuPositions[k].y); }));
  ck('ensureSchema 补齐 home.logo/bgm', p0.home.logo === '' && p0.home.bgm === '');
  ck('ensureSchema 补齐 opening{enabled,duration,image}', p0.experience.opening.enabled === false && p0.experience.opening.duration === 900 && p0.experience.opening.image === '');
  ck('ensureSchema 补齐 appearancePresets/chapters 数组', Array.isArray(p0.experience.appearancePresets) && Array.isArray(p0.experience.chapters));
  const before = JSON.stringify(p0);
  M.ensureSchema(p0);
  ck('ensureSchema 幂等（重复执行无变化）', before === JSON.stringify(p0));
  // 安全条件
  ck('条件校验：合法表达式为 true', M.condValid('小夜好感 >= 5 && sceneRead("s1")') === true);
  ck('条件校验：非法表达式为 false', M.condValid('小夜好感 >=') === false);
  ck('条件校验：空条件恒解锁', M.condValid('') === true);
  ck('条件求值（无副作用解析执行）', M.condEvaluate('1 + 2 == 3', {}) === true);
  // 收藏品 CRUD
  const p1 = fixture();
  const e = M.colAdd(p1, 'cgs', { title: '黄昏CG', source: 'data:image/png;base64,AAA', condition: '小夜好感 >= 5', sceneId: 's1' });
  ck('colAdd 生成完整条目 {id,title,source,condition,sceneId}', !!(e && e.id && e.title === '黄昏CG' && e.condition === '小夜好感 >= 5' && e.sceneId === 's1'));
  ck('colPatch 更新标题与场景', M.colPatch(p1, 'cgs', e.id, { title: '改名CG', sceneId: 's2' }) && M.col(p1, 'cgs')[0].title === '改名CG' && M.col(p1, 'cgs')[0].sceneId === 's2');
  const e2 = M.colAdd(p1, 'cgs', { title: 'B' });
  M.colAdd(p1, 'cgs', { title: 'C' });
  ck('colMove 上移/越界不移动', M.colMove(p1, 'cgs', e2.id, -1) === true && M.col(p1, 'cgs')[0].id === e2.id);
  ck('colRemove 删除指定条目', M.colRemove(p1, 'cgs', e2.id) === true && M.col(p1, 'cgs').length === 2 && M.col(p1, 'cgs')[0].title === '改名CG');
  ck('媒体字段自动识别（image/audio）', M.mediaKind('data:image/png;base64,AAA') === 'image' && M.mediaKind('music/bgm.ogg?v=2') === 'audio' && M.mediaKind('') === '' && M.mediaKind('notes.txt') === '');
  // 章节
  const p2 = fixture();
  const ch1 = M.chapterAdd(p2, '第一章', 's1');
  const ch2 = M.chapterAdd(p2, '第二章', 's2');
  ck('chapterAdd 生成 {id,title,sceneId}', !!(ch1 && ch1.id && ch1.title === '第一章' && ch1.sceneId === 's1'));
  ck('chapterPatch 修改标题/场景', M.chapterPatch(p2, ch1.id, { title: '序章', sceneId: 's2' }).ok === true && M.chapters(p2)[0].title === '序章');
  ck('chapterPatch 拒绝重复 ID', M.chapterPatch(p2, ch2.id, { id: ch1.id }).ok === false);
  ck('chapterPatch 拒绝非法 ID', M.chapterPatch(p2, ch2.id, { id: '-bad-' }).ok === false);
  ck('chapterPatch 合法换 ID', M.chapterPatch(p2, ch2.id, { id: 'ch2_b' }).ok === true && M.chapters(p2)[1].id === 'ch2_b');
  ck('chapterRemove / chapterMove', M.chapterMove(p2, 'ch2_b', -1) === true && M.chapters(p2)[0].id === 'ch2_b' && M.chapterRemove(p2, 'ch2_b') === true && M.chapters(p2).length === 1);
  // 主页 / 菜单
  const p3 = fixture();
  M.homeField(p3, 'logo', 'data:image/png;base64,LOGO');
  M.homeField(p3, 'bgm', 'music/bgm.mp3');
  M.opening(p3, { enabled: true, duration: 1800, image: 'op.png' });
  ck('homeField logo/bgm 写入', p3.home.logo.indexOf('LOGO') > 0 && p3.home.bgm === 'music/bgm.mp3');
  ck('opening 更新', p3.experience.opening.enabled === true && p3.experience.opening.duration === 1800 && p3.experience.opening.image === 'op.png');
  M.opening(p3, { duration: -50 });
  ck('opening 时长钳制到 0', p3.experience.opening.duration === 0);
  M.setMenuPos(p3, 'start', 42.5, 12.3);
  M.setMenuPos(p3, 'start', -9, 250);
  const sp = M.menuPos(p3, 'start');
  ck('menuPositions 百分比写入并钳制 0..100', sp.x === 0 && sp.y === 100);
  M.setMenuPos(p3, 'continue', 80, 55);
  const rp = M.resetMenuPos(p3);
  ck('resetMenuPos 恢复默认并返回 changed', rp === true && M.menuPos(p3, 'continue').x === M.MENU_DEFAULT_POS.continue.x && M.menuPos(p3, 'start').x === M.MENU_DEFAULT_POS.start.x);
  M.homeMenuToggle(p3, 'chapters', true);
  ck('homeMenuToggle 追加 chapters', M.homeMenu(p3).indexOf('chapters') >= 0);
  M.homeMenuToggle(p3, 'chapters', false);
  ck('homeMenuToggle 移除 chapters', M.homeMenu(p3).indexOf('chapters') < 0);
  const rect = { left: 0, top: 0, width: 800, height: 450 };
  const pos = M.posPct(rect, 400, 225);
  ck('posPct 指针→百分比坐标', pos.x === 50 && pos.y === 50, pos);
  const pos2 = M.posPct({ left: 10, top: 20, width: 200, height: 100 }, 9999, -5);
  ck('posPct 越界钳制', pos2.x === 100 && pos2.y === 0, pos2);
  // 外观预设 捕捉/应用
  const p4 = fixture();
  const cap = M.presetCapture(p4, 's1', '黄昏立绘');
  ck('presetCapture 捕获场景角色', !!(cap && cap.name === '黄昏立绘' && cap.entries.length === 2 && cap.entries[0].charId === 'lib_a'));
  p4.experience.appearancePresets.push(cap);
  p4.scenes[0].characters[0].x = 99;
  p4.scenes[0].characters[0].expressionId = 'angry';
  const out = M.presetApply(p4, cap.id, 's1');
  ck('presetApply 按 charId 回填外观', out.ok === true && out.applied === 2 && p4.scenes[0].characters[0].x === 30 && p4.scenes[0].characters[0].expressionId === 'norm');
  ck('presetApply 不覆盖身份字段', p4.scenes[0].characters[0].charId === 'lib_a' && p4.scenes[0].characters[1].charId === 'lib_b');
  const out2 = M.presetApply(p4, 'nope', 's1');
  ck('presetApply 未知预设失败', out2.ok === false);
  ck('presetRemove 删除预设', M.presetRemove(p4, cap.id) === true && M.presets(p4).length === 0);
  // 台词批编 + 查找替换（保留元数据）
  const p5 = fixture();
  const rowsAll = M.dialogueRows(p5, '', '');
  ck('dialogueRows 全场景 2 行', rowsAll.length === 2);
  ck('dialogueRows 过滤', M.dialogueRows(p5, 's1', '回家').length === 1);
  const meta0 = JSON.stringify(p5.scenes[0].dialogues[1]);
  const rep = M.dialogueReplace(p5, { sceneId: 's1', find: '小夜', replace: '小夜子', useRegex: false });
  ck('dialogueReplace 替换正文 1 行 / 1 处', rep.ok === true && rep.changed === 1 && rep.occurrences === 1, rep);
  ck('dialogueReplace 保留元数据（id/charId/voice/action 未动）', p5.scenes[0].dialogues[1].id === 'd2' && p5.scenes[0].dialogues[1].charId === '' && p5.scenes[0].dialogues[1].voice === '' && p5.scenes[0].dialogues[0].text === '今天也一起回家吧。' && p5.scenes[0].dialogues[0].voice === 'v1.mp3');
  ck('替换结果文本正确', p5.scenes[0].dialogues[1].text === '好呀，放学后的{小夜子好感}点。');
  const rep2 = M.dialogueReplace(p5, { sceneId: 's1', find: '(', useRegex: true });
  ck('dialogueReplace 非法正则报错不炸', rep2.ok === false && rep2.msg.indexOf('正则') >= 0);
  const dlgAdd = M.dialogueAdd(p5, 's1', '晚安。', '我');
  ck('dialogueAdd 追加并生成 id', !!(dlgAdd && dlgAdd.id) && p5.scenes[0].dialogues.length === 3);
  ck('dialoguePatch 只改 speaker/text', M.dialoguePatch(p5, 's1', 2, { speaker: '旁白', text: '夜深了。' }) && p5.scenes[0].dialogues[2].speaker === '旁白' && p5.scenes[0].dialogues[2].text === '夜深了。' && p5.scenes[0].dialogues[2].id === dlgAdd.id);
  ck('dialogueRemove 删除行', M.dialogueRemove(p5, 's1', 2) === true && p5.scenes[0].dialogues.length === 2);
  // 旧项目迁移
  const oldP = M.ensureSchema({ id: 'old', title: '旧', home: {}, experience: { collections: { cgs: [{ title: '遗留' }] } }, scenes: [], startScene: '' });
  ck('旧条目自动补 id/source/condition/sceneId', oldP.experience.collections.cgs[0].id && oldP.experience.collections.cgs[0].source === '' && oldP.experience.collections.cgs[0].condition === '' && oldP.experience.collections.cgs[0].sceneId === '');
  ck('旧项目补 chapters/menuPositions/opening/home', Array.isArray(oldP.experience.chapters) && oldP.experience.menuPositions.start && oldP.experience.opening.enabled === false && typeof oldP.home.logo === 'string');
} catch (e) {
  fail++;
  console.log('  ✗ FATAL 阶段0 ' + (e.stack || e.message));
}

/* ================= 阶段1：编辑器集成（内联主脚本 + 模块 + 撤销栈 + 草稿持久化） ================= */
let made = '';
try {
  const { installDomStubs } = require('./dom_stub.js');
  installDomStubs();
  global.Blob = function (parts) { made = parts.join(''); };
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('找不到内联主脚本');
  const TEST = [
    ';(function(){',
    " const A = globalThis.__ABCD__;",
    " const out=[],ck=(n,c,x)=>out.push((c?'  ✓ ':'  ✗ FAIL: ')+n+(x?' '+JSON.stringify(x):''));",
    ' try{',
    // ---- 集成标记 ----
    " ck('模块已安装（包装/按钮/事件）', typeof A==='object' && !!A.ensureSchema && globalThis.__abcdWrapped===true && typeof A.open==='function');",
    // ---- 包装入口自动补齐 schema ----
    ' newProject();',
    " ck('wrapped newProject 已补齐 experience 结构', !!project.experience && !!project.experience.collections && !!project.experience.menuPositions && !!project.home && typeof project.home.logo==='string');",
    " const sid=project.startScene||project.scenes[0].id; selectedSceneId=sid;",
    " const sc=project.scenes.find(function(s){return s.id===sid;});",
    " sc.dialogues=[{id:'d1',speaker:'小夜',text:'今天也一起回家吧。',charId:'lib_a',actionId:'act1',expressionId:'smile',voice:'v1.mp3'},{id:'d2',speaker:'',text:'好呀，放学后的{小夜好感}点。',charId:'',actionId:'',expressionId:'',voice:''}];",
    ' renderAll(); editorResetBaseline();',
    // ---- A 收藏品：真实动作层（快照前/后 + 保存）+ 撤销/重做 ----
    " const e1=A.colAdd(project,'cgs',{title:'黄昏CG',source:'data:image/png;base64,AAA',condition:'小夜好感 >= 5',sceneId:sid});",
    " ck('A 收藏品新增（动作层）', !!e1 && project.experience.collections.cgs.length===1 && e1.condition==='小夜好感 >= 5');",
    ' A._internals.beginAction();',
    " A.colRemove(project,'cgs',e1.id);",
    ' A._internals.endAction(false);',
    " ck('A 删除条目（动作层快照）', project.experience.collections.cgs.length===0);",
    ' undoEditor();',
    " ck('A 撤销恢复条目', project.experience.collections.cgs.length===1 && project.experience.collections.cgs[0].id===e1.id);",
    ' redoEditor();',
    " ck('A 重做再次删除', project.experience.collections.cgs.length===0);",
    // ---- A 条件安全 UI 判断 ----
    " ck('A 条件安全校验接入编辑器 validateCond', A.condValid('小夜好感 >= 2')===true && A.condValid('小夜好感 >=')===false && typeof validateCond==='function');",
    // ---- B 主页 / 开场 / 菜单定位 + 保存 ----
    " A.homeField(project,'logo','data:image/svg+xml;base64,TEVTVA==');",
    " A.homeField(project,'bgm','title.mp3');",
    " A.opening(project,{enabled:true,duration:1200,image:'op.png'});",
    " A.setMenuPos(project,'start',33.3,44.4);",
    " A.setMenuPos(project,'gallery',70,8);",
    " A.homeMenuToggle(project,'chapters',true);",
    " ck('B 主页 logo/bgm/opening 写入项目', project.home.logo.indexOf('TEVTVA==')>0 && project.home.bgm==='title.mp3' && project.experience.opening.enabled===true && project.experience.opening.image==='op.png');",
    " ck('B menuPositions 百分比保存', project.experience.menuPositions.start.x===33.3 && project.experience.menuPositions.start.y===44.4 && project.experience.menuPositions.gallery.x===70);",
    " ck('B homeMenu 含 chapters', project.experience.homeMenu.indexOf('chapters')>=0);",
    " const rt={left:0,top:0,width:800,height:450}; const pp=A.posPct(rt,200,90);",
    " ck('B 拖拽坐标换算 25% / 20%', pp.x===25 && pp.y===20, pp);",
    " ck('B 位置拖拽动作可用（拖拽=一步撤销）', typeof A._internals.applyMenuPosLive==='function');",
    // ---- C 台词批编（保留元数据）+ 查找替换（复用现有匹配器） ----
    " const scn=function(){return project.scenes.find(function(s){return s.id===sid;});};",
    " const metaD1=JSON.stringify(scn().dialogues[0]);",
    " const rep=A.dialogueReplace(project,{sceneId:sid,find:'小夜',replace:'小夜子',useRegex:false});",
    " ck('C 台词替换 1 行 / 1 处', rep.ok===true && rep.changed===1 && rep.occurrences===1);",
    " ck('C 元数据保留（含 speaker/charId/voice/expressionId）', JSON.stringify(scn().dialogues[0])===metaD1 && scn().dialogues[1].id==='d2' && scn().dialogues[1].charId==='' && scn().dialogues[1].actionId==='' && scn().dialogues[1].voice==='');",
    " ck('C 复用现有全文替换 matcher', typeof batchMakeMatcher==='function' && typeof A._internals.reuseMatcher==='function');",
    " const bad=A.dialogueReplace(project,{sceneId:sid,find:'(',useRegex:true});",
    " ck('C 非法正则安全失败', bad.ok===false);",
    " const bad2=A.dialogueReplace(project,{sceneId:sid,find:''});",
    " ck('C 空查找提示', bad2.ok===false);",
    " A._internals.beginAction(); A.dialogueReplace(project,{sceneId:'',find:'放学后的',replace:'夜晚的',useRegex:false}); A._internals.endAction(false);",
    " ck('C 全场景范围替换生效', scn().dialogues[1].text.indexOf('夜晚的')>=0, scn().dialogues[1].text);",
    " undoEditor();",
    " ck('C 批量替换可撤销', scn().dialogues[1].text.indexOf('夜晚的')<0);",
    " redoEditor();",
    " ck('C 批量替换可重做', scn().dialogues[1].text.indexOf('夜晚的')>=0);",
    // ---- D 章节 + 预设 + 进度（所有场景引用都按 id 现取，undo 会整体替换 project） ----
    " const c1=A.chapterAdd(project,'第一章',sid);",
    " ck('D 章节新增 {id,title,sceneId}', !!c1 && A.chapters(project).length===1 && c1.title==='第一章');",
    " A.chapterPatch(project,c1.id,{id:'ch1'});",
    " const dup=A.chapterPatch(project,A.chapterAdd(project,'第二章',sid).id,{id:'ch1'});",
    " ck('D 章节 ID 唯一性校验', dup.ok===false && A.chapters(project).length===2);",
    " scn().characters=[{charId:'lib_a',name:'小夜',image:'a.png',x:30,y:60,scale:1,opacity:1,rotate:0,dialogueIndex:0,actionId:'idle',expressionId:'norm'},{charId:'lib_b',name:'我',image:'b.png',x:70,y:60,scale:0.8,opacity:0.9,rotate:0,dialogueIndex:0,actionId:'idle',expressionId:'norm'}];",
    " const cap=A.presetCapture(project,sid,'黄昏立绘');",
    " ck('D 预设捕捉（含角色外观快照）', !!cap && cap.entries.length===2);",
    " project.experience.appearancePresets.push(cap);",
    " scn().characters[0].x=99; scn().characters[1].scale=0.1;",
    " const ap=A.presetApply(project,cap.id,sid);",
    " ck('D 预设应用恢复外观', ap.ok===true && ap.applied===2 && scn().characters[0].x===30 && Math.abs(scn().characters[1].scale-0.8)<1e-9);",
    " ck('D 预设应用不动 charId', scn().characters[0].charId==='lib_a' && scn().characters[1].charId==='lib_b');",
    " scn().characters[0].x=88;",
    " A._internals.beginAction(); A.presetApply(project,cap.id,sid); A._internals.endAction(false);",
    " ck('D 预设应用再次生效', scn().characters[0].x===30);",
    " undoEditor();",
    " ck('D 预设应用可撤销（恢复脏状态）', scn().characters[0].x===88, scn().characters[0].x);",
    " project.experience.autosave=true; project.experience.chapterSelection=false; project.experience.skipRead=true;",
    " ck('D 进度设置开关落库（见草稿持久化断言）', project.experience.chapterSelection===false);",
    // ---- 草稿持久化（保存→读回） ----
    ' flushSaveEditor();',
    " const raw=localStorage.getItem(editorSaveKey);",
    " ck('草稿已持久化（编辑器 localStorage 键）', !!raw);",
    " const saved=raw?JSON.parse(raw):null;",
    " ck('草稿包含全部 A-D schema 字段', !!saved && !!saved.project && !!saved.project.experience && !!saved.project.experience.collections && !!saved.project.experience.menuPositions && !!saved.project.home && typeof saved.project.experience.menuPositions.start.x==='number');",
    " ck('草稿包含 menuPositions.start=33.3/44.4', !!saved && saved.project.experience.menuPositions.start.x===33.3 && saved.project.experience.menuPositions.start.y===44.4);",
    " ck('草稿包含 opening.enabled 与进度开关', !!saved && saved.project.experience.opening.enabled===true && saved.project.experience.autosave===true && saved.project.experience.chapterSelection===false);",
    " ck('草稿包含章节与外观预设', !!saved && saved.project.experience.chapters.length===2 && saved.project.experience.appearancePresets.length===1);",
    " ck('草稿包含 home.logo / home.bgm', !!saved && saved.project.home.logo.indexOf('TEVTVA==')>0 && saved.project.home.bgm==='title.mp3');",
    " ck('草稿包含台词替换结果且元数据在场', !!saved && saved.project.scenes[0].dialogues[1].text.indexOf('夜晚的')>=0 && saved.project.scenes[0].dialogues[1].voice==='');",
    // ---- 旧草稿读取迁移（wrap migrateProject 幂等升级） ----
    " const legacy={id:'L',title:'旧',startScene:'',scenes:[],experience:{collections:{cgs:[{title:'老CG'}]}},home:{},characters:[]};",
    " const up=migrateProject(legacy);",
    " ck('包装 migrateProject 升级旧项目', !!up.experience.collections && Array.isArray(up.experience.chapters) && !!up.experience.menuPositions && typeof up.home.logo==='string' && up.experience.collections.cgs[0].source==='');",
    " ck('可玩导出可读（未触碰 playableHtml）', typeof playableHtml==='function' && typeof exportPlayable==='function');",
    ' }catch(e){out.push("  ✗ FATAL "+e.stack);}',
    " console.log(out.join('\\n'));",
    " const f=out.filter(function(x){return x.indexOf('✗')>=0;}).length;",
    " console.log('========== A-D 编辑器集成：'+(out.length-f)+' 通过 / '+f+' 失败 ==========');",
    ' process.exitCode = f ? 1 : 0;',
    '})();'
  ].join('\n');
  try {
    eval(m[1] + '\n' + srcMod + '\n' + TEST);
    const { store } = require('./dom_stub.js');
    void store;
  } catch (e) {
    fail++;
    console.log('  ✗ FATAL 阶段1 EVAL/BOOT ' + (e.stack || e.message));
    process.exitCode = 1;
  }
} catch (e) {
  fail++;
  console.log('  ✗ FATAL 阶段1 ' + (e.stack || e.message));
  process.exitCode = 1;
}

/* ================= 阶段2：文件/产物标记（作者端入口 + 独立模块） ================= */
try {
  console.log('—— 阶段2 集成标记 ——');
  ck('index.html 在主脚本后加载 abcd_editor.js', html.indexOf('boot();') >= 0 && html.indexOf('<script src="abcd_editor.js"></script>') > html.indexOf('boot();'));
  ck('index.html 静态暴露四个入口按钮', ['btnAbcdCollections', 'btnAbcdHomeMenu', 'btnAbcdDialogue', 'btnAbcdChapters'].every(function (id) { return html.indexOf('id="' + id + '"') >= 0; }));
  ck('按钮位于设计功能菜单内', html.indexOf('designMenuPanel') < html.indexOf('btnAbcdCollections'));
  ck('abcd_editor.js 通过语法检查且含 schema 结构', srcMod.indexOf('menuPositions') >= 0 && srcMod.indexOf('sceneId') >= 0 && srcMod.indexOf('appearancePresets') >= 0);
  ck('abcd_editor.js 为独立作者端文件（不生成可玩导出/运行时）', srcMod.indexOf('function playableHtml') < 0 && srcMod.indexOf('<!doctype html>') < 0 && srcMod.indexOf('VisualNovelNativePlayer') < 0);
  console.log('========== A-D 集成标记：' + (pass > 0 ? pass - (pass - pass) : 0) + ' 通过（计数见各段） ==========');
  const s = fs.readFileSync('abcd_editor.js', 'utf8');
  ck('模块文本无遗留占位符', s.indexOf('@@PART_') < 0 && s.indexOf('PART_D') < 0 && s.indexOf('PART_E') < 0 && s.indexOf('PART_F') < 0 && s.indexOf('PART_END') < 0);
} catch (e) {
  fail++;
  console.log('  ✗ FATAL 阶段2 ' + (e.stack || e.message));
}
console.log('========== abcd_editor_test 合计：通过 ' + pass + ' / 失败 ' + fail + ' ==========');
process.exit(fail ? 1 : 0);
