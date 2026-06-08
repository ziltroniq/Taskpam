/* =============================================================
   HBW TASK & TRAVAIL EN LIGNE — app.js  v2.0.0
   Firebase (Firestore + Auth) + JavaScript Vanilla
   Toute l'interface est en FRANÇAIS
   ============================================================= */

/*
 * ============================================================
 *  RÈGLES FIRESTORE RECOMMANDÉES (à copier dans la console Firebase)
 * ============================================================
 *
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *
 *     // ─── Fonctions helpers ────────────────────────────────
 *     function isAuth() {
 *       return request.auth != null;
 *     }
 *     function isAdmin() {
 *       return isAuth() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
 *     }
 *     function isManager() {
 *       return isAuth() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'manager';
 *     }
 *     function isWorker() {
 *       return isAuth() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'worker';
 *     }
 *     function isSelf(uid) {
 *       return isAuth() && request.auth.uid == uid;
 *     }
 *
 *     // ─── Collection : users ───────────────────────────────
 *     match /users/{uid} {
 *       allow read: if isAuth();
 *       allow create: if isAdmin() || isManager();
 *       allow update: if isSelf(uid) || isAdmin() || isManager();
 *       allow delete: if isAdmin();
 *     }
 *
 *     // ─── Collection : tasks ───────────────────────────────
 *     match /tasks/{taskId} {
 *       allow read: if isAuth();
 *       allow create: if isAdmin();
 *       allow update: if isAuth();
 *       allow delete: if isAdmin();
 *     }
 *
 *     // ─── Collection : withdrawals ─────────────────────────
 *     match /withdrawals/{id} {
 *       allow read: if isAuth();
 *       allow create: if isAuth();
 *       allow update: if isAdmin();
 *       allow delete: if isAdmin();
 *     }
 *
 *     // ─── Collection : maintenances ────────────────────────
 *     match /maintenances/{id} {
 *       allow read: if isAuth();
 *       allow create: if isAdmin() || isManager();
 *       allow update: if isAuth();
 *       allow delete: if isAdmin();
 *     }
 *
 *     // ─── Collection : teams ───────────────────────────────
 *     match /teams/{id} {
 *       allow read: if isAuth();
 *       allow create, update, delete: if isAdmin();
 *     }
 *
 *     // ─── Collection : logs ────────────────────────────────
 *     match /logs/{id} {
 *       allow read: if isAdmin();
 *       allow create: if isAuth();
 *       allow update, delete: if isAdmin();
 *     }
 *
 *     // ─── Collection : transactions ────────────────────────
 *     match /transactions/{id} {
 *       allow read: if isAuth();
 *       allow create: if isAuth();
 *       allow update, delete: if isAdmin();
 *     }
 *
 *     // ─── Collection : notifications ───────────────────────
 *     match /notifications/{id} {
 *       allow read: if isAuth() && (isAdmin() || request.auth.uid == resource.data.userId);
 *       allow create: if isAuth();
 *       allow update: if isAuth() && (isAdmin() || request.auth.uid == resource.data.userId);
 *       allow delete: if isAdmin();
 *     }
 *
 *     // ─── Collection : messages ────────────────────────────
 *     match /messages/{id} {
 *       allow read: if isAuth();
 *       allow create: if isManager() || isAdmin();
 *       allow update, delete: if isAdmin();
 *     }
 *
 *     // ─── Collection : signals ─────────────────────────────
 *     match /signals/{id} {
 *       allow read: if isAdmin() || isManager();
 *       allow create: if isManager() || isAdmin();
 *       allow update, delete: if isAdmin();
 *     }
 *
 *     // ─── Collection : settings ────────────────────────────
 *     match /settings/{id} {
 *       allow read: if isAuth();
 *       allow write: if isAdmin();
 *     }
 *   }
 * }
 */

/* =============================================================
   1. CONFIGURATION FIREBASE
   ============================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyAbRFgL4jxSbBgc7FhIORKyOEq7N163_AQ",
  authDomain: "hbwtaskpam.firebaseapp.com",
  projectId: "hbwtaskpam",
  storageBucket: "hbwtaskpam.appspot.com",
  messagingSenderId: "142029895340",
  appId: "1:142029895340:web:ce94830569430491ef5109"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

/* =============================================================
   2. ÉTAT GLOBAL
   ============================================================= */
let currentUser      = null;   // document Firestore de l'utilisateur connecté
let currentUserAuth  = null;   // objet Firebase Auth
let globalSettings   = {};     // paramètres globaux (settings/global)
let allUsersCache    = [];      // cache local de la liste des users
let allTeamsCache    = [];      // cache local des équipes
let listeners        = [];     // Firestore listeners à détacher au logout
let adminEarningsChart   = null;
let managerChart         = null;
let currentWithdrawalTab = 'pending';
let currentTaskTab       = 'available';
let currentMaintenanceTab = 'list';
let currentLogPage       = 0;
const LOGS_PER_PAGE      = 25;
let logsCache            = [];
let umCache              = [];  // user management cache
let selectedMethod       = 'MonCash';
let selectedManagerMethod = 'MonCash';
let activeMaintWorker    = null; // worker sélectionné pour maintenance
let signalWorkerData     = {};
let generatedCredentials = {};

const IMGBB_API_KEY = "555e4fae57d7a9f253b9a34addfe8609"; // clé publique gratuite ImgBB

/* =============================================================
   3. UTILITAIRES GÉNÉRAUX
   ============================================================= */

/** Formatage monétaire HTG */
function formatCurrency(amount) {
  if (amount === undefined || amount === null) return '0 HTG';
  return Number(amount).toLocaleString('fr-HT', { minimumFractionDigits: 0 }) + ' HTG';
}

/** Formatage de date relative */
function formatDate(ts) {
  if (!ts) return '—';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const now   = new Date();
  const diff  = Math.floor((now - date) / 1000);
  if (diff < 60) return 'À l\'instant';
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} j`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Formatage de date absolue */
function formatDateAbs(ts) {
  if (!ts) return '—';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/** Génère un mot de passe aléatoire */
function generateRandomPassword(length = 6) {
  const chars = '123456789';
  let pwd = '';
  for (let i = 0; i < length; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

/** Génère un username unique type worker_XXXXX */
function generateWorkerCredentials() {
  const num = String(Math.floor(10000 + Math.random() * 90000));
  const username = 'worker_' + num;
  const email    = username + '@hbwtask.com';
  const password = generateRandomPassword(10);
  generatedCredentials = { username, email, password };
  setText('gen-username', username);
  setText('gen-email', email);
  setText('gen-password', password);
  return generatedCredentials;
}

/** Badge selon les tâches complétées */
function getBadgeInfo(completedTasks) {
  if (completedTasks >= 500)  return { name: 'Diamant',  icon: '💎', color: '#00d4ff', next: null,    nextCount: 500 };
  if (completedTasks >= 200)  return { name: 'Platine',  icon: '🏅', color: '#e5e7eb', next: 'Diamant', nextCount: 500 };
  if (completedTasks >= 100)  return { name: 'Or',       icon: '🥇', color: '#ffd700', next: 'Platine', nextCount: 200 };
  if (completedTasks >= 50)   return { name: 'Argent',   icon: '🥈', color: '#c0c0c0', next: 'Or',     nextCount: 100 };
  return                              { name: 'Bronze',  icon: '🥉', color: '#cd7f32', next: 'Argent',  nextCount: 50  };
}

/** Protection XSS */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Raccourci textContent */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/** Afficher/masquer un élément */
function show(id)   { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); }
function hide(id)   { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
function toggle(id) { const el = document.getElementById(id); if (el) el.classList.toggle('hidden'); }

/** Ajouter un log Firestore */
async function addLog(type, action, username) {
  try {
    await db.collection('logs').add({
      type,
      action,
      username: username || (currentUser ? currentUser.username : 'system'),
      userId: currentUserAuth ? currentUserAuth.uid : null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.warn('Log error:', e); }
}

/** Créer une notification pour un utilisateur */
async function createNotification(userId, title, message, type = 'info') {
  try {
    await db.collection('notifications').add({
      userId, title, message, type,
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.warn('Notification error:', e); }
}

/* =============================================================
   4. TOASTS
   ============================================================= */
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
  toast.innerHTML = `<i data-lucide="${icons[type] || 'info'}" class="w-4 h-4"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  if (window.lucide) lucide.createIcons({ nodes: [toast] });
  setTimeout(() => { toast.classList.add('toast-hide'); setTimeout(() => toast.remove(), 400); }, duration);
}

/* =============================================================
   5. MODALES
   ============================================================= */
let activeModal = null;

function openModal(modalId) {
  closeModal();
  const overlay = document.getElementById('modal-overlay');
  const modal   = document.getElementById(modalId);
  if (!modal) return;
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
  activeModal = modalId;
  if (window.lucide) lucide.createIcons();
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  if (activeModal) {
    const m = document.getElementById(activeModal);
    if (m) m.classList.add('hidden');
    activeModal = null;
  }
  // Fermer aussi toutes les modales ouvertes par sécurité
  document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
}

function showConfirm(title, message, onConfirm) {
  setText('confirm-title', title);
  const msg = document.getElementById('confirm-message');
  if (msg) msg.textContent = message;
  const btn = document.getElementById('confirm-action-btn');
  if (btn) {
    btn.onclick = () => { closeModal(); onConfirm(); };
  }
  openModal('modal-confirm');
}

/* =============================================================
   6. UPLOAD IMGBB
   ============================================================= */
async function uploadToImgbb(file) {
  if (!file) throw new Error('Aucun fichier sélectionné');
  if (!IMGBB_API_KEY || IMGBB_API_KEY.length < 10) {
    throw new Error('Clé API ImgBB non configurée');
  }

  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Échec de l\'upload');
  }

  return data.data.url;   // URL directe de l’image
                                                           }
    xhr.onerror = () => {
      if (container) container.classList.add('hidden');
      reject(new Error('Erreur réseau lors de l\'upload'));
    };

    xhr.send(formData);
  });
}

/* =============================================================
   7. SPLASH SCREEN
   ============================================================= */
function startSplash() {
  const title    = document.getElementById('splash-title');
  const cursor   = document.getElementById('splash-cursor');
  const progress = document.getElementById('splash-progress-bar');
  const loader   = document.getElementById('splash-loader-text');
  const text     = 'HBW Agency Haiti';
  let idx = 0;

  // Animation machine à écrire
  const typeTimer = setInterval(() => {
    if (idx < text.length) {
      if (title) title.textContent += text[idx];
      idx++;
    } else {
      clearInterval(typeTimer);
      if (cursor) cursor.style.animation = 'none';
    }
  }, 90);

  // Barre de progression 0→100% en 3 secondes
  let pct = 0;
  const progTimer = setInterval(() => {
    pct += 1;
    if (progress) progress.style.width = pct + '%';
    if (pct >= 100) clearInterval(progTimer);
  }, 30);

  // Message si Auth tarde > 3s
  setTimeout(() => {
    if (loader) loader.textContent = 'Connexion au serveur...';
  }, 3000);
}

function hideSplash() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  splash.classList.add('fade-out');
  setTimeout(() => { splash.style.display = 'none'; }, 600);
}

/* =============================================================
   8. AUTHENTIFICATION
   ============================================================= */
const ADMIN_EMAILS = ['admin@hbwtask.com', 'admin@taskpam.com'];

async function handleLogin() {
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const errorDiv      = document.getElementById('login-error');
  const errorMsg      = document.getElementById('login-error-msg');
  const btn           = document.getElementById('login-btn');
  const btnText       = document.getElementById('login-btn-text');
  const spinner       = document.getElementById('login-spinner');

  const username = usernameInput?.value.trim();
  const password = passwordInput?.value;

  if (!username || !password) {
    showLoginError('Veuillez remplir tous les champs.');
    return;
  }

  // Spinner
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Connexion...';
  if (spinner) spinner.classList.remove('hidden');
  if (errorDiv) errorDiv.classList.add('hidden');

  try {
    // Construire l'email à partir du username
    let email = username.includes('@') ? username : username + '@hbwtask.com';

    // Essayer les deux domaines admin si c'est un admin
    let credential = null;
    let lastError  = null;

    // On essaie d'abord l'email construit, puis les deux emails admin
    const emailsToTry = [email];
    if (!email.includes('@')) {
      emailsToTry.push(username + '@taskpam.com');
    }
    // Si c'est exactement un des deux admins ou ressemble à admin
    if (username.toLowerCase().startsWith('admin')) {
      for (const ae of ADMIN_EMAILS) {
        if (!emailsToTry.includes(ae)) emailsToTry.push(ae);
      }
    }

    for (const tryEmail of emailsToTry) {
      try {
        credential = await auth.signInWithEmailAndPassword(tryEmail, password);
        break;
      } catch (err) {
        lastError = err;
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') break;
      }
    }

    if (!credential) throw lastError;

    // Auth réussie → onAuthStateChanged prendra le relais

  } catch (err) {
    let msg = 'Erreur de connexion.';
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')
      msg = 'Utilisateur introuvable. Vérifiez votre identifiant.';
    else if (err.code === 'auth/wrong-password')
      msg = 'Mot de passe incorrect.';
    else if (err.code === 'auth/too-many-requests')
      msg = 'Trop de tentatives. Veuillez réessayer dans quelques minutes.';
    else if (err.code === 'auth/invalid-email')
      msg = 'Format d\'email invalide.';
    else if (err.message)
      msg = err.message;

    showLoginError(msg);

    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Se connecter';
    if (spinner) spinner.classList.add('hidden');
  }
}

function showLoginError(msg) {
  const errorDiv = document.getElementById('login-error');
  const errorMsg = document.getElementById('login-error-msg');
  if (errorDiv) errorDiv.classList.remove('hidden');
  if (errorMsg) errorMsg.textContent = msg;
}

async function handleLogout() {
  // Détacher tous les listeners
  listeners.forEach(unsub => { try { unsub(); } catch (e) {} });
  listeners = [];

  // Détruire les charts
  if (adminEarningsChart) { adminEarningsChart.destroy(); adminEarningsChart = null; }
  if (managerChart)       { managerChart.destroy(); managerChart = null; }

  currentUser     = null;
  currentUserAuth = null;
  allUsersCache   = [];
  allTeamsCache   = [];

  await auth.signOut();
  showLoginScreen();
  showToast('Vous avez été déconnecté.', 'info');
  addLog('login', 'Déconnexion', '—');
}

function togglePassword() {
  const input = document.getElementById('login-password');
  const icon  = document.getElementById('eye-icon');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) { icon.setAttribute('data-lucide', 'eye-off'); lucide.createIcons({ nodes: [icon.parentElement] }); }
  } else {
    input.type = 'password';
    if (icon) { icon.setAttribute('data-lucide', 'eye'); lucide.createIcons({ nodes: [icon.parentElement] }); }
  }
}

/* =============================================================
   9. INITIALISATION APRÈS CONNEXION
   ============================================================= */
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    hideSplash();
    showLoginScreen();
    return;
  }

  currentUserAuth = user;

  try {
    // Charger le doc utilisateur
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
      await auth.signOut();
      hideSplash();
      showLoginScreen();
      showLoginError('Compte introuvable dans la base de données.');
      return;
    }

    currentUser = { id: user.uid, ...userDoc.data() };

    // Charger les paramètres globaux
    try {
      const settingsDoc = await db.collection('settings').doc('global').get();
      if (settingsDoc.exists) globalSettings = settingsDoc.data();
    } catch (e) { console.warn('Settings:', e); }

    hideSplash();
    showApp();

  } catch (err) {
    console.error('onAuthStateChanged error:', err);
    hideSplash();
    showLoginScreen();
    showLoginError('Erreur lors du chargement du profil. Réessayez.');
  }
});

/* =============================================================
   10. ÉCRANS PRINCIPAUX
   ============================================================= */
function showLoginScreen() {
  hide('app');
  hide('splash-screen');
  const ls = document.getElementById('login-screen');
  if (ls) {
    ls.classList.remove('hidden');
    // Réinitialiser le formulaire
    const u = document.getElementById('login-username');
    const p = document.getElementById('login-password');
    if (u) u.value = '';
    if (p) p.value = '';
    hide('login-error');
    const btn = document.getElementById('login-btn');
    const btnText = document.getElementById('login-btn-text');
    const spinner = document.getElementById('login-spinner');
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Se connecter';
    if (spinner) spinner.classList.add('hidden');
    if (window.lucide) lucide.createIcons();
    // Particles
    createParticles();
  }
}

function showApp() {
  hide('login-screen');
  show('app');
  buildSidebar();
  buildBottomBar();
  updateTopbarBalance();
  setupNotifications();
  // Page par défaut selon le rôle
  const role = currentUser.role;
  if      (role === 'admin')   showPage('admin-dashboard');
  else if (role === 'manager') showPage('manager-dashboard');
  else                         showPage('worker-dashboard');
  if (window.lucide) lucide.createIcons();
  addLog('login', 'Connexion réussie', currentUser.username || currentUser.email);
}

/* =============================================================
   11. NAVIGATION
   ============================================================= */
const PAGE_TITLES = {
  'admin-dashboard'      : 'Tableau de bord',
  'admin-users'          : 'Utilisateurs',
  'admin-user-management': 'Gestion des comptes',
  'admin-teams'          : 'Équipes',
  'admin-tasks'          : 'Tâches Agency',
  'admin-maintenance'    : 'Maintenances',
  'admin-withdrawals'    : 'Retraits',
  'admin-logs'           : 'Journaux',
  'admin-leaderboard'    : 'Classement',
  'admin-settings'       : 'Paramètres',
  'manager-dashboard'    : 'Tableau de bord',
  'manager-members'      : 'Membres de l\'équipe',
  'manager-messages'     : 'Messagerie',
  'manager-stats'        : 'Statistiques',
  'manager-withdrawal'   : 'Retrait',
  'manager-leaderboard'  : 'Classement',
  'manager-offerwalls'   : 'Offerwalls',
  'worker-dashboard'     : 'Tableau de bord',
  'worker-offerwalls'    : 'Offerwalls',
  'worker-tasks'         : 'Tâches disponibles',
  'worker-history'       : 'Historique',
  'worker-leaderboard'   : 'Classement',
  'worker-maintenance'   : 'Maintenance',
  'worker-withdrawal'    : 'Retrait',
  'worker-notifications' : 'Notifications',
};

function showPage(pageId) {
  // Masquer toutes les pages
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));

  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.remove('hidden');

  // Titre
  const title = PAGE_TITLES[pageId] || pageId;
  setText('page-title', title);
  setText('page-breadcrumb', 'HBW Task › ' + title);

  // Nav active
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  // Bottom bar active
  updateBottomBarActive(pageId);

  // Fermer sidebar mobile
  const sidebar = document.getElementById('sidebar');
  if (sidebar && window.innerWidth <= 1024) {
    sidebar.classList.remove('open');
    hide('sidebar-overlay');
  }

  // Charger le contenu
  loadPageContent(pageId);

  // Scroll top
  const container = document.getElementById('pages-container');
  if (container) container.scrollTop = 0;
}

function loadPageContent(pageId) {
  switch (pageId) {
    case 'admin-dashboard':       renderAdminDashboard();    break;
    case 'admin-users':           loadAdminUsers();          break;
    case 'admin-user-management': loadUserManagement();      break;
    case 'admin-teams':           loadAdminTeams();          break;
    case 'admin-tasks':           loadAdminTasks();          break;
    case 'admin-maintenance':     loadAdminMaintenance();    break;
    case 'admin-withdrawals':     loadAdminWithdrawals();    break;
    case 'admin-logs':            loadAdminLogs();           break;
    case 'admin-leaderboard':     loadLeaderboard('admin');  break;
    case 'admin-settings':        loadAdminSettings();       break;
    case 'manager-dashboard':     renderManagerDashboard();  break;
    case 'manager-members':       loadManagerMembers();      break;
    case 'manager-messages':      loadManagerMessages();     break;
    case 'manager-stats':         loadManagerStats();        break;
    case 'manager-withdrawal':    loadManagerWithdrawal();   break;
    case 'manager-leaderboard':   loadLeaderboard('manager');break;
    case 'worker-dashboard':      renderWorkerDashboard();   break;
    case 'worker-tasks':          loadWorkerTasks();         break;
    case 'worker-history':        loadWorkerHistory();       break;
    case 'worker-maintenance':    loadMaintenancePage();     break;
    case 'worker-withdrawal':     loadWorkerWithdrawal();    break;
    case 'worker-leaderboard':    loadLeaderboard('worker'); break;
    case 'worker-notifications':  loadNotificationsPage();  break;
  }
}

/* =============================================================
   12. SIDEBAR
   ============================================================= */
const SIDEBAR_ITEMS = {
  admin: [
    { page: 'admin-dashboard',       icon: 'layout-dashboard', label: 'Tableau de bord' },
    { page: 'admin-users',           icon: 'users',            label: 'Utilisateurs' },
    { page: 'admin-user-management', icon: 'shield',           label: 'Gestion comptes' },
    { page: 'admin-teams',           icon: 'layers',           label: 'Équipes' },
    { page: 'admin-tasks',           icon: 'briefcase',        label: 'Tâches Agency' },
    { page: 'admin-maintenance',     icon: 'wrench',           label: 'Maintenances' },
    { page: 'admin-withdrawals',     icon: 'arrow-down-circle',label: 'Retraits' },
    { page: 'admin-logs',            icon: 'file-text',        label: 'Journaux' },
    { page: 'admin-leaderboard',     icon: 'trophy',           label: 'Classement' },
    { page: 'admin-settings',        icon: 'settings',         label: 'Paramètres' },
  ],
  manager: [
    { page: 'manager-dashboard',     icon: 'layout-dashboard', label: 'Tableau de bord' },
    { page: 'manager-members',       icon: 'users',            label: 'Mon équipe' },
    { page: 'manager-messages',      icon: 'message-square',   label: 'Messagerie' },
    { page: 'manager-stats',         icon: 'bar-chart-2',      label: 'Statistiques' },
    { page: 'manager-withdrawal',    icon: 'arrow-up-circle',  label: 'Retrait' },
    { page: 'manager-leaderboard',   icon: 'trophy',           label: 'Classement' },
    { page: 'manager-offerwalls',    icon: 'grid',             label: 'Offerwalls' },
  ],
  worker: [
    { page: 'worker-dashboard',      icon: 'layout-dashboard', label: 'Tableau de bord' },
    { page: 'worker-tasks',          icon: 'briefcase',        label: 'Tâches disponibles' },
    { page: 'worker-offerwalls',     icon: 'grid',             label: 'Offerwalls' },
    { page: 'worker-withdrawal',     icon: 'arrow-up-circle',  label: 'Retrait' },
    { page: 'worker-history',        icon: 'history',          label: 'Historique' },
    { page: 'worker-leaderboard',    icon: 'trophy',           label: 'Classement' },
    { page: 'worker-notifications',  icon: 'bell',             label: 'Notifications' },
  ]
};

function buildSidebar() {
  if (!currentUser) return;
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  const role  = currentUser.role || 'worker';
  const items = SIDEBAR_ITEMS[role] || SIDEBAR_ITEMS.worker;

  nav.innerHTML = items.map(item => `
    <button class="nav-item" data-page="${item.page}" onclick="showPage('${item.page}')">
      <i data-lucide="${item.icon}" class="w-5 h-5"></i>
      <span>${item.label}</span>
    </button>
  `).join('');

  // Infos utilisateur
  const avatar   = document.getElementById('sidebar-avatar');
  const username = document.getElementById('sidebar-username');
  const roleBadge= document.getElementById('sidebar-role-badge');

  if (avatar)   avatar.textContent   = (currentUser.username || currentUser.displayName || 'U')[0].toUpperCase();
  if (username) username.textContent = currentUser.username || currentUser.displayName || 'Utilisateur';
  if (roleBadge) {
    const roleLabels = { admin: 'Administrateur', manager: 'Manager', worker: 'Worker' };
    roleBadge.textContent = roleLabels[role] || role;
    roleBadge.className = `user-badge badge-${role}`;
  }

  if (window.lucide) lucide.createIcons();
}

function buildBottomBar() {
  if (!currentUser) return;
  const bar  = document.getElementById('bottom-bar');
  if (!bar) return;
  const role = currentUser.role || 'worker';

  const offerwallPage = role === 'manager' ? 'manager-offerwalls' : 'worker-offerwalls';
  const tasksPage     = role === 'manager' ? 'manager-stats'      : 'worker-tasks';
  const profilePage   = role === 'admin'   ? 'admin-settings'     :
                        role === 'manager' ? 'manager-withdrawal'  : 'worker-withdrawal';

  bar.innerHTML = `
    <button class="bb-item" id="bb-item-menu" onclick="toggleSidebar()">
      <i data-lucide="menu" class="w-5 h-5"></i>
      <span>Menu</span>
    </button>
    <button class="bb-item" id="bb-item-offerwalls" onclick="showPage('${offerwallPage}')">
      <i data-lucide="grid" class="w-5 h-5"></i>
      <span>Offerwalls</span>
    </button>
    <button class="bb-item" id="bb-item-tasks" onclick="showPage('${tasksPage}')">
      <i data-lucide="briefcase" class="w-5 h-5"></i>
      <span>Tâches</span>
    </button>
    <button class="bb-item" id="bb-item-profile" onclick="showPage('${profilePage}')">
      <i data-lucide="user" class="w-5 h-5"></i>
      <span>Profil</span>
    </button>
  `;
  if (window.lucide) lucide.createIcons();
}

function updateBottomBarActive(pageId) {
  document.querySelectorAll('.bb-item').forEach(el => el.classList.remove('active'));
  const role = currentUser?.role || 'worker';
  const offerwallPage = role === 'manager' ? 'manager-offerwalls' : 'worker-offerwalls';
  const tasksPage     = role === 'manager' ? 'manager-stats'      : 'worker-tasks';
  const profilePage   = role === 'admin'   ? 'admin-settings'     :
                        role === 'manager' ? 'manager-withdrawal'  : 'worker-withdrawal';

  if      (pageId === offerwallPage) document.getElementById('bb-item-offerwalls')?.classList.add('active');
  else if (pageId === tasksPage)     document.getElementById('bb-item-tasks')?.classList.add('active');
  else if (pageId === profilePage)   document.getElementById('bb-item-profile')?.classList.add('active');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.add('hidden');
  } else {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.remove('hidden');
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const icon = document.getElementById('theme-icon');
  const isDark = html.getAttribute('data-theme') !== 'light';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  if (icon) {
    icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    if (window.lucide) lucide.createIcons({ nodes: [icon.parentElement] });
  }
  const span = icon?.nextElementSibling;
  if (span) span.textContent = isDark ? 'Mode clair' : 'Mode sombre';
}

/* =============================================================
   13. TOPBAR — SOLDE & BALANCE
   ============================================================= */
function updateTopbarBalance() {
  const balanceDiv    = document.getElementById('topbar-balance');
  const balanceAmount = document.getElementById('topbar-balance-amount');
  if (!currentUser) return;
  if (currentUser.role === 'admin') {
    if (balanceDiv) balanceDiv.classList.add('hidden');
    return;
  }
  if (balanceDiv) balanceDiv.classList.remove('hidden');
  if (balanceAmount) balanceAmount.textContent = formatCurrency(currentUser.balance || 0);
}

/* =============================================================
   14. NOTIFICATIONS
   ============================================================= */
let notifListener = null;

function setupNotifications() {
  if (!currentUser) return;
  if (notifListener) { notifListener(); notifListener = null; }

  notifListener = db.collection('notifications')
    .where('userId', '==', currentUser.id)
    .orderBy('createdAt', 'desc')
    .limit(30)
    .onSnapshot(snapshot => {
      const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const unread = notifs.filter(n => !n.read).length;

      // Badge topbar
      const badge = document.getElementById('notif-badge');
      if (badge) {
        badge.textContent = unread;
        unread > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');
      }

      // Dropdown
      renderNotifDropdown(notifs);
    });

  listeners.push(notifListener);
}

function renderNotifDropdown(notifs) {
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (!notifs || notifs.length === 0) {
    list.innerHTML = '<div class="notif-empty">Aucune notification</div>';
    return;
  }
  list.innerHTML = notifs.slice(0, 10).map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}" onclick="markNotifRead('${n.id}')">
      <div class="notif-content">
        <p class="notif-title">${escapeHtml(n.title)}</p>
        <p class="notif-msg">${escapeHtml(n.message)}</p>
        <span class="notif-time">${formatDate(n.createdAt)}</span>
      </div>
    </div>
  `).join('');
}

function toggleNotifications() {
  const dropdown = document.getElementById('notif-dropdown');
  if (dropdown) dropdown.classList.toggle('hidden');
}

async function markNotifRead(notifId) {
  try {
    await db.collection('notifications').doc(notifId).update({ read: true });
  } catch (e) { console.warn(e); }
}

async function markAllRead() {
  if (!currentUser) return;
  try {
    const snap = await db.collection('notifications')
      .where('userId', '==', currentUser.id)
      .where('read', '==', false)
      .get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
    showToast('Toutes les notifications ont été lues.', 'success');
    renderNotificationsPage(snap.docs.map(d => ({ id: d.id, ...d.data(), read: true })));
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

function loadNotificationsPage() {
  if (!currentUser) return;
  db.collection('notifications')
    .where('userId', '==', currentUser.id)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()
    .then(snap => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderNotificationsPage(notifs);
    });
}

function renderNotificationsPage(notifs) {
  const list = document.getElementById('all-notifications-list');
  if (!list) return;
  if (!notifs || notifs.length === 0) {
    list.innerHTML = '<div class="empty-state-sm">Aucune notification</div>';
    return;
  }
  list.innerHTML = notifs.map(n => `
    <div class="notif-item-full ${n.read ? '' : 'unread'}" onclick="markNotifRead('${n.id}')">
      <div class="notif-type-icon notif-icon-${n.type || 'info'}">
        <i data-lucide="${n.type === 'success' ? 'check-circle' : n.type === 'error' ? 'x-circle' : n.type === 'warning' ? 'alert-triangle' : 'bell'}" class="w-4 h-4"></i>
      </div>
      <div class="notif-content">
        <p class="notif-title">${escapeHtml(n.title)}</p>
        <p class="notif-msg">${escapeHtml(n.message)}</p>
        <span class="notif-time">${formatDateAbs(n.createdAt)}</span>
      </div>
      ${!n.read ? '<span class="notif-dot"></span>' : ''}
    </div>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

/* =============================================================
   15. ADMIN — DASHBOARD
   ============================================================= */
async function renderAdminDashboard() {
  try {
    const [usersSnap, withdrawSnap, maintenanceSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('withdrawals').where('status', '==', 'pending').get(),
      db.collection('maintenances').where('status', '==', 'pending').get(),
    ]);

    const users        = usersSnap.docs.map(d => d.data());
    const workers      = users.filter(u => u.role === 'worker');
    const managers     = users.filter(u => u.role === 'manager');
    const activeWorkers= workers.filter(u => u.active !== false && !u.maintenance);
    const totalBalance = workers.reduce((sum, u) => sum + (u.balance || 0), 0);
    const rate         = globalSettings.exchangeRate || 130;

    setText('stat-total-users',        users.length);
    setText('stat-active-workers',     activeWorkers.length);
    setText('stat-managers',           managers.length);
    setText('stat-total-balance',      formatCurrency(totalBalance));
    setText('stat-usd-equiv',          '≈ ' + (totalBalance / rate).toFixed(2) + ' USD');
    setText('stat-pending-withdrawals',withdrawSnap.size);
    setText('stat-maintenance',        maintenanceSnap.size);

    // Top Workers
    const topWorkers = [...workers]
      .sort((a, b) => (b.completedTasks || 0) - (a.completedTasks || 0))
      .slice(0, 10);
    const twList = document.getElementById('top-workers-list');
    if (twList) {
      twList.innerHTML = topWorkers.length === 0
        ? '<div class="empty-state-sm">Aucun worker</div>'
        : topWorkers.map((w, i) => {
            const badge = getBadgeInfo(w.completedTasks || 0);
            return `
              <div class="mini-list-item">
                <span class="rank-num">#${i + 1}</span>
                <span class="user-avatar-sm">${(w.username || 'W')[0].toUpperCase()}</span>
                <div class="mini-item-info">
                  <p class="mini-item-title">${escapeHtml(w.username || '—')}</p>
                  <p class="mini-item-sub">${w.completedTasks || 0} tâches · ${badge.icon} ${badge.name}</p>
                </div>
                <span class="mini-item-value">${formatCurrency(w.balance || 0)}</span>
              </div>`;
          }).join('');
    }

    // Maintenance workers
    const mainWorkers = workers.filter(u => u.maintenance);
    const mwList = document.getElementById('maintenance-workers-list');
    if (mwList) {
      mwList.innerHTML = mainWorkers.length === 0
        ? '<div class="empty-state-sm">Aucun worker en maintenance</div>'
        : mainWorkers.map(w => `
            <div class="mini-list-item">
              <i data-lucide="alert-triangle" class="w-4 h-4 text-yellow-400"></i>
              <div class="mini-item-info">
                <p class="mini-item-title">${escapeHtml(w.username || '—')}</p>
                <p class="mini-item-sub">${formatCurrency(w.maintenanceAmount || 0)}</p>
              </div>
            </div>`).join('');
    }

    // Pending withdrawals mini-list
    const pwList = document.getElementById('pending-withdrawals-list');
    if (pwList) {
      const wds = withdrawSnap.docs.map(d => d.data()).slice(0, 5);
      pwList.innerHTML = wds.length === 0
        ? '<div class="empty-state-sm">Aucun retrait en attente</div>'
        : wds.map(w => `
            <div class="mini-list-item">
              <i data-lucide="clock" class="w-4 h-4 text-yellow-400"></i>
              <div class="mini-item-info">
                <p class="mini-item-title">${escapeHtml(w.username || '—')}</p>
                <p class="mini-item-sub">${w.method || ''} · ${formatDate(w.createdAt)}</p>
              </div>
              <span class="mini-item-value">${formatCurrency(w.amount)}</span>
            </div>`).join('');
    }

    renderAdminEarningsChart();
    if (window.lucide) lucide.createIcons();

  } catch (e) {
    showToast('Erreur chargement dashboard : ' + e.message, 'error');
  }
}

/* =============================================================
   16. ADMIN — GRAPHIQUE GAINS 7 JOURS
   ============================================================= */
async function renderAdminEarningsChart() {
  const ctx = document.getElementById('admin-earnings-chart');
  if (!ctx) return;
  if (adminEarningsChart) { adminEarningsChart.destroy(); adminEarningsChart = null; }

  try {
    const days   = 7;
    const labels = [];
    const data   = [];

    for (let i = days - 1; i >= 0; i--) {
      const d   = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);
      labels.push(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));
      const snap = await db.collection('transactions')
        .where('type', '==', 'task_reward')
        .where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(d))
        .where('createdAt', '<', firebase.firestore.Timestamp.fromDate(nextD))
        .get();
      const total = snap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
      data.push(total);
    }

    adminEarningsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Gains distribués (HTG)',
          data,
          backgroundColor: 'rgba(59,130,246,0.6)',
          borderColor: 'rgba(59,130,246,1)',
          borderWidth: 1,
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } },
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'transparent' } }
        }
      }
    });
  } catch (e) { console.warn('Chart admin:', e); }
}

/* =============================================================
   17. ADMIN — UTILISATEURS
   ============================================================= */
async function loadAdminUsers() {
  const tbody = document.getElementById('users-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">Chargement...</td></tr>';

  try {
    const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
    allUsersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Remplir le filtre équipe
    const teamFilter = document.getElementById('users-team-filter');
    if (teamFilter) {
      const teams = await db.collection('teams').get();
      allTeamsCache = teams.docs.map(d => ({ id: d.id, ...d.data() }));
      teamFilter.innerHTML = '<option value="">Toutes les équipes</option>' +
        allTeamsCache.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
    }

    renderUsersTable(allUsersCache);
  } catch (e) {
    showToast('Erreur chargement utilisateurs : ' + e.message, 'error');
  }
}

function filterUsers() {
  const search    = document.getElementById('users-search')?.value.toLowerCase() || '';
  const roleF     = document.getElementById('users-role-filter')?.value || '';
  const teamF     = document.getElementById('users-team-filter')?.value || '';
  const filtered  = allUsersCache.filter(u => {
    const matchSearch = (u.username || '').toLowerCase().includes(search) ||
                        (u.displayName || '').toLowerCase().includes(search) ||
                        (u.email || '').toLowerCase().includes(search);
    const matchRole   = roleF ? u.role === roleF : true;
    const matchTeam   = teamF ? u.teamId === teamF : true;
    return matchSearch && matchRole && matchTeam;
  });
  renderUsersTable(filtered);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">Aucun utilisateur trouvé</td></tr>';
    return;
  }
  const roleLabels = { admin: 'Admin', manager: 'Manager', worker: 'Worker' };
  const teams = Object.fromEntries(allTeamsCache.map(t => [t.id, t.name]));

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div class="user-cell">
          <span class="user-avatar-sm">${(u.username || 'U')[0].toUpperCase()}</span>
          <div>
            <p class="font-medium text-sm">${escapeHtml(u.username || '—')}</p>
            <p class="text-xs text-gray-400">${escapeHtml(u.email || '')}</p>
          </div>
        </div>
      </td>
      <td><span class="badge badge-${u.role}">${roleLabels[u.role] || u.role}</span></td>
      <td>${escapeHtml(teams[u.teamId] || '—')}</td>
      <td>${formatCurrency(u.balance || 0)}</td>
      <td>${u.completedTasks || 0}</td>
      <td>
        <span class="badge ${u.active === false ? 'badge-red' : 'badge-green'}">
          ${u.active === false ? 'Inactif' : 'Actif'}
        </span>
      </td>
      <td>
        <span class="badge ${u.maintenance ? 'badge-yellow' : 'badge-green'}">
          ${u.maintenance ? 'Oui' : 'Non'}
        </span>
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" onclick="showUserDetail('${u.id}')" title="Détails">
            <i data-lucide="eye" class="w-4 h-4"></i>
          </button>
          <button class="btn-icon ${u.active === false ? 'btn-icon-green' : 'btn-icon-red'}" 
                  onclick="toggleUserActive('${u.id}', ${u.active !== false})" title="${u.active === false ? 'Activer' : 'Désactiver'}">
            <i data-lucide="${u.active === false ? 'user-check' : 'user-x'}" class="w-4 h-4"></i>
          </button>
          ${u.role === 'worker' ? `
            <button class="btn-icon btn-icon-yellow" onclick="openMaintenanceForUser('${u.id}', '${escapeHtml(u.username || '')}')" title="Maintenance">
              <i data-lucide="wrench" class="w-4 h-4"></i>
            </button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

async function showUserDetail(uid) {
  openModal('modal-user-detail');
  const body = document.getElementById('modal-user-detail-body');
  if (body) body.innerHTML = '<div class="text-center py-8 text-gray-400">Chargement...</div>';
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) { if (body) body.innerHTML = '<p class="text-red-400">Utilisateur introuvable</p>'; return; }
    const u = doc.data();
    const teams = Object.fromEntries(allTeamsCache.map(t => [t.id, t.name]));
    const badge = getBadgeInfo(u.completedTasks || 0);
    if (body) body.innerHTML = `
      <div class="user-detail-grid">
        <div class="detail-row"><span class="detail-key">Username</span><span class="detail-val">${escapeHtml(u.username || '—')}</span></div>
        <div class="detail-row"><span class="detail-key">Email</span><span class="detail-val">${escapeHtml(u.email || '—')}</span></div>
        <div class="detail-row"><span class="detail-key">Nom complet</span><span class="detail-val">${escapeHtml(u.displayName || u.firstName + ' ' + u.lastName || '—')}</span></div>
        <div class="detail-row"><span class="detail-key">Rôle</span><span class="detail-val">${u.role || '—'}</span></div>
        <div class="detail-row"><span class="detail-key">Équipe</span><span class="detail-val">${escapeHtml(teams[u.teamId] || '—')}</span></div>
        <div class="detail-row"><span class="detail-key">Solde</span><span class="detail-val">${formatCurrency(u.balance || 0)}</span></div>
        <div class="detail-row"><span class="detail-key">Tâches</span><span class="detail-val">${u.completedTasks || 0}</span></div>
        <div class="detail-row"><span class="detail-key">Badge</span><span class="detail-val">${badge.icon} ${badge.name}</span></div>
        <div class="detail-row"><span class="detail-key">Statut</span><span class="detail-val badge ${u.active === false ? 'badge-red' : 'badge-green'}">${u.active === false ? 'Inactif' : 'Actif'}</span></div>
        <div class="detail-row"><span class="detail-key">Maintenance</span><span class="detail-val badge ${u.maintenance ? 'badge-yellow' : 'badge-green'}">${u.maintenance ? 'Oui — ' + formatCurrency(u.maintenanceAmount) : 'Non'}</span></div>
        <div class="detail-row"><span class="detail-key">Téléphone</span><span class="detail-val">${escapeHtml(u.phone || '—')}</span></div>
        <div class="detail-row"><span class="detail-key">Adresse</span><span class="detail-val">${escapeHtml(u.address || '—')}</span></div>
        <div class="detail-row"><span class="detail-key">Sexe</span><span class="detail-val">${u.gender === 'M' ? 'Masculin' : u.gender === 'F' ? 'Féminin' : '—'}</span></div>
        <div class="detail-row"><span class="detail-key">Âge</span><span class="detail-val">${u.age || '—'}</span></div>
        <div class="detail-row"><span class="detail-key">Inscription</span><span class="detail-val">${formatDateAbs(u.createdAt)}</span></div>
      </div>
    `;
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

async function toggleUserActive(uid, isCurrentlyActive) {
  const action = isCurrentlyActive ? 'désactiver' : 'activer';
  showConfirm(`Confirmer`, `Voulez-vous ${action} cet utilisateur ?`, async () => {
    try {
      await db.collection('users').doc(uid).update({ active: !isCurrentlyActive });
      showToast(`Utilisateur ${isCurrentlyActive ? 'désactivé' : 'activé'} avec succès.`, 'success');
      addLog('user', `Utilisateur ${action}`, currentUser.username);
      loadAdminUsers();
    } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  });
}

function openMaintenanceForUser(uid, username) {
  activeMaintWorker = { id: uid, username };
  const select = document.getElementById('maintenance-worker-select');
  if (select) {
    select.value = uid;
    // Injecter l'option si elle n'existe pas
    let opt = select.querySelector(`option[value="${uid}"]`);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = uid;
      opt.textContent = username;
      select.appendChild(opt);
      select.value = uid;
    }
  }
  const amountInput = document.getElementById('maintenance-amount-input');
  if (amountInput) amountInput.value = globalSettings.maintenanceFee || 250;
  openModal('modal-add-maintenance');
}

function showAddMaintenanceModal() {
  activeMaintWorker = null;
  // Remplir le select avec les workers
  const select = document.getElementById('maintenance-worker-select');
  if (select) {
    const workers = allUsersCache.filter(u => u.role === 'worker' && !u.maintenance);
    select.innerHTML = '<option value="">Sélectionner un worker</option>' +
      workers.map(w => `<option value="${w.id}">${escapeHtml(w.username)}</option>`).join('');
  }
  const amountInput = document.getElementById('maintenance-amount-input');
  if (amountInput) amountInput.value = globalSettings.maintenanceFee || 250;
  openModal('modal-add-maintenance');
}

/* =============================================================
   18. ADMIN — MAINTENANCE
   ============================================================= */
async function activateMaintenance() {
  const select = document.getElementById('maintenance-worker-select');
  const amount = parseFloat(document.getElementById('maintenance-amount-input')?.value || 0);
  const reason = document.getElementById('maintenance-reason-input')?.value || '';
  const workerId = activeMaintWorker?.id || select?.value;

  if (!workerId) { showToast('Veuillez sélectionner un worker.', 'warning'); return; }
  if (!amount || amount <= 0) { showToast('Montant invalide.', 'warning'); return; }

  try {
    const worker = allUsersCache.find(u => u.id === workerId) ||
                   (await db.collection('users').doc(workerId).get()).data();

    await db.collection('users').doc(workerId).update({
      maintenance: true,
      maintenanceAmount: amount,
      maintenanceReason: reason,
      maintenanceDate: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('maintenances').add({
      workerId,
      username: worker.username || '—',
      teamId: worker.teamId || null,
      amount,
      reason,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await createNotification(workerId, 'Compte en maintenance',
      `Votre compte nécessite un paiement de ${formatCurrency(amount)}. Rendez-vous dans la section Maintenance.`, 'warning');

    closeModal();
    showToast(`Maintenance activée pour ${worker.username}.`, 'success');
    addLog('maintenance', `Maintenance activée — ${worker.username} — ${formatCurrency(amount)}`, currentUser.username);
    loadAdminMaintenance();
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

async function activateMaintenanceAll() {
  const amount = parseFloat(document.getElementById('maintenance-amount-input')?.value || 0);
  const reason = document.getElementById('maintenance-reason-input')?.value || '';
  if (!amount || amount <= 0) { showToast('Montant invalide.', 'warning'); return; }

  showConfirm('Maintenance globale', `Activer une maintenance de ${formatCurrency(amount)} sur TOUS les workers ?`, async () => {
    const workers = allUsersCache.filter(u => u.role === 'worker' && !u.maintenance);
    if (workers.length === 0) { showToast('Aucun worker à affecter.', 'info'); return; }
    try {
      const batch = db.batch();
      for (const w of workers) {
        batch.update(db.collection('users').doc(w.id), {
          maintenance: true,
          maintenanceAmount: amount,
          maintenanceReason: reason,
          maintenanceDate: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      await batch.commit();

      // Maintenances individuelles + notifications
      for (const w of workers) {
        await db.collection('maintenances').add({
          workerId: w.id, username: w.username || '—', teamId: w.teamId || null,
          amount, reason, status: 'pending',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await createNotification(w.id, 'Compte en maintenance',
          `Votre compte nécessite un paiement de ${formatCurrency(amount)}.`, 'warning');
      }

      closeModal();
      showToast(`Maintenance activée sur ${workers.length} worker(s).`, 'success');
      addLog('maintenance', `Maintenance globale — ${workers.length} workers — ${formatCurrency(amount)}`, currentUser.username);
      loadAdminMaintenance();
    } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  });
}

async function loadAdminMaintenance() {
  switchMaintenanceTab(currentMaintenanceTab);
  if (currentMaintenanceTab === 'list') await loadMaintenanceList();
  else await loadMaintenanceProofs();
}

function switchMaintenanceTab(tab) {
  currentMaintenanceTab = tab;
  const tabList   = document.getElementById('maintenance-tab-list');
  const tabProofs = document.getElementById('maintenance-tab-proofs');
  const btnList   = document.getElementById('mtab-list');
  const btnProofs = document.getElementById('mtab-proofs');

  if (tab === 'list') {
    tabList?.classList.remove('hidden');
    tabProofs?.classList.add('hidden');
    btnList?.classList.add('active');
    btnProofs?.classList.remove('active');
    loadMaintenanceList();
  } else {
    tabList?.classList.add('hidden');
    tabProofs?.classList.remove('hidden');
    btnList?.classList.remove('active');
    btnProofs?.classList.add('active');
    loadMaintenanceProofs();
  }
}

async function loadMaintenanceList() {
  const tbody = document.getElementById('maintenance-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    const snap = await db.collection('maintenances').where('status', '==', 'pending').orderBy('createdAt', 'desc').get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const teams = Object.fromEntries(allTeamsCache.map(t => [t.id, t.name]));

    if (tbody) {
      tbody.innerHTML = items.length === 0
        ? '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucune maintenance active</td></tr>'
        : items.map(m => `
            <tr>
              <td>${escapeHtml(m.username || '—')}</td>
              <td>${escapeHtml(teams[m.teamId] || '—')}</td>
              <td>${formatCurrency(m.amount)}</td>
              <td>${m.proofUrl ? `<a href="${escapeHtml(m.proofUrl)}" target="_blank" class="btn-link">Voir</a>` : '<span class="text-gray-400">—</span>'}</td>
              <td><span class="badge badge-yellow">En attente</span></td>
              <td>${formatDate(m.createdAt)}</td>
              <td>
                <button class="btn-icon btn-icon-red" onclick="cancelMaintenance('${m.id}','${m.workerId}')" title="Annuler">
                  <i data-lucide="x" class="w-4 h-4"></i>
                </button>
              </td>
            </tr>`).join('');
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

async function cancelMaintenance(maintenanceId, workerId) {
  showConfirm('Annuler la maintenance', 'Voulez-vous lever cette maintenance ?', async () => {
    try {
      await db.collection('maintenances').doc(maintenanceId).update({ status: 'cancelled' });
      await db.collection('users').doc(workerId).update({
        maintenance: false, maintenanceAmount: 0, maintenanceReason: ''
      });
      showToast('Maintenance annulée.', 'success');
      loadMaintenanceList();
    } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  });
}

async function loadMaintenanceProofs() {
  const tbody = document.getElementById('proofs-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    const snap = await db.collection('maintenances').where('status', '==', 'paid').orderBy('createdAt', 'desc').get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const badge = document.getElementById('proofs-count-badge');
    if (badge) {
      badge.textContent = items.length;
      items.length > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');
    }
    if (tbody) {
      tbody.innerHTML = items.length === 0
        ? '<tr><td colspan="6" class="text-center py-8 text-gray-400">Aucune preuve soumise</td></tr>'
        : items.map(m => `
            <tr>
              <td>${escapeHtml(m.username || '—')}</td>
              <td>—</td>
              <td>${formatCurrency(m.amount)}</td>
              <td>${formatDate(m.createdAt)}</td>
              <td>${m.proofUrl ? `<a href="${escapeHtml(m.proofUrl)}" target="_blank" class="btn-link">Voir</a>` : '—'}</td>
              <td>
                <button class="btn-sm btn-primary" onclick="viewMaintenanceProof('${m.id}')">
                  <i data-lucide="eye" class="w-4 h-4"></i> Vérifier
                </button>
              </td>
            </tr>`).join('');
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

async function viewMaintenanceProof(maintenanceId) {
  const input = document.getElementById('proof-maintenance-id');
  if (input) input.value = maintenanceId;
  try {
    const doc = await db.collection('maintenances').doc(maintenanceId).get();
    const m = doc.data();
    const body = document.getElementById('modal-maintenance-proof-body');
    if (body) {
      body.innerHTML = `
        <p><strong>Worker :</strong> ${escapeHtml(m.username || '—')}</p>
        <p><strong>Montant :</strong> ${formatCurrency(m.amount)}</p>
        <p><strong>Soumis le :</strong> ${formatDateAbs(m.proofSubmittedAt || m.createdAt)}</p>
        ${m.proofUrl ? `<img src="${escapeHtml(m.proofUrl)}" alt="Preuve" style="max-width:100%;margin-top:1rem;border-radius:8px;border:1px solid var(--border)" />` : '<p class="text-gray-400">Aucune image disponible.</p>'}
      `;
    }
    openModal('modal-maintenance-proof');
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

async function approveMaintenanceProof() {
  const maintenanceId = document.getElementById('proof-maintenance-id')?.value;
  if (!maintenanceId) return;
  try {
    const doc = await db.collection('maintenances').doc(maintenanceId).get();
    const m   = doc.data();
    await doc.ref.update({ status: 'approved' });
    // Lever la maintenance du worker
    if (m.workerId) {
      await db.collection('users').doc(m.workerId).update({
        maintenance: false, maintenanceAmount: 0, maintenanceReason: ''
      });
      await createNotification(m.workerId, 'Maintenance levée',
        'Votre preuve a été approuvée. Votre compte est de nouveau actif !', 'success');
    }
    closeModal();
    showToast('Maintenance approuvée. Compte réactivé.', 'success');
    addLog('maintenance', `Preuve maintenance approuvée — ${m.username}`, currentUser.username);
    loadMaintenanceProofs();
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

async function rejectMaintenanceProof() {
  const maintenanceId = document.getElementById('proof-maintenance-id')?.value;
  if (!maintenanceId) return;
  try {
    const doc = await db.collection('maintenances').doc(maintenanceId).get();
    const m   = doc.data();
    await doc.ref.update({ status: 'pending', proofUrl: null, proofSubmittedAt: null });
    // Remettre en maintenance
    if (m.workerId) {
      await db.collection('users').doc(m.workerId).update({ maintenance: true });
      await createNotification(m.workerId, 'Preuve rejetée',
        'Votre preuve de paiement a été rejetée. Veuillez soumettre une nouvelle preuve.', 'error');
    }
    closeModal();
    showToast('Preuve rejetée.', 'warning');
    addLog('maintenance', `Preuve maintenance rejetée — ${m.username}`, currentUser.username);
    loadMaintenanceProofs();
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

/* =============================================================
   19. ADMIN — ÉQUIPES
   ============================================================= */
async function loadAdminTeams() {
  const grid = document.getElementById('teams-grid');
  if (grid) grid.innerHTML = '<div class="empty-state">Chargement...</div>';
  try {
    const snap = await db.collection('teams').orderBy('name').get();
    allTeamsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (grid) {
      grid.innerHTML = allTeamsCache.length === 0
        ? '<div class="empty-state"><i data-lucide="layers" class="w-10 h-10 text-gray-500"></i><p>Aucune équipe créée</p></div>'
        : allTeamsCache.map(t => {
            const members = allUsersCache.filter(u => u.teamId === t.id && u.role === 'worker').length;
            const manager = allUsersCache.find(u => u.id === t.managerId);
            return `
              <div class="team-card card">
                <div class="team-card-header">
                  <h3 class="team-name">${escapeHtml(t.name)}</h3>
                  <div class="action-btns">
                    <button class="btn-icon" onclick="editTeam('${t.id}')" title="Modifier">
                      <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                    <button class="btn-icon btn-icon-red" onclick="deleteTeam('${t.id}')" title="Supprimer">
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                  </div>
                </div>
                <p class="team-manager"><i data-lucide="briefcase" class="w-3 h-3"></i> Manager : ${escapeHtml(manager?.username || t.managerName || '—')}</p>
                <p class="team-members"><i data-lucide="users" class="w-3 h-3"></i> ${members} membre(s)</p>
                <p class="team-date">Créée le ${formatDate(t.createdAt)}</p>
              </div>`;
          }).join('');
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) { showToast('Erreur équipes : ' + e.message, 'error'); }
}

function showCreateTeamModal() {
  const title = document.getElementById('modal-team-title');
  if (title) title.textContent = 'Nouvelle équipe';
  const idInput = document.getElementById('team-modal-id');
  const nameInput = document.getElementById('team-name-input');
  if (idInput) idInput.value = '';
  if (nameInput) nameInput.value = '';

  // Remplir le select manager
  const select = document.getElementById('team-manager-select');
  if (select) {
    const managers = allUsersCache.filter(u => u.role === 'manager');
    select.innerHTML = '<option value="">Sélectionner un manager</option>' +
      managers.map(m => `<option value="${m.id}">${escapeHtml(m.username)}</option>`).join('');
  }
  openModal('modal-team');
}

async function editTeam(teamId) {
  const team = allTeamsCache.find(t => t.id === teamId);
  if (!team) return;
  const title = document.getElementById('modal-team-title');
  if (title) title.textContent = 'Modifier l\'équipe';
  const idInput   = document.getElementById('team-modal-id');
  const nameInput = document.getElementById('team-name-input');
  if (idInput)   idInput.value   = teamId;
  if (nameInput) nameInput.value = team.name || '';

  const select = document.getElementById('team-manager-select');
  if (select) {
    const managers = allUsersCache.filter(u => u.role === 'manager');
    select.innerHTML = '<option value="">Sélectionner un manager</option>' +
      managers.map(m => `<option value="${m.id}" ${m.id === team.managerId ? 'selected' : ''}>${escapeHtml(m.username)}</option>`).join('');
  }
  openModal('modal-team');
}

async function saveTeam() {
  const id      = document.getElementById('team-modal-id')?.value || null;
  const name    = document.getElementById('team-name-input')?.value.trim();
  const mgr     = document.getElementById('team-manager-select')?.value || null;
  if (!name) { showToast('Nom de l\'équipe requis.', 'warning'); return; }

  try {
    const mgrDoc = mgr ? allUsersCache.find(u => u.id === mgr) : null;
    const data = {
      name, managerId: mgr || null,
      managerName: mgrDoc?.username || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (id) {
      await db.collection('teams').doc(id).update(data);
      showToast('Équipe mise à jour.', 'success');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await db.collection('teams').add(data);
      // Lier le manager à son équipe
      if (mgr) await db.collection('users').doc(mgr).update({ teamId: ref.id });
      showToast('Équipe créée !', 'success');
    }
    closeModal();
    addLog('user', `Équipe ${id ? 'modifiée' : 'créée'} : ${name}`, currentUser.username);
    loadAdminTeams();
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

async function deleteTeam(teamId) {
  const team = allTeamsCache.find(t => t.id === teamId);
  showConfirm('Supprimer l\'équipe', `Supprimer "${team?.name}" ? Les membres seront dissociés.`, async () => {
    try {
      // Dissocier les membres
      const members = allUsersCache.filter(u => u.teamId === teamId);
      const batch = db.batch();
      members.forEach(m => batch.update(db.collection('users').doc(m.id), { teamId: null }));
      await batch.commit();
      await db.collection('teams').doc(teamId).delete();
      showToast('Équipe supprimée.', 'success');
      addLog('user', `Équipe supprimée : ${team?.name}`, currentUser.username);
      loadAdminTeams();
    } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  });
}

/* =============================================================
   20. ADMIN — TÂCHES
   ============================================================= */
function switchTaskTab(tab) {
  currentTaskTab = tab;
  ['available', 'pending', 'completed'].forEach(t => {
    document.getElementById('tab-' + t)?.classList.toggle('active', t === tab);
  });
  loadAdminTasks();
}

async function loadAdminTasks() {
  const tbody = document.getElementById('admin-tasks-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    let query = db.collection('tasks').where('status', '==', currentTaskTab).orderBy('createdAt', 'desc');
    const snap = await query.get();
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (tbody) {
      tbody.innerHTML = tasks.length === 0
        ? `<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucune tâche ${currentTaskTab}</td></tr>`
        : tasks.map(t => `
            <tr>
              <td>
                <div>
                  <p class="font-medium text-sm">${escapeHtml(t.title || '—')}</p>
                  <p class="text-xs text-gray-400">${t.estimatedHours ? t.estimatedHours + 'h' : ''}</p>
                </div>
              </td>
              <td>${t.imageUrl ? `<img src="${escapeHtml(t.imageUrl)}" style="width:40px;height:40px;object-fit:cover;border-radius:6px" alt="img" />` : '—'}</td>
              <td>${formatCurrency(t.reward || 0)}</td>
              <td>${escapeHtml(t.workerUsername || '—')}</td>
              <td><span class="badge badge-${t.status === 'available' ? 'green' : t.status === 'pending' ? 'yellow' : 'blue'}">${t.status}</span></td>
              <td>${formatDate(t.createdAt)}</td>
              <td>
                <div class="action-btns">
                  ${t.status === 'pending' ? `
                    <button class="btn-icon btn-icon-green" onclick="viewTaskProofAdmin('${t.id}')" title="Voir preuve">
                      <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>` : ''}
                  <button class="btn-icon btn-icon-red" onclick="deleteTask('${t.id}')" title="Supprimer">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                  </button>
                </div>
              </td>
            </tr>`).join('');
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) { showToast('Erreur tâches : ' + e.message, 'error'); }
}

function showCreateTaskModal() {
  ['task-title-input', 'task-desc-input', 'task-tutorial-input',
   'task-reward-input', 'task-hours-input', 'task-image-url-input']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  hide('task-image-preview');
  openModal('modal-task');
}

function handleTaskImageFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const preview = document.getElementById('task-image-preview');
  const img     = document.getElementById('task-img-preview-el');
  if (preview) preview.classList.remove('hidden');
  const reader = new FileReader();
  reader.onload = e => { if (img) img.src = e.target.result; };
  reader.readAsDataURL(file);
}

async function createTask() {
  const title    = document.getElementById('task-title-input')?.value.trim();
  const desc     = document.getElementById('task-desc-input')?.value.trim();
  const tutorial = document.getElementById('task-tutorial-input')?.value.trim();
  const reward   = parseFloat(document.getElementById('task-reward-input')?.value || 0);
  const hours    = parseFloat(document.getElementById('task-hours-input')?.value || 0);
  let   imageUrl = document.getElementById('task-image-url-input')?.value.trim();

  if (!title || !desc || !reward) {
    showToast('Titre, description et récompense sont obligatoires.', 'warning');
    return;
  }

  const btnText = document.getElementById('create-task-btn-text');
  const spinner = document.getElementById('create-task-spinner');
  if (btnText) btnText.textContent = 'Création...';
  if (spinner) spinner.classList.remove('hidden');

  try {
    // Upload image si fichier sélectionné
    const fileInput = document.getElementById('task-image-file');
    if (fileInput?.files[0] && !imageUrl) {
      imageUrl = await uploadToImgbb(fileInput.files[0], 'task-upload-bar', 'upload-progress-text', 'task-upload-progress-wrap');
    }

    await db.collection('tasks').add({
      title, description: desc, tutorial: tutorial || null,
      reward, estimatedHours: hours || null,
      imageUrl: imageUrl || null,
      status: 'available',
      createdBy: currentUser.id,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    closeModal();
    showToast('Tâche créée avec succès !', 'success');
    addLog('task', `Tâche créée : ${title}`, currentUser.username);
    loadAdminTasks();
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  finally {
    if (btnText) btnText.textContent = 'Créer la tâche';
    if (spinner) spinner.classList.add('hidden');
  }
}

async function viewTaskProofAdmin(taskId) {
  document.getElementById('admin-task-proof-id').value = taskId;
  try {
    const doc  = await db.collection('tasks').doc(taskId).get();
    const task = doc.data();
    const body = document.getElementById('modal-task-proof-admin-body');
    if (body) {
      body.innerHTML = `
        <p><strong>Tâche :</strong> ${escapeHtml(task.title)}</p>
        <p><strong>Worker :</strong> ${escapeHtml(task.workerUsername || '—')}</p>
        <p><strong>Récompense :</strong> ${formatCurrency(task.reward)}</p>
        ${task.proofUrl
          ? `<img src="${escapeHtml(task.proofUrl)}" alt="Preuve" style="max-width:100%;margin-top:1rem;border-radius:8px;border:1px solid var(--border)" />`
          : '<p class="text-gray-400 mt-4">Aucune image de preuve.</p>'}
        ${task.proofNote ? `<p style="margin-top:0.5rem"><strong>Note :</strong> ${escapeHtml(task.proofNote)}</p>` : ''}
      `;
    }
    openModal('modal-task-proof-admin');
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

async function validateTaskFromModal() {
  const taskId = document.getElementById('admin-task-proof-id')?.value;
  if (!taskId) return;
  await validateTask(taskId);
  closeModal();
}

async function rejectTaskFromModal() {
  const taskId = document.getElementById('admin-task-proof-id')?.value;
  if (!taskId) return;
  await rejectTask(taskId);
  closeModal();
}

async function validateTask(taskId) {
  try {
    const doc  = await db.collection('tasks').doc(taskId).get();
    const task = doc.data();
    if (!task || task.status !== 'pending') return;

    await doc.ref.update({ status: 'completed', validatedAt: firebase.firestore.FieldValue.serverTimestamp() });

    // Créditer le worker
    if (task.workerId) {
      await db.collection('users').doc(task.workerId).update({
        balance: firebase.firestore.FieldValue.increment(task.reward || 0),
        completedTasks: firebase.firestore.FieldValue.increment(1)
      });

      await db.collection('transactions').add({
        userId: task.workerId, username: task.workerUsername,
        type: 'task_reward', amount: task.reward || 0,
        description: `Tâche validée : ${task.title}`,
        taskId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await createNotification(task.workerId, 'Tâche validée !',
        `Votre tâche "${task.title}" a été validée. +${formatCurrency(task.reward)}`, 'success');

      // Commission manager 5%
      const worker = allUsersCache.find(u => u.id === task.workerId);
      if (worker?.teamId) {
        const team = allTeamsCache.find(t => t.id === worker.teamId);
        if (team?.managerId) {
          const commission = (task.reward || 0) * 0.05;
          await db.collection('users').doc(team.managerId).update({
            balance: firebase.firestore.FieldValue.increment(commission)
          });
          await db.collection('transactions').add({
            userId: team.managerId, type: 'commission',
            amount: commission,
            description: `Commission 5% — Tâche validée de ${task.workerUsername}`,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }

    showToast('Tâche validée et worker crédité !', 'success');
    addLog('task', `Tâche validée : ${task.title} — ${task.workerUsername}`, currentUser.username);
    loadAdminTasks();
  } catch (e) { showToast('Erreur validation : ' + e.message, 'error'); }
}

async function rejectTask(taskId) {
  try {
    const doc  = await db.collection('tasks').doc(taskId).get();
    const task = doc.data();
    await doc.ref.update({
      status: 'available',
      workerId: null, workerUsername: null,
      proofUrl: null, proofNote: null,
      takenAt: null
    });
    if (task.workerId) {
      await createNotification(task.workerId, 'Preuve rejetée',
        `La preuve pour "${task.title}" a été rejetée. Veuillez soumettre une nouvelle preuve.`, 'warning');
    }
    showToast('Tâche rejetée et remise en disponible.', 'warning');
    addLog('task', `Tâche rejetée : ${task.title} — ${task.workerUsername}`, currentUser.username);
    loadAdminTasks();
  } catch (e) { showToast('Erreur rejet : ' + e.message, 'error'); }
}

async function deleteTask(taskId) {
  showConfirm('Supprimer la tâche', 'Cette action est irréversible.', async () => {
    try {
      await db.collection('tasks').doc(taskId).delete();
      showToast('Tâche supprimée.', 'success');
      loadAdminTasks();
    } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  });
}

/* =============================================================
   21. ADMIN — RETRAITS
   ============================================================= */
function switchWithdrawalTab(tab) {
  currentWithdrawalTab = tab;
  ['pending', 'approved', 'rejected'].forEach(t => {
    document.getElementById('wtab-' + t)?.classList.toggle('active', t === tab);
  });
  loadAdminWithdrawals();
}

async function loadAdminWithdrawals() {
  const tbody = document.getElementById('withdrawals-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    const snap = await db.collection('withdrawals')
      .where('status', '==', currentWithdrawalTab)
      .orderBy('createdAt', 'desc')
      .get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (tbody) {
      tbody.innerHTML = items.length === 0
        ? `<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucun retrait ${currentWithdrawalTab}</td></tr>`
        : items.map(w => `
            <tr>
              <td>${escapeHtml(w.username || '—')}</td>
              <td>${formatCurrency(w.amount)}</td>
              <td>${escapeHtml(w.method || '—')}</td>
              <td>${escapeHtml(w.phone || '—')}</td>
              <td><span class="badge badge-${w.status === 'pending' ? 'yellow' : w.status === 'approved' ? 'green' : 'red'}">${w.status}</span></td>
              <td>${formatDate(w.createdAt)}</td>
              <td>
                <div class="action-btns">
                  ${w.status === 'pending' ? `
                    <button class="btn-icon btn-icon-green" onclick="approveWithdrawal('${w.id}')">
                      <i data-lucide="check" class="w-4 h-4"></i>
                    </button>
                    <button class="btn-icon btn-icon-red" onclick="rejectWithdrawal('${w.id}')">
                      <i data-lucide="x" class="w-4 h-4"></i>
                    </button>` : '—'}
                </div>
              </td>
            </tr>`).join('');
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) { showToast('Erreur retraits : ' + e.message, 'error'); }
}

async function approveWithdrawal(wdId) {
  showConfirm('Approuver le retrait', 'Confirmer ce retrait ?', async () => {
    try {
      await db.collection('withdrawals').doc(wdId).update({
        status: 'approved',
        approvedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      const wdDoc = await db.collection('withdrawals').doc(wdId).get();
      const wd    = wdDoc.data();
      if (wd.userId) {
        await createNotification(wd.userId, 'Retrait approuvé',
          `Votre retrait de ${formatCurrency(wd.amount)} a été approuvé.`, 'success');
      }
      showToast('Retrait approuvé.', 'success');
      addLog('withdrawal', `Retrait approuvé — ${wd.username} — ${formatCurrency(wd.amount)}`, currentUser.username);
      loadAdminWithdrawals();
    } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  });
}

async function rejectWithdrawal(wdId) {
  showConfirm('Rejeter le retrait', 'Rejeter et recréditer le solde du worker ?', async () => {
    try {
      const wdDoc = await db.collection('withdrawals').doc(wdId).get();
      const wd    = wdDoc.data();
      await wdDoc.ref.update({ status: 'rejected', rejectedAt: firebase.firestore.FieldValue.serverTimestamp() });
      // Recréditer
      if (wd.userId) {
        await db.collection('users').doc(wd.userId).update({
          balance: firebase.firestore.FieldValue.increment(wd.amount || 0)
        });
        await createNotification(wd.userId, 'Retrait rejeté',
          `Votre retrait de ${formatCurrency(wd.amount)} a été rejeté. Votre solde a été recrédité.`, 'error');
      }
      showToast('Retrait rejeté. Solde recrédité.', 'warning');
      addLog('withdrawal', `Retrait rejeté — ${wd.username} — ${formatCurrency(wd.amount)}`, currentUser.username);
      loadAdminWithdrawals();
    } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  });
}

/* =============================================================
   22. ADMIN — LOGS
   ============================================================= */
async function loadAdminLogs() {
  const tbody = document.getElementById('logs-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    const snap = await db.collection('logs').orderBy('createdAt', 'desc').limit(200).get();
    logsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLogsTable(logsCache);
  } catch (e) { showToast('Erreur logs : ' + e.message, 'error'); }
}

function filterLogs() {
  const search  = document.getElementById('logs-search')?.value.toLowerCase() || '';
  const typeF   = document.getElementById('logs-type-filter')?.value || '';
  const filtered = logsCache.filter(l => {
    const matchSearch = (l.action || '').toLowerCase().includes(search) ||
                        (l.username || '').toLowerCase().includes(search);
    const matchType   = typeF ? l.type === typeF : true;
    return matchSearch && matchType;
  });
  renderLogsTable(filtered);
}

function renderLogsTable(logs) {
  const tbody = document.getElementById('logs-tbody');
  if (!tbody) return;
  const typeIcons = { login: 'log-in', task: 'briefcase', withdrawal: 'arrow-up-circle', maintenance: 'wrench', user: 'user' };
  tbody.innerHTML = logs.length === 0
    ? '<tr><td colspan="4" class="text-center py-8 text-gray-400">Aucun log</td></tr>'
    : logs.map(l => `
        <tr>
          <td><span class="badge badge-${l.type || 'info'}" style="gap:4px">
            <i data-lucide="${typeIcons[l.type] || 'info'}" style="width:12px;height:12px"></i>
            ${l.type || '—'}
          </span></td>
          <td>${escapeHtml(l.action || '—')}</td>
          <td>${escapeHtml(l.username || '—')}</td>
          <td>${formatDate(l.createdAt)}</td>
        </tr>`).join('');
  if (window.lucide) lucide.createIcons();
}

/* =============================================================
   23. ADMIN — PARAMÈTRES
   ============================================================= */
async function loadAdminSettings() {
  try {
    const doc = await db.collection('settings').doc('global').get();
    if (doc.exists) {
      globalSettings = doc.data();
      const { exchangeRate, maintenanceFee, moncashNumber, natcashNumber } = globalSettings;
      const exInput = document.getElementById('exchange-rate-input');
      const mfInput = document.getElementById('maintenance-fee-input');
      const mcInput = document.getElementById('moncash-number-input');
      const ncInput = document.getElementById('natcash-number-input');
      if (exInput) exInput.value = exchangeRate || 130;
      if (mfInput) mfInput.value = maintenanceFee || 250;
      if (mcInput) mcInput.value = moncashNumber || '';
      if (ncInput) ncInput.value = natcashNumber || '';
      setText('current-exchange-rate', `Taux actuel : 1 USD = ${exchangeRate || 130} HTG`);
      setText('current-maintenance-fee', `Frais actuels : ${formatCurrency(maintenanceFee || 250)}`);
      setText('current-payment-numbers', `MonCash : ${moncashNumber || '—'} | Natcash : ${natcashNumber || '—'}`);
    }
  } catch (e) { showToast('Erreur paramètres : ' + e.message, 'error'); }
}

async function saveExchangeRate() {
  const val = parseFloat(document.getElementById('exchange-rate-input')?.value || 0);
  if (!val || val <= 0) { showToast('Taux invalide.', 'warning'); return; }
  try {
    await db.collection('settings').doc('global').set({ exchangeRate: val }, { merge: true });
    globalSettings.exchangeRate = val;
    setText('current-exchange-rate', `Taux actuel : 1 USD = ${val} HTG`);
    showToast('Taux de change enregistré.', 'success');
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

async function saveMaintenanceFee() {
  const val = parseFloat(document.getElementById('maintenance-fee-input')?.value || 0);
  if (!val || val <= 0) { showToast('Montant invalide.', 'warning'); return; }
  try {
    await db.collection('settings').doc('global').set({ maintenanceFee: val }, { merge: true });
    globalSettings.maintenanceFee = val;
    setText('current-maintenance-fee', `Frais actuels : ${formatCurrency(val)}`);
    showToast('Frais de maintenance enregistrés.', 'success');
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

async function savePaymentNumbers() {
  const mc = document.getElementById('moncash-number-input')?.value.trim();
  const nc = document.getElementById('natcash-number-input')?.value.trim();
  try {
    await db.collection('settings').doc('global').set({
      moncashNumber: mc || null,
      natcashNumber: nc || null
    }, { merge: true });
    globalSettings.moncashNumber = mc;
    globalSettings.natcashNumber = nc;
    setText('current-payment-numbers', `MonCash : ${mc || '—'} | Natcash : ${nc || '—'}`);
    showToast('Numéros de paiement enregistrés.', 'success');
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

async function createManagerAccount() {
  const name     = document.getElementById('new-manager-name')?.value.trim();
  const username = document.getElementById('new-manager-username')?.value.trim();
  const password = document.getElementById('new-manager-password')?.value;
  const adminPwd = document.getElementById('admin-confirm-password')?.value;

  if (!name || !username || !password || !adminPwd) {
    showToast('Tous les champs sont requis.', 'warning');
    return;
  }

  const resultBox = document.getElementById('manager-creation-result');
  if (resultBox) { resultBox.classList.remove('hidden'); resultBox.textContent = 'Création en cours...'; }

  try {
    const email = username + '@hbwtask.com';
    const cred  = await auth.createUserWithEmailAndPassword(email, password);
    const uid   = cred.user.uid;

    await db.collection('users').doc(uid).set({
      username, email, displayName: name, role: 'manager',
      balance: 0, teamId: null, active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Reconnecter l'admin
    await auth.signInWithEmailAndPassword(currentUserAuth.email, adminPwd);

    if (resultBox) {
      resultBox.textContent = `✅ Manager créé : ${username} | ${email} | Mot de passe : ${password}`;
      resultBox.style.color = '#4ade80';
    }
    showToast(`Manager "${username}" créé avec succès !`, 'success');
    addLog('user', `Manager créé : ${username}`, currentUser.username);
    // Vider les champs
    ['new-manager-name','new-manager-username','new-manager-password','admin-confirm-password']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  } catch (e) {
    showToast('Erreur : ' + e.message, 'error');
    if (resultBox) { resultBox.textContent = '❌ ' + e.message; resultBox.style.color = '#f87171'; }
  }
}

async function calculateDailyCommissions() {
  const result = document.getElementById('commission-calc-result');
  if (result) { result.classList.remove('hidden'); result.textContent = 'Calcul en cours...'; }
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const snap = await db.collection('transactions')
      .where('type', '==', 'task_reward')
      .where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(today))
      .get();

    // Grouper par manager (via teamId du worker)
    const managerEarnings = {};
    for (const doc of snap.docs) {
      const tx = doc.data();
      const worker = allUsersCache.find(u => u.id === tx.userId);
      if (!worker?.teamId) continue;
      const team = allTeamsCache.find(t => t.id === worker.teamId);
      if (!team?.managerId) continue;
      managerEarnings[team.managerId] = (managerEarnings[team.managerId] || 0) + (tx.amount || 0);
    }

    let total = 0;
    for (const [mgId, earnings] of Object.entries(managerEarnings)) {
      const commission = earnings * 0.05;
      total += commission;
      await db.collection('users').doc(mgId).update({
        balance: firebase.firestore.FieldValue.increment(commission)
      });
      await db.collection('transactions').add({
        userId: mgId, type: 'commission_daily', amount: commission,
        description: `Commission journalière 5% — ${formatCurrency(earnings)} générés`,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    if (result) { result.textContent = `✅ ${Object.keys(managerEarnings).length} manager(s) crédités — Total : ${formatCurrency(total)}`; result.style.color = '#4ade80'; }
    showToast(`Commissions calculées : ${formatCurrency(total)}`, 'success');
  } catch (e) {
    showToast('Erreur calcul commissions : ' + e.message, 'error');
    if (result) { result.textContent = '❌ ' + e.message; result.style.color = '#f87171'; }
  }
}

/* =============================================================
   24. ADMIN — GESTION UTILISATEURS (tableau complet)
   ============================================================= */
async function loadUserManagement() {
  const tbody = document.getElementById('um-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    if (allUsersCache.length === 0) {
      const snap = await db.collection('users').get();
      allUsersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    if (allTeamsCache.length === 0) {
      const snap = await db.collection('teams').get();
      allTeamsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    umCache = allUsersCache.filter(u => u.role === 'worker');
    renderUMTable(umCache);
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

function filterUserManagement() {
  const search = document.getElementById('um-search')?.value.toLowerCase() || '';
  const filtered = umCache.filter(u =>
    (u.username || '').toLowerCase().includes(search) ||
    (u.displayName || '').toLowerCase().includes(search)
  );
  renderUMTable(filtered);
}

function renderUMTable(users) {
  const tbody = document.getElementById('um-tbody');
  if (!tbody) return;
  const teams = Object.fromEntries(allTeamsCache.map(t => [t.id, t.name]));

  tbody.innerHTML = users.length === 0
    ? '<tr><td colspan="11" class="text-center py-8 text-gray-400">Aucun résultat</td></tr>'
    : users.map(u => `
        <tr>
          <td class="font-mono text-sm">${escapeHtml(u.username || '—')}</td>
          <td>${escapeHtml(u.displayName || (u.firstName ? u.firstName + ' ' + (u.lastName || '') : '—'))}</td>
          <td>
            <span class="pw-masked" id="pw-${u.id}" style="cursor:pointer;font-family:monospace" onclick="togglePw('${u.id}', '${escapeHtml(u.storedPassword || '')}')">••••••••</span>
          </td>
          <td>${escapeHtml(u.address || '—')}</td>
          <td>${u.gender === 'M' ? 'M' : u.gender === 'F' ? 'F' : '—'}</td>
          <td>${u.age || '—'}</td>
          <td>${escapeHtml(u.status || '—')}</td>
          <td>${escapeHtml(teams[u.teamId] || '—')}</td>
          <td>${formatCurrency(u.balance || 0)}</td>
          <td>${u.completedTasks || 0}</td>
          <td>
            <button class="btn-icon" onclick="showUserDetail('${u.id}')">
              <i data-lucide="eye" class="w-4 h-4"></i>
            </button>
          </td>
        </tr>`).join('');
  if (window.lucide) lucide.createIcons();
}

function togglePw(uid, pw) {
  const span = document.getElementById('pw-' + uid);
  if (!span) return;
  span.textContent = span.textContent === '••••••••' ? (pw || '—') : '••••••••';
}

function exportUserManagementCSV() {
  const teams = Object.fromEntries(allTeamsCache.map(t => [t.id, t.name]));
  const rows = [['Username','Nom','Adresse','Sexe','Âge','Statut','Équipe','Solde','Tâches']];
  umCache.forEach(u => rows.push([
    u.username || '',
    u.displayName || (u.firstName ? u.firstName + ' ' + (u.lastName || '') : ''),
    u.address || '',
    u.gender === 'M' ? 'M' : u.gender === 'F' ? 'F' : '',
    u.age || '',
    u.status || '',
    teams[u.teamId] || '',
    u.balance || 0,
    u.completedTasks || 0
  ]));

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `hbwtask_workers_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Export CSV téléchargé.', 'success');
}

/* =============================================================
   25. ADMIN / MANAGER / WORKER — LEADERBOARD
   ============================================================= */
async function loadLeaderboard(role = 'admin') {
  try {
    // Top Workers
    const workersSnap = await db.collection('users')
      .where('role', '==', 'worker')
      .orderBy('completedTasks', 'desc')
      .limit(10).get();
    const topWorkers = workersSnap.docs.map((d, i) => ({ rank: i + 1, ...d.data() }));

    const renderLb = (containerId, items) => {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = items.length === 0
        ? '<div class="empty-state-sm">Aucune donnée</div>'
        : items.map(u => {
            const badge = getBadgeInfo(u.completedTasks || 0);
            return `
              <div class="lb-item ${u.rank <= 3 ? 'lb-top-' + u.rank : ''}">
                <span class="lb-rank">${u.rank <= 3 ? ['🥇','🥈','🥉'][u.rank - 1] : '#' + u.rank}</span>
                <span class="user-avatar-sm">${(u.username || 'U')[0].toUpperCase()}</span>
                <div class="lb-info">
                  <p class="lb-name">${escapeHtml(u.username || '—')}</p>
                  <p class="lb-sub">${u.completedTasks || 0} tâches · ${badge.icon} ${badge.name}</p>
                </div>
                <span class="lb-value">${formatCurrency(u.balance || 0)}</span>
              </div>`;
          }).join('');
    };

    // Selon le rôle
    if (role === 'admin') {
      renderLb('lb-workers', topWorkers);
      // Top Teams
      const teamsSnap = await db.collection('teams').get();
      const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const teamStats = await Promise.all(teams.map(async t => {
        const members = allUsersCache.filter(u => u.teamId === t.id && u.role === 'worker');
        const tasks   = members.reduce((sum, m) => sum + (m.completedTasks || 0), 0);
        return { ...t, totalTasks: tasks, memberCount: members.length };
      }));
      teamStats.sort((a, b) => b.totalTasks - a.totalTasks);
      const lbTeams = document.getElementById('lb-teams');
      if (lbTeams) {
        lbTeams.innerHTML = teamStats.length === 0
          ? '<div class="empty-state-sm">Aucune équipe</div>'
          : teamStats.slice(0, 10).map((t, i) => `
              <div class="lb-item ${i < 3 ? 'lb-top-' + (i + 1) : ''}">
                <span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : '#' + (i + 1)}</span>
                <div class="lb-info">
                  <p class="lb-name">${escapeHtml(t.name)}</p>
                  <p class="lb-sub">${t.memberCount} membres</p>
                </div>
                <span class="lb-value">${t.totalTasks} tâches</span>
              </div>`).join('');
      }
      // Top Managers
      const mgrsSnap = await db.collection('users').where('role', '==', 'manager').orderBy('balance', 'desc').limit(10).get();
      const topMgrs = mgrsSnap.docs.map((d, i) => ({ rank: i + 1, ...d.data() }));
      renderLb('lb-managers', topMgrs);
    } else if (role === 'manager') {
      renderLb('mgr-lb-workers', topWorkers);
      // Teams
      const teamsSnap = await db.collection('teams').get();
      const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const lbTeams = document.getElementById('mgr-lb-teams');
      if (lbTeams) {
        const teamStats = teams.map(t => {
          const members = allUsersCache.filter(u => u.teamId === t.id && u.role === 'worker');
          return { ...t, totalTasks: members.reduce((s, m) => s + (m.completedTasks || 0), 0) };
        }).sort((a, b) => b.totalTasks - a.totalTasks).slice(0, 10);
        lbTeams.innerHTML = teamStats.map((t, i) => `
          <div class="lb-item ${i < 3 ? 'lb-top-' + (i + 1) : ''}">
            <span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : '#' + (i + 1)}</span>
            <div class="lb-info"><p class="lb-name">${escapeHtml(t.name)}</p></div>
            <span class="lb-value">${t.totalTasks} tâches</span>
          </div>`).join('') || '<div class="empty-state-sm">Aucune équipe</div>';
      }
    } else {
      renderLb('wkr-lb-workers', topWorkers);
      const teamsSnap = await db.collection('teams').get();
      const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const lbTeams = document.getElementById('wkr-lb-teams');
      if (lbTeams) {
        const teamStats = teams.map(t => {
          const members = allUsersCache.filter(u => u.teamId === t.id);
          return { ...t, totalTasks: members.reduce((s, m) => s + (m.completedTasks || 0), 0) };
        }).sort((a, b) => b.totalTasks - a.totalTasks).slice(0, 10);
        lbTeams.innerHTML = teamStats.map((t, i) => `
          <div class="lb-item ${i < 3 ? 'lb-top-' + (i + 1) : ''}">
            <span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : '#' + (i + 1)}</span>
            <div class="lb-info"><p class="lb-name">${escapeHtml(t.name)}</p></div>
            <span class="lb-value">${t.totalTasks} tâches</span>
          </div>`).join('') || '<div class="empty-state-sm">Aucune équipe</div>';
      }
    }
  } catch (e) { showToast('Erreur leaderboard : ' + e.message, 'error'); }
}

/* =============================================================
   26. MANAGER — DASHBOARD
   ============================================================= */
async function renderManagerDashboard() {
  try {
    if (!currentUser.teamId) {
      // Pas d'équipe
      const banner = document.getElementById('manager-team-banner');
      if (banner) { banner.classList.remove('hidden'); }
      setText('manager-team-name-display', '—');
      setText('mgr-stat-members', '0');
      setText('mgr-stat-tasks', '0');
      setText('mgr-stat-avg', '0 HTG');
      setText('mgr-stat-balance', '0 HTG');
      setText('mgr-stat-commission', formatCurrency(currentUser.balance || 0));
      return;
    }

    const teamId = currentUser.teamId;
    const teamDoc = await db.collection('teams').doc(teamId).get();
    if (teamDoc.exists) {
      setText('manager-team-name-display', teamDoc.data().name || '—');
      show('manager-team-banner');
    }

    const membersSnap = await db.collection('users')
      .where('teamId', '==', teamId)
      .where('role', '==', 'worker').get();
    const members = membersSnap.docs.map(d => d.data());

    // Tâches du jour
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tasksSnap = await db.collection('tasks')
      .where('status', '==', 'completed')
      .where('validatedAt', '>=', firebase.firestore.Timestamp.fromDate(today))
      .get();
    const teamTasks = tasksSnap.docs.map(d => d.data())
      .filter(t => members.some(m => m.id === t.workerId || members.find(mm => mm.username === t.workerUsername)));

    const totalBalance = members.reduce((s, m) => s + (m.balance || 0), 0);
    const avgGain      = members.length > 0 ? totalBalance / members.length : 0;

    setText('mgr-stat-members',    members.length);
    setText('mgr-stat-tasks',      teamTasks.length);
    setText('mgr-stat-avg',        formatCurrency(avgGain));
    setText('mgr-stat-balance',    formatCurrency(totalBalance));
    setText('mgr-stat-commission', formatCurrency(currentUser.balance || 0));

    // Classement équipe
    const rankList = document.getElementById('team-ranking-list');
    if (rankList) {
      const sorted = [...members].sort((a, b) => (b.completedTasks || 0) - (a.completedTasks || 0));
      rankList.innerHTML = sorted.map((m, i) => {
        const badge = getBadgeInfo(m.completedTasks || 0);
        return `
          <div class="mini-list-item">
            <span class="rank-num">#${i + 1}</span>
            <span class="user-avatar-sm">${(m.username || 'W')[0].toUpperCase()}</span>
            <div class="mini-item-info">
              <p class="mini-item-title">${escapeHtml(m.username || '—')}</p>
              <p class="mini-item-sub">${m.completedTasks || 0} tâches · ${badge.icon}</p>
            </div>
            <span class="mini-item-value">${formatCurrency(m.balance || 0)}</span>
          </div>`;
      }).join('') || '<div class="empty-state-sm">Aucun membre</div>';
    }

    renderManagerChart(teamId);
    if (window.lucide) lucide.createIcons();
  } catch (e) { showToast('Erreur dashboard manager : ' + e.message, 'error'); }
}

async function renderManagerChart(teamId) {
  const ctx = document.getElementById('manager-chart');
  if (!ctx) return;
  if (managerChart) { managerChart.destroy(); managerChart = null; }

  try {
    const days = 7;
    const labels = [];
    const data   = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const nd = new Date(d); nd.setDate(nd.getDate() + 1);
      labels.push(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));
      const snap = await db.collection('tasks')
        .where('status', '==', 'completed')
        .where('validatedAt', '>=', firebase.firestore.Timestamp.fromDate(d))
        .where('validatedAt', '<', firebase.firestore.Timestamp.fromDate(nd))
        .get();
      const count = snap.docs.filter(doc => {
        const t = doc.data();
        return allUsersCache.some(u => u.id === t.workerId && u.teamId === teamId);
      }).length;
      data.push(count);
    }

    managerChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Tâches validées',
          data,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#3b82f6',
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } },
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'transparent' } }
        }
      }
    });
  } catch (e) { console.warn('Chart manager:', e); }
}

/* =============================================================
   27. MANAGER — MEMBRES
   ============================================================= */
async function loadManagerMembers() {
  const tbody = document.getElementById('members-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    if (!currentUser.teamId) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">Vous n\'avez pas encore d\'équipe.</td></tr>';
      return;
    }
    const snap = await db.collection('users')
      .where('teamId', '==', currentUser.teamId)
      .where('role', '==', 'worker').get();
    const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (tbody) {
      tbody.innerHTML = members.length === 0
        ? '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucun membre dans votre équipe</td></tr>'
        : members.map(m => {
            const badge = getBadgeInfo(m.completedTasks || 0);
            return `
              <tr>
                <td>
                  <div class="user-cell">
                    <span class="user-avatar-sm">${(m.username || 'W')[0].toUpperCase()}</span>
                    <div>
                      <p class="font-medium text-sm">${escapeHtml(m.username || '—')}</p>
                      <p class="text-xs text-gray-400">${escapeHtml(m.displayName || '')}</p>
                    </div>
                  </div>
                </td>
                <td>${escapeHtml(m.phone || '—')}</td>
                <td>${formatCurrency(m.balance || 0)}</td>
                <td>${m.completedTasks || 0}</td>
                <td>${badge.icon} ${badge.name}</td>
                <td>${formatDate(m.lastActivity || m.createdAt)}</td>
                <td>
                  <button class="btn-icon btn-icon-red" onclick="openSignalModal('${m.id}','${escapeHtml(m.username || '')}')">
                    <i data-lucide="flag" class="w-4 h-4"></i>
                  </button>
                </td>
              </tr>`;
          }).join('');
    }

    // Alimenter aussi le select de messagerie
    const msgSelect = document.getElementById('msg-recipient');
    if (msgSelect) {
      msgSelect.innerHTML = '<option value="all">Toute l\'équipe</option>' +
        members.map(m => `<option value="${m.id}">${escapeHtml(m.username)}</option>`).join('');
    }

    if (window.lucide) lucide.createIcons();
  } catch (e) { showToast('Erreur membres : ' + e.message, 'error'); }
}

function filterMembers() {
  const search = document.getElementById('members-search')?.value.toLowerCase() || '';
  document.querySelectorAll('#members-tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(search) ? '' : 'none';
  });
}

function showAddMemberModal() {
  generateWorkerCredentials();
  ['member-firstname','member-lastname','member-age','member-phone','member-address','manager-password-input']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  openModal('modal-add-member');
}

async function createWorkerAccount() {
  const firstName  = document.getElementById('member-firstname')?.value.trim();
  const lastName   = document.getElementById('member-lastname')?.value.trim();
  const age        = document.getElementById('member-age')?.value || '';
  const gender     = document.getElementById('member-gender')?.value || 'M';
  const phone      = document.getElementById('member-phone')?.value.trim();
  const status     = document.getElementById('member-status')?.value || 'étudiant';
  const address    = document.getElementById('member-address')?.value.trim();
  const managerPwd = document.getElementById('manager-password-input')?.value;

  if (!firstName || !lastName || !managerPwd) {
    showToast('Prénom, nom et votre mot de passe manager sont requis.', 'warning');
    return;
  }

  // Sauvegarder les identifiants du manager pour le reconnecter ensuite
  const managerEmail = currentUserAuth.email;   // email Firebase du manager
  sessionStorage.setItem('mgr_email', managerEmail);
  sessionStorage.setItem('mgr_pass', managerPwd);

  const btn     = document.getElementById('create-worker-btn');
  const btnText = document.getElementById('create-worker-btn-text');
  const spinner = document.getElementById('create-worker-spinner');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Création...';
  if (spinner) spinner.classList.remove('hidden');

  const { username, email, password } = generatedCredentials; // générés plus tôt

  try {
    // 1. Créer le compte Firebase Auth (le manager est déconnecté ici)
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const workerUid = cred.user.uid;

    // 2. Reconnecter le manager AVANT d'écrire dans Firestore
    await auth.signInWithEmailAndPassword(managerEmail, managerPwd);

    // 3. Maintenant le manager est reconnecté → écrire le document
    await db.collection('users').doc(workerUid).set({
      username, email,
      displayName: `${firstName} ${lastName}`,
      firstName, lastName,
      age: age ? parseInt(age) : null,
      gender, phone: phone || null, status, address: address || null,
      role: 'worker',
      teamId: currentUser.teamId || null,
      balance: 0, completedTasks: 0, active: true,
      storedPassword: password,
      createdBy: currentUser.id, managerId: currentUser.id,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    closeModal();
    showToast(`Worker "${username}" créé avec succès !`, 'success');
    addLog('user', `Worker créé : ${username} par ${currentUser.username}`, currentUser.username);
    loadManagerMembers();

    // Nettoyer le sessionStorage
    sessionStorage.removeItem('mgr_email');
    sessionStorage.removeItem('mgr_pass');

  } catch (err) {
    console.error('Erreur création worker:', err);
    // Essayer de reconnecter le manager même en cas d'erreur
    try { await auth.signInWithEmailAndPassword(managerEmail, managerPwd); } catch (e) {}
    showToast('Erreur : ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Créer le compte';
    if (spinner) spinner.classList.add('hidden');
  }
}

/* =============================================================
   28. MANAGER — MESSAGERIE
   ============================================================= */
async function loadManagerMessages() {
  await loadManagerMembers(); // alimenter le select
  loadSentMessages();
}

async function sendTeamMessage() {
  const recipient = document.getElementById('msg-recipient')?.value;
  const content   = document.getElementById('msg-content')?.value.trim();
  if (!content) { showToast('Veuillez saisir un message.', 'warning'); return; }

  try {
    const msgData = {
      senderId: currentUser.id,
      senderUsername: currentUser.username,
      content,
      teamId: currentUser.teamId,
      recipientId: recipient === 'all' ? null : recipient,
      all: recipient === 'all',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('messages').add(msgData);

    // Notifications
    if (recipient === 'all' && currentUser.teamId) {
      const snap = await db.collection('users')
        .where('teamId', '==', currentUser.teamId).where('role', '==', 'worker').get();
      for (const d of snap.docs) {
        await createNotification(d.id, 'Message de votre manager', content, 'info');
      }
    } else if (recipient && recipient !== 'all') {
      await createNotification(recipient, 'Message de votre manager', content, 'info');
    }

    document.getElementById('msg-content').value = '';
    showToast('Message envoyé !', 'success');
    loadSentMessages();
  } catch (e) { showToast('Erreur envoi : ' + e.message, 'error'); }
}

async function loadSentMessages() {
  const list = document.getElementById('sent-messages-list');
  if (!list) return;
  try {
    const snap = await db.collection('messages')
      .where('senderId', '==', currentUser.id)
      .orderBy('createdAt', 'desc').limit(20).get();
    const msgs = snap.docs.map(d => d.data());
    list.innerHTML = msgs.length === 0
      ? '<div class="empty-state-sm">Aucun message envoyé</div>'
      : msgs.map(m => `
          <div class="mini-list-item">
            <i data-lucide="message-square" class="w-4 h-4 text-blue-400"></i>
            <div class="mini-item-info">
              <p class="mini-item-title">${m.all ? 'Toute l\'équipe' : 'Membre individuel'}</p>
              <p class="mini-item-sub">${escapeHtml(m.content || '').substring(0, 60)}${(m.content || '').length > 60 ? '...' : ''}</p>
            </div>
            <span class="mini-item-value text-xs text-gray-400">${formatDate(m.createdAt)}</span>
          </div>`).join('');
    if (window.lucide) lucide.createIcons();
  } catch (e) {}
}

/* =============================================================
   29. MANAGER — STATISTIQUES
   ============================================================= */
async function loadManagerStats() {
  const statsTbody = document.getElementById('stats-tbody');
  const dailyTbody = document.getElementById('daily-tasks-tbody');
  if (statsTbody) statsTbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Chargement...</td></tr>';

  try {
    if (!currentUser.teamId) {
      if (statsTbody) statsTbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Aucune équipe assignée.</td></tr>';
      return;
    }

    const snap = await db.collection('users')
      .where('teamId', '==', currentUser.teamId).where('role', '==', 'worker').get();
    const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Tâches du jour
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tasksSnap = await db.collection('tasks')
      .where('status', '==', 'completed')
      .where('validatedAt', '>=', firebase.firestore.Timestamp.fromDate(today)).get();
    const allCompletedToday = tasksSnap.docs.map(d => d.data());

    if (dailyTbody) {
      dailyTbody.innerHTML = members.map(m => {
        const todayTasks = allCompletedToday.filter(t => t.workerId === m.id || t.workerUsername === m.username);
        const hours = todayTasks.reduce((s, t) => s + (t.estimatedHours || 0), 0);
        return `
          <tr>
            <td>
              <div class="user-cell">
                <span class="user-avatar-sm">${(m.username || 'W')[0].toUpperCase()}</span>
                <span>${escapeHtml(m.username || '—')}</span>
              </div>
            </td>
            <td>${todayTasks.length}</td>
            <td>${hours > 0 ? hours.toFixed(1) + 'h' : '—'}</td>
          </tr>`;
      }).join('') || '<tr><td colspan="3" class="text-center text-gray-400">Aucune donnée</td></tr>';
    }

    // Performances globales
    const sorted = [...members].sort((a, b) => (b.completedTasks || 0) - (a.completedTasks || 0));
    if (statsTbody) {
      statsTbody.innerHTML = sorted.length === 0
        ? '<tr><td colspan="6" class="text-center py-8 text-gray-400">Aucun membre</td></tr>'
        : sorted.map((m, i) => {
            const badge   = getBadgeInfo(m.completedTasks || 0);
            const avgTask = (m.completedTasks || 0) > 0
              ? ((m.balance || 0) / m.completedTasks).toFixed(0)
              : 0;
            return `
              <tr>
                <td>#${i + 1}</td>
                <td>
                  <div class="user-cell">
                    <span class="user-avatar-sm">${(m.username || 'W')[0].toUpperCase()}</span>
                    <span>${escapeHtml(m.username || '—')}</span>
                  </div>
                </td>
                <td>${m.completedTasks || 0}</td>
                <td>${formatCurrency(m.balance || 0)}</td>
                <td>${formatCurrency(avgTask)}</td>
                <td>${badge.icon} ${badge.name}</td>
              </tr>`;
          }).join('');
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) { showToast('Erreur stats : ' + e.message, 'error'); }
}

/* =============================================================
   30. MANAGER — SIGNALEMENT WORKER
   ============================================================= */
function openSignalModal(workerId, workerName) {
  document.getElementById('signal-worker-id').value  = workerId;
  document.getElementById('signal-worker-name').value = workerName;
  setText('signal-worker-label', 'Worker : ' + workerName);
  const msg = document.getElementById('signal-message');
  if (msg) msg.value = '';
  openModal('modal-signal-worker');
}

// Alias exposé pour onclick HTML
function signalWorker(workerId, workerName) { openSignalModal(workerId, workerName); }

async function submitWorkerSignal() {
  const workerId = document.getElementById('signal-worker-id')?.value;
  const name     = document.getElementById('signal-worker-name')?.value;
  const message  = document.getElementById('signal-message')?.value.trim();
  if (!message) { showToast('Veuillez saisir un message de signalement.', 'warning'); return; }
  try {
    await db.collection('signals').add({
      workerId, workerName: name,
      managerId: currentUser.id, managerName: currentUser.username,
      message,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeModal();
    showToast('Signalement envoyé.', 'success');
    addLog('user', `Signalement worker : ${name}`, currentUser.username);
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

/* =============================================================
   31. MANAGER — RETRAIT
   ============================================================= */
async function loadManagerWithdrawal() {
  const balEl = document.getElementById('mgr-wd-balance');
  if (balEl) balEl.textContent = formatCurrency(currentUser.balance || 0);
  hide('mgr-withdrawal-error');
  await loadManagerWithdrawalHistory();
}

function selectManagerMethod(method) {
  selectedManagerMethod = method;
  document.getElementById('mgr-method-moncash')?.classList.toggle('selected', method === 'MonCash');
  document.getElementById('mgr-method-natcash')?.classList.toggle('selected', method === 'Natcash');
}

async function requestManagerWithdrawal() {
  const amount = parseFloat(document.getElementById('mgr-wd-amount')?.value || 0);
  const phone  = document.getElementById('mgr-wd-phone')?.value.trim();
  const errDiv = document.getElementById('mgr-withdrawal-error');
  const errMsg = document.getElementById('mgr-withdrawal-error-msg');

  const showErr = (msg) => { if (errDiv) errDiv.classList.remove('hidden'); if (errMsg) errMsg.textContent = msg; };

  if (!amount || amount < 100) { showErr('Montant minimum : 100 HTG.'); return; }
  if (!phone) { showErr('Numéro de téléphone requis.'); return; }
  if ((currentUser.balance || 0) < amount) { showErr('Solde insuffisant.'); return; }

  const btn     = document.getElementById('mgr-withdrawal-btn');
  const btnText = document.getElementById('mgr-withdrawal-btn-text');
  const spinner = document.getElementById('mgr-withdrawal-spinner');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Envoi...';
  if (spinner) spinner.classList.remove('hidden');

  try {
    await db.collection('users').doc(currentUser.id).update({
      balance: firebase.firestore.FieldValue.increment(-amount)
    });
    await db.collection('withdrawals').add({
      userId: currentUser.id, username: currentUser.username,
      amount, method: selectedManagerMethod, phone, status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('transactions').add({
      userId: currentUser.id, username: currentUser.username,
      type: 'withdrawal', amount: -amount,
      description: `Retrait ${selectedManagerMethod} — ${phone}`,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    currentUser.balance = (currentUser.balance || 0) - amount;
    hide('mgr-withdrawal-error');
    document.getElementById('mgr-wd-amount').value = '';
    document.getElementById('mgr-wd-phone').value  = '';
    showToast('Demande de retrait envoyée !', 'success');
    addLog('withdrawal', `Retrait manager demandé — ${formatCurrency(amount)} — ${selectedManagerMethod}`, currentUser.username);
    await loadManagerWithdrawal();
  } catch (e) { showErr('Erreur : ' + e.message); }
  finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Envoyer la demande';
    if (spinner) spinner.classList.add('hidden');
  }
}

async function loadManagerWithdrawalHistory() {
  const list = document.getElementById('mgr-withdrawals-list');
  if (!list) return;
  try {
    const snap = await db.collection('withdrawals')
      .where('userId', '==', currentUser.id)
      .orderBy('createdAt', 'desc').limit(10).get();
    const items = snap.docs.map(d => d.data());
    list.innerHTML = items.length === 0
      ? '<div class="empty-state-sm">Aucun retrait</div>'
      : items.map(w => `
          <div class="mini-list-item">
            <i data-lucide="arrow-up-circle" class="w-4 h-4 text-blue-400"></i>
            <div class="mini-item-info">
              <p class="mini-item-title">${escapeHtml(w.method || '—')} — ${escapeHtml(w.phone || '')}</p>
              <p class="mini-item-sub">${formatDate(w.createdAt)}</p>
            </div>
            <div>
              <span class="mini-item-value">${formatCurrency(w.amount)}</span>
              <span class="badge badge-${w.status === 'approved' ? 'green' : w.status === 'rejected' ? 'red' : 'yellow'}" style="display:block;margin-top:2px">${w.status}</span>
            </div>
          </div>`).join('');
    if (window.lucide) lucide.createIcons();
  } catch (e) {}
}

/* =============================================================
   32. WORKER — DASHBOARD
   ============================================================= */
async function renderWorkerDashboard() {
  try {
    // Rafraîchir le profil
    const doc = await db.collection('users').doc(currentUser.id).get();
    if (doc.exists) {
      currentUser = { id: doc.id, ...doc.data() };
      updateTopbarBalance();
    }

    const balance    = currentUser.balance || 0;
    const completed  = currentUser.completedTasks || 0;
    const rate       = globalSettings.exchangeRate || 130;
    const badge      = getBadgeInfo(completed);

    setText('worker-balance',     formatCurrency(balance));
    setText('worker-balance-usd', '≈ ' + (balance / rate).toFixed(2) + ' USD');
    setText('worker-badge-icon',  badge.icon);
    setText('worker-badge-name',  badge.name);

    // Barre de progression
    if (badge.next) {
      const current  = completed;
      const prev     = badge.name === 'Bronze' ? 0 : badge.name === 'Argent' ? 50 : badge.name === 'Or' ? 100 : badge.name === 'Platine' ? 200 : 500;
      const next     = badge.nextCount;
      const pct      = Math.min(100, Math.round(((current - prev) / (next - prev)) * 100));
      const bar      = document.getElementById('progress-bar');
      if (bar) bar.style.width = pct + '%';
      setText('next-badge-name', badge.next);
      setText('progress-count', `${current} / ${next} tâches`);
    } else {
      const bar = document.getElementById('progress-bar');
      if (bar) bar.style.width = '100%';
      setText('next-badge-name', 'Maximum');
      setText('progress-count', `${completed} tâches`);
    }

    // Bannière maintenance
    const mainBanner = document.getElementById('maintenance-banner');
    if (currentUser.maintenance) {
      if (mainBanner) mainBanner.classList.remove('hidden');
      setText('maintenance-amount-banner', formatCurrency(currentUser.maintenanceAmount || 0));
    } else {
      if (mainBanner) mainBanner.classList.add('hidden');
    }

    // Activité récente (5 dernières transactions)
    const txSnap = await db.collection('transactions')
      .where('userId', '==', currentUser.id)
      .orderBy('createdAt', 'desc').limit(5).get();
    const txs = txSnap.docs.map(d => d.data());
    const actList = document.getElementById('worker-recent-activity');
    if (actList) {
      actList.innerHTML = txs.length === 0
        ? '<div class="empty-state-sm">Aucune activité récente</div>'
        : txs.map(tx => `
            <div class="mini-list-item">
              <i data-lucide="${tx.type === 'task_reward' ? 'check-circle' : 'arrow-up-circle'}" class="w-4 h-4 ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}"></i>
              <div class="mini-item-info">
                <p class="mini-item-title">${escapeHtml(tx.description || tx.type)}</p>
                <p class="mini-item-sub">${formatDate(tx.createdAt)}</p>
              </div>
              <span class="mini-item-value ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}">${tx.amount > 0 ? '+' : ''}${formatCurrency(tx.amount)}</span>
            </div>`).join('');
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) { showToast('Erreur dashboard worker : ' + e.message, 'error'); }
}

/* =============================================================
   33. WORKER — TÂCHES
   ============================================================= */
async function loadWorkerTasks() {
  const grid = document.getElementById('worker-tasks-grid');
  if (grid) grid.innerHTML = '<div class="empty-state">Chargement des tâches...</div>';

  if (currentUser.maintenance) {
    if (grid) grid.innerHTML = `
      <div class="empty-state">
        <i data-lucide="lock" class="w-10 h-10 text-yellow-400"></i>
        <p>Votre compte est en maintenance. Vous ne pouvez pas prendre de tâches.</p>
        <button class="btn-primary mt-4" onclick="showPage('worker-maintenance')">Payer la maintenance</button>
      </div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  try {
    // Tâche déjà prise par ce worker
    const myTaskSnap = await db.collection('tasks')
      .where('workerId', '==', currentUser.id)
      .where('status', '==', 'taken').get();
    const myTask = myTaskSnap.docs.length > 0 ? { id: myTaskSnap.docs[0].id, ...myTaskSnap.docs[0].data() } : null;

    const snap  = await db.collection('tasks').where('status', '==', 'available').orderBy('createdAt', 'desc').get();
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (grid) {
      grid.innerHTML = tasks.length === 0 && !myTask
        ? '<div class="empty-state"><i data-lucide="briefcase" class="w-10 h-10 text-gray-500"></i><p>Aucune tâche disponible pour le moment.</p></div>'
        : [
            myTask ? renderWorkerTaskCard(myTask, true) : '',
            ...tasks.map(t => renderWorkerTaskCard(t, false))
          ].join('');
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) { showToast('Erreur tâches : ' + e.message, 'error'); }
}

function renderWorkerTaskCard(task, isMine) {
  return `
    <div class="task-card card ${isMine ? 'task-card-mine' : ''}">
      ${task.imageUrl ? `<img src="${escapeHtml(task.imageUrl)}" class="task-card-img" alt="Tâche" />` : ''}
      <div class="task-card-body">
        <div class="task-card-header">
          <h3 class="task-title">${escapeHtml(task.title || '—')}</h3>
          <span class="task-reward">${formatCurrency(task.reward || 0)}</span>
        </div>
        <p class="task-desc">${escapeHtml((task.description || '').substring(0, 120))}${(task.description || '').length > 120 ? '...' : ''}</p>
        ${task.estimatedHours ? `<p class="task-hours"><i data-lucide="clock" class="w-3 h-3"></i> ${task.estimatedHours}h estimée(s)</p>` : ''}
        <div class="task-card-footer">
          ${isMine
            ? `<span class="badge badge-yellow">En cours</span>
               <button class="btn-primary btn-sm" onclick="openTaskProofModal('${task.id}')">
                 <i data-lucide="upload" class="w-4 h-4"></i> Soumettre preuve
               </button>`
            : `<button class="btn-primary btn-sm" onclick="acceptTask('${task.id}')">
                 <i data-lucide="play" class="w-4 h-4"></i> Prendre la tâche
               </button>`}
        </div>
      </div>
    </div>`;
}

async function acceptTask(taskId) {
  // Vérifier si le worker a déjà une tâche en cours
  const existing = await db.collection('tasks')
    .where('workerId', '==', currentUser.id).where('status', '==', 'taken').get();
  if (!existing.empty) {
    showToast('Vous avez déjà une tâche en cours. Terminez-la avant d\'en prendre une autre.', 'warning');
    return;
  }

  try {
    await db.collection('tasks').doc(taskId).update({
      status: 'taken',
      workerId: currentUser.id,
      workerUsername: currentUser.username,
      takenAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Tâche prise ! Bonne chance !', 'success');
    addLog('task', `Tâche prise : ${taskId}`, currentUser.username);
    loadWorkerTasks();
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
}

function openTaskProofModal(taskId) {
  document.getElementById('task-proof-id').value = taskId;
  document.getElementById('task-proof-url').value = '';
  hide('task-proof-upload-progress');

  db.collection('tasks').doc(taskId).get().then(doc => {
    if (!doc.exists) return;
    const task = doc.data();
    const instrBox = document.getElementById('task-instructions-box');
    if (instrBox) instrBox.innerHTML = `<p>${escapeHtml(task.description || '')}</p>${task.tutorial ? `<hr style="margin:0.5rem 0;border-color:var(--border)"><p style="white-space:pre-line;font-size:0.85rem">${escapeHtml(task.tutorial)}</p>` : ''}`;
    const imgWrap = document.getElementById('task-proof-task-image-wrap');
    const img     = document.getElementById('task-proof-task-image');
    if (task.imageUrl) {
      imgWrap?.classList.remove('hidden');
      if (img) img.src = task.imageUrl;
    } else {
      imgWrap?.classList.add('hidden');
    }
  });
  openModal('modal-task-proof');
}

function handleTaskProofFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  // Upload immédiat et stocker l'URL dans l'input
  show('task-proof-upload-progress');
  uploadToImgbb(file, 'task-proof-progress-bar', 'task-proof-progress-text', 'task-proof-upload-progress')
    .then(url => {
      const input = document.getElementById('task-proof-url');
      if (input) input.value = url;
      hide('task-proof-upload-progress');
      showToast('Image uploadée !', 'success');
    })
    .catch(e => { showToast('Erreur upload : ' + e.message, 'error'); hide('task-proof-upload-progress'); });
}

async function submitTaskProof() {
  const taskId   = document.getElementById('task-proof-id')?.value;
  const proofUrl = document.getElementById('task-proof-url')?.value.trim();

  if (!proofUrl) { showToast('Veuillez fournir une URL de preuve ou uploader une image.', 'warning'); return; }

  const btnText = document.getElementById('task-proof-btn-text');
  const spinner = document.getElementById('task-proof-spinner');
  if (btnText) btnText.textContent = 'Envoi...';
  if (spinner) spinner.classList.remove('hidden');

  try {
    await db.collection('tasks').doc(taskId).update({
      status: 'pending',
      proofUrl,
      proofSubmittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeModal();
    showToast('Preuve soumise ! En attente de validation.', 'success');
    addLog('task', `Preuve soumise pour tâche ${taskId}`, currentUser.username);
    loadWorkerTasks();
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  finally {
    if (btnText) btnText.textContent = 'Soumettre';
    if (spinner) spinner.classList.add('hidden');
  }
}

/* =============================================================
   34. WORKER — HISTORIQUE
   ============================================================= */
async function loadWorkerHistory() {
  const tbody = document.getElementById('history-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">Chargement...</td></tr>';
  try {
    const snap = await db.collection('transactions')
      .where('userId', '==', currentUser.id)
      .orderBy('createdAt', 'desc').limit(50).get();
    const txs = snap.docs.map(d => d.data());

    if (tbody) {
      tbody.innerHTML = txs.length === 0
        ? '<tr><td colspan="4" class="text-center py-8 text-gray-400">Aucune transaction</td></tr>'
        : txs.map(tx => `
            <tr>
              <td>${formatDateAbs(tx.createdAt)}</td>
              <td>${escapeHtml(tx.description || tx.type || '—')}</td>
              <td class="${tx.amount > 0 ? 'text-green-400' : 'text-red-400'} font-medium">
                ${tx.amount > 0 ? '+' : ''}${formatCurrency(tx.amount)}
              </td>
              <td>
                <span class="badge badge-${tx.type === 'task_reward' ? 'green' : tx.type === 'withdrawal' ? 'red' : 'blue'}">
                  ${tx.type === 'task_reward' ? 'Tâche' : tx.type === 'withdrawal' ? 'Retrait' : 'Autre'}
                </span>
              </td>
            </tr>`).join('');
    }
  } catch (e) { showToast('Erreur historique : ' + e.message, 'error'); }
}

/* =============================================================
   35. WORKER — MAINTENANCE
   ============================================================= */
async function loadMaintenancePage() {
  try {
    const doc = await db.collection('users').doc(currentUser.id).get();
    if (doc.exists) currentUser = { id: doc.id, ...doc.data() };

    const amount  = currentUser.maintenanceAmount || globalSettings.maintenanceFee || 250;
    const mAmount = document.getElementById('worker-maintenance-amount');
    if (mAmount) mAmount.textContent = formatCurrency(amount);

    // Afficher les numéros de paiement
    const payBox = document.getElementById('payment-numbers-display');
    const mcDisp = document.getElementById('moncash-display');
    const ncDisp = document.getElementById('natcash-display');
    const mcNum  = document.getElementById('moncash-number-display');
    const ncNum  = document.getElementById('natcash-number-display');

    if (payBox) payBox.classList.remove('hidden');
    if (globalSettings.moncashNumber) {
      mcDisp?.classList.remove('hidden');
      if (mcNum) mcNum.textContent = globalSettings.moncashNumber;
    } else { mcDisp?.classList.add('hidden'); }
    if (globalSettings.natcashNumber) {
      ncDisp?.classList.remove('hidden');
      if (ncNum) ncNum.textContent = globalSettings.natcashNumber;
    } else { ncDisp?.classList.add('hidden'); }

    // Vérifier si une preuve est déjà soumise
    const submittedMsg = document.getElementById('maintenance-submitted-msg');
    if (submittedMsg) {
      const mainSnap = await db.collection('maintenances')
        .where('workerId', '==', currentUser.id).where('status', '==', 'paid').get();
      if (!mainSnap.empty) {
        submittedMsg.classList.remove('hidden');
        show('maintenance-submitted-msg');
      } else {
        submittedMsg.classList.add('hidden');
      }
    }
  } catch (e) { showToast('Erreur maintenance : ' + e.message, 'error'); }
}

function handleMaintenanceFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const container = document.getElementById('upload-progress-container');
  if (container) container.classList.remove('hidden');
  uploadToImgbb(file)
    .then(url => {
      const input = document.getElementById('maintenance-proof-url');
      if (input) input.value = url;
      showToast('Image uploadée ! Cliquez sur Soumettre.', 'success');
    })
    .catch(e => {
      showToast('Erreur upload : ' + e.message, 'error');
      if (container) container.classList.add('hidden');
    });
}

async function submitMaintenanceProof() {
  const proofUrl = document.getElementById('maintenance-proof-url')?.value.trim();
  if (!proofUrl) { showToast('Veuillez fournir une URL ou uploader une image.', 'warning'); return; }

  const btn     = document.getElementById('submit-proof-btn');
  const btnText = document.getElementById('submit-proof-btn-text');
  const spinner = document.getElementById('submit-proof-spinner');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Envoi...';
  if (spinner) spinner.classList.remove('hidden');

  try {
    // Trouver la maintenance active de ce worker
    const snap = await db.collection('maintenances')
      .where('workerId', '==', currentUser.id).where('status', '==', 'pending').get();

    if (snap.empty) {
      showToast('Aucune maintenance active trouvée.', 'error');
      return;
    }

    const batch = db.batch();
    snap.docs.forEach(d => {
      batch.update(d.ref, {
        status: 'paid',
        proofUrl,
        proofSubmittedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();

    show('maintenance-submitted-msg');
    showToast('Preuve soumise ! En attente de validation.', 'success');
    addLog('maintenance', `Preuve maintenance soumise — ${currentUser.username}`, currentUser.username);

    // Notifier l'admin (en cherchant l'admin)
    const adminSnap = await db.collection('users').where('role', '==', 'admin').limit(1).get();
    if (!adminSnap.empty) {
      await createNotification(adminSnap.docs[0].id, 'Preuve de maintenance',
        `${currentUser.username} a soumis une preuve de paiement maintenance.`, 'info');
    }
  } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Soumettre la preuve';
    if (spinner) spinner.classList.add('hidden');
  }
}

/* =============================================================
   36. WORKER — RETRAIT
   ============================================================= */
function selectMethod(method) {
  selectedMethod = method;
  document.getElementById('method-moncash')?.classList.toggle('selected', method === 'MonCash');
  document.getElementById('method-natcash')?.classList.toggle('selected', method === 'Natcash');
}

async function loadWorkerWithdrawal() {
  const balEl = document.getElementById('wd-balance');
  const doc   = await db.collection('users').doc(currentUser.id).get();
  if (doc.exists) { currentUser = { id: doc.id, ...doc.data() }; updateTopbarBalance(); }
  if (balEl) balEl.textContent = formatCurrency(currentUser.balance || 0);
  hide('withdrawal-error');
  await loadMyWithdrawals();
}

async function requestWithdrawal() {
  const amount = parseFloat(document.getElementById('wd-amount')?.value || 0);
  const phone  = document.getElementById('wd-phone')?.value.trim();
  const errDiv = document.getElementById('withdrawal-error');
  const errMsg = document.getElementById('withdrawal-error-msg');

  const showErr = (msg) => { if (errDiv) errDiv.classList.remove('hidden'); if (errMsg) errMsg.textContent = msg; };

  if (currentUser.maintenance) { showErr('Votre compte est en maintenance. Réglez la maintenance d\'abord.'); return; }
  if (!amount || amount < 100) { showErr('Montant minimum : 100 HTG.'); return; }
  if (!phone) { showErr('Numéro de téléphone requis.'); return; }
  if ((currentUser.balance || 0) < amount) { showErr('Solde insuffisant.'); return; }

  const btn     = document.getElementById('withdrawal-btn');
  const btnText = document.getElementById('withdrawal-btn-text');
  const spinner = document.getElementById('withdrawal-spinner');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Envoi...';
  if (spinner) spinner.classList.remove('hidden');

  try {
    await db.collection('users').doc(currentUser.id).update({
      balance: firebase.firestore.FieldValue.increment(-amount)
    });
    await db.collection('withdrawals').add({
      userId: currentUser.id, username: currentUser.username,
      amount, method: selectedMethod, phone, status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('transactions').add({
      userId: currentUser.id, username: currentUser.username,
      type: 'withdrawal', amount: -amount,
      description: `Retrait ${selectedMethod} — ${phone}`,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    currentUser.balance = (currentUser.balance || 0) - amount;
    hide('withdrawal-error');
    document.getElementById('wd-amount').value = '';
    document.getElementById('wd-phone').value  = '';
    document.getElementById('wd-balance').textContent = formatCurrency(currentUser.balance);
    updateTopbarBalance();
    showToast('Demande de retrait envoyée !', 'success');
    addLog('withdrawal', `Retrait demandé — ${formatCurrency(amount)} — ${selectedMethod}`, currentUser.username);
    await loadMyWithdrawals();
  } catch (e) { showErr('Erreur : ' + e.message); }
  finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Envoyer la demande';
    if (spinner) spinner.classList.add('hidden');
  }
}

async function loadMyWithdrawals() {
  const list = document.getElementById('my-withdrawals-list');
  if (!list) return;
  try {
    const snap = await db.collection('withdrawals')
      .where('userId', '==', currentUser.id)
      .orderBy('createdAt', 'desc').limit(10).get();
    const items = snap.docs.map(d => d.data());
    list.innerHTML = items.length === 0
      ? '<div class="empty-state-sm">Aucun retrait</div>'
      : items.map(w => `
          <div class="mini-list-item">
            <i data-lucide="arrow-up-circle" class="w-4 h-4 text-blue-400"></i>
            <div class="mini-item-info">
              <p class="mini-item-title">${escapeHtml(w.method || '—')} — ${escapeHtml(w.phone || '')}</p>
              <p class="mini-item-sub">${formatDate(w.createdAt)}</p>
            </div>
            <div>
              <span class="mini-item-value">${formatCurrency(w.amount)}</span>
              <span class="badge badge-${w.status === 'approved' ? 'green' : w.status === 'rejected' ? 'red' : 'yellow'}" style="display:block;margin-top:2px">${w.status}</span>
            </div>
          </div>`).join('');
    if (window.lucide) lucide.createIcons();
  } catch (e) {}
}

/* =============================================================
   37. OFFERWALLS
   ============================================================= */
const OFFERWALL_URLS = {
  monlix:    'https://monlix.com/wall/',
  adscend:   'https://adscendmedia.com/offer_wall/',
  ayet:      'https://www.ayetstudios.com/offers/',
  offertoro: 'https://www.offertoro.com/ifr/',
};

function openOfferwall(name) {
  const url = OFFERWALL_URLS[name] || '#';

  // Détecter si manager ou worker
  const role = currentUser?.role || 'worker';
  const containerId = role === 'manager' ? 'offerwall-iframe-container-mgr' : 'offerwall-iframe-container';
  const iframeId    = role === 'manager' ? 'offerwall-iframe-mgr'           : 'offerwall-iframe';
  const titleId     = role === 'manager' ? 'offerwall-iframe-title-mgr'      : 'offerwall-iframe-title';

  const container = document.getElementById(containerId);
  const iframe    = document.getElementById(iframeId);
  const titleEl   = document.getElementById(titleId);

  const labels = { monlix: 'Monlix', adscend: 'Adscend Media', ayet: 'AyetStudios', offertoro: 'Offertoro' };
  if (titleEl) titleEl.textContent = labels[name] || name;
  if (iframe) iframe.src = url;
  if (container) container.classList.remove('hidden');
  container?.scrollIntoView({ behavior: 'smooth' });
}

function closeOfferwall() {
  ['offerwall-iframe-container', 'offerwall-iframe-container-mgr'].forEach(id => {
    hide(id);
    const iframeId = id + (id.includes('mgr') ? '' : '').replace('container', 'iframe').replace('container-mgr', 'mgr');
    const iframe = document.getElementById(
      id.includes('mgr') ? 'offerwall-iframe-mgr' : 'offerwall-iframe'
    );
    if (iframe) iframe.src = '';
  });
}

/* =============================================================
   38. PARTICULES (écran connexion)
   ============================================================= */
function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left  = Math.random() * 100 + '%';
    p.style.top   = Math.random() * 100 + '%';
    p.style.width = p.style.height = (Math.random() * 4 + 2) + 'px';
    p.style.animationDelay    = Math.random() * 5 + 's';
    p.style.animationDuration = (Math.random() * 10 + 5) + 's';
    container.appendChild(p);
  }
}

/* =============================================================
   39. RETRYCONNECTION (écran hors ligne)
   ============================================================= */
function retryConnection() {
  window.location.reload();
}

/* =============================================================
   40. KEYBOARD SHORTCUT — Fermer notifications au clic extérieur
   ============================================================= */
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notif-dropdown');
  const toggle   = document.getElementById('notif-toggle');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    if (!dropdown.contains(e.target) && e.target !== toggle && !toggle?.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

/* =============================================================
   41. INITIALISATION
   ============================================================= */
window.addEventListener('DOMContentLoaded', () => {
  startSplash();
  if (window.lucide) lucide.createIcons();
});
