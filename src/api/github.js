// Public GitHub data for a profile that has a github_repo (the official fiiyou account). Read-only, no token, no account needed.
// Allowed in the Content-Security-Policy: connect-src https://api.github.com, img-src https://avatars.githubusercontent.com (see vite.config.js).
// GitHub allows 60 anonymous requests per hour per IP, so every answer is kept for 10 minutes in sessionStorage.
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const TTL = 10 * 60 * 1000;
// accounts GitHub attributes commits to (usually through a commit e-mail) that should not be showcased
const HIDDEN = new Set(['nursexams-lgtm']);

// only ever put links / images on the page that really point at GitHub
const safe = (u, host) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === host ? x.href : null; } catch { return null; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 403 || res.status === 429) throw new Error('rate_limit');
  if (res.status === 204) return [];   // an empty repository answers "no content"
  if (!res.ok) throw new Error(`github_${res.status}`);
  return res.json();
}
/** The /stats/* endpoints answer 202 while GitHub builds them (the first request after a quiet period). Ask again a few times. */
async function stat(path) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (res.status === 403 || res.status === 429) throw new Error('rate_limit');
    if (res.status === 200) return res.json();
    if (res.status !== 202) return null;
    await wait(1500);
  }
  return null;
}

/** -> { repo, url, commits: <total ever>, contributors: [{ login, url, avatar, count }] most commits first,
 *       weeks: [{ start: unix seconds of that Sunday (UTC), days: [Sun..Sat commit counts] }] | null  (the last 52 weeks, null while GitHub is still preparing it) } */
export async function repoActivity(repo) {
  if (!REPO.test(repo || '')) throw new Error('bad_repo');
  const key = `gh2:${repo}`;
  try { const c = JSON.parse(sessionStorage.getItem(key) || 'null'); if (c && Date.now() - c.t < TTL) return c.data; } catch { /* no cache */ }

  const [people, cal] = await Promise.all([get(`/repos/${repo}/contributors?per_page=100`), stat(`/repos/${repo}/stats/commit_activity`)]);
  const contributors = (people || []).filter((p) => p.login && !HIDDEN.has(p.login.toLowerCase())).map((p) => ({
    login: p.login, url: safe(p.html_url, 'github.com'), avatar: safe(p.avatar_url, 'avatars.githubusercontent.com'), count: p.contributions || 0,
  })).sort((a, b) => b.count - a.count);
  const weeks = Array.isArray(cal) && cal.length ? cal.map((w) => ({ start: w.week, days: (w.days || []).slice(0, 7) })) : null;
  const data = { repo, url: `https://github.com/${repo}`, commits: contributors.reduce((n, p) => n + p.count, 0), contributors, weeks };
  if (weeks) { try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch { /* storage full or blocked */ } }   // a chart that is not ready yet is not cached
  return data;
}
