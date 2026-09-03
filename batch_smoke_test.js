// batch_smoke_test.js — 批量替换 / 数值批调冒烟测试
const fs = require('fs');
const { installDomStubs } = require('./dom_stub.js');
installDomStubs();
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) process.exit(1);
const TEST = `
;(function(){
  const out=[]; const check=(n,c,x)=>out.push((c?'  ✓ ':'  ✗ FAIL: ')+n+(x?' '+JSON.stringify(x):''));
  try {
    check('批量入口和模态存在', html.includes('id="btnBatch"')&&html.includes('id="batchModal"'));
    check('批量函数已加载', typeof batchTextWalker==='function'&&typeof batchApplyText==='function'&&typeof batchApplyFlag==='function');
    const p0=JSON.stringify(project);
    project.flags['小夜好感']=2;
    project.scenes[0].text='旧名字出现一次';
    project.scenes[1].speaker='旧名字';
    project.scenes[1].choices[0].text='也有旧名字';
    const count=batchCountText('旧名字',false,false);
    check('预览能统计中文匹配',count.count===3&&count.fields===3,count);
    const originalFind=document.querySelector;
    const els={};
    const mk=(v='')=>({value:v,checked:false,style:{setProperty(){}},classList:{add(){},remove(){},contains(){return false},toggle(){}},textContent:'',innerHTML:'',disabled:false,children:[],appendChild(c){this.children.push(c);return c;},querySelector(){return null},querySelectorAll(){return []},addEventListener(){},getBoundingClientRect(){return {left:0,top:0,width:100,height:100,right:100,bottom:100}}});
    els.batchFind=mk('旧名字');els.batchReplace=mk('新名字');els.batchCase=mk();els.batchRegex=mk();els.batchFindResult=mk();els.batchPreview=mk();
    global.document.querySelector=(s)=>{const id=s.replace('#','');return els[id]||mk();};
    batchApplyText();
    check('全文替换修改 3 个字段',project.scenes[0].text==='新名字出现一次'&&project.scenes[1].speaker==='新名字'&&project.scenes[1].choices[0].text==='也有新名字');
    undoEditor();
    check('全文替换可用撤销恢复',project.scenes[0].text==='旧名字出现一次'&&project.scenes[1].speaker==='旧名字');
    // 数值批调直接配置输入桩
    els.batchFlag=mk('小夜好感');els.batchFlagOp=mk('add');els.batchFlagVal=mk('3');els.batchIncludeInit=mk();els.batchIncludeInit.checked=true;els.batchFlagResult=mk();
    const before=project.flags['小夜好感'];
    batchApplyFlag();
    check('数值批调同时修改初始值',project.flags['小夜好感']===before+3, {before,after:project.flags['小夜好感']});
    check('数值批调修改场景设置',project.scenes.some(s=>(s.setFlags||[]).some(r=>r.flag==='小夜好感'&&r.value===4)));
    undoEditor();
    check('数值批调可用撤销恢复',project.flags['小夜好感']===before);
    document.querySelector=originalFind;
    check('正则非法输入不会抛错',(()=>{try{batchMakeMatcher('[',false,true);return false;}catch(e){return true;}})());
    project=JSON.parse(p0);
  } catch(e){out.push('  ✗ FATAL '+e.stack);}
  console.log(out.join('\\n'));const f=out.filter(x=>x.includes('✗')).length;console.log('========== 批量操作冒烟：'+(out.length-f)+' 通过 / '+f+' 失败 ==========');process.exit(f?1:0);
})();
`;
try { eval(m[1]+'\n'+TEST); } catch(e) { console.error('EVAL/BOOT ERROR:',e.stack);process.exit(1); }
