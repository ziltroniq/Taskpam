/* =============================================
   TASKPAM — app.js
   Gestion des rôles, Offer Wall, Postback,
   Soldes HTG, Admin Controls
   ============================================= */

// ─────────────────────────────────────────────
// 1. BASE DE DONNÉES SIMULÉE (LocalStorage)
//    En production → remplacer par Firebase/Supabase
// ─────────────────────────────────────────────

const OFFER_WALL_BASE_URL = "https://wall.monlix.com/app?appid=VOTRE_APP_ID&userid=";
// ↑ Remplace VOTRE_APP_ID par ton ID Monlix/Lootably réel

const PLATFORM_SECRET = "taskpam_secret_2025"; // Clé secrète pour valider postbacks

// Taux de change par défaut (1 USD = X HTG)
// Le vrai taux marché est ~135 — on applique une marge de ~10%
let exchangeRate = parseInt(localStorage.getItem('tp_rate') || '135');

// ─────────────────────────────────────────────
// UTILISATEURS DEMO
// ─────────────────────────────────────────────
const USERS_DB = {
  'worker_402': { pass: '1234', role: 'worker', name: 'Worker 402', teamId: 'team_apex' },
  'worker_403': { pass: '1234', role: 'worker', name: 'Worker 403', teamId: 'team_apex' },
  'worker_404': { pass: '1234', role: 'worker', name: 'Worker 404', teamId: 'team_bolt' },
  'manager_01': { pass: '1234', role: 'manager', name: 'Manager Alpha', teamId: 'team_apex' },
  'manager_02': { pass: '1234', role: 'manager', name: 'Manager Beta',  teamId: 'team_bolt' },
  'admin':      { pass: 'admin2025', role: 'admin', name: 'HBW Admin', teamId: null },
};

// ─────────────────────────────────────────────
// FONCTION : Charger/sauvegarder soldes
// ─────────────────────────────────────────────
function getWorkerData(userId) {
  const raw = localStorage.getItem('tp_worker_' + userId);
  if (raw) return JSON.parse(raw);
  // Données initiales par défaut
  return {
    balanceHTG: 0,
    weekEarnings: 0,
    totalTasks: 0,
    history: []
  };
}

function saveWorkerData(userId, data) {
  localStorage.setItem('tp_worker_' + userId, JSON.stringify(data));
}

function getAllWorkers() {
  return Object.entries(USERS_DB)
    .filter(([, u]) => u.role === 'worker')
    .map(([id, u]) => ({
      id,
      name: u.name,
      teamId: u.teamId,
      ...getWorkerData(id)
    }));
}

// ─────────────────────────────────────────────
// 2. AUTHENTIFICATION
// ─────────────────────────────────────────────
let currentUser = null;

function handleLogin() {
  const id   = document.getElementById('loginId').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value;
  const err  = document.getElementById('loginError');

  const user = USERS_DB[id];
  if (!user || user.pass !== pass) {
    err.classList.remove('hidden');
    return;
  }

  err.classList.add('hidden');
  currentUser = { id, ...user };

  // Sauvegarder session
  localStorage.setItem('tp_session', JSON.stringify({ id, role: user.role }));

  showApp();
}

function handleLogout() {
  localStorage.removeItem('tp_session');
  currentUser = null;
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

// Restaurer session au rechargement
function restoreSession() {
  const raw = localStorage.getItem('tp_session');
  if (!raw) return;
  const sess = JSON.parse(raw);
  const user = USERS_DB[sess.id];
  if (!user) return;
  currentUser = { id: sess.id, ...user };
  showApp();
}

// ─────────────────────────────────────────────
// 3. ROUTING DES VUES PAR RÔLE
// ─────────────────────────────────────────────
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');

  // Nav info
  document.getElementById('navUserId').textContent = currentUser.id;
  document.getElementById('roleTag').textContent   = currentUser.role;

  // Cacher toutes les vues
  ['workerView', 'managerView', 'adminView'].forEach(v =>
    document.getElementById(v).classList.add('hidden')
  );
  document.getElementById('workerBottomNav').classList.add('hidden');

  if (currentUser.role === 'worker')  renderWorkerDashboard();
  if (currentUser.role === 'manager') renderManagerDashboard();
  if (currentUser.role === 'admin')   renderAdminDashboard();
}

// ─────────────────────────────────────────────
// 4. VUE WORKER
// ─────────────────────────────────────────────
function renderWorkerDashboard() {
  const view = document.getElementById('workerView');
  view.classList.remove('hidden');
  document.getElementById('workerBottomNav').classList.remove('hidden');

  const data = getWorkerData(currentUser.id);

  // Nom & solde
  document.getElementById('workerName').textContent = currentUser.name;
  document.getElementById('workerBalanceHTG').textContent = data.balanceHTG.toLocaleString() + ' HTG';
  document.getElementById('workerWeekEarnings').textContent = data.weekEarnings.toLocaleString() + ' HTG';

  // ── OFFER WALL iFrame ──
  // L'ID du worker est passé dynamiquement dans l'URL via le paramètre userid=
  const frameUrl = OFFER_WALL_BASE_URL + encodeURIComponent(currentUser.id);
  const frame = document.getElementById('offerWallFrame');

  frame.src = frameUrl;

  // Fallback si l'iFrame ne charge pas (CORS, blocage, etc.)
  frame.onerror = () => {
    frame.classList.add('hidden');
    const fallback = document.getElementById('offerWallFallback');
    fallback.classList.remove('hidden');
    document.getElementById('fallbackWorkerId').textContent = currentUser.id;
  };

  // ── Historique ──
  renderWorkerHistory(data.history);
}

function renderWorkerHistory(history) {
  const container = document.getElementById('workerTaskHistory');
  container.innerHTML = '';

  if (!history.length) {
    container.innerHTML = `
      <div class="bg-card border border-border rounded-xl p-4 text-center">
        <p class="text-muted text-sm">Aucune tâche complétée pour l'instant.</p>
        <p class="text-xs text-muted mt-1">Complétez des offres pour voir votre historique ici.</p>
      </div>`;
    return;
  }

  history.slice().reverse().forEach(task => {
    const el = document.createElement('div');
    el.className = 'task-card bg-card border border-border rounded-xl p-3 flex items-center justify-between';
    el.innerHTML = `
      <div>
        <p class="text-sm text-text">${task.label}</p>
        <p class="text-xs text-muted">${task.date}</p>
      </div>
      <span class="font-display text-accent text-sm">+${task.amountHTG} HTG</span>
    `;
    container.appendChild(el);
  });
}

function showWorkerTab(tab) {
  // Toggle zone visible (tasks vs history) — simple scroll
  if (tab === 'tasks') {
    document.getElementById('offerWallFrame').scrollIntoView({ behavior: 'smooth' });
  } else {
    document.getElementById('workerTaskHistory').scrollIntoView({ behavior: 'smooth' });
  }
}

// ─────────────────────────────────────────────
// 5. VUE MANAGER
// ─────────────────────────────────────────────
function renderManagerDashboard() {
  document.getElementById('managerView').classList.remove('hidden');
  document.getElementById('managerName').textContent = currentUser.name;

  // Filtrer les workers de l'équipe de ce manager
  const teamId = currentUser.teamId;
  const teamWorkers = getAllWorkers().filter(w => w.teamId === teamId);

  const totalEarnings = teamWorkers.reduce((acc, w) => acc + w.balanceHTG, 0);
  const totalTasks    = teamWorkers.reduce((acc, w) => acc + w.totalTasks, 0);

  document.getElementById('teamTotalEarnings').textContent = totalEarnings.toLocaleString() + ' HTG';
  document.getElementById('teamTotalTasks').textContent    = totalTasks.toLocaleString();

  // Liste des workers
  const container = document.getElementById('teamWorkersList');
  container.innerHTML = '';

  if (!teamWorkers.length) {
    container.innerHTML = `<div class="bg-card border border-border rounded-xl p-4 text-center"><p class="text-muted text-sm">Aucun worker dans votre équipe.</p></div>`;
    return;
  }

  teamWorkers.forEach(w => {
    const el = document.createElement('div');
    el.className = 'worker-row bg-card border border-border rounded-xl p-3 flex items-center justify-between';
    el.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="status-dot"></span>
        <div>
          <p class="text-sm text-text">${w.name}</p>
          <p class="text-xs text-muted">${w.id} · ${w.totalTasks} tâches</p>
        </div>
      </div>
      <span class="font-display text-sm text-accent">${w.balanceHTG.toLocaleString()} HTG</span>
    `;
    container.appendChild(el);
  });
}

// ─────────────────────────────────────────────
// 6. VUE ADMIN
// ─────────────────────────────────────────────
function renderAdminDashboard() {
  document.getElementById('adminView').classList.remove('hidden');

  const allWorkers = getAllWorkers();
  const totalHTG   = allWorkers.reduce((acc, w) => acc + w.balanceHTG, 0);
  const totalTasks = allWorkers.reduce((acc, w) => acc + w.totalTasks, 0);
  const totalUSD   = (totalHTG / exchangeRate).toFixed(2);

  document.getElementById('adminTotalUSD').textContent     = '$' + totalUSD;
  document.getElementById('adminTotalHTG').textContent     = totalHTG.toLocaleString() + ' HTG';
  document.getElementById('adminActiveWorkers').textContent = allWorkers.length;
  document.getElementById('adminTotalTasks').textContent   = totalTasks.toLocaleString();
  document.getElementById('exchangeRateInput').value       = exchangeRate;
  document.getElementById('currentRateDisplay').textContent = exchangeRate + ' HTG/USD';

  // Calculer marge (marché réel ~150 HTG, notre taux peut être plus bas = marge)
  const marketRate = 150;
  const margin = (((marketRate - exchangeRate) / marketRate) * 100).toFixed(1);
  document.getElementById('marginDisplay').textContent = margin + '%';

  // Liste de tous les workers
  const container = document.getElementById('adminWorkersList');
  container.innerHTML = '';

  allWorkers.forEach(w => {
    const el = document.createElement('div');
    el.className = 'worker-row bg-card border border-border rounded-xl p-3 flex items-center justify-between';
    el.innerHTML = `
      <div>
        <p class="text-sm text-text">${w.name}</p>
        <p class="text-xs text-muted">${w.id} · Équipe: ${w.teamId}</p>
        <div class="progress-bar mt-1 w-24">
          <div class="progress-fill" style="width: ${Math.min((w.totalTasks / 10) * 100, 100)}%"></div>
        </div>
      </div>
      <div class="text-right">
        <p class="font-display text-sm text-accent">${w.balanceHTG.toLocaleString()} HTG</p>
        <p class="text-xs text-muted">${w.totalTasks} tâches</p>
      </div>
    `;
    container.appendChild(el);
  });
}

// ─────────────────────────────────────────────
// 7. ADMIN : TAUX DE CHANGE
// ─────────────────────────────────────────────
function updateExchangeRate() {
  const newRate = parseInt(document.getElementById('exchangeRateInput').value);
  if (isNaN(newRate) || newRate < 1) {
    showToast('Taux invalide !');
    return;
  }
  exchangeRate = newRate;
  localStorage.setItem('tp_rate', newRate);
  showToast('Taux mis à jour : ' + newRate + ' HTG/USD');
  renderAdminDashboard();
}

// ─────────────────────────────────────────────
// 8. ADMIN : FRAIS DE MAINTENANCE 250 HTG
// ─────────────────────────────────────────────
function applyMaintenanceFee() {
  const FEE = 250; // HTG
  const allWorkers = getAllWorkers();
  let affected = 0;

  allWorkers.forEach(w => {
    const data = getWorkerData(w.id);
    if (data.balanceHTG >= FEE) {
      data.balanceHTG -= FEE;
      // Ajouter à l'historique
      data.history.push({
        label: 'Frais de maintenance plateforme',
        date: new Date().toLocaleDateString('fr-HT'),
        amountHTG: -FEE
      });
      saveWorkerData(w.id, data);
      affected++;
    }
  });

  const msg = document.getElementById('maintenanceMsg');
  msg.classList.remove('hidden');
  msg.textContent = `✅ ${affected} workers débités de 250 HTG.`;
  msg.className = 'text-xs text-center mt-2 text-accent';

  showToast(`Frais appliqués à ${affected} workers`);
  renderAdminDashboard();
}

// ─────────────────────────────────────────────
// 9. POSTBACK / WEBHOOK HANDLER
//    ════════════════════════════════════════
//    Ce bloc simule le traitement d'un postback
//    HTTP GET envoyé par Monlix/Lootably/CPALead
//    après qu'un worker a complété une offre.
//
//    URL type reçue par ton serveur :
//    https://taskpam.com/postback?
//      userid=worker_402
//      &amount=1.50
//      &currency=USD
//      &offer_id=12345
//      &sig=SHA256(userid+amount+SECRET)
//
//    En production → implémenter sur Cloudflare Workers
//    ou Node.js Express (voir commentaires ci-dessous)
// ─────────────────────────────────────────────

/**
 * SIMULATEUR POSTBACK (côté front pour démo)
 * En production, cette logique est sur le SERVEUR.
 *
 * @param {string} userId  - ID du worker (ex: "worker_402")
 * @param {number} amountUSD - Montant gagné en USD (ex: 1.50)
 * @param {string} offerId - ID de l'offre complétée
 * @param {string} sig     - Signature de sécurité (SHA256)
 */
function processPostback(userId, amountUSD, offerId, sig) {

  // ÉTAPE 1 — Vérifier que le worker existe
  if (!USERS_DB[userId] || USERS_DB[userId].role !== 'worker') {
    console.error('[POSTBACK] Worker inconnu:', userId);
    return { status: 'error', message: 'Worker not found' };
  }

  // ÉTAPE 2 — Vérifier la signature secrète
  // En production : sig = SHA256(userId + amountUSD + PLATFORM_SECRET)
  // Ici simulé : on accepte si sig n'est pas vide
  if (!sig) {
    console.error('[POSTBACK] Signature manquante ou invalide');
    return { status: 'error', message: 'Invalid signature' };
  }

  // ÉTAPE 3 — Convertir USD → HTG selon le taux de la plateforme
  const amountHTG = Math.floor(amountUSD * exchangeRate);

  // ÉTAPE 4 — Mettre à jour le solde du worker
  const data = getWorkerData(userId);
  data.balanceHTG     += amountHTG;
  data.weekEarnings   += amountHTG;
  data.totalTasks     += 1;
  data.history.push({
    label: `Offre #${offerId} complétée`,
    date: new Date().toLocaleDateString('fr-HT'),
    amountHTG: amountHTG
  });
  saveWorkerData(userId, data);

  console.log(`[POSTBACK] ✅ Worker ${userId} crédité de ${amountHTG} HTG ($${amountUSD})`);

  // ÉTAPE 5 — Rafraîchir la vue si c'est le worker connecté
  if (currentUser && currentUser.id === userId && currentUser.role === 'worker') {
    renderWorkerDashboard();
    showToast(`+${amountHTG} HTG crédités !`);
  }

  return { status: 'ok', credited: amountHTG };
}

/* ══════════════════════════════════════════════════════
   CLOUDFLARE WORKERS — CODE DE PRODUCTION (commenté)
   ══════════════════════════════════════════════════════

   // wrangler.toml : name = "taskpam-postback"

   addEventListener('fetch', event => {
     event.respondWith(handlePostback(event.request));
   });

   async function handlePostback(request) {
     const url = new URL(request.url);
     const userId    = url.searchParams.get('userid');
     const amountUSD = parseFloat(url.searchParams.get('amount'));
     const offerId   = url.searchParams.get('offer_id');
     const sig       = url.searchParams.get('sig');

     // 1. Vérifier signature SHA256
     const expectedSig = await sha256(userId + amountUSD + PLATFORM_SECRET);
     if (sig !== expectedSig) {
       return new Response('Unauthorized', { status: 401 });
     }

     // 2. Convertir USD → HTG
     const rate = await KV.get('exchange_rate') || 135;
     const amountHTG = Math.floor(amountUSD * rate);

     // 3. Mettre à jour KV Store ou D1 Database
     const workerKey = 'worker_' + userId;
     const existing  = JSON.parse(await KV.get(workerKey) || '{"balanceHTG":0}');
     existing.balanceHTG += amountHTG;
     await KV.put(workerKey, JSON.stringify(existing));

     // 4. Répondre OK à l'Offer Wall
     return new Response('OK', { status: 200 });
   }

   ══════════════════════════════════════════════════════
   NODE.JS EXPRESS — ALTERNATIVE (commenté)
   ══════════════════════════════════════════════════════

   const express = require('express');
   const crypto  = require('crypto');
   const app     = express();

   app.get('/postback', (req, res) => {
     const { userid, amount, offer_id, sig } = req.query;

     // Vérifier signature
     const expected = crypto
       .createHash('sha256')
       .update(userid + amount + PLATFORM_SECRET)
       .digest('hex');

     if (sig !== expected) return res.status(401).send('Invalid signature');

     const amountHTG = Math.floor(parseFloat(amount) * exchangeRate);

     // Mettre à jour la base de données (MongoDB/PostgreSQL/Firebase)
     // db.workers.updateOne({ id: userid }, { $inc: { balanceHTG: amountHTG } });

     res.send('1'); // Réponse attendue par la plupart des Offer Walls
   });

   app.listen(3000);

   ══════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// 10. UTILITAIRES
// ─────────────────────────────────────────────

// Toast notification
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// Simuler un postback pour les tests (Admin uniquement)
window.simulatePostback = function(userId, amount) {
  return processPostback(userId, amount || 1.50, 'TEST_' + Date.now(), 'demo_sig');
};

// ─────────────────────────────────────────────
// 11. INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Restaurer session existante
  restoreSession();

  // Écouter l'URL pour postbacks simulés (ex: taskpam.html?postback=1&userid=worker_402&amount=2.00)
  const params = new URLSearchParams(window.location.search);
  if (params.get('postback') === '1') {
    const userId    = params.get('userid');
    const amount    = parseFloat(params.get('amount') || '1');
    const offerId   = params.get('offer_id') || 'DEMO';
    const sig       = params.get('sig') || 'demo_sig';
    processPostback(userId, amount, offerId, sig);
  }
});

// Permettre Enter pour login
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('loginScreen').classList.contains('hidden')) {
    handleLogin();
  }
});
