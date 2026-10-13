'use client';

/* ------------------------------------------------------------------ *
 * Settings — which model runs which job.
 *
 * The jobs are not seven equal things, and the page does not draw them as
 * seven equal cards. They are a chain of inheritance: Reasoning is the
 * practice's model; Fast and Web search fall back to it when blank; AccurX
 * routing and Super speed fall back to Fast; Images and Answer check stand
 * on their own because nothing above them can do their job. The ledger
 * draws exactly that — rows grouped by what they fall back to, a blank
 * field showing the model it resolves to — so a blank row never has to be
 * puzzled over.
 *
 * Each field is the whole control: type in it and it fuzzy-searches every
 * model OpenRouter serves ("son 4" reaches Claude Sonnet 4.6, "perp" reaches
 * the Perplexity models), or type a full id and use it as typed — including
 * a routing variant like ":nitro", which is part of the id, and a provider
 * pin like "@google-vertex/europe", which serves the model from that provider
 * and no other (see lib/model-id.mjs). Answer check searches the decision
 * models instead, which OpenRouter's chat list does not carry. The list
 * opens on a click, on typing or on ↓ — not on focus, so tabbing down the
 * rows does not throw a list over the ones below.
 *
 * THE SHAPE. The tools' own: one centred column on the light with one white
 * card in it. No heading (cb33f40): seven rows and a save bar are already
 * more than a laptop screen holds, and a heading would only push them into
 * the scroll. The page never scrolls; the rows scroll inside the card when
 * they must, over a save bar that stays put at the card's foot. Under the
 * card, and outside it on purpose, the one setting that is not the
 * practice's and needs no Save: whether THIS computer's questions are
 * logged.
 *
 * NOTHING CHANGES UNTIL SAVE. The bar counts what has changed and a dot
 * marks each changed row; Discard puts them all back. An id is checked when
 * its field is left, and from then on as it is typed — lib/model-id.mjs says
 * what is wrong with it, under the field. A well-formed id OpenRouter does
 * not list is warned about but not refused: a model newer than the list is
 * real. Save sends only the rows that changed, never sends an id the server
 * would refuse, and goes to the first such field instead.
 * ------------------------------------------------------------------ */

import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { buildIndex, fuzzySearch } from '@/lib/lookup/fuzzy';
import { isModelSlug, modelIdProblem, splitProviders } from '@/lib/model-id.mjs';
import { NO_LOG_COOKIE, NO_LOG_STORE_KEY } from '@/lib/questions/opt-out.mjs';

const EASE = [0.22, 1, 0.36, 1];
const LIST_LIMIT = 40;
// How long "Saved" stays in the bar before it goes back to saying what the
// page does.
const SAVED_MS = 4000;

// Kept in step with ROLE_SETTING_KEY in lib/settings.js. The reasoning role is
// the model itself, so it is saved as `model` rather than as an override.
const ROLE_KEYS = ['fast', 'web', 'accurx', 'superSpeed', 'images', 'check'];

// Short names for the roles, used where one role has to be named inside
// another's caption ("Blank, so it uses Fast").
const ROLE_NAME = {
  reasoning: 'Reasoning', fast: 'Fast', web: 'Web search', accurx: 'AccurX routing',
  superSpeed: 'Super speed', images: 'Images', check: 'Answer check',
};

// The ledger, top to bottom. `from` is what a blank row falls back to (none:
// a default of its own); `child` draws the little elbow that says so.
const GROUPS = [
  {
    title: 'Answering', note: 'Blank rows here use Reasoning',
    rows: [
      { key: 'reasoning', name: 'Reasoning', job: 'Decides and writes the answer' },
      { key: 'fast', name: 'Fast', job: 'Reads, searches, background jobs', from: 'reasoning', child: true },
      { key: 'web', name: 'Web search', job: 'Searches the internet', from: 'reasoning', child: true },
    ],
  },
  // Both inherit from Fast rather than from Reasoning: each is a quick, cheap
  // read of one message, and the only one of the two a person waits on with
  // nothing on screen yet is Super speed.
  {
    title: 'Messages', note: 'Blank rows here use Fast',
    rows: [
      { key: 'accurx', name: 'AccurX routing', job: 'Says where a pasted /accurx goes', from: 'fast', child: true },
      { key: 'superSpeed', name: 'Super speed', job: 'Checks a message for patient details before it is sent', from: 'fast', child: true },
    ],
  },
  // Neither can borrow from above: Reasoning may be text-only, and no chat
  // model can stand in for a decision model.
  {
    title: 'On their own', note: 'Blank rows here use a default of their own',
    rows: [
      { key: 'images', name: 'Images', job: 'Reads any message with a picture' },
      { key: 'check', name: 'Answer check', job: 'Scores each Notebook answer against the question' },
    ],
  },
];
const ORDER = GROUPS.flatMap((g) => g.rows.map((r) => r.key));
const fieldId = (key) => 'st-' + key;

// What is stored, as the one flat record the page edits: Reasoning is the
// setting's `model`, the rest are the role overrides ('' = inherits).
function storedOf(d) {
  const roles = (d && d.roleStored) || {};
  const out = { reasoning: String((d && d.model) || '') };
  for (const k of ROLE_KEYS) out[k] = String(roles[k] || '');
  return out;
}

// The catalogue entry an id is priced and checked by. A routing variant
// changes the provider and not the model, so ":nitro" is the model it
// decorates — unless the catalogue lists the variant itself, as it does some
// ":free" ones. A provider pin is not part of the model at all.
function findModel(list, id) {
  const plain = splitProviders(id).model;
  return list.find((m) => m.id === plain) || list.find((m) => m.id === plain.split(':')[0]) || null;
}

// A model's advertised rate per million tokens, or null where nobody has
// published one — in which case the page says nothing rather than saying so.
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 });
function rate(model) {
  if (!model) return null;
  const a = model.promptPerMillion;
  const b = model.completionPerMillion;
  if (a == null && b == null) return null;
  if (!a && !b) return { free: true };
  return { in: a == null ? '–' : USD.format(a), out: b == null ? '–' : USD.format(b) };
}

// A reply from either settings route, or the reason there is not one. A 500
// from a proxy is not JSON, and must not surface as "Unexpected token <".
async function readJson(res) {
  let data = null;
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok || !data || data.error) throw new Error((data && data.error) || 'The server answered ' + res.status + '.');
  return data;
}

const n = (v) => Number(v || 0).toLocaleString('en-GB');

// Every colour is a token from globals.css, and every shared part (the card,
// the field, the buttons, the state, the alert) is its rv- class. What is
// here is only what is the ledger's own.
const ST_CSS = `
/* The page is the screen under the bar and never scrolls: the card takes
   what is left of the column, and only its rows scroll, inside it. */
.st-root{position:relative;height:100%;overflow:hidden;display:flex;flex-direction:column;}
/* 760px where the other tools are 688. A row here is three things side by
   side — the job, the id, its price — and at 688 the field is left about
   300px, which cuts a pinned id ("…:nitro@google-vertex/europe") and the
   line under it short. The extra 72px all goes to the field. */
.st{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;width:100%;max-width:760px;margin:0 auto;padding:clamp(14px,3vh,28px) 24px 16px;}
.st > *{flex:none;}
.st > .st-cardwrap{flex:0 1 auto;min-height:0;display:flex;flex-direction:column;}
.st-card{flex:0 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;}
/* No scrollbar (one coming and going shifts the rows sideways); the foot of
   the rows fades out while there is more below, as Referrals' card does. */
.st-body{flex:0 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;}
.st-body::-webkit-scrollbar{display:none;}
.st-body.is-more{-webkit-mask-image:linear-gradient(#000 calc(100% - 32px),transparent);mask-image:linear-gradient(#000 calc(100% - 32px),transparent);}

/* ---- the ledger ---- */
.st-group{padding:0 0 6px;}
.st-group + .st-group{border-top:1px solid var(--rv-divider);}
.st-group__head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:14px 24px 2px;}
.st-group__title{margin:0;font-size:13px;font-weight:600;color:var(--rv-ink-3);}
.st-group__note{font-size:12.5px;color:var(--rv-ink-2);text-align:right;}
.st-row{display:grid;grid-template-columns:186px minmax(0,1fr) 78px;gap:0 18px;align-items:start;padding:8px 24px;}
.st-row__name{position:relative;min-width:0;padding-top:1px;}
.st-row--child .st-row__name{padding-left:17px;}
.st-row--child .st-row__name::before{content:'';position:absolute;left:1px;top:4px;width:9px;height:9px;border-left:1.5px solid var(--rv-line);border-bottom:1.5px solid var(--rv-line);border-radius:0 0 0 4px;}
.st-row__title{display:flex;align-items:center;gap:7px;font-size:15px;font-weight:600;line-height:1.25;color:var(--rv-ink);cursor:default;}
.st-row__dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--rv-accent);}
.st-row__job{display:block;margin-top:2px;font-size:12.5px;line-height:1.4;color:var(--rv-ink-2);}
.st-row__field{min-width:0;}
/* The line under a field: what a blank one resolves to, or what a set one
   measured — or, once it has been left, what is wrong with it. */
.st-note{display:flex;align-items:flex-start;gap:6px;margin:5px 2px 0;font-size:12.5px;line-height:1.4;color:var(--rv-ink-2);}
.st-note > span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.st-note b{font-weight:600;color:var(--rv-ink);}
.st-note--warn{color:var(--rv-warn-ink);font-weight:550;}
.st-note--warn > span{white-space:normal;}
.st-note svg,.st-row .rv-err svg{flex:none;margin-top:2px;}
.st-row .rv-err{margin:5px 2px 0;}
.st-fix{padding:0;border:none;border-radius:4px;background:none;font:inherit;font-weight:600;color:var(--rv-accent);cursor:pointer;overflow-wrap:anywhere;text-align:left;}
.st-fix:hover{color:var(--rv-accent-hi);text-decoration:underline;text-underline-offset:3px;}
.st-fix:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}
.st-row__rate{display:flex;flex-direction:column;align-items:flex-end;padding-top:3px;font-size:13px;line-height:1.35;color:var(--rv-ink);font-variant-numeric:tabular-nums;white-space:nowrap;}
.st-row__rate.is-inherited{color:var(--rv-ink-2);}
.st-row__rate small{font-size:12px;color:var(--rv-ink-2);}

/* ---- the field: the shared filled field, with room for its end button ---- */
.st-fieldwrap{position:relative;}
.st-field{height:40px;padding-right:40px;font-size:14.5px;}
.st-clear{position:absolute;right:6px;top:6px;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:50%;
  background:transparent;color:var(--rv-ink-3);cursor:pointer;transition:background-color .15s ease,color .15s ease;}
.st-clear:hover{background:rgba(60,70,80,.1);color:var(--rv-ink);}
.st-clear:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.st-chev{position:absolute;right:13px;top:12px;display:flex;color:var(--rv-ink-3);pointer-events:none;}

/* ---- the list: the menus' popover surface, hung under the field ---- */
.st-pop{position:fixed;z-index:50;display:flex;flex-direction:column;padding:6px;background:#fff;border-radius:16px;
  box-shadow:0 0 0 1px rgba(33,43,50,.06),var(--rv-sh-pop);transform-origin:top center;animation:stPop .18s cubic-bezier(.2,.8,.3,1) both;}
.st-pop.is-up{transform-origin:bottom center;}
@keyframes stPop{from{opacity:0;transform:translateY(-4px) scale(.98);}to{opacity:1;transform:none;}}
.st-list{flex:1 1 auto;min-height:0;margin:0;padding:0;list-style:none;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(76,98,114,.25) transparent;}
.st-opt{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:11px;cursor:pointer;}
.st-opt.is-cursor{background:var(--rv-surface-2);}
.st-opt__main{flex:1;min-width:0;}
.st-opt__id{display:block;font-size:14px;font-weight:500;line-height:1.35;color:var(--rv-ink);overflow-wrap:anywhere;}
.st-opt.is-current .st-opt__id{color:var(--rv-accent);font-weight:600;}
.st-opt__meta{display:block;margin-top:1px;font-size:12.5px;line-height:1.35;color:var(--rv-ink-2);overflow-wrap:anywhere;}
.st-opt__price{flex:none;font-size:12.5px;color:var(--rv-ink-2);font-variant-numeric:tabular-nums;white-space:nowrap;}
.st-opt__tick{flex:none;display:flex;color:var(--rv-accent);}
.st-pop__none{margin:0;padding:10px 12px;font-size:13.5px;line-height:1.45;color:var(--rv-ink-2);overflow-wrap:anywhere;}

/* ---- loading ---- */
.st-skelrow{display:grid;grid-template-columns:186px minmax(0,1fr) 78px;gap:0 18px;align-items:center;padding:14px 24px;}
.st-skelrow + .st-skelrow{border-top:1px solid var(--rv-divider);}
.st-skelrow__field{height:40px;border-radius:11px;}

/* ---- the save bar: the card's foot, always in view ---- */
.st-bar{flex:none;padding:12px 16px 12px 24px;border-top:1px solid var(--rv-divider);background:#fff;}
.st-bar .rv-alert{margin:0 0 10px;}
.st-bar .rv-alert strong{font-weight:700;}
.st-bar__row{display:flex;align-items:center;gap:12px;}
.st-bar__msg{flex:1;min-width:0;margin:0;font-size:13.5px;line-height:1.4;color:var(--rv-ink-2);}
.st-bar__say{display:flex;align-items:center;gap:8px;min-width:0;}
.st-bar__say svg{flex:none;}
.st-bar__say.is-dirty{color:var(--rv-ink);font-weight:600;}
.st-bar__say.is-bad{color:var(--rv-danger-ink);font-weight:600;}
.st-bar__say.is-saved{color:var(--rv-green);font-weight:600;}
.st-bar__dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--rv-accent);}
.st-bar__acts{flex:none;display:flex;align-items:center;gap:6px;}
/* Not ready to save: looks disabled, but still takes the click — the click
   is what goes to the field that needs fixing. */
.rv-btn--primary.is-blocked,.rv-btn--primary.is-blocked:hover{background:rgba(60,70,80,.14);color:var(--rv-ink-4);}
.rv-btn--primary.is-busy:disabled{background:var(--rv-accent);color:#fff;opacity:.85;}
.st-spin{display:flex;animation:stSpin .9s linear infinite;}
@keyframes stSpin{to{transform:rotate(360deg);}}

/* ---- this computer, under the card ---- */
.st-local{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:12px;padding:0 8px;font-size:13.5px;line-height:1.4;color:var(--rv-ink-2);}
.st-local strong{font-weight:600;color:var(--rv-ink);}
.st-local__sub::before{content:' · ';}
.st-switch{position:relative;flex:none;width:44px;height:26px;padding:0;border:none;border-radius:999px;background:var(--rv-ink-4);cursor:pointer;transition:background-color .18s ease;}
.st-switch::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s cubic-bezier(.22,1,.36,1);}
.st-switch[aria-checked="true"]{background:var(--rv-accent);}
.st-switch[aria-checked="true"]::after{transform:translateX(18px);}
.st-switch:disabled{opacity:.5;cursor:default;}
.st-switch:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}

@media (max-width:700px){
  .st{padding:12px 16px 12px;}
  .st-group__head{flex-direction:column;align-items:flex-start;gap:1px;padding:12px 18px 2px;}
  .st-group__note{text-align:left;}
  .st-row{grid-template-columns:minmax(0,1fr);gap:7px;padding:10px 18px;}
  .st-row--child .st-row__name{padding-left:0;}
  .st-row--child .st-row__name::before{display:none;}
  .st-row__rate{flex-direction:row;justify-content:flex-start;gap:10px;padding-top:0;}
  .st-row__rate:empty{display:none;}
  .st-skelrow{grid-template-columns:minmax(0,1fr);gap:10px;padding:12px 18px;}
  .st-field{font-size:16px;}
  /* A thumb's worth of target round the small clear button. */
  .st-clear::after{content:'';position:absolute;inset:-8px;}
  .st-bar{padding:10px 12px 10px 18px;}
  .st-save__more{display:none;}
  /* Room for the bar's message: Discard only appears once there is
     something to discard. */
  .st-bar__acts .rv-btn--plain:disabled{display:none;}
  .st-local{justify-content:space-between;text-align:left;margin-top:10px;}
  .st-local__text strong{display:block;}
  .st-local__sub::before{content:none;}
}
@media (prefers-reduced-motion:reduce){
  .st-pop,.st-spin{animation:none !important;}
  .st-switch,.st-switch::after{transition:none;}
}
`;

// One field: the id as text, and the list it searches. A combobox in the
// ARIA sense — focus stays in the box while ↑/↓ move the highlight
// (aria-activedescendant), Enter takes it, Esc closes the list. The list is
// hung from the page body rather than drawn inside the card, because the
// card's rows scroll and would cut it off at the card's edge.
function ModelField({ id, name, value, placeholder, models, index, catalogueName, offerVision, invalid, describedBy, onChange, onPick, onLeave, onAnnounce }) {
  const [open, setOpen] = React.useState(false);
  const [cursor, setCursor] = React.useState(-1);
  const [pos, setPos] = React.useState(null);
  const wrapRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const listId = id + '-list';
  const optId = (i) => id + '-opt-' + i;

  const typed = String(value || '').trim();
  const results = React.useMemo(() => {
    if (!typed) return models.slice(0, LIST_LIMIT);
    return fuzzySearch(index, typed, LIST_LIMIT).map((r) => r.entry.model);
  }, [index, models, typed]);
  // A well-formed id is always offered first, as itself, so Enter keeps what
  // was typed — whether the list has it, or it is a variant or a model newer
  // than the list.
  const options = React.useMemo(() => {
    const ids = results.map((m) => m.id);
    return isModelSlug(typed) ? [typed].concat(ids.filter((x) => x !== typed)) : ids;
  }, [results, typed]);

  // Typing puts the highlight on the best match. An empty field highlights
  // nothing, so Enter in one never picks a model nobody chose.
  React.useEffect(() => { setCursor(typed ? 0 : -1); }, [typed]);

  React.useEffect(() => {
    if (!open || !typed) return;
    const count = results.length;
    onAnnounce(count >= LIST_LIMIT ? 'More than ' + LIST_LIMIT + ' models match' : count ? count + (count === 1 ? ' model matches' : ' models match') : 'No model matches');
  }, [open, typed, results.length, onAnnounce]);

  // Where the list goes: under the field, or over it when the field is near
  // the foot of the screen. Closed if the rows scroll the field out of sight.
  const place = React.useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const scroller = el.closest('.st-body');
    const box = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    if (r.bottom < box.top + 8 || r.top > box.bottom - 8) { setOpen(false); return; }
    const vh = window.innerHeight;
    const below = vh - r.bottom - 16;
    const above = r.top - Math.max(box.top, 0) - 16;
    const up = below < 240 && above > below;
    setPos({
      left: r.left, width: r.width, up,
      top: up ? undefined : r.bottom + 6,
      bottom: up ? vh - r.top + 6 : undefined,
      max: Math.max(140, Math.min(340, up ? above : below)),
    });
  }, []);
  React.useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    place();
    let raf = 0;
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
    window.addEventListener('resize', later);
    window.addEventListener('scroll', later, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', later); window.removeEventListener('scroll', later, true); };
  }, [open, place]);

  React.useEffect(() => {
    if (!open || cursor < 0) return;
    const el = document.getElementById(optId(cursor));
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [open, cursor, pos]); // eslint-disable-line react-hooks/exhaustive-deps

  const take = (pick) => { onPick(pick); setOpen(false); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const count = options.length;
      if (!count) return;
      const down = e.key === 'ArrowDown';
      if (!open) { setOpen(true); if (cursor < 0) setCursor(down ? 0 : count - 1); return; }
      setCursor((c) => (c < 0 ? (down ? 0 : count - 1) : (c + (down ? 1 : -1) + count) % count));
      return;
    }
    if (e.key === 'Enter' && open && cursor >= 0 && options[cursor]) { e.preventDefault(); take(options[cursor]); return; }
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  const expanded = open && options.length > 0;
  return (
    <div ref={wrapRef} className="st-fieldwrap">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={expanded && cursor >= 0 && cursor < options.length ? optId(cursor) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={() => { setOpen(false); onLeave(); }}
        className="rv-field st-field"
      />
      {/* × for the pointer. Out of the tab order, so Tab goes field to field;
          from the keyboard a field is emptied the way any text is. */}
      {typed ? (
        <button type="button" className="st-clear" aria-label={'Clear ' + name} title="Clear" tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(''); if (inputRef.current) inputRef.current.focus(); }}>
          <Svg w={14} sw={2.2}>{Icons.close}</Svg>
        </button>
      ) : (
        <span className="st-chev" aria-hidden="true"><Svg w={15} sw={2}>{Icons.chevronDown}</Svg></span>
      )}
      {open && pos ? createPortal(
        <div className={'st-pop' + (pos.up ? ' is-up' : '')} onMouseDown={(e) => e.preventDefault()}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.max }}>
          {options.length ? (
            <ul id={listId} role="listbox" aria-label={name + ' models'} className="st-list">
              {options.map((oid, i) => {
                // A pinned id is still that model — found by the plain id,
                // with where it will be served from said beside it.
                const m = findModel(models, oid);
                const { providers } = splitProviders(oid);
                const r = rate(m);
                const meta = m
                  ? [m.name && m.name !== oid ? m.name : '', offerVision && m.vision === false ? 'text only' : '', providers.length ? 'only via ' + providers.join(', ') : ''].filter(Boolean).join(' · ')
                  : 'Use as typed. Not in ' + catalogueName;
                return (
                  <li key={oid} id={optId(i)} role="option" aria-selected={i === cursor}
                    className={'st-opt' + (i === cursor ? ' is-cursor' : '') + (oid === typed ? ' is-current' : '')}
                    onClick={() => take(oid)} onMouseMove={() => { if (cursor !== i) setCursor(i); }}>
                    <span className="st-opt__main">
                      <span className="st-opt__id">{oid}</span>
                      {meta ? <span className="st-opt__meta">{meta}</span> : null}
                    </span>
                    {r ? <span className="st-opt__price">{r.free ? 'Free' : r.in + ' / ' + r.out}</span> : null}
                    {oid === typed ? <span className="st-opt__tick" aria-hidden="true"><Svg w={15} sw={2.4}>{Icons.check}</Svg></span> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="st-pop__none">
              {typed ? 'Nothing in ' + catalogueName + ' matches “' + typed + '”.' : 'The list has not loaded.'} Type the id in full, as vendor/model.
            </p>
          )}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

// The price column: what the model the row resolves to charges, per million
// tokens in and out. Nothing at all when that is not known — a column of
// "price not published" said the same nothing seven times.
function Price({ model, inherited }) {
  const r = rate(model);
  const cls = 'st-row__rate' + (inherited ? ' is-inherited' : '');
  if (!r) return <div className={cls} />;
  if (r.free) return <div className={cls}>Free</div>;
  return (
    <div className={cls} title="OpenRouter’s list price, per million tokens">
      <span>{r.in} <small>in</small></span>
      <span>{r.out} <small>out</small></span>
      <span className="rv-sr">, per million tokens</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true">
      {['58%', '44%', '66%', '52%', '62%', '48%'].map((w, i) => (
        <div key={i} className="st-skelrow">
          <div>
            <span className="rv-skel" style={{ width: w }} />
            <span className="rv-skel" style={{ width: '82%', height: 9, marginTop: 9 }} />
          </div>
          <span className="rv-skel st-skelrow__field" />
        </div>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [setting, setSetting] = React.useState(null);
  const [draft, setDraft] = React.useState(() => storedOf(null));
  // Fields that have been left (or that a save tried to send): only these
  // show what is wrong with them, so nobody is told off mid-word.
  const [touched, setTouched] = React.useState({});
  const [loadError, setLoadError] = React.useState('');
  const [attempt, setAttempt] = React.useState(0);
  const [models, setModels] = React.useState([]);
  const [catalogue, setCatalogue] = React.useState('loading');
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [justSaved, setJustSaved] = React.useState(false);
  const [announce, setAnnounce] = React.useState('');
  const [more, setMore] = React.useState(false);
  const bodyRef = React.useRef(null);
  // Whether questions asked AT THIS COMPUTER are written to the question log.
  // Not a practice setting and not saved on the server: it belongs to the
  // machine it is set at, so switching it off here leaves the front desk
  // logging exactly as it was. Starts null so the switch does not flash the
  // wrong way round before the cookie has been read.
  const [logging, setLogging] = React.useState(null);

  React.useEffect(() => {
    const cookie = document.cookie.split('; ').find((row) => row.startsWith(NO_LOG_COOKIE + '='));
    const fromCookie = cookie ? decodeURIComponent(cookie.slice(NO_LOG_COOKIE.length + 1)) : '';
    let fromStore = '';
    try { fromStore = window.localStorage.getItem(NO_LOG_STORE_KEY) || ''; } catch (e) { /* private mode */ }
    // Either one saying "off" is enough: clearing cookies must not quietly turn
    // the recording back on for somebody who switched it off.
    const off = ['1', 'true', 'off'].includes(String(fromCookie || fromStore).trim().toLowerCase());
    setLogging(!off);
  }, []);

  const apply = React.useCallback((d) => { setSetting(d); setDraft(storedOf(d)); setTouched({}); }, []);

  // The settings, and — beside them, and allowed to fail on its own — the
  // catalogue the fields search. Without it a field still takes a typed id;
  // it just cannot say whether OpenRouter lists it. Reload asks for both.
  React.useEffect(() => {
    let live = true;
    setLoadError('');
    fetch('/api/settings', { cache: 'no-store' })
      .then(readJson)
      .then((d) => { if (live) apply(d); })
      .catch((e) => { if (live) setLoadError(String((e && e.message) || 'No answer from the server.')); });
    fetch('/api/settings/models')
      .then(readJson)
      .then((d) => { if (!live) return; setModels(Array.isArray(d.models) ? d.models : []); setCatalogue('ready'); })
      .catch(() => { if (live) setCatalogue((c) => (c === 'ready' ? c : 'failed')); });
    return () => { live = false; };
  }, [attempt, apply]);

  // The directory's fuzzy engine, over the model catalogue: the id carries the
  // vendor, so "anthropic", "sonnet" and "gemini flash" all find something.
  const index = React.useMemo(
    () => buildIndex(models.map((m) => ({ label: m.name, aliases: [m.id, m.id.replace(/[/:-]/g, ' ')], model: m }))),
    [models],
  );
  // The answer check's own list: decision models, which the chat catalogue
  // above does not include. Sent by the server with the settings.
  const checkModels = React.useMemo(() => (setting && setting.checkModels) || [], [setting]);
  const checkIndex = React.useMemo(
    () => buildIndex(checkModels.map((m) => ({ label: m.name, aliases: [m.id, m.id.replace(/[/:-]/g, ' ')], model: m }))),
    [checkModels],
  );
  // Priced from the catalogue, or — for the decision models it does not list —
  // from the rates the server sent with them.
  const priced = React.useMemo(() => models.concat(checkModels), [models, checkModels]);

  // Written to both places the machine remembers things, for a year, the same
  // way the machine id is held (lib/audit/client.js).
  function setLoggingHere(on) {
    const value = on ? '' : '1';
    const year = 365 * 24 * 60 * 60;
    document.cookie = NO_LOG_COOKIE + '=' + value + '; Max-Age=' + (on ? 0 : year) + '; Path=/; SameSite=Lax';
    try {
      if (on) window.localStorage.removeItem(NO_LOG_STORE_KEY);
      else window.localStorage.setItem(NO_LOG_STORE_KEY, '1');
    } catch (e) { /* private mode — the cookie still carries it */ }
    setLogging(on);
  }

  const saved = React.useMemo(() => (setting ? storedOf(setting) : null), [setting]);
  const val = (k) => String(draft[k] || '').trim();
  const changed = saved ? ORDER.filter((k) => val(k) !== saved[k]) : [];
  const dirty = changed.length > 0;

  // What is wrong with a field, in words — the same rule the save uses
  // (lib/model-id.mjs), plus the one thing that rule cannot know: Reasoning is
  // the one row that cannot be blank, because the blank rows fall back to it.
  const problem = (k) => (k === 'reasoning' && !val(k)
    ? 'Reasoning needs a model: the blank rows fall back to it.'
    : modelIdProblem(val(k)));
  const invalid = ORDER.filter((k) => problem(k));
  const shownInvalid = invalid.filter((k) => touched[k]);
  const blocked = invalid.length > 0;

  // What each role resolves to. AccurX routing and Super speed inherit from
  // FAST, not from the model above — see resolveRoles in lib/settings.js — and
  // the ledger groups them under it. A row that holds something that is not an
  // id yet resolves to nothing, so no price or caption is drawn from it.
  const own = (k, fallback) => { const v = val(k); if (!v) return fallback; return modelIdProblem(v) ? '' : v; };
  const reasoningModel = own('reasoning', '');
  const fastModel = own('fast', reasoningModel);
  const resolved = {
    reasoning: reasoningModel,
    fast: fastModel,
    web: own('web', reasoningModel),
    accurx: own('accurx', fastModel),
    superSpeed: own('superSpeed', fastModel),
    // Images and Answer check fall back to defaults of their own rather than
    // to any row above. The defaults come from the server, so an empty box
    // shows what it actually resolves to.
    images: own('images', setting ? setting.defaultImagesModel : ''),
    check: own('check', setting ? setting.defaultCheckModel : ''),
  };

  // Well-formed, but is it a model OpenRouter serves? Warned about, never
  // refused: a model newer than the list, or one served under a variant the
  // list does not carry, is real. Images also says when a model cannot see.
  const warning = (k) => {
    const v = val(k);
    if (!v || problem(k)) return '';
    const list = k === 'check' ? checkModels : models;
    if (!list.length || (k !== 'check' && catalogue !== 'ready')) return '';
    const hit = findModel(list, v);
    if (!hit) {
      const lower = findModel(list, v.toLowerCase());
      if (lower) return 'OpenRouter writes this id in lower case: ' + lower.id + '.';
      return k === 'check'
        ? 'Not one of the decision models offered here — check the spelling.'
        : 'Not in OpenRouter’s list — check the spelling.';
    }
    if (k === 'images' && hit.vision === false) return 'Text only: this model cannot read the pictures this row is for.';
    return '';
  };

  // The line under a field when there is nothing wrong with it. Blank: where
  // it falls back to (the field itself shows the model, greyed). Set: what
  // this role measured on that model, from the last questions asked.
  const measured = (setting && setting.usage) || { byRole: {} };
  const caption = (row) => {
    const k = row.key;
    const v = val(k);
    if (!v) {
      if (k === 'reasoning') return { node: 'Needs a model: the blank rows fall back to it.' };
      if (row.from) return { title: resolved[k], node: <>Blank, so it uses <b>{ROLE_NAME[row.from]}</b></> };
      return { title: resolved[k], node: <>Blank, so it uses <b>its own default</b></> };
    }
    if (problem(k)) return { node: 'Pick a model from the list, or type the id in full.' };
    const u = ((measured.byRole || {})[k] || {})[resolved[k]];
    const text = u ? n(u.inputTokens) + ' in / ' + n(u.outputTokens) + ' out tokens a question' : 'Not measured on this model yet';
    return { title: text, node: text };
  };

  const placeholder = (k) => {
    if (k === 'reasoning') return 'vendor/model';
    if (k === 'fast' || k === 'web') return resolved.reasoning || 'Same as Reasoning';
    if (k === 'accurx' || k === 'superSpeed') return resolved.fast || 'Same as Fast';
    if (k === 'images') return (setting && setting.defaultImagesModel) || 'vendor/model';
    return (setting && setting.defaultCheckModel) || 'vendor/model';
  };

  const edit = (k, v) => { setDraft((d) => ({ ...d, [k]: v })); setSaveError(''); setJustSaved(false); };
  const leave = (k) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));

  async function save() {
    if (!saved || !dirty || saving) return;
    // Not sent: the server would refuse it. Show every reason, and go to the
    // first field that has one.
    if (invalid.length) {
      setTouched((t) => ({ ...t, ...Object.fromEntries(invalid.map((k) => [k, true])) }));
      const el = document.getElementById(fieldId(invalid[0]));
      if (el) el.focus();
      return;
    }
    // Only what changed: two computers changing two different rows must not
    // put each other's back.
    const body = {};
    if (changed.includes('reasoning')) body.model = val('reasoning');
    const roles = {};
    for (const k of ROLE_KEYS) if (changed.includes(k)) roles[k] = val(k);
    if (Object.keys(roles).length) body.roles = roles;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      apply(await readJson(res));
      setJustSaved(true);
    } catch (e) {
      setSaveError(String((e && e.message) || 'No answer from the server.'));
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!saved) return;
    setDraft(saved);
    setTouched({});
    setSaveError('');
  }

  React.useEffect(() => {
    if (!justSaved) return undefined;
    const t = setTimeout(() => setJustSaved(false), SAVED_MS);
    return () => clearTimeout(t);
  }, [justSaved]);

  // ⌘S / Ctrl+S saves, as it would in any editor — rather than offering to
  // save the web page.
  const saveRef = React.useRef(save);
  saveRef.current = save;
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && String(e.key).toLowerCase() === 's') { e.preventDefault(); saveRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Closing the tab or reloading with changes unsaved asks first.
  React.useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Whether there are rows below the fold of the card, for the fade.
  const measure = React.useCallback(() => {
    const el = bodyRef.current;
    if (el) setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);
  React.useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure]);

  const loaded = !!setting;
  let msg;
  if (dirty && shownInvalid.length) {
    msg = {
      cls: 'is-bad', icon: <Svg w={15} sw={2.2}>{Icons.alertCircle}</Svg>,
      text: (shownInvalid.length === 1 ? '1 id needs' : shownInvalid.length + ' ids need') + ' fixing before you can save',
    };
  } else if (dirty) {
    msg = { cls: 'is-dirty', icon: <span className="st-bar__dot" aria-hidden="true" />, text: changed.length === 1 ? '1 unsaved change' : changed.length + ' unsaved changes' };
  } else if (justSaved) {
    msg = { cls: 'is-saved', icon: <Svg w={16} sw={2.4}>{Icons.check}</Svg>, text: 'Saved. The next question uses these models.' };
  } else if (catalogue === 'failed') {
    msg = { cls: '', text: 'OpenRouter’s model list did not load, so ids are not checked against it.' };
  } else {
    msg = { cls: '', text: 'Applies everywhere from the next question.' };
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="st-root riva-page-fill">
        <style data-st="1" dangerouslySetInnerHTML={{ __html: ST_CSS }} />
        <AppHeader subtitle="Settings" />

        <main className="st">
          <h1 className="rv-sr">Settings: which model runs which job</h1>

          <motion.div className="st-cardwrap" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.07, ease: EASE }}>
            <section className="rv-card st-card" aria-label="Models">
              <div ref={bodyRef} className={'st-body' + (more ? ' is-more' : '')} onScroll={measure}>
                <div>
                  {loaded ? GROUPS.map((g, gi) => (
                    <motion.div key={g.title} className="st-group" role="group" aria-labelledby={'st-group-' + gi}
                      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.14 + gi * 0.07, ease: EASE }}>
                      <div className="st-group__head">
                        <h2 id={'st-group-' + gi} className="st-group__title">{g.title}</h2>
                        <span className="st-group__note">{g.note}</span>
                      </div>
                      {g.rows.map((row) => {
                        const k = row.key;
                        const noteId = fieldId(k) + '-note';
                        const bad = !!touched[k] && !!problem(k);
                        const warn = !bad && (touched[k] || !changed.includes(k)) ? warning(k) : '';
                        const cap = caption(row);
                        const isCheck = k === 'check';
                        return (
                          <div key={k} className={'st-row' + (row.child ? ' st-row--child' : '')}>
                            <div className="st-row__name">
                              <label htmlFor={fieldId(k)} className="st-row__title">
                                {row.name}
                                {changed.includes(k) ? (
                                  <>
                                    <motion.span className="st-row__dot" title="Changed, not saved yet" aria-hidden="true"
                                      initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.2, ease: EASE }} />
                                    <span className="rv-sr"> (not saved yet)</span>
                                  </>
                                ) : null}
                              </label>
                              <span className="st-row__job">{row.job}</span>
                            </div>
                            <div className="st-row__field">
                              <ModelField
                                id={fieldId(k)} name={row.name} value={draft[k]} placeholder={placeholder(k)}
                                models={isCheck ? checkModels : models} index={isCheck ? checkIndex : index}
                                catalogueName={isCheck ? 'the decision models' : 'OpenRouter’s list'} offerVision={!isCheck}
                                invalid={bad} describedBy={noteId} onAnnounce={setAnnounce}
                                onChange={(v) => edit(k, v)} onPick={(v) => { edit(k, v); leave(k); }} onLeave={() => leave(k)}
                              />
                              {bad ? (
                                <p id={noteId} className="rv-err">
                                  <Svg w={13} sw={2.4}>{Icons.alertCircle}</Svg>
                                  <span>
                                    {problem(k)}
                                    {/* A cleared Reasoning has one obvious way back. */}
                                    {k === 'reasoning' && !val(k) && saved.reasoning ? (
                                      <> <button type="button" className="st-fix" onClick={() => edit(k, saved.reasoning)}>Put back {saved.reasoning}</button></>
                                    ) : null}
                                  </span>
                                </p>
                              ) : warn ? (
                                <p id={noteId} className="st-note st-note--warn"><Svg w={13} sw={2.2}>{Icons.triangle}</Svg><span>{warn}</span></p>
                              ) : (
                                <p id={noteId} className="st-note" title={cap.title || undefined}><span>{cap.node}</span></p>
                              )}
                            </div>
                            <Price model={resolved[k] ? findModel(priced, resolved[k]) : null} inherited={!val(k)} />
                          </div>
                        );
                      })}
                    </motion.div>
                  )) : loadError ? (
                    <motion.div className="rv-state" role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                      <span className="rv-state__ico is-bad" aria-hidden="true"><Svg w={20} sw={2}>{Icons.alertCircle}</Svg></span>
                      <p className="rv-state__title">The settings could not be loaded.</p>
                      <p className="rv-state__text">
                        Reload in a moment. The server said: {loadError.replace(/^Could not read the settings:\s*/i, '')}
                      </p>
                      <div className="rv-state__acts">
                        <button type="button" className="rv-btn rv-btn--quiet" onClick={() => setAttempt((a) => a + 1)}>
                          <Svg w={15} sw={2.2}>{Icons.refresh}</Svg>Reload
                        </button>
                      </div>
                    </motion.div>
                  ) : <Skeleton />}
                </div>
              </div>

              {/* The save bar: the card's foot, which wakes up when something
                  changed. A failed save says so above it and keeps the edits. */}
              {loaded ? (
                <div className="st-bar">
                  <AnimatePresence initial={false}>
                    {saveError ? (
                      <motion.div key="err" role="alert" style={{ overflow: 'hidden' }}
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: EASE }}>
                        <div className="rv-alert"><strong>Nothing was saved.</strong> {saveError} Your changes are still here, so try again.</div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  <div className="st-bar__row">
                    {/* One kind of message hands over to the next with a fade; a
                        count going up within a kind just changes. */}
                    <p className="st-bar__msg" role="status">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span key={msg.cls || 'idle'} className={'st-bar__say' + (msg.cls ? ' ' + msg.cls : '')}
                          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: EASE }}>
                          {msg.icon}<span>{msg.text}</span>
                        </motion.span>
                      </AnimatePresence>
                    </p>
                    <div className="st-bar__acts">
                      <button type="button" className="rv-btn rv-btn--plain" disabled={!dirty || saving} onClick={discard}>Discard</button>
                      <button type="button"
                        className={'rv-btn rv-btn--primary' + (blocked && !saving ? ' is-blocked' : '') + (saving ? ' is-busy' : '')}
                        disabled={!dirty || saving} aria-disabled={blocked || undefined} onClick={save}>
                        {saving
                          ? <><span className="st-spin" aria-hidden="true"><Svg w={15} sw={2.4}>{Icons.spinner}</Svg></span>Saving…</>
                          : <span>Save<span className="st-save__more"> changes</span></span>}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </motion.div>

          {/* THIS COMPUTER, NOT THE PRACTICE. Everything in the card is saved
              on the server and applies everywhere; this is a cookie on the
              machine it is set at, takes effect on the next question, and
              needs no Save — which is why it sits outside the card. */}
          <motion.div className="st-local" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.3 }}>
            <span className="st-local__text">
              <strong id="st-local-label">Log questions asked on this computer</strong>
              <span id="st-local-sub" className="st-local__sub">
                {logging === false ? 'Off here; other computers are unaffected' : 'For the statistics; this computer only'}
              </span>
            </span>
            <button type="button" role="switch" className="st-switch" aria-checked={logging !== false}
              aria-labelledby="st-local-label" aria-describedby="st-local-sub" disabled={logging === null}
              onClick={() => setLoggingHere(logging === false)} />
          </motion.div>
        </main>

        <span role="status" className="rv-sr">{!loaded && !loadError ? 'Loading the settings' : announce}</span>
      </div>
    </MotionConfig>
  );
}
