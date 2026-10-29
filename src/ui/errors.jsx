import { Component, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import './errors.css';

/** Turns raw errors into something a person can act on. Network failures get a plain sentence; everything else keeps its own message. */
export function friendlyError(e, fallback = 'Something went wrong. Please try again.') {
  const msg = String(e?.message ?? e ?? '').trim();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline) return 'You are offline. Check your connection and try again.';
  if (!msg) return fallback;
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|timed? ?out/i.test(msg)) return 'Could not reach the server. Check your connection and try again.';
  return msg;
}

/* ---------- online / offline ---------- */
const subscribe = (cb) => { addEventListener('online', cb); addEventListener('offline', cb); return () => { removeEventListener('online', cb); removeEventListener('offline', cb); }; };
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

/** Slim banner under the top bar while the connection is down, and a short "Back online" afterwards. */
export function OfflineBanner() {
  const online = useOnline(); const [back, setBack] = useState(false); const was = useRef(online);
  useEffect(() => {
    if (online && !was.current) { setBack(true); const t = setTimeout(() => setBack(false), 2500); was.current = online; return () => clearTimeout(t); }
    was.current = online;
  }, [online]);
  if (online && !back) return null;
  return (<div className={`netbar ${online ? 'up' : 'down'}`} role="status" aria-live="polite">
    {online ? 'Back online.' : 'You are offline. What you see may be out of date, and changes will not save until you reconnect.'}</div>);
}

/** Shown where a load failed: says what happened, offers Try again, and retries by itself when the connection comes back. */
export function ErrorState({ error, onRetry, title = 'Could not load this' }) {
  const [busy, setBusy] = useState(false); const retryRef = useRef(onRetry); retryRef.current = onRetry;
  useEffect(() => { const h = () => retryRef.current?.(); addEventListener('online', h); return () => removeEventListener('online', h); }, []);
  const again = () => { setBusy(true); Promise.resolve(onRetry?.()).finally(() => setBusy(false)); };
  return (<div className="errstate" role="alert"><h3>{title}</h3><p>{friendlyError(error)}</p>
    {onRetry && <button type="button" className="primary" onClick={again} disabled={busy}>{busy ? 'Trying…' : 'Try again'}</button>}</div>);
}

/** Last line of defence for a crash while rendering. "Try again" re-renders without losing the page; "Reload" starts over. */
export class Boundary extends Component {
  state = { e: null };
  static getDerivedStateFromError(e) { return { e }; }
  render() {
    const e = this.state.e; if (!e) return this.props.children;
    return (<div className="errstate errfull" role="alert"><h3>Something broke.</h3>
      <p>Your data is safe. Try again, and if it keeps happening, reload the page.</p>
      <div className="erracts"><button type="button" className="primary" onClick={() => this.setState({ e: null })}>Try again</button>
        <button type="button" className="ghost" onClick={() => location.reload()}>Reload</button></div>
      <details><summary>Technical details</summary><pre className="errpre">{String(e.message || e)}</pre></details></div>);
  }
}
