'use strict';
// Verify committed runtime files and the native template served by an origin.
const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const crypto=require('crypto');
const {execFileSync}=require('child_process');
const origin=(process.argv[2]||'https://visual-novel-studio.onrender.com').replace(/\/$/,'');
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:__dirname,encoding:'utf8'}).trim();
const files=['index.html','director_runtime.js','director_preview.js','director_editor.js','abcd_editor.js','debug_workbench.js','workbench_ui.js'];
const normalize=b=>Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function request(url,options={}) {
  // curl uses the host's working network route on Windows where Node fetch may fail.
  const args=['--fail','--silent','--show-error','--location','--max-time','45',url];
  if(options.method)args.push('-X',options.method);
  for(const [key,value] of Object.entries(options.headers||{}))args.push('-H',key+': '+value);
  if(options.body)args.push('--data-binary','@-');
  return execFileSync('curl',args,{input:options.body||undefined,maxBuffer:16*1024*1024,timeout:50000});
}
(async()=>{
  const results=await Promise.all(files.map(async file=>{
    const expected=normalize(execFileSync('git',['show','HEAD:'+file],{cwd:__dirname,maxBuffer:8*1024*1024}));
    const actual=normalize(await request(origin+'/'+file+'?verify='+revision+'-'+Date.now()));
    assert.ok(actual.equals(expected),file+' differs from committed HEAD');
    return {file,bytes:actual.length,sha256:sha(actual)};
  }));
  const health=(await request(origin+'/healthz')).toString('utf8').trim();
  assert.equal(health,'OK','Unexpected health response');
  const project={id:'director-release-verification',title:'Director Release Verification',startScene:'a',scenes:[{id:'a',name:'Verification',text:'Verified export',characters:[],dialogues:[],choices:[],autoBranches:[],setFlags:[]}],characters:[]};
  const bytes=await request(origin+'/api/export-game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project})});
  const template=execFileSync('git',['show','HEAD:native-player/dist/visual-novel-native.exe'],{cwd:__dirname,maxBuffer:8*1024*1024});
  const magic=Buffer.from('VNSNATIVEAPP0001');
  assert.ok(bytes.subarray(0,template.length).equals(template),'Live native export uses a different template');
  assert.ok(bytes.subarray(-magic.length).equals(magic),'Native overlay trailer missing');
  const n=Number(bytes.readBigUInt64LE(bytes.length-magic.length-8));
  assert.equal(bytes.length-magic.length-8-n,template.length,'Unexpected native payload boundary');
  const embedded=JSON.parse(bytes.subarray(template.length,template.length+n).toString('utf8'));
  assert.equal(embedded.id,project.id);
  console.log(JSON.stringify({ok:true,origin,revision,files:results,health,native:{templateBytes:template.length,sha256:sha(template),overlayProject:embedded.id}},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
