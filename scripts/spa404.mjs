// Runs after `vite build`. Static hosts that cannot rewrite every path to index.html (GitHub Pages) serve 404.html for unknown paths,
// so copying index.html there makes deep links like /invite/dalin, /dalin or /post/<id> open the app instead of a "404" page.
// Hosts with a rewrite rule (Vercel, see vercel.json) never use it.
import { copyFileSync, existsSync } from 'node:fs';
if (existsSync('dist/index.html')) { copyFileSync('dist/index.html', 'dist/404.html'); console.log('[spa404] dist/404.html written (deep-link fallback)'); }
