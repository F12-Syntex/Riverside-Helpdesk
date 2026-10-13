'use client';

import React from 'react';
import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion, useIsPresent } from 'motion/react';
import { Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { markRegisterWarm, registerIsWarm } from '../_components/contacts/ContactSearchLoader';
import {
  MAX_EMAILS, MAX_LEN, MAX_PHONES, checkDraft, hasProblems,
} from '../_components/contacts/validate.mjs';
import { highlightRanges } from '../../lib/lookup/fuzzy';
import { prepareContacts, searchPrepared } from '../../lib/contacts.fuzzy.mjs';

/* ------------------------------------------------------------------ *
 * Contact numbers — every number the practice keeps, and the CQC register.
 *
 * TWO KINDS OF NUMBER, KEPT APART:
 *
 *   - The practice's own contacts (/api/contacts, lib/contacts-store.js):
 *     the telephone sheet, the hospital shortlist, and anything somebody
 *     has added here. Open the page and they are all there, by category.
 *     Any of them can be changed, and new ones added, from this page — and
 *     what is saved is what the chat answers from too.
 *   - The CQC register (/api/cqc): every registered service in England,
 *     ~57k rows from the published extract. Nobody here wrote it, so it is
 *     never mixed in with the practice's list: a search shows it in its own
 *     box, under the practice's matches, and a row of it becomes a practice
 *     contact only when somebody saves it.
 *
 * Numbers, addresses and postcodes come verbatim from the sheet, from the
 * person who typed them here, or from the CQC extract — never from a model.
 *
 * THE SHAPE is Referrals', part for part: the heading, the box, and one
 * card of results under it that is as tall as what is in it. Each row is a
 * contact's name and, at the right, its numbers — call one, or copy it.
 * One highlight glides to the row the pointer or the arrow keys are on,
 * and Enter (or a click anywhere on the row that is not a number) copies
 * that row's first number. Nothing on the page says so in a legend; the
 * keys simply work, as they do on Referrals.
 *
 * MOTION SAYS WHAT CHANGED, as there: the page comes in once, the card
 * grows and shrinks to what it holds, new rows fade in where they land.
 * Reduced motion keeps the fades and drops the travel (MotionConfig).
 * ------------------------------------------------------------------ */

const EASE = [0.22, 1, 0.36, 1];

const SEARCH_X = (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="m8.5 8.5 5 5" /><path d="m13.5 8.5-5 5" /></>);
const MAIL = (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>);
const GLOBE = (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" /></>);
const REGISTER = (<><path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z" /><path d="M18 8h2v12a2 2 0 0 1-2 2" /><path d="M8 9h6M8 13h6" /></>);

const LK_CSS = `
/* The page is the screen under the bar and never scrolls: the card takes
   what is left of the column, and scrolls inside itself past that. No
   background of its own — the page sits on the light behind every page
   (PageBackground). The heading, the card's surface, the buttons, chips,
   states, skeleton and toast are the shared rv- parts in globals.css;
   what is here is only what Contacts has and Referrals does not. */
.lk-page{position:relative;height:100%;overflow:hidden;display:flex;flex-direction:column;}
.lk{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;width:100%;max-width:688px;margin:0 auto;padding:clamp(20px,11vh,140px) 24px 24px;}
.lk > *{flex:none;}
.lk > .lk-cardwrap{flex:0 1 auto;min-height:0;display:flex;flex-direction:column;}

/* ---- the box ---- */
.lk-box{display:flex;align-items:center;gap:2px;height:64px;padding:0 14px 0 24px;background:#fff;border-radius:999px;
  box-shadow:var(--rv-sh-box);transition:box-shadow .2s ease;}
.lk-box:focus-within{box-shadow:var(--rv-sh-box-focus);}
.lk-box__ico{flex:none;display:flex;color:var(--rv-ink-3);transition:color .15s ease;}
.lk-box:focus-within .lk-box__ico{color:var(--rv-accent);}
.lk-box__ico.is-busy{color:var(--rv-accent);animation:lk-spin .9s linear infinite;}
@keyframes lk-spin{to{transform:rotate(360deg);}}
.lk-input{flex:1;min-width:0;height:100%;border:none !important;background:transparent !important;outline:none !important;box-shadow:none !important;
  font:inherit;font-size:19px;padding:0 14px;color:var(--rv-ink);}
.lk-input::placeholder{color:var(--rv-ink-4);}
.lk-clear{flex:none;position:relative;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:50%;
  background:var(--rv-ink-3);color:#fff;cursor:pointer;transition:background-color .15s ease;}
.lk-clear:hover{background:var(--rv-ink-2);}
.lk-clear:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}

/* ---- above the card ---- */
.lk-cap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:22px;margin:22px 0 8px;padding:0 22px;
  font-size:13px;font-weight:550;color:var(--rv-ink-2);}
.lk-cardwrap.is-results{margin-top:14px;}

/* ---- the card ----
   No scrollbar (one coming and going shifted the rows sideways); while
   there is more below, the last few pixels fade out instead, so a list
   running past the foot of the card does not look finished. */
.lk-card{flex:0 1 auto;min-height:0;overflow:hidden auto;overscroll-behavior:contain;scrollbar-width:none;}
.lk-card::-webkit-scrollbar{display:none;}
.lk-card.is-more{-webkit-mask-image:linear-gradient(#000 calc(100% - 36px),transparent);mask-image:linear-gradient(#000 calc(100% - 36px),transparent);}
.lk-inner{position:relative;}
/* The highlight: one shape behind the rows, gliding to the row it is on.
   In the register's box it is a white tile, since the box is already tinted. */
.lk-hl{position:absolute;left:0;top:0;background:var(--rv-hl);pointer-events:none;
  transition:transform .32s var(--rv-ease),width .32s var(--rv-ease),height .32s var(--rv-ease),background-color .2s ease,border-radius .2s ease;}
.lk-hl.is-boxed{background:#fff;border-radius:12px;box-shadow:0 0 0 1px rgba(33,43,50,.06),0 1px 2px rgba(33,43,50,.05);}

/* A category, with nothing typed. Its name stays at the top of the card
   while its rows scroll under it. */
.lk-sec + .lk-sec{border-top:1px solid var(--rv-divider);}
.lk-group{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;margin:0;padding:14px 24px 6px;
  font-size:13px;font-weight:600;line-height:1.4;color:var(--rv-ink-3);background:rgba(255,255,255,.94);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}
.lk-group__n{font-variant-numeric:tabular-nums;}
/* A line of status inside the card, where a whole State would be too much. */
.lk-none{margin:0;padding:16px 24px 4px;font-size:14px;line-height:1.5;color:var(--rv-ink-2);}

/* ---- a row ----
   The name is a button that copies the row's first number, and its ::before
   stretches over the whole row, so a click anywhere on the row copies. The
   numbers and icons at the right sit above it and do their own thing. */
.lk-list{position:relative;}
.lk-row{position:relative;display:flex;align-items:center;gap:14px;min-height:56px;padding:12px 22px 12px 24px;scroll-margin:44px 0 40px;}
.lk-row + .lk-row{border-top:1px solid var(--rv-divider);}
.lk-row__main{flex:1;min-width:0;display:block;margin:0;padding:0;border:none;background:none;font:inherit;text-align:left;color:inherit;}
button.lk-row__main{cursor:pointer;}
button.lk-row__main::before{content:"";position:absolute;inset:0;}
.lk-row__main:focus-visible{outline:none;}
button.lk-row__main:focus-visible::before{outline:2px solid var(--rv-accent);outline-offset:-2px;border-radius:12px;}
.lk-row__label{display:flex;align-items:center;gap:8px;min-width:0;}
.lk-row__name{min-width:0;font-size:16.5px;font-weight:450;line-height:1.35;color:var(--rv-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lk-row__sub{display:block;margin-top:1px;font-size:13px;line-height:1.4;color:var(--rv-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lk-row__acts{position:relative;z-index:1;flex:none;display:flex;align-items:center;gap:4px;}
.lk-row .lk-quiet{opacity:0;transition:opacity .15s ease,background-color .15s ease,color .15s ease;}
.lk-row:hover .lk-quiet,.lk-row.is-sel .lk-quiet,.lk-row:focus-within .lk-quiet{opacity:1;}
.lk-mark{background:rgba(0,94,184,.1);color:var(--rv-accent);border-radius:3px;}

/* ---- a number: call it, copy it ---- */
.lk-num{display:inline-flex;align-items:center;height:34px;border-radius:999px;background:#fff;
  box-shadow:0 0 0 1px var(--rv-line),0 1px 2px rgba(33,43,50,.05);transition:box-shadow .15s ease;}
.lk-num:hover{box-shadow:0 0 0 1px var(--rv-accent-line),0 3px 8px -3px rgba(0,48,135,.2);}
.lk-num__call{position:relative;display:inline-flex;align-items:center;gap:7px;height:100%;padding:0 6px 0 13px;border-radius:999px;color:var(--rv-accent);
  font-size:14px;font-weight:650;text-decoration:none;font-variant-numeric:tabular-nums;white-space:nowrap;transition:color .15s ease;}
.lk-num__call:hover{color:var(--rv-accent-hi);}
.lk-num__copy{position:relative;display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;margin-right:3px;padding:0;border:none;border-radius:999px;
  background:none;color:var(--rv-ink-3);cursor:pointer;transition:background-color .15s ease,color .15s ease;}
.lk-num__copy:hover{background:var(--rv-accent-dim);color:var(--rv-accent);}
.lk-num__copy.is-done{background:var(--rv-green);color:#fff;}
.lk-num__call:focus-visible,.lk-num__copy:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}

/* ---- the CQC register: one box of its own, apart from the practice's ---- */
.lk-cqc{margin:10px;border-radius:16px;background:var(--rv-page);box-shadow:inset 0 0 0 1px rgba(33,43,50,.08);}
.lk-cqc__head{display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px 12px 14px;border:none;border-radius:16px;background:none;
  font:inherit;text-align:left;color:inherit;cursor:pointer;transition:background-color .15s ease;}
.lk-cqc__head:hover{background:rgba(33,43,50,.03);}
.lk-cqc__head:focus-visible{outline:2px solid var(--rv-accent);outline-offset:-2px;}
.lk-cqc__ico{flex:none;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--rv-warn-bg);color:var(--rv-warn-ink);}
.lk-cqc__title{flex:1;min-width:0;}
.lk-cqc__name{display:block;font-size:14.5px;font-weight:650;color:var(--rv-ink);}
.lk-cqc__sub{display:block;margin-top:1px;font-size:13px;line-height:1.4;color:var(--rv-ink-2);}
.lk-cqc__chev{flex:none;display:flex;color:var(--rv-icon-mute);transition:transform .2s var(--rv-ease);}
.lk-cqc.is-open .lk-cqc__chev{transform:rotate(180deg);}
.lk-cqc__list{position:relative;padding:0 6px 6px;}
.lk-cqc .lk-row{padding:10px 12px;}
.lk-cqc .lk-row + .lk-row{border-top:none;}
.lk-cqc .lk-skelrow{padding:0 12px;}

/* ---- the web's pages, under the numbers found on them ---- */
.lk-src{display:flex;align-items:center;gap:14px;min-height:52px;padding:10px 22px 10px 24px;color:inherit;text-decoration:none;transition:background-color .15s ease;}
.lk-src + .lk-src{border-top:1px solid var(--rv-divider);}
.lk-src:hover{background:var(--rv-hl);}
.lk-src:focus-visible{outline:2px solid var(--rv-accent);outline-offset:-2px;border-radius:12px;}
.lk-src__text{flex:1;min-width:0;}
.lk-src__title{display:block;font-size:14.5px;font-weight:550;color:var(--rv-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lk-src__url{display:block;font-size:13px;color:var(--rv-ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lk-src__ico{flex:none;display:flex;color:var(--rv-ink-3);}

/* ---- loading ---- */
.lk-skelrow{display:flex;align-items:center;gap:14px;min-height:62px;padding:0 22px 0 24px;}
.lk-skelrow + .lk-skelrow{border-top:1px solid var(--rv-divider);}

/* ---- the foot: one quiet line under the card ---- */
.lk-foot{display:flex;justify-content:center;margin-top:14px;}
.lk-foot__add{padding:6px 12px;border:none;border-radius:999px;background:none;font:inherit;font-size:14px;font-weight:500;color:var(--rv-ink-2);
  cursor:pointer;transition:color .15s ease,background-color .15s ease;}
.lk-foot__add strong{font-weight:600;color:var(--rv-accent);}
.lk-foot__add:hover{color:var(--rv-ink);background:rgba(255,255,255,.6);}
.lk-foot__add:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.lk-foot__note{padding:6px 12px;font-size:13px;color:var(--rv-ink-2);}

/* ---- adding or changing a contact ----
   The dialog's chrome — the dimmed page, the frosted panel, the centred
   title, the round close, the filled fields and the pills at the foot — is
   the shared popup block in globals.css, which knows these lk-form classes.
   What is here is the form's own: its fields, and what a wrong one looks
   like (a red ring, and why, directly under it). */
.lk-form{width:100%;max-width:520px;}
.lk-form__body{display:flex;flex-direction:column;gap:18px;padding-top:6px;padding-bottom:10px;}
.lk-field{display:flex;flex-direction:column;gap:7px;min-width:0;}
.lk-field__label{color:var(--rv-ink-2);}
.lk-field__hint{font-weight:450;color:var(--rv-ink-2);}
.lk-multi{display:flex;flex-direction:column;gap:8px;}
.lk-multi__item{display:flex;flex-direction:column;gap:6px;}
.lk-multi__row{display:flex;align-items:center;gap:6px;}
.lk-multi__row .lk-text{flex:1;min-width:0;}
.lk-hint{margin:0;font-size:12.5px;line-height:1.45;color:var(--rv-ink-2);}
.lk-add{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;height:30px;margin-left:-8px;padding:0 10px;border:none;border-radius:999px;
  background:none;font:inherit;font-size:13.5px;font-weight:600;color:var(--rv-accent);cursor:pointer;transition:background-color .15s ease;}
.lk-add:hover{background:var(--rv-accent-dim);}
.lk-add:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.lk-form .rv-err{margin:0;animation:lk-err-in .2s ease both;}
.lk-form .rv-err svg{flex:none;margin-top:1px;}
@keyframes lk-err-in{from{opacity:0;transform:translateY(-2px);}to{opacity:1;transform:none;}}
html body .lk-form .lk-text[aria-invalid="true"]{background:#fff;box-shadow:inset 0 0 0 1.5px var(--rv-danger),0 0 0 3px rgba(213,40,27,.12);}
html body .lk-form .lk-text[aria-invalid="true"]:focus{box-shadow:inset 0 0 0 1.5px var(--rv-danger),0 0 0 3px rgba(213,40,27,.22);}
.lk-text::-webkit-calendar-picker-indicator{opacity:.35;cursor:pointer;}
.lk-from{margin:0;padding:10px 14px;border-radius:12px;background:var(--rv-warn-bg);color:var(--rv-warn-ink);font-size:13.5px;line-height:1.45;}
.lk-form__alert{flex:none;margin:6px 24px 0;}
/* The question when removing takes the foot's whole first line. */
html body .lk-form__foot > .lk-ask{flex:1 0 100%;margin:0 0 2px;text-align:center;font-size:14.5px;line-height:1.45;color:var(--rv-ink-2);}
.lk-btn--remove{background:var(--rv-danger);color:#fff;}
.lk-btn--remove:hover:not(:disabled){background:var(--rv-danger-ink);}

/* ---- the toast ---- lifted clear of the foot's line. */
.lk-page .rv-toast{bottom:calc(68px + env(safe-area-inset-bottom));}
.lk-toast__ico{flex:none;display:flex;color:#6fd39b;}
.lk-toast__ico.is-bad{color:#ffb4a9;}
.lk-toast__text{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

/* The same breakpoint as the bar and the popups. */
@media (max-width:700px){
  .lk{padding:20px 16px 16px;}
  .lk-box{height:56px;padding-left:18px;}
  .lk-input{font-size:16px;padding:0 10px;}
  .lk-cap{padding:0 16px;}
  .lk-group{padding:14px 18px 6px;}
  .lk-none{padding:16px 18px 4px;}
  .lk-row{flex-wrap:wrap;gap:8px 10px;padding:12px 16px 12px 18px;}
  .lk-row__main{flex:1 1 100%;}
  .lk-row__name{white-space:normal;font-size:15.5px;}
  .lk-row__acts{flex:0 1 auto;min-width:0;max-width:100%;flex-wrap:wrap;gap:6px;}
  .lk-row__acts .lk-num{order:-1;}
  .lk-row .lk-quiet{opacity:1;}
  .lk-cqc{margin:10px 8px;}
  .lk-cqc .lk-row{padding:10px;}
  .lk-src{padding:10px 16px 10px 18px;}
  .lk-foot__add,.lk-foot__note{padding:11px 14px;}
  /* A thumb's worth of target round everything small, the size unchanged. */
  .lk-clear::after{content:"";position:absolute;inset:-9px;}
  .lk-row .rv-ibtn,.lk-multi__row .rv-ibtn{position:relative;}
  .lk-row .rv-ibtn::after,.lk-multi__row .rv-ibtn::after{content:"";position:absolute;inset:-5px;}
  .lk-num__call::after,.lk-num__copy::after{content:"";position:absolute;inset:-5px 0;}
  .lk-add{position:relative;}
  .lk-add::after{content:"";position:absolute;inset:-7px 0;}
  .lk-form__alert{margin:6px 18px 0;}
}
@media (prefers-reduced-motion:reduce){
  .lk-box__ico.is-busy,.lk-form .rv-err{animation:none !important;}
  .lk-hl,.lk-cqc__chev{transition:none !important;}
}
`;

const SKEL_NAME = ['46%', '34%', '52%', '40%', '30%', '44%'];
const SKEL_SUB = ['28%', '22%', '32%', '25%', '20%', '30%'];

function SkeletonRows({ rows = 5 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="lk-skelrow">
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="rv-skel" style={{ width: SKEL_NAME[i % 6] }} />
            <span className="rv-skel" style={{ width: SKEL_SUB[i % 6], height: 8, marginTop: 9 }} />
          </span>
          <span className="rv-skel" style={{ flex: 'none', width: 132, height: 34, borderRadius: 999 }} />
        </div>
      ))}
    </div>
  );
}

function State({ icon, title, text, children }) {
  return (
    <motion.div className="rv-state" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
      <span className="rv-state__ico" aria-hidden="true"><Svg w={20} sw={2}>{icon}</Svg></span>
      <p className="rv-state__title">{title}</p>
      {text ? <p className="rv-state__text">{text}</p> : null}
      {children ? <div className="rv-state__acts">{children}</div> : null}
    </motion.div>
  );
}

// The card grows and shrinks to what it holds rather than jumping, as
// Referrals' does. Its height follows the list inside it; the column's flex
// shrinks it to the room there is, and past that the card scrolls.
function Card({ children }) {
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
      className={'lk-card rv-card' + (more ? ' is-more' : '')}
      initial={false} animate={{ height: h }} transition={{ duration: 0.38, ease: EASE }}>
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}

function Highlighted({ label, query }) {
  const ranges = query ? highlightRanges(label, query) : [];
  if (!ranges.length) return label;
  const parts = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) parts.push(label.slice(at, a));
    parts.push(<mark key={i} className="lk-mark">{label.slice(a, b)}</mark>);
    at = b;
  });
  if (at < label.length) parts.push(label.slice(at));
  return parts;
}

// The clipboard, or the old way when there is none (the page served over
// plain http on the practice network has no navigator.clipboard). Resolves
// true only when something was actually copied: the page says "Copied"
// after this, never before it.
function copyText(text) {
  return new Promise((resolve) => {
    const fallback = () => {
      const was = document.activeElement;
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        resolve(!!ok);
      } catch {
        resolve(false);
      }
      if (was && typeof was.focus === 'function') was.focus({ preventScroll: true });
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => resolve(true), fallback);
    } else {
      fallback();
    }
  });
}

// What Enter, or a click on the row, copies: the first number that is not a
// fax, else the first number, else the first email address.
function primaryOf(entry) {
  const phone = entry.phones.find((p) => p.kind !== 'fax') || entry.phones[0];
  if (phone) return phone.display;
  return entry.emails[0] || '';
}

function PhoneNumber({ phone, owner, onCopy }) {
  const [done, setDone] = React.useState(false);
  const timer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const copy = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCopy(phone.display, owner).then((ok) => {
      if (!ok) return;
      setDone(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1400);
    });
  };
  const label = phone.kind === 'fax' ? 'Fax' : phone.label;
  return (
    <span className="lk-num" title={label || undefined}>
      <a href={'tel:' + phone.tel} className="lk-num__call" aria-label={'Call ' + phone.display + (label ? ', ' + label : '')}>
        <Svg w={13} sw={2.2}>{Icons.phone}</Svg>{phone.display}
      </a>
      <button type="button" onClick={copy} aria-label={'Copy ' + phone.display} title="Copy"
        className={'lk-num__copy' + (done ? ' is-done' : '')}>
        <Svg w={13} sw={2.4}>{done ? Icons.check : Icons.copy}</Svg>
      </button>
    </span>
  );
}

// One line under the name: the note, else what the service is and where. The
// CQC export packs several types into one "|"-joined field; the first says
// enough.
function subline(entry) {
  if (entry.note) return entry.note;
  const type = (entry.types || '').split('|').filter(Boolean)[0];
  return [type, entry.authority].filter(Boolean).join(' · ');
}

// One contact. `onEdit` for the practice's own (when it can be changed);
// `onSave` for a register row, which is how a CQC service becomes one of the
// practice's contacts. Memoised, with handlers that never change, so moving
// the highlight redraws two rows rather than two hundred.
const Row = React.memo(function Row({
  entry, idx, query, selected, delay, rowRef, editable, savable, onHover, onAct, onCopy, onEdit, onSave,
}) {
  const sub = subline(entry);
  const copies = primaryOf(entry);
  const subId = sub ? 'lk-sub-' + idx : undefined;
  const text = (
    <>
      <span className="lk-row__label">
        <span className="lk-row__name"><Highlighted label={entry.label} query={query} /></span>
        {/* Only in a search: with nothing typed, "Added here" is the group. */}
        {query && entry.origin === 'added' ? <span className="rv-chip">Added here</span> : null}
      </span>
      {sub ? <span id={subId} className="lk-row__sub">{sub}</span> : null}
    </>
  );
  return (
    <motion.div ref={rowRef} data-idx={idx} className={'lk-row' + (selected ? ' is-sel' : '')} onMouseMove={() => onHover(idx)}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay, ease: EASE }}>
      {copies ? (
        <button type="button" className="lk-row__main" onClick={() => onAct(entry)} onFocus={() => onHover(idx)}
          aria-label={entry.label + ': copy ' + copies} aria-describedby={subId}>
          {text}
        </button>
      ) : <div className="lk-row__main">{text}</div>}
      <span className="lk-row__acts">
        {editable ? (
          <button type="button" className="rv-ibtn lk-quiet" onClick={() => onEdit(entry)} title="Edit" aria-label={'Edit ' + entry.label} aria-haspopup="dialog">
            <Svg w={15} sw={2}>{Icons.edit}</Svg>
          </button>
        ) : null}
        {savable ? (
          <button type="button" className="rv-ibtn lk-quiet" onClick={() => onSave(entry)} title="Save to the practice’s contacts"
            aria-label={'Save ' + entry.label + ' to the practice’s contacts'} aria-haspopup="dialog">
            <Svg w={16} sw={2.2}>{Icons.plus}</Svg>
          </button>
        ) : null}
        {/* Quiet until the row is pointed at — unless there is no number,
            when an address (or the website) is the only way to reach them
            and is always shown. */}
        {entry.emails.map((e) => (
          <a key={e} href={'mailto:' + e} className={'rv-ibtn' + (entry.phones.length ? ' lk-quiet' : '')} title={e} aria-label={'Email ' + e}>
            <Svg w={16} sw={2}>{MAIL}</Svg>
          </a>
        ))}
        {entry.website && !entry.phones.length ? (
          <a href={entry.website} target="_blank" rel="noreferrer" className="rv-ibtn" title="Website" aria-label={'Website of ' + entry.label}>
            <Svg w={16} sw={2}>{GLOBE}</Svg>
          </a>
        ) : null}
        {entry.url ? (
          <a href={entry.url} target="_blank" rel="noreferrer" className="rv-ibtn lk-quiet"
            title={entry.web ? 'Open the page' : 'CQC record'} aria-label={(entry.web ? 'Open the page for ' : 'CQC record for ') + entry.label}>
            <Svg w={15} sw={2}>{Icons.external}</Svg>
          </a>
        ) : null}
        {entry.phones.map((p, j) => <PhoneNumber key={j} phone={p} owner={entry.label} onCopy={onCopy} />)}
      </span>
    </motion.div>
  );
});

// The practice's list, opened with nothing typed: what was added here first,
// then each category, alphabetically, with "Other numbers" last.
function byCategory(entries) {
  const groups = new Map();
  for (const e of entries) {
    const name = e.origin === 'added' ? 'Added here' : (e.category || 'Other numbers');
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(e);
  }
  const rank = (n) => (n === 'Added here' ? 0 : n === 'Other numbers' ? 2 : 1);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'en'))
    .map(([name, list]) => ({ name, list: list.slice().sort((a, b) => a.label.localeCompare(b.label, 'en')) }));
}

// `knownPhones` are the numbers the contact already had, which the form's
// check leaves alone (see validate.mjs): the sheet writes some its own way.
const blankDraft = () => ({ id: '', label: '', category: '', phones: [''], emails: [''], aliases: '', keepAliases: [], note: '', from: '', knownPhones: [] });

const draftOf = (entry) => ({
  id: entry.id,
  label: entry.label,
  category: entry.category || '',
  phones: entry.phones.length ? entry.phones.map((p) => p.display) : [''],
  emails: entry.emails.length ? entry.emails.slice() : [''],
  // The names it already goes by are kept as they are; the box is for more.
  aliases: '',
  keepAliases: entry.aliases || [],
  note: entry.note || '',
  from: '',
  knownPhones: entry.phones.map((p) => p.display),
});

// A register row, as the start of a practice contact.
const draftFromCqc = (entry) => {
  const phones = entry.phones.filter((p) => p.kind !== 'fax').map((p) => p.display);
  return {
    ...blankDraft(),
    label: entry.label,
    phones: phones.length ? phones : [''],
    note: subline(entry),
    from: 'From the CQC register. Check the number before saving: the register holds what the service told CQC, not necessarily the line the practice uses.',
    knownPhones: phones,
  };
};

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function FieldError({ id, text }) {
  if (!text) return null;
  return (
    <p id={id} className="rv-err">
      <Svg w={14} sw={2.2}>{Icons.alertCircle}</Svg><span>{text}</span>
    </p>
  );
}

// Several values of one kind (numbers, addresses): a field each, a way to add
// another and to take one away. Each field carries its own message.
function MultiField({
  kind, label, one, hint, help, values, errors, reach, max, type, inputMode, placeholder, addLabel, maxLength,
  fieldRefs, onSet, onDrop, onAdd, onLeave,
}) {
  const labelId = 'lk-f-' + kind;
  const helpId = labelId + '-help';
  const reachId = labelId + '-reach';
  return (
    <div className="lk-field" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="lk-field__label">
        {label}{hint ? <span className="lk-field__hint"> {hint}</span> : null}
      </span>
      <div className="lk-multi">
        {values.map((v, i) => {
          const errId = labelId + '-' + i + '-err';
          const reachHere = !!reach && i === 0;
          const describedBy = [errors[i] ? errId : '', reachHere ? reachId : '', help ? helpId : ''].filter(Boolean).join(' ');
          return (
            <div key={i} className="lk-multi__item">
              <div className="lk-multi__row">
                <input ref={(el) => { fieldRefs.current[i] = el; }} className="lk-text" type={type} inputMode={inputMode}
                  value={v} placeholder={placeholder} maxLength={maxLength} autoComplete="off" spellCheck={false} autoCapitalize="none"
                  aria-label={values.length > 1 ? one + ' ' + (i + 1) : one}
                  aria-invalid={errors[i] || reachHere ? 'true' : undefined} aria-describedby={describedBy || undefined}
                  onChange={(e) => onSet(i, e.target.value)} onBlur={() => onLeave(i)} />
                {values.length > 1 || v ? (
                  <button type="button" className="rv-ibtn" onClick={() => onDrop(i)}
                    aria-label={'Remove ' + one.toLowerCase() + (values.length > 1 ? ' ' + (i + 1) : '')}>
                    <Svg w={14} sw={2.4}>{Icons.close}</Svg>
                  </button>
                ) : null}
              </div>
              <FieldError id={errId} text={errors[i]} />
            </div>
          );
        })}
        <FieldError id={reachId} text={reach} />
        {help ? <p id={helpId} className="lk-hint">{help}</p> : null}
        {values.length < max ? (
          <button type="button" className="lk-add" onClick={onAdd}>
            <Svg w={13} sw={2.6}>{Icons.plus}</Svg>{addLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* The contact dialog.
 *
 * A field is told it is wrong once it has been changed and left, or once
 * Save has been tried — never just for being tabbed past, or a click on
 * Cancel would grow an error under the name and move Cancel out from under
 * the pointer. After that it is checked as it is typed, so the message goes
 * the moment it is put right. Save with something wrong puts the caret in
 * the first field that is, whose message a screen reader then reads with it.
 *
 * It is modal in fact as well as in name: Tab goes round the dialog and
 * nowhere else, the page behind is inert, Esc closes it (or, while it is
 * asking whether to remove, stops asking), and a click on the dimmed page
 * closes it only if nothing has been typed — a half-written contact is not
 * thrown away by a stray click. Where focus goes when it closes is the
 * page's business (see `opener` below). */
function ContactForm({ draft, categories, saving, error, onChange, onCancel, onSubmit, onRemove }) {
  const panel = React.useRef(null);
  const nameRef = React.useRef(null);
  const saveRef = React.useRef(null);
  const removeRef = React.useRef(null);
  const keepRef = React.useRef(null);
  const phoneRefs = React.useRef([]);
  const emailRefs = React.useRef([]);
  const initial = React.useRef(draft);
  // Removing asks once, in the dialog itself, rather than in a browser box.
  const [asking, setAsking] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const [left, setLeft] = React.useState({ label: false, phones: [], emails: [] });
  const problems = React.useMemo(() => checkDraft(draft), [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current);

  const shown = {
    label: tried || left.label ? problems.label : '',
    phones: problems.phones.map((p, i) => (tried || left.phones[i] ? p : '')),
    emails: problems.emails.map((p, i) => (tried || left.emails[i] ? p : '')),
    reach: tried ? problems.reach : '',
  };

  // The latest of everything the key handler needs, without re-binding it.
  // While the dialog fades out it is still mounted, but it no longer owns
  // the keys: Tab must not pull focus back into a dialog that is going.
  const present = useIsPresent();
  const live = React.useRef({});
  live.current = { saving, asking, onCancel, present };

  React.useEffect(() => { if (nameRef.current) nameRef.current.focus(); }, []);

  React.useEffect(() => {
    const onKey = (e) => {
      const el = panel.current;
      if (!el || !live.current.present) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (live.current.saving) return;
        if (live.current.asking) setAsking(false);
        else live.current.onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.getClientRects().length);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (!el.contains(at)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Asking and not asking swap the buttons at the foot; focus goes with them
  // (to "Keep it", the safe answer), rather than to the page behind.
  const askedOnce = React.useRef(false);
  React.useEffect(() => {
    if (!askedOnce.current) { askedOnce.current = true; return; }
    const to = asking ? keepRef.current : removeRef.current;
    if (to) to.focus();
  }, [asking]);

  // A disabled button cannot hold focus, so saving drops it on the page;
  // when the save comes back with an error, it comes back to the dialog.
  React.useEffect(() => {
    if (saving || !panel.current || panel.current.contains(document.activeElement)) return;
    const to = asking ? keepRef.current : saveRef.current;
    if (to) to.focus();
  }, [saving, asking]);

  // A field added or taken away: the caret goes to where the person is.
  const pending = React.useRef(null);
  React.useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const el = (p.kind === 'phones' ? phoneRefs : emailRefs).current[p.i];
    if (el) el.focus();
  });

  const set = (key) => (e) => onChange({ ...draft, [key]: e.target.value });
  const leaveName = () => { if (draft.label !== initial.current.label) setLeft((l) => ({ ...l, label: true })); };
  const multi = (kind) => ({
    values: draft[kind],
    fieldRefs: kind === 'phones' ? phoneRefs : emailRefs,
    onSet: (i, v) => onChange({ ...draft, [kind]: draft[kind].map((x, j) => (j === i ? v : x)) }),
    onLeave: (i) => {
      if (!draft[kind][i].trim()) return;
      setLeft((l) => { const next = l[kind].slice(); next[i] = true; return { ...l, [kind]: next }; });
    },
    onAdd: () => {
      pending.current = { kind, i: draft[kind].length };
      onChange({ ...draft, [kind]: draft[kind].concat(['']) });
    },
    onDrop: (i) => {
      const values = draft[kind].length > 1 ? draft[kind].filter((_, j) => j !== i) : [''];
      pending.current = { kind, i: Math.min(i, values.length - 1) };
      setLeft((l) => ({ ...l, [kind]: l[kind].filter((_, j) => j !== i) }));
      onChange({ ...draft, [kind]: values });
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (saving) return;
    setTried(true);
    if (!hasProblems(problems)) { onSubmit(); return; }
    const badPhone = problems.phones.findIndex(Boolean);
    const badEmail = problems.emails.findIndex(Boolean);
    const target = problems.label ? nameRef.current
      : badPhone >= 0 ? phoneRefs.current[badPhone]
        : problems.reach ? phoneRefs.current[0]
          : emailRefs.current[badEmail];
    if (target) target.focus();
  };

  const name = initial.current.label.trim() || 'this contact';

  return (
    <motion.div className="lk-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !dirty && !saving) onCancel(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
      <motion.form ref={panel} className="lk-form" role="dialog" aria-modal="true" aria-labelledby="lk-form-title"
        aria-describedby={draft.from ? 'lk-form-from' : undefined} aria-busy={saving || undefined} noValidate
        initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: 0.22, ease: EASE }}
        onSubmit={submit}>
        <div className="lk-form__head">
          <h2 id="lk-form-title" className="lk-form__title">{draft.id ? 'Edit contact' : 'New contact'}</h2>
          <button type="button" className="lk-iconbtn" onClick={onCancel} disabled={saving} aria-label="Close"><Svg w={14} sw={2.6}>{Icons.close}</Svg></button>
        </div>
        <div className="lk-form__body">
          {draft.from ? <p id="lk-form-from" className="lk-from">{draft.from}</p> : null}
          <div className="lk-field">
            <label htmlFor="lk-f-name" className="lk-field__label">Name</label>
            <input id="lk-f-name" ref={nameRef} className="lk-text" value={draft.label} onChange={set('label')} onBlur={leaveName}
              placeholder="e.g. Homerton Diabetes Centre" maxLength={MAX_LEN.label} autoComplete="off" aria-required="true"
              aria-invalid={shown.label ? 'true' : undefined} aria-describedby={shown.label ? 'lk-f-name-err' : undefined} />
            <FieldError id="lk-f-name-err" text={shown.label} />
          </div>
          <MultiField kind="phones" label="Phone numbers" one="Phone number" {...multi('phones')}
            errors={shown.phones} reach={shown.reach} max={MAX_PHONES} type="tel" inputMode="tel" maxLength={MAX_LEN.phone}
            placeholder="020 8510 5555" addLabel="Another number"
            help="Spaces and brackets are fine. Put an extension after “ext”." />
          <MultiField kind="emails" label="Email addresses" one="Email address" hint="(optional if there is a number)" {...multi('emails')}
            errors={shown.emails} max={MAX_EMAILS} type="email" inputMode="email" maxLength={MAX_LEN.email}
            placeholder="team@nhs.net" addLabel="Another email" />
          <div className="lk-field">
            <label htmlFor="lk-f-cat" className="lk-field__label">
              Category <span className="lk-field__hint">(left blank, it is worked out from the name)</span>
            </label>
            <input id="lk-f-cat" className="lk-text" list="lk-categories" value={draft.category} onChange={set('category')}
              placeholder="Departments and clinics" maxLength={MAX_LEN.category} autoComplete="off" />
            <datalist id="lk-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="lk-field">
            <label htmlFor="lk-f-aka" className="lk-field__label">
              Other names it goes by <span className="lk-field__hint">(comma separated, optional)</span>
            </label>
            <input id="lk-f-aka" className="lk-text" value={draft.aliases} onChange={set('aliases')} placeholder="diabetes clinic, DSN team" autoComplete="off" />
          </div>
          <div className="lk-field">
            <label htmlFor="lk-f-note" className="lk-field__label">Note <span className="lk-field__hint">(optional)</span></label>
            <textarea id="lk-f-note" className="lk-text" value={draft.note} onChange={set('note')} maxLength={MAX_LEN.note}
              placeholder="Opening hours, which option to press, who to ask for…" />
          </div>
        </div>
        {/* What the server said, in one place, above the buttons — never
            scrolled out of sight at the foot of a long form. */}
        {error ? <div className="rv-alert lk-form__alert" role="alert">{error}</div> : null}
        <div className="lk-form__foot">
          {asking ? (
            <>
              <p key="q" id="lk-ask" className="lk-ask">Remove {name} from the practice’s contacts?</p>
              <button key="keep" ref={keepRef} type="button" className="lk-btn lk-btn--ghost" onClick={() => setAsking(false)} disabled={saving}
                aria-describedby="lk-ask">Keep it</button>
              <button key="remove" type="button" className="lk-btn lk-btn--remove" onClick={onRemove} disabled={saving}
                aria-describedby="lk-ask">{saving ? 'Removing…' : 'Remove'}</button>
            </>
          ) : (
            <>
              {draft.id && onRemove ? (
                <button key="ask" ref={removeRef} type="button" className="lk-btn lk-btn--danger lk-btn--sm" onClick={() => setAsking(true)} disabled={saving}>
                  <Svg w={14} sw={2.2}>{Icons.trash}</Svg>Remove
                </button>
              ) : null}
              <span key="grow" className="lk-grow" />
              <button key="cancel" type="button" className="lk-btn lk-btn--ghost" onClick={onCancel} disabled={saving}>Cancel</button>
              <button key="save" ref={saveRef} type="submit" className="lk-btn lk-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save contact'}</button>
            </>
          )}
        </div>
      </motion.form>
    </motion.div>
  );
}

const sameBox = (a, b) => (a === b) || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.boxed === b.boxed);

export default function Page() {
  const [query, setQuery] = React.useState('');
  const [selIdx, setSelIdx] = React.useState(-1);
  // What the screen reader hears when the arrow keys move the highlight
  // from the box (focus stays in the box, so nothing else says it).
  const [moved, setMoved] = React.useState('');
  const [toast, setToast] = React.useState(null); // { text, bad }
  // The practice's own contacts: every one, held in the page and searched
  // here, as the sheet always was. `editable` is false when the database
  // could not be read and the bundled sheet is standing in; `failed` when
  // neither could be.
  const [book, setBook] = React.useState({ entries: [], editable: false, loaded: false, failed: false });
  const [cqc, setCqc] = React.useState({ entries: [], total: 0, loading: false, failed: false });
  const [cqcOpen, setCqcOpen] = React.useState(true);
  const [warm, setWarm] = React.useState(registerIsWarm);
  // The web fallback is never automatic — it costs a model call, so it runs
  // only when the reader asks, and only for the query they asked on.
  const [web, setWeb] = React.useState({ for: '', contacts: [], results: [], loading: false, reason: '' });
  const [editor, setEditor] = React.useState(null); // { draft, saving, error }
  const [hl, setHl] = React.useState(null);
  const [, setResized] = React.useState(0);
  const inputRef = React.useRef(null);
  const innerRef = React.useRef(null);
  const itemRefs = React.useRef(new Map());
  const refFns = React.useRef(new Map());
  const toastTimer = React.useRef(null);
  // What had focus when the dialog opened: it gets it back when it closes.
  const opener = React.useRef(null);
  // The first list is staggered in with the page; later rows just fade in.
  const intro = React.useRef(true);

  const trimmed = query.trim();
  const prepared = React.useMemo(() => prepareContacts(book.entries), [book.entries]);
  const mine = React.useMemo(
    () => (trimmed ? searchPrepared(prepared, trimmed, 60).map((r) => r.entry) : []),
    [prepared, trimmed],
  );
  const groups = React.useMemo(() => byCategory(book.entries), [book.entries]);
  const categories = React.useMemo(
    () => [...new Set(book.entries.map((e) => e.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en')),
    [book.entries],
  );

  const cqcSearching = trimmed.length >= 2 && cqc.loading;
  const register = trimmed.length >= 2 ? cqc.entries : [];
  const webShown = web.for === trimmed && !!(web.loading || web.contacts.length || web.results.length || web.reason);
  const webRows = React.useMemo(() => (web.for === trimmed && !web.loading ? web.contacts.map((c) => ({
    id: c.url, label: c.title || c.host || c.url, phones: c.phones || [], emails: c.emails || [], note: c.host || c.url, url: c.url, web: true,
  })) : []), [web, trimmed]);

  // What the arrow keys move through, in drawn order: the practice's
  // matches, then the register's when its box is open, then any numbers the
  // web found. With nothing typed, the whole list, category by category.
  const flat = React.useMemo(() => {
    if (!trimmed) return groups.flatMap((g) => g.list.map((e) => ({ key: 'p:' + e.id, entry: e })));
    return mine.map((e) => ({ key: 'p:' + e.id, entry: e }))
      .concat(cqcOpen ? register.map((e) => ({ key: 'q:' + e.id, entry: e })) : [])
      .concat(webRows.map((e, i) => ({ key: 'w:' + i + ':' + e.id, entry: e })));
  }, [trimmed, groups, mine, cqcOpen, register, webRows]);
  const indexOf = React.useMemo(() => new Map(flat.map((f, i) => [f.key, i])), [flat]);
  const selKey = selIdx >= 0 && flat[selIdx] ? flat[selIdx].key : '';

  const nothingFound = trimmed.length >= 2 && !cqc.loading && !mine.length && !register.length;
  const busy = cqcSearching || (web.for === trimmed && web.loading);
  const words = trimmed.split(/\s+/).filter(Boolean);
  const shorter = words.length > 1 ? words.slice(0, -1).join(' ') : '';
  const total = cqc.total ? cqc.total.toLocaleString('en-GB') : '';

  React.useEffect(() => { setSelIdx(trimmed ? 0 : -1); setMoved(''); }, [trimmed]);

  const loadBook = React.useCallback(() => {
    // A retry after a failure shows the skeleton again, not the old error.
    setBook((b) => (b.failed ? { ...b, loaded: false, failed: false } : b));
    return fetch('/api/contacts', { cache: 'no-store' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok || !Array.isArray(d.entries)) throw new Error('unreadable');
        setBook({ entries: d.entries, editable: !!d.editable, loaded: true, failed: false });
      })
      // A reload after a save that fails keeps the list already on screen.
      .catch(() => setBook((b) => ({ ...b, loaded: true, failed: !b.entries.length })));
  }, []);
  React.useEffect(() => { loadBook(); }, [loadBook]);

  React.useEffect(() => {
    if (!book.loaded) return undefined;
    const t = setTimeout(() => { intro.current = false; }, 800);
    return () => clearTimeout(t);
  }, [book.loaded]);

  // Debounced, and each reply checked against the query it was for, so a slow
  // answer cannot overwrite a newer one.
  React.useEffect(() => {
    if (trimmed.length < 2) { setCqc((c) => ({ entries: [], total: c.total, loading: false, failed: false })); return undefined; }
    setCqc((c) => ({ ...c, loading: true }));
    let live = true;
    const timer = setTimeout(() => {
      fetch('/api/cqc?q=' + encodeURIComponent(trimmed), { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('cqc ' + r.status))))
        .then((d) => {
          markRegisterWarm();
          setWarm(true);
          if (live) setCqc({ entries: Array.isArray(d.entries) ? d.entries : [], total: d.total || 0, loading: false, failed: false });
        })
        .catch(() => { if (live) setCqc((c) => ({ entries: [], total: c.total, loading: false, failed: true })); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [trimmed]);

  // The register's size, for the box it is shown in, and a first request to
  // wake it on the server before anybody types.
  React.useEffect(() => {
    fetch('/api/cqc', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { markRegisterWarm(); setWarm(true); setCqc((c) => (c.total ? c : { ...c, total: d.total || 0 })); })
      .catch(() => setWarm(true));
  }, []);

  // A phone's box has room for a shorter placeholder; the long one was cut
  // off mid-word.
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
    if (fine && inputRef.current) inputRef.current.focus({ preventScroll: true });
  }, []);

  // The highlight is measured here, after every render, rather than in a
  // component of its own: rows that have just arrived only have their refs
  // once the whole list is committed, and the page's layout effect is the
  // first moment they all do. Offsets rather than the screen position, so a
  // row still easing in does not drag the highlight with it.
  React.useLayoutEffect(() => {
    const root = innerRef.current;
    const el = selKey ? itemRefs.current.get(selKey) : null;
    let next = null;
    if (root && el && root.contains(el)) {
      let x = 0;
      let y = 0;
      let n = el;
      while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      if (n === root) next = { x, y, w: el.offsetWidth, h: el.offsetHeight, boxed: !!el.closest('.lk-cqc') };
    }
    if (!sameBox(hl, next)) setHl(next);
  });
  // A narrower window rewraps the rows; measure again.
  React.useEffect(() => {
    const on = () => setResized((n) => n + 1);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // One message at a time at the foot of the screen; a new one replaces the
  // old, and the old one's timer goes with it.
  const say = React.useCallback((text, bad = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, bad });
    toastTimer.current = setTimeout(() => setToast(null), bad ? 3600 : 1800);
  }, []);
  React.useEffect(() => () => clearTimeout(toastTimer.current), []);

  const onCopy = React.useCallback((text, owner) => copyText(text).then((ok) => {
    say(ok ? 'Copied ' + text + (owner ? ' · ' + owner : '') : 'Could not copy. Select the number instead.', !ok);
    return ok;
  }), [say]);
  const onAct = React.useCallback((entry) => {
    const value = primaryOf(entry);
    if (value) onCopy(value, entry.label);
  }, [onCopy]);
  const onHover = React.useCallback((i) => setSelIdx((cur) => (cur === i ? cur : i)), []);

  const openEditor = React.useCallback((draft) => {
    opener.current = document.activeElement;
    setEditor({ draft, saving: false, error: '' });
  }, []);
  const onEdit = React.useCallback((entry) => openEditor(draftOf(entry)), [openEditor]);
  const onSave = React.useCallback((entry) => openEditor(draftFromCqc(entry)), [openEditor]);
  const closeEditor = React.useCallback(() => setEditor(null), []);

  // Closed, however it was closed: focus goes back to what opened it, or —
  // when that has gone (the contact was removed, the "nothing found" card
  // that offered to add it was replaced by the contact itself) — to the box,
  // where there is a keyboard. On a phone, focusing the box would raise the
  // keyboard over the list, so it is left alone.
  const editing = !!editor;
  const wasEditing = React.useRef(false);
  React.useEffect(() => {
    if (editing) { wasEditing.current = true; return; }
    if (!wasEditing.current) return;
    wasEditing.current = false;
    const back = opener.current;
    opener.current = null;
    if (back && back.isConnected && typeof back.focus === 'function') { back.focus({ preventScroll: true }); return; }
    const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (fine && inputRef.current) inputRef.current.focus({ preventScroll: true });
  }, [editing]);

  const searchWeb = React.useCallback((q) => {
    if (q.length < 3) return;
    setWeb({ for: q, contacts: [], results: [], loading: true, reason: '' });
    fetch('/api/lookup-web?q=' + encodeURIComponent(q), { cache: 'no-store' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => setWeb({
        for: q,
        contacts: Array.isArray(d.contacts) ? d.contacts : [],
        results: Array.isArray(d.results) ? d.results : [],
        loading: false,
        reason: d.reason || (ok ? '' : 'Web search is unavailable right now.'),
      }))
      .catch(() => setWeb({ for: q, contacts: [], results: [], loading: false, reason: 'Web search is unavailable right now.' }));
  }, []);

  const submit = async () => {
    if (!editor || editor.saving) return;
    const d = editor.draft;
    const chosen = d.aliases.split(',').map((a) => a.trim()).filter(Boolean);
    const body = {
      id: d.id || undefined,
      label: d.label.trim(),
      category: d.category.trim(),
      phones: d.phones.map((p) => p.trim()).filter(Boolean),
      emails: d.emails.map((e) => e.trim()).filter(Boolean),
      aliases: (d.keepAliases || []).concat(chosen),
      note: d.note.trim(),
    };
    setEditor((ed) => ({ ...ed, saving: true, error: '' }));
    try {
      const r = await fetch('/api/contacts', {
        method: d.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(out.error || 'The contact could not be saved. Try again in a moment.'), { said: true });
      await loadBook();
      setEditor(null);
      say((d.id ? 'Saved ' : 'Added ') + ((out.contact && out.contact.label) || body.label));
    } catch (e) {
      const text = e && e.said ? e.message : 'The contact could not be saved. Check the connection and try again.';
      setEditor((ed) => (ed ? { ...ed, saving: false, error: text } : ed));
    }
  };

  const remove = async () => {
    if (!editor || !editor.draft.id || editor.saving) return;
    const d = editor.draft;
    setEditor((ed) => ({ ...ed, saving: true, error: '' }));
    try {
      const r = await fetch('/api/contacts?id=' + encodeURIComponent(d.id), { method: 'DELETE' });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(out.error || 'The contact could not be removed. Try again in a moment.'), { said: true });
      await loadBook();
      setEditor(null);
      say('Removed ' + d.label);
    } catch (e) {
      const text = e && e.said ? e.message : 'The contact could not be removed. Check the connection and try again.';
      setEditor((ed) => (ed ? { ...ed, saving: false, error: text } : ed));
    }
  };

  const focusBox = () => { if (inputRef.current) inputRef.current.focus(); };
  const clear = () => { setQuery(''); focusBox(); };

  // The keys, in the box or on a row. In the box the highlight moves and
  // focus stays; on a row, focus moves with the highlight, and ↑ from the
  // top row goes back up to the box. Enter in the box copies the
  // highlighted row's number (on a row it is the row's own click). Esc
  // clears the box, or from a row goes back to it.
  const onKeyDown = (e) => {
    const inBox = e.target === inputRef.current;
    if (e.key === 'Escape') {
      if (!inBox) { e.preventDefault(); focusBox(); } else if (query) { e.preventDefault(); setQuery(''); }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!flat.length) return;
      e.preventDefault();
      // On a row, from the row that has focus — the pointer may have moved
      // the highlight somewhere else since.
      const on = inBox ? null : e.target.closest('.lk-row');
      const cur = on && on.dataset.idx ? Number(on.dataset.idx) : selIdx;
      if (!inBox && e.key === 'ArrowUp' && cur <= 0) { focusBox(); return; }
      const next = e.key === 'ArrowDown'
        ? Math.min((cur < 0 ? -1 : cur) + 1, flat.length - 1)
        : Math.max(cur - 1, 0);
      setSelIdx(next);
      const { entry } = flat[next];
      const el = itemRefs.current.get(flat[next].key);
      if (el) {
        if (!inBox) {
          const main = el.querySelector('button.lk-row__main');
          if (main) main.focus({ preventScroll: true });
        }
        el.scrollIntoView({ block: 'nearest' });
      }
      if (inBox) setMoved(entry.label + (primaryOf(entry) ? ', ' + primaryOf(entry) : ''));
      return;
    }
    if (e.key === 'Enter' && inBox && !(e.nativeEvent && e.nativeEvent.isComposing)) {
      if (selIdx >= 0 && flat[selIdx]) { e.preventDefault(); onAct(flat[selIdx].entry); }
      else if (nothingFound && web.for !== trimmed) searchWeb(trimmed);
    }
  };

  // One ref callback per row, made once: a ref that changes on every render
  // is detached and re-attached on every render (and would undo the memo).
  const refFor = (key) => {
    let fn = refFns.current.get(key);
    if (!fn) {
      fn = (el) => { if (el) itemRefs.current.set(key, el); else itemRefs.current.delete(key); };
      refFns.current.set(key, fn);
    }
    return fn;
  };
  const row = (key, entry, extra) => {
    const i = indexOf.get(key);
    return (
      <Row key={key} entry={entry} idx={i} query={trimmed} selected={selKey === key} rowRef={refFor(key)}
        delay={intro.current ? 0.2 + Math.min(i, 10) * 0.03 : Math.min(i, 8) * 0.02}
        onHover={onHover} onAct={onAct} onCopy={onCopy} onEdit={onEdit} onSave={onSave} {...extra} />
    );
  };
  const practiceRow = (entry) => row('p:' + entry.id, entry, { editable: book.editable && !entry.fixed });
  const addContact = (label = '') => openEditor({ ...blankDraft(), label });

  // What the screen reader is told: that a search is out, then what it found.
  const found = (nothingFound ? 'Nothing matches “' + trimmed + '”'
    : mine.length + ' of the practice’s contacts'
      + (register.length ? ', ' + register.length + (register.length >= 25 ? ' or more' : '') + ' on the CQC register' : ''))
    + (webShown ? (webRows.length ? '; ' + webRows.length + ' found on the web, unverified' : '; nothing found on the web') : '')
    + '.';
  const status = !book.loaded ? '' : moved || (!trimmed ? '' : busy ? 'Searching…' : found);

  // Nothing typed, and something to show.
  const listed = book.loaded && !book.failed && !trimmed && groups.length > 0;
  const empty = book.loaded && !book.failed && !book.entries.length;
  const nothing = (() => {
    const more = trimmed.length >= 3 ? 'Try a shorter name or a postcode, or search the web.' : 'Try a longer name, or a postcode.';
    if (book.failed && cqc.failed) return { title: 'Nothing could be searched just now.', text: 'Neither the practice’s contacts nor the CQC register answered. ' + more };
    if (book.failed) return { title: 'Nothing on the CQC register matches “' + trimmed + '”.', text: 'The practice’s own contacts could not be loaded. ' + more };
    if (cqc.failed) return { title: 'None of the practice’s contacts match “' + trimmed + '”.', text: 'The CQC register could not be searched just now. ' + more };
    return { title: 'Nothing matches “' + trimmed + '”.', text: 'It is not in the practice’s contacts or on the CQC register. ' + more };
  })();

  return (
    <MotionConfig reducedMotion="user">
      <div className="lk-page riva-page-fill">
        <style data-lk="1" dangerouslySetInnerHTML={{ __html: LK_CSS }} />
        <AppHeader subtitle="Contact numbers" />

        <main className="lk" inert={editor ? '' : undefined}>
          <motion.h1 className="rv-h1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
            Find a <em>number</em>
          </motion.h1>

          <motion.div className="lk-box" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.07, ease: EASE }}>
            {/* The glass turns while the register or the web is being searched. */}
            <span className={'lk-box__ico' + (busy ? ' is-busy' : '')} aria-hidden="true">
              <Svg w={21} sw={2}>{busy ? Icons.spinner : Icons.search}</Svg>
            </span>
            <input
              ref={inputRef}
              className="lk-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={narrow ? 'Name or postcode: “Homerton”…' : 'Name, service or postcode: “Homerton”, “E5 9BQ”…'}
              aria-label="Search the practice’s contacts and the CQC register"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            <span role="status" className="rv-sr">{status}</span>
            <AnimatePresence initial={false}>
              {query ? (
                <motion.button key="clear" type="button" className="lk-clear" onClick={clear} aria-label="Clear search"
                  initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.16, ease: EASE }}>
                  <Svg w={13} sw={3}>{Icons.close}</Svg>
                </motion.button>
              ) : null}
            </AnimatePresence>
          </motion.div>

          {/* Nothing typed: say what the card is. */}
          {!trimmed ? (
            <motion.div className="lk-cap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.16 }}>
              {listed ? <span>All {book.entries.length} contacts, by category</span>
                : !book.loaded ? <span className="rv-skel" style={{ width: 200, height: 9 }} aria-hidden="true" /> : null}
            </motion.div>
          ) : null}

          <motion.div className={'lk-cardwrap' + (trimmed ? ' is-results' : '')}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.14, ease: EASE }}>
            <Card>
              <div className="lk-inner" ref={innerRef}
                onKeyDown={(e) => { if (e.target !== inputRef.current) onKeyDown(e); }}
                onMouseLeave={() => { if (!trimmed) setSelIdx(-1); }}>
                {hl ? (
                  <span className={'lk-hl' + (hl.boxed ? ' is-boxed' : '')} aria-hidden="true"
                    style={{ transform: 'translate(' + hl.x + 'px,' + hl.y + 'px)', width: hl.w, height: hl.h }} />
                ) : null}

                {!book.loaded && !trimmed ? <SkeletonRows rows={6} /> : null}

                {book.failed && !trimmed ? (
                  <State icon={Icons.alertCircle} title="The contacts could not be loaded."
                    text="Reload in a moment, or ask the question instead. The CQC register can still be searched above.">
                    <button type="button" className="rv-btn rv-btn--quiet" onClick={loadBook}>Reload</button>
                    <Link href="/ask" className="rv-btn rv-btn--primary"><Svg w={15} sw={2.2}>{Icons.chat}</Svg>Ask a question</Link>
                  </State>
                ) : null}

                {empty && !trimmed ? (
                  <State icon={Icons.phone} title="No contacts saved yet."
                    text={book.editable
                      ? 'Numbers added here are listed by category, and the chat answers from them too.'
                      : 'The practice’s numbers are listed here once they are added. The CQC register can still be searched above.'}>
                    {book.editable ? (
                      <button type="button" className="rv-btn rv-btn--primary" onClick={() => addContact()} aria-haspopup="dialog">
                        <Svg w={15} sw={2.4}>{Icons.plus}</Svg>Add a contact
                      </button>
                    ) : null}
                  </State>
                ) : null}

                {/* Nothing typed: every contact the practice keeps, by category. */}
                {listed ? groups.map((g, gi) => (
                  <section key={g.name} className="lk-sec" aria-labelledby={'lk-g-' + gi}>
                    <h2 id={'lk-g-' + gi} className="lk-group">{g.name} <span className="lk-group__n">{g.list.length}</span></h2>
                    <div className="lk-list">{g.list.map(practiceRow)}</div>
                  </section>
                )) : null}

                {/* Typed: the practice's matches first, then the register in its
                    own box — nobody here wrote it, so it is never mixed in. */}
                {trimmed && book.failed && !nothingFound ? (
                  <p className="lk-none">The practice’s own contacts could not be loaded, so only the CQC register is searched.</p>
                ) : null}
                {trimmed && !book.loaded ? <SkeletonRows rows={3} /> : null}
                {trimmed && mine.length ? <div className="lk-list">{mine.map(practiceRow)}</div> : null}
                {trimmed && book.loaded && !book.failed && !mine.length && (trimmed.length < 2 || !nothingFound) ? (
                  <p className="lk-none">
                    None of the practice’s contacts match “{trimmed}”.{trimmed.length < 2 ? ' Keep typing to search the CQC register too.' : ''}
                  </p>
                ) : null}

                {trimmed.length >= 2 && (register.length || cqcSearching || (cqc.failed && !nothingFound)) ? (
                  <section className={'lk-cqc' + (cqcOpen ? ' is-open' : '')} aria-label="CQC register">
                    <button type="button" className="lk-cqc__head" onClick={() => setCqcOpen((o) => !o)}
                      aria-expanded={cqcOpen} aria-controls="lk-cqc-list">
                      <span className="lk-cqc__ico" aria-hidden="true"><Svg w={16} sw={2}>{REGISTER}</Svg></span>
                      <span className="lk-cqc__title">
                        <span className="lk-cqc__name">CQC register</span>
                        <span className="lk-cqc__sub">
                          {cqc.failed && !register.length
                            ? 'Could not be searched just now'
                            : cqcSearching && !register.length
                              ? 'Searching ' + (total || 'every') + ' registered services…'
                              : register.length + (register.length >= 25 ? '+' : '') + ' of ' + (total || 'the') + ' registered services · not the practice’s own list'}
                        </span>
                      </span>
                      <span className="lk-cqc__chev" aria-hidden="true"><Svg w={16} sw={2.2}>{Icons.chevronDown}</Svg></span>
                    </button>
                    {cqcOpen ? (
                      <div className="lk-cqc__list" id="lk-cqc-list">
                        {cqcSearching && !register.length && !warm ? <SkeletonRows rows={2} /> : null}
                        {register.map((entry) => row('q:' + entry.id, entry, { savable: book.editable }))}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {nothingFound && !webShown ? (
                  <State icon={SEARCH_X} title={nothing.title} text={nothing.text}>
                    {trimmed.length >= 3 ? (
                      <button type="button" className="rv-btn rv-btn--primary" onClick={() => searchWeb(trimmed)}>
                        <Svg w={15} sw={2.2}>{GLOBE}</Svg>Search the web
                      </button>
                    ) : null}
                    {book.editable ? (
                      <button type="button" className="rv-btn rv-btn--quiet" onClick={() => addContact(trimmed)} aria-haspopup="dialog">
                        <Svg w={14} sw={2.6}>{Icons.plus}</Svg>Add it as a contact
                      </button>
                    ) : null}
                    {shorter ? (
                      <button type="button" className="rv-btn rv-btn--quiet" onClick={() => { setQuery(shorter); focusBox(); }}>
                        Try “{shorter}”
                      </button>
                    ) : null}
                  </State>
                ) : null}

                {/* The web, kept visibly apart from both: its own group, marked
                    unverified. Numbers first, the pages second. */}
                {webShown ? (
                  <section className="lk-sec" aria-labelledby="lk-g-web">
                    {nothingFound ? <p className="lk-none">Nothing in the practice’s contacts or on the CQC register matches “{trimmed}”.</p> : null}
                    <h2 id="lk-g-web" className="lk-group">From the web <span className="rv-chip rv-chip--warn">Unverified</span></h2>
                    {web.loading ? <SkeletonRows rows={2} /> : (
                      <>
                        {webRows.length ? <div className="lk-list">{webRows.map((e, i) => row('w:' + i + ':' + e.id, e))}</div> : null}
                        {!webRows.length ? (
                          <State icon={SEARCH_X} title={web.reason || 'No number found on the web for “' + trimmed + '”.'}
                            text="Search for it yourself, or add the number as a contact once you have it.">
                            <a href={'https://www.google.com/search?q=' + encodeURIComponent(trimmed + ' phone number')}
                              target="_blank" rel="noreferrer" className="rv-btn rv-btn--primary">
                              <Svg w={14} sw={2.2}>{Icons.external}</Svg>Search Google
                            </a>
                            {book.editable ? (
                              <button type="button" className="rv-btn rv-btn--quiet" onClick={() => addContact(trimmed)} aria-haspopup="dialog">
                                <Svg w={14} sw={2.6}>{Icons.plus}</Svg>Add it as a contact
                              </button>
                            ) : null}
                          </State>
                        ) : null}
                        {web.results.length ? (
                          <>
                            <h3 className="lk-group">Sources</h3>
                            {web.results.map((r) => (
                              <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="lk-src">
                                <span className="lk-src__text">
                                  <span className="lk-src__title">{r.title}</span>
                                  <span className="lk-src__url">{r.url}</span>
                                </span>
                                <span className="lk-src__ico" aria-hidden="true"><Svg w={14} sw={2}>{Icons.external}</Svg></span>
                              </a>
                            ))}
                          </>
                        ) : null}
                      </>
                    )}
                  </section>
                ) : null}
              </div>
            </Card>
          </motion.div>

          {/* Adding is here, at the foot, out of the way of finding — which is
              what the page is for. A search that finds nothing offers it too,
              in its own card, so the foot steps aside then. */}
          {book.loaded && !book.failed && !empty && !(nothingFound && !webShown) ? (
            <motion.div className="lk-foot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.3 }}>
              {book.editable ? (
                <button type="button" className="lk-foot__add" aria-haspopup="dialog"
                  onClick={() => addContact(trimmed && !mine.length ? trimmed : '')}>
                  Not listed? <strong>Add a contact</strong>
                </button>
              ) : <span className="lk-foot__note">Contacts are read-only right now.</span>}
            </motion.div>
          ) : null}
        </main>

        <AnimatePresence>
          {editor ? (
            <ContactForm key="form" draft={editor.draft} categories={categories} saving={editor.saving} error={editor.error}
              onChange={(draft) => setEditor((ed) => ({ ...ed, draft }))} onCancel={closeEditor} onSubmit={submit}
              onRemove={editor.draft.id ? remove : null} />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {toast ? (
            <motion.div key="toast" className="rv-toast" aria-hidden="true"
              initial={{ opacity: 0, y: 10, x: '-50%', scale: 0.96 }} animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
              exit={{ opacity: 0, y: 6, x: '-50%' }} transition={{ duration: 0.22, ease: EASE }}>
              <span className={'lk-toast__ico' + (toast.bad ? ' is-bad' : '')}>
                <Svg w={15} sw={2.6}>{toast.bad ? Icons.alertCircle : Icons.check}</Svg>
              </span>
              <span className="lk-toast__text">{toast.text}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {/* The toast's words for a screen reader, in a region that is always
            there (one that arrives with its words already in it is often
            not read at all). */}
        <div role="status" className="rv-sr">{toast ? toast.text : ''}</div>
      </div>
    </MotionConfig>
  );
}
