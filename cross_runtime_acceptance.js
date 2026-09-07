const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs=require('fs');
(async()=>{
 const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'18763'},stdio:'ignore'});
 let browser;
 try {
  for(let i=0;i<50;i++){try{if((await fetch('http://localhost:18763/healthz')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage();await page.goto('http://localhost:18763');
  const html=await page.evaluate(()=>{project=migrateProject({id:'accept-'+Date.now(),title:'Acceptance',startScene:'a',flags:{},characters:[],scenes:[{id:'a',name:'A',text:'First',next:'b'},{id:'b',name:'B',text:'Second',setFlags:[{flag:'visits',op:'+',value:1}],ending:{kind:'good',title:'Done'}}],experience:{autosave:true,chapterSelection:true,skipRead:true,homeMenu:['start','continue','gallery','chapters'],collections:{cgs:[{id:'cg',title:'Secret CG',sceneId:'b',condition:''}],music:[],endings:[],achievements:[]},chapters:[{id:'chapter-b',title:'Chapter B',sceneId:'b'}]}});return playableHtml();});
  fs.mkdirSync('test-artifacts',{recursive:true});fs.writeFileSync('test-artifacts/acceptance.play.html',html);
  await page.goto('http://localhost:18763/test-artifacts/acceptance.play.html');
  let checks=0;const check=(v,n)=>{if(!v)throw Error(n);console.log('PASS '+n);checks++;};
  await page.locator('#gallery').click();check(await page.locator('.galLock').count()===1,'HTML gallery scene gate locked');await page.locator('#closeSlots').click();
  await page.locator('#chapters').click();check(await page.locator('#chaptersList button').isDisabled(),'HTML unvisited chapter disabled');await page.locator('#closeSlots').click();
  await page.locator('#start').click();await page.waitForTimeout(250);
  const saves=()=>page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('vns_play_')).map(([k,v])=>[k,JSON.parse(v)]));
  check((await saves()).some(([k,v])=>k.endsWith('_0')&&v.sceneId==='a'),'HTML initial autosave');
  await page.locator('#save').click();await page.locator('#slot1').click();await page.locator('#closeSlots').click();
  await page.locator('#skip').click();await page.waitForTimeout(600);
  check(await page.locator('#end').evaluate(e=>e.classList.contains('hidden')) && (await saves()).some(([k,v])=>k.endsWith('_0')&&v.sceneId==='b'),'HTML read skip stops at unread scene before ending');
  await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Space');await page.waitForTimeout(250);
  if(await page.locator('#text').textContent()!=='Second'){await page.keyboard.press('Space');await page.waitForTimeout(250);}
  check(await page.locator('#text').textContent()==='Second','HTML advances to chapter B');
  const saved=await saves();check(saved.some(([k,v])=>k.endsWith('_0')&&v.sceneId==='b')&&saved.some(([k,v])=>k.endsWith('_1')&&v.sceneId==='a'),'HTML autosave does not overwrite manual slot');
  await page.reload();await page.locator('#gallery').click();check(await page.locator('.galLock').count()===0,'HTML gallery persists across reload');await page.locator('#closeSlots').click();
  await page.locator('#chapters').click();check(!await page.locator('#chaptersList button').isDisabled(),'HTML chapter persists across reload');await page.locator('#chaptersList button').click();await page.waitForTimeout(250);check(await page.locator('#text').textContent()==='Second','HTML chapter jump restores scene');
  check((await saves()).some(([k,v])=>k.endsWith('_0')&&v.sceneId==='b'&&v.di===0&&v.flags.visits===1),'HTML chapter jump autosaves without replaying flags');
  await page.reload();await page.locator('#continue').click();await page.waitForFunction(()=>document.querySelector('#text').textContent==='Second');check(await page.locator('#text').textContent()==='Second','HTML continue restores autosave after reload');
  console.log('Browser acceptance: '+checks+' passed');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
