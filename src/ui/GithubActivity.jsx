import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GithubLogo, ArrowSquareOut } from '@phosphor-icons/react';
import { repoActivity } from '../api/github.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (ts) => new Date(ts * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** The GitHub-style square graph: one column per week (oldest left), one row per weekday (Sunday on top), darker = more commits that day. */
function CommitGraph({ weeks }) {
  const sc = useRef(null);
  const today = Math.floor(Date.now() / 1000);
  const { total, max, labels } = useMemo(() => {
    let t = 0; let m = 0; const l = []; let prev = -1;
    weeks.forEach((w, i) => {
      w.days.forEach((n) => { t += n; if (n > m) m = n; });
      const mon = new Date(w.start * 1000).getUTCMonth();
      if (mon !== prev && i < weeks.length - 1) l.push({ col: i + 1, text: MONTHS[mon] });   // the month name sits over the first week that starts in it
      prev = mon;
    });
    return { total: t, max: m, labels: l };
  }, [weeks]);
  useEffect(() => { if (sc.current) sc.current.scrollLeft = sc.current.scrollWidth; }, [weeks]);   // phones: start at today, scroll back for older weeks
  const level = (n) => (n <= 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));

  return (<div className="ghgraph">
    <p className="ghtotal"><b>{total.toLocaleString('en')}</b> commit{total === 1 ? '' : 's'} in the last year</p>
    <div className="ghcal">
      <div className="ghdow" aria-hidden="true"><span>Mon</span><span>Wed</span><span>Fri</span></div>
      <div className="ghscroll" ref={sc}>
        <div className="ghmonths" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${weeks.length}, var(--ghc))` }}>{labels.map((m) => <span key={m.col} style={{ gridColumn: m.col }}>{m.text}</span>)}</div>
        <div className="ghgrid" role="img" aria-label={`${total} commits in the last year`}>
          {weeks.flatMap((w) => w.days.map((n, d) => { const ts = w.start + d * 86400; return ts > today
            ? <i key={ts} className="ghc off" />
            : <i key={ts} className={`ghc l${level(n)}`} title={`${n ? `${n} commit${n === 1 ? '' : 's'}` : 'No commits'} on ${fmt(ts)}`} />; }))}
        </div>
      </div>
    </div>
    <div className="ghlegend" aria-hidden="true">Less<i className="ghc l0" /><i className="ghc l1" /><i className="ghc l2" /><i className="ghc l3" /><i className="ghc l4" />More</div>
  </div>);
}

/** The official account's GitHub card: commit graph for the last year, total commits, and contributors ranked by their number of commits.
 *  Shown on any profile whose github_repo is set (only the dashboard can set it, see 0031_official_github.sql). */
export default function GithubActivity({ repo }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [all, setAll] = useState(false);
  const load = useCallback(() => { setErr(null); setD(null); repoActivity(repo).then(setD).catch((e) => setErr(e)); }, [repo]);
  useEffect(() => { load(); }, [load]);

  const top = d?.contributors[0]?.count || 1;
  const list = d ? (all ? d.contributors : d.contributors.slice(0, 5)) : [];
  return (<section className="card gh" aria-label="GitHub activity">
    <h2 className="ghhead"><GithubLogo size={18} weight="fill" aria-hidden="true" />Built in the open
      <a className="ghrepo" href={`https://github.com/${repo}`} target="_blank" rel="noopener noreferrer">{repo}<ArrowSquareOut size={12} weight="bold" aria-hidden="true" /></a></h2>
    {err ? <p className="muted">{err.message === 'rate_limit' ? 'GitHub is busy right now. ' : 'Could not load GitHub activity. '}<button type="button" className="link" onClick={load}>Try again</button></p>
      : !d ? <p className="muted">Loading…</p> : (<>
        {d.weeks ? <CommitGraph weeks={d.weeks} /> : <p className="muted">GitHub is still preparing the commit graph. <button type="button" className="link" onClick={load}>Check again</button></p>}
        <div className="ghstats"><span><b>{d.commits.toLocaleString('en')}</b> commit{d.commits === 1 ? '' : 's'} in total</span><span><b>{d.contributors.length}</b> contributor{d.contributors.length === 1 ? '' : 's'}</span></div>
        <h3 className="ghsub">Contributors</h3>
        <ol className="ghpeople">{list.map((p, i) => (<li key={p.login}>
          <a href={p.url || undefined} target="_blank" rel="noopener noreferrer" className="ghp">
            <span className="ghrank">{i + 1}</span>{p.avatar ? <img src={`${p.avatar}${p.avatar.includes('?') ? '&' : '?'}s=64`} alt="" loading="lazy" /> : <i />}
            <span className="ghname">{p.login}</span><span className="ghn">{p.count.toLocaleString('en')}</span></a>
          <span className="ghbar" aria-hidden="true"><i style={{ width: `${Math.max(4, Math.round((p.count / top) * 100))}%` }} /></span></li>))}</ol>
        {d.contributors.length > 5 && <button type="button" className="link ghmore" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${d.contributors.length}`}</button>}
        <a className="ghall" href={`${d.url}/commits`} target="_blank" rel="noopener noreferrer">Full commit history on GitHub<ArrowSquareOut size={12} weight="bold" aria-hidden="true" /></a>
      </>)}
  </section>);
}
