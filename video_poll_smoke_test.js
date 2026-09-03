// video_poll_smoke_test.js — AI 视频异步任务/进度/取消冒烟测试
const fs=require('fs');const {installDomStubs}=require('./dom_stub.js');installDomStubs();
const html=fs.readFileSync('index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/);if(!m)process.exit(1);
const TEST=`
;(async function(){
 const out=[],ck=(n,c,x)=>out.push((c?'  ✓ ':'  ✗ FAIL: ')+n+(x?' '+JSON.stringify(x):''));
 try{
  ck('视频任务 UI 已注入',html.includes('btnAiVideoCancel')&&html.includes('aiVideoTasks')&&html.includes('video-task'));
  ck('任务辅助函数已加载',typeof videoTaskId==='function'&&typeof videoStatusName==='function'&&typeof videoProgress==='function'&&typeof pollVideoTask==='function');
  ck('任务 ID 兼容多种字段',videoTaskId({id:'a'})==='a'&&videoTaskId({task_id:'b'})==='b'&&videoTaskId({taskId:'c'})==='c'&&videoTaskId({request_id:'d'})==='d');
  ck('状态映射正确',videoStatusName('queued')==='排队中'&&videoStatusName('in_progress')==='生成中'&&videoStatusName('succeeded')==='已完成'&&videoStatusName('failed')==='失败'&&videoStatusName('canceled')==='已取消');
  ck('进度字段兼容并限制 0~100',videoProgress({progress:40})===40&&videoProgress({percentage:120})===100&&videoProgress({percent:-3})===0&&videoProgress({})===null);
  // 模拟轮询：替换状态请求与等待，三次返回 queued/processing/succeeded+url
  const oldFetch=aiFetchVideoStatus,oldTimeout=setTimeout;
  let n=0;aiFetchVideoStatus=async()=>{n++;return n===1?{status:'queued',progress:20}:n===2?{status:'in_progress',progress:55}:{status:'succeeded',video_url:'https://example.test/v.mp4',progress:100};};
  global.setTimeout=(fn)=>{fn();return 0;};
  const task=videoTaskAdd('模拟任务');const url=await pollVideoTask(task,'https://example.test','k','task-1');
  ck('异步轮询最终返回视频 URL',url==='https://example.test/v.mp4'&&n===3,{n,status:task.status,progress:task.progress});
  ck('异步轮询最终进度 100%',task.progress===100&&task.status==='已完成');
  // 取消：token 失效后不再请求，返回 null
  n=0;aiFetchVideoStatus=async()=>{n++;return {status:'queued',progress:10};};
  const task2=videoTaskAdd('取消任务');const promise=pollVideoTask(task2,'https://example.test','k','task-2');videoTaskCancel();const canceled=await promise;
  ck('停止轮询返回 null',canceled===null&&n===0,{n,status:task2.status});
  ck('取消后任务标记已取消',task2.status==='已取消');
  aiFetchVideoStatus=oldFetch;global.setTimeout=oldTimeout;
  // 源码保留同步直出和任务 ID 两条路径
  ck('同步 URL 与任务 ID 两种分支都存在',html.includes('let url=aiExtractVideoUrl(data)')&&html.includes('const taskId=videoTaskId(data)'));
 }catch(e){out.push('  ✗ FATAL '+e.stack)}
 console.log(out.join('\\n'));const f=out.filter(x=>x.includes('✗')).length;console.log('========== 视频轮询冒烟：'+(out.length-f)+' 通过 / '+f+' 失败 ==========');process.exit(f?1:0);
})();`;
try{eval(m[1]+'\n'+TEST)}catch(e){console.error('EVAL/BOOT ERROR',e.stack);process.exit(1)}
