'use client';

import React from 'react';
import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Svg, Icons } from './ui';
import AppHeader from './AppHeader';
import TemplateView from './templates/TemplateView';
import { filterReferrals } from '../../lib/search/referrals.mjs';
import {
  closesOnSearch, findReferral, historyStep, keyAction, readReferralUrl, referralUrl, startHighlight,
} from '../../lib/search/referrals-view.mjs';

/* ------------------------------------------------------------------ *
 * Referrals — the front door.
 *
 * Every referral the practice has written down in the Notebook's
 * Referrals section, and one box to find the one in hand. Reception type
 * a referral the way they would say it — "skin", "cancer skin", "nurse to
 * visit at home" — so the box searches by meaning, on the server
 * (/api/referrals, lib/search/referrals.mjs), and by name in the browser
 * on every keystroke until the server's answer lands.
 *
 * THE SHAPE. One centred column on the light: the heading, the box, and
 * one card of results under it. Each row is the referral's name and, at
 * the right, the one thing that changes what happens next — 2WW or Urgent
 * if it is either, otherwise how it is sent (e-RS or Email). Nothing
 * typed, the card is what is asked for most, with every referral A–Z one
 * click away.
 *
 * THE LIST OPENS NOTHING BY ITSELF. A referral opens when it is clicked,
 * or Enter is pressed on the highlighted row, in a DRAWER at the right of
 * the page (over the list on a narrow screen). × or Esc closes it and
 * focus goes back to the row that opened it.
 *
 * MOTION SAYS WHAT CHANGED. The page comes in once; after that the card
 * grows and shrinks to what it holds, new rows fade in, the highlight
 * glides to the row it is on, and the drawer slides in. Reduced motion
 * keeps the fades and drops the travel.
 *
 * THE URL SAYS WHAT IS OPEN: /?q=skin&r=1964. Opening is a history entry,
 * so Back closes it; typing replaces the entry. The rules are
 * lib/search/referrals-view.mjs.
 * ------------------------------------------------------------------ */

const EASE = [0.22, 1, 0.36, 1];
const DEBOUNCE_MS = 250;
const SEARCH_X = (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="m8.5 8.5 5 5" /><path d="m13.5 8.5-5 5" /></>);
const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

const RF_CSS = `
/* The page is the screen under the bar, and never scrolls: the card takes
   what is left of the column, and scrolls inside itself past that. */
.rf-page{position:relative;height:100%;overflow:hidden;display:flex;flex-direction:column;}
/* No background of its own: the page sits on the light behind every page
   (PageBackground), whichever the theme picker has chosen. */
.rf-stage{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;--rf-drawer-w:min(560px,44vw);}
.rf{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;width:100%;max-width:688px;margin:0 auto;padding:clamp(20px,11vh,140px) 24px 24px;}
.rf > *{flex:none;}
.rf > .rf-cardwrap{flex:0 1 auto;min-height:0;display:flex;flex-direction:column;}

.rf-h1{margin:0 0 36px;text-align:center;font-size:56px;font-weight:800;letter-spacing:-.04em;line-height:1.05;color:var(--rv-ink);}
.rf-h1 em{font-style:normal;color:var(--rv-accent);}

/* ---- the box ---- */
.rf-box{display:flex;align-items:center;gap:2px;height:64px;padding:0 14px 0 24px;background:#fff;border-radius:999px;
  box-shadow:0 1px 2px rgba(33,43,50,.04),0 14px 36px -14px rgba(33,43,50,.2);transition:box-shadow .2s ease;}
.rf-box:focus-within{box-shadow:0 0 0 3px rgba(0,94,184,.12),0 1px 2px rgba(33,43,50,.04),0 14px 36px -14px rgba(33,43,50,.22);}
.rf-box__ico{flex:none;display:flex;color:var(--rv-ink-3);}
.rf-box__ico.is-busy{color:var(--rv-accent);animation:rf-spin .9s linear infinite;}
@keyframes rf-spin{to{transform:rotate(360deg);}}
.rf-input{flex:1;min-width:0;height:100%;border:none !important;background:transparent !important;outline:none !important;box-shadow:none !important;
  font:inherit;font-size:19px;padding:0 14px;color:var(--rv-ink);}
.rf-input::placeholder{color:var(--rv-ink-4);}
.rf-clear{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:50%;
  position:relative;background:var(--rv-ink-3);color:#fff;cursor:pointer;transition:background-color .15s ease;}
.rf-clear:hover{background:var(--rv-ink-2);}
.rf-clear:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}

/* ---- above the card ---- */
.rf-cap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:22px;margin:22px 0 8px;padding:0 22px;
  font-size:13px;font-weight:550;color:var(--rv-ink-2);text-shadow:0 0 6px #fff,0 0 2px #fff;}
.rf-cap__btn{padding:2px 0;border:none;background:none;font:inherit;font-weight:600;color:var(--rv-accent);cursor:pointer;border-radius:4px;}
.rf-cap__btn:hover{color:var(--rv-accent-hi);text-decoration:underline;text-underline-offset:3px;}
.rf-cap__btn:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}

/* ---- the card ---- */
.rf-card{position:relative;flex:0 1 auto;min-height:0;overflow:hidden auto;overscroll-behavior:contain;
  background:#fff;border-radius:22px;box-shadow:0 1px 2px rgba(33,43,50,.04),0 14px 36px -14px rgba(33,43,50,.18);
  scrollbar-width:none;}
/* No scrollbar: one appearing and going as the list grows shifted the rows sideways.
   So that a list running past the foot of the card does not look finished,
   the last few pixels fade out while there is more below: a white veil stuck
   to the foot of the scroller (a mask would clip the card's shadow), with
   the arrow keys stopping a row short of it. */
.rf-card::-webkit-scrollbar{display:none;}
.rf-card.is-more::after{content:"";position:sticky;bottom:0;display:block;height:36px;margin-top:-36px;pointer-events:none;
  background:linear-gradient(rgba(255,255,255,0),#fff);}
.rf-card.is-more .rf-row{scroll-margin-bottom:40px;}
.rf-cardwrap.is-results{margin-top:14px;}
.rf-list{position:relative;}
.rf-hl{position:absolute;left:0;right:0;top:0;background:#f4f7f9;pointer-events:none;
  transition:transform .32s cubic-bezier(.22,1,.36,1),height .32s cubic-bezier(.22,1,.36,1);}
.rf-row{position:relative;display:flex;align-items:center;gap:14px;width:100%;min-height:56px;padding:12px 22px 12px 24px;border:none;
  background:none;font:inherit;text-align:left;color:inherit;cursor:pointer;scroll-margin:4px;}
.rf-row + .rf-row{border-top:1px solid #eef1f3;}
.rf-row:focus-visible{outline:2px solid var(--rv-accent);outline-offset:-2px;border-radius:12px;}
.rf-row__name{flex:1;min-width:0;font-size:16.5px;font-weight:450;line-height:1.35;color:var(--rv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.rf-row.is-chosen .rf-row__name{color:var(--rv-accent);font-weight:550;}
.rf-tag{flex:none;font-size:15px;font-weight:550;color:var(--rv-ink-2);white-space:nowrap;}
.rf-tag--2ww{color:#c0261b;font-weight:650;}
.rf-tag--urgent{color:#a35d00;font-weight:650;}
.rf-chev{flex:none;display:flex;margin-left:-4px;color:#a3afb7;transition:transform .2s cubic-bezier(.22,1,.36,1),color .15s ease;}
.rf-row.is-sel .rf-chev{transform:translateX(2px);color:var(--rv-ink-2);}
.rf-row.is-chosen .rf-chev{color:var(--rv-accent);}

/* ---- skeleton, states, buttons ---- */
.rf-skel{display:block;height:11px;border-radius:6px;background:linear-gradient(90deg,#eef2f4 0%,#f7f9fa 45%,#eef2f4 90%);
  background-size:220% 100%;animation:rf-skel 1.4s ease-in-out infinite;}
@keyframes rf-skel{from{background-position:100% 0;}to{background-position:-120% 0;}}
.rf-skelrow{display:flex;align-items:center;gap:14px;min-height:56px;padding:0 22px 0 24px;}
.rf-skelrow + .rf-skelrow{border-top:1px solid #eef1f3;}
.rf-state{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:34px 24px 30px;}
.rf-state__ico{display:flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:50%;background:#f1f4f6;color:var(--rv-ink-3);margin-bottom:6px;}
.rf-state__title{margin:0;max-width:42ch;font-size:16px;font-weight:600;line-height:1.4;color:var(--rv-ink);overflow-wrap:anywhere;}
.rf-state__text{margin:0;max-width:44ch;font-size:14.5px;line-height:1.5;color:var(--rv-ink-2);}
.rf-state__acts{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:12px;}
.rf-btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 18px;border-radius:999px;border:none;font:inherit;font-size:14.5px;
  font-weight:600;cursor:pointer;text-decoration:none;transition:background-color .15s ease,box-shadow .15s ease,transform .12s ease;}
.rf-btn:active{transform:scale(.98);}
.rf-btn:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}
.rf-btn--primary{background:var(--rv-accent);color:#fff;}
.rf-btn--primary:hover{background:var(--rv-accent-hi);}
.rf-btn--quiet{background:#fff;color:var(--rv-ink);box-shadow:inset 0 0 0 1px #d8dde0;}
.rf-btn--quiet:hover{box-shadow:inset 0 0 0 1px #aab6be;}

.rf-ask{display:flex;justify-content:center;margin-top:14px;}
.rf-ask a{padding:6px 12px;border-radius:999px;font-size:14px;font-weight:500;color:var(--rv-ink-2);text-shadow:0 0 6px #fff,0 0 2px #fff;text-decoration:none;transition:color .15s ease,background-color .15s ease;}
.rf-ask a strong{font-weight:600;color:var(--rv-accent);}
.rf-ask a:hover{color:var(--rv-ink);background:rgba(255,255,255,.6);}
.rf-ask a:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}

/* ---- the chosen referral: a panel at the right, the card's surface ---- */
.rf-drawer{position:fixed;top:var(--rv-top-h);right:12px;bottom:12px;left:12px;z-index:51;display:flex;flex-direction:column;overflow:hidden;
  background:#fff;outline:none;border-radius:22px;box-shadow:0 1px 2px rgba(33,43,50,.05),0 30px 70px -24px rgba(33,43,50,.35);}
.rf-scrim{position:fixed;inset:0;z-index:51;background:rgba(20,28,36,.32);-webkit-backdrop-filter:blur(6px) saturate(140%);backdrop-filter:blur(6px) saturate(140%);}
.rf-drawer__head{flex:none;padding:18px 22px 16px;border-bottom:1px solid #eef1f3;}
.rf-drawer__top{display:flex;align-items:flex-start;gap:10px;}
.rf-drawer__scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:20px 22px 36px;
  scrollbar-width:thin;scrollbar-color:rgba(76,98,114,.25) transparent;}
.rf-back{display:inline-flex;align-items:center;gap:6px;margin:0 0 10px -8px;padding:6px 10px 6px 6px;border-radius:999px;
  font-size:14px;font-weight:600;color:var(--rv-accent);text-decoration:none;transition:background-color .15s ease;}
.rf-back:hover{background:#f1f5f9;}
.rf-back:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.rf-doc__title{flex:1;min-width:0;margin:0;font-size:23px;font-weight:750;letter-spacing:-.02em;line-height:1.25;color:var(--rv-ink);outline:none;overflow-wrap:anywhere;}
/* Focus lands on the title so a screen reader hears it; there is nothing to show for it. */
.rf-doc__title:focus,.rf-doc__title:focus-visible{outline:none;box-shadow:none;}
.rf-doc__where{margin-top:4px;font-size:13.5px;color:var(--rv-ink-3);}
.rf-doc__meta{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:12px;}
.rf-doc__link{display:inline-flex;align-items:center;gap:6px;margin-left:auto;margin-right:-10px;padding:6px 10px;border-radius:999px;
  font-size:14px;font-weight:600;color:var(--rv-accent);text-decoration:none;transition:background-color .15s ease;}
.rf-doc__link:hover{background:#f1f5f9;}
.rf-doc__link:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.rf-doc__none{margin:0;font-size:15px;color:var(--rv-ink-2);}
.rf-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;margin:-3px -8px 0 0;border:none;border-radius:50%;
  background:none;color:var(--rv-ink-3);cursor:pointer;transition:background-color .15s ease,color .15s ease;}
.rf-close:hover{background:#f1f4f6;color:var(--rv-ink);}
.rf-close:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}

@media (min-width:1000px){
  /* Open, the column re-centres in what the drawer leaves. */
  .rf-stage{transition:padding-right .45s cubic-bezier(.22,1,.36,1);}
  .rf-stage.is-open{padding-right:calc(var(--rf-drawer-w) + 16px);}
  .rf-drawer{left:auto;right:16px;bottom:16px;width:var(--rf-drawer-w);}
  .rf-scrim{display:none;}
  .rf-drawer__head{padding:22px 28px 18px;}
  .rf-drawer__scroll{padding:22px 28px 40px;}
  .rf-back{display:none;}
}
@media (max-width:700px){
  .rf{padding:20px 16px 16px;}
  /* A thumb's worth of target round the small clear button. */
  .rf-clear::after{content:"";position:absolute;inset:-9px;}
  .rf-h1{font-size:38px;margin-bottom:24px;}
  .rf-box{height:56px;padding-left:18px;}
  .rf-input{font-size:16px;padding:0 10px;}
  .rf-cap{padding:0 16px;}
  .rf-row{padding:12px 16px 12px 18px;gap:10px;}
  .rf-row__name{white-space:normal;font-size:15.5px;}
  .rf-tag{font-size:14px;}
  .rf-doc__title{font-size:21px;}
}
/* A phone on its side is wider than 700px but barely 400 tall: the desktop
   heading and box would leave the card no room at all. Tighten them, and
   keep two rows of card in view (the shell scrolls past that). */
@media (max-height:520px){
  .rf{padding-top:12px;}
  .rf-h1{font-size:34px;margin-bottom:14px;}
  .rf-box{height:52px;}
  .rf-card{min-height:112px;}
}
@media (prefers-reduced-motion:reduce){
  .rf-skel,.rf-box__ico.is-busy{animation:none !important;}
  .rf-hl,.rf-stage,.rf-chev{transition:none !important;}
}
`;

// The one thing at the right of a row: how urgent, else how it is sent.
function Tag({ row }) {
  if (row.tag) return <span className={'rf-tag ' + (row.tag === '2WW' ? 'rf-tag--2ww' : 'rf-tag--urgent')}>{row.tag}</span>;
  if (row.route) return <span className="rf-tag" title={row.route === 'Email' ? 'Sent by email' : 'Sent on e-RS'}>{row.route}</span>;
  return null;
}

function SkeletonRows({ rows = 5 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rf-skelrow">
          <span className="rf-skel" style={{ flex: 'none', width: ['46%', '34%', '52%', '40%', '30%'][i % 5] }} />
          <span style={{ flex: 1 }} />
          <span className="rf-skel" style={{ flex: 'none', width: 38 }} />
        </div>
      ))}
    </div>
  );
}

// One referral in the list. It only ever opens when it is clicked (or
// Enter is pressed on it); the pointer and the arrow keys move the
// highlight and nothing else. New rows fade in where they land.
function Row({ row, selected, chosen, onOpen, onHover, btnRef, delay }) {
  return (
    <motion.button ref={btnRef} type="button" onClick={onOpen} onMouseMove={onHover} data-rf-id={row.id}
      className={'rf-row' + (selected ? ' is-sel' : '') + (chosen ? ' is-chosen' : '')}
      aria-current={chosen ? 'true' : undefined} aria-haspopup="dialog"
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay, ease: EASE }}>
      <span className="rf-row__name">{row.title}</span>
      <Tag row={row} />
      <span className="rf-chev" aria-hidden="true"><Svg w={18} sw={2}>{Icons.chevronRight}</Svg></span>
    </motion.button>
  );
}

function State({ icon, title, text, children }) {
  return (
    <motion.div className="rf-state" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
      <span className="rf-state__ico" aria-hidden="true"><Svg w={20} sw={2}>{icon}</Svg></span>
      <p className="rf-state__title">{title}</p>
      {text ? <p className="rf-state__text">{text}</p> : null}
      {children ? <div className="rf-state__acts">{children}</div> : null}
    </motion.div>
  );
}

// The card grows and shrinks to what it holds rather than jumping. Its
// height follows the list inside it; the column's flex shrinks it to the
// room there is, and past that the card scrolls.
function Card({ className, children }) {
  const inner = React.useRef(null);
  const outer = React.useRef(null);
  const [h, setH] = React.useState('auto');
  const [more, setMore] = React.useState(false);
  // Whether there is more below the fold of the card, for the fade.
  const measure = React.useCallback(() => {
    const el = outer.current;
    if (!el) return;
    setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);
  React.useLayoutEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => { setH(el.offsetHeight); measure(); });
    ro.observe(el);
    if (outer.current) ro.observe(outer.current);
    return () => ro.disconnect();
  }, [measure]);
  return (
    <motion.div ref={outer} onScroll={measure} onAnimationComplete={measure}
      className={'rf-card' + (more ? ' is-more' : '') + (className ? ' ' + className : '')}
      initial={false} animate={{ height: h }} transition={{ duration: 0.38, ease: EASE }}>
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}

// The highlight: one shape behind the rows that glides to the row it is
// on. Measured after every render of the list, since a search can move
// the row it is on without changing which row that is.
function Highlight({ target, list }) {
  const [box, setBox] = React.useState(null);
  React.useLayoutEffect(() => {
    if (!target) { setBox(null); return; }
    const next = { top: target.offsetTop, height: target.offsetHeight };
    setBox((b) => (b && b.top === next.top && b.height === next.height ? b : next));
  }, [target, list]);
  if (!box) return null;
  return <span className="rf-hl" aria-hidden="true" style={{ transform: 'translateY(' + box.top + 'px)', height: box.height }} />;
}

function DrawerSkeleton() {
  return (
    <div aria-hidden="true">
      {['82%', '68%', '76%', '58%'].map((w, i) => <span key={i} className="rf-skel" style={{ width: w, marginTop: i ? 14 : 0 }} />)}
    </div>
  );
}

// The chosen referral. The drawer is the only surface: its header is the
// title and how it is sent; under it, the Q&A's card for the page drawn
// flat (TemplateView bare). Choosing another row cross-fades the contents.
function Drawer({ row, loading, headingRef, scrollRef, backHref, onClose }) {
  const closeLink = (e) => { e.preventDefault(); onClose(); };
  return (
    <motion.aside className="rf-drawer" role="dialog" aria-modal="false" aria-labelledby="rf-drawer-title"
      initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 32 }}
      transition={{ type: 'spring', stiffness: 420, damping: 40 }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={row ? row.id : loading ? 'loading' : 'missing'}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE }}>
          <header className="rf-drawer__head">
            {/* Narrow only: the sheet covers the list, so say how to get back to it. */}
            <a href={backHref} className="rf-back" onClick={closeLink}>
              <Svg w={16} sw={2.2}>{Icons.arrowLeft}</Svg>All referrals
            </a>
            <div className="rf-drawer__top">
              <h2 id="rf-drawer-title" ref={headingRef} tabIndex={-1} className="rf-doc__title">
                {row ? row.title : loading ? 'Loading…' : 'Not found'}
              </h2>
              <button type="button" className="rf-close" onClick={onClose} aria-label="Close">
                <Svg w={18} sw={2.2}>{Icons.close}</Svg>
              </button>
            </div>
            {row ? (
              <>
                {row.where ? <div className="rf-doc__where">{row.where}</div> : null}
                <div className="rf-doc__meta">
                  <Tag row={row} />
                  {row.tag && row.route ? <span className="rf-tag">{row.route}</span> : null}
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
        </motion.div>
      </AnimatePresence>
    </motion.aside>
  );
}

const askHref = (text) => '/ask' + (text ? '?q=' + encodeURIComponent(text) : '');

export default function ReferralsPage() {
  const [query, setQuery] = React.useState('');
  // Every referral, each with its card, and the most asked for (ids).
  const [book, setBook] = React.useState({ rows: [], popular: [], loaded: false, failed: false });
  // The server's ranking for one query. `for` is the query it answers, so a
  // slow reply to an old query is never shown against a new one.
  const [server, setServer] = React.useState({ for: '', rows: null, loading: false });
  // The referral that is open (a row id, "note:1964"), or null.
  const [openId, setOpenId] = React.useState(null);
  // The highlighted row. Moving it never opens anything.
  const [selIdx, setSelIdx] = React.useState(-1);
  // Nothing typed: the most asked for, or every referral A–Z.
  const [showAll, setShowAll] = React.useState(false);
  // The URL is read once, after the first render (the server has no URL to
  // render from), and only then written.
  const [hydrated, setHydrated] = React.useState(false);
  const [urlTick, setUrlTick] = React.useState(0);

  const inputRef = React.useRef(null);
  const headingRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const itemRefs = React.useRef(new Map());
  const refFns = React.useRef(new Map());
  // What the address bar says now ({ q, id }), and whether the open
  // referral's history entry was pushed by this page (so closing it is Back).
  const urlRef = React.useRef({ q: '', id: null });
  const openedHere = React.useRef(false);
  // The row (its list key) that opened the drawer: focus goes back to it.
  const opener = React.useRef('');
  // The first list is staggered in with the page; later rows just fade in.
  const intro = React.useRef(true);

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

  React.useEffect(() => {
    if (!book.loaded) return undefined;
    const t = setTimeout(() => { intro.current = false; }, 800);
    return () => clearTimeout(t);
  }, [book.loaded]);

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
  const browsingAll = showAll || !popular.length;

  // What is listed — and what the arrow keys move through — in drawn order.
  const flat = React.useMemo(() => {
    if (trimmed) return results.map((row) => ({ key: 'r:' + row.id, row }));
    const rows = browsingAll ? book.rows : popular;
    return rows.map((row) => ({ key: (browsingAll ? 'a:' : 'p:') + row.id, row }));
  }, [trimmed, results, browsingAll, book.rows, popular]);

  // A new search: the highlight starts on its top row, so Enter opens the
  // best match — but only when Enter is pressed.
  React.useEffect(() => { setSelIdx(startHighlight(trimmed)); }, [trimmed, browsingAll]);

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

  // A phone's box has room for a shorter placeholder; the long one was cut
  // off mid-word (as on Contacts).
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(max-width: 700px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // The box has the caret on arrival where there is a keyboard to type
  // with. On a phone it would raise the keyboard over the list unasked.
  React.useEffect(() => {
    const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (fine && inputRef.current && !readReferralUrl(window.location.search).id) inputRef.current.focus({ preventScroll: true });
  }, []);

  const clear = () => { setQuery(''); if (inputRef.current) inputRef.current.focus(); };
  // One ref callback per row, made once: a ref that changes on every render
  // is detached and re-attached on every render.
  const refFor = (key) => {
    let fn = refFns.current.get(key);
    if (!fn) {
      fn = (el) => { if (el) itemRefs.current.set(key, el); else itemRefs.current.delete(key); };
      refFns.current.set(key, fn);
    }
    return fn;
  };
  const selKey = selIdx >= 0 && flat[selIdx] ? flat[selIdx].key : '';
  const nothing = !!trimmed && answered && !results.length;
  // The search by meaning failed and no name matches either: say so, rather
  // than leaving an empty card and no way on.
  const unavailable = !!trimmed && book.loaded && !book.failed && server.for === trimmed && !server.loading && !answered && !results.length;
  const empty = book.loaded && !book.failed && !book.rows.length;
  // Whatever is listed is drawn — including the server's matches when the
  // list itself failed to load. With nothing typed and no list, flat is empty.
  const listed = flat.length > 0;
  // The list failed and there is nothing to show in its place: say so,
  // typed or not (a search that is still out shows its skeleton instead).
  const failed = book.loaded && book.failed && !results.length && !searching;

  return (
    <MotionConfig reducedMotion="user">
      <div className="rf-page riva-page-fill">
        <style data-rf="1" dangerouslySetInnerHTML={{ __html: RF_CSS }} />
        <AppHeader subtitle="Referrals" />

        <div className={'rf-stage' + (openId ? ' is-open' : '')}>
          <main className="rf">
            <motion.h1 className="rf-h1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
              Find a <em>referral</em>
            </motion.h1>

            <motion.div className="rf-box" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.07, ease: EASE }}>
              {/* The glass turns while the search by meaning is out. */}
              <span className={'rf-box__ico' + (searching ? ' is-busy' : '')} aria-hidden="true">
                <Svg w={21} sw={2}>{searching ? Icons.spinner : Icons.search}</Svg>
              </span>
              <input
                ref={inputRef}
                className="rf-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={narrow ? 'What is it for? “skin”…' : 'What is it for? “skin”, “nurse to visit at home”…'}
                aria-label="Search the practice’s referrals"
              />
              <span role="status" style={SR_ONLY}>{searching ? 'Searching by meaning' : ''}</span>
              <AnimatePresence initial={false}>
                {query ? (
                  <motion.button key="clear" type="button" className="rf-clear" onClick={clear} aria-label="Clear search"
                    initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.16, ease: EASE }}>
                    <Svg w={13} sw={3}>{Icons.close}</Svg>
                  </motion.button>
                ) : null}
              </AnimatePresence>
            </motion.div>

            {/* Nothing typed: say what the card is, and the way to the rest. */}
            {!trimmed ? (
              <motion.div className="rf-cap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.16 }}>
                {book.loaded && !book.failed && book.rows.length ? (
                  <>
                    <span>{browsingAll ? 'All ' + book.rows.length + ' referrals, A to Z' : 'Most asked for in the last 30 days'}</span>
                    {popular.length ? (
                      <button type="button" className="rf-cap__btn" onClick={() => setShowAll((v) => !v)}>
                        {showAll ? 'Show most asked for' : 'Show all ' + book.rows.length}
                      </button>
                    ) : null}
                  </>
                ) : !book.loaded ? <span className="rf-skel" style={{ width: 200, height: 9 }} aria-hidden="true" /> : null}
              </motion.div>
            ) : null}

            <motion.div className={'rf-cardwrap' + (trimmed ? ' is-results' : '')}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.14, ease: EASE }}>
              <Card>
                <div className="rf-list"
                  onKeyDown={(e) => { if (e.target !== inputRef.current) onKeyDown(e); }}
                  onMouseLeave={() => { if (!trimmed) setSelIdx(-1); }}>
                  {!book.loaded ? <SkeletonRows rows={6} /> : null}

                  {failed ? (
                    <State icon={Icons.alertCircle} title="The referrals could not be loaded."
                      text="Reload the page in a moment, or ask the question instead.">
                      <button type="button" className="rf-btn rf-btn--quiet" onClick={() => window.location.reload()}>Reload</button>
                      <Link href="/ask" className="rf-btn rf-btn--primary"><Svg w={15} sw={2.2}>{Icons.chat}</Svg>Ask a question</Link>
                    </State>
                  ) : null}

                  {empty && !trimmed ? (
                    <State icon={Icons.file} title="No referrals in the Notebook yet."
                      text="Pages written under Referrals in Practice notes are listed here, and searched by what they are for.">
                      <Link href="/notebook" className="rf-btn rf-btn--primary"><Svg w={15} sw={2.2}>{Icons.edit}</Svg>Open Practice notes</Link>
                    </State>
                  ) : null}

                  {listed ? <Highlight target={selKey ? itemRefs.current.get(selKey) || null : null} list={flat} /> : null}
                  {listed ? flat.map((entry, i) => (
                    <Row key={entry.key} row={entry.row} selected={selKey === entry.key} chosen={openId === entry.row.id}
                      btnRef={refFor(entry.key)} delay={intro.current ? 0.2 + Math.min(i, 10) * 0.03 : Math.min(i, 8) * 0.02}
                      onOpen={() => openRow(i)} onHover={() => { if (selIdx !== i) setSelIdx(i); }} />
                  )) : null}

                  {trimmed && !results.length && searching ? <SkeletonRows rows={3} /> : null}

                  {unavailable ? (
                    <State icon={Icons.alertCircle} title="Search is unavailable right now."
                      text={'No referral’s name has “' + trimmed + '” in it. Try again in a moment, or ask the question instead.'}>
                      <Link href={askHref(trimmed)} className="rf-btn rf-btn--primary">
                        <Svg w={15} sw={2.2}>{Icons.chat}</Svg>Ask a question
                      </Link>
                    </State>
                  ) : null}

                  {nothing ? (
                    <State icon={SEARCH_X} title={'No referral matches “' + trimmed + '”.'}
                      text="Try the words a patient or a doctor would use, or ask the question instead.">
                      <Link href={askHref(trimmed)} className="rf-btn rf-btn--primary">
                        <Svg w={15} sw={2.2}>{Icons.chat}</Svg>Ask a question
                      </Link>
                    </State>
                  ) : null}
                </div>
              </Card>
            </motion.div>

            {/* Not a referral, or not this one: the Q&A, with what was typed. */}
            {listed ? (
              <motion.div className="rf-ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.3 }}>
                <Link href={askHref(trimmed)}>Not what you need? <strong>Ask a question</strong></Link>
              </motion.div>
            ) : null}
          </main>

          <AnimatePresence>
            {openId ? (
              <motion.div key="scrim" className="rf-scrim" aria-hidden="true" onClick={close}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            ) : null}
            {openId ? (
              <Drawer key="drawer" row={chosen} loading={!book.loaded}
                headingRef={headingRef} scrollRef={scrollRef} backHref={referralUrl({ q: trimmed })} onClose={close} />
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}
