// EEIS Desktop — Electron main process.
//
// Revised direction (see .claude/skills/eeis-desktop-app/SKILL.md): the
// desktop app has its OWN native-styled screens (login, dashboard,
// equipment, work orders, projects), not an embedded copy of the web
// pages. It reads/writes the exact same data by calling the same JSON
// APIs the web app already uses (api/*.php) — no new backend endpoints,
// no duplicated business logic, just a different renderer on top.
//
// Auth: api/config.php's getTokenFromRequest() already accepts a plain
// "Authorization: Bearer <token>" header (its 3rd/4th fallback, after
// cookies) — see api/config.php around getTokenFromRequest(). That means
// this desktop app needs no cookie jar at all: log in once via
// POST /api/auth.php, keep the returned token, and send it as a Bearer
// header on every request after that.
const { app, BrowserWindow, ipcMain, net, Menu } = require('electron');
const path = require('path');
const Store = require('./store');

let mainWindow = null;

function showUrlPrompt() {
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'url-prompt.html'));
}

function showLogin() {
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'login.html'));
}

function showApp() {
  if (mainWindow) mainWindow.loadFile(path.join(__dirname, 'app.html'));
}

function buildMenu() {
  const template = [
    {
      label: 'idiibi CMMS',
      submenu: [
        {
          label: 'Change Server…',
          click: () => { Store.set('appUrl', ''); Store.set('token', ''); showUrlPrompt(); },
        },
        {
          label: 'Log Out',
          click: () => { Store.set('token', ''); showLogin(); },
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
  const savedToken = Store.get('token');
  if (savedUrl && savedToken) {
    showApp();
  } else if (savedUrl) {
    showLogin();
  } else {
    showUrlPrompt();
  }
}

// ── URL-entry screen ────────────────────────────────────────────────────
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
  showLogin();
  return true;
});

// Public — the login screen shows the company's logo/name before anyone is
// authenticated, exactly like the web login page does (api/branding.php's
// GET action is intentionally public for this reason).
ipcMain.handle('get-public-branding', async () => {
  const appUrl = Store.get('appUrl');
  if (!appUrl) return { error: 'No server configured.' };
  try {
    const res = await fetch(appUrl + '/api/branding.php');
    const data = await res.json().catch(() => ({}));
    return { data: data.data || data };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Native login ─────────────────────────────────────────────────────────
ipcMain.handle('auth-login', async (_event, { username, password }) => {
  const appUrl = Store.get('appUrl');
  if (!appUrl) return { error: 'No server configured.' };
  try {
    const res = await fetch(appUrl + '/api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      return { error: data.error || 'Login failed.' };
    }
    Store.set('token', data.token);
    showApp();
    return { success: true, user: data.user };
  } catch (e) {
    return { error: 'Could not reach the server: ' + e.message };
  }
});

ipcMain.handle('logout', async () => {
  Store.set('token', '');
  showLogin();
  return true;
});

// ── Generic authenticated API call for the app screens ──────────────────
// path is a bare "/xxx.php?..." string (matching js/app.js's API.request
// convention) — never a full URL, so the renderer can never be tricked
// into pointing this at an arbitrary host.
ipcMain.handle('api-request', async (_event, { path: apiPath, method, body }) => {
  const appUrl = Store.get('appUrl');
  const token = Store.get('token');
  if (!appUrl || !token) return { error: 'Not connected.' };
  if (typeof apiPath !== 'string' || !apiPath.startsWith('/')) {
    return { error: 'Invalid request path.' };
  }
  try {
    const res = await fetch(appUrl + '/api' + apiPath, {
      method: method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      Store.set('token', '');
      showLogin();
      return { error: 'Session expired. Please log in again.' };
    }
    if (!res.ok) return { error: data.error || ('Request failed (' + res.status + ')') };
    return { data };
  } catch (e) {
    return { error: 'Network error: ' + e.message };
  }
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
