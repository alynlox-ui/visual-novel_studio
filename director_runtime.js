/* Shared, serializable director state for preview and standalone games. */
function createDirector(project) {
  const copy = v => JSON.parse(JSON.stringify(v));
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  let state;
  const reset = () => { state={version:1,sceneId:'',stage:null,locals:{},stack:[],themeId:'',clock:0,moves:{},line:'',applied:[]}; };
  reset();
  function scope(flags){return Object.assign({},flags||{},state.locals);}
  function interpolate(text,flags){const vars=scope(flags);return String(text==null?'':text).replace(/\{([^}]+)\}/g,(m,k)=>own(vars,k.trim())?String(vars[k.trim()]):m);}
  function theme(id){if(!id)return;const t=(project.director?.templates||[]).find(t=>t.id===id);if(!t)throw Error('主题不存在：'+id);state.themeId=id;}
  function ui(){const t=(project.director?.templates||[]).find(t=>t.id===state.themeId);const out=copy(project.ui||{});if(t&&t.ui)Object.keys(t.ui).forEach(k=>{out[k]=Object.assign({},out[k],t.ui[k]);});return out;}
  function enter(sc){
    const old=state.stage, inherit=sc.inheritStage||{};
    const next=copy(sc);
    if(old&&inherit.background){next.bg=old.bg;next.bgImage=old.bgImage;next.video=old.video;next.videoMuted=old.videoMuted;}
    if(old&&inherit.characters)next.characters=copy(old.characters||[]);else state.moves={};
    if(old&&inherit.bgm){next.bgm=old.bgm;next.bgmVolume=old.bgmVolume;}
    state.stage=next;state.sceneId=sc.id;state.line='';state.applied=[];
    if(sc.themeId)theme(sc.themeId);
    return next;
  }
  function flow(sc,flags){
    const f=sc.flow||{};
    if(f.mode==='call'){
      if(state.stack.length>=32)throw Error('公共剧情调用超过 32 层');
      const target=project.scenes.find(s=>s.id===f.target),back=project.scenes.find(s=>s.id===f.returnTo);
      if(!target||!back)throw Error('公共剧情的目标或返回场景不存在');
      state.stack.push({locals:copy(state.locals),returnTo:f.returnTo,result:f.result||''});
      state.locals=copy(f.args&&typeof f.args==='object'&&!Array.isArray(f.args)?f.args:{});
      return f.target;
    }
    if(f.mode==='return'){
      const frame=state.stack[state.stack.length-1];if(!frame)throw Error('没有可以返回的公共剧情调用');
      const vars=scope(flags),key=String(f.value||'').match(/^\{([^}]+)\}$/);
      const value=key&&own(vars,key[1])?vars[key[1]]:interpolate(f.value,flags);
      state.stack.pop();state.locals=frame.locals||{};
      if(frame.result){if(own(state.locals,frame.result))state.locals[frame.result]=value;else flags[frame.result]=value;}
      return frame.returnTo;
    }
    return null;
  }
  function line(key){if(state.line===key)return;Object.keys(state.moves).forEach(id=>{const m=state.moves[id];if(!m.keep){const c=state.stage?.characters?.find(c=>c.id===id);if(c){c.x=m.x;c.y=m.y;}delete state.moves[id];}});state.line=key;state.applied=[];}
  function reveal(d,count){
    (d?.cues||[]).forEach((c,i)=>{if(state.applied.includes(i)||Number(c.at||0)>count)return;state.applied.push(i);
      if(c.type==='theme'){theme(c.themeId);return;}
      const ch=state.stage?.characters?.find(x=>x.id===c.target);if(!ch)return;
      if(c.type==='expression')ch.expressionId=c.expressionId||'';
      if(c.type==='move')state.moves[c.target]={fromX:Number(ch.x??50),fromY:Number(ch.y??88),x:Number(c.x??ch.x??50),y:Number(c.y??ch.y??88),start:state.clock,duration:Math.max(0,Number(c.duration)||0),keep:c.keep===true};
    });
    updateMoves();
  }
  function updateMoves(){Object.keys(state.moves).forEach(id=>{const m=state.moves[id],ch=state.stage?.characters?.find(c=>c.id===id);if(!ch){delete state.moves[id];return;}const k=m.duration?Math.min(1,Math.max(0,(state.clock-m.start)/m.duration)):1;ch.x=m.fromX+(m.x-m.fromX)*k;ch.y=m.fromY+(m.y-m.fromY)*k;if(k===1)delete state.moves[id];});}
  function tick(dt){state.clock+=Math.max(0,Math.min(250,Number(dt)||0));updateMoves();}
  function image(ch,d,speaking){
    const lib=(project.characters||[]).find(c=>c.id===ch.charId)||{};
    const active=d&&(d.charId===ch.id||(!d.charId&&d.speaker===(ch.name||lib.name)));
    const exp=(lib.expressions||[]).find(e=>e.id===(ch.expressionId||(active&&d.expressionId))),act=(lib.actions||[]).find(a=>a.id===((active&&d.actionId)||ch.actionId));
    const base=exp?.image||act?.image||ch.image||lib.baseImage||'';
    const p=ch.portrait||lib.portrait;if(!p)return base;
    const period=Math.max(1000,Number(p.blinkInterval)||4000);
    if(p.eyesClosed&&state.clock%period>period-160)return p.eyesClosed;
    if(active&&speaking){const phase=Math.floor(state.clock/110)%4;return (phase===0?p.mouthClosed:phase===2?p.mouthHalf:p.mouthOpen)||base;}
    return p.mouthClosed||base;
  }
  function snapshot(){return copy(state);}
  function restore(value,sc){reset();if(value&&value.version===1){state=copy(value);state.locals=state.locals||{};state.stack=state.stack||[];state.moves=state.moves||{};state.applied=state.applied||[];}else if(sc)enter(sc);return state.stage;}
  return {reset,scope,interpolate,theme,ui,enter,flow,line,reveal,tick,image,snapshot,restore,get stage(){return state.stage;},get state(){return state;}};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createDirector};
