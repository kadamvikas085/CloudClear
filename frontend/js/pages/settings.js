/* Settings: profile name, password, email verification, account deletion, session. */
import { UsersAPI, AuthAPI, session, baseUrl } from '../api.js';
import { el, mount, toast, openDialog, formatDate } from '../ui.js';
import { pageHead } from '../components.js';

const PW_RULE = 'At least 8 characters, with at least one letter and one number.';

export default async function render({ main, user }) {
  const me = { ...user };

  /* ----- profile ----- */
  const nameIn = el('input', { class: 'input', id: 'st-name', value: me.name || '', minlength: '2', maxlength: '100', autocomplete: 'name' });
  const profileMsg = el('div', { role: 'status' });
  let savingProfile = false;
  const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary btn-sm', text: 'Save changes' });
  const profileForm = el('form', { novalidate: true },
    el('div', { class: 'field' }, el('label', { for: 'st-name', text: 'Full name' }), nameIn),
    el('div', { class: 'field' }, el('label', { for: 'st-email', text: 'Email' }), el('input', { class: 'input', id: 'st-email', value: me.email || '', disabled: true, 'aria-describedby': 'st-email-h' }),
      el('div', { class: 'hint', id: 'st-email-h', text: 'Your email address cannot be changed here.' })),
    saveBtn, profileMsg);
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (savingProfile) return;
    const n = nameIn.value.trim();
    if (n.length < 2) { mount(profileMsg, el('div', { class: 'form-error', role: 'alert', text: 'Name must be at least 2 characters.' })); return; }
    savingProfile = true; saveBtn.disabled = true; mount(profileMsg);
    try {
      const r = await UsersAPI.updateProfile(n);
      session.setUser(r.data.user);
      document.querySelectorAll('.profile-name').forEach((x) => { x.textContent = r.data.user.name; });
      toast('Profile updated.', 'ok');
    } catch (err) {
      mount(profileMsg, el('div', { class: 'form-error', role: 'alert', text: err.fullMessage || err.message }));
    } finally { savingProfile = false; saveBtn.disabled = false; }
  });

  /* ----- password ----- */
  const cur = el('input', { class: 'input', id: 'pw-cur', type: 'password', autocomplete: 'current-password' });
  const nw = el('input', { class: 'input', id: 'pw-new', type: 'password', autocomplete: 'new-password', minlength: '8', 'aria-describedby': 'pw-hint' });
  const pwMsg = el('div', { role: 'status' });
  const pwBtn = el('button', { type: 'submit', class: 'btn btn-primary btn-sm', text: 'Change password' });
  let savingPw = false;
  const pwForm = el('form', { novalidate: true },
    el('div', { class: 'field' }, el('label', { for: 'pw-cur', text: 'Current password' }), cur),
    el('div', { class: 'field' }, el('label', { for: 'pw-new', text: 'New password' }), nw, el('div', { class: 'hint', id: 'pw-hint', text: PW_RULE })),
    pwBtn, pwMsg);
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (savingPw) return;
    const v = nw.value;
    if (!cur.value) return mount(pwMsg, el('div', { class: 'form-error', role: 'alert', text: 'Enter your current password.' }));
    if (v.length < 8 || !/\d/.test(v) || !/[A-Za-z]/.test(v)) return mount(pwMsg, el('div', { class: 'form-error', role: 'alert', text: PW_RULE }));
    savingPw = true; pwBtn.disabled = true; mount(pwMsg);
    try {
      await UsersAPI.changePassword(cur.value, v);
      toast('Password changed. Please log in again.', 'ok', 3000);
      session.clear();
      setTimeout(() => location.replace('login.html?reason=password'), 900);
    } catch (err) {
      mount(pwMsg, el('div', { class: 'form-error', role: 'alert', text: err.fullMessage || err.message }));
      savingPw = false; pwBtn.disabled = false;
    }
  });

  /* ----- verification ----- */
  const verifyBlock = me.isEmailVerified
    ? el('div', { class: 'notice ok', text: 'Your email address is verified.' })
    : el('div', { class: 'notice warn' }, 'Your email address is not verified yet. ',
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', style: { marginLeft: '8px' }, text: 'Resend verification email', onclick: async (ev) => {
        const b = ev.currentTarget; b.disabled = true;
        try { await AuthAPI.resendVerification(me.email); toast('If the address is registered, a verification email has been sent.', 'ok'); } catch (err) { toast(err.fullMessage || err.message, 'err'); }
        b.disabled = false;
      } }));

  /* ----- delete ----- */
  const deleteBtn = el('button', { type: 'button', class: 'btn btn-danger btn-sm', text: 'Delete my account', onclick: deleteDialog });
  function deleteDialog() {
    const pw = el('input', { class: 'input', id: 'del-pw', type: 'password', autocomplete: 'current-password' });
    const msg = el('div', { class: 'form-error', role: 'alert', hidden: true });
    let busy = false;
    openDialog({
      title: 'Delete your account?',
      sub: 'This permanently deletes your account. Enter your password to confirm.',
      body: el('div', {}, el('div', { class: 'field' }, el('label', { for: 'del-pw', text: 'Password' }), pw), msg),
      actions: [{ label: 'Cancel' }, {
        label: 'Delete account', kind: 'danger', onClick: async (d) => {
          if (busy) return;
          if (!pw.value) { msg.textContent = 'Enter your password.'; msg.hidden = false; return; }
          busy = true; d.setBusy(true); msg.hidden = true;
          try { await UsersAPI.deleteAccount(pw.value); session.clear(); location.replace('index.html'); } catch (err) { msg.textContent = err.fullMessage || err.message; msg.hidden = false; busy = false; d.setBusy(false); }
        },
      }],
    });
  }

  mount(main,
    pageHead('Settings', 'Manage your profile and security.'),
    el('div', { class: 'grid grid-2', style: { alignItems: 'start' } },
      el('div', { class: 'stack' },
        el('section', { class: 'glass card', 'aria-labelledby': 'h-prof' }, el('div', { class: 'section-title', id: 'h-prof', text: 'Profile' }), profileForm),
        el('section', { class: 'glass card', 'aria-labelledby': 'h-ver' }, el('div', { class: 'section-title', id: 'h-ver', text: 'Email verification' }), verifyBlock)),
      el('div', { class: 'stack' },
        el('section', { class: 'glass card', 'aria-labelledby': 'h-pw' }, el('div', { class: 'section-title', id: 'h-pw', text: 'Password' }), pwForm),
        el('section', { class: 'glass card', 'aria-labelledby': 'h-acc' }, el('div', { class: 'section-title', id: 'h-acc', text: 'Account' }),
          el('dl', { class: 'kv' },
            el('dt', { text: 'Role' }), el('dd', { text: me.role || '—' }),
            el('dt', { text: 'Member since' }), el('dd', { text: formatDate(me.createdAt) }),
            el('dt', { text: 'Last login' }), el('dd', { text: formatDate(me.lastLoginAt) }),
            el('dt', { text: 'API' }), el('dd', { class: 'mono', style: { fontSize: '12px' }, text: baseUrl() })),
          el('div', { style: { marginTop: '18px' } }, deleteBtn)))));
}
