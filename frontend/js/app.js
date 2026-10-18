/* CloudClear AI — workspace shell: auth guard, sidebar, top bar, hash router. */
import { session, AuthAPI, NotificationsAPI, redirectToLogin } from './api.js';
import { el, mount, icon, toast, initials, relativeTime, safeUrl, errorState } from './ui.js';

const ROUTES = [
  { path: 'dashboard', title: 'Dashboard', icon: 'dashboard', load: () => import('./pages/dashboard.js') },
  { path: 'projects', title: 'Projects', icon: 'folder', load: () => import('./pages/projects.js') },
  { path: 'lab', title: 'Image Lab', icon: 'flask', load: () => import('./pages/lab.js') },
  { path: 'experiments', title: 'Experiments', icon: 'list', load: () => import('./pages/experiments.js') },
  { path: 'results', title: 'Results', icon: 'image', load: () => import('./pages/results.js') },
  { path: 'models', title: 'Model Zoo', icon: 'cpu', load: () => import('./pages/models.js') },
  { path: 'settings', title: 'Settings', icon: 'settings', load: () => import('./pages/settings.js') },
];

const $ = (id) => document.getElementById(id);
let user = null;
let current = null; // { destroy }
let navToken = 0;

/* ---------------- boot ---------------- */
async function boot() {
  if (!session.token()) {
    // A refresh cookie may still be valid (e.g. new tab): try /auth/me, which refreshes on 401.
    try { user = await AuthAPI.me(); } catch { return redirectToLogin(); }
  } else {
    try { user = await AuthAPI.me(); } catch (e) {
      if (e && e.status === 0) {
        $('boot').replaceChildren(errorState(e, () => location.reload()));
        return;
      }
      return redirectToLogin('expired');
    }
  }
  buildShell();
  $('boot').hidden = true;
  $('app').hidden = false;
  window.addEventListener('hashchange', route);
  route();
}

/* ---------------- shell ---------------- */
function buildShell() {
  const nav = $('sideNav');
  ROUTES.forEach((r) => {
    nav.append(el('a', { href: `#/${r.path}`, dataset: { route: r.path } }, icon(r.icon), r.title));
  });
  $('menuBtn').append(icon('menu', 20));

  const menuBtn = $('menuBtn');
  const sidebar = $('sidebar');
  const scrim = $('scrim');
  const setDrawer = (open) => {
    sidebar.classList.toggle('open', open);
    scrim.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', () => setDrawer(!sidebar.classList.contains('open')));
  scrim.addEventListener('click', () => setDrawer(false));
  nav.addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });

  buildProfileMenu();
  buildNotifications();
}

function closeOnOutside(wrap, close) {
  const handler = (e) => { if (!wrap.contains(e.target)) close(); };
  document.addEventListener('mousedown', handler);
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); } });
}

function buildProfileMenu() {
  const wrap = $('profileWrap');
  const btn = el('button', { type: 'button', class: 'profile-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Account menu' },
    el('span', { class: 'avatar' }, user.avatarUrl && safeUrl(user.avatarUrl)
      ? el('img', { src: safeUrl(user.avatarUrl), alt: '' })
      : initials(user.name)),
    el('span', { class: 'profile-name', text: user.name }));
  let menu = null;
  const close = () => { if (menu) { menu.remove(); menu = null; btn.setAttribute('aria-expanded', 'false'); } };
  btn.addEventListener('click', () => {
    if (menu) return close();
    menu = el('div', { class: 'menu', role: 'menu' },
      el('div', { class: 'menu-head' }, el('b', { text: user.name }), el('span', { text: user.email })),
      el('a', { href: '#/settings', role: 'menuitem', onclick: close }, icon('user', 16), 'Profile & settings'),
      el('a', { href: 'index.html', role: 'menuitem' }, icon('globe', 16), 'Public website'),
      el('button', { type: 'button', role: 'menuitem', onclick: logout }, icon('logout', 16), 'Log out'));
    wrap.append(menu);
    btn.setAttribute('aria-expanded', 'true');
  });
  wrap.append(btn);
  closeOnOutside(wrap, close);
}

export async function logout() {
  await AuthAPI.logout();
  location.replace('login.html');
}

/* ---------------- notifications ---------------- */
function buildNotifications() {
  const wrap = $('notifWrap');
  const badge = el('span', { class: 'dot-badge', hidden: true });
  const btn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Notifications', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, icon('bell'), badge);
  let panel = null;
  let timer = null;

  const close = () => { if (panel) { panel.remove(); panel = null; btn.setAttribute('aria-expanded', 'false'); } };

  async function refreshCount() {
    try {
      const r = await NotificationsAPI.list({ limit: 1, isRead: false });
      const n = r.data.unreadCount || 0;
      badge.hidden = n === 0;
      badge.textContent = n > 99 ? '99+' : String(n);
      btn.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications');
    } catch { /* silent: bell just shows no count */ }
  }

  async function openPanel() {
    panel = el('div', { class: 'menu notif-panel', role: 'region', 'aria-label': 'Notifications' }, el('div', { class: 'notif-item faint', text: 'Loading…' }));
    wrap.append(panel);
    btn.setAttribute('aria-expanded', 'true');
    try {
      const r = await NotificationsAPI.list({ limit: 10 });
      if (!panel) return;
      const items = r.data.notifications;
      const head = el('div', { class: 'menu-head row-between' }, el('b', { text: 'Notifications' }),
        items.some((n) => !n.isRead)
          ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', style: { width: 'auto' }, text: 'Mark all read', onclick: async () => {
            try { await NotificationsAPI.markAllRead(); close(); refreshCount(); } catch (e) { toast(e.message, 'err'); }
          } })
          : null);
      const body = items.length
        ? items.map((n) => {
          const target = n.meta && n.meta.experimentId ? `#/results/${encodeURIComponent(n.meta.experimentId)}` : null;
          const row = el(target ? 'a' : 'div', {
            class: `notif-item${n.isRead ? '' : ' unread'}`,
            href: target,
            onclick: async () => {
              if (!n.isRead) { try { await NotificationsAPI.markRead(n._id); } catch { /* ignore */ } refreshCount(); }
              close();
            },
          }, el('b', { text: n.title }), el('span', { text: n.message }), el('time', { text: relativeTime(n.createdAt) }));
          return row;
        })
        : [el('div', { class: 'notif-item faint', text: 'No notifications yet.' })];
      mount(panel, head, ...body);
    } catch (e) {
      if (panel) mount(panel, el('div', { class: 'notif-item' }, errorState(e)));
    }
  }

  btn.addEventListener('click', () => (panel ? close() : openPanel()));
  wrap.append(btn);
  closeOnOutside(wrap, close);
  refreshCount();
  timer = setInterval(() => { if (!document.hidden) refreshCount(); }, 60000);
  window.addEventListener('beforeunload', () => clearInterval(timer));
  window.addEventListener('cc:notifications-changed', refreshCount);
}

/* ---------------- router ---------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: segs[0] || 'dashboard', params: segs.slice(1), query: Object.fromEntries(new URLSearchParams(queryPart)) };
}

async function route() {
  const { name, params, query } = parseHash();
  const def = ROUTES.find((r) => r.path === name);
  const main = $('main');
  const token = ++navToken;

  if (current && current.destroy) { try { current.destroy(); } catch { /* ignore */ } }
  current = null;

  if (!def) {
    location.replace('#/dashboard');
    return;
  }

  $('topTitle').textContent = def.title;
  document.title = `${def.title} — CloudClear AI`;
  document.querySelectorAll('#sideNav a').forEach((a) => {
    if (a.dataset.route === def.path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  mount(main, el('div', { class: 'stack' }, el('div', { class: 'skeleton', style: { height: '40px', width: '40%' } }), el('div', { class: 'skeleton', style: { height: '160px' } })));
  try {
    const mod = await def.load();
    if (token !== navToken) return; // navigated away while loading
    const ctx = { params, query, user, main, setTitle: (t) => { $('topTitle').textContent = t; } };
    const page = await mod.default(ctx);
    if (token !== navToken) { if (page && page.destroy) page.destroy(); return; }
    current = page || null;
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  } catch (e) {
    if (token !== navToken) return;
    mount(main, errorState(e, route));
  }
}

boot();
