import { useEffect, useState } from 'react';
import { profiles, cards as cardsApi, media, discover } from '../index.js';
import { THEME_DEFAULTS, OPTIONS, COLOR_KEYS, GROUPS, radii } from './theme.js';

const DEFAULT_CONTENT = { about: { body: '' }, text: { body: '' }, gallery: { images: [] }, links: { links: [] }, interests: { interests: [] }, guestbook: {}, top_friends: {} };
const TABS = { Look: ['Shape', 'Surface', 'Type'], Layout: ['Layout', 'Background'] };
const label = (k) => k.replace(/_/g, ' ');
const cl = (v, a, b) => Math.min(b, Math.max(a, v));

export default function Customizer({ draft, setDraft, onClose, reload, sel, setSel, notify }) {
  const [tab, setTab] = useState('Look'); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [locs, setLocs] = useState([]);
  useEffect(() => { discover.listLocalities().then(setLocs); }, []);
  useEffect(() => { if (sel) setTab('Stickers'); }, [sel]);
  const th = { ...THEME_DEFAULTS, ...draft.theme }; const [r1, r2, r3] = radii(draft.theme);
  const setTheme = (k, v) => setDraft((d) => ({ ...d, theme: { ...d.theme, [k]: v } }));
  const setField = (k, v) => setDraft((d) => ({ ...d, fields: { ...d.fields, [k]: v } }));
  const setMusic = (p) => setField('music', Object.fromEntries(Object.entries({ ...draft.fields.music, ...p }).filter(([, v]) => v)));
  const setCard = (id, p) => setDraft((d) => ({ ...d, cards: d.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  const drop = (id) => setDraft((d) => ({ ...d, cards: d.cards.filter((x) => x.id !== id) }));
  const move = (i, dir) => setDraft((d) => { const c = [...d.cards]; const f = c.map((x, k) => (x.type !== 'sticker' && x.type !== 'music' ? k : -1)).filter((k) => k >= 0);
    const a = f.indexOf(i), b = a + dir; if (b < 0 || b >= f.length) return d; [c[f[a]], c[f[b]]] = [c[f[b]], c[f[a]]]; return { ...d, cards: c }; });
  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr(e.message || 'Something went wrong'); } setBusy(false); };
  const stickers = draft.cards.filter((c) => c.type === 'sticker'); const s = stickers.find((c) => c.id === sel);
  const topZ = Math.max(0, ...stickers.map((c) => c.z));

  const save = () => run(async () => {
    await profiles.updateMyProfile({ ...draft.fields, theme: draft.theme });
    const flow = draft.cards.filter((c) => c.type !== 'sticker');
    const res = await Promise.allSettled(draft.cards.map((c) => c.type === 'sticker'
      ? cardsApi.updateCard(c.id, { x: c.x, y: c.y, w: c.w, h: c.h, z: c.z, rotation: c.rotation, visible: c.visible })
      : cardsApi.updateCard(c.id, { y: flow.indexOf(c) * 10, title: c.title, content: c.content, visible: c.visible })));
    const bad = res.filter((r) => r.status === 'rejected');
    if (bad.length) throw new Error(`${bad.length} card(s) failed to save: ${bad[0].reason?.message || 'unknown error'}`);
    await reload(); notify('Saved'); onClose();
  });
  const addCard = (type) => run(async () => { const c = await cardsApi.createCard({ type, title: type.replace('_', ' '), content: DEFAULT_CONTENT[type], y: draft.cards.length * 10 }); setDraft((d) => ({ ...d, cards: [...d.cards, c] })); });
  const addSticker = (file) => run(async () => {
    const bmp = await createImageBitmap(file); const h = cl(Math.round(140 * bmp.height / bmp.width), 40, 2000); const path = await media.uploadImage(file);
    const c = await cardsApi.createCard({ type: 'sticker', content: { images: [path] }, x: 40, y: 40, w: 140, h, z: topZ + 1 }); setDraft((d) => ({ ...d, cards: [...d.cards, c] })); setSel(c.id); });
  const upload = (fn) => (e) => e.target.files[0] && run(async () => { await fn(e.target.files[0]); await reload(); notify('Image updated'); });
  const pick = (k) => <label key={k}>{label(k)}<select value={th[k]} onChange={(e) => setTheme(k, e.target.value)}>{OPTIONS[k].map((o) => <option key={o}>{o}</option>)}</select></label>;
  const m = draft.fields.music || {};

  return (
    <aside className="customizer" onPointerDown={(e) => e.stopPropagation()}>
      <header><h3>Customize</h3><button className="ghost sm" onClick={onClose} aria-label="Close">✕</button></header>
      <div className="seg">{['Look', 'Layout', 'Cards', 'Stickers', 'Profile'].map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
      {err && <p className="err">{err}</p>}
      <div className="cbody">
        {tab === 'Look' && <><h4>Colors</h4><div className="grid2">{COLOR_KEYS.map((k) => <label key={k}>{label(k)}<input type="color" value={th[k]} onChange={(e) => setTheme(k, e.target.value)} /></label>)}</div></>}
        {TABS[tab]?.map((g) => { const keys = GROUPS.find((x) => x[0] === g)[1]; return (<div key={g}><h4>{g}</h4>
          {g === 'Shape' && <p className="radii">Corners {r1} → {r2} → {r3}px <small>frame → cards → inner</small></p>}
          <div className="grid2">{keys.map(pick)}</div></div>); })}
        {tab === 'Layout' && <><h4>Images</h4><label className="file">Avatar<input type="file" accept="image/*" onChange={upload(profiles.setAvatar)} /></label>
          <label className="file">Background<input type="file" accept="image/*" onChange={upload(profiles.setBackgroundImage)} /></label></>}

        {tab === 'Cards' && <>
          {draft.cards.map((c, i) => (c.type === 'sticker' || c.type === 'music') ? null : (
            <div className="cardrow" key={c.id}>
              <div className="cardhead"><input value={c.title || ''} maxLength={60} onChange={(e) => setCard(c.id, { title: e.target.value })} />
                <button className="ghost sm" onClick={() => move(i, -1)} aria-label="Up">↑</button><button className="ghost sm" onClick={() => move(i, 1)} aria-label="Down">↓</button>
                <button className="ghost sm" onClick={() => setCard(c.id, { visible: !c.visible })} aria-label="Toggle">{c.visible ? 'Hide' : 'Show'}</button>
                <button className="ghost sm" onClick={() => run(async () => { await cardsApi.deleteCard(c.id); drop(c.id); })} aria-label="Delete">✕</button></div>
              <small>{c.type.replace('_', ' ')}{!c.visible && ' · hidden'}</small>
              {(c.type === 'about' || c.type === 'text') && <textarea rows="4" maxLength={3000} value={c.content.body || ''} onChange={(e) => setCard(c.id, { content: { ...c.content, body: e.target.value } })} />}
              {c.type === 'links' && <textarea rows="3" placeholder="label | https://…  (one per line)" value={(c.content.links || []).map((l) => `${l.label} | ${l.url}`).join('\n')}
                onChange={(e) => setCard(c.id, { content: { links: e.target.value.split('\n').filter(Boolean).slice(0, 20).map((ln) => { const [lb, url] = ln.split('|').map((x) => x.trim()); return { label: lb || url, url: url || lb }; }) } })} />}
              {c.type === 'interests' && <input placeholder="comma, separated" value={(c.content.interests || []).join(', ')} onChange={(e) => setCard(c.id, { content: { interests: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 30) } })} />}
              {c.type === 'gallery' && <label className="file">Add image<input type="file" accept="image/*" onChange={(e) => e.target.files[0] && run(async () => { const p = await media.uploadImage(e.target.files[0]); setCard(c.id, { content: { images: [...(c.content.images || []), p].slice(0, 12) } }); })} /></label>}
            </div>))}
          <select value="" onChange={(e) => e.target.value && addCard(e.target.value)}><option value="">+ Add a card…</option>{Object.keys(DEFAULT_CONTENT).map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select></>}

        {tab === 'Stickers' && <>
          <label className="file">Add a sticker<input type="file" accept="image/*" onChange={(e) => e.target.files[0] && addSticker(e.target.files[0])} /></label>
          <p className="hint">{stickers.length ? 'Drag a sticker on the page to move it. Drag its corner dot to resize.' : 'Stickers are small images you can place anywhere on your profile.'}</p>
          {s ? (<div className="cardrow"><label>Rotate {s.rotation}°<input type="range" min="-180" max="180" value={s.rotation} onChange={(e) => setCard(s.id, { rotation: +e.target.value })} /></label>
            <label>Size {s.w}px<input type="range" min="40" max="600" value={s.w} onChange={(e) => setCard(s.id, { w: +e.target.value, h: Math.round(+e.target.value * s.h / s.w) })} /></label>
            <div className="cardhead"><button className="ghost sm" onClick={() => setCard(s.id, { z: topZ + 1 })}>Front</button><button className="ghost sm" onClick={() => setCard(s.id, { z: 0 })}>Back</button>
              <button className="ghost sm" onClick={() => run(async () => { await cardsApi.deleteCard(s.id); drop(s.id); setSel(null); })}>Delete</button></div></div>)
            : stickers.length > 0 && <p className="hint">Select a sticker on the page to edit it.</p>}</>}

        {tab === 'Profile' && <>
          <label>Display name<input value={draft.fields.display_name} maxLength={50} onChange={(e) => setField('display_name', e.target.value)} /></label>
          <label>Headline<input value={draft.fields.headline || ''} maxLength={80} onChange={(e) => setField('headline', e.target.value)} /></label>
          <label>Locality<select value={draft.fields.locality_id ?? ''} onChange={(e) => setField('locality_id', e.target.value ? +e.target.value : null)}><option value="">—</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label>Who can write on my wall<select value={draft.fields.wall_policy} onChange={(e) => setField('wall_policy', e.target.value)}>{['everyone', 'friends', 'nobody'].map((o) => <option key={o}>{o}</option>)}</select></label>
          <label className="row"><input type="checkbox" checked={draft.fields.show_on_map} onChange={(e) => setField('show_on_map', e.target.checked)} />Show me on my friends' map</label>
          <h4>Music</h4>
          <label className="file">Upload audio (mp3, m4a, ogg · max 8 MB)<input type="file" accept="audio/*" onChange={(e) => e.target.files[0] && run(async () => { const old = m.audio; setMusic({ audio: await media.uploadAudio(e.target.files[0]), url: '' }); if (old) media.deleteAudio(old).catch(() => {}); })} /></label>
          {m.audio && <button className="ghost sm" onClick={() => setMusic({ audio: '' })}>Remove uploaded audio</button>}
          <p className="hint">Audio plays on its own, with no video. Only upload music you have the right to share.</p>
          <input placeholder="…or a YouTube / direct .mp3 link (YouTube shows its video)" value={m.url || ''} onChange={(e) => setMusic({ url: e.target.value.trim(), audio: '' })} />
          <div className="grid2"><input placeholder="Title" maxLength={80} value={m.title || ''} onChange={(e) => setMusic({ title: e.target.value })} />
            <input placeholder="Artist" maxLength={80} value={m.artist || ''} onChange={(e) => setMusic({ artist: e.target.value })} /></div>
          <label className="file">Cover image<input type="file" accept="image/*" onChange={(e) => e.target.files[0] && run(async () => setMusic({ cover: await media.uploadImage(e.target.files[0]) }))} /></label></>}
      </div>
      <footer><button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button><button className="ghost" onClick={onClose}>Cancel</button></footer>
    </aside>
  );
}
