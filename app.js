/* =============================================
   TASKPAM — app.js v2.0
   Thème Monlix | Green & White | Pro
   ============================================= */

// ─── CONFIGURATION ───────────────────────────
// ⚠️ Remplace par ton vrai App ID Monlix
const MONLIX_APP_ID   = "VOTRE_APP_ID_MONLIX";
const OFFER_WALL_URL  = `https://wall.monlix.com/app?appid=${MONLIX_APP_ID}&userid=`;

// Taux de change par défaut (1 USD → HTG)
let exchangeRate = parseInt(localStorage.getItem('tp_rate') || '135');

// ─── BASE DE DONNÉES SIMULÉE ─────────────────
const USERS_DB = {
  'worker_402': { pass:'1234',      role:'worker',  name:'Jean Pierre',    teamId:'team_apex' },
  'worker_403': { pass:'1234',      role:'worker',  name:'Marie Claire',   teamId:'team_apex' },
  'worker_404': { pass:'1234',      role:'worker',  name:'Roody Laurent',  teamId:'team_bolt' },
  'worker_405': { pass:'1234',      role:'worker',  name:'Nadège Joseph',  teamId:'team_bolt' },
  'manager_01': { pass:'1234',      role:'manager', name:'Alexandre Marc', teamId:'team_apex' },
  'manager_02': { pass:'1234',      role:'manager', name:'Sophia Jean',    teamId:'team_bolt' },
  'admin':      { pass:'admin2025', role:'admin',   name:'HBW Admin',      teamId:null },
};

// ─── WORKER DATA (LocalStorage) ──────────────
function getWorkerData(userId) {
  const raw = localStorage.getItem('tp_w_' + userId);
  if (raw) return JSON.parse(raw);
  return { balanceHTG:0, weekEarnings:0, totalTasks:0, history:[] };
}

function saveWorkerData(userId, data) {
  localStorage.setItem('tp_w_' + userId, JSON.stringify(data));
}

function getAllWorkers() {
  return Object.entries(USERS_DB)
    .filter(([,u]) => u.role === 'worker')
    .map(([id, u]) => ({ id, ...u, ...getWorkerData(id) }));
}

// ─── SESSION ─────────────────────────────────
let currentUser = null;

function handleLogin() {
  const id   = document.getElementById('loginId').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value;
  const err  = document.getElementById('loginError');
  const user = USERS_DB[id];

  if (!user || user.pass !== pass) {
    err.classList.remove('hidden');
    document.getElementById('loginId').classList.add('border-danger');
    return;
  }

  err.classList.add('hidden');
  currentUser = { id, ...user };
  localStorage.setItem('tp_session', JSON.stringify({ id }));
  showApp();
}

function handleLogout() {
  localStorage.removeItem('tp_session');
  currentUser = null;
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

function restoreSession() {
  const raw = localStorage.getItem('tp_session');
  if (!raw) return;
  const { id } = JSON.parse(raw);
  const user   = USERS_DB[id];
  if (!user) return;
  currentUser  = { id, ...user };
  showApp();
}

// ─── ROUTING ─────────────────────────────────
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');

  // Nav info
  document.getElementById('navUserId').textContent = currentUser.id;
  document.getElementById('roleTag').textContent   = currentUser.role.toUpperCase();

  // Reset views
  ['workerView','managerView','adminView'].forEach(v =>
    document.getElementById(v).classList.add('hidden'));
  document.getElementById('workerBottomNav').classList.add('hidden');
  document.getElementById('navBalance').classList.add('hidden');

  if (currentUser.role === 'worker')  renderWorker();
  if (currentUser.role === 'manager') renderManager();
  if (currentUser.role === 'admin')   renderAdmin();
}

// ─── WORKER VIEW ─────────────────────────────
function renderWorker() {
  document.getElementById('workerView').classList.remove('hidden');
  document.getElementById('workerBottomNav').classList.remove('hidden');
  document.getElementById('navBalance').classList.remove('hidden');

  const data = getWorkerData(currentUser.id);
  const user = USERS_DB[currentUser.id];

  // Header
  document.getElementById('workerName').textContent = user.name;

  // Balance
  document.getElementById('workerBalanceHTG').textContent   = data.balanceHTG.toLocaleString();
  document.getElementById('workerWeekEarnings').textContent = data.weekEarnings.toLocaleString() + ' HTG';
  document.getElementById('workerTaskCount').textContent    = data.totalTasks;
  document.getElementById('navBalanceAmt').textContent      = data.balanceHTG.toLocaleString() + ' HTG';

  // Offer Wall — Injection dynamique de l'userId
  const frameUrl = OFFER_WALL_URL + encodeURIComponent(currentUser.id);
  const frame    = document.getElementById('offerWallFrame');
  document.getElementById('offerWallUserId').textContent = 'ID: ' + currentUser.id;

  frame.src = frameUrl;
  frame.onerror = () => {
    frame.style.display = 'none';
    const fb = document.getElementById('offerWallFallback');
    fb.classList.remove('hidden');
    document.getElementById('fallbackWId').textContent = currentUser.id;
  };

  // Historique
  renderHistory(data.history);
}

function renderHistory(history) {
  const c = document.getElementById('workerTaskHistory');
  c.innerHTML = '';

  if (!history.length) {
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

// ─── MANAGER VIEW ────────────────────────────
function renderManager() {
  document.getElementById('managerView').classList.remove('hidden');
  document.getElementById('managerName').textContent = USERS_DB[currentUser.id].name;

  const teamId     = currentUser.teamId;
  const teamWorkers = getAllWorkers().filter(w => w.teamId === teamId);

  const totalHTG   = teamWorkers.reduce((a,w) => a + w.balanceHTG, 0);
  const totalTasks = teamWorkers.reduce((a,w) => a + w.totalTasks, 0);

  document.getElementById('teamTotalEarnings').textContent = totalHTG.toLocaleString() + ' HTG';
  document.getElementById('teamTotalTasks').textContent    = totalTasks;
  document.getElementById('teamCount').textContent         = teamWorkers.length + ' workers';

  const c = document.getElementById('teamWorkersList');
  c.innerHTML = '';

  if (!teamWorkers.length) {
    c.innerHTML = `<p class="text-muted text-sm text-center py-4">Aucun worker dans votre équipe.</p>`;
    return;
  }

  teamWorkers.forEach((w, i) => {
    const initials = w.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const pct      = Math.min(Math.round((w.totalTasks / 50) * 100), 100);
    const el       = document.createElement('div');
    el.className   = 'worker-row flex items-center justify-between p-3 rounded-xl bg-white card-anim';
    el.style.animationDelay = (i * 0.05) + 's';
    el.innerHTML   = `
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
}

// ─── ADMIN VIEW ──────────────────────────────
function renderAdmin() {
  document.getElementById('adminView').classList.remove('hidden');

  const workers    = getAllWorkers();
  const totalHTG   = workers.reduce((a,w) => a + w.balanceHTG, 0);
  const totalTasks = workers.reduce((a,w) => a + w.totalTasks, 0);
  const totalUSD   = (totalHTG / exchangeRate).toFixed(2);

  document.getElementById('adminTotalUSD').textContent      = '$' + totalUSD;
  document.getElementById('adminTotalHTG').textContent      = totalHTG.toLocaleString() + ' HTG';
  document.getElementById('adminActiveWorkers').textContent = workers.length;
  document.getElementById('adminTotalTasks').textContent    = totalTasks;
  document.getElementById('exchangeRateInput').value        = exchangeRate;
  document.getElementById('currentRateDisplay').textContent = exchangeRate + ' HTG';
  document.getElementById('adminWorkerCount').textContent   = workers.length + ' workers';

  const marketRate = 150;
  const margin     = (((marketRate - exchangeRate) / marketRate) * 100).toFixed(1);
  document.getElementById('marginDisplay').textContent = margin + '%';

  const c = document.getElementById('adminWorkersList');
  c.innerHTML = '';

  workers.forEach((w, i) => {
    const initials = w.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const pct      = Math.min(Math.round((w.totalTasks / 50) * 100), 100);
    const el       = document.createElement('div');
    el.className   = 'worker-row flex items-center justify-between p-3 rounded-xl bg-white card-anim';
    el.style.animationDelay = (i * 0.04) + 's';
    el.innerHTML   = `
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
}

// ─── ADMIN CONTROLS ──────────────────────────
function updateExchangeRate() {
  const v = parseInt(document.getElementById('exchangeRateInput').value);
  if (isNaN(v) || v < 1) { showToast('⚠️ Taux invalide'); return; }
  exchangeRate = v;
  localStorage.setItem('tp_rate', v);
  showToast('✅ Taux mis à jour : ' + v + ' HTG/USD');
  renderAdmin();
}

function applyMaintenanceFee() {
  const FEE     = 250;
  const workers = getAllWorkers();
  let   count   = 0;

  workers.forEach(w => {
    const d = getWorkerData(w.id);
    if (d.balanceHTG >= FEE) {
      d.balanceHTG -= FEE;
      d.history.push({
        label: 'Frais de maintenance plateforme',
        date: new Date().toLocaleDateString('fr-HT'),
        amountHTG: -FEE
      });
      saveWorkerData(w.id, d);
      count++;
    }
  });

  const msg = document.getElementById('maintenanceMsg');
  msg.classList.remove('hidden');
  msg.className = 'text-xs text-center mt-2 font-medium text-primary';
  msg.textContent = `✅ Frais appliqués à ${count} worker(s).`;
  showToast(`Frais 250 HTG appliqués à ${count} workers`);
  renderAdmin();
}

// ─── POSTBACK HANDLER ────────────────────────
/**
 * Traite un postback de l'Offer Wall (Monlix/CPALead)
 * URL type: https://taskpam.com/postback?userid=worker_402&amount=1.5&offer_id=123&sig=xxx
 *
 * @param {string} userId
 * @param {number} amountUSD
 * @param {string} offerId
 * @param {string} sig
 */
function processPostback(userId, amountUSD, offerId, sig) {
  if (!USERS_DB[userId] || USERS_DB[userId].role !== 'worker') {
    console.error('[POSTBACK] Worker inconnu:', userId);
    return { status:'error', message:'Worker not found' };
  }

  if (!sig) {
    console.error('[POSTBACK] Signature manquante');
    return { status:'error', message:'Invalid signature' };
  }

  const amountHTG = Math.floor(amountUSD * exchangeRate);
  const data      = getWorkerData(userId);

  data.balanceHTG   += amountHTG;
  data.weekEarnings += amountHTG;
  data.totalTasks   += 1;
  data.history.push({
    label: `Offre complétée #${offerId}`,
    date: new Date().toLocaleDateString('fr-HT'),
    amountHTG
  });

  saveWorkerData(userId, data);
  console.log(`[POSTBACK] ✅ ${userId} → +${amountHTG} HTG ($${amountUSD})`);

  if (currentUser && currentUser.id === userId) {
    renderWorker();
    showToast(`🎉 +${amountHTG} HTG crédités !`);
  }

  return { status:'ok', credited: amountHTG };
}

/* ══ CLOUDFLARE WORKERS — PRODUCTION ══════════════
addEventListener('fetch', e => e.respondWith(handlePostback(e.request)));

async function handlePostback(req) {
  const url       = new URL(req.url);
  const userId    = url.searchParams.get('userid');
  const amount    = parseFloat(url.searchParams.get('amount'));
  const offerId   = url.searchParams.get('offer_id');
  const sig       = url.searchParams.get('sig');

  // Vérifier signature SHA256 : sha256(userId + amount + SECRET)
  const expected = await sha256(userId + amount + 'VOTRE_SECRET');
  if (sig !== expected) return new Response('Unauthorized', {status:401});

  const rate      = parseInt(await KV.get('exchange_rate') || '135');
  const amountHTG = Math.floor(amount * rate);
  const key       = 'worker_' + userId;
  const existing  = JSON.parse(await KV.get(key) || '{"balanceHTG":0}');
  existing.balanceHTG += amountHTG;
  await KV.put(key, JSON.stringify(existing));

  return new Response('1', {status:200});
}
══════════════════════════════════════════════════ */

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

  // Gestion postback via URL params
  const p = new URLSearchParams(window.location.search);
  if (p.get('postback') === '1') {
    processPostback(
      p.get('userid'),
      parseFloat(p.get('amount') || '1'),
      p.get('offer_id') || 'DEMO',
      p.get('sig') || 'demo'
    );
  }
});

// Enter key pour login
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const ls = document.getElementById('loginScreen');
    if (!ls.classList.contains('hidden')) handleLogin();
  }
});

// Exposer pour tests console
window.simulatePostback = (userId, amount = 1.5) =>
  processPostback(userId, amount, 'TEST_' + Date.now(), 'demo_sig');
