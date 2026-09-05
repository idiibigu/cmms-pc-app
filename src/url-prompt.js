// Renderer script for url-prompt.html. Runs with contextIsolation on and no
// Node integration — talks to the main process only via the bridge exposed
// in preload.js (window.eeisDesktop).

const input = document.getElementById('app-url');
const btn = document.getElementById('btn-continue');
const errorEl = document.getElementById('error');

function normalizeUrl(raw) {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return { error: 'Enter your app URL.' };
  if (!/^https:\/\//i.test(trimmed)) {
    return { error: 'The URL must start with https:// — this app never connects unencrypted.' };
  }
  try {
    new URL(trimmed);
  } catch (_) {
    return { error: 'That does not look like a valid URL.' };
  }
  return { url: trimmed };
}

async function submit() {
  errorEl.textContent = '';
  const { url, error } = normalizeUrl(input.value);
  if (error) { errorEl.textContent = error; return; }

  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const reachable = await window.eeisDesktop.checkAppUrl(url);
    if (!reachable) {
      errorEl.textContent = 'Could not reach that address. Check the URL and your internet connection.';
      btn.disabled = false;
      btn.textContent = 'Continue';
      return;
    }
    await window.eeisDesktop.saveAppUrlAndLoad(url);
    // Main process now navigates this window to the real app — nothing
    // else to do here.
  } catch (e) {
    errorEl.textContent = 'Something went wrong: ' + (e?.message || e);
    btn.disabled = false;
    btn.textContent = 'Continue';
  }
}

btn.addEventListener('click', submit);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
