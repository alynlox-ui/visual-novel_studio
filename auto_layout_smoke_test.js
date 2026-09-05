// auto_layout_smoke_test.js — 自动布局层级与竖列回归
const fs=require('fs');const {installDomStubs}=require('./dom_stub.js');installDomStubs();const html=fs.readFileSync('index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/);if(!m)process.exit(1);
const TEST=`
;(function(){const out=[],ck=(n,c,x)=>out.push((c?'  ✓ ':'  ✗ FAIL: ')+n+(x?' '+JSON.stringify(x):''));try{
 const oldRender=renderFlow,oldSave=saveEditor;renderFlow=()=>{};saveEditor=()=>{};
 project=migrateProject({id:'layout',title:'层级测试',startScene:'s',flags:{},characters:[],scenes:[
  {id:'s',name:'起点',next:'a',autoBranches:[],choices:[{text:'直达汇合',target:'c'}]},
  {id:'a',name:'第一层A',next:'c',autoBranches:[],choices:[{text:'同层分支',target:'b'}]},
  {id:'b',name:'第二层B',next:'d',autoBranches:[],choices:[]},
  {id:'c',name:'第二层汇合',next:'d',autoBranches:[],choices:[]},
  {id:'d',name:'第三层结局',next:'',autoBranches:[],choices:[],ending:{kind:'good',title:'END'}}
 ]});selectedSceneId='s';autoLayout();const p=id=>project.scenes.find(x=>x.id===id);
 ck('起点位于第一竖列',p('s').x===60,p('s'));
 ck('同一层级节点严格位于同一竖列',p('b').x===p('c').x,{b:p('b').x,c:p('c').x});
 ck('汇合节点采用最深依赖层级而非首次访问层级',p('c').x===660,{x:p('c').x});
 ck('后续结局位于下一竖列',p('d').x===960,{x:p('d').x});
 ck('同列节点纵向错开',p('b').y!==p('c').y,{b:p('b').y,c:p('c').y});
 project=migrateProject({id:'cycle',title:'循环测试',startScene:'r',flags:{},characters:[],scenes:[
  {id:'r',name:'入口',next:'x',choices:[],autoBranches:[]},{id:'x',name:'循环A',next:'y',choices:[],autoBranches:[]},{id:'y',name:'循环B',next:'x',choices:[{text:'结束',target:'z'},{text:'重复',target:'z'}],autoBranches:[]},{id:'z',name:'出口',next:'',choices:[],autoBranches:[]},{id:'orphan',name:'孤立',next:'',choices:[],autoBranches:[]}
 ]});const levels=autoLayoutLevels();ck('循环节点归入同一稳定层级',levels.x===levels.y,{x:levels.x,y:levels.y});ck('循环出口位于下一层',levels.z===levels.x+1,{cycle:levels.x,z:levels.z});ck('孤立节点固定放在首列',levels.orphan===0,{orphan:levels.orphan});
 renderFlow=oldRender;saveEditor=oldSave;
}catch(e){out.push('  ✗ FATAL '+e.stack)}console.log(out.join('\\n'));const f=out.filter(x=>x.includes('✗')).length;console.log('========== 自动布局冒烟：'+(out.length-f)+' 通过 / '+f+' 失败 ==========');process.exit(f?1:0)})();`;
try{eval(m[1]+'\n'+TEST)}catch(e){console.error('EVAL/BOOT ERROR',e.stack);process.exit(1)}
