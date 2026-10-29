import { useEffect, useRef, useState } from 'react';
import { DotsThree, PencilSimple, Trash, Check, X } from '@phosphor-icons/react';
import { social } from '../index.js';
import { ask } from './dialog.jsx';
import './MessageMenu.css';

/** "..." button + small menu (Edit / Delete) for MY chat messages.
 *  Props: m (message row), canEdit (false hides Edit, e.g. shared-post messages), onEdit() (parent switches the bubble to <MessageEditor/>), onDeleted(m) (parent updates its list), notify(text, 'err'?).
 *  Renders nothing for messages that are not mine or were already deleted. Pass `me` = my profile id. */
export function MessageMenu({ m, me, onEdit, onDeleted, notify, align = 'right', canEdit = true }) {
  const [open, setOpen] = useState(false); const [pos, setPos] = useState(null); const btn = useRef(null);
  // the dropdown is position:fixed (so the scrolling message list can't clip it); it opens below the button, or above when there is no room
  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btn.current?.getBoundingClientRect();
    if (r) { const need = 120, below = window.innerHeight - r.bottom; setPos({ right: Math.max(8, window.innerWidth - r.right), ...(below >= need ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) }); }
    setOpen(true);
  };
  useEffect(() => { if (!open) return; const close = () => setOpen(false); window.addEventListener('scroll', close, true); window.addEventListener('resize', close); return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); }; }, [open]);
  if (!m || m.sender_id !== me || m.body === social.DELETED_BODY) return null;

  const del = async () => {
    setOpen(false);
    if (!(await ask({ title: 'Delete this message?', message: 'It will show as deleted for both of you.', confirmLabel: 'Delete', danger: true }))) return;
    try { await social.deleteMessage(m.id); onDeleted?.({ ...m, body: social.DELETED_BODY, edited_at: null }); }
    catch (e) { notify?.(e?.message || 'Could not delete the message', 'err'); }
  };

  return (<span className="msgmenuwrap">
    <button ref={btn} type="button" className="ghost msgmore" onClick={toggle} aria-label="Message options" aria-expanded={open}>
      <DotsThree size={20} weight="bold" aria-hidden="true" /></button>
    {open && <>
      <div className="pmenuback" onClick={() => setOpen(false)} />
      <div className="msgmenu" role="menu" style={pos || undefined}>
        {canEdit && <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit?.(); }}><PencilSimple size={16} weight="bold" aria-hidden="true" />Edit</button>}
        <button type="button" role="menuitem" className="danger" onClick={del}><Trash size={16} weight="bold" aria-hidden="true" />Delete</button>
      </div></>}
  </span>);
}

/** Inline editor that replaces the bubble text while editing.
 *  Props: m (message row), onSaved(updatedRow), onCancel(), notify(). Enter saves, Shift+Enter = new line, Esc cancels. */
export function MessageEditor({ m, onSaved, onCancel, notify }) {
  const [txt, setTxt] = useState(m.body); const [busy, setBusy] = useState(false); const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, []);

  const save = async () => {
    const body = txt.trim();
    if (!body || busy) return;
    if (body === m.body) { onCancel(); return; }
    setBusy(true);
    try { const r = await social.editMessage(m.id, body); onSaved({ ...m, body: r.body, edited_at: r.edited_at }); }
    catch (e) { notify?.(e?.message || 'Could not edit the message', 'err'); setBusy(false); }
  };
  const key = (e) => { if (e.key === 'Escape') onCancel(); else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } };

  return (<div className="msgedit">
    <textarea ref={ref} rows="2" maxLength={1000} value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={key} aria-label="Edit message" />
    <div className="acts">
      <button type="button" className="primary sm" disabled={busy || !txt.trim()} onClick={save}><Check size={14} weight="bold" aria-hidden="true" />Save</button>
      <button type="button" className="ghost sm" onClick={onCancel}><X size={14} weight="bold" aria-hidden="true" />Cancel</button></div>
  </div>);
}
