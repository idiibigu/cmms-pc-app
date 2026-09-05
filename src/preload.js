// Context-isolated bridge between the url-prompt renderer and the main
// process. The real web app, once loaded, is NOT given this bridge —
// it runs as plain web content exactly like it does in a browser tab, per
// the "wrap, don't rebuild" decision in .claude/skills/eeis-desktop-app/
// SKILL.md: no custom auth/session code, just the same app the browser
// already serves.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eeisDesktop', {
  checkAppUrl: (url) => ipcRenderer.invoke('check-app-url', url),
  saveAppUrlAndLoad: (url) => ipcRenderer.invoke('save-app-url-and-load', url),
});
