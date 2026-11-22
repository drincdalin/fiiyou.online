import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Bicycle, Camera, CaretLeft, Check, CookingPot, FilmSlate, GameController, MagnifyingGlass, MusicNotes, Mountains, PaintBrush, PawPrint, PencilSimple, SoccerBall, Code } from '@phosphor-icons/react';
import { profiles, cards as cardsApi, friends, discover } from '../index.js';
import { Avatar, useImages } from './shared.jsx';
import { RowsSkeleton } from './states.jsx';
import { friendlyError } from './errors.jsx';
import { clearInvite, USERNAME_RE } from '../lib/invite.js';
import { applyAppTheme } from './appTheme.js';
import { PRESETS } from './themes.js';
import { MOODS, INTERESTS, VIBE_IDS, composeAbout, matchPreset } from './onboardingData.js';
import './onboarding.css';
import LocalityPicker from './LocalityPicker.jsx';
const InviteModal = lazy(() => import('./InviteModal.jsx'));

const STEPS = ['Who are you?', 'Pick your vibe', 'Add a photo', 'What are you into?', 'Find your people'];
const LAST = STEPS.length - 1;
const VIBES = VIBE_IDS.map((id) => PRESETS.find((p) => p.id === id)).filter(Boolean);
/** Short names for the cramped swatch grid. The full name still labels the radio for screen readers and shows in the line below. */
const SHORT = { aero: 'Aero', tokyo: 'Tokyo', rosepine: 'Rosé', vapor: 'Vapor' };
const INTEREST_ICON = { music: MusicNotes, photo: Camera, gaming: GameController, sports: SoccerBall, art: PaintBrush, code: Code, books: BookOpen, film: FilmSlate, cooking: CookingPot, hiking: Mountains, cycling: Bicycle, animals: PawPrint };

/** One tap-to-toggle chip. Pressed = filled with the person's accent, so the state never depends on colour alone (the shape and the check change too). */
function Chip({ on, onClick, icon: Icon, children }) {
  return (<button type="button" className={`obchip${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>
    {Icon && <Icon size={16} weight="bold" aria-hidden="true" />}<span>{children}</span>{on && <Check size={14} weight="bold" aria-hidden="true" className="obchk" />}
  </button>);
}

/** A theme card: a tiny picture of the look (page, top bar, card, accent) drawn from the theme's own colours. A real radio under it, so arrow keys work. */
function VibeCard({ preset, checked, onPick }) {
  const t = preset.theme;
  return (<label className="obvibe">
    <input type="radio" name="ob-vibe" value={preset.id} aria-label={preset.name} checked={checked} onChange={() => onPick(preset)} />
    <span className="obpv" style={{ background: t.bg_color }} aria-hidden="true">
      <span className="obpv-bar" style={{ background: t.frame_color, borderColor: t.border_color }}><i style={{ background: t.accent_color }} /><i style={{ background: t.text_color, opacity: 0.4 }} /></span>
      <span className="obpv-card" style={{ background: t.card_color, borderColor: t.border_color, borderRadius: Math.min(+t.radius || 0, 12) }}>
        <i style={{ background: t.text_color, width: '70%' }} /><i style={{ background: t.text_color, opacity: 0.4, width: '45%' }} /><b style={{ background: t.accent_color }} />
      </span>
    </span>
    <span className="obvname" aria-hidden="true">{SHORT[preset.id] || preset.name}</span>
    <span className="obvchk" aria-hidden="true"><Check size={12} weight="bold" /></span>
  </label>);
}

/** First-run welcome after sign-up: name and place, a look, a photo, a few taps about you, then people to add.
 *  Almost everything is a tap. Every step can be skipped; finishing (or skipping) sets profiles.onboarded_at so it never shows again. */
export default function Onboarding({ me, inviter: rawInviter, onDone, notify }) {
  const inviter = USERNAME_RE.test(rawInviter || '') ? rawInviter : null;   // comes from account metadata: only ever treat it as a plain username
  const [step, setStep] = useState(0); const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [locs, setLocs] = useState([]);
  const [name, setName] = useState(me.display_name || me.username); const [loc, setLoc] = useState(me.locality_id ? String(me.locality_id) : '');
  const [mood, setMood] = useState(me.headline || ''); const [ownMood, setOwnMood] = useState(!!me.headline && !MOODS.includes(me.headline));
  const [vibe, setVibe] = useState(() => matchPreset(VIBES, me.theme) || VIBES[0].id); const savedVibe = useRef(matchPreset(VIBES, me.theme)); const vibeTouched = useRef(false);
  const [avatar, setAvatar] = useState(me.avatar_path || null); const [preview, setPreview] = useState(null);
  const [picks, setPicks] = useState([]); const [extra, setExtra] = useState(''); const [writing, setWriting] = useState(false); const aboutCard = useRef(null);
  const [q, setQ] = useState(''); const [hits, setHits] = useState(null); const seq = useRef(0);
  const [people, setPeople] = useState(null); const [sent, setSent] = useState({}); const [adding, setAdding] = useState({}); const [inv, setInv] = useState(false);
  const head = useRef();
  const fadeTimer = useRef(0);
  useEffect(() => { discover.listLocalities().then(setLocs).catch(() => {}); }, []);
  useEffect(() => { head.current?.focus({ preventScroll: true }); window.scrollTo?.({ top: 0 }); }, [step]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { clearTimeout(fadeTimer.current); document.documentElement.classList.remove('fy-theme-fade'); }, []);
  useEffect(() => {
    cardsApi.listMine().then((cs) => {
      const c = cs.find((x) => x.type === 'about');
      if (c) { aboutCard.current = c; const body = c.content?.body || ''; if (body) { setExtra(body); setWriting(true); } }
    }).catch(() => {});
  }, []);

  // step 5 data: the person who invited you first, then recent people in your locality (or anywhere if nobody is there yet)
  const loadPeople = async () => {
    setPeople(null); setErr('');
    try {
      const l = loc ? +loc : null; let list = await discover.discover({ localityId: l, mode: 'new', limit: 12 });
      if (l && list.length < 3) { const more = await discover.discover({ localityId: null, mode: 'new', limit: 12 }); list = [...list, ...more.filter((p) => !list.some((x) => x.id === p.id))].slice(0, 12); }
      if (inviter && !list.some((p) => p.username === inviter)) { const hit = (await discover.searchProfiles(inviter, 5)).find((p) => p.username === inviter && p.id !== me.id); if (hit) list = [hit, ...list]; }
      else if (inviter) list = [list.find((p) => p.username === inviter), ...list.filter((p) => p.username !== inviter)];
      setPeople(list.filter(Boolean));
    } catch (e) { setErr(friendlyError(e)); setPeople([]); }
  };
  useEffect(() => { if (step === LAST) loadPeople(); }, [step]);   // eslint-disable-line react-hooks/exhaustive-deps
  // search box on the last step: type 2+ letters to look people up by name or @username (debounced; stale answers are dropped)
  const term = q.trim(); const searching = term.length >= 2;
  useEffect(() => {
    if (!searching) { seq.current++; setHits(null); return undefined; }
    const my = ++seq.current; setHits(null);
    const t = setTimeout(() => { discover.searchProfiles(term.replace(/^@/, ''), 12).then((r) => { if (my === seq.current) setHits(r.filter((p) => p.id !== me.id)); }).catch(() => { if (my === seq.current) setHits([]); }); }, 250);
    return () => clearTimeout(t);
  }, [term, searching, me.id]);
  const shown = searching ? hits : people;
  const img = useImages((shown || []).map((p) => p.avatar_path));
  const lname = (id) => locs.find((l) => l.id === id)?.name;

  const run = async (fn) => { if (busy) return false; setBusy(true); setErr(''); try { await fn(); return true; } catch (e) { setErr(friendlyError(e)); return false; } finally { setBusy(false); } };

  // the look: previewed live on the whole app the moment it is tapped, saved when the step is left
  const pickVibe = (p) => {
    vibeTouched.current = true; setVibe(p.id);
    const root = document.documentElement; root.classList.add('fy-theme-fade'); clearTimeout(fadeTimer.current); fadeTimer.current = setTimeout(() => root.classList.remove('fy-theme-fade'), 320);
    applyAppTheme(p.theme);
  };
  const saveVibe = async () => { if (savedVibe.current === vibe) return; const p = VIBES.find((x) => x.id === vibe); await profiles.updateMyProfile({ theme: p.theme }); savedVibe.current = vibe; };
  const body = composeAbout(picks.map((id) => INTERESTS.find((i) => i.id === id)?.label).filter(Boolean), extra);
  const saveAbout = async () => {
    if (aboutCard.current) { if ((aboutCard.current.content?.body || '') !== body) aboutCard.current = await cardsApi.updateCard(aboutCard.current.id, { content: { ...aboutCard.current.content, body } }); }
    else if (body) aboutCard.current = await cardsApi.createCard({ type: 'about', title: 'About me', content: { body } });
  };
  const finish = () => run(async () => { if (vibeTouched.current) await saveVibe(); await profiles.updateMyProfile({ onboarded_at: new Date().toISOString() }); clearInvite(); await onDone(); });

  const go = (to) => { setDir(to > step ? 1 : -1); setErr(''); setStep(to); };
  const next = async () => {
    if (step === 0 && !(await run(() => profiles.updateMyProfile({ display_name: name.trim() || me.username, headline: mood.trim() || null, locality_id: loc ? +loc : null })))) return;
    if (step === 1 && !(await run(saveVibe))) return;
    if (step === 3 && !(await run(saveAbout))) return;
    go(step + 1);
  };
  const pickAvatar = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    if (preview) URL.revokeObjectURL(preview); setPreview(URL.createObjectURL(file));
    if (!(await run(async () => { const p = await profiles.setAvatar(file); setAvatar(p.avatar_path); }))) setPreview(null);
  };
  const add = async (p) => {
    setAdding((a) => ({ ...a, [p.id]: 1 }));
    try { await friends.sendRequest(p.id); setSent((s) => ({ ...s, [p.id]: 1 })); } catch (e) { notify(friendlyError(e), 'err'); }
    finally { setAdding((a) => { const n = { ...a }; delete n[p.id]; return n; }); }
  };
  const toggleInterest = (id) => setPicks((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const pickMood = (m) => { setOwnMood(false); setMood((cur) => (cur === m ? '' : m)); };
  const ctaLabel = step === LAST ? 'Go to fiiyou' : (step === 2 && !avatar) || (step === 3 && !body) ? 'Skip' : 'Next';

  return (<div className="authwrap obwrap"><div className="authcard obcard" role="dialog" aria-labelledby="ob-h">
    <div className="obhead">
    <header className="authhead"><h1 className="brand">fiiyou</h1>{step === 0 && <p className="authlead">Welcome in. Make it yours, it takes a minute.</p>}</header>
    <div className="obprog">
      <ol className="obdots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><span className="vh">{s}</span></li>)}</ol>
      <span className="obstepno" aria-hidden="true">{step + 1} / {STEPS.length}</span>
    </div>
    <h2 id="ob-h" tabIndex={-1} ref={head}>{STEPS[step]}</h2>
    </div>

    <div className="obstep" key={step} data-dir={dir}>
      {step === 0 && <>
        <label className="field"><span>Display name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="How people see you" autoComplete="nickname" /></label>
        <div className="field"><span>Where are you from?</span><LocalityPicker locs={locs} value={loc} onChange={setLoc} emptyLabel="Choose a locality (optional)" ariaLabel="Where are you from" /></div>
        <div className="field"><span>How are you today?</span>
          <div className="obchips" role="group" aria-label="How are you today">
            {MOODS.map((m) => <Chip key={m} on={!ownMood && mood === m} onClick={() => pickMood(m)}>{m}</Chip>)}
            <Chip on={ownMood} icon={PencilSimple} onClick={() => { setOwnMood((o) => !o); if (ownMood) setMood(''); }}>Write my own</Chip>
          </div>
          {ownMood && <input value={mood} onChange={(e) => setMood(e.target.value)} maxLength={80} placeholder="What's up today?" aria-label="Your mood" autoFocus />}
        </div>
        <p className="muted obhint">People nearby find you by locality. You decide whether you show up on the map.</p></>}

      {step === 1 && <>
        <div className="obvibes" role="radiogroup" aria-label="Look and feel">{VIBES.map((p) => <VibeCard key={p.id} preset={p} checked={vibe === p.id} onPick={pickVibe} />)}</div>
        <p className="muted obhint"><b className="obpicked">{VIBES.find((x) => x.id === vibe)?.name}</b> is live on this screen right now. More looks and full control live in Customize.</p></>}

      {step === 2 && <div className="obavatar">
        <label className="obpick"><input type="file" accept="image/*" onChange={pickAvatar} disabled={busy} aria-label={avatar ? 'Choose a different photo' : 'Choose a photo'} />
          <Avatar src={preview || undefined} size={128} name={name} /><span className="obcam" aria-hidden="true"><Camera size={18} weight="bold" /></span></label>
        <p className="muted obhint">{avatar ? 'Looking good. Tap the photo to change it.' : 'Tap the circle. A face, or anything that feels like you.'}</p></div>}

      {step === 3 && <>
        <div className="obchips" role="group" aria-label="Things you are into">
          {INTERESTS.map((i) => <Chip key={i.id} on={picks.includes(i.id)} icon={INTEREST_ICON[i.id]} onClick={() => toggleInterest(i.id)}>{i.label}</Chip>)}
        </div>
        {writing
          ? <label className="field"><span>A few words of your own (optional)</span><textarea rows={3} maxLength={400} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Where you hang out, what you make…" /></label>
          : <button type="button" className="ghost obmore" onClick={() => setWriting(true)}><PencilSimple size={16} weight="bold" aria-hidden="true" />Add a few words of your own</button>}
        <p className="muted obhint">This fills the &quot;About me&quot; card on your page. You can restyle everything later in the editor.</p></>}

      {step === LAST && <>
        {inviter && <p className="obnote">@{inviter} invited you. Add them first.</p>}
        <div className="obsearch"><MagnifyingGlass size={16} weight="bold" aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or @username" aria-label="Search people" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={50} /></div>
        {shown === null && <RowsSkeleton n={3} label={searching ? 'Searching' : 'Looking for people'} />}
        {shown?.length === 0 && !err && (searching ? <p className="muted" role="status">Nobody found for “{term}”. Check the spelling, or invite them with the button below.</p> : <p className="muted">You&apos;re one of the first here. Invite a friend and you&apos;ll find each other.</p>)}
        <div className="oblist">{(shown || []).filter(Boolean).map((p) => (<div className="row" key={p.id}><Avatar src={img[p.avatar_path]} size={44} name={p.display_name} /><span className="obwho"><b>{p.display_name}</b><small>{[p.headline, lname(p.locality_id)].filter(Boolean).join(' · ') || `@${p.username}`}</small></span>
          {sent[p.id] ? <span className="obsent"><Check size={14} weight="bold" aria-hidden="true" />Sent</span> : <button type="button" className="primary sm" onClick={() => add(p)} disabled={!!adding[p.id]} aria-busy={adding[p.id] || undefined} aria-label={`Add ${p.display_name}`}>Add</button>}</div>))}</div>
        <button type="button" className="ghost wide" onClick={() => setInv(true)}>Invite friends (link and QR code)</button></>}
    </div>

    <footer className="obfoot">
    {err && <p className="err" role="alert">{err}{step === LAST && <> <button type="button" className="link" onClick={loadPeople}>Try again</button></>}</p>}
    <div className="obnav">
      {step > 0 && <button type="button" className="ghost obback" onClick={() => go(step - 1)} disabled={busy} aria-label="Back"><CaretLeft size={18} weight="bold" aria-hidden="true" /></button>}
      {step < LAST
        ? <button type="button" className="primary" onClick={next} disabled={step === 0 && !name.trim()} aria-busy={busy || undefined}>{ctaLabel}{ctaLabel === 'Next' && <ArrowRight size={18} weight="bold" aria-hidden="true" />}</button>
        : <button type="button" className="primary" onClick={finish} aria-busy={busy || undefined}>{ctaLabel}<ArrowRight size={18} weight="bold" aria-hidden="true" /></button>}
    </div>
    <button type="button" className="link muted obskip" onClick={finish} disabled={busy}>Skip setup for now</button>
    </footer>
    {inv && <Suspense fallback={null}><InviteModal me={me} onClose={() => setInv(false)} notify={notify} /></Suspense>}
  </div></div>);
}
