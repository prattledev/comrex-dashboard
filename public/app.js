'use strict';

// ── Constants ──────────────────────────────────────────────────
const POLL_INTERVAL_MS = 30_000;
const GROUP_ORDER = [
  'ACCESS MultiRack',
  'BRIC-LINK',
  'ACCESS Portable NX',
];

// ── Helpers ────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripPort(addr) {
  if (!addr) return '—';
  const colon = addr.lastIndexOf(':');
  return colon !== -1 ? addr.slice(0, colon) : addr;
}

function formatTimestamp(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString();
  } catch {
    return escHtml(isoStr);
  }
}

// ── DOM refs ───────────────────────────────────────────────────
const $groups      = document.getElementById('device-groups');
const $loading     = document.getElementById('loading');
const $errorBanner = document.getElementById('error-banner');
const $lastUpdated = document.getElementById('last-updated');
const $countdown   = document.getElementById('countdown-label');
const $bar         = document.getElementById('countdown-bar');
const $statTotal   = document.getElementById('stat-total');
const $statOnline  = document.getElementById('stat-online');
const $statOffline = document.getElementById('stat-offline');
const $statConn    = document.getElementById('stat-connected');
const $search      = document.getElementById('search');

// ── State ──────────────────────────────────────────────────────
let lastDevices = [];
let statusChanges = new Map(); // uuid → 'online' | 'offline'
const activeFilters = new Set();
let sortField = 'name'; // 'name' | 'firmware' | 'last_reg'
let sortDir   = 'asc';  // 'asc' | 'desc'

// ── Countdown ──────────────────────────────────────────────────
let secondsLeft = 30;

function resetCountdown() {
  secondsLeft = 30;
  updateCountdownUI();
}

function updateCountdownUI() {
  $countdown.textContent = `${secondsLeft}s`;
  const pct = (secondsLeft / 30) * 100;
  $bar.style.width = `${pct}%`;
  if (secondsLeft <= 5) {
    $bar.classList.add('urgent');
  } else {
    $bar.classList.remove('urgent');
  }
}

setInterval(() => {
  if (secondsLeft > 0) {
    secondsLeft--;
    updateCountdownUI();
  }
}, 1000);

// ── Status diff ────────────────────────────────────────────────
function diffDevices(oldDevices, newDevices) {
  const oldMap = new Map(oldDevices.map(d => [d.uuid, d.reg_status]));
  const changes = new Map();
  for (const d of newDevices) {
    const oldStatus = oldMap.get(d.uuid);
    if (oldStatus === undefined) continue;
    const wasOffline = String(oldStatus ?? '').toLowerCase() === 'offline';
    const isOffline  = String(d.reg_status ?? '').toLowerCase() === 'offline';
    if (wasOffline !== isOffline) {
      changes.set(d.uuid, isOffline ? 'offline' : 'online');
    }
  }
  return changes;
}

// ── Rendering ──────────────────────────────────────────────────
function badgeForRegStatus(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'secure')  return `<span class="badge badge-green">Online</span>`;
  if (s === 'offline') return `<span class="badge badge-red">Offline</span>`;
  return `<span class="badge badge-gray">${escHtml(status)}</span>`;
}

function badgeForConnStatus(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'connected') return `<span class="badge badge-blue">Connected</span>`;
  if (s === 'idle')      return `<span class="badge badge-gray">Idle</span>`;
  return `<span class="badge badge-gray">${escHtml(status)}</span>`;
}

function renderCard(device) {
  const isOffline = String(device.reg_status ?? '').toLowerCase() === 'offline';
  const change = statusChanges.get(device.uuid ?? '');
  const cardClass = [
    'device-card',
    isOffline ? 'offline' : '',
    change === 'offline' ? 'changed-offline' : '',
    change === 'online'  ? 'changed-online'  : '',
  ].filter(Boolean).join(' ');
  const changeBadge = change === 'offline'
    ? `<span class="badge badge-change-offline">↓ Went offline</span>`
    : change === 'online'
    ? `<span class="badge badge-change-online">↑ Came online</span>`
    : '';
  const ip = escHtml(stripPort(device.reg_address));
  const fw = escHtml(device.firmware_version ?? '—');
  const nat = escHtml(device.nat_type ?? '—');
  const lastReg = escHtml(formatTimestamp(device.last_reg));

  return `
    <div class="${cardClass}">
      <div class="card-name" title="${escHtml(device.unit_name)}">${escHtml(device.unit_name)}</div>
      <div class="card-badges">
        ${badgeForRegStatus(device.reg_status)}
        ${badgeForConnStatus(isOffline ? 'idle' : device.conn_status)}
        ${changeBadge}
      </div>
      <div class="card-meta">
        <div class="card-meta-row"><span>IP</span><span>${ip}</span></div>
        <div class="card-meta-row"><span>Firmware</span><span>${fw}</span></div>
        <div class="card-meta-row"><span>NAT</span><span>${nat}</span></div>
        <div class="card-meta-row"><span>Last Reg</span><span>${lastReg}</span></div>
        <div class="card-meta-row"><span>MAC Address</span><span>${escHtml(device.uuid ?? '—')}</span></div>
      </div>
    </div>`;
}

function sortDevices(devices) {
  return [...devices].sort((a, b) => {
    let cmp;
    if (sortField === 'firmware') {
      cmp = String(a.firmware_version ?? '').localeCompare(
        String(b.firmware_version ?? ''), undefined, { numeric: true }
      );
    } else if (sortField === 'ip') {
      const toNum = d => stripPort(d.reg_address ?? '').split('.').reduce((acc, o) => acc * 256 + (parseInt(o) || 0), 0);
      cmp = toNum(a) - toNum(b);
    } else if (sortField === 'mac') {
      cmp = String(a.uuid ?? '').localeCompare(String(b.uuid ?? ''));
    } else if (sortField === 'nat') {
      cmp = String(a.nat_type ?? '').localeCompare(String(b.nat_type ?? ''));
    } else if (sortField === 'last_reg') {
      const ta = a.last_reg ? new Date(a.last_reg).getTime() : 0;
      const tb = b.last_reg ? new Date(b.last_reg).getTime() : 0;
      cmp = ta - tb;
    } else {
      cmp = String(a.unit_name ?? '').localeCompare(String(b.unit_name ?? ''));
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
}

function renderGroups(devices) {
  const sorted = sortDevices(devices);

  // Group by product_type (merge BRIC-Link II and III into BRIC-LINK)
  const grouped = {};
  for (const d of sorted) {
    const raw = d.product_type ?? 'Unknown';
    const key = (raw === 'BRIC-Link II' || raw === 'BRIC-Link III') ? 'BRIC-LINK' : raw;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  }

  // Build ordered list of sections
  const orderedKeys = [
    ...GROUP_ORDER.filter(k => grouped[k]),
    ...Object.keys(grouped).filter(k => !GROUP_ORDER.includes(k)).sort(),
  ];

  let html = '';
  for (const key of orderedKeys) {
    const cards = grouped[key].map(renderCard).join('');
    html += `
      <details class="group-section" data-group="${escHtml(key)}" open>
        <summary class="group-heading">${escHtml(key)} <span class="group-count">(${grouped[key].length})</span></summary>
        <div class="device-grid">${cards}</div>
      </details>`;
  }
  return html;
}

function updateStats(devices) {
  const total    = devices.length;
  const online   = devices.filter(d => String(d.reg_status ?? '').toLowerCase() !== 'offline').length;
  const offline  = total - online;
  const connected = devices.filter(d =>
    String(d.reg_status ?? '').toLowerCase() !== 'offline' &&
    String(d.conn_status ?? '').toLowerCase() === 'connected'
  ).length;

  $statTotal.textContent   = total;
  $statOnline.textContent  = online;
  $statOffline.textContent = offline;
  $statConn.textContent    = connected;
}

// ── Fetch ──────────────────────────────────────────────────────
async function fetchUnits() {
  let data;
  try {
    const res = await fetch('/api/units');
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      throw new Error(`HTTP ${res.status} — unexpected response from server`);
    }
    try {
      data = await res.json();
    } catch {
      throw new Error(`HTTP ${res.status} — invalid response from server`);
    }
    if (!res.ok) {
      const msg = data.upstreamStatus === 429
        ? 'Comrex API rate limit reached (max 2 requests per 60s)'
        : (data.error ?? `HTTP ${res.status}`);
      throw new Error(msg);
    }
  } catch (err) {
    const staleNote = lastDevices.length > 0 ? ' — showing last known data' : '';
    showError(`${escHtml(err.message)}${staleNote}`);
    resetCountdown();
    return;
  }

  // data may be an array directly or wrapped
  const devices = Array.isArray(data) ? data : (data.units ?? data.data ?? []);

  statusChanges = lastDevices.length > 0 ? diffDevices(lastDevices, devices) : new Map();
  lastDevices = devices;
  hideError();
  updateStats(devices);
  applyFilter();
  $lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  resetCountdown();
}

function showError(msg) {
  $errorBanner.innerHTML = `&#9888; ${msg}`;
  $errorBanner.classList.add('visible');
}

function hideError() {
  $errorBanner.classList.remove('visible');
}

// ── Filter ─────────────────────────────────────────────────────
function matchesStatusFilter(d) {
  if (activeFilters.size === 0) return true;
  const regStatus  = String(d.reg_status  ?? '').toLowerCase();
  const connStatus = String(d.conn_status ?? '').toLowerCase();
  const isOffline  = regStatus === 'offline';
  if (activeFilters.has('online')    && !isOffline) return true;
  if (activeFilters.has('offline')   && isOffline)  return true;
  if (activeFilters.has('connected') && !isOffline && connStatus === 'connected') return true;
  return false;
}

function applyFilter(forceExpand = false) {
  // Snapshot which groups are currently collapsed before re-rendering
  const collapsed = forceExpand ? new Set() : new Set(
    [...$groups.querySelectorAll('details.group-section:not([open])')]
      .map(el => el.dataset.group)
  );

  const query = $search.value.trim().toLowerCase();
  const filtered = lastDevices
    .filter(d => !query || String(d.unit_name ?? '').toLowerCase().includes(query))
    .filter(matchesStatusFilter);
  $groups.innerHTML = renderGroups(filtered);

  // Restore collapsed state
  $groups.querySelectorAll('details.group-section').forEach(el => {
    if (collapsed.has(el.dataset.group)) el.removeAttribute('open');
  });
}

$search.addEventListener('input', applyFilter);

document.querySelectorAll('.status-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    const isActive = activeFilters.has(f);
    activeFilters.clear();
    document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
    if (!isActive) {
      activeFilters.add(f);
      btn.classList.add('active');
    }
    applyFilter();
  });
});

// ── Export CSV ─────────────────────────────────────────────────
function csvEscape(val) {
  const s = String(val ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV() {
  const query = $search.value.trim().toLowerCase();
  const rows = lastDevices
    .filter(d => !query || String(d.unit_name ?? '').toLowerCase().includes(query))
    .filter(matchesStatusFilter);

  const headers = ['Name', 'Status', 'Connection', 'IP', 'Firmware', 'NAT', 'Last Registered', 'MAC Address', 'Product Type'];
  const lines = [
    headers.join(','),
    ...rows.map(d => {
      const isOffline = String(d.reg_status ?? '').toLowerCase() === 'offline';
      return [
        csvEscape(d.unit_name),
        csvEscape(isOffline ? 'Offline' : 'Online'),
        csvEscape(isOffline ? 'Idle' : (d.conn_status ?? '')),
        csvEscape(stripPort(d.reg_address)),
        csvEscape(d.firmware_version),
        csvEscape(d.nat_type),
        csvEscape(formatTimestamp(d.last_reg)),
        csvEscape(d.uuid),
        csvEscape(d.product_type),
      ].join(',');
    }),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `comrex-fleet-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('export-csv').addEventListener('click', exportCSV);

// ── Sort Controls ──────────────────────────────────────────────
function updateSortButtons() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    const field = btn.dataset.sort;
    if (field === sortField) {
      btn.classList.add('active');
      const labels = { name: 'Name', ip: 'IP', mac: 'MAC', nat: 'NAT Type', firmware: 'Firmware', last_reg: 'Last Reg' };
      btn.textContent = labels[field] + (sortDir === 'asc' ? ' ↑' : ' ↓');
    } else {
      btn.classList.remove('active');
      btn.textContent = { name: 'Name', ip: 'IP', mac: 'MAC', nat: 'NAT Type', firmware: 'Firmware', last_reg: 'Last Reg' }[field];
    }
  });
}

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const field = btn.dataset.sort;
    if (field === sortField) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDir = 'asc';
    }
    updateSortButtons();
    applyFilter();
  });
});

// ── Reset View ─────────────────────────────────────────────────
document.getElementById('reset-view-btn').addEventListener('click', () => {
  activeFilters.clear();
  document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
  sortField = 'name';
  sortDir = 'asc';
  updateSortButtons();
  applyFilter(true);
});

// ── NAT Info Modal ─────────────────────────────────────────────
const $natModal   = document.getElementById('nat-modal');
const $natInfoBtn = document.getElementById('nat-info-btn');

function openNatModal()  { $natModal.hidden = false; document.body.style.overflow = 'hidden'; }
function closeNatModal() { $natModal.hidden = true;  document.body.style.overflow = ''; }

$natInfoBtn.addEventListener('click', openNatModal);
$natModal.addEventListener('click', e => { if (e.target === $natModal) closeNatModal(); });
$natModal.querySelector('.modal-close').addEventListener('click', closeNatModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$natModal.hidden) closeNatModal(); });

// ── Init ───────────────────────────────────────────────────────
fetchUnits();
setInterval(fetchUnits, POLL_INTERVAL_MS);
