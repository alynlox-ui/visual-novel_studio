'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const clone = v => JSON.parse(JSON.stringify(v));
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
function hashProject(p){return crypto.createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex');}
class CollaborationStore {
  constructor(project, file){this.file=file;this.project=clone(project);this.changes=[];this.comments=[];if(file&&fs.existsSync(file)){const b=JSON.parse(fs.readFileSync(file,'utf8'));this.project=b.project;this.changes=b.changes;this.comments=b.comments;}}
  persist(){if(!this.file)return;fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.exportBundle()));fs.renameSync(this.file+'.tmp',this.file);}
  get baseHash(){return hashProject(this.project);}
  recordChange(author,message,before,after){if(hashProject(before)!==this.baseHash)throw Error('Stale project revision');const e={id:crypto.randomUUID(),author:String(author||'local'),message:String(message||''),at:new Date().toISOString(),beforeHash:this.baseHash,afterHash:hashProject(after)};this.project=clone(after);this.changes.push(e);this.persist();return clone(e);}
  addComment(author,text,target={}){text=String(text||'').trim();if(!text||text.length>10000)throw Error('Comment must be 1-10000 characters');const c={id:crypto.randomUUID(),author:String(author||'local'),text,target:clone(target),at:new Date().toISOString(),resolved:false};this.comments.push(c);this.persist();return clone(c);}
  resolveComment(id){const c=this.comments.find(c=>c.id===id);if(!c)return false;c.resolved=true;this.persist();return true;}
  exportBundle(){return {version:1,baseHash:this.baseHash,project:clone(this.project),changes:clone(this.changes),comments:clone(this.comments)};}
  inspectIncoming(b){const compatible=!!b&&b.version===1&&!!b.project&&Array.isArray(b.project.scenes)&&typeof b.baseHash==='string';const same=compatible&&hashProject(b.project)===this.baseHash;return {compatible,conflicts:!compatible?[{type:'invalid-bundle'}]:!same&&b.baseHash!==this.baseHash?[{type:'stale-revision',expected:this.baseHash,received:b.baseHash}]:[]};}
  mergeIncoming(b){const check=this.inspectIncoming(b);if(check.conflicts.length)return {ok:false,...check};if(hashProject(b.project)!==this.baseHash)this.recordChange(b.author,b.message,this.project,b.project);return {ok:true,bundle:this.exportBundle()};}
}
module.exports={CollaborationStore,hashProject};
