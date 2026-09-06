'use strict';
const http=require('http');
const base={id:'srv',title:'Server Baseline',startScene:'a',flags:{},scenes:[{id:'a',name:'A',text:'Hello',next:'',setFlags:[],autoBranches:[],choices:[],dialogues:[],characters:[]}]};
const changed=JSON.parse(JSON.stringify(base));changed.title='Server Updated';changed.scenes[0].text='Updated';
function req(port,path,method,body){return new Promise((resolve,reject)=>{const data=body?JSON.stringify(body):null;const r=http.request({host:'127.0.0.1',port,path,method,headers:data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{let parsed;try{parsed=JSON.parse(Buffer.concat(chunks));}catch(e){parsed=Buffer.concat(chunks).toString();}resolve({status:res.statusCode,body:parsed});});});r.on('error',reject);if(data)r.write(data);r.end();});}
(async()=>{
  const port=18991;
  const empty=await req(port,'/api/collaboration','GET');
  const comment=await req(port,'/api/collaboration/comments','POST',{author:'Alice',text:'Check the branch',target:{sceneId:'a'}});
  const push=await req(port,'/api/collaboration','POST',{version:1,baseHash:empty.body.baseHash,project:changed,author:'Alice',message:'title update'});
  const history=await req(port,'/api/collaboration/history','GET');
  const conflict=await req(port,'/api/collaboration','POST',{version:1,baseHash:'stale-hash',project:base,author:'Bob',message:'old'});
  const resolve=await req(port,'/api/collaboration/resolve','POST',{id:comment.body.id});
  const releaseGood=await req(port,'/api/release-check','POST',{project:changed});
  const broken=JSON.parse(JSON.stringify(base));broken.startScene='nope';
  const releaseBad=await req(port,'/api/release-check','POST',{project:broken});
  const health=await req(port,'/healthz','GET');
  const checks=[];
  checks.push(['healthz 200',health.status===200]);
  checks.push(['empty GET bundle',empty.status===200&&empty.body.version===1]);
  checks.push(['comment 201',comment.status===201&&comment.body.author==='Alice']);
  checks.push(['push 200 new hash',push.status===200&&push.body.ok&&push.body.bundle.baseHash!==empty.body.baseHash]);
  checks.push(['history after push has 1 change + 1 comment',history.status===200&&history.body.changes.length===1&&history.body.comments.length===1]);
  checks.push(['stale push rejected 409',conflict.status===409&&!conflict.body.ok]);
  checks.push(['resolve comment 200',resolve.status===200&&resolve.body.ok===true]);
  checks.push(['release-check valid project ok',releaseGood.status===200&&releaseGood.body.ok===true&&releaseGood.body.platforms.web.ready===true&&releaseGood.body.platforms.windows.ready===true&&releaseGood.body.platforms.macos.ready===false&&releaseGood.body.platforms.linux.ready===false]);
  checks.push(['release-check invalid start scene flagged',releaseBad.status===200&&releaseBad.body.ok===false&&releaseBad.body.errors.some(e=>e.includes('Invalid start scene'))]);
  checks.push(['release-check reports certificates/accounts separately',typeof releaseGood.body.credentials.windows==='string'&&typeof releaseGood.body.credentials.macos==='string'&&typeof releaseGood.body.credentials.linux==='string'&&releaseGood.body.platforms.macos.blocker&&releaseGood.body.platforms.linux.blocker]);
  let failed=0;for(const [n,ok]of checks){console.log((ok?'PASS ':'FAIL ')+n);if(!ok)failed++;}
  console.log(failed===0?'HTTP COLLABORATION+RELEASE VERIFICATION PASSED (all 10)':'HTTP FAILURES: '+failed);process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
