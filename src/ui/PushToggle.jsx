import { useEffect, useState } from 'react';
import { Bell } from '@phosphor-icons/react';
import { pushStatus, enablePush, disablePush } from './push.js';

/** Settings row: push notifications on this device. It never vanishes silently; when push cannot work it says why. */
export default function PushToggle({ notify }) {
  const [st, setSt] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { pushStatus().then(setSt).catch(() => setSt('unsupported')); }, []);
  const toggle = async () => {
    setBusy(true);
    try {
      if (st === 'on') { await disablePush(); setSt('off'); notify('Push notifications off'); }
      else { await enablePush(); setSt('on'); notify('Push notifications on'); }
    } catch (e) { if (e?.message === 'denied') setSt('denied'); else notify(`Could not turn notifications on: ${e?.message || 'unknown error'}`, 'err'); }
    setBusy(false);
  };
  const text = {
    noconfig: 'Not set up on this server yet (the site was built without a VAPID key, see docs/PUSH_SETUP.md).',
    unsupported: 'This browser cannot show push notifications.',
    install: 'On iPhone: tap Share, then “Add to Home Screen”, and open fiiyou from there.',
    denied: 'Blocked for this site. Allow notifications in your browser’s site settings.',
    off: 'Get a notification on this device when someone likes, comments or messages you.',
    on: 'On for this device.',
  }[st];
  return (<div className="srow"><span className="sico"><Bell size={20} weight="bold" aria-hidden="true" /></span><div><b>Push notifications</b><small>{text || 'Checking…'}</small></div>
    {(st === 'on' || st === 'off') && <button type="button" className={st === 'on' ? 'ghost sm' : 'primary sm'} disabled={busy} onClick={toggle}>{st === 'on' ? 'Turn off' : 'Turn on'}</button>}</div>);
}
