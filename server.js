const http = require('http');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const PORT = process.env.PORT || 10000;
const ROOT = __dirname;
const PLAYER_EXE = path.join(ROOT, 'player-shell', 'dist', 'visual-novel-player.exe');
const MAX_EXPORT_BODY = 96 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip'
};

function safeName(value) {
  return String(value || 'visual-novel-game').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 80) || 'visual-novel-game';
}
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_EXPORT_BODY) { reject(new Error('导出内容超过 96MB 限制')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new Error('导出数据不是有效 JSON')); } });
    req.on('error', reject);
  });
}
function collectDataAssets(project) {
  const found = [], seen = new Set();
  const walk = (node, keyPath) => {
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, keyPath + '[' + i + ']'));
    if (node && typeof node === 'object') return Object.entries(node).forEach(([k, v]) => walk(v, keyPath ? keyPath + '.' + k : k));
    if (typeof node !== 'string' || !node.startsWith('data:') || seen.has(node)) return;
    const m = node.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/); if (!m) return;
    const mime = m[1] || 'application/octet-stream', raw = m[3];
    let data; try { data = m[2] ? Buffer.from(raw, 'base64') : Buffer.from(decodeURIComponent(raw), 'utf8'); } catch (_) { return; }
    const ext = ({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg','video/mp4':'mp4','video/webm':'webm'})[mime] || 'bin';
    seen.add(node); found.push({name:'assets/asset-'+String(found.length+1).padStart(3,'0')+'.'+ext,mime,size:data.length,source:keyPath,data});
  };
  walk(project, 'project'); return found;
}
async function exportGame(req, res) {
  if (!fs.existsSync(PLAYER_EXE)) throw new Error('Windows 播放器尚未构建，请在项目目录执行播放器构建');
  const body = await readJsonBody(req), project = body && body.project, gameHtml = body && body.gameHtml;
  if (!project || !Array.isArray(project.scenes) || typeof gameHtml !== 'string' || !gameHtml.startsWith('<!doctype html>')) throw new Error('项目或可玩 HTML 数据不完整');
  const title = safeName(project.title), assets = collectDataAssets(project);
  const external = [];
  const walkExternal = (node, p) => { if (Array.isArray(node)) return node.forEach((v,i)=>walkExternal(v,p+'['+i+']')); if (node&&typeof node==='object') return Object.entries(node).forEach(([k,v])=>walkExternal(v,p?p+'.'+k:k)); if (typeof node==='string'&&/^https?:/i.test(node)) external.push({source:p,url:node}); };
  walkExternal(project, 'project');
  const manifest = {format:'visual-novel-studio-game-bundle',version:1,title,createdAt:new Date().toISOString(),scenes:project.scenes.length,characters:(project.characters||[]).length,embeddedAssets:assets.map(({name,mime,size,source})=>({name,mime,size,source})),externalAssets:external};
  res.writeHead(200, {'Content-Type':'application/zip','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(title+'.windows.zip')}`,'Cache-Control':'no-store'});
  const zip = archiver('zip', {zlib:{level:9}}); zip.on('error', err => res.destroy(err)); zip.pipe(res);
  zip.file(PLAYER_EXE, {name:title+'.exe'});
  zip.append(gameHtml, {name:'game.html'});
  zip.append(JSON.stringify(project,null,2), {name:'project.json'});
  zip.append(JSON.stringify(manifest,null,2), {name:'manifest.json'});
  zip.append('双击 '+title+'.exe 即可开始游戏。\r\n请保持 EXE 与 game.html 位于同一目录。\r\nassets 文件夹包含项目内嵌的人物立绘、表情、动作、背景、音频与视频资源副本。\r\nmanifest.json 会列出仍依赖网络的外链素材。\r\n', {name:'README.txt'});
  assets.forEach(a => zip.append(a.data, {name:a.name}));
  await zip.finalize();
}

http.createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/healthz') { res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8'}); res.end('OK'); return; }
    if (urlPath === '/api/export-game' && req.method === 'POST') { await exportGame(req, res); return; }
    if (urlPath === '/api/export-game/status') { res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({ready:fs.existsSync(PLAYER_EXE)})); return; }
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403, {'Content-Type':'text/plain; charset=utf-8'}); res.end('403 Forbidden'); return; }
    fs.readFile(filePath, (err, data) => { if (err) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end('404 Not Found'); return; } const ext=path.extname(filePath).toLowerCase(); res.writeHead(200, {'Content-Type':MIME[ext]||'application/octet-stream'}); res.end(data); });
  } catch (e) {
    if (!res.headersSent) res.writeHead(400, {'Content-Type':'application/json; charset=utf-8'});
    if (!res.destroyed) res.end(JSON.stringify({ok:false,error:e.message||String(e)}));
  }
}).listen(PORT, () => console.log('Visual Novel Studio is running at http://localhost:' + PORT));
