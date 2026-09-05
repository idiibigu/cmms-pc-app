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
const { app, BrowserWindow, ipcMain, net, Menu, dialog, nativeImage, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const Store = require('./store');

let mainWindow = null;

// ── Auto-update ───────────────────────────────────────────────────────────
// Checks GitHub Releases on https://github.com/idiibigu/cmms-pc-app (see
// package.json's "build.publish") for a newer tagged release than the
// version currently installed, downloads it in the background, and
// installs on next restart. Publishing a new version means: bump
// package.json's "version", then run `npm run release` (requires a
// GH_TOKEN env var with repo write access) — that builds the installer
// AND creates/updates the GitHub Release electron-updater checks against.
// Does nothing during `npm start` (unpackaged dev runs) since autoUpdater
// requires an actual packaged app.
// Logs every autoUpdater event (not just errors) to a plain text file in
// userData, since the only other place these show up is a dialog the user
// has to screenshot for us — with no server access to this app's users'
// machines, this log is the only way to get a real error instead of
// guessing at fixes.
const updateLogPath = () => path.join(app.getPath('userData'), 'update.log');
function logUpdate(line) {
  try {
    fs.appendFileSync(updateLogPath(), `[${new Date().toISOString()}] ${line}\n`);
  } catch (_) { /* best-effort */ }
}

function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.on('checking-for-update', () => logUpdate('checking-for-update'));
  autoUpdater.on('update-available', (info) => logUpdate('update-available: ' + info.version));
  autoUpdater.on('update-not-available', (info) => logUpdate('update-not-available (current: ' + info.version + ')'));
  autoUpdater.on('download-progress', (p) => logUpdate('download-progress: ' + Math.round(p.percent) + '%'));
  autoUpdater.on('update-downloaded', (info) => {
    logUpdate('update-downloaded: ' + info.version);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: `Version ${info.version} has been downloaded. Restart now to install it?`,
      buttons: ['Restart now', 'Later'],
    }).then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
  });
  autoUpdater.on('error', (err) => {
    logUpdate('ERROR: ' + (err.stack || err.message));
  });
  autoUpdater.checkForUpdates().catch((e) => {
    logUpdate('checkForUpdates() rejected: ' + (e.stack || e.message));
    // Silent on the initial auto-check — most likely just a dev/unpackaged
    // run or no internet. The menu's manual "Check for Updates…" still
    // surfaces the error to the user (see buildMenu below).
  });
}

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
        {
          label: 'Check for Updates…',
          click: () => {
            autoUpdater.checkForUpdates().catch((e) => {
              logUpdate('Manual check failed: ' + (e.stack || e.message));
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Could not check for updates',
                message: e.message || String(e),
                detail: 'Full details were saved to:\n' + updateLogPath(),
              });
            });
          },
        },
        {
          label: 'Open Update Log…',
          click: () => { shell.showItemInFolder(updateLogPath()); },
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

// The taskbar/window icon follows the company's own logo from branding,
// same as the color scheme (set client-side from the same branding
// response — see app.js/login.js). Only affects THIS running window, not
// the packaged .exe's file icon (that's baked in at build time and shared
// across all companies using the installer) — good enough for "the app
// looks like our company" while it's open, which is what was asked for.
ipcMain.handle('set-window-icon', async (_event, logoUrl) => {
  if (!mainWindow || !logoUrl) return false;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return false;
    mainWindow.setIcon(img);
    return true;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());

// ── Export: download a file (api/export.php or api/export_import_engine.php
// via export.php) and let the user pick where to save it ──────────────────
ipcMain.handle('export-and-save', async (_event, { apiPath, suggestedName }) => {
  const appUrl = Store.get('appUrl');
  const token = Store.get('token');
  if (!appUrl || !token) return { error: 'Not connected.' };
  try {
    const res = await fetch(appUrl + '/api' + apiPath, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data.error || ('Export failed (' + res.status + ')') };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: suggestedName || 'export.xlsx',
    });
    if (canceled || !filePath) return { canceled: true };
    fs.writeFileSync(filePath, buf);
    return { success: true, filePath };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Import: pick a file, upload it to api/import.php (the same
// ExportImportEngine used by the web app — add/update only, see
// api/export_import_engine.php's commit()) ────────────────────────────────
ipcMain.handle('pick-and-import', async (_event, { module, projectId }) => {
  const appUrl = Store.get('appUrl');
  const token = Store.get('token');
  if (!appUrl || !token) return { error: 'Not connected.' };
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return { canceled: true };
  try {
    const buf = fs.readFileSync(filePaths[0]);
    const form = new FormData();
    form.append('module', module);
    if (projectId) form.append('project_id', String(projectId));
    form.append('file', new Blob([buf]), path.basename(filePaths[0]));
    const res = await fetch(appUrl + '/api/import.php', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || ('Import failed (' + res.status + ')') };
    return { data };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Company Settings (branding) ─────────────────────────────────────────
// api/branding.php's POST only accepts multipart/form-data (it needs to
// accept an optional logo file), so — unlike the generic JSON api-request
// handler above — this one builds a FormData body, same technique as
// pick-and-import above.
ipcMain.handle('pick-logo-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return { canceled: true };
  return { path: filePaths[0], name: path.basename(filePaths[0]) };
});

ipcMain.handle('update-branding', async (_event, { fields, logoPath }) => {
  const appUrl = Store.get('appUrl');
  const token = Store.get('token');
  if (!appUrl || !token) return { error: 'Not connected.' };
  try {
    const form = new FormData();
    Object.entries(fields || {}).forEach(([k, v]) => {
      if (v !== null && v !== undefined) form.append(k, String(v));
    });
    if (logoPath) {
      const buf = fs.readFileSync(logoPath);
      form.append('logo', new Blob([buf]), path.basename(logoPath));
    }
    const res = await fetch(appUrl + '/api/branding.php', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { Store.set('token', ''); showLogin(); return { error: 'Session expired. Please log in again.' }; }
    if (!res.ok) return { error: data.error || ('Save failed (' + res.status + ')') };
    return { data };
  } catch (e) {
    return { error: e.message };
  }
});

// ── Windows/OS notifications ───────────────────────────────────────────
// Polls the same unread-notifications endpoint the web app uses; fires a
// native OS notification only when the unread count goes UP since the
// last check (not on every poll), so re-opening the app doesn't spam a
// notification per already-seen item.
let lastUnreadCount = 0;
async function pollNotifications() {
  const appUrl = Store.get('appUrl');
  const token = Store.get('token');
  if (!appUrl || !token) return;
  try {
    const res = await fetch(appUrl + '/api/notifications.php?action=unread_count', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const data = await res.json().catch(() => ({}));
    const count = data.unread_count ?? 0;
    if (count > lastUnreadCount && Notification.isSupported()) {
      new Notification({
        title: 'idiibi CMMS',
        body: count === 1 ? 'You have 1 new notification.' : `You have ${count} new notifications.`,
      }).show();
    }
    lastUnreadCount = count;
  } catch (_) {
    // Silent — offline or session expired; the next successful api-request
    // call will already handle re-showing the login screen if needed.
  }
}

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
  initAutoUpdater();
  pollNotifications();
  setInterval(pollNotifications, 60000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
