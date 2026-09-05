const main = document.getElementById('main');
const navButtons = document.querySelectorAll('.nav-btn[data-view]');

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function setActiveNav(view) {
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
}

async function loadBranding() {
  const res = await window.eeisDesktop.api('/branding.php');
  if (res?.data?.data) {
    const b = res.data.data;
    if (b.company_name) document.getElementById('company-name').textContent = b.company_name;
    if (b.logo_url) {
      const img = document.getElementById('logo');
      img.src = b.logo_url;
      img.hidden = false;
    }
  }
}

function renderTable(headers, rows) {
  if (!rows.length) return '<div class="state-msg">No records found.</div>';
  return '<table><thead><tr>' + headers.map((h) => `<th>${esc(h)}</th>`).join('') + '</tr></thead><tbody>' +
    rows.join('') + '</tbody></table>';
}

async function viewDashboard() {
  main.innerHTML = '<h2>Dashboard</h2><div class="sub">Live overview of your company</div><div class="state-msg">Loading…</div>';
  const [eq, tasks, projects] = await Promise.all([
    window.eeisDesktop.api('/milestones.php'),
    window.eeisDesktop.api('/tasks.php'),
    window.eeisDesktop.api('/projects.php'),
  ]);
  if (eq?.error || tasks?.error || projects?.error) {
    main.innerHTML = '<h2>Dashboard</h2><div class="error-msg">' + esc(eq?.error || tasks?.error || projects?.error) + '</div>';
    return;
  }
  const eqCount = eq.data?.total ?? (eq.data?.data || []).length;
  const taskList = tasks.data?.data || [];
  const openTasks = taskList.filter((t) => !/complete/i.test(t.status || '')).length;
  const projList = projects.data?.data || [];
  const activeProjects = projList.filter((p) => !/finish|cancel/i.test(p.status || '')).length;

  main.innerHTML = `
    <h2>Dashboard</h2>
    <div class="sub">Live overview of your company</div>
    <div class="kpi-row">
      <div class="kpi"><div class="lbl">Equipment</div><div class="val">${eqCount}</div></div>
      <div class="kpi"><div class="lbl">Open Work Orders</div><div class="val">${openTasks}</div></div>
      <div class="kpi"><div class="lbl">Total Work Orders</div><div class="val">${taskList.length}</div></div>
      <div class="kpi"><div class="lbl">Active Projects</div><div class="val">${activeProjects}</div></div>
    </div>
  `;
}

async function viewEquipment() {
  main.innerHTML = '<h2>Equipment</h2><div class="sub">Every asset registered in the company</div><div class="state-msg">Loading…</div>';
  const res = await window.eeisDesktop.api('/milestones.php');
  if (res?.error) { main.innerHTML = '<h2>Equipment</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((m) => `
    <tr>
      <td>${esc(m.milestone_title)}</td>
      <td><span class="badge">${esc(m.status)}</span></td>
      <td>${esc(m.project_label || m.project_id)}</td>
      <td>${esc(m.equipment_code || '—')}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Equipment</h2><div class="sub">Every asset registered in the company</div>' +
    renderTable(['Title', 'Status', 'Project', 'Code'], rows);
}

async function viewTasks() {
  main.innerHTML = '<h2>Work Orders</h2><div class="sub">Every work order across all projects</div><div class="state-msg">Loading…</div>';
  const res = await window.eeisDesktop.api('/tasks.php');
  if (res?.error) { main.innerHTML = '<h2>Work Orders</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((t) => `
    <tr>
      <td>${esc(t.heading)}</td>
      <td><span class="badge">${esc(t.status)}</span></td>
      <td>${esc(t.priority || '—')}</td>
      <td>${esc(t.due_date || '—')}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Work Orders</h2><div class="sub">Every work order across all projects</div>' +
    renderTable(['Title', 'Status', 'Priority', 'Due Date'], rows);
}

async function viewProjects() {
  main.innerHTML = '<h2>Projects</h2><div class="sub">All projects in the company</div><div class="state-msg">Loading…</div>';
  const res = await window.eeisDesktop.api('/projects.php');
  if (res?.error) { main.innerHTML = '<h2>Projects</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((p) => `
    <tr>
      <td>${esc(p.project_name)}</td>
      <td><span class="badge">${esc(p.status)}</span></td>
      <td>${esc(p.start_date || '—')}</td>
      <td>${esc(p.deadline || p.end_date || '—')}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Projects</h2><div class="sub">All projects in the company</div>' +
    renderTable(['Name', 'Status', 'Start', 'Deadline'], rows);
}

const views = { dashboard: viewDashboard, equipment: viewEquipment, tasks: viewTasks, projects: viewProjects };

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    setActiveNav(btn.dataset.view);
    views[btn.dataset.view]();
  });
});

document.getElementById('btn-refresh').addEventListener('click', () => {
  const active = document.querySelector('.nav-btn.active')?.dataset.view || 'dashboard';
  views[active]();
});

document.getElementById('btn-logout').addEventListener('click', () => {
  window.eeisDesktop.logout();
});

loadBranding();
viewDashboard();
