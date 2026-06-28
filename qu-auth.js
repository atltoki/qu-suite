/* ════════════════════════════════════════════════════════════════════
   QU Auth — module d'authentification & multi-locataire partagé
   ────────────────────────────────────────────────────────────────────
   Charge ce script APRÈS le SDK supabase-js sur chaque page :
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
     <script src="qu-auth.js"></script>

   Il fournit window.QUAuth :
     • QUAuth.client                 → client Supabase authentifié (partagé)
     • QUAuth.requireAuth()          → redirige vers login.html si non connecté
     • QUAuth.requireActiveAccess()  → exige login + abonnement/essai actif
     • QUAuth.signIn / signUp / signOut / getUser / getProfile
     • QUAuth.startCheckout(plan)    → ouvre le paiement Stripe
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ─── Configuration (UN SEUL projet Supabase, partagé entre tous les
  //     clients ; l'isolation des données est assurée par la RLS). ───
  var SUPABASE_URL = 'https://hofctcynzmqufgpqcavi.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvZmN0Y3luem1xdWZncHFjYXZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjA5NDMsImV4cCI6MjA4OTU5Njk0M30.bTTpvU-Gg1bKqY8Qv3MNIsTyrdPU5aKibSdcLCgBzK8';

  // Pages publiques (pas de garde d'accès).
  var PUBLIC_PAGES = ['landing.html', 'login.html', '404.html'];

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[QUAuth] supabase-js manquant : charge le SDK avant qu-auth.js');
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  // ─── Jeton de session, lu SYNCHRONIQUEMENT depuis localStorage au
  //     chargement (évite toute course pour les pages en fetch REST brut
  //     comme index.html / dashboard.html). Tenu à jour ensuite. ───
  var _ref = (SUPABASE_URL.match(/https?:\/\/([^.]+)\./) || [])[1] || '';
  var _storageKey = 'sb-' + _ref + '-auth-token';
  var _token = null;
  try {
    var raw = localStorage.getItem(_storageKey);
    if (raw) {
      var parsed = JSON.parse(raw);
      _token = (parsed && (parsed.access_token || (parsed.currentSession && parsed.currentSession.access_token))) || null;
    }
  } catch (e) { /* pas de session persistée */ }

  client.auth.onAuthStateChange(function (_event, session) {
    _token = session && session.access_token ? session.access_token : null;
  });

  function currentPage() {
    var slug = location.pathname.replace(/\/+$/, '').split('/').pop();
    return slug || 'index.html';
  }

  function redirect(page) {
    var next = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace(page + (page === 'login.html' ? '?next=' + next : ''));
  }

  var QUAuth = {
    client: client,
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,

    // ─── Auth de base ───
    async getUser() {
      var res = await client.auth.getUser();
      return res && res.data ? res.data.user : null;
    },

    async getSession() {
      var res = await client.auth.getSession();
      return res && res.data ? res.data.session : null;
    },

    async signUp(email, password, meta) {
      return client.auth.signUp({
        email: email,
        password: password,
        options: { data: meta || {} }
      });
    },

    async signIn(email, password) {
      return client.auth.signInWithPassword({ email: email, password: password });
    },

    async signOut() {
      await client.auth.signOut();
      location.href = 'login.html';
    },

    async resetPassword(email) {
      return client.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + '/login.html'
      });
    },

    // ─── Profil & abonnement ───
    async getProfile() {
      var user = await this.getUser();
      if (!user) return null;
      var res = await client.from('profiles').select('*').eq('id', user.id).single();
      return res && res.data ? res.data : null;
    },

    // Essai non expiré OU abonnement actif.
    hasActiveAccess(profile) {
      if (!profile) return false;
      if (profile.subscription_status === 'active') return true;
      if (profile.subscription_status === 'trialing') {
        if (!profile.trial_ends_at) return true;
        return new Date(profile.trial_ends_at).getTime() > Date.now();
      }
      return false;
    },

    // ─── Gardes de page ───
    // Exige une session ; sinon → login.
    async requireAuth() {
      var user = await this.getUser();
      if (!user) { redirect('login.html'); return null; }
      return user;
    },

    // Exige session + accès actif ; sinon → login ou account (paiement).
    async requireActiveAccess() {
      var user = await this.getUser();
      if (!user) { redirect('login.html'); return null; }
      var profile = await this.getProfile();
      if (!this.hasActiveAccess(profile)) {
        location.replace('account.html?reason=inactive');
        return null;
      }
      return { user: user, profile: profile };
    },

    // ─── Paiement (Stripe via Edge Function) ───
    async startCheckout(plan) {
      var session = await this.getSession();
      if (!session) { redirect('login.html'); return; }
      var res = await fetch(SUPABASE_URL + '/functions/v1/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({ plan: plan || 'pro', origin: location.origin })
      });
      var json = await res.json();
      if (json && json.url) { location.href = json.url; }
      else { throw new Error(json && json.error ? json.error : 'Checkout indisponible'); }
    },

    async openBillingPortal() {
      var session = await this.getSession();
      if (!session) { redirect('login.html'); return; }
      var res = await fetch(SUPABASE_URL + '/functions/v1/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({ portal: true, origin: location.origin })
      });
      var json = await res.json();
      if (json && json.url) { location.href = json.url; }
      else { throw new Error(json && json.error ? json.error : 'Portail indisponible'); }
    },

    // ─── Helpers pour les appels REST bruts (fetch direct) ───
    // Renvoie le jeton de l'utilisateur connecté, sinon la clé anon.
    bearer() {
      return _token || SUPABASE_ANON_KEY;
    },

    // En-têtes prêts à l'emploi pour fetch(`${SUPABASE_URL}/rest/v1/...`).
    restHeaders(extra) {
      var h = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + this.bearer()
      };
      if (extra) for (var k in extra) h[k] = extra[k];
      return h;
    },

    isPublicPage() {
      return PUBLIC_PAGES.indexOf(currentPage()) !== -1;
    }
  };

  // Garde automatique : ajoute l'attribut data-qu-gate sur <html> ou <body>
  //   data-qu-gate="auth"    → requireAuth
  //   data-qu-gate="access"  → requireActiveAccess (défaut recommandé)
  function autoGate() {
    var el = document.documentElement.getAttribute('data-qu-gate') ||
             (document.body && document.body.getAttribute('data-qu-gate'));
    if (!el) return;
    if (el === 'auth') QUAuth.requireAuth();
    else QUAuth.requireActiveAccess();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoGate);
  } else {
    autoGate();
  }

  window.QUAuth = QUAuth;
})();
