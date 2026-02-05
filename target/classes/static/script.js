/**
 * script.js — frontend logic for Item Manager
 * - Endpoints: /api/items
 * - Supports add, edit, delete, list, search, sort, pagination
 * - Theme toggle persisted to localStorage
 *
 * NOTE: optional/category field removed from form and payload as requested.
 */

const apiBase = '/api/items';
let page = 0, size = 10, sort = '', q = '';

/* Theme toggle */
const themeSwitch = document.getElementById('themeSwitch');
const lightBtn = document.getElementById('lightBtn');
const darkBtn = document.getElementById('darkBtn');

function applyTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    themeSwitch?.setAttribute('aria-checked', 'true');
    localStorage.setItem('theme', 'light');
  } else {
    document.body.classList.remove('light-mode');
    themeSwitch?.setAttribute('aria-checked', 'false');
    localStorage.setItem('theme', 'dark');
  }
}

(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') applyTheme(true);
  else if (saved === 'dark') applyTheme(false);
  else {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(prefersLight);
  }
})();

themeSwitch?.addEventListener('click', () => applyTheme(!document.body.classList.contains('light-mode')));
themeSwitch?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); themeSwitch.click(); }});
lightBtn?.addEventListener('click', () => applyTheme(true));
darkBtn?.addEventListener('click', () => applyTheme(false));

/* App init */
document.addEventListener('DOMContentLoaded', () => {
  bindForm();
  bindControls();
  loadItems();
});

/* Form handling */
function bindForm() {
  const form = document.getElementById('itemForm');
  const resetBtn = document.getElementById('resetBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitForm();
  });

  resetBtn.addEventListener('click', resetForm);
}

async function submitForm() {
  const id = document.getElementById('itemId').value || null;
  const name = document.getElementById('name').value.trim();
  const description = document.getElementById('description').value.trim();
  const priceRaw = document.getElementById('price').value;
  const price = priceRaw === '' ? 0 : parseFloat(priceRaw);

  if (!name || !description || isNaN(price) || price < 0) {
    showToast('Please provide valid name, description and non-negative price.');
    return;
  }

  // payload no longer includes optional fields
  const payload = { name, description, price };

  try {
    let res;
    if (id) {
      res = await fetch(`${apiBase}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const text = await res.text();
      showToast('Failed: ' + (text || res.statusText));
      return;
    }

    resetForm();
    page = 0;
    loadItems();
    showToast(id ? 'Item updated' : 'Item added');
  } catch (err) {
    console.error(err);
    showToast('Network error');
  }
}

function resetForm() {
  document.getElementById('itemForm').reset();
  document.getElementById('itemId').value = '';
  document.getElementById('submitBtn').textContent = 'Save Item';
}

/* Controls */
function bindControls() {
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');

  searchInput?.addEventListener('input', (e) => {
    q = e.target.value.trim();
    page = 0;
    debounceLoad();
  });

  sortSelect?.addEventListener('change', (e) => {
    sort = e.target.value;
    page = 0;
    loadItems();
  });

  document.getElementById('prevPage').addEventListener('click', () => { if (page > 0) { page--; loadItems(); }});
  document.getElementById('nextPage').addEventListener('click', () => { page++; loadItems(); });

  document.getElementById('openAdd').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    resetForm();
    document.getElementById('name').focus();
  });
}

/* Debounce */
let debounceTimer = null;
function debounceLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => loadItems(), 300);
}

/* Load items */
async function loadItems() {
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  params.append('page', page);
  params.append('size', size);
  if (sort) params.append('sort', sort);

  try {
    const res = await fetch(`${apiBase}?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch items');
    const data = await res.json();
    renderItems(data.items || []);
    updatePageInfo(data.page ?? page, data.size ?? size, data.total ?? (data.items?.length ?? 0));
  } catch (err) {
    console.error(err);
    showToast('Could not load items');
  }
}

/* Render list */
function renderItems(items) {
  const container = document.getElementById('itemsContainer');
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = `<div class="result-card"><div class="item-meta"><h4>No items found</h4><p class="muted">Try adding a new item or change search filters.</p></div></div>`;
    return;
  }
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="item-meta">
        <h4>${escapeHtml(item.name)}</h4>
        <p>${escapeHtml(truncate(item.description, 160))}</p>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="text-align:right">
          <div style="font-weight:800;font-size:1.05rem">₹${(item.price ?? 0).toFixed(2)}</div>
          <div class="small muted">${new Date(item.createdAt || Date.now()).toLocaleString()}</div>
        </div>
        <div>
          <button class="btn" onclick="showDetails(${item.id})">Details</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

/* Pagination info */
function updatePageInfo(p, s, total) {
  const pageInfo = document.getElementById('pageInfo');
  const from = total ? (p * s + 1) : 0;
  const to = Math.min((p + 1) * s, total);
  pageInfo.textContent = `Showing ${total ? from : 0} - ${to} of ${total} (Page ${p + 1})`;
  document.getElementById('prevPage').disabled = p <= 0;
  document.getElementById('nextPage').disabled = to >= total;
}

/* Details modal */
const detailModal = document.getElementById('detailModal');
const closeModalBtn = document.getElementById('closeModal');
if (closeModalBtn) closeModalBtn.addEventListener('click', () => hideModal());

async function showDetails(id) {
  try {
    const res = await fetch(`${apiBase}/${id}`);
    if (!res.ok) { showToast('Item not found'); return; }
    const item = await res.json();
    document.getElementById('detailName').textContent = item.name;
    document.getElementById('detailDesc').textContent = item.description;
    document.getElementById('detailPrice').textContent = (item.price ?? 0).toFixed(2);
    document.getElementById('detailCreated').textContent = new Date(item.createdAt || Date.now()).toLocaleString();

    document.getElementById('editBtn').onclick = () => openEdit(item);
    document.getElementById('deleteBtn').onclick = () => confirmDelete(item.id);

    showModal();
  } catch (err) {
    console.error(err);
    showToast('Failed to load details');
  }
}

function showModal() {
  if (!detailModal) return;
  detailModal.classList.remove('hidden');
  detailModal.setAttribute('aria-hidden', 'false');
}

function hideModal() {
  if (!detailModal) return;
  detailModal.classList.add('hidden');
  detailModal.setAttribute('aria-hidden', 'true');
}

/* Edit flow */
function openEdit(item) {
  hideModal();
  document.getElementById('itemId').value = item.id;
  document.getElementById('name').value = item.name;
  document.getElementById('description').value = item.description;
  document.getElementById('price').value = item.price ?? 0;
  document.getElementById('submitBtn').textContent = 'Update Item';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Delete flow */
async function confirmDelete(id) {
  if (!confirm('Delete this item permanently?')) return;
  try {
    const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' });
    if (res.status === 204) {
      showToast('Deleted');
      hideModal();
      loadItems();
    } else {
      showToast('Failed to delete');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error');
  }
}

/* Helpers */
function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[&<"'>]/g, function (m) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m];
  });
}

/* Toast */
let toastTimer = null;
function showToast(msg) {
  if (!document.body) { alert(msg); return; }
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.position = 'fixed';
    toast.style.right = '20px';
    toast.style.bottom = '20px';
    toast.style.background = 'rgba(15,23,42,0.92)';
    toast.style.color = '#fff';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '10px';
    toast.style.boxShadow = '0 10px 30px rgba(2,6,23,0.6)';
    toast.style.zIndex = 9999;
    toast.style.transition = 'opacity .28s ease';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}
