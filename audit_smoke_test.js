// audit_smoke_test.js — 项目体检扫描器冒烟测试
const fs=require('fs');const {installDomStubs}=require('./dom_stub.js');installDomStubs();const html=fs.readFileSync('index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/);if(!m)process.exit(1);
const TEST=`
;(function(){const o=[],ck=(n,c,x)=>o.push((c?'  ✓ ':'  ✗ FAIL: ')+n+(x?' '+JSON.stringify(x):''));try{
 ck('体检入口和面板已注入',html.includes('btnAudit')&&html.includes('auditModal'));
 ck('体检函数已加载',typeof auditProject==='function'&&typeof renderAudit==='function');
 let r=auditProject();ck('示例项目可完成扫描',r&&r.metrics.scenes>0&&Array.isArray(r.issues),r.metrics);
 ck('示例起点可达',r.metrics.reachable>0&&r.metrics.isolated===0,r.metrics);
 const save=project;project={id:'t',title:'T',startScene:'a',flags:{},scenes:[{id:'a',name:'起点',next:'missing',autoBranches:[],choices:[],text:''},{id:'orphan',name:'孤立',next:'',autoBranches:[],choices:[],text:''},{id:'bad',name:'坏条件',next:'',autoBranches:[{target:'orphan',cond:'bad('}],choices:[],text:''}]};
 r=auditProject();ck('扫描断链',r.issues.some(x=>x.msg.includes('不存在')));ck('扫描孤立场景',r.issues.some(x=>x.msg.includes('孤立场景')));ck('扫描非法条件',r.issues.some(x=>x.msg.includes('条件表达式无法解析')));ck('指标统计正确',r.metrics.scenes===3&&r.metrics.isolated===2,r.metrics);
 project=save;
}catch(e){o.push('  ✗ FATAL '+e.stack)}console.log(o.join('\\n'));const f=o.filter(x=>x.includes('✗')).length;console.log('========== 体检冒烟：'+(o.length-f)+' 通过 / '+f+' 失败 ==========');process.exit(f?1:0)})();`;
try{eval(m[1]+'\n'+TEST)}catch(e){console.error(e.stack);process.exit(1)}
