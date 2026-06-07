/* =====================================================
   HBW TASK & TRAVAIL EN LIGNE — app.js
   Version 1.1.0 | Logique complète Firebase
   ===================================================== */

// ─── FIREBASE CONFIGURATION ───────────────────────────────────────────────────
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

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const IMGBB_API_KEY = "votre_cle_imgbb_ici"; // Remplacez par votre clé ImgBB
const MIN_WITHDRAWAL = 100; // HTG minimum pour retrait
const MANAGER_COMMISSION_RATE = 0.10; // 10% commission manager

// ─── VARIABLES GLOBALES ───────────────────────────────────────────────────────
let currentUser = null;        // Données Firestore de l'utilisateur connecté
let currentFirebaseUser = null; // Objet Firebase Auth
let globalSettings = {};       // Paramètres globaux (taux de change, frais, etc.)
let allUsers = [];             // Cache liste utilisateurs (admin)
let allLogs = [];              // Cache logs
let notificationListener = null; // Listener temps réel notifications
let adminEarningsChart = null;   // Instance Chart.js admin
let managerChart = null;         // Instance Chart.js manager
let selectedWithdrawalMethod = 'MonCash'; // Méthode de retrait sélectionnée
let currentWithdrawalTab = 'pending';
let currentTaskTab = 'available';
let currentMaintenanceTab = 'list';

// ─── INITIALISATION DE LA PAGE ────────────────────────────────────────────────

/**
 * Point d'entrée principal — appelé au chargement
 */
document.addEventListener('DOMContentLoaded', () => {
  // Créer les particules de l'écran de connexion
  createParticles();
  // Initialiser les icônes Lucide
  if (window.lucide) lucide.createIcons();
  // Surveiller l'état d'authentification
  auth.onAuthStateChanged(handleAuthStateChanged);
});

/**
 * Crée les particules animées de l'écran de connexion
 */
function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      width: ${2 + Math.random() * 4}px;
      height: ${2 + Math.random() * 4}px;
      animation-duration: ${5 + Math.random() * 10}s;
      animation-delay: ${-Math.random() * 15}s;
      opacity: ${0.3 + Math.random() * 0.7};
    `;
    container.appendChild(p);
  }
}

// ─── AUTHENTIFICATION ─────────────────────────────────────────────────────────

/**
 * Gérer les changements d'état d'authentification Firebase
 */
async function handleAuthStateChanged(firebaseUser) {
  if (firebaseUser) {
    currentFirebaseUser = firebaseUser;
    try {
      // Charger les données Firestore de l'utilisateur
      const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
      if (userDoc.exists) {
        currentUser = { uid: firebaseUser.uid, ...userDoc.data() };
        // Charger les paramètres globaux
        await loadGlobalSettings();
        // Afficher l'application
        showApp();
      } else {
        // Document Firestore manquant — déconnexion
        await auth.signOut();
        showLoginError("Compte introuvable. Contactez l'administrateur.");
      }
    } catch (err) {
      console.error("Erreur chargement utilisateur:", err);
      await auth.signOut();
      showLoginError("Erreur de connexion. Réessayez.");
    }
  } else {
    currentFirebaseUser = null;
    currentUser = null;
    showLoginScreen();
  }
}

/**
 * Gérer la soumission du formulaire de connexion
 */
async function handleLogin() {
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const loginBtn = document.getElementById('login-btn');
  const loginBtnText = document.getElementById('login-btn-text');
  const loginSpinner = document.getElementById('login-spinner');

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    showLoginError('Veuillez remplir tous les champs.');
    return;
  }

  loginBtn.disabled = true;
  loginBtnText.textContent = 'Connexion...';
  loginSpinner.classList.remove('hidden');
  hideLoginError();

  // Essayer les deux domaines possibles
  const domains = ['@hbwtask.com', '@taskpam.com'];
  let lastError = null;

  for (const domain of domains) {
    try {
      await auth.signInWithEmailAndPassword(username + domain, password);
      return; // Connexion réussie, le reste est géré par onAuthStateChanged
    } catch (err) {
      lastError = err;
      // Si l'utilisateur n'existe pas du tout, on passe au domaine suivant
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        continue;
      }
      break; // autre erreur, on arrête
    }
  }

  // Aucun domaine n'a fonctionné
  let msg = 'Identifiants incorrects.';
  if (lastError?.code === 'auth/too-many-requests') msg = 'Trop de tentatives. Réessayez plus tard.';
  showLoginError(msg);
  loginBtn.disabled = false;
  loginBtnText.textContent = 'Se connecter';
  loginSpinner.classList.add('hidden');
}
/**
 * Déconnexion
 */
async function handleLogout() {
  try {
    if (notificationListener) {
      notificationListener();
      notificationListener = null;
    }
    await auth.signOut();
    // Nettoyer les charts
    if (adminEarningsChart) { adminEarningsChart.destroy(); adminEarningsChart = null; }
    if (managerChart) { managerChart.destroy(); managerChart = null; }
    showToast('Déconnexion réussie', 'info');
  } catch (err) {
    console.error("Erreur déconnexion:", err);
    showToast('Erreur lors de la déconnexion', 'error');
  }
}

// ─── AFFICHAGE ÉCRANS ─────────────────────────────────────────────────────────

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  if (window.lucide) lucide.createIcons();
}

function showLoginError(msg) {
  const banner = document.getElementById('login-error');
  const msgEl = document.getElementById('login-error-msg');
  if (banner && msgEl) {
    msgEl.textContent = msg;
    banner.classList.remove('hidden');
  }
}

function hideLoginError() {
  const banner = document.getElementById('login-error');
  if (banner) banner.classList.add('hidden');
}

/**
 * Afficher l'application principale après connexion réussie
 */
function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Construire la sidebar selon le rôle
  buildSidebar();

  // Mettre à jour les infos utilisateur dans la sidebar
  updateSidebarUser();

  // Afficher la balance dans la topbar si worker
  if (currentUser.role === 'worker') {
    const balanceEl = document.getElementById('topbar-balance');
    if (balanceEl) balanceEl.classList.remove('hidden');
    updateTopbarBalance();
  }

  // Démarrer le listener de notifications
  startNotificationListener();

  // Naviguer vers le dashboard par défaut
  const defaultPage = `${currentUser.role}-dashboard`;
  showPage(defaultPage);

  if (window.lucide) lucide.createIcons();
}

// ─── SIDEBAR & NAVIGATION ─────────────────────────────────────────────────────

/**
 * Construire la sidebar selon le rôle de l'utilisateur
 */
function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  const role = currentUser.role;
  let navHTML = '';

  if (role === 'admin') {
    navHTML = `
      <span class="nav-section-label">Administration</span>
      <button class="nav-item" onclick="showPage('admin-dashboard')" data-page="admin-dashboard">
        <i data-lucide="layout-dashboard" class="w-5 h-5"></i><span>Tableau de bord</span>
      </button>
      <button class="nav-item" onclick="showPage('admin-users')" data-page="admin-users">
        <i data-lucide="users" class="w-5 h-5"></i><span>Utilisateurs</span>
      </button>
      <button class="nav-item" onclick="showPage('admin-teams')" data-page="admin-teams">
        <i data-lucide="layers" class="w-5 h-5"></i><span>Équipes</span>
      </button>
      <button class="nav-item" onclick="showPage('admin-tasks')" data-page="admin-tasks">
        <i data-lucide="briefcase" class="w-5 h-5"></i><span>Tâches Agency</span>
      </button>
      <button class="nav-item" onclick="showPage('admin-maintenance')" data-page="admin-maintenance">
        <i data-lucide="alert-triangle" class="w-5 h-5"></i><span>Maintenance</span>
      </button>
      <button class="nav-item" onclick="showPage('admin-withdrawals')" data-page="admin-withdrawals">
        <i data-lucide="arrow-down-circle" class="w-5 h-5"></i><span>Retraits</span>
      </button>
      <button class="nav-item" onclick="showPage('admin-logs')" data-page="admin-logs">
        <i data-lucide="file-text" class="w-5 h-5"></i><span>Logs</span>
      </button>
      <button class="nav-item" onclick="showPage('admin-settings')" data-page="admin-settings">
        <i data-lucide="settings" class="w-5 h-5"></i><span>Paramètres</span>
      </button>
    `;
  } else if (role === 'manager') {
    navHTML = `
      <span class="nav-section-label">Manager</span>
      <button class="nav-item" onclick="showPage('manager-dashboard')" data-page="manager-dashboard">
        <i data-lucide="layout-dashboard" class="w-5 h-5"></i><span>Tableau de bord</span>
      </button>
      <button class="nav-item" onclick="showPage('manager-members')" data-page="manager-members">
        <i data-lucide="users" class="w-5 h-5"></i><span>Mon Équipe</span>
      </button>
      <button class="nav-item" onclick="showPage('manager-messages')" data-page="manager-messages">
        <i data-lucide="message-square" class="w-5 h-5"></i><span>Messagerie</span>
      </button>
      <button class="nav-item" onclick="showPage('manager-stats')" data-page="manager-stats">
        <i data-lucide="bar-chart-2" class="w-5 h-5"></i><span>Statistiques</span>
      </button>
    `;
  } else if (role === 'worker') {
    navHTML = `
      <span class="nav-section-label">Espace Worker</span>
      <button class="nav-item" onclick="showPage('worker-dashboard')" data-page="worker-dashboard">
        <i data-lucide="layout-dashboard" class="w-5 h-5"></i><span>Tableau de bord</span>
      </button>
      <button class="nav-item" onclick="showPage('worker-offerwalls')" data-page="worker-offerwalls">
        <i data-lucide="grid" class="w-5 h-5"></i><span>Offerwalls</span>
      </button>
      <button class="nav-item" onclick="showPage('worker-tasks')" data-page="worker-tasks">
        <i data-lucide="briefcase" class="w-5 h-5"></i><span>Tâches Agency</span>
      </button>
      <button class="nav-item" onclick="showPage('worker-history')" data-page="worker-history">
        <i data-lucide="history" class="w-5 h-5"></i><span>Historique</span>
      </button>
      <button class="nav-item" onclick="showPage('worker-withdrawal')" data-page="worker-withdrawal">
        <i data-lucide="arrow-up-circle" class="w-5 h-5"></i><span>Retrait</span>
      </button>
      <button class="nav-item" onclick="showPage('worker-notifications')" data-page="worker-notifications">
        <i data-lucide="bell" class="w-5 h-5"></i><span>Notifications</span>
      </button>
    `;
  }

  nav.innerHTML = navHTML;
  if (window.lucide) lucide.createIcons();
}

/**
 * Mettre à jour les infos utilisateur dans la sidebar
 */
function updateSidebarUser() {
  const avatarEl = document.getElementById('sidebar-avatar');
  const usernameEl = document.getElementById('sidebar-username');
  const roleBadgeEl = document.getElementById('sidebar-role-badge');

  if (!currentUser) return;

  const displayName = currentUser.displayName || currentUser.username || 'Utilisateur';
  if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
  if (usernameEl) usernameEl.textContent = displayName;

  if (roleBadgeEl) {
    const roleLabels = { admin: 'Admin', manager: 'Manager', worker: 'Worker' };
    const roleClasses = { admin: 'badge-admin', manager: 'badge-manager', worker: 'badge-worker' };
    roleBadgeEl.textContent = roleLabels[currentUser.role] || currentUser.role;
    roleBadgeEl.className = `user-badge badge ${roleClasses[currentUser.role] || 'badge-gray'}`;
  }
}

/**
 * Afficher une page spécifique
 */
function showPage(pageId) {
  // Masquer toutes les pages
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));

  // Afficher la page demandée
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) {
    targetPage.classList.remove('hidden');
  } else {
    console.warn(`Page introuvable: page-${pageId}`);
    return;
  }

  // Mettre à jour le titre de la topbar
  updatePageTitle(pageId);

  // Mettre à jour l'état actif dans la sidebar
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-page') === pageId);
  });

  // Fermer la sidebar sur mobile
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open') && window.innerWidth <= 1024) {
    toggleSidebar();
  }

  // Charger le contenu de la page
  loadPageContent(pageId);
}

/**
 * Mettre à jour le titre de la topbar
 */
function updatePageTitle(pageId) {
  const titles = {
    'admin-dashboard': 'Tableau de bord',
    'admin-users': 'Utilisateurs',
    'admin-teams': 'Équipes',
    'admin-tasks': 'Tâches Agency',
    'admin-maintenance': 'Maintenance',
    'admin-withdrawals': 'Retraits',
    'admin-logs': 'Journaux d\'activité',
    'admin-settings': 'Paramètres',
    'manager-dashboard': 'Tableau de bord',
    'manager-members': 'Mon Équipe',
    'manager-messages': 'Messagerie',
    'manager-stats': 'Statistiques',
    'worker-dashboard': 'Tableau de bord',
    'worker-offerwalls': 'Offerwalls',
    'worker-tasks': 'Tâches Agency',
    'worker-history': 'Historique',
    'worker-withdrawal': 'Retrait',
    'worker-notifications': 'Notifications',
    'worker-maintenance': 'Maintenance'
  };

  const pageTitleEl = document.getElementById('page-title');
  const breadcrumbEl = document.getElementById('page-breadcrumb');
  if (pageTitleEl) pageTitleEl.textContent = titles[pageId] || 'HBW Task';
  if (breadcrumbEl) breadcrumbEl.textContent = `HBW Task › ${titles[pageId] || ''}`;
}

/**
 * Charger le contenu d'une page selon son identifiant
 */
function loadPageContent(pageId) {
  switch (pageId) {
    case 'admin-dashboard': renderAdminDashboard(); break;
    case 'admin-users': loadAdminUsers(); break;
    case 'admin-teams': loadAdminTeams(); break;
    case 'admin-tasks': loadAdminTasks(); break;
    case 'admin-maintenance': loadAdminMaintenance(); break;
    case 'admin-withdrawals': loadAdminWithdrawals(); break;
    case 'admin-logs': loadAdminLogs(); break;
    case 'admin-settings': loadAdminSettings(); break;
    case 'manager-dashboard': renderManagerDashboard(); break;
    case 'manager-members': loadManagerMembers(); break;
    case 'manager-messages': loadManagerMessages(); break;
    case 'manager-stats': loadManagerStats(); break;
    case 'worker-dashboard': renderWorkerDashboard(); break;
    case 'worker-offerwalls': /* Statique */ break;
    case 'worker-tasks': loadWorkerTasks(); break;
    case 'worker-history': loadWorkerHistory(); break;
    case 'worker-withdrawal': loadWorkerWithdrawal(); break;
    case 'worker-notifications': loadWorkerNotifications(); break;
    case 'worker-maintenance': loadMaintenancePage(); break;
  }
}

/**
 * Toggle la sidebar (mobile)
 */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains('open');
  sidebar.classList.toggle('open', !isOpen);
  if (overlay) overlay.classList.toggle('hidden', isOpen);
}

/**
 * Toggle le thème clair/sombre
 */
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') !== 'light';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  const themeIcon = document.getElementById('theme-icon');
  if (themeIcon) {
    themeIcon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    if (window.lucide) lucide.createIcons();
  }
  // Mettre à jour le label
  const themeBtn = document.querySelector('.sidebar-footer-btn[onclick="toggleTheme()"] span');
  if (themeBtn) themeBtn.textContent = isDark ? 'Mode clair' : 'Mode sombre';
}

/**
 * Toggle affichage mot de passe
 */
function togglePassword() {
  const input = document.getElementById('login-password');
  const icon = document.getElementById('eye-icon');
  if (!input || !icon) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  icon.setAttribute('data-lucide', isPass ? 'eye-off' : 'eye');
  if (window.lucide) lucide.createIcons();
}

// ─── PARAMÈTRES GLOBAUX ───────────────────────────────────────────────────────

/**
 * Charger les paramètres globaux depuis Firestore
 */
async function loadGlobalSettings() {
  try {
    const settingsDoc = await db.collection('settings').doc('global').get();
    if (settingsDoc.exists) {
      globalSettings = settingsDoc.data();
    } else {
      // Créer les paramètres par défaut
      globalSettings = { exchangeRate: 130, maintenanceFee: 250, moncashNumber: '', natcashNumber: '' };
      await db.collection('settings').doc('global').set(globalSettings);
    }
  } catch (err) {
    console.error("Erreur chargement settings:", err);
    globalSettings = { exchangeRate: 130, maintenanceFee: 250, moncashNumber: '', natcashNumber: '' };
  }
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────

/**
 * Rendre le tableau de bord admin avec statistiques
 */
async function renderAdminDashboard() {
  try {
    const usersSnap = await db.collection('users').get();
    const users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));

    const workers = users.filter(u => u.role === 'worker');
    const managers = users.filter(u => u.role === 'manager');
    const totalBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);
    const maintenanceCount = workers.filter(u => u.maintenance).length;

    // Retraits en attente
    const withdrawalsSnap = await db.collection('withdrawals').where('status', '==', 'pending').get();
    const pendingWithdrawals = withdrawalsSnap.size;

    // Mettre à jour les stats
    setText('stat-total-users', users.length);
    setText('stat-active-workers', workers.filter(u => !u.maintenance).length);
    setText('stat-managers', managers.length);
    setText('stat-total-balance', formatCurrency(totalBalance));
    setText('stat-usd-equiv', `≈ ${(totalBalance / (globalSettings.exchangeRate || 130)).toFixed(2)} USD`);
    setText('stat-pending-withdrawals', pendingWithdrawals);
    setText('stat-maintenance', maintenanceCount);

    // Listes du dashboard
    renderPendingWithdrawalsWidget(withdrawalsSnap.docs.slice(0, 5));
    renderTopWorkersWidget(workers);
    renderMaintenanceWorkersWidget(workers.filter(u => u.maintenance));

    // Graphique
    renderAdminEarningsChart();

  } catch (err) {
    console.error("Erreur dashboard admin:", err);
    showToast('Erreur lors du chargement du dashboard', 'error');
  }
}

function renderPendingWithdrawalsWidget(docs) {
  const el = document.getElementById('pending-withdrawals-list');
  if (!el) return;
  if (!docs.length) { el.innerHTML = '<div class="empty-state-sm">Aucun retrait en attente</div>'; return; }
  el.innerHTML = docs.map(d => {
    const data = d.data();
    return `<div class="mini-item">
      <div class="mini-avatar">${(data.username || '?').charAt(0).toUpperCase()}</div>
      <div class="mini-info">
        <p class="mini-name">${escapeHtml(data.username || 'Inconnu')}</p>
        <p class="mini-sub">${data.method || 'MonCash'} · ${formatDate(data.createdAt)}</p>
      </div>
      <span class="mini-amount yellow">${formatCurrency(data.amount)}</span>
    </div>`;
  }).join('');
}

function renderTopWorkersWidget(workers) {
  const el = document.getElementById('top-workers-list');
  if (!el) return;
  const sorted = [...workers].sort((a, b) => (b.totalEarnings || 0) - (a.totalEarnings || 0)).slice(0, 10);
  if (!sorted.length) { el.innerHTML = '<div class="empty-state-sm">Aucun worker</div>'; return; }
  el.innerHTML = sorted.map((w, i) => `
    <div class="mini-item">
      <div class="mini-avatar" style="background: linear-gradient(135deg,#f59e0b,#ef4444)">${i + 1}</div>
      <div class="mini-info">
        <p class="mini-name">${escapeHtml(w.displayName || w.username)}</p>
        <p class="mini-sub">${w.completedTasks || 0} tâches</p>
      </div>
      <span class="mini-amount green">${formatCurrency(w.totalEarnings || 0)}</span>
    </div>
  `).join('');
}

function renderMaintenanceWorkersWidget(workers) {
  const el = document.getElementById('maintenance-workers-list');
  if (!el) return;
  if (!workers.length) { el.innerHTML = '<div class="empty-state-sm">Aucun worker en maintenance</div>'; return; }
  el.innerHTML = workers.map(w => `
    <div class="mini-item">
      <div class="mini-avatar" style="background: linear-gradient(135deg,#dc2626,#f97316)">${(w.username || '?').charAt(0).toUpperCase()}</div>
      <div class="mini-info">
        <p class="mini-name">${escapeHtml(w.displayName || w.username)}</p>
        <p class="mini-sub">Maintenance active</p>
      </div>
      <span class="mini-amount red">${formatCurrency(w.maintenanceAmount || 0)}</span>
    </div>
  `).join('');
}

async function renderAdminEarningsChart() {
  const canvas = document.getElementById('admin-earnings-chart');
  if (!canvas) return;

  // Détruire l'instance précédente
  if (adminEarningsChart) { adminEarningsChart.destroy(); adminEarningsChart = null; }

  const labels = [];
  const data = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));
    // Calculer les gains de ce jour
    const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
    try {
      const snap = await db.collection('transactions')
        .where('type', '==', 'earning')
        .where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(dayStart))
        .where('createdAt', '<=', firebase.firestore.Timestamp.fromDate(dayEnd))
        .get();
      const total = snap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
      data.push(total);
    } catch {
      data.push(0);
    }
  }

  adminEarningsChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Gains (HTG)',
        data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#3b82f6',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 11 } } }
      }
    }
  });
}

// ─── ADMIN UTILISATEURS ───────────────────────────────────────────────────────

async function loadAdminUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">Chargement...</td></tr>';

  try {
    const [usersSnap, teamsSnap] = await Promise.all([
      db.collection('users').orderBy('createdAt', 'desc').get(),
      db.collection('teams').get()
    ]);

    const teamsMap = {};
    teamsSnap.docs.forEach(d => { teamsMap[d.id] = d.data().name; });

    allUsers = usersSnap.docs.map(d => ({ uid: d.id, ...d.data(), teamName: teamsMap[d.data().teamId] || '—' }));

    // Remplir le filtre équipe
    const teamFilter = document.getElementById('users-team-filter');
    if (teamFilter) {
      const existing = Array.from(teamFilter.options).map(o => o.value);
      teamsSnap.docs.forEach(d => {
        if (!existing.includes(d.id)) {
          const opt = document.createElement('option');
          opt.value = d.id;
          opt.textContent = d.data().name;
          teamFilter.appendChild(opt);
        }
      });
    }

    renderUsersTable(allUsers);
  } catch (err) {
    console.error("Erreur chargement users:", err);
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-400">Erreur de chargement</td></tr>';
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">Aucun utilisateur trouvé</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => {
    const roleClass = { admin: 'badge-admin', manager: 'badge-manager', worker: 'badge-worker' }[u.role] || 'badge-gray';
    const statusBadge = u.active !== false
      ? '<span class="badge badge-green">Actif</span>'
      : '<span class="badge badge-red">Inactif</span>';
    const maintenanceBadge = u.maintenance
      ? `<span class="badge badge-yellow">Oui (${formatCurrency(u.maintenanceAmount || 0)})</span>`
      : '<span class="badge badge-gray">Non</span>';

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="mini-avatar" style="width:32px;height:32px;font-size:0.75rem">${(u.username || '?').charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-weight:600;color:var(--text-primary)">${escapeHtml(u.displayName || u.username || '—')}</div>
            <div style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml(u.username || '')}</div>
          </div>
        </div>
      </td>
      <td><span class="badge ${roleClass}">${u.role}</span></td>
      <td>${escapeHtml(u.teamName || '—')}</td>
      <td style="font-weight:700;color:var(--text-primary)">${formatCurrency(u.balance || 0)}</td>
      <td>${u.completedTasks || 0}</td>
      <td>${statusBadge}</td>
      <td>${maintenanceBadge}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn-sm blue" onclick="showUserDetail('${u.uid}')">
            <i data-lucide="eye" class="w-3 h-3"></i> Voir
          </button>
          ${u.role === 'worker' ? `
          <button class="btn-sm ${u.maintenance ? 'gray' : 'yellow'}" onclick="${u.maintenance ? `removeMaintenance('${u.uid}')` : `showAddMaintenanceForUser('${u.uid}')`}">
            <i data-lucide="${u.maintenance ? 'check' : 'alert-triangle'}" class="w-3 h-3"></i>
            ${u.maintenance ? 'Lever' : 'Maint.'}
          </button>` : ''}
          <button class="btn-sm ${u.active !== false ? 'red' : 'green'}" onclick="toggleUserActive('${u.uid}', ${u.active !== false})">
            <i data-lucide="${u.active !== false ? 'user-x' : 'user-check'}" class="w-3 h-3"></i>
            ${u.active !== false ? 'Désact.' : 'Activer'}
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function filterUsers() {
  const searchVal = (document.getElementById('users-search')?.value || '').toLowerCase();
  const roleVal = document.getElementById('users-role-filter')?.value || '';
  const teamVal = document.getElementById('users-team-filter')?.value || '';

  const filtered = allUsers.filter(u => {
    const matchSearch = !searchVal ||
      (u.username || '').toLowerCase().includes(searchVal) ||
      (u.displayName || '').toLowerCase().includes(searchVal) ||
      (u.email || '').toLowerCase().includes(searchVal);
    const matchRole = !roleVal || u.role === roleVal;
    const matchTeam = !teamVal || u.teamId === teamVal;
    return matchSearch && matchRole && matchTeam;
  });

  renderUsersTable(filtered);
}

async function showUserDetail(uid) {
  const modal = document.getElementById('modal-user-detail');
  const body = document.getElementById('modal-user-detail-body');
  if (!modal || !body) return;

  body.innerHTML = '<div class="text-center py-8 text-gray-400">Chargement...</div>';
  openModal('modal-user-detail');

  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) { body.innerHTML = '<p class="text-red-400">Utilisateur introuvable</p>'; return; }
    const u = { uid, ...userDoc.data() };

    // Charger transactions récentes
    const txSnap = await db.collection('transactions').where('userId', '==', uid)
      .orderBy('createdAt', 'desc').limit(5).get();
    const txList = txSnap.docs.map(d => d.data());

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
          <div class="info-item" style="flex-direction:column;align-items:start;gap:2px;border:1px solid var(--border);border-radius:8px;padding:0.75rem">
            <span class="info-key">Nom complet</span>
            <span class="info-val">${escapeHtml(u.displayName || '—')}</span>
          </div>
          <div class="info-item" style="flex-direction:column;align-items:start;gap:2px;border:1px solid var(--border);border-radius:8px;padding:0.75rem">
            <span class="info-key">Username</span>
            <span class="info-val" style="font-family:monospace">${escapeHtml(u.username || '—')}</span>
          </div>
          <div class="info-item" style="flex-direction:column;align-items:start;gap:2px;border:1px solid var(--border);border-radius:8px;padding:0.75rem">
            <span class="info-key">Email</span>
            <span class="info-val" style="font-size:0.8rem">${escapeHtml(u.email || '—')}</span>
          </div>
          <div class="info-item" style="flex-direction:column;align-items:start;gap:2px;border:1px solid var(--border);border-radius:8px;padding:0.75rem">
            <span class="info-key">Solde</span>
            <span class="info-val" style="color:var(--success-light)">${formatCurrency(u.balance || 0)}</span>
          </div>
          <div class="info-item" style="flex-direction:column;align-items:start;gap:2px;border:1px solid var(--border);border-radius:8px;padding:0.75rem">
            <span class="info-key">Tâches complétées</span>
            <span class="info-val">${u.completedTasks || 0}</span>
          </div>
          <div class="info-item" style="flex-direction:column;align-items:start;gap:2px;border:1px solid var(--border);border-radius:8px;padding:0.75rem">
            <span class="info-key">Gains totaux</span>
            <span class="info-val" style="color:var(--success-light)">${formatCurrency(u.totalEarnings || 0)}</span>
          </div>
          <div class="info-item" style="flex-direction:column;align-items:start;gap:2px;border:1px solid var(--border);border-radius:8px;padding:0.75rem">
            <span class="info-key">Téléphone</span>
            <span class="info-val">${escapeHtml(u.phone || '—')}</span>
          </div>
          <div class="info-item" style="flex-direction:column;align-items:start;gap:2px;border:1px solid var(--border);border-radius:8px;padding:0.75rem">
            <span class="info-key">Maintenance</span>
            <span class="info-val">${u.maintenance ? `<span class="badge badge-yellow">Oui — ${formatCurrency(u.maintenanceAmount || 0)}</span>` : '<span class="badge badge-green">Non</span>'}</span>
          </div>
        </div>

        <div>
          <h4 style="font-weight:700;font-size:0.875rem;color:var(--text-secondary);margin-bottom:0.5rem">Dernières transactions</h4>
          ${txList.length ? txList.map(tx => `
            <div class="mini-item">
              <div class="mini-info">
                <p class="mini-name">${escapeHtml(tx.description || tx.type)}</p>
                <p class="mini-sub">${formatDate(tx.createdAt)}</p>
              </div>
              <span class="mini-amount ${tx.amount >= 0 ? 'green' : 'red'}">${tx.amount >= 0 ? '+' : ''}${formatCurrency(tx.amount)}</span>
            </div>
          `).join('') : '<div class="empty-state-sm">Aucune transaction</div>'}
        </div>

        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn-sm ${u.active !== false ? 'red' : 'green'}" onclick="toggleUserActive('${uid}', ${u.active !== false});closeModal()">
            ${u.active !== false ? 'Désactiver le compte' : 'Activer le compte'}
          </button>
          ${u.role === 'worker' && !u.maintenance ? `
          <button class="btn-sm yellow" onclick="closeModal();showAddMaintenanceForUser('${uid}')">Activer maintenance</button>
          ` : ''}
          ${u.role === 'worker' && u.maintenance ? `
          <button class="btn-sm green" onclick="removeMaintenance('${uid}');closeModal()">Lever la maintenance</button>
          ` : ''}
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Erreur détail user:", err);
    body.innerHTML = '<p class="text-red-400">Erreur lors du chargement</p>';
  }
}

async function toggleUserActive(uid, isCurrentlyActive) {
  try {
    await db.collection('users').doc(uid).update({ active: !isCurrentlyActive });
    await addLog('user', `Compte ${isCurrentlyActive ? 'désactivé' : 'activé'}`, currentUser.username, { targetUid: uid });
    showToast(`Compte ${isCurrentlyActive ? 'désactivé' : 'activé'}`, 'success');
    loadAdminUsers();
  } catch (err) {
    console.error("Erreur toggle user active:", err);
    showToast('Erreur lors de la modification', 'error');
  }
}

// ─── ADMIN ÉQUIPES ────────────────────────────────────────────────────────────

async function loadAdminTeams() {
  const grid = document.getElementById('teams-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="empty-state">Chargement des équipes...</div>';

  try {
    const [teamsSnap, usersSnap] = await Promise.all([
      db.collection('teams').get(),
      db.collection('users').get()
    ]);

    const usersData = {};
    usersSnap.docs.forEach(d => { usersData[d.id] = d.data(); });

    if (teamsSnap.empty) {
      grid.innerHTML = '<div class="empty-state">Aucune équipe créée. Cliquez sur "Nouvelle équipe".</div>';
      return;
    }

    grid.innerHTML = teamsSnap.docs.map(d => {
      const team = { id: d.id, ...d.data() };
      const members = Object.values(usersData).filter(u => u.teamId === team.id && u.role === 'worker');
      const managerUser = team.managerId ? usersData[team.managerId] : null;
      const teamBalance = members.reduce((sum, m) => sum + (m.balance || 0), 0);

      return `<div class="team-card">
        <div class="team-card-header">
          <div class="team-icon">${(team.name || 'T').charAt(0).toUpperCase()}</div>
          <div>
            <div class="team-name">${escapeHtml(team.name || '—')}</div>
            <div class="team-manager-name">Manager : ${managerUser ? escapeHtml(managerUser.displayName || managerUser.username) : 'Non assigné'}</div>
          </div>
        </div>
        <div class="team-stats">
          <div class="team-stat">
            <div class="team-stat-val">${members.length}</div>
            <div class="team-stat-lbl">Membres</div>
          </div>
          <div class="team-stat">
            <div class="team-stat-val" style="color:var(--success-light);font-size:0.9rem">${formatCurrency(teamBalance)}</div>
            <div class="team-stat-lbl">Solde équipe</div>
          </div>
        </div>
        <div class="team-actions">
          <button class="btn-sm blue" onclick="showEditTeamModal('${team.id}','${escapeHtml(team.name || '')}','${team.managerId || ''}')">
            <i data-lucide="edit" class="w-3 h-3"></i> Modifier
          </button>
          <button class="btn-sm red" onclick="confirmDeleteTeam('${team.id}','${escapeHtml(team.name || '')}')">
            <i data-lucide="trash-2" class="w-3 h-3"></i> Supprimer
          </button>
        </div>
      </div>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Erreur chargement teams:", err);
    grid.innerHTML = '<div class="empty-state">Erreur de chargement</div>';
  }
}

async function showCreateTeamModal() {
  document.getElementById('modal-team-title').textContent = 'Nouvelle équipe';
  document.getElementById('team-modal-id').value = '';
  document.getElementById('team-name-input').value = '';

  // Charger les managers
  const managersSnap = await db.collection('users').where('role', '==', 'manager').get();
  const select = document.getElementById('team-manager-select');
  select.innerHTML = '<option value="">Sélectionner un manager</option>';
  managersSnap.docs.forEach(d => {
    const u = d.data();
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = u.displayName || u.username;
    select.appendChild(opt);
  });

  openModal('modal-team');
}

async function showEditTeamModal(teamId, teamName, managerId) {
  document.getElementById('modal-team-title').textContent = 'Modifier l\'équipe';
  document.getElementById('team-modal-id').value = teamId;
  document.getElementById('team-name-input').value = teamName;

  const managersSnap = await db.collection('users').where('role', '==', 'manager').get();
  const select = document.getElementById('team-manager-select');
  select.innerHTML = '<option value="">Sélectionner un manager</option>';
  managersSnap.docs.forEach(d => {
    const u = d.data();
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = u.displayName || u.username;
    opt.selected = d.id === managerId;
    select.appendChild(opt);
  });

  openModal('modal-team');
}

async function saveTeam() {
  const teamId = document.getElementById('team-modal-id').value;
  const name = document.getElementById('team-name-input').value.trim();
  const managerId = document.getElementById('team-manager-select').value;

  if (!name) { showToast('Veuillez entrer un nom d\'équipe', 'warning'); return; }

  try {
    if (teamId) {
      // Modification
      await db.collection('teams').doc(teamId).update({ name, managerId: managerId || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      // Mettre à jour le teamId du manager
      if (managerId) {
        await db.collection('users').doc(managerId).update({ teamId });
      }
      showToast('Équipe modifiée', 'success');
    } else {
      // Création
      const teamRef = await db.collection('teams').add({
        name,
        managerId: managerId || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if (managerId) {
        await db.collection('users').doc(managerId).update({ teamId: teamRef.id });
      }
      showToast('Équipe créée', 'success');
    }
    closeModal();
    loadAdminTeams();
  } catch (err) {
    console.error("Erreur sauvegarde équipe:", err);
    showToast('Erreur lors de la sauvegarde', 'error');
  }
}

function confirmDeleteTeam(teamId, teamName) {
  showConfirmModal(
    'Supprimer l\'équipe',
    `Êtes-vous sûr de vouloir supprimer l'équipe "${teamName}" ? Cette action est irréversible.`,
    async () => {
      try {
        await db.collection('teams').doc(teamId).delete();
        // Retirer le teamId des membres
        const membersSnap = await db.collection('users').where('teamId', '==', teamId).get();
        const batch = db.batch();
        membersSnap.docs.forEach(d => batch.update(d.ref, { teamId: null }));
        await batch.commit();
        showToast('Équipe supprimée', 'success');
        loadAdminTeams();
      } catch (err) {
        showToast('Erreur lors de la suppression', 'error');
      }
    }
  );
}

// ─── ADMIN TÂCHES ─────────────────────────────────────────────────────────────

async function loadAdminTasks() {
  await switchTaskTab(currentTaskTab);
}

async function switchTaskTab(tab) {
  currentTaskTab = tab;
  ['available', 'pending', 'completed'].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
  });

  const tbody = document.getElementById('admin-tasks-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Chargement...</td></tr>';

  try {
    let query = db.collection('tasks').orderBy('createdAt', 'desc');
    if (tab === 'available') query = query.where('status', '==', 'available');
    else if (tab === 'pending') query = query.where('status', '==', 'pending');
    else if (tab === 'completed') query = query.where('status', 'in', ['validated', 'rejected']);

    const snap = await query.get();
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucune tâche</td></tr>';
      return;
    }

    tbody.innerHTML = snap.docs.map(d => {
      const t = { id: d.id, ...d.data() };
      const statusBadge = {
        available: '<span class="badge badge-blue">Disponible</span>',
        pending: '<span class="badge badge-yellow">En attente</span>',
        validated: '<span class="badge badge-green">Validée</span>',
        rejected: '<span class="badge badge-red">Rejetée</span>'
      }[t.status] || `<span class="badge badge-gray">${t.status}</span>`;

      return `<tr>
        <td style="font-weight:600;color:var(--text-primary)">${escapeHtml(t.title || '—')}</td>
        <td><span class="badge badge-blue">Agency</span></td>
        <td style="color:var(--success-light);font-weight:700">${formatCurrency(t.reward || 0)}</td>
        <td>${escapeHtml(t.workerUsername || '—')}</td>
        <td>${statusBadge}</td>
        <td style="font-size:0.8rem;color:var(--text-muted)">${formatDate(t.createdAt)}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${t.status === 'pending' ? `
            <button class="btn-sm green" onclick="validateTask('${t.id}')">
              <i data-lucide="check" class="w-3 h-3"></i> Valider
            </button>
            <button class="btn-sm red" onclick="rejectTask('${t.id}')">
              <i data-lucide="x" class="w-3 h-3"></i> Rejeter
            </button>
            ${t.proofUrl ? `<a href="${t.proofUrl}" target="_blank" class="btn-sm blue"><i data-lucide="external-link" class="w-3 h-3"></i> Preuve</a>` : ''}
            ` : ''}
            ${t.status === 'available' ? `
            <button class="btn-sm red" onclick="deleteTask('${t.id}')">
              <i data-lucide="trash-2" class="w-3 h-3"></i> Supprimer
            </button>
            ` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Erreur chargement tâches:", err);
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">Erreur de chargement</td></tr>';
  }
}

function showCreateTaskModal() {
  document.getElementById('task-title-input').value = '';
  document.getElementById('task-desc-input').value = '';
  document.getElementById('task-reward-input').value = '';
  openModal('modal-task');
}

async function createTask() {
  const title = document.getElementById('task-title-input').value.trim();
  const description = document.getElementById('task-desc-input').value.trim();
  const reward = parseFloat(document.getElementById('task-reward-input').value);

  if (!title || !description || isNaN(reward) || reward <= 0) {
    showToast('Veuillez remplir tous les champs correctement', 'warning');
    return;
  }

  try {
    await db.collection('tasks').add({
      title,
      description,
      reward,
      type: 'agency',
      status: 'available',
      createdBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await addLog('task', `Tâche créée : ${title}`, currentUser.username);
    showToast('Tâche créée avec succès', 'success');
    closeModal();
    loadAdminTasks();
  } catch (err) {
    console.error("Erreur création tâche:", err);
    showToast('Erreur lors de la création', 'error');
  }
}

/**
 * Valider une tâche — crédite le worker + commission au manager (10%)
 */
async function validateTask(taskId) {
  try {
    const taskDoc = await db.collection('tasks').doc(taskId).get();
    if (!taskDoc.exists) { showToast('Tâche introuvable', 'error'); return; }
    const task = taskDoc.data();
    const reward = task.reward || 0;
    const workerId = task.workerId;

    if (!workerId) { showToast('Worker non trouvé', 'error'); return; }

    const batch = db.batch();

    // 1. Mettre à jour la tâche
    batch.update(db.collection('tasks').doc(taskId), {
      status: 'validated',
      validatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      validatedBy: currentUser.uid
    });

    // 2. Créditer le worker
    const workerRef = db.collection('users').doc(workerId);
    const workerDoc = await workerRef.get();
    const workerData = workerDoc.data();
    batch.update(workerRef, {
      balance: firebase.firestore.FieldValue.increment(reward),
      totalEarnings: firebase.firestore.FieldValue.increment(reward),
      completedTasks: firebase.firestore.FieldValue.increment(1)
    });

    // 3. Transaction pour le worker
    const txRef = db.collection('transactions').doc();
    batch.set(txRef, {
      userId: workerId,
      username: workerData.username || '',
      type: 'earning',
      amount: reward,
      description: `Tâche validée : ${task.title}`,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 4. Notification pour le worker
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      userId: workerId,
      title: 'Tâche validée !',
      message: `Votre tâche "${task.title}" a été validée. +${formatCurrency(reward)} crédité.`,
      type: 'success',
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    // 5. Commission manager (10%) — séparément car besoin du teamId du worker
    if (workerData.teamId) {
      const teamDoc = await db.collection('teams').doc(workerData.teamId).get();
      if (teamDoc.exists && teamDoc.data().managerId) {
        const managerId = teamDoc.data().managerId;
        const commission = Math.round(reward * MANAGER_COMMISSION_RATE * 100) / 100;
        const commissionBatch = db.batch();

        commissionBatch.update(db.collection('users').doc(managerId), {
          balance: firebase.firestore.FieldValue.increment(commission),
          totalEarnings: firebase.firestore.FieldValue.increment(commission)
        });

        const commTxRef = db.collection('transactions').doc();
        commissionBatch.set(commTxRef, {
          userId: managerId,
          type: 'commission',
          amount: commission,
          description: `Commission 10% — tâche de ${workerData.username || 'worker'} : ${task.title}`,
          relatedTaskId: taskId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        const commNotifRef = db.collection('notifications').doc();
        commissionBatch.set(commNotifRef, {
          userId: managerId,
          title: 'Commission reçue',
          message: `Commission 10% : +${formatCurrency(commission)} pour la tâche de ${workerData.username || 'votre équipe'}.`,
          type: 'success',
          read: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await commissionBatch.commit();
      }
    }

    await addLog('task', `Tâche validée : ${task.title} (+${formatCurrency(reward)} pour ${task.workerUsername || workerId})`, currentUser.username);
    showToast('Tâche validée et worker crédité', 'success');
    loadAdminTasks();
  } catch (err) {
    console.error("Erreur validation tâche:", err);
    showToast('Erreur lors de la validation', 'error');
  }
}

async function rejectTask(taskId) {
  try {
    const taskDoc = await db.collection('tasks').doc(taskId).get();
    const task = taskDoc.data();

    await db.collection('tasks').doc(taskId).update({
      status: 'rejected',
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectedBy: currentUser.uid
    });

    // Notification au worker
    if (task.workerId) {
      await db.collection('notifications').add({
        userId: task.workerId,
        title: 'Tâche rejetée',
        message: `Votre tâche "${task.title}" a été rejetée. Contactez votre manager pour plus d'informations.`,
        type: 'error',
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Remettre la tâche disponible
      await db.collection('tasks').doc(taskId).update({ status: 'available', workerId: null, workerUsername: null, proofUrl: null });
    }

    await addLog('task', `Tâche rejetée : ${task.title}`, currentUser.username);
    showToast('Tâche rejetée', 'warning');
    loadAdminTasks();
  } catch (err) {
    console.error("Erreur rejet tâche:", err);
    showToast('Erreur lors du rejet', 'error');
  }
}

async function deleteTask(taskId) {
  showConfirmModal('Supprimer la tâche', 'Êtes-vous sûr de vouloir supprimer cette tâche ?', async () => {
    try {
      await db.collection('tasks').doc(taskId).delete();
      showToast('Tâche supprimée', 'success');
      loadAdminTasks();
    } catch (err) {
      showToast('Erreur lors de la suppression', 'error');
    }
  });
}

// ─── ADMIN MAINTENANCE ────────────────────────────────────────────────────────

async function loadAdminMaintenance() {
  await switchMaintenanceTab(currentMaintenanceTab);
  // Badge count pour les preuves
  try {
    const proofsSnap = await db.collection('maintenances').where('status', '==', 'paid').get();
    const badge = document.getElementById('proofs-count-badge');
    if (badge) {
      badge.textContent = proofsSnap.size;
      badge.classList.toggle('hidden', proofsSnap.size === 0);
    }
  } catch { /* ignore */ }
}

async function switchMaintenanceTab(tab) {
  currentMaintenanceTab = tab;
  ['list', 'proofs'].forEach(t => {
    const btn = document.getElementById(`mtab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
    const tabEl = document.getElementById(`maintenance-tab-${t}`);
    if (tabEl) tabEl.classList.toggle('hidden', t !== tab);
  });

  if (tab === 'list') {
    await loadMaintenanceList();
  } else if (tab === 'proofs') {
    await loadMaintenanceProofs();
  }
}

async function loadMaintenanceList() {
  const tbody = document.getElementById('maintenance-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Chargement...</td></tr>';

  try {
    const snap = await db.collection('maintenances').orderBy('createdAt', 'desc').get();
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucune maintenance</td></tr>';
      return;
    }

    // Charger les équipes
    const teamsSnap = await db.collection('teams').get();
    const teamsMap = {};
    teamsSnap.docs.forEach(d => { teamsMap[d.id] = d.data().name; });

    tbody.innerHTML = snap.docs.map(d => {
      const m = { id: d.id, ...d.data() };
      const statusBadge = {
        active: '<span class="badge badge-red">Active</span>',
        paid: '<span class="badge badge-yellow">Preuve soumise</span>',
        approved: '<span class="badge badge-green">Approuvée</span>',
        rejected: '<span class="badge badge-gray">Rejetée</span>'
      }[m.status] || `<span class="badge badge-gray">${m.status}</span>`;

      return `<tr>
        <td style="font-weight:600">${escapeHtml(m.workerUsername || '—')}</td>
        <td>${escapeHtml(m.teamId ? (teamsMap[m.teamId] || m.teamId) : '—')}</td>
        <td style="color:#f87171;font-weight:700">${formatCurrency(m.amount || 0)}</td>
        <td>${m.proofUrl ? `<a href="${m.proofUrl}" target="_blank" class="btn-sm blue"><i data-lucide="image" class="w-3 h-3"></i> Voir</a>` : '—'}</td>
        <td>${statusBadge}</td>
        <td style="font-size:0.8rem;color:var(--text-muted)">${formatDate(m.createdAt)}</td>
        <td>
          <div style="display:flex;gap:4px">
            ${m.proofUrl && m.status === 'paid' ? `
            <button class="btn-sm green" onclick="showMaintenanceProofModal('${m.id}','${m.proofUrl}')">
              <i data-lucide="eye" class="w-3 h-3"></i> Preuve
            </button>` : ''}
            ${m.status === 'active' ? `
            <button class="btn-sm gray" onclick="removeMaintenance('${m.workerId}')">
              <i data-lucide="x" class="w-3 h-3"></i> Lever
            </button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Erreur chargement maintenances:", err);
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">Erreur de chargement</td></tr>';
  }
}

async function loadMaintenanceProofs() {
  const tbody = document.getElementById('proofs-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Chargement...</td></tr>';

  try {
    const snap = await db.collection('maintenances').where('status', '==', 'paid').orderBy('paidAt', 'desc').get();
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Aucune preuve en attente</td></tr>';
      return;
    }

    const teamsSnap = await db.collection('teams').get();
    const teamsMap = {};
    teamsSnap.docs.forEach(d => { teamsMap[d.id] = d.data().name; });

    tbody.innerHTML = snap.docs.map(d => {
      const m = { id: d.id, ...d.data() };
      return `<tr>
        <td style="font-weight:600">${escapeHtml(m.workerUsername || '—')}</td>
        <td>${escapeHtml(m.teamId ? (teamsMap[m.teamId] || '—') : '—')}</td>
        <td style="color:#f87171;font-weight:700">${formatCurrency(m.amount || 0)}</td>
        <td style="font-size:0.8rem;color:var(--text-muted)">${formatDate(m.paidAt || m.createdAt)}</td>
        <td>
          ${m.proofUrl ? `<a href="${m.proofUrl}" target="_blank" class="btn-sm blue"><i data-lucide="external-link" class="w-3 h-3"></i> Voir preuve</a>` : '—'}
        </td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn-sm green" onclick="showMaintenanceProofModal('${m.id}','${m.proofUrl || ''}')">
              <i data-lucide="eye" class="w-3 h-3"></i> Examiner
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Erreur chargement preuves:", err);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-400">Erreur de chargement</td></tr>';
  }
}

function showMaintenanceProofModal(maintenanceId, proofUrl) {
  document.getElementById('proof-maintenance-id').value = maintenanceId;
  const body = document.getElementById('modal-maintenance-proof-body');
  if (body) {
    body.innerHTML = proofUrl
      ? `<div style="text-align:center">
           <img src="${proofUrl}" alt="Preuve de paiement" style="max-width:100%;max-height:400px;border-radius:8px;border:1px solid var(--border)" onerror="this.outerHTML='<p style=color:#f87171>Image non chargeable. <a href=${proofUrl} target=_blank class=btn-link>Ouvrir le lien</a></p>'" />
           <p style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-muted)">
             <a href="${proofUrl}" target="_blank" class="btn-link"><i data-lucide="external-link" style="width:12px;height:12px"></i> Ouvrir dans un nouvel onglet</a>
           </p>
         </div>`
      : '<p style="color:var(--text-muted);text-align:center">Aucune preuve fournie</p>';
  }
  openModal('modal-maintenance-proof');
  if (window.lucide) lucide.createIcons();
}

/**
 * Approuver une preuve de maintenance — lève la maintenance du worker
 */
async function approveMaintenanceProof() {
  const maintenanceId = document.getElementById('proof-maintenance-id').value;
  if (!maintenanceId) return;

  try {
    const maintenanceDoc = await db.collection('maintenances').doc(maintenanceId).get();
    if (!maintenanceDoc.exists) { showToast('Maintenance introuvable', 'error'); return; }
    const m = maintenanceDoc.data();
    const workerId = m.workerId;

    const batch = db.batch();

    // 1. Mettre à jour la maintenance
    batch.update(db.collection('maintenances').doc(maintenanceId), {
      status: 'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
      approvedBy: currentUser.uid
    });

    // 2. Lever la maintenance du worker
    if (workerId) {
      batch.update(db.collection('users').doc(workerId), {
        maintenance: false,
        maintenanceAmount: 0,
        maintenanceReason: null
      });

      // 3. Notification au worker
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId: workerId,
        title: 'Maintenance levée !',
        message: 'Votre preuve de paiement a été approuvée. Votre compte est maintenant actif.',
        type: 'success',
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    await batch.commit();
    await addLog('maintenance', `Preuve approuvée pour ${m.workerUsername || workerId}`, currentUser.username);
    showToast('Preuve approuvée — maintenance levée', 'success');
    closeModal();
    loadAdminMaintenance();
  } catch (err) {
    console.error("Erreur approbation maintenance:", err);
    showToast('Erreur lors de l\'approbation', 'error');
  }
}

/**
 * Rejeter une preuve de maintenance
 */
async function rejectMaintenanceProof() {
  const maintenanceId = document.getElementById('proof-maintenance-id').value;
  if (!maintenanceId) return;

  try {
    const maintenanceDoc = await db.collection('maintenances').doc(maintenanceId).get();
    if (!maintenanceDoc.exists) { showToast('Maintenance introuvable', 'error'); return; }
    const m = maintenanceDoc.data();

    const batch = db.batch();

    // 1. Remettre la maintenance en statut "active" (preuve rejetée)
    batch.update(db.collection('maintenances').doc(maintenanceId), {
      status: 'active',
      proofUrl: null,
      paidAt: null,
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectedBy: currentUser.uid
    });

    // 2. Notification au worker
    if (m.workerId) {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId: m.workerId,
        title: 'Preuve rejetée',
        message: 'Votre preuve de paiement a été rejetée. Veuillez soumettre une nouvelle preuve valide.',
        type: 'error',
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    await batch.commit();
    await addLog('maintenance', `Preuve rejetée pour ${m.workerUsername || m.workerId}`, currentUser.username);
    showToast('Preuve rejetée', 'warning');
    closeModal();
    loadAdminMaintenance();
  } catch (err) {
    console.error("Erreur rejet preuve:", err);
    showToast('Erreur lors du rejet', 'error');
  }
}

async function showAddMaintenanceModal() {
  // Charger les workers
  const workersSnap = await db.collection('users').where('role', '==', 'worker').get();
  const select = document.getElementById('maintenance-worker-select');
  if (select) {
    select.innerHTML = '<option value="">Sélectionner un worker</option>';
    workersSnap.docs.forEach(d => {
      const u = d.data();
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${u.displayName || u.username} (${u.username})`;
      select.appendChild(opt);
    });
  }

  const feeInput = document.getElementById('maintenance-amount-input');
  if (feeInput) feeInput.value = globalSettings.maintenanceFee || 250;
  if (document.getElementById('maintenance-reason-input')) {
    document.getElementById('maintenance-reason-input').value = '';
  }

  openModal('modal-add-maintenance');
}

function showAddMaintenanceForUser(uid) {
  showAddMaintenanceModal().then(() => {
    const select = document.getElementById('maintenance-worker-select');
    if (select) select.value = uid;
  });
}

async function activateMaintenance() {
  const workerId = document.getElementById('maintenance-worker-select')?.value;
  const amount = parseFloat(document.getElementById('maintenance-amount-input')?.value);
  const reason = document.getElementById('maintenance-reason-input')?.value.trim();

  if (!workerId) { showToast('Veuillez sélectionner un worker', 'warning'); return; }
  if (isNaN(amount) || amount <= 0) { showToast('Montant invalide', 'warning'); return; }

  try {
    const workerDoc = await db.collection('users').doc(workerId).get();
    const workerData = workerDoc.data();

    const batch = db.batch();

    // Mettre à jour le user
    batch.update(db.collection('users').doc(workerId), {
      maintenance: true,
      maintenanceAmount: amount,
      maintenanceReason: reason || 'Maintenance requise'
    });

    // Créer le document maintenance
    const maintRef = db.collection('maintenances').doc();
    batch.set(maintRef, {
      workerId,
      workerUsername: workerData.username || '',
      teamId: workerData.teamId || null,
      amount,
      reason: reason || 'Maintenance requise',
      status: 'active',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.uid
    });

    // Notification
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      userId: workerId,
      title: 'Maintenance activée',
      message: `Votre compte est en maintenance. Montant à payer : ${formatCurrency(amount)}. ${reason ? 'Raison : ' + reason : ''}`,
      type: 'warning',
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    await addLog('maintenance', `Maintenance activée pour ${workerData.username} (${formatCurrency(amount)})`, currentUser.username);
    showToast('Maintenance activée', 'success');
    closeModal();
    loadAdminMaintenance();
  } catch (err) {
    console.error("Erreur activation maintenance:", err);
    showToast('Erreur lors de l\'activation', 'error');
  }
}

/**
 * Activer la maintenance sur TOUS les workers en batch
 */
async function activateMaintenanceAll() {
  const amount = parseFloat(document.getElementById('maintenance-amount-input')?.value);
  const reason = document.getElementById('maintenance-reason-input')?.value.trim();

  if (isNaN(amount) || amount <= 0) { showToast('Montant invalide', 'warning'); return; }

  showConfirmModal(
    'Maintenance sur tous les workers',
    `Êtes-vous sûr d'activer une maintenance de ${formatCurrency(amount)} sur TOUS les workers ? Cette action est irréversible.`,
    async () => {
      try {
        const workersSnap = await db.collection('users').where('role', '==', 'worker').get();
        if (workersSnap.empty) { showToast('Aucun worker trouvé', 'warning'); return; }

        // Firestore batch limité à 500 ops — diviser si nécessaire
        const workers = workersSnap.docs;
        const chunkSize = 100; // 3 ops par worker max
        let totalProcessed = 0;

        for (let i = 0; i < workers.length; i += chunkSize) {
          const chunk = workers.slice(i, i + chunkSize);
          const batch = db.batch();

          chunk.forEach(d => {
            const workerData = d.data();

            // Mettre à jour le user
            batch.update(d.ref, {
              maintenance: true,
              maintenanceAmount: amount,
              maintenanceReason: reason || 'Maintenance générale'
            });

            // Document maintenance
            const maintRef = db.collection('maintenances').doc();
            batch.set(maintRef, {
              workerId: d.id,
              workerUsername: workerData.username || '',
              teamId: workerData.teamId || null,
              amount,
              reason: reason || 'Maintenance générale',
              status: 'active',
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              createdBy: currentUser.uid,
              isBulk: true
            });

            // Notification
            const notifRef = db.collection('notifications').doc();
            batch.set(notifRef, {
              userId: d.id,
              title: 'Maintenance activée',
              message: `Une maintenance de ${formatCurrency(amount)} a été activée sur votre compte. ${reason ? 'Raison : ' + reason : ''}`,
              type: 'warning',
              read: false,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          });

          await batch.commit();
          totalProcessed += chunk.length;
        }

        await addLog('maintenance', `Maintenance en masse activée (${totalProcessed} workers, ${formatCurrency(amount)})`, currentUser.username);
        showToast(`Maintenance activée sur ${totalProcessed} workers`, 'success');
        closeModal();
        loadAdminMaintenance();
      } catch (err) {
        console.error("Erreur maintenance en masse:", err);
        showToast('Erreur lors de l\'opération en masse', 'error');
      }
    }
  );
}

async function removeMaintenance(workerId) {
  try {
    const batch = db.batch();

    // Mettre à jour le user
    batch.update(db.collection('users').doc(workerId), {
      maintenance: false,
      maintenanceAmount: 0,
      maintenanceReason: null
    });

    // Fermer les maintenances actives pour ce worker
    const maintSnap = await db.collection('maintenances')
      .where('workerId', '==', workerId)
      .where('status', 'in', ['active', 'paid'])
      .get();
    maintSnap.docs.forEach(d => {
      batch.update(d.ref, { status: 'approved', approvedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });

    // Notification
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      userId: workerId,
      title: 'Maintenance levée',
      message: 'Votre maintenance a été levée par l\'administrateur. Votre compte est maintenant actif.',
      type: 'success',
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    await addLog('maintenance', `Maintenance levée pour uid:${workerId}`, currentUser.username);
    showToast('Maintenance levée', 'success');
    loadAdminUsers();
  } catch (err) {
    console.error("Erreur suppression maintenance:", err);
    showToast('Erreur lors de la levée de maintenance', 'error');
  }
}

// ─── ADMIN RETRAITS ───────────────────────────────────────────────────────────

async function loadAdminWithdrawals() {
  await switchWithdrawalTab(currentWithdrawalTab);
}

async function switchWithdrawalTab(tab) {
  currentWithdrawalTab = tab;
  ['pending', 'approved', 'rejected'].forEach(t => {
    const btn = document.getElementById(`wtab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
  });

  const tbody = document.getElementById('withdrawals-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Chargement...</td></tr>';

  try {
    const snap = await db.collection('withdrawals').where('status', '==', tab).orderBy('createdAt', 'desc').get();
    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucun retrait ${tab === 'pending' ? 'en attente' : tab === 'approved' ? 'approuvé' : 'rejeté'}</td></tr>`;
      return;
    }

    tbody.innerHTML = snap.docs.map(d => {
      const w = { id: d.id, ...d.data() };
      const statusBadge = {
        pending: '<span class="badge badge-yellow">En attente</span>',
        approved: '<span class="badge badge-green">Approuvé</span>',
        rejected: '<span class="badge badge-red">Rejeté</span>'
      }[w.status];

      return `<tr>
        <td style="font-weight:600">${escapeHtml(w.username || '—')}</td>
        <td style="color:var(--success-light);font-weight:700">${formatCurrency(w.amount || 0)}</td>
        <td>${escapeHtml(w.method || '—')}</td>
        <td style="font-family:monospace;font-size:0.85rem">${escapeHtml(w.phone || '—')}</td>
        <td>${statusBadge}</td>
        <td style="font-size:0.8rem;color:var(--text-muted)">${formatDate(w.createdAt)}</td>
        <td>
          ${tab === 'pending' ? `
          <div style="display:flex;gap:4px">
            <button class="btn-sm green" onclick="approveWithdrawal('${w.id}','${w.userId}',${w.amount})">
              <i data-lucide="check" class="w-3 h-3"></i> Approuver
            </button>
            <button class="btn-sm red" onclick="rejectWithdrawal('${w.id}','${w.userId}',${w.amount})">
              <i data-lucide="x" class="w-3 h-3"></i> Rejeter
            </button>
          </div>` : '—'}
        </td>
      </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Erreur chargement retraits:", err);
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">Erreur de chargement</td></tr>';
  }
}

async function approveWithdrawal(withdrawalId, userId, amount) {
  showConfirmModal('Approuver le retrait', `Confirmer l'approbation du retrait de ${formatCurrency(amount)} ?`, async () => {
    try {
      const batch = db.batch();
      batch.update(db.collection('withdrawals').doc(withdrawalId), {
        status: 'approved',
        approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        approvedBy: currentUser.uid
      });

      // Notification
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId,
        title: 'Retrait approuvé !',
        message: `Votre demande de retrait de ${formatCurrency(amount)} a été approuvée.`,
        type: 'success',
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await batch.commit();
      await addLog('withdrawal', `Retrait approuvé : ${formatCurrency(amount)} pour uid:${userId}`, currentUser.username);
      showToast('Retrait approuvé', 'success');
      loadAdminWithdrawals();
    } catch (err) {
      showToast('Erreur lors de l\'approbation', 'error');
    }
  });
}

async function rejectWithdrawal(withdrawalId, userId, amount) {
  showConfirmModal('Rejeter le retrait', `Rejeter la demande de retrait de ${formatCurrency(amount)} ? Le solde sera recrédité.`, async () => {
    try {
      const batch = db.batch();
      batch.update(db.collection('withdrawals').doc(withdrawalId), {
        status: 'rejected',
        rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
        rejectedBy: currentUser.uid
      });

      // Recréditer le solde
      batch.update(db.collection('users').doc(userId), {
        balance: firebase.firestore.FieldValue.increment(amount)
      });

      // Transaction de recréditement
      const txRef = db.collection('transactions').doc();
      batch.set(txRef, {
        userId,
        type: 'refund',
        amount,
        description: `Retrait rejeté — recréditement de ${formatCurrency(amount)}`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Notification
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId,
        title: 'Retrait rejeté',
        message: `Votre demande de retrait de ${formatCurrency(amount)} a été rejetée. Le montant a été recrédité sur votre solde.`,
        type: 'error',
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await batch.commit();
      await addLog('withdrawal', `Retrait rejeté et recrédité : ${formatCurrency(amount)} pour uid:${userId}`, currentUser.username);
      showToast('Retrait rejeté et solde recrédité', 'warning');
      loadAdminWithdrawals();
    } catch (err) {
      showToast('Erreur lors du rejet', 'error');
    }
  });
}

// ─── ADMIN LOGS ────────────────────────────────────────────────────────────────

async function loadAdminLogs() {
  const tbody = document.getElementById('logs-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Chargement...</td></tr>';

  try {
    const snap = await db.collection('logs').orderBy('createdAt', 'desc').limit(200).get();
    allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLogsTable(allLogs);
  } catch (err) {
    console.error("Erreur chargement logs:", err);
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-400">Erreur de chargement</td></tr>';
  }
}

function renderLogsTable(logs) {
  const tbody = document.getElementById('logs-tbody');
  if (!tbody) return;

  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Aucun log</td></tr>';
    return;
  }

  const typeColors = {
    login: 'badge-blue', task: 'badge-green', withdrawal: 'badge-yellow',
    maintenance: 'badge-yellow', user: 'badge-gray'
  };

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td><span class="badge ${typeColors[l.type] || 'badge-gray'}">${l.type || '—'}</span></td>
      <td style="color:var(--text-secondary)">${escapeHtml(l.action || '—')}</td>
      <td style="font-family:monospace;font-size:0.82rem">${escapeHtml(l.username || '—')}</td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${formatDate(l.createdAt)}</td>
    </tr>
  `).join('');
}

function filterLogs() {
  const searchVal = (document.getElementById('logs-search')?.value || '').toLowerCase();
  const typeVal = document.getElementById('logs-type-filter')?.value || '';

  const filtered = allLogs.filter(l => {
    const matchSearch = !searchVal ||
      (l.action || '').toLowerCase().includes(searchVal) ||
      (l.username || '').toLowerCase().includes(searchVal);
    const matchType = !typeVal || l.type === typeVal;
    return matchSearch && matchType;
  });

  renderLogsTable(filtered);
}

// ─── ADMIN PARAMÈTRES ─────────────────────────────────────────────────────────

async function loadAdminSettings() {
  await loadGlobalSettings();

  const exchangeInput = document.getElementById('exchange-rate-input');
  const feeInput = document.getElementById('maintenance-fee-input');
  const moncashInput = document.getElementById('moncash-number-input');
  const natcashInput = document.getElementById('natcash-number-input');

  if (exchangeInput) exchangeInput.value = globalSettings.exchangeRate || 130;
  if (feeInput) feeInput.value = globalSettings.maintenanceFee || 250;
  if (moncashInput) moncashInput.value = globalSettings.moncashNumber || '';
  if (natcashInput) natcashInput.value = globalSettings.natcashNumber || '';

  setText('current-exchange-rate', `Taux actuel : 1 USD = ${globalSettings.exchangeRate || 130} HTG`);
  setText('current-maintenance-fee', `Frais actuels : ${formatCurrency(globalSettings.maintenanceFee || 250)}`);
  setText('current-payment-numbers',
    `MonCash : ${globalSettings.moncashNumber || 'Non défini'} | Natcash : ${globalSettings.natcashNumber || 'Non défini'}`
  );
}

async function saveExchangeRate() {
  const rate = parseFloat(document.getElementById('exchange-rate-input')?.value);
  if (isNaN(rate) || rate <= 0) { showToast('Taux de change invalide', 'warning'); return; }
  try {
    await db.collection('settings').doc('global').set({ exchangeRate: rate }, { merge: true });
    globalSettings.exchangeRate = rate;
    setText('current-exchange-rate', `Taux actuel : 1 USD = ${rate} HTG`);
    await addLog('user', `Taux de change mis à jour : ${rate} HTG/USD`, currentUser.username);
    showToast('Taux de change sauvegardé', 'success');
  } catch (err) {
    showToast('Erreur lors de la sauvegarde', 'error');
  }
}

async function saveMaintenanceFee() {
  const fee = parseFloat(document.getElementById('maintenance-fee-input')?.value);
  if (isNaN(fee) || fee <= 0) { showToast('Montant invalide', 'warning'); return; }
  try {
    await db.collection('settings').doc('global').set({ maintenanceFee: fee }, { merge: true });
    globalSettings.maintenanceFee = fee;
    setText('current-maintenance-fee', `Frais actuels : ${formatCurrency(fee)}`);
    await addLog('user', `Frais de maintenance mis à jour : ${formatCurrency(fee)}`, currentUser.username);
    showToast('Frais de maintenance sauvegardés', 'success');
  } catch (err) {
    showToast('Erreur lors de la sauvegarde', 'error');
  }
}

/**
 * Sauvegarder les numéros de paiement MonCash et Natcash
 */
async function savePaymentNumbers() {
  const moncash = document.getElementById('moncash-number-input')?.value.trim();
  const natcash = document.getElementById('natcash-number-input')?.value.trim();

  try {
    await db.collection('settings').doc('global').set({
      moncashNumber: moncash || '',
      natcashNumber: natcash || ''
    }, { merge: true });
    globalSettings.moncashNumber = moncash;
    globalSettings.natcashNumber = natcash;
    setText('current-payment-numbers',
      `MonCash : ${moncash || 'Non défini'} | Natcash : ${natcash || 'Non défini'}`
    );
    await addLog('user', `Numéros de paiement mis à jour`, currentUser.username);
    showToast('Numéros de paiement sauvegardés', 'success');
  } catch (err) {
    showToast('Erreur lors de la sauvegarde', 'error');
  }
}

/**
 * Créer un compte manager (avec reconnexion admin)
 */
async function createManagerAccount() {
  const name = document.getElementById('new-manager-name')?.value.trim();
  const username = document.getElementById('new-manager-username')?.value.trim();
  const password = document.getElementById('new-manager-password')?.value.trim();
  const adminPassword = document.getElementById('admin-confirm-password')?.value;
  const resultEl = document.getElementById('manager-creation-result');

  if (!name || !username || !password || !adminPassword) {
    showToast('Veuillez remplir tous les champs.', 'warning');
    return;
  }

  const email = `${username}@hbwtask.com`;

  if (resultEl) {
    resultEl.className = 'result-box';
    resultEl.textContent = 'Création en cours...';
    resultEl.classList.remove('hidden');
  }

  // Sauvegarder l'identité admin avant de créer le compte
  const adminEmail = currentFirebaseUser.email;

  try {
    // Vérifier si le username existe déjà
    const existing = await db.collection('users').where('username', '==', username).limit(1).get();
    if (!existing.empty) {
      if (resultEl) {
        resultEl.className = 'result-box error';
        resultEl.textContent = 'Ce nom d\'utilisateur est déjà pris.';
      }
      return;
    }

    // Étape 1 : créer le compte Firebase Auth
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const newManagerUid = userCredential.user.uid;

    // Étape 2 : se reconnecter IMMÉDIATEMENT en tant qu'admin
    // Si le mot de passe est incorrect, une exception sera levée et le document ne sera pas écrit
    await auth.signInWithEmailAndPassword(adminEmail, adminPassword);

    // Étape 3 : écrire le document Firestore (maintenant que l'admin est reconnecté)
    await db.collection('users').doc(newManagerUid).set({
      uid: newManagerUid,
      email,
      username,
      displayName: name,
      role: 'manager',
      balance: 0,
      totalEarnings: 0,
      active: true,
      maintenance: false,
      teamId: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.uid
    });

    // Log
    await addLog('user', `Manager créé : ${username} (${name})`, currentUser.username);

    // Message de succès
    if (resultEl) {
      resultEl.className = 'result-box success';
      resultEl.innerHTML = `✅ Manager créé avec succès !<br>Username: <strong>${username}</strong><br>Email: <strong>${email}</strong>`;
    }

    // Vider les champs
    ['new-manager-name', 'new-manager-username', 'new-manager-password', 'admin-confirm-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    showToast('Manager créé avec succès', 'success');
  } catch (err) {
    console.error('Erreur création manager:', err);

    // Si l'erreur est due à un mauvais mot de passe admin
    if (err.code === 'auth/wrong-password') {
      if (resultEl) {
        resultEl.className = 'result-box error';
        resultEl.textContent = '❌ Mot de passe admin incorrect. Le compte manager a été créé mais le document Firestore n\'a pas pu être enregistré.';
      }
      showToast('Mot de passe admin incorrect. Le compte manager n\'a pas été créé correctement.', 'error');
    } else {
      if (resultEl) {
        resultEl.className = 'result-box error';
        resultEl.textContent = `Erreur : ${err.message}`;
      }
      showToast('Erreur lors de la création du manager.', 'error');
    }
  }
}

// ─── MANAGER DASHBOARD ────────────────────────────────────────────────────────

/**
 * Rendre le tableau de bord manager
 */
async function renderManagerDashboard() {
  // Afficher la bannière équipe
  const banner = document.getElementById('manager-team-banner');
  const teamNameDisplay = document.getElementById('manager-team-name-display');

  if (!currentUser.teamId) {
    // Pas d'équipe — afficher un message d'aide
    if (banner) banner.classList.add('hidden');
    document.getElementById('mgr-stat-members')?.parentElement?.parentElement?.insertAdjacentHTML(
      'afterend',
      '<div class="card" style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-muted)"><i data-lucide="info" style="width:24px;height:24px;margin-bottom:0.5rem;display:block;margin-left:auto;margin-right:auto"></i><p>Vous n\'avez pas encore d\'équipe. Contactez l\'administrateur.</p></div>'
    );

    setText('mgr-stat-members', '—');
    setText('mgr-stat-tasks', '—');
    setText('mgr-stat-avg', '—');
    setText('mgr-stat-balance', '—');
    setText('mgr-stat-commission', formatCurrency(currentUser.balance || 0));
    if (window.lucide) lucide.createIcons();
    return;
  }

  try {
    // Charger l'équipe
    const teamDoc = await db.collection('teams').doc(currentUser.teamId).get();
    const teamName = teamDoc.exists ? teamDoc.data().name : 'Équipe inconnue';

    if (banner) banner.classList.remove('hidden');
    if (teamNameDisplay) teamNameDisplay.textContent = teamName;

    // Membres de l'équipe
    const membersSnap = await db.collection('users')
      .where('teamId', '==', currentUser.teamId)
      .where('role', '==', 'worker')
      .get();
    const members = membersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));

    // Tâches du jour
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tasksSnap = await db.collection('tasks')
      .where('status', '==', 'validated')
      .where('validatedAt', '>=', firebase.firestore.Timestamp.fromDate(today))
      .get();
    const todayTasksForTeam = tasksSnap.docs.filter(d => members.some(m => m.uid === d.data().workerId));

    const totalBalance = members.reduce((sum, m) => sum + (m.balance || 0), 0);
    const avgEarnings = members.length > 0 ? totalBalance / members.length : 0;

    setText('mgr-stat-members', members.length);
    setText('mgr-stat-tasks', todayTasksForTeam.length);
    setText('mgr-stat-avg', formatCurrency(avgEarnings));
    setText('mgr-stat-balance', formatCurrency(totalBalance));
    setText('mgr-stat-commission', formatCurrency(currentUser.balance || 0));

    // Classement
    renderTeamRankingWidget(members);

    // Graphique
    renderManagerChart(currentUser.teamId);

  } catch (err) {
    console.error("Erreur dashboard manager:", err);
    showToast('Erreur lors du chargement du dashboard', 'error');
  }
}

function renderTeamRankingWidget(members) {
  const el = document.getElementById('team-ranking-list');
  if (!el) return;
  const sorted = [...members].sort((a, b) => (b.totalEarnings || 0) - (a.totalEarnings || 0)).slice(0, 10);
  if (!sorted.length) { el.innerHTML = '<div class="empty-state-sm">Aucun membre</div>'; return; }

  el.innerHTML = sorted.map((m, i) => {
    const badgeInfo = getBadgeInfo(m.completedTasks || 0);
    return `<div class="mini-item">
      <div class="mini-avatar" style="background: linear-gradient(135deg,#f59e0b,#ef4444)">${i + 1}</div>
      <div class="mini-info">
        <p class="mini-name">${escapeHtml(m.displayName || m.username)}</p>
        <p class="mini-sub">${badgeInfo.icon} ${badgeInfo.name} · ${m.completedTasks || 0} tâches</p>
      </div>
      <span class="mini-amount green">${formatCurrency(m.totalEarnings || 0)}</span>
    </div>`;
  }).join('');
}

async function renderManagerChart(teamId) {
  const canvas = document.getElementById('manager-chart');
  if (!canvas) return;
  if (managerChart) { managerChart.destroy(); managerChart = null; }

  const labels = [];
  const data = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));

    const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
    try {
      const snap = await db.collection('tasks')
        .where('status', '==', 'validated')
        .where('validatedAt', '>=', firebase.firestore.Timestamp.fromDate(dayStart))
        .where('validatedAt', '<=', firebase.firestore.Timestamp.fromDate(dayEnd))
        .get();
      data.push(snap.size);
    } catch {
      data.push(0);
    }
  }

  managerChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tâches validées',
        data,
        backgroundColor: 'rgba(59,130,246,0.4)',
        borderColor: '#3b82f6',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 11 }, precision: 0 } }
      }
    }
  });
}

// ─── MANAGER MEMBRES ──────────────────────────────────────────────────────────

async function loadManagerMembers() {
  const tbody = document.getElementById('members-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Chargement...</td></tr>';

  if (!currentUser.teamId) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Vous n\'avez pas d\'équipe assignée.</td></tr>';
    return;
  }

  try {
    const membersSnap = await db.collection('users')
      .where('teamId', '==', currentUser.teamId)
      .where('role', '==', 'worker')
      .get();

    const members = membersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
    renderMembersTable(members);

    // Remplir le select du formulaire de messagerie
    const msgRecipient = document.getElementById('msg-recipient');
    if (msgRecipient) {
      msgRecipient.innerHTML = '<option value="all">Toute l\'équipe</option>';
      members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.uid;
        opt.textContent = m.displayName || m.username;
        msgRecipient.appendChild(opt);
      });
    }
  } catch (err) {
    console.error("Erreur chargement membres:", err);
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-400">Erreur de chargement</td></tr>';
  }
}

function renderMembersTable(members) {
  const tbody = document.getElementById('members-tbody');
  if (!tbody) return;

  if (!members.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucun membre dans votre équipe</td></tr>';
    return;
  }

  tbody.innerHTML = members.map(m => {
    const badgeInfo = getBadgeInfo(m.completedTasks || 0);
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="mini-avatar" style="width:32px;height:32px;font-size:0.75rem">${(m.username || '?').charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-weight:600;color:var(--text-primary)">${escapeHtml(m.displayName || m.username)}</div>
            <div style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml(m.username || '')}</div>
          </div>
        </div>
      </td>
      <td style="font-size:0.82rem;color:var(--text-muted)">${escapeHtml(m.phone || '—')}</td>
      <td style="font-weight:700;color:var(--success-light)">${formatCurrency(m.balance || 0)}</td>
      <td>${m.completedTasks || 0}</td>
      <td><span class="badge badge-bronze">${badgeInfo.icon} ${badgeInfo.name}</span></td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${formatDate(m.lastActivity || m.createdAt)}</td>
      <td>
        <button class="btn-sm blue" onclick="sendMessageToMember('${m.uid}','${escapeHtml(m.displayName || m.username)}')">
          <i data-lucide="message-square" class="w-3 h-3"></i> Message
        </button>
      </td>
    </tr>`;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function filterMembers() {
  const search = (document.getElementById('members-search')?.value || '').toLowerCase();
  // Recharger et filtrer
  loadManagerMembers().then(() => {
    if (!search) return;
    const rows = document.querySelectorAll('#members-tbody tr');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(search) ? '' : 'none';
    });
  });
}

async function showAddMemberModal() {
  // Générer des credentials
  generateWorkerCredentials();
  ['member-firstname', 'member-lastname', 'member-phone', 'member-address'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (document.getElementById('member-age')) document.getElementById('member-age').value = '';
  if (document.getElementById('manager-password-input')) document.getElementById('manager-password-input').value = '';
  openModal('modal-add-member');
}

/**
 * Générer des credentials automatiques pour un worker
 */
function generateWorkerCredentials() {
  const suffix = Math.floor(10000 + Math.random() * 90000);
  const username = `worker_${suffix}`;
  const email = `${username}@hbwtask.com`;
  const password = generateRandomPassword(10);

  setText('gen-username', username);
  setText('gen-email', email);
  setText('gen-password', password);
}

/**
 * Créer le compte d'un worker (par le manager) — avec reconnexion manager
 */
async function createWorkerAccount() {
  const firstname = document.getElementById('member-firstname')?.value.trim();
  const lastname = document.getElementById('member-lastname')?.value.trim();
  const age = document.getElementById('member-age')?.value;
  const gender = document.getElementById('member-gender')?.value;
  const phone = document.getElementById('member-phone')?.value.trim();
  const status = document.getElementById('member-status')?.value;
  const address = document.getElementById('member-address')?.value.trim();
  const managerPassword = document.getElementById('manager-password-input')?.value;

  const genUsername = document.getElementById('gen-username')?.textContent.trim();
  const genEmail = document.getElementById('gen-email')?.textContent.trim();
  const genPassword = document.getElementById('gen-password')?.textContent.trim();

  const btn = document.getElementById('create-worker-btn');
  const btnText = document.getElementById('create-worker-btn-text');
  const spinner = document.getElementById('create-worker-spinner');

  // Validation des champs obligatoires
  if (!firstname || !lastname) {
    showToast('Prénom et nom sont requis.', 'warning');
    return;
  }
  if (!managerPassword) {
    showToast('Veuillez entrer votre mot de passe manager pour confirmer.', 'warning');
    return;
  }
  if (!genUsername || !genEmail || !genPassword) {
    showToast('Veuillez générer les identifiants avant de créer le compte.', 'warning');
    return;
  }

  // Activer le spinner
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Création...';
  if (spinner) spinner.classList.remove('hidden');

  // Sauvegarder l'email du manager connecté
  const managerEmail = currentFirebaseUser.email;

  try {
    // Vérifier que le nom d'utilisateur est disponible
    const existing = await db.collection('users').where('username', '==', genUsername).limit(1).get();
    if (!existing.empty) {
      showToast('Ce nom d\'utilisateur est déjà pris. Régénérez les identifiants.', 'error');
      return;
    }

    // Étape 1 : créer le compte Firebase Auth (ceci déconnecte le manager)
    const userCredential = await auth.createUserWithEmailAndPassword(genEmail, genPassword);
    const newWorkerUid = userCredential.user.uid;

    // Étape 2 : reconnecter IMMÉDIATEMENT le manager
    await auth.signInWithEmailAndPassword(managerEmail, managerPassword);

    // Étape 3 : écrire le document Firestore du worker
    await db.collection('users').doc(newWorkerUid).set({
      uid: newWorkerUid,
      email: genEmail,
      username: genUsername,
      displayName: `${firstname} ${lastname}`,
      firstName: firstname,
      lastName: lastname,
      age: age ? parseInt(age) : null,
      gender: gender || 'M',
      phone: phone || '',
      status: status || 'autre',
      address: address || '',
      role: 'worker',
      balance: 0,
      totalEarnings: 0,
      completedTasks: 0,
      active: true,
      maintenance: false,
      maintenanceAmount: 0,
      teamId: currentUser.teamId || null,
      createdBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastActivity: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Log
    await addLog('user', `Worker créé : ${genUsername} par le manager ${currentUser.username}`, currentUser.username);

    showToast(`Worker ${genUsername} créé avec succès !`, 'success');
    closeModal();
    loadManagerMembers(); // rafraîchir la liste

  } catch (err) {
    console.error('Erreur création worker:', err);
    let msg = 'Erreur lors de la création.';
    if (err.code === 'auth/email-already-in-use') {
      msg = 'Cet email est déjà utilisé. Régénérez les identifiants.';
    } else if (err.code === 'auth/wrong-password') {
      msg = 'Mot de passe manager incorrect. Le compte worker a été créé mais n\'a pas été enregistré correctement.';
    }
    showToast(msg, 'error');
  } finally {
    // Réactiver le bouton et cacher le spinner
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Créer le compte';
    if (spinner) spinner.classList.add('hidden');
  }
                                          }

function sendMessageToMember(uid, name) {
  const msgRecipient = document.getElementById('msg-recipient');
  if (msgRecipient) msgRecipient.value = uid;
  showPage('manager-messages');
}

// ─── MANAGER MESSAGERIE ───────────────────────────────────────────────────────

async function loadManagerMessages() {
  // Charger les membres pour le select
  if (currentUser.teamId) {
    const membersSnap = await db.collection('users')
      .where('teamId', '==', currentUser.teamId)
      .where('role', '==', 'worker')
      .get();
    const msgRecipient = document.getElementById('msg-recipient');
    if (msgRecipient) {
      msgRecipient.innerHTML = '<option value="all">Toute l\'équipe</option>';
      membersSnap.docs.forEach(d => {
        const u = d.data();
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = u.displayName || u.username;
        msgRecipient.appendChild(opt);
      });
    }
  }

  // Charger les messages envoyés
  const sentList = document.getElementById('sent-messages-list');
  if (!sentList) return;
  sentList.innerHTML = '<div class="empty-state-sm">Chargement...</div>';

  try {
    const snap = await db.collection('messages')
      .where('senderId', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    if (snap.empty) {
      sentList.innerHTML = '<div class="empty-state-sm">Aucun message envoyé</div>';
      return;
    }

    sentList.innerHTML = snap.docs.map(d => {
      const m = d.data();
      return `<div class="mini-item">
        <div class="mini-avatar"><i data-lucide="send" style="width:16px;height:16px"></i></div>
        <div class="mini-info">
          <p class="mini-name">À : ${escapeHtml(m.recipientName || 'Toute l\'équipe')}</p>
          <p class="mini-sub">${escapeHtml((m.content || '').substring(0, 60))}${(m.content || '').length > 60 ? '...' : ''}</p>
        </div>
        <span style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap">${formatDate(m.createdAt)}</span>
      </div>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    sentList.innerHTML = '<div class="empty-state-sm">Erreur de chargement</div>';
  }
}

async function sendTeamMessage() {
  const recipientVal = document.getElementById('msg-recipient')?.value;
  const content = document.getElementById('msg-content')?.value.trim();

  if (!content) { showToast('Veuillez écrire un message', 'warning'); return; }
  if (!currentUser.teamId) { showToast('Vous n\'avez pas d\'équipe', 'warning'); return; }

  try {
    let recipients = [];
    let recipientName = 'Toute l\'équipe';

    if (recipientVal === 'all') {
      const membersSnap = await db.collection('users')
        .where('teamId', '==', currentUser.teamId)
        .where('role', '==', 'worker')
        .get();
      recipients = membersSnap.docs.map(d => d.id);
    } else {
      recipients = [recipientVal];
      const userDoc = await db.collection('users').doc(recipientVal).get();
      if (userDoc.exists) recipientName = userDoc.data().displayName || userDoc.data().username;
    }

    // Sauvegarder le message
    await db.collection('messages').add({
      senderId: currentUser.uid,
      senderName: currentUser.displayName || currentUser.username,
      recipientId: recipientVal === 'all' ? 'all' : recipientVal,
      recipientName,
      teamId: currentUser.teamId,
      content,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Envoyer des notifications aux destinataires
    const batch = db.batch();
    recipients.forEach(uid => {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId: uid,
        title: `Message de ${currentUser.displayName || currentUser.username}`,
        message: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
        type: 'info',
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();

    if (document.getElementById('msg-content')) document.getElementById('msg-content').value = '';
    showToast('Message envoyé', 'success');
    loadManagerMessages();
  } catch (err) {
    console.error("Erreur envoi message:", err);
    showToast('Erreur lors de l\'envoi', 'error');
  }
}

// ─── MANAGER STATISTIQUES ─────────────────────────────────────────────────────

async function loadManagerStats() {
  const tbody = document.getElementById('stats-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Chargement...</td></tr>';

  if (!currentUser.teamId) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Aucune équipe assignée</td></tr>';
    return;
  }

  try {
    const membersSnap = await db.collection('users')
      .where('teamId', '==', currentUser.teamId)
      .where('role', '==', 'worker')
      .get();
    const members = membersSnap.docs.map(d => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => (b.totalEarnings || 0) - (a.totalEarnings || 0));

    if (!members.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Aucun membre</td></tr>';
      return;
    }

    tbody.innerHTML = members.map((m, i) => {
      const avgPerTask = m.completedTasks > 0 ? (m.totalEarnings || 0) / m.completedTasks : 0;
      const badgeInfo = getBadgeInfo(m.completedTasks || 0);
      return `<tr>
        <td style="font-weight:700;color:var(--text-muted)">${i + 1}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="mini-avatar" style="width:30px;height:30px;font-size:0.72rem">${(m.username || '?').charAt(0).toUpperCase()}</div>
            <span style="font-weight:600">${escapeHtml(m.displayName || m.username)}</span>
          </div>
        </td>
        <td>${m.completedTasks || 0}</td>
        <td style="color:var(--success-light);font-weight:700">${formatCurrency(m.totalEarnings || 0)}</td>
        <td style="color:var(--text-muted)">${formatCurrency(avgPerTask)}</td>
        <td>${badgeInfo.icon} ${badgeInfo.name}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error("Erreur stats manager:", err);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-400">Erreur de chargement</td></tr>';
  }
}

// ─── WORKER DASHBOARD ─────────────────────────────────────────────────────────

async function renderWorkerDashboard() {
  try {
    // Recharger les données fraîches du worker
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists) {
      currentUser = { uid: currentUser.uid, ...userDoc.data() };
    }

    const balance = currentUser.balance || 0;
    const exchangeRate = globalSettings.exchangeRate || 130;
    const completedTasks = currentUser.completedTasks || 0;
    const badgeInfo = getBadgeInfo(completedTasks);

    // Mise à jour de l'affichage
    setText('worker-balance', formatCurrency(balance));
    setText('worker-balance-usd', `≈ ${(balance / exchangeRate).toFixed(2)} USD`);
    setText('worker-badge-icon', badgeInfo.icon);
    setText('worker-badge-name', badgeInfo.name);

    // Barre de progression
    const progress = Math.min(100, (completedTasks / badgeInfo.nextTarget) * 100);
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.style.width = `${progress}%`;
    setText('next-badge-name', badgeInfo.nextName);
    setText('progress-count', `${completedTasks} / ${badgeInfo.nextTarget} tâches`);

    // Maintenance banner
    const maintenanceBanner = document.getElementById('maintenance-banner');
    if (maintenanceBanner) {
      maintenanceBanner.classList.toggle('hidden', !currentUser.maintenance);
      if (currentUser.maintenance) {
        setText('maintenance-amount-banner', formatCurrency(currentUser.maintenanceAmount || 0));
      }
    }

    // Topbar balance
    updateTopbarBalance();

    // Activité récente
    loadWorkerRecentActivity();

  } catch (err) {
    console.error("Erreur dashboard worker:", err);
    showToast('Erreur lors du chargement', 'error');
  }
}

async function loadWorkerRecentActivity() {
  const el = document.getElementById('worker-recent-activity');
  if (!el) return;

  try {
    const snap = await db.collection('transactions')
      .where('userId', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .limit(8)
      .get();

    if (snap.empty) {
      el.innerHTML = '<div class="empty-state-sm">Aucune activité récente</div>';
      return;
    }

    el.innerHTML = snap.docs.map(d => {
      const tx = d.data();
      const isPositive = tx.amount >= 0;
      return `<div class="mini-item">
        <div class="mini-avatar" style="background: ${isPositive ? 'linear-gradient(135deg,#16a34a,#22c55e)' : 'linear-gradient(135deg,#dc2626,#f87171)'}">
          <i data-lucide="${isPositive ? 'arrow-down' : 'arrow-up'}" style="width:14px;height:14px"></i>
        </div>
        <div class="mini-info">
          <p class="mini-name">${escapeHtml(tx.description || tx.type)}</p>
          <p class="mini-sub">${formatDate(tx.createdAt)}</p>
        </div>
        <span class="mini-amount ${isPositive ? 'green' : 'red'}">${isPositive ? '+' : ''}${formatCurrency(tx.amount)}</span>
      </div>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    el.innerHTML = '<div class="empty-state-sm">Erreur de chargement</div>';
  }
}

function updateTopbarBalance() {
  const el = document.getElementById('topbar-balance-amount');
  if (el) el.textContent = formatCurrency(currentUser.balance || 0);
}

// ─── WORKER TÂCHES ────────────────────────────────────────────────────────────

async function loadWorkerTasks() {
  const grid = document.getElementById('worker-tasks-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="empty-state">Chargement des tâches...</div>';

  try {
    // Tâches disponibles + tâches du worker
    const [availableSnap, workerTasksSnap] = await Promise.all([
      db.collection('tasks').where('status', '==', 'available').get(),
      db.collection('tasks').where('workerId', '==', currentUser.uid).where('status', '==', 'pending').get()
    ]);

    const tasks = [
      ...availableSnap.docs.map(d => ({ id: d.id, ...d.data(), taskStatus: 'available' })),
      ...workerTasksSnap.docs.map(d => ({ id: d.id, ...d.data(), taskStatus: 'pending' }))
    ];

    if (!tasks.length) {
      grid.innerHTML = '<div class="empty-state">Aucune tâche disponible pour le moment.</div>';
      return;
    }

    grid.innerHTML = tasks.map(t => `
      <div class="task-card">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <span class="task-reward">+${formatCurrency(t.reward || 0)}</span>
          <span class="task-status ${t.taskStatus || 'available'}">${
            { available: '🟢 Disponible', pending: '⏳ En attente', validated: '✅ Validée' }[t.taskStatus] || t.taskStatus
          }</span>
        </div>
        <h3 class="task-title">${escapeHtml(t.title || '—')}</h3>
        <p class="task-desc">${escapeHtml((t.description || '').substring(0, 120))}${(t.description || '').length > 120 ? '...' : ''}</p>
        <div style="margin-top:auto">
          ${t.taskStatus === 'available' ? `
          <button class="btn-primary w-full" onclick="acceptTask('${t.id}')">
            <i data-lucide="play" class="w-4 h-4"></i> Accepter la tâche
          </button>` : ''}
          ${t.taskStatus === 'pending' ? `
          <button class="btn-primary w-full" onclick="showSubmitProofModal('${t.id}','${escapeHtml(t.title || '')}','${escapeHtml(t.description || '')}')">
            <i data-lucide="upload" class="w-4 h-4"></i> Soumettre la preuve
          </button>` : ''}
        </div>
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("Erreur chargement tâches worker:", err);
    grid.innerHTML = '<div class="empty-state">Erreur lors du chargement.</div>';
  }
}

async function acceptTask(taskId) {
  if (currentUser.maintenance) {
    showToast('Votre compte est en maintenance. Vous ne pouvez pas accepter de tâches.', 'warning');
    return;
  }

  try {
    await db.collection('tasks').doc(taskId).update({
      workerId: currentUser.uid,
      workerUsername: currentUser.username,
      status: 'pending',
      acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('users').doc(currentUser.uid).update({
      lastActivity: firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast('Tâche acceptée ! Soumettez votre preuve.', 'success');
    loadWorkerTasks();
  } catch (err) {
    console.error("Erreur acceptation tâche:", err);
    showToast('Erreur lors de l\'acceptation', 'error');
  }
}

function showSubmitProofModal(taskId, title, description) {
  document.getElementById('task-proof-id').value = taskId;
  document.getElementById('task-proof-url').value = '';
  const instrBox = document.getElementById('task-instructions-box');
  if (instrBox) instrBox.textContent = description;
  openModal('modal-task-proof');
}

async function submitTaskProof() {
  const taskId = document.getElementById('task-proof-id').value;
  const proofUrl = document.getElementById('task-proof-url').value.trim();

  if (!proofUrl) { showToast('Veuillez fournir une URL de preuve', 'warning'); return; }

  try {
    await db.collection('tasks').doc(taskId).update({
      proofUrl,
      proofSubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    });

    await addLog('task', `Preuve soumise pour tâche ${taskId}`, currentUser.username);
    showToast('Preuve soumise ! En attente de validation.', 'success');
    closeModal();
    loadWorkerTasks();
  } catch (err) {
    console.error("Erreur soumission preuve:", err);
    showToast('Erreur lors de la soumission', 'error');
  }
}

// ─── WORKER HISTORIQUE ────────────────────────────────────────────────────────

async function loadWorkerHistory() {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Chargement...</td></tr>';

  try {
    const snap = await db.collection('transactions')
      .where('userId', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Aucune transaction</td></tr>';
      return;
    }

    const typeLabels = {
      earning: 'Gain tâche',
      withdrawal: 'Retrait',
      commission: 'Commission',
      refund: 'Remboursement',
      maintenance: 'Maintenance',
      bonus: 'Bonus'
    };

    tbody.innerHTML = snap.docs.map(d => {
      const tx = d.data();
      const isPositive = tx.amount >= 0;
      return `<tr>
        <td style="font-size:0.82rem;color:var(--text-muted)">${formatDate(tx.createdAt)}</td>
        <td style="color:var(--text-secondary)">${escapeHtml(tx.description || '—')}</td>
        <td style="font-weight:700;color:${isPositive ? 'var(--success-light)' : 'var(--danger-light)'}">
          ${isPositive ? '+' : ''}${formatCurrency(tx.amount)}
        </td>
        <td><span class="badge ${isPositive ? 'badge-green' : 'badge-red'}">${typeLabels[tx.type] || tx.type}</span></td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error("Erreur chargement historique:", err);
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-400">Erreur de chargement</td></tr>';
  }
}

// ─── WORKER MAINTENANCE ───────────────────────────────────────────────────────

/**
 * Charger la page de maintenance du worker avec les numéros de paiement
 */
async function loadMaintenancePage() {
  try {
    // Recharger les paramètres pour avoir les numéros de paiement à jour
    await loadGlobalSettings();

    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (userDoc.exists) currentUser = { uid: currentUser.uid, ...userDoc.data() };

    const amount = currentUser.maintenanceAmount || globalSettings.maintenanceFee || 250;
    setText('worker-maintenance-amount', formatCurrency(amount));

    // Afficher les numéros de paiement
    const paymentBox = document.getElementById('payment-numbers-display');
    const moncashDiv = document.getElementById('moncash-display');
    const natcashDiv = document.getElementById('natcash-display');
    const moncashNum = document.getElementById('moncash-number-display');
    const natcashNum = document.getElementById('natcash-number-display');

    const hasMoncash = globalSettings.moncashNumber;
    const hasNatcash = globalSettings.natcashNumber;

    if (paymentBox) {
      paymentBox.classList.toggle('hidden', !hasMoncash && !hasNatcash);
    }
    if (moncashDiv && moncashNum) {
      moncashDiv.classList.toggle('hidden', !hasMoncash);
      moncashNum.textContent = globalSettings.moncashNumber || '—';
    }
    if (natcashDiv && natcashNum) {
      natcashDiv.classList.toggle('hidden', !hasNatcash);
      natcashNum.textContent = globalSettings.natcashNumber || '—';
    }

    // Si pas en maintenance, afficher un message
    const maintenanceForm = document.getElementById('maintenance-form');
    const maintenanceInfo = document.getElementById('maintenance-info');
    if (!currentUser.maintenance) {
      if (maintenanceForm) maintenanceForm.classList.add('hidden');
      if (maintenanceInfo) maintenanceInfo.innerHTML = '<p style="color:var(--success-light);font-weight:600">✅ Votre compte est actif. Aucune maintenance en cours.</p>';
    } else {
      if (maintenanceForm) maintenanceForm.classList.remove('hidden');
    }

    // Vérifier si une preuve est déjà soumise
    const maintSnap = await db.collection('maintenances')
      .where('workerId', '==', currentUser.uid)
      .where('status', '==', 'paid')
      .get();

    if (!maintSnap.empty) {
      const submittedMsg = document.getElementById('maintenance-submitted-msg');
      if (submittedMsg) submittedMsg.classList.remove('hidden');
      const submitBtn = document.getElementById('submit-proof-btn');
      if (submitBtn) submitBtn.disabled = true;
    }

  } catch (err) {
    console.error("Erreur page maintenance:", err);
  }
}

/**
 * Gérer la sélection d'un fichier pour la preuve de maintenance
 */
function handleMaintenanceFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const zone = document.getElementById('maintenance-file-zone');
  if (zone) {
    zone.innerHTML = `
      <i data-lucide="check-circle" class="w-8 h-8" style="color:var(--success-light)"></i>
      <p style="color:var(--success-light);font-weight:600">${escapeHtml(file.name)}</p>
      <p style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">Fichier prêt à l'envoi (${(file.size / 1024).toFixed(1)} KB)</p>
    `;
    if (window.lucide) lucide.createIcons();
  }
}

/**
 * Upload d'une image vers ImgBB
 */
async function uploadToImgbb(file) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('key', IMGBB_API_KEY);

  const progressContainer = document.getElementById('upload-progress-container');
  const progressBar = document.getElementById('upload-progress-bar');
  const progressText = document.getElementById('upload-progress-text');

  if (progressContainer) progressContainer.classList.remove('hidden');
  if (progressBar) progressBar.style.width = '0%';
  if (progressText) progressText.textContent = 'Upload en cours...';

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressText) progressText.textContent = `Upload en cours... ${pct}%`;
      }
    });

    xhr.addEventListener('load', () => {
      if (progressContainer) progressContainer.classList.add('hidden');
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.success && data.data && data.data.url) {
            resolve(data.data.url);
          } else {
            reject(new Error('Réponse ImgBB invalide'));
          }
        } catch {
          reject(new Error('Erreur parsing réponse ImgBB'));
        }
      } else {
        reject(new Error(`Erreur HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      if (progressContainer) progressContainer.classList.add('hidden');
      reject(new Error('Erreur réseau lors de l\'upload'));
    });

    xhr.open('POST', 'https://api.imgbb.com/1/upload');
    xhr.send(formData);
  });
}

/**
 * Soumettre la preuve de maintenance
 */
async function submitMaintenanceProof() {
  const urlInput = document.getElementById('maintenance-proof-url')?.value.trim();
  const fileInput = document.getElementById('maintenance-file');
  const file = fileInput?.files[0];

  const btn = document.getElementById('submit-proof-btn');
  const btnText = document.getElementById('submit-proof-btn-text');
  const spinner = document.getElementById('submit-proof-spinner');

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Soumission...';
  if (spinner) spinner.classList.remove('hidden');

  try {
    let proofUrl = urlInput;

    // Upload si fichier sélectionné
    if (file) {
      if (IMGBB_API_KEY === '555e4fae57d7a9f253b9a34addfe8609') {
        showToast('Clé ImgBB non configurée. Utilisez une URL manuelle.', 'warning');
        return;
      }
      showToast('Upload de l\'image en cours...', 'info');
      proofUrl = await uploadToImgbb(file);
    }

    if (!proofUrl) { showToast('Veuillez fournir une URL ou sélectionner une image', 'warning'); return; }

    // Trouver la maintenance active
    const maintSnap = await db.collection('maintenances')
      .where('workerId', '==', currentUser.uid)
      .where('status', '==', 'active')
      .get();

    if (maintSnap.empty) {
      showToast('Aucune maintenance active trouvée', 'warning');
      return;
    }

    const batch = db.batch();
    maintSnap.docs.forEach(d => {
      batch.update(d.ref, {
        status: 'paid',
        proofUrl,
        paidAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();

    await addLog('maintenance', `Preuve soumise par ${currentUser.username}`, currentUser.username);

    const submittedMsg = document.getElementById('maintenance-submitted-msg');
    if (submittedMsg) submittedMsg.classList.remove('hidden');
    if (btn) btn.disabled = true;
    showToast('Preuve soumise avec succès !', 'success');

  } catch (err) {
    console.error("Erreur soumission preuve maintenance:", err);
    showToast(`Erreur : ${err.message}`, 'error');
    if (btn) btn.disabled = false;
  } finally {
    if (btnText) btnText.textContent = 'Soumettre la preuve';
    if (spinner) spinner.classList.add('hidden');
  }
}

// ─── WORKER RETRAIT ───────────────────────────────────────────────────────────

async function loadWorkerWithdrawal() {
  // Afficher le solde
  const userDoc = await db.collection('users').doc(currentUser.uid).get();
  if (userDoc.exists) currentUser = { uid: currentUser.uid, ...userDoc.data() };

  setText('wd-balance', formatCurrency(currentUser.balance || 0));

  // Charger les retraits du worker
  const myWithdrawals = document.getElementById('my-withdrawals-list');
  if (myWithdrawals) {
    try {
      const snap = await db.collection('withdrawals')
        .where('userId', '==', currentUser.uid)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      if (snap.empty) {
        myWithdrawals.innerHTML = '<div class="empty-state-sm">Aucun retrait</div>';
      } else {
        myWithdrawals.innerHTML = snap.docs.map(d => {
          const w = d.data();
          const statusColors = { pending: 'yellow', approved: 'green', rejected: 'red' };
          return `<div class="mini-item">
            <div class="mini-info">
              <p class="mini-name">${escapeHtml(w.method || 'MonCash')} — ${escapeHtml(w.phone || '—')}</p>
              <p class="mini-sub">${formatDate(w.createdAt)}</p>
            </div>
            <div style="text-align:right">
              <p class="mini-amount red">${formatCurrency(w.amount || 0)}</p>
              <span class="badge badge-${statusColors[w.status] || 'gray'}" style="font-size:0.65rem">${w.status}</span>
            </div>
          </div>`;
        }).join('');
      }
    } catch (err) {
      myWithdrawals.innerHTML = '<div class="empty-state-sm">Erreur de chargement</div>';
    }
  }
}

function selectMethod(method) {
  selectedWithdrawalMethod = method;
  document.getElementById('method-moncash')?.classList.toggle('selected', method === 'MonCash');
  document.getElementById('method-natcash')?.classList.toggle('selected', method === 'Natcash');
}

async function requestWithdrawal() {
  const amount = parseFloat(document.getElementById('wd-amount')?.value);
  const phone = document.getElementById('wd-phone')?.value.trim();
  const errorEl = document.getElementById('withdrawal-error');
  const errorMsg = document.getElementById('withdrawal-error-msg');
  const btn = document.getElementById('withdrawal-btn');
  const btnText = document.getElementById('withdrawal-btn-text');
  const spinner = document.getElementById('withdrawal-spinner');

  const showError = (msg) => {
    if (errorEl && errorMsg) { errorMsg.textContent = msg; errorEl.classList.remove('hidden'); }
  };
  const hideError = () => { errorEl?.classList.add('hidden'); };

  hideError();

  if (isNaN(amount) || amount < MIN_WITHDRAWAL) {
    showError(`Montant minimum : ${formatCurrency(MIN_WITHDRAWAL)}`);
    return;
  }
  if (amount > (currentUser.balance || 0)) {
    showError('Solde insuffisant');
    return;
  }
  if (!phone) {
    showError('Veuillez entrer votre numéro de téléphone');
    return;
  }
  if (currentUser.maintenance) {
    showError('Votre compte est en maintenance. Vous ne pouvez pas effectuer de retrait.');
    return;
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Traitement...';
  if (spinner) spinner.classList.remove('hidden');

  try {
    const batch = db.batch();

    // Déduire du solde
    batch.update(db.collection('users').doc(currentUser.uid), {
      balance: firebase.firestore.FieldValue.increment(-amount)
    });

    // Créer la demande de retrait
    const wdRef = db.collection('withdrawals').doc();
    batch.set(wdRef, {
      userId: currentUser.uid,
      username: currentUser.username,
      amount,
      method: selectedWithdrawalMethod,
      phone,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Transaction
    const txRef = db.collection('transactions').doc();
    batch.set(txRef, {
      userId: currentUser.uid,
      type: 'withdrawal',
      amount: -amount,
      description: `Retrait ${selectedWithdrawalMethod} — ${phone}`,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    currentUser.balance = (currentUser.balance || 0) - amount;
    setText('wd-balance', formatCurrency(currentUser.balance));
    updateTopbarBalance();

    await addLog('withdrawal', `Retrait demandé : ${formatCurrency(amount)} via ${selectedWithdrawalMethod} (${phone})`, currentUser.username);
    showToast('Demande de retrait soumise !', 'success');

    // Vider les champs
    if (document.getElementById('wd-amount')) document.getElementById('wd-amount').value = '';
    if (document.getElementById('wd-phone')) document.getElementById('wd-phone').value = '';

    loadWorkerWithdrawal();
  } catch (err) {
    console.error("Erreur retrait:", err);
    showError('Erreur lors de la demande. Réessayez.');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Envoyer la demande';
    if (spinner) spinner.classList.add('hidden');
  }
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

/**
 * Démarrer le listener temps réel des notifications
 */
function startNotificationListener() {
  if (!currentUser) return;
  if (notificationListener) notificationListener();

  notificationListener = db.collection('notifications')
    .where('userId', '==', currentUser.uid)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .onSnapshot(snap => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const unread = notifs.filter(n => !n.read).length;

      // Badge
      const badge = document.getElementById('notif-badge');
      if (badge) {
        badge.textContent = unread;
        badge.classList.toggle('hidden', unread === 0);
      }

      // Dropdown list
      renderNotificationDropdown(notifs);
    }, err => {
      console.error("Erreur listener notifications:", err);
    });
}

function renderNotificationDropdown(notifs) {
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (!notifs.length) {
    list.innerHTML = '<div class="notif-empty">Aucune notification</div>';
    return;
  }

  list.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="markNotifRead('${n.id}')">
      <p class="notif-item-text">${escapeHtml(n.message || n.title || '—')}</p>
      <p class="notif-item-time">${formatDate(n.createdAt)}</p>
    </div>
  `).join('');
}

function toggleNotifications() {
  const dropdown = document.getElementById('notif-dropdown');
  if (dropdown) dropdown.classList.toggle('hidden');
}

async function markAllRead() {
  try {
    const snap = await db.collection('notifications')
      .where('userId', '==', currentUser.uid)
      .where('read', '==', false)
      .get();

    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();

    showToast('Toutes les notifications lues', 'success');
    loadWorkerNotifications();
  } catch (err) {
    console.error("Erreur mark all read:", err);
  }
}

async function markNotifRead(notifId) {
  try {
    await db.collection('notifications').doc(notifId).update({ read: true });
  } catch { /* ignore */ }
}

async function loadWorkerNotifications() {
  const list = document.getElementById('all-notifications-list');
  if (!list) return;

  try {
    const snap = await db.collection('notifications')
      .where('userId', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    if (snap.empty) {
      list.innerHTML = '<div class="empty-state-sm">Aucune notification</div>';
      return;
    }

    list.innerHTML = snap.docs.map(n => {
      const data = { id: n.id, ...n.data() };
      return `<div class="notif-page-item ${data.read ? '' : 'unread'}" onclick="markNotifRead('${data.id}')">
        <div class="notif-dot ${data.read ? 'read' : ''}"></div>
        <div style="flex:1">
          <p style="font-weight:600;font-size:0.875rem;color:var(--text-primary);margin-bottom:2px">${escapeHtml(data.title || '—')}</p>
          <p style="font-size:0.82rem;color:var(--text-secondary)">${escapeHtml(data.message || '—')}</p>
          <p style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">${formatDate(data.createdAt)}</p>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    list.innerHTML = '<div class="empty-state-sm">Erreur de chargement</div>';
  }
}

// ─── OFFERWALLS ───────────────────────────────────────────────────────────────

function openOfferwall(name) {
  const urls = {
    monlix: 'https://monlix.com',
    adscend: 'https://adscendmedia.com',
    ayet: 'https://www.ayetstudios.com',
    offertoro: 'https://www.offertoro.com'
  };

  const titles = {
    monlix: 'Monlix',
    adscend: 'Adscend Media',
    ayet: 'AyetStudios',
    offertoro: 'Offertoro'
  };

  const container = document.getElementById('offerwall-iframe-container');
  const iframe = document.getElementById('offerwall-iframe');
  const title = document.getElementById('offerwall-iframe-title');

  if (container && iframe && title) {
    title.textContent = titles[name] || name;
    iframe.src = urls[name] || '';
    container.classList.remove('hidden');
    container.scrollIntoView({ behavior: 'smooth' });
  }
}

function closeOfferwall() {
  const container = document.getElementById('offerwall-iframe-container');
  const iframe = document.getElementById('offerwall-iframe');
  if (container) container.classList.add('hidden');
  if (iframe) iframe.src = '';
}

// ─── MODALES UTILITAIRES ──────────────────────────────────────────────────────

function openModal(modalId) {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById(modalId);
  if (overlay) overlay.classList.remove('hidden');
  if (modal) modal.classList.remove('hidden');
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function showConfirmModal(title, message, onConfirm) {
  const titleEl = document.getElementById('confirm-title');
  const msgEl = document.getElementById('confirm-message');
  const btn = document.getElementById('confirm-action-btn');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (btn) {
    // Retirer l'ancien listener
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', async () => {
      closeModal();
      await onConfirm();
    });
  }

  openModal('modal-confirm');
}

// ─── LOGS ─────────────────────────────────────────────────────────────────────

/**
 * Ajouter un log d'activité dans Firestore
 */
async function addLog(type, action, username, extra = {}) {
  try {
    await db.collection('logs').add({
      type,
      action,
      username: username || currentUser?.username || 'system',
      ...extra,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.warn("Erreur ajout log:", err);
  }
}

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────

/**
 * Formater une valeur en HTG
 */
function formatCurrency(amount) {
  if (isNaN(amount) || amount === null || amount === undefined) return '0 HTG';
  return `${Number(amount).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} HTG`;
}

/**
 * Formater une date Firebase Timestamp ou Date
 */
function formatDate(ts) {
  if (!ts) return '—';
  let date;
  if (ts.toDate) date = ts.toDate();
  else if (ts instanceof Date) date = ts;
  else date = new Date(ts);

  if (isNaN(date.getTime())) return '—';

  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'À l\'instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  if (days < 7) return `Il y a ${days}j`;

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

/**
 * Générer un mot de passe aléatoire sécurisé
 */
function generateRandomPassword(length = 10) {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

/**
 * Obtenir les infos du badge selon le nombre de tâches complétées
 */
function getBadgeInfo(completedTasks) {
  if (completedTasks >= 500) {
    return { icon: '💎', name: 'Diamant', nextName: 'Légende', nextTarget: 1000, color: '#a78bfa' };
  } else if (completedTasks >= 200) {
    return { icon: '🏆', name: 'Platine', nextName: 'Diamant', nextTarget: 500, color: '#e2e8f0' };
  } else if (completedTasks >= 100) {
    return { icon: '🥇', name: 'Or', nextName: 'Platine', nextTarget: 200, color: '#facc15' };
  } else if (completedTasks >= 50) {
    return { icon: '🥈', name: 'Argent', nextName: 'Or', nextTarget: 100, color: '#cbd5e1' };
  } else {
    return { icon: '🥉', name: 'Bronze', nextName: 'Argent', nextTarget: 50, color: '#d4a574' };
  }
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
    .replace(/'/g, '&#x27;');
}

/**
 * Définir le texte d'un élément par ID
 */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/**
 * Afficher un toast de notification
 */
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i data-lucide="${icons[type] || 'info'}" style="width:18px;height:18px;flex-shrink:0"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── FERMER LE DROPDOWN NOTIFICATIONS EN CLIQUANT AILLEURS ───────────────────

document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notif-dropdown');
  const toggle = document.getElementById('notif-toggle');
  if (dropdown && toggle && !dropdown.contains(e.target) && !toggle.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

// ─── RACCOURCIS CLAVIER ────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
  }
});

// ─── EXPOSE GLOBALE (nécessaire pour les onclick HTML) ─────────────────────────
// Toutes les fonctions sont déjà globales car déclarées avec function (non const/let)
// au niveau du module. Aucune action supplémentaire requise.

console.log('✅ HBW Task app.js chargé avec succès — Version 1.1.0');
