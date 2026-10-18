/* CloudClear AI — shared API client.
 *
 * Centralises: base URL, Bearer auth, JSON + multipart bodies, error parsing,
 * network-failure handling and a single-flight 401 -> /auth/refresh -> retry.
 * The refresh token lives in an httpOnly cookie scoped to /api/v1/auth, so
 * every call uses credentials: 'include'. Only the short-lived access token is
 * kept client-side (sessionStorage, same keys the original pages used).
 */

const TOKEN_KEY = 'accessToken';
const USER_KEY = 'user';

export function baseUrl() {
  return (window.API_BASE_URL || 'http://localhost:5000/api/v1').replace(/\/+$/, '');
}

/* ---------------- session storage ---------------- */
function safeGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* storage blocked */ } }
function safeDel(k) { try { sessionStorage.removeItem(k); } catch { /* noop */ } }

export const session = {
  token: () => safeGet(TOKEN_KEY),
  setToken: (t) => safeSet(TOKEN_KEY, t),
  user() {
    try { return JSON.parse(safeGet(USER_KEY) || 'null'); } catch { return null; }
  },
  setUser: (u) => safeSet(USER_KEY, JSON.stringify(u)),
  clear() {
    safeDel(TOKEN_KEY);
    safeDel(USER_KEY);
  },
};

/* ---------------- errors ---------------- */
export class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
  /** Message plus per-field validation details, for display. */
  get fullMessage() {
    if (Array.isArray(this.details) && this.details.length) {
      const parts = this.details.map((d) => (typeof d === 'string' ? d : d.message)).filter(Boolean);
      if (parts.length) return `${this.message}: ${parts.join('; ')}`;
    }
    return this.message;
  }
}

const NETWORK_MSG = 'Cannot reach the server. Check that the backend is running and your connection is up.';

async function parseBody(res) {
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try { return await res.json(); } catch { return null; }
  }
  return null;
}

function toApiError(res, body) {
  const msg = (body && body.message) || `Request failed (${res.status})`;
  return new ApiError(res.status, msg, body && body.details ? body.details : null);
}

/* ---------------- 401 handling ---------------- */
let refreshing = null;

async function refreshAccessToken() {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${baseUrl()}/auth/refresh`, { method: 'POST', credentials: 'include' });
        const body = await parseBody(res);
        if (!res.ok || !body || !body.data || !body.data.accessToken) return false;
        session.setToken(body.data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
  }
  return refreshing;
}

export function redirectToLogin(reason) {
  session.clear();
  const here = location.hash && location.hash.length > 1 ? location.hash : '';
  const q = new URLSearchParams();
  if (reason) q.set('reason', reason);
  if (here) q.set('next', here);
  location.replace(`login.html${q.toString() ? '?' + q : ''}`);
}

function buildUrl(path, query) {
  const url = new URL(baseUrl() + path, location.href);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }
  return url.toString();
}

/**
 * Core request. opts: { method, query, json, form, auth (default true), signal }
 * Do NOT set Content-Type for FormData; the browser adds the multipart boundary.
 */
export async function request(path, opts = {}) {
  const { method = 'GET', query, json, form, auth = true, signal } = opts;

  const send = async () => {
    const headers = {};
    if (auth && session.token()) headers.Authorization = `Bearer ${session.token()}`;
    let body;
    if (form) body = form;
    else if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    try {
      return await fetch(buildUrl(path, query), { method, headers, body, credentials: 'include', signal });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new ApiError(0, NETWORK_MSG);
    }
  };

  let res = await send();
  if (res.status === 401 && auth) {
    const ok = await refreshAccessToken();
    if (!ok) {
      redirectToLogin('expired');
      throw new ApiError(401, 'Your session has expired. Please log in again.');
    }
    res = await send();
  }
  const data = await parseBody(res);
  if (!res.ok) throw toApiError(res, data);
  return data || { success: true, data: null };
}

/** Multipart upload with progress (fetch cannot report upload progress). */
export function upload(path, form, { onProgress, signal } = {}) {
  const attempt = () => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildUrl(path));
    xhr.withCredentials = true;
    if (session.token()) xhr.setRequestHeader('Authorization', `Bearer ${session.token()}`);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiError(0, NETWORK_MSG));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, body });
    };
    if (signal) signal.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });

  return (async () => {
    let r = await attempt();
    if (r.status === 401) {
      const ok = await refreshAccessToken();
      if (!ok) { redirectToLogin('expired'); throw new ApiError(401, 'Your session has expired. Please log in again.'); }
      r = await attempt();
    }
    if (!r.ok) {
      throw new ApiError(r.status, (r.body && r.body.message) || `Upload failed (${r.status})`, r.body && r.body.details);
    }
    return r.body;
  })();
}

/* ---------------- endpoints (verified against backend src) ---------------- */
export const AuthAPI = {
  async login(email, password) {
    const r = await request('/auth/login', { method: 'POST', json: { email, password }, auth: false });
    session.setToken(r.data.accessToken);
    session.setUser(r.data.user);
    return r.data.user;
  },
  register: (name, email, password) => request('/auth/register', { method: 'POST', json: { name, email, password }, auth: false }),
  async logout() {
    try { await request('/auth/logout', { method: 'POST', auth: false }); } catch { /* best effort */ }
    session.clear();
  },
  async me() {
    const r = await request('/auth/me');
    session.setUser(r.data.user);
    return r.data.user;
  },
  resendVerification: (email) => request('/auth/resend-verification', { method: 'POST', json: { email }, auth: false }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', json: { email }, auth: false }),
};

export const ProjectsAPI = {
  list: (q = {}) => request('/projects', { query: q }),
  get: (id) => request(`/projects/${encodeURIComponent(id)}`),
  create: (body) => request('/projects', { method: 'POST', json: body }),
  update: (id, body) => request(`/projects/${encodeURIComponent(id)}`, { method: 'PATCH', json: body }),
};

export const ImagesAPI = {
  list: (projectId, q = {}) => request('/images', { query: { projectId, ...q } }),
  get: (id) => request(`/images/${encodeURIComponent(id)}`),
  upload(projectId, file, opts) {
    const form = new FormData();
    form.append('projectId', projectId); // text field before the file
    form.append('image', file);
    return upload('/images', form, opts);
  },
  remove: (id) => request(`/images/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const ExperimentsAPI = {
  list: (q = {}) => request('/experiments', { query: q }),
  get: (id) => request(`/experiments/${encodeURIComponent(id)}`),
  process: (imageId, model) => request('/experiments/process', { method: 'POST', json: { imageId, model } }),
};

export const DashboardAPI = {
  summary: () => request('/dashboard/summary'),
};

export const NotificationsAPI = {
  list: (q = {}) => request('/notifications', { query: q }),
  markRead: (id) => request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }),
  markAllRead: () => request('/notifications/read-all', { method: 'PATCH' }),
};

export const UsersAPI = {
  updateProfile: (name) => request('/users/me', { method: 'PATCH', json: { name } }),
  changePassword: (currentPassword, newPassword) =>
    request('/users/me/password', { method: 'PATCH', json: { currentPassword, newPassword } }),
  deleteAccount: (password) => request('/users/me', { method: 'DELETE', json: { password } }),
};
