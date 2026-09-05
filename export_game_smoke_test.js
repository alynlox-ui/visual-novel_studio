// export_game_smoke_test.js - native single-file Windows application export
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const sourcePath = 'native-player/VisualNovelNativePlayer.cs';
const exePath = 'native-player/dist/visual-novel-native.exe';
const results = [];
function check(name, value, detail) {
  results.push({ name, ok: !!value, detail });
  console.log((value ? '  PASS ' : '  FAIL ') + name + (detail ? ' ' + JSON.stringify(detail) : ''));
}

check('export button is connected to the Windows application export',
  html.includes('id="btnExportGame"') && html.includes('function exportCompleteGame()') && html.includes("'/api/export-game'"));
check('browser prepares native-compatible SVG assets before export',
  html.includes('async function prepareNativeProject') && html.includes('nativeRasterizeSvg') && html.includes('await prepareNativeProject'));
check('browser downloads one exe instead of a zip',
  html.includes("+'.exe'") && !html.includes("+'.windows.zip'") && !html.includes('gameHtml:playableHtml()'));
check('server returns a PE application response',
  server.includes('application/vnd.microsoft.portable-executable') && /title\s*\+\s*'\.exe'/.test(server) && server.includes("'Content-Length'"));
check('server embeds project JSON in the executable overlay',
  server.includes('VNSNATIVEAPP0001') && server.includes('writeBigUInt64LE') && server.includes('Buffer.concat'));
check('server no longer builds an Electron/HTML zip bundle',
  !server.includes("require('archiver')") && !server.includes("{name:'game.html'}") && !server.includes("'application/zip'"));
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
check('project has no Electron or ZIP packaging dependency',
  !((packageJson.dependencies || {}).archiver) && !((packageJson.dependencies || {}).electron) && !((packageJson.devDependencies || {}).electron));
check('legacy Electron player shell is removed',
  !fs.existsSync('player-shell/main.js') && !fs.existsSync('player-shell/package.json') && !fs.existsSync('player-shell/dist/visual-novel-player.exe'));
check('native player has a reproducible Windows build script', fs.existsSync('native-player/build.cmd'));
check('native player source exists', fs.existsSync(sourcePath));
if (fs.existsSync(sourcePath)) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  check('native source uses Windows application controls', source.includes('System.Windows.Forms') && source.includes('class GameForm'));
  check('native source preserves explicit zero position and opacity values', source.includes('public double? x') && source.includes('public double? opacity') && source.includes('character.opacity ?? 1'));
  check('native UI preserves zero panel opacity', !source.includes('ui.textbox.opacity <= 0') && !source.includes('ui.choices.opacity <= 0'));
  check('native source has no embedded browser runtime', !/electron|chromium|webview|game\.html/i.test(source));
  check('native source reads the project from its own executable', source.includes('VNSNATIVEAPP0001') && source.includes('Application.ExecutablePath'));
}
check('native player PE is built', fs.existsSync(exePath));
if (fs.existsSync(exePath)) {
  const exe = fs.readFileSync(exePath);
  const strings = exe.toString('latin1');
  check('native player has a valid compact PE image', exe[0] === 0x4d && exe[1] === 0x5a && exe.length > 20000 && exe.length < 10 * 1024 * 1024, { bytes: exe.length });
  check('native player binary contains no browser engine marker', !/electron|chromium|webview|game\.html/i.test(strings));
}

const failed = results.filter(result => !result.ok).length;
console.log('========== Native Windows export: ' + (results.length - failed) + ' passed / ' + failed + ' failed ==========');
process.exit(failed ? 1 : 0);
