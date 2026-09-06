// experience_features_smoke_test.js — 试玩体验特性：设置/音量/文字速度/记录/隐藏界面/快捷键（编辑器预览 + 独立 HTML 导出）
const fs = require('fs');
const { installDomStubs } = require('./dom_stub.js');
installDomStubs();
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) process.exit(1);
let made = '';
global.Blob = function (parts) { made = parts.join(''); };
const TEST = `
;(function(){
 const out=[],ck=(n,c,x)=>out.push((c?'  ✓ ':'  ✗ FAIL: ')+n+(x?' '+JSON.stringify(x):''));
 try{
  // ---------- 编辑器内试玩（预览） ----------
  ck('预览体验函数存在', typeof loadPreviewSettings==='function'&&typeof savePreviewSettings==='function'&&typeof applySavedPreviewSettings==='function'&&typeof setPreviewUIHidden==='function'&&typeof openPreviewSettings==='function'&&typeof applyPreviewVolume==='function');
  savePreviewSettings({volume:0.4,speed:15});
  const ps=loadPreviewSettings();
  ck('预览设置按项目持久化', ps.volume===0.4&&ps.speed===15, ps);
  previewVolume=1;P.speed=60;
  applySavedPreviewSettings();
  ck('已保存的音量与速度会应用', Math.abs(previewVolume-0.4)<1e-9&&P.speed===15, {volume:previewVolume,speed:P.speed});
  savePreviewSettings({volume:1,speed:30});
  const fakeBgm=document.createElement('audio');fakeBgm.dataset.baseVol='0.6';fakeBgm.dataset.src='b.mp3';fakeBgm.volume=0.6;
  const fakeVoice=document.createElement('audio');fakeVoice.dataset.src='v.mp3';fakeVoice.volume=1;
  const origQs=document.querySelector;
  document.querySelector=s=>{ if(s==='#bgmAudio')return fakeBgm; if(s==='#voiceAudio')return fakeVoice; return document.createElement('div'); };
  previewVolume=0.5;applyPreviewVolume();document.querySelector=origQs;
  ck('BGM 音量 = 场景音量 x 主音量', Math.abs(fakeBgm.volume-0.3)<1e-9, fakeBgm.volume);
  ck('语音音量 = 主音量', Math.abs(fakeVoice.volume-0.5)<1e-9, fakeVoice.volume);
  previewVolume=1;
  setPreviewUIHidden(true);
  ck('预览隐藏界面开启', previewUIHidden===true);
  setPreviewUIHidden(false);
  ck('预览隐藏界面可逆', previewUIHidden===false);
  ck('预览快捷键含隐藏/设置/记录/数字选支并忽略可编辑字段', html.includes("e.target.tagName==='INPUT'")&&html.includes("e.target.tagName==='SELECT'")&&html.includes("setPreviewUIHidden(true)")&&html.includes("openPreviewSettings();")&&html.includes("#choiceArea .choice-btn"));
  ck('预览播放器含设置与隐藏按钮', html.includes('btnPreviewSettings')&&html.includes('btnPreviewHideUI')&&html.includes('bindPreviewExperienceControls'));
  ck('预览速度选择持久化', html.includes("savePreviewSettings({speed:P.speed})"));
  ck('预览 BGM/语音/音效接入主音量', html.includes('*previewVolume')&&html.includes('a.dataset.baseVol'));
  // ---------- 独立 HTML 导出 ----------
  const outHtml=playableHtml();
  ck('导出含设置/记录/隐藏界面按钮', outHtml.includes("button('settings','设置',settingsPanel)")&&outHtml.includes("button('backlog','记录',backlogPanel)")&&outHtml.includes("button('hideUI','隐藏界面',()=>hideUI(true))"));
  ck('导出按钮聚焦后快捷键仍生效且可关闭弹层', outHtml.includes("if(panel){if(e.key==='Escape'){e.preventDefault();closePanel();}return;}")&&outHtml.includes("const t=e.target;if(t&&(t.tagName==='INPUT'")&&outHtml.includes("(e.key===' '||e.key==='Enter')&&t&&t.tagName==='BUTTON')return;"));
  ck('导出含设置面板与记录控件', outHtml.includes('gameVolume')&&outHtml.includes('gameTextSpeed')&&outHtml.includes('gameBacklog'));
  ck('导出含项目级设置存储键', outHtml.includes('vns_settings_'));
  ck('导出音量应用到媒体与音效', outHtml.includes('m.volume=settings.volume')&&outHtml.includes('volume:v=>{masterVolume=v;}')&&outHtml.includes('g.gain.value=.06*masterVolume'));
  ck('导出文字速度参与逐字与自动节奏', outHtml.includes('settings.textSpeed===0')&&outHtml.includes('Math.floor(elapsed/settings.textSpeed)'));
  ck('导出记录随进度记录且随存档保存', outHtml.includes('backlog.push(')&&outHtml.includes('backlog:backlog.slice()'));
  ck('导出隐藏界面可逆且点击恢复', outHtml.includes('function hideUI(value)')&&outHtml.includes("['#top','.panel','#choices']"));
  ck('导出快捷键忽略输入框与模态弹层', outHtml.includes('t.isContentEditable')&&outHtml.includes('[role="dialog"]'));
  ck('导出快捷键覆盖 隐藏/记录/设置/保存/数字选支', outHtml.includes("k==='h'")&&outHtml.includes("k==='b'")&&outHtml.includes("k==='o'")&&outHtml.includes("k==='s'")&&outHtml.includes('/^[1-9]$/.test(k)'));
  ck('导出含设置入口（顶栏+标题页）', outHtml.includes("button('settings','设置',settingsPanel)")&&outHtml.includes('titleSettings'));
  ck('导出项目数据完整', outHtml.includes(project.title)&&outHtml.includes('s_start'));
  exportPlayable();
  ck('可玩 HTML 实际生成文件', made.startsWith('<!doctype html>')&&made.length>8000&&made.includes('vns_settings_')&&made.includes('gameVolume'), {bytes:made.length});
  fs.writeFileSync('playable_experience_output.html',made,'utf8');
 }catch(e){out.push('  ✗ FATAL '+e.stack)}
 console.log(out.join('\\n'));const f=out.filter(x=>x.includes('✗')).length;console.log('========== 试玩体验特性冒烟：'+(out.length-f)+' 通过 / '+f+' 失败 ==========');process.exit(f?1:0);
})();`;
try { eval(m[1] + '\n' + TEST); } catch (e) { console.error('EVAL/BOOT ERROR', e.stack); process.exit(1); }
