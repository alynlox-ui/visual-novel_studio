'use strict';
const DebugParser = typeof module !== 'undefined' && module.exports ? require('./condition_parser').ExprParser : ExprParser;
const debugClone = v => JSON.parse(JSON.stringify(v));
class StoryDebugSession {
  constructor(project, options = {}) {
    this.project = debugClone(project); this.identity = JSON.stringify(this.project);
    this.startScene = options.startScene || project.startScene;
    this.state = { sceneId: null, dialogueIndex: 0, flags: debugClone(project.flags || {}), readScenes: [], endings: [], status: 'idle', seed: (options.seed ?? 1) >>> 0, hour: options.hour ?? 12, minute: options.minute ?? 0, choices: [] };
    this.logs = []; this.coverage = { entered: {}, edges: {}, choices: {}, endings: {} };
  }
  scene(id = this.state.sceneId) { return this.project.scenes.find(s => s.id === id); }
  log(type, data = {}) { this.logs.push({ step: this.logs.length, type, ...data }); }
  condition(expression) {
    const s = this.state;
    const functions = {
      chance: p => { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296 * 100 < Math.max(0, Math.min(100, Number(p) || 0)); },
      hourNow: () => s.hour, minuteNow: () => s.minute,
      hourBetween: (a,b) => a <= b ? s.hour >= a && s.hour <= b : s.hour >= a || s.hour <= b,
      sceneRead: id => s.readScenes.includes(String(id)), sceneCount: () => this.project.scenes.length,
      endings: () => s.endings.length, endingSeen: (kind,title) => s.endings.some(e => title === undefined ? e.split('|')[0] === kind : e === kind+'|'+title), abs: n => Math.abs(Number(n)||0)
    };
    try { const p = new DebugParser(expression); p.functions = functions; p.flags = s.flags; const result = !String(expression || '').trim() || !!p.parse(); this.log('condition', { expression, result }); return result; }
    catch (e) { this.log('condition-error', { expression, error: e.message }); this.state.status = 'failure'; return false; }
  }
  applyFlags(ops = []) { for (const o of ops || []) { if (!o || !o.flag) continue; const before = Number(this.state.flags[o.flag] || 0), v = Number(o.value) || 0; let n = before; if(o.op==='=')n=v; if(o.op==='+')n+=v; if(o.op==='-')n-=v; if(o.op==='*')n*=v; if(o.op==='/'&&v)n/=v; Object.defineProperty(this.state.flags,o.flag,{value:Math.round(n*1000)/1000,writable:true,enumerable:true,configurable:true}); this.log('state-change',{flag:o.flag,before,after:this.state.flags[o.flag]}); } }
  fail(reason) { this.state.status='failure'; this.log('failure',{reason}); return {ok:false,reason}; }
  enter(id, reason='transition', ops=[]) {
    const sc=this.scene(id); if(!sc)return this.fail('missing-scene:'+id);
    const from=this.state.sceneId; this.applyFlags(ops); this.applyFlags(sc.setFlags);
    this.state.sceneId=id; this.state.dialogueIndex=0; this.state.status='playing';
    if(!this.state.readScenes.includes(id))this.state.readScenes.push(id);
    this.coverage.entered[id]=(this.coverage.entered[id]||0)+1;
    if(from){const edge=from+'>'+id;this.coverage.edges[edge]=(this.coverage.edges[edge]||0)+1;}
    this.state.choices=(sc.choices||[]).map((choice,index)=>({choice,index,hit:this.condition(choice.cond)}));
    this.log('scene-enter',{sceneId:id,reason,flags:debugClone(this.state.flags)}); return {ok:this.state.status!=='failure',type:'scene',sceneId:id};
  }
  availableChoices(){return debugClone(this.state.choices.filter(x=>x.hit));}
  advance(choiceIndex=null) {
    if(this.state.status!=='playing')return {ok:false,reason:'not-playing'};
    const sc=this.scene(), dialogues=(sc.dialogues?.length?sc.dialogues:[{text:sc.text||'',speaker:sc.speaker||''}]).filter(d=>d.text||d.speaker);
    if(this.state.dialogueIndex<dialogues.length){const dialogue=dialogues[this.state.dialogueIndex++];this.log('dialogue',{sceneId:sc.id,index:this.state.dialogueIndex-1});return {ok:true,type:'dialogue',dialogue};}
    if(sc.ending){const key=(sc.ending.kind||'custom')+'|'+(sc.ending.title||'END');this.state.status='success';if(!this.state.endings.includes(key))this.state.endings.push(key);this.coverage.endings[key]=1;this.log('success',{ending:key});return {ok:true,type:'ending'};}
    const choices=this.availableChoices();
    if(choiceIndex!==null){const c=choices.find(c=>c.index===choiceIndex);if(!c){this.log('condition-miss',{choiceIndex});return {ok:false,reason:'choice-unavailable'};}this.coverage.choices[sc.id+':'+choiceIndex]=1;this.log('branch',{kind:'choice',target:c.choice.target});const entered=this.enter(c.choice.target,'choice',c.choice.setFlags);return entered.ok?this.advance():entered;}
    if(choices.length)return {ok:true,type:'choices',choices};
    for(const b of sc.autoBranches||[]){if(this.condition(b.cond))return this.enter(b.target,'auto');if(this.state.status==='failure')return {ok:false,reason:'condition-error'};}
    return sc.next?this.enter(sc.next,'next'):this.fail('dead-end');
  }
  start(){return this.enter(this.startScene,'start');}
  setFlag(flag,value){if(!Number.isFinite(Number(value)))throw Error('Invalid variable');this.applyFlags([{flag,op:'=',value}]); const sc=this.scene();this.state.choices=(sc?.choices||[]).map((choice,index)=>({choice,index,hit:this.condition(choice.cond)}));}
  snapshot(){return {version:1,project:this.identity,state:debugClone(this.state),logs:debugClone(this.logs),coverage:debugClone(this.coverage)};}
  restore(s){if(s.version!==1||s.project!==this.identity||!this.scene(s.state?.sceneId))throw Error('Save belongs to a different project revision');this.state=debugClone(s.state);this.logs=debugClone(s.logs);this.coverage=debugClone(s.coverage);return this.snapshot();}
  report(){return {status:this.state.status,currentScene:this.state.sceneId,flags:debugClone(this.state.flags),logs:debugClone(this.logs),coverage:{...debugClone(this.coverage),scenePercent:this.project.scenes.length?Math.round(Object.keys(this.coverage.entered).length/this.project.scenes.length*100):0}};}
}
if(typeof module!=='undefined'&&module.exports)module.exports={StoryDebugSession};
