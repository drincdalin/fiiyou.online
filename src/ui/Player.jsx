import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsOut, Check, ListPlus } from '@phosphor-icons/react';
import { MUSIC_CONFIG as CFG } from '../lib/musicConfig.js';
import { makeTrack } from '../lib/playerQueue.js';
import { fmtTime } from '../lib/youtube.js';
import { useMusicActions, useMusicClock, useMusicState } from './musicPlayer.jsx';
import { CoverImg, Eq, PlayGlyph, Scrubber, VolumeIcon, useCover } from './playerParts.jsx';

/* The profile's music card. It is only a remote control now: the sound lives in the global player (musicPlayer.jsx), so the song keeps playing
   when you leave this profile, and a mini player appears at the bottom. The markup keeps the classes the page layouts, Fine-tune CSS and
   sticker anchors already target (.player .pcover .ptitle .seek .times .ctrl .volrow, data-cid, {children}).

   src: a YouTube link (the only supported source; uploaded and direct audio files were removed). Nothing is requested from YouTube until the visitor presses play (unless autoThumbnail is on, see musicConfig.js). */

/** Seek bar + times for this card. Its own component so only it re-renders 4x a second while the song plays. */
const CardProgress = memo(function CardProgress({ mine }) {
  const a = useMusicActions(); const { position, duration, buffered } = useMusicClock();
  const live = mine && duration > 0; const pos = mine ? position : 0; const dur = mine ? duration : 0;
  return (
    <>
      <Scrubber className="seek" value={pos} max={dur || 1} buffered={mine ? buffered : 0} step={5} disabled={!live} label="Seek" valueText={live ? `${fmtTime(pos)} of ${fmtTime(dur)}` : 'Press play to start'} onCommit={(v) => a.seek(v)} />
      <div className="times"><span>{fmtTime(pos)}</span><span>{live ? `-${fmtTime(Math.max(0, dur - pos))}` : '--:--'}</span></div>
    </>
  );
});

export default function Player({ src, title, artist, cover, cid, children }) {
  const track = useMemo(() => makeTrack({ src, title, artist, cover }, 'card'), [src, title, artist, cover]);
  const p = useMusicState(); const a = useMusicActions();
  const mine = !!track && !!p.current && p.current.key === track.key;
  const playing = mine && p.playing; const busy = mine && p.busy;
  const pic = useCover(track, CFG.autoThumbnail || mine);
  const [added, setAdded] = useState(false); const addTimer = useRef(0);
  useEffect(() => () => clearTimeout(addTimer.current), []);
  if (!track) return null;

  const hasCover = !!(cover || (track.videoId && (CFG.autoThumbnail || mine)));
  const shownTitle = (mine && p.current.title) || title || 'Untitled'; const shownArtist = (mine && p.current.artist) || artist || '';
  const shownVol = p.muted ? 0 : p.volume;
  const press = () => { if (track.kind === 'yt') a.preload(); };
  const toggle = () => { if (mine) a.toggle(); else a.play(track); };
  const queueIt = () => { const n = p.hasTrack ? a.enqueue(track) : (a.play(track) ? 1 : 0); if (!n) return; setAdded(true); clearTimeout(addTimer.current); addTimer.current = setTimeout(() => setAdded(false), 1600); };
  const open = () => { if (!mine) a.play(track); a.setExpanded(true); };

  return (
    <div className={`player mpcard${hasCover ? '' : ' nocover'}`} data-cid={cid} data-playing={playing || undefined}>
      {hasCover && (
        <div className="pcover">
          <button type="button" className="pplay" onPointerDown={press} onClick={toggle} aria-label={`${playing ? 'Pause' : 'Play'} ${shownTitle}`}>
            <CoverImg cover={pic} className="cover" />
            <span className="pbadge"><span className="mp-badge"><PlayGlyph playing={playing} busy={busy} size="1.5rem" /></span></span>
            {playing && <span className="mp-cardeq"><Eq active /></span>}
          </button>
        </div>
      )}
      <div className="ptitle"><b>{shownTitle}</b><span>{shownArtist}</span></div>
      <CardProgress mine={mine} />
      <div className="ctrl">
        <button type="button" onClick={queueIt} aria-label={added ? 'Added to queue' : p.hasTrack ? 'Add to queue' : 'Play'} title={added ? 'Added to queue' : 'Add to queue'}>{added ? <Check size="1.2rem" weight="bold" /> : <ListPlus size="1.2rem" weight="bold" />}</button>
        <button type="button" className="big" onPointerDown={press} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}><PlayGlyph playing={playing} busy={busy} size="1.5rem" /></button>
        <button type="button" onClick={open} aria-label="Open player" title="Open player"><ArrowsOut size="1.2rem" weight="bold" /></button>
      </div>
      {mine && p.status === 'error' && <small className="mp-cardnote" role="alert">{p.error && p.error.message}</small>}
      {mine && p.status === 'blocked' && <small className="mp-cardnote" role="status">Your browser blocked autoplay: press play again.</small>}
      <div className="volrow">
        <button type="button" className="volbtn" onClick={a.toggleMute} aria-label={p.muted || p.volume === 0 ? 'Unmute' : 'Mute'} title={p.muted || p.volume === 0 ? 'Unmute' : 'Mute'}><VolumeIcon level={shownVol} size="1.2rem" /></button>
        <Scrubber className="vol" value={shownVol} max={1} step={0.05} label="Volume" valueText={`${Math.round(shownVol * 100)}%`} onScrub={a.setVolume} onCommit={a.setVolume} />
        <span className="volpct">{Math.round(shownVol * 100)}%</span>
      </div>
      {children}
    </div>
  );
}
