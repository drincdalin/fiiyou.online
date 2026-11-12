import { loadYouTubeApi } from './youtube.js';

/* Two playback engines with the same small interface, so the controller (musicPlayer.jsx) never cares which one is playing.
     load(track, { autoplay }) -> Promise   play()  pause()  stop()  seek(sec)  setVolume(0..1)  setMuted(bool)
     getTime()  getDuration()  getBuffered() (0..1)  destroy()
   They report back through emit():
     { type: 'status', status: 'playing' | 'buffering' | 'paused' | 'cued' | 'ended' | 'blocked' }
     { type: 'meta', duration?, title?, artist? }
     { type: 'error', message, skip }   skip = this track can never play (removed video), so the queue may move on. */

const safe = (fn, d) => { try { const v = fn(); return v === undefined ? d : v; } catch { return d; } };

/* ---------- plain audio: uploaded files and direct https links ---------- */
export function createAudioEngine({ emit }) {
  const el = new Audio();
  el.preload = 'auto'; el.setAttribute('playsinline', ''); el.playsInline = true;
  let want = false;

  const startPlayback = () => {
    want = true;
    const p = el.play();
    if (p && p.catch) p.catch((err) => {
      if (!want || (err && err.name === 'AbortError')) return;   // superseded by another load / a pause: not a failure
      if (err && err.name === 'NotAllowedError') emit({ type: 'status', status: 'blocked' });
      else emit({ type: 'error', message: "This audio couldn't be played.", skip: true });
    });
  };

  const on = {
    playing: () => emit({ type: 'status', status: 'playing' }),
    waiting: () => { if (want) emit({ type: 'status', status: 'buffering' }); },
    pause: () => { if (!el.ended) emit({ type: 'status', status: 'paused' }); },
    ended: () => { want = false; emit({ type: 'status', status: 'ended' }); },
    loadedmetadata: () => { if (el.duration > 0 && Number.isFinite(el.duration)) emit({ type: 'meta', duration: el.duration }); },
    durationchange: () => { if (el.duration > 0 && Number.isFinite(el.duration)) emit({ type: 'meta', duration: el.duration }); },
    error: () => {
      if (!el.getAttribute('src')) return;   // we just cleared the source ourselves
      const c = el.error && el.error.code;
      emit({ type: 'error', skip: true, message: c === 2 ? 'Network problem while loading this audio.' : c === 4 ? 'This audio format or link is not supported (an expired link can cause this too).' : "This audio couldn't be played." });
    },
  };
  Object.entries(on).forEach(([k, f]) => el.addEventListener(k, f));

  return {
    load(track, { autoplay = true } = {}) {
      want = false; el.src = track.src; el.load();
      if (autoplay) startPlayback(); else emit({ type: 'status', status: 'cued' });
      return Promise.resolve();
    },
    play: startPlayback,
    pause() { want = false; el.pause(); },
    stop() { want = false; el.pause(); el.removeAttribute('src'); el.load(); },
    seek(s) { if (Number.isFinite(s)) el.currentTime = s; },
    setVolume(v) { el.volume = Math.max(0, Math.min(1, v)); },
    setMuted(m) { el.muted = !!m; },
    getTime: () => el.currentTime || 0,
    getDuration: () => (Number.isFinite(el.duration) ? el.duration : 0),
    getBuffered() {
      const d = el.duration; if (!(d > 0) || !el.buffered.length) return 0;
      const t = el.currentTime; for (let i = el.buffered.length - 1; i >= 0; i--) if (el.buffered.start(i) <= t + 0.5) return Math.min(1, el.buffered.end(i) / d);
      return 0;
    },
    destroy() { want = false; Object.entries(on).forEach(([k, f]) => el.removeEventListener(k, f)); el.pause(); el.removeAttribute('src'); el.load(); },
  };
}

/* ---------- YouTube: the IFrame API used as an audio engine ---------- */
const YT_ERRORS = {
  2: ['That YouTube link is not valid.', true],
  5: ['YouTube had a playback problem. Try again.', false],
  100: ['This video was removed or is private.', true],
  101: ["The owner of this video doesn't allow it to be played here.", true],
  150: ["The owner of this video doesn't allow it to be played here.", true],
  153: ["YouTube couldn't verify this site, so it refused to play. Try again.", false],
};

/** `container` is an empty element that React never renders into; the iframe is created inside it (YT.Player replaces its target element,
 *  so it gets its own child). The iframe is created once and reused for every track: moving or recreating it would reload it and lose the
 *  permission the browser gave it to play sound. */
export function createYouTubeEngine({ container, host, origin, blockedMs = 3200, emit }) {
  let player = null, ready = false, destroyed = false, building = false, token = 0;
  let want = null;            // { videoId, autoplay } the track that should be loaded as soon as the player can take commands
  let shown = '';             // the videoId currently loaded in the iframe
  let state = -2, blockTimer = 0, vol = 70, muted = false;
  const err = (message, skip = false) => emit({ type: 'error', message, skip });

  const armBlock = () => {
    clearTimeout(blockTimer);
    blockTimer = setTimeout(() => { if (!destroyed && want && want.autoplay && (state === -1 || state === 5 || state === -2)) emit({ type: 'status', status: 'blocked' }); }, blockedMs);
  };
  const disarm = () => clearTimeout(blockTimer);

  const sendMeta = () => {
    if (!player || !ready) return;
    const d = safe(() => player.getVideoData(), null); const dur = safe(() => player.getDuration(), 0);
    const m = { type: 'meta' };
    if (dur > 0) m.duration = dur;
    if (d && d.video_id && want && d.video_id === want.videoId) { if (d.title) m.title = d.title; if (d.author) m.artist = d.author; }
    if (m.duration || m.title || m.artist) emit(m);
  };

  const applyWanted = () => {
    if (!ready || !want) return;
    const { videoId, autoplay } = want;
    shown = videoId;
    if (autoplay) { player.loadVideoById({ videoId }); armBlock(); } else player.cueVideoById({ videoId });
  };

  const onState = (e) => {
    if (destroyed) return; state = e.data;
    switch (e.data) {
      case 1: disarm(); sendMeta(); emit({ type: 'status', status: 'playing' }); break;
      case 3: disarm(); emit({ type: 'status', status: 'buffering' }); break;
      case 2: emit({ type: 'status', status: 'paused' }); break;
      case 0: emit({ type: 'status', status: 'ended' }); break;
      case 5: sendMeta(); emit({ type: 'status', status: 'cued' }); break;
      default: break;
    }
  };

  const build = (YT) => {
    building = true;
    const slot = document.createElement('div'); container.appendChild(slot);
    const first = want;
    player = new YT.Player(slot, {
      host, width: '100%', height: '100%',
      videoId: first ? first.videoId : undefined,
      playerVars: { autoplay: first && first.autoplay ? 1 : 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, rel: 0, playsinline: 1, cc_load_policy: 0, enablejsapi: 1, origin },
      events: {
        onReady: () => {
          if (destroyed) return; ready = true; building = false;
          safe(() => { player.setVolume(vol); muted ? player.mute() : player.unMute(); });
          if (!first || !want || want.videoId !== first.videoId) applyWanted();   // the track changed while the player was starting
          else { shown = want.videoId; if (want.autoplay) { safe(() => player.playVideo()); armBlock(); } }
        },
        onStateChange: onState,
        onAutoplayBlocked: () => { if (!destroyed) emit({ type: 'status', status: 'blocked' }); },
        // shown = '' so a retry reloads the video instead of just pressing play
        onError: (e) => { disarm(); shown = ''; const [msg, skip] = YT_ERRORS[e.data] || ['YouTube could not play this video.', false]; err(msg, skip); },
      },
    });
    if (first) shown = first.videoId;
  };

  return {
    async load(track, { autoplay = true } = {}) {
      const mine = ++token; want = { videoId: track.videoId, autoplay }; state = -2;
      if (player) { if (ready && shown !== track.videoId) applyWanted(); else if (ready) { autoplay ? this.play() : safe(() => player.pauseVideo()); } return; }
      if (building) return;
      const YT = await loadYouTubeApi();
      if (destroyed) throw new Error('destroyed');
      if (mine !== token || player) return;   // a newer load took over while the API was loading (it builds the player)
      try { build(YT); } catch (e) { building = false; player = null; throw e; }
    },
    play() { if (want) want.autoplay = true; if (ready) { safe(() => player.playVideo()); armBlock(); } },
    pause() { disarm(); if (want) want.autoplay = false; if (ready) safe(() => player.pauseVideo()); },
    stop() { disarm(); want = null; shown = ''; state = -2; if (ready) safe(() => player.stopVideo()); },
    seek(s) { if (ready && Number.isFinite(s)) safe(() => player.seekTo(s, true)); },
    setVolume(v) { vol = Math.round(Math.max(0, Math.min(1, v)) * 100); if (ready) safe(() => player.setVolume(vol)); },
    setMuted(m) { muted = !!m; if (ready) safe(() => (muted ? player.mute() : player.unMute())); },
    getTime: () => (ready ? safe(() => player.getCurrentTime(), 0) : 0),
    getDuration: () => (ready ? safe(() => player.getDuration(), 0) : 0),
    getBuffered: () => (ready ? safe(() => player.getVideoLoadedFraction(), 0) : 0),
    destroy() { destroyed = true; disarm(); token++; if (player) safe(() => player.destroy()); player = null; ready = false; if (container) container.textContent = ''; },
  };
}
