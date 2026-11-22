import { useEffect, useState } from 'react';
import { Warning, Info } from '@phosphor-icons/react';

/**
 * In-app replacement for window.confirm / window.alert.
 *
 *   if (!(await ask({ title: 'Delete this post?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
 *   await tell('Saved on this device only.');
 *
 * ask() resolves true (confirm) or false (cancel, Esc, click outside). tell() resolves when dismissed.
 * <DialogHost /> must be mounted once (see main.jsx). Dialogs queue, so two in a row never overlap.
 */
let push = null;
let nextId = 1;
const native = { confirm: window.confirm.bind(window), alert: window.alert.bind(window) };
const norm = (o) => (typeof o === 'string' ? { message: o } : o || {});

export function ask(opts) {
  const o = norm(opts);
  return new Promise((resolve) => {
    if (!push) return resolve(native.confirm([o.title, o.message].filter(Boolean).join('\n\n'))); // host not mounted yet: never lose the question
    push({ ...o, id: nextId++, resolve });
  });
}
export function tell(opts) {
  const o = norm(opts);
  return new Promise((resolve) => {
    if (!push) { native.alert([o.title, o.message].filter(Boolean).join('\n\n')); return resolve(true); }
    push({ ...o, alert: true, id: nextId++, resolve });
  });
}

/** Any leftover window.alert() calls in files not yet converted show the same card instead of the browser box. (confirm() is synchronous, so it must be converted to ask() by hand.) */
export function installDialogs() { window.alert = (m) => { tell({ message: String(m ?? '') }); }; }

export function DialogHost() {
  const [queue, setQueue] = useState([]);
  useEffect(() => { push = (d) => setQueue((q) => [...q, d]); return () => { push = null; }; }, []);
  const cur = queue[0];
  const close = (v) => { if (!cur) return; cur.resolve(v); setQueue((q) => q.slice(1)); };
  useEffect(() => {
    if (!cur) return;
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(false); } };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [cur]);
  if (!cur) return null;
  const Icon = cur.danger ? Warning : Info;
  const title = cur.title || (cur.alert ? 'Notice' : 'Are you sure?');
  return (<div className="modal dlg" onClick={() => close(false)}>
    <div key={cur.id} className={`panel dlgcard${cur.danger ? ' danger' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby={`dlg-t-${cur.id}`} aria-describedby={cur.message ? `dlg-m-${cur.id}` : undefined} onClick={(e) => e.stopPropagation()}>
      <div className="dlghead"><span className="dlgic"><Icon size={20} weight="fill" aria-hidden="true" /></span><h3 id={`dlg-t-${cur.id}`}>{title}</h3></div>
      {cur.message && <p className="dlgmsg" id={`dlg-m-${cur.id}`}>{cur.message}</p>}
      <div className="dlgacts">
        {!cur.alert && <button type="button" className="ghost" autoFocus={!!cur.danger} onClick={() => close(false)}>{cur.cancelLabel || 'Cancel'}</button>}
        <button type="button" className={`primary${cur.danger ? ' dangerbtn' : ''}`} autoFocus={!cur.danger} onClick={() => close(true)}>{cur.confirmLabel || 'OK'}</button>
      </div>
    </div>
  </div>);
}
