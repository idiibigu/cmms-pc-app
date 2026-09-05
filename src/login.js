const form = document.getElementById('login-form');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const errorEl = document.getElementById('error');
const btn = document.getElementById('btn-login');

(async function loadBranding() {
  const res = await window.eeisDesktop.getPublicBranding();
  if (res?.data) {
    const b = res.data;
    if (b.company_name) document.getElementById('company-name').textContent = b.company_name;
    if (b.logo_url) {
      const img = document.getElementById('logo');
      img.src = b.logo_url;
      img.hidden = false;
    }
  }
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  if (!email || !password) {
    errorEl.textContent = 'Enter your email and password.';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  const res = await window.eeisDesktop.login(email, password);
  if (res?.error) {
    errorEl.textContent = res.error;
    btn.disabled = false;
    btn.textContent = 'Sign In';
    return;
  }
  // On success the main process navigates this window to app.html.
});
