'use strict';
// Run the actual compiled player, not a source-marker substitute.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const assert = require('assert/strict');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vns-director-native-'));
try {
  const reportPath = path.join(dir, 'director.json');
  const exe = path.join(__dirname, 'native-player/dist/visual-novel-native.exe');
  const result = spawnSync(exe, ['--director-self-test=' + reportPath], {
    encoding: 'utf8', windowsHide: true, timeout: 45000
  });
  assert.equal(result.error, undefined, result.error && result.error.message);
  assert.equal(result.status, 0, result.stderr || 'Director self-test process failed');
  assert.ok(fs.existsSync(reportPath), 'The executable must produce a fresh director report');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.ok(Array.isArray(report.checks) && report.checks.length >= 38, 'Report requires all director behavior checks');
  assert.ok(report.checks.every(check=>String(check).endsWith('=true')), 'Every reported behavior must pass');
  assert.equal(report.checkCount, report.checks.length, 'Report count matches executed checks');
  console.log(JSON.stringify(report, null, 2));
} finally {
  fs.rmSync(dir, {recursive:true, force:true});
}
