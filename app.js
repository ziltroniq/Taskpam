/* =====================================================
   HBW TASK & TRAVAIL EN LIGNE — APP.JS
   Version 1.0.0 | Logique complète Firebase
   ===================================================== */

// =====================================================
// 1. CONFIGURATION FIREBASE & INITIALISATION
// =====================================================
const firebaseConfig = {
  apiKey: "AIzaSyAbRFgL4jxSbBgc7FhIORKyOEq7N163_AQ",
  authDomain: "hbwtaskpam.firebaseapp.com",
  projectId: "hbwtaskpam",
  storageBucket: "hbwtaskpam.appspot.com",
  messagingSenderId: "142029895340",
  appId: "1:142029895340:web:ce94830569430491ef5109"
};

// Initialisation Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ── Variables globales ──
let currentUser = null;          // Données utilisateur Firestore
let currentUserAuth = null;      // Objet Firebase Auth
let currentPage = '';            // Page active
let currentRole = '';            // Rôle de l'utilisateur
let selectedWithdrawalMethod = 'MonCash'; // Méthode de retrait sélectionnée
let adminEarningsChart = null;   // Instance Chart.js admin
let managerChart = null;         // Instance Chart.js manager
let usersCache = [];             // Cache liste utilisateurs
let logsCache = [];              // Cache logs
let tasksCache = [];             // Cache tâches
let withdrawalsCache = [];       // Cache retraits
let maintenanceCache = [];       // Cache maintenances
let notificationsCache = [];     // Cache notifications
let teamsCache = [];             // Cache équipes
let membersCache = [];           // Cache membres (manager)
let unsubscribeListeners = [];   // Tableau des listeners à détacher

// Taux de change par défaut
let exchangeRate = 130;
// Frais de maintenance par défaut
let maintenanceFee = 250;

// Seuils des badges
const BADGE_THRESHOLDS = {
  bronze: 0,
  silver: 50,
  gold: 150
};

// =====================================================
// 2. DÉMARRAGE — DOM READY
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
  // Appliquer le thème sauvegardé
  applyStoredTheme();
  // Créer les particules de l'écran login
  createParticles();
  // Initialiser les icônes Lucide
  if (window.lucide) lucide.createIcons();
  // Écouter l'état d'authentification
  auth.onAuthStateChanged(handleAuthStateChanged);
});

// =====================================================
// 3. AUTHENTIFICATION
// =====================================================

/**
 * Gestion du changement d'état d'authentification Firebase
 */
async function handleAuthStateChanged(user) {
  if (user) {
    currentUserAuth = user;
    try {
      // Charger les données Firestore de l'utilisateur
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (!userDoc.exists) {
        showToast('Compte introuvable dans la base de données.', 'error');
        await auth.signOut();
        return;
      }
      currentUser = { id: user.uid, ...userDoc.data() };
      currentRole = currentUser.role;

      // Mettre à jour la date de dernière connexion
      await db.collection('users').doc(user.uid).update({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Afficher l'application
      showApp();
    } catch (err) {
      console.error('Erreur chargement utilisateur :', err);
      showToast('Erreur lors du chargement du profil.', 'error');
      await auth.signOut();
    }
  } else {
    currentUser = null;
    currentUserAuth = null;
    currentRole = '';
    // Détacher tous les listeners
    detachAllListeners();
    showLoginScreen();
  }
}

/**
 * Connexion avec nom d'utilisateur et mot de passe
 * Le nom d'utilisateur est converti en email interne
 */
async function handleLogin() {
async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    showLoginError('Veuillez remplir tous les champs.');
    return;
  }

  setLoginLoading(true);
  hideLoginError();

  // Essayer directement les deux domaines possibles
  const domains = ['@hbwtask.com', '@taskpam.com'];
  let lastError = null;

  for (const domain of domains) {
    const email = username + domain;
    try {
      await auth.signInWithEmailAndPassword(email, password);
      // Connexion réussie → le reste est géré par auth.onAuthStateChanged
      setLoginLoading(false);
      return;
    } catch (err) {
      lastError = err;
      // Si l'utilisateur n'existe pas du tout, on passe au domaine suivant
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        continue;
      }
      // Pour toute autre erreur, on arrête immédiatement
      break;
    }
  }

  // Aucun domaine n'a fonctionné
  console.error('Login error:', lastError);
  let msg = 'Identifiants incorrects.';
  if (lastError?.code === 'auth/too-many-requests') msg = 'Trop de tentatives. Réessayez plus tard.';
  else if (lastError?.code === 'auth/user-disabled') msg = 'Ce compte a été désactivé.';
  showLoginError(msg);
  setLoginLoading(false);
}
/**
 * Déconnexion
 */
async function handleLogout() {
  try {
    await addLog('login', `Déconnexion de ${currentUser?.username || 'utilisateur'}`, currentUser?.username);
    detachAllListeners();
    await auth.signOut();
    showToast('Vous avez été déconnecté.', 'info');
  } catch (err) {
    console.error('Erreur déconnexion :', err);
  }
}

/**
 * Afficher/cacher le mot de passe
 */
function togglePassword() {
  const input = document.getElementById('login-password');
  const icon = document.getElementById('eye-icon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.setAttribute('data-lucide', 'eye-off');
  } else {
    input.type = 'password';
    icon.setAttribute('data-lucide', 'eye');
  }
  lucide.createIcons();
}

function showLoginError(msg) {
  const banner = document.getElementById('login-error');
  const msgEl = document.getElementById('login-error-msg');
  msgEl.textContent = msg;
  banner.classList.remove('hidden');
}

function hideLoginError() {
  document.getElementById('login-error').classList.add('hidden');
}

function setLoginLoading(loading) {
  const btn = document.getElementById('login-btn');
  const text = document.getElementById('login-btn-text');
  const spinner = document.getElementById('login-spinner');
  btn.disabled = loading;
  text.classList.toggle('hidden', loading);
  spinner.classList.toggle('hidden', !loading);
}

// =====================================================
// 4. AFFICHAGE APP / LOGIN
// =====================================================

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  setLoginLoading(false);
  hideLoginError();
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Construire la sidebar selon le rôle
  buildSidebar();
  // Configurer la topbar
  setupTopbar();
  // Charger les paramètres globaux
  loadGlobalSettings();
  // Démarrer les listeners en temps réel
  startRealtimeListeners();
  // Afficher la page par défaut
  const defaultPage = currentRole === 'admin' ? 'admin-dashboard'
    : currentRole === 'manager' ? 'manager-dashboard'
    : 'worker-dashboard';
  showPage(defaultPage);
  // Rafraîchir les icônes
  lucide.createIcons();
}

// =====================================================
// 5. GESTION DU THÈME
// =====================================================

function applyStoredTheme() {
  const saved = localStorage.getItem('hbw-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('hbw-theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  const label = icon?.nextElementSibling;
  if (!icon) return;
  if (theme === 'dark') {
    icon.setAttribute('data-lucide', 'moon');
    if (label) label.textContent = 'Mode sombre';
  } else {
    icon.setAttribute('data-lucide', 'sun');
    if (label) label.textContent = 'Mode clair';
  }
  lucide.createIcons();
}

// =====================================================
// 6. NAVIGATION & SIDEBAR
// =====================================================

/**
 * Construire le menu de navigation selon le rôle
 */
function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = '';

  const adminItems = [
    { icon: 'layout-dashboard', label: 'Tableau de bord', page: 'admin-dashboard' },
    { section: 'Gestion' },
    { icon: 'users', label: 'Utilisateurs', page: 'admin-users' },
    { icon: 'layers', label: 'Équipes', page: 'admin-teams' },
    { icon: 'briefcase', label: 'Tâches', page: 'admin-tasks' },
    { section: 'Finance' },
    { icon: 'alert-triangle', label: 'Maintenance', page: 'admin-maintenance' },
    { icon: 'arrow-down-circle', label: 'Retraits', page: 'admin-withdrawals' },
    { section: 'Système' },
    { icon: 'scroll', label: 'Logs', page: 'admin-logs' },
    { icon: 'settings', label: 'Paramètres', page: 'admin-settings' },
  ];

  const managerItems = [
    { icon: 'layout-dashboard', label: 'Tableau de bord', page: 'manager-dashboard' },
    { section: 'Équipe' },
    { icon: 'users', label: 'Membres', page: 'manager-members' },
    { icon: 'message-square', label: 'Messagerie', page: 'manager-messages' },
    { icon: 'bar-chart', label: 'Statistiques', page: 'manager-stats' },
  ];

  const workerItems = [
    { icon: 'layout-dashboard', label: 'Tableau de bord', page: 'worker-dashboard' },
    { section: 'Travail' },
    { icon: 'zap', label: 'Offerwalls', page: 'worker-offerwalls' },
    { icon: 'briefcase', label: 'Tâches Agency', page: 'worker-tasks' },
    { section: 'Compte' },
    { icon: 'history', label: 'Historique', page: 'worker-history' },
    { icon: 'arrow-up-circle', label: 'Retrait', page: 'worker-withdrawal' },
    { icon: 'bell', label: 'Notifications', page: 'worker-notifications' },
    { icon: 'wrench', label: 'Maintenance', page: 'worker-maintenance' },
  ];

  const items = currentRole === 'admin' ? adminItems
    : currentRole === 'manager' ? managerItems
    : workerItems;

  items.forEach(item => {
    if (item.section) {
      const label = document.createElement('div');
      label.className = 'nav-section-label';
      label.textContent = item.section;
      nav.appendChild(label);
    } else {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.id = `nav-${item.page}`;
      btn.onclick = () => showPage(item.page);
      btn.innerHTML = `<i data-lucide="${item.icon}" class="w-4 h-4"></i><span>${item.label}</span>`;
      nav.appendChild(btn);
    }
  });

  // Mettre à jour les infos utilisateur dans la sidebar
  const avatar = document.getElementById('sidebar-avatar');
  const usernameEl = document.getElementById('sidebar-username');
  const roleBadge = document.getElementById('sidebar-role-badge');

  if (currentUser) {
    const initials = ((currentUser.firstName || currentUser.username || '?')[0]).toUpperCase();
    avatar.textContent = initials;
    usernameEl.textContent = currentUser.username || '---';

    const roleLabels = { admin: 'Administrateur', manager: 'Manager', worker: 'Worker' };
    const roleClasses = { admin: 'badge-admin', manager: 'badge-manager', worker: 'badge-worker' };
    roleBadge.textContent = roleLabels[currentRole] || currentRole;
    roleBadge.className = `user-badge badge ${roleClasses[currentRole] || 'badge-gray'}`;
  }

  lucide.createIcons();
}

/**
 * Configurer la topbar (solde visible pour les workers)
 */
function setupTopbar() {
  const balanceEl = document.getElementById('topbar-balance');
  if (currentRole === 'worker') {
    balanceEl.classList.remove('hidden');
    updateTopbarBalance();
  } else {
    balanceEl.classList.add('hidden');
  }
}

/**
 * Mettre à jour le solde dans la topbar
 */
function updateTopbarBalance() {
  if (currentUser && currentRole === 'worker') {
    const balance = currentUser.balance || 0;
    document.getElementById('topbar-balance-amount').textContent = formatCurrency(balance) + ' HTG';
  }
}

/**
 * Basculer la sidebar (mobile)
 */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('hidden');
}

/**
 * Naviguer vers une page
 */
function showPage(pageId) {
  // Cacher toutes les pages
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));

  // Afficher la page demandée
  const page = document.getElementById(`page-${pageId}`);
  if (!page) {
    console.warn(`Page introuvable : page-${pageId}`);
    return;
  }
  page.classList.remove('hidden');
  currentPage = pageId;

  // Mettre à jour la navigation active
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.getElementById(`nav-${pageId}`);
  if (navItem) navItem.classList.add('active');

  // Mettre à jour le titre de la topbar
  updatePageTitle(pageId);

  // Fermer la sidebar sur mobile
  const sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('open')) toggleSidebar();

  // Charger les données de la page
  loadPageData(pageId);

  lucide.createIcons();
}

/**
 * Charger les données selon la page active
 */
async function loadPageData(pageId) {
  switch (pageId) {
    case 'admin-dashboard': await renderAdminDashboard(); break;
    case 'admin-users': await loadUsers(); break;
    case 'admin-teams': await loadTeams(); break;
    case 'admin-tasks': await loadAdminTasks('available'); break;
    case 'admin-maintenance': await loadMaintenance(); break;
    case 'admin-withdrawals': await loadWithdrawals('pending'); break;
    case 'admin-logs': await loadLogs(); break;
    case 'admin-settings': await loadSettings(); break;
    case 'manager-dashboard': await renderManagerDashboard(); break;
    case 'manager-members': await loadMembers(); break;
    case 'manager-messages': await loadSentMessages(); break;
    case 'manager-stats': await loadManagerStats(); break;
    case 'worker-dashboard': await renderWorkerDashboard(); break;
    case 'worker-tasks': await loadAvailableTasks(); break;
    case 'worker-history': await loadHistory(); break;
    case 'worker-withdrawal': await loadWithdrawalPage(); break;
    case 'worker-maintenance': await loadMaintenancePage(); break;
    case 'worker-notifications': await loadAllNotifications(); break;
    default: break;
  }
}

/**
 * Mettre à jour le titre de la page dans la topbar
 */
function updatePageTitle(pageId) {
  const titles = {
    'admin-dashboard': 'Tableau de bord',
    'admin-users': 'Utilisateurs',
    'admin-teams': 'Équipes',
    'admin-tasks': 'Tâches',
    'admin-maintenance': 'Maintenance',
    'admin-withdrawals': 'Retraits',
    'admin-logs': 'Logs système',
    'admin-settings': 'Paramètres',
    'manager-dashboard': 'Tableau de bord',
    'manager-members': 'Membres de l\'équipe',
    'manager-messages': 'Messagerie',
    'manager-stats': 'Statistiques',
    'worker-dashboard': 'Tableau de bord',
    'worker-offerwalls': 'Offerwalls',
    'worker-tasks': 'Tâches Agency',
    'worker-history': 'Historique',
    'worker-withdrawal': 'Retrait',
    'worker-maintenance': 'Maintenance',
    'worker-notifications': 'Notifications',
  };

  const breadcrumbs = {
    'admin-dashboard': 'Admin',
    'manager-dashboard': 'Manager',
    'worker-dashboard': 'Worker',
  };

  document.getElementById('page-title').textContent = titles[pageId] || pageId;
  document.getElementById('page-breadcrumb').textContent =
    breadcrumbs[pageId] || 'HBW Task';
}

// =====================================================
// 7. PARAMÈTRES GLOBAUX
// =====================================================

async function loadGlobalSettings() {
  try {
    const settingsDoc = await db.collection('settings').doc('global').get();
    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      exchangeRate = data.exchangeRate || 130;
      maintenanceFee = data.maintenanceFee || 250;
    }
  } catch (err) {
    console.error('Erreur chargement paramètres :', err);
  }
}

// =====================================================
// 8. LISTENERS TEMPS RÉEL
// =====================================================

function startRealtimeListeners() {
  // Écouter les notifications de l'utilisateur
  listenToNotifications();
  // Écouter les mises à jour du profil utilisateur
  if (currentRole === 'worker') listenToUserProfile();
}

function detachAllListeners() {
  unsubscribeListeners.forEach(unsub => { try { unsub(); } catch (e) {} });
  unsubscribeListeners = [];
}

function listenToNotifications() {
  const unsub = db.collection('notifications')
    .where('userId', '==', currentUser.id)
    .where('read', '==', false)
    .onSnapshot(snapshot => {
      const count = snapshot.size;
      const badge = document.getElementById('notif-badge');
      badge.textContent = count;
      badge.classList.toggle('hidden', count === 0);
      notificationsCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderNotificationDropdown(notificationsCache.slice(0, 5));
    }, err => console.error('Erreur listener notifs :', err));
  unsubscribeListeners.push(unsub);
}

function listenToUserProfile() {
  const unsub = db.collection('users').doc(currentUser.id)
    .onSnapshot(doc => {
      if (doc.exists) {
        const prev = currentUser;
        currentUser = { id: doc.id, ...doc.data() };
        updateTopbarBalance();
        // Si le worker était en maintenance et ne l'est plus
        if (prev.maintenance && !currentUser.maintenance) {
          showToast('Votre maintenance a été levée ! Bienvenue.', 'success');
        }
        // Si le worker entre en maintenance
        if (!prev.maintenance && currentUser.maintenance) {
          showToast('Votre compte est en maintenance.', 'warning');
          const banner = document.getElementById('maintenance-banner');
          if (banner) {
            banner.classList.remove('hidden');
            const amountEl = document.getElementById('maintenance-amount-banner');
            if (amountEl) amountEl.textContent = formatCurrency(currentUser.maintenanceAmount || maintenanceFee) + ' HTG';
          }
        }
      }
    }, err => console.error('Erreur listener profil :', err));
  unsubscribeListeners.push(unsub);
}

// =====================================================
// 9. ADMIN — TABLEAU DE BORD
// =====================================================

async function renderAdminDashboard() {
  try {
    // Charger tous les utilisateurs
    const usersSnap = await db.collection('users').get();
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const workers = users.filter(u => u.role === 'worker');
    const managers = users.filter(u => u.role === 'manager');
    const activeWorkers = workers.filter(u => !u.suspended);
    const maintenanceWorkers = workers.filter(u => u.maintenance);

    const totalBalance = workers.reduce((acc, u) => acc + (u.balance || 0), 0);
    const usdEquiv = (totalBalance / exchangeRate).toFixed(2);

    // Retraits en attente
    const pendingWd = await db.collection('withdrawals')
      .where('status', '==', 'pending').get();

    // Mettre à jour les stats cards
    document.getElementById('stat-total-users').textContent = users.length;
    document.getElementById('stat-active-workers').textContent = activeWorkers.length;
    document.getElementById('stat-managers').textContent = managers.length;
    document.getElementById('stat-total-balance').textContent = formatCurrency(totalBalance) + ' HTG';
    document.getElementById('stat-usd-equiv').textContent = `≈ ${usdEquiv} USD`;
    document.getElementById('stat-pending-withdrawals').textContent = pendingWd.size;
    document.getElementById('stat-maintenance').textContent = maintenanceWorkers.length;

    // Top 10 workers par solde
    const top10 = [...workers].sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 10);
    renderTopWorkersList(top10);

    // Workers en maintenance
    renderMaintenanceWorkersList(maintenanceWorkers);

    // Retraits en attente (mini liste)
    const pendingWdData = pendingWd.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPendingWithdrawalsList(pendingWdData.slice(0, 5));

    // Graphique des gains (7 derniers jours)
    await renderAdminEarningsChart();

  } catch (err) {
    console.error('Erreur dashboard admin :', err);
    showToast('Erreur lors du chargement du tableau de bord.', 'error');
  }
}

function renderTopWorkersList(workers) {
  const container = document.getElementById('top-workers-list');
  if (!workers.length) {
    container.innerHTML = '<div class="empty-state-sm">Aucun worker</div>';
    return;
  }
  container.innerHTML = workers.map((w, i) => `
    <div class="mini-item">
      <div class="mini-avatar">${i + 1}</div>
      <div class="mini-info">
        <p class="mini-name">${escapeHtml(w.username || w.firstName || '?')}</p>
        <p class="mini-sub">${getBadgeLabel(w.totalTasks || 0)}</p>
      </div>
      <span class="mini-amount green">${formatCurrency(w.balance || 0)} HTG</span>
    </div>
  `).join('');
}

function renderMaintenanceWorkersList(workers) {
  const container = document.getElementById('maintenance-workers-list');
  if (!workers.length) {
    container.innerHTML = '<div class="empty-state-sm">Aucun worker en maintenance</div>';
    return;
  }
  container.innerHTML = workers.map(w => `
    <div class="mini-item">
      <div class="mini-avatar" style="background: linear-gradient(135deg,#dc2626,#f97316)">${(w.username || '?')[0].toUpperCase()}</div>
      <div class="mini-info">
        <p class="mini-name">${escapeHtml(w.username || '?')}</p>
        <p class="mini-sub">${w.teamName || 'Sans équipe'}</p>
      </div>
      <span class="mini-amount yellow">${formatCurrency(w.maintenanceAmount || maintenanceFee)} HTG</span>
    </div>
  `).join('');
}

function renderPendingWithdrawalsList(withdrawals) {
  const container = document.getElementById('pending-withdrawals-list');
  if (!withdrawals.length) {
    container.innerHTML = '<div class="empty-state-sm">Aucun retrait en attente</div>';
    return;
  }
  container.innerHTML = withdrawals.map(w => `
    <div class="mini-item">
      <div class="mini-avatar">${(w.username || '?')[0].toUpperCase()}</div>
      <div class="mini-info">
        <p class="mini-name">${escapeHtml(w.username || '?')}</p>
        <p class="mini-sub">${w.method || 'MonCash'} · ${w.phone || '---'}</p>
      </div>
      <span class="mini-amount red">${formatCurrency(w.amount || 0)} HTG</span>
    </div>
  `).join('');
}

async function renderAdminEarningsChart() {
  try {
    const labels = getLast7DaysLabels();
    const last7 = getLast7Days();

    // Récupérer les gains sur 7 jours
    const from = new Date();
    from.setDate(from.getDate() - 7);
    from.setHours(0, 0, 0, 0);

    const snapshot = await db.collection('transactions')
      .where('type', '==', 'task')
      .where('createdAt', '>=', from)
      .get();

    const dailyTotals = {};
    last7.forEach(d => { dailyTotals[d] = 0; });

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
      const key = date.toISOString().split('T')[0];
      if (dailyTotals[key] !== undefined) dailyTotals[key] += (data.amount || 0);
    });

    const values = last7.map(d => dailyTotals[d] || 0);

    const ctx = document.getElementById('admin-earnings-chart');
    if (!ctx) return;

    if (adminEarningsChart) adminEarningsChart.destroy();

    adminEarningsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Gains (HTG)',
          data: values,
          borderColor: '#3b7cc9',
          backgroundColor: 'rgba(59,124,201,0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#3b7cc9',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 11 } }, beginAtZero: true }
        }
      }
    });
  } catch (err) {
    console.error('Erreur graphique admin :', err);
  }
}

// =====================================================
// 10. ADMIN — UTILISATEURS
// =====================================================

async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    const snap = await db.collection('users').get();
    usersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Peupler le filtre équipe
    populateTeamFilter();
    renderUsersTable(usersCache);
  } catch (err) {
    console.error('Erreur chargement utilisateurs :', err);
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">Erreur de chargement</td></tr>';
  }
}

function populateTeamFilter() {
  const teams = [...new Set(usersCache.map(u => u.teamName).filter(Boolean))];
  const select = document.getElementById('users-team-filter');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Toutes les équipes</option>';
  teams.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });
  select.value = current;
}

function filterUsers() {
  const search = (document.getElementById('users-search')?.value || '').toLowerCase();
  const role = document.getElementById('users-role-filter')?.value || '';
  const team = document.getElementById('users-team-filter')?.value || '';

  const filtered = usersCache.filter(u => {
    const matchSearch = !search || (u.username || '').toLowerCase().includes(search)
      || (u.email || '').toLowerCase().includes(search)
      || (u.firstName || '').toLowerCase().includes(search);
    const matchRole = !role || u.role === role;
    const matchTeam = !team || u.teamName === team;
    return matchSearch && matchRole && matchTeam;
  });
  renderUsersTable(filtered);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">Aucun utilisateur trouvé</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="mini-avatar" style="width:30px;height:30px;font-size:0.75rem">${(u.username || '?')[0].toUpperCase()}</div>
          <div>
            <p style="font-weight:600;color:var(--text-primary)">${escapeHtml(u.username || '?')}</p>
            <p style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml(u.email || '')}</p>
          </div>
        </div>
      </td>
      <td><span class="badge badge-${u.role}">${u.role || '?'}</span></td>
      <td>${escapeHtml(u.teamName || '—')}</td>
      <td style="font-weight:600;color:#22c55e">${formatCurrency(u.balance || 0)} HTG</td>
      <td>${u.totalTasks || 0}</td>
      <td>
        <span class="badge ${u.suspended ? 'badge-red' : 'badge-green'}">
          ${u.suspended ? 'Suspendu' : 'Actif'}
        </span>
      </td>
      <td>
        <span class="badge ${u.maintenance ? 'badge-yellow' : 'badge-gray'}">
          ${u.maintenance ? 'Oui' : 'Non'}
        </span>
      </td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn-sm blue" onclick="viewUserDetail('${u.id}')">
            <i data-lucide="eye" class="w-3 h-3"></i>
          </button>
          ${u.suspended
            ? `<button class="btn-sm green" onclick="unsuspendUser('${u.id}')">Réactiver</button>`
            : `<button class="btn-sm yellow" onclick="suspendUser('${u.id}')">Suspendre</button>`}
          <button class="btn-sm red" onclick="confirmDeleteUser('${u.id}', '${escapeHtml(u.username || '')}')">
            <i data-lucide="trash-2" class="w-3 h-3"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
  lucide.createIcons();
}

async function suspendUser(uid) {
  try {
    await db.collection('users').doc(uid).update({ suspended: true });
    await addLog('user', `Utilisateur ${uid} suspendu`, currentUser.username);
    showToast('Utilisateur suspendu.', 'warning');
    await loadUsers();
  } catch (err) {
    showToast('Erreur lors de la suspension.', 'error');
  }
}

async function unsuspendUser(uid) {
  try {
    await db.collection('users').doc(uid).update({ suspended: false });
    await addLog('user', `Utilisateur ${uid} réactivé`, currentUser.username);
    showToast('Utilisateur réactivé.', 'success');
    await loadUsers();
  } catch (err) {
    showToast('Erreur lors de la réactivation.', 'error');
  }
}

function confirmDeleteUser(uid, username) {
  openConfirmModal(
    'Supprimer l\'utilisateur',
    `Êtes-vous sûr de vouloir supprimer "${username}" ? Cette action est irréversible.`,
    async () => {
      await deleteUser(uid, username);
    }
  );
}

async function deleteUser(uid, username) {
  try {
    await db.collection('users').doc(uid).delete();
    await addLog('user', `Utilisateur ${username} supprimé`, currentUser.username);
    showToast('Utilisateur supprimé.', 'success');
    closeModal();
    await loadUsers();
  } catch (err) {
    showToast('Erreur lors de la suppression.', 'error');
  }
}

async function viewUserDetail(uid) {
  openModal('modal-user-detail');
  const body = document.getElementById('modal-user-detail-body');
  body.innerHTML = '<div class="text-center py-8 text-gray-400">Chargement...</div>';

  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) { body.innerHTML = '<p>Utilisateur introuvable.</p>'; return; }
    const u = { id: doc.id, ...doc.data() };

    // Charger les dernières transactions
    const txSnap = await db.collection('transactions')
      .where('userId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    const txList = txSnap.docs.map(d => d.data());

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div style="display:flex;align-items:center;gap:1rem">
          <div class="mini-avatar" style="width:56px;height:56px;font-size:1.25rem;border-radius:14px">
            ${(u.username || '?')[0].toUpperCase()}
          </div>
          <div>
            <h4 style="font-weight:700;font-size:1rem;color:var(--text-primary)">${escapeHtml(u.username || '?')}</h4>
            <p style="font-size:0.8rem;color:var(--text-muted)">${escapeHtml(u.email || '')}</p>
            <span class="badge badge-${u.role}">${u.role || '?'}</span>
          </div>
        </div>
        <div class="info-list">
          <div class="info-item"><span class="info-key">Prénom / Nom</span><span class="info-val">${escapeHtml((u.firstName || '') + ' ' + (u.lastName || ''))}</span></div>
          <div class="info-item"><span class="info-key">Téléphone</span><span class="info-val">${escapeHtml(u.phone || '—')}</span></div>
          <div class="info-item"><span class="info-key">Équipe</span><span class="info-val">${escapeHtml(u.teamName || '—')}</span></div>
          <div class="info-item"><span class="info-key">Solde</span><span class="info-val" style="color:#22c55e">${formatCurrency(u.balance || 0)} HTG</span></div>
          <div class="info-item"><span class="info-key">Tâches totales</span><span class="info-val">${u.totalTasks || 0}</span></div>
          <div class="info-item"><span class="info-key">Badge</span><span class="info-val">${getBadgeLabel(u.totalTasks || 0)}</span></div>
          <div class="info-item"><span class="info-key">Statut</span><span class="info-val"><span class="badge ${u.suspended ? 'badge-red' : 'badge-green'}">${u.suspended ? 'Suspendu' : 'Actif'}</span></span></div>
          <div class="info-item"><span class="info-key">Maintenance</span><span class="info-val"><span class="badge ${u.maintenance ? 'badge-yellow' : 'badge-gray'}">${u.maintenance ? 'Oui' : 'Non'}</span></span></div>
          <div class="info-item"><span class="info-key">Dernière connexion</span><span class="info-val">${formatDate(u.lastLogin)}</span></div>
        </div>
        ${txList.length ? `
          <h5 style="font-weight:700;font-size:0.9rem;color:var(--text-primary);margin-top:0.5rem">Dernières transactions</h5>
          ${txList.map(tx => `
            <div class="mini-item">
              <div class="mini-info"><p class="mini-name">${escapeHtml(tx.description || '?')}</p><p class="mini-sub">${formatDate(tx.createdAt)}</p></div>
              <span class="mini-amount ${(tx.amount || 0) >= 0 ? 'green' : 'red'}">${(tx.amount || 0) >= 0 ? '+' : ''}${formatCurrency(tx.amount || 0)} HTG</span>
            </div>
          `).join('')}
        ` : ''}
      </div>
    `;
  } catch (err) {
    body.innerHTML = '<p style="color:var(--danger-light)">Erreur lors du chargement.</p>';
    console.error(err);
  }
}

// =====================================================
// 11. ADMIN — ÉQUIPES
// =====================================================

async function loadTeams() {
  const grid = document.getElementById('teams-grid');
  grid.innerHTML = '<div class="empty-state">Chargement...</div>';
  try {
    const snap = await db.collection('teams').get();
    teamsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTeamsGrid(teamsCache);
  } catch (err) {
    grid.innerHTML = '<div class="empty-state">Erreur de chargement</div>';
  }
}

function renderTeamsGrid(teams) {
  const grid = document.getElementById('teams-grid');
  if (!teams.length) {
    grid.innerHTML = '<div class="empty-state">Aucune équipe créée</div>';
    return;
  }
  grid.innerHTML = teams.map(t => `
    <div class="team-card">
      <div class="team-card-header">
        <div class="team-icon">${(t.name || 'E')[0].toUpperCase()}</div>
        <div>
          <p class="team-name">${escapeHtml(t.name || '?')}</p>
          <p class="team-manager-name">Manager : ${escapeHtml(t.managerName || 'Non assigné')}</p>
        </div>
      </div>
      <div class="team-stats">
        <div class="team-stat">
          <p class="team-stat-val">${t.memberCount || 0}</p>
          <p class="team-stat-lbl">Membres</p>
        </div>
        <div class="team-stat">
          <p class="team-stat-val">${formatCurrency(t.totalBalance || 0)}</p>
          <p class="team-stat-lbl">HTG total</p>
        </div>
      </div>
      <div class="team-actions">
        <button class="btn-sm blue" onclick="showEditTeamModal('${t.id}')">
          <i data-lucide="edit" class="w-3 h-3"></i> Modifier
        </button>
        <button class="btn-sm red" onclick="confirmDeleteTeam('${t.id}', '${escapeHtml(t.name || '')}')">
          <i data-lucide="trash-2" class="w-3 h-3"></i> Supprimer
        </button>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

function showCreateTeamModal() {
  document.getElementById('team-modal-id').value = '';
  document.getElementById('team-name-input').value = '';
  document.getElementById('modal-team-title').textContent = 'Nouvelle équipe';
  populateManagerSelect('team-manager-select');
  openModal('modal-team');
}

async function showEditTeamModal(teamId) {
  const team = teamsCache.find(t => t.id === teamId);
  if (!team) return;
  document.getElementById('team-modal-id').value = teamId;
  document.getElementById('team-name-input').value = team.name || '';
  document.getElementById('modal-team-title').textContent = 'Modifier l\'équipe';
  await populateManagerSelect('team-manager-select', team.managerId);
  openModal('modal-team');
}

async function populateManagerSelect(selectId, selectedId = '') {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '<option value="">Sélectionner un manager</option>';
  try {
    const snap = await db.collection('users').where('role', '==', 'manager').get();
    snap.docs.forEach(doc => {
      const u = doc.data();
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = u.username || u.email;
      if (doc.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Erreur chargement managers :', err);
  }
}

async function saveTeam() {
  const id = document.getElementById('team-modal-id').value;
  const name = document.getElementById('team-name-input').value.trim();
  const managerId = document.getElementById('team-manager-select').value;

  if (!name) { showToast('Le nom de l\'équipe est requis.', 'error'); return; }

  try {
    let managerName = '';
    if (managerId) {
      const mgr = await db.collection('users').doc(managerId).get();
      if (mgr.exists) managerName = mgr.data().username || '';
    }

    const teamData = {
      name,
      managerId: managerId || null,
      managerName,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (id) {
      await db.collection('teams').doc(id).update(teamData);
      // Mettre à jour les workers de cette équipe
      if (managerId) {
        await db.collection('users').doc(managerId).update({ teamId: id, teamName: name });
      }
      showToast('Équipe mise à jour.', 'success');
      await addLog('user', `Équipe "${name}" modifiée`, currentUser.username);
    } else {
      teamData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      teamData.memberCount = 0;
      teamData.totalBalance = 0;
      const ref = await db.collection('teams').add(teamData);
      if (managerId) {
        await db.collection('users').doc(managerId).update({ teamId: ref.id, teamName: name });
      }
      showToast('Équipe créée.', 'success');
      await addLog('user', `Équipe "${name}" créée`, currentUser.username);
    }

    closeModal();
    await loadTeams();
  } catch (err) {
    console.error('Erreur sauvegarde équipe :', err);
    showToast('Erreur lors de la sauvegarde.', 'error');
  }
}

function confirmDeleteTeam(teamId, teamName) {
  openConfirmModal('Supprimer l\'équipe',
    `Êtes-vous sûr de vouloir supprimer l'équipe "${teamName}" ?`,
    async () => {
      await deleteTeam(teamId, teamName);
    }
  );
}

async function deleteTeam(teamId, teamName) {
  try {
    await db.collection('teams').doc(teamId).delete();
    await addLog('user', `Équipe "${teamName}" supprimée`, currentUser.username);
    showToast('Équipe supprimée.', 'success');
    closeModal();
    await loadTeams();
  } catch (err) {
    showToast('Erreur lors de la suppression.', 'error');
  }
}

// =====================================================
// 12. ADMIN — TÂCHES
// =====================================================

let currentTaskTab = 'available';

function switchTaskTab(tab) {
  currentTaskTab = tab;
  ['available', 'pending', 'completed'].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  loadAdminTasks(tab);
}

async function loadAdminTasks(status = 'available') {
  const tbody = document.getElementById('admin-tasks-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    let query = db.collection('tasks');
    if (status === 'available') query = query.where('status', '==', 'available');
    else if (status === 'pending') query = query.where('status', '==', 'pending');
    else if (status === 'completed') query = query.where('status', '==', 'validated');

    const snap = await query.orderBy('createdAt', 'desc').get();
    tasksCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAdminTasksTable(tasksCache, status);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Erreur de chargement</td></tr>';
    console.error(err);
  }
}

function renderAdminTasksTable(tasks, status) {
  const tbody = document.getElementById('admin-tasks-tbody');
  if (!tasks.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucune tâche</td></tr>';
    return;
  }
  tbody.innerHTML = tasks.map(t => {
    const statusLabel = { available: 'Disponible', pending: 'En attente', validated: 'Validée', rejected: 'Rejetée' };
    const statusClass = { available: 'badge-green', pending: 'badge-yellow', validated: 'badge-green', rejected: 'badge-red' };
    return `
      <tr>
        <td style="font-weight:600;color:var(--text-primary)">${escapeHtml(t.title || '?')}</td>
        <td><span class="badge badge-gray">Agency</span></td>
        <td style="color:#22c55e;font-weight:600">${formatCurrency(t.reward || 0)} HTG</td>
        <td>${t.workerUsername ? escapeHtml(t.workerUsername) : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td><span class="badge ${statusClass[t.status] || 'badge-gray'}">${statusLabel[t.status] || t.status}</span></td>
        <td style="color:var(--text-muted);font-size:0.8rem">${formatDate(t.createdAt)}</td>
        <td>
          <div style="display:flex;gap:4px">
            ${status === 'pending' ? `
              <button class="btn-sm green" onclick="validateTask('${t.id}')">
                <i data-lucide="check" class="w-3 h-3"></i> Valider
              </button>
              <button class="btn-sm red" onclick="rejectTask('${t.id}')">
                <i data-lucide="x" class="w-3 h-3"></i> Rejeter
              </button>
            ` : ''}
            ${status === 'available' ? `
              <button class="btn-sm red" onclick="confirmDeleteTask('${t.id}', '${escapeHtml(t.title || '')}')">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
              </button>
            ` : ''}
            ${status === 'completed' ? `<span style="color:var(--text-muted);font-size:0.75rem">—</span>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
  lucide.createIcons();
}

function showCreateTaskModal() {
  document.getElementById('task-title-input').value = '';
  document.getElementById('task-desc-input').value = '';
  document.getElementById('task-reward-input').value = '';
  openModal('modal-task');
}

async function createTask() {
  const title = document.getElementById('task-title-input').value.trim();
  const desc = document.getElementById('task-desc-input').value.trim();
  const reward = parseFloat(document.getElementById('task-reward-input').value);

  if (!title || !desc || isNaN(reward) || reward <= 0) {
    showToast('Remplissez tous les champs correctement.', 'error');
    return;
  }

  try {
    await db.collection('tasks').add({
      title,
      description: desc,
      reward,
      status: 'available',
      type: 'agency',
      createdBy: currentUser.id,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await addLog('task', `Tâche "${title}" créée (${reward} HTG)`, currentUser.username);
    showToast('Tâche créée avec succès.', 'success');
    closeModal();
    await loadAdminTasks(currentTaskTab);
  } catch (err) {
    showToast('Erreur lors de la création.', 'error');
    console.error(err);
  }
}

async function validateTask(taskId) {
  try {
    const taskDoc = await db.collection('tasks').doc(taskId).get();
    if (!taskDoc.exists) return;
    const task = taskDoc.data();

    const batch = db.batch();

    // Mettre à jour la tâche
    batch.update(db.collection('tasks').doc(taskId), {
      status: 'validated',
      validatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      validatedBy: currentUser.id
    });

    // Créditer le worker
    if (task.workerId) {
      const workerRef = db.collection('users').doc(task.workerId);
      batch.update(workerRef, {
        balance: firebase.firestore.FieldValue.increment(task.reward || 0),
        totalTasks: firebase.firestore.FieldValue.increment(1)
      });

      // Ajouter une transaction
      const txRef = db.collection('transactions').doc();
      batch.set(txRef, {
        userId: task.workerId,
        username: task.workerUsername,
        type: 'task',
        description: `Tâche validée : ${task.title}`,
        amount: task.reward || 0,
        taskId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Notifier le worker
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId: task.workerId,
        title: 'Tâche validée',
        message: `Votre tâche "${task.title}" a été validée. +${formatCurrency(task.reward || 0)} HTG crédités.`,
        type: 'task',
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    await batch.commit();
    await addLog('task', `Tâche "${task.title}" validée`, currentUser.username);
    showToast('Tâche validée, worker crédité.', 'success');
    await loadAdminTasks(currentTaskTab);
  } catch (err) {
    showToast('Erreur lors de la validation.', 'error');
    console.error(err);
  }
}

async function rejectTask(taskId) {
  try {
    const taskDoc = await db.collection('tasks').doc(taskId).get();
    if (!taskDoc.exists) return;
    const task = taskDoc.data();

    await db.collection('tasks').doc(taskId).update({
      status: 'rejected',
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectedBy: currentUser.id
    });

    if (task.workerId) {
      // Notifier le worker
      await db.collection('notifications').add({
        userId: task.workerId,
        title: 'Tâche rejetée',
        message: `Votre preuve pour "${task.title}" a été rejetée. Veuillez soumettre une nouvelle preuve.`,
        type: 'task',
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Remettre la tâche disponible pour le worker
      await db.collection('tasks').doc(taskId).update({ status: 'available', workerId: null, workerUsername: null, proof: null });
    }

    await addLog('task', `Tâche "${task.title}" rejetée`, currentUser.username);
    showToast('Tâche rejetée.', 'warning');
    await loadAdminTasks(currentTaskTab);
  } catch (err) {
    showToast('Erreur lors du rejet.', 'error');
    console.error(err);
  }
}

function confirmDeleteTask(taskId, taskTitle) {
  openConfirmModal('Supprimer la tâche',
    `Supprimer la tâche "${taskTitle}" ?`,
    async () => {
      await db.collection('tasks').doc(taskId).delete();
      showToast('Tâche supprimée.', 'success');
      closeModal();
      await loadAdminTasks(currentTaskTab);
    }
  );
}

// =====================================================
// 13. ADMIN — MAINTENANCE
// =====================================================

async function loadMaintenance() {
  const tbody = document.getElementById('maintenance-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    const snap = await db.collection('maintenance')
      .orderBy('createdAt', 'desc')
      .get();
    maintenanceCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMaintenanceTable(maintenanceCache);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Erreur de chargement</td></tr>';
  }
}

function renderMaintenanceTable(items) {
  const tbody = document.getElementById('maintenance-tbody');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucune maintenance</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(m => {
    const statusLabel = { pending: 'En attente', paid: 'Payé', approved: 'Approuvé', rejected: 'Rejeté' };
    const statusClass = { pending: 'badge-yellow', paid: 'badge-blue', approved: 'badge-green', rejected: 'badge-red' };
    return `
      <tr>
        <td style="font-weight:600">${escapeHtml(m.workerUsername || '?')}</td>
        <td>${escapeHtml(m.teamName || '—')}</td>
        <td style="color:#facc15;font-weight:600">${formatCurrency(m.amount || 0)} HTG</td>
        <td>
          ${m.proofUrl ? `<a href="${m.proofUrl}" target="_blank" class="btn-link">Voir</a>` : '<span style="color:var(--text-muted)">—</span>'}
        </td>
        <td><span class="badge ${statusClass[m.status] || 'badge-gray'}">${statusLabel[m.status] || m.status}</span></td>
        <td style="color:var(--text-muted);font-size:0.8rem">${formatDate(m.createdAt)}</td>
        <td>
          <div style="display:flex;gap:4px">
            ${m.status === 'paid' ? `
              <button class="btn-sm green" onclick="showMaintenanceProofModal('${m.id}')">
                <i data-lucide="check-circle" class="w-3 h-3"></i> Valider
              </button>
            ` : ''}
            ${m.status === 'pending' ? `
              <button class="btn-sm yellow" onclick="activateMaintenanceDirect('${m.workerId}', ${m.amount || 0}, '${m.id}')">
                Activer
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
  lucide.createIcons();
}

function showAddMaintenanceModal() {
  document.getElementById('maintenance-amount-input').value = maintenanceFee;
  document.getElementById('maintenance-reason-input').value = '';
  populateWorkersSelect('maintenance-worker-select');
  openModal('modal-add-maintenance');
}

async function populateWorkersSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '<option value="">Sélectionner un worker</option>';
  try {
    const snap = await db.collection('users').where('role', '==', 'worker').get();
    snap.docs.forEach(doc => {
      const u = doc.data();
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = u.username || u.email;
      opt.dataset.username = u.username || '';
      opt.dataset.teamName = u.teamName || '';
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Erreur chargement workers :', err);
  }
}

async function activateMaintenance() {
  const select = document.getElementById('maintenance-worker-select');
  const workerId = select.value;
  const amount = parseFloat(document.getElementById('maintenance-amount-input').value);
  const reason = document.getElementById('maintenance-reason-input').value.trim();

  if (!workerId) { showToast('Sélectionnez un worker.', 'error'); return; }
  if (isNaN(amount) || amount <= 0) { showToast('Montant invalide.', 'error'); return; }

  const selectedOpt = select.options[select.selectedIndex];
  const workerUsername = selectedOpt.dataset.username || '';
  const teamName = selectedOpt.dataset.teamName || '';

  try {
    const batch = db.batch();

    // Activer la maintenance sur le worker
    batch.update(db.collection('users').doc(workerId), {
      maintenance: true,
      maintenanceAmount: amount,
      maintenanceReason: reason || 'Maintenance activée par l\'admin'
    });

    // Créer l'entrée maintenance
    const mRef = db.collection('maintenance').doc();
    batch.set(mRef, {
      workerId,
      workerUsername,
      teamName,
      amount,
      reason: reason || '',
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.id
    });

    // Notifier le worker
    const nRef = db.collection('notifications').doc();
    batch.set(nRef, {
      userId: workerId,
      title: 'Compte en maintenance',
      message: `Votre compte est en maintenance. Montant à régler : ${formatCurrency(amount)} HTG.${reason ? ' Raison : ' + reason : ''}`,
      type: 'maintenance',
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    await addLog('maintenance', `Maintenance activée pour ${workerUsername} (${amount} HTG)`, currentUser.username);
    showToast('Maintenance activée.', 'warning');
    closeModal();
    await loadMaintenance();
  } catch (err) {
    showToast('Erreur lors de l\'activation.', 'error');
    console.error(err);
  }
}

function showMaintenanceProofModal(maintenanceId) {
  const record = maintenanceCache.find(m => m.id === maintenanceId);
  if (!record) return;

  document.getElementById('proof-maintenance-user-id').value = maintenanceId;
  const body = document.getElementById('modal-maintenance-proof-body');

  body.innerHTML = `
    <p><strong>Worker :</strong> ${escapeHtml(record.workerUsername || '?')}</p>
    <p><strong>Montant :</strong> ${formatCurrency(record.amount || 0)} HTG</p>
    ${record.proofUrl ? `
      <div style="margin-top:1rem">
        <p style="margin-bottom:0.5rem;font-weight:600">Preuve soumise :</p>
        ${record.proofUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)
          ? `<img src="${record.proofUrl}" style="max-width:100%;border-radius:8px" />`
          : `<a href="${record.proofUrl}" target="_blank" class="btn-primary">Voir la preuve</a>`}
      </div>
    ` : '<p style="color:var(--text-muted)">Aucune preuve soumise.</p>'}
  `;

  openModal('modal-maintenance-proof');
}

async function approveMaintenanceProof() {
  const maintenanceId = document.getElementById('proof-maintenance-user-id').value;
  const record = maintenanceCache.find(m => m.id === maintenanceId);
  if (!record) return;

  try {
    const batch = db.batch();

    batch.update(db.collection('maintenance').doc(maintenanceId), {
      status: 'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: currentUser.id
    });

    batch.update(db.collection('users').doc(record.workerId), {
      maintenance: false,
      maintenanceAmount: null,
      maintenanceReason: null
    });

    const nRef = db.collection('notifications').doc();
    batch.set(nRef, {
      userId: record.workerId,
      title: 'Maintenance levée',
      message: 'Votre paiement de maintenance a été approuvé. Votre compte est de nouveau actif.',
      type: 'maintenance',
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    await addLog('maintenance', `Maintenance approuvée pour ${record.workerUsername}`, currentUser.username);
    showToast('Maintenance approuvée, compte réactivé.', 'success');
    closeModal();
    await loadMaintenance();
  } catch (err) {
    showToast('Erreur lors de l\'approbation.', 'error');
    console.error(err);
  }
}

async function rejectMaintenanceProof() {
  const maintenanceId = document.getElementById('proof-maintenance-user-id').value;
  const record = maintenanceCache.find(m => m.id === maintenanceId);
  if (!record) return;

  try {
    await db.collection('maintenance').doc(maintenanceId).update({
      status: 'rejected',
      proofUrl: null,
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('notifications').add({
      userId: record.workerId,
      title: 'Preuve rejetée',
      message: 'Votre preuve de paiement de maintenance a été rejetée. Veuillez soumettre une nouvelle preuve valide.',
      type: 'maintenance',
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await addLog('maintenance', `Preuve rejetée pour ${record.workerUsername}`, currentUser.username);
    showToast('Preuve rejetée.', 'warning');
    closeModal();
    await loadMaintenance();
  } catch (err) {
    showToast('Erreur lors du rejet.', 'error');
  }
}

// =====================================================
// 14. ADMIN — RETRAITS
// =====================================================

let currentWithdrawalTab = 'pending';

function switchWithdrawalTab(tab) {
  currentWithdrawalTab = tab;
  ['pending', 'approved', 'rejected'].forEach(t => {
    document.getElementById(`wtab-${t}`)?.classList.toggle('active', t === tab);
  });
  loadWithdrawals(tab);
}

async function loadWithdrawals(status = 'pending') {
  const tbody = document.getElementById('withdrawals-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    const snap = await db.collection('withdrawals')
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .get();
    withdrawalsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderWithdrawalsTable(withdrawalsCache, status);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Erreur de chargement</td></tr>';
    console.error(err);
  }
}

function renderWithdrawalsTable(withdrawals, status) {
  const tbody = document.getElementById('withdrawals-tbody');
  if (!withdrawals.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucun retrait</td></tr>';
    return;
  }
  tbody.innerHTML = withdrawals.map(w => {
    const statusClass = { pending: 'badge-yellow', approved: 'badge-green', rejected: 'badge-red' };
    const statusLabel = { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté' };
    return `
      <tr>
        <td style="font-weight:600">${escapeHtml(w.username || '?')}</td>
        <td style="color:#f87171;font-weight:600">${formatCurrency(w.amount || 0)} HTG</td>
        <td>${escapeHtml(w.method || '?')}</td>
        <td style="font-family:monospace">${escapeHtml(w.phone || '?')}</td>
        <td><span class="badge ${statusClass[w.status] || 'badge-gray'}">${statusLabel[w.status] || w.status}</span></td>
        <td style="color:var(--text-muted);font-size:0.8rem">${formatDate(w.createdAt)}</td>
        <td>
          ${status === 'pending' ? `
            <div style="display:flex;gap:4px">
              <button class="btn-sm green" onclick="approveWithdrawal('${w.id}')">
                <i data-lucide="check" class="w-3 h-3"></i> Approuver
              </button>
              <button class="btn-sm red" onclick="rejectWithdrawal('${w.id}')">
                <i data-lucide="x" class="w-3 h-3"></i> Rejeter
              </button>
            </div>
          ` : '<span style="color:var(--text-muted)">—</span>'}
        </td>
      </tr>
    `;
  }).join('');
  lucide.createIcons();
}

async function approveWithdrawal(wdId) {
  try {
    const wdDoc = await db.collection('withdrawals').doc(wdId).get();
    if (!wdDoc.exists) return;
    const wd = wdDoc.data();

    await db.collection('withdrawals').doc(wdId).update({
      status: 'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: currentUser.id
    });

    // Notifier le worker
    await db.collection('notifications').add({
      userId: wd.userId,
      title: 'Retrait approuvé',
      message: `Votre retrait de ${formatCurrency(wd.amount || 0)} HTG via ${wd.method} a été approuvé.`,
      type: 'withdrawal',
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await addLog('withdrawal', `Retrait de ${wd.username} approuvé (${wd.amount} HTG)`, currentUser.username);
    showToast('Retrait approuvé.', 'success');
    await loadWithdrawals(currentWithdrawalTab);
  } catch (err) {
    showToast('Erreur lors de l\'approbation.', 'error');
    console.error(err);
  }
}

async function rejectWithdrawal(wdId) {
  try {
    const wdDoc = await db.collection('withdrawals').doc(wdId).get();
    if (!wdDoc.exists) return;
    const wd = wdDoc.data();

    const batch = db.batch();

    // Rejeter le retrait
    batch.update(db.collection('withdrawals').doc(wdId), {
      status: 'rejected',
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectedBy: currentUser.id
    });

    // Rembourser le solde
    batch.update(db.collection('users').doc(wd.userId), {
      balance: firebase.firestore.FieldValue.increment(wd.amount || 0)
    });

    // Transaction de remboursement
    const txRef = db.collection('transactions').doc();
    batch.set(txRef, {
      userId: wd.userId,
      username: wd.username,
      type: 'refund',
      description: `Remboursement retrait rejeté (${wd.method})`,
      amount: wd.amount || 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Notifier
    const nRef = db.collection('notifications').doc();
    batch.set(nRef, {
      userId: wd.userId,
      title: 'Retrait rejeté',
      message: `Votre retrait de ${formatCurrency(wd.amount || 0)} HTG a été rejeté. Le montant a été remis dans votre solde.`,
      type: 'withdrawal',
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    await addLog('withdrawal', `Retrait de ${wd.username} rejeté (${wd.amount} HTG remboursé)`, currentUser.username);
    showToast('Retrait rejeté, solde remboursé.', 'warning');
    await loadWithdrawals(currentWithdrawalTab);
  } catch (err) {
    showToast('Erreur lors du rejet.', 'error');
    console.error(err);
  }
}

// =====================================================
// 15. ADMIN — LOGS
// =====================================================

async function loadLogs() {
  const tbody = document.getElementById('logs-tbody');
  tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    const snap = await db.collection('logs')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    logsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLogsTable(logsCache);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Erreur de chargement</td></tr>';
  }
}

function filterLogs() {
  const search = (document.getElementById('logs-search')?.value || '').toLowerCase();
  const type = document.getElementById('logs-type-filter')?.value || '';
  const filtered = logsCache.filter(l => {
    const matchSearch = !search
      || (l.action || '').toLowerCase().includes(search)
      || (l.details || '').toLowerCase().includes(search)
      || (l.user || '').toLowerCase().includes(search);
    const matchType = !type || l.type === type;
    return matchSearch && matchType;
  });
  renderLogsTable(filtered);
}

function renderLogsTable(logs) {
  const tbody = document.getElementById('logs-tbody');
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Aucun log</td></tr>';
    return;
  }
  const typeIcons = { login: '🔑', task: '📋', withdrawal: '💸', maintenance: '🔧', user: '👤' };
  tbody.innerHTML = logs.map(l => `
    <tr>
      <td>
        <span style="font-size:1rem">${typeIcons[l.type] || '📌'}</span>
        <span style="margin-left:6px;font-weight:600;color:var(--text-primary)">${escapeHtml(l.action || '?')}</span>
      </td>
      <td style="color:var(--text-secondary);font-size:0.82rem">${escapeHtml(l.details || '—')}</td>
      <td><span class="badge badge-gray">${escapeHtml(l.user || '?')}</span></td>
      <td style="color:var(--text-muted);font-size:0.8rem;white-space:nowrap">${formatDate(l.createdAt)}</td>
    </tr>
  `).join('');
}

async function addLog(type, details, user) {
  try {
    await db.collection('logs').add({
      type,
      action: type.charAt(0).toUpperCase() + type.slice(1),
      details,
      user: user || 'système',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Erreur log :', err);
  }
}

// =====================================================
// 16. ADMIN — PARAMÈTRES
// =====================================================

async function loadSettings() {
  try {
    const doc = await db.collection('settings').doc('global').get();
    if (doc.exists) {
      const data = doc.data();
      exchangeRate = data.exchangeRate || 130;
      maintenanceFee = data.maintenanceFee || 250;
    }
    document.getElementById('exchange-rate-input').value = exchangeRate;
    document.getElementById('maintenance-fee-input').value = maintenanceFee;
    document.getElementById('current-exchange-rate').textContent = `Taux actuel : 1 USD = ${exchangeRate} HTG`;
    document.getElementById('current-maintenance-fee').textContent = `Frais actuels : ${maintenanceFee} HTG`;
  } catch (err) {
    console.error('Erreur chargement paramètres :', err);
  }
}

async function saveExchangeRate() {
  const value = parseFloat(document.getElementById('exchange-rate-input').value);
  if (isNaN(value) || value <= 0) { showToast('Taux invalide.', 'error'); return; }
  try {
    await db.collection('settings').doc('global').set({ exchangeRate: value }, { merge: true });
    exchangeRate = value;
    document.getElementById('current-exchange-rate').textContent = `Taux actuel : 1 USD = ${value} HTG`;
    await addLog('user', `Taux de change mis à jour : ${value} HTG/USD`, currentUser.username);
    showToast('Taux de change enregistré.', 'success');
  } catch (err) {
    showToast('Erreur lors de la sauvegarde.', 'error');
  }
}

async function saveMaintenanceFee() {
  const value = parseFloat(document.getElementById('maintenance-fee-input').value);
  if (isNaN(value) || value <= 0) { showToast('Montant invalide.', 'error'); return; }
  try {
    await db.collection('settings').doc('global').set({ maintenanceFee: value }, { merge: true });
    maintenanceFee = value;
    document.getElementById('current-maintenance-fee').textContent = `Frais actuels : ${value} HTG`;
    await addLog('user', `Frais de maintenance mis à jour : ${value} HTG`, currentUser.username);
    showToast('Frais de maintenance enregistrés.', 'success');
  } catch (err) {
    showToast('Erreur lors de la sauvegarde.', 'error');
  }
}

async function createManagerAccount() {
  const name = document.getElementById('new-manager-name').value.trim();
  const username = document.getElementById('new-manager-username').value.trim();
  const password = document.getElementById('new-manager-password').value.trim();
  const resultEl = document.getElementById('manager-creation-result');

  if (!name || !username || !password) {
    showResult(resultEl, 'Tous les champs sont requis.', 'error');
    return;
  }

  try {
    const email = `${username}@hbwtask.com`;

    // Vérifier si le username existe déjà
    const existing = await db.collection('users').where('username', '==', username).limit(1).get();
    if (!existing.empty) {
      showResult(resultEl, 'Ce nom d\'utilisateur est déjà pris.', 'error');
      return;
    }

    // Créer le compte Firebase Auth (via une fonction Cloud serait idéal,
    // ici on utilise une approche client-side)
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    // Créer le document Firestore
    await db.collection('users').doc(uid).set({
      username,
      email,
      role: 'manager',
      displayName: name,
      balance: 0,
      totalTasks: 0,
      suspended: false,
      maintenance: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.id
    });

    await addLog('user', `Compte manager créé : ${username}`, currentUser.username);
    showResult(resultEl, `Compte manager "${username}" créé avec succès.`, 'success');

    // Réinitialiser les champs
    document.getElementById('new-manager-name').value = '';
    document.getElementById('new-manager-username').value = '';
    document.getElementById('new-manager-password').value = '';

    // Se reconnecter à l'admin (car createUserWithEmailAndPassword change l'auth)
    await auth.signInWithEmailAndPassword(currentUser.email, prompt('Entrez votre mot de passe pour rester connecté :'));
    showToast('Manager créé avec succès.', 'success');
  } catch (err) {
    console.error('Erreur création manager :', err);
    showResult(resultEl, `Erreur : ${err.message}`, 'error');
  }
}

function showResult(el, msg, type) {
  el.textContent = msg;
  el.className = `result-box ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

// =====================================================
// 17. MANAGER — TABLEAU DE BORD
// =====================================================

async function renderManagerDashboard() {
  try {
    if (!currentUser.teamId) {
      showToast('Vous n\'êtes assigné à aucune équipe.', 'warning');
      return;
    }

    // Membres de l'équipe
    const membersSnap = await db.collection('users')
      .where('teamId', '==', currentUser.teamId)
      .where('role', '==', 'worker')
      .get();
    const members = membersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Stats du jour
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const txSnap = await db.collection('transactions')
      .where('type', '==', 'task')
      .where('createdAt', '>=', today)
      .get();
    const memberIds = members.map(m => m.id);
    const todayTasks = txSnap.docs.filter(d => memberIds.includes(d.data().userId));

    const totalBalance = members.reduce((a, m) => a + (m.balance || 0), 0);
    const avgBalance = members.length ? (totalBalance / members.length) : 0;

    document.getElementById('mgr-stat-members').textContent = members.length;
    document.getElementById('mgr-stat-tasks').textContent = todayTasks.length;
    document.getElementById('mgr-stat-avg').textContent = formatCurrency(avgBalance) + ' HTG';
    document.getElementById('mgr-stat-balance').textContent = formatCurrency(totalBalance) + ' HTG';

    // Classement de l'équipe
    const ranked = [...members].sort((a, b) => (b.balance || 0) - (a.balance || 0));
    renderTeamRankingList(ranked);

    // Graphique
    await renderManagerChart(members);

  } catch (err) {
    console.error('Erreur dashboard manager :', err);
    showToast('Erreur lors du chargement du tableau de bord.', 'error');
  }
}

function renderTeamRankingList(members) {
  const container = document.getElementById('team-ranking-list');
  if (!members.length) {
    container.innerHTML = '<div class="empty-state-sm">Aucun membre</div>';
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  container.innerHTML = members.map((m, i) => `
    <div class="mini-item">
      <div class="mini-avatar" style="background:transparent;font-size:1.25rem;width:34px;height:34px">
        ${medals[i] || (i + 1)}
      </div>
      <div class="mini-info">
        <p class="mini-name">${escapeHtml(m.username || '?')}</p>
        <p class="mini-sub">${m.totalTasks || 0} tâche(s) · ${getBadgeLabel(m.totalTasks || 0)}</p>
      </div>
      <span class="mini-amount green">${formatCurrency(m.balance || 0)} HTG</span>
    </div>
  `).join('');
}

async function renderManagerChart(members) {
  const ctx = document.getElementById('manager-chart');
  if (!ctx) return;

  const labels = getLast7DaysLabels();
  const last7 = getLast7Days();
  const memberIds = members.map(m => m.id);

  const from = new Date();
  from.setDate(from.getDate() - 7);
  from.setHours(0, 0, 0, 0);

  try {
    const snap = await db.collection('transactions')
      .where('type', '==', 'task')
      .where('createdAt', '>=', from)
      .get();

    const dailyTotals = {};
    last7.forEach(d => { dailyTotals[d] = 0; });

    snap.docs.forEach(doc => {
      const data = doc.data();
      if (!memberIds.includes(data.userId)) return;
      const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
      const key = date.toISOString().split('T')[0];
      if (dailyTotals[key] !== undefined) dailyTotals[key]++;
    });

    const values = last7.map(d => dailyTotals[d] || 0);

    if (managerChart) managerChart.destroy();

    managerChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Tâches complétées',
          data: values,
          backgroundColor: 'rgba(22,163,74,0.5)',
          borderColor: '#16a34a',
          borderWidth: 2,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 11 } }, beginAtZero: true, stepSize: 1 }
        }
      }
    });
  } catch (err) {
    console.error('Erreur graphique manager :', err);
  }
}

// =====================================================
// 18. MANAGER — MEMBRES
// =====================================================

async function loadMembers() {
  const tbody = document.getElementById('members-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    if (!currentUser.teamId) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucune équipe assignée</td></tr>';
      return;
    }
    const snap = await db.collection('users')
      .where('teamId', '==', currentUser.teamId)
      .where('role', '==', 'worker')
      .get();
    membersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Peupler aussi le select du formulaire de message
    populateMsgRecipient(membersCache);
    renderMembersTable(membersCache);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Erreur de chargement</td></tr>';
  }
}

function filterMembers() {
  const search = (document.getElementById('members-search')?.value || '').toLowerCase();
  const filtered = membersCache.filter(m =>
    !search || (m.username || '').toLowerCase().includes(search)
    || (m.firstName || '').toLowerCase().includes(search)
  );
  renderMembersTable(filtered);
}

function renderMembersTable(members) {
  const tbody = document.getElementById('members-tbody');
  if (!members.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucun membre</td></tr>';
    return;
  }
  tbody.innerHTML = members.map(m => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="mini-avatar" style="width:30px;height:30px;font-size:0.75rem">${(m.username || '?')[0].toUpperCase()}</div>
          <div>
            <p style="font-weight:600;color:var(--text-primary)">${escapeHtml(m.username || '?')}</p>
            <p style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml((m.firstName || '') + ' ' + (m.lastName || ''))}</p>
          </div>
        </div>
      </td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${escapeHtml(m.phone || '—')}</td>
      <td style="color:#22c55e;font-weight:600">${formatCurrency(m.balance || 0)} HTG</td>
      <td>${m.totalTasks || 0}</td>
      <td>${getBadgeIcon(m.totalTasks || 0)} ${getBadgeLabel(m.totalTasks || 0)}</td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${formatDate(m.lastLogin)}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn-sm blue" onclick="viewUserDetail('${m.id}')">
            <i data-lucide="eye" class="w-3 h-3"></i>
          </button>
          <button class="btn-sm red" onclick="confirmRemoveMember('${m.id}', '${escapeHtml(m.username || '')}')">
            <i data-lucide="user-minus" class="w-3 h-3"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
  lucide.createIcons();
}

function confirmRemoveMember(uid, username) {
  openConfirmModal('Retirer le membre',
    `Retirer "${username}" de votre équipe ?`,
    async () => {
      await db.collection('users').doc(uid).update({ teamId: null, teamName: null });
      await addLog('user', `${username} retiré de l'équipe par manager ${currentUser.username}`, currentUser.username);
      showToast('Membre retiré de l\'équipe.', 'success');
      closeModal();
      await loadMembers();
    }
  );
}

function populateMsgRecipient(members) {
  const select = document.getElementById('msg-recipient');
  if (!select) return;
  select.innerHTML = '<option value="all">Toute l\'équipe</option>';
  members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.username || m.email;
    select.appendChild(opt);
  });
}

// =====================================================
// 19. MANAGER — AJOUTER UN MEMBRE (WORKER)
// =====================================================

function showAddMemberModal() {
  document.getElementById('member-firstname').value = '';
  document.getElementById('member-lastname').value = '';
  document.getElementById('member-age').value = '';
  document.getElementById('member-phone').value = '';
  document.getElementById('member-address').value = '';
  generateWorkerCredentials();
  openModal('modal-add-member');
}

function generateWorkerCredentials() {
  const randomId = Math.floor(10000 + Math.random() * 90000);
  const randomPass = generateRandomPassword();
  const username = `worker_${randomId}`;
  const email = `${username}@hbwtask.com`;

  document.getElementById('gen-username').textContent = username;
  document.getElementById('gen-email').textContent = email;
  document.getElementById('gen-password').textContent = randomPass;
}

async function createWorkerAccount() {
  const firstName = document.getElementById('member-firstname').value.trim();
  const lastName = document.getElementById('member-lastname').value.trim();
  const age = document.getElementById('member-age').value;
  const gender = document.getElementById('member-gender').value;
  const phone = document.getElementById('member-phone').value.trim();
  const status = document.getElementById('member-status').value;
  const address = document.getElementById('member-address').value.trim();

  const username = document.getElementById('gen-username').textContent.trim();
  const email = document.getElementById('gen-email').textContent.trim();
  const password = document.getElementById('gen-password').textContent.trim();

  if (!firstName || !lastName) {
    showToast('Prénom et nom sont requis.', 'error');
    return;
  }

  try {
    // Vérifier l'unicité du username
    const existing = await db.collection('users').where('username', '==', username).limit(1).get();
    if (!existing.empty) {
      showToast('Nom d\'utilisateur déjà pris. Régénérez.', 'error');
      return;
    }

    // Créer dans Firebase Auth
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    // Obtenir le nom de l'équipe
    let teamName = '';
    if (currentUser.teamId) {
      const teamDoc = await db.collection('teams').doc(currentUser.teamId).get();
      if (teamDoc.exists) teamName = teamDoc.data().name || '';
    }

    // Créer dans Firestore
    await db.collection('users').doc(uid).set({
      username,
      email,
      firstName,
      lastName,
      age: age ? parseInt(age) : null,
      gender,
      phone,
      status,
      address,
      role: 'worker',
      teamId: currentUser.teamId || null,
      teamName,
      managerId: currentUser.id,
      balance: 0,
      totalTasks: 0,
      suspended: false,
      maintenance: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.id
    });

    // Mettre à jour le compteur de l'équipe
    if (currentUser.teamId) {
      await db.collection('teams').doc(currentUser.teamId).update({
        memberCount: firebase.firestore.FieldValue.increment(1)
      });
    }

    await addLog('user', `Worker ${username} créé par manager ${currentUser.username}`, currentUser.username);

    // Reconnecter le manager
    const managerEmail = currentUser.email;
    const managerPass = currentUserAuth.email; // on va utiliser un workaround

    showToast(`Worker "${username}" créé avec succès !`, 'success');

    // Note : re-signIn du manager après createUser
    // Dans un vrai projet, utiliser Firebase Admin SDK via Cloud Functions
    showToast('Reconnexion manager en cours...', 'info');
    setTimeout(async () => {
      try {
        // On recharge la page pour forcer la re-auth
        // Alternative propre: Cloud Function createUser
        window.location.reload();
      } catch (e) {}
    }, 2000);

    closeModal();
    await loadMembers();
  } catch (err) {
    console.error('Erreur création worker :', err);
    showToast('Erreur : ' + err.message, 'error');
  }
}

// =====================================================
// 20. MANAGER — MESSAGERIE
// =====================================================

async function sendTeamMessage() {
  const recipientId = document.getElementById('msg-recipient').value;
  const content = document.getElementById('msg-content').value.trim();

  if (!content) { showToast('Le message est vide.', 'error'); return; }

  try {
    const isAll = recipientId === 'all';
    const targets = isAll ? membersCache.map(m => m.id) : [recipientId];

    const batch = db.batch();
    targets.forEach(uid => {
      const nRef = db.collection('notifications').doc();
      batch.set(nRef, {
        userId: uid,
        title: `Message de ${currentUser.username}`,
        message: content,
        type: 'message',
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    // Sauvegarder le message envoyé
    const msgRef = db.collection('messages').doc();
    batch.set(msgRef, {
      senderId: currentUser.id,
      senderUsername: currentUser.username,
      teamId: currentUser.teamId,
      recipientId: isAll ? 'all' : recipientId,
      recipientLabel: isAll ? 'Toute l\'équipe' : (membersCache.find(m => m.id === recipientId)?.username || '?'),
      content,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    document.getElementById('msg-content').value = '';
    showToast('Message envoyé avec succès.', 'success');
    await loadSentMessages();
  } catch (err) {
    showToast('Erreur lors de l\'envoi.', 'error');
    console.error(err);
  }
}

async function loadSentMessages() {
  const container = document.getElementById('sent-messages-list');
  if (!container) return;
  try {
    const snap = await db.collection('messages')
      .where('senderId', '==', currentUser.id)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    const messages = snap.docs.map(d => d.data());
    if (!messages.length) {
      container.innerHTML = '<div class="empty-state-sm">Aucun message envoyé</div>';
      return;
    }
    container.innerHTML = messages.map(m => `
      <div class="mini-item">
        <div class="mini-avatar" style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">
          <i data-lucide="send" style="width:14px;height:14px"></i>
        </div>
        <div class="mini-info">
          <p class="mini-name">${escapeHtml(m.recipientLabel || '?')}</p>
          <p class="mini-sub" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(m.content || '')}</p>
        </div>
        <span style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap">${formatDate(m.createdAt)}</span>
      </div>
    `).join('');
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = '<div class="empty-state-sm">Erreur de chargement</div>';
  }
}

// =====================================================
// 21. MANAGER — STATISTIQUES
// =====================================================

async function loadManagerStats() {
  const tbody = document.getElementById('stats-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    if (!currentUser.teamId) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Aucune équipe assignée</td></tr>';
      return;
    }
    const snap = await db.collection('users')
      .where('teamId', '==', currentUser.teamId)
      .where('role', '==', 'worker')
      .get();
    const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Calculer les gains totaux via les transactions
    const txPromises = members.map(m =>
      db.collection('transactions')
        .where('userId', '==', m.id)
        .where('type', '==', 'task')
        .get()
    );
    const txResults = await Promise.all(txPromises);

    const statsData = members.map((m, i) => {
      const txs = txResults[i].docs.map(d => d.data());
      const totalEarnings = txs.reduce((a, t) => a + (t.amount || 0), 0);
      const avgEarnings = txs.length ? totalEarnings / txs.length : 0;
      return { ...m, totalEarnings, avgEarnings };
    });

    statsData.sort((a, b) => b.totalEarnings - a.totalEarnings);

    if (!statsData.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Aucun membre</td></tr>';
      return;
    }

    tbody.innerHTML = statsData.map((m, i) => `
      <tr>
        <td style="font-weight:700;font-size:1.1rem">${i + 1}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="mini-avatar" style="width:28px;height:28px;font-size:0.7rem">${(m.username || '?')[0].toUpperCase()}</div>
            <span style="font-weight:600;color:var(--text-primary)">${escapeHtml(m.username || '?')}</span>
          </div>
        </td>
        <td>${m.totalTasks || 0}</td>
        <td style="color:#22c55e;font-weight:600">${formatCurrency(m.totalEarnings || 0)} HTG</td>
        <td style="color:var(--text-secondary)">${formatCurrency(m.avgEarnings || 0)} HTG</td>
        <td>${getBadgeIcon(m.totalTasks || 0)} ${getBadgeLabel(m.totalTasks || 0)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Erreur de chargement</td></tr>';
    console.error(err);
  }
}

// =====================================================
// 22. WORKER — TABLEAU DE BORD
// =====================================================

async function renderWorkerDashboard() {
  try {
    // Recharger les données fraîches
    const userDoc = await db.collection('users').doc(currentUser.id).get();
    if (userDoc.exists) currentUser = { id: userDoc.id, ...userDoc.data() };

    const balance = currentUser.balance || 0;
    const usdEquiv = (balance / exchangeRate).toFixed(2);
    const totalTasks = currentUser.totalTasks || 0;

    // Solde
    document.getElementById('worker-balance').textContent = formatCurrency(balance) + ' HTG';
    document.getElementById('worker-balance-usd').textContent = `≈ ${usdEquiv} USD`;
    document.getElementById('wd-balance').textContent = formatCurrency(balance) + ' HTG';

    // Badge et progression
    updateBadgeDisplay(totalTasks);

    // Maintenance banner
    const banner = document.getElementById('maintenance-banner');
    if (currentUser.maintenance) {
      banner.classList.remove('hidden');
      document.getElementById('maintenance-amount-banner').textContent =
        formatCurrency(currentUser.maintenanceAmount || maintenanceFee) + ' HTG';
    } else {
      banner.classList.add('hidden');
    }

    // Activité récente
    await loadRecentActivity();

  } catch (err) {
    console.error('Erreur dashboard worker :', err);
  }
}

function updateBadgeDisplay(totalTasks) {
  const badge = getBadgeInfo(totalTasks);
  const next = getNextBadge(totalTasks);

  document.getElementById('worker-badge-icon').textContent = badge.icon;
  document.getElementById('worker-badge-name').textContent = badge.name;

  if (next) {
    const progress = Math.min(100, ((totalTasks - badge.min) / (next.min - badge.min)) * 100);
    document.getElementById('progress-bar').style.width = progress + '%';
    document.getElementById('next-badge-name').textContent = next.name;
    document.getElementById('progress-count').textContent = `${totalTasks} / ${next.min} tâches`;
  } else {
    document.getElementById('progress-bar').style.width = '100%';
    document.getElementById('next-badge-name').textContent = 'Max';
    document.getElementById('progress-count').textContent = `${totalTasks} tâches — Niveau maximum !`;
  }
}

async function loadRecentActivity() {
  const container = document.getElementById('worker-recent-activity');
  try {
    const snap = await db.collection('transactions')
      .where('userId', '==', currentUser.id)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    const txs = snap.docs.map(d => d.data());
    if (!txs.length) {
      container.innerHTML = '<div class="empty-state-sm">Aucune activité récente</div>';
      return;
    }
    container.innerHTML = txs.map(tx => {
      const isPos = (tx.amount || 0) >= 0;
      return `
        <div class="mini-item">
          <div class="mini-avatar" style="background:${isPos ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'};color:${isPos ? '#22c55e' : '#f87171'}">
            <i data-lucide="${isPos ? 'trending-up' : 'trending-down'}" style="width:16px;height:16px"></i>
          </div>
          <div class="mini-info">
            <p class="mini-name">${escapeHtml(tx.description || '?')}</p>
            <p class="mini-sub">${formatDate(tx.createdAt)}</p>
          </div>
          <span class="mini-amount ${isPos ? 'green' : 'red'}">${isPos ? '+' : ''}${formatCurrency(tx.amount || 0)} HTG</span>
        </div>
      `;
    }).join('');
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = '<div class="empty-state-sm">Erreur de chargement</div>';
  }
}

// =====================================================
// 23. WORKER — OFFERWALLS
// =====================================================

const offerwallUrls = {
  monlix: `https://monlix.com/wall/?appid=YOUR_APP_ID&userid=${() => currentUser?.id || 'user'}`,
  adscend: `https://adscendmedia.com/api/wall/?pubid=YOUR_PUB_ID&uid=${() => currentUser?.id || 'user'}`,
  ayet: `https://www.ayetstudios.com/offers/web_offerwall/YOUR_APP_ID?external_identifier=${() => currentUser?.id || 'user'}`,
  offertoro: `https://www.offertoro.com/ifr/show/YOUR_APP_ID/${() => currentUser?.id || 'user'}/YOUR_ZONE_ID`
};

const offerwallNames = {
  monlix: 'Monlix',
  adscend: 'Adscend Media',
  ayet: 'AyetStudios',
  offertoro: 'Offertoro'
};

function openOfferwall(provider) {
  if (currentUser?.maintenance) {
    showToast('Votre compte est en maintenance. Résolvez-la d\'abord.', 'error');
    return;
  }
  const container = document.getElementById('offerwall-iframe-container');
  const iframe = document.getElementById('offerwall-iframe');
  const title = document.getElementById('offerwall-iframe-title');

  const baseUrl = typeof offerwallUrls[provider] === 'function' ? offerwallUrls[provider]() : offerwallUrls[provider];
  const userId = currentUser?.id || 'user';
  const url = baseUrl.replace(/USER_ID_PLACEHOLDER/g, userId);

  title.textContent = offerwallNames[provider] || provider;
  iframe.src = url;
  container.classList.remove('hidden');
  container.scrollIntoView({ behavior: 'smooth' });
}

function closeOfferwall() {
  const container = document.getElementById('offerwall-iframe-container');
  const iframe = document.getElementById('offerwall-iframe');
  container.classList.add('hidden');
  iframe.src = '';
}

// =====================================================
// 24. WORKER — TÂCHES AGENCY
// =====================================================

async function loadAvailableTasks() {
  const grid = document.getElementById('worker-tasks-grid');
  grid.innerHTML = '<div class="empty-state">Chargement des tâches...</div>';

  if (currentUser?.maintenance) {
    grid.innerHTML = '<div class="empty-state"><p>⚠️ Votre compte est en maintenance.</p><p>Réglez la maintenance pour accéder aux tâches.</p></div>';
    return;
  }

  try {
    // Tâches disponibles non prises
    const availableSnap = await db.collection('tasks')
      .where('status', '==', 'available')
      .get();

    // Tâches du worker (prises / en attente)
    const myTasksSnap = await db.collection('tasks')
      .where('workerId', '==', currentUser.id)
      .get();

    const myTasks = myTasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const myTaskIds = myTasks.map(t => t.id);

    const allTasks = [
      ...myTasks,
      ...availableSnap.docs
        .filter(d => !myTaskIds.includes(d.id))
        .map(d => ({ id: d.id, ...d.data() }))
    ];

    if (!allTasks.length) {
      grid.innerHTML = '<div class="empty-state">Aucune tâche disponible pour le moment.</div>';
      return;
    }

    grid.innerHTML = allTasks.map(task => renderTaskCard(task)).join('');
    lucide.createIcons();
  } catch (err) {
    grid.innerHTML = '<div class="empty-state">Erreur de chargement des tâches.</div>';
    console.error(err);
  }
}

function renderTaskCard(task) {
  const myTask = task.workerId === currentUser.id;
  const isPending = task.status === 'pending' && myTask;
  const isValidated = task.status === 'validated' && myTask;
  const isAvailable = task.status === 'available';

  let actionBtn = '';
  let statusBadge = '';

  if (isAvailable) {
    actionBtn = `<button class="btn-primary" onclick="claimTask('${task.id}')">
      <i data-lucide="check-circle" class="w-4 h-4"></i> Prendre la tâche
    </button>`;
    statusBadge = `<span class="task-status available">Disponible</span>`;
  } else if (isPending) {
    actionBtn = `<span style="color:#facc15;font-size:0.82rem">⏳ En attente de validation</span>`;
    statusBadge = `<span class="task-status pending">En attente</span>`;
  } else if (isValidated) {
    actionBtn = `<span style="color:#22c55e;font-size:0.82rem">✅ Tâche validée</span>`;
    statusBadge = `<span class="task-status validated">Validée</span>`;
  } else if (myTask) {
    actionBtn = `<button class="btn-primary" onclick="showTaskProofModal('${task.id}', ${JSON.stringify(task.title).replace(/'/g, "\\'")} )">
      <i data-lucide="upload" class="w-4 h-4"></i> Soumettre preuve
    </button>`;
    statusBadge = `<span class="task-status available">En cours</span>`;
  }

  return `
    <div class="task-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="task-reward">+${formatCurrency(task.reward || 0)} HTG</span>
        ${statusBadge}
      </div>
      <h4 class="task-title">${escapeHtml(task.title || '?')}</h4>
      <p class="task-desc">${escapeHtml((task.description || '').slice(0, 120))}${task.description?.length > 120 ? '...' : ''}</p>
      <div>${actionBtn}</div>
    </div>
  `;
}

async function claimTask(taskId) {
  try {
    const taskDoc = await db.collection('tasks').doc(taskId).get();
    if (!taskDoc.exists) return;
    const task = taskDoc.data();

    if (task.status !== 'available') {
      showToast('Cette tâche n\'est plus disponible.', 'error');
      await loadAvailableTasks();
      return;
    }

    await db.collection('tasks').doc(taskId).update({
      status: 'claimed',
      workerId: currentUser.id,
      workerUsername: currentUser.username,
      claimedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast('Tâche prise ! Soumettez votre preuve.', 'success');
    await loadAvailableTasks();
  } catch (err) {
    showToast('Erreur lors de la prise de tâche.', 'error');
    console.error(err);
  }
}

function showTaskProofModal(taskId, taskTitle) {
  document.getElementById('task-proof-id').value = taskId;
  document.getElementById('task-proof-url').value = '';

  const task = { title: taskTitle }; // simplifié
  document.getElementById('task-instructions-box').innerHTML =
    `<strong>Tâche :</strong> ${escapeHtml(taskTitle)}<br>Soumettez l'URL de votre preuve (screenshot, lien, etc.)`;

  openModal('modal-task-proof');
}

async function submitTaskProof() {
  const taskId = document.getElementById('task-proof-id').value;
  const proofUrl = document.getElementById('task-proof-url').value.trim();

  if (!proofUrl) { showToast('Entrez l\'URL de votre preuve.', 'error'); return; }

  try {
    await db.collection('tasks').doc(taskId).update({
      status: 'pending',
      proof: proofUrl,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await addLog('task', `Preuve soumise pour tâche ${taskId} par ${currentUser.username}`, currentUser.username);
    showToast('Preuve soumise ! En attente de validation.', 'success');
    closeModal();
    await loadAvailableTasks();
  } catch (err) {
    showToast('Erreur lors de la soumission.', 'error');
    console.error(err);
  }
}

// =====================================================
// 25. WORKER — HISTORIQUE
// =====================================================

async function loadHistory() {
  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    const snap = await db.collection('transactions')
      .where('userId', '==', currentUser.id)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    const txs = snap.docs.map(d => d.data());

    if (!txs.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Aucune transaction</td></tr>';
      return;
    }

    const typeLabel = { task: 'Tâche', withdrawal: 'Retrait', refund: 'Remboursement', bonus: 'Bonus' };
    const typeClass = { task: 'badge-green', withdrawal: 'badge-red', refund: 'badge-blue', bonus: 'badge-yellow' };

    tbody.innerHTML = txs.map(tx => `
      <tr>
        <td style="color:var(--text-muted);font-size:0.8rem">${formatDate(tx.createdAt)}</td>
        <td style="color:var(--text-secondary)">${escapeHtml(tx.description || '?')}</td>
        <td style="font-weight:700;color:${(tx.amount || 0) >= 0 ? '#22c55e' : '#f87171'}">
          ${(tx.amount || 0) >= 0 ? '+' : ''}${formatCurrency(tx.amount || 0)} HTG
        </td>
        <td><span class="badge ${typeClass[tx.type] || 'badge-gray'}">${typeLabel[tx.type] || tx.type}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Erreur de chargement</td></tr>';
  }
}

// =====================================================
// 26. WORKER — MAINTENANCE
// =====================================================

async function loadMaintenancePage() {
  try {
    const userDoc = await db.collection('users').doc(currentUser.id).get();
    if (userDoc.exists) currentUser = { id: userDoc.id, ...userDoc.data() };

    const amount = currentUser.maintenanceAmount || maintenanceFee;
    document.getElementById('worker-maintenance-amount').textContent = formatCurrency(amount) + ' HTG';

    if (!currentUser.maintenance) {
      document.getElementById('maintenance-info').innerHTML =
        '<div class="success-banner"><i data-lucide="check-circle" class="w-5 h-5"></i> Votre compte est actif. Aucune maintenance requise.</div>';
      document.getElementById('maintenance-form').classList.add('hidden');
      lucide.createIcons();
    } else {
      document.getElementById('maintenance-info').innerHTML = `
        <p>Votre compte nécessite une maintenance. Payez le montant ci-dessous et soumettez une preuve.</p>
        <div class="maintenance-amount-display">
          <span class="maintenance-label">Montant à payer :</span>
          <span class="maintenance-value">${formatCurrency(amount)} HTG</span>
        </div>
        ${currentUser.maintenanceReason ? `<p style="margin-top:0.75rem;color:var(--text-muted);font-size:0.85rem">Raison : ${escapeHtml(currentUser.maintenanceReason)}</p>` : ''}
      `;
      document.getElementById('maintenance-form').classList.remove('hidden');
      lucide.createIcons();
    }

    // Vérifier si une preuve est déjà soumise
    const mSnap = await db.collection('maintenance')
      .where('workerId', '==', currentUser.id)
      .where('status', 'in', ['paid', 'pending'])
      .limit(1)
      .get();

    if (!mSnap.empty) {
      document.getElementById('maintenance-submitted-msg').classList.remove('hidden');
      document.getElementById('maintenance-form').querySelector('button').disabled = true;
    }
  } catch (err) {
    console.error('Erreur chargement page maintenance :', err);
  }
}

function handleMaintenanceFile() {
  const file = document.getElementById('maintenance-file').files[0];
  if (!file) return;
  const zone = document.getElementById('maintenance-file-zone');
  zone.innerHTML = `<p style="color:#22c55e">✅ Fichier sélectionné : ${escapeHtml(file.name)}</p>
    <input type="file" id="maintenance-file" accept="image/*" class="hidden" onchange="handleMaintenanceFile()" />`;
}

async function submitMaintenanceProof() {
  const url = document.getElementById('maintenance-proof-url').value.trim();
  const file = document.getElementById('maintenance-file')?.files?.[0];

  if (!url && !file) {
    showToast('Entrez une URL ou uploadez une image.', 'error');
    return;
  }

  try {
    let proofUrl = url;

    if (file && !url) {
      // Upload vers Firebase Storage
      const storageRef = storage.ref(`maintenance/${currentUser.id}/${Date.now()}_${file.name}`);
      const snapshot = await storageRef.put(file);
      proofUrl = await snapshot.ref.getDownloadURL();
    }

    // Trouver l'entrée maintenance en cours
    const mSnap = await db.collection('maintenance')
      .where('workerId', '==', currentUser.id)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (mSnap.empty) {
      // Créer une nouvelle entrée
      await db.collection('maintenance').add({
        workerId: currentUser.id,
        workerUsername: currentUser.username,
        teamName: currentUser.teamName || '',
        amount: currentUser.maintenanceAmount || maintenanceFee,
        proofUrl,
        status: 'paid',
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await mSnap.docs[0].ref.update({ proofUrl, status: 'paid', submittedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }

    await addLog('maintenance', `Preuve de maintenance soumise par ${currentUser.username}`, currentUser.username);

    document.getElementById('maintenance-submitted-msg').classList.remove('hidden');
    document.querySelector('#maintenance-form button').disabled = true;
    showToast('Preuve soumise ! En attente de validation.', 'success');
  } catch (err) {
    showToast('Erreur lors de la soumission.', 'error');
    console.error(err);
  }
}

// =====================================================
// 27. WORKER — RETRAIT
// =====================================================

async function loadWithdrawalPage() {
  // Recharger le solde
  const userDoc = await db.collection('users').doc(currentUser.id).get();
  if (userDoc.exists) currentUser = { id: userDoc.id, ...userDoc.data() };

  const balance = currentUser.balance || 0;
  document.getElementById('wd-balance').textContent = formatCurrency(balance) + ' HTG';

  // Charger mes retraits
  await loadMyWithdrawals();
}

function selectMethod(method) {
  selectedWithdrawalMethod = method;
  document.querySelectorAll('.method-option').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById(`method-${method.toLowerCase()}`);
  if (el) el.classList.add('selected');
}

async function requestWithdrawal() {
  const amount = parseFloat(document.getElementById('wd-amount').value);
  const phone = document.getElementById('wd-phone').value.trim();
  const errorEl = document.getElementById('withdrawal-error');
  const errorMsg = document.getElementById('withdrawal-error-msg');

  errorEl.classList.add('hidden');

  if (!phone) {
    errorMsg.textContent = 'Numéro de téléphone requis.';
    errorEl.classList.remove('hidden');
    return;
  }

  if (isNaN(amount) || amount < 100) {
    errorMsg.textContent = 'Le montant minimum est de 100 HTG.';
    errorEl.classList.remove('hidden');
    return;
  }

  if (currentUser.maintenance) {
    errorMsg.textContent = 'Votre compte est en maintenance. Résolvez-la avant de retirer.';
    errorEl.classList.remove('hidden');
    return;
  }

  const balance = currentUser.balance || 0;
  if (amount > balance) {
    errorMsg.textContent = `Solde insuffisant. Solde disponible : ${formatCurrency(balance)} HTG.`;
    errorEl.classList.remove('hidden');
    return;
  }

  // Vérifier qu'il n'y a pas déjà un retrait en attente
  const pendingSnap = await db.collection('withdrawals')
    .where('userId', '==', currentUser.id)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (!pendingSnap.empty) {
    errorMsg.textContent = 'Vous avez déjà un retrait en attente.';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const batch = db.batch();

    // Déduire le solde
    batch.update(db.collection('users').doc(currentUser.id), {
      balance: firebase.firestore.FieldValue.increment(-amount)
    });

    // Créer le retrait
    const wdRef = db.collection('withdrawals').doc();
    batch.set(wdRef, {
      userId: currentUser.id,
      username: currentUser.username,
      teamId: currentUser.teamId || null,
      teamName: currentUser.teamName || '',
      amount,
      method: selectedWithdrawalMethod,
      phone,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Transaction de débit
    const txRef = db.collection('transactions').doc();
    batch.set(txRef, {
      userId: currentUser.id,
      username: currentUser.username,
      type: 'withdrawal',
      description: `Demande de retrait via ${selectedWithdrawalMethod}`,
      amount: -amount,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    currentUser.balance = (currentUser.balance || 0) - amount;
    document.getElementById('wd-balance').textContent = formatCurrency(currentUser.balance) + ' HTG';
    document.getElementById('wd-amount').value = '';
    document.getElementById('wd-phone').value = '';

    await addLog('withdrawal', `Retrait de ${currentUser.username} : ${amount} HTG via ${selectedWithdrawalMethod}`, currentUser.username);
    showToast(`Demande de retrait de ${formatCurrency(amount)} HTG envoyée.`, 'success');
    await loadMyWithdrawals();
  } catch (err) {
    showToast('Erreur lors de la demande.', 'error');
    console.error(err);
  }
}

async function loadMyWithdrawals() {
  const container = document.getElementById('my-withdrawals-list');
  if (!container) return;
  try {
    const snap = await db.collection('withdrawals')
      .where('userId', '==', currentUser.id)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    const wds = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!wds.length) {
      container.innerHTML = '<div class="empty-state-sm">Aucun retrait</div>';
      return;
    }

    const statusLabel = { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté' };
    const statusColor = { pending: '#facc15', approved: '#22c55e', rejected: '#f87171' };

    container.innerHTML = wds.map(w => `
      <div class="mini-item">
        <div class="mini-avatar" style="background:rgba(59,124,201,0.2);color:#60a5fa">
          <i data-lucide="arrow-up-circle" style="width:16px;height:16px"></i>
        </div>
        <div class="mini-info">
          <p class="mini-name">${escapeHtml(w.method || '?')} · ${escapeHtml(w.phone || '')}</p>
          <p class="mini-sub">${formatDate(w.createdAt)}</p>
        </div>
        <div style="text-align:right">
          <p style="font-weight:700;color:#f87171">${formatCurrency(w.amount || 0)} HTG</p>
          <p style="font-size:0.72rem;color:${statusColor[w.status] || '#64748b'}">${statusLabel[w.status] || w.status}</p>
        </div>
      </div>
    `).join('');
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = '<div class="empty-state-sm">Erreur de chargement</div>';
  }
}

// =====================================================
// 28. NOTIFICATIONS
// =====================================================

function toggleNotifications() {
  const dropdown = document.getElementById('notif-dropdown');
  dropdown.classList.toggle('hidden');

  // Fermer si on clique ailleurs
  if (!dropdown.classList.contains('hidden')) {
    setTimeout(() => {
      document.addEventListener('click', closeNotifOnOutsideClick, { once: true });
    }, 100);
  }
}

function closeNotifOnOutsideClick(e) {
  const dropdown = document.getElementById('notif-dropdown');
  const btn = document.getElementById('notif-toggle');
  if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
}

function renderNotificationDropdown(notifications) {
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (!notifications.length) {
    list.innerHTML = '<div class="notif-empty">Aucune notification</div>';
    return;
  }

  list.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="markNotifRead('${n.id}')">
      <p class="notif-item-text">${escapeHtml(n.message || '')}</p>
      <p class="notif-item-time">${formatDate(n.createdAt)}</p>
    </div>
  `).join('');
}

async function markAllRead() {
  try {
    const snap = await db.collection('notifications')
      .where('userId', '==', currentUser.id)
      .where('read', '==', false)
      .get();

    const batch = db.batch();
    snap.docs.forEach(doc => batch.update(doc.ref, { read: true }));
    await batch.commit();
    showToast('Toutes les notifications marquées comme lues.', 'success');

    // Rafraîchir si on est sur la page
    if (currentPage === 'worker-notifications') await loadAllNotifications();
  } catch (err) {
    console.error('Erreur mark all read :', err);
  }
}

async function markNotifRead(notifId) {
  try {
    await db.collection('notifications').doc(notifId).update({ read: true });
  } catch (err) {
    console.error('Erreur mark read :', err);
  }
}

async function loadAllNotifications() {
  const container = document.getElementById('all-notifications-list');
  if (!container) return;
  try {
    const snap = await db.collection('notifications')
      .where('userId', '==', currentUser.id)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!notifs.length) {
      container.innerHTML = '<div class="empty-state-sm">Aucune notification</div>';
      return;
    }

    container.innerHTML = notifs.map(n => `
      <div class="notif-page-item ${n.read ? '' : 'unread'}" onclick="markNotifRead('${n.id}')">
        <div class="notif-dot ${n.read ? 'read' : ''}"></div>
        <div style="flex:1">
          <p style="font-weight:600;font-size:0.875rem;color:var(--text-primary)">${escapeHtml(n.title || '')}</p>
          <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px">${escapeHtml(n.message || '')}</p>
          <p style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">${formatDate(n.createdAt)}</p>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state-sm">Erreur de chargement</div>';
  }
}

async function createNotification(userId, title, message, type = 'info') {
  try {
    await db.collection('notifications').add({
      userId,
      title,
      message,
      type,
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Erreur création notification :', err);
  }
}

// =====================================================
// 29. MODALES
// =====================================================

function openModal(modalId) {
  document.getElementById('modal-overlay')?.classList.remove('hidden');
  document.getElementById(modalId)?.classList.remove('hidden');
  lucide.createIcons();
}

function closeModal() {
  document.getElementById('modal-overlay')?.classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function openConfirmModal(title, message, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  const btn = document.getElementById('confirm-action-btn');
  btn.onclick = onConfirm;
  openModal('modal-confirm');
}

function confirmAction() {
  // Déclenché par le bouton dans le modal confirm
  document.getElementById('confirm-action-btn').click();
}

// Fermer avec Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// =====================================================
// 30. TOAST NOTIFICATIONS
// =====================================================

function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" style="width:18px;height:18px;flex-shrink:0"></i>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// =====================================================
// 31. PARTICULES LOGIN
// =====================================================

function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  const count = 30;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (8 + Math.random() * 12) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
    p.style.opacity = (0.3 + Math.random() * 0.5).toString();
    container.appendChild(p);
  }
}

// =====================================================
// 32. UTILITAIRES
// =====================================================

/**
 * Formater une devise
 */
function formatCurrency(amount) {
  if (typeof amount !== 'number') amount = parseFloat(amount) || 0;
  return amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

/**
 * Formater une date Firebase ou JS
 */
function formatDate(ts) {
  if (!ts) return '—';
  let date;
  if (ts?.toDate) date = ts.toDate();
  else if (ts?.seconds) date = new Date(ts.seconds * 1000);
  else if (ts instanceof Date) date = ts;
  else return '—';

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Générer un mot de passe aléatoire
 */
function generateRandomPassword(length = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
  let pass = '';
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

/**
 * Obtenir les informations du badge selon le nombre de tâches
 */
function getBadgeInfo(totalTasks) {
  if (totalTasks >= BADGE_THRESHOLDS.gold) return { name: 'Gold', icon: '🥇', min: BADGE_THRESHOLDS.gold, class: 'badge-gold' };
  if (totalTasks >= BADGE_THRESHOLDS.silver) return { name: 'Silver', icon: '🥈', min: BADGE_THRESHOLDS.silver, class: 'badge-silver' };
  return { name: 'Bronze', icon: '🥉', min: BADGE_THRESHOLDS.bronze, class: 'badge-bronze' };
}

function getBadgeLabel(totalTasks) {
  return getBadgeInfo(totalTasks).name;
}

function getBadgeIcon(totalTasks) {
  return getBadgeInfo(totalTasks).icon;
}

function getNextBadge(totalTasks) {
  if (totalTasks < BADGE_THRESHOLDS.silver) return { name: 'Silver', icon: '🥈', min: BADGE_THRESHOLDS.silver };
  if (totalTasks < BADGE_THRESHOLDS.gold) return { name: 'Gold', icon: '🥇', min: BADGE_THRESHOLDS.gold };
  return null; // Niveau maximum
}

/**
 * Échapper le HTML pour éviter les injections XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Obtenir les 7 derniers jours en format YYYY-MM-DD
 */
function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

/**
 * Obtenir les labels courts des 7 derniers jours
 */
function getLast7DaysLabels() {
  const jours = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return getLast7Days().map(d => {
    const date = new Date(d + 'T12:00:00');
    return jours[date.getDay()] + ' ' + date.getDate();
  });
}

/**
 * Afficher un indicateur de chargement dans un conteneur
 */
function showLoading(containerId, colspan = 1) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const isTable = el.tagName === 'TBODY';
  if (isTable) {
    el.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-8 text-gray-400">
      <div class="spinner" style="margin:auto"></div>
    </td></tr>`;
  } else {
    el.innerHTML = '<div class="empty-state"><div class="spinner" style="margin:auto"></div></div>';
  }
}

/**
 * Vérifier si l'utilisateur actuel est admin
 */
function isAdmin() { return currentRole === 'admin'; }

/**
 * Vérifier si l'utilisateur actuel est manager
 */
function isManager() { return currentRole === 'manager'; }

/**
 * Vérifier si l'utilisateur actuel est worker
 */
function isWorker() { return currentRole === 'worker'; }

// =====================================================
// 33. GESTION DES ERREURS GLOBALES
// =====================================================

window.addEventListener('unhandledrejection', event => {
  console.error('Promesse non gérée :', event.reason);
  if (event.reason?.code === 'permission-denied') {
    showToast('Permission refusée. Contactez l\'administrateur.', 'error');
  }
});

// =====================================================
// 34. GESTION DU STATUT EN LIGNE
// =====================================================

window.addEventListener('online', () => {
  showToast('Connexion rétablie.', 'success');
});

window.addEventListener('offline', () => {
  showToast('Connexion perdue. Certaines fonctionnalités peuvent ne pas fonctionner.', 'warning');
});

// =====================================================
// 35. ENTER KEY SUPPORT SUR LE LOGIN
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
  const passwordInput = document.getElementById('login-password');
  if (passwordInput) {
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
  }
  const usernameInput = document.getElementById('login-username');
  if (usernameInput) {
    usernameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
  }
});

// =====================================================
// FIN DU FICHIER APP.JS
// HBW TASK & TRAVAIL EN LIGNE — v1.0.0
// =====================================================
