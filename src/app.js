const main = document.getElementById('main');
const navButtons = document.querySelectorAll('.nav-btn[data-view]');

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ── Loading bar ─────────────────────────────────────────────────────────
// Wraps every server call so any screen doing one or more requests shows
// the same top progress bar, instead of each view needing its own
// spinner logic. Calls can overlap (e.g. Promise.all on the dashboard),
// so a counter — not a boolean — decides when to hide it again.
let pendingRequests = 0;
function setLoading(active) {
  pendingRequests = Math.max(0, pendingRequests + (active ? 1 : -1));
  document.getElementById('loading-bar')?.classList.toggle('active', pendingRequests > 0);
}
async function apiCall(path, method, body) {
  setLoading(true);
  try {
    return await window.eeisDesktop.api(path, method, body);
  } finally {
    setLoading(false);
  }
}

// ── Permissions (fetched once after login) ───────────────────────────────
// Server-enforced either way — this is only for hiding Add/Edit/Delete
// controls a user doesn't have rights to, so they don't hit a 403 after
// filling in a form. `type` is one of none|added|owned|both|all per the
// project's permission model; treat anything but 'none' as "can use it"
// for a simple show/hide (not attempting per-record added/owned scoping
// client-side — the server still enforces that on write).
let currentPermissions = {};
async function loadPermissions() {
  const res = await apiCall('/auth.php');
  currentPermissions = res.data?.permissions || {};
}
function can(key) {
  const v = currentPermissions[key];
  return !!v && v !== 'none';
}

function setActiveNav(view) {
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
}

async function loadBranding() {
  const res = await apiCall('/branding.php');
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

// Paginates a long list of pre-rendered <tr> strings into pages of
// `pageSize`, rendered inside `container` with Prev/Next controls —
// used for every list screen so a company with hundreds of records
// doesn't render one giant unscrollable table.
function mountPagedTable(container, headers, rows, pageSize = 15) {
  let page = 0;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  function render() {
    const start = page * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    container.innerHTML = renderTable(headers, pageRows);
    if (rows.length > pageSize) {
      const pager = document.createElement('div');
      pager.className = 'pager';
      pager.innerHTML = `
        <button id="pg-prev" ${page === 0 ? 'disabled' : ''}>&larr; Prev</button>
        <span>Page ${page + 1} of ${totalPages} (${rows.length} total)</span>
        <button id="pg-next" ${page >= totalPages - 1 ? 'disabled' : ''}>Next &rarr;</button>
      `;
      container.appendChild(pager);
      pager.querySelector('#pg-prev').addEventListener('click', () => { page--; render(); });
      pager.querySelector('#pg-next').addEventListener('click', () => { page++; render(); });
    }
  }
  render();
}

async function viewDashboard() {
  main.innerHTML = '<h2>Dashboard</h2><div class="sub">Live overview of your company</div><div class="state-msg">Loading…</div>';
  const [eq, tasks, projects] = await Promise.all([
    apiCall('/milestones.php'),
    apiCall('/tasks.php?all=1'),
    apiCall('/projects.php'),
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

// Export/Import toolbar reused by Equipment, Work Orders, and Projects —
// hands off to the same api/export.php + api/export_import_engine.php
// engine the web app's own Export/Import buttons use (add/update only on
// import, never a delete-by-omission — see the engine's commit()).
function ioToolbarHtml(module) {
  const canExport = can('export_milestones');
  const canImport = can('import_milestones');
  if (!canExport && !canImport) return '';
  return '<div class="toolbar">'
    + (canExport ? `<button class="btn-export" data-module="${module}">Export to Excel</button>` : '')
    + (canImport ? `<button class="btn-import" data-module="${module}">Import from Excel</button>` : '')
    + '</div>';
}
function wireIoToolbar(onDone) {
  main.querySelector('.btn-export')?.addEventListener('click', async (e) => {
    const module = e.target.dataset.module;
    const res = await window.eeisDesktop.exportAndSave('/export.php?module=' + module, module + '.xlsx');
    if (res?.error) alert('Export failed: ' + res.error);
  });
  main.querySelector('.btn-import')?.addEventListener('click', async (e) => {
    const module = e.target.dataset.module;
    const res = await window.eeisDesktop.pickAndImport(module);
    if (res?.canceled) return;
    if (res?.error) { alert('Import failed: ' + res.error); return; }
    const r = res.data || {};
    alert(`Import complete — added ${r.imported ?? 0}, updated ${r.updated ?? 0}, skipped ${r.ignored ?? 0}, failed ${r.failed ?? 0}.`);
    onDone();
  });
}

async function viewEquipment() {
  setCrumb('Equipment');
  main.innerHTML = '<h2>Equipment</h2><div class="sub">Every asset registered in the company</div><div class="state-msg">Loading…</div>';
  const res = await apiCall('/milestones.php');
  if (res?.error) { main.innerHTML = '<h2>Equipment</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((m) => `
    <tr>
      <td>${esc(m.milestone_title)}</td>
      <td><span class="badge">${esc(m.status)}</span></td>
      <td>${esc(m.project_label || m.project_id)}</td>
      <td>${esc(m.equipment_code || '—')}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Equipment</h2><div class="sub">Every asset registered in the company</div>'
    + ioToolbarHtml('milestones') + '<div id="list"></div>';
  mountPagedTable(document.getElementById('list'), ['Title', 'Status', 'Project', 'Code'], rows);
  wireIoToolbar(viewEquipment);
}

async function viewTasks() {
  setCrumb('Work Orders');
  main.innerHTML = '<h2>Work Orders</h2><div class="sub">Every work order across all projects</div><div class="state-msg">Loading…</div>';
  const res = await apiCall('/tasks.php?all=1');
  if (res?.error) { main.innerHTML = '<h2>Work Orders</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((t) => `
    <tr>
      <td>${esc(t.heading)}</td>
      <td><span class="badge">${esc(t.status)}</span></td>
      <td>${esc(t.priority || '—')}</td>
      <td>${esc(t.category_name || '—')}</td>
      <td>${esc(t.due_date || '—')}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Work Orders</h2><div class="sub">Every work order across all projects</div>'
    + ioToolbarHtml('tasks') + '<div id="list"></div>';
  mountPagedTable(document.getElementById('list'), ['Title', 'Status', 'Priority', 'Category', 'Due Date'], rows);
  wireIoToolbar(viewTasks);
}

// Work Order Categories — full CRUD (add/edit/delete), gated on the same
// add_tasks/edit_tasks/delete_tasks permissions api/task_categories.php
// enforces server-side. Deleting a category only detaches it from tasks
// that used it — never deletes the tasks themselves.
async function viewCategories() {
  setCrumb('WO Categories');
  main.innerHTML = '<h2>Work Order Categories</h2><div class="sub">Group work orders by type</div><div class="state-msg">Loading…</div>';
  const res = await apiCall('/task_categories.php');
  if (res?.error) { main.innerHTML = '<h2>Work Order Categories</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const categories = res.data?.data || [];

  const canAdd = can('add_tasks');
  const canEdit = can('edit_tasks');
  const canDelete = can('delete_tasks');

  const rows = categories.map((c) => `
    <tr>
      <td>${esc(c.name_en)}</td>
      <td>${esc(c.name_ar || '—')}</td>
      <td>${esc(c.task_count)}</td>
      <td>
        ${canEdit ? `<button class="btn-edit-cat" data-id="${esc(c.id)}" data-en="${esc(c.name_en)}" data-ar="${esc(c.name_ar || '')}">Edit</button>` : ''}
        ${canDelete ? `<button class="btn-delete-cat" data-id="${esc(c.id)}">Delete</button>` : ''}
      </td>
    </tr>
  `);
  const toolbar = canAdd ? '<div class="toolbar"><button id="btn-add-cat" class="primary">+ Add Category</button></div>' : '';

  main.innerHTML = '<h2>Work Order Categories</h2><div class="sub">Group work orders by type</div>' + toolbar + '<div id="list"></div>';
  mountPagedTable(document.getElementById('list'), ['English Name', 'Arabic Name', 'Work Orders Using It', 'Actions'], rows);

  document.getElementById('btn-add-cat')?.addEventListener('click', () => {
    openModal('Add Category', `
      <label>English Name</label><input name="name_en" required>
      <label>Arabic Name (optional)</label><input name="name_ar">
    `, async (data) => {
      const r = await apiCall('/task_categories.php', 'POST', { name_en: data.name_en, name_ar: data.name_ar });
      if (r?.error) throw new Error(r.error);
      viewCategories();
    });
  });

  main.querySelectorAll('.btn-edit-cat').forEach((btn) => {
    btn.addEventListener('click', () => {
      openModal('Edit Category', `
        <label>English Name</label><input name="name_en" value="${esc(btn.dataset.en)}" required>
        <label>Arabic Name (optional)</label><input name="name_ar" value="${esc(btn.dataset.ar)}">
      `, async (data) => {
        const r = await apiCall('/task_categories.php?id=' + btn.dataset.id, 'PUT', { name_en: data.name_en, name_ar: data.name_ar });
        if (r?.error) throw new Error(r.error);
        viewCategories();
      });
    });
  });

  main.querySelectorAll('.btn-delete-cat').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this category? Work orders using it will just lose the category, not be deleted.')) return;
      const r = await apiCall('/task_categories.php?id=' + btn.dataset.id, 'DELETE');
      if (r?.error) { alert('Delete failed: ' + r.error); return; }
      viewCategories();
    });
  });
}

async function viewProjects() {
  setCrumb('Projects');
  main.innerHTML = '<h2>Projects</h2><div class="sub">All projects in the company — click one to see everything inside it</div><div class="state-msg">Loading…</div>';
  const res = await apiCall('/projects.php');
  if (res?.error) { main.innerHTML = '<h2>Projects</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((p) => `
    <tr class="clickable" data-project-id="${esc(p.id)}" data-project-name="${esc(p.project_name)}">
      <td>${esc(p.project_name)}</td>
      <td><span class="badge">${esc(p.status)}</span></td>
      <td>${esc(p.start_date || '—')}</td>
      <td>${esc(p.deadline || p.end_date || '—')}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Projects</h2><div class="sub">All projects in the company — click one to see everything inside it</div>'
    + ioToolbarHtml('projects') + '<div id="list"></div>';
  const listEl = document.getElementById('list');
  mountPagedTable(listEl, ['Name', 'Status', 'Start', 'Deadline'], rows);
  // Delegated on the container (not per-row) since mountPagedTable
  // replaces the rows' DOM nodes on every page change.
  listEl.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-project-id]');
    if (tr) openProjectDetail(tr.dataset.projectId, tr.dataset.projectName);
  });
  wireIoToolbar(viewProjects);
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
    apiCall('/milestones.php?project_id=' + projectId),
    apiCall('/tasks.php?project_id=' + projectId),
    apiCall('/events.php?action=list&project_id=' + projectId),
    apiCall('/fire-alarm.php?action=list&project_id=' + projectId),
    apiCall('/utility-meters.php?action=meters&project_id=' + projectId),
  ]);

  const eqList = eq.data?.data || [];
  const taskList = tasks.data?.data || [];
  const eventList = events.data?.data || [];
  const fireList = fire.data?.data || [];
  const meterList = meters.data?.data || [];
  const openTasks = taskList.filter((t) => !/complete/i.test(t.status || '')).length;

  const eqRows = eqList.map((m) => `
    <tr><td>${esc(m.milestone_title)}</td><td><span class="badge">${esc(m.status)}</span></td><td>${esc(m.equipment_code || '—')}</td></tr>
  `);
  const taskRows = taskList.map((t) => `
    <tr><td>${esc(t.heading)}</td><td><span class="badge">${esc(t.status)}</span></td><td>${esc(t.priority || '—')}</td></tr>
  `);
  const eventRows = eventList.map((ev) => `
    <tr><td>${esc(ev.title)}</td><td><span class="badge">${esc(ev.severity)}</span></td><td><span class="badge">${esc(ev.status)}</span></td></tr>
  `);
  const fireRows = fireList.map((f) => `
    <tr><td>${esc(f.alarm_type)}</td><td>${esc(f.location_area || '—')}</td><td><span class="badge">${esc(f.status)}</span></td></tr>
  `);
  const meterRows = meterList.map((m) => `
    <tr><td>${esc(m.label)}</td><td><span class="badge">${esc(m.meter_type)}</span></td><td>${m.is_active ? 'Active' : 'Inactive'}</td></tr>
  `);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'equipment', label: `Equipment (${eqList.length})` },
    { key: 'tasks', label: `Work Orders (${taskList.length})` },
    { key: 'events', label: `Events (${eventList.length})` },
    { key: 'fire', label: `Fire Alarm (${fireList.length})` },
    { key: 'meters', label: `Meters (${meterList.length})` },
  ];
  const panels = {
    overview: `
      <div class="kpi-row">
        <div class="kpi"><div class="lbl">Equipment</div><div class="val">${eqList.length}</div></div>
        <div class="kpi"><div class="lbl">Open Work Orders</div><div class="val">${openTasks}</div></div>
        <div class="kpi"><div class="lbl">Open Events</div><div class="val">${eventList.filter((e) => e.status === 'open').length}</div></div>
        <div class="kpi"><div class="lbl">Active Meters</div><div class="val">${meterList.filter((m) => m.is_active).length}</div></div>
      </div>
      <div class="sub">Use the tabs above to see the full list for each area.</div>
    `,
    equipment: renderTable(['Title', 'Status', 'Code'], eqRows),
    tasks: renderTable(['Title', 'Status', 'Priority'], taskRows),
    events: renderTable(['Title', 'Severity', 'Status'], eventRows),
    fire: renderTable(['Type', 'Location', 'Status'], fireRows),
    meters: renderTable(['Label', 'Type', 'Status'], meterRows),
  };

  main.innerHTML = '<div class="back-link" id="back-to-projects">&larr; Back to Projects</div>'
    + '<h2>' + esc(projectName) + '</h2><div class="sub">Everything linked to this project</div>'
    + '<div class="detail-tabs">' + tabs.map((t, i) => `<button class="detail-tab-btn${i === 0 ? ' active' : ''}" data-tab="${t.key}">${esc(t.label)}</button>`).join('') + '</div>'
    + '<div id="detail-tab-panel">' + panels.overview + '</div>';

  document.getElementById('back-to-projects').addEventListener('click', () => { setActiveNav('projects'); viewProjects(); });
  main.querySelectorAll('.detail-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      main.querySelectorAll('.detail-tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.getElementById('detail-tab-panel').innerHTML = panels[btn.dataset.tab];
    });
  });
}

async function viewEvents() {
  main.innerHTML = '<h2>Project Events</h2><div class="sub">Urgent notes reported on any project</div><div class="state-msg">Loading…</div>';
  const res = await apiCall('/events.php?action=list');
  if (res?.error) { main.innerHTML = '<h2>Project Events</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((ev) => `
    <tr>
      <td>${esc(ev.title)}</td>
      <td><span class="badge">${esc(ev.severity)}</span></td>
      <td><span class="badge">${esc(ev.status)}</span></td>
      <td>${esc(ev.project_title || ev.project_id)}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Project Events</h2><div class="sub">Urgent notes reported on any project</div><div id="list"></div>';
  mountPagedTable(document.getElementById('list'), ['Title', 'Severity', 'Status', 'Project'], rows);
}

async function viewFireAlarm() {
  main.innerHTML = '<h2>Fire Alarm</h2><div class="sub">Panel events reported across the company</div><div class="state-msg">Loading…</div>';
  const res = await apiCall('/fire-alarm.php?action=list');
  if (res?.error) { main.innerHTML = '<h2>Fire Alarm</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((f) => `
    <tr>
      <td>${esc(f.alarm_type)}</td>
      <td>${esc(f.location_area || f.equipment_title || '—')}</td>
      <td><span class="badge">${esc(f.severity)}</span></td>
      <td><span class="badge">${esc(f.status)}</span></td>
    </tr>
  `);
  main.innerHTML = '<h2>Fire Alarm</h2><div class="sub">Panel events reported across the company</div><div id="list"></div>';
  mountPagedTable(document.getElementById('list'), ['Type', 'Location', 'Severity', 'Status'], rows);
}

async function viewMeters() {
  main.innerHTML = '<h2>Utility Meters</h2><div class="sub">Water/electricity/gas meters registered</div><div class="state-msg">Loading…</div>';
  const res = await apiCall('/utility-meters.php?action=meters');
  if (res?.error) { main.innerHTML = '<h2>Utility Meters</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((m) => `
    <tr>
      <td>${esc(m.label)}</td>
      <td><span class="badge">${esc(m.meter_type)}</span></td>
      <td>${esc(m.project_title || m.project_id || '—')}</td>
      <td>${m.is_active ? 'Active' : 'Inactive'}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Utility Meters</h2><div class="sub">Water/electricity/gas meters registered</div><div id="list"></div>';
  mountPagedTable(document.getElementById('list'), ['Label', 'Type', 'Project', 'Status'], rows);
}

async function viewWarehouse() {
  main.innerHTML = '<h2>Warehouse</h2><div class="sub">Pick a project to see its stock</div><div class="state-msg">Loading…</div>';
  const res = await apiCall('/warehouse.php?action=projects');
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
    const itemsRes = await apiCall('/warehouse.php?action=warehouse_items&project_id=' + projectId);
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
  const res = await apiCall('/daily-checklists.php?action=checklists_all');
  if (res?.error) { main.innerHTML = '<h2>Routine Checklists</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((c) => `
    <tr>
      <td>${esc(c.title_en || c.title_ar)}</td>
      <td><span class="badge">${esc(c.status)}</span></td>
      <td>${esc(c.recurrence_type || '—')}</td>
      <td>${esc(c.recurrence_anchor_date || '—')}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Routine Checklists</h2><div class="sub">Active checklist templates across the company</div><div id="list"></div>';
  mountPagedTable(document.getElementById('list'), ['Title', 'Status', 'Frequency', 'Anchor Date'], rows);
}

async function viewQuotations() {
  main.innerHTML = '<h2>Quotations</h2><div class="sub">All price quotations issued</div><div class="state-msg">Loading…</div>';
  const res = await apiCall('/quotations.php?action=list');
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
  main.innerHTML = '<h2>Quotations</h2><div class="sub">All price quotations issued</div><div id="list"></div>';
  mountPagedTable(document.getElementById('list'), ['#', 'Client', 'Project', 'Status', 'Total'], rows);
}

// ── Modal helper — a small reusable dialog with form fields, used by every
// Add/Edit form in this app (currently just Users, extend the same way
// for other modules later). ────────────────────────────────────────────
function openModal(title, fieldsHtml, onSubmit) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal-card">
      <h3>${esc(title)}</h3>
      <form id="modal-form">${fieldsHtml}</form>
      <div class="modal-actions">
        <button type="button" id="modal-cancel">Cancel</button>
        <button type="button" id="modal-submit" class="btn-like" style="background:var(--accent);color:#fff;border:0;padding:9px 16px;border-radius:8px;font-weight:600;cursor:pointer;">Save</button>
      </div>
      <div class="error-msg" id="modal-error" style="display:none;"></div>
    </div>
  `;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector('#modal-cancel').addEventListener('click', close);
  wrap.querySelector('#modal-submit').addEventListener('click', async () => {
    const form = wrap.querySelector('#modal-form');
    const data = Object.fromEntries(new FormData(form).entries());
    const errEl = wrap.querySelector('#modal-error');
    errEl.style.display = 'none';
    try {
      await onSubmit(data);
      close();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    }
  });
  return wrap;
}

async function viewUsers() {
  setCrumb('Users');
  main.innerHTML = '<h2>Users</h2><div class="sub">Everyone with access to this company</div><div class="state-msg">Loading…</div>';
  const res = await apiCall('/roles_permissions.php?action=users');
  if (res?.error) { main.innerHTML = '<h2>Users</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const users = res.data?.users || [];
  const limit = res.data?.limit;

  const canAdd = can('add_users');
  const canEdit = can('edit_users');

  const rows = users.map((u) => `
    <tr>
      ${canEdit ? `<td class="row-check"><input type="checkbox" class="user-check" value="${esc(u.id)}"></td>` : ''}
      <td>${esc(u.name)}</td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.role_display_name || u.role_name || '—')}</td>
      <td><span class="badge">${esc(u.status)}</span></td>
      <td>${canEdit ? `<button class="btn-edit-user" data-id="${esc(u.id)}" data-name="${esc(u.name)}" data-email="${esc(u.email)}">Edit</button> <button class="btn-reset-pw" data-id="${esc(u.id)}">Reset Password</button>` : ''}</td>
    </tr>
  `);
  const seatLine = limit?.max_users
    ? `<div class="sub">Seats used: ${limit.current_users} / ${limit.max_users} (${esc(limit.plan_name || '')})</div>`
    : '';
  const toolbar = '<div class="toolbar">'
    + (canAdd ? '<button id="btn-add-user" class="primary">+ Add User</button>' : '')
    + (canEdit ? '<button id="btn-delete-users" class="danger">Delete Selected</button>' : '')
    + '</div>';

  main.innerHTML = '<h2>Users</h2><div class="sub">Everyone with access to this company</div>' + seatLine + toolbar + '<div id="list"></div>';
  const headers = canEdit ? ['', 'Name', 'Email', 'Role', 'Status', 'Actions'] : ['Name', 'Email', 'Role', 'Status', 'Actions'];
  mountPagedTable(document.getElementById('list'), headers, rows, 20);

  document.getElementById('btn-add-user')?.addEventListener('click', async () => {
    const rolesRes = await apiCall('/roles_permissions.php?action=matrix');
    const roles = rolesRes.data?.roles || [];
    const roleOptions = roles.map((r) => `<option value="${esc(r.id)}">${esc(r.display_name || r.name)}</option>`).join('');
    openModal('Add User', `
      <label>Name</label><input name="name" required>
      <label>Email</label><input name="email" type="email" required>
      <label>Password</label><input name="password" type="password" required minlength="8">
      <label>Role</label><select name="role_id">${roleOptions}</select>
    `, async (data) => {
      const r = await apiCall('/roles_permissions.php?action=create_user', 'POST', {
        name: data.name, email: data.email, password: data.password, role_id: parseInt(data.role_id, 10) || 0,
      });
      if (r?.error) throw new Error(r.error);
      viewUsers();
    });
  });

  main.querySelectorAll('.btn-edit-user').forEach((btn) => {
    btn.addEventListener('click', () => {
      openModal('Edit User', `
        <label>Name</label><input name="name" value="${esc(btn.dataset.name)}" required>
        <label>Email</label><input name="email" type="email" value="${esc(btn.dataset.email)}" required>
      `, async (data) => {
        const r = await apiCall('/roles_permissions.php?action=update_user', 'POST', {
          user_id: parseInt(btn.dataset.id, 10), name: data.name, email: data.email,
        });
        if (r?.error) throw new Error(r.error);
        viewUsers();
      });
    });
  });

  main.querySelectorAll('.btn-reset-pw').forEach((btn) => {
    btn.addEventListener('click', () => {
      openModal('Reset Password', `
        <label>New Password</label><input name="new_password" type="password" required minlength="8">
      `, async (data) => {
        const r = await apiCall('/roles_permissions.php?action=reset_password', 'POST', {
          user_id: parseInt(btn.dataset.id, 10), new_password: data.new_password,
        });
        if (r?.error) throw new Error(r.error);
        alert('Password updated.');
      });
    });
  });

  document.getElementById('btn-delete-users')?.addEventListener('click', async () => {
    const ids = Array.from(main.querySelectorAll('.user-check:checked')).map((cb) => parseInt(cb.value, 10));
    if (!ids.length) { alert('Select at least one user first.'); return; }
    if (!confirm(`Delete ${ids.length} user(s)? This cannot be undone.`)) return;
    const r = await apiCall('/roles_permissions.php?action=delete_users', 'POST', { user_ids: ids });
    if (r?.error) { alert('Delete failed: ' + r.error); return; }
    viewUsers();
  });
}

async function viewNotifications() {
  main.innerHTML = '<h2>Notifications</h2><div class="sub">Your most recent alerts</div><div class="state-msg">Loading…</div>';
  const res = await apiCall('/notifications.php?limit=50');
  if (res?.error) { main.innerHTML = '<h2>Notifications</h2><div class="error-msg">' + esc(res.error) + '</div>'; return; }
  const rows = (res.data?.data || []).map((n) => `
    <tr>
      <td>${n.read ? '' : '<strong>●</strong> '}${esc(n.title)}</td>
      <td>${esc(n.body || '—')}</td>
      <td>${esc(n.module || '—')}</td>
      <td>${esc(n.created_at || '—')}</td>
    </tr>
  `);
  main.innerHTML = '<h2>Notifications</h2><div class="sub">Your most recent alerts (' + (res.data?.unread_count ?? 0) + ' unread)</div><div id="list"></div>';
  mountPagedTable(document.getElementById('list'), ['Title', 'Body', 'Module', 'Received'], rows);
}

// "What's New" — the same app_changelog entries the web app's Changelog
// screen shows (api/changelog.php, admin-only server-side).
async function viewChangelog() {
  setCrumb("What's New");
  main.innerHTML = "<h2>What's New</h2><div class=\"sub\">Release history for your company's app</div><div class=\"state-msg\">Loading…</div>";
  const res = await apiCall('/changelog.php');
  if (res?.error) { main.innerHTML = "<h2>What's New</h2><div class=\"error-msg\">" + esc(res.error) + '</div>'; return; }
  const entries = res.data?.data || [];
  if (!entries.length) { main.innerHTML = "<h2>What's New</h2><div class=\"state-msg\">No release notes yet.</div>"; return; }
  const html = entries.map((e) => `
    <div class="changelog-entry">
      <span class="ver">${esc(e.version)}</span><span class="date">${esc(e.release_date || '')}</span>
      <h4>${esc(e.title_en || e.title_ar || '')}</h4>
      <ul>${(e.items_en || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
    </div>
  `).join('');
  main.innerHTML = "<h2>What's New</h2><div class=\"sub\">Release history for your company's app</div>" + html;
}

// Built-in help for the desktop app itself — a short guide per screen,
// written for this app specifically (not pulled from the web app's much
// larger Knowledge Base, which is hardcoded client-side content in
// js/knowledge-base.js, not served by any API — duplicating all of it
// here would be a separate, much bigger content task).
async function viewDocs() {
  setCrumb('Documentation');
  const sections = [
    ['Dashboard', 'A live snapshot of your company: total equipment, open and total work orders, and active projects.'],
    ['Equipment', 'Every asset registered across all projects, with its status and equipment code.'],
    ['Work Orders', 'All work orders company-wide. Click "Projects" and open a project to see just that project\'s work orders instead.'],
    ['Projects', 'Click any project to open it — a tabbed view shows its Equipment, Work Orders, Events, Fire Alarm reports, and Utility Meters together.'],
    ['Project Events', 'Urgent notes reported on any project, with severity and status.'],
    ['Fire Alarm', 'Panel events reported across the company (smoke, heat, fire, fault, etc.).'],
    ['Utility Meters', 'Water/electricity/gas meters registered per project, and whether each is active.'],
    ['Warehouse', 'Pick a project from the dropdown to see its stock items.'],
    ['Routine Checklists', 'Active inspection checklist templates and how often each repeats.'],
    ['Quotations', 'All price quotations issued, with client, project, status, and total.'],
    ['Users', 'Everyone with access to your company, their role, and your plan\'s seat usage.'],
    ['Notifications', 'Your most recent alerts, unread ones marked with a dot.'],
    ["What's New", 'Release notes for the web app your company uses.'],
  ];
  main.innerHTML = '<h2>Documentation</h2><div class="sub">A quick guide to each screen in this app</div><div class="doc-body">'
    + sections.map(([title, body]) => `<h3>${esc(title)}</h3><div>${esc(body)}</div>`).join('')
    + '</div>';
}

const views = {
  dashboard: viewDashboard, equipment: viewEquipment, tasks: viewTasks, categories: viewCategories, projects: viewProjects,
  events: viewEvents, firealarm: viewFireAlarm, meters: viewMeters, warehouse: viewWarehouse,
  checklists: viewChecklists, quotations: viewQuotations, users: viewUsers, notifications: viewNotifications,
  changelog: viewChangelog, docs: viewDocs,
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

(async function bootstrap() {
  await loadBranding();
  await loadPermissions();
  viewDashboard();
})();

window.eeisDesktop.getAppVersion().then((v) => {
  const el = document.getElementById('app-version-label');
  if (el && v) el.textContent = 'App v' + v;
});
