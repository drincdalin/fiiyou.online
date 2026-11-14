/** Shared loading and empty states, so every list in the app waits and comes up empty the same way.
 *  Loading shows the SHAPE of what is coming (rows with a picture and two lines), so the page does not jump when the data arrives.
 *  Empty states say what is missing in one line, and offer the next step when there is one. */

/** A small round spinner. Fixed, even size, rotates with transform only, so it never moves the text next to it. */
export function Spinner({ size = 16, className = '' }) {
  return <span className={`spin ${className}`.trim()} style={{ '--spin': `${size}px` }} aria-hidden="true" />;
}

/** Placeholder rows for people, friends, blocked users, likes... */
export function RowsSkeleton({ n = 4, label = 'Loading' }) {
  return (
    <div className="rowsk" role="status" aria-busy="true">
      <span className="sronly">{label}</span>
      {Array.from({ length: n }, (_, k) => (
        <div className="row rowsk-row" key={k} aria-hidden="true">
          <i className="skav" />
          <span className="rowsk-lines"><i className={`skln ${k % 2 ? 'w70' : 'w90'}`} /><i className="skln w50" /></span>
        </div>
      ))}
    </div>
  );
}

/** Placeholder lines for a notification list. */
export function NoticeSkeleton({ n = 3, label = 'Loading notifications' }) {
  return (
    <div className="rowsk rowsk-flush" role="status" aria-busy="true">
      <span className="sronly">{label}</span>
      {Array.from({ length: n }, (_, k) => (
        <div className="rowsk-row rowsk-notice" key={k} aria-hidden="true">
          <i className="skav" />
          <span className="rowsk-lines"><i className="skln w90" /><i className="skln w50" /></span>
        </div>
      ))}
    </div>
  );
}

/** Centred spinner for a whole page or panel that is still loading. */
export function PageLoading({ label = 'Loading' }) {
  return <div className="boot" role="status"><Spinner size={28} /><span className="sronly">{label}</span></div>;
}

/** Nothing here yet: a quiet icon, a one-line title, an optional hint and an optional next step. */
export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty emptystate">
      {Icon && <span className="emptyic" aria-hidden="true"><Icon size={22} weight="regular" /></span>}
      <p className="emptyt">{title}</p>
      {children && <small className="emptyh">{children}</small>}
      {action}
    </div>
  );
}
