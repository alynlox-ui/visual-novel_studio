const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

function exportDir() {
  return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
}

function createWindow() {
  const gameFile = path.join(exportDir(), 'game.html');
  const fallback = path.join(__dirname, 'default-game.html');
  const target = fs.existsSync(gameFile) ? gameFile : fallback;
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    autoHideMenuBar: true,
    backgroundColor: '#111111',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(target).catch(err => {
    dialog.showErrorBox('游戏启动失败', String(err && err.message || err));
    app.quit();
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
