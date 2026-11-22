import { useEffect, useRef, useState } from 'react';
import { posts } from '../index.js';
import { Avatar, useImages } from './shared.jsx';

const AT = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{1,30})$/;   // an @word that ends right at the caret

/** Drop-in <input> / <textarea> (as="textarea") that suggests people while you type @name.
 *  Stays a normal controlled field: value + onChange(e) with e.target.value, exactly like before. */
export default function MentionInput({ as: Tag = 'input', value, onChange, onKeyDown, onBlur, inputRef, ...rest }) {
  const mine = useRef(null); const ref = inputRef || mine;
  const [at, setAt] = useState(null); const [list, setList] = useState([]); const [sel, setSel] = useState(0);
  const img = useImages(list.map((u) => u.avatar_path));

  useEffect(() => {
    if (!at) { setList([]); return undefined; }
    let live = true;
    const t = setTimeout(() => { posts.searchUsers(at.word).then((r) => { if (live) { setList(r); setSel(0); } }).catch(() => {}); }, 150);
    return () => { live = false; clearTimeout(t); };
  }, [at?.word]);   // eslint-disable-line react-hooks/exhaustive-deps

  const probe = (el) => {
    const pos = el.selectionStart ?? el.value.length; const m = AT.exec(el.value.slice(0, pos));
    setAt(m ? { word: m[1], start: pos - m[1].length - 1 } : null);
  };
  const change = (e) => { onChange?.(e); probe(e.target); };
  const pick = (u) => {
    const v = value || ''; const end = at.start + 1 + at.word.length; const caret = at.start + u.username.length + 2;
    onChange?.({ target: { value: `${v.slice(0, at.start)}@${u.username} ${v.slice(end)}` } });
    setAt(null); setList([]);
    requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(caret, caret); } });
  };
  const key = (e) => {
    if (at && list.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((sel + 1) % list.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((sel - 1 + list.length) % list.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(list[sel]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setAt(null); return; }
    }
    onKeyDown?.(e);
  };

  return (<span className="mentionwrap">
    <Tag ref={ref} value={value} onChange={change} onKeyDown={key} autoComplete="off"
      onClick={(e) => probe(e.currentTarget)} onKeyUp={(e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) probe(e.currentTarget); }}
      onBlur={(e) => { setAt(null); onBlur?.(e); }} {...rest} />
    {at && list.length > 0 && <ul className="mentionpop" role="listbox" aria-label="Mention suggestions">
      {list.map((u, i) => (<li key={u.id} role="option" aria-selected={i === sel}>
        <button type="button" tabIndex={-1} className={i === sel ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pick(u); }}>
          <Avatar src={img[u.avatar_path]} size={24} /><span><b>{u.display_name}</b><small>@{u.username}</small></span></button></li>))}</ul>}
  </span>);
}
