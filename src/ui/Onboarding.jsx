import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { profiles, cards as cardsApi, friends, discover } from '../index.js';
import { Avatar, useImages } from './shared.jsx';
import { friendlyError } from './errors.jsx';
import { clearInvite, USERNAME_RE } from '../lib/invite.js';
import './onboarding.css';
const InviteModal = lazy(() => import('./InviteModal.jsx'));

const STEPS = ['Who are you?', 'Add a photo', 'About you', 'Find your people'];

/** First-run welcome after sign-up: locality + name, avatar, an "About me" text, then a few people to add.
 *  Every step can be skipped; finishing (or skipping) sets profiles.onboarded_at so it never shows again. */
export default function Onboarding({ me, inviter: rawInviter, onDone, notify }) {
  const inviter = USERNAME_RE.test(rawInviter || '') ? rawInviter : null;   // comes from account metadata: only ever treat it as a plain username
  const [step, setStep] = useState(0); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [locs, setLocs] = useState([]);
  const [name, setName] = useState(me.display_name || me.username); const [loc, setLoc] = useState(me.locality_id ? String(me.locality_id) : ''); const [mood, setMood] = useState(me.headline || '');
  const [avatar, setAvatar] = useState(me.avatar_path || null); const [preview, setPreview] = useState(null);
  const [about, setAbout] = useState(''); const aboutCard = useRef(null);
  const [people, setPeople] = useState(null); const [sent, setSent] = useState({}); const [inv, setInv] = useState(false);
  const head = useRef();
  useEffect(() => { discover.listLocalities().then(setLocs).catch(() => {}); }, []);
  useEffect(() => { head.current?.focus(); }, [step]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { cardsApi.listMine().then((cs) => { const c = cs.find((x) => x.type === 'about'); if (c) { aboutCard.current = c; setAbout(c.content?.body || ''); } }).catch(() => {}); }, []);

  // step 4 data: the person who invited you first, then recent people in your locality (or anywhere if nobody is there yet)
  const loadPeople = async () => {
    setPeople(null); setErr('');
    try {
      const l = loc ? +loc : null; let list = await discover.discover({ localityId: l, mode: 'new', limit: 12 });
      if (l && list.length < 3) { const more = await discover.discover({ localityId: null, mode: 'new', limit: 12 }); list = [...list, ...more.filter((p) => !list.some((x) => x.id === p.id))].slice(0, 12); }
      if (inviter && !list.some((p) => p.username === inviter)) { const hit = (await discover.searchProfiles(inviter, 5)).find((p) => p.username === inviter && p.id !== me.id); if (hit) list = [hit, ...list]; }
      else if (inviter) list = [list.find((p) => p.username === inviter), ...list.filter((p) => p.username !== inviter)];
      setPeople(list);
    } catch (e) { setErr(friendlyError(e)); setPeople([]); }
  };
  useEffect(() => { if (step === 3) loadPeople(); }, [step]);   // eslint-disable-line react-hooks/exhaustive-deps
  const img = useImages((people || []).map((p) => p.avatar_path));
  const lname = (id) => locs.find((l) => l.id === id)?.name;

  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); return true; } catch (e) { setErr(friendlyError(e)); return false; } finally { setBusy(false); } };
  const finish = () => run(async () => { await profiles.updateMyProfile({ onboarded_at: new Date().toISOString() }); clearInvite(); await onDone(); });

  const next = async () => {
    if (step === 0) { if (!(await run(() => profiles.updateMyProfile({ display_name: name.trim() || me.username, headline: mood.trim() || null, locality_id: loc ? +loc : null })))) return; }
    if (step === 2) {
      const body = about.trim();
      if (!(await run(async () => {
        if (aboutCard.current) { if ((aboutCard.current.content?.body || '') !== body) aboutCard.current = await cardsApi.updateCard(aboutCard.current.id, { content: { ...aboutCard.current.content, body } }); }
        else if (body) aboutCard.current = await cardsApi.createCard({ type: 'about', title: 'About me', content: { body } });
      }))) return;
    }
    setStep(step + 1);
  };
  const pickAvatar = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    if (preview) URL.revokeObjectURL(preview); setPreview(URL.createObjectURL(file));
    if (!(await run(async () => { const p = await profiles.setAvatar(file); setAvatar(p.avatar_path); }))) setPreview(null);
  };
  const add = (p) => friends.sendRequest(p.id).then(() => setSent((s) => ({ ...s, [p.id]: 1 }))).catch((e) => notify(friendlyError(e), 'err'));

  return (<div className="authwrap"><div className="authcard obcard" role="dialog" aria-labelledby="ob-h">
    <header className="authhead"><h1 className="brand">fiiyou</h1><p className="authlead">Welcome, let&apos;s set up your corner.</p></header>
    <ol className="obdots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><span className="vh">{s}</span></li>)}</ol>
    <h2 id="ob-h" tabIndex={-1} ref={head}>{STEPS[step]}</h2>

    {step === 0 && <>
      <label className="field"><span>Display name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="How people see you" /></label>
      <label className="field"><span>Where are you from?</span><select value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Choose a locality (optional)</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <p className="muted obhint">People nearby find you by locality. You can change it any time, and you decide whether you show up on the map.</p>
      <label className="field"><span>Mood (optional)</span><input value={mood} onChange={(e) => setMood(e.target.value)} maxLength={80} placeholder="What's up today?" /></label></>}

    {step === 1 && <div className="obavatar"><Avatar src={preview || undefined} size={112} />
      <label className="filebtn ghost"><input type="file" accept="image/*" onChange={pickAvatar} disabled={busy} hidden />{avatar ? 'Choose a different photo' : 'Choose a photo'}</label>
      <p className="muted obhint">A face or anything that feels like you. Profiles with a photo get noticed much more.</p></div>}

    {step === 2 && <><label className="field"><span>About me</span><textarea rows={5} maxLength={600} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Where you hang out, what you make, what you're into…" /></label>
      <p className="muted obhint">This fills the &quot;About me&quot; card on your page. You can restyle everything later in the editor.</p></>}

    {step === 3 && <>
      {inviter && <p className="obnote">@{inviter} invited you. Add them first.</p>}
      {people === null && <p className="muted" role="status">Looking for people…</p>}
      {people?.length === 0 && !err && <p className="muted">You&apos;re one of the first here. Invite a friend and you&apos;ll find each other.</p>}
      <div className="oblist">{(people || []).map((p) => (<div className="row" key={p.id}><Avatar src={img[p.avatar_path]} size={44} /><span className="obwho"><b>{p.display_name}</b><small>{[p.headline, lname(p.locality_id)].filter(Boolean).join(' · ') || `@${p.username}`}</small></span>
        {sent[p.id] ? <small>Request sent</small> : <button type="button" className="primary sm" onClick={() => add(p)}>Add</button>}</div>))}</div>
      <button type="button" className="ghost wide" onClick={() => setInv(true)}>Invite friends (link and QR code)</button></>}

    {err && <p className="err" role="alert">{err}{step === 3 && <> <button type="button" className="link" onClick={loadPeople}>Try again</button></>}</p>}
    <div className="obnav">
      {step > 0 ? <button type="button" className="ghost" onClick={() => { setErr(''); setStep(step - 1); }} disabled={busy}>Back</button> : <span />}
      {step < STEPS.length - 1 ? <button type="button" className="primary" onClick={next} disabled={busy || (step === 0 && !name.trim())}>{busy ? 'One moment…' : step === 1 && !avatar ? 'Skip' : step === 2 && !about.trim() ? 'Skip' : 'Next'}</button>
        : <button type="button" className="primary" onClick={finish} disabled={busy}>{busy ? 'One moment…' : 'Go to fiiyou'}</button>}
    </div>
    <button type="button" className="link muted obskip" onClick={finish} disabled={busy}>Skip setup for now</button>
    {inv && <Suspense fallback={null}><InviteModal me={me} onClose={() => setInv(false)} notify={notify} /></Suspense>}
  </div></div>);
}
