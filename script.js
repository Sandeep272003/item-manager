// Advanced client: direct API only (no local storage), clear request/response inspector,
// robust fetch (timeout + retries + backoff), CORS detection, proxy toggle support.

// CONFIG
const DEFAULT_API = 'https://items-manager-yvbd.onrender.com/api/items';

// UI helpers
const $ = id => document.getElementById(id);
const lastReqEl = $('lastRequest');
const lastResEl = $('lastResponse');
const connStatusEl = $('connStatus');

// State
let page = 0;
let size = 10;
let sort = '';
let q = '';

// Build API base (proxy option uses '/api/items' when checked)
function apiBase() {
  const raw = $('backendUrl').value.trim() || DEFAULT_API;
  return $('useProxy').checked ? '/api/items' : raw;
}

// --- Inspector helpers ---
function recordRequest(url, opts) {
  try {
    const safe = sanitize(opts);
    lastReqEl.textContent = JSON.stringify({ url, options: safe }, null, 2);
  } catch (e) { lastReqEl.textContent = String(e); }
}
async function recordResponse(res) {
  try {
    const clone = res.clone();
    const headers = {};
    for (const [k, v] of clone.headers.entries()) headers[k] = v;
    const text = await clone.text().catch(() => '');
    const body = tryParse(text);
    lastResEl.textContent = JSON.stringify({ status: clone.status, headers, body }, null, 2);
  } catch (e) { lastResEl.textContent = String(e); }
}
function sanitize(opts) {
  const o = { ...opts };
  if (o.headers) {
    const h = { ...o.headers };
    if (h.Authorization) h.Authorization = 'REDACTED';
    o.headers = h;
  }
  if (o.body && typeof o.body === 'string' && o.body.length > 2000) o.body = o.body.slice(0, 2000) + '...';
  return o;
}
function tryParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

// --- Robust fetch wrapper ---
async function fetchWithRetry(url, opts = {}, { retries = 2, timeout = 8000, backoff = 500 } = {}) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      recordRequest(url, opts);
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(id);
      await recordResponse(res);
      if (!res.ok && res.status !== 304) {
        const text = await res.text().catch(() => res.statusText);
        const err = new Error(`HTTP ${res.status}: ${text || res.statusText}`);
        err.status = res.status;
        throw err;
      }
      return res;
    } catch (err) {
      console.warn('fetch error', attempt, url, err.message || err);
      if (attempt > retries) throw err;
      const wait = backoff * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// --- CORS / network probe ---
async function probeBackend() {
  const base = apiBase();
  try {
    // quick probe with short timeout
    const url = new URL(base, location.origin);
    url.searchParams.set('size', 1);
    const res = await fetchWithRetry(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } }, { retries: 0, timeout: 3000 });
    connStatusEl.textContent = `Backend reachable (${res.status})`;
    return { ok: true, status: res.status };
  } catch (err) {
    // If public internet is available but this fails with "Failed to fetch", likely CORS
    connStatusEl.textContent = `Backend probe failed: ${err.message || err}`;
    return { ok: false, error: err };
  }
}

// --- Core API operations ---
// GET list (supports q, sort, page, size)
async function loadItems() {
  const container = $('itemsContainer');
  container.innerHTML = '<div class="muted">Loading...</div>';
  q = $('searchInput').value.trim();
  sort = $('sortSelect').value;

  try {
    const base = apiBase();
    const url = new URL(base, location.origin);
    if (q) url.searchParams.set('q', q);
    if (sort) url.searchParams.set('sort', sort);
    url.searchParams.set('page', page);
    url.searchParams.set('size', size);

    const res = await fetchWithRetry(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } }, { retries: 2, timeout: 8000 });
    const data = await res.json();
    let items = Array.isArray(data) ? data : (data.items || data.content || []);
    let total = Array.isArray(data) ? items.length : (data.total ?? data.totalElements ?? items.length);
    renderItems(items);
    updatePageInfo(page, size, total);
    connStatusEl.textContent = `Loaded from backend (${res.status})`;
  } catch (err) {
    console.error('loadItems failed', err);
    container.innerHTML = `<div class="muted">Error loading items: ${escapeHtml(err.message || 'Failed to fetch')}</div>`;
    connStatusEl.textContent = `Error: ${err.message || 'Failed to fetch'}`;
  }
}

// POST create
async function createItem(payload) {
  try {
    const base = apiBase();
    const res = await fetchWithRetry(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, { retries: 2, timeout: 10000 });
    const created = await res.json();
    showToast('Item created');
    await loadItems();
    return created;
  } catch (err) {
    console.error('createItem failed', err);
    showToast('Create failed: ' + (err.message || 'error'));
    throw err;
  }
}

// PUT update
async function updateItem(id, payload) {
  try {
    const base = apiBase();
    const url = base.replace(/\/$/, '') + '/' + encodeURIComponent(id);
    const res = await fetchWithRetry(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, { retries: 2, timeout: 10000 });
    const updated = await res.json();
    showToast('Item updated');
    await loadItems();
    return updated;
  } catch (err) {
    console.error('updateItem failed', err);
    showToast('Update failed: ' + (err.message || 'error'));
    throw err;
  }
}

// DELETE
async function deleteItemApi(id) {
  try {
    const base = apiBase();
    const url = base.replace(/\/$/, '') + '/' + encodeURIComponent(id);
    const res = await fetchWithRetry(url, { method: 'DELETE' }, { retries: 2, timeout: 8000 });
    showToast('Item deleted');
    await loadItems();
    return res;
  } catch (err) {
    console.error('deleteItem failed', err);
    showToast('Delete failed: ' + (err.message || 'error'));
    throw err;
  }
}

// GET single
async function getItem(id) {
  try {
    const base = apiBase();
    const url = base.replace(/\/$/, '') + '/' + encodeURIComponent(id);
    const res = await fetchWithRetry(url, { method: 'GET', headers: { Accept: 'application/json' } }, { retries: 1, timeout: 6000 });
    const item = await res.json();
    return item;
  } catch (err) {
    console.error('getItem failed', err);
    throw err;
  }
}

// --- UI rendering & helpers ---
function renderItems(items) {
  const container = $('itemsContainer');
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="muted">No items found</div>';
    return;
  }
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start;flex:1">
        <div style="flex:1">
          <div style="font-weight:600">${escapeHtml(item.name || '')}</div>
          <div class="muted" style="margin-top:6px">${escapeHtml(item.description || '')}</div>
        </div>
        <div style="text-align:right;min-width:140px">
          <div style="font-weight:700;color:var(--accent)">₹${Number(item.price || 0).toFixed(2)}</div>
          <div class="small muted">${formatInstant(item.createdAt || item.created || item.created_at)}</div>
          <div style="margin-top:.5rem;display:flex;gap:.5rem;justify-content:flex-end">
            <button class="btn small" data-id="${item.id}" data-action="view">View</button>
            <button class="btn small" data-id="${item.id}" data-action="edit">Edit</button>
            <button class="btn small danger" data-id="${item.id}" data-action="delete">Delete</button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // delegate clicks
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'view') {
        try {
          const item = await getItem(id);
          showDetailModal(item);
        } catch (err) {
          showToast('Failed to load item');
        }
      } else if (action === 'edit') {
        try {
          const item = await getItem(id);
          populateForm(item);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
          showToast('Failed to load item for edit');
        }
      } else if (action === 'delete') {
        if (!confirm('Delete this item?')) return;
        try {
          await deleteItemApi(id);
        } catch (err) {
          // handled in deleteItemApi
        }
      }
    });
  });
}

function updatePageInfo(p, s, total) {
  const pageInfo = $('pageInfo');
  const totalPages = Math.max(1, Math.ceil((total || 0) / s));
  pageInfo.textContent = `Page ${p + 1} of ${totalPages}`;
}

// Form handling
function populateForm(item) {
  $('itemId').value = item.id || '';
  $('name').value = item.name || '';
  $('description').value = item.description || '';
  $('price').value = item.price != null ? item.price : '';
  $('submitBtn').textContent = 'Update Item';
}

function resetForm() {
  $('itemForm').reset();
  $('itemId').value = '';
  $('submitBtn').textContent = 'Save Item';
}

// Modal
function showDetailModal(item) {
  $('detailName').textContent = item.name || '';
  $('detailDesc').textContent = item.description || '';
  $('detailPrice').textContent = (item.price || 0).toFixed(2);
  $('detailCreated').textContent = formatInstant(item.createdAt || item.created || item.created_at);
  $('detailModal').classList.remove('hidden');
  $('detailModal').setAttribute('aria-hidden', 'false');

  // wire edit/delete inside modal
  $('editBtn').onclick = () => {
    populateForm(item);
    $('detailModal').classList.add('hidden');
  };
  $('deleteBtn').onclick = async () => {
    if (!confirm('Delete this item?')) return;
    try {
      await deleteItemApi(item.id);
      $('detailModal').classList.add('hidden');
    } catch (err) {}
  };
}

// Utilities
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatInstant(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return v;
  return d.toLocaleString();
}
function showToast(msg, ms = 3000) {
  // simple toast using connStatusEl area
  connStatusEl.textContent = 'Status: ' + msg;
  setTimeout(() => { connStatusEl.textContent = connStatusEl.textContent.startsWith('Status:') ? connStatusEl.textContent : connStatusEl.textContent; }, ms);
}

// --- Event bindings ---
document.addEventListener('DOMContentLoaded', () => {
  // form submit
  $('itemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('itemId').value || null;
    const payload = {
      name: $('name').value.trim(),
      description: $('description').value.trim(),
      price: parseFloat($('price').value) || 0
    };
    if (!payload.name || !payload.description) {
      showToast('Name and description required');
      return;
    }
    $('submitBtn').disabled = true;
    try {
      if (id) await updateItem(id, payload);
      else await createItem(payload);
      resetForm();
    } catch (err) {
      // errors handled in API functions
    } finally {
      $('submitBtn').disabled = false;
    }
  });

  $('resetBtn').addEventListener('click', resetForm);

  // search/sort/pagination
  let debounceTimer;
  $('searchInput').addEventListener('input', (e) => {
    q = e.target.value.trim();
    page = 0;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadItems, 350);
  });
  $('sortSelect').addEventListener('change', () => { sort = $('sortSelect').value; page = 0; loadItems(); });
  $('prevPage').addEventListener('click', () => { if (page > 0) { page--; loadItems(); }});
  $('nextPage').addEventListener('click', () => { page++; loadItems(); });

  // modal close
  $('closeModal').addEventListener('click', () => {
    $('detailModal').classList.add('hidden');
    $('detailModal').setAttribute('aria-hidden', 'true');
  });

  // open add
  $('openAdd').addEventListener('click', () => {
    resetForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('name').focus();
  });

  // connection test
  $('testConn').addEventListener('click', async () => {
    connStatusEl.textContent = 'Testing...';
    try {
      const probe = await probeBackend();
      if (probe.ok) {
        connStatusEl.textContent = `Backend reachable (${probe.status})`;
      } else {
        connStatusEl.textContent = `Probe failed: ${probe.error || 'unknown'}`;
      }
    } catch (err) {
      connStatusEl.textContent = `Probe error: ${err.message || err}`;
    }
  });

  // initial load
  loadItems();
});

// Keyboard: close modal on Esc
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = $('detailModal');
    if (modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');
  }
});
