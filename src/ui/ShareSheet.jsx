import { useSheetDrag } from './shared.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ShareNetwork, DownloadSimple, LinkSimple, X, Check } from '@phosphor-icons/react';
import { renderPromo, availablePromos, promoShareText } from './promoImage.js';
import { profileUrl, renderStory } from './storyImage.js';
import { cleanPhoneLayout, cleanPhoneTheme } from '../lib/phoneLayout.js';
import { stickerModel } from './stickerAnchor.js';
import { supabase } from '../lib/client.js';
import { signedUrls } from '../api/media.js';
import './ShareSheet.css';
import { friendlyError } from './errors.jsx';

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

/** Keeps the same `data` object while its fields are unchanged, so an inline `data={{...}}` in the parent does not re-render the image on every parent render. */
function useStableData(data) {
  const ref = useRef(data);
  const prev = ref.current;
  const a = Object.keys(data), b = Object.keys(prev);
  if (a.length !== b.length || a.some((k) => prev[k] !== data[k])) ref.current = data;
  return ref.current;
}

const FOCUSABLE = 'button:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

export default function ShareSheet({ data: incoming, onClose }) {
  const data = useStableData(incoming);
  const slug = data.slug || data.profile.username;

  const options = useMemo(
    () => [
      ...availablePromos({ music: data.music, topFriends: data.topFriends || [], guestbook: data.guestbook || [] }),
      { id: 'phone', label: 'Phone', hint: 'Your profile as it looks on a phone.' },
    ],
    [data.music, data.topFriends, data.guestbook],
  );

  // Derived, so a selection that stops being available (e.g. the last guestbook message is deleted) falls back by itself.
  const [picked, setPicked] = useState(null);
  const template = options.some((o) => o.id === picked) ? picked : options[0]?.id || 'card';
  const [guestIndex, setGuestIndex] = useState(0);
  const guestCount = data.guestbook?.length || 0;
  const safeGuest = guestIndex < guestCount ? guestIndex : 0;

  // Guestbook authors' pictures: the buckets are private, so a path has to become a signed URL before a canvas can draw it.
  // Works whatever the parent passes: a ready `src`, an `avatar_path` (or author.avatar_path), or just a username (looked up here).
  const [avatars, setAvatars] = useState({});     // username -> signed url
  const [avatarsReady, setAvatarsReady] = useState(false);
  useEffect(() => {
    let stale = false;
    (async () => {
      try {
        const list = data.guestbook || [];
        const paths = {};                         // username -> storage path
        const unknown = [];
        for (const e of list) {
          if (!e || e.src || !e.username) continue;
          const p = e.avatar_path || e.author?.avatar_path;
          if (p) paths[e.username] = p; else unknown.push(e.username);
        }
        const ask = [...new Set(unknown)].filter((u) => !paths[u]);
        if (ask.length) {
          const { data: rows } = await supabase.from('profiles').select('username, avatar_path').in('username', ask);
          for (const r of rows || []) if (r.avatar_path) paths[r.username] = r.avatar_path;
        }
        const urls = Object.keys(paths).length ? await signedUrls(Object.values(paths)) : {};
        if (stale) return;
        setAvatars(Object.fromEntries(Object.entries(paths).map(([u, p]) => [u, urls[p]]).filter(([, v]) => v)));
      } catch { /* the card falls back to the initial */ }
      if (!stale) setAvatarsReady(true);
    })();
    return () => { stale = true; };
  }, [data.guestbook]);
  const guestbook = useMemo(
    () => (data.guestbook || []).map((e) => (e.src || !e.username || !avatars[e.username] ? e : { ...e, src: avatars[e.username] })),
    [data.guestbook, avatars],
  );

  // The saved phone data (phone_theme + per-card phone_layout). The sheet is only opened from the owner's own
  // profile, and openShare() sends the desktop card list, so the phone values are read here.
  const [phone, setPhone] = useState(null); // { cards, font_size, bgSrc, stickers } or null while loading
  const [phoneReady, setPhoneReady] = useState(false);
  useEffect(() => {
    let stale = false;
    const fallback = { cards: {}, font_size: null, bgSrc: null, stickers: data.stickers || [] };
    (async () => {
      try {
        const { data: prof } = await supabase.from('profiles').select('id, phone_theme').eq('username', String(slug).toLowerCase()).maybeSingle();
        if (!prof) throw new Error('no profile');
        const { data: rows } = await supabase.from('profile_cards')
          .select('id, type, visible, phone_layout, x, y, w, h, rotation, z, content')
          .eq('profile_id', prof.id).eq('visible', true);
        const theme = data.theme || {};
        const pt = cleanPhoneTheme(prof.phone_theme);
        const cards = {}, stickers = [], paths = [];
        for (const row of rows || []) {
          const layout = cleanPhoneLayout(row, row.phone_layout);
          cards[row.id] = layout;
          if (row.type !== 'sticker' || layout.visible === false) continue;
          const m = stickerModel(row, theme);                                   // same model the live page starts from
          if (layout.pin) { m.card = layout.pin.card; m.v = layout.pin.v; }
          if (typeof layout.y === 'number') m.y = layout.y;
          if (typeof layout.scale === 'number') { m.w *= layout.scale; m.h *= layout.scale; }
          const path = row.content?.images?.[0] || null;
          if (path) paths.push(path);
          stickers.push({ path, card: m.card, v: m.v, x: m.x, y: m.y, w: m.w, h: m.h, rotation: row.rotation || 0, z: row.z || 0 });
        }
        if (pt.bg_image) paths.push(pt.bg_image);
        const urls = paths.length ? await signedUrls(paths) : {};
        if (stale) return;
        setPhone({
          cards, font_size: pt.font_size || null,
          bgSrc: pt.bg_image ? urls[pt.bg_image] || null : null,
          stickers: stickers.map((s) => ({ ...s, src: s.path ? urls[s.path] || null : null })).filter((s) => s.src),
        });
      } catch {
        if (!stale) setPhone(fallback);   // unreadable phone data: render the desktop content, never an empty image
      }
      if (!stale) setPhoneReady(true);
    })();
    return () => { stale = true; };
  }, [slug, data.theme, data.stickers]);

  // Only the Phone tab reacts to the phone data, so the desktop previews are not rebuilt when it arrives.
  const phoneKey = template === 'phone' ? (phoneReady ? `ready:${JSON.stringify(phone)}` : 'loading') : 'off';

  const [preview, setPreview] = useState(null); // { url, ratio }
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const built = useRef(null); // { file, url }: the current image, ready to share synchronously
  const sheetRef = useRef(null); useSheetDrag(sheetRef, () => onClose?.());
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Re-render the preview whenever the style (or the featured guestbook message) changes. `stale` drops outdated results.
  useEffect(() => {
    if (!avatarsReady) return undefined;          // wait for the pictures so the card is drawn once, with them
    if (template === 'phone' && !phoneReady) return undefined;   // the phone image needs the saved phone layout first
    let stale = false;
    setBusy(true); setError(''); setNote('');
    (async () => {
      try {
        const canvas = template === 'phone'
          ? await renderStory({
              profile: data.profile, theme: data.theme, avatarSrc: data.avatarSrc, bgSrc: data.bgSrc,
              music: data.music, interests: data.interests || [], cards: data.cards || [], photos: data.photos || [],
              topFriends: data.topFriends || [], guestbook, slug, fontFamily: data.fontFamily,
              stickers: phone?.stickers || [],
              phone: { cards: phone?.cards || {}, font_size: phone?.font_size || null, bgSrc: phone?.bgSrc || null },
            })
          : await renderPromo({ ...data, guestbook, template, guestIndex: safeGuest, slug });
        const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the image.'))), 'image/png'));
        if (stale) return;
        const file = new File([blob], `fiiyou-${template}-${slug}.png`, { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        // The old image stays on screen (dimmed) until this one is ready, so only now is it safe to release it.
        if (built.current) URL.revokeObjectURL(built.current.url);
        built.current = { file, url };
        setPreview({ url, ratio: canvas.width / canvas.height });
        setBusy(false);
      } catch (e) {
        if (!stale) { setError(friendlyError(e, 'Could not build this image.')); setBusy(false); }
      }
    })();
    return () => { stale = true; };
  }, [data, guestbook, avatarsReady, template, safeGuest, slug, phoneKey]);

  useEffect(() => () => { if (built.current) URL.revokeObjectURL(built.current.url); }, []);

  // Dialog behaviour: Escape closes, Tab stays inside, focus moves in and is handed back, the page behind does not scroll.
  useEffect(() => {
    const opener = document.activeElement;
    const sheet = sheetRef.current;
    sheet?.querySelector('.ss-x')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { closeRef.current?.(); return; }
      if (e.key !== 'Tab' || !sheet) return;
      const items = [...sheet.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const saveToDevice = () => {
    const cur = built.current; if (!cur) return;
    const a = document.createElement('a'); a.href = cur.url; a.download = cur.file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setNote('Saved to your device.');
  };

  // No `await` before navigator.share: Safari/iOS only allows it directly inside the tap, which is why the file is prepared ahead of time.
  const share = async () => {
    const cur = built.current; if (!cur) return;
    if (navigator.canShare?.({ files: [cur.file] })) {
      try {
        await navigator.share({ files: [cur.file], text: template === 'phone' ? `My fiiyou profile → ${profileUrl(slug)}` : promoShareText(template, slug) });
        setNote('Shared.');
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    saveToDevice();
  };

  const copyLink = async () => {
    const url = profileUrl(slug);
    try { await navigator.clipboard.writeText(url); setNote('Link copied.'); return; } catch { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = url; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      setNote(ok ? 'Link copied.' : url);
    } catch { setNote(url); }
  };

  const onTabKey = (e) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!(e.key in keys) && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = options.findIndex((o) => o.id === template);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (i + keys[e.key] + options.length) % options.length;
    setPicked(options[next].id);
    requestAnimationFrame(() => e.currentTarget.querySelectorAll('[role="tab"]')[next]?.focus());
  };

  const wall = template === 'wall';
  const current = options.find((o) => o.id === template);
  const disabled = busy || !!error || !preview;
  const showImg = preview && !error;
  return (
    <div className="ss-backdrop" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="ss-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label="Share your profile">
        <header className="ss-head">
          <div>
            <h2>Share your profile</h2>
            <p>Pick a card, then post it to your story.</p>
          </div>
          <button className="ss-x" onClick={onClose} aria-label="Close"><X size={18} weight="bold" aria-hidden="true" /></button>
        </header>

        <div className="ss-body">
          <div className="ss-preview">
            <div className="ss-stage" style={{ '--ss-ar': preview ? preview.ratio : 9 / 16 }} aria-busy={busy}>
              {showImg && <img src={preview.url} alt="Preview of your share image" className={busy ? 'dim' : ''} />}
              {busy && <div className="ss-state" role="status"><span className="ss-spin" aria-hidden="true" />Building your image…</div>}
              {error && !busy && <div className="ss-state err" role="alert">{error}</div>}
            </div>
          </div>

          <div className="ss-side">
            <div className="ss-tabs" role="tablist" aria-label="Card style" aria-orientation="vertical" onKeyDown={onTabKey}>
              {options.map((o) => (
                <button key={o.id} role="tab" aria-selected={template === o.id} tabIndex={template === o.id ? 0 : -1} className={`ss-tab${template === o.id ? ' on' : ''}`} onClick={() => setPicked(o.id)}>
                  <b>{o.label}</b><small>{o.hint}</small>
                </button>
              ))}
            </div>
            {current && <p className="ss-hint">{current.hint}</p>}

            {wall && guestCount > 1 && (
              <label className="ss-pick">
                <span>Which message?</span>
                <select aria-label="Which message?" value={safeGuest} onChange={(e) => setGuestIndex(Number(e.target.value))}>
                  {data.guestbook.map((m, i) => (
                    <option key={i} value={i}>{(m.name || m.username || 'Someone')}: {String(m.body || '').slice(0, 48)}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="ss-actions">
              <button className="ss-btn primary" onClick={share} disabled={disabled}><ShareNetwork size={18} weight="bold" aria-hidden="true" />Share</button>
              <button className="ss-btn" onClick={saveToDevice} disabled={disabled}><DownloadSimple size={18} weight="bold" aria-hidden="true" />Save image</button>
              <button className="ss-btn" onClick={copyLink}><LinkSimple size={18} weight="bold" aria-hidden="true" />Copy link</button>
            </div>
            <p className="ss-note" aria-live="polite">{note && <><Check size={14} weight="bold" aria-hidden="true" />{note}</>}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
