import { useEffect, useRef, useState } from 'react';
import { admin } from '../index.js';
import { useDialog } from './shared.jsx';

/** 'admin' | 'moderator' | null for the signed-in person. Cached for the session. Display only: the database re-checks every call. */
let cached;
export function useStaffRole() {
  const [role, setRole] = useState(cached ?? null);
  useEffect(() => { if (cached === undefined) admin.role().then((r) => { cached = r; setRole(r); }).catch(() => {}); }, []);
  return role;
}

/** Moderator / admin: remove a place with a predefined (or custom) reason. The creator is emailed that reason. place = { id, name, creator? } */
export function DeletePlaceModal({ place, onClose, onDone, notify }) {
  const dlg = useRef(null); useDialog(dlg, onClose);
  const [code, setCode] = useState('guidelines'); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const custom = code === 'custom'; const ok = !custom || text.trim().length >= 5;
  const send = async (e) => {
    e.preventDefault(); if (!ok) return; setBusy(true);
    try {
      const r = await admin.deletePlace(place.id, code, text.trim());
      notify(`Place removed${r?.closed_reports ? ` · ${r.closed_reports} report${r.closed_reports > 1 ? 's' : ''} resolved` : ''}${r?.notified ? ' · creator emailed' : ''}`);
      onDone?.();
    } catch (er) {
      const m = String(er?.message || '');
      notify(m.includes('forbidden') ? 'You are not allowed to do this.' : m.includes('not_found') ? 'This place is already gone.' : m.includes('reason_required') ? 'Write a reason (at least 5 characters).' : 'Could not delete the place.', 'err');
      setBusy(false);
    }
  };
  return (<div className="modal" onClick={onClose}><form className="panel mform" role="dialog" aria-modal="true" aria-label="Delete place" ref={dlg} onClick={(e) => e.stopPropagation()} onSubmit={send}>
    <h3>Delete “{place.name}”?</h3>
    <p className="muted">Posts stay, but lose the place tag. The reason below is emailed to the person who created it{place.creator ? ` (@${place.creator})` : ''}, and every open report on this place is resolved.</p>
    <select value={code} onChange={(e) => setCode(e.target.value)} aria-label="Reason">{admin.DELETION_REASONS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
    <textarea rows="3" maxLength={300} required={custom} placeholder={custom ? 'Explain why (required, shown to the creator)' : 'Optional extra note for the creator'} value={text} onChange={(e) => setText(e.target.value)} />
    <div className="acts"><button className="primary danger" disabled={busy || !ok}>{busy ? 'Deleting…' : 'Delete place'}</button><button type="button" className="ghost" onClick={onClose}>Cancel</button></div>
  </form></div>);
}
