import { useEffect, useMemo, useRef } from 'react';
import { Copy, DownloadSimple, ShareNetwork, X } from '@phosphor-icons/react';
import { inviteUrl } from '../lib/invite.js';
import { qrData, qrPng } from './qr.js';
import './onboarding.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** "Invite friends": a personal link + QR code. Anyone who signs up through it is nudged to add you first. */
export default function InviteModal({ me, onClose, notify }) {
  const url = useMemo(() => inviteUrl(location.origin, BASE, me.username), [me.username]);
  const qr = useMemo(() => qrData(url), [url]); const box = useRef();
  useEffect(() => { box.current?.focus(); const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const copy = async () => { try { await navigator.clipboard.writeText(url); notify('Link copied'); } catch { notify('Could not copy. Select the link and copy it by hand.', 'err'); } };
  const share = async () => { try { await navigator.share({ title: 'fiiyou', text: 'Join me on fiiyou, a customizable local social network.', url }); } catch { /* cancelled */ } };
  const download = async () => {
    try { const b = await qrPng(url); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `fiiyou-${me.username}-qr.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    catch (e) { notify(e.message, 'err'); }
  };
  return (<div className="modal" onClick={onClose}>
    <div className="panel mform invite" role="dialog" aria-modal="true" aria-labelledby="inv-t" ref={box} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="ghost sm invx" onClick={onClose} aria-label="Close"><X size={16} weight="bold" aria-hidden="true" /></button>
      <h3 id="inv-t">Invite friends</h3>
      <p className="muted">Send this link or let someone scan the code. When they sign up through it, fiiyou suggests adding you first.</p>
      <svg className="qr" viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`} role="img" aria-label={`QR code for ${url}`} shapeRendering="crispEdges">
        <rect x="-4" y="-4" width={qr.size + 8} height={qr.size + 8} fill="#fff" /><path d={qr.path} fill="#000" /></svg>
      <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Your invite link" />
      <div className="acts">
        <button type="button" className="primary" onClick={copy}><Copy size={16} weight="bold" aria-hidden="true" /> Copy link</button>
        {typeof navigator.share === 'function' && <button type="button" className="ghost" onClick={share}><ShareNetwork size={16} weight="bold" aria-hidden="true" /> Share</button>}
        <button type="button" className="ghost" onClick={download}><DownloadSimple size={16} weight="bold" aria-hidden="true" /> Save QR</button>
      </div>
    </div></div>);
}
