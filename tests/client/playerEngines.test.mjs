import test from 'node:test'; import assert from 'node:assert/strict';

/* The YouTube engine against a fake IFrame API: player creation, reuse, blocked autoplay, errors, volume before ready, stale loads. */
const flush = () => new Promise((r) => setTimeout(r, 0));
function setup() {
  const made = []; const log = [];
  class Player {
    constructor(el, o) { this.el = el; this.o = o; this.calls = []; this.vd = { video_id: o.videoId, title: 'Song', author: 'Band - Topic' }; made.push(this); this.dur = 215; }
    fire(n, d) { this.o.events[n]({ data: d }); }
    loadVideoById(x) { this.calls.push(['load', x.videoId]); this.vd = { ...this.vd, video_id: x.videoId }; } cueVideoById(x) { this.calls.push(['cue', x.videoId]); }
    playVideo() { this.calls.push(['play']); } pauseVideo() { this.calls.push(['pause']); } stopVideo() { this.calls.push(['stop']); }
    seekTo(s) { this.calls.push(['seek', s]); } setVolume(v) { this.calls.push(['vol', v]); } mute() { this.calls.push(['mute']); } unMute() { this.calls.push(['unmute']); }
    getVideoData() { return this.vd; } getDuration() { return this.dur; } getCurrentTime() { return 42; } getVideoLoadedFraction() { return 0.5; } destroy() { this.calls.push(['destroy']); }
  }
  const kids = []; const container = { appendChild: (c) => kids.push(c), textContent: 'x' };
  globalThis.window = globalThis; globalThis.YT = { Player };
  globalThis.document = { createElement: () => ({}), head: { appendChild() {} } };
  const events = []; return { made, log, kids, container, events, emit: (e) => events.push(e) };
}
const tr = (id) => ({ videoId: id, kind: 'yt' });

test('creates one iframe player inside a child slot, autoplays from the constructor, reuses it for the next track', async () => {
  const { createYouTubeEngine } = await import('../../src/lib/playerEngines.js'); const s = setup();
  const e = createYouTubeEngine({ container: s.container, host: 'https://www.youtube-nocookie.com', origin: 'https://x.com', blockedMs: 20, emit: s.emit });
  e.setVolume(0.5); e.setMuted(true);   // before the player exists
  await e.load(tr('AAAAAAAAAAA'), { autoplay: true });
  assert.equal(s.made.length, 1); assert.equal(s.kids.length, 1); const p = s.made[0];
  assert.equal(p.o.videoId, 'AAAAAAAAAAA'); assert.equal(p.o.playerVars.autoplay, 1); assert.equal(p.o.playerVars.controls, 0); assert.equal(p.o.host, 'https://www.youtube-nocookie.com');
  p.fire('onReady'); assert.deepEqual(p.calls.filter((c) => ['vol', 'mute'].includes(c[0])), [['vol', 50], ['mute']]);   // volume + mute set before ready are applied on ready
  p.fire('onStateChange', 1);
  assert.deepEqual(s.events.find((x) => x.type === 'meta'), { type: 'meta', duration: 215, title: 'Song', artist: 'Band - Topic' });
  assert.ok(s.events.some((x) => x.status === 'playing'));
  await e.load(tr('BBBBBBBBBBB'), { autoplay: true }); assert.equal(s.made.length, 1); assert.deepEqual(p.calls.at(-1), ['load', 'BBBBBBBBBBB']);
  assert.equal(e.getTime(), 42); assert.equal(e.getDuration(), 215); assert.equal(e.getBuffered(), 0.5);
  e.destroy(); assert.ok(p.calls.some((c) => c[0] === 'destroy')); assert.equal(s.container.textContent, '');
});
test('a player that never starts is reported as blocked; one that starts is not', async () => {
  const { createYouTubeEngine } = await import('../../src/lib/playerEngines.js'); let s = setup();
  let e = createYouTubeEngine({ container: s.container, host: 'h', origin: 'o', blockedMs: 15, emit: s.emit });
  await e.load(tr('AAAAAAAAAAA')); s.made[0].fire('onReady'); await new Promise((r) => setTimeout(r, 40));
  assert.ok(s.events.some((x) => x.status === 'blocked'));
  s = setup(); e = createYouTubeEngine({ container: s.container, host: 'h', origin: 'o', blockedMs: 15, emit: s.emit });
  await e.load(tr('AAAAAAAAAAA')); s.made[0].fire('onReady'); s.made[0].fire('onStateChange', 3); await new Promise((r) => setTimeout(r, 40));
  assert.ok(!s.events.some((x) => x.status === 'blocked'));
});
test('errors map to readable messages; removed videos are skippable, then a retry reloads the video', async () => {
  const { createYouTubeEngine } = await import('../../src/lib/playerEngines.js'); const s = setup();
  const e = createYouTubeEngine({ container: s.container, host: 'h', origin: 'o', emit: s.emit });
  await e.load(tr('AAAAAAAAAAA')); const p = s.made[0]; p.fire('onReady');
  p.fire('onError', 100); const er = s.events.find((x) => x.type === 'error'); assert.equal(er.skip, true); assert.match(er.message, /removed or is private/);
  p.fire('onError', 5); assert.equal(s.events.filter((x) => x.type === 'error').at(-1).skip, false);
  await e.load(tr('AAAAAAAAAAA')); assert.deepEqual(p.calls.at(-1), ['load', 'AAAAAAAAAAA']);   // same video after an error: really reloaded
});
test('a second load while the API/player is still starting is applied once the player is ready', async () => {
  const { createYouTubeEngine } = await import('../../src/lib/playerEngines.js'); const s = setup();
  const e = createYouTubeEngine({ container: s.container, host: 'h', origin: 'o', emit: s.emit });
  await e.load(tr('AAAAAAAAAAA')); await e.load(tr('BBBBBBBBBBB'));   // player built for A, not ready yet
  assert.equal(s.made.length, 1); s.made[0].fire('onReady'); assert.deepEqual(s.made[0].calls.at(-1), ['load', 'BBBBBBBBBBB']);
});
test('pause then stop do not leave a blocked timer behind', async () => {
  const { createYouTubeEngine } = await import('../../src/lib/playerEngines.js'); const s = setup();
  const e = createYouTubeEngine({ container: s.container, host: 'h', origin: 'o', blockedMs: 10, emit: s.emit });
  await e.load(tr('AAAAAAAAAAA')); s.made[0].fire('onReady'); e.pause(); await new Promise((r) => setTimeout(r, 30));
  assert.ok(!s.events.some((x) => x.status === 'blocked'));
});
