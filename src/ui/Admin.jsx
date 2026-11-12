import { useEffect, useState } from 'react';
import { admin } from '../index.js';
import { useImages, Avatar, ago } from './shared.jsx';
import { DeletePlaceModal, DeleteContentModal } from './ModerationModals.jsx';
import { Flag, UsersThree, HardDrives, ClipboardText, EnvelopeSimple } from '@phosphor-icons/react';

const TAB_ICONS = { reports: Flag, users: UsersThree, emails: EnvelopeSimple, storage: HardDrives, log: ClipboardText };

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const banNotice = (r) => (r?.notified === false ? 'Account deleted and email banned, but the person could not be emailed. See the Emails tab.' : 'Account deleted and email banned');

function Reports({ go, notify, refresh, role }) {
  const [status, setStatus] = useState('open'); const [rows, setRows] = useState(null); const [dp, setDp] = useState(null); const [dc, setDc] = useState(null);
  const load = () => admin.reports(status).then(setRows).catch((e) => { notify(e.message, 'err'); setRows([]); }); useEffect(() => { setRows(null); load(); }, [status]);
  const img = useImages((rows || []).flatMap((r) => [r.preview?.image_path, r.preview?.avatar_path]));
  const run = async (fn, msg) => { try { await fn(); notify(msg); await load(); refresh(); } catch (e) { notify(e.message || 'Failed', 'err'); } };
  const delAccount = (id, name) => { if (prompt(`Type "${name}" to permanently delete this account, its files and everything it owns.`) === name) run(() => admin.deleteUser(id), 'Account deleted'); };
  const banAccount = async (id, name, reason) => {
    if (prompt(`Type "${name}" to BAN this email and permanently delete the account, its files and everything it owns.`) !== name) return;
    try { const r = await admin.banUser(id, reason); notify(banNotice(r)); await load(); refresh(); } catch (e) { notify(e.message || 'Failed', 'err'); }
  };
  return (<>
    <div className="tabs">{['open', 'reviewed', 'dismissed'].map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s === 'open' ? 'pending' : s === 'reviewed' ? 'resolved' : s}</button>)}</div>
    {!rows ? <div className="boot">Loading…</div> : !rows.length ? <p className="empty">Nothing here.</p> : rows.map((r) => { const p = r.preview; return (
      <article className="panel arep" key={r.id}>
        <header><span className="badge">{r.target_type.replace('_', ' ')}</span>{r.category && <span className="badge">{r.category.replace('_', ' ')}</span>}<small>reported by @{r.reporter_username || '?'} · {ago(r.created_at)}</small></header>
        <p className="reason">“{r.details || r.reason}”</p>
        {!p ? <p className="muted">The reported item no longer exists.</p> : <div className="aprev">
          {p.avatar_path && img[p.avatar_path] && <Avatar src={img[p.avatar_path]} size={48} />}
          <div>{p.display_name && <b>{p.display_name}</b>} <span className="muted">@{p.author}</span>{p.body && <p className="pre">{p.title ? `${p.title}: ` : ''}{p.body}</p>}
            {p.image_path && img[p.image_path] && <img className="athumb" src={img[p.image_path]} alt="" />}</div></div>}
        <div className="acts">
          {p && <button className="ghost sm" onClick={() => go('profile', p.author)}>Open profile</button>}
          {p && r.target_type === 'place' && <button className="ghost sm danger" onClick={() => setDp({ id: r.target_id, name: p.title, creator: p.author })}>Delete place…</button>}
          {p && r.target_type !== 'profile' && r.target_type !== 'place' && <button className="ghost sm danger" onClick={() => setDc({ type: r.target_type, id: r.target_id, reportId: r.id, author: p.author })}>Delete content…</button>}
          {p && role === 'admin' && <button className="ghost sm danger" onClick={() => delAccount(p.author_id, p.author)}>Delete account</button>}
          {p && role === 'admin' && <button className="ghost sm danger" onClick={() => banAccount(p.author_id, p.author, r.reason)}>Ban &amp; delete</button>}
          {status === 'open' && <><button className="primary sm" onClick={() => run(() => admin.setReport(r.id, 'reviewed'), 'Marked reviewed')}>Mark reviewed</button><button className="ghost sm" onClick={() => run(() => admin.setReport(r.id, 'dismissed'), 'Dismissed')}>Dismiss</button></>}
          {status !== 'open' && <button className="ghost sm" onClick={() => run(() => admin.setReport(r.id, 'open'), 'Reopened')}>Reopen</button>}
        </div></article>); })}
    {dp && <DeletePlaceModal place={dp} notify={notify} onClose={() => setDp(null)} onDone={() => { setDp(null); load(); refresh(); }} />}
    {dc && <DeleteContentModal target={dc} notify={notify} onClose={() => setDc(null)} onDone={() => { setDc(null); load(); refresh(); }} />}
  </>);
}

function Users({ go, notify, refresh }) {
  const [q, setQ] = useState(''); const [rows, setRows] = useState([]);
  const load = () => admin.searchUsers(q).then(setRows).catch((e) => notify(e.message, 'err')); useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);
  const img = useImages(rows.map((u) => u.avatar_path));
  const verify = async (u) => { try { await admin.setVerified(u.id, !u.verified); notify(u.verified ? 'Verification removed' : 'Profile verified'); load(); refresh(); } catch (e) { notify(e.message, 'err'); } };
  const del = async (u) => { if (prompt(`Type "${u.username}" to permanently delete this account, its files and everything it owns.`) !== u.username) return; try { await admin.deleteUser(u.id); notify('Account deleted'); load(); refresh(); } catch (e) { notify(e.message, 'err'); } };
  const ban = async (u) => {
    if (prompt(`Type "${u.username}" to BAN this email and permanently delete the account, its files and everything it owns.`) !== u.username) return;
    const reason = prompt('Internal note (optional, only admins will see it):') || null;
    const msg = prompt('Message to the person (emailed to them before the account is deleted; leave empty for the default text):') || null;
    try { const r = await admin.banUser(u.id, reason, msg); notify(banNotice(r)); load(); refresh(); } catch (e) { notify(e.message, 'err'); }
  };
  return (<><input placeholder="Search username or display name (empty = newest)" value={q} onChange={(e) => setQ(e.target.value)} />
    {rows.map((u) => (<div className="row" key={u.id}><Avatar src={img[u.avatar_path]} size={44} />
      <button className="link" onClick={() => go('profile', u.username)}><span>{u.display_name}{u.verified && <em className="badge vb">Verified</em>}</span><small>@{u.username} · joined {new Date(u.created_at).toLocaleDateString('ro-RO')} · {u.post_count} posts{u.open_reports > 0 ? ` · ${u.open_reports} open reports` : ''}</small></button>
      <span className="acts"><button className={u.verified ? 'ghost sm' : 'primary sm'} onClick={() => verify(u)}>{u.verified ? 'Unverify' : 'Verify'}</button><button className="ghost sm danger" onClick={() => del(u)}>Delete</button><button className="ghost sm danger" onClick={() => ban(u)}>Ban &amp; delete</button></span></div>))}</>);
}

const MAIL_KINDS = { account_banned: 'Ban notice', post_removed: 'Post removed', comment_removed: 'Comment removed', content_removed: 'Place removed' };
const MAIL_STATUS = { pending: 'waiting', sending: 'stuck', failed: 'failed', sent: 'sent' };

function Emails({ notify }) {
  const [rows, setRows] = useState(null);
  const load = () => admin.outbox().then(setRows).catch((e) => { notify(e.message, 'err'); setRows([]); }); useEffect(() => { load(); }, []);
  const requeue = async (id) => { try { await admin.requeueEmail(id); notify('Queued again. It goes out on the next retry call.'); load(); } catch (e) { notify(e.message, 'err'); } };
  return (<div className="panel"><h3>Emails to members</h3>
    <p className="muted">Notices sent when content is removed or an account is banned. “failed” or “stuck” means the person did not get the mail; check the error, fix it, put the mail back in the queue, then call the send-moderation-email function with {'{"retry":true}'}.</p>
    <div className="acts"><button className="ghost sm" onClick={() => { setRows(null); load(); }}>Refresh</button></div>
    {!rows ? <div className="boot">Loading…</div> : !rows.length ? <p className="empty">No emails yet.</p> : <div className="alog">{rows.map((r) => (
      <p key={r.id}><small>{ago(r.created_at)}</small> <span className={`badge${r.status === 'sent' ? '' : ' vb'}`}>{MAIL_STATUS[r.status] || r.status}</span> <b>{MAIL_KINDS[r.kind] || r.kind}</b>{r.username ? <span className="muted"> · @{r.username}</span> : null}{r.attempts > 0 ? <span className="muted"> · {r.attempts} attempt{r.attempts > 1 ? 's' : ''}</span> : null}
        {r.last_error && r.status !== 'sent' ? <span className="muted"> · {r.last_error}</span> : null}
        {(r.status === 'failed' || r.status === 'sending') && <> <button className="ghost sm" onClick={() => requeue(r.id)}>Queue again</button></>}</p>))}</div>}</div>);
}

function Storage({ notify }) {
  const [found, setFound] = useState(null); const [busy, setBusy] = useState(false);
  const scan = async () => { setBusy(true); try { setFound(await admin.findOrphans()); } catch (e) { notify(e.message, 'err'); } setBusy(false); };
  const total = found ? found.media.length + found.audio.length : 0; const size = found ? [...found.media, ...found.audio].reduce((a, f) => a + f.size, 0) : 0;
  const clean = async () => { if (!confirm(`Delete ${total} unreferenced files (${mb(size)})? This cannot be undone.`)) return; setBusy(true); try { await admin.removeOrphans(found); notify('Storage cleaned'); setFound(null); } catch (e) { notify(e.message, 'err'); } setBusy(false); };
  return (<div className="panel"><h3>Storage clean-up</h3><p className="muted">Finds files that no profile, post, photo or card refers to any more (older than 2 hours). Deleting rows in SQL never frees storage, so this is the safety net.</p>
    <div className="acts"><button className="primary" disabled={busy} onClick={scan}>{busy ? 'Working…' : 'Scan for orphans'}</button>{found && total > 0 && <button className="ghost danger" disabled={busy} onClick={clean}>Delete {total} files ({mb(size)})</button>}</div>
    {found && <p className={total ? 'note' : 'okmsg'}>{total ? `${found.media.length} images and ${found.audio.length} audio files are unreferenced (${mb(size)}).` : 'Nothing to clean up.'}</p>}</div>);
}

function Log() {
  const [rows, setRows] = useState(null); useEffect(() => { admin.log().then(setRows).catch(() => setRows([])); }, []);
  return !rows ? <div className="boot">Loading…</div> : !rows.length ? <p className="empty">No admin actions yet.</p> : (<div className="panel alog">{rows.map((r, i) => <p key={i}><small>{new Date(r.created_at).toLocaleString('ro-RO')}</small> <b>{r.action.replace(/_/g, ' ')}</b> <span className="muted">{r.details?.place ? `“${r.details.place}”${r.details.reason_code ? ` · ${r.details.reason_code}` : ''}` : r.details?.username ? `@${r.details.username}` : r.target}</span></p>)}</div>);
}

export default function AdminView({ go, notify, role }) {
  const [tab, setTab] = useState('reports'); const [stats, setStats] = useState(null);
  const tabs = role === 'admin' ? ['reports', 'users', 'emails', 'storage', 'log'] : ['reports', 'log'];     // moderators: reports + log only (display; the database enforces it)
  const refresh = () => { if (role === 'admin') admin.stats().then(setStats).catch(() => {}); }; useEffect(() => { refresh(); }, [role]);
  return (<div className="plain wide view"><div className="phead"><h2 className="ptitle">Admin</h2><small>Signed in as {role === 'admin' ? 'an administrator' : 'a moderator'}. Every action is logged.</small></div>
    {stats && <div className="stats4">{Object.entries(stats).map(([k, v]) => <div key={k} className={k === 'open_reports' && v > 0 ? 'hot' : ''}><b>{v}</b><small>{k.replace(/_/g, ' ')}</small></div>)}</div>}
    <div className="tabs">{tabs.map((t) => { const Ic = TAB_ICONS[t]; return <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}><Ic size={16} weight={tab === t ? 'fill' : 'bold'} aria-hidden="true" />{t}</button>; })}</div>
    {tab === 'reports' && <Reports go={go} notify={notify} refresh={refresh} role={role} />}{tab === 'users' && role === 'admin' && <Users go={go} notify={notify} refresh={refresh} />}{tab === 'emails' && role === 'admin' && <Emails notify={notify} />}{tab === 'storage' && role === 'admin' && <Storage notify={notify} />}{tab === 'log' && <Log />}</div>);
}
