import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, ArrowBendUpLeft, CaretDown, CaretUp, Trash, PaperPlaneRight, X } from '@phosphor-icons/react';
import { posts } from '../index.js';
import { Avatar, Rich, ago, useImages } from './shared.jsx';
import { ask } from './dialog.jsx';
import MentionInput from './MentionInput.jsx';

/** Comment thread of one post: likes, replies (one level deep) and @mentions. Used inside PostCard.
 *  Props: postId, postAuthorId (the post author may delete any comment), me, go(view, arg), notify, fail(err) (error toast),
 *  onDelta(n) (comment_count changed by n), onTag(tag). */
export default function Comments({ postId, postAuthorId, me, go, notify, fail, onDelta, onTag }) {
  const [rows, setRows] = useState(null); const [text, setText] = useState(''); const [reply, setReply] = useState(null); const [busy, setBusy] = useState(false);
  const [openT, setOpenT] = useState(() => new Set());   // threads with more than 2 replies start collapsed
  const field = useRef(null);
  const load = useCallback(() => posts.listComments(postId).then(setRows).catch(() => setRows((x) => x || [])), [postId]);
  useEffect(() => { load(); }, [load]);
  const img = useImages((rows || []).map((c) => c.author?.avatar_path));

  const { roots, kids } = useMemo(() => {
    const k = {}; const r = [];
    for (const c of rows || []) { if (c.parent_id) (k[c.parent_id] ||= []).push(c); else r.push(c); }
    return { roots: r, kids: k };
  }, [rows]);
  const byId = useMemo(() => new Map((rows || []).map((c) => [c.id, c])), [rows]);

  const patch = (id, p) => setRows((x) => x.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const like = async (c) => {
    const on = !c.liked; patch(c.id, { liked: on, like_count: Math.max(0, c.like_count + (on ? 1 : -1)) });
    try { await posts.setCommentLike(c.id, on); } catch (e) { patch(c.id, { liked: c.liked, like_count: c.like_count }); fail(e); }
  };
  const startReply = (c) => {
    setReply({ id: c.id, username: c.author.username });
    setText((t) => (t.trim() ? t : `@${c.author.username} `));
    requestAnimationFrame(() => field.current?.focus());
  };
  const send = async (e) => {
    e.preventDefault(); const body = text.trim(); if (!body || busy) return;
    setBusy(true);
    try {
      await posts.addComment(postId, body, reply?.id);
      if (reply) { const root = byId.get(reply.id)?.parent_id || reply.id; setOpenT((x) => new Set(x).add(root)); }   // show the reply that was just sent
      setText(''); setReply(null); await load(); onDelta?.(1); }
    catch (er) { fail(er); } finally { setBusy(false); }
  };
  const del = async (c) => {
    if (!(await ask({ title: 'Delete this comment?', message: (kids[c.id]?.length ? 'Its replies will be deleted too. ' : '') + 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    const gone = 1 + (kids[c.id]?.length || 0);   // deleting a thread root removes its replies
    try { await posts.deleteComment(c.id); if (reply?.id === c.id) setReply(null); await load(); onDelta?.(-gone); notify('Comment deleted'); } catch (e) { fail(e); }
  };

  const item = (c, isReply) => {
    const to = isReply && c.reply_to && c.reply_to !== c.parent_id ? byId.get(c.reply_to)?.author : null;   // answered another reply: name them
    const canDel = c.author.id === me.id || postAuthorId === me.id;
    const n = kids[c.id]?.length || 0; const shown = n <= 2 || openT.has(c.id);
    return (<li key={c.id} className="cm">
      <button type="button" className="cmav" aria-label={`Open ${c.author.display_name}'s profile`} onClick={() => go('profile', c.author.username)}><Avatar src={img[c.author.avatar_path]} size={isReply ? 26 : 32} /></button>
      <div className="cmmain">
        <div className="cmbubble">
          <div className="cmhead">
            <button type="button" className="ulink cmname" onClick={() => go('profile', c.author.username)}><b>{c.author.display_name}</b></button>
            {c.author.id === postAuthorId && <span className="cmop">Author</span>}
            <small className="cmmeta">@{c.author.username} · {ago(c.created_at)}</small>
            {canDel && <button type="button" className="cmdel" aria-label="Delete comment" title="Delete comment" onClick={() => del(c)}><Trash size={14} weight="bold" aria-hidden="true" /></button>}
          </div>
          <p className="cmtext"><Rich text={c.body} onUser={(u) => go('profile', u)} onTag={onTag} /></p>
        </div>
        <div className="cmactions">
          <button type="button" className={c.liked ? 'on' : ''} aria-pressed={c.liked} aria-label={c.liked ? 'Unlike comment' : 'Like comment'} onClick={() => like(c)}>
            <Heart size={15} weight={c.liked ? 'fill' : 'bold'} aria-hidden="true" />{c.like_count > 0 ? c.like_count : 'Like'}</button>
          <button type="button" onClick={() => startReply(c)}><ArrowBendUpLeft size={15} weight="bold" aria-hidden="true" />Reply</button>
          {to && <small className="cmto">to @{to.username}</small>}
        </div>
        {!isReply && n > 2 && <button type="button" className="cmmore" aria-expanded={shown}
          onClick={() => setOpenT((x) => { const y = new Set(x); if (y.has(c.id)) y.delete(c.id); else y.add(c.id); return y; })}>
          {shown ? <CaretUp size={12} weight="bold" aria-hidden="true" /> : <CaretDown size={12} weight="bold" aria-hidden="true" />}{shown ? 'Hide replies' : `View ${n} replies`}</button>}
        {!isReply && n > 0 && shown && <ul className="cmreplies">{kids[c.id].map((r) => item(r, true))}</ul>}
      </div>
    </li>);
  };

  return (<div className="comments">
    <div className="cmtop"><b>Comments</b><span className="cmcount">{rows ? rows.length : '…'}</span></div>
    {rows === null ? <div className="boot cmload">…</div> : !rows.length ? <p className="cmempty">No comments yet. Start the conversation.</p>
      : <ul className="cmlist">{roots.map((c) => item(c, false))}</ul>}
    {reply && <div className="cmreplying"><span>Replying to @{reply.username}</span>
      <button type="button" aria-label="Cancel reply" onClick={() => setReply(null)}><X size={14} weight="bold" aria-hidden="true" /></button></div>}
    <form className="inline cmform" onSubmit={send}>
      <MentionInput inputRef={field} value={text} maxLength={500} placeholder="Write a comment… use @ to mention" onChange={(e) => setText(e.target.value)} />
      <button className="primary sm" disabled={busy || !text.trim()}><PaperPlaneRight size={14} weight="bold" aria-hidden="true" />Send</button>
    </form>
  </div>);
}
