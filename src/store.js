// Minimal local config store — just the app URL, which is not a secret
// (unlike the session/password, which stay inside the wrapped web app's
// own cookie/localStorage in Electron's persistent session partition; this
// app never sees or stores the password or session token itself).
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch (_) {
    return {};
  }
}

function writeConfig(data) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  get(key) {
    return readConfig()[key];
  },
  set(key, value) {
    const cfg = readConfig();
    cfg[key] = value;
    writeConfig(cfg);
  },
};
