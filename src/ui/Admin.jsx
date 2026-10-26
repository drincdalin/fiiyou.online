import { useEffect, useState } from 'react';
import { admin } from '../index.js';
import { useImages, Avatar, ago } from './shared.jsx';
import { Flag, UsersThree, HardDrives, ClipboardText } from '@phosphor-icons/react';

const TAB_ICONS = { reports: Flag, users: UsersThree, storage: HardDrives, log: ClipboardText };

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

function Reports({ go, notify, refresh }) {
  const [status, setStatus] = useState('open'); const [rows, setRows] = useState(null);
  const load = () => admin.reports(status).then(setRows).catch((e) => { notify(e.message, 'err'); setRows([]); }); useEffect(() => { setRows(null); load(); }, [status]);
  const img = useImages((rows || []).flatMap((r) => [r.preview?.image_path, r.preview?.avatar_path]));
  const run = async (fn, msg) => { try { await fn(); notify(msg); await load(); refresh(); } catch (e) { notify(e.message || 'Failed', 'err'); } };
  const delAccount = (id, name) => { if (prompt(`Type "${name}" to permanently delete this account, its files and everything it owns.`) === name) run(() => admin.deleteUser(id), 'Account deleted'); };
  return (<>
    <div className="tabs">{['open', 'reviewed', 'dismissed'].map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s}</button>)}</div>
    {!rows ? <div className="boot">Loading…</div> : !rows.length ? <p className="empty">Nothing here.</p> : rows.map((r) => { const p = r.preview; return (
      <article className="panel arep" key={r.id}>
        <header><span className="badge">{r.target_type.replace('_', ' ')}</span><small>reported by @{r.reporter_username || '?'} · {ago(r.created_at)}</small></header>
        <p className="reason">“{r.reason}”</p>
        {!p ? <p className="muted">The reported item no longer exists.</p> : <div className="aprev">
          {p.avatar_path && img[p.avatar_path] && <Avatar src={img[p.avatar_path]} size={48} />}
          <div>{p.display_name && <b>{p.display_name}</b>} <span className="muted">@{p.author}</span>{p.body && <p className="pre">{p.title ? `${p.title}: ` : ''}{p.body}</p>}
            {p.image_path && img[p.image_path] && <img className="athumb" src={img[p.image_path]} alt="" />}</div></div>}
        <div className="acts">
          {p && <button className="ghost sm" onClick={() => go('profile', p.author)}>Open profile</button>}
          {p && r.target_type !== 'profile' && <button className="ghost sm danger" onClick={() => confirm('Delete this content?') && run(async () => { r.target_type === 'post' ? await admin.deletePost(r.target_id) : await admin.deleteComment(r.target_type, r.target_id); await admin.setReport(r.id, 'reviewed'); }, 'Content deleted')}>Delete content</button>}
          {p && <button className="ghost sm danger" onClick={() => delAccount(p.author_id, p.author)}>Delete account</button>}
          {status === 'open' && <><button className="primary sm" onClick={() => run(() => admin.setReport(r.id, 'reviewed'), 'Marked reviewed')}>Mark reviewed</button><button className="ghost sm" onClick={() => run(() => admin.setReport(r.id, 'dismissed'), 'Dismissed')}>Dismiss</button></>}
          {status !== 'open' && <button className="ghost sm" onClick={() => run(() => admin.setReport(r.id, 'open'), 'Reopened')}>Reopen</button>}
        </div></article>); })}
  </>);
}

function Users({ go, notify, refresh }) {
  const [q, setQ] = useState(''); const [rows, setRows] = useState([]);
  const load = () => admin.searchUsers(q).then(setRows).catch((e) => notify(e.message, 'err')); useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);
  const img = useImages(rows.map((u) => u.avatar_path));
  const verify = async (u) => { try { await admin.setVerified(u.id, !u.verified); notify(u.verified ? 'Verification removed' : 'Profile verified'); load(); refresh(); } catch (e) { notify(e.message, 'err'); } };
  const del = async (u) => { if (prompt(`Type "${u.username}" to permanently delete this account, its files and everything it owns.`) !== u.username) return; try { await admin.deleteUser(u.id); notify('Account deleted'); load(); refresh(); } catch (e) { notify(e.message, 'err'); } };
  return (<><input placeholder="Search username or display name (empty = newest)" value={q} onChange={(e) => setQ(e.target.value)} />
    {rows.map((u) => (<div className="row" key={u.id}><Avatar src={img[u.avatar_path]} size={44} />
      <button className="link" onClick={() => go('profile', u.username)}><span>{u.display_name}{u.verified && <em className="badge vb">Verified</em>}</span><small>@{u.username} · joined {new Date(u.created_at).toLocaleDateString('ro-RO')} · {u.post_count} posts{u.open_reports > 0 ? ` · ${u.open_reports} open reports` : ''}</small></button>
      <span className="acts"><button className={u.verified ? 'ghost sm' : 'primary sm'} onClick={() => verify(u)}>{u.verified ? 'Unverify' : 'Verify'}</button><button className="ghost sm danger" onClick={() => del(u)}>Delete</button></span></div>))}</>);
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
  return !rows ? <div className="boot">Loading…</div> : !rows.length ? <p className="empty">No admin actions yet.</p> : (<div className="panel alog">{rows.map((r, i) => <p key={i}><small>{new Date(r.created_at).toLocaleString('ro-RO')}</small> <b>{r.action.replace(/_/g, ' ')}</b> <span className="muted">{r.details?.username ? `@${r.details.username}` : r.target}</span></p>)}</div>);
}

export default function AdminView({ go, notify }) {
  const [tab, setTab] = useState('reports'); const [stats, setStats] = useState(null);
  const refresh = () => admin.stats().then(setStats).catch(() => {}); useEffect(() => { refresh(); }, []);
  return (<div className="plain wide view"><div className="phead"><h2 className="ptitle">Admin</h2><small>Signed in as an administrator. Every action is logged.</small></div>
    {stats && <div className="stats4">{Object.entries(stats).map(([k, v]) => <div key={k} className={k === 'open_reports' && v > 0 ? 'hot' : ''}><b>{v}</b><small>{k.replace(/_/g, ' ')}</small></div>)}</div>}
    <div className="tabs">{['reports', 'users', 'storage', 'log'].map((t) => { const Ic = TAB_ICONS[t]; return <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}><Ic size={16} weight={tab === t ? 'fill' : 'bold'} aria-hidden="true" />{t}</button>; })}</div>
    {tab === 'reports' && <Reports go={go} notify={notify} refresh={refresh} />}{tab === 'users' && <Users go={go} notify={notify} refresh={refresh} />}{tab === 'storage' && <Storage notify={notify} />}{tab === 'log' && <Log />}</div>);
}
