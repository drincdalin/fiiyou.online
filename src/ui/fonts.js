// fonts.js: registers a profile's uploaded font (theme.font_file) with the browser.
// The file is downloaded with fetch() and handed to FontFace as bytes, so it needs no CSP `font-src` entry
// (fetch is covered by `connect-src`, which already allows your Supabase origin) and the signed URL's 1h expiry never matters.
import { useEffect, useState } from 'react';
import { media } from '../index.js';

const loaded = new Map();   // family -> Promise<void>

/** Resolves to the CSS family name, or null when it could not load (callers then keep the fallback font stack). */
export async function loadFont(path) {
  if (!path) return null;
  // Unique per file, so two profiles (or an old and a new upload) can never collide on one family name.
  const family = 'uf-' + path.split('/').pop().replace(/\.\w+$/, '');
  if (!loaded.has(family)) {
    loaded.set(family, (async () => {
      const url = await media.signedUrl(path, 'fonts');
      if (!url) throw new Error('no url');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`font ${res.status}`);
      document.fonts.add(await new FontFace(family, await res.arrayBuffer(), { display: 'swap' }).load());
    })());
  }
  try { await loaded.get(family); return family; } catch { loaded.delete(family); return null; }
}

/** React hook: the family name for `path` (null while loading, when empty, or on failure). */
export function useCustomFont(path) {
  const [family, setFamily] = useState(null);
  useEffect(() => {
    let on = true;
    setFamily(null);
    if (path) loadFont(path).then((f) => on && setFamily(f));
    return () => { on = false; };
  }, [path]);
  return family;
}
