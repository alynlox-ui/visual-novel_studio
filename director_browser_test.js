/* Real editor + actual exported artifact acceptance. Run: node director_browser_test.js */
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=__dirname;
const svg=color=>'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="140"><rect width="80" height="140" fill="${color}"/></svg>`).toString('base64');
const images={base:svg('gray'),expression:svg('red'),closed:svg('blue'),open:svg('green'),half:svg('yellow'),eyes:svg('black')};
const fixture={id:'director-browser-fixture',title:'Director acceptance',startScene:'a',flags:{visits:0,n:99,answer:0},characters:[{id:'lib',name:'Actor',baseImage:images.base,expressions:[{id:'red',name:'Red',image:images.expression}],actions:[]},{id:'talk',name:'Talk',baseImage:images.base,portrait:{mouthClosed:images.closed,mouthOpen:images.open,mouthHalf:images.half,eyesClosed:images.eyes,blinkInterval:1000}}],director:{version:1,templates:[{id:'theme',name:'Theme',version:1,ui:{textbox:{fontColor:'#12ab34',lineHeight:2.3}}}]},experience:{homeMenu:['start','continue','load','chapters','settings'],autosave:true,skipRead:false,chapterSelection:true,chapters:[{id:'subchapter',title:'Sub',sceneId:'sub'}]},scenes:[{id:'a',name:'A',bg:'#123456',characters:[{id:'actor',charId:'lib',name:'Actor',x:10,y:85,scale:1,opacity:1},{id:'talker',charId:'talk',name:'Talk',x:80,y:85,scale:1,opacity:1}],setFlags:[{flag:'visits',op:'+',value:1}],dialogues:[{speaker:'Talk',charId:'talker',text:'abcdefghijklmnopqrstuvwxyz'.repeat(4),cues:[{at:12,type:'expression',target:'actor',expressionId:'red'},{at:12,type:'theme',themeId:'theme'},{at:12,type:'move',target:'actor',x:70,y:65,duration:4000,keep:true}]},{speaker:'Talk',charId:'talker',text:'next line'}],flow:{mode:'call',target:'sub',returnTo:'after',args:{n:7},result:'answer'}},{id:'sub',name:'Sub',bg:'#ffffff',characters:[],inheritStage:{background:true,characters:true,bgm:true},setFlags:[{flag:'visits',op:'+',value:1}],dialogues:[{speaker:'Talk',charId:'talker',text:'local {n}'}],flow:{mode:'return',value:'{n}'}},{id:'after',name:'After',bg:'#345678',characters:[],dialogues:[{speaker:'',text:'answer {answer} global {n} visits {visits}'}],choices:[{text:'Hidden',cond:'false',target:'end'},{text:'Locked',enableCond:'false',disabledReason:'Need key',target:'end'},{text:'Eligible',enableCond:'answer == 7 && hourNow() >= 0',target:'end'}]},{id:'end',name:'End',characters:[],dialogues:[{text:'finished'}],ending:{kind:'good',title:'Done'}}]};
let passes=0;
function check(name,value){assert.ok(value,name);passes++;console.log('PASS '+name);}
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vns-director-'));
 let html='';
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/game.html'){res.setHeader('Content-Type','text/html');return res.end(html);}const f=path.join(root,pathname==='/'?'index.html':decodeURIComponent(pathname));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.statusCode=404;return res.end();}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(f));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
 browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--disable-background-timer-throttling']});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>typeof VNSPreviewDirector!=='undefined');
 await page.evaluate(f=>{project=migrateProject(f);},fixture);
 html=await page.evaluate(()=>playableHtml());fs.writeFileSync(path.join(temp,'director-export.html'),html);
 for(const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new(require('vm').Script)(m[1]);
 check('generated actual self-contained HTML parses',html.includes('function createDirector(project)')&&!html.includes('function(){return null;}'));
 check('missing dependency fails explicitly',await page.evaluate(()=>{const saved=createDirector;try{createDirector=undefined;try{playableHtml();return false;}catch(e){return /director_runtime/.test(e.message);}}finally{createDirector=saved;}}));
 await page.evaluate(()=>{P.project=deepClone(project);document.querySelector('#playerApp').classList.remove('hidden');startNewGame();});
 const game=await context.newPage();await game.goto(url+'/game.html');await game.locator('#start').click();
 for(const [name,p,standalone] of [['export',game,true],['preview',page,false]]){
 const text=standalone?'#text':'#textContent',cast=standalone?'#cast img':'#characterLayer .char-sprite',img=standalone?'#cast img':'#characterLayer .char-sprite .char-layer img';
 // Restart synchronously so no wall-clock time elapses between launch and threshold assertion.
 await p.evaluate(s=>{if(s)document.querySelector('#again').onclick();else {P.rate=1;startNewGame();}},standalone);
 check(name+' before threshold retains base image',await p.locator(img).first().getAttribute('src')===images.base);
 await p.waitForFunction(({img,red})=>document.querySelector(img)?.getAttribute('src')===red,{img,red:images.expression});
 check(name+' threshold changes actual rendered expression',true);
 check(name+' theme changes actual text color',await p.locator(text).evaluate(e=>getComputedStyle(e).color)==='rgb(18, 171, 52)');
 const mouths=new Set();for(let i=0;i<5;i++){mouths.add(await p.locator(img).nth(1).getAttribute('src'));await p.waitForTimeout(70);}
 check(name+' simulated speaking portrait changes',mouths.size>1);
 await p.waitForFunction(({img,eyes})=>document.querySelectorAll(img)[1]?.getAttribute('src')===eyes,{img,eyes:images.eyes});check(name+' blink variant renders with precedence',true);
 const pause=async()=>p.evaluate(s=>{if(s)document.querySelector('#pause').click();else {P.paused=!P.paused;}},standalone);
 const x=()=>p.locator(cast).first().evaluate(e=>parseFloat(e.style.left));
 await pause();const frozen=await x();await p.waitForTimeout(230);check(name+' pause freezes rendered move',Math.abs(await x()-frozen)<0.1);await pause();
 let a=await x();await p.waitForTimeout(200);let normal=await x()-a;
 await p.evaluate(s=>{if(s)document.querySelector('#speed').click();else P.rate=2;},standalone);a=await x();await p.waitForTimeout(200);let fast=await x()-a;
 check(name+' 2x changes actual move distance',normal>0&&fast>normal*1.45&&fast<normal*2.8);
 await p.evaluate(s=>{if(s){document.querySelector('#again').onclick();document.querySelector('#text').click();document.querySelector('#pause').click();}else{startNewGame();finishTyping();P.paused=true;}},standalone);
 check(name+' instant reveal immediately applies final cues',await p.locator(img).first().getAttribute('src')===images.expression);
 check(name+' instant reveal applies theme',await p.locator(text).evaluate(e=>getComputedStyle(e).color)==='rgb(18, 171, 52)');
 // Real save slot keeps applied cues and in-flight movement across reload.
 if(standalone){await p.locator('#save').click();await p.locator('#slot1').click();await p.locator('#closeSlots').click();}
 else await p.evaluate(()=>saveToSlot(1));
 const snap=await p.evaluate(s=>s?JSON.parse(localStorage.getItem('vns_play_'+PROJECT.id+'_1')):loadSlotData(1),standalone);
 check(name+' save captures move clock and applied cues',snap.director.applied.length===3&&!!snap.director.moves.actor);
 if(standalone){await p.reload();await p.locator('#titleLoad').click();await p.locator('#slot1').click();await p.locator('#pause').click();}
 else await p.evaluate(()=>{enterScene('after');loadFromSlot(1);P.paused=true;});
 check(name+' restore paints saved expression',await p.locator(img).first().getAttribute('src')===images.expression);
 // Advance into subroutine, using the actual input route for export.
 await p.evaluate(s=>{if(s){document.querySelector('#pause').click();document.querySelector('#text').click();document.querySelector('#text').click();document.querySelector('#text').click();document.querySelector('#text').click();}else{P.paused=false;advance();finishTyping();advance();finishTyping();}},standalone);
 await p.waitForFunction(({text})=>document.querySelector(text).textContent.includes('local 7'),{text});
 check(name+' callee interpolation uses scoped local',true);
 check(name+' inherited cast remains visible',await p.locator(cast).count()===2);
 if(standalone){await p.locator('#save').click();await p.locator('#slot2').click();await p.locator('#closeSlots').click();}
 else await p.evaluate(()=>saveToSlot(2));
 const sub=await p.evaluate(s=>s?JSON.parse(localStorage.getItem('vns_play_'+PROJECT.id+'_2')):loadSlotData(2),standalone);
 check(name+' save preserves call stack and inherited stage',sub.director.stack.length===1&&sub.director.locals.n===7&&sub.director.stage.bg==='#123456'&&sub.flags.visits===2);
 if(standalone){await p.reload();await p.locator('#titleLoad').click();await p.locator('#slot2').click();await p.locator('#text').click();await p.locator('#text').click();await p.locator('#text').click();}
 else await p.evaluate(()=>{loadFromSlot(2);P.paused=false;advance();finishTyping();});
 await p.waitForFunction(({text})=>document.querySelector(text).textContent.includes('answer 7 global 99 visits 2'),{text});
 check(name+' saved call returns without replaying entry flags',true);
 check(name+' non-inherited stage resets cast',await p.locator(cast).count()===0);
 await p.evaluate(s=>{if(s)document.querySelector('#text').click();else finishTyping();},standalone);
 const choices=standalone?'#choices button':'#choiceArea button';await p.waitForSelector(choices);
 check(name+' visibility and eligibility are distinct',await p.locator(choices).count()===2&&await p.locator(choices).first().isDisabled());
 check(name+' disabled reason is exposed',(await p.locator(choices).first().getAttribute('title'))==='Need key');
 await p.evaluate(s=>{if(s){const old=Date.prototype.getHours;Date.prototype.getHours=()=>-1;try{document.querySelectorAll('#choices button')[1].onclick();}finally{Date.prototype.getHours=old;}}else{P.flags.answer=0;onChoice(P.currentChoices[1]);}},standalone);
 check(name+' enabled-looking stale choice rechecks on click',await p.locator(choices).count()===2&&await p.locator(text).textContent()==='answer 7 global 99 visits 2');
 }
 // Chapter navigation restores effective inherited stage + call frame, not authored empty cast.
 await game.locator('#back').click();await game.locator('#chapters').click();await game.locator('#chaptersList button').click();
 await game.locator('#text').click();
 check('export chapter restore retains subroutine text and inherited cast',(await game.locator('#text').textContent()).includes('local 7')&&await game.locator('#cast img').count()===2);
 await game.locator('#save').click();await game.locator('#slot4').click();await game.locator('#closeSlots').click();
 check('export chapter restore retains stack without double entry flags',await game.evaluate(()=>{const s=JSON.parse(localStorage.getItem('vns_play_'+PROJECT.id+'_4'));return s.flags.visits===2&&s.director.stack.length===1;}));
 // Save before threshold: loading must not reveal later cues or restart movement.
 for(const [name,p,s] of [['export',game,true],['preview',page,false]]){
 await p.evaluate(s=>{if(s){document.querySelector('#again').onclick();document.querySelector('#pause').click();document.querySelector('#save').click();document.querySelector('#slot3').click();}else{startNewGame();P.paused=true;saveToSlot(3);}},s);
 await p.evaluate(s=>{if(s){document.querySelector('#closeSlots').click();document.querySelector('#load').click();document.querySelector('#slot3').click();document.querySelector('#pause').click();}else loadFromSlot(3);},s);
 await p.waitForTimeout(120);
 check(name+' pre-threshold save does not fire future cues',await p.locator(s?'#cast img':'#characterLayer .char-sprite .char-layer img').first().getAttribute('src')===images.base);
 }
 // Preview back must restore caller locals BEFORE the call, not a mutated stack.
 await page.evaluate(()=>{startNewGame();P.paused=false;finishTyping();advance();finishTyping();advance();back();});
 check('preview back restores pre-call stack',await page.evaluate(()=>P.sceneId==='a'&&VNSPreviewDirector.get().state.stack.length===0));
 await page.evaluate(()=>{P.history.push({sceneId:'after',flags:{},backlog:[],readScenes:[],dialogueIndex:0});back();});
 check('legacy history fallback restores destination scene',await page.evaluate(()=>currentScene().id==='after'&&VNSPreviewDirector.get().state.sceneId==='after'));
 await page.evaluate(()=>{startNewGame();toggleSkip('all');});await page.waitForFunction(()=>P.sceneId==='after'&&P.currentChoices.length===2);
 check('preview skip traverses remaining lines and call/return',await page.evaluate(()=>P.flags.answer===7&&P.flags.visits===2));
 check('no browser page exceptions',errors.length===0);console.log(JSON.stringify({passes,pageErrors:errors,artifact:path.join(temp,'director-export.html')}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
