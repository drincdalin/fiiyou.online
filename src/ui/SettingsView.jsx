import { useCallback, useEffect, useState } from 'react';
import { LockKey, Trash, Prohibit } from '@phosphor-icons/react';
import { auth, safety } from '../index.js';
import { useImages, Avatar } from './shared.jsx';
import { ask } from './dialog.jsx';
import { ErrorState, friendlyError } from './errors.jsx';
import PushToggle from './PushToggle.jsx';
import { ChangePasswordModal } from './PasswordMeter.jsx';

/** People you blocked. Unblocking does not bring a friendship back (blocking removed it). */
function Blocked({ notify, go }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(null);
  const load = useCallback(() => { setErr(null); return safety.listBlocked().then((r) => setRows(r || [])).catch((e) => { setErr(e); setRows([]); }); }, []);
  useEffect(() => { load(); }, [load]);
  const img = useImages((rows || []).map((r) => r.user?.avatar_path));
  const unblock = async (u) => {
    if (!(await ask({ title: `Unblock ${u.display_name}?`, message: 'They will be able to see your profile and interact with you again. You will not be friends again automatically.', confirmLabel: 'Unblock' }))) return;
    setBusy(u.id);
    try { await safety.unblockUser(u.id); setRows((r) => r.filter((x) => x.user.id !== u.id)); notify('Unblocked'); }
    catch (e) { notify(friendlyError(e), 'err'); }
    setBusy(null);
  };
  if (err) return <ErrorState error={err} onRetry={load} title="Could not load your blocked list" />;
  if (rows === null) return <p className="empty" role="status">Loading…</p>;
  if (!rows.length) return <div className="empty"><p>You have not blocked anyone.</p><small>People you block can no longer see or contact you. Block someone from their profile.</small></div>;
  return (<>{rows.map(({ user: u }) => (<div className="row" key={u.id}><Avatar src={img[u.avatar_path]} size={44} />
    <span className="link" style={{ textAlign: 'left' }}>{u.display_name}<small>@{u.username}</small></span>
    <button type="button" className="ghost sm" disabled={busy === u.id} onClick={() => unblock(u)}>{busy === u.id ? '…' : 'Unblock'}</button></div>))}</>);
}

/** /settings: this device and this account, split into the same pill tabs the rest of the app uses. */
export default function SettingsView({ notify, go }) {
  const [tab, setTab] = useState('account'); const [pw, setPw] = useState(false);
  const del = async () => {
    if (!(await ask({ title: 'Delete your account?', message: 'Your account and everything in it will be deleted. This cannot be undone.', confirmLabel: 'Delete account', danger: true }))) return;
    try { await auth.deleteAccount(); } catch (e) { notify(friendlyError(e, 'Could not delete the account. Nothing was lost, try again.'), 'err'); }
  };
  return (<div className="plain view settings"><h2>Settings</h2>
    <div className="tabs" role="tablist" aria-label="Settings">
      {[['account', 'Account'], ['notifications', 'Notifications'], ['blocked', 'Blocked']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'account' && <>
      <div className="panel sgroup"><div className="srow"><span className="sico"><LockKey size={20} weight="bold" aria-hidden="true" /></span><div><b>Password</b><small>Choose a new password for signing in.</small></div><button type="button" className="ghost sm" onClick={() => setPw(true)}>Change</button></div></div>
      <div className="panel sgroup sdanger"><div className="srow"><span className="sico"><Trash size={20} weight="bold" aria-hidden="true" /></span><div><b>Delete account</b><small>Removes your profile, posts, photos and messages for good.</small></div><button type="button" className="ghost sm danger" onClick={del}>Delete</button></div></div></>}
    {tab === 'notifications' && <div className="panel sgroup"><PushToggle notify={notify} /></div>}
    {tab === 'blocked' && <Blocked notify={notify} go={go} />}
    {pw && <ChangePasswordModal onClose={() => setPw(false)} notify={notify} />}
  </div>);
}
