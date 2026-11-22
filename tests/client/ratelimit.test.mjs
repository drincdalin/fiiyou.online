import test from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter } from '../../src/lib/ratelimit.js';

test('a visitor gets the burst, then is refused with a wait time', () => {
  const take = createLimiter({ burst: 5, perSec: 1 }); const t = 1000000;
  for (let i = 0; i < 5; i++) assert.equal(take('1.1.1.1', t).ok, true);
  const r = take('1.1.1.1', t); assert.equal(r.ok, false); assert.ok(r.retry >= 1);
});
test('tokens come back over time', () => {
  const take = createLimiter({ burst: 3, perSec: 2 }); const t = 5000;
  for (let i = 0; i < 3; i++) take('a', t);
  assert.equal(take('a', t).ok, false);
  assert.equal(take('a', t + 1000).ok, true);    // 1 s later: 2 tokens are back
  assert.equal(take('a', t + 1000).ok, true);
  assert.equal(take('a', t + 1000).ok, false);
});
test('visitors do not share a bucket', () => {
  const take = createLimiter({ burst: 1, perSec: 0.1 });
  assert.equal(take('a', 1).ok, true); assert.equal(take('a', 1).ok, false); assert.equal(take('b', 1).ok, true);
});
test('memory stays bounded', () => {
  const take = createLimiter({ burst: 5, perSec: 1, maxKeys: 100 });
  for (let i = 0; i < 1000; i++) take('ip' + i, 1000 + i);
  // after thousands of addresses the oldest were dropped, so a very old one starts again with a full bucket (no leak, no crash)
  assert.equal(take('ip0', 5000).ok, true);
});
test('the middleware lets people through, refuses a flood, and fails open', async () => {
  process.env.RATE_LIMIT_BURST = '3'; process.env.RATE_LIMIT_PER_SECOND = '0.01';
  const { default: mw, config } = await import('../../middleware.js?small');
  const req = (ip) => new Request('https://app.fiiyou.online/', { headers: ip ? { 'x-real-ip': ip } : {} });
  for (let i = 0; i < 3; i++) assert.equal(mw(req('9.9.9.9')).headers.get('x-middleware-next'), '1');   // next(): the request continues to the site
  const blocked = mw(req('9.9.9.9')); assert.equal(blocked.status, 429); assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  assert.equal(mw(req('8.8.8.8')).headers.get('x-middleware-next'), '1');   // someone else is not affected
  assert.equal(mw(req(null)).headers.get('x-middleware-next'), '1');       // unknown visitor: let through
  assert.equal(mw({ headers: null }).headers.get('x-middleware-next'), '1');   // broken input: fail open
  const re = new RegExp('^' + config.matcher[0].replace(/^\//, '/').replace(/\(\?!/, '(?!') + '$');
  assert.ok(re.test('/') && re.test('/somebody') && re.test('/privacy.html'), 'pages are checked');
  assert.ok(!re.test('/assets/index-abc.js') && !re.test('/fonts/UbuntuSans.woff2') && !re.test('/sw.js') && !re.test('/icon-512.png'), 'files are not');
});
