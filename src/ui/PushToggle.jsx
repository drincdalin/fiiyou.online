import { useEffect, useState } from 'react';
import { Bell } from '@phosphor-icons/react';
import { social } from '../index.js';
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
  // sends a real push through the server to this person's own devices; tells exactly which link of the chain is broken
  const test = async () => {
    setBusy(true);
    try {
      const r = await social.sendTestPush();
      if (!r?.devices) notify('The server does not know this device. Turn push off and on again.', 'err');
      else if (r.sent > 0) notify('Test sent. It shows up as a system notification, even with the app open.');
      else notify(`The push service refused it${r.errors?.length ? ` (${r.errors.join(', ')})` : ''}. Turn push off and on again.`, 'err');
    } catch (e) { notify(e?.message || 'Could not send the test', 'err'); }
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
    {(st === 'on' || st === 'off') && <span className="sacts">{st === 'on' && <button type="button" className="ghost sm" disabled={busy} onClick={test}>Send test</button>}<button type="button" className={st === 'on' ? 'ghost sm' : 'primary sm'} disabled={busy} onClick={toggle}>{st === 'on' ? 'Turn off' : 'Turn on'}</button></span>}</div>);
}
