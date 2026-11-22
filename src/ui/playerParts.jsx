import { useEffect, useRef, useState } from 'react';
import { CircleNotch, Pause, Play, SpeakerHigh, SpeakerLow, SpeakerNone, SpeakerX } from '@phosphor-icons/react';
import { probeYtCover } from '../lib/youtube.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A url() value that cannot break out of the CSS string it is placed in. */
export const cssUrl = (u) => (u ? `url("${String(u).replace(/["\\\n\r]/g, encodeURIComponent)}")` : 'none');

/** The best cover for a track: its own uploaded cover, else the best YouTube thumbnail that really exists. null while unknown / not allowed to look.
 *  `remote=false` = do not ask YouTube for a picture (privacy switch in musicConfig.js). */
export function useCover(track, remote = true) {
  const own = track && track.cover; const id = track && track.videoId;
  const [res, setRes] = useState(() => (own ? { url: own, lb: false } : null));
  useEffect(() => {
    if (own) { setRes({ url: own, lb: false }); return undefined; }
    setRes(null);
    if (!id || !remote) return undefined;
    let live = true; probeYtCover(id).then((r) => { if (live) setRes(r); });
    return () => { live = false; };
  }, [own, id, remote]);
  return res;
}

/** The cover picture, or a soft placeholder. `lb` pictures (YouTube's 4:3 frames with black bars) are zoomed so the bars fall outside the square. */
export function CoverImg({ cover, className = '' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [cover && cover.url]);
  if (!cover || broken) return <span className={`${className} ph`} aria-hidden="true" />;
  return <img className={`${className}${cover.lb ? ' lb' : ''}`} src={cover.url} alt="" draggable={false} decoding="async" onError={() => setBroken(true)} />;
}

/** Three bars that dance while playing. */
export const Eq = ({ active }) => <span className={`mp-eq${active ? ' on' : ''}`} aria-hidden="true"><i /><i /><i /></span>;

export function VolumeIcon({ level, ...p }) {
  const I = level <= 0 ? SpeakerX : level < 0.2 ? SpeakerNone : level < 0.6 ? SpeakerLow : SpeakerHigh;
  return <I weight="fill" {...p} />;
}

/** Play / pause / spinner, picked from the player state. */
export function PlayGlyph({ playing, busy, size = '1.5em' }) {
  if (busy) return <CircleNotch className="mp-spin" size={size} weight="bold" />;
  return playing ? <Pause size={size} weight="fill" /> : <Play size={size} weight="fill" />;
}

/** The seek / volume bar. Pointer (mouse, touch, pen) and keyboard, announced as a slider.
 *  onScrub(v) fires while dragging, onCommit(v) once on release (and for every key press). value/max/buffered are plain numbers. */
export function Scrubber({ value = 0, max = 1, buffered = 0, step = 5, disabled = false, label, valueText, onScrub, onCommit, className = '' }) {
  const ref = useRef(null); const [drag, setDrag] = useState(null);
  const shown = drag == null ? value : drag; const pct = max > 0 ? clamp(shown / max, 0, 1) * 100 : 0;
  const at = (e) => { const r = ref.current.getBoundingClientRect(); return r.width > 0 ? clamp((e.clientX - r.left) / r.width, 0, 1) * max : 0; };
  const down = (e) => { if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return; e.currentTarget.setPointerCapture(e.pointerId); const v = at(e); setDrag(v); if (onScrub) onScrub(v); };
  const move = (e) => { if (drag == null) return; const v = at(e); setDrag(v); if (onScrub) onScrub(v); };
  const up = (e) => { if (drag == null) return; const v = at(e); setDrag(null); if (onCommit) onCommit(v); };
  const key = (e) => {
    if (disabled) return; const big = step * 2; let v = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = value - step; else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = value + step;
    else if (e.key === 'PageDown') v = value - big; else if (e.key === 'PageUp') v = value + big; else if (e.key === 'Home') v = 0; else if (e.key === 'End') v = max;
    if (v == null) return; e.preventDefault(); e.stopPropagation(); if (onCommit) onCommit(clamp(v, 0, max));
  };
  return (
    <div ref={ref} className={`mp-scrub ${className}${drag != null ? ' dragging' : ''}${disabled ? ' off' : ''}`} role="slider" tabIndex={disabled ? -1 : 0}
      aria-label={label} aria-disabled={disabled || undefined} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(shown)} aria-valuetext={valueText}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)} onKeyDown={key}>
      <span className="mp-scrub-rail"><i className="mp-scrub-buf" style={{ width: `${clamp(buffered, 0, 1) * 100}%` }} /><i className="mp-scrub-fill" style={{ width: `${pct}%` }} /></span>
      <b className="mp-scrub-thumb" style={{ left: `${pct}%` }} />
    </div>
  );
}
