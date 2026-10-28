import { useEffect, useMemo, useRef, useState } from 'react';
import { X, DownloadSimple, ShareNetwork, PaperPlaneRight, Check, ImageSquare, ChatCircle } from '@phosphor-icons/react';
import { friends, social } from '../index.js';
import { Avatar, useImages } from './shared.jsx';
import './PostShare.css';

// ---------------------------------------------------------------------------------------------
// The only two calls this file makes to your backend (adjust the names here if yours differ):
//   friends.listFriends()           -> [{ id, username, display_name, avatar_path }]
//   social.sendMessage(peerId, text)-> sends a chat message to that friend
// ---------------------------------------------------------------------------------------------
const loadFriends = () => friends.listFriends();
const sendChat = (peerId, text) => social.sendMessage(peerId, text);

const W = 1080, H = 1920;   // Instagram / TikTok story size (9:16)

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Fetches an image as a bitmap. Going through fetch+blob avoids a "tainted canvas" with signed storage URLs. */
async function bitmap(url) {
  if (!url) return null;
  try { const r = await fetch(url); if (!r.ok) return null; return await createImageBitmap(await r.blob()); } catch { return null; }
}

function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Word-wraps text to a width; honours line breaks; truncates with an ellipsis after maxLines. */
function wrap(ctx, text, width, maxLines) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (ctx.measureText(w).width > width) {            // a single very long word: hard-break it
        let i = w.length; while (i > 1 && ctx.measureText(w.slice(0, i)).width > width) i--;
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, i)); w = w.slice(i);
      }
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width <= width) line = t; else { out.push(line); line = w; }
    }
    out.push(line);
  }
  if (out.length > maxLines) {
    const cut = out.slice(0, maxLines); let last = cut[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    cut[maxLines - 1] = `${last.trimEnd()}…`; return cut;
  }
  return out;
}

/** Draws the post as a 1080x1920 story and resolves to a PNG blob. Colours come from the person's app theme. */
export async function renderPostImage(p, { avatarUrl, imageUrl }) {
  const [av, pic] = await Promise.all([bitmap(avatarUrl), bitmap(imageUrl)]);
  try { await document.fonts?.ready; } catch {}
  const bg = css('--t-bg') || '#000', card = css('--t-card') || '#111', border = css('--t-border') || '#2f2f2f';
  const ink = css('--t-text') || '#f2f2f2', accent = css('--accent') || '#fff', onAccent = css('--on-accent') || '#000';
  const muted = `color-mix(in srgb, ${ink} 60%, ${bg})`;
  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';

  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const CX = 72, CW = W - 144, PAD = 48, IW = CW - PAD * 2, LH = 64;
  const isEvent = p.kind === 'event';
  const meta = isEvent && p.event_at ? new Date(p.event_at).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }) + (p.event_place ? ` · ${p.event_place}` : '') : '';

  ctx.font = `800 54px ${font}`; const titleLines = p.title ? wrap(ctx, p.title, IW, 2) : [];
  const imgH = pic ? Math.min(760, Math.round(IW * pic.height / pic.width)) : 0;
  const head = 100, gap = 36, foot = 56, maxCard = 1500;
  const fixed = PAD * 2 + head + gap + (meta ? 56 : 0) + titleLines.length * 70 + (pic ? gap + imgH : 0) + gap + foot;
  ctx.font = `500 46px ${font}`;
  const maxBody = Math.max(2, Math.floor((maxCard - fixed) / LH));
  const body = wrap(ctx, p.body, IW, Math.min(maxBody, pic ? 7 : 16));
  const cardH = fixed + body.length * LH;
  const CY = Math.round((H - cardH) / 2);

  // card
  ctx.fillStyle = card; rrect(ctx, CX, CY, CW, cardH, 48); ctx.fill();
  ctx.strokeStyle = border; ctx.lineWidth = 3; rrect(ctx, CX, CY, CW, cardH, 48); ctx.stroke();

  let y = CY + PAD;
  // header: avatar + names
  ctx.save(); ctx.beginPath(); ctx.arc(CX + PAD + 40, y + 40, 40, 0, Math.PI * 2); ctx.clip();
  if (av) { const s = Math.max(80 / av.width, 80 / av.height); ctx.drawImage(av, CX + PAD + 40 - (av.width * s) / 2, y + 40 - (av.height * s) / 2, av.width * s, av.height * s); }
  else { ctx.fillStyle = border; ctx.fillRect(CX + PAD, y, 80, 80); }
  ctx.restore();
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = ink; ctx.font = `800 42px ${font}`; ctx.fillText(p.author_display_name || p.author_username, CX + PAD + 104, y + 38, IW - 110);
  ctx.fillStyle = muted; ctx.font = `500 32px ${font}`; ctx.fillText(`@${p.author_username}`, CX + PAD + 104, y + 78, IW - 110);
  y += head + gap;

  if (meta) {   // event chip
    ctx.font = `700 32px ${font}`; const tw = Math.min(ctx.measureText(meta).width, IW - 40);
    ctx.fillStyle = accent; rrect(ctx, CX + PAD, y - 6, tw + 40, 52, 26); ctx.fill();
    ctx.fillStyle = onAccent; ctx.fillText(meta, CX + PAD + 20, y + 30, IW - 40); y += 56;
  }
  ctx.fillStyle = ink;
  if (titleLines.length) { ctx.font = `800 54px ${font}`; for (const l of titleLines) { ctx.fillText(l, CX + PAD, y + 50); y += 70; } }
  ctx.font = `500 46px ${font}`;
  for (const l of body) { ctx.fillText(l, CX + PAD, y + 46); y += LH; }

  if (pic) {
    y += gap - 8; const w = Math.min(IW, Math.round(imgH * pic.width / pic.height));
    const x = CX + PAD + (IW - w) / 2;
    ctx.save(); rrect(ctx, x, y, w, imgH, 28); ctx.clip(); ctx.drawImage(pic, x, y, w, imgH); ctx.restore(); y += imgH + 8;
  }
  y += gap;
  ctx.fillStyle = muted; ctx.font = `600 34px ${font}`;
  ctx.fillText(`♥ ${p.like_count || 0}    ·    ${p.comment_count || 0} comments`, CX + PAD, y + 40);

  // brand + link, outside the card
  ctx.textAlign = 'center'; ctx.fillStyle = ink; ctx.font = `800 64px ${font}`; ctx.fillText('fiiyou', W / 2, CY - 70, W - 160);
  ctx.fillStyle = muted; ctx.font = `600 34px ${font}`; ctx.fillText(`${location.host}/${p.author_username}`, W / 2, CY + cardH + 90, W - 160);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the image'))), 'image/png'));
}

/** The message a friend receives in chat. It links to the author's profile (the short link already routes there). */
export function postChatText(p, note = '') {
  const snippet = (p.title ? `${p.title}\n` : '') + String(p.body || '');
  const short = snippet.length > 280 ? `${snippet.slice(0, 277)}…` : snippet;
  return `${note ? `${note.trim()}\n\n` : ''}Shared a post by @${p.author_username}:\n“${short}”\n${location.origin}/${p.author_username}`;
}

export default function PostShareModal({ p, img, onClose, notify }) {
  const [tab, setTab] = useState('image');
  const [blob, setBlob] = useState(null); const [url, setUrl] = useState(null); const [err, setErr] = useState('');
  const [list, setList] = useState(null); const [q, setQ] = useState(''); const [note, setNote] = useState(''); const [sent, setSent] = useState({}); const [busy, setBusy] = useState(null);
  const urlRef = useRef(null);
  const fileName = `fiiyou-${p.author_username}-${String(p.id).slice(0, 6)}.png`;

  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);

  useEffect(() => {   // build the story image once
    let on = true;
    renderPostImage(p, { avatarUrl: img[p.author_avatar_path], imageUrl: img[p.image_path] })
      .then((b) => { if (!on) return; urlRef.current = URL.createObjectURL(b); setBlob(b); setUrl(urlRef.current); })
      .catch((e) => on && setErr(e.message || 'Could not create the image'));
    return () => { on = false; if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
  }, [p.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (tab === 'chat' && !list) loadFriends().then(setList).catch(() => { setList([]); notify('Could not load your friends', 'err'); }); }, [tab]);   // eslint-disable-line react-hooks/exhaustive-deps
  const av = useImages((list || []).map((f) => f.avatar_path));
  const shown = useMemo(() => (list || []).filter((f) => `${f.display_name} ${f.username}`.toLowerCase().includes(q.trim().toLowerCase())), [list, q]);

  const download = () => { if (!url) return; const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); };
  const file = () => new File([blob], fileName, { type: 'image/png' });
  const canShareFile = !!(blob && navigator.canShare && navigator.canShare({ files: [file()] }));
  const share = async () => {   // on a phone this opens the system sheet, which lists Instagram (Story), WhatsApp, Messenger, ...
    try { await navigator.share({ files: [file()], text: `@${p.author_username} on fiiyou` }); }
    catch (e) { if (e?.name !== 'AbortError') { notify('Sharing failed, the image was downloaded instead', 'err'); download(); } }
  };
  const send = async (f) => {
    setBusy(f.id);
    try { await sendChat(f.id, postChatText(p, note)); setSent((s) => ({ ...s, [f.id]: true })); notify(`Sent to ${f.display_name || f.username}`); }
    catch (e) { notify(e?.message?.includes('rate_limit') ? 'Slow down a bit.' : e?.message || 'Could not send', 'err'); }
    setBusy(null);
  };

  return (<div className="modal" onClick={onClose}><div className="panel mform pshare" role="dialog" aria-modal="true" aria-label="Share post" onClick={(e) => e.stopPropagation()}>
    <header className="pshead"><h3>Share post</h3><button className="ghost" onClick={onClose} aria-label="Close"><X size={16} weight="bold" aria-hidden="true" /></button></header>
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'image'} className={tab === 'image' ? 'on' : ''} onClick={() => setTab('image')}><ImageSquare size={16} weight="bold" aria-hidden="true" />Story image</button>
      <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}><ChatCircle size={16} weight="bold" aria-hidden="true" />Send in chat</button></div>

    {tab === 'image' && <>
      <div className="psprev">{err ? <p className="err" role="alert">{err}</p> : url ? <img src={url} alt="Preview of the story image" /> : <div className="boot">Making the image…</div>}</div>
      <div className="acts pswrap">
        {canShareFile && <button className="primary" onClick={share}><ShareNetwork size={16} weight="bold" aria-hidden="true" />Share…</button>}
        <button className={canShareFile ? 'ghost' : 'primary'} disabled={!url} onClick={download}><DownloadSimple size={16} weight="bold" aria-hidden="true" />Download</button></div>
      <small className="muted">{canShareFile ? 'Share opens your phone’s share sheet: pick Instagram, then Story.' : 'Download the image, then add it to your Instagram story (or any app) from your gallery.'}</small>
    </>}

    {tab === 'chat' && <>
      <input value={note} maxLength={200} placeholder="Add a message (optional)" onChange={(e) => setNote(e.target.value)} aria-label="Message" />
      <input value={q} placeholder="Search friends…" onChange={(e) => setQ(e.target.value)} aria-label="Search friends" />
      <div className="pslist">
        {!list ? <p className="empty">Loading…</p> : !shown.length ? <p className="empty">{list.length ? 'No match.' : 'Add some friends to send posts to.'}</p>
          : shown.map((f) => (<div className="row" key={f.id}><Avatar src={av[f.avatar_path]} size={40} />
            <span className="link"><b>{f.display_name || f.username}</b><small>@{f.username}</small></span>
            <button className={sent[f.id] ? 'ghost sm' : 'primary sm'} disabled={busy === f.id || sent[f.id]} onClick={() => send(f)}>
              {sent[f.id] ? <><Check size={14} weight="bold" aria-hidden="true" />Sent</> : <><PaperPlaneRight size={14} weight="bold" aria-hidden="true" />Send</>}</button></div>))}
      </div>
    </>}
  </div></div>);
}
