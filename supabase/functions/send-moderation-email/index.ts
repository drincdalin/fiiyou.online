// Supabase Edge Function `send-moderation-email`.
// Callers: (1) the database webhook on public.moderation_outbox (INSERT), (2) you, with {"retry":true}, to resend failed mails.
// Both prove themselves with the x-webhook-secret header; anything else gets 403.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function -> Via Editor -> paste this whole file. Turn OFF "Verify JWT".
// Secrets (dashboard -> Edge Functions -> Secrets): SMTP_HOST=mail.privateemail.com SMTP_PORT=465 SMTP_USER=contact@fiiyou.online SMTP_PASS='mailbox password' \
//                                MOD_WEBHOOK_SECRET=<long random string> SITE_URL=https://app.fiiyou.online SUPPORT_EMAIL=contact@fiiyou.online
// Works with any SMTP mailbox (Namecheap Private Email, Gmail with an app password: SMTP_HOST=smtp.gmail.com, ...).
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions automatically; never put the service key anywhere else.)
//
// SMTP over port 465 (implicit TLS) on purpose: as far as I know Supabase Edge Functions block outbound 25 and 587. Check the current docs.
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

// Email templates for moderation notices. Pure functions: easy to unit-test, no I/O.
// EVERY value that came from a person (place name, moderator note) goes through esc() before it touches HTML,
// and through oneLine() before it touches a header (a newline in a subject line is an email-header injection).

type Rendered = { subject: string; html: string; text: string };
type Cfg = { siteUrl: string; supportEmail: string; appealDays: number };

const ACCENT = '#8b0000';   // adjust to docs/BRANDING.md

const REASONS: Record<string, string> = {
  guidelines: 'It violates our Community Guidelines.',
  inaccurate_location: 'Its location data was inaccurate.',
  spam: 'It was spam or commercial abuse.',
  duplicate: 'It duplicated another marker on the map.',
  custom: '',   // the moderator's own words are used instead
};

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const oneLine = (v: unknown, max = 80) => String(v ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim().slice(0, max);

function shell(title: string, bodyHtml: string, cfg: Cfg): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <tr><td style="background:${ACCENT};padding:18px 24px;color:#ffffff;font-size:20px;font-weight:700;">fiiyou</td></tr>
    <tr><td style="padding:24px;font-size:15px;line-height:1.55;">${bodyHtml}</td></tr>
    <tr><td style="padding:16px 24px;background:#fafafa;color:#71717a;font-size:12px;line-height:1.5;">
      Questions? Write to <a href="mailto:${esc(cfg.supportEmail)}" style="color:${ACCENT};">${esc(cfg.supportEmail)}</a> · <a href="${esc(cfg.siteUrl)}/terms.html" style="color:${ACCENT};">Terms</a> · <a href="${esc(cfg.siteUrl)}/privacy.html" style="color:${ACCENT};">Privacy</a><br>
      This is a service message about your account. Please do not reply to unrelated mail from this address.
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

const box = (inner: string) => `<div style="margin:16px 0;padding:14px 16px;background:#fafafa;border-left:4px solid ${ACCENT};border-radius:6px;">${inner}</div>`;

function reasonOf(p: Record<string, unknown>): string {
  const code = String(p.reason_code ?? 'custom');
  const note = oneLine(p.reason_text, 300);
  if (code === 'custom') return note || 'No further detail was recorded.';
  return REASONS[code] ? (note ? `${REASONS[code]} ${note}` : REASONS[code]) : (note || 'No further detail was recorded.');
}

/** a) A place the person created was removed by a moderator. */
function contentRemoved(row: { username?: string; payload: Record<string, unknown> }, cfg: Cfg): Rendered {
  const p = row.payload; const name = oneLine(p.place_name, 80) || 'your place'; const who = oneLine(row.username, 40);
  const reason = reasonOf(p);
  const lat = Number(p.lat), lng = Number(p.lng);
  const where = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '';
  const osm = where ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` : '';
  const desc = oneLine(p.place_description, 300);
  const subject = `Your place “${oneLine(p.place_name, 50) || 'on the map'}” was removed`;

  const html = shell(subject, `
    <p style="margin:0 0 12px;">Hi${who ? ` ${esc(who)}` : ''},</p>
    <p style="margin:0 0 12px;">A moderator removed a place you added to the fiiyou map.</p>
    ${box(`<div style="font-weight:700;">${esc(name)}</div>
      ${desc ? `<div style="color:#52525b;margin-top:4px;">${esc(desc)}</div>` : ''}
      ${where ? `<div style="color:#52525b;margin-top:4px;font-size:13px;">Location: <a href="${esc(osm)}" style="color:${ACCENT};">${esc(where)}</a></div>` : ''}`)}
    <p style="margin:0 0 4px;font-weight:700;">Reason</p>
    ${box(`<div>${esc(reason)}</div>`)}
    <p style="margin:0 0 12px;">Your posts that mentioned this place are still there; they just no longer show it on the map. Your account is not affected.</p>
    <p style="margin:0 0 12px;">If you think this was a mistake, reply to this message or write to <a href="mailto:${esc(cfg.supportEmail)}" style="color:${ACCENT};">${esc(cfg.supportEmail)}</a> within ${cfg.appealDays} days and tell us why. A different person will look at it.</p>
    <p style="margin:0;color:#52525b;">You can add the place again once it follows the <a href="${esc(cfg.siteUrl)}/terms.html" style="color:${ACCENT};">Community Guidelines</a>.</p>`, cfg);

  const text = [
    `Hi${who ? ` ${who}` : ''},`, '',
    'A moderator removed a place you added to the fiiyou map.', '',
    `Place: ${name}`, desc ? `Description: ${desc}` : null, where ? `Location: ${where} (${osm})` : null, '',
    `Reason: ${reason}`, '',
    'Your posts that mentioned this place are still there; they just no longer show it on the map. Your account is not affected.', '',
    `If you think this was a mistake, reply to this message or write to ${cfg.supportEmail} within ${cfg.appealDays} days. A different person will look at it.`, '',
    `Community Guidelines: ${cfg.siteUrl}/terms.html`,
  ].filter((l) => l !== null).join('\n');
  return { subject, html, text };
}

/** b) The account was banned. By the time this is sent the account is already deleted, so the wording says so plainly. */
function accountBanned(row: { username?: string; payload: Record<string, unknown> }, cfg: Cfg): Rendered {
  const who = oneLine(row.username, 40);
  const reason = oneLine(row.payload.reason_text, 500) || 'Your account violated our Terms of Use.';
  const subject = 'Your fiiyou account has been suspended';
  const html = shell(subject, `
    <p style="margin:0 0 12px;">Hi${who ? ` ${esc(who)}` : ''},</p>
    <p style="margin:0 0 12px;">Your fiiyou account${who ? ` <b>@${esc(who)}</b>` : ''} has been suspended and closed. Its content has been removed and this email address can no longer be used to register.</p>
    <p style="margin:0 0 4px;font-weight:700;">Reason</p>
    ${box(`<div>${esc(reason)}</div>`)}
    <p style="margin:0 0 12px;"><b>How to appeal.</b> If you believe this was a mistake, write to <a href="mailto:${esc(cfg.supportEmail)}" style="color:${ACCENT};">${esc(cfg.supportEmail)}</a> within ${cfg.appealDays} days from the email address you signed up with. Tell us your username and why you think the decision was wrong. We will review it and answer you.</p>
    <p style="margin:0;color:#52525b;">The rules you agreed to are in our <a href="${esc(cfg.siteUrl)}/terms.html" style="color:${ACCENT};">Terms</a>.</p>`, cfg);
  const text = [
    `Hi${who ? ` ${who}` : ''},`, '',
    `Your fiiyou account${who ? ` @${who}` : ''} has been suspended and closed. Its content has been removed and this email address can no longer be used to register.`, '',
    `Reason: ${reason}`, '',
    `How to appeal: write to ${cfg.supportEmail} within ${cfg.appealDays} days from the email address you signed up with. Include your username and why you think the decision was wrong.`, '',
    `Terms: ${cfg.siteUrl}/terms.html`,
  ].join('\n');
  return { subject, html, text };
}

function render(kind: string, row: { username?: string; payload: Record<string, unknown> }, cfg: Cfg): Rendered {
  if (kind === 'content_removed') return contentRemoved(row, cfg);
  if (kind === 'account_banned') return accountBanned(row, cfg);
  throw new Error(`unknown kind: ${kind}`);
}

// ---------------- function ----------------
const env = (k: string, d = '') => Deno.env.get(k) ?? d;
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const cfg = { siteUrl: env('SITE_URL', 'https://app.fiiyou.online').replace(/\/$/, ''), supportEmail: env('SUPPORT_EMAIL', 'contact@fiiyou.online'), appealDays: Number(env('APPEAL_DAYS', '14')) };
const FROM_NAME = env('MAIL_FROM_NAME', 'fiiyou');
const MAX_ATTEMPTS = 5;

const SMTP_USER = env('SMTP_USER');
const SMTP_PORT = Number(env('SMTP_PORT', '465'));
const mailer = nodemailer.createTransport({
  host: env('SMTP_HOST'), port: SMTP_PORT, secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: env('SMTP_PASS') },
});

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

/** constant-time string compare (no early exit on the first wrong byte) */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Sends one outbox row. Compare-and-swap on `status` means two parallel invocations can never both send the same mail. */
async function processRow(id: string): Promise<string> {
  const { data: row } = await db.from('moderation_outbox').select('*').eq('id', id).maybeSingle();
  if (!row) return 'missing';
  if (!['pending', 'failed'].includes(row.status) || row.attempts >= MAX_ATTEMPTS) return `skipped:${row.status}`;
  const { data: claimed } = await db.from('moderation_outbox')
    .update({ status: 'sending', attempts: row.attempts + 1 }).eq('id', id).eq('status', row.status).eq('attempts', row.attempts).select('id');
  if (!claimed?.length) return 'claimed-elsewhere';
  try {
    if (!row.to_email) throw new Error('no recipient');
    const m = render(row.kind, { username: row.username, payload: row.payload ?? {} }, cfg);
    await mailer.sendMail({
      from: { name: FROM_NAME, address: SMTP_USER }, to: row.to_email,
      replyTo: cfg.supportEmail, subject: m.subject, text: m.text, html: m.html,
      headers: { 'X-Auto-Response-Suppress': 'All', 'Auto-Submitted': 'auto-generated' },
    });
    await db.from('moderation_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), to_email: null, last_error: null }).eq('id', id);
    return 'sent';
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    console.error('moderation mail failed', id, msg);
    await db.from('moderation_outbox').update({ status: 'failed', last_error: msg }).eq('id', id);
    return 'failed';
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!env('MOD_WEBHOOK_SECRET') || !safeEqual(req.headers.get('x-webhook-secret') ?? '', env('MOD_WEBHOOK_SECRET'))) return json({ error: 'forbidden' }, 403);
  if (!SMTP_USER || !env('SMTP_PASS') || !env('SMTP_HOST')) return json({ error: 'smtp_not_configured' }, 500);

  let body: any = {}; try { body = await req.json(); } catch { /* empty body is fine */ }

  if (body?.retry) {                                          // manual resend of everything that is stuck
    const { data } = await db.from('moderation_outbox').select('id').in('status', ['pending', 'failed']).lt('attempts', MAX_ATTEMPTS).order('created_at').limit(25);
    const results: Record<string, string> = {}; for (const r of data ?? []) results[r.id] = await processRow(r.id);
    return json({ results });
  }
  const id = body?.record?.id;                                // database webhook shape: { type, table, record: {...} }
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad_payload' }, 400);
  return json({ id, result: await processRow(id) });
});
