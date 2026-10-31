import { useEffect, useState } from 'react';
import { BellRinging, BellSlash, PaperPlaneTilt } from '@phosphor-icons/react';
import { social } from '../index.js';
import { pushStatus, enablePush, disablePush } from './push.js';

/** Account menu: turn push notifications on or off for this device, and send yourself a test. It never disappears silently:
 *  when push cannot work, it says why. */
export default function PushToggle({ notify }) {
  const [st, setSt] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { pushStatus().then(setSt).catch(() => setSt('unsupported')); }, []);
  if (!st) return null;
  if (st === 'noconfig') return <p className="muted pushhint">Push notifications are not set up on this server yet (the site was built without a VAPID key, see docs/PUSH_SETUP.md).</p>;
  if (st === 'unsupported') return <p className="muted pushhint">This browser cannot show push notifications.</p>;
  if (st === 'install') return <p className="muted pushhint">To get notifications on iPhone: tap Share, then “Add to Home Screen”, and open fiiyou from there.</p>;
  if (st === 'denied') return <p className="muted pushhint">Notifications are blocked for this site. Allow them in your browser’s site settings to turn them on.</p>;
  const on = st === 'on';
  const toggle = async () => {
    setBusy(true);
    try {
      if (on) { await disablePush(); setSt('off'); notify('Push notifications off'); }
      else { await enablePush(); setSt('on'); notify('Push notifications on'); }
    } catch (e) { if (e?.message === 'denied') setSt('denied'); else notify(`Could not turn notifications on: ${e?.message || 'unknown error'}`, 'err'); }
    setBusy(false);
  };
  // Says which link of the chain (device → function → push service) is broken.
  const test = async () => {
    setBusy(true);
    try {
      const r = await social.sendTestPush();
      if (!r.devices) notify('This device is not saved on the server. Turn notifications off and on again.', 'err');
      else if (r.sent) notify(r.sent > 1 ? `Test sent to ${r.sent} devices.` : 'Test sent. It should appear in a few seconds (close or hide the app first, it is not shown while fiiyou is open).');
      else { const f = r.failed?.[0]; notify(f?.code === 401 || f?.code === 403 ? 'The push service refused it: the VAPID keys of the website and of the function do not match.' : r.dead ? 'This device’s subscription had expired and was removed. Turn notifications off and on again.' : `Could not send: ${f?.message || 'unknown error'}`, 'err'); }
    } catch (e) {
      notify(e.message === 'not_deployed' ? 'The send-push function is not deployed on Supabase yet.' : e.message === 'old_function' ? 'send-push is an old version. Deploy it again (supabase functions deploy send-push --no-verify-jwt).' : 'The send-push function crashed. Check its logs; the VAPID secrets are probably missing.', 'err');
    }
    setBusy(false);
  };
  return (<>
    <button type="button" role="menuitem" disabled={busy} onClick={toggle}>
      {on ? <BellSlash size={18} weight="bold" aria-hidden="true" /> : <BellRinging size={18} weight="bold" aria-hidden="true" />}
      {on ? 'Turn off push notifications' : 'Turn on push notifications'}</button>
    {on && <button type="button" role="menuitem" disabled={busy} onClick={test}><PaperPlaneTilt size={18} weight="bold" aria-hidden="true" />Send a test notification</button>}
  </>);
}
