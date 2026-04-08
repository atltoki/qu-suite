
(() => {
  const SB_URL = 'https://hofctcynzmqufgpqcavi.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvZmN0Y3luem1xdWZncHFjYXZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjA5NDMsImV4cCI6MjA4OTU5Njk0M30.bTTpvU-Gg1bKqY8Qv3MNIsTyrdPU5aKibSdcLCgBzK8';
  const APPS = [
    { id: 'cockpit', label: 'Cockpit', icon: '🧠' },
    { id: 'index', label: 'Hub', icon: '⌂' },
    { id: 'app', label: 'Scan', icon: '📷' },
    { id: 'crm', label: 'CRM', icon: '◎' },
    { id: 'dashboard', label: 'Stats', icon: '⬡' },
    { id: 'admin', label: 'Admin', icon: '◈' }
  ];

  function pageUrl(id) {
    if (!id || id === 'index' || id === 'hub') return 'index.html';
    return id + '.html';
  }

  function navigate(id, hash = '') {
    const next = pageUrl(id) + (hash ? ('#' + String(hash).replace(/^#/, '')) : '');
    window.location.href = next;
  }

  window.quNavigate = navigate;
  window.goTo = navigate;
  window.goToCockpit = (section = '') => navigate('cockpit', section);

  function isBottomNavPage() {
    return !!document.querySelector('.nav-bottom, .nav, .adm-tabs');
  }

  function injectStyles() {
    if (document.getElementById('qu-bridge-style')) return;
    const style = document.createElement('style');
    style.id = 'qu-bridge-style';
    style.textContent = `
      .qu-bridge-launcher{
        position:fixed;
        right:12px;
        top:12px;
        z-index:2147483646;
        width:46px;height:46px;border-radius:16px;
        border:1px solid rgba(255,92,0,.30);
        background:linear-gradient(180deg,rgba(255,122,46,.18),rgba(255,92,0,.08));
        color:#F0EDE6;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 12px 30px rgba(0,0,0,.35);
        backdrop-filter:blur(16px);
        -webkit-backdrop-filter:blur(16px);
        font:700 18px/1 'DM Sans',sans-serif;
        cursor:pointer;
        user-select:none;
      }
      .qu-bridge-launcher.bottom{
        top:auto;
        bottom:calc(12px + env(safe-area-inset-bottom));
      }
      .qu-bridge-badge{
        position:absolute;top:-6px;right:-6px;
        min-width:18px;height:18px;padding:0 5px;border-radius:999px;
        background:#FF5C00;color:#000;font-size:10px;font-weight:800;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 0 2px rgba(10,10,10,.9);
      }
      .qu-bridge-panel{
        position:fixed;
        right:12px;
        top:66px;
        z-index:2147483645;
        width:min(320px, calc(100vw - 24px));
        background:rgba(18,18,18,.98);
        color:#F0EDE6;
        border:1px solid rgba(255,255,255,.08);
        border-radius:18px;
        box-shadow:0 22px 60px rgba(0,0,0,.45);
        transform:translateY(8px) scale(.98);
        opacity:0;
        pointer-events:none;
        transition:all .18s ease;
        overflow:hidden;
      }
      .qu-bridge-panel.open{
        opacity:1;
        pointer-events:auto;
        transform:none;
      }
      .qu-bridge-head{
        padding:14px 14px 10px;
        border-bottom:1px solid rgba(255,255,255,.08);
        display:flex;justify-content:space-between;align-items:center;gap:10px;
      }
      .qu-bridge-title{font:700 12px/1.2 'DM Sans',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#9A9590}
      .qu-bridge-close{
        width:30px;height:30px;border-radius:10px;border:1px solid rgba(255,255,255,.08);
        background:rgba(255,255,255,.03);color:#F0EDE6;cursor:pointer;
      }
      .qu-bridge-list{display:grid;gap:8px;padding:12px 12px 14px}
      .qu-bridge-item{
        display:flex;align-items:center;gap:10px;
        border:1px solid rgba(255,255,255,.08);
        background:#111;
        color:#F0EDE6;border-radius:14px;padding:10px 12px;cursor:pointer;text-decoration:none;
      }
      .qu-bridge-item:active{transform:scale(.98)}
      .qu-bridge-ic{width:28px;height:28px;border-radius:10px;background:rgba(255,92,0,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0}
      .qu-bridge-name{font:700 13px/1.1 'DM Sans',sans-serif}
      .qu-bridge-sub{font:12px;color:#9A9590;margin-top:2px;line-height:1.2}
      .qu-bridge-dot{width:8px;height:8px;border-radius:50%;background:#22C55E;box-shadow:0 0 10px rgba(34,197,94,.6)}
      .qu-bridge-dot.off{background:#EF4444;box-shadow:0 0 10px rgba(239,68,68,.45)}
      .qu-bridge-toast{
        position:fixed;left:50%;top:12px;transform:translateX(-50%) translateY(-8px);
        z-index:2147483647;background:rgba(18,18,18,.98);color:#fff;
        border:1px solid rgba(255,92,0,.35);box-shadow:0 16px 40px rgba(0,0,0,.45);
        border-radius:14px;padding:10px 14px;font:500 13px/1.35 'DM Sans',sans-serif;
        opacity:0;pointer-events:none;transition:all .18s ease;
      }
      .qu-bridge-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    let t = document.getElementById('qu-bridge-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'qu-bridge-toast';
      t.className = 'qu-bridge-toast';
      document.body.appendChild(t);
    }
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(window.__quBridgeToastTimer);
    window.__quBridgeToastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function buildLauncher() {
    if (document.getElementById('qu-bridge-launcher')) return;
    const btn = document.createElement('button');
    btn.id = 'qu-bridge-launcher';
    btn.className = 'qu-bridge-launcher' + (isBottomNavPage() ? ' bottom' : '');
    btn.type = 'button';
    btn.innerHTML = '∞<span class="qu-bridge-badge" id="qu-bridge-badge">0</span>';
    btn.addEventListener('click', togglePanel);
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'qu-bridge-panel';
    panel.className = 'qu-bridge-panel';
    panel.innerHTML = `
      <div class="qu-bridge-head">
        <div>
          <div class="qu-bridge-title">Navigation totale</div>
          <div style="font-size:12px;color:#9A9590;margin-top:3px">Hub • Cockpit • Scan • CRM • Stats • Admin</div>
        </div>
        <div class="qu-bridge-dot" id="qu-bridge-dot" title="realtime"></div>
      </div>
      <div class="qu-bridge-list">
        ${APPS.map(a => `<a class="qu-bridge-item" href="${pageUrl(a.id)}"><div class="qu-bridge-ic">${a.icon}</div><div><div class="qu-bridge-name">${a.label}</div><div class="qu-bridge-sub">Ouvrir ${a.label.toLowerCase()}</div></div></a>`).join('')}
      </div>
    `;
    document.body.appendChild(panel);

    document.addEventListener('click', function(ev){
      const p = document.getElementById('qu-bridge-panel');
      const b = document.getElementById('qu-bridge-launcher');
      if (!p || !b) return;
      if (ev && (p.contains(ev.target) || b.contains(ev.target))) return;
      p.classList.remove('open');
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.getElementById('qu-bridge-panel')?.classList.remove('open');
    });
  }

  function togglePanel(ev) {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    const p = document.getElementById('qu-bridge-panel');
    if (!p) return;
    p.classList.toggle('open');
  }

  function cleanSW() {
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister())).catch(() => {});
      }
      if ('caches' in window && caches.keys) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).catch(() => {});
      }
    } catch (e) {}
  }

  function emitRealtime(payload) {
    const dot = document.getElementById('qu-bridge-dot');
    const badge = document.getElementById('qu-bridge-badge');
    if (dot) dot.classList.remove('off');
    if (badge) badge.textContent = String((Number(badge.textContent || '0') + 1));
    window.dispatchEvent(new CustomEvent('qu:realtime', { detail: payload }));
    if (typeof window.quOnRealtime === 'function') {
      try { window.quOnRealtime(payload); } catch (e) {}
    }
    if (payload && payload.table) toast('Live: ' + payload.table);
  }

  function setupSupabase() {
    if (!window.supabase || window.__quBridgeSb) return;
    try {
      const sb = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        }
      });
      window.__quBridgeSb = sb;
      const tables = ['qu_orders', 'qu_order_items', 'clients', 'stocks'];
      tables.forEach(table => {
        try {
          sb.channel('qu-live-' + table)
            .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
              emitRealtime({ table, payload });
            })
            .subscribe();
        } catch (e) {}
      });
      window.__quBridgeSbReady = true;
      const dot = document.getElementById('qu-bridge-dot');
      if (dot) dot.classList.remove('off');
    } catch (e) {
      console.warn('qu-bridge supabase init failed', e);
      const dot = document.getElementById('qu-bridge-dot');
      if (dot) dot.classList.add('off');
    }
  }

  function boot() {
    injectStyles();
    buildLauncher();
    cleanSW();
    setupSupabase();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.quBridgeRefresh = function() {
    setupSupabase();
  };
})();
