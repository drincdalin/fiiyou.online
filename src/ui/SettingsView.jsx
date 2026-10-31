import { useState } from 'react';
import { auth } from '../index.js';
import { ask } from './dialog.jsx';
import { friendlyError } from './errors.jsx';
import PushToggle from './PushToggle.jsx';
import { ChangePasswordModal } from './PasswordMeter.jsx';

/** /settings: everything about this device and this account in one place, so the account menu can stay short. */
export default function SettingsView({ notify }) {
  const [pw, setPw] = useState(false);
  const del = async () => {
    if (!(await ask({ title: 'Delete your account?', message: 'Your account and everything in it will be deleted. This cannot be undone.', confirmLabel: 'Delete account', danger: true }))) return;
    try { await auth.deleteAccount(); } catch (e) { notify(friendlyError(e, 'Could not delete the account. Nothing was lost, try again.'), 'err'); }
  };
  return (<div className="plain view settings"><h2>Settings</h2>
    <h4 className="shead">Notifications</h4>
    <div className="panel sgroup"><PushToggle notify={notify} /></div>
    <h4 className="shead">Account</h4>
    <div className="panel sgroup"><div className="srow"><div><b>Password</b><small>Choose a new password for signing in.</small></div><button type="button" className="ghost sm" onClick={() => setPw(true)}>Change password</button></div></div>
    <h4 className="shead">Danger zone</h4>
    <div className="panel sgroup"><div className="srow"><div><b>Delete account</b><small>Removes your profile, posts, photos and messages for good.</small></div><button type="button" className="ghost sm danger" onClick={del}>Delete account</button></div></div>
    {pw && <ChangePasswordModal onClose={() => setPw(false)} notify={notify} />}
  </div>);
}
