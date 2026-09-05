// native_export_integration_test.js - exercise the real HTTP export and exported PE
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const port = 18741;
const origin = `http://127.0.0.1:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vns-native-export-'));
const exePath = path.join(tempDir, 'Native Export Probe.exe');
const reportPath = path.join(tempDir, 'self-test.json');
const conditionReportPath = path.join(tempDir, 'condition-self-test.json');
const screenshotPath = path.join(tempDir, 'native-player.png');
const keepArtifacts = process.env.VNS_KEEP_TEST_ARTIFACTS === '1';
const magic = Buffer.from('VNSNATIVEAPP0001', 'ascii');
const project = {
  id: 'native-export-probe',
  title: 'Native Export Probe',
  startScene: 'start',
  flags: { trust: 1 },
  scenes: [
    { id: 'start', name: 'Start', bg: '#1f2937', speaker: 'A', text: 'Hello {trust}', next: 'end', setFlags: [], choices: [], autoBranches: [], dialogues: [], characters: [] },
    { id: 'end', name: 'End', bg: '#111827', text: 'Done', next: '', setFlags: [], choices: [], autoBranches: [], dialogues: [], characters: [], ending: { kind: 'good', title: 'Native End' } },
  ],
  characters: [],
};

function assert(condition, message, detail) {
  if (!condition) throw new Error(message + (detail ? ` ${JSON.stringify(detail)}` : ''));
  console.log('  PASS ' + message);
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try { const response = await fetch(origin + '/healthz'); if (response.ok) return; } catch (_) {}
    await sleep(150);
  }
  throw new Error('server did not become ready');
}

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  try {
    await waitReady();
    const response = await fetch(origin + '/api/export-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project }),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(response.status === 200, 'export endpoint returns HTTP 200', { status: response.status, body: bytes.toString('utf8', 0, 200) });
    assert(response.headers.get('content-type') === 'application/vnd.microsoft.portable-executable', 'response MIME is a Windows PE application', { contentType: response.headers.get('content-type') });
    assert(/filename\*=UTF-8''Native%20Export%20Probe\.exe/i.test(response.headers.get('content-disposition') || ''), 'download filename is one exe', { disposition: response.headers.get('content-disposition') });
    assert(bytes[0] === 0x4d && bytes[1] === 0x5a && bytes.slice(0, 4).toString('ascii') !== 'PK\x03\x04', 'response starts with MZ instead of ZIP');
    assert(Number(response.headers.get('content-length')) === bytes.length, 'content length matches exported application', { bytes: bytes.length });

    const trailerMagic = bytes.slice(-magic.length);
    assert(trailerMagic.equals(magic), 'exported application contains the native payload trailer');
    const jsonLength = Number(bytes.readBigUInt64LE(bytes.length - magic.length - 8));
    const jsonStart = bytes.length - magic.length - 8 - jsonLength;
    const embedded = JSON.parse(bytes.slice(jsonStart, jsonStart + jsonLength).toString('utf8'));
    assert(embedded.id === project.id && embedded.title === project.title && embedded.scenes.length === 2, 'project JSON is embedded directly in the executable', embedded);
    assert(!/electron|chromium|webview|game\.html/i.test(bytes.toString('latin1')), 'exported application contains no browser wrapper markers');

    fs.writeFileSync(exePath, bytes);
    const run = spawnSync(exePath, [`--self-test=${reportPath}`], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert(run.status === 0, 'exported application executes its self-test successfully', { status: run.status, error: run.error && run.error.message, stderr: run.stderr });
    assert(fs.existsSync(reportPath), 'exported application writes a self-test report');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert(report.ok === true && report.runtime === 'WinForms-GDI+' && report.projectId === project.id && report.sceneCount === 2, 'self-test proves the EXE read its own embedded project', report);
    const conditionRun = spawnSync(exePath, [`--condition-self-test=${conditionReportPath}`], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert(conditionRun.status === 0 && fs.existsSync(conditionReportPath), 'native condition self-test executes', { status: conditionRun.status });
    const conditionReport = JSON.parse(fs.readFileSync(conditionReportPath, 'utf8'));
    assert(conditionReport.ok === true, 'native conditions match project/read/ending state', conditionReport);

    const screenshotRun = spawnSync(exePath, [`--screenshot=${screenshotPath}`], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert(screenshotRun.status === 0, 'exported application opens and exits after rendering a scene', { status: screenshotRun.status, error: screenshotRun.error && screenshotRun.error.message, stderr: screenshotRun.stderr });
    assert(fs.existsSync(screenshotPath) && fs.statSync(screenshotPath).size > 10000, 'native game window produces a non-empty screenshot', { bytes: fs.existsSync(screenshotPath) ? fs.statSync(screenshotPath).size : 0 });
    const png = fs.readFileSync(screenshotPath);
    assert(png.slice(1, 4).toString('ascii') === 'PNG', 'rendered window screenshot is a valid PNG');
    console.log('SCREENSHOT=' + screenshotPath);
    console.log('========== Native export integration: 15 passed / 0 failed ==========');
  } finally {
    try { server.kill(); } catch (_) {}
    await sleep(200);
    if (!keepArtifacts) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    } else {
      console.log('TEST_ARTIFACT_DIR=' + tempDir);
    }
  }
})().catch(error => { console.error('  FAIL ' + error.stack); process.exitCode = 1; });
