'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const target=process.argv[2],{scanProject}=require('./release_check');
const report=scanProject();fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});fs.writeFileSync(path.join(__dirname,'artifacts/release-check.json'),JSON.stringify(report,null,2));
if(!report.ok){console.error(report.errors);process.exit(1);}
if(target==='web'){const out=path.join(__dirname,'dist/web');fs.mkdirSync(out,{recursive:true});for(const f of ['index.html','debug_workbench.js','workbench_ui.js','condition_parser.js'])fs.copyFileSync(path.join(__dirname,f),path.join(out,f));console.log('Built dist/web; collaboration and native export require the Node server.');}
else if(target==='windows'){if(process.platform!=='win32'){console.error('Windows build requires Windows .NET Framework csc.');process.exit(2);}const result=spawnSync('cmd.exe',['/d','/c','native-player\\build.cmd'],{cwd:__dirname,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);if(!scanProject().platforms.windows.ready)process.exit(1);console.log('Windows PE template built; run native_export_integration_test.js for execution verification.');}
else if(['macos','linux'].includes(target)){console.error('BLOCKED: '+report.platforms[target].blocker);process.exit(2);}
else{console.error('Expected web, windows, macos or linux');process.exit(1);}
