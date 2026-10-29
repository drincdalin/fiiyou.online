import test from 'node:test'; import assert from 'node:assert/strict';
import { parseInvitePath, captureInvite, getInvite, clearInvite, inviteUrl } from '../../src/lib/invite.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('parseInvitePath', () => {
  assert.equal(parseInvitePath('/invite/Dalin'), 'dalin'); assert.equal(parseInvitePath('/invite/dalin/'), 'dalin');
  assert.equal(parseInvitePath('/app/invite/dalin', '/app'), 'dalin');
  for (const bad of ['/', '/dalin', '/invite', '/invite/', '/invite/ab', '/invite/a b c', '/invite/%E0%A4%A', '/invite/x/y', `/invite/${'a'.repeat(25)}`, '/invite/dalin!']) assert.equal(parseInvitePath(bad), null, bad);
});
test('captureInvite stores the name and cleans the address', () => {
  const s = mem(); let to = null; const hist = { replaceState: (_a, _b, u) => { to = u; } };
  assert.equal(captureInvite({ loc: { pathname: '/invite/Dalin' }, hist, base: '', storage: s }), 'dalin');
  assert.equal(to, '/'); assert.equal(getInvite({ storage: s }), 'dalin');
  clearInvite({ storage: s }); assert.equal(getInvite({ storage: s }), null);
  assert.equal(captureInvite({ loc: { pathname: '/dalin' }, hist, storage: s }), null);
});
test('a tampered stored value is ignored', () => { const s = mem(); s.setItem('fiiyou_invite', '<script>'); assert.equal(getInvite({ storage: s }), null); });
test('inviteUrl', () => { assert.equal(inviteUrl('https://fiiyou.online', '', 'Dalin'), 'https://fiiyou.online/invite/dalin'); assert.equal(inviteUrl('https://x.io', '/app', 'bob'), 'https://x.io/app/invite/bob'); });
