const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 10000;
const ROOT = __dirname;
const NATIVE_PLAYER_EXE = path.join(ROOT, 'native-player', 'dist', 'visual-novel-native.exe');
const MAX_EXPORT_BODY = 96 * 1024 * 1024;
const NATIVE_PAYLOAD_MAGIC = Buffer.from('VNSNATIVEAPP0001', 'ascii');

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
