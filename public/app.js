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

function renderGroups(devices) {
  // Sort: alphabetical by name
  const sorted = [...devices].sort((a, b) =>
    String(a.unit_name ?? '').localeCompare(String(b.unit_name ?? ''))
  );

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
      <details class="group-section" open>
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
    data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  } catch (err) {
    showError(`Failed to load device data: ${escHtml(err.message)}`);
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

function applyFilter() {
  const query = $search.value.trim().toLowerCase();
  const filtered = lastDevices
    .filter(d => !query || String(d.unit_name ?? '').toLowerCase().includes(query))
    .filter(matchesStatusFilter);
  $groups.innerHTML = renderGroups(filtered);
}

$search.addEventListener('input', applyFilter);

document.querySelectorAll('.status-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    if (activeFilters.has(f)) {
      activeFilters.delete(f);
      btn.classList.remove('active');
    } else {
      activeFilters.add(f);
      btn.classList.add('active');
    }
    applyFilter();
  });
});

// ── Init ───────────────────────────────────────────────────────
fetchUnits();
setInterval(fetchUnits, POLL_INTERVAL_MS);
