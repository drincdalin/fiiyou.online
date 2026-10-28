// Writes public/robots.txt and public/sitemap.xml for the real domain. Runs automatically before `npm run build`.
// Set SITE_URL (e.g. https://fiiyou.online, no trailing slash). Without it the committed placeholder files are left alone.
import { writeFileSync } from 'node:fs';
const site = (process.env.SITE_URL || '').replace(/\/+$/, '');
if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(site)) {
  // On a real production deploy a missing SITE_URL would publish sitemap.xml / robots.txt with the YOUR-DOMAIN placeholder: stop the build instead.
  if (process.env.VERCEL_ENV === 'production' || process.env.CI_REQUIRE_SITE_URL === '1') { console.error('[seo] SITE_URL is not set (https://your-domain, no trailing slash). Set it in the Vercel environment variables and redeploy.'); process.exit(1); }
  console.warn('[seo] SITE_URL not set (or not https): robots.txt and sitemap.xml keep their placeholder domain.'); process.exit(0);
}
const day = new Date().toISOString().slice(0, 10);
const urls = [['/', 'monthly', '1.0'], ['/privacy.html', 'yearly', '0.3'], ['/terms.html', 'yearly', '0.3']];
writeFileSync('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, f, pr]) => `  <url><loc>${site}${p}</loc><lastmod>${day}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`);
writeFileSync('public/robots.txt', `# fiiyou: everything except the landing page is behind a login, so there is nothing else to index.\nUser-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
console.log(`[seo] wrote sitemap.xml and robots.txt for ${site}`);
