// help_ai_smoke_test.js — 帮助中心、AI预设与离线灵感冒烟测试
const fs=require('fs');const {installDomStubs}=require('./dom_stub.js');installDomStubs();const html=fs.readFileSync('index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/);if(!m)process.exit(1);
const TEST=`
;(function(){const o=[],ck=(n,c,x)=>o.push((c?'  ✓ ':'  ✗ FAIL: ')+n+(x?' '+JSON.stringify(x):''));try{
 ck('帮助中心已扩展为五个章节',html.includes('版本、撤销与数据安全')&&html.includes('批量、统计与体检')&&html.includes('快捷键与常见问题'));
 ck('帮助中心包含新条件与可玩导出',html.includes('chance(30)')&&html.includes('导出可玩HTML'));
 ck('四套服务商预设按钮存在',['openai','deepseek','qwen','zhipu'].every(x=>html.includes('data-ai-provider="'+x+'"')));
 ck('四套离线灵感按钮存在',['romance','mystery','branch','ending'].every(x=>html.includes('data-ai-inspire="'+x+'"')));
 ck('预设和灵感函数已加载',typeof aiApplyProvider==='function'&&typeof aiLocalInspire==='function');
 const oldQ=document.querySelector,els={};const mk=(v='')=>({value:v,type:'text',style:{},dataset:{},classList:{add(){},remove(){},contains(){return false}},focus(){this.focused=true},addEventListener(){},innerHTML:'',textContent:''});
 ['aiTextBaseUrl','aiImageBaseUrl','aiVideoBaseUrl','aiTextModel','aiImageModel','aiVideoModel','aiTextPrompt'].forEach(id=>els[id]=mk());
 ['aiTextKey','aiImageKey','aiVideoKey'].forEach(id=>els[id]=mk('KEEP-KEY'));
 document.querySelector=s=>els[s.replace('#','')]||mk();
 aiApplyProvider('deepseek');
 ck('DeepSeek 预设填写兼容地址和文本模型',els.aiTextBaseUrl.value==='https://api.deepseek.com/v1'&&els.aiTextModel.value==='deepseek-chat');
 ck('服务商预设不覆盖三个 Key',els.aiTextKey.value==='KEEP-KEY'&&els.aiImageKey.value==='KEEP-KEY'&&els.aiVideoKey.value==='KEEP-KEY');
 aiApplyProvider('qwen');ck('通义预设填写 DashScope 地址',els.aiTextBaseUrl.value.includes('dashscope.aliyuncs.com')&&els.aiTextModel.value==='qwen-plus');
 aiApplyProvider('zhipu');ck('智谱预设填写 GLM 模型',els.aiTextBaseUrl.value.includes('bigmodel.cn')&&els.aiTextModel.value==='glm-4-flash');
 aiLocalInspire('branch');ck('无 API 分支灵感可直接填入',els.aiTextPrompt.value.includes('30%随机隐藏路线')&&els.aiTextPrompt.focused===true);
 aiLocalInspire('ending');ck('无 API 多结局灵感可直接填入',els.aiTextPrompt.value.includes('真结局'));
 document.querySelector=oldQ;
 ck('openAiModal 只有一个定义且绑定配置事件',html.split('function openAiModal(){').length-1===1&&html.includes('function openAiModal(){fillAiSettings();bindAiConfigActions();'));
}catch(e){o.push('  ✗ FATAL '+e.stack)}console.log(o.join('\\n'));const f=o.filter(x=>x.includes('✗')).length;console.log('========== 帮助/AI冒烟：'+(o.length-f)+' 通过 / '+f+' 失败 ==========');process.exit(f?1:0)})();`;
try{eval(m[1]+'\n'+TEST)}catch(e){console.error('EVAL/BOOT ERROR',e.stack);process.exit(1)}
