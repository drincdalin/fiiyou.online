import { useCallback, useEffect, useState } from 'react';
import { LockKey, Trash, DeviceMobile, DownloadSimple } from '@phosphor-icons/react';
import { auth, safety } from '../index.js';
import { useImages, Avatar } from './shared.jsx';
import { ask, tell } from './dialog.jsx';
import { ErrorState, friendlyError } from './errors.jsx';
import PushToggle from './PushToggle.jsx';
import { useInstallState, promptInstall } from './install.js';
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

/** Install fiiyou as an app. Browsers that allow it (Chrome, Edge, Brave, Opera, Vivaldi, Samsung Internet) install with one click.
 *  Safari and a few others do not let a website install itself, so the same button opens a short card with the exact steps. */
const GUIDE = {
  ios: { title: 'Add fiiyou to your Home Screen', message: '1. Tap the Share button (the square with an arrow) in Safari.\n2. Scroll down and tap “Add to Home Screen”.\n3. Tap Add. From now on open fiiyou from your Home Screen.\n\nUsing another browser and not seeing it? Open fiiyou in Safari.' },
  manual: { title: 'Install fiiyou', message: 'This browser does not let a website install itself. Open the browser menu (⋮ or ⋯) and choose “Install fiiyou” or “Add to Home screen”. In Safari on a Mac use File, then “Add to Dock”.\n\nIf you do not see any of these, this browser cannot install websites. Chrome, Edge, Brave and Opera can.' },
};
function InstallRow({ notify }) {
  const st = useInstallState(); const [busy, setBusy] = useState(false);
  const install = async () => {
    if (st === 'ready') {
      setBusy(true); const r = await promptInstall(); setBusy(false);
      if (r === 'accepted') notify('Installing fiiyou…');
      else if (r === 'unavailable') tell(GUIDE.manual);
      return;   // 'dismissed': they said no, nothing more to say
    }
    tell(st === 'ios' ? GUIDE.ios : GUIDE.manual);
  };
  const text = st === 'installed' ? 'You are using fiiyou as an installed app.' : 'Give fiiyou its own window and an icon on your home screen or desktop. It opens faster and feels like any other app.';
  return (<div className="srow"><span className="sico"><DeviceMobile size={20} weight="bold" aria-hidden="true" /></span><div><b>Install the app</b><small>{text}</small></div>
    {st !== 'installed' && <button type="button" className="primary sm" disabled={busy} onClick={install}><DownloadSimple size={16} weight="bold" aria-hidden="true" />{busy ? '…' : 'Install'}</button>}</div>);
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
      <div className="panel sgroup"><InstallRow notify={notify} /></div>
      <div className="panel sgroup"><div className="srow"><span className="sico"><LockKey size={20} weight="bold" aria-hidden="true" /></span><div><b>Password</b><small>Choose a new password for signing in.</small></div><button type="button" className="ghost sm" onClick={() => setPw(true)}>Change</button></div></div>
      <div className="panel sgroup sdanger"><div className="srow"><span className="sico"><Trash size={20} weight="bold" aria-hidden="true" /></span><div><b>Delete account</b><small>Removes your profile, posts, photos and messages for good.</small></div><button type="button" className="ghost sm danger" onClick={del}>Delete</button></div></div></>}
    {tab === 'notifications' && <div className="panel sgroup"><PushToggle notify={notify} /></div>}
    {tab === 'blocked' && <Blocked notify={notify} go={go} />}
    {pw && <ChangePasswordModal onClose={() => setPw(false)} notify={notify} />}
  </div>);
}
