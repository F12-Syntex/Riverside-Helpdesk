'use client';

import React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { s, Svg, Icons } from './ui';
import AppHeader from './AppHeader';
import TemplateView from './templates/TemplateView';
import { highlightRanges } from '../../lib/lookup/fuzzy';
import { noteKind } from '../../lib/notebook/kinds.mjs';
import { filterReferrals } from '../../lib/search/referrals.mjs';
import {
  closesOnSearch, findReferral, historyStep, keyAction, readReferralUrl, referralUrl, startHighlight,
} from '../../lib/search/referrals-view.mjs';

/* ------------------------------------------------------------------ *
 * Referrals — the front door.
 *
 * Every referral the practice has written down in the Notebook's
 * Referrals section, in one list, and one box to find the one in hand.
 * Reception type a referral the way they would say it — "skin", "cancer
 * skin", "nurse to visit at home" — so the box searches by meaning, on
 * the server (/api/referrals, lib/search/referrals.mjs), and by name in
 * the browser on every keystroke until the server's answer lands.
 *
 * THE SHAPE IS CONTACT NUMBERS' (app/lookup/page.js): one centred
 * column, the heading above, the box drawn like the composer, one card of
 * rows, the keyboard hints at its foot.
 *
 * THE LIST OPENS NOTHING BY ITSELF. The top match used to open as soon as
 * there was one, and when it was not the one wanted it was in the way. A
 * referral opens when it is clicked, or Enter is pressed on the row the
 * arrow keys are on — and then in a DRAWER over the right of the page:
 *
 *   - wide (≥ 1000px), a panel down the right side, below the app bar,
 *     with the list moved over to stay whole and usable beside it — click
 *     another row and the drawer shows that one instead;
 *   - narrow, floating over the dimmed list, with "← All results".
 *
 * Either way it floats as the app bar does — a gutter in, rounded.
 *
 * × or Esc closes it and puts focus back on the row that opened it.
 *
 * ONE SURFACE. The drawer is the card; what is in it is the Q&A's own
 * card for the page (TemplateView, built on the server exactly as an
 * answer is) drawn flat — `bare` — so there is no card in the card.
 *
 * THE URL SAYS WHAT IS OPEN: /?q=skin&r=1964. Opening is a history entry,
 * so Back closes it; typing replaces the entry. The rules are
 * lib/search/referrals-view.mjs.
 * ------------------------------------------------------------------ */

const EASE = [0.2, 0.8, 0.3, 1];
const DEBOUNCE_MS = 250;
const SEARCH_X = (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="m8.5 8.5 5 5" /><path d="m13.5 8.5-5 5" /></>);

// The route chip wears the colours the Notebook gives the card's kind, so
// an e-RS card is the same blue here as in the tree it is edited in.
const ROUTE_KIND = { 'e-RS': 'ersReferral', Email: 'emailReferral' };

const RF_CSS = `
/* The column, heading, box and card are Contact numbers' (app/lookup). */
.rf{flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;width:100%;max-width:820px;margin:0 auto;padding:28px 24px;}
.rf-h1{flex:none;margin:8px 0 6px;text-align:center;font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1.08;}
.rf-card{position:relative;flex:1;min-height:280px;display:flex;flex-direction:column;overflow:hidden;background:#fff;border-radius:22px;
  box-shadow:0 0 0 1px #dde4e7,0 2px 4px rgba(33,43,50,.04);}

.rf-box{flex:none;display:flex;align-items:center;gap:4px;height:68px;padding:0 12px 0 22px;
  background:#fff;border:2px solid #94aabb;border-radius:22px;
  box-shadow:0 2px 4px rgba(33,43,50,.05),0 18px 48px rgba(0,48,135,.14);transition:border-color .18s ease,box-shadow .22s ease;}
.rf-box:hover{border-color:#5f8fb9;}
.rf-box:focus-within{border-color:#005eb8;box-shadow:0 0 0 3px rgba(0,94,184,.08),0 4px 10px rgba(33,43,50,.07),0 18px 44px rgba(33,43,50,.16);}
.rf-box__ico{flex:none;display:flex;color:var(--rv-ink-3);transition:color .15s ease;}
.rf-box:focus-within .rf-box__ico{color:var(--rv-accent);}
.rf-input{flex:1;min-width:0;height:100%;border:none !important;background:transparent !important;outline:none !important;box-shadow:none !important;
  font:inherit;font-size:19.5px;padding:0 12px;color:#212b32;}
.rf-input::placeholder{color:#768692;}
.rf-iconbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:none;border-radius:10px;
  background:none;color:var(--rv-ink-3);cursor:pointer;transition:background-color .15s ease,color .15s ease;}
.rf-iconbtn:hover{background:#eef2f5;color:var(--rv-ink);}
.rf-iconbtn:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.rf-count{flex:none;margin-right:8px;font-size:12px;font-weight:600;color:#9aa6ae;font-variant-numeric:tabular-nums;}

.rf-body{position:relative;flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 0 6px;
  scrollbar-width:thin;scrollbar-color:rgba(76,98,114,.25) transparent;}
.rf-group{display:flex;align-items:center;gap:8px;padding:14px 20px 6px;font-size:11.5px;font-weight:650;color:#9aa6ae;letter-spacing:.02em;}
.rf-group__n{font-variant-numeric:tabular-nums;font-weight:600;color:#b5bfc6;}
.rf-group__live{display:inline-flex;align-items:center;gap:5px;margin-left:auto;font-weight:600;color:#b5bfc6;}
.rf-group__live .rf-spin{animation:rf-spin 1s linear infinite;display:flex;}
@keyframes rf-spin{to{transform:rotate(360deg);}}

/* ---- a referral in the list: one row, a hairline between rows ---- */
.rf-rows > .rf-row + .rf-row{border-top:1px solid #eef2f4;}
.rf-row{position:relative;display:flex;align-items:center;gap:12px;width:100%;padding:11px 20px;border:none;
  background:none;font:inherit;text-align:left;color:inherit;cursor:pointer;scroll-margin:8px;transition:background-color .12s ease;}
.rf-row:hover{background:#f6f8fa;}
.rf-row.is-sel{background:#f1f5f9;}
.rf-row.is-chosen{background:var(--rv-accent-dim);box-shadow:inset 3px 0 0 var(--rv-accent);}
.rf-row:focus-visible{outline:2px solid var(--rv-accent);outline-offset:-2px;}
.rf-row__text{flex:1;min-width:0;}
.rf-row__name{display:block;font-size:15px;font-weight:600;color:var(--rv-ink);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rf-row.is-chosen .rf-row__name{color:var(--rv-accent);}
.rf-row__sub{display:block;margin-top:1px;font-size:12.5px;color:#8a979f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rf-row__tags{flex:none;display:flex;align-items:center;gap:6px;}
.rf-chev{flex:none;display:flex;color:#b5bfc6;}
.rf-row.is-chosen .rf-chev{color:var(--rv-accent);}
.rf-tag{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;}
.rf-tag--2ww{background:#fdecea;color:#b42318;box-shadow:inset 0 0 0 1px #f4b8b1;}
.rf-tag--urgent{background:#fdf6e7;color:#8a5a08;box-shadow:inset 0 0 0 1px #ecd9ad;}
.rf-mark{background:rgba(0,94,184,.1);color:var(--rv-accent);border-radius:3px;}

/* ---- the chosen referral: a floating panel, flat inside ----
   It floats as the app bar and the page's cards do: one gutter in from every
   edge, rounded, lifted by the modals' shadow (Contact numbers' .lk-form).
   Wide: down the right of the page, under the app bar, with the list still
   there beside it — no shade over the page, nothing blocked. Narrow: over
   everything, the list dimmed behind it; a tap on the shade closes it. */
.rf-drawer{position:fixed;inset:var(--rv-gutter);z-index:60;display:flex;flex-direction:column;overflow:hidden;background:#fff;outline:none;
  border-radius:22px;box-shadow:0 30px 80px -20px rgba(33,43,50,.45),0 0 0 1px rgba(33,43,50,.06);}
.rf-scrim{position:fixed;inset:0;z-index:59;background:rgba(33,43,50,.32);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);}
.rf-drawer__head{flex:none;padding:14px 18px 14px;border-bottom:1px solid #edf1f3;}
.rf-drawer__top{display:flex;align-items:flex-start;gap:10px;}
.rf-drawer__scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:20px 18px 32px;
  scrollbar-width:thin;scrollbar-color:rgba(76,98,114,.25) transparent;}
.rf-back{display:inline-flex;align-items:center;gap:6px;margin:0 0 10px -6px;padding:6px 10px 6px 6px;border-radius:8px;
  font-size:14px;font-weight:650;color:var(--rv-accent);text-decoration:none;transition:background-color .15s ease;}
.rf-back:hover{background:#f1f5f9;}
.rf-back:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.rf-doc__title{flex:1;min-width:0;margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.25;color:var(--rv-ink);outline:none;overflow-wrap:anywhere;}
.rf-doc__where{margin-top:3px;font-size:13px;color:#8a979f;}
.rf-doc__meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px;}
.rf-doc__meta:empty{display:none;}
.rf-doc__link{display:inline-flex;align-items:center;gap:6px;margin-left:auto;margin-right:-8px;padding:5px 8px;border-radius:8px;
  font-size:13.5px;font-weight:650;color:var(--rv-accent);text-decoration:none;transition:background-color .15s ease;}
.rf-doc__link:hover{background:#f1f5f9;}
.rf-doc__link:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.rf-doc__none{margin:0;font-size:15px;color:var(--rv-ink-2);}
.rf-close{margin:-4px -8px 0 0;}

@media (min-width:1000px){
  /* Open, the column re-centres in what the drawer leaves, so no row's tags,
     nor the box's ×, sit under it. The drawer is placed against the padding
     box, so it stays flush with the edge. */
  .rf-stage{position:relative;transition:padding-right .24s cubic-bezier(.2,.8,.3,1);}
  .rf-stage.is-open{padding-right:calc(min(560px,45vw) + var(--rv-gutter));}
  /* Its foot lines up with the list card's: .rf's 28px bottom padding. */
  .rf-drawer{position:absolute;inset:var(--rv-gutter) var(--rv-gutter) 28px auto;z-index:20;width:min(560px,45vw);
    box-shadow:0 0 0 1px rgba(33,43,50,.06),0 2px 6px rgba(33,43,50,.05),0 24px 60px -22px rgba(33,43,50,.32);}
  .rf-scrim{display:none;}
  .rf-drawer__head{padding:20px 26px 16px;}
  .rf-drawer__scroll{padding:22px 26px 36px;}
  .rf-back{display:none;}
}

/* ---- skeleton, states, buttons: as Contact numbers ---- */
.rf-skel{display:block;height:10px;border-radius:999px;background:linear-gradient(90deg,#eef2f4 0%,#f6f8f9 40%,#eef2f4 80%);
  background-size:200% 100%;animation:rf-skel 1.6s linear infinite;}
@keyframes rf-skel{from{background-position:100% 0;}to{background-position:-100% 0;}}
.rf-state{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:30px 20px 26px;}
.rf-state__ico{display:flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:14px;background:#f1f5f9;color:#8a979f;margin-bottom:6px;}
.rf-state__title{margin:0;font-size:15.5px;font-weight:650;color:var(--rv-ink);overflow-wrap:anywhere;}
.rf-state__acts{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:12px;}
.rf-btn{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 16px;border-radius:999px;border:none;font:inherit;font-size:14px;
  font-weight:650;cursor:pointer;text-decoration:none;transition:background-color .15s ease,box-shadow .15s ease,transform .12s ease;}
.rf-btn:active{transform:scale(.98);}
.rf-btn:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}
.rf-btn--primary{background:var(--rv-accent);color:#fff;box-shadow:0 1px 2px rgba(0,48,135,.25),inset 0 1px 0 rgba(255,255,255,.16);}
.rf-btn--primary:hover{background:#0068c9;}

/* ---- the foot ---- */
.rf-foot{flex:none;display:flex;align-items:center;gap:14px;padding:10px 20px;border-top:1px solid #eef2f4;font-size:12px;font-weight:550;color:#9aa6ae;}
.rf-foot span{display:inline-flex;align-items:center;gap:5px;}
.rf-foot__keys{flex:1;min-width:0;gap:14px !important;}
.rf-foot__ask{flex:none;display:inline-flex;align-items:center;gap:6px;margin-right:-8px;padding:5px 10px;border-radius:8px;
  font-size:12.5px;font-weight:650;color:#7a8891;text-decoration:none;transition:background-color .15s ease,color .15s ease;}
.rf-foot__ask strong{color:var(--rv-accent);font-weight:700;}
.rf-foot__ask:hover{background:#f1f5f9;color:var(--rv-ink);}
.rf-foot__ask:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}

@media (max-width:600px){
  .rf{padding:16px;gap:12px;}
  .rf-h1{font-size:30px;margin-top:4px;}
  .rf-box{height:60px;padding-left:16px;}
  .rf-input{font-size:16px;}
  .rf-count,.rf-foot__keys{display:none !important;}
  .rf-foot{justify-content:flex-end;padding:8px 14px;}
  .rf-row{flex-wrap:wrap;gap:6px 8px;padding:11px 14px;}
  .rf-row__text{flex:1 1 70%;}
  .rf-row__name{white-space:normal;}
  .rf-group{padding-left:14px;padding-right:14px;}
  .rf-doc__title{font-size:21px;}
}
@media (prefers-reduced-motion:reduce){
  .rf-skel,.rf-row,.rf-stage,.rf-group__live .rf-spin{transition:none !important;animation:none !important;}
}
`;

function Kbd({ children }) {
  return <kbd className="riva-kbd">{children}</kbd>;
}

function Highlighted({ label, query }) {
  const ranges = query ? highlightRanges(label, query) : [];
  if (!ranges.length) return label;
  const parts = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) parts.push(label.slice(at, a));
    parts.push(<mark key={i} className="rf-mark">{label.slice(a, b)}</mark>);
    at = b;
  });
  if (at < label.length) parts.push(label.slice(at));
  return parts;
}

function Skeleton({ rows = 5 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rf-row" style={s('cursor:default;')}>
          <span className="rf-row__text">
            <span className="rf-skel" style={s('height:12px;width:' + ['52%', '40%', '60%', '46%'][i % 4] + ';')} />
            <span className="rf-skel" style={s('margin-top:8px;height:8px;width:' + ['30%', '24%', '34%', '28%'][i % 4] + ';')} />
          </span>
          <span className="rf-skel" style={s('flex:none;width:52px;height:22px;')} />
        </div>
      ))}
    </div>
  );
}

function RouteChip({ route }) {
  if (!route) return null;
  const c = noteKind(ROUTE_KIND[route]).colour;
  return (
    <span className="rf-tag" style={{ color: c.ink, background: c.tint, boxShadow: 'inset 0 0 0 1px ' + c.edge }}
      title={route === 'Email' ? 'Sent by email' : 'Sent on e-RS'}>{route}</span>
  );
}

function PriorityTag({ tag }) {
  if (!tag) return null;
  return <span className={'rf-tag ' + (tag === '2WW' ? 'rf-tag--2ww' : 'rf-tag--urgent')}>{tag}</span>;
}

// One referral in the list: what it is, where it sits, how it goes. A row
// only ever opens when it is clicked (or Enter is pressed on it).
function Row({ row, query, selected, chosen, onOpen, btnRef }) {
  return (
    <button ref={btnRef} type="button" onClick={onOpen} data-rf-id={row.id}
      className={'rf-row' + (selected ? ' is-sel' : '') + (chosen ? ' is-chosen' : '')}
      aria-current={chosen ? 'true' : undefined} aria-haspopup="dialog">
      <span className="rf-row__text">
        <span className="rf-row__name"><Highlighted label={row.title} query={query} /></span>
        {row.where ? <span className="rf-row__sub">{row.where}</span> : null}
      </span>
      <span className="rf-row__tags">
        <PriorityTag tag={row.tag} />
        <RouteChip route={row.route} />
      </span>
      <span className="rf-chev" aria-hidden="true"><Svg w={16} sw={2.2}>{Icons.chevronRight}</Svg></span>
    </button>
  );
}

function DrawerSkeleton() {
  return (
    <div aria-hidden="true">
      <span className="rf-skel" style={s('height:10px;width:80%;')} />
      <span className="rf-skel" style={s('margin-top:12px;height:10px;width:70%;')} />
      <span className="rf-skel" style={s('margin-top:12px;height:10px;width:75%;')} />
    </div>
  );
}

// The chosen referral. The drawer is the only surface: its header is the
// title, the route and the way to the page; under it, the Q&A's card for
// the page drawn flat (TemplateView bare).
function Drawer({ row, loading, reduce, headingRef, scrollRef, backHref, onClose }) {
  const closeLink = (e) => { e.preventDefault(); onClose('click'); };
  return (
    <motion.aside className="rf-drawer" role="dialog" aria-modal="false" aria-labelledby="rf-drawer-title"
      initial={reduce ? false : { opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 28 }} transition={{ duration: 0.24, ease: EASE }}>
      <header className="rf-drawer__head">
        {/* Narrow only: the sheet covers the list, so say how to get back to it. */}
        <a href={backHref} className="rf-back" onClick={closeLink}>
          <Svg w={16} sw={2.2}>{Icons.arrowLeft}</Svg>All results
        </a>
        <div className="rf-drawer__top">
          <h2 id="rf-drawer-title" ref={headingRef} tabIndex={-1} className="rf-doc__title">
            {row ? row.title : loading ? 'Loading…' : 'Not found'}
          </h2>
          <button type="button" className="rf-iconbtn rf-close" onClick={() => onClose('click')} aria-label="Close">
            <Svg w={18} sw={2.4}>{Icons.close}</Svg>
          </button>
        </div>
        {row ? (
          <>
            {row.where ? <div className="rf-doc__where">{row.where}</div> : null}
            <div className="rf-doc__meta">
              <PriorityTag tag={row.tag} />
              <RouteChip route={row.route} />
              {/* A new tab, as the chat's page links are: the list stays where it was. */}
              <a href={row.href} target="_blank" rel="noopener" className="rf-doc__link">
                Open in Practice notes<Svg w={13} sw={2.2}>{Icons.external}</Svg>
              </a>
            </div>
          </>
        ) : null}
      </header>
      <div className="rf-drawer__scroll" ref={scrollRef}>
        {row ? (
          row.card
            ? <TemplateView key={row.id} answer={row.card} bare />
            : <p className="rf-doc__none">This page has nothing to show here. Open it in Practice notes to read it.</p>
        ) : loading ? <DrawerSkeleton /> : (
          <State icon={SEARCH_X} title="That referral is no longer in the Notebook’s Referrals section.">
            <a href={backHref} className="rf-btn rf-btn--primary" onClick={closeLink}>All referrals</a>
          </State>
        )}
      </div>
    </motion.aside>
  );
}

function State({ icon, title, children }) {
  return (
    <motion.div className="rf-state" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}>
      <span className="rf-state__ico" aria-hidden="true"><Svg w={20} sw={2}>{icon}</Svg></span>
      <p className="rf-state__title">{title}</p>
      {children ? <div className="rf-state__acts">{children}</div> : null}
    </motion.div>
  );
}

const askHref = (text) => '/ask' + (text ? '?q=' + encodeURIComponent(text) : '');

export default function ReferralsPage() {
  const reduce = useReducedMotion();
  const [query, setQuery] = React.useState('');
  // Every referral, each with its card, and the most asked for (ids).
  const [book, setBook] = React.useState({ rows: [], popular: [], loaded: false, failed: false });
  // The server's ranking for one query. `for` is the query it answers, so a
  // slow reply to an old query is never shown against a new one.
  const [server, setServer] = React.useState({ for: '', rows: null, loading: false });
  // The referral that is open (a row id, "note:1964"), or null.
  const [openId, setOpenId] = React.useState(null);
  // The row the arrow keys are on. Moving it never opens anything.
  const [selIdx, setSelIdx] = React.useState(-1);
  // The URL is read once, after the first render (the server has no URL to
  // render from), and only then written.
  const [hydrated, setHydrated] = React.useState(false);
  const [urlTick, setUrlTick] = React.useState(0);

  const inputRef = React.useRef(null);
  const headingRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const itemRefs = React.useRef(new Map());
  // What the address bar says now ({ q, id }), and whether the open
  // referral's history entry was pushed by this page (so closing it is Back).
  const urlRef = React.useRef({ q: '', id: null });
  const openedHere = React.useRef(false);
  // The row (its list key) that opened the drawer: focus goes back to it.
  const opener = React.useRef('');

  const trimmed = query.trim();

  React.useEffect(() => {
    let live = true;
    fetch('/api/referrals', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        setBook({ rows: Array.isArray(d.referrals) ? d.referrals : [], popular: Array.isArray(d.popular) ? d.popular : [], loaded: true, failed: !Array.isArray(d.referrals) });
      })
      .catch(() => { if (live) setBook((b) => ({ ...b, loaded: true, failed: true })); });
    return () => { live = false; };
  }, []);

  // The URL in: on arrival (a link to a referral opens it), and on Back and
  // Forward — which move only the open referral. The search box keeps what
  // is in it: typing never made history entries, so an older entry's q is
  // not something the reader went back to.
  React.useEffect(() => {
    const now = readReferralUrl(window.location.search);
    urlRef.current = { q: now.q.trim(), id: now.id };
    if (now.q) setQuery(now.q);
    if (now.id) setOpenId(now.id);
    setHydrated(true);
    const onPop = () => {
      const at = readReferralUrl(window.location.search);
      openedHere.current = false;
      urlRef.current = { q: at.q.trim(), id: at.id };
      setOpenId(at.id);
      setUrlTick((n) => n + 1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // The URL out: push for opening a referral, replace for everything else.
  React.useEffect(() => {
    if (!hydrated) return;
    const next = { q: trimmed, id: openId };
    const step = historyStep(urlRef.current, next);
    urlRef.current = next;
    if (!step) return;
    if (step.method === 'push') {
      openedHere.current = true;
      window.history.pushState(null, '', step.url);
    } else {
      window.history.replaceState(null, '', step.url);
    }
  }, [hydrated, trimmed, openId, urlTick]);

  // The server's search, a moment after typing stops.
  React.useEffect(() => {
    if (!trimmed) { setServer({ for: '', rows: null, loading: false }); return undefined; }
    setServer((v) => ({ ...v, loading: true }));
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/referrals?q=' + encodeURIComponent(trimmed), { cache: 'no-store', signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setServer({ for: trimmed, rows: Array.isArray(d.results) ? d.results : null, loading: false }))
        .catch((e) => { if (e?.name !== 'AbortError') setServer({ for: trimmed, rows: null, loading: false }); });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [trimmed]);

  const instant = React.useMemo(() => (trimmed ? filterReferrals(book.rows, trimmed) : []), [book.rows, trimmed]);
  const answered = server.for === trimmed && Array.isArray(server.rows);
  const results = trimmed ? (answered ? server.rows : instant) : [];
  const searching = !!trimmed && !answered && server.loading;
  const popular = React.useMemo(() => {
    const byId = new Map(book.rows.map((r) => [r.id, r]));
    return book.popular.map((id) => byId.get(id)).filter(Boolean);
  }, [book]);
  const chosen = findReferral(openId, book.rows, server.rows, instant);

  // What the arrow keys move through, in the order it is drawn.
  const flat = React.useMemo(() => (trimmed
    ? results.map((row) => ({ key: 'r:' + row.id, row }))
    : popular.map((row) => ({ key: 'p:' + row.id, row })).concat(book.rows.map((row) => ({ key: 'a:' + row.id, row })))),
  [trimmed, results, popular, book.rows]);

  // A new search: the highlight starts on its top row, so Enter opens the
  // best match — but only when Enter is pressed.
  React.useEffect(() => { setSelIdx(startHighlight(trimmed)); }, [trimmed]);

  const openRow = (idx) => {
    const entry = flat[idx];
    if (!entry) return;
    setSelIdx(idx);
    opener.current = entry.key;
    setOpenId(entry.row.id);
  };

  const close = React.useCallback(() => {
    if (openedHere.current) {
      // The entry under this one is the list this page pushed it from: go
      // back to it, so Back afterwards leaves the page rather than repeating.
      openedHere.current = false;
      window.history.back();
    } else {
      setOpenId(null);
    }
  }, []);

  // A new search, or the box cleared, closes the open referral: it belonged
  // to the old list. Focus stays in the box being typed in.
  const lastQ = React.useRef(null);
  const keepFocus = React.useRef(false);
  React.useEffect(() => {
    if (!hydrated) return;
    if (closesOnSearch({ prev: lastQ.current, next: trimmed, open: !!openId })) {
      keepFocus.current = true;
      close();
    }
    lastQ.current = trimmed;
  }, [hydrated, trimmed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened, or switched: the drawer starts at the top, with focus on its
  // heading, so a screen reader hears which referral it is.
  React.useEffect(() => {
    if (!openId) return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (headingRef.current) headingRef.current.focus({ preventScroll: true });
  }, [openId, chosen?.id]);

  // Closed, however it was closed (×, Esc, Back): focus goes back to the
  // row that opened it, or to the box when that row is no longer listed —
  // unless it was closed by typing, when focus is already where it belongs.
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (openId) { wasOpen.current = true; return; }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    if (keepFocus.current) { keepFocus.current = false; return; }
    const el = itemRefs.current.get(opener.current) || inputRef.current;
    if (el) el.focus({ preventScroll: false });
  }, [openId]);

  // Esc closes the drawer from anywhere on the page. The box and the rows
  // handle their own keys first.
  React.useEffect(() => {
    if (!openId) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, close]);

  // The keys, in the box or on a row. In the box the highlight moves and
  // focus stays; on a row, focus moves with the highlight. Enter on a row
  // is the row's own click.
  const onKeyDown = (e) => {
    const onRow = e.target !== inputRef.current;
    if (onRow && e.key === 'Enter') return;
    const act = keyAction({ key: e.key, idx: selIdx, count: flat.length, open: !!openId, hasQuery: !!query && !onRow });
    if (!act) return;
    e.preventDefault();
    if (act.type === 'move') {
      setSelIdx(act.idx);
      const el = itemRefs.current.get(flat[act.idx].key);
      if (el) {
        if (onRow) el.focus({ preventScroll: true });
        el.scrollIntoView({ block: 'nearest' });
      }
    } else if (act.type === 'open') {
      openRow(act.idx);
    } else if (act.type === 'close') {
      close();
    } else if (act.type === 'clear') {
      setQuery('');
    }
  };

  const clear = () => { setQuery(''); if (inputRef.current) inputRef.current.focus(); };
  const refFor = (key) => (el) => { if (el) itemRefs.current.set(key, el); else itemRefs.current.delete(key); };
  const selKey = selIdx >= 0 && flat[selIdx] ? flat[selIdx].key : '';
  const item = (prefix, startIdx) => (row, i) => {
    const key = prefix + row.id;
    return (
      <Row key={key} row={row} query={trimmed} selected={selKey === key} chosen={openId === row.id} btnRef={refFor(key)}
        onOpen={() => openRow(startIdx + i)} />
    );
  };
  const nothing = !!trimmed && answered && !results.length;

  return (
    <div className="riva-page-fill" style={s('height:100vh;overflow:hidden;display:flex;flex-direction:column;background:#f0f4f5;')}>
      <style data-rf="1" dangerouslySetInnerHTML={{ __html: RF_CSS }} />
      <AppHeader subtitle="Referrals" />

      <div className={'rf-stage' + (openId ? ' is-open' : '')} style={s('flex:1;min-height:0;display:flex;flex-direction:column;')}>
        <main className="rf">
          <h1 className="rf-h1 riva-hero-h1">Find a <span style={{ color: 'var(--rv-accent)' }}>referral</span></h1>

          <div className="rf-box">
            <span className="rf-box__ico" aria-hidden="true"><Svg w={20} sw={2.2}>{Icons.search}</Svg></span>
            <input
              ref={inputRef}
              autoFocus
              className="rf-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="What is it for? “skin”, “nurse to visit at home”…"
              aria-label="Search the practice’s referrals"
            />
            {query ? (
              <button type="button" className="rf-iconbtn" onClick={clear} aria-label="Clear search">
                <Svg w={16} sw={2.4}>{Icons.close}</Svg>
              </button>
            ) : book.rows.length ? <span className="rf-count">{book.rows.length} referrals</span> : null}
          </div>

          <motion.div className="rf-card"
            initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}>
            <div className="rf-body" onKeyDown={(e) => { if (e.target !== inputRef.current) onKeyDown(e); }}>
              {!book.loaded ? <Skeleton /> : null}

              {book.loaded && book.failed && !trimmed ? (
                <State icon={Icons.alertCircle} title="The referrals could not be loaded. Try again in a moment, or ask the question instead.">
                  <Link href="/ask" className="rf-btn rf-btn--primary"><Svg w={15} sw={2.2}>{Icons.chat}</Svg>Ask a question</Link>
                </State>
              ) : null}

              {/* Nothing typed: what is asked for most, then everything A–Z. */}
              {book.loaded && !trimmed && popular.length ? (
                <section aria-label="Most asked for">
                  <div className="rf-group">Most asked for · last 30 days</div>
                  <div className="rf-rows">{popular.map(item('p:', 0))}</div>
                </section>
              ) : null}
              {book.loaded && !trimmed && book.rows.length ? (
                <section aria-label="All referrals">
                  <div className="rf-group">All referrals, A–Z <span className="rf-group__n">{book.rows.length}</span></div>
                  <div className="rf-rows">{book.rows.map(item('a:', popular.length))}</div>
                </section>
              ) : null}

              {/* Typed: the matches, best first. None of them is open until it is chosen. */}
              {trimmed && (results.length || searching) ? (
                <section aria-label="Matches">
                  <div className="rf-group">
                    {answered ? 'Best matches' : 'Matching names'}
                    {searching ? (
                      <span className="rf-group__live" role="status">
                        <span className="rf-spin"><Svg w={12} sw={2.4}>{Icons.spinner}</Svg></span>Searching by meaning
                      </span>
                    ) : null}
                  </div>
                  <div className="rf-rows">{results.map(item('r:', 0))}</div>
                  {!results.length ? <Skeleton rows={3} /> : null}
                </section>
              ) : null}

              {nothing ? (
                <State icon={SEARCH_X} title={'No referral in the Notebook matches “' + trimmed + '”'}>
                  <Link href={askHref(trimmed)} className="rf-btn rf-btn--primary">
                    <Svg w={15} sw={2.2}>{Icons.chat}</Svg>Ask a question instead
                  </Link>
                </State>
              ) : null}
            </div>

            <div className="rf-foot">
              <span className="rf-foot__keys" aria-hidden="true">
                <span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
                <span><Kbd>Enter</Kbd> open</span>
                <span><Kbd>Esc</Kbd> back / clear</span>
              </span>
              {/* Not a referral, or not this one: the Q&A, with what was typed. */}
              <Link href={askHref(trimmed)} className="rf-foot__ask">
                Not what you need? <strong>Ask a question</strong>
                <Svg w={13} sw={2.4}>{Icons.arrow}</Svg>
              </Link>
            </div>
          </motion.div>
        </main>

        <AnimatePresence>
          {openId ? (
            <motion.div key="scrim" className="rf-scrim" aria-hidden="true" onClick={close}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          ) : null}
          {openId ? (
            <Drawer key="drawer" row={chosen} loading={!book.loaded} reduce={reduce}
              headingRef={headingRef} scrollRef={scrollRef} backHref={referralUrl({ q: trimmed })} onClose={close} />
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
