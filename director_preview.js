/* Preview adapter: existing controls continue to own navigation and audio. */
(function(){
  let director=null,last=0;
  const ensure=()=>{if(!director||director.projectRef!==P.project){director=createDirector(P.project);director.projectRef=P.project;}return director;};
  const originalScene=currentScene;
  currentScene=function(){const d=director;return d&&d.projectRef===P.project&&d.stage&&d.state.sceneId===P.sceneId&&!P.demoMode?d.stage:originalScene();};
  const originalStart=startNewGame;
  startNewGame=function(){ensure().reset();return originalStart();};
  const originalEnter=enterScene;
  enterScene=function(id,flags){const sc=getSceneP(id);if(!sc)return originalEnter(id,flags);const d=ensure();const previous=d.snapshot();try{d.enter(sc);P.directorBeforeEntry=previous;return originalEnter(id,flags);}catch(e){toast(e.message);}finally{delete P.directorBeforeEntry;}};
  const originalHistory=pushHistory;
  pushHistory=function(){originalHistory();const h=P.history[P.history.length-1];if(h)h.director=P.directorBeforeEntry||ensure().snapshot();};
  const originalDialogue=showDialogue;
  showDialogue=function(d){ensure().line(P.sceneId+':'+P.dialogueIndex);const result=originalDialogue(d);const last=P.backlog[P.backlog.length-1];if(last)last.director=ensure().snapshot();return result;};
  const originalInterpolate=interpolateText;
  interpolateText=function(s,f){return director&&P.project?ensure().interpolate(s,f):originalInterpolate(s,f);};
  function condition(expr){try{return evalCond(expr,ensure().scope(P.flags));}catch(e){return false;}}
  computeChoices=function(sc){return(sc?.choices||[]).filter(c=>condition(c.cond));};
  const originalChoices=renderChoices;
  renderChoices=function(){originalChoices();const buttons=$$('#choiceArea .choice-btn');P.currentChoices.forEach((c,i)=>{const b=buttons[i];if(!b)return;b.disabled=!condition(c.enableCond);b.title=b.disabled?(c.disabledReason||'尚未满足条件'):'';if(b.disabled){b.style.opacity='.45';b.textContent=c.text+' · '+(c.disabledReason||'条件不足');}});};
  const originalChoice=onChoice;
  onChoice=function(c){if(!condition(c.cond)||!condition(c.enableCond))return;return originalChoice(c);};
  getNextTarget=function(){const sc=currentScene();if(!sc)return null;if(sc.ending)return'ending';if(P.currentChoices.length)return'choice';for(const b of sc.autoBranches||[])if(condition(b.cond))return b.target;return sc.next||null;};
  const originalNext=goNext;
  goNext=function(){if(P.ending||P.currentChoices.length)return;try{const t=ensure().flow(currentScene(),P.flags);if(t){enterScene(t);return;}originalNext();}catch(e){stopAllTimers();toast(e.message);}};
  const originalUI=applyUILayout;
  applyUILayout=function(){if(!director||!P.project)return originalUI();const saved=P.project.ui;P.project.ui=ensure().ui();try{return originalUI();}finally{P.project.ui=saved;}};
  function restore(snap){ensure().restore(snap,getSceneP(P.sceneId));}
  const originalBack=back;
  back=function(){const h=P.history[P.history.length-1];if(h)restore(h.director);return originalBack();};
  const originalJump=jumpToBacklog;
  jumpToBacklog=function(i){const e=P.backlog[i];if(e)restore(e.director);return originalJump(i);};
  const originalSave=saveToSlot;
  saveToSlot=function(i){originalSave(i);for(const slot of [i,...(i!==0&&P.project.experience?.autosave?[0]:[])]){const key=saveKey(slot),v=JSON.parse(localStorage.getItem(key)||'null');if(v){v.director=ensure().snapshot();localStorage.setItem(key,JSON.stringify(v));}}};
  const originalLoad=loadFromSlot;
  loadFromSlot=function(i){const s=loadSlotData(i);if(s){ensure().restore(s.director,getSceneP(s.sceneId));}return originalLoad(i);};
  function refresh(){if(!director||!P.project||P.demoMode)return;const d=ensure(),sc=currentScene(),line=currentDialogue();if(!sc)return;
    const before=d.state.themeId;d.reveal(line,P.typing?P.typeIndex:(P.currentFullText||'').length);if(before!==d.state.themeId)applyUILayout();
    const els=$$('#characterLayer .char-sprite');(sc.characters||[]).forEach((ch,i)=>{const el=els[i];if(!el)return;el.style.left=ch.x+'%';el.style.top=ch.y+'%';const img=el.querySelector('.char-layer img');const source=d.image(ch,line,P.typing||!!($('#voiceAudio')&&!$('#voiceAudio').paused));if(img&&source&&img.getAttribute('src')!==source)img.src=source;});
  }
  const originalFinish=finishTyping;
  finishTyping=function(){const r=originalFinish();refresh();return r;};
  const originalTyping=startTyping;
  startTyping=function(s,t){const r=originalTyping(s,t);refresh();return r;};
  setInterval(()=>{const now=performance.now(),dt=last?now-last:0;last=now;if(!director||$('#playerApp').classList.contains('hidden')||$('#gameScreen').classList.contains('hidden')||P.paused||P.demoMode||!$('#savePanel').classList.contains('hidden')||!$('#backlogPanel').classList.contains('hidden')||$('#previewSettingsPop'))return;director.tick(dt*(P.rate||1));refresh();},16);
  globalThis.VNSPreviewDirector={get:ensure,refresh};
})();
