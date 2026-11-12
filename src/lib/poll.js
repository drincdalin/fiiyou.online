/** Runs fn every `ms`, but only while the tab is visible (a hidden tab makes no requests). Coming back to the tab runs it once
 *  if the last run is older than ms / 2. Returns a stop function. */
export function visiblePoll(fn, ms) {
  let t = 0, last = Date.now();
  const run = () => { if (document.hidden) return; last = Date.now(); fn(); };
  const start = () => { clearInterval(t); t = setInterval(run, ms); };
  const vis = () => { if (document.hidden) { clearInterval(t); t = 0; } else { if (Date.now() - last > ms / 2) run(); start(); } };
  start(); document.addEventListener('visibilitychange', vis);
  return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
}

/** Collapses a burst of calls (Realtime sends one event per changed row) into a single call `ms` after the last one. */
export function debounce(fn, ms = 800) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}
