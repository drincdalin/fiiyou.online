// Email templates for moderation notices. Pure functions: easy to unit-test, no I/O.
// EVERY value that came from a person (place name, moderator note) goes through esc() before it touches HTML,
// and through oneLine() before it touches a header (a newline in a subject line is an email-header injection).

export type Rendered = { subject: string; html: string; text: string };
type Cfg = { siteUrl: string; supportEmail: string; appealDays: number };

const ACCENT = '#8b0000';   // adjust to docs/BRANDING.md

export const REASONS: Record<string, string> = {
  guidelines: 'It violates our Community Guidelines.',
  inaccurate_location: 'Its location data was inaccurate.',
  spam: 'It was spam or commercial abuse.',
  duplicate: 'It duplicated another marker on the map.',
  explicit: 'It contained explicit or inappropriate material.',
  abuse: 'It was abusive or harassing towards others.',
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
export function contentRemoved(row: { username?: string; payload: Record<string, unknown> }, cfg: Cfg): Rendered {
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

/** c) A post or a comment was removed by a moderator. Tells the person what was removed and WHY. */
export function itemRemoved(kind: string, row: { username?: string; payload: Record<string, unknown> }, cfg: Cfg): Rendered {
  const p = row.payload; const who = oneLine(row.username, 40);
  const ct = String(p.content_type ?? 'post');
  const what = kind === 'post_removed' ? 'post' : ct === 'wall_comment' ? 'comment on a profile wall' : 'comment';
  const title = oneLine(p.title, 80); const excerpt = oneLine(p.excerpt, 300);
  const reason = reasonOf(p);
  const subject = `Your ${what} was removed`;
  const quoted = title || excerpt;

  const html = shell(subject, `
    <p style="margin:0 0 12px;">Hi${who ? ` ${esc(who)}` : ''},</p>
    <p style="margin:0 0 12px;">A moderator removed your ${esc(what)} on fiiyou.</p>
    ${quoted ? box(`${title ? `<div style="font-weight:700;">${esc(title)}</div>` : ''}${excerpt ? `<div style="color:#52525b;margin-top:${title ? '4' : '0'}px;">${esc(excerpt)}</div>` : ''}`) : ''}
    <p style="margin:0 0 4px;font-weight:700;">Reason</p>
    ${box(`<div>${esc(reason)}</div>`)}
    <p style="margin:0 0 12px;">Your account is not affected. Please read our <a href="${esc(cfg.siteUrl)}/terms.html" style="color:${ACCENT};">Community Guidelines</a> before posting again; repeated violations can lead to your account being suspended.</p>
    <p style="margin:0;">If you think this was a mistake, reply to this message or write to <a href="mailto:${esc(cfg.supportEmail)}" style="color:${ACCENT};">${esc(cfg.supportEmail)}</a> within ${cfg.appealDays} days and tell us why. A different person will look at it.</p>`, cfg);

  const text = [
    `Hi${who ? ` ${who}` : ''},`, '',
    `A moderator removed your ${what} on fiiyou.`, '',
    title ? `Title: ${title}` : null, excerpt ? `Text: ${excerpt}` : null, quoted ? '' : null,
    `Reason: ${reason}`, '',
    'Your account is not affected. Repeated violations can lead to your account being suspended.', '',
    `If you think this was a mistake, reply to this message or write to ${cfg.supportEmail} within ${cfg.appealDays} days. A different person will look at it.`, '',
    `Community Guidelines: ${cfg.siteUrl}/terms.html`,
  ].filter((l) => l !== null).join('\n');
  return { subject, html, text };
}

/** b) The account was banned. By the time this is sent the account is already deleted, so the wording says so plainly. */
export function accountBanned(row: { username?: string; payload: Record<string, unknown> }, cfg: Cfg): Rendered {
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

export function render(kind: string, row: { username?: string; payload: Record<string, unknown> }, cfg: Cfg): Rendered {
  if (kind === 'content_removed') return contentRemoved(row, cfg);
  if (kind === 'account_banned') return accountBanned(row, cfg);
  if (kind === 'post_removed' || kind === 'comment_removed') return itemRemoved(kind, row, cfg);
  throw new Error(`unknown kind: ${kind}`);
}
