const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 10000;
const ROOT = __dirname;
const NATIVE_PLAYER_EXE = path.join(ROOT, 'native-player', 'dist', 'visual-novel-native.exe');
const MAX_EXPORT_BODY = 96 * 1024 * 1024;
const NATIVE_PAYLOAD_MAGIC = Buffer.from('VNSNATIVEAPP0001', 'ascii');
const { scanProject } = require('./release_check');
const { CollaborationStore } = require('./collaboration_store');
const collaboration = new CollaborationStore({ id: 'server-local', scenes: [] }, process.env.VNS_COLLAB_FILE || path.join(require('os').homedir(), '.visual-novel-studio', 'collaboration.json'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.exe': 'application/vnd.microsoft.portable-executable'
};

function safeName(value) {
  return String(value || 'visual-novel-game').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 80) || 'visual-novel-game';
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_EXPORT_BODY) {
        fail(new Error('导出内容超过 96MB 限制'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        settled = true;
        resolve(data);
      } catch (_) {
        fail(new Error('导出数据不是有效 JSON'));
      }
    });
    req.on('error', fail);
  });
}

function buildNativeApplication(project) {
  if (!fs.existsSync(NATIVE_PLAYER_EXE)) throw new Error('原生 Windows 播放器尚未构建');
  if (!project || !Array.isArray(project.scenes) || project.scenes.length === 0) throw new Error('项目没有可导出的场景');
  const player = fs.readFileSync(NATIVE_PLAYER_EXE);
  if (player.length < 2 || player[0] !== 0x4d || player[1] !== 0x5a) throw new Error('原生播放器模板不是有效的 Windows PE 文件');
  const projectJson = Buffer.from(JSON.stringify(project), 'utf8');
  const payloadLength = Buffer.alloc(8);
  payloadLength.writeBigUInt64LE(BigInt(projectJson.length), 0);
  return Buffer.concat([player, projectJson, payloadLength, NATIVE_PAYLOAD_MAGIC]);
}

async function exportGame(req, res) {
  const body = await readJsonBody(req);
  const project = body && body.project;
  const title = safeName(project && project.title);
  const application = buildNativeApplication(project);
  res.writeHead(200, {
    'Content-Type': 'application/vnd.microsoft.portable-executable',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(title + '.exe')}`,
    'Content-Length': application.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Visual-Novel-Format': 'native-single-exe'
  });
  res.end(application);
}

function serveFile(urlPath, res) {
  const relative = urlPath.replace(/^[/\\]+/, '') || 'index.html';
  const filePath = path.resolve(ROOT, relative);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[extension] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('OK');
      return;
    }
    if (urlPath.startsWith('/api/collaboration') && (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host))) {
      res.writeHead(403, {'Content-Type':'application/json'});res.end(JSON.stringify({error:'Local same-origin access only'}));return;
    }
    if (urlPath === '/api/collaboration/resolve' && req.method === 'POST') {
      const body = await readJsonBody(req);const ok=collaboration.resolveComment(body.id);res.writeHead(ok?200:404,{'Content-Type':'application/json'});res.end(JSON.stringify({ok}));return;
    }
    if (urlPath === '/api/release-check') {
      const body=req.method==='POST'?await readJsonBody(req):{};
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(scanProject(body.project))); return;
    }
    if (urlPath === '/api/collaboration' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(collaboration.exportBundle())); return;
    }
    if (urlPath === '/api/collaboration' && req.method === 'POST') {
      const bundle = await readJsonBody(req); const result = collaboration.mergeIncoming(bundle);
      res.writeHead(result.ok ? 200 : 409, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(result)); return;
    }
    if (urlPath === '/api/collaboration/comments' && req.method === 'POST') {
      const body = await readJsonBody(req); const comment = collaboration.addComment(body.author, body.text, body.target);
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(comment)); return;
    }
    if (urlPath === '/api/collaboration/history') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ changes: collaboration.changes, comments: collaboration.comments })); return;
    }
    if (urlPath === '/api/export-game' && req.method === 'POST') {
      await exportGame(req, res);
      return;
    }
    if (urlPath === '/api/export-game/status') {
      const ready = fs.existsSync(NATIVE_PLAYER_EXE);
      const size = ready ? fs.statSync(NATIVE_PLAYER_EXE).size : 0;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ready, format: 'native-single-exe', runtime: 'WinForms-GDI+', templateBytes: size }));
      return;
    }
    serveFile(urlPath, res);
  } catch (error) {
    if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    if (!res.destroyed) res.end(JSON.stringify({ ok: false, error: error.message || String(error) }));
  }
}).listen(PORT, () => console.log('Visual Novel Studio is running at http://localhost:' + PORT));
