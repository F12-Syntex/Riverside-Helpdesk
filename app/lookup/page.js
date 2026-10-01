'use client';

import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { s, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { markRegisterWarm, registerIsWarm } from '../_components/contacts/ContactSearchLoader';
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
 * THE SHAPE: one floating palette, after the 21st.dev "Command Search"
 * component. The box, the list and the keyboard hints are one card, and the
 * row the arrow keys are on is tinted in place.
 * ------------------------------------------------------------------ */

const EXAMPLES = ['Homerton', 'district nurse', 'dentist barnsley', 'E5 9BQ'];
const EASE = [0.2, 0.8, 0.3, 1];

const SEARCH_X = (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="m8.5 8.5 5 5" /><path d="m13.5 8.5-5 5" /></>);
const MAIL = (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>);
const GLOBE = (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" /></>);
const REGISTER = (<><path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z" /><path d="M18 8h2v12a2 2 0 0 1-2 2" /><path d="M8 9h6M8 13h6" /></>);

const LK_CSS = `
/* The same column, heading and field as Ask a question: 820px wide, the
   heading centred above, the box drawn exactly like the composer. */
.lk{flex:1;min-height:0;display:flex;flex-direction:column;gap:16px;width:100%;max-width:820px;margin:0 auto;padding:28px 24px;}
.lk-h1{flex:none;margin:8px 0 6px;text-align:center;font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1.08;}

/* ONE SIZE, ALWAYS. The list never grows, shrinks or moves with what is in
   it: it fills what the page leaves and everything in it scrolls. */
.lk-card{position:relative;flex:1;min-height:280px;display:flex;flex-direction:column;overflow:hidden;background:#fff;border-radius:22px;
  box-shadow:0 0 0 1px #dde4e7,0 2px 4px rgba(33,43,50,.04);}

/* ---- the box: the Ask a question composer ---- */
.lk-box{flex:none;display:flex;align-items:center;gap:4px;height:68px;padding:0 12px 0 22px;
  background:#fff;border:2px solid #94aabb;border-radius:22px;
  box-shadow:0 2px 4px rgba(33,43,50,.05),0 18px 48px rgba(0,48,135,.14);transition:border-color .18s ease,box-shadow .22s ease;}
.lk-box:hover{border-color:#5f8fb9;}
.lk-box:focus-within{border-color:#005eb8;box-shadow:0 0 0 3px rgba(0,94,184,.08),0 4px 10px rgba(33,43,50,.07),0 18px 44px rgba(33,43,50,.16);}
.lk-box__ico{flex:none;display:flex;color:var(--rv-ink-3);transition:color .15s ease;}
.lk-box:focus-within .lk-box__ico{color:var(--rv-accent);}
.lk-input{flex:1;min-width:0;height:100%;border:none !important;background:transparent !important;outline:none !important;box-shadow:none !important;
  font:inherit;font-size:19.5px;padding:0 12px;color:#212b32;}
.lk-input::placeholder{color:#768692;}
.lk-iconbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:none;border-radius:10px;
  background:none;color:var(--rv-ink-3);cursor:pointer;text-decoration:none;transition:background-color .15s ease,color .15s ease,opacity .15s ease;}
.lk-iconbtn:hover{background:#eef2f5;color:var(--rv-ink);}
.lk-iconbtn:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.lk-count{flex:none;margin-right:8px;font-size:12px;font-weight:600;color:#9aa6ae;font-variant-numeric:tabular-nums;}

/* ---- the card's own bar: what is listed, and the way to add to it ---- */
.lk-bar{flex:none;display:flex;align-items:center;gap:10px;padding:12px 14px 10px 20px;border-bottom:1px solid #eef2f4;}
.lk-bar__title{flex:1;min-width:0;font-size:13px;font-weight:650;color:var(--rv-ink-2);}
.lk-bar__title b{color:var(--rv-ink);font-variant-numeric:tabular-nums;}

/* ---- the list ---- */
.lk-body{position:relative;flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 8px 8px;
  scrollbar-width:thin;scrollbar-color:rgba(76,98,114,.25) transparent;}
.lk-group{display:flex;align-items:center;gap:8px;padding:12px 12px 6px;font-size:11.5px;font-weight:650;color:#9aa6ae;letter-spacing:.02em;}
.lk-group__n{font-variant-numeric:tabular-nums;font-weight:600;color:#b5bfc6;}
.lk-tag{padding:2px 7px;border-radius:999px;font-size:10.5px;font-weight:700;background:#fdf6e7;color:#8a5a08;}
.lk-tag--added{background:#e8f4ec;color:#1e6b3a;}
.lk-tag--edited{background:#eef4fa;color:#245e93;}
.lk-list{position:relative;}
.lk-row{position:relative;display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;scroll-margin:8px;cursor:default;}
.lk-row.is-sel{background:#f1f5f9;}
.lk-row__text{flex:1;min-width:0;}
.lk-row__label{display:flex;align-items:center;gap:7px;font-size:15px;font-weight:600;color:var(--rv-ink);line-height:1.35;min-width:0;}
.lk-row__name{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lk-row__sub{display:block;margin-top:1px;font-size:12.5px;color:#8a979f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
a.lk-row__sub{text-decoration:none;}
a.lk-row__sub:hover{color:var(--rv-accent);}
.lk-row__acts{flex:none;display:flex;align-items:center;gap:4px;}
.lk-row .lk-iconbtn--quiet{opacity:0;}
.lk-row:hover .lk-iconbtn--quiet,.lk-row.is-sel .lk-iconbtn--quiet,.lk-iconbtn--quiet:focus-visible{opacity:1;}
.lk-mark{background:rgba(0,94,184,.1);color:var(--rv-accent);border-radius:3px;}

/* ---- the CQC register: one box of its own, apart from the practice's ---- */
.lk-cqc{margin:12px 4px 4px;border-radius:16px;background:#f8fafb;box-shadow:inset 0 0 0 1px #e3e9ed;}
.lk-cqc__head{display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;border:none;background:none;font:inherit;text-align:left;cursor:pointer;border-radius:16px;}
.lk-cqc__head:hover{background:#f1f5f8;}
.lk-cqc__head:focus-visible{outline:2px solid var(--rv-accent);outline-offset:-2px;}
.lk-cqc__ico{flex:none;display:flex;width:30px;height:30px;align-items:center;justify-content:center;border-radius:9px;background:#fff;color:#8a5a08;box-shadow:0 0 0 1px #ece3cf;}
.lk-cqc__title{flex:1;min-width:0;}
.lk-cqc__name{display:block;font-size:14px;font-weight:700;color:var(--rv-ink);}
.lk-cqc__sub{display:block;font-size:12px;color:#8a979f;}
.lk-cqc__chev{flex:none;display:flex;color:#9aa6ae;transition:transform .2s ease;}
.lk-cqc.is-open .lk-cqc__chev{transform:rotate(180deg);}
.lk-cqc__list{padding:0 6px 6px;}
.lk-cqc .lk-row.is-sel{background:#fff;}

/* ---- a number: call it, copy it ---- */
.lk-num{display:inline-flex;align-items:center;height:34px;border-radius:999px;background:#fff;
  box-shadow:0 0 0 1px #dde7ef,0 1px 2px rgba(33,43,50,.05);transition:box-shadow .15s ease;}
.lk-num:hover{box-shadow:0 0 0 1px #a9c6de,0 3px 8px -3px rgba(0,48,135,.2);}
.lk-num__call{display:inline-flex;align-items:center;gap:7px;height:100%;padding:0 6px 0 13px;color:var(--rv-accent);
  font-size:14px;font-weight:650;text-decoration:none;font-variant-numeric:tabular-nums;white-space:nowrap;}
.lk-num__copy{display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;margin-right:3px;border:none;border-radius:999px;
  background:none;color:#9aa6ae;cursor:pointer;transition:background-color .15s ease,color .15s ease;}
.lk-num__copy:hover{background:#eef4fa;color:var(--rv-accent);}
.lk-num__copy.is-done{background:var(--rv-green);color:#fff;}
.lk-num__call:focus-visible,.lk-num__copy:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;border-radius:999px;}

/* ---- skeleton ---- */
.lk-skel{display:block;height:10px;border-radius:999px;background:linear-gradient(90deg,#eef2f4 0%,#f6f8f9 40%,#eef2f4 80%);
  background-size:200% 100%;animation:lk-skel 1.6s linear infinite;}
@keyframes lk-skel{from{background-position:100% 0;}to{background-position:-100% 0;}}

/* ---- a state that is not a list ---- */
.lk-state{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:30px 20px 26px;}
.lk-state__ico{display:flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:14px;background:#f1f5f9;color:#8a979f;margin-bottom:6px;}
.lk-state__title{margin:0;font-size:15.5px;font-weight:650;color:var(--rv-ink);overflow-wrap:anywhere;}
.lk-state__acts{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:12px;}
.lk-btn{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 16px;border-radius:999px;border:none;font:inherit;font-size:14px;
  font-weight:650;cursor:pointer;text-decoration:none;transition:background-color .15s ease,box-shadow .15s ease,transform .12s ease;}
.lk-btn:active{transform:scale(.98);}
.lk-btn:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}
.lk-btn:disabled{opacity:.55;cursor:default;transform:none;}
.lk-btn--sm{height:32px;padding:0 13px;font-size:13px;gap:6px;}
.lk-btn--primary{background:var(--rv-accent);color:#fff;box-shadow:0 1px 2px rgba(0,48,135,.25),inset 0 1px 0 rgba(255,255,255,.16);}
.lk-btn--primary:hover:not(:disabled){background:#0068c9;}
.lk-btn--ghost{background:#f1f5f9;color:var(--rv-ink);}
.lk-btn--ghost:hover:not(:disabled){background:#e6edf2;}
.lk-btn--danger{background:none;color:#b42318;padding:0 10px;}
.lk-btn--danger:hover:not(:disabled){background:#fdecea;}
.lk-btn .riva-kbd{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.3);color:#fff;}

/* ---- the foot ---- */
.lk-foot{flex:none;display:flex;align-items:center;gap:14px;padding:10px 20px;border-top:1px solid #eef2f4;font-size:12px;font-weight:550;color:#9aa6ae;}
.lk-foot span{display:inline-flex;align-items:center;gap:5px;}

/* ---- adding or changing a contact ---- */
.lk-scrim{position:fixed;inset:0;z-index:70;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px 16px;
  background:rgba(33,43,50,.32);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);overflow-y:auto;}
.lk-form{width:100%;max-width:520px;background:#fff;border-radius:22px;box-shadow:0 30px 80px -20px rgba(33,43,50,.45),0 0 0 1px rgba(33,43,50,.06);}
.lk-form__head{display:flex;align-items:center;gap:10px;padding:18px 18px 4px 22px;}
.lk-form__title{flex:1;margin:0;font-size:19px;font-weight:750;letter-spacing:-.01em;color:var(--rv-ink);}
.lk-form__body{display:flex;flex-direction:column;gap:14px;padding:10px 22px 4px;}
.lk-field{display:flex;flex-direction:column;gap:6px;}
.lk-field__label{font-size:13px;font-weight:650;color:var(--rv-ink-2);}
.lk-field__hint{font-weight:500;color:#9aa6ae;}
.lk-text{width:100%;height:42px;padding:0 12px;border-radius:11px;border:1.5px solid #cdd8df;background:#fff;font:inherit;font-size:15px;color:var(--rv-ink);
  transition:border-color .15s ease,box-shadow .15s ease;}
textarea.lk-text{height:auto;min-height:64px;padding:10px 12px;resize:vertical;line-height:1.4;}
.lk-text:focus{outline:none;border-color:var(--rv-accent);box-shadow:0 0 0 3px rgba(0,94,184,.12);}
.lk-multi{display:flex;flex-direction:column;gap:6px;}
.lk-multi__row{display:flex;gap:6px;}
.lk-multi__row .lk-text{flex:1;min-width:0;}
.lk-add{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:none;border-radius:8px;background:none;
  font:inherit;font-size:13px;font-weight:650;color:var(--rv-accent);cursor:pointer;}
.lk-add:hover{background:#eef4fa;}
.lk-err{margin:0;padding:9px 12px;border-radius:10px;background:#fdecea;color:#912018;font-size:13.5px;font-weight:550;}
.lk-form__foot{display:flex;align-items:center;gap:8px;padding:16px 22px 20px;}
.lk-form__foot .lk-grow{flex:1;}
.lk-from{margin:0;padding:9px 12px;border-radius:10px;background:#fdf6e7;color:#6b4a0c;font-size:13px;line-height:1.4;}

/* ---- the copied toast ---- */
.lk-toast{position:fixed;left:50%;bottom:28px;z-index:80;max-width:calc(100vw - 32px);display:flex;align-items:center;gap:9px;
  padding:9px 16px 9px 13px;border-radius:999px;background:var(--rv-ink);color:#fff;font-size:13.5px;font-weight:600;
  box-shadow:0 12px 32px -8px rgba(33,43,50,.4);}
.lk-toast__ico{flex:none;display:flex;color:#6fd39b;}

@media (max-width:600px){
  .lk{padding:16px;gap:12px;}
  .lk-h1{font-size:30px;margin-top:4px;}
  .lk-box{height:60px;padding-left:16px;}
  .lk-input{font-size:16px;}
  .lk-count,.lk-foot{display:none;}
  .lk-row{flex-wrap:wrap;gap:8px;padding:10px;}
  .lk-row__text{flex:1 1 100%;}
  .lk-row__name{white-space:normal;}
  .lk-row__acts{flex-wrap:wrap;}
  .lk-row .lk-iconbtn--quiet{opacity:1;}
  .lk-scrim{padding:12px;}
  .lk-form__body,.lk-form__foot{padding-left:16px;padding-right:16px;}
}
@media (prefers-reduced-motion:reduce){
  .lk,.lk-skel,.lk-cqc__chev{transition:none !important;animation:none !important;}
}
`;

// Types the examples into the placeholder, one after another, while the box
// is empty — the box's own way of saying what it takes.
function useTypedPlaceholder(words, enabled) {
  const [text, setText] = React.useState('');
  React.useEffect(() => {
    if (!enabled) { setText(''); return undefined; }
    let word = 0;
    let at = 0;
    let deleting = false;
    let timer;
    const tick = () => {
      const w = words[word];
      if (!deleting) {
        at += 1;
        setText(w.slice(0, at));
        if (at === w.length) { deleting = true; timer = setTimeout(tick, 2200); return; }
        timer = setTimeout(tick, 85);
      } else {
        at -= 1;
        setText(w.slice(0, at));
        if (at === 0) { deleting = false; word = (word + 1) % words.length; timer = setTimeout(tick, 500); return; }
        timer = setTimeout(tick, 35);
      }
    };
    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, [words, enabled]);
  return text;
}

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
    parts.push(<mark key={i} className="lk-mark">{label.slice(a, b)}</mark>);
    at = b;
  });
  if (at < label.length) parts.push(label.slice(at));
  return parts;
}

function Skeleton({ rows = 4 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="lk-row">
          <span className="lk-row__text">
            <span className="lk-skel" style={s('height:12px;width:' + ['52%', '40%', '60%', '46%'][i % 4] + ';')} />
            <span className="lk-skel" style={s('margin-top:8px;height:8px;width:' + ['30%', '24%', '34%', '28%'][i % 4] + ';')} />
          </span>
          <span className="lk-skel" style={s('flex:none;width:130px;height:34px;')} />
        </div>
      ))}
    </div>
  );
}

function State({ icon, title, children }) {
  return (
    <motion.div className="lk-state" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}>
      <span className="lk-state__ico" aria-hidden="true"><Svg w={20} sw={2}>{icon}</Svg></span>
      <p className="lk-state__title">{title}</p>
      {children ? <div className="lk-state__acts">{children}</div> : null}
    </motion.div>
  );
}

function PhoneNumber({ phone, onCopied }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { await navigator.clipboard.writeText(phone.display); } catch { /* clipboard unavailable — the number is still on screen */ }
    setCopied(true);
    if (onCopied) onCopied();
    setTimeout(() => setCopied(false), 1400);
  };
  const label = phone.kind === 'fax' ? 'Fax' : phone.label;
  return (
    <span className="lk-num" title={label || undefined}>
      <a href={'tel:' + phone.tel} className="lk-num__call">
        <Svg w={13} sw={2.2}>{Icons.phone}</Svg>{phone.display}
      </a>
      <button type="button" onClick={copy} aria-label={'Copy ' + phone.display} title="Copy"
        className={'lk-num__copy' + (copied ? ' is-done' : '')}>
        <Svg w={13} sw={2.4}>{copied ? Icons.check : Icons.copy}</Svg>
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

// One contact. `onEdit` for the practice's own; `onSave` for a register row,
// which is how a CQC service becomes one of the practice's contacts.
function Row({ entry, query, selected, flash, rowRef, onEdit, onSave }) {
  const sub = subline(entry);
  return (
    <div ref={rowRef} className={'lk-row' + (selected ? ' is-sel' : '')}>
      <span className="lk-row__text">
        <span className="lk-row__label">
          <span className="lk-row__name"><Highlighted label={entry.label} query={query} /></span>
          {entry.origin === 'added' ? <span className="lk-tag lk-tag--added">Added here</span> : null}
          {entry.edited ? <span className="lk-tag lk-tag--edited">Edited</span> : null}
        </span>
        {sub ? <span className="lk-row__sub">{sub}</span> : null}
      </span>
      <span className="lk-row__acts">
        {entry.emails.map((e) => (
          <a key={e} href={'mailto:' + e} className="lk-iconbtn lk-iconbtn--quiet" title={e} aria-label={'Email ' + e}>
            <Svg w={16} sw={2}>{MAIL}</Svg>
          </a>
        ))}
        {entry.website && !entry.phones.length ? (
          <a href={entry.website} target="_blank" rel="noreferrer" className="lk-iconbtn lk-iconbtn--quiet" title="Website" aria-label="Website">
            <Svg w={16} sw={2}>{GLOBE}</Svg>
          </a>
        ) : null}
        {entry.url ? (
          <a href={entry.url} target="_blank" rel="noreferrer" className="lk-iconbtn lk-iconbtn--quiet" title="CQC record" aria-label="CQC record">
            <Svg w={15} sw={2}>{Icons.external}</Svg>
          </a>
        ) : null}
        {onEdit ? (
          <button type="button" className="lk-iconbtn lk-iconbtn--quiet" onClick={onEdit} title="Edit" aria-label={'Edit ' + entry.label}>
            <Svg w={15} sw={2}>{Icons.edit}</Svg>
          </button>
        ) : null}
        {onSave ? (
          <button type="button" className="lk-iconbtn lk-iconbtn--quiet" onClick={onSave} title="Save to the practice's contacts" aria-label={'Save ' + entry.label + ' to contacts'}>
            <Svg w={16} sw={2.2}>{Icons.plus}</Svg>
          </button>
        ) : null}
        {entry.phones.map((p, j) => <PhoneNumber key={j} phone={p} onCopied={flash} />)}
      </span>
    </div>
  );
}

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

const blankDraft = () => ({ id: '', label: '', category: '', phones: [''], emails: [''], aliases: '', keepAliases: [], note: '', from: '' });

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
});

// A register row, as the start of a practice contact.
const draftFromCqc = (entry) => {
  const phones = entry.phones.filter((p) => p.kind !== 'fax').map((p) => p.display);
  return {
    ...blankDraft(),
    label: entry.label,
    phones: phones.length ? phones : [''],
    note: subline(entry),
    from: 'From the CQC register. Check the number before saving — the register holds what the service told CQC, not necessarily the line the practice uses.',
  };
};

function MultiField({ label, hint, values, onChange, placeholder, type = 'text', addLabel }) {
  const set = (i, v) => onChange(values.map((x, j) => (j === i ? v : x)));
  const drop = (i) => onChange(values.length > 1 ? values.filter((_, j) => j !== i) : ['']);
  return (
    <div className="lk-field">
      <span className="lk-field__label">{label} {hint ? <span className="lk-field__hint">{hint}</span> : null}</span>
      <div className="lk-multi">
        {values.map((v, i) => (
          <div key={i} className="lk-multi__row">
            <input className="lk-text" type={type} value={v} placeholder={placeholder} aria-label={label + ' ' + (i + 1)}
              onChange={(e) => set(i, e.target.value)} />
            {values.length > 1 || v ? (
              <button type="button" className="lk-iconbtn" onClick={() => drop(i)} aria-label={'Remove ' + label.toLowerCase() + ' ' + (i + 1)}>
                <Svg w={14} sw={2.4}>{Icons.close}</Svg>
              </button>
            ) : null}
          </div>
        ))}
        <button type="button" className="lk-add" onClick={() => onChange(values.concat(['']))}>
          <Svg w={13} sw={2.6}>{Icons.plus}</Svg>{addLabel}
        </button>
      </div>
    </div>
  );
}

function ContactForm({ draft, categories, saving, error, onChange, onCancel, onSubmit, onRemove }) {
  const set = (key) => (e) => onChange({ ...draft, [key]: e.target.value });
  const first = React.useRef(null);
  React.useEffect(() => { if (first.current) first.current.focus(); }, []);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <motion.div className="lk-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <motion.form className="lk-form" role="dialog" aria-modal="true" aria-labelledby="lk-form-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.25, ease: EASE }}
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <div className="lk-form__head">
          <h2 id="lk-form-title" className="lk-form__title">{draft.id ? 'Edit contact' : 'Add a contact'}</h2>
          <button type="button" className="lk-iconbtn" onClick={onCancel} aria-label="Close"><Svg w={16} sw={2.4}>{Icons.close}</Svg></button>
        </div>
        <div className="lk-form__body">
          {draft.from ? <p className="lk-from">{draft.from}</p> : null}
          <label className="lk-field">
            <span className="lk-field__label">Name</span>
            <input ref={first} className="lk-text" value={draft.label} onChange={set('label')} placeholder="e.g. Homerton Diabetes Centre" required />
          </label>
          <MultiField label="Phone numbers" values={draft.phones} placeholder="020 8510 5555" type="tel" addLabel="Another number"
            onChange={(phones) => onChange({ ...draft, phones })} />
          <MultiField label="Email addresses" hint="(optional)" values={draft.emails} placeholder="team@nhs.net" type="email" addLabel="Another email"
            onChange={(emails) => onChange({ ...draft, emails })} />
          <label className="lk-field">
            <span className="lk-field__label">Category <span className="lk-field__hint">(left blank, it is worked out from the name)</span></span>
            <input className="lk-text" list="lk-categories" value={draft.category} onChange={set('category')} placeholder="Departments and clinics" />
            <datalist id="lk-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="lk-field">
            <span className="lk-field__label">Other names it goes by <span className="lk-field__hint">(comma separated, optional)</span></span>
            <input className="lk-text" value={draft.aliases} onChange={set('aliases')} placeholder="diabetes clinic, DSN team" />
          </label>
          <label className="lk-field">
            <span className="lk-field__label">Note <span className="lk-field__hint">(optional)</span></span>
            <textarea className="lk-text" value={draft.note} onChange={set('note')} placeholder="Opening hours, which option to press, who to ask for…" />
          </label>
          {error ? <p className="lk-err" role="alert">{error}</p> : null}
        </div>
        <div className="lk-form__foot">
          {draft.id && onRemove ? (
            <button type="button" className="lk-btn lk-btn--danger lk-btn--sm" onClick={onRemove} disabled={saving}>
              <Svg w={14} sw={2.2}>{Icons.trash}</Svg>Remove
            </button>
          ) : null}
          <span className="lk-grow" />
          <button type="button" className="lk-btn lk-btn--ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="lk-btn lk-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save contact'}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

export default function Page() {
  const reduce = useReducedMotion();
  const [query, setQuery] = React.useState('');
  const [selIdx, setSelIdx] = React.useState(-1);
  const [flash, setFlash] = React.useState('');
  // The practice's own contacts: every one, held in the page and searched
  // here, as the sheet always was. `editable` is false when the database
  // could not be read and the bundled sheet is standing in.
  const [book, setBook] = React.useState({ entries: [], editable: false, loaded: false });
  const [cqc, setCqc] = React.useState({ entries: [], total: 0, loading: false });
  const [cqcOpen, setCqcOpen] = React.useState(true);
  const [warm, setWarm] = React.useState(registerIsWarm);
  // The web fallback is never automatic — it costs a model call, so it runs
  // only when the reader asks, and only for the query they asked on.
  const [web, setWeb] = React.useState({ for: '', contacts: [], results: [], loading: false, reason: '' });
  const [editor, setEditor] = React.useState(null); // { draft, saving, error }
  const inputRef = React.useRef(null);
  const rowRefs = React.useRef(new Map());

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
  // What the arrow keys move through: the practice's matches, then the
  // register's when its box is open. With nothing typed, the whole list.
  const flat = trimmed
    ? mine.map((e) => ({ key: 'p:' + e.id, entry: e })).concat(cqcOpen ? register.map((e) => ({ key: 'q:' + e.id, entry: e })) : [])
    : groups.flatMap((g) => g.list.map((e) => ({ key: 'p:' + e.id, entry: e })));
  const selKey = selIdx >= 0 && flat[selIdx] ? flat[selIdx].key : '';
  const nothingFound = trimmed.length >= 2 && !cqc.loading && !mine.length && !register.length;
  const webShown = web.for === trimmed && (web.loading || web.contacts.length || web.results.length || web.reason);
  const words = trimmed.split(/\s+/).filter(Boolean);
  const shorter = words.length > 1 ? words.slice(0, -1).join(' ') : '';
  const typed = useTypedPlaceholder(EXAMPLES, !query && !reduce);
  const total = cqc.total ? cqc.total.toLocaleString('en-GB') : '';

  React.useEffect(() => { setSelIdx(trimmed ? 0 : -1); }, [trimmed]);

  const loadBook = React.useCallback(() => (
    fetch('/api/contacts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setBook({ entries: Array.isArray(d.entries) ? d.entries : [], editable: !!d.editable, loaded: true }))
      .catch(() => setBook((b) => ({ ...b, loaded: true })))
  ), []);
  React.useEffect(() => { loadBook(); }, [loadBook]);

  // Debounced, and each reply checked against the query it was for, so a slow
  // answer cannot overwrite a newer one.
  React.useEffect(() => {
    if (trimmed.length < 2) { setCqc((c) => ({ entries: [], total: c.total, loading: false })); return undefined; }
    setCqc((c) => ({ ...c, loading: true }));
    let live = true;
    const timer = setTimeout(() => {
      fetch('/api/cqc?q=' + encodeURIComponent(trimmed), { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { markRegisterWarm(); setWarm(true); if (live) setCqc({ entries: Array.isArray(d.entries) ? d.entries : [], total: d.total || 0, loading: false }); })
        .catch(() => { if (live) setCqc((c) => ({ entries: [], total: c.total, loading: false })); });
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

  const say = (text, ms = 1800) => {
    setFlash(text);
    setTimeout(() => setFlash(''), ms);
  };
  const flashCopied = (label) => say('Copied ' + label, 1600);

  const searchWeb = React.useCallback((q) => {
    if (q.length < 3) return;
    setWeb({ for: q, contacts: [], results: [], loading: true, reason: '' });
    fetch('/api/lookup-web?q=' + encodeURIComponent(q), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setWeb({
        for: q,
        contacts: Array.isArray(d.contacts) ? d.contacts : [],
        results: Array.isArray(d.results) ? d.results : [],
        loading: false,
        reason: d.reason || '',
      }))
      .catch(() => setWeb({ for: q, contacts: [], results: [], loading: false, reason: 'Web search is unavailable.' }));
  }, []);

  const openEditor = (draft) => setEditor({ draft, saving: false, error: '' });
  const closeEditor = React.useCallback(() => setEditor(null), []);

  const submit = async () => {
    if (!editor) return;
    const d = editor.draft;
    const chosen = d.aliases.split(',').map((a) => a.trim()).filter(Boolean);
    const body = {
      id: d.id || undefined,
      label: d.label,
      category: d.category,
      phones: d.phones.map((p) => p.trim()).filter(Boolean),
      emails: d.emails.map((e) => e.trim()).filter(Boolean),
      aliases: (d.keepAliases || []).concat(chosen),
      note: d.note,
    };
    setEditor((ed) => ({ ...ed, saving: true, error: '' }));
    try {
      const r = await fetch('/api/contacts', {
        method: d.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || 'Could not save the contact.');
      await loadBook();
      setEditor(null);
      say((d.id ? 'Saved ' : 'Added ') + out.contact.label);
    } catch (e) {
      setEditor((ed) => (ed ? { ...ed, saving: false, error: String(e.message || e) } : ed));
    }
  };

  const remove = async () => {
    if (!editor || !editor.draft.id) return;
    const d = editor.draft;
    if (!window.confirm('Remove ' + d.label + ' from the practice’s contacts?')) return;
    setEditor((ed) => ({ ...ed, saving: true, error: '' }));
    try {
      const r = await fetch('/api/contacts?id=' + encodeURIComponent(d.id), { method: 'DELETE' });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || 'Could not remove the contact.');
      await loadBook();
      setEditor(null);
      say('Removed ' + d.label);
    } catch (e) {
      setEditor((ed) => (ed ? { ...ed, saving: false, error: String(e.message || e) } : ed));
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setQuery(''); return; }
    if (!flat.length) {
      if (e.key === 'Enter' && nothingFound && web.for !== trimmed) searchWeb(trimmed);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown'
        ? Math.min((selIdx < 0 ? -1 : selIdx) + 1, flat.length - 1)
        : Math.max(selIdx - 1, 0);
      setSelIdx(next);
      const el = rowRefs.current.get(flat[next].key);
      if (el) el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && selIdx >= 0 && selIdx < flat.length) {
      const hit = flat[selIdx].entry;
      const p = hit.phones[0];
      if (p) {
        navigator.clipboard.writeText(p.display).catch(() => {});
        flashCopied(p.display + ' · ' + hit.label);
      }
    }
  };

  const focusBox = () => { if (inputRef.current) inputRef.current.focus(); };
  const clear = () => { setQuery(''); focusBox(); };
  const refFor = (key) => (el) => { if (el) rowRefs.current.set(key, el); else rowRefs.current.delete(key); };
  const canEdit = (entry) => book.editable && !entry.fixed;
  const practiceRow = (entry) => (
    <Row key={'p:' + entry.id} entry={entry} query={trimmed} selected={selKey === 'p:' + entry.id}
      flash={() => flashCopied(entry.label)} rowRef={refFor('p:' + entry.id)}
      onEdit={canEdit(entry) ? () => openEditor(draftOf(entry)) : null} />
  );

  return (
    <div className="riva-page-fill" style={s('height:100vh;overflow:hidden;display:flex;flex-direction:column;background:#f0f4f5;')}>
      <style data-lk="1" dangerouslySetInnerHTML={{ __html: LK_CSS }} />
      <AppHeader subtitle="Contact numbers" />

      <main className="lk">
        <h1 className="lk-h1 riva-hero-h1">Find a <span style={{ color: 'var(--rv-accent)' }}>number</span></h1>

        <div className="lk-box">
          <span className="lk-box__ico" aria-hidden="true"><Svg w={20} sw={2.2}>{Icons.search}</Svg></span>
          <input
            ref={inputRef}
            autoFocus
            className="lk-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={typed ? typed + '|' : 'Name, service, town, postcode…'}
            aria-label="Search the practice's contacts and the CQC register"
          />
          {query ? (
            <button type="button" className="lk-iconbtn" onClick={clear} aria-label="Clear search">
              <Svg w={16} sw={2.4}>{Icons.close}</Svg>
            </button>
          ) : book.entries.length ? <span className="lk-count">{book.entries.length} contacts</span> : null}
        </div>

        <motion.div className="lk-card"
          initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}>

          <div className="lk-bar">
            <span className="lk-bar__title">
              {trimmed
                ? <>The practice’s contacts · <b>{mine.length}</b> {mine.length === 1 ? 'match' : 'matches'}</>
                : <>The practice’s contacts · <b>{book.entries.length}</b></>}
              {book.loaded && !book.editable ? <> <span className="lk-tag">Read-only right now</span></> : null}
            </span>
            <button type="button" className="lk-btn lk-btn--primary lk-btn--sm" disabled={!book.editable}
              onClick={() => openEditor({ ...blankDraft(), label: trimmed && !mine.length ? trimmed : '' })}
              title={book.editable ? 'Add a contact' : 'Contacts cannot be saved while the database is unavailable'}>
              <Svg w={14} sw={2.6}>{Icons.plus}</Svg>Add contact
            </button>
          </div>

          <div className="lk-body">
            {!book.loaded ? <Skeleton /> : null}

            {/* Nothing typed: every contact the practice keeps, by category. */}
            {book.loaded && !trimmed ? groups.map((g) => (
              <section key={g.name} aria-label={g.name}>
                <div className="lk-group">{g.name} <span className="lk-group__n">{g.list.length}</span></div>
                <div className="lk-list">{g.list.map(practiceRow)}</div>
              </section>
            )) : null}

            {/* Typed: the practice's matches first, then the register in its
                own box — nobody here wrote it, so it is never mixed in. */}
            {trimmed && mine.length ? <div className="lk-list">{mine.map(practiceRow)}</div> : null}
            {trimmed.length >= 2 && !mine.length && book.loaded && !nothingFound ? (
              <div className="lk-group">None of the practice’s contacts match</div>
            ) : null}

            {trimmed.length >= 2 && (register.length || cqcSearching) ? (
              <section className={'lk-cqc' + (cqcOpen ? ' is-open' : '')} aria-label="CQC register">
                <button type="button" className="lk-cqc__head" onClick={() => setCqcOpen((o) => !o)} aria-expanded={cqcOpen}>
                  <span className="lk-cqc__ico" aria-hidden="true"><Svg w={16} sw={2}>{REGISTER}</Svg></span>
                  <span className="lk-cqc__title">
                    <span className="lk-cqc__name">CQC register</span>
                    <span className="lk-cqc__sub">
                      {cqcSearching && !register.length
                        ? 'Searching ' + (total || 'every') + ' registered services…'
                        : register.length + (register.length >= 25 ? '+' : '') + ' of ' + (total || 'the') + ' registered services · not the practice’s own list'}
                    </span>
                  </span>
                  <span className="lk-cqc__chev" aria-hidden="true"><Svg w={16} sw={2.2}>{Icons.chevronDown}</Svg></span>
                </button>
                {cqcOpen ? (
                  <div className="lk-cqc__list">
                    {cqcSearching && !register.length && !warm ? <Skeleton rows={2} /> : null}
                    {register.map((entry) => (
                      <Row key={'q:' + entry.id} entry={entry} query={trimmed} selected={selKey === 'q:' + entry.id}
                        flash={() => flashCopied(entry.label)} rowRef={refFor('q:' + entry.id)}
                        onSave={book.editable ? () => openEditor(draftFromCqc(entry)) : null} />
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {nothingFound && !webShown ? (
              <State icon={SEARCH_X} title={'Nothing for “' + trimmed + '” in the practice’s contacts or on the register'}>
                <button type="button" className="lk-btn lk-btn--primary" onClick={() => searchWeb(trimmed)}>
                  <Svg w={15} sw={2.2}>{GLOBE}</Svg>Search the web <Kbd>Enter</Kbd>
                </button>
                {book.editable ? (
                  <button type="button" className="lk-btn lk-btn--ghost" onClick={() => openEditor({ ...blankDraft(), label: trimmed })}>
                    <Svg w={14} sw={2.6}>{Icons.plus}</Svg>Add it as a contact
                  </button>
                ) : null}
                {shorter ? (
                  <button type="button" className="lk-btn lk-btn--ghost" onClick={() => { setQuery(shorter); focusBox(); }}>
                    {shorter}
                  </button>
                ) : null}
              </State>
            ) : null}

            {/* The web, kept visibly apart from both: its own group, marked
                unverified. Numbers first, the pages second. */}
            {webShown ? (
              <section aria-label="From the web">
                <div className="lk-group">From the web <span className="lk-tag">Unverified</span></div>
                {web.loading ? (
                  <div role="status" aria-label="Searching the web"><Skeleton rows={2} /></div>
                ) : (
                  <>
                    {web.contacts.map((c) => (
                      <div key={c.url} className="lk-row">
                        <span className="lk-row__text">
                          <span className="lk-row__label"><span className="lk-row__name">{c.title}</span></span>
                          <a href={c.url} target="_blank" rel="noreferrer" className="lk-row__sub">{c.host || c.url}</a>
                        </span>
                        <span className="lk-row__acts">
                          {c.emails.map((e) => (
                            <a key={e} href={'mailto:' + e} className="lk-iconbtn" title={e} aria-label={'Email ' + e}>
                              <Svg w={16} sw={2}>{MAIL}</Svg>
                            </a>
                          ))}
                          {c.phones.map((p, j) => <PhoneNumber key={j} phone={p} onCopied={() => flashCopied(p.display)} />)}
                        </span>
                      </div>
                    ))}
                    {!web.contacts.length ? (
                      <State icon={SEARCH_X} title={web.reason || 'No number found'}>
                        <a href={'https://www.google.com/search?q=' + encodeURIComponent(trimmed + ' phone number')}
                          target="_blank" rel="noreferrer" className="lk-btn lk-btn--ghost">
                          <Svg w={14} sw={2.2}>{Icons.external}</Svg>Google it
                        </a>
                      </State>
                    ) : null}
                    {web.results.length ? (
                      <>
                        <div className="lk-group">Sources</div>
                        {web.results.map((r) => (
                          <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="lk-row" style={s('text-decoration:none;')}>
                            <span className="lk-row__text">
                              <span className="lk-row__label" style={s('font-size:14px;font-weight:550;')}><span className="lk-row__name">{r.title}</span></span>
                              <span className="lk-row__sub">{r.url}</span>
                            </span>
                            <span className="lk-iconbtn" aria-hidden="true"><Svg w={14} sw={2}>{Icons.external}</Svg></span>
                          </a>
                        ))}
                      </>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}
          </div>

          <div className="lk-foot" aria-hidden="true">
            <span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
            <span><Kbd>Enter</Kbd> copy</span>
            <span><Kbd>Esc</Kbd> clear</span>
          </div>
        </motion.div>
      </main>

      <AnimatePresence>
        {editor ? (
          <ContactForm key="form" draft={editor.draft} categories={categories} saving={editor.saving} error={editor.error}
            onChange={(draft) => setEditor((ed) => ({ ...ed, draft }))} onCancel={closeEditor} onSubmit={submit}
            onRemove={editor.draft.id ? remove : null} />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {flash ? (
          <motion.div key="toast" role="status" className="lk-toast"
            initial={{ opacity: 0, y: 10, x: '-50%', scale: 0.96 }} animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: 6, x: '-50%' }} transition={{ duration: 0.22, ease: EASE }}>
            <span className="lk-toast__ico" aria-hidden="true"><Svg w={15} sw={2.6}>{Icons.check}</Svg></span>
            <span style={s('min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>{flash}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
