'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const port = 18991;
const collabFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vns-http-')), 'collab.json');
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitReady(child) {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error('server exited early');
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return;
    } catch (_) {}
    await sleep(300);
  }
  throw new Error('server not ready');
}
(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: __dirname, env: { ...process.env, PORT: String(port), VNS_COLLAB_FILE: collabFile }, stdio: 'ignore'
  });
  try {
    await waitReady(server);
    const test = spawn(process.execPath, ['http_verification.js'], { cwd: __dirname, stdio: 'inherit' });
    const code = await new Promise(resolve => test.on('exit', resolve));
    process.exitCode = code || 0;
  } finally {
    try { server.kill(); } catch (_) {}
    try { fs.rmSync(path.dirname(collabFile), { recursive: true, force: true }); } catch (_) {}
  }
})().catch(e => { console.error(e); process.exit(1); });
