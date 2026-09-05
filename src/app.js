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
    if (b.primary_color) document.documentElement.style.setProperty('--accent', b.primary_color);
    if (b.logo_url) {
      const img = document.getElementById('logo');
      img.src = b.logo_url;
      img.hidden = false;
      window.eeisDesktop.setWindowIcon(b.logo_url);
    }
  }
}

function setCrumb(text) {
  const el = document.getElementById('crumb');
  if (el) el.innerHTML = text;
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
    window.eeisDesktop.api('/tasks.php?all=1'),
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
  const res = await window.eeisDesktop.api('/tasks.php?all=1');
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
  setCrumb('Projects');
  main.innerHTML = '<h2>Projects</h2><div class="sub">All projects in the company — click one to see everything inside it</div><div class="state-msg">Loading…</div>';
  const res = await window.eeisDesktop.api('/projects.php');
  if (res?.error) { main.innerHTML = '<h2>Projects</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((p) => `
    <tr class="clickable" data-project-id="${esc(p.id)}" data-project-name="${esc(p.project_name)}">
      <td>${esc(p.project_name)}</td>
      <td><span class="badge">${esc(p.status)}</span></td>
      <td>${esc(p.start_date || '—')}</td>
      <td>${esc(p.deadline || p.end_date || '—')}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Projects</h2><div class="sub">All projects in the company — click one to see everything inside it</div>' +
    renderTable(['Name', 'Status', 'Start', 'Deadline'], rows);
  main.querySelectorAll('tr[data-project-id]').forEach((tr) => {
    tr.addEventListener('click', () => openProjectDetail(tr.dataset.projectId, tr.dataset.projectName));
  });
}

// Drill-down: everything linked to one project (equipment, work orders,
// events, fire alarm, meters) on a single page — this is the "open a
// project and see what's inside it" view.
async function openProjectDetail(projectId, projectName) {
  setActiveNav(null);
  setCrumb('Projects &rsaquo; <strong>' + esc(projectName) + '</strong>');
  main.innerHTML = '<div class="back-link" id="back-to-projects">&larr; Back to Projects</div>'
    + '<h2>' + esc(projectName) + '</h2><div class="sub">Everything linked to this project</div>'
    + '<div class="state-msg">Loading…</div>';
  document.getElementById('back-to-projects').addEventListener('click', () => { setActiveNav('projects'); viewProjects(); });

  const [eq, tasks, events, fire, meters] = await Promise.all([
    window.eeisDesktop.api('/milestones.php?project_id=' + projectId),
    window.eeisDesktop.api('/tasks.php?project_id=' + projectId),
    window.eeisDesktop.api('/events.php?action=list&project_id=' + projectId),
    window.eeisDesktop.api('/fire-alarm.php?action=list&project_id=' + projectId),
    window.eeisDesktop.api('/utility-meters.php?action=meters&project_id=' + projectId),
  ]);

  const section = (title, headers, rows) => `
    <div class="section-block">
      <h3>${esc(title)} (${rows.length})</h3>
      ${renderTable(headers, rows)}
    </div>
  `;

  const eqRows = (eq.data?.data || []).map((m) => `
    <tr><td>${esc(m.milestone_title)}</td><td><span class="badge">${esc(m.status)}</span></td><td>${esc(m.equipment_code || '—')}</td></tr>
  `);
  const taskRows = (tasks.data?.data || []).map((t) => `
    <tr><td>${esc(t.heading)}</td><td><span class="badge">${esc(t.status)}</span></td><td>${esc(t.priority || '—')}</td></tr>
  `);
  const eventRows = (events.data?.data || []).map((ev) => `
    <tr><td>${esc(ev.title)}</td><td><span class="badge">${esc(ev.severity)}</span></td><td><span class="badge">${esc(ev.status)}</span></td></tr>
  `);
  const fireRows = (fire.data?.data || []).map((f) => `
    <tr><td>${esc(f.alarm_type)}</td><td>${esc(f.location_area || '—')}</td><td><span class="badge">${esc(f.status)}</span></td></tr>
  `);
  const meterRows = (meters.data?.data || []).map((m) => `
    <tr><td>${esc(m.label)}</td><td><span class="badge">${esc(m.meter_type)}</span></td><td>${m.is_active ? 'Active' : 'Inactive'}</td></tr>
  `);

  main.innerHTML = '<div class="back-link" id="back-to-projects">&larr; Back to Projects</div>'
    + '<h2>' + esc(projectName) + '</h2><div class="sub">Everything linked to this project</div>'
    + section('Equipment', ['Title', 'Status', 'Code'], eqRows)
    + section('Work Orders', ['Title', 'Status', 'Priority'], taskRows)
    + section('Project Events', ['Title', 'Severity', 'Status'], eventRows)
    + section('Fire Alarm', ['Type', 'Location', 'Status'], fireRows)
    + section('Utility Meters', ['Label', 'Type', 'Status'], meterRows);
  document.getElementById('back-to-projects').addEventListener('click', () => { setActiveNav('projects'); viewProjects(); });
}

async function viewEvents() {
  main.innerHTML = '<h2>Project Events</h2><div class="sub">Urgent notes reported on any project</div><div class="state-msg">Loading…</div>';
  const res = await window.eeisDesktop.api('/events.php?action=list');
  if (res?.error) { main.innerHTML = '<h2>Project Events</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((ev) => `
    <tr>
      <td>${esc(ev.title)}</td>
      <td><span class="badge">${esc(ev.severity)}</span></td>
      <td><span class="badge">${esc(ev.status)}</span></td>
      <td>${esc(ev.project_title || ev.project_id)}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Project Events</h2><div class="sub">Urgent notes reported on any project</div>' +
    renderTable(['Title', 'Severity', 'Status', 'Project'], rows);
}

async function viewFireAlarm() {
  main.innerHTML = '<h2>Fire Alarm</h2><div class="sub">Panel events reported across the company</div><div class="state-msg">Loading…</div>';
  const res = await window.eeisDesktop.api('/fire-alarm.php?action=list');
  if (res?.error) { main.innerHTML = '<h2>Fire Alarm</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((f) => `
    <tr>
      <td>${esc(f.alarm_type)}</td>
      <td>${esc(f.location_area || f.equipment_title || '—')}</td>
      <td><span class="badge">${esc(f.severity)}</span></td>
      <td><span class="badge">${esc(f.status)}</span></td>
    </tr>
  `);
  main.innerHTML = '<h2>Fire Alarm</h2><div class="sub">Panel events reported across the company</div>' +
    renderTable(['Type', 'Location', 'Severity', 'Status'], rows);
}

async function viewMeters() {
  main.innerHTML = '<h2>Utility Meters</h2><div class="sub">Water/electricity/gas meters registered</div><div class="state-msg">Loading…</div>';
  const res = await window.eeisDesktop.api('/utility-meters.php?action=meters');
  if (res?.error) { main.innerHTML = '<h2>Utility Meters</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((m) => `
    <tr>
      <td>${esc(m.label)}</td>
      <td><span class="badge">${esc(m.meter_type)}</span></td>
      <td>${esc(m.project_title || m.project_id || '—')}</td>
      <td>${m.is_active ? 'Active' : 'Inactive'}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Utility Meters</h2><div class="sub">Water/electricity/gas meters registered</div>' +
    renderTable(['Label', 'Type', 'Project', 'Status'], rows);
}

async function viewWarehouse() {
  main.innerHTML = '<h2>Warehouse</h2><div class="sub">Pick a project to see its stock</div><div class="state-msg">Loading…</div>';
  const res = await window.eeisDesktop.api('/warehouse.php?action=projects');
  if (res?.error) { main.innerHTML = '<h2>Warehouse</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const projectList = res.data?.data || [];
  if (!projectList.length) { main.innerHTML = '<h2>Warehouse</h2><div class="state-msg">No projects found.</div>'; return; }

  const options = projectList.map((p) => `<option value="${esc(p.id)}">${esc(p.title)} (${p.warehouse_item_count ?? 0} items)</option>`).join('');
  main.innerHTML = `
    <h2>Warehouse</h2>
    <div class="sub">Pick a project to see its stock</div>
    <select id="wh-project-select" style="padding:8px 12px;border-radius:8px;border:1px solid #cbd5e1;margin-bottom:16px;min-width:280px;">${options}</select>
    <div id="wh-items"><div class="state-msg">Select a project above.</div></div>
  `;
  const select = document.getElementById('wh-project-select');
  const loadItems = async (projectId) => {
    document.getElementById('wh-items').innerHTML = '<div class="state-msg">Loading…</div>';
    const itemsRes = await window.eeisDesktop.api('/warehouse.php?action=warehouse_items&project_id=' + projectId);
    if (itemsRes?.error) { document.getElementById('wh-items').innerHTML = '<div class="error-msg">' + esc(itemsRes.error) + '</div>'; return; }
    const rows = (itemsRes.data?.data || []).map((it) => `
      <tr>
        <td>${esc(it.name)}</td>
        <td><span class="badge">${esc(it.type)}</span></td>
        <td>${esc(it.quantity)} ${esc(it.unit || '')}</td>
        <td>${esc(it.description || '—')}</td>
      </tr>
    `);
    document.getElementById('wh-items').innerHTML = renderTable(['Item', 'Type', 'Quantity', 'Description'], rows);
  };
  select.addEventListener('change', () => loadItems(select.value));
  loadItems(select.value);
}

async function viewChecklists() {
  main.innerHTML = '<h2>Routine Checklists</h2><div class="sub">Active checklist templates across the company</div><div class="state-msg">Loading…</div>';
  const res = await window.eeisDesktop.api('/daily-checklists.php?action=checklists_all');
  if (res?.error) { main.innerHTML = '<h2>Routine Checklists</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((c) => `
    <tr>
      <td>${esc(c.title_en || c.title_ar)}</td>
      <td><span class="badge">${esc(c.status)}</span></td>
      <td>${esc(c.recurrence_type || '—')}</td>
      <td>${esc(c.recurrence_anchor_date || '—')}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Routine Checklists</h2><div class="sub">Active checklist templates across the company</div>' +
    renderTable(['Title', 'Status', 'Frequency', 'Anchor Date'], rows);
}

async function viewQuotations() {
  main.innerHTML = '<h2>Quotations</h2><div class="sub">All price quotations issued</div><div class="state-msg">Loading…</div>';
  const res = await window.eeisDesktop.api('/quotations.php?action=list');
  if (res?.error) { main.innerHTML = '<h2>Quotations</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.quotations || []).map((q) => `
    <tr>
      <td>${esc(q.quotation_number)}</td>
      <td>${esc(q.client_name || '—')}</td>
      <td>${esc(q.project_name || '—')}</td>
      <td><span class="badge">${esc(q.status)}</span></td>
      <td>${esc(Number(q.total || 0).toLocaleString())}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Quotations</h2><div class="sub">All price quotations issued</div>' +
    renderTable(['#', 'Client', 'Project', 'Status', 'Total'], rows);
}

async function viewUsers() {
  main.innerHTML = '<h2>Users</h2><div class="sub">Everyone with access to this company</div><div class="state-msg">Loading…</div>';
  const res = await window.eeisDesktop.api('/roles_permissions.php?action=users');
  if (res?.error) { main.innerHTML = '<h2>Users</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const limit = res.data?.limit;
  const rows = (res.data?.users || []).map((u) => `
    <tr>
      <td>${esc(u.name)}</td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.role_display_name || u.role_name || '—')}</td>
      <td><span class="badge">${esc(u.status)}</span></td>
    </tr>
  `);
  const seatLine = limit?.max_users
    ? `<div class="sub">Seats used: ${limit.current_users} / ${limit.max_users} (${esc(limit.plan_name || '')})</div>`
    : '';
  main.innerHTML = '<h2>Users</h2><div class="sub">Everyone with access to this company</div>' + seatLine +
    renderTable(['Name', 'Email', 'Role', 'Status'], rows);
}

async function viewNotifications() {
  main.innerHTML = '<h2>Notifications</h2><div class="sub">Your most recent alerts</div><div class="state-msg">Loading…</div>';
  const res = await window.eeisDesktop.api('/notifications.php?limit=50');
  if (res?.error) { main.innerHTML = '<h2>Notifications</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((n) => `
    <tr>
      <td>${n.read ? '' : '<strong>●</strong> '}${esc(n.title)}</td>
      <td>${esc(n.body || '—')}</td>
      <td>${esc(n.module || '—')}</td>
      <td>${esc(n.created_at || '—')}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Notifications</h2><div class="sub">Your most recent alerts (' + (res.data?.unread_count ?? 0) + ' unread)</div>' +
    renderTable(['Title', 'Body', 'Module', 'Received'], rows);
}

const views = {
  dashboard: viewDashboard, equipment: viewEquipment, tasks: viewTasks, projects: viewProjects,
  events: viewEvents, firealarm: viewFireAlarm, meters: viewMeters, warehouse: viewWarehouse,
  checklists: viewChecklists, quotations: viewQuotations, users: viewUsers, notifications: viewNotifications,
};

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
