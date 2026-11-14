import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MUSIC_CONFIG as CFG } from '../lib/musicConfig.js';
import { cleanArtist, loadYouTubeApi, ytThumb } from '../lib/youtube.js';
import { createYouTubeEngine } from '../lib/playerEngines.js';
import { createClock } from '../lib/playerClock.js';
import { currentOf, emptyQueue, makeTrack, pickNext, pickPrev, reduce } from '../lib/playerQueue.js';

/* ------------------------------------------------------------------------------------------------------------------------------
   Global music player.

   Mount <MusicPlayerProvider> once (src/ui/main.jsx) and render <MusicDock /> inside it. From anywhere:

     const mp = useMusicPlayer();
     mp.play({ src: 'https://youtu.be/dQw4w9WgXcQ', title, artist, cover })     // starts it (a second call with the same song pauses/resumes)
     mp.play([trackA, trackB, trackC], { startIndex: 1 })                        // a whole queue
     mp.enqueue(track)   mp.playNext(track)   mp.toggle()   mp.next()   mp.prev()   mp.seek(90)   mp.setVolume(0.5)
     mp.current   mp.playing   mp.status   mp.queue   mp.shuffle   mp.repeat   ...

   useMusicPlayer() re-renders when track / status / queue change (rare). The playhead (position, 4 times a second) lives in
   useMusicClock(), so only seek bars re-render while a song plays. Use useMusicActions() when you only need the (stable) functions.
   ------------------------------------------------------------------------------------------------------------------------------ */

const StateCtx = createContext(null);
const ActionsCtx = createContext(null);
const ClockCtx = createContext(null);

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(CFG.storageKey) || '{}') || {}; } catch { return {}; } };
const writePrefs = (p) => { try { localStorage.setItem(CFG.storageKey, JSON.stringify(p)); } catch { /* private mode / storage full: the player still works */ } };
const toTracks = (input) => (Array.isArray(input) ? input : [input]).map((x) => makeTrack(x)).filter(Boolean);
const LIVE = ['loading', 'buffering', 'playing'];

/** All playback logic. Plain closures over one mutable object (R.current), so every action is stable and can be called from any event handler,
 *  including a tap handler: phones only allow sound to start inside the tap, so loading must happen right there, not in a later effect. */
function makeController({ R, clock, S, mountRef }) {
  const cur = () => currentOf(R.current.q);
  const dispatch = (a) => { const n = reduce(R.current.q, a); R.current.q = n; S.setQ(n); return n; };
  const status = (s) => { R.current.status = s; S.setStatus(s); };
  const want = (w) => { R.current.want = w; S.setWant(w); };
  const engineFor = (kind) => (kind === 'yt' ? R.current.yt : null);   // YouTube is the only engine: uploaded / direct audio was removed
  const pauseAll = () => { const r = R.current; if (r.yt) r.yt.pause(); };

  const getEngine = () => {
    const r = R.current;
    if (!r.yt) { r.yt = createYouTubeEngine({ container: mountRef.current, host: CFG.host, origin: location.origin, blockedMs: CFG.blockedMs, emit: (e) => onEngine('yt', e) }); r.yt.setVolume(r.volume); r.yt.setMuted(r.muted); }
    return r.yt;
  };

  const seekTo = (sec) => {
    const t = cur(); const r = R.current; if (!t || r.loaded !== t.qid) return;
    const d = clock.get().duration; const v = Math.max(0, d > 0 ? Math.min(sec, d) : sec);
    const e = engineFor(t.kind); if (e) e.seek(v); clock.set({ position: v });
  };

  /** Start a track. autoplay=false only SELECTS it (nothing is loaded, so nothing is requested from YouTube until play is pressed). */
  const loadTrack = (t, autoplay) => {
    if (!t) return;
    const r = R.current; r.cancelAutoplay = false; clearTimeout(r.skipTimer);
    clock.set({ position: 0, duration: 0, buffered: 0 }); S.setError(null);
    if (!autoplay) { r.loaded = null; pauseAll(); want(false); status('paused'); return; }
    r.loaded = t.qid; want(true); status('loading'); S.setLoadTick((n) => n + 1);
    getEngine().load(t, { autoplay: true }).catch((e) => {
      if (R.current.loaded !== t.qid || /destroyed/.test(String(e && e.message))) return;
      want(false); status('error');
      S.setError({ message: "Couldn't reach YouTube. Check your connection or ad blocker, then try again.", skip: false });
    });
  };

  const advance = (dir, auto = false) => {
    const r = R.current; const s = r.q; const c = cur(); if (!c) return;
    const i = dir === 'next' ? pickNext(s, Math.random, { auto }) : pickPrev(s);
    if (i < 0) { if (dir === 'next' && auto) { want(false); status('ended'); clock.set({ position: 0 }); } else seekTo(0); return; }
    if (i === s.cursor) { if (r.loaded !== c.qid) return loadTrack(c, true); seekTo(0); want(true); const e = engineFor(c.kind); if (e) e.play(); return; }   // repeat-one / a one-song loop
    const n = dispatch({ type: 'goto', index: i, dir }); loadTrack(currentOf(n), true);
  };

  const isPlaying = () => R.current.want && LIVE.includes(R.current.status);

  const pause = () => {
    const t = cur(); if (!t) return; const r = R.current;
    want(false); if (r.status === 'loading') r.cancelAutoplay = true;   // pressed pause while it was still starting: stop it the moment it does
    const e = engineFor(t.kind); if (e) e.pause();
    if (r.status === 'loading' || r.status === 'buffering') status('paused');
  };

  const resume = () => {
    const t = cur(); if (!t) return; const r = R.current; r.cancelAutoplay = false;
    if (r.loaded !== t.qid || r.status === 'error') return loadTrack(t, true);
    const was = r.status; want(true);
    if (was === 'paused' || was === 'ended' || was === 'blocked') status('buffering');
    const e = engineFor(t.kind); if (!e) return loadTrack(t, true);
    if (was === 'ended') e.seek(0);
    e.play();
  };

  const toggle = () => (isPlaying() ? pause() : resume());

  const stopAll = () => {
    const r = R.current; clearTimeout(r.skipTimer); r.loaded = null; want(false); status('idle'); S.setError(null);
    if (r.yt) r.yt.stop();
    clock.set({ position: 0, duration: 0, buffered: 0 }); S.setExpanded(false); S.setVideoOpen(false);
  };

  /** Everything the engines tell us ends up here. Events from an engine that is not the current track's are stale and ignored. */
  function onEngine(kind, e) {
    const r = R.current; const t = cur(); if (!t || t.kind !== kind) return;
    if (e.type === 'status') {
      switch (e.status) {
        case 'playing': {
          if (r.cancelAutoplay) { r.cancelAutoplay = false; const en = engineFor(kind); if (en) en.pause(); return; }
          r.failures = 0; want(true); status('playing'); S.setError(null); break;
        }
        case 'buffering': if (r.want) status('buffering'); break;
        case 'paused': want(false); status('paused'); break;      // also when the viewer pauses inside the video view
        case 'cued': if (!r.want) status('paused'); break;
        case 'ended': {
          const s = r.q; const i = pickNext(s, Math.random, { auto: true });
          if (i < 0) { want(false); status('ended'); clock.set({ position: 0 }); break; }
          if (i === s.cursor) { seekTo(0); const en = engineFor(kind); if (en) en.play(); break; }
          loadTrack(currentOf(dispatch({ type: 'goto', index: i, dir: 'next' })), true); break;
        }
        case 'blocked':   // the browser refused to start with sound: open the real player so one tap on it (a genuine gesture) starts playback
          want(false); status('blocked');
          if (kind === 'yt') { S.setExpanded(true); S.setVideoOpen(true); }
          break;
        default: break;
      }
    } else if (e.type === 'meta') {
      if (e.duration > 0) clock.set({ duration: e.duration });
      if (e.title || e.artist) S.setMeta((m) => (m[t.qid] ? m : { ...m, [t.qid]: { title: e.title, artist: cleanArtist(e.artist) } }));
    } else if (e.type === 'error') {
      want(false); status('error'); S.setError({ message: e.message, skip: !!e.skip });
      if (e.skip && r.q.queue.length > 1 && r.failures < r.q.queue.length - 1) {   // a removed / blocked video: move on, but never loop forever when everything fails
        r.failures += 1; clearTimeout(r.skipTimer); const qid = t.qid;
        r.skipTimer = setTimeout(() => { if (R.current.loaded === qid && R.current.status === 'error') advance('next', false); }, 1600);
      }
    }
  }

  const setMuted = (m) => { const r = R.current; r.muted = !!m; if (r.yt) r.yt.setMuted(r.muted); S.setMuted(r.muted); };
  const setVolume = (v) => { const r = R.current; r.volume = clamp01(v); if (r.yt) r.yt.setVolume(r.volume); S.setVolume(r.volume); if (r.muted && r.volume > 0) setMuted(false); };

  const actions = {
    /** Play a track (or an array = a new queue). The same song that is already loaded just toggles. Returns false when the link is not playable. */
    play(input, opts = {}) {
      const list = toTracks(input); if (!list.length) return false;
      const c = cur();
      if (list.length === 1 && c && c.key === list[0].key && R.current.loaded === c.qid) { toggle(); return true; }
      loadTrack(currentOf(dispatch({ type: 'set', tracks: list, start: opts.startIndex || 0 })), true); return true;
    },
    toggle, pause, resume,
    next: () => advance('next', false),
    prev: () => { if (clock.get().position > 3) seekTo(0); else advance('prev'); },
    seek: seekTo,
    seekBy: (d) => seekTo(clock.get().position + d),
    setVolume, setMuted, toggleMute: () => setMuted(!R.current.muted),
    /** Add to the end of the queue. With nothing playing it only selects the track (nothing loads until play). Returns how many were added. */
    enqueue(input) {
      const list = toTracks(input); if (!list.length) return 0; const first = R.current.q.cursor < 0;
      dispatch({ type: 'add', tracks: list }); if (first) { R.current.loaded = null; want(false); status('paused'); } return list.length;
    },
    playNext(input) {
      const list = toTracks(input); if (!list.length) return 0; const first = R.current.q.cursor < 0;
      dispatch({ type: 'next-up', tracks: list }); if (first) { R.current.loaded = null; want(false); status('paused'); } return list.length;
    },
    jump(qid) {
      const s = R.current.q; const i = s.queue.findIndex((t) => t.qid === qid); if (i < 0) return;
      if (i === s.cursor) return toggle();
      loadTrack(currentOf(dispatch({ type: 'goto', index: i, dir: 'next' })), true);
    },
    remove(qid) {
      const before = cur(); const n = dispatch({ type: 'remove', qid }); const after = currentOf(n);
      if (!after) return stopAll();
      if (before && before.qid === qid) loadTrack(after, R.current.want);
    },
    clearUpcoming: () => { dispatch({ type: 'clear-upcoming' }); },
    stop() { dispatch({ type: 'clear' }); stopAll(); },
    toggleShuffle: () => { dispatch({ type: 'shuffle', on: !R.current.q.shuffle }); },
    cycleRepeat: () => { const m = R.current.q.repeat; dispatch({ type: 'repeat', mode: m === 'off' ? 'all' : m === 'all' ? 'one' : 'off' }); },
    retry() { const t = cur(); if (t) loadTrack(t, true); },
    /** Warm up the YouTube API (called when a play button is pressed down, one step before the click). Never called on page load. */
    preload: () => { loadYouTubeApi().catch(() => {}); },
    setExpanded: (v) => S.setExpanded(!!v),
    setVideoOpen: (v) => S.setVideoOpen(!!v),
    setVinyl: (v) => S.setVinyl(!!v),
  };

  return { actions, destroy() { const r = R.current; clearTimeout(r.skipTimer); if (r.yt) r.yt.destroy(); r.yt = null; } };
}

const INERT_SNAP = { position: 0, duration: 0, buffered: 0 };   // one object: useSyncExternalStore loops forever if getSnapshot returns a fresh one each call
const inertClock = { get: () => INERT_SNAP, subscribe: () => () => {} };
const IDLE = { current: null, queue: [], index: -1, shuffle: false, repeat: 'off', status: 'idle', playing: false, busy: false, error: null, volume: 0.7, muted: false, expanded: false, videoOpen: false, vinyl: false, hasTrack: false };
const NOOP = () => {};
const INERT = Object.fromEntries(['play', 'toggle', 'pause', 'resume', 'next', 'prev', 'seek', 'seekBy', 'setVolume', 'setMuted', 'toggleMute', 'enqueue', 'playNext', 'jump', 'remove', 'clearUpcoming', 'stop', 'toggleShuffle', 'cycleRepeat', 'retry', 'preload', 'setExpanded', 'setVideoOpen', 'setVinyl', 'registerSlot'].map((k) => [k, NOOP]));

export function MusicPlayerProvider({ children }) {
  const [prefs] = useState(readPrefs);
  const clock = useMemo(createClock, []);
  const R = useRef(null);
  if (!R.current) {
    const volume = Number.isFinite(prefs.volume) ? clamp01(prefs.volume) : 0.7;
    R.current = { q: emptyQueue({ shuffle: !!prefs.shuffle, repeat: ['off', 'all', 'one'].includes(prefs.repeat) ? prefs.repeat : 'off' }), status: 'idle', want: false, loaded: null,
      failures: 0, cancelAutoplay: false, skipTimer: 0, volume, muted: !!prefs.muted, yt: null, au: null };
  }
  const [q, setQ] = useState(R.current.q);
  const [status, setStatus] = useState('idle');
  const [want, setWant] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({});
  const [volume, setVolume] = useState(R.current.volume);
  const [muted, setMuted] = useState(R.current.muted);
  const [expanded, setExpanded] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [vinyl, setVinyl] = useState(!!prefs.vinyl);
  const [slotEl, setSlotEl] = useState(null);
  const [loadTick, setLoadTick] = useState(0);
  const mountRef = useRef(null); const stageRef = useRef(null);

  const ctl = useMemo(() => makeController({ R, clock, mountRef, S: { setQ, setStatus, setWant, setError, setMeta, setVolume, setMuted, setExpanded, setVideoOpen, setVinyl, setLoadTick } }), [clock]);
  useEffect(() => () => ctl.destroy(), [ctl]);
  const actions = useMemo(() => ({ ...ctl.actions, registerSlot: setSlotEl }), [ctl]);

  const base = currentOf(q);
  const current = useMemo(() => { if (!base) return null; const m = meta[base.qid]; return m ? { ...base, title: base.title || m.title, artist: base.artist || m.artist } : base; }, [base, meta]);
  const playing = want && LIVE.includes(status);
  const busy = want && (status === 'loading' || status === 'buffering');

  // "Starting..." that never ends (API blocked by an ad blocker, a dead connection) becomes a clear error with a retry button.
  useEffect(() => {
    if (status !== 'loading') return;
    const t = setTimeout(() => { if (R.current.status === 'loading') { R.current.want = false; R.current.status = 'error'; setWant(false); setStatus('error'); setError({ message: "Couldn't start playback. Check your connection or ad blocker, then try again.", skip: false }); } }, CFG.stallMs);
    return () => clearTimeout(t);
  }, [status, loadTick]);

  // The playhead: polled only while something is actually playing.
  useEffect(() => {
    if (status !== 'playing' && status !== 'buffering') return;
    const tick = () => {
      const t = currentOf(R.current.q); const e = t && t.kind === 'yt' ? R.current.yt : null; if (!e) return;
      const d = e.getDuration(); clock.set({ position: e.getTime(), duration: d > 0 ? d : clock.get().duration, buffered: e.getBuffered() });
    };
    tick(); const id = setInterval(tick, 250); document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [status, q.cursor, clock]);

  useEffect(() => { writePrefs({ volume, muted, shuffle: q.shuffle, repeat: q.repeat, vinyl }); }, [volume, muted, q.shuffle, q.repeat, vinyl]);

  useEffect(() => {   // html classes the stylesheet uses: make room for the dock, lock page scroll behind the full-screen player
    const root = document.documentElement; root.classList.toggle('mp-on', !!current); root.classList.toggle('mp-lock', expanded && !!current);
    return () => { root.classList.remove('mp-on', 'mp-lock'); };
  }, [!!current, expanded]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!current) { setExpanded(false); setVideoOpen(false); } }, [current]);
  useEffect(() => { if (current && current.kind !== 'yt') setVideoOpen(false); }, [current]);

  // Lock-screen / headset / keyboard media keys.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (!current) { try { ms.metadata = null; } catch { /* unsupported */ } return; }
    const art = current.cover || (current.videoId ? ytThumb(current.videoId) : '');
    try { ms.metadata = new MediaMetadata({ title: current.title || 'Untitled', artist: current.artist || '', album: 'fiiyou', artwork: art ? [{ src: art, sizes: '480x360' }] : [] }); } catch { /* unsupported */ }
  }, [current]);
  useEffect(() => { if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = !current ? 'none' : playing ? 'playing' : 'paused'; } catch { /* unsupported */ } } }, [playing, current]);
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession; const a = ctl.actions;
    const map = { play: a.resume, pause: a.pause, previoustrack: a.prev, nexttrack: a.next, stop: a.stop,
      seekto: (d) => a.seek(d.seekTime), seekbackward: (d) => a.seekBy(-(d.seekOffset || 10)), seekforward: (d) => a.seekBy(d.seekOffset || 10) };
    for (const [k, fn] of Object.entries(map)) { try { ms.setActionHandler(k, fn); } catch { /* this browser lacks that action */ } }
    let last = -1;
    const off = clock.subscribe(() => { const { position, duration } = clock.get(); const s = Math.floor(position); if (s === last || !(duration > 0) || position > duration) return; last = s; try { ms.setPositionState({ duration, position, playbackRate: 1 }); } catch { /* ignore */ } });
    return () => { off(); for (const k of Object.keys(map)) { try { ms.setActionHandler(k, null); } catch { /* ignore */ } } };
  }, [ctl, clock]);

  // Where the real YouTube player sits. It is never moved in the DOM (that would reload it); only its box changes.
  const mode = expanded && videoOpen && slotEl ? 'cover' : (CFG.parkPlayerWhenHidden ? 'parked' : 'dock');
  useLayoutEffect(() => {
    const st = stageRef.current; if (!st) return;
    const clear = () => ['left', 'top', 'width', 'height', 'border-radius'].forEach((p) => st.style.removeProperty(p));
    st.inert = mode === 'parked';
    if (mode !== 'cover' || !slotEl) { clear(); return; }
    const radius = getComputedStyle(slotEl).borderRadius; let raf = 0;
    const place = () => { const r = slotEl.getBoundingClientRect(); st.style.left = `${r.left}px`; st.style.top = `${r.top}px`; st.style.width = `${r.width}px`; st.style.height = `${r.height}px`; st.style.borderRadius = radius; raf = requestAnimationFrame(place); };
    place(); return () => { cancelAnimationFrame(raf); clear(); };
  }, [mode, slotEl]);

  const state = useMemo(() => ({ current, queue: q.queue, index: q.cursor, shuffle: q.shuffle, repeat: q.repeat, status, playing, busy, error, volume, muted, expanded, videoOpen, vinyl, hasTrack: !!current }),
    [current, q, status, playing, busy, error, volume, muted, expanded, videoOpen, vinyl]);

  return (
    <StateCtx.Provider value={state}><ActionsCtx.Provider value={actions}><ClockCtx.Provider value={clock}>
      {children}
      <div className="mp-stage" ref={stageRef} data-mode={mode} data-live={current && current.kind === 'yt' && status !== 'idle' ? 'true' : 'false'} aria-hidden={mode === 'parked' ? 'true' : undefined}>
        <div className="mp-stage-in" ref={mountRef} />
      </div>
    </ClockCtx.Provider></ActionsCtx.Provider></StateCtx.Provider>
  );
}

/** State + actions in one object. Re-renders when the track, status or queue change (not on every tick: see useMusicClock). */
export function useMusicPlayer() {
  const s = useContext(StateCtx) || IDLE; const a = useContext(ActionsCtx) || INERT;
  return useMemo(() => ({ ...s, ...a }), [s, a]);
}
export const useMusicState = () => useContext(StateCtx) || IDLE;
/** Only the functions; the object never changes, so a component using just this never re-renders because of the player. */
export const useMusicActions = () => useContext(ActionsCtx) || INERT;
/** { position, duration, buffered } in seconds / seconds / 0..1. Updates ~4x a second while playing. */
export function useMusicClock() { const c = useContext(ClockCtx) || inertClock; return useSyncExternalStore(c.subscribe, c.get, c.get); }
