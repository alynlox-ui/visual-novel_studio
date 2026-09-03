// assets_smoke_test.js — 素材资产库冒烟测试
const fs=require('fs');const {installDomStubs}=require('./dom_stub.js');installDomStubs();const html=fs.readFileSync('index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/);if(!m)process.exit(1);
const TEST=`
;(function(){const o=[],ck=(n,c,x)=>o.push((c?'  ✓ ':'  ✗ FAIL: ')+n+(x?' '+JSON.stringify(x):''));try{
 ck('素材库入口和面板存在',html.includes('btnAssets')&&html.includes('assetsModal')&&html.includes('assetList'));
 const old=migrateProject({id:'old',title:'旧项目',flags:{},scenes:[{id:'a',name:'开始'}]});ck('旧项目迁移自动补 assets',Array.isArray(old.assets)&&old.assets.length===0);
 const built=builtinAssets();ck('内置 8 套素材',built.length===8,built.length);ck('内置素材均为独立 SVG data URL',built.every(a=>a.type==='bg'&&a.url.startsWith('data:image/svg+xml')&&a.builtin));
 ck('关键词覆盖教室/夜晚/樱花',built.some(a=>a.tags.includes('教室'))&&built.some(a=>a.tags.includes('夜晚'))&&built.some(a=>a.tags.includes('樱花')));
 ck('URL 安全校验拒绝 javascript',!assetAllowedUrl('javascript:alert(1)','bg')&&assetAllowedUrl('https://example.com/a.png','bg'));
 const oldQ=document.querySelector,oldConfirm=global.confirm,els={};const mk=(v='')=>({value:v,textContent:'',innerHTML:'',dataset:{},style:{},classList:{add(){},remove(){},contains(){return false}},addEventListener(){},focus(){}});['assetSearch','assetType','assetList','assetName','assetNewType','assetUrl'].forEach(id=>els[id]=mk());els.assetType.value='all';els.assetNewType.value='bg';document.querySelector=s=>els[s.replace('#','')]||mk();
 renderAssets();ck('素材列表可渲染内置预览',els.assetList.innerHTML.includes('放学后的教室')&&els.assetList.innerHTML.includes('应用到当前场景'));
 els.assetSearch.value='樱花';renderAssets();ck('搜索过滤只显示匹配素材',els.assetList.innerHTML.includes('樱花坡道')&&!els.assetList.innerHTML.includes('学校天台'));els.assetSearch.value='';
 els.assetName.value='自定义背景';els.assetUrl.value='https://example.com/custom.png';ck('自定义素材收藏成功',addProjectAsset()===true&&project.assets.some(a=>a.name==='自定义背景'));
 const custom=project.assets.find(a=>a.name==='自定义背景');ck('收藏随项目模型持久化',custom.type==='bg'&&custom.url.includes('custom.png'));
 const sc=selectedScene();const prevBg=sc.bgImage;const oldRI=renderInspector,oldRF=renderFlow,oldRA=renderAll;renderInspector=()=>{};renderFlow=()=>{};renderAll=()=>{};ck('内置背景一键应用成功',applyAsset('bg-classroom')===true&&sc.bgImage.startsWith('data:image/svg+xml'));undoEditor();ck('应用背景可撤销',selectedScene().bgImage===prevBg);
 project.assets.push({id:'aud-test',name:'测试BGM',type:'audio',url:'https://example.com/a.mp3'});commitUndoSnapshot();ck('BGM 一键应用成功',applyAsset('aud-test')===true&&selectedScene().bgm.includes('a.mp3'));renderInspector=oldRI;renderFlow=oldRF;renderAll=oldRA;
 global.confirm=()=>true;ck('自定义素材可删除',removeAsset(custom.id)===true&&!project.assets.some(a=>a.id===custom.id));
 document.querySelector=oldQ;global.confirm=oldConfirm;
}catch(e){o.push('  ✗ FATAL '+e.stack)}console.log(o.join('\\n'));const f=o.filter(x=>x.includes('✗')).length;console.log('========== 素材库冒烟：'+(o.length-f)+' 通过 / '+f+' 失败 ==========');process.exit(f?1:0)})();`;
try{eval(m[1]+'\n'+TEST)}catch(e){console.error('EVAL/BOOT ERROR',e.stack);process.exit(1)}
