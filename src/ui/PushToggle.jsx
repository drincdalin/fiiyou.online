import { useEffect, useState } from 'react';
import { BellRinging, BellSlash } from '@phosphor-icons/react';
import { pushStatus, enablePush, disablePush } from './push.js';
import './more.css';

/** One line in the account menu: turn push notifications on or off for this device. Hidden where push cannot work. */
export default function PushToggle({ notify, isAdmin = false }) {
  const [st, setSt] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { pushStatus().then(setSt).catch(() => setSt('unsupported')); }, []);
  if (!st) return null;
  // not configured on this server: only the operator needs to know (and how to fix it); everybody else just has no switch
  if (st === 'noconfig') return isAdmin ? <p className="muted pushhint">Push notifications are not set up: VITE_VAPID_PUBLIC_KEY is missing in this build. See docs/PUSH_SETUP.md, then redeploy.</p> : null;
  if (st === 'unsupported') return <p className="muted pushhint">This browser cannot show push notifications.</p>;
  if (st === 'install') return <p className="muted pushhint">To get notifications on iPhone: tap Share, then “Add to Home Screen”, and open fiiyou from there.</p>;
  if (st === 'denied') return <p className="muted pushhint">Notifications are blocked for this site. Allow them in your browser’s site settings to turn them on.</p>;
  const on = st === 'on';
  const toggle = async () => {
    setBusy(true);
    try {
      if (on) { await disablePush(); setSt('off'); notify('Push notifications off'); }
      else { await enablePush(); setSt('on'); notify('Push notifications on'); }
    } catch (e) { if (e?.message === 'denied') setSt('denied'); else notify('Could not change notifications', 'err'); }
    setBusy(false);
  };
  return (<button type="button" role="menuitem" disabled={busy} onClick={toggle}>
    {on ? <BellSlash size={18} weight="bold" aria-hidden="true" /> : <BellRinging size={18} weight="bold" aria-hidden="true" />}
    {on ? 'Turn off push notifications' : 'Turn on push notifications'}</button>);
}
