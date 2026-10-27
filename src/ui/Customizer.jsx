/**
 * Customizer — the edit panel for a profile page.
 * One file by design: styles, icons, primitives, tabs and state all live here.
 *
 * How this file is laid out
 *   1. Imports & constants
 *   2. Styles            scoped under .cz / .cz-pill, injected through <style>
 *   3. UI primitives     Section, Field, Select, Switch, Range, FilePick, …
 *   4. Editors           TagInput, LinksEditor, CardItem, PhotoGrid, …
 *   5. Tabs              Profile · Theme · Content · Media
 *   6. Customizer        state, draft updaters, async actions, shell
 *
 * Requires: @phosphor-icons/react
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowLineDown, ArrowLineUp, ArrowDown, ArrowUp, BookOpenText, Cards, CaretDoubleRight,
  CaretDown, CaretLeft, CaretRight, Check, CircleNotch, DotsSixVertical, Eye, EyeSlash,
  FloppyDisk, Hash, Heart, IdentificationCard, Image as ImageIcon, ImageSquare, Images, Layout,
  LinkSimple, MusicNote, MusicNotes, Palette, PencilSimple, Plus, Shapes, ShieldCheck,
  SlidersHorizontal, Sparkle, Stack, Sticker, TextAa, TextAlignLeft, Trash, UploadSimple,
  UserCircle, UsersThree, WarningCircle, X,
} from '@phosphor-icons/react';
import { profiles, cards as cardsApi, media, discover, friends, social } from '../index.js';
import { THEME_DEFAULTS, OPTIONS, COLOR_KEYS, GROUPS, radii } from './theme.js';
import { SELECTORS, PROPS } from './customCss.js';
import { PRESETS } from './themes.js';

// ═══ 1. CONSTANTS & HELPERS ═════════════════════════════════════════════════

// Four tabs, one question each.
const TABS = [
  { id: 'Profile', label: 'Profile', icon: UserCircle },   // who am I?
  { id: 'Theme',   label: 'Theme',   icon: Palette },      // how does it look?
  { id: 'Content', label: 'Content', icon: Cards },        // what's on the page?
  { id: 'Media',   label: 'Media',   icon: Images },       // my photos & stickers
];

const CARD_TYPES = {
  about:       { label: 'About me',    icon: IdentificationCard, empty: { body: '' } },
  text:        { label: 'Text',        icon: TextAlignLeft,      empty: { body: '' } },
  gallery:     { label: 'Gallery',     icon: Images,             empty: { images: [] } },
  links:       { label: 'Links',       icon: LinkSimple,         empty: { links: [] } },
  interests:   { label: 'Interests',   icon: Hash,               empty: { interests: [] } },
  guestbook:   { label: 'Guestbook',   icon: BookOpenText,       empty: {} },
  top_friends: { label: 'Top friends', icon: UsersThree,         empty: {} },
};

const MAX_TOP = 8;
const MAX_LINKS = 20;
const MAX_INTERESTS = 30;
const MAX_RULES = 40;
const MAX_PROPS = 12;

const sentence = (k) => { const s = String(k).replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
const colorLabel = (k) => ({ bg: 'Background' }[k.replace(/_color$/, '')] || sentence(k.replace(/_color$/, '')));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const cx = (...a) => a.filter(Boolean).join(' ');
const groupKeys = (g) => GROUPS.find((x) => x[0] === g)?.[1] || [];
const isFlow = (c) => c.type !== 'sticker' && c.type !== 'music';
const typeMeta = (t) => CARD_TYPES[t] || { label: sentence(t), icon: Cards, empty: {} };

// Blank link rows are allowed while editing; they're cleaned up on save.
const cleanLinks = (ls) => (ls || [])
  .map((l) => ({ label: (l.label || '').trim(), url: (l.url || '').trim() }))
  .filter((l) => l.label || l.url)
  .slice(0, MAX_LINKS)
  .map((l) => ({ label: l.label || l.url, url: l.url || l.label }));


// The panel is coloured from the app theme (see ui-theme.css / appTheme.js): no colours are defined here.

// ═══ 2. STYLES ══════════════════════════════════════════════════════════════

const CSS = `
.cz,.cz-pill{
  --cz-font:var(--ui-font),ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --cz-bg:var(--g1);--cz-card:var(--g2);--cz-sunk:var(--g0);--cz-hover:var(--hover);
  --cz-ink:var(--ink);--cz-ink2:var(--ink2);--cz-ink3:var(--muted);
  --cz-line:var(--g3);--cz-line2:var(--g4);
  --cz-accent:var(--accent-fg);--cz-accent-ink:var(--on-accent-fg);--cz-accent-soft:color-mix(in srgb,var(--accent-fg) 16%,transparent);--cz-ring:color-mix(in srgb,var(--accent-fg) 38%,transparent);
  --cz-fill:var(--accent);--cz-fill-ink:var(--on-accent);
  --cz-danger:var(--red);--cz-danger-ink:var(--on-red);--cz-danger-soft:color-mix(in srgb,var(--red) 18%,transparent);
  --cz-shadow:0 4px 0 color-mix(in srgb,var(--shade) 55%,transparent),0 18px 44px -14px color-mix(in srgb,var(--shade) 80%,transparent);
  --cz-top:var(--header-h,60px);   /* height of your top bar; the panel sits right under it */
  color-scheme:var(--scheme,dark);
}

/* base */
.cz,.cz *,.cz *::before,.cz *::after,.cz-pill,.cz-pill *{box-sizing:border-box}
.cz,.cz-pill{font:500 14px/1.45 var(--cz-font);color:var(--cz-ink);-webkit-font-smoothing:antialiased}
/* :where() keeps these resets at zero specificity, so a button's own colour (e.g. text on the accent fill) always wins */
.cz :where(button,input,select,textarea),.cz-pill :where(button){font:inherit;color:inherit;margin:0}
.cz :where(button),.cz-pill :where(button){cursor:pointer}
.cz h2,.cz h3,.cz p,.cz ul,.cz dl,.cz dd{margin:0;padding:0}
.cz ul{list-style:none}
.cz :focus-visible,.cz-pill :focus-visible{outline:3px solid var(--cz-accent);outline-offset:2px}
.cz-vh{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;padding:0}

/* shell */
.cz{position:fixed;z-index:100;top:var(--cz-top);right:0;bottom:0;width:400px;max-width:100vw;
  display:flex;flex-direction:column;background:var(--cz-bg);border-left:1px solid var(--cz-line2);
  overflow:hidden;animation:cz-in .22s cubic-bezier(.2,.7,.2,1) both}
@keyframes cz-in{from{opacity:0;transform:translateX(14px)}}
.cz-head{display:flex;align-items:center;gap:8px;padding:12px 10px 8px 16px}
.cz-title{font-size:18px;font-weight:700;letter-spacing:-.01em}
.cz-dirty{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:var(--cz-accent-soft);font-size:12px;font-weight:600;color:var(--cz-ink)}
.cz-dirty::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--cz-accent)}
.cz-spacer{flex:1}

.cz-tabs{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:0 12px 4px;padding:4px;border-radius:12px;background:var(--cz-sunk);border:1px solid var(--cz-line)}
.cz-tab{display:flex;flex-direction:column;align-items:center;gap:4px;padding:7px 2px 6px;background:none;border:0;
  border-radius:9px;font-size:12px;font-weight:600;color:var(--cz-ink2);transition:color .15s,background .15s}
.cz-tab:hover{color:var(--cz-ink);background:var(--cz-card)}
.cz-tab[aria-selected=true]{background:var(--cz-fill);color:var(--cz-fill-ink)}
.cz-tab[aria-selected=true] svg{color:inherit}
.cz-tab-ind{display:none}

.cz-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:10px 12px 18px;scrollbar-width:thin}

.cz-err{display:flex;gap:8px;align-items:flex-start;margin:10px 12px 0;padding:11px 8px 11px 12px;border-radius:12px;border:1px solid var(--cz-danger);
  background:var(--cz-danger-soft);color:var(--cz-danger)}
.cz-err svg{flex:none;margin-top:1px}
.cz-err p{flex:1;font-weight:550}
.cz-busy{position:absolute;inset:0 0 auto 0;height:4px;overflow:hidden;z-index:2}
.cz-busy i{display:block;width:40%;height:100%;background:var(--cz-accent);animation:cz-slide 1s ease-in-out infinite}
@keyframes cz-slide{from{transform:translateX(-100%)}to{transform:translateX(250%)}}

.cz-foot{display:flex;align-items:center;gap:10px;padding:14px 12px 16px;border-top:1px solid var(--cz-line);background:var(--cz-bg)}
.cz-foot .cz-btn{min-height:40px;font-size:14px}
.cz-foot .cz-btn--primary{flex:1}
.cz-ask{flex:1;min-width:0;font-weight:600}

.cz-pill{position:fixed;z-index:1000;right:16px;bottom:16px;display:flex;gap:6px;padding:6px;background:var(--cz-bg);
  border:1px solid var(--cz-line2);border-radius:999px;box-shadow:var(--cz-shadow);animation:cz-in .2s ease-out both}
.cz-pill .cz-btn{border-radius:999px}

/* sections: each one is its own chunky card */
.cz-sec{margin-bottom:10px;border:1px solid var(--cz-line);border-radius:14px;background:var(--cz-card);transition:border-color .15s}
.cz-sec[data-open=true]{border-color:var(--cz-line2)}
.cz-sec-h{font-size:15px;font-weight:650}
.cz-sec-btn{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;background:none;border:0;text-align:left;border-radius:13px}
.cz-sec-btn:hover .cz-sec-title{color:var(--cz-accent)}
.cz-sec-ico{flex:none;width:28px;height:28px;padding:6px;border-radius:10px;background:var(--cz-accent-soft);color:var(--cz-accent)}
.cz-sec-title{flex:1;font-weight:650;font-size:15px}
.cz-sec-meta{padding:1px 9px;border-radius:999px;background:var(--cz-sunk);font-size:12px;font-weight:600;color:var(--cz-ink);font-variant-numeric:tabular-nums}
.cz-chev{flex:none;color:var(--cz-ink2);transition:transform .2s}
.cz-sec[data-open=true] .cz-chev{transform:rotate(180deg)}
.cz-sec-panel{display:grid;grid-template-rows:0fr;visibility:hidden;transition:grid-template-rows .24s ease,visibility 0s .24s}
.cz-sec[data-open=true] .cz-sec-panel{grid-template-rows:1fr;visibility:visible;transition:grid-template-rows .24s ease,visibility 0s}
.cz-sec-inner{min-height:0;overflow:hidden;margin:0 -4px;padding:0 18px}
.cz-stack{display:flex;flex-direction:column;gap:14px;padding:2px 0 14px}
.cz-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cz-row{display:flex;align-items:center;gap:8px}
.cz-hint{font-size:12.5px;line-height:1.5;font-weight:550;color:var(--cz-ink2)}
.cz-hint code{font:600 12px ui-monospace,SFMono-Regular,Menlo,monospace;padding:1px 5px;border-radius:5px;background:var(--cz-sunk);color:var(--cz-ink)}
.cz-link{padding:0;background:none;border:0;color:var(--cz-accent);font-weight:600;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:2px}
.cz-sub{font-size:13px;font-weight:650;color:var(--cz-ink)}

/* fields */
.cz-field{display:flex;flex-direction:column;gap:7px;min-width:0}
.cz-label{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px;font-weight:650}
.cz-count{font-weight:550;color:var(--cz-ink2);font-variant-numeric:tabular-nums}
.cz-count[data-warn]{color:var(--cz-danger)}
.cz-input,.cz-select,.cz-textarea{width:100%;min-height:38px;padding:9px 12px;border:1px solid var(--cz-line);border-radius:12px;
  background:var(--cz-sunk);font-weight:600;outline:0;transition:background .15s,border-color .15s,box-shadow .15s}
.cz-input::placeholder,.cz-textarea::placeholder{color:var(--cz-ink3);font-weight:550}
.cz-input:hover,.cz-select:hover,.cz-textarea:hover{border-color:var(--cz-line2)}
.cz .cz-input:focus,.cz .cz-select:focus,.cz .cz-textarea:focus{outline:0;border-color:var(--cz-accent);box-shadow:0 0 0 4px var(--cz-ring)}
.cz-textarea{min-height:104px;resize:vertical;line-height:1.5}
.cz-select-wrap{position:relative;display:block;min-width:0}
.cz-select{appearance:none;-webkit-appearance:none;padding-right:36px;text-overflow:ellipsis;cursor:pointer}
.cz-caret{position:absolute;right:12px;top:50%;margin-top:-7px;pointer-events:none;color:var(--cz-ink2)}
.cz-select-wrap[data-lead] .cz-select{padding-left:36px}
.cz-lead{position:absolute;left:13px;top:50%;margin-top:-7px;pointer-events:none;color:var(--cz-accent)}

/* buttons */
.cz-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:0 16px;border-radius:12px;
  border:1px solid var(--cz-line2);background:var(--cz-card);font-weight:650;white-space:nowrap;
  transition:background .15s,filter .15s,border-color .15s,color .15s,transform .08s,box-shadow .08s}
.cz-btn:hover{background:var(--cz-hover);border-color:var(--cz-ink3)}
.cz-btn:active:not(:disabled){transform:translateY(1px)}
.cz-btn--primary:active:not(:disabled),.cz-btn--danger:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 color-mix(in srgb,var(--shade) 60%,transparent)}

.cz-btn--primary{background:var(--cz-fill);border-color:var(--edge);color:var(--cz-fill-ink);font-weight:700;letter-spacing:.01em}
.cz-btn--primary:hover{background:var(--cz-fill);border-color:color-mix(in srgb,var(--shade) 40%,transparent);filter:brightness(1.08)}
.cz-btn--danger{background:var(--cz-danger);border-color:color-mix(in srgb,var(--shade) 40%,transparent);color:var(--cz-danger-ink)}
.cz-btn--danger:hover{background:var(--cz-danger);border-color:color-mix(in srgb,var(--shade) 40%,transparent);filter:brightness(1.08)}
.cz-btn--sm{min-height:38px;padding:0 12px;font-size:13px}
.cz-btn--block{width:100%}
.cz-btn--dashed{border-style:dashed;box-shadow:none;background:transparent;color:var(--cz-ink)}
.cz-btn--dashed:hover{border-color:var(--cz-accent);color:var(--cz-accent);background:var(--cz-accent-soft)}
.cz-btn:disabled{opacity:1;cursor:not-allowed;box-shadow:none;transform:none;filter:none;background:var(--cz-card);border-color:var(--cz-line);color:var(--cz-ink3)}
.cz-btn:disabled:hover{background:var(--cz-card);border-color:var(--cz-line);filter:none}
.cz-ibtn:disabled{opacity:.4;cursor:not-allowed}
.cz-file{position:relative;cursor:pointer}
.cz-file:has(input:focus-visible){outline:3px solid var(--cz-accent);outline-offset:2px}
.cz-file[aria-disabled=true]{opacity:.5;pointer-events:none}
.cz-ibtn{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:34px;height:34px;padding:0;
  border:0;border-radius:10px;background:transparent;color:var(--cz-ink2);font-size:12px;font-weight:650;transition:background .15s,color .15s}
.cz-ibtn:hover:not(:disabled){background:var(--cz-hover);color:var(--cz-ink)}
.cz-ibtn--danger:hover:not(:disabled){background:var(--cz-danger-soft);color:var(--cz-danger)}
.cz-ibtn[data-armed]{padding:0 12px;background:var(--cz-danger);color:var(--cz-danger-ink)}
.cz-ibtn[data-armed]:hover:not(:disabled){background:var(--cz-danger);color:var(--cz-danger-ink)}

/* segmented, switch */
.cz-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;padding:4px;background:var(--cz-sunk);border:1px solid var(--cz-line);border-radius:14px}
.cz-seg-opt{position:relative;display:block}
.cz-seg-opt span{display:block;padding:9px 8px;border-radius:10px;text-align:center;font-weight:650;color:var(--cz-ink2);cursor:pointer;transition:background .15s,color .15s}
.cz-seg-opt:hover span{color:var(--cz-ink);background:var(--cz-card)}
.cz-seg-opt input:checked + span{background:var(--cz-fill);color:var(--cz-fill-ink)}
.cz-seg-opt input:focus-visible + span{outline:3px solid var(--cz-accent);outline-offset:2px}
.cz-switch{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;border:1px solid var(--cz-line);background:var(--cz-sunk);cursor:pointer;font-weight:600}
.cz-track{flex:none;position:relative;width:50px;height:28px;border-radius:999px;background:var(--cz-line2);transition:background .18s}
.cz-track::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:var(--cz-ink);box-shadow:0 2px 0 color-mix(in srgb,var(--shade) 35%,transparent);transition:transform .18s}
.cz-switch input:checked ~ .cz-track::after{background:var(--cz-fill-ink)}
.cz-switch input:checked ~ .cz-track{background:var(--cz-fill)}
.cz-switch input:checked ~ .cz-track::after{transform:translateX(22px)}
.cz-switch input:focus-visible ~ .cz-track{outline:3px solid var(--cz-accent);outline-offset:2px}

/* range */
.cz-range{-webkit-appearance:none;appearance:none;width:100%;height:26px;margin:0;background:transparent;cursor:pointer;--pct:50%}
.cz-range::-webkit-slider-runnable-track{height:10px;border-radius:999px;background:linear-gradient(to right,var(--cz-accent) var(--pct),var(--cz-line2) var(--pct))}
.cz-range::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;margin-top:-7px;border-radius:50%;background:var(--cz-bg);border:4px solid var(--cz-accent);box-shadow:0 2px 0 color-mix(in srgb,var(--shade) 40%,transparent)}
.cz-range::-moz-range-track{height:10px;border-radius:999px;background:var(--cz-line2)}
.cz-range::-moz-range-progress{height:10px;border-radius:999px;background:var(--cz-accent)}
.cz-range::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:var(--cz-bg);border:4px solid var(--cz-accent)}
.cz-val{min-width:48px;text-align:right;font-weight:600;color:var(--cz-ink);font-variant-numeric:tabular-nums}

/* colors */
.cz-swatch{position:relative;flex:none;display:block;width:36px;height:36px;border-radius:50%;overflow:hidden;border:3px solid var(--cz-ink);box-shadow:0 0 0 2px color-mix(in srgb,var(--shade) 50%,transparent)}
.cz-swatch:has(input:focus-visible){outline:3px solid var(--cz-accent);outline-offset:4px}
.cz-swatch input{position:absolute;inset:-8px;width:calc(100% + 16px);height:calc(100% + 16px);padding:0;border:0;background:none;cursor:pointer;-webkit-appearance:none;appearance:none}
.cz-swatch input::-webkit-color-swatch-wrapper{padding:0}
.cz-swatch input::-webkit-color-swatch{border:0}
.cz-swatch input::-moz-color-swatch{border:0}
.cz-colors{display:flex;flex-direction:column;gap:2px}
.cz-color{display:flex;align-items:center;gap:14px;padding:7px 8px;margin:0 -8px;border-radius:12px;cursor:pointer;transition:background .15s}
.cz-color:hover{background:var(--cz-hover)}
.cz-color-name{flex:1;font-weight:600}
.cz-color-hex{font:700 12.5px ui-monospace,SFMono-Regular,Menlo,monospace;padding:3px 8px;border-radius:7px;background:var(--cz-sunk);color:var(--cz-ink2)}

/* presets */
.cz-presets{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 10px}
.cz-preset{display:flex;flex-direction:column;gap:7px;min-width:0;padding:0;background:none;border:0;text-align:left;border-radius:14px}
.cz-preset-tile{position:relative;display:flex;flex-direction:column;justify-content:center;aspect-ratio:4/3;padding:10px;border-radius:14px;
  border:1px solid color-mix(in srgb,var(--cz-ink) 14%,transparent);transition:border-color .15s,transform .15s}
.cz-preset:hover .cz-preset-tile{transform:translateY(-2px);border-color:color-mix(in srgb,var(--cz-ink) 40%,transparent)}
.cz-preset[aria-pressed=true] .cz-preset-tile{border-color:var(--cz-ink);box-shadow:0 0 0 3px var(--cz-accent),0 3px 0 3px color-mix(in srgb,var(--shade) 55%,transparent)}
.cz-pv-card{display:flex;flex-direction:column;gap:5px;padding:8px;border-radius:8px}
.cz-pv-line{height:5px;border-radius:3px;opacity:.8}
.cz-pv-line:nth-child(2){width:64%}
.cz-pv-pill{width:40%;height:9px;margin-top:2px;border-radius:999px}
.cz-preset-check{position:absolute;top:-7px;right:-7px;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--cz-fill);color:var(--cz-fill-ink);border:1px solid var(--cz-bg)}
.cz-preset-name{font-size:13px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* shape preview */
.cz-radii{display:flex;align-items:center;gap:18px;padding:14px;border-radius:14px;border:1px solid var(--cz-line);background:var(--cz-sunk)}
.cz-radii-frame{flex:none;display:grid;place-items:center;width:92px;height:72px;border:3px solid var(--cz-ink3);background:var(--cz-bg)}
.cz-radii-card{display:grid;place-items:center;width:64px;height:44px;border:3px solid var(--cz-accent);background:var(--cz-accent-soft)}
.cz-radii-chip{width:30px;height:16px;background:var(--cz-accent)}
.cz-radii dl{display:grid;grid-template-columns:auto auto;gap:3px 16px;font-variant-numeric:tabular-nums}
.cz-radii dt{color:var(--cz-ink2);font-weight:550}
.cz-radii dd{font-weight:650;text-align:right}

/* items (cards, rules, stickers) */
.cz-list{display:flex;flex-direction:column;gap:12px}
.cz-item{display:flex;flex-direction:column;gap:12px;padding:12px;border:1px solid var(--cz-line);border-radius:14px;background:var(--cz-bg)}
.cz-item-top{display:flex;align-items:center;gap:10px}
.cz-item-top .cz-input{flex:1;font-weight:600}
.cz-item-ico{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:var(--cz-fill);color:var(--cz-fill-ink)}
.cz-item-bar{display:flex;align-items:center;justify-content:space-between;gap:8px}
.cz-item-type{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--cz-ink2)}
.cz-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;background:var(--cz-card);border:1px solid var(--cz-line);font-size:11.5px;font-weight:650;color:var(--cz-ink)}
.cz-item-main{display:flex;flex-direction:column;gap:10px;transition:opacity .15s}
.cz-item[data-hidden] .cz-item-main{opacity:.5}
.cz-actions{display:flex;align-items:center;gap:2px}
.cz-add-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cz-add-grid .cz-btn{justify-content:flex-start}
.cz-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:22px 14px;border:1px dashed var(--cz-line2);border-radius:14px;color:var(--cz-ink2);text-align:center;font-weight:550}

/* css rules */
.cz-prop{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px}
.cz-prop-label{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cz-prop .cz-select-wrap{width:140px}
.cz-prop-range{display:flex;align-items:center;gap:4px;width:150px}
.cz-prop-range .cz-val{min-width:46px}

/* tags, links, chips */
.cz-tags{display:flex;flex-wrap:wrap;gap:7px;padding:8px;border:1px solid var(--cz-line);border-radius:12px;background:var(--cz-sunk);cursor:text;transition:border-color .15s,box-shadow .15s}
.cz-tags:focus-within{border-color:var(--cz-accent);box-shadow:0 0 0 4px var(--cz-ring)}
.cz-tags input{flex:1;min-width:90px;height:30px;padding:0 4px;background:none;border:0;outline:0;font-weight:600}
.cz .cz-tags input:focus-visible{outline:0}
.cz-chip{display:inline-flex;align-items:center;gap:2px;height:30px;padding:0 4px 0 12px;border:1px solid var(--cz-line2);border-radius:999px;background:var(--cz-card);font-size:13px;font-weight:600}
.cz-chip button{display:grid;place-items:center;width:22px;height:22px;padding:0;border:0;border-radius:50%;background:none;color:var(--cz-ink2)}
.cz-chip button:hover{background:var(--cz-danger-soft);color:var(--cz-danger)}
.cz-link-row{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr) auto;gap:6px;align-items:center}
.cz-file-chip{display:flex;align-items:center;gap:10px;padding:8px 6px 8px 12px;border-radius:12px;border:1px solid var(--cz-line);background:var(--cz-sunk);font-weight:600}
.cz-file-chip span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cz-file-chip svg:first-child{flex:none;color:var(--cz-accent)}

/* friends */
.cz-friend{display:flex;align-items:center;gap:10px;padding:7px 8px 7px 10px;border:1px solid var(--cz-line);border-radius:12px;background:var(--cz-bg)}
.cz-rank{width:18px;text-align:center;font-weight:700;color:var(--cz-accent);font-variant-numeric:tabular-nums}
.cz-ava{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--cz-fill);color:var(--cz-fill-ink);font-size:14px;font-weight:700}
.cz-friend-name{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* stickers & photos */
.cz-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:10px}
.cz-thumb{display:grid;place-items:center;aspect-ratio:1;padding:6px;border:1px solid var(--cz-line2);border-radius:12px;
  background-color:var(--cz-bg);background-image:conic-gradient(color-mix(in srgb,var(--cz-ink) 12%,transparent) 25%,transparent 0 50%,color-mix(in srgb,var(--cz-ink) 12%,transparent) 0 75%,transparent 0);background-size:12px 12px}
.cz-thumb img{max-width:100%;max-height:100%;object-fit:contain}
.cz-thumb[aria-pressed=true]{border-color:var(--cz-accent);box-shadow:0 0 0 3px var(--cz-ring)}
.cz-pgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cz-photo{display:flex;flex-direction:column;gap:8px;min-width:0;padding:8px;border:1px solid var(--cz-line);border-radius:14px;background:var(--cz-bg);transition:border-color .12s,opacity .12s}
.cz-photo[data-drag]{opacity:.45}
.cz-photo[data-over]{border-color:var(--cz-accent);box-shadow:0 0 0 3px var(--cz-ring)}
.cz-photo-tile{position:relative;display:grid;place-items:center;aspect-ratio:1;overflow:hidden;border-radius:9px;background:var(--cz-sunk);color:var(--cz-ink3);cursor:grab}
.cz-photo-tile:active{cursor:grabbing}
.cz-photo-tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;-webkit-user-drag:none}
.cz-photo-grip,.cz-photo-likes{position:absolute;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--cz-sunk) 78%,transparent);color:var(--cz-ink);font-size:12px;font-weight:650;backdrop-filter:blur(4px)}
.cz-photo-grip{top:6px;left:6px;padding:4px}
.cz-photo-likes{left:6px;bottom:6px}
.cz-photo .cz-input{min-height:34px;padding:4px 9px;font-size:12.5px}
.cz-photo-bar{display:flex;align-items:center;justify-content:space-between}

/* spinner */
.cz-spin{animation:cz-spin .8s linear infinite}
@keyframes cz-spin{to{transform:rotate(360deg)}}

/* touch + small screens */
@media (pointer:coarse){
  .cz-ibtn{min-width:40px;height:40px}
  .cz-btn,.cz-input,.cz-select{min-height:46px}
  .cz-btn--sm{min-height:40px}
}
@media (max-width:640px){
  .cz{top:auto;left:0;right:0;bottom:0;width:auto;max-width:none;height:min(70vh,660px);height:min(70dvh,660px);
    border-left:0;border-top:1px solid var(--cz-line2);border-radius:20px 20px 0 0}
  .cz-pill{right:12px;bottom:12px}
}
@media (prefers-reduced-motion:reduce){
  .cz,.cz *,.cz-pill,.cz-pill *{animation:none!important;transition:none!important}
}
`;

// ═══ 3. UI PRIMITIVES ═══════════════════════════════════════════════════════

/** Collapsible group. Re-mount it (change `key`) to re-open it. */
function Section({ title, icon: Icon, hint, meta, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="cz-sec" data-open={open}>
      <h3 className="cz-sec-h">
        <button type="button" className="cz-sec-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          {Icon && <Icon className="cz-sec-ico" size={20} weight="fill" aria-hidden="true" />}
          <span className="cz-sec-title">{title}</span>
          {meta != null && <span className="cz-sec-meta">{meta}</span>}
          <CaretDown className="cz-chev" size={14} weight="bold" aria-hidden="true" />
        </button>
      </h3>
      <div id={id} className="cz-sec-panel" role="region" aria-label={title}>
        <div className="cz-sec-inner">
          <div className="cz-stack">
            {hint && <p className="cz-hint">{hint}</p>}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, count, max, children }) {
  return (
    <label className="cz-field">
      <span className="cz-label">
        <span>{label}</span>
        {max != null && <span className="cz-count" data-warn={count >= max * 0.9 || undefined}>{count}/{max}</span>}
      </span>
      {children}
    </label>
  );
}

function Group({ label, children }) {
  return (
    <div className="cz-field" role="group" aria-label={label}>
      <span className="cz-label">{label}</span>
      {children}
    </div>
  );
}

function TextField({ label, value = '', onChange, max, placeholder }) {
  return (
    <Field label={label} count={value.length} max={max}>
      <input className="cz-input" value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function Select({ label, ariaLabel, value, onChange, lead: Lead, disabled, children }) {
  const control = (
    <span className="cz-select-wrap" data-lead={Lead ? '' : undefined}>
      {Lead && <Lead className="cz-lead" size={14} weight="bold" aria-hidden="true" />}
      <select className="cz-select" value={value} onChange={onChange} disabled={disabled} aria-label={label ? undefined : ariaLabel}>{children}</select>
      <CaretDown className="cz-caret" size={14} weight="bold" aria-hidden="true" />
    </span>
  );
  return label ? <Field label={label}>{control}</Field> : control;
}

function Segmented({ label, value, options, onChange }) {
  const name = useId();
  return (
    <div className="cz-field" role="radiogroup" aria-label={label}>
      <span className="cz-label">{label}</span>
      <div className="cz-seg">
        {options.map((o) => (
          <label key={o} className="cz-seg-opt">
            <input className="cz-vh" type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} />
            <span>{sentence(o)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Switch({ checked, onChange, children }) {
  return (
    <label className="cz-switch">
      <span>{children}</span>
      <input className="cz-vh" type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="cz-track" aria-hidden="true" />
    </label>
  );
}

function RangeInput({ value, min, max, step = 1, onChange, label }) {
  const pct = clamp(((value - min) / (max - min)) * 100, 0, 100);
  return (
    <input className="cz-range" type="range" min={min} max={max} step={step} value={value} aria-label={label}
      style={{ '--pct': `${pct}%` }} onChange={(e) => onChange(Number(e.target.value))} />
  );
}

function Range({ label, display, ...rest }) {
  return (
    <label className="cz-field">
      <span className="cz-label"><span>{label}</span><span className="cz-val">{display}</span></span>
      <RangeInput label={label} {...rest} />
    </label>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="cz-color">
      <span className="cz-swatch"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} /></span>
      <span className="cz-color-name">{label}</span>
      <span className="cz-color-hex">{String(value).toUpperCase()}</span>
    </label>
  );
}

/** Styled file picker. Hands back a plain array of Files and resets itself so the same file can be chosen twice. */
function FilePick({ children, icon: Icon = UploadSimple, accept = 'image/*', multiple, disabled, block, onFiles }) {
  return (
    <label className={cx('cz-btn cz-file', block && 'cz-btn--block')} aria-disabled={disabled || undefined}>
      <Icon size={16} weight="bold" aria-hidden="true" />
      {children}
      <input className="cz-vh" type="file" accept={accept} multiple={multiple} disabled={disabled}
        onChange={(e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) onFiles(fs); }} />
    </label>
  );
}

function IconButton({ icon: Icon, label, onClick, disabled, danger }) {
  return (
    <button type="button" className={cx('cz-ibtn', danger && 'cz-ibtn--danger')} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      <Icon size={16} weight="bold" aria-hidden="true" />
    </button>
  );
}

/** Two-step delete: first click arms it, second click confirms. Disarms on blur or after 4s. */
function DangerButton({ label = 'Delete', onConfirm, disabled }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const text = armed ? `Confirm: ${label.toLowerCase()}` : label;
  return (
    <button type="button" className="cz-ibtn cz-ibtn--danger" data-armed={armed || undefined} disabled={disabled}
      title={text} aria-label={text} onBlur={() => setArmed(false)}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? <><Check size={14} weight="bold" aria-hidden="true" />Delete?</> : <Trash size={16} weight="bold" aria-hidden="true" />}
    </button>
  );
}

function Empty({ icon: Icon, children }) {
  return (
    <div className="cz-empty">
      <Icon size={24} weight="duotone" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

// ═══ 4. EDITORS ═════════════════════════════════════════════════════════════

/** Chips for a list of short strings. Enter or comma adds, Backspace on empty removes the last one. */
function TagInput({ tags, max, onChange, placeholder, label }) {
  const [text, setText] = useState('');
  const ref = useRef(null);
  const commit = (raw) => {
    const add = raw.split(',').map((x) => x.trim()).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i && !tags.includes(t));
    if (add.length) onChange([...tags, ...add].slice(0, max));
    setText('');
  };
  return (
    <div className="cz-tags" onClick={() => ref.current?.focus()}>
      {tags.map((t) => (
        <span className="cz-chip" key={t}>{t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}><X size={11} weight="bold" aria-hidden="true" /></button>
        </span>
      ))}
      <input ref={ref} value={text} aria-label={label} disabled={tags.length >= max}
        placeholder={tags.length ? '' : placeholder}
        onChange={(e) => (e.target.value.includes(',') ? commit(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(text); }
          else if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => commit(text)} />
    </div>
  );
}

function LinksEditor({ links, onChange }) {
  const set = (i, patch) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="cz-list">
      {links.map((l, i) => (
        <div className="cz-link-row" key={i}>
          <input className="cz-input" placeholder="Label" aria-label={`Link ${i + 1} label`} value={l.label || ''} onChange={(e) => set(i, { label: e.target.value })} />
          <input className="cz-input" placeholder="https://…" inputMode="url" aria-label={`Link ${i + 1} address`} value={l.url || ''} onChange={(e) => set(i, { url: e.target.value })} />
          <IconButton icon={X} label="Remove link" onClick={() => onChange(links.filter((_, j) => j !== i))} />
        </div>
      ))}
      <button type="button" className="cz-btn cz-btn--sm cz-btn--dashed cz-btn--block" disabled={links.length >= MAX_LINKS} onClick={() => onChange([...links, { label: '', url: '' }])}>
        <Plus size={14} weight="bold" aria-hidden="true" />Add a link
      </button>
    </div>
  );
}

function CardBody({ c, setContent, goTab }) {
  switch (c.type) {
    case 'about':
    case 'text': {
      const body = c.content.body || '';
      return (
        <div className="cz-field">
          <textarea className="cz-textarea" rows={4} maxLength={3000} value={body} aria-label={`${c.title || 'Card'} text`}
            onChange={(e) => setContent({ ...c.content, body: e.target.value })} />
          <p className="cz-hint">Supports <code>**bold**</code>, <code>*italic*</code> and <code>[link text](https://…)</code>.</p>
        </div>
      );
    }
    case 'links':
      return <LinksEditor links={c.content.links || []} onChange={(links) => setContent({ links })} />;
    case 'interests':
      return (
        <div className="cz-field">
          <TagInput label="Add an interest" tags={c.content.interests || []} max={MAX_INTERESTS} placeholder="Type an interest and press Enter"
            onChange={(interests) => setContent({ interests })} />
          <p className="cz-hint">{(c.content.interests || []).length} of {MAX_INTERESTS}. Press Enter or comma to add.</p>
        </div>
      );
    case 'gallery':
      return <p className="cz-hint">Shows your photos. Add and arrange them in <button type="button" className="cz-link" onClick={() => goTab('Media')}>Media</button>.</p>;
    case 'guestbook':
      return <p className="cz-hint">Shows what visitors write. Choose who can write in <button type="button" className="cz-link" onClick={() => goTab('Profile')}>Profile</button>.</p>;
    case 'top_friends':
      return <p className="cz-hint">Shows your top friends. Choose them in <button type="button" className="cz-link" onClick={() => goTab('Profile')}>Profile</button>.</p>;
    default:
      return null;
  }
}

function CardItem({ c, first, last, busy, onTitle, onMove, onToggle, onDelete, setContent, goTab }) {
  const { label, icon: Icon } = typeMeta(c.type);
  return (
    <li className="cz-item" data-hidden={!c.visible || undefined}>
      <div className="cz-item-top">
        <span className="cz-item-ico"><Icon size={20} weight="fill" aria-hidden="true" /></span>
        <input className="cz-input" value={c.title || ''} maxLength={60} placeholder="Card title" aria-label={`${label} card title`} onChange={(e) => onTitle(e.target.value)} />
      </div>
      <div className="cz-item-bar">
        <span className="cz-item-type">
          {label}
          {!c.visible && <span className="cz-badge"><EyeSlash size={12} weight="bold" aria-hidden="true" />Hidden</span>}
        </span>
        <span className="cz-actions">
          <IconButton icon={ArrowUp} label="Move up" disabled={first} onClick={() => onMove(-1)} />
          <IconButton icon={ArrowDown} label="Move down" disabled={last} onClick={() => onMove(1)} />
          <IconButton icon={c.visible ? Eye : EyeSlash} label={c.visible ? 'Hide card' : 'Show card'} onClick={onToggle} />
          <DangerButton label="Delete card" disabled={busy} onConfirm={onDelete} />
        </span>
      </div>
      <div className="cz-item-main"><CardBody c={c} setContent={setContent} goTab={goTab} /></div>
    </li>
  );
}

/** One control for one CSS property — picks the right input from the property's spec. */
function PropControl({ k, v, onChange }) {
  const sp = PROPS[k];
  if (sp.type === 'color') {
    return <span className="cz-swatch"><input type="color" aria-label={sp.label} value={v.slice(0, 7)} onChange={(e) => onChange(e.target.value)} /></span>;
  }
  if (sp.type === 'enum') {
    return <Select ariaLabel={sp.label} value={v} onChange={(e) => onChange(e.target.value)}>{sp.opts.map((o) => <option key={o}>{o}</option>)}</Select>;
  }
  const cfg = sp.type === 'px'
    ? { min: sp.min, max: sp.max, val: parseInt(v, 10), out: (n) => `${n}px`, show: (n) => `${n}px` }
    : sp.type === 'rotate'
      ? { min: -20, max: 20, val: parseInt(v.slice(7), 10), out: (n) => `rotate(${n}deg)`, show: (n) => `${n}°` }
      : { min: 0.1, max: 1, step: 0.1, val: Number(v), out: (n) => (n >= 1 ? '1' : n.toFixed(1)), show: (n) => `${Math.round(n * 100)}%` };
  const val = Number.isNaN(cfg.val) ? cfg.min : cfg.val;
  return (
    <span className="cz-prop-range">
      <RangeInput label={sp.label} min={cfg.min} max={cfg.max} step={cfg.step || 1} value={val} onChange={(n) => onChange(cfg.out(n))} />
      <span className="cz-val">{cfg.show(val)}</span>
    </span>
  );
}

function RuleEditor({ r, i, ctx }) {
  const { setRule, setProp, dropProp, setDraft } = ctx;
  const entries = Object.entries(r.p);
  return (
    <li className="cz-item">
      <div className="cz-item-top">
        <Select ariaLabel="Element" value={r.s} onChange={(e) => setRule(i, { s: e.target.value })}>
          {Object.entries(SELECTORS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <IconButton icon={Trash} danger label="Delete rule" onClick={() => setDraft((d) => ({ ...d, css: d.css.filter((_, j) => j !== i) }))} />
      </div>
      {entries.map(([k, v]) => (
        <div className="cz-prop" key={k}>
          <span className="cz-prop-label">{PROPS[k].label}</span>
          <PropControl k={k} v={v} onChange={(nv) => setProp(i, k, nv)} />
          <IconButton icon={X} label={`Remove ${PROPS[k].label}`} onClick={() => dropProp(i, k)} />
        </div>
      ))}
      {entries.length < MAX_PROPS && (
        <Select lead={Plus} ariaLabel="Add a property" value="" onChange={(e) => e.target.value && setProp(i, e.target.value, PROPS[e.target.value].def)}>
          <option value="">Add a property…</option>
          {Object.keys(PROPS).filter((k) => !(k in r.p)).map((k) => <option key={k} value={k}>{PROPS[k].label}</option>)}
        </Select>
      )}
    </li>
  );
}

function PhotoGrid({ ctx }) {
  const { photos, img, run, reload, movePhoto } = ctx;
  const [dragI, setDragI] = useState(null);
  const [overI, setOverI] = useState(null);
  const end = () => { setDragI(null); setOverI(null); };
  return (
    <ul className="cz-pgrid">
      {photos.map((p, i) => (
        <li key={p.id} className="cz-photo" data-drag={dragI === i || undefined} data-over={(overI === i && dragI !== i) || undefined}
          onDragEnter={() => dragI != null && setOverI(i)} onDragOver={(e) => e.preventDefault()}
          onDrop={() => { if (dragI != null && dragI !== i) movePhoto(dragI, i); end(); }}>
          <div className="cz-photo-tile" draggable onDragStart={() => setDragI(i)} onDragEnd={end}>
            {img[p.path] ? <img src={img[p.path]} alt="" draggable={false} /> : <ImageIcon size={28} weight="duotone" aria-hidden="true" />}
            <span className="cz-photo-grip" aria-hidden="true"><DotsSixVertical size={14} weight="bold" /></span>
            <span className="cz-photo-likes"><Heart size={11} weight="fill" aria-hidden="true" />{p.like_count ?? 0}<span className="cz-vh"> likes</span></span>
          </div>
          <input className="cz-input" defaultValue={p.caption || ''} placeholder="Add a caption" maxLength={300} aria-label={`Caption for photo ${i + 1}`}
            onBlur={(e) => e.target.value !== (p.caption || '') && run(async () => { await social.setCaption(p.id, e.target.value); await reload(); })} />
          <div className="cz-photo-bar">
            <span className="cz-actions">
              <IconButton icon={CaretLeft} label="Move earlier" disabled={i === 0} onClick={() => movePhoto(i, i - 1)} />
              <IconButton icon={CaretRight} label="Move later" disabled={i === photos.length - 1} onClick={() => movePhoto(i, i + 1)} />
            </span>
            <DangerButton label="Delete photo" onConfirm={() => run(async () => { await social.deletePhoto(p); await reload(); })} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function TopFriends({ ctx }) {
  const { draft, setDraft, fl, moveTop } = ctx;
  const available = fl.filter((f) => !draft.top.includes(f.id));
  return (
    <Section title="Top friends" icon={UsersThree} meta={`${draft.top.length}/${MAX_TOP}`}>
      {!fl.length && <p className="cz-hint">Add some friends first, then pick your top {MAX_TOP} here.</p>}
      {draft.top.length > 0 && (
        <ul className="cz-list">
          {draft.top.map((id, i) => {
            const f = fl.find((x) => x.id === id);
            return f && (
              <li className="cz-friend" key={id}>
                <span className="cz-rank">{i + 1}</span>
                <span className="cz-ava" aria-hidden="true">{(f.display_name || '?').charAt(0).toUpperCase()}</span>
                <span className="cz-friend-name">{f.display_name}</span>
                <span className="cz-actions">
                  <IconButton icon={ArrowUp} label={`Move ${f.display_name} up`} disabled={i === 0} onClick={() => moveTop(i, -1)} />
                  <IconButton icon={ArrowDown} label={`Move ${f.display_name} down`} disabled={i === draft.top.length - 1} onClick={() => moveTop(i, 1)} />
                  <IconButton icon={X} label={`Remove ${f.display_name}`} onClick={() => setDraft((d) => ({ ...d, top: d.top.filter((x) => x !== id) }))} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {draft.top.length < MAX_TOP && available.length > 0 && (
        <Select lead={Plus} ariaLabel="Add a friend" value="" onChange={(e) => e.target.value && setDraft((d) => ({ ...d, top: [...d.top, e.target.value] }))}>
          <option value="">Add a friend…</option>
          {available.map((f) => <option key={f.id} value={f.id}>{f.display_name}</option>)}
        </Select>
      )}
      {draft.top.length >= MAX_TOP && <p className="cz-hint">Your top {MAX_TOP} is full. Remove someone to add another.</p>}
    </Section>
  );
}

function FileChip({ icon: Icon, children, onRemove, removeLabel }) {
  return (
    <div className="cz-file-chip">
      <Icon size={18} weight="duotone" aria-hidden="true" />
      <span>{children}</span>
      <IconButton icon={X} label={removeLabel} onClick={onRemove} />
    </div>
  );
}

function MusicSection({ ctx }) {
  const { draft, setMusic, run, busy } = ctx;
  const m = draft.fields.music || {};
  const orig = draft.origMusic || {};
  const del = { audio: media.deleteAudio, cover: media.deleteImage };

  // Files uploaded during this edit session (not the saved ones) are deleted as soon as they're replaced or removed.
  const dropFile = (kind) => { if (m[kind] && m[kind] !== orig[kind]) del[kind](m[kind]).catch(() => {}); };
  const upload = (kind, file) => run(async () => {
    const path = kind === 'audio' ? await media.uploadAudio(file) : await media.uploadImage(file, 'cover');
    dropFile(kind);
    setMusic(kind === 'audio' ? { audio: path, url: '' } : { cover: path });
  });
  const remove = (kind) => { dropFile(kind); setMusic({ [kind]: '' }); };

  return (
    <Section title="Music" icon={MusicNotes} defaultOpen={!!(m.audio || m.url)}>
      {m.audio ? (
        <FileChip icon={MusicNote} removeLabel="Remove audio" onRemove={() => remove('audio')}>Audio file added</FileChip>
      ) : (
        <>
          <FilePick accept="audio/*" icon={MusicNote} disabled={busy} block onFiles={(fs) => upload('audio', fs[0])}>Upload audio</FilePick>
          <p className="cz-hint">mp3, m4a or ogg, up to 8 MB. Plays on its own, with no video. Only upload music you have the right to share.</p>
          <Field label="Or paste a link">
            <input className="cz-input" placeholder="YouTube or direct .mp3 link" value={m.url || ''} onChange={(e) => setMusic({ url: e.target.value.trim() })} />
          </Field>
          <p className="cz-hint">YouTube links show their video.</p>
        </>
      )}
      <div className="cz-grid2">
        <TextField label="Title" max={80} value={m.title || ''} onChange={(v) => setMusic({ title: v })} />
        <TextField label="Artist" max={80} value={m.artist || ''} onChange={(v) => setMusic({ artist: v })} />
      </div>
      <Group label="Cover image">
        {m.cover ? (
          <FileChip icon={ImageSquare} removeLabel="Remove cover image" onRemove={() => remove('cover')}>Cover image added</FileChip>
        ) : (
          <FilePick disabled={busy} block onFiles={(fs) => upload('cover', fs[0])}>Choose cover image</FilePick>
        )}
      </Group>
    </Section>
  );
}

// ═══ 5. TABS ════════════════════════════════════════════════════════════════

/** Who am I — identity, privacy, top friends, music. */
function ProfileTab({ ctx }) {
  const { draft, setField, locs, run, busy, reload, notify } = ctx;
  return (
    <>
      <Section title="Basics" icon={UserCircle}>
        <Group label="Avatar">
          <FilePick disabled={busy} block onFiles={(fs) => run(async () => { await profiles.setAvatar(fs[0]); await reload(); notify('Avatar updated'); })}>Change avatar</FilePick>
          <p className="cz-hint">Updates right away.</p>
        </Group>
        <TextField label="Display name" max={50} value={draft.fields.display_name} onChange={(v) => setField('display_name', v)} />
        <TextField label="Mood or headline" max={80} value={draft.fields.headline || ''} onChange={(v) => setField('headline', v)} />
        <Select label="Locality" value={draft.fields.locality_id ?? ''} onChange={(e) => setField('locality_id', e.target.value ? +e.target.value : null)}>
          <option value="">Not set</option>
          {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </Section>

      <Section title="Privacy" icon={ShieldCheck}>
        <Segmented label="Who can write on my wall" value={draft.fields.wall_policy} options={['everyone', 'friends', 'nobody']} onChange={(v) => setField('wall_policy', v)} />
        <Switch checked={!!draft.fields.show_on_map} onChange={(v) => setField('show_on_map', v)}>Show me on my friends’ map</Switch>
      </Section>

      <TopFriends ctx={ctx} />
      <MusicSection ctx={ctx} />
    </>
  );
}

function ThemeSelect({ k, th, setTheme }) {
  return (
    <Select label={sentence(k)} value={th[k]} onChange={(e) => setTheme(k, e.target.value)}>
      {OPTIONS[k].filter((o) => o !== 'custom' || th.font_file).map((o) => <option key={o}>{o}</option>)}
    </Select>
  );
}

function ThemeGroup({ name, icon, ctx, intro }) {
  return (
    <Section title={name} icon={icon} defaultOpen={false}>
      {intro}
      <div className="cz-grid2">{groupKeys(name).map((k) => <ThemeSelect key={k} k={k} th={ctx.th} setTheme={ctx.setTheme} />)}</div>
    </Section>
  );
}

function Presets({ ctx }) {
  const { th, setDraft } = ctx;
  return (
    <div className="cz-presets">
      {PRESETS.map((p) => {
        const active = Object.entries(p.theme).every(([k, v]) => th[k] === v);
        return (
          <button key={p.id} type="button" className="cz-preset" aria-pressed={active} title={p.name}
            onClick={() => setDraft((d) => ({ ...d, theme: { ...p.theme, ...(d.theme.bg_image ? { bg_image: d.theme.bg_image } : {}), ...(d.theme.font_file ? { font_file: d.theme.font_file } : {}) } }))}>
            <span className="cz-preset-tile" style={{ background: p.theme.bg_color }}>
              <span className="cz-pv-card" style={{ background: p.theme.card_color }}>
                <span className="cz-pv-line" style={{ background: p.theme.text_color }} />
                <span className="cz-pv-line" style={{ background: p.theme.text_color }} />
                <span className="cz-pv-pill" style={{ background: p.theme.accent_color }} />
              </span>
              {active && <span className="cz-preset-check"><Check size={11} weight="bold" aria-hidden="true" /></span>}
            </span>
            <span className="cz-preset-name">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function BackgroundSection({ ctx }) {
  const { draft, setDraft, setTheme, th, run, busy } = ctx;
  const bg = draft.theme.bg_image;
  const dropOld = (old) => { if (old && old !== draft.origBg) media.deleteImage(old).catch(() => {}); };
  return (
    <Section title="Background" icon={ImageIcon} defaultOpen={false}>
      <div className="cz-grid2">{groupKeys('Background').map((k) => <ThemeSelect key={k} k={k} th={th} setTheme={setTheme} />)}</div>
      <Group label="Background image">
        {bg && (
          <FileChip icon={ImageSquare} removeLabel="Remove background image"
            onRemove={() => { dropOld(bg); setDraft((d) => { const t = { ...d.theme }; delete t.bg_image; return { ...d, theme: t }; }); }}>
            Background image added
          </FileChip>
        )}
        <FilePick disabled={busy} block onFiles={(fs) => run(async () => {
          const old = draft.theme.bg_image;
          const p = await media.uploadImage(fs[0], 'bg');
          dropOld(old);
          setTheme('bg_image', p);
        })}>{bg ? 'Replace image' : 'Upload image'}</FilePick>
        <p className="cz-hint">Large images are compressed automatically.</p>
      </Group>
    </Section>
  );
}

function FontSection({ ctx }) {
  const { draft, setDraft, run, busy } = ctx;
  const path = draft.theme.font_file;
  // a font uploaded during this edit session (not the saved one) is deleted as soon as it is replaced or removed
  const dropOld = (old) => { if (old && old !== draft.origFont) media.deleteFont(old).catch(() => {}); };
  const remove = () => {
    dropOld(path);
    setDraft((d) => {
      const t = { ...d.theme }; delete t.font_file;
      if (t.font === 'custom') t.font = THEME_DEFAULTS.font;
      if (t.name_font === 'custom') t.name_font = THEME_DEFAULTS.name_font;
      return { ...d, theme: t };
    });
  };
  return (
    <Section title="Custom font" icon={TextAa} defaultOpen={!!path}>
      {path && <FileChip icon={TextAa} removeLabel="Remove custom font" onRemove={remove}>Custom font added</FileChip>}
      <FilePick accept=".woff2,.woff,.otf,.ttf,font/woff2,font/woff,font/otf,font/ttf" icon={TextAa} disabled={busy} block
        onFiles={(fs) => run(async () => {
          const old = draft.theme.font_file;
          const p = await media.uploadFont(fs[0]);
          dropOld(old);
          setDraft((d) => ({ ...d, theme: { ...d.theme, font_file: p, font: 'custom' } }));
        })}>{path ? 'Replace font' : 'Upload font'}</FilePick>
      <p className="cz-hint">.woff2, .woff, .otf or .ttf, up to 300 KB. Applies to your body text right away. To use it for your name too, set <code>Name font</code> to custom under Type. Only upload fonts you have the right to use.</p>
    </Section>
  );
}

function ShapePreview({ r: [r1, r2, r3] }) {
  return (
    <div className="cz-radii">
      <div className="cz-radii-frame" style={{ borderRadius: r1 }} aria-hidden="true">
        <div className="cz-radii-card" style={{ borderRadius: r2 }}><div className="cz-radii-chip" style={{ borderRadius: r3 }} /></div>
      </div>
      <dl>
        <dt>Frame</dt><dd>{r1}px</dd>
        <dt>Cards</dt><dd>{r2}px</dd>
        <dt>Inner</dt><dd>{r3}px</dd>
      </dl>
    </div>
  );
}

/** How does it look — easiest controls first, most advanced last. */
function ThemeTab({ ctx }) {
  const { draft, setDraft, th, setTheme, r, setRule } = ctx;
  return (
    <>
      <Section title="Themes" icon={Sparkle} hint="One tap sets colors, shape and fonts. You can still change anything after.">
        <Presets ctx={ctx} />
      </Section>

      <Section title="Colors" icon={Palette}>
        <div className="cz-colors">
          {COLOR_KEYS.map((k) => <ColorField key={k} label={colorLabel(k)} value={th[k]} onChange={(v) => setTheme(k, v)} />)}
        </div>
      </Section>

      <BackgroundSection ctx={ctx} />
      <ThemeGroup name="Shape" icon={Shapes} ctx={ctx} intro={<ShapePreview r={r} />} />
      <ThemeGroup name="Surface" icon={Stack} ctx={ctx} />
      <ThemeGroup name="Type" icon={TextAa} ctx={ctx} />
      <FontSection ctx={ctx} />

      <Section title="Fine-tune" icon={SlidersHorizontal} defaultOpen={false} meta={draft.css.length ? `${draft.css.length}` : undefined}
        hint="Style any part of your page. Only safe values are offered: no scripts, no outside images, nothing that can break the page.">
        {draft.css.length > 0 && (
          <ul className="cz-list">{draft.css.map((rule, i) => <RuleEditor key={i} r={rule} i={i} ctx={{ ...ctx, setRule }} />)}</ul>
        )}
        <button type="button" className="cz-btn cz-btn--dashed cz-btn--block" disabled={draft.css.length >= MAX_RULES}
          onClick={() => setDraft((d) => ({ ...d, css: [...d.css, { s: 'card', p: {} }] }))}>
          <Plus size={16} weight="bold" aria-hidden="true" />Add a style rule
        </button>
      </Section>
    </>
  );
}

/** What's on the page — the cards, and how the page is laid out. */
function ContentTab({ ctx }) {
  const { draft, setCard, move, drop, addCard, run, busy, goTab } = ctx;
  const flow = draft.cards.map((c, i) => ({ c, i })).filter(({ c }) => isFlow(c));
  return (
    <>
      <Section title="Cards" icon={Cards} meta={flow.length} hint="Edit, reorder or hide the sections on your page.">
        {flow.length === 0 && <Empty icon={Cards}>No cards yet. Add one below.</Empty>}
        {flow.length > 0 && (
          <ul className="cz-list">
            {flow.map(({ c, i }, n) => (
              <CardItem key={c.id} c={c} busy={busy} first={n === 0} last={n === flow.length - 1} goTab={goTab}
                onTitle={(title) => setCard(c.id, { title })}
                onMove={(dir) => move(i, dir)}
                onToggle={() => setCard(c.id, { visible: !c.visible })}
                onDelete={() => run(async () => { await cardsApi.deleteCard(c); drop(c.id); })}
                setContent={(content) => setCard(c.id, { content })} />
            ))}
          </ul>
        )}
        <p className="cz-sub">Add a card</p>
        <div className="cz-add-grid">
          {Object.entries(CARD_TYPES).map(([t, { label, icon: Icon }]) => (
            <button key={t} type="button" className="cz-btn cz-btn--sm" disabled={busy} onClick={() => addCard(t)}>
              <Icon size={16} weight="duotone" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Page layout" icon={Layout}>
        <div className="cz-grid2">{groupKeys('Layout').map((k) => <ThemeSelect key={k} k={k} th={ctx.th} setTheme={ctx.setTheme} />)}</div>
      </Section>
    </>
  );
}

function StickersSection({ ctx }) {
  const { stickers, s, sel, setSel, setCard, drop, topZ, img, run, busy, addSticker } = ctx;
  return (
    // key re-opens this section whenever a sticker gets selected on the page
    <Section key={sel ? 'sel' : 'idle'} title="Stickers" icon={Sticker} meta={stickers.length || undefined}>
      <FilePick disabled={busy} block onFiles={(fs) => addSticker(fs[0])}>Add a sticker</FilePick>
      {stickers.length === 0 && <Empty icon={Sticker}>Stickers are small images you can place anywhere on your profile.</Empty>}
      {stickers.length > 0 && (
        <>
          <p className="cz-hint">Drag a sticker on the page to move it. Drag its corner dot to resize.</p>
          <div className="cz-thumbs">
            {stickers.map((c, n) => (
              <button key={c.id} type="button" className="cz-thumb" aria-pressed={c.id === sel} aria-label={`Select sticker ${n + 1}`} onClick={() => setSel(c.id)}>
                {img[c.content.images?.[0]] && <img src={img[c.content.images[0]]} alt="" />}
              </button>
            ))}
          </div>
        </>
      )}
      {s ? (
        <div className="cz-item">
          <Range label="Rotate" display={`${s.rotation}°`} min={-180} max={180} value={s.rotation} onChange={(n) => setCard(s.id, { rotation: n })} />
          <Range label="Size" display={`${s.w}px`} min={40} max={600} value={s.w} onChange={(n) => setCard(s.id, { w: n, h: Math.round((n * s.h) / s.w) })} />
          <div className="cz-item-bar">
            <span className="cz-actions">
              <button type="button" className="cz-btn cz-btn--sm" onClick={() => setCard(s.id, { z: topZ + 1 })}><ArrowLineUp size={14} weight="bold" aria-hidden="true" />Front</button>
              <button type="button" className="cz-btn cz-btn--sm" onClick={() => setCard(s.id, { z: 0 })}><ArrowLineDown size={14} weight="bold" aria-hidden="true" />Back</button>
            </span>
            <DangerButton label="Delete sticker" disabled={busy} onConfirm={() => run(async () => { await cardsApi.deleteCard(s); drop(s.id); setSel(null); })} />
          </div>
        </div>
      ) : stickers.length > 0 && <p className="cz-hint">Select a sticker to edit it.</p>}
    </Section>
  );
}

/** Stickers (decoration on the page) and the photo gallery. */
function MediaTab({ ctx }) {
  const { photos, run, reload, notify, busy } = ctx;
  return (
    <>
      <StickersSection ctx={ctx} />
      <Section title="Photos" icon={Images} meta={photos.length || undefined} hint="Drag to reorder, or use the arrows. Captions appear in the pop-up. Changes here save immediately.">
        <FilePick multiple disabled={busy} block onFiles={(fs) => run(async () => { for (const f of fs) await social.addPhoto(f); await reload(); notify('Photos added'); })}>Add photos</FilePick>
        {photos.length === 0 ? <Empty icon={Images}>No photos yet. Large photos are compressed automatically.</Empty> : <PhotoGrid ctx={ctx} />}
      </Section>
    </>
  );
}

const PANELS = { Profile: ProfileTab, Theme: ThemeTab, Content: ContentTab, Media: MediaTab };

// ═══ 6. CUSTOMIZER ══════════════════════════════════════════════════════════

export default function Customizer({ draft, setDraft, onClose, reload, sel, setSel, notify, photos, img, collapsed, setCollapsed }) {
  // ── state ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('Profile');
  const [job, setJob] = useState(null);          // null | 'work' | 'save'
  const [err, setErr] = useState('');
  const [fl, setFl] = useState([]);
  const [locs, setLocs] = useState([]);
  const [asking, setAsking] = useState(false);   // "Discard your changes?" prompt
  const bodyRef = useRef(null);
  const startRef = useRef(null);
  if (startRef.current === null) startRef.current = JSON.stringify(draft);

  const busy = job !== null;
  const saving = job === 'save';
  const dirty = useMemo(() => JSON.stringify(draft) !== startRef.current, [draft]);

  useEffect(() => { friends.listFriends().then(setFl).catch(() => {}); }, []);
  useEffect(() => { discover.listLocalities().then(setLocs).catch(() => {}); }, []);
  useEffect(() => { if (sel) setTab('Media'); }, [sel]);                      // selecting a sticker on the page jumps to its controls
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [tab]);        // every tab starts at the top

  // ── derived ────────────────────────────────────────────────────────────
  const th = { ...THEME_DEFAULTS, ...draft.theme };
  const r = radii(draft.theme);
  const stickers = draft.cards.filter((c) => c.type === 'sticker');
  const s = stickers.find((c) => c.id === sel);
  const topZ = Math.max(0, ...stickers.map((c) => c.z));

  // ── draft updaters ─────────────────────────────────────────────────────
  const setTheme = (k, v) => setDraft((d) => ({ ...d, theme: { ...d.theme, [k]: v } }));
  const setField = (k, v) => setDraft((d) => ({ ...d, fields: { ...d.fields, [k]: v } }));
  const setMusic = (p) => setDraft((d) => ({ ...d, fields: { ...d.fields, music: Object.fromEntries(Object.entries({ ...d.fields.music, ...p }).filter(([, v]) => v)) } }));
  const setCard = (id, p) => setDraft((d) => ({ ...d, cards: d.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  const drop = (id) => setDraft((d) => ({ ...d, cards: d.cards.filter((x) => x.id !== id) }));
  const move = (i, dir) => setDraft((d) => {
    const c = [...d.cards];
    const f = c.map((x, k) => (isFlow(x) ? k : -1)).filter((k) => k >= 0);
    const a = f.indexOf(i), b = a + dir;
    if (b < 0 || b >= f.length) return d;
    [c[f[a]], c[f[b]]] = [c[f[b]], c[f[a]]];
    return { ...d, cards: c };
  });
  const moveTop = (i, dir) => setDraft((d) => {
    const t = [...d.top]; const j = i + dir;
    if (j < 0 || j >= t.length) return d;
    [t[i], t[j]] = [t[j], t[i]];
    return { ...d, top: t };
  });
  const setRule = (i, patch) => setDraft((d) => ({ ...d, css: d.css.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const setProp = (i, k, v) => setDraft((d) => ({ ...d, css: d.css.map((x, j) => (j === i ? { ...x, p: { ...x.p, [k]: v } } : x)) }));
  const dropProp = (i, k) => setDraft((d) => ({ ...d, css: d.css.map((x, j) => { if (j !== i) return x; const p = { ...x.p }; delete p[k]; return { ...x, p }; }) }));

  // ── async actions ──────────────────────────────────────────────────────
  const run = async (fn, kind = 'work') => {
    setJob(kind); setErr('');
    try { await fn(); } catch (e) { setErr(e?.message || 'Something went wrong'); }
    setJob(null);
  };

  const cancel = () => {
    const b = draft.theme.bg_image;
    if (b && b !== draft.origBg) media.deleteImage(b).catch(() => {});
    const f = draft.theme.font_file;
    if (f && f !== draft.origFont) media.deleteFont(f).catch(() => {});
    const o = draft.origMusic || {}, n = draft.fields.music || {};
    if (n.cover && n.cover !== o.cover) media.deleteImage(n.cover).catch(() => {});
    if (n.audio && n.audio !== o.audio) media.deleteAudio(n.audio).catch(() => {});
    setAsking(false);
    onClose();
  };
  const requestCancel = () => (dirty ? setAsking(true) : cancel());

  const save = () => run(async () => {
    await profiles.updateMyProfile({ ...draft.fields, theme: draft.theme, custom_css: draft.css });
    await friends.setTopFriends(draft.top);
    if (draft.origBg && draft.origBg !== draft.theme.bg_image) media.deleteImage(draft.origBg).catch(() => {});
    if (draft.origFont && draft.origFont !== draft.theme.font_file) media.deleteFont(draft.origFont).catch(() => {});
    { // files replaced or removed while editing are deleted now
      const o = draft.origMusic || {}, n = draft.fields.music || {};
      if (o.cover && o.cover !== n.cover) media.deleteImage(o.cover).catch(() => {});
      if (o.audio && o.audio !== n.audio) media.deleteAudio(o.audio).catch(() => {});
    }
    const flow = draft.cards.filter((c) => c.type !== 'sticker');
    const res = await Promise.allSettled(draft.cards.map((c) => (c.type === 'sticker'
      ? cardsApi.updateCard(c.id, { x: c.x, y: c.y, w: c.w, h: c.h, z: c.z, rotation: c.rotation, visible: c.visible })
      : cardsApi.updateCard(c.id, {
        y: flow.indexOf(c) * 10,
        title: c.title,
        content: c.type === 'links' ? { links: cleanLinks(c.content.links) } : c.content,
        visible: c.visible,
      }))));
    const bad = res.filter((x) => x.status === 'rejected');
    if (bad.length) throw new Error(`${bad.length} card(s) failed to save: ${bad[0].reason?.message || 'unknown error'}`);
    await reload(); notify('Saved'); onClose();
  }, 'save');

  const addCard = (type) => run(async () => {
    const meta = typeMeta(type);
    const c = await cardsApi.createCard({ type, title: meta.label, content: meta.empty, y: draft.cards.length * 10 });
    setDraft((d) => ({ ...d, cards: [...d.cards, c] }));
  });
  const addSticker = (file) => run(async () => {
    const bmp = await createImageBitmap(file);
    const h = clamp(Math.round((140 * bmp.height) / bmp.width), 40, 2000);
    const path = await media.uploadImage(file, 'sticker');
    const c = await cardsApi.createCard({ type: 'sticker', content: { images: [path] }, x: 40, y: 40, w: 140, h, z: topZ + 1 });
    setDraft((d) => ({ ...d, cards: [...d.cards, c] }));
    setSel(c.id);
  });
  const movePhoto = (i, to) => {
    if (to < 0 || to >= photos.length) return;
    const ids = photos.map((p) => p.id); const [moved] = ids.splice(i, 1); ids.splice(to, 0, moved);
    run(async () => { await social.reorderPhotos(ids); await reload(); });
  };

  // Everything the tabs need, in one bundle.
  const ctx = {
    draft, setDraft, th, r, stickers, s, sel, setSel, topZ, photos, img, fl, locs, busy,
    setTheme, setField, setMusic, setCard, drop, move, moveTop, setRule, setProp, dropProp,
    run, reload, notify, addCard, addSticker, movePhoto, goTab: setTab,
  };

  // ── tabs: arrow keys move between them ─────────────────────────────────
  const onTabKey = (e) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const n = { ArrowRight: (i + 1) % TABS.length, ArrowLeft: (i + TABS.length - 1) % TABS.length, Home: 0, End: TABS.length - 1 }[e.key];
    if (n == null) return;
    e.preventDefault();
    setTab(TABS[n].id);
    e.currentTarget.querySelectorAll('[role="tab"]')[n]?.focus();
  };

  // ── shell ──────────────────────────────────────────────────────────────
  const stop = (e) => e.stopPropagation();
  const Panel = PANELS[tab];

  if (collapsed) {
    return (
      <>
        <style>{CSS}</style>
        <aside className="cz-pill" aria-label="Customize" onPointerDown={stop}>
          <button type="button" className="cz-btn" onClick={() => setCollapsed(false)}><PencilSimple size={16} weight="bold" aria-hidden="true" />Edit</button>
          <button type="button" className="cz-btn cz-btn--primary" disabled={busy} onClick={save}>
            {saving ? <CircleNotch className="cz-spin" size={16} weight="bold" aria-hidden="true" /> : <FloppyDisk size={16} weight="bold" aria-hidden="true" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </aside>
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <aside className="cz" aria-label="Customize" onPointerDown={stop}>
        {busy && <div className="cz-busy" role="progressbar" aria-label={saving ? 'Saving' : 'Working'}><i /></div>}

        <header className="cz-head">
          <h2 className="cz-title">Customize</h2>
          {dirty && <span className="cz-dirty">Unsaved changes</span>}
          <span className="cz-spacer" />
          <IconButton icon={CaretDoubleRight} label="Hide panel" onClick={() => setCollapsed(true)} />
          <IconButton icon={X} label="Close" disabled={saving} onClick={requestCancel} />
        </header>

        <div className="cz-tabs" role="tablist" aria-label="Customizer sections" style={{ '--i': TABS.findIndex((t) => t.id === tab) }} onKeyDown={onTabKey}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" id={`cz-tab-${id}`} className="cz-tab" aria-selected={tab === id} aria-controls="cz-panel" tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>
              <Icon size={18} weight="fill" aria-hidden="true" />{label}
            </button>
          ))}
          <span className="cz-tab-ind" aria-hidden="true" />
        </div>

        {err && (
          <div className="cz-err" role="alert">
            <WarningCircle size={18} weight="fill" aria-hidden="true" />
            <p>{err}</p>
            <IconButton icon={X} label="Dismiss" onClick={() => setErr('')} />
          </div>
        )}

        <div className="cz-body" ref={bodyRef}>
          <div role="tabpanel" id="cz-panel" aria-labelledby={`cz-tab-${tab}`}><Panel ctx={ctx} /></div>
        </div>

        <footer className="cz-foot">
          {asking ? (
            <>
              <span className="cz-ask">Discard your changes?</span>
              <button type="button" className="cz-btn" autoFocus onClick={() => setAsking(false)}>Keep editing</button>
              <button type="button" className="cz-btn cz-btn--danger" onClick={cancel}>Discard</button>
            </>
          ) : (
            <>
              <button type="button" className="cz-btn" disabled={saving} onClick={requestCancel}>Cancel</button>
              <button type="button" className="cz-btn cz-btn--primary" disabled={busy} onClick={save}>
                {saving ? <CircleNotch className="cz-spin" size={16} weight="bold" aria-hidden="true" /> : <FloppyDisk size={16} weight="bold" aria-hidden="true" />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </>
          )}
        </footer>
      </aside>
    </>
  );
}
