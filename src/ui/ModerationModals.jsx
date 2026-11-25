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

/** Moderator / admin: remove a post or comment with a predefined (or custom) reason. The author is emailed that reason.
 *  target = { type: 'post' | 'post_comment' | 'wall_comment', id, reportId?, author? } */
export function DeleteContentModal({ target, onClose, onDone, notify }) {
  const dlg = useRef(null); useDialog(dlg, onClose);
  const [code, setCode] = useState('guidelines'); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const custom = code === 'custom'; const ok = !custom || text.trim().length >= 5;
  const what = target.type === 'post' ? 'post' : 'comment';
  const send = async (e) => {
    e.preventDefault(); if (!ok || busy) return; setBusy(true);
    try {
      const r = target.type === 'post'
        ? await admin.deletePost(target.id, code, text.trim())
        : await admin.deleteComment(target.type, target.id, code, text.trim());
      if (target.reportId) { try { await admin.setReport(target.reportId, 'reviewed'); } catch { /* the content is already gone; the report can be closed by hand */ } }
      notify(`${what === 'post' ? 'Post' : 'Comment'} removed${r?.notified ? ' · author emailed' : ''}`);
      onDone?.();
    } catch (er) {
      const m = String(er?.message || '');
      notify(m.includes('forbidden') ? 'You are not allowed to do this.' : m.includes('not_found') ? `This ${what} is already gone.` : m.includes('reason_required') ? 'Write a reason (at least 5 characters).' : `Could not delete the ${what}.`, 'err');
      setBusy(false);
    }
  };
  return (<div className="modal" onClick={onClose}><form className="panel mform" role="dialog" aria-modal="true" aria-label={`Delete ${what}`} ref={dlg} onClick={(e) => e.stopPropagation()} onSubmit={send}>
    <h3>Delete this {what}?</h3>
    <p className="muted">The reason below is emailed to the author{target.author ? ` (@${target.author})` : ''}, and the report is marked as reviewed.</p>
    <select value={code} onChange={(e) => setCode(e.target.value)} aria-label="Reason">{admin.CONTENT_REASONS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
    <textarea rows="3" maxLength={300} required={custom} placeholder={custom ? 'Explain why (required, shown to the author)' : 'Optional extra note for the author'} value={text} onChange={(e) => setText(e.target.value)} />
    <div className="acts"><button className="primary danger" disabled={busy || !ok}>{busy ? 'Deleting…' : `Delete ${what}`}</button><button type="button" className="ghost" onClick={onClose}>Cancel</button></div>
  </form></div>);
}

/** Admin: delete an account, or ban it (delete + block the email for good). BOTH need a reason and BOTH email the person that reason
 *  before the account is removed. The moderator also types the username to confirm, so a misclick can never delete someone.
 *  target = { mode: 'delete' | 'ban', id, username, internal? } (internal pre-fills the admin-only note of a ban) */
export function AccountActionModal({ target, onClose, onDone, notify }) {
  const dlg = useRef(null); useDialog(dlg, onClose);
  const ban = target.mode === 'ban';
  const [code, setCode] = useState('guidelines'); const [text, setText] = useState(''); const [internal, setInternal] = useState(target.internal || '');
  const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false);
  const custom = code === 'custom'; const msg = admin.accountMessage(code, text);
  const typed = confirm.trim().replace(/^@/, '').toLowerCase() === String(target.username || '').toLowerCase();
  const ok = msg.length >= 5 && typed;
  const send = async (e) => {
    e.preventDefault(); if (!ok || busy) return; setBusy(true);
    try {
      if (ban) await admin.banUser(target.id, internal.trim() || null, msg); else await admin.deleteUser(target.id, msg);
      notify(ban ? 'Account deleted, email banned · the person is being emailed' : 'Account deleted · the person is being emailed');
      onDone?.();
    } catch (er) {
      const m = String(er?.message || '');
      notify(m.includes('forbidden') ? 'You are not allowed to do this.'
        : m.includes('reason_required') ? 'Write a reason (at least 5 characters). The person is emailed it.'
          : m.includes('reason_too_long') ? 'The reason is too long (500 characters at most).'
            : m.includes('cannot_') ? 'You cannot do this to your own account.'
              : m.includes('not_found') ? 'This account is already gone.'
                : /PGRST202|could not find the function|schema cache/i.test(m) ? 'The database is missing the latest update (migration 0057). Ask whoever runs the server to apply it.'
                  : (m || `Could not ${ban ? 'ban' : 'delete'} the account.`), 'err');
      setBusy(false);
    }
  };
  const label = ban ? 'Ban & delete' : 'Delete account';
  return (<div className="modal" onClick={onClose}><form className="panel mform" role="dialog" aria-modal="true" aria-label={label} ref={dlg} onClick={(e) => e.stopPropagation()} onSubmit={send}>
    <h3>{ban ? 'Ban' : 'Delete'} @{target.username}?</h3>
    <p className="muted">{ban
      ? 'The account, its files and everything it owns are deleted for good, and this email address can never register again.'
      : 'The account, its files and everything it owns are deleted for good. The email address is not blocked, so the person can register again.'} The reason below is emailed to the person before the account is removed.</p>
    <select value={code} onChange={(e) => setCode(e.target.value)} aria-label="Reason">{admin.ACCOUNT_REASONS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
    <textarea rows="3" maxLength={300} required={custom} placeholder={custom ? 'Explain why (required, emailed to the person)' : 'Optional extra note for the person'} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message to the person" />
    {msg && <p className="muted" role="status"><small>The person will read: “{msg}”</small></p>}
    {ban && <input maxLength={300} placeholder="Internal note (optional, only admins see it)" value={internal} onChange={(e) => setInternal(e.target.value)} aria-label="Internal note" />}
    <label className="field"><span>Type <b>{target.username}</b> to confirm</span><input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} /></label>
    <div className="acts"><button className="primary danger" disabled={busy || !ok}>{busy ? 'Working…' : label}</button><button type="button" className="ghost" onClick={onClose}>Cancel</button></div>
  </form></div>);
}
