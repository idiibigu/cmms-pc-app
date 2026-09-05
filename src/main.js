// EEIS Desktop — Electron main process.
// This is a placeholder scaffold, not yet functional. Phase 1 work (the
// app-URL/email/password first-run flow, then loading the real web app in
// this window) is tracked in ../../.claude/skills/eeis-desktop-app/SKILL.md
// in the main project — read that before building it out.

const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'placeholder.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
