'use strict';
(() => {
  const panel=document.createElement('dialog'); panel.id='workbench'; panel.style.cssText='width:min(1050px,94vw);max-height:90vh;border:1px solid #ccc;border-radius:8px;padding:18px;overflow:auto';
  panel.innerHTML=`<header style="display:flex;gap:8px;align-items:center"><strong>工作台</strong><button data-tab="debug">剧情调试</button><button data-tab="collab">本地协作</button><button data-tab="release">发布检查</button><button id="wbClose" style="margin-left:auto" title="关闭">×</button></header><section id="wbBody" style="margin-top:14px"></section>`;
  document.body.appendChild(panel);
  const trigger=document.createElement('button');trigger.id='btnWorkbench';trigger.textContent='调试 / 协作';document.getElementById('btnPlayScene').parentNode.appendChild(trigger);
  const q=s=>panel.querySelector(s), body=q('#wbBody'); let session=null, recovery=null, remote=null, tab='debug';
  function error(e){const el=q('#wbStatus');if(el)el.textContent=e.message||String(e);else toast(e.message||String(e));}
  function saveKey(){return 'vns_debug_'+project.id;}
  function debug(){
    body.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:8px"><label>随机种子 <input id="wbSeed" type="number" value="1" style="width:90px"></label><label>时钟 <input id="wbHour" type="number" min="0" max="23" value="12" style="width:60px"></label><button id="wbStart">从起点</button><button id="wbSelected">当前场景</button><button id="wbStep">单步</button><button id="wbSave">保存测试</button><button id="wbLoad">读档</button><button id="wbRecover">撤回一步</button><button id="wbDownload">导出报告</button></div><p id="wbStatus" role="status"></p><div id="wbScene"></div><div id="wbChoices" style="display:flex;gap:8px;flex-wrap:wrap"></div><h3>变量监视</h3><div id="wbFlags"></div><h3>条件日志 / 覆盖率</h3><pre id="wbReport" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:32vh;overflow:auto"></pre>`;
    const act=fn=>()=>{try{fn();renderDebug();}catch(e){error(e);}};
    function start(id){session=new StoryDebugSession(project,{startScene:id,seed:Number(q('#wbSeed').value),hour:Number(q('#wbHour').value)});recovery=null;session.start();}
    q('#wbStart').onclick=act(()=>start(project.startScene));q('#wbSelected').onclick=act(()=>start(selectedSceneId));
    q('#wbStep').onclick=act(()=>{if(!session)throw Error('请先开始测试');recovery=session.snapshot();session.advance();});
    q('#wbSave').onclick=act(()=>{if(!session)throw Error('请先开始测试');localStorage.setItem(saveKey(),JSON.stringify(session.snapshot()));});
    q('#wbLoad').onclick=act(()=>{const raw=localStorage.getItem(saveKey());if(!raw)throw Error('没有测试存档');const next=new StoryDebugSession(project);next.restore(JSON.parse(raw));session=next;});
    q('#wbRecover').onclick=act(()=>{if(!recovery)throw Error('没有可恢复步骤');session.restore(recovery);recovery=null;});
    q('#wbDownload').onclick=act(()=>{if(!session)throw Error('请先开始测试');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(session.report(),null,2)],{type:'application/json'}));a.download='debug-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
    renderDebug();
  }
  function renderDebug(){
    if(!session)return;const report=session.report();q('#wbStatus').textContent=report.status+' | '+report.currentScene+' | '+report.coverage.scenePercent+'%';
    const sc=session.scene();q('#wbScene').textContent=sc?(sc.name||sc.id)+' : '+((sc.dialogues||[])[Math.max(0,session.state.dialogueIndex-1)]?.text||sc.text||''):'';
    q('#wbChoices').replaceChildren();session.state.choices.forEach(c=>{const b=document.createElement('button');b.textContent=c.choice.text||('选择 '+c.index);b.disabled=!c.hit||session.state.status!=='playing';b.onclick=()=>{recovery=session.snapshot();session.advance(c.index);renderDebug();};q('#wbChoices').appendChild(b);});
    q('#wbFlags').replaceChildren();Object.entries(session.state.flags).forEach(([key,value])=>{const label=document.createElement('label');label.style.marginRight='12px';label.append(document.createTextNode(key+' '));const input=document.createElement('input');input.type='number';input.value=value;input.style.width='90px';input.onchange=()=>{try{recovery=session.snapshot();session.setFlag(key,input.value);renderDebug();}catch(e){error(e);}};label.append(input);q('#wbFlags').append(label);});
    q('#wbReport').textContent=JSON.stringify({coverage:report.coverage,logs:report.logs.slice(-80)},null,2);
  }
  async function request(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(r.status===409?'冲突：服务器版本已变化。先拉取并备份本地项目，再重新编辑。':data.error||'HTTP '+r.status);return data;}
  async function collab(){
    body.innerHTML=`<div style="display:flex;gap:8px;flex-wrap:wrap"><label>作者 <input id="wbAuthor" value="local" style="width:120px"></label><label>变更说明 <input id="wbMessage"></label><button id="wbPull">拉取项目</button><button id="wbPush">提交当前项目</button><button id="wbRefresh">刷新记录</button></div><p id="wbStatus" role="status"></p><label>当前场景评论 <input id="wbComment" style="width:55%"></label><button id="wbCommentAdd">发表评论</button><div id="wbComments"></div><h3>变更历史</h3><pre id="wbHistory" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>`;
    const run=fn=>async()=>{try{await fn();}catch(e){error(e);}};
    const refresh=async()=>{const data=await request('/api/collaboration/history');q('#wbHistory').textContent=JSON.stringify(data.changes,null,2);q('#wbComments').replaceChildren();data.comments.forEach(c=>{const p=document.createElement('p');p.textContent=c.author+' ['+(c.target.sceneId||'项目')+'] '+c.text+(c.resolved?' ✓':'');if(!c.resolved){const b=document.createElement('button');b.textContent='解决';b.onclick=run(async()=>{await request('/api/collaboration/resolve',{id:c.id});await refresh();});p.append(b);}q('#wbComments').append(p);});};
    q('#wbRefresh').onclick=run(refresh);
    q('#wbPull').onclick=run(async()=>{const b=await request('/api/collaboration');if(!b.project.scenes.length){remote=b;q('#wbStatus').textContent='服务器为空，可以提交当前项目';return;}if(!confirm('备份当前草稿并用服务器项目替换？'))return;await histSnapshotAuto('协作拉取前自动快照');localStorage.setItem('vns_collab_backup',JSON.stringify(project));project=migrateProject(b.project);selectedSceneId=project.startScene;renderAll();editorResetBaseline();saveEditor();remote=b;q('#wbStatus').textContent='已拉取 '+b.baseHash;await refresh();});
    q('#wbPush').onclick=run(async()=>{if(!remote)throw Error('请先拉取服务器版本');const result=await request('/api/collaboration',{version:1,baseHash:remote.baseHash,project,author:q('#wbAuthor').value,message:q('#wbMessage').value});remote=result.bundle;q('#wbStatus').textContent='已提交 '+remote.baseHash;await refresh();});
    q('#wbCommentAdd').onclick=run(async()=>{await request('/api/collaboration/comments',{author:q('#wbAuthor').value,text:q('#wbComment').value,target:{sceneId:selectedSceneId,projectId:project.id}});q('#wbComment').value='';await refresh();});
    try{await refresh();}catch(e){error(e);}
  }
  async function release(){body.innerHTML='<p id="wbStatus" role="status"></p><pre id="wbRelease" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>';try{q('#wbRelease').textContent=JSON.stringify(await request('/api/release-check',{project}),null,2);}catch(e){error(e);}}
  function open(){if(tab==='debug')debug();else if(tab==='collab')collab();else release();}
  panel.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;open();});
  q('#wbClose').onclick=()=>panel.close();trigger.onclick=()=>{open();panel.showModal();};
})();
