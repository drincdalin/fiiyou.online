import { MUSIC_CONFIG as CFG } from './musicConfig.js';

/* Small YouTube helpers: link parsing, thumbnails, the IFrame API loader. Safe to import anywhere (nothing touches the network until called). */

const ID = /^[\w-]{11}$/;

/** The 11-character video id of any YouTube link (watch, youtu.be, shorts, live, embed, music., m., nocookie), or null. */
export function parseYouTubeId(input) {
  if (typeof input !== 'string') return null;
  let u; try { u = new URL(input.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
    id = m ? m[1] : (u.pathname === '/watch' ? u.searchParams.get('v') : null);
  }
  return ID.test(id || '') ? id : null;
}

/** True for any youtube.com / youtu.be / youtube-nocookie.com address, valid video or not: such a link must never be handed to an <audio> tag. */
export function isYouTubeHost(input) {
  try { return /^(youtu\.be|youtube\.com|youtube-nocookie\.com)$/.test(new URL(String(input).trim()).hostname.toLowerCase().replace(/^(www|m|music)\./, '')); } catch { return false; }
}

/** 83 -> "1:23", 3725 -> "1:02:05". Anything that is not a finite number reads as 0:00. */
export function fmtTime(s) {
  const t = Number.isFinite(s) && s > 0 ? Math.floor(s) : 0;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Thumbnail url. quality: maxresdefault (1280x720, not always there) | sddefault (640x480) | hqdefault (480x360, always there) | mqdefault (320x180). */
export const ytThumb = (id, quality = 'hqdefault') => `https://i.ytimg.com/vi/${id}/${quality}.jpg`;

/** "Daft Punk - Topic" / "ArtistVEVO" -> "Daft Punk" / "Artist". */
export function cleanArtist(a) {
  return String(a || '').replace(/\s*-\s*Topic$/i, '').replace(/\s*VEVO$/i, '').replace(/\s+/g, ' ').trim();
}

/* The best cover that really exists. YouTube answers a missing maxresdefault with a 120x90 grey placeholder (HTTP 200), so size is the test.
   `lb` = letterboxed 4:3 frame (black bars top and bottom) that the UI zooms into a square. */
const COVERS = [['maxresdefault', false], ['sddefault', true], ['hqdefault', true]];
const coverCache = new Map();
function tryImage(url) {
  return new Promise((resolve) => {
    const img = new Image(); img.decoding = 'async';
    img.onload = () => resolve(img.naturalWidth > 120 ? img.naturalWidth : 0);
    img.onerror = () => resolve(0);
    img.src = url;
  });
}
/** Resolves { url, lb } for a video id. Cached per id, never rejects (falls back to the always-present hqdefault). */
export function probeYtCover(id) {
  if (!ID.test(id || '')) return Promise.resolve(null);
  if (!coverCache.has(id)) {
    coverCache.set(id, (async () => {
      for (const [q, lb] of COVERS) { if (await tryImage(ytThumb(id, q))) return { url: ytThumb(id, q), lb }; }
      return { url: ytThumb(id, 'hqdefault'), lb: true };
    })());
  }
  return coverCache.get(id);
}

/* The IFrame API: one script tag, one promise. A failed load (ad blocker, offline) clears itself so the next attempt starts fresh. */
let apiPromise = null;
export function loadYouTubeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    let script; let timer = 0;
    const fail = (why) => { clearTimeout(timer); apiPromise = null; if (script) script.remove(); window.onYouTubeIframeAPIReady = prev; reject(new Error(why)); };
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); try { if (typeof prev === 'function') prev(); } catch { /* someone else's callback */ } resolve(window.YT); };
    script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
    script.onerror = () => fail('YouTube API blocked');
    timer = setTimeout(() => fail('YouTube API timed out'), CFG.apiTimeoutMs);
    document.head.appendChild(script);
  });
  return apiPromise;
}
