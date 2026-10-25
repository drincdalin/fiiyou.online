import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// base: '/' for a custom domain or <user>.github.io. For https://<user>.github.io/<repo>/ set VITE_BASE=/<repo>/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  let sb = 'https://*.supabase.co', ws = 'wss://*.supabase.co';
  try { const u = new URL(env.VITE_SUPABASE_URL); sb = u.origin; ws = `wss://${u.host}`; } catch { /* keep wildcard */ }
  const site = (env.SITE_URL || '').replace(/\/+$/, '');
  // Production-only Content-Security-Policy (GitHub Pages cannot send headers, so it ships as a <meta> tag).
  // Scripts only from this site; no inline scripts; no plugins; network only to Supabase, OSM search, YouTube (nocookie) embeds.
  const csp = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", `img-src 'self' data: blob: ${sb} https://tile.openstreetmap.org`,
    "media-src 'self' blob: https:", "font-src 'self'", `connect-src 'self' ${sb} ${ws} https://nominatim.openstreetmap.org`, 'frame-src https://www.youtube-nocookie.com',
    "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');
  const seo = site ? `<link rel="canonical" href="${site}/"><meta property="og:url" content="${site}/"><meta property="og:image" content="${site}/og-image.png"><meta name="twitter:image" content="${site}/og-image.png">` : '';
  return {
    base: env.VITE_BASE || '/',
    plugins: [react(), {
      name: 'fiiyou-html',
      transformIndexHtml(html, ctx) {
        const prod = !ctx.server;
        return html.replace('<!--CSP-->', prod ? `<meta http-equiv="Content-Security-Policy" content="${csp}">` : '').replace('<!--SEO-->', seo);
      },
    }],
    build: { sourcemap: false, chunkSizeWarningLimit: 700 },
  };
});
