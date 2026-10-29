import { useEffect, useRef, useState } from 'react';
import { saveDraft, clearDraft, loadDraft, mergeDraft } from '../lib/draftStore.js';

/** Saves the editor draft to this browser while it is open and changed. userId = the signed-in person's id (null = not their own page).
 *  The first value seen after the editor opens is the baseline: nothing is stored until something actually changes. */
export function useDraftAutosave(userId, draft) {
  const base = useRef(null); const latest = useRef({ userId, draft, dirty: false });
  if (!draft) base.current = null; else if (base.current === null) base.current = JSON.stringify(draft);
  const dirty = !!draft && !!userId && JSON.stringify(draft) !== base.current;
  latest.current = { userId, draft, dirty };
  useEffect(() => { if (!dirty) return; const t = setTimeout(() => saveDraft(userId, draft), 500); return () => clearTimeout(t); }, [draft, dirty, userId]);
  useEffect(() => {   // leaving the page (or this view) within the debounce window must not lose the last edits
    const flush = () => { const x = latest.current; if (x.dirty) saveDraft(x.userId, x.draft); };
    const vis = () => { if (document.visibilityState === 'hidden') flush(); };
    addEventListener('pagehide', flush); document.addEventListener('visibilitychange', vis);
    return () => { removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', vis); flush(); };
  }, []);
}

const when = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : 'yesterday'; };

/** "You have unsaved changes": offers to bring the autosaved draft back into the editor, or throw it away. */
export function DraftRestoreBar({ userId, buildFresh, onRestore }) {
  const [saved, setSaved] = useState(() => loadDraft(userId));
  if (!saved) return null;
  const restore = () => { onRestore(mergeDraft(saved.draft, buildFresh())); setSaved(null); };   // the stored copy stays until you save or discard in the editor
  const drop = () => { clearDraft(userId); setSaved(null); };
  return (<div className="draftbar" role="status"><span>You have unsaved changes to your page from {when(saved.t)}.</span>
    <span className="acts"><button type="button" className="primary sm" onClick={restore}>Restore</button><button type="button" className="ghost sm" onClick={drop}>Discard</button></span></div>);
}
