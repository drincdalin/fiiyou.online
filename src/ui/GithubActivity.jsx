import { useEffect, useMemo, useState } from 'react';
import { repoActivity } from '../api/github.js';
import './githubActivity.css';

// Drop-in replacement for src/ui/GithubActivity.jsx. Same default export and the same `repo` prop that App.jsx already passes.

const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MIN_WEEKS = 16;

const level = (n, max) => {
  if (!n) return 0;
  const r = n / max;
  return r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.75 ? 3 : 4;
};
const label = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** GitHub's weeks (UTC Sundays, 52 of them) -> only the weeks worth showing, with a cell per day. */
function buildGrid(weeks) {
  const now = Date.now();
  let from = weeks.findIndex((w) => w.days.some((n) => n > 0));
  if (from < 0) from = weeks.length - MIN_WEEKS;
  from = Math.max(0, Math.min(from, weeks.length - MIN_WEEKS));
  const shown = weeks.slice(from);

  let max = 0, total = 0, lastMonth = -1;
  shown.forEach((w) => w.days.forEach((n) => { max = Math.max(max, n); total += n; }));

  const months = [];
  const cols = shown.map((w, col) => {
    const startMs = w.start * 1000;
    const m = new Date(startMs).getUTCMonth();
    if (m !== lastMonth) { months.push({ col, text: MONTHS[m] }); lastMonth = m; }
    return Array.from({ length: 7 }, (_, d) => {
      const ms = startMs + d * DAY;
      const n = w.days[d] || 0;
      return { key: `${w.start}-${d}`, future: ms > now, n, lvl: level(n, max), title: `${n ? `${n} commit${n === 1 ? '' : 's'}` : 'No commits'} on ${label(ms)}` };
    });
  });
  return { cols, months, total, count: shown.length };
}

export default function GithubActivity({ repo }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null); setErr(null);
    repoActivity(repo).then((d) => live && setData(d)).catch((e) => live && setErr(e.message || 'failed'));
    return () => { live = false; };
  }, [repo]);

  const grid = useMemo(() => (data?.weeks ? buildGrid(data.weeks) : null), [data]);

  if (err) {
    return (
      <section className="gha">
        <h3 className="gha__title">Built in the open</h3>
        <p className="gha__note">{err === 'rate_limit' ? 'GitHub is limiting requests right now. Try again in a few minutes.' : 'Couldn’t load the repository activity.'}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="gha" aria-busy="true">
        <h3 className="gha__title">Built in the open</h3>
        <p className="gha__note">Loading…</p>
      </section>
    );
  }

  const top = data.contributors[0]?.count || 1;

  return (
    <section className="gha" aria-labelledby="gha-title">
      <header className="gha__head">
        <h3 id="gha-title" className="gha__title">
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          Built in the open
        </h3>
        {data.url && <a className="gha__repo" href={data.url} target="_blank" rel="noreferrer noopener">{data.repo}</a>}
      </header>

      <ul className="gha__stats">
        <li><strong>{data.commits}</strong> commits</li>
        <li><strong>{data.contributors.length}</strong> contributors</li>
        {grid && <li><strong>{grid.total}</strong> in the last {grid.count} weeks</li>}
      </ul>

      {grid ? (
        <>
          <div className="gha__scroll">
            <div className="gha__graph" style={{ '--weeks': grid.count }}>
              <div className="gha__months" aria-hidden="true">
                {grid.months.map((m) => <span key={m.col} style={{ gridColumn: m.col + 1 }}>{m.text}</span>)}
              </div>
              <div className="gha__days" aria-hidden="true">
                <span style={{ gridRow: 2 }}>Mon</span><span style={{ gridRow: 4 }}>Wed</span><span style={{ gridRow: 6 }}>Fri</span>
              </div>
              <div className="gha__grid" role="img" aria-label={`${grid.total} commits in the last ${grid.count} weeks`}>
                {grid.cols.map((col) => col.map((c) => (
                  c.future
                    ? <span key={c.key} className="gha__cell gha__cell--none" />
                    : <span key={c.key} className={`gha__cell l${c.lvl}`} title={c.title} />
                )))}
              </div>
            </div>
          </div>
          <div className="gha__legend" aria-hidden="true">
            <span>Less</span>{[0, 1, 2, 3, 4].map((l) => <span key={l} className={`gha__cell l${l}`} />)}<span>More</span>
          </div>
        </>
      ) : (
        <p className="gha__note">GitHub is still preparing the activity graph. Reload in a minute.</p>
      )}

      <ol className="gha__people">
        {data.contributors.map((p, i) => (
          <li key={p.login}>
            <span className="gha__rank">{i + 1}</span>
            {p.avatar ? <img className="gha__avatar" src={p.avatar} alt="" width="32" height="32" loading="lazy" /> : <span className="gha__avatar gha__avatar--empty" aria-hidden="true" />}
            {p.url ? <a className="gha__login" href={p.url} target="_blank" rel="noreferrer noopener">{p.login}</a> : <span className="gha__login">{p.login}</span>}
            <span className="gha__count">{p.count}</span>
            <span className="gha__bar" aria-hidden="true"><span style={{ width: `${Math.max(4, (p.count / top) * 100)}%` }} /></span>
          </li>
        ))}
      </ol>

      {data.url && <a className="gha__more" href={`${data.url}/commits`} target="_blank" rel="noreferrer noopener">Full commit history on GitHub</a>}
    </section>
  );
}
