import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// base: '/' on Vercel / a custom domain (leave VITE_BASE unset). Only set VITE_BASE=/<repo>/ for a sub-path deploy.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  let sb = 'https://*.supabase.co', ws = 'wss://*.supabase.co';
  try { const u = new URL(env.VITE_SUPABASE_URL); sb = u.origin; ws = `wss://${u.host}`; } catch { /* keep wildcard */ }
  const site = (env.SITE_URL || '').replace(/\/+$/, '');
  // Production-only Content-Security-Policy, shipped as a <meta> tag.
  // Scripts only from this site; no inline scripts; no plugins; network only to Supabase, OSM search, YouTube (nocookie) embeds.
  const csp = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", `img-src 'self' data: blob: ${sb} https://tile.openstreetmap.org`,
    "media-src 'self' blob: https:", "font-src 'self'", `connect-src 'self' ${sb} ${ws} https://nominatim.openstreetmap.org`, 'frame-src https://www.youtube-nocookie.com',
    "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');
  // No canonical / og:url here: index.html is served for every path (/map, /<username>, ...), so a fixed "/" would mark every page as a copy of the home page.
  const seo = site ? `<meta property="og:image" content="${site}/og-image.png"><meta name="twitter:image" content="${site}/og-image.png">` : '';
  const base = env.VITE_BASE || '/';
  // The manifest, theme-color and icons (favicon, apple-touch-icon) are declared in index.html, so they are NOT injected again here.
  // Only the "installed app" meta tags live here.
  const appTags = [
    { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'fiiyou' }, injectTo: 'head' },
  ];
  return {
    base,
    plugins: [react(), {
      name: 'fiiyou-html',
      transformIndexHtml(html, ctx) {
        const prod = !ctx.server;
        return { html: html.replace('<!--CSP-->', prod ? `<meta http-equiv="Content-Security-Policy" content="${csp}">` : '').replace('<!--SEO-->', seo), tags: appTags };
      },
    }],
    build: { sourcemap: false, chunkSizeWarningLimit: 700 },
  };
});
