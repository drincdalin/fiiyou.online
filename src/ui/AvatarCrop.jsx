import { Component, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from '@phosphor-icons/react';
import { loadImageSource } from '../lib/imageSource.js';
import './avatarCrop.css';

const VIEW = 300;       // CSS pixels of the square
const CANVAS = 600;     // preview canvas pixels (2x for sharpness)
const OUT = 512;        // exported square

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function drawSquare(ctx, bmp, zoom, offset) {
  const base = Math.max(VIEW / bmp.width, VIEW / bmp.height);
  const scale = base * zoom;
  const iw = bmp.width * scale, ih = bmp.height * scale;
  const x0 = (VIEW - iw) / 2 + offset.x;
  const y0 = (VIEW - ih) / 2 + offset.y;
  ctx.clearRect(0, 0, VIEW, VIEW);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp.source, x0, y0, iw, ih);
}

function makeBlob(canvas) {
  // JPEG first: every iPhone Safari can write it. WebP encoding is still unreliable there, and the
  // server re-encodes the crop anyway, so there is nothing to gain from choosing WebP here.
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => {
        if (b) return resolve(b);
        canvas.toBlob((png) => resolve(png || null), 'image/png');   // last resort (no alpha needed, but always works)
      }, 'image/jpeg', 0.92);
    } catch { resolve(null); }
  });
}

/** Anything unexpected inside the dialog stays inside the dialog instead of replacing the whole app with
 *  "Something broke." The page and the photo the person picked are untouched, and they can simply close it. */
class CropBoundary extends Component {
  state = { e: null };
  static getDerivedStateFromError(e) { return { e }; }
  render() {
    if (!this.state.e) return this.props.children;
    return createPortal(
      <div className="acmodal" role="presentation">
        <div className="acpanel" role="dialog" aria-modal="true" aria-label="Profile picture">
          <div className="achead"><h3>Profile picture</h3><button type="button" className="acclose" aria-label="Close" title="Close" onClick={this.props.onCancel}><X size={18} weight="bold" aria-hidden="true" /></button></div>
          <p className="acerr" role="alert">That picture could not be prepared on this phone. Try again, or pick a JPEG photo.</p>
          <div className="acactions"><button type="button" className="ghost" onClick={this.props.onCancel}>Close</button></div>
        </div>
      </div>,
      document.body,
    );
  }
}

/** Square crop for a profile picture. Drag to move, slider (or wheel) to zoom. */
function CropDialog({ file, onCancel, onDone, title = 'Crop profile picture' }) {
  const [bmp, setBmp] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const canvas = useRef(null);
  const bmpRef = useRef(null);
  const drag = useRef(null);
  const zoomRef = useRef(1); zoomRef.current = zoom;
  const offsetRef = useRef(offset); offsetRef.current = offset;

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const image = await loadImageSource(file);
        if (dead) { image.close?.(); return; }
        bmpRef.current?.close?.();
        bmpRef.current = image;
        setBmp(image);
        const base = Math.max(VIEW / image.width, VIEW / image.height);
        const ih = image.height * base;
        setOffset({ x: 0, y: ih > VIEW ? -(ih - VIEW) * 0.15 : 0 });   // portraits start a little above the middle
      } catch (e) { if (!dead) setErr(e.message || 'That picture could not be opened. Try a JPEG or PNG.'); }
    })();
    return () => { dead = true; };
  }, [file]);

  useEffect(() => () => { bmpRef.current?.close?.(); bmpRef.current = null; }, []);

  useEffect(() => {
    const c = canvas.current; if (!c || !bmp) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.setTransform(CANVAS / VIEW, 0, 0, CANVAS / VIEW, 0, 0);
    drawSquare(ctx, bmp, zoom, offset);
  }, [bmp, zoom, offset]);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !saving) onCancel(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onCancel, saving]);

  const scale = () => {
    if (!bmp) return 1;
    return Math.max(VIEW / bmp.width, VIEW / bmp.height) * zoomRef.current;
  };
  const limits = () => {
    if (!bmp) return { x: 0, y: 0 };
    const s = scale();
    return { x: Math.max(0, (bmp.width * s - VIEW) / 2), y: Math.max(0, (bmp.height * s - VIEW) / 2) };
  };
  const move = (nx, ny) => {
    const l = limits();
    setOffset({ x: clamp(nx, -l.x, l.x), y: clamp(ny, -l.y, l.y) });
  };
  const down = (e) => {
    if (!bmp) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const dragMove = (e) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    move(d.ox + (e.clientX - d.x), d.oy + (e.clientY - d.y));
  };
  const up = (e) => { if (drag.current?.id === e.pointerId) drag.current = null; };

  const setZoomSafe = (z) => {
    const next = clamp(Number(z) || 1, 1, 3);
    setZoom(next);
    const base = bmp ? Math.max(VIEW / bmp.width, VIEW / bmp.height) : 1;
    const s = base * next;
    const lx = bmp ? Math.max(0, (bmp.width * s - VIEW) / 2) : 0;
    const ly = bmp ? Math.max(0, (bmp.height * s - VIEW) / 2) : 0;
    setOffset((o) => ({ x: clamp(o.x, -lx, lx), y: clamp(o.y, -ly, ly) }));
  };

  const save = async () => {
    if (!bmp || saving) return;
    setSaving(true); setErr('');
    try {
      const s = scale();
      const x0 = (VIEW - bmp.width * s) / 2 + offsetRef.current.x;
      const y0 = (VIEW - bmp.height * s) / 2 + offsetRef.current.y;
      const out = document.createElement('canvas'); out.width = out.height = OUT;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('This phone could not prepare the picture. Try a smaller photo.');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp.source, (-x0) / s, (-y0) / s, VIEW / s, VIEW / s, 0, 0, OUT, OUT);
      const blob = await makeBlob(out);
      if (!blob) throw new Error('Could not crop that picture. Try a different photo.');
      await onDone(blob);
      setSaving(false);
    } catch (e) { setErr(e.message || 'Could not save that crop.'); setSaving(false); }
  };

  return createPortal(
    <div className="acmodal" role="presentation">
      <div className="acpanel" role="dialog" aria-modal="true" aria-labelledby="ac-title">
        <div className="achead"><h3 id="ac-title">{title}</h3><button type="button" className="acclose" aria-label="Close" title="Close" onClick={onCancel}><X size={18} weight="bold" aria-hidden="true" /></button></div>
        <div className="accrop">
          <canvas ref={canvas} width={CANVAS} height={CANVAS} className="accanvas" aria-label="Drag the picture to choose the crop"
            onPointerDown={down} onPointerMove={dragMove} onPointerUp={up} onPointerCancel={up}
            onWheel={(e) => { e.preventDefault(); setZoomSafe(zoom + (e.deltaY > 0 ? -0.06 : 0.06)); }} />
          <span className="acguide" aria-hidden="true" />
        </div>
        <label className="aczoom"><span>Zoom</span><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(e) => setZoomSafe(e.target.value)} aria-label="Zoom the picture" /><span>{Math.round(zoom * 100)}%</span></label>
        {err && <p className="acerr" role="alert">{err}</p>}
        <p className="achint">Drag to move. Use the slider or the mouse wheel to zoom. The square is what people will see.</p>
        <div className="acactions"><button type="button" className="ghost" onClick={onCancel} disabled={saving}>Cancel</button><button type="button" className="primary" onClick={save} disabled={!bmp || saving}>{saving ? 'Saving…' : <><Check size={16} weight="bold" aria-hidden="true" />Use photo</>}</button></div>
      </div>
    </div>,
    document.body,
  );
}

export default function AvatarCrop(props) {
  return <CropBoundary onCancel={props.onCancel}><CropDialog {...props} /></CropBoundary>;
}
