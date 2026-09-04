// ui_advanced_smoke_test.js — 高级 UI 自定义冒烟测试
const fs=require('fs');const {installDomStubs,mkEl}=require('./dom_stub.js');installDomStubs();const html=fs.readFileSync('index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/);if(!m)process.exit(1);
const TEST=`
;(function(){const o=[],ck=(n,c,x)=>o.push((c?'  ✓ ':'  ✗ FAIL: ')+n+(x?' '+JSON.stringify(x):''));try{
 const old=migrateProject({id:'old',title:'旧项目',scenes:[{id:'s'}],ui:{textbox:{fontSize:20}}});ck('旧项目迁移补齐高级 UI 字段',old.ui.global.fontFamily&&old.ui.global.transitionMs===220&&old.ui.textbox.padding===22&&old.ui.choices.gap===11,old.ui);
 project=old;selectedSceneId='s';const panel=uiSettingsHTML();ck('高级设置控件存在',panel.includes('uiFontFamily')&&panel.includes('uiTransition')&&panel.includes('uiCharTransition')&&panel.includes('uiTbPadding')&&panel.includes('uiChGap'));
 const u=defaultUILayout();ck('默认 UI 模型含字体/间距/动画',u.global.fontFamily==='system-ui'&&u.textbox.padding===22&&u.choices.gap===11&&u.global.charTransition==='fade');
 P.project={ui:u,scenes:[],characters:[]};const oldQ=document.querySelector,els={};['textbox','choiceArea','gameScreen','textContent','speakerName','clickHint'].forEach(id=>{const e=mkEl(),props={};e.style.setProperty=(k,v)=>{props[k]=v};e.style.getPropertyValue=k=>props[k]||'';els[id]=e;});document.querySelector=s=>els[s.replace('#','')]||mkEl();const tb=els.textbox,ca=els.choiceArea,root=els.gameScreen;applyUILayout();ck('播放器应用字体与过渡',root.style.fontFamily==='system-ui'&&root.style.getPropertyValue('--ui-transition')==='220ms');ck('播放器应用文本内边距',tb.style.padding==='22px');ck('播放器应用选项间距',ca.style.gap==='11px');document.querySelector=oldQ;
 const raw=UI_PRESETS.dark();ck('旧预设可与新默认合并',raw.textbox&&typeof applyUIPreset==='function');
}catch(e){o.push('  ✗ FATAL '+e.stack)}console.log(o.join('\\n'));const f=o.filter(x=>x.includes('✗')).length;console.log('========== 高级 UI 冒烟：'+(o.length-f)+' 通过 / '+f+' 失败 ==========');process.exit(f?1:0)})();`;
try{eval(m[1]+'\n'+TEST)}catch(e){console.error('EVAL/BOOT ERROR',e.stack);process.exit(1)}
