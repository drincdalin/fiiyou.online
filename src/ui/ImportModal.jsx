import { useState } from 'react';
import { profiles, cards as cardsApi } from '../index.js';
import { parseThemeFile } from './themeFile.js';

/** Import a theme (or a full data export) from a file and apply it to MY profile. Images are not transferable between accounts. */
export default function ImportModal({ onClose, onDone, notify }) {
  const [parsed, setParsed] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [o, setO] = useState({ look: true, css: true, cards: false });
  const pick = async (e) => { const f = e.target.files[0]; e.target.value = ''; setErr(''); setParsed(null); if (!f) return;
    if (f.size > 1_000_000) return setErr('That file is too large to be a theme (max 1 MB).');
    try { const p = parseThemeFile(await f.text()); setParsed(p); setO({ look: !!Object.keys(p.theme).length, css: p.css.length > 0, cards: false }); } catch (er) { setErr(er.message); } };
  const apply = async () => { setBusy(true); setErr('');
    try { const cur = await profiles.getMyProfile(); const patch = {};
      if (o.look && Object.keys(parsed.theme).length) patch.theme = { ...parsed.theme, ...(cur.theme?.bg_image ? { bg_image: cur.theme.bg_image } : {}) };
      if (o.css) patch.custom_css = parsed.css;
      if (Object.keys(patch).length) await profiles.updateMyProfile(patch);
      if (o.cards && parsed.cards.length) { for (const c of (await cardsApi.listMine()).filter((x) => x.type !== 'sticker' && x.type !== 'music')) await cardsApi.deleteCard(c);
        for (const [i, c] of parsed.cards.entries()) await cardsApi.createCard({ ...c, y: i * 10 }); }
      notify('Theme imported'); onDone(); } catch (er) { setErr(er.message || 'Import failed'); setBusy(false); } };
  const row = (k, label, n) => <label className="row" key={k}><input type="checkbox" disabled={!n} checked={o[k] && !!n} onChange={(e) => setO({ ...o, [k]: e.target.checked })} />{label} <small>({n || 'none in file'})</small></label>;
  return (<div className="modal" onClick={busy ? undefined : onClose}><div className="panel mform" onClick={(e) => e.stopPropagation()}>
    <h3>Import theme</h3><p className="muted">Pick a theme file or a full data export from any fiiyou account. Photos, stickers, avatar and background images are not transferred (they belong to the other account), so they stay as they are on yours.</p>
    <input type="file" accept="application/json,.json" onChange={pick} />
    {err && <p className="err">{err}</p>}
    {parsed && <div className="imp">{row('look', 'Colors, shape and fonts', Object.keys(parsed.theme).length)}{row('css', 'Custom styles', parsed.css.length)}{row('cards', 'Card layout and text (replaces your current cards)', parsed.cards.length)}
      {o.cards && <p className="note">Your current cards will be deleted and replaced. Stickers, music and photos are kept.</p>}</div>}
    <div className="acts"><button className="primary" disabled={!parsed || busy || !(o.look || o.css || o.cards)} onClick={apply}>{busy ? 'Importing…' : 'Import'}</button><button className="ghost" onClick={onClose}>Cancel</button></div>
  </div></div>);
}
