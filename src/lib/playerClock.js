/** The playhead, kept outside React state so a song ticking 4x a second only re-renders the seek bars that subscribe to it.
 *  Shape matches useSyncExternalStore: get() returns the SAME object until something really changed. */
export function createClock() {
  let snap = { position: 0, duration: 0, buffered: 0 };
  const subs = new Set();
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  return {
    get: () => snap,
    set(p) {
      const next = {
        position: p.position === undefined ? snap.position : Math.max(0, num(p.position, 0)),
        duration: p.duration === undefined ? snap.duration : Math.max(0, num(p.duration, 0)),
        buffered: p.buffered === undefined ? snap.buffered : Math.min(1, Math.max(0, num(p.buffered, 0))),
      };
      if (next.position === snap.position && next.duration === snap.duration && next.buffered === snap.buffered) return;
      snap = next; subs.forEach((f) => f());
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}
