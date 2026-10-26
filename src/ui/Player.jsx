import { useEffect, useRef, useState } from 'react';

const PATHS = {
  play: <path d="M8 5v14l11-7z" />,
  pause: <path d="M6 5h4v14H6zM14 5h4v14h-4z" />,
  prev: <path d="M6 5h2v14H6zM20 5v14L9 12z" />,
  next: <path d="M16 5h2v14h-2zM4 5v14l11-7z" />,
  mute: <><path d="M4 9v6h4l5 4V5L8 9z" /><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 9l5 6M21 9l-5 6" /></>,
  low: <path d="M4 9v6h4l5 4V5L8 9z" />,
  mid: <><path d="M4 9v6h4l5 4V5L8 9z" /><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 9a4 4 0 010 6" /></>,
  high: <><path d="M4 9v6h4l5 4V5L8 9z" /><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" /></>,
};
const Icon = ({ n, size = '1em' }) => <svg className="ico" viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">{PATHS[n]}</svg>;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// src must be a direct https audio URL. Nothing loads until the visitor presses play (privacy + bandwidth).
const ytId = (u) => { try { const x = new URL(u); const id = x.hostname === 'youtu.be' ? x.pathname.slice(1)
  : /(^|\.)youtube\.com$/.test(x.hostname) ? x.searchParams.get('v') : null; return /^[\w-]{11}$/.test(id || '') ? id : null; } catch { return null; } };

export default function Player({ src, title, artist, cover }) {
  const yt = ytId(src); const [open, setOpen] = useState(false);
  if (yt) return (  // YouTube: nothing loads (no tracking) until the visitor clicks play
    <div className="player">
      {cover && <img className="cover" src={cover} alt="" />}
      <div className="ptitle"><b>{title || 'Untitled'}</b><span>{artist}</span></div>
      {open ? <iframe className="yt" title="player" src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0`}
        allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />
        : <div className="ctrl"><button className="big" onClick={() => setOpen(true)} aria-label="Play"><Icon n="play" size="1.5rem" /></button></div>}
    </div>);
  return <AudioPlayer {...{ src, title, artist, cover }} />;
}

function AudioPlayer({ src, title, artist, cover }) {
  const a = useRef(); const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0); const [dur, setDur] = useState(0); const [vol, setVol] = useState(0.7);
  const [muted, setMuted] = useState(false);
  useEffect(() => { if (a.current) { a.current.volume = vol; a.current.muted = muted; } }, [vol, muted]);
  const shown = muted ? 0 : Math.round(vol * 100);
  const icon = <Icon n={shown === 0 ? 'mute' : shown < 34 ? 'low' : shown < 67 ? 'mid' : 'high'} size="1.2rem" />;
  const toggle = () => { const el = a.current; if (el.paused) el.play().catch(() => {}); else el.pause(); };
  return (
    <div className="player">
      {cover && <img className="cover" src={cover} alt="" />}
      <div className="ptitle"><b>{title || 'Untitled'}</b><span>{artist}</span></div>
      <audio ref={a} src={src} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.target.currentTime)} onLoadedMetadata={(e) => setDur(e.target.duration)} />
      <input className="seek" type="range" min="0" max={dur || 1} step="0.1" value={t}
        onChange={(e) => { a.current.currentTime = +e.target.value; }} aria-label="Seek" />
      <div className="times"><span>{fmt(t)}</span><span>-{fmt(Math.max(0, dur - t))}</span></div>
      <div className="ctrl">
        <button onClick={() => { a.current.currentTime = 0; }} aria-label="Restart"><Icon n="prev" size="1.2rem" /></button>
        <button className="big" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}><Icon n={playing ? 'pause' : 'play'} size="1.5rem" /></button>
        <button onClick={() => { a.current.currentTime = Math.min(dur, t + 10); }} aria-label="Forward 10s"><Icon n="next" size="1.2rem" /></button>
      </div>
      <div className="volrow">
        <button className="volbtn" onClick={() => setMuted(!muted)} aria-label={muted || vol === 0 ? 'Unmute' : 'Mute'} title={muted || vol === 0 ? 'Unmute' : 'Mute'}>{icon}</button>
        <input className="vol" type="range" min="0" max="100" step="1" value={shown} onChange={(e) => { setVol(+e.target.value / 100); setMuted(false); }} aria-label="Volume" />
        <span className="volpct">{shown}%</span>
      </div>
    </div>
  );
}
