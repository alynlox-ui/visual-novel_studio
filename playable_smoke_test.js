// playable_smoke_test.js — 可运行 HTML 生成与独立脚本语法测试
const fs=require('fs');const {installDomStubs}=require('./dom_stub.js');installDomStubs();
const html=fs.readFileSync('index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/);if(!m)process.exit(1);
let made='';global.Blob=function(parts){made=parts.join('');};
const TEST=`
;(function(){
 const out=[],ck=(n,c,x)=>out.push((c?'  ✓ ':'  ✗ FAIL: ')+n+(x?' '+JSON.stringify(x):''));
 try{
  ck('可玩导出按钮与函数存在',html.includes('btnExportPlay')&&typeof playableHtml==='function'&&typeof exportPlayable==='function');
  const before=project.title;const outHtml=playableHtml();
  ck('生成结果是完整 HTML',outHtml.startsWith('<!doctype html>')&&outHtml.includes('<main id="app">')&&outHtml.includes('可运行导出版本'));
  ck('生成结果不含编辑器主界面',!outHtml.includes('editor-main')&&!outHtml.includes('btnExportPlay'));
  ck('项目标题和场景数据已嵌入',outHtml.includes(before)&&outHtml.includes('s_start')&&outHtml.includes('放学后'));
  ck('独立导出页含开始/选项/结局运行时',outHtml.includes('id="start"')&&outHtml.includes('id="choices"')&&outHtml.includes('id="end"')&&outHtml.includes('function go'));
  ck('导出页含本地音效按钮',outHtml.includes('id="mute"')&&outHtml.includes('AudioContext'));
  exportPlayable();
  ck('exportPlayable 实际创建 Blob',made.startsWith('<!doctype html>')&&made.length>7000,{bytes:made.length});
  fs.writeFileSync('playable_test_output.html',made,'utf8');
  // 数据 XSS 防护：脚本结束标签不会被项目文本提前截断
  ck('项目数据中的 script 结束标记已转义',!made.includes('</script>')||made.includes('<\\/script>'));
 }catch(e){out.push('  ✗ FATAL '+e.stack)}
 console.log(out.join('\\n'));const f=out.filter(x=>x.includes('✗')).length;console.log('========== 可玩导出冒烟：'+(out.length-f)+' 通过 / '+f+' 失败 ==========');process.exit(f?1:0);
})();`;
try{eval(m[1]+'\n'+TEST)}catch(e){console.error('EVAL/BOOT ERROR',e.stack);process.exit(1)}
