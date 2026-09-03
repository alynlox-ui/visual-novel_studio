// i18n_smoke_test.js — 多语言管理与可玩导出冒烟测试
const fs=require('fs');const {installDomStubs}=require('./dom_stub.js');installDomStubs();const html=fs.readFileSync('index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/);if(!m)process.exit(1);
const TEST=`
;(function(){const o=[],ck=(n,c,x)=>o.push((c?'  ✓ ':'  ✗ FAIL: ')+n+(x?' '+JSON.stringify(x):''));try{
 ck('多语言入口和面板存在',html.includes('btnI18n')&&html.includes('i18nModal'));
 const old=migrateProject({id:'old',title:'旧项目',flags:{},scenes:[{id:'a',name:'开始',text:'你好'}]});ck('旧项目迁移自动补 locales',old.locales&&Object.keys(old.locales).length===0);
 ck('原文提取包含标题/场景/台词/选项',i18nSourceTexts().includes(project.title)&&i18nSourceTexts().includes('放学后')&&i18nSourceTexts().some(x=>x.includes('放学的铃声'))&&i18nSourceTexts().includes('和她一起走一段'));
 const d=i18nParse('开始游戏 = Start Game\\n小夜 = Sayo\\n无效行');ck('翻译表解析正确',d['开始游戏']==='Start Game'&&d['小夜']==='Sayo'&&Object.keys(d).length===2,d);
 ck('翻译表序列化可回读',i18nParse(i18nStringify(d))['小夜']==='Sayo');
 const oldQ=document.querySelector,els={};const mk=(v='')=>({value:v,textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){},contains(){return false}},addEventListener(){},focus(){}});['i18nCode','i18nName','i18nText','i18nStatus'].forEach(id=>els[id]=mk());els.i18nCode.value='en';els.i18nName.value='English';els.i18nText.value='小夜 = Sayo\\n和她一起走一段 = Walk with her';document.querySelector=s=>els[s.replace('#','')]||mk();
 i18nSave();ck('语言包保存到项目',project.locales.en.name==='English'&&project.locales.en.strings['小夜']==='Sayo');
 const outHtml=playableHtml();ck('可玩HTML嵌入语言包',outHtml.includes('English')&&outHtml.includes('Walk with her'));
 ck('可玩HTML含语言下拉与翻译函数',outHtml.includes('id="lang"')&&outHtml.includes('const tr=')&&outHtml.includes('b.textContent=tr(c.text)'));
 i18nDelete();ck('语言包可删除',!project.locales.en);document.querySelector=oldQ;
}catch(e){o.push('  ✗ FATAL '+e.stack)}console.log(o.join('\\n'));const f=o.filter(x=>x.includes('✗')).length;console.log('========== 多语言冒烟：'+(o.length-f)+' 通过 / '+f+' 失败 ==========');process.exit(f?1:0)})();`;
try{eval(m[1]+'\n'+TEST)}catch(e){console.error('EVAL/BOOT ERROR',e.stack);process.exit(1)}
