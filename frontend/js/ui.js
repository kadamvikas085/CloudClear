/* CloudClear AI — UI helpers: safe DOM builder, icons, toasts, dialogs, formatters.
 * All data is inserted with textContent / setAttribute, never innerHTML. The only
 * innerHTML use is for the constant SVG icon strings below (no user data). */

/* ---------------- DOM builder ---------------- */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, ...children) {
  clear(node);
  append(node, children);
}

/* ---------------- icons (constant markup only) ---------------- */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  lab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  download: '<path d="M12 4v12m0 0 5-5m-5 5-5-5M4 19h16"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v5m0 3h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-5m0-3h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
};

export function icon(name, size = 18) {
  const wrap = document.createElement('span');
  wrap.style.display = 'inline-flex';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return wrap;
}

/* ---------------- toasts ---------------- */
function toastHost() {
  let host = document.getElementById('toasts');
  if (!host) {
    host = el('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite', 'aria-atomic': 'false' });
    document.body.append(host);
  }
  return host;
}

export function toast(message, kind = 'info', ms = 4500) {
  const t = el('div', { class: `toast ${kind}`, role: kind === 'err' ? 'alert' : 'status' },
    el('span', { class: 't-ico' }, icon(kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : 'info')),
    el('span', { text: message }));
  toastHost().append(t);
  setTimeout(() => t.remove(), ms);
}

/* ---------------- dialogs ---------------- */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function openDialog({ title, sub, body, actions = [], dismissible = true, onClose }) {
  const previouslyFocused = document.activeElement;
  const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  const actionRow = el('div', { class: 'dlg-actions' });
  const dialog = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    el('h2', { id: titleId, text: title }),
    sub ? el('p', { class: 'dlg-sub', text: sub }) : null,
    body || null,
    actionRow);
  const overlay = el('div', { class: 'dialog-overlay' }, dialog);

  const api = {
    el: dialog,
    close() {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      if (onClose) onClose();
    },
    setBusy(busy) {
      actionRow.querySelectorAll('button').forEach((b) => { b.disabled = busy; });
    },
  };

  actions.forEach((a) => {
    const b = el('button', {
      type: 'button',
      class: `btn btn-sm ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : 'btn-ghost'}`,
      text: a.label,
      onclick: () => (a.onClick ? a.onClick(api) : api.close()),
    });
    actionRow.append(b);
  });

  function onKey(e) {
    if (e.key === 'Escape' && dismissible) { e.stopPropagation(); api.close(); return; }
    if (e.key === 'Tab') {
      const items = [...dialog.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  if (dismissible) overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) api.close(); });
  document.body.append(overlay);
  const firstField = dialog.querySelector('input,select,textarea') || dialog.querySelector('button');
  if (firstField) firstField.focus();
  return api;
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    openDialog({
      title, sub: message,
      onClose: () => done(false),
      actions: [
        { label: 'Cancel', onClick: (d) => { d.close(); } },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: (d) => { done(true); d.close(); } },
      ],
    });
  });
}

/* ---------------- state blocks ---------------- */
export function emptyState({ iconName = 'image', title, text, action }) {
  return el('div', { class: 'empty' }, icon(iconName, 36), el('h3', { text: title }), text ? el('p', { text }) : null, action || null);
}

export function errorState(err, onRetry) {
  const msg = err && (err.fullMessage || err.message) ? (err.fullMessage || err.message) : 'Something went wrong.';
  return el('div', { class: 'notice err', role: 'alert' },
    el('div', { text: msg }),
    onRetry ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', style: { marginTop: '10px' }, onclick: onRetry }, icon('refresh', 14), 'Try again') : null);
}

export function skeletons(count = 3, height = 72) {
  return el('div', { class: 'stack', 'aria-busy': 'true', 'aria-label': 'Loading' },
    Array.from({ length: count }, () => el('div', { class: 'skeleton', style: { height: `${height}px` } })));
}

/* ---------------- badges ---------------- */
const STATUS = {
  queued: ['badge-wait', 'Queued'],
  running: ['badge-run', 'Running'],
  completed: ['badge-ok', 'Completed'],
  failed: ['badge-bad', 'Failed'],
  uploaded: ['badge-plain', 'Uploaded'],
  processing: ['badge-run', 'Processing'],
  processed: ['badge-ok', 'Processed'],
  active: ['badge-ok', 'Active'],
  archived: ['badge-plain', 'Archived'],
};

export function statusBadge(status) {
  const [cls, label] = STATUS[status] || ['badge-plain', status || 'Unknown'];
  return el('span', { class: `badge ${cls}`, text: label });
}

/* ---------------- formatters ---------------- */
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  const s = Math.round(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return formatDate(iso);
}

export function formatBytes(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let v = Number(n); let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

export function formatNumber(n, digits = 3) {
  return n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(digits);
}

/** Only allow http(s) URLs into src/href attributes. */
export function safeUrl(u) {
  try {
    const url = new URL(u, location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

export function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?';
}

/** Files the browser can render in <img>. TIFF cannot be previewed. */
export function isBrowserImage(fileType) {
  return fileType === 'png' || fileType === 'jpg';
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function plural(n, word) { return `${n} ${word}${Number(n) === 1 ? '' : 's'}`; }
