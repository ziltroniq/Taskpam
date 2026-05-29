/* =============================================
   TASKPAM — app.js PRODUCTION (avec import CSV)
   ============================================= */
const API_BASE = 'https://taskpam-worker.hbwdatasolutions.workers.dev';
const MONLIX_APP_ID = "VOTRE_APP_ID_MONLIX";
const OFFER_WALL_URL = `https://wall.monlix.com/app?appid=${MONLIX_APP_ID}&userid=`;

let authToken = localStorage.getItem('tp_token');
let currentUser = null;

async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${endpoint}`, options);
  if (res.status === 401) {
    localStorage.removeItem('tp_token');
    handleLogout();
    throw new Error('Session expirée');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur réseau');
  }
  return res.json();
}

async function handleLogin() {
  const id = document.getElementById('loginId').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value;
  const err = document.getElementById('loginError');
  try {
    const data = await apiCall('/api/login', 'POST', { userId: id, password: pass });
    authToken = data.token;
    localStorage.setItem('tp_token', authToken);
    currentUser = { id: data.userId, role: data.role, name: data.name, teamId: data.teamId };
    err.classList.add('hidden');
    showApp();
  } catch (e) {
    err.classList.remove('hidden');
  }
}

function handleLogout() {
  localStorage.removeItem('tp_token');
  authToken = null;
  currentUser = null;
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

async function restoreSession() {
  if (!authToken) return;
  try {
    const payload = JSON.parse(atob(authToken.split('.')[1]));
    currentUser = { id: payload.userId, role: payload.role };
    showApp();
  } catch {
    handleLogout();
  }
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('navUserId').textContent = currentUser.id;
  document.getElementById('roleTag').textContent = currentUser.role.toUpperCase();

  ['workerView','managerView','adminView'].forEach(v => document.getElementById(v).classList.add('hidden'));
  document.getElementById('workerBottomNav').classList.add('hidden');
  document.getElementById('navBalance').classList.add('hidden');

  if (currentUser.role === 'worker') renderWorker();
  if (currentUser.role === 'manager') renderManager();
  if (currentUser.role === 'admin') renderAdmin();
}

// ─── WORKER ───────────────────────────────────
async function renderWorker() {
  document.getElementById('workerView').classList.remove('hidden');
  document.getElementById('workerBottomNav').classList.remove('hidden');
  document.getElementById('navBalance').classList.remove('hidden');
  try {
    const data = await apiCall(`/api/user-data?userId=${currentUser.id}`);
    document.getElementById('workerName').textContent = currentUser.name || 'Worker';
    document.getElementById('workerBalanceHTG').textContent = data.balanceHTG.toLocaleString();
    document.getElementById('workerWeekEarnings').textContent = data.weekEarnings.toLocaleString() + ' HTG';
    document.getElementById('workerTaskCount').textContent = data.totalTasks;
    document.getElementById('navBalanceAmt').textContent = data.balanceHTG.toLocaleString() + ' HTG';

    document.getElementById('offerWallUserId').textContent = 'ID: ' + currentUser.id;
    const frame = document.getElementById('offerWallFrame');
    frame.src = OFFER_WALL_URL + encodeURIComponent(currentUser.id);
    frame.onerror = () => {
      frame.style.display = 'none';
      document.getElementById('offerWallFallback').classList.remove('hidden');
      document.getElementById('fallbackWId').textContent = currentUser.id;
    };

    renderHistory(data.history);
  } catch (err) {
    showToast('Erreur chargement données worker');
  }
}

// ─── MANAGER ─────────────────────────────────
async function renderManager() {
  document.getElementById('managerView').classList.remove('hidden');
  try {
    const data = await apiCall('/api/team-workers');
    document.getElementById('managerName').textContent = currentUser.name || 'Manager';
    document.getElementById('teamTotalEarnings').textContent = data.totalHTG.toLocaleString() + ' HTG';
    document.getElementById('teamTotalTasks').textContent = data.totalTasks;
    document.getElementById('teamCount').textContent = data.workers.length + ' workers';

    const c = document.getElementById('teamWorkersList');
    c.innerHTML = '';
    data.workers.forEach((w, i) => {
      const initials = w.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
      const pct = Math.min(Math.round((w.totalTasks / 50) * 100), 100);
      const el = document.createElement('div');
      el.className = 'worker-row flex items-center justify-between p-3 rounded-xl bg-white card-anim';
      el.style.animationDelay = (i * 0.05) + 's';
      el.innerHTML = `<div class="flex items-center gap-3"><div class="avatar">${initials}</div><div><p class="text-sm font-semibold text-text">${w.name}</p><p class="text-xs text-muted">${w.id}</p><div class="progress-bar w-20 mt-1"><div class="progress-fill" style="width:${pct}%"></div></div></div></div><div class="text-right"><p class="font-display font-bold text-sm text-primary">${w.balanceHTG.toLocaleString()} HTG</p><p class="text-xs text-muted">${w.totalTasks} tâches</p></div>`;
      c.appendChild(el);
    });
  } catch (err) {
    showToast('Erreur chargement manager');
  }
}

// ─── ADMIN ───────────────────────────────────
async function renderAdmin() {
  document.getElementById('adminView').classList.remove('hidden');
  try {
    const data = await apiCall('/api/all-workers');
    const rate = data.exchangeRate || 135;
    document.getElementById('exchangeRateInput').value = rate;

    document.getElementById('adminTotalUSD').textContent = '$' + (data.totalHTG / rate).toFixed(2);
    document.getElementById('adminTotalHTG').textContent = data.totalHTG.toLocaleString() + ' HTG';
    document.getElementById('adminActiveWorkers').textContent = data.workers.length;
    document.getElementById('adminTotalTasks').textContent = data.totalTasks;
    document.getElementById('currentRateDisplay').textContent = rate + ' HTG';
    document.getElementById('adminWorkerCount').textContent = data.workers.length + ' workers';

    const marketRate = 150;
    const margin = (((marketRate - rate) / marketRate) * 100).toFixed(1);
    document.getElementById('marginDisplay').textContent = margin + '%';

    const c = document.getElementById('adminWorkersList');
    c.innerHTML = '';
    data.workers.forEach((w, i) => {
      const initials = w.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
      const pct = Math.min(Math.round((w.totalTasks / 50) * 100), 100);
      const el = document.createElement('div');
      el.className = 'worker-row flex items-center justify-between p-3 rounded-xl bg-white card-anim';
      el.style.animationDelay = (i * 0.04) + 's';
      el.innerHTML = `<div class="flex items-center gap-3"><div class="avatar">${initials}</div><div><p class="text-sm font-semibold text-text">${w.name}</p><p class="text-xs text-muted">${w.id} · ${w.teamId}</p><div class="progress-bar w-24 mt-1"><div class="progress-fill" style="width:${pct}%"></div></div></div></div><div class="text-right"><p class="font-display font-bold text-sm text-primary">${w.balanceHTG.toLocaleString()} HTG</p><span class="stat-badge">${w.totalTasks} tâches</span></div>`;
      c.appendChild(el);
    });

    // Afficher le bouton d'import (admin)
    document.getElementById('importBtn')?.classList.remove('hidden');
  } catch (err) {
    showToast('Erreur chargement admin');
  }
}

// ─── BOUTON IMPORT (admin) ─────────────────
// Ajoutez ce bouton dans la section admin du HTML, par exemple après le bloc des frais :
// <button id="importBtn" onclick="openImportModal()" class="hidden w-full bg-primaryLt text-primary font-bold py-3 rounded-xl">📥 Importer des utilisateurs (CSV)</button>

function openImportModal() {
  document.getElementById('importModal').classList.remove('hidden');
}

function closeImportModal() {
  document.getElementById('importModal').classList.add('hidden');
  document.getElementById('importStatus').classList.add('hidden');
}

async function importCSV() {
  const fileInput = document.getElementById('csvFileInput');
  const file = fileInput.files[0];
  if (!file) {
    showToast('Sélectionnez un fichier CSV');
    return;
  }
  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) {
    showToast('Fichier vide ou sans données');
    return;
  }
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const required = ['id', 'password', 'role', 'name'];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length) {
    showToast(`Colonnes manquantes : ${missing.join(', ')}`);
    return;
  }

  const users = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols.length < headers.length) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = cols[idx]; });
    if (obj.id && obj.password && obj.role && obj.name) {
      users.push({
        id: obj.id,
        password: obj.password,
        role: obj.role,
        name: obj.name,
        teamId: obj.teamId || ''
      });
    }
  }

  try {
    const res = await apiCall('/api/import-users', 'POST', users);
    document.getElementById('importStatus').classList.remove('hidden');
    document.getElementById('importStatus').textContent = `✅ ${res.imported} utilisateurs importés. Erreurs: ${res.errors?.length || 0}`;
    showToast(`${res.imported} utilisateurs importés !`);
    renderAdmin(); // rafraîchir la liste
  } catch (e) {
    showToast('❌ Erreur lors de l\'import');
  }
}

// ─── ADMIN ACTIONS ───────────────────────────
async function updateExchangeRate() {
  const rate = parseInt(document.getElementById('exchangeRateInput').value);
  if (isNaN(rate) || rate < 1) { showToast('⚠️ Taux invalide'); return; }
  try {
    await apiCall('/api/update-rate', 'POST', { rate });
    showToast('✅ Taux mis à jour');
    renderAdmin();
  } catch { showToast('❌ Erreur'); }
}

async function applyMaintenanceFee() {
  try {
    const res = await apiCall('/api/maintenance-fee', 'POST');
    document.getElementById('maintenanceMsg').classList.remove('hidden');
    document.getElementById('maintenanceMsg').textContent = `✅ Frais appliqués à ${res.affectedWorkers} worker(s).`;
    showToast(`Frais 250 HTG × ${res.affectedWorkers} workers`);
    renderAdmin();
  } catch { showToast('❌ Erreur'); }
}

// ─── HISTORIQUE ─────────────────────────────
function renderHistory(history) {
  const c = document.getElementById('workerTaskHistory');
  c.innerHTML = '';
  if (!history || !history.length) {
    c.innerHTML = `<div class="text-center py-8"><div class="text-4xl mb-2">📭</div><p class="text-muted text-sm font-medium">Aucun gain pour l'instant</p></div>`;
    return;
  }
  history.slice().reverse().forEach((t, i) => {
    const isNeg = t.amountHTG < 0;
    const el = document.createElement('div');
    el.className = 'history-item flex items-center justify-between px-3 py-3 rounded-xl hover:bg-bg cursor-default';
    el.style.animationDelay = (i * 0.05) + 's';
    el.innerHTML = `<div class="flex items-center gap-3"><div class="w-9 h-9 rounded-xl flex items-center justify-center ${isNeg ? 'bg-red-50' : 'bg-primaryLt'}"><span>${isNeg ? '💸' : '✅'}</span></div><div><p class="text-sm font-medium text-text">${t.label}</p><p class="text-xs text-muted">${t.date}</p></div></div><span class="font-display font-bold text-sm ${isNeg ? 'text-danger' : 'text-primary'}">${isNeg ? '' : '+'}${t.amountHTG} HTG</span>`;
    c.appendChild(el);
  });
}

// ─── TOAST ───────────────────────────────────
function showToast(msg, ms = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

// ─── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  restoreSession();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const ls = document.getElementById('loginScreen');
    if (!ls.classList.contains('hidden')) handleLogin();
  }
});
