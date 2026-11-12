import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DotsThree, PencilSimple, Trash, Check, X, ArrowBendUpLeft, PushPin, Copy, Heart } from '@phosphor-icons/react';
import { social } from '../index.js';
import { ask } from './dialog.jsx';
import { useBackToClose, useSheetDrag } from './shared.jsx';
import './MessageMenu.css';
import { friendlyError } from './errors.jsx';

/** "..." button + small menu (Edit / Delete) for MY chat messages.
 *  Props: m (message row), canEdit (false hides Edit, e.g. shared-post messages), onEdit() (parent switches the bubble to <MessageEditor/>), onDeleted(m) (parent updates its list), notify(text, 'err'?).
 *  Renders nothing for messages that are not mine or were already deleted. Pass `me` = my profile id. */
export function MessageMenu({ m, me, onEdit, onDeleted, notify, align = 'right', canEdit = true }) {
  const [open, setOpen] = useState(false); const [pos, setPos] = useState(null); const btn = useRef(null); const menu = useRef(null);
  // the dropdown is position:fixed (so the scrolling message list can't clip it). It is measured once it exists and kept fully inside the screen:
  // under the button when there is room, above it when there is not, and never past the left or right edge (it used to be cut off on phones)
  const toggle = () => { if (open) { setOpen(false); setPos(null); } else setOpen(true); };
  useLayoutEffect(() => {
    if (!open) return;
    const b = btn.current?.getBoundingClientRect(); const el = menu.current; if (!b || !el) return;
    const w = el.offsetWidth; const h = el.offsetHeight; const left = Math.min(Math.max(8, b.right - w), window.innerWidth - w - 8);
    const top = b.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, b.top - h - 4) : b.bottom + 4;
    setPos({ left, top, right: 'auto', bottom: 'auto' });
  }, [open]);
  useEffect(() => { if (!open) return; const close = () => setOpen(false); window.addEventListener('scroll', close, true); window.addEventListener('resize', close); return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); }; }, [open]);
  if (!m || m.sender_id !== me || m.body === social.DELETED_BODY) return null;

  const del = async () => {
    setOpen(false); setPos(null);
    if (!(await ask({ title: 'Delete this message?', message: 'It will show as deleted for both of you.', confirmLabel: 'Delete', danger: true }))) return;
    try { await social.deleteMessage(m.id); onDeleted?.({ ...m, body: social.DELETED_BODY, edited_at: null }); }
    catch (e) { notify?.(friendlyError(e, 'Could not delete the message.'), 'err'); }
  };

  return (<span className="msgmenuwrap">
    <button ref={btn} type="button" className="ghost msgmore" onClick={toggle} aria-label="Message options" aria-expanded={open}>
      <DotsThree size={20} weight="bold" aria-hidden="true" /></button>
    {open && <>
      <div className="pmenuback" onClick={() => { setOpen(false); setPos(null); }} />
      <div className="msgmenu" role="menu" ref={menu} style={pos || { visibility: 'hidden' }}>
        {canEdit && <button type="button" role="menuitem" onClick={() => { setOpen(false); setPos(null); onEdit?.(); }}><PencilSimple size={16} weight="bold" aria-hidden="true" />Edit</button>}
        <button type="button" role="menuitem" className="danger" onClick={del}><Trash size={16} weight="bold" aria-hidden="true" />Delete</button>
      </div></>}
  </span>);
}

/** Phones: tap a message (or press and hold) and this sheet slides up with everything you can do with it. Replaces the row of tiny buttons next to every bubble.
 *  Props: m (message row), mine (bool), preview (short text shown at the top), pinned, canEdit, canCopy, onReply(), onPin(), onEdit(), onDeleted(m), onClose(), notify(). */
export function MessageSheet({ m, mine, preview, pinned, liked = false, canEdit = true, canCopy = true, onLike, onReply, onPin, onEdit, onDeleted, onClose, notify }) {
  const root = useRef(null); useBackToClose(onClose); useSheetDrag(root, onClose);
  useEffect(() => {
    root.current?.focus({ preventScroll: true });   // focus the sheet itself, not the first button (a ring on "Reply" looks like a selection)
    const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const run = (fn) => () => { onClose(); fn?.(); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(m.body); notify?.('Copied'); return; } catch { /* no clipboard permission: try the old way */ }
    try { const t = document.createElement('textarea'); t.value = m.body; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0;left:0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); notify?.(ok ? 'Copied' : 'Could not copy', ok ? undefined : 'err'); }
    catch { notify?.('Could not copy', 'err'); }
  };
  const del = async () => {
    onClose();
    if (!(await ask({ title: 'Delete this message?', message: 'It will show as deleted for both of you.', confirmLabel: 'Delete', danger: true }))) return;
    try { await social.deleteMessage(m.id); onDeleted?.({ ...m, body: social.DELETED_BODY, edited_at: null }); } catch (e) { notify?.(e?.message || 'Could not delete the message', 'err'); }
  };
  return (<div className="msheetback" onClick={onClose}>
    <div className="msheet" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Message options" onClick={(e) => e.stopPropagation()}>
      <span className="msgrab" aria-hidden="true" />
      {preview && <p className="msheetprev">{preview}</p>}
      {onLike && <button type="button" onClick={run(onLike)}><Heart size={20} weight={liked ? 'fill' : 'bold'} aria-hidden="true" />{liked ? 'Remove your like' : 'Like'}</button>}
      <button type="button" onClick={run(onReply)}><ArrowBendUpLeft size={20} weight="bold" aria-hidden="true" />Reply</button>
      {canCopy && <button type="button" onClick={run(copy)}><Copy size={20} weight="bold" aria-hidden="true" />Copy text</button>}
      <button type="button" onClick={run(onPin)}><PushPin size={20} weight={pinned ? 'fill' : 'bold'} aria-hidden="true" />{pinned ? 'Unpin' : 'Pin to the top of the chat'}</button>
      {mine && canEdit && <button type="button" onClick={run(onEdit)}><PencilSimple size={20} weight="bold" aria-hidden="true" />Edit</button>}
      {mine && <button type="button" className="danger" onClick={del}><Trash size={20} weight="bold" aria-hidden="true" />Delete</button>}
      <button type="button" className="msheetcancel" onClick={onClose}>Cancel</button>
    </div></div>);
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
    catch (e) { notify?.(friendlyError(e, 'Could not edit the message.'), 'err'); setBusy(false); }
  };
  const key = (e) => { if (e.key === 'Escape') onCancel(); else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } };

  return (<div className="msgedit">
    <textarea ref={ref} rows="2" maxLength={1000} value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={key} aria-label="Edit message" />
    <div className="acts">
      <button type="button" className="primary sm" disabled={busy || !txt.trim()} onClick={save}><Check size={14} weight="bold" aria-hidden="true" />Save</button>
      <button type="button" className="ghost sm" onClick={onCancel}><X size={14} weight="bold" aria-hidden="true" />Cancel</button></div>
  </div>);
}
