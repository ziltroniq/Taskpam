/* =============================================
   TASKPAM — app.js v3.0 PRODUCTION
   Appels API vers Cloudflare Worker
   ============================================= */

// ⚠️ Remplacez par l'URL de votre worker déployé
const API_BASE = 'https://taskpam-api.votre-domaine.workers.dev';

// App ID Monlix (inchangé)
const MONLIX_APP_ID   = "VOTRE_APP_ID_MONLIX";
const OFFER_WALL_URL  = `https://wall.monlix.com/app?appid=${MONLIX_APP_ID}&userid=`;

// ─── GESTION DU TOKEN ────────────────────────
let authToken = localStorage.getItem('tp_token');
let currentUser = null; // { userId, role, name, teamId? }

async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, options);
  if (res.status === 401) {
    // token expiré
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

// ─── LOGIN ───────────────────────────────────
async function handleLogin() {
  const id   = document.getElementById('loginId').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value;
  const err  = document.getElementById('loginError');

  try {
    const data = await apiCall('/api/login', 'POST', { userId: id, password: pass });
    // data = { token, userId, role, name }
    authToken = data.token;
    localStorage.setItem('tp_token', authToken);
    currentUser = { id: data.userId, role: data.role, name: data.name };
    err.classList.add('hidden');
    showApp();
  } catch (e) {
    err.classList.remove('hidden');
    document.getElementById('loginId').classList.add('border-danger');
    console.error(e);
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
    // vérifie que le token est valide et récupère le rôle
    const payload = JSON.parse(atob(authToken.split('.')[1]));
    currentUser = { id: payload.userId, role: payload.role };
    // on n'a pas le nom dans le payload, on va le chercher via un appel config ? On va simplifier :
    // On pourra récupérer le nom plus tard via les données de la vue.
    showApp();
  } catch {
    handleLogout();
  }
}

// ─── ROUTING ─────────────────────────────────
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');

  document.getElementById('navUserId').textContent = currentUser.id;
  document.getElementById('roleTag').textContent   = currentUser.role.toUpperCase();

  ['workerView','managerView','adminView'].forEach(v =>
    document.getElementById(v).classList.add('hidden'));
  document.getElementById('workerBottomNav').classList.add('hidden');
  document.getElementById('navBalance').classList.add('hidden');

  if (currentUser.role === 'worker')  renderWorker();
  if (currentUser.role === 'manager') renderManager();
  if (currentUser.role === 'admin')   renderAdmin();
}

// ─── WORKER VIEW ─────────────────────────────
async function renderWorker() {
  document.getElementById('workerView').classList.remove('hidden');
  document.getElementById('workerBottomNav').classList.remove('hidden');
  document.getElementById('navBalance').classList.remove('hidden');

  try {
    const data = await apiCall(`/api/user-data?userId=${currentUser.id}`);
    // data = { balanceHTG, weekEarnings, totalTasks, history }
    document.getElementById('workerName').textContent = currentUser.name || 'Worker';
    document.getElementById('workerBalanceHTG').textContent   = data.balanceHTG.toLocaleString();
    document.getElementById('workerWeekEarnings').textContent = data.weekEarnings.toLocaleString() + ' HTG';
    document.getElementById('workerTaskCount').textContent    = data.totalTasks;
    document.getElementById('navBalanceAmt').textContent      = data.balanceHTG.toLocaleString() + ' HTG';

    // Offer Wall
    const frameUrl = OFFER_WALL_URL + encodeURIComponent(currentUser.id);
    const frame = document.getElementById('offerWallFrame');
    document.getElementById('offerWallUserId').textContent = 'ID: ' + currentUser.id;
    frame.src = frameUrl;
    frame.onerror = () => {
      frame.style.display = 'none';
      const fb = document.getElementById('offerWallFallback');
      fb.classList.remove('hidden');
      document.getElementById('fallbackWId').textContent = currentUser.id;
    };

    renderHistory(data.history);
  } catch (err) {
    showToast('Erreur chargement données worker');
  }
}

// ─── MANAGER VIEW ────────────────────────────
async function renderManager() {
  document.getElementById('managerView').classList.remove('hidden');
  try {
    const data = await apiCall('/api/team-workers');
    document.getElementById('managerName').textContent = currentUser.name || 'Manager';
    document.getElementById('teamTotalEarnings').textContent = data.totalHTG.toLocaleString() + ' HTG';
    document.getElementById('teamTotalTasks').textContent    = data.totalTasks;
    document.getElementById('teamCount').textContent         = data.workers.length + ' workers';

    const c = document.getElementById('teamWorkersList');
    c.innerHTML = '';
    if (!data.workers.length) {
      c.innerHTML = `<p class="text-muted text-sm text-center py-4">Aucun worker dans votre équipe.</p>`;
      return;
    }

    data.workers.forEach((w, i) => {
      const initials = w.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
      const pct = Math.min(Math.round((w.totalTasks / 50) * 100), 100);
      const el = document.createElement('div');
      el.className = 'worker-row flex items-center justify-between p-3 rounded-xl bg-white card-anim';
      el.style.animationDelay = (i * 0.05) + 's';
      el.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="avatar">${initials}</div>
          <div>
            <p class="text-sm font-semibold text-text">${w.name}</p>
            <p class="text-xs text-muted">${w.id}</p>
            <div class="progress-bar w-20 mt-1">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
          </div>
        </div>
        <div class="text-right">
          <p class="font-display font-bold text-sm text-primary">${w.balanceHTG.toLocaleString()} HTG</p>
          <p class="text-xs text-muted">${w.totalTasks} tâches</p>
        </div>`;
      c.appendChild(el);
    });
  } catch (err) {
    showToast('Erreur chargement données manager');
  }
}

// ─── ADMIN VIEW ──────────────────────────────
async function renderAdmin() {
  document.getElementById('adminView').classList.remove('hidden');
  try {
    const data = await apiCall('/api/all-workers');
    const rate = data.exchangeRate || 135;
    document.getElementById('exchangeRateInput').value = rate;

    const totalHTG   = data.totalHTG;
    const totalTasks = data.totalTasks;
    const totalUSD   = (totalHTG / rate).toFixed(2);

    document.getElementById('adminTotalUSD').textContent      = '$' + totalUSD;
    document.getElementById('adminTotalHTG').textContent      = totalHTG.toLocaleString() + ' HTG';
    document.getElementById('adminActiveWorkers').textContent = data.workers.length;
    document.getElementById('adminTotalTasks').textContent    = totalTasks;
    document.getElementById('currentRateDisplay').textContent = rate + ' HTG';
    document.getElementById('adminWorkerCount').textContent   = data.workers.length + ' workers';

    const marketRate = 150;
    const margin     = (((marketRate - rate) / marketRate) * 100).toFixed(1);
    document.getElementById('marginDisplay').textContent = margin + '%';

    const c = document.getElementById('adminWorkersList');
    c.innerHTML = '';
    data.workers.forEach((w, i) => {
      const initials = w.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
      const pct = Math.min(Math.round((w.totalTasks / 50) * 100), 100);
      const el = document.createElement('div');
      el.className = 'worker-row flex items-center justify-between p-3 rounded-xl bg-white card-anim';
      el.style.animationDelay = (i * 0.04) + 's';
      el.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="avatar">${initials}</div>
          <div>
            <p class="text-sm font-semibold text-text">${w.name}</p>
            <p class="text-xs text-muted">${w.id} · ${w.teamId}</p>
            <div class="progress-bar w-24 mt-1">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
          </div>
        </div>
        <div class="text-right">
          <p class="font-display font-bold text-sm text-primary">${w.balanceHTG.toLocaleString()} HTG</p>
          <span class="stat-badge">${w.totalTasks} tâches</span>
        </div>`;
      c.appendChild(el);
    });
  } catch (err) {
    showToast('Erreur chargement admin');
  }
}

// ─── ADMIN CONTROLS ──────────────────────────
async function updateExchangeRate() {
  const rate = parseInt(document.getElementById('exchangeRateInput').value);
  if (isNaN(rate) || rate < 1) {
    showToast('⚠️ Taux invalide');
    return;
  }
  try {
    await apiCall('/api/update-rate', 'POST', { rate });
    showToast('✅ Taux mis à jour : ' + rate + ' HTG/USD');
    renderAdmin();
  } catch (err) {
    showToast('❌ Erreur lors de la mise à jour');
  }
}

async function applyMaintenanceFee() {
  try {
    const res = await apiCall('/api/maintenance-fee', 'POST');
    const msg = document.getElementById('maintenanceMsg');
    msg.classList.remove('hidden');
    msg.className = 'text-xs text-center mt-2 font-medium text-primary';
    msg.textContent = `✅ Frais appliqués à ${res.affectedWorkers} worker(s).`;
    showToast(`Frais 250 HTG appliqués à ${res.affectedWorkers} workers`);
    renderAdmin();
  } catch (err) {
    showToast('❌ Erreur lors de l\'application des frais');
  }
}

// ─── HISTORIQUE (utilisé par worker) ───────
function renderHistory(history) {
  const c = document.getElementById('workerTaskHistory');
  c.innerHTML = '';
  if (!history || !history.length) {
    c.innerHTML = `
      <div class="text-center py-8">
        <div class="text-4xl mb-2">📭</div>
        <p class="text-muted text-sm font-medium">Aucun gain pour l'instant</p>
        <p class="text-muted text-xs mt-1">Complétez des offres pour voir votre historique</p>
      </div>`;
    return;
  }

  history.slice().reverse().forEach((t, i) => {
    const isNeg = t.amountHTG < 0;
    const el = document.createElement('div');
    el.className = 'history-item flex items-center justify-between px-3 py-3 rounded-xl hover:bg-bg cursor-default';
    el.style.animationDelay = (i * 0.05) + 's';
    el.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl flex items-center justify-center ${isNeg ? 'bg-red-50' : 'bg-primaryLt'}">
          <span class="text-base">${isNeg ? '💸' : '✅'}</span>
        </div>
        <div>
          <p class="text-sm font-medium text-text">${t.label}</p>
          <p class="text-xs text-muted">${t.date}</p>
        </div>
      </div>
      <span class="font-display font-bold text-sm ${isNeg ? 'text-danger' : 'text-primary'}">
        ${isNeg ? '' : '+'}${t.amountHTG} HTG
      </span>`;
    c.appendChild(el);
  });
}

// ─── SIMULATION POSTBACK (pour test local) ───
// En production, l'Offer Wall appelle directement /api/postback sur le Worker.
// Cette fonction reste utile pour tester depuis la console.
window.simulatePostback = async (userId, amount = 1.5) => {
  const res = await fetch(`${API_BASE}/api/postback?userid=${userId}&amount=${amount}&offer_id=TEST_${Date.now()}&sig=ATTENTION_SIG_INVALIDE`);
  // Note : impossible de générer une signature correcte côté client car on ne connaît pas le SECRET_KEY.
  // Ce test échouera volontairement. La vraie signature est calculée par le serveur lors du postback réel.
  console.log(await res.text());
};

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

  // Gestion du postback simulé (pour test)
  const p = new URLSearchParams(window.location.search);
  if (p.get('postback') === '1') {
    // ne fait rien, le vrai postback est géré côté serveur
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const ls = document.getElementById('loginScreen');
    if (!ls.classList.contains('hidden')) handleLogin();
  }
});
