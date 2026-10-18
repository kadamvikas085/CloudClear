/* Landing page: reflect login state in the nav. No credentials are handled here. */
import { session, AuthAPI } from './api.js';

if (session.token()) {
  const set = (id, hidden) => { const n = document.getElementById(id); if (n) n.hidden = hidden; };
  set('navCtaLoggedOut', true);
  set('navCtaLoggedIn', false);
  set('mobileLoginBtn', true);
  set('mobileRegisterBtn', true);
  set('mobileAppBtn', false);
  set('demoSignup', true);
  set('demoLogin', true);
  set('demoOpen', false);
  const out = document.getElementById('navLogoutBtn');
  if (out) out.addEventListener('click', async () => { await AuthAPI.logout(); location.reload(); });
}
