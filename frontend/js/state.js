/* Small shared state: current user and the remembered project selection. */
import { session } from './api.js';

const PROJECT_KEY = 'cc.selectedProject';

export function currentUser() { return session.user(); }

export function getSelectedProjectId() {
  try { return localStorage.getItem(PROJECT_KEY) || ''; } catch { return ''; }
}

export function setSelectedProjectId(id) {
  try {
    if (id) localStorage.setItem(PROJECT_KEY, id);
    else localStorage.removeItem(PROJECT_KEY);
  } catch { /* storage blocked: selection just won't persist */ }
}

/* Polling policy shared by the experiment views. */
export const POLL = {
  intervalMs: 3000,
  maxIntervalMs: 10000,
  /* The queue retries failed jobs (3 attempts, exponential backoff) and each
     retry flips the experiment back to "running", so "failed" is only final
     after a grace period. */
  failedGraceMs: 60000,
  maxTotalMs: 15 * 60 * 1000,
};
