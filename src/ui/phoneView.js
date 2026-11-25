import { useEffect, useRef, useState } from 'react';
import { cleanPhoneLayout, cleanPhoneTheme } from '../lib/phoneLayout.js';

const PHONE_MEDIA = '(max-width: 700px)';

const phoneMq = () => (typeof matchMedia === 'function' ? matchMedia(PHONE_MEDIA) : null);

/** Whether the viewport ITSELF is phone-sized (max-width: 700px). On such a screen the customizer
 *  edits the phone layout directly: no Desktop|Phone switch and no preview frame. Updates on resize. */
export function usePhoneViewport() {
  const [on, setOn] = useState(() => !!phoneMq()?.matches);
  useEffect(() => {
    const update = () => setOn(!!phoneMq()?.matches);
    const mq = phoneMq();
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', update); else mq.addListener?.(update); }
    window.addEventListener('resize', update);
    return () => {
      if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', update); else mq.removeListener?.(update); }
      window.removeEventListener('resize', update);
    };
  }, []);
  return on;
}

/** True when this document is a PREVIEW of a profile: it runs inside another page's iframe, or it
 *  was opened with ?view=phone. Such a page never edits itself: it mounts no customizer, opens no
 *  preview of its own and never starts in edit mode (that is how previews nested endlesslessly). */
export function isPreviewDoc() {
  if (typeof window === 'undefined') return false;
  if (window.parent !== window) return true;
  try { return new URLSearchParams(window.location.search).get('view') === 'phone'; } catch { return false; }
}

/** True when this preview may also report phone sticker drags (?view=phone&edit=1, set by the
 *  customizer's preview iframe). Everywhere else stickers are read-only. */
export function isPhoneEdit() {
  if (!isPreviewDoc()) return false;
  try { return new URLSearchParams(window.location.search).get('edit') === '1'; } catch { return false; }
}

/** Whether a profile renders its PHONE layout. True when the viewport is phone-sized
 *  (max-width: 700px, the same breakpoint the phone CSS uses) OR the customizer's phone
 *  preview is requested via ?view=phone. Updates on resize; desktop widths are unchanged
 *  while the flag is absent. */
export function usePhoneView() {
  const read = () => {
    if (typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches) return true;
    try { return new URLSearchParams(window.location.search).get('view') === 'phone'; } catch { return false; }
  };
  const [on, setOn] = useState(read);
  useEffect(() => {
    const update = () => setOn(read());
    if (typeof matchMedia === 'function') {
      const mq = matchMedia('(max-width: 700px)');
      if (mq.addEventListener) mq.addEventListener('change', update); else mq.addListener?.(update);
      window.addEventListener('resize', update);
      window.addEventListener('popstate', update);   // Back/Forward can carry a different query string
      return () => {
        if (mq.removeEventListener) mq.removeEventListener('change', update); else mq.removeListener?.(update);
        window.removeEventListener('resize', update);
        window.removeEventListener('popstate', update);
      };
    }
    return undefined;
  }, []);
  return on;
}

/** Live unsaved phone-layout overrides streamed by the customizer's preview iframe
 *  (postMessage 'fiiyou:phone-draft'). Listens ONLY while the phone view is on AND this
 *  document runs inside an iframe; a message is accepted only from our own origin and from
 *  the parent frame, and every value is cleaned with the same normalisers used for saved
 *  data (bad values are dropped, never thrown). Returns
 *  { cards: { [cardId]: phone_layout }, phoneTheme: object | null } or null when nothing
 *  has arrived (or the listener is not active). Re-renders only when the draft changes. */
export function usePhoneDraft(cards, phoneView) {
  const [draft, setDraft] = useState(null);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;   // keep the latest card list (for type lookup) without re-registering
  useEffect(() => {
    if (!phoneView || typeof window === 'undefined' || window.parent === window) return undefined;
    const onMessage = (event) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || data.type !== 'fiiyou:phone-draft') return;
      let next = null;
      try {
        const overrides = {};
        for (const row of (Array.isArray(data.cards) ? data.cards : [])) {
          if (!row || typeof row !== 'object' || typeof row.id !== 'string') continue;
          const card = cardsRef.current?.find((c) => c.id === row.id);
          if (!card) continue;   // a card id we do not have is ignored
          overrides[row.id] = cleanPhoneLayout(card, row.phone_layout);   // {} clears the saved layout
        }
        const phoneTheme = 'phone_theme' in data ? cleanPhoneTheme(data.phone_theme) : null;
        next = { cards: overrides, phoneTheme };
      } catch { return; }
      setDraft((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [phoneView]);
  return draft;
}
