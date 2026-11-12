import { useEffect, useState } from 'react';
import { Bell } from '@phosphor-icons/react';
import { social } from '../index.js';
import { pushStatus, enablePush, disablePush } from './push.js';
import { friendlyError } from './errors.jsx';

/** Settings row: push notifications on this device. It never vanishes silently; when push cannot work it says why. */
export default function PushToggle({ notify }) {
  const [st, setSt] = useState(null); const [busy, setBusy] = useState(false); const [srv, setSrv] = useState(null);
  useEffect(() => { pushStatus().then(setSt).catch(() => setSt('unsupported')); }, []);
  useEffect(() => { if (st === 'on' || st === 'off') social.pushServerStatus().then(setSrv); }, [st]);   // is the server side there? (it can fail even when this device is fine)
  const toggle = async () => {
    setBusy(true);
    try {
      if (st === 'on') { await disablePush(); setSt('off'); notify('Notifications off on this device'); }
      else { await enablePush(); setSt('on'); notify('Notifications on for this device'); }
    } catch (e) {
      if (e?.message === 'denied') setSt('denied');
      else if (e?.message === 'dismissed') notify('Notifications were not allowed. Tap “Turn on” again and choose Allow.', 'err');   // closed the question: still "off", not "blocked"
      else notify(`Could not turn notifications on. ${friendlyError(e)}`, 'err');
    }
    setBusy(false);
  };
  const text = {
    // the build has no VAPID key: that is the owner's job (docs/PUSH_SETUP.md), so visitors only see a plain sentence
    noconfig: import.meta.env.DEV ? 'Not set up: this build has no VITE_VAPID_PUBLIC_KEY (see docs/PUSH_SETUP.md).' : 'Notifications are not available right now.',
    unsupported: 'This browser cannot show notifications. Try Chrome, Edge, Firefox or Safari 16.4+.',
    install: 'On iPhone and iPad, notifications only work once fiiyou is on your Home Screen: tap Share, then “Add to Home Screen”, and open it from there.',
    denied: 'Blocked for this site. Allow notifications in your browser’s site settings, then come back here.',
    off: 'Get a notification on this device when someone likes, comments, replies, mentions you, sends a friend request or messages you.',
    srvdown: import.meta.env.DEV ? 'The send-push Edge Function is not answering (not deployed, or deployed without --no-verify-jwt). See docs/PUSH_SETUP.md.' : 'Notifications are not available right now. Please try again later.',
    srvbroken: import.meta.env.DEV ? 'The send-push function is deployed but its VAPID keys or subject are wrong. Run the DIAG check in docs/PUSH_SETUP.md.' : 'Notifications are not available right now. Please try again later.',
    on: 'On for this device. You get these when the app is closed or in the background; while it is open you see them in the bell.',
  }[(st === 'on' || st === 'off') && srv === 'down' ? 'srvdown' : (st === 'on' || st === 'off') && srv === 'misconfigured' ? 'srvbroken' : st];
  const serverOk = srv !== 'down' && srv !== 'misconfigured';
  return (<div className="srow"><span className="sico"><Bell size={20} weight="bold" aria-hidden="true" /></span><div><b>Push notifications</b><small>{text || 'Checking…'}</small></div>
    {(st === 'on' || (st === 'off' && serverOk)) && <span className="sacts"><button type="button" className={st === 'on' ? 'ghost sm' : 'primary sm'} disabled={busy} onClick={toggle}>{st === 'on' ? 'Turn off' : 'Turn on'}</button></span>}</div>);
}
