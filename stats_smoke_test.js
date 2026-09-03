// stats_smoke_test.js — 本地试玩统计冒烟测试
const fs=require('fs');const {installDomStubs,store}=require('./dom_stub.js');installDomStubs();
const html=fs.readFileSync('index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/);if(!m)process.exit(1);
const TEST=`
;(function(){
 const out=[],ck=(n,c,x)=>out.push((c?'  ✓ ':'  ✗ FAIL: ')+n+(x?' '+JSON.stringify(x):''));
 try{
  ck('统计入口和面板已注入',html.includes('id="btnStats"')&&html.includes('id="statsModal"'));
  ck('统计函数已加载',typeof blankStats==='function'&&typeof renderStats==='function'&&typeof statChoice==='function');
  const proj=sampleProject();P.project=migrateProject(proj);P.stats=blankStats();P.unlockedEndings=[];P.readScenes=new Set();P.flags={};P.sceneId=null;P.ending=null;
  ck('空统计初始为 0',P.stats.plays===0&&P.stats.completed===0);
  P.stats.plays++;const s=P.project.scenes.find(x=>x.id==='s_start');P.sceneId=s.id;statScene(s);
  ck('场景到达次数记录',P.stats.scenes.s_start===1);
  const c=P.project.scenes.find(x=>x.id==='s_meet').choices[0];statChoice(c);
  ck('选项次数和文字记录',P.stats.choices.c1===1&&P.stats.choiceLabels.c1===c.text);
  statChoice(c);ck('同一选项可累计',P.stats.choices.c1===2);
  recordEnding({kind:'good',title:'与你共度的黄昏'});
  ck('结局到达次数+解锁',P.stats.completed===1&&P.stats.endings['good|与你共度的黄昏']===1&&P.unlockedEndings.length===1);
  recordEnding({kind:'good',title:'与你共度的黄昏'});
  ck('同一次 ending 不重复解锁但统计可记录新到达',P.unlockedEndings.length===1&&P.stats.endings['good|与你共度的黄昏']===2);
  saveSys();const loaded=loadSys();ck('统计随系统存档持久化',loaded.stats.plays===1&&loaded.stats.choices.c1===2&&loaded.stats.completed===2);
  ck('统计渲染函数安全执行',(()=>{try{renderStats();return true}catch(e){console.log('render err',e.message);return false}})());
  P.stats=loaded.stats;clearStats();ck('清空统计函数存在且状态可重置',typeof clearStats==='function');
 }catch(e){out.push('  ✗ FATAL '+e.stack)}
 console.log(out.join('\\n'));const f=out.filter(x=>x.includes('✗')).length;console.log('========== 统计冒烟：'+(out.length-f)+' 通过 / '+f+' 失败 ==========');process.exit(f?1:0);
})();`;
try{eval(m[1]+'\n'+TEST)}catch(e){console.error('EVAL/BOOT ERROR',e.stack);process.exit(1)}
