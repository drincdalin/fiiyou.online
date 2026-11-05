// Vercel Routing Middleware (https://vercel.com/docs/routing-middleware): runs in front of the website before a page is served.
// One job: a visitor who sends far more requests than any person could (a script, a flood from one address) gets "429 Too many requests"
// instead of the page. Everything else passes straight through. It can never take the site down by itself: any error inside it lets
// the request through. Static files (/assets, /fonts, /icons, images, scripts, styles) are served from the CDN and do not pass here.
// Tune with Vercel environment variables RATE_LIMIT_BURST (default 240) and RATE_LIMIT_PER_SECOND (default 4, i.e. 240 a minute).
// The defaults are generous on purpose: a whole school class sharing one network address must not be locked out.
import { next } from '@vercel/functions';
import { createLimiter } from './src/lib/ratelimit.js';

const take = createLimiter({ burst: Number(process.env.RATE_LIMIT_BURST) || 240, perSec: Number(process.env.RATE_LIMIT_PER_SECOND) || 4 });

export default function middleware(request) {
  try {
    const ip = request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    if (!ip) return next();   // cannot tell who it is: let it through
    const r = take(ip);
    if (r.ok) return next();
    return new Response('Too many requests. Please wait a moment and try again.', { status: 429, headers: { 'Retry-After': String(r.retry), 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
  } catch {
    return next();
  }
}

export const config = { matcher: ['/((?!assets/|fonts/|icons/|favicon|.*\\.(?:png|jpg|jpeg|webp|gif|svg|ico|woff2?|js|mjs|css|map|txt|xml|webmanifest)$).*)'] };
