// Context-isolated bridge between every renderer page and the main
// process. Renderer pages never talk to the server directly — all HTTP
// happens in main.js, which is the only place that knows the auth token.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eeisDesktop', {
  checkAppUrl: (url) => ipcRenderer.invoke('check-app-url', url),
  saveAppUrlAndLoad: (url) => ipcRenderer.invoke('save-app-url-and-load', url),
  login: (username, password) => ipcRenderer.invoke('auth-login', { username, password }),
  getPublicBranding: () => ipcRenderer.invoke('get-public-branding'),
  logout: () => ipcRenderer.invoke('logout'),
  api: (path, method, body) => ipcRenderer.invoke('api-request', { path, method, body }),
  setWindowIcon: (logoUrl) => ipcRenderer.invoke('set-window-icon', logoUrl),
});
