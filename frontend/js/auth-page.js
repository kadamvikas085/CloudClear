/* Login and registration pages. Same API contract as before, now through the shared client. */
import { AuthAPI, session } from './api.js';

const $ = (id) => document.getElementById(id);
const msg = $('msg');
const submitBtn = $('submitBtn');
const params = new URLSearchParams(location.search);

function show(el, text, type) {
  el.textContent = text;
  el.className = `msg ${type}`;
}

/* Only allow redirecting back to a hash route inside the app. */
function nextTarget() {
  const n = params.get('next') || '';
  return /^#\/[a-z]/.test(n) ? `app.html${n}` : 'app.html#/dashboard';
}

const loginForm = $('loginForm');
if (loginForm) {
  const notice = $('notice');
  const reason = params.get('reason');
  if (reason === 'expired') show(notice, 'Your session has expired. Please log in again.', 'info');
  else if (reason === 'password') show(notice, 'Password changed. Please log in with your new password.', 'info');

  // Already signed in? Go straight to the app (the app re-validates the session).
  if (session.token() && !reason) location.replace(nextTarget());

  let busy = false;
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const email = $('email').value.trim();
    const password = $('password').value;
    if (!email || !password) { show(msg, 'Enter your email and password.', 'error'); return; }
    busy = true; submitBtn.disabled = true; submitBtn.textContent = 'Logging in…'; msg.className = 'msg';
    try {
      await AuthAPI.login(email, password);
      show(msg, 'Login successful. Opening your workspace…', 'success');
      location.replace(nextTarget());
    } catch (err) {
      show(msg, err.fullMessage || err.message || 'Something went wrong.', 'error');
      busy = false; submitBtn.disabled = false; submitBtn.textContent = 'Log in';
    }
  });
}

const registerForm = $('registerForm');
if (registerForm) {
  let busy = false;
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const name = $('name').value.trim();
    const email = $('email').value.trim();
    const password = $('password').value;
    if (name.length < 2) return show(msg, 'Name must be at least 2 characters.', 'error');
    if (!email) return show(msg, 'Enter your email address.', 'error');
    if (password.length < 8 || !/\d/.test(password) || !/[A-Za-z]/.test(password)) {
      return show(msg, 'Password needs at least 8 characters, including a letter and a number.', 'error');
    }
    busy = true; submitBtn.disabled = true; submitBtn.textContent = 'Creating account…'; msg.className = 'msg';
    try {
      await AuthAPI.register(name, email, password);
      show(msg, 'Account created. A verification email has been queued. You can log in now.', 'success');
      registerForm.reset();
      setTimeout(() => location.replace('login.html'), 1800);
    } catch (err) {
      show(msg, err.fullMessage || err.message || 'Something went wrong.', 'error');
      busy = false; submitBtn.disabled = false; submitBtn.textContent = 'Create account';
    }
  });
}
