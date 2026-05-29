/* =============================================
   TASKPAM — app.js HYBRIDE Firebase + Cloudflare Worker
   ============================================= */

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAbRFgL4jxSbBgc7FhIORKyOEq7N163_AQ",
  authDomain: "hbwtaskpam.firebaseapp.com",
  projectId: "hbwtaskpam",
  storageBucket: "hbwtaskpam.firebasestorage.app",
  messagingSenderId: "142029895340",
  appId: "1:142029895340:web:ce94830569430491ef5109",
  measurementId: "G-MN333N948P"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// URL de votre Worker Cloudflare
const WORKER_BASE = 'https://taskpam-worker.hbwdatasolutions.workers.dev';

// Monlix
const MONLIX_APP_ID   = "VOTRE_APP_ID_MONLIX"; // à remplacer
const OFFER_WALL_URL  = `https://wall.monlix.com/app?appid=${MONLIX_APP_ID}&userid=`;

let currentUser = null;
let firebaseToken = null; // Token Firebase pour les appels admin

// ─── AUTHENTIFICATION ────────────────────────
async function handleLogin() {
  const id   = document.getElementById('loginId').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value;
  const err  = document.getElementById('loginError');

  if (!id || !pass) {
    err.classList.remove('hidden');
    return;
  }

  const email = `${id}@taskpam.com`;

  try {
    alert("Tentative connexion");

    await auth.signInWithEmailAndPassword(email, pass);

    alert("Connexion réussie");

    err.classList.add('hidden');

  } catch (e) {
    console.log(e);
    alert(e.message);
    err.classList.remove('hidden');
  }
}
// Surveiller l'état de connexion
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    currentUser = null;
    firebaseToken = null;

    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');

    return;
  }

  try {
    // Debug visible
    const errBox = document.getElementById('loginError');
    errBox.classList.remove('hidden');
    errBox.style.color = '#1db954';
    errBox.textContent = '🔄 Chargement du profil...';

    firebaseToken = await user.getIdToken();

    const email = user.email || '';
    const userId = email.replace('@taskpam.com', '');

    errBox.textContent += '\nUtilisateur : ' + userId;

    // IMPORTANT :
    // on lit directement users/admin
    // users/worker_402
    // etc.
    const doc = await db.collection('users').doc(userId).get();

    if (!doc.exists) {
      errBox.style.color = '#e53935';
      errBox.textContent =
        '❌ Aucun document Firestore trouvé : users/' + userId;

      await auth.signOut();
      return;
    }

    currentUser = {
      id: userId,
      ...doc.data()
    };

    // Vérification critique
    if (!currentUser.role) {
      errBox.style.color = '#e53935';
      errBox.textContent =
        '❌ Champ role manquant dans users/' + userId;

      return;
    }

    errBox.classList.add('hidden');

    showApp();

  } catch (e) {
    console.error(e);

    const errBox = document.getElementById('loginError');

    errBox.classList.remove('hidden');
    errBox.style.color = '#e53935';
    errBox.textContent =
      '❌ Erreur : ' + e.message;
  }
});
});
// ─── ROUTAGE ─────────────────────────────────
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');

  document.getElementById('navUserId').textContent = currentUser.id;
  document.getElementById('roleTag').textContent = currentUser.role.toUpperCase();

  ['workerView','managerView','adminView'].forEach(v => document.getElementById(v).classList.add('hidden'));
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

  db.collection('users').doc(currentUser.id).onSnapshot((doc) => {
    if (!doc.exists) return;
    const data = doc.data();
    document.getElementById('workerName').textContent = data.name;
    document.getElementById('workerBalanceHTG').textContent = (data.balanceHTG || 0).toLocaleString();
    document.getElementById('workerWeekEarnings').textContent = (data.weekEarnings || 0).toLocaleString() + ' HTG';
    document.getElementById('workerTaskCount').textContent = data.totalTasks || 0;
    document.getElementById('navBalanceAmt').textContent = (data.balanceHTG || 0).toLocaleString() + ' HTG';

    renderHistory(data.history || []);
  });

  // Offer Wall
  document.getElementById('offerWallUserId').textContent = 'ID: ' + currentUser.id;
  const frame = document.getElementById('offerWallFrame');
  frame.src = OFFER_WALL_URL + encodeURIComponent(currentUser.id);
  frame.onerror = () => {
    frame.style.display = 'none';
    const fb = document.getElementById('offerWallFallback');
    fb.classList.remove('hidden');
    document.getElementById('fallbackWId').textContent = currentUser.id;
  };
}

function renderHistory(history) {
  const c = document.getElementById('workerTaskHistory');
  c.innerHTML = '';
  if (!history.length) {
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

// ─── MANAGER VIEW ────────────────────────────
async function renderManager() {
  document.getElementById('managerView').classList.remove('hidden');
  const teamId = currentUser.teamId;
  if (!teamId) {
    document.getElementById('managerName').textContent = currentUser.name + ' (aucune équipe)';
    return;
  }

  const snap = await db.collection('users')
    .where('teamId', '==', teamId)
    .where('role', '==', 'worker')
    .get();
  const workers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  document.getElementById('managerName').textContent = currentUser.name;
  const totalHTG = workers.reduce((s, w) => s + (w.balanceHTG || 0), 0);
  const totalTasks = workers.reduce((s, w) => s + (w.totalTasks || 0), 0);
  document.getElementById('teamTotalEarnings').textContent = totalHTG.toLocaleString() + ' HTG';
  document.getElementById('teamTotalTasks').textContent = totalTasks;
  document.getElementById('teamCount').textContent = workers.length + ' workers';

  const c = document.getElementById('teamWorkersList');
  c.innerHTML = '';
  workers.forEach((w, i) => {
    const initials = w.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const pct = Math.min(Math.round((w.totalTasks / 50) * 100), 100);
    const el = document.createElement('div');
    el.className = 'worker-row flex items-center justify-between p-3 rounded-xl bg-white card-anim';
    el.style.animationDelay = (i * 0.05) + 's';
    el.innerHTML = `<div class="flex items-center gap-3"><div class="avatar">${initials}</div><div><p class="text-sm font-semibold text-text">${w.name}</p><p class="text-xs text-muted">${w.id}</p><div class="progress-bar w-20 mt-1"><div class="progress-fill" style="width:${pct}%"></div></div></div></div><div class="text-right"><p class="font-display font-bold text-sm text-primary">${w.balanceHTG.toLocaleString()} HTG</p><p class="text-xs text-muted">${w.totalTasks} tâches</p></div>`;
    c.appendChild(el);
  });
}

// ─── ADMIN VIEW ──────────────────────────────
async function renderAdmin() {
  document.getElementById('adminView').classList.remove('hidden');

  const snap = await db.collection('users').where('role', '==', 'worker').get();
  const workers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const rateDoc = await db.collection('config').doc('exchange_rate').get();
  const rate = rateDoc.exists ? rateDoc.data().rate : 135;

  const totalHTG = workers.reduce((s, w) => s + (w.balanceHTG || 0), 0);
  const totalTasks = workers.reduce((s, w) => s + (w.totalTasks || 0), 0);

  document.getElementById('adminTotalUSD').textContent = '$' + (totalHTG / rate).toFixed(2);
  document.getElementById('adminTotalHTG').textContent = totalHTG.toLocaleString() + ' HTG';
  document.getElementById('adminActiveWorkers').textContent = workers.length;
  document.getElementById('adminTotalTasks').textContent = totalTasks;
  document.getElementById('exchangeRateInput').value = rate;
  document.getElementById('currentRateDisplay').textContent = rate + ' HTG';
  document.getElementById('adminWorkerCount').textContent = workers.length + ' workers';

  const marketRate = 150;
  const margin = (((marketRate - rate) / marketRate) * 100).toFixed(1);
  document.getElementById('marginDisplay').textContent = margin + '%';

  const c = document.getElementById('adminWorkersList');
  c.innerHTML = '';
  workers.forEach((w, i) => {
    const initials = w.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const pct = Math.min(Math.round((w.totalTasks / 50) * 100), 100);
    const el = document.createElement('div');
    el.className = 'worker-row flex items-center justify-between p-3 rounded-xl bg-white card-anim';
    el.style.animationDelay = (i * 0.04) + 's';
    el.innerHTML = `<div class="flex items-center gap-3"><div class="avatar">${initials}</div><div><p class="text-sm font-semibold text-text">${w.name}</p><p class="text-xs text-muted">${w.id} · ${w.teamId}</p><div class="progress-bar w-24 mt-1"><div class="progress-fill" style="width:${pct}%"></div></div></div></div><div class="text-right"><p class="font-display font-bold text-sm text-primary">${w.balanceHTG.toLocaleString()} HTG</p><span class="stat-badge">${w.totalTasks} tâches</span></div>`;
    c.appendChild(el);
  });

  document.getElementById('importBtn').classList.remove('hidden');
}

// ─── ACTIONS ADMIN (via Worker) ──────────────
async function updateExchangeRate() {
  const rate = parseInt(document.getElementById('exchangeRateInput').value);
  if (isNaN(rate) || rate < 1) { showToast('⚠️ Taux invalide'); return; }

  try {
    const res = await fetch(`${WORKER_BASE}/api/update-rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + firebaseToken
      },
      body: JSON.stringify({ rate })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Taux mis à jour');
      renderAdmin();
    } else {
      showToast('❌ Erreur: ' + (data.error || 'inconnue'));
    }
  } catch (e) {
    showToast('❌ Erreur réseau');
  }
}

async function applyMaintenanceFee() {
  try {
    const res = await fetch(`${WORKER_BASE}/api/maintenance-fee`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + firebaseToken
      }
    });
    const data = await res.json();
    document.getElementById('maintenanceMsg').classList.remove('hidden');
    document.getElementById('maintenanceMsg').textContent = `✅ Frais appliqués à ${data.affectedWorkers} worker(s).`;
    showToast(`Frais 250 HTG × ${data.affectedWorkers} workers`);
    renderAdmin();
  } catch (e) {
    showToast('❌ Erreur réseau');
  }
}

// ─── IMPORT CSV (via Worker) ─────────────────
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
  if (!file) { showToast('Sélectionnez un fichier CSV'); return; }

  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) { showToast('Fichier vide'); return; }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const required = ['id', 'password', 'role', 'name'];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length) { showToast(`Colonnes manquantes : ${missing.join(', ')}`); return; }

  const users = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols.length < headers.length) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = cols[idx]; });
    if (obj.id && obj.password && obj.role && obj.name) users.push(obj);
  }

  try {
    const res = await fetch(`${WORKER_BASE}/api/import-users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + firebaseToken
      },
      body: JSON.stringify({ users })
    });
    const data = await res.json();
    document.getElementById('importStatus').classList.remove('hidden');
    document.getElementById('importStatus').textContent = `✅ ${data.imported} utilisateurs importés. Erreurs: ${data.errors?.length || 0}`;
    showToast(`${data.imported} utilisateurs importés !`);
    closeImportModal();
    renderAdmin();
  } catch (e) {
    showToast('❌ Erreur réseau');
  }
}

// ─── TOAST ───────────────────────────────────
function showToast(msg, ms = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

// ─── ENTER KEY LOGIN ─────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const ls = document.getElementById('loginScreen');
    if (!ls.classList.contains('hidden')) handleLogin();
  }
});
