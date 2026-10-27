import { useEffect, useMemo, useRef, useState } from 'react';
import { ShareNetwork, DownloadSimple, LinkSimple, X, Check } from '@phosphor-icons/react';
import { renderPromo, sharePromo, availablePromos } from './promoImage.js';
import { profileUrl } from './storyImage.js';
import './ShareSheet.css';

/**
 * Share sheet: pick a card style, see it, share or save it.
 *
 * <ShareSheet
 *   data={{ profile, theme, avatarSrc, bgSrc, music, interests, cards, photos, topFriends, guestbook, stickers, slug, fontFamily }}
 *   onClose={() => setShareOpen(false)} />
 *
 * `data` is exactly what you already pass to renderStory().
 * Colours come from the app theme variables (--g1, --ink, --accent ...), so it matches whatever theme the person uses.
 */
export default function ShareSheet({ data, onClose }) {
  const slug = data.slug || data.profile.username;
  const options = useMemo(
    () => availablePromos({ music: data.music, topFriends: data.topFriends || [], guestbook: data.guestbook || [] }),
    [data.music, data.topFriends, data.guestbook],
  );
  const [template, setTemplate] = useState(options[0]?.id || 'card');
  const [guestIndex, setGuestIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const canvasRef = useRef(null);

  // Re-render the preview whenever the style (or the featured guestbook message) changes. `stale` drops outdated results.
  useEffect(() => {
    let stale = false, url = null;
    setBusy(true); setError(''); setNote('');
    renderPromo({ ...data, template, guestIndex })
      .then((canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res([canvas, b]) : rej(new Error('toBlob failed'))), 'image/png')))
      .then(([canvas, blob]) => {
        if (stale) return;
        canvasRef.current = canvas; url = URL.createObjectURL(blob); setPreviewUrl(url); setBusy(false);
      })
      .catch((e) => { if (!stale) { setError(e?.message || 'Could not build this image.'); setBusy(false); } });
    return () => { stale = true; if (url) URL.revokeObjectURL(url); };
  }, [data, template, guestIndex]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const share = async () => {
    if (!canvasRef.current) return;
    const r = await sharePromo(canvasRef.current, slug, template);
    setNote(r === 'shared' ? 'Shared.' : r === 'downloaded' ? 'Saved to your device.' : '');
  };
  const download = () => {
    if (!previewUrl) return;
    const a = document.createElement('a'); a.href = previewUrl; a.download = `fiiyou-${template}-${slug}.png`;
    document.body.appendChild(a); a.click(); a.remove(); setNote('Saved to your device.');
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(profileUrl(slug)); setNote('Link copied.'); }
    catch { setNote(profileUrl(slug)); }
  };

  const wall = template === 'wall';
  const current = options.find((o) => o.id === template);
  const disabled = busy || !!error;
  return (
    <div className="ss-backdrop" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="ss-sheet" role="dialog" aria-modal="true" aria-label="Share your profile">
        <header className="ss-head">
          <div>
            <h2>Share your profile</h2>
            <p>Pick a card, then post it to your story.</p>
          </div>
          <button className="ss-x" onClick={onClose} aria-label="Close"><X size={18} weight="bold" aria-hidden="true" /></button>
        </header>

        <div className="ss-body">
          <div className="ss-preview">
            <div className="ss-stage">
              {previewUrl && <img src={previewUrl} alt="Preview of your share image" className={busy ? 'dim' : ''} />}
              {busy && <div className="ss-state"><span className="ss-spin" aria-hidden="true" />Building your image…</div>}
              {error && !busy && <div className="ss-state err">{error}</div>}
            </div>
          </div>

          <div className="ss-side">
            <div className="ss-tabs" role="tablist" aria-label="Card style">
              {options.map((o) => (
                <button key={o.id} role="tab" aria-selected={template === o.id} className={`ss-tab${template === o.id ? ' on' : ''}`} onClick={() => setTemplate(o.id)}>
                  <b>{o.label}</b><small>{o.hint}</small>
                </button>
              ))}
            </div>
            {current && <p className="ss-hint">{current.hint}</p>}

            {wall && data.guestbook?.length > 1 && (
              <label className="ss-pick">
                <span>Which message?</span>
                <select value={guestIndex} onChange={(e) => setGuestIndex(Number(e.target.value))}>
                  {data.guestbook.map((m, i) => (
                    <option key={i} value={i}>{(m.name || m.username || 'Someone')}: {String(m.body || '').slice(0, 48)}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="ss-actions">
              <button className="ss-btn primary" onClick={share} disabled={disabled}><ShareNetwork size={18} weight="bold" aria-hidden="true" />Share</button>
              <button className="ss-btn" onClick={download} disabled={disabled}><DownloadSimple size={18} weight="bold" aria-hidden="true" />Save image</button>
              <button className="ss-btn" onClick={copyLink}><LinkSimple size={18} weight="bold" aria-hidden="true" />Copy link</button>
            </div>
            <p className="ss-note" aria-live="polite">{note && <><Check size={14} weight="bold" aria-hidden="true" />{note}</>}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
