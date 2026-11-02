import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Stop, SkipBack, FastForward, SpeakerX, SpeakerNone, SpeakerLow, SpeakerHigh } from '@phosphor-icons/react';

const ICONS = { play: Play, pause: Pause, stop: Stop, prev: SkipBack, next: FastForward, mute: SpeakerX, low: SpeakerNone, mid: SpeakerLow, high: SpeakerHigh };
const Icon = ({ n, size = '1em' }) => { const C = ICONS[n]; return <C className="ico" size={size} weight="fill" aria-hidden="true" />; };
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// src must be a direct https audio URL or a YouTube link. Nothing loads until the visitor presses play (privacy + bandwidth).
const ytId = (u) => { try { const x = new URL(u); const id = x.hostname === 'youtu.be' ? x.pathname.slice(1)
  : /(^|\.)youtube\.com$/.test(x.hostname) ? x.searchParams.get('v') : null; return /^[\w-]{11}$/.test(id || '') ? id : null; } catch { return null; } };

export default function Player({ src, title, artist, cover, cid, children }) {
  const yt = ytId(src);
  return yt ? <YouTubePlayer {...{ id: yt, title, artist, cover, cid, children }} /> : <AudioPlayer {...{ src, title, artist, cover, cid, children }} />;
}

/** YouTube: the cover square turns into the video. Nothing from YouTube loads (no tracking) until the visitor presses play. */
function YouTubePlayer({ id, title, artist, cover, cid, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`player${open ? ' live' : ''}`} data-cid={cid}>
      <div className="pcover">
        {open
          ? <iframe className="pyt" title={title || 'Video player'} src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          : <button type="button" className="pplay" onClick={() => setOpen(true)} aria-label={`Play ${title || 'video'}`}>
              {cover ? <img className="cover" src={cover} alt="" /> : <span className="cover ph" />}
              <span className="pbadge"><Icon n="play" size="1.6rem" /></span>
            </button>}
      </div>
      <div className="ptitle"><b>{title || 'Untitled'}</b><span>{artist}</span></div>
      {open && <div className="ctrl"><button onClick={() => setOpen(false)} aria-label="Close video" title="Close video"><Icon n="stop" size="1.2rem" /></button></div>}
      {children}
    </div>
  );
}

function AudioPlayer({ src, title, artist, cover, cid, children }) {
  const a = useRef(); const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0); const [dur, setDur] = useState(0); const [vol, setVol] = useState(0.7);
  const [muted, setMuted] = useState(false);
  useEffect(() => { if (a.current) { a.current.volume = vol; a.current.muted = muted; } }, [vol, muted]);
  const shown = muted ? 0 : Math.round(vol * 100);
  const icon = <Icon n={shown === 0 ? 'mute' : shown < 34 ? 'low' : shown < 67 ? 'mid' : 'high'} size="1.2rem" />;
  const toggle = () => { const el = a.current; if (el.paused) el.play().catch(() => {}); else el.pause(); };
  const ready = dur > 0;   // nothing is downloaded until play is pressed, so seeking is only possible after that
  return (
    <div className={`player${cover ? '' : ' nocover'}`} data-cid={cid}>
      {cover && <div className="pcover"><img className="cover" src={cover} alt="" /></div>}
      <div className="ptitle"><b>{title || 'Untitled'}</b><span>{artist}</span></div>
      <audio ref={a} src={src} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.target.currentTime)} onLoadedMetadata={(e) => setDur(e.target.duration)} />
      <input className="seek" type="range" min="0" max={dur || 1} step="0.1" value={t} disabled={!ready}
        onChange={(e) => { a.current.currentTime = +e.target.value; }} aria-label="Seek" />
      <div className="times"><span>{fmt(t)}</span><span>-{fmt(Math.max(0, dur - t))}</span></div>
      <div className="ctrl">
        <button disabled={!ready} onClick={() => { a.current.currentTime = 0; }} aria-label="Restart"><Icon n="prev" size="1.2rem" /></button>
        <button className="big" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}><Icon n={playing ? 'pause' : 'play'} size="1.5rem" /></button>
        <button disabled={!ready} onClick={() => { a.current.currentTime = Math.min(dur, t + 10); }} aria-label="Forward 10s"><Icon n="next" size="1.2rem" /></button>
      </div>
      <div className="volrow">
        <button className="volbtn" onClick={() => setMuted(!muted)} aria-label={muted || vol === 0 ? 'Unmute' : 'Mute'} title={muted || vol === 0 ? 'Unmute' : 'Mute'}>{icon}</button>
        <input className="vol" type="range" min="0" max="100" step="1" value={shown} onChange={(e) => { setVol(+e.target.value / 100); setMuted(false); }} aria-label="Volume" />
        <span className="volpct">{shown}%</span>
      </div>
      {children}
    </div>
  );
}
