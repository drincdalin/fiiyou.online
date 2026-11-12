import { isYouTubeHost, parseYouTubeId } from './youtube.js';

/* The queue as plain data + pure functions (no React, no DOM), so the rules for shuffle / repeat / "play next" are unit-tested.
   state = { queue: Track[], cursor, shuffle, repeat: 'off'|'all'|'one', played: qid[], trail: qid[], up: qid[] }
     played = tracks already heard in this shuffle round (a shuffle plays everything once before repeating)
     trail  = where we came from, so "previous" in shuffle goes back to the real previous song
     up     = tracks the listener asked to hear next ("play next"), consumed first when shuffle is on */

let seq = 0;
const STR = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const URLISH = /^(https:|blob:)/i;

/** A playable track from { src, title, artist, cover, key }, or null when src is neither a YouTube link nor an https audio url.
 *  Accepts an existing track too (re-wrapped with a fresh qid, so the same song can sit in the queue twice).
 *  key = identity of "the same song": the video id for YouTube, `key` for uploaded audio (its signed url changes every time), else the url. */
export function makeTrack(x, origin = 'app') {
  if (!x || typeof x !== 'object') return null;
  const src = STR(x.src, 2048); if (!src) return null;
  const videoId = parseYouTubeId(src);
  if (!videoId && (!URLISH.test(src) || isYouTubeHost(src))) return null;
  return {
    qid: `q${++seq}`,
    key: videoId ? `yt:${videoId}` : (STR(x.key, 512) || src),
    kind: videoId ? 'yt' : 'audio',
    src, videoId: videoId || '',
    title: STR(x.title, 160), artist: STR(x.artist, 160),
    cover: URLISH.test(x.cover || '') ? x.cover : '',
    origin,
  };
}

export const emptyQueue = (o = {}) => ({ queue: [], cursor: -1, shuffle: !!o.shuffle, repeat: ['all', 'one'].includes(o.repeat) ? o.repeat : 'off', played: [], trail: [], up: [] });
export const currentOf = (s) => (s.cursor >= 0 && s.cursor < s.queue.length ? s.queue[s.cursor] : null);

const idx = (s, qid) => s.queue.findIndex((t) => t.qid === qid);
const TRAIL_MAX = 100;

export function reduce(s, a) {
  switch (a.type) {
    case 'set': {
      const queue = a.tracks.slice(); if (!queue.length) return emptyQueue(s);
      const cursor = Math.min(Math.max(a.start | 0, 0), queue.length - 1);
      return { ...s, queue, cursor, played: [queue[cursor].qid], trail: [], up: [] };
    }
    case 'add': {
      if (!a.tracks.length) return s;
      const queue = [...s.queue, ...a.tracks]; const cursor = s.cursor < 0 ? 0 : s.cursor;
      return { ...s, queue, cursor, played: s.cursor < 0 ? [queue[0].qid] : s.played };
    }
    case 'next-up': {
      if (!a.tracks.length) return s;
      if (s.cursor < 0) return reduce(s, { type: 'add', tracks: a.tracks });
      const at = Math.min(s.queue.length, s.cursor + 1 + s.up.filter((q) => idx(s, q) >= 0).length);   // behind earlier "play next" picks, in the order they were chosen
      const queue = [...s.queue.slice(0, at), ...a.tracks, ...s.queue.slice(at)];
      return { ...s, queue, up: [...s.up, ...a.tracks.map((t) => t.qid)] };
    }
    case 'goto': {
      if (a.index < 0 || a.index >= s.queue.length || a.index === s.cursor) return s;
      const from = currentOf(s); const to = s.queue[a.index];
      if (a.dir === 'prev') { const k = s.trail.lastIndexOf(to.qid); return { ...s, cursor: a.index, trail: k < 0 ? s.trail : s.trail.slice(0, k) }; }
      return { ...s, cursor: a.index, trail: from ? [...s.trail, from.qid].slice(-TRAIL_MAX) : s.trail, played: s.played.includes(to.qid) ? s.played : [...s.played, to.qid], up: s.up.filter((q) => q !== to.qid) };
    }
    case 'remove': {
      const i = idx(s, a.qid); if (i < 0) return s;
      const queue = s.queue.filter((t) => t.qid !== a.qid); if (!queue.length) return emptyQueue(s);
      const cursor = i < s.cursor ? s.cursor - 1 : Math.min(s.cursor, queue.length - 1);   // removing the playing song leaves the cursor on whatever slid into its place
      const keep = (q) => q !== a.qid;
      return { ...s, queue, cursor, played: s.played.filter(keep), trail: s.trail.filter(keep), up: s.up.filter(keep) };
    }
    case 'clear-upcoming': { const c = currentOf(s); return c ? { ...s, queue: [c], cursor: 0, played: [c.qid], trail: [], up: [] } : s; }
    case 'clear': return emptyQueue(s);
    case 'shuffle': { const c = currentOf(s); return { ...s, shuffle: !!a.on, played: c ? [c.qid] : [], trail: [] }; }
    case 'repeat': return { ...s, repeat: a.mode === 'all' || a.mode === 'one' ? a.mode : 'off' };
    default: return s;
  }
}

/** Index to play after the current song, or -1 for "nothing next".
 *  auto = the song ended by itself (repeat-one then replays it) as opposed to the listener pressing Next (which always moves on).
 *  Returns s.cursor itself when the same song should play again. */
export function pickNext(s, rng = Math.random, { auto = false } = {}) {
  const n = s.queue.length; if (!n || s.cursor < 0) return -1;
  if (auto && s.repeat === 'one') return s.cursor;
  if (!s.shuffle) {
    if (s.cursor + 1 < n) return s.cursor + 1;
    return s.repeat === 'all' ? 0 : -1;   // with one song, 0 === cursor, i.e. it loops
  }
  for (const q of s.up) { const i = idx(s, q); if (i >= 0 && i !== s.cursor) return i; }
  const unheard = []; for (let i = 0; i < n; i++) if (i !== s.cursor && !s.played.includes(s.queue[i].qid)) unheard.push(i);
  if (unheard.length) return unheard[Math.floor(rng() * unheard.length) % unheard.length];
  if (s.repeat !== 'all') return -1;
  if (n === 1) return s.cursor;
  const others = []; for (let i = 0; i < n; i++) if (i !== s.cursor) others.push(i);   // new round: everything is fair game again except what is playing
  return others[Math.floor(rng() * others.length) % others.length];
}

/** Index to play on "previous", or -1 (the caller then just restarts the song). */
export function pickPrev(s) {
  if (!s.queue.length || s.cursor < 0) return -1;
  if (s.shuffle) { for (let k = s.trail.length - 1; k >= 0; k--) { const i = idx(s, s.trail[k]); if (i >= 0) return i; } return -1; }
  if (s.cursor > 0) return s.cursor - 1;
  return s.repeat === 'all' && s.queue.length > 1 ? s.queue.length - 1 : -1;
}
