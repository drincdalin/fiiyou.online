import { useEffect, useState } from 'react';
import { profiles, cards as cardsApi, media, discover } from '../index.js';
import { THEME_DEFAULTS, OPTIONS } from './theme.js';

const COLORS = [['accent_color', 'Accent'], ['border_color', 'Borders'], ['card_color', 'Cards'],
                ['text_color', 'Text'], ['link_color', 'Links'], ['bg_color', 'Page bg']];
const DEFAULT_CONTENT = { about: { body: '' }, text: { body: '' }, gallery: { images: [] }, links: { links: [] },
                          interests: { interests: [] }, music: { url: '' }, guestbook: {}, top_friends: {} };

export default function Customizer({ draft, setDraft, onClose, reload }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [locs, setLocs] = useState([]); useEffect(() => { discover.listLocalities().then(setLocs); }, []);
  const th = { ...THEME_DEFAULTS, ...draft.theme };
  const setTheme = (k, v) => setDraft((d) => ({ ...d, theme: { ...d.theme, [k]: v } }));
  const setField = (k, v) => setDraft((d) => ({ ...d, fields: { ...d.fields, [k]: v } }));
  const setCard = (i, patch) => setDraft((d) => ({ ...d, cards: d.cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const move = (i, dir) => setDraft((d) => { const c = [...d.cards]; const j = i + dir; if (j < 0 || j >= c.length) return d;
    [c[i], c[j]] = [c[j], c[i]]; return { ...d, cards: c }; });
  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr(e.message || 'error'); } setBusy(false); };

  const save = () => run(async () => {
    await profiles.updateMyProfile({ ...draft.fields, theme: draft.theme });
    await Promise.all(draft.cards.map((c, i) => cardsApi.updateCard(c.id,
      { y: i * 10, title: c.title, content: c.content, visible: c.visible })));
    await reload(); onClose();
  });
  const addCard = (type) => run(async () => {
    const c = await cardsApi.createCard({ type, title: type, content: DEFAULT_CONTENT[type], y: draft.cards.length * 10 });
    setDraft((d) => ({ ...d, cards: [...d.cards, c] }));
  });
  const upload = (fn) => (e) => e.target.files[0] && run(async () => { await fn(e.target.files[0]); await reload(); });

  return (
    <aside className="customizer">
      <header><h3>Customize</h3><button className="ghost" onClick={onClose}>✕</button></header>
      {err && <p className="err">{err}</p>}

      <h4>Colors</h4>
      <div className="grid2">{COLORS.map(([k, l]) => (
        <label key={k}>{l}<input type="color" value={th[k]} onChange={(e) => setTheme(k, e.target.value)} /></label>))}</div>

      <h4>Type & shape</h4>
      <div className="grid2">
        {[['font', 'UI font'], ['name_font', 'Name font'], ['radius', 'Corners'], ['overlay', 'Dim bg %'], ['bg_repeat', 'Bg mode'], ['cursor', 'Cursor']].map(([k, l]) => (
          <label key={k}>{l}<select value={th[k]} onChange={(e) => setTheme(k, e.target.value)}>
            {OPTIONS[k].map((o) => <option key={o}>{o}</option>)}</select></label>))}
      </div>

      <h4>Images</h4>
      <label className="file">Avatar<input type="file" accept="image/*" onChange={upload(profiles.setAvatar)} /></label>
      <label className="file">Background<input type="file" accept="image/*" onChange={upload(profiles.setBackgroundImage)} /></label>

      <h4>Profile</h4>
      <label>Display name<input value={draft.fields.display_name} maxLength={50} onChange={(e) => setField('display_name', e.target.value)} /></label>
      <label>Headline<input value={draft.fields.headline || ''} maxLength={80} onChange={(e) => setField('headline', e.target.value)} /></label>
      <label>Locality<select value={draft.fields.locality_id ?? ''} onChange={(e) => setField('locality_id', e.target.value ? +e.target.value : null)}>
        <option value="">—</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>Who can write on my wall<select value={draft.fields.wall_policy} onChange={(e) => setField('wall_policy', e.target.value)}>
        {['everyone', 'friends', 'nobody'].map((o) => <option key={o}>{o}</option>)}</select></label>
      <label className="row"><input type="checkbox" checked={draft.fields.show_on_map} onChange={(e) => setField('show_on_map', e.target.checked)} />Show me on friends' map</label>

      <h4>Cards</h4>
      {draft.cards.map((c, i) => (
        <div className="cardrow" key={c.id}>
          <div className="cardhead">
            <input value={c.title || ''} maxLength={60} onChange={(e) => setCard(i, { title: e.target.value })} />
            <button className="ghost" onClick={() => move(i, -1)}>↑</button><button className="ghost" onClick={() => move(i, 1)}>↓</button>
            <button className="ghost" title="show/hide" onClick={() => setCard(i, { visible: !c.visible })}>{c.visible ? '👁' : '—'}</button>
            <button className="ghost" onClick={() => run(async () => { await cardsApi.deleteCard(c.id); setDraft((d) => ({ ...d, cards: d.cards.filter((x) => x.id !== c.id) })); })}>🗑</button>
          </div>
          <small>{c.type}</small>
          {(c.type === 'about' || c.type === 'text') &&
            <textarea rows="4" maxLength={3000} value={c.content.body || ''} onChange={(e) => setCard(i, { content: { ...c.content, body: e.target.value } })} />}
          {c.type === 'music' && ['url', 'title', 'artist'].map((k) => (
            <input key={k} placeholder={k === 'url' ? 'https://…/song.mp3' : k} value={c.content[k] || ''}
              onChange={(e) => setCard(i, { content: { ...c.content, [k]: e.target.value } })} />))}
          {c.type === 'music' && <label className="file">Cover<input type="file" accept="image/*" onChange={(e) => e.target.files[0] &&
            run(async () => { const p = await media.uploadImage(e.target.files[0]); setCard(i, { content: { ...c.content, images: [p] } }); })} /></label>}
          {c.type === 'links' && <textarea rows="3" placeholder="label | https://…  (one per line)"
            value={(c.content.links || []).map((l) => `${l.label} | ${l.url}`).join('\n')}
            onChange={(e) => setCard(i, { content: { links: e.target.value.split('\n').filter(Boolean).slice(0, 20).map((ln) => { const [label, url] = ln.split('|').map((s) => s.trim()); return { label: label || url, url: url || label }; }) } })} />}
          {c.type === 'interests' && <input placeholder="comma, separated" value={(c.content.interests || []).join(', ')}
            onChange={(e) => setCard(i, { content: { interests: e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30) } })} />}
          {c.type === 'gallery' && <label className="file">Add image<input type="file" accept="image/*" onChange={(e) => e.target.files[0] &&
            run(async () => { const p = await media.uploadImage(e.target.files[0]); setCard(i, { content: { images: [...(c.content.images || []), p].slice(0, 12) } }); })} /></label>}
        </div>))}
      <select value="" onChange={(e) => e.target.value && addCard(e.target.value)}>
        <option value="">+ add card…</option>{Object.keys(DEFAULT_CONTENT).map((t) => <option key={t}>{t}</option>)}</select>

      <footer><button className="primary" disabled={busy} onClick={save}>{busy ? '…' : 'Save'}</button>
        <button className="ghost" onClick={onClose}>Cancel</button></footer>
    </aside>
  );
}
