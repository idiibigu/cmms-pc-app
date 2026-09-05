// EEIS Desktop — Electron main process.
//
// Phase 1: ask for the company's app URL (https:// only) once, then load
// the real web app in this window and let it handle login/session exactly
// as it does in a browser tab — no separate auth code here. Electron's
// default persistent session partition keeps cookies/localStorage across
// restarts the same way a browser profile would, so the web app's own
// "remember me" behavior just works. See
// .claude/skills/eeis-desktop-app/SKILL.md in the main project repo for
// the full plan and the reasoning behind this approach.

const { app, BrowserWindow, ipcMain, net, Menu } = require('electron');
const path = require('path');
const Store = require('./store');

let mainWindow = null;

function showUrlPrompt() {
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'url-prompt.html'));
}

function buildMenu() {
  const template = [
    {
      label: 'EEIS',
      submenu: [
        {
          label: 'Change Server…',
          click: () => { Store.set('appUrl', ''); showUrlPrompt(); },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const savedUrl = Store.get('appUrl');
  if (savedUrl) {
    mainWindow.loadURL(savedUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'url-prompt.html'));
  }
}

// Reachability check for the URL-entry screen — a plain GET so a typo'd or
// unreachable address is caught before it's saved, rather than silently
// saving a dead URL and reloading into a blank/error window.
ipcMain.handle('check-app-url', async (_event, url) => {
  return new Promise((resolve) => {
    const request = net.request({ method: 'GET', url });
    const timer = setTimeout(() => { request.abort(); resolve(false); }, 8000);
    request.on('response', (response) => {
      clearTimeout(timer);
      resolve(response.statusCode >= 200 && response.statusCode < 400);
    });
    request.on('error', () => { clearTimeout(timer); resolve(false); });
    request.end();
  });
});

ipcMain.handle('save-app-url-and-load', async (_event, url) => {
  Store.set('appUrl', url);
  if (mainWindow) mainWindow.loadURL(url);
  return true;
});

app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
