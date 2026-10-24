import { useEffect, useRef, useState } from 'react';
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// src must be a direct https audio URL. Nothing loads until the visitor presses play (privacy + bandwidth).
export default function Player({ src, title, artist, cover }) {
  const a = useRef(); const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0); const [dur, setDur] = useState(0); const [vol, setVol] = useState(0.7);
  useEffect(() => { if (a.current) a.current.volume = vol; }, [vol]);
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
        <button onClick={() => { a.current.currentTime = 0; }} aria-label="Restart">⏮</button>
        <button className="big" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <button onClick={() => { a.current.currentTime = Math.min(dur, t + 10); }} aria-label="Forward 10s">⏭</button>
      </div>
      <input className="vol" type="range" min="0" max="1" step="0.01" value={vol} onChange={(e) => setVol(+e.target.value)} aria-label="Volume" />
    </div>
  );
}
