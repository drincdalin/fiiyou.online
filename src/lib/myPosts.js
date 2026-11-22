// Small pure helpers for the "Your posts" screen (kept out of the component so they can be tested).

export const KIND_LABEL = { status: 'Post', ask: 'Question', event: 'Event' };

/** First line(s) of a post as plain text, cut at a word where it can be. */
export function excerpt(text, max = 140) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max); const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

/** The screen's filter choices -> the arguments of posts.myPosts(). */
export function filterParams({ kind = null, friendsOnly = false, q = '' } = {}) {
  return { kind: kind || null, visibility: friendsOnly ? 'friends' : null, q: String(q || '').trim() || null };
}

/** "1 post", "12 posts", "No posts". */
export const countLabel = (n, one = 'post', many = `${one}s`) => (n === 0 ? `No ${many}` : `${n} ${n === 1 ? one : many}`);

/** Which posts a "Select all" covers: every id currently shown. */
export const allIds = (rows) => (rows || []).map((r) => r.id);
