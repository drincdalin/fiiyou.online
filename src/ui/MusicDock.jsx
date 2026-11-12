import { memo, useEffect, useRef, useState } from 'react';
import { CaretDown, ListBullets, MonitorPlay, Repeat, RepeatOnce, Shuffle, SkipBack, SkipForward, VinylRecord, WarningCircle, X } from '@phosphor-icons/react';
import { useMusicActions, useMusicClock, useMusicState } from './musicPlayer.jsx';
import { CoverImg, Eq, PlayGlyph, Scrubber, VolumeIcon, cssUrl, useCover } from './playerParts.jsx';
import { fmtTime, ytThumb } from '../lib/youtube.js';
import { MUSIC_CONFIG as CFG } from '../lib/musicConfig.js';

/** Swipe on an element: onDone fires for a mostly-vertical drag of 36px+ in `dir` ('up' | 'down'). `ignore` = selector of children that keep their own taps / drags. */
function useSwipe(dir, onDone, ignore) {
  const start = useRef(null);
  return {
    onPointerDown: (e) => { start.current = ignore && e.target.closest(ignore) ? null : { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e) => {
      const s = start.current; start.current = null; if (!s) return;
      const dy = e.clientY - s.y, dx = Math.abs(e.clientX - s.x);
      if (Math.abs(dy) > 36 && Math.abs(dy) > dx * 1.5 && (dir === 'up' ? dy < 0 : dy > 0)) onDone();
    },
    onPointerCancel: () => { start.current = null; },
  };
}

/** Keeps the previous picture under the new one for a moment so the blurred background cross-fades instead of flashing. */
function useLayers(url) {
  const [layers, setLayers] = useState(() => (url ? [{ id: 0, url }] : []));
  useEffect(() => {
    setLayers((l) => { if ((l.length ? l[l.length - 1].url : null) === (url || null)) return l; const id = l.length ? l[l.length - 1].id + 1 : 0; return [...l.slice(-1), ...(url ? [{ id, url }] : [])]; });
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), 900); return () => clearTimeout(t);
  }, [url]);
  return layers;
}

const DockProgress = memo(function DockProgress() {
  const { position, duration } = useMusicClock();
  return <i className="mp-dock-prog" style={{ transform: `scaleX(${duration > 0 ? Math.min(1, position / duration) : 0})` }} aria-hidden="true" />;
});

/** Progress ring around the corner disc. Own component so only it re-renders with the playhead. */
const OrbRing = memo(function OrbRing() {
  const { position, duration } = useMusicClock();
  const f = duration > 0 ? Math.min(1, position / duration) : 0;
  return <svg className="mp-orb-ring" viewBox="0 0 36 36" aria-hidden="true"><circle className="bg" cx="18" cy="18" r="16.8" /><circle className="fg" cx="18" cy="18" r="16.8" pathLength="100" strokeDasharray={`${(f * 100).toFixed(2)} 100`} /></svg>;
});

/** Wide dock while you are using it; after CFG.dockIdleMs of nothing it folds into a spinning disc in the corner (the song keeps playing).
 *  Touching it, a new song, play / pause, or an error brings it back. Hovering with a mouse keeps it open. */
function MiniPlayer() {
  const p = useMusicState(); const a = useMusicActions(); const t = p.current; const cover = useCover(t, true);
  const [awake, setAwake] = useState(true); const [nudge, setNudge] = useState(0); const hover = useRef(false);
  const folded = useRef(false);   // true while it is the corner disc
  const wake = () => setNudge((n) => n + 1);
  const keepOpen = () => { if (!folded.current) wake(); };   // touches / hover on the wide dock restart the countdown; on the disc only its own tap opens it (else the tap would land on a button that just appeared)
  const hold = CFG.dockIdleMs <= 0 || p.status === 'error' || p.status === 'blocked' || p.status === 'loading';   // never fold away while it has something to say
  useEffect(() => {
    setAwake(true); if (hold || p.expanded) return undefined;
    const id = setTimeout(() => { if (!hover.current) setAwake(false); }, CFG.dockIdleMs);
    return () => clearTimeout(id);
  }, [t.qid, p.playing, p.status, p.expanded, hold, nudge, CFG.dockIdleMs]);   // eslint-disable-line react-hooks/exhaustive-deps
  const collapsed = !awake && !hold && !p.expanded;
  const swipe = useSwipe('up', () => a.setExpanded(true), '.mp-dock-ctl, .mp-dock-disc');
  folded.current = collapsed;
  const tab = p.expanded || collapsed ? -1 : 0;
  return (
    <div className="mp-dock" data-playing={p.playing} data-hidden={p.expanded || undefined} data-collapsed={collapsed || undefined} style={{ '--mp-cover': cssUrl(cover && cover.url) }} role="region" aria-label="Music player" {...swipe}
      onPointerDown={(e) => { keepOpen(); swipe.onPointerDown(e); }} onPointerEnter={(e) => { if (e.pointerType === 'mouse') hover.current = true; }} onPointerLeave={() => { if (hover.current) { hover.current = false; keepOpen(); } }} onFocus={keepOpen}>
      <button type="button" className="mp-dock-main" onClick={() => a.setExpanded(true)} aria-label={`Open player. ${t.title || 'Untitled'}${t.artist ? `, ${t.artist}` : ''}`} tabIndex={tab} aria-hidden={collapsed || undefined}>
        <span className="mp-dock-art"><CoverImg cover={cover} className="mp-cover" /></span>
        <span className="mp-dock-meta"><b>{t.title || (p.status === 'loading' ? 'Loading…' : 'Untitled')}</b><small>{p.status === 'error' ? 'Could not play' : p.status === 'blocked' ? 'Tap play to start' : t.artist}</small></span>
      </button>
      <div className="mp-dock-ctl" aria-hidden={collapsed || undefined}>
        <button type="button" className="mp-ib mp-hide-sm" onClick={a.prev} aria-label="Previous" tabIndex={tab}><SkipBack size="1.25em" weight="fill" /></button>
        <button type="button" className="mp-ib mp-play-sm" onClick={a.toggle} aria-label={p.playing ? 'Pause' : 'Play'} tabIndex={tab}><PlayGlyph playing={p.playing} busy={p.busy} size="1.4em" /></button>
        <button type="button" className="mp-ib" onClick={a.next} aria-label="Next" tabIndex={tab}><SkipForward size="1.25em" weight="fill" /></button>
      </div>
      <DockProgress />
      <button type="button" className="mp-dock-disc" onClick={wake} aria-label={`Show player controls. ${p.playing ? 'Playing' : 'Paused'}: ${t.title || 'Untitled'}`} tabIndex={collapsed ? 0 : -1} aria-hidden={!collapsed || undefined}>
        <span className="mp-disc" /><OrbRing />
      </button>
    </div>
  );
}

const ProgressBlock = memo(function ProgressBlock({ disabled }) {
  const a = useMusicActions(); const { position, duration, buffered } = useMusicClock(); const [scrub, setScrub] = useState(null);
  const shown = scrub == null ? position : scrub;
  return (
    <div className="mp-progress">
      <Scrubber className="mp-seek" value={position} max={duration || 1} buffered={buffered} step={5} disabled={disabled || !(duration > 0)} label="Seek"
        valueText={`${fmtTime(shown)} of ${fmtTime(duration)}`} onScrub={setScrub} onCommit={(v) => { setScrub(null); a.seek(v); }} />
      <div className="mp-times"><span>{fmtTime(shown)}</span><span>{duration > 0 ? `-${fmtTime(Math.max(0, duration - shown))}` : '--:--'}</span></div>
    </div>
  );
});

const QueueRow = memo(function QueueRow({ t, title, isCur, playing, done, onJump, onRemove }) {
  const thumb = t.cover || (t.videoId ? ytThumb(t.videoId, 'mqdefault') : '');
  return (
    <li className={`mp-qrow${isCur ? ' cur' : ''}${done ? ' done' : ''}`}>
      <button type="button" className="mp-qmain" onClick={() => onJump(t.qid)} aria-label={`${isCur ? 'Now playing' : 'Play'} ${title}`} aria-current={isCur || undefined}>
        <span className="mp-qthumb">{thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" draggable={false} /> : <span className="ph" />}{isCur && <span className="mp-qeq"><Eq active={playing} /></span>}</span>
        <span className="mp-qmeta"><b>{title}</b><small>{t.artist}</small></span>
      </button>
      <button type="button" className="mp-qdel" onClick={() => onRemove(t.qid)} aria-label={`Remove ${title} from the queue`}><X size="1.1em" weight="bold" /></button>
    </li>
  );
});

const FOCUSABLE = 'button:not([disabled]), [role="slider"]:not([aria-disabled]), [tabindex="0"]';

function Sheet({ closing }) {
  const p = useMusicState(); const a = useMusicActions(); const t = p.current; const cover = useCover(t, true);
  const layers = useLayers(cover && cover.url);
  const [panel, setPanel] = useState('art');
  const root = useRef(null);
  const swipe = useSwipe('down', () => a.setExpanded(false), 'button');
  const isYt = t.kind === 'yt'; const video = p.videoOpen && isYt;

  useEffect(() => {   // focus moves into the player when it opens and goes back to where it was when it closes
    const before = document.activeElement; if (root.current) root.current.focus();
    return () => { if (before && before.focus && document.contains(before)) before.focus(); };
  }, []);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); a.setExpanded(false); return; }
    if (e.key === 'Tab' && root.current) {   // keep Tab inside the dialog
      const f = [...root.current.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target; const onSlider = el.getAttribute && el.getAttribute('role') === 'slider'; const onButton = el.tagName === 'BUTTON';
    if (onSlider) return;   // a focused slider owns the arrow keys
    switch (e.key) {
      case ' ': if (!onButton) { e.preventDefault(); a.toggle(); } break;
      case 'k': a.toggle(); break;
      case 'ArrowLeft': e.preventDefault(); a.seekBy(-5); break;
      case 'ArrowRight': e.preventDefault(); a.seekBy(5); break;
      case 'ArrowUp': e.preventDefault(); a.setVolume(p.volume + 0.05); break;
      case 'ArrowDown': e.preventDefault(); a.setVolume(p.volume - 0.05); break;
      case 'm': a.toggleMute(); break;
      case 'n': a.next(); break;
      case 'p': a.prev(); break;
      case 's': a.toggleShuffle(); break;
      case 'r': a.cycleRepeat(); break;
      default: break;
    }
  };

  const shownVol = p.muted ? 0 : p.volume;
  const repeatLabel = p.repeat === 'off' ? 'Repeat: off' : p.repeat === 'all' ? 'Repeat: all' : 'Repeat: one';
  const title = t.title || (p.status === 'loading' ? 'Loading…' : 'Untitled');

  return (
    <div className="mp-sheet" role="dialog" aria-modal="true" aria-label="Now playing" data-closing={closing || undefined} data-panel={panel} ref={root} tabIndex={-1} onKeyDown={onKey}>
      <div className="mp-bg" aria-hidden="true">{layers.map((l) => <img key={l.id} src={l.url} alt="" draggable={false} />)}<i /></div>

      <header className="mp-top" {...swipe}>
        <button type="button" className="mp-ib" onClick={() => a.setExpanded(false)} aria-label="Minimise player"><CaretDown size="1.4em" weight="bold" /></button>
        <span className="mp-grab" aria-hidden="true" />
        <button type="button" className="mp-ib mp-only-sm" onClick={() => setPanel(panel === 'art' ? 'queue' : 'art')} aria-label={panel === 'art' ? 'Show queue' : 'Show player'} aria-pressed={panel === 'queue'}><ListBullets size="1.4em" weight={panel === 'queue' ? 'fill' : 'bold'} /></button>
      </header>

      <div className="mp-body">
        <section className="mp-main" aria-label="Now playing">
          <div className="mp-art" data-playing={p.playing} data-vinyl={(p.vinyl && !video) || undefined} data-video={video || undefined}>
            <div className="mp-art-glow" style={{ backgroundImage: cssUrl(cover && cover.url) }} aria-hidden="true" />
            <div className="mp-art-img"><CoverImg cover={cover} className="mp-art-pic" /><i className="mp-vinyl-fx" aria-hidden="true" /></div>
            {video && <div className="mp-art-video" ref={a.registerSlot} />}
          </div>

          <div className="mp-info">
            <h2 className="mp-title">{title}</h2>
            <p className="mp-artist">{t.artist}</p>
          </div>

          {p.status === 'error' && <div className="mp-note err" role="alert"><WarningCircle size="1.2em" weight="fill" /><span>{p.error && p.error.message}</span><button type="button" onClick={a.retry}>Try again</button></div>}
          {p.status === 'blocked' && <div className="mp-note" role="status"><span>Your browser blocked autoplay. {video ? 'Tap the video to start.' : 'Press play to start.'}</span></div>}

          <ProgressBlock disabled={p.status === 'error'} />

          <div className="mp-transport">
            <button type="button" className="mp-ib mp-tog" onClick={a.toggleShuffle} aria-label="Shuffle" aria-pressed={p.shuffle}><Shuffle size="1.4em" weight="bold" /></button>
            <button type="button" className="mp-ib" onClick={a.prev} aria-label="Previous"><SkipBack size="1.9em" weight="fill" /></button>
            <button type="button" className="mp-playbig" onClick={a.toggle} aria-label={p.playing ? 'Pause' : 'Play'}><PlayGlyph playing={p.playing} busy={p.busy} size="1.9em" /></button>
            <button type="button" className="mp-ib" onClick={a.next} aria-label="Next"><SkipForward size="1.9em" weight="fill" /></button>
            <button type="button" className="mp-ib mp-tog" onClick={a.cycleRepeat} aria-label={repeatLabel} aria-pressed={p.repeat !== 'off'}>{p.repeat === 'one' ? <RepeatOnce size="1.4em" weight="bold" /> : <Repeat size="1.4em" weight="bold" />}</button>
          </div>

          <div className="mp-extras">
            <div className="mp-vol">
              <button type="button" className="mp-ib" onClick={a.toggleMute} aria-label={p.muted || p.volume === 0 ? 'Unmute' : 'Mute'}><VolumeIcon level={shownVol} size="1.3em" /></button>
              <Scrubber className="mp-volbar" value={shownVol} max={1} step={0.05} label="Volume" valueText={`${Math.round(shownVol * 100)}%`} onScrub={a.setVolume} onCommit={a.setVolume} />
            </div>
            <div className="mp-toggles">
              {isYt && <button type="button" className="mp-chip" onClick={() => a.setVideoOpen(!p.videoOpen)} aria-pressed={!!video}><MonitorPlay size="1.2em" weight={video ? 'fill' : 'bold'} /><span>Video</span></button>}
              <button type="button" className="mp-chip" onClick={() => a.setVinyl(!p.vinyl)} aria-pressed={p.vinyl && !video} disabled={!!video}><VinylRecord size="1.2em" weight={p.vinyl && !video ? 'fill' : 'bold'} /><span>Vinyl</span></button>
            </div>
          </div>
        </section>

        <aside className="mp-queue" aria-label="Queue">
          <div className="mp-queue-head"><h3>Queue <small>{p.queue.length}</small></h3>{p.queue.length > 1 && <button type="button" onClick={a.clearUpcoming}>Clear others</button>}</div>
          <ol className="mp-qlist">
            {p.queue.map((q, i) => <QueueRow key={q.qid} t={q} title={i === p.index ? title : (q.title || (q.videoId ? 'YouTube track' : 'Untitled'))} isCur={i === p.index} playing={p.playing} done={!p.shuffle && i < p.index} onJump={a.jump} onRemove={a.remove} />)}
          </ol>
          {p.shuffle && <p className="mp-qnote">Shuffle is on: tracks play in a random order.</p>}
        </aside>
      </div>
    </div>
  );
}

function NowPlaying() {
  const p = useMusicState(); const open = p.expanded && p.hasTrack;
  const [mounted, setMounted] = useState(open); const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return undefined; }
    if (!mounted) return undefined;
    setClosing(true); const t = setTimeout(() => { setMounted(false); setClosing(false); }, 300); return () => clearTimeout(t);
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  return mounted && p.current ? <Sheet closing={closing} /> : null;
}

/** Render once, inside <MusicPlayerProvider>. Shows nothing until something is queued or playing. */
export default function MusicDock() {
  const p = useMusicState();
  if (!p.hasTrack) return null;
  return <><MiniPlayer /><NowPlaying /></>;
}
