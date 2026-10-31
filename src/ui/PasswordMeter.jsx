import { useState } from 'react';
import { auth } from '../index.js';
import { passwordStrength } from '../lib/password.js';
import { friendlyError } from './errors.jsx';
import './more.css';

/** Four bars + a short label under a password field. Purely advisory: the only hard rule is still 8 characters. */
export function PasswordMeter({ value, username = '', email = '' }) {
  if (!value) return null;
  const s = passwordStrength(value, { username, email });
  return (<div className="pwmeter" data-score={s.score} role="status" aria-live="polite">
    <span className="pwbars" aria-hidden="true">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= s.score ? 'on' : ''} />)}</span>
    <small>{s.label}{s.hint ? ` · ${s.hint}` : ''}</small></div>);
}

/** Account menu → Change password. Asks for the current password first. */
export function ChangePasswordModal({ onClose, notify }) {
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [again, setAgain] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const bad = !cur || pw.length < 8 || pw !== again || pw === cur;
  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    if (passwordStrength(pw).score === 0) return setMsg('Choose a less common password.');
    setBusy(true);
    try { await auth.changePassword(cur, pw); notify('Password changed'); onClose(); }
    catch (er) { setMsg(er.message === 'wrong_password' ? 'The current password is not right.' : friendlyError(er)); setBusy(false); }
  };
  const reset = async () => {
    try { const email = await auth.myEmail(); if (!email) return; await auth.resetPassword(email); setMsg(''); notify('Reset link sent. Check your email.'); onClose(); }
    catch (er) { setMsg(friendlyError(er)); }
  };
  return (<div className="modal" onClick={onClose}><form className="panel mform" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
    <h3>Change password</h3>
    <label className="field"><span>Current password</span><input type="password" autoFocus required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label>
    <label className="field"><span>New password</span><input type="password" required minLength={8} autoComplete="new-password" placeholder="8+ characters" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
    <PasswordMeter value={pw} />
    <label className="field"><span>New password again</span><input type="password" required minLength={8} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      {again && pw !== again && <small className="err">The two passwords do not match.</small>}</label>
    {msg && <p className="err" role="alert">{msg}</p>}
    <div className="acts"><button className="primary" disabled={busy || bad}>{busy ? '…' : 'Change password'}</button><button type="button" className="ghost" onClick={onClose}>Cancel</button></div>
    <button type="button" className="link muted" onClick={reset}>I do not remember it. Email me a reset link.</button>
  </form></div>);
}
