'use client';

import React from 'react';
import { s, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import ContactSearchLoader, { markRegisterWarm, registerIsWarm } from '../_components/contacts/ContactSearchLoader';
import { highlightRanges } from '../../lib/lookup/fuzzy';

/* ------------------------------------------------------------------ *
 * Instant lookup — search of the CQC register.
 *
 * Every service registered with the Care Quality Commission in England:
 * hospitals, GP practices, dentists, care and nursing homes, homecare
 * agencies, hospices, clinics. Type a name, a town, a postcode, a service
 * type ("dentist barnsley"), an acronym ("HUH") or a phone number.
 *
 * The register is ~57k rows, far too large to hold on a phone, so it is
 * searched on the server through /api/cqc — the phone sends the query and
 * gets back the top matches. Numbers, addresses and postcodes come verbatim
 * from the published CQC extract and are never authored by a model.
 * ------------------------------------------------------------------ */

// Searches worth showing someone who has never used this before. The register
// answers to more than a name, and nobody discovers that from a placeholder.
const EXAMPLES = ['dentist barnsley', 'Barnsley Hospital', 'S70 2RD', 'care home sheffield'];

// The page's own shapes, in the shell's language: the list is a sheet of
// white paper on the light, each row's kind of service on a tile, the web's
// answers on a pane of glass kept visibly apart from the register, and the
// search a white card at the foot with a beam running round its edge while
// it waits for something to be typed. Controls stay NHS blue whatever the
// theme; only the beam and the loader take the theme's colours.
const LK_CSS = `
.lk-main{flex:1;width:100%;max-width:860px;margin:0 auto;padding:22px 24px 140px;}
@keyframes lk-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}

/* ---- the heading over the list ---- */
.lk-head{display:flex;align-items:center;gap:12px;margin:0 2px 12px;animation:lk-in .45s cubic-bezier(.2,.8,.3,1) both;}
.lk-head__text{flex:1;min-width:0;}
.lk-head__title{display:block;font-size:17px;font-weight:800;letter-spacing:-.02em;color:var(--rv-ink);line-height:1.2;}
.lk-head__meta{display:block;margin-top:1px;font-size:12.5px;font-weight:600;color:var(--rv-ink-3);font-variant-numeric:tabular-nums;}
.lk-head__note{flex:none;max-width:46%;padding:5px 11px;border-radius:999px;font-size:12px;font-weight:600;color:var(--rv-ink-2);
  background:var(--rv-glass);border:1px solid var(--rv-glass-line);-webkit-backdrop-filter:var(--rv-glass-blur);backdrop-filter:var(--rv-glass-blur);}

/* ---- the sheet of results ---- */
.lk-sheet{background:#fff;border-radius:20px;overflow:hidden;
  box-shadow:0 0 0 1px rgba(33,43,50,.06),0 1px 2px rgba(33,43,50,.04),0 4px 12px -4px rgba(33,43,50,.07);
  animation:lk-in .5s .04s cubic-bezier(.2,.8,.3,1) both;}
.lk-row{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:13px 16px;scroll-margin:90px;
  transition:background-color .15s ease;}
.lk-row + .lk-row{border-top:1px solid #edf1f3;}
.lk-row:hover{background:#f8fafc;}
.lk-row.is-sel{background:#f2f7fc;}
.lk-row.is-sel::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:var(--rv-accent);}
.lk-row__main{flex:1 1 260px;min-width:0;display:flex;align-items:flex-start;}
.lk-row__text{flex:1;min-width:0;}
.lk-row__label{display:block;font-size:15.5px;font-weight:650;color:var(--rv-ink);line-height:1.35;overflow-wrap:anywhere;}
.lk-row__note{display:block;margin-top:2px;font-size:13px;line-height:1.45;color:var(--rv-ink-2);}
.lk-row__meta{display:flex;flex-wrap:wrap;align-items:center;gap:5px 10px;margin-top:6px;}
.lk-row__acts{display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex:none;max-width:100%;}
.lk-mark{background:rgba(0,94,184,.12);color:var(--rv-accent-hi);border-radius:3px;padding:0 1px;}
.lk-chip{font-size:11.5px;font-weight:650;border-radius:6px;padding:2px 7px;background:#eef2f4;color:var(--rv-ink-2);}
.lk-meta{font-size:12.5px;color:var(--rv-ink-3);}
.lk-link{font-size:12.5px;font-weight:650;color:var(--rv-accent);text-decoration:none;}
.lk-link:hover{text-decoration:underline;}

/* ---- a number: call it, or copy it ---- */
.lk-phone{display:inline-flex;align-items:stretch;border-radius:11px;overflow:hidden;background:#fff;
  box-shadow:0 0 0 1px #d6e3ee,0 1px 2px rgba(33,43,50,.05);transition:box-shadow .15s ease;}
.lk-phone:hover{box-shadow:0 0 0 1px #aac7e0,0 2px 6px -2px rgba(0,48,135,.18);}
.lk-phone__call{display:inline-flex;align-items:center;gap:7px;padding:6px 11px 6px 10px;color:var(--rv-accent-hi);
  font-size:14.5px;font-weight:650;text-decoration:none;font-variant-numeric:tabular-nums;}
.lk-phone__call:hover{background:#f2f7fc;}
.lk-phone__copy{display:inline-flex;align-items:center;justify-content:center;width:34px;border:none;border-left:1px solid #e3ecf3;
  background:none;color:var(--rv-ink-3);cursor:pointer;font:inherit;transition:background-color .15s ease,color .15s ease;}
.lk-phone__copy:hover{background:#f2f7fc;color:var(--rv-accent);}
.lk-phone__copy.is-done{background:var(--rv-green);border-left-color:var(--rv-green);color:#fff;}
.lk-phone__call:focus-visible,.lk-phone__copy:focus-visible{outline:2px solid var(--rv-accent);outline-offset:-2px;}
.lk-mail{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:11px;background:#f2f6f9;color:var(--rv-accent);
  font-size:13px;font-weight:650;text-decoration:none;word-break:break-all;}
.lk-mail:hover{background:#e8f1f8;}

/* ---- empty states: a title and what to do next, on glass ---- */
.lk-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:34px 26px 30px;border-radius:22px;
  background:var(--rv-glass);border:1px solid var(--rv-glass-line);-webkit-backdrop-filter:var(--rv-glass-blur);backdrop-filter:var(--rv-glass-blur);
  box-shadow:0 0 0 1px rgba(33,43,50,.04),0 4px 12px -4px rgba(33,43,50,.07);animation:lk-in .45s cubic-bezier(.2,.8,.3,1) both;}
.lk-empty__title{margin:0;font-size:18px;font-weight:750;letter-spacing:-.015em;color:var(--rv-ink);line-height:1.3;}
.lk-empty__body{margin:8px auto 0;max-width:52ch;font-size:14.5px;line-height:1.6;color:var(--rv-ink-2);}
.lk-empty__fine{margin:14px auto 0;max-width:52ch;font-size:12.5px;line-height:1.5;color:var(--rv-ink-3);}
.lk-empty__foot{align-self:stretch;margin-top:20px;padding-top:16px;border-top:1px solid rgba(33,43,50,.07);
  display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;}

/* ---- buttons ---- */
.lk-btn{display:inline-flex;align-items:center;gap:9px;height:44px;padding:0 20px;border-radius:13px;border:1px solid transparent;
  font:inherit;font-size:15px;font-weight:650;cursor:pointer;text-decoration:none;transition:background-color .15s ease,border-color .15s ease,color .15s ease,transform .12s ease;}
.lk-btn:active{transform:translateY(1px);}
.lk-btn:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}
.lk-btn--primary{margin-top:20px;background:var(--rv-accent);border-color:#004f9c;color:#fff;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 -1px 0 rgba(0,0,0,.12),0 1px 2px rgba(0,48,135,.25);}
.lk-btn--primary:hover{background:#0068c9;}
.lk-btn--secondary{margin-top:18px;background:rgba(255,255,255,.88);border-color:var(--rv-line);color:var(--rv-ink);
  box-shadow:0 0 0 1px rgba(33,43,50,.02),0 1px 2px rgba(33,43,50,.06);}
.lk-btn--secondary:hover{background:#fff;border-color:#aac7e0;color:var(--rv-accent);}
.lk-hint{margin-top:10px;font-size:12.5px;color:var(--rv-ink-3);display:flex;align-items:center;gap:6px;}
.lk-pill{display:inline-flex;align-items:center;height:32px;padding:0 14px;border-radius:999px;font:inherit;font-size:13.5px;font-weight:650;
  cursor:pointer;color:var(--rv-accent);background:var(--rv-glass);border:1px solid var(--rv-glass-line);
  -webkit-backdrop-filter:var(--rv-glass-blur);backdrop-filter:var(--rv-glass-blur);box-shadow:0 0 0 1px rgba(33,43,50,.05);
  transition:background-color .15s ease,box-shadow .15s ease,transform .15s ease;}
.lk-pill:hover{background:#fff;box-shadow:0 0 0 1px #aac7e0,0 4px 10px -4px rgba(0,48,135,.2);transform:translateY(-1px);}
.lk-pill:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}
.lk-pill--solid{background:#fff;}

/* ---- the opening footnote ---- */
.lk-try{margin:18px 2px 0;display:flex;flex-wrap:wrap;align-items:center;gap:8px;animation:lk-in .5s .1s cubic-bezier(.2,.8,.3,1) both;}
.lk-try__label{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--rv-ink-3);margin-right:2px;}
.lk-keys{flex-basis:100%;margin:6px 0 0;display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px;line-height:1.5;color:var(--rv-ink-3);}

/* ---- skeleton ---- */
.lk-skel{display:block;height:10px;border-radius:999px;background:linear-gradient(90deg,#eef2f4 0%,#f6f8f9 40%,#eef2f4 80%);
  background-size:200% 100%;animation:lk-skel 1.6s linear infinite;}
@keyframes lk-skel{from{background-position:100% 0;}to{background-position:-100% 0;}}

/* ---- from the web: glass, kept apart from the register ---- */
.lk-web{border-radius:22px;padding:14px;background:var(--rv-glass);border:1px solid var(--rv-glass-line);
  -webkit-backdrop-filter:var(--rv-glass-blur);backdrop-filter:var(--rv-glass-blur);
  box-shadow:0 0 0 1px rgba(33,43,50,.04),0 4px 12px -4px rgba(33,43,50,.07);animation:lk-in .45s cubic-bezier(.2,.8,.3,1) both;}
.lk-web__head{display:flex;align-items:center;gap:10px;margin:0 2px 12px;}
.lk-web__title{display:block;font-size:15px;font-weight:750;letter-spacing:-.01em;color:var(--rv-ink);}
.lk-web__sub{display:block;font-size:12.5px;color:var(--rv-ink-3);}
.lk-web__badge{margin-left:auto;flex:none;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;background:#fdf8ef;color:#8a5a08;box-shadow:0 0 0 1px #efdcb7;}
.lk-web__work{display:flex;align-items:center;gap:16px;padding:18px 16px;border-radius:16px;background:#fff;
  box-shadow:0 0 0 1px rgba(33,43,50,.06),0 1px 2px rgba(33,43,50,.04);}
.lk-web__worktitle{display:block;font-size:15px;font-weight:650;}
.lk-web__workdetail{display:block;margin-top:2px;font-size:13px;color:var(--rv-ink-3);}
.lk-web .lk-sheet{border-radius:16px;animation:none;}
.lk-web .lk-sheet + .lk-sheet,.lk-web .lk-sheet + .lk-empty,.lk-web .lk-empty + .lk-sheet{margin-top:12px;}
.lk-web .lk-empty{background:#fff;-webkit-backdrop-filter:none;backdrop-filter:none;border-color:transparent;border-radius:16px;animation:none;}
.lk-src{display:block;margin-top:8px;font-size:12px;color:var(--rv-ink-3);overflow-wrap:anywhere;text-decoration:none;}
.lk-src:hover{color:var(--rv-accent);}
.lk-pages__label{padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--rv-ink-3);
  border-bottom:1px solid #edf1f3;background:#f8fafb;}
.lk-page{display:flex;align-items:center;gap:12px;padding:11px 16px;text-decoration:none;color:inherit;transition:background-color .15s ease;}
.lk-page + .lk-page{border-top:1px solid #edf1f3;}
.lk-page:hover{background:#f8fafc;}
.lk-page__title{display:block;font-size:14.5px;font-weight:650;color:var(--rv-accent);line-height:1.35;overflow-wrap:anywhere;}
.lk-page__ext{flex:none;margin-left:auto;display:flex;color:var(--rv-ink-3);}
.lk-page:hover .lk-page__ext{color:var(--rv-accent);}
.lk-page__url{display:block;margin-top:2px;font-size:12px;color:var(--rv-ink-3);overflow-wrap:anywhere;}

/* ---- the copied toast ---- */
.lk-toast{position:fixed;left:50%;bottom:calc(var(--riva-dock-field-h) + var(--riva-dock-pad-b) + 22px);transform:translateX(-50%);z-index:60;
  max-width:calc(100vw - 32px);display:flex;align-items:center;gap:10px;padding:8px 16px 8px 14px;border-radius:999px;background:#fff;
  font-size:14px;font-weight:650;color:var(--rv-ink);
  box-shadow:0 0 0 1px rgba(33,43,50,.07),0 8px 16px -4px rgba(33,43,50,.1),0 28px 56px -12px rgba(33,43,50,.22);
  animation:lk-toast .28s cubic-bezier(.2,.8,.3,1) both;}
.lk-toast__ico{flex:none;display:flex;color:var(--rv-green);}
@keyframes lk-toast{from{opacity:0;transform:translate(-50%,8px) scale(.97);}to{opacity:1;transform:translateX(-50%);}}

/* ---- the search card ---- */
.lk-search{position:relative;display:flex;align-items:center;height:var(--riva-dock-field-h);background:#fff;border:2px solid #94aabb;
  border-radius:22px;box-shadow:0 2px 4px rgba(33,43,50,.05),0 18px 48px rgba(0,48,135,.14);
  transition:border-color .18s ease,box-shadow .22s ease;}
.lk-search:hover{border-color:#5f8fb9;}
.lk-search:focus-within{border-color:var(--rv-accent);
  box-shadow:0 0 0 3px rgba(0,94,184,.08),0 4px 10px rgba(33,43,50,.07),0 18px 44px rgba(33,43,50,.16);}
.lk-search__ico{flex:none;display:flex;padding-left:20px;color:var(--rv-ink-2);}
.lk-search:focus-within .lk-search__ico{color:var(--rv-accent);}
.lk-input{flex:1;min-width:0;height:100%;border:none !important;background:transparent !important;outline:none !important;box-shadow:none !important;
  font:inherit;font-size:19.5px;padding:0 14px;color:var(--rv-ink);}
.lk-input::placeholder{color:#768692;}
.lk-input:focus,.lk-input:focus-visible{outline:none !important;box-shadow:none !important;}
.lk-search__clear{flex:none;display:flex;align-items:center;justify-content:center;width:38px;height:38px;margin-right:12px;border:none;
  border-radius:12px;background:none;color:var(--rv-ink-2);cursor:pointer;transition:background-color .15s ease,color .15s ease;}
.lk-search__clear:hover{background:#eef2f4;color:var(--rv-ink);}
.lk-search__clear:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.lk-search__keys{flex:none;display:flex;gap:4px;margin-right:18px;}
/* The beam from the opening screen, on this field while nothing is typed. */
.lk-search.is-idle::before{
  content:'';position:absolute;inset:-2px;z-index:1;border-radius:inherit;padding:2px;pointer-events:none;
  background:conic-gradient(from var(--riva-beam),transparent 0deg 230deg,
    color-mix(in srgb,var(--rv-sky-c) 60%,transparent) 280deg,var(--rv-sky-a) 320deg,
    color-mix(in srgb,var(--rv-sky-b) 35%,#005eb8) 352deg,transparent 360deg);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask-composite:exclude;
  animation:rivaBeam 6s linear infinite,rivaBeamIn 1.2s ease both;}

@media (max-width:600px){
  .lk-main{padding:16px 16px 130px;}
  .lk-row{padding:12px 14px;}
  .lk-head__note{display:none;}
  .lk-input{font-size:17px;}
  .lk-search__keys{display:none;}
  .lk-search__ico{padding-left:16px;}
}
@media (prefers-reduced-motion:reduce){
  .lk-head,.lk-sheet,.lk-empty,.lk-web,.lk-try,.lk-toast,.lk-skel{animation:none !important;}
  .lk-search.is-idle::before{display:none;}
}
`;

// A key, drawn as one.
function Kbd({ children }) {
  return <kbd className="riva-kbd">{children}</kbd>;
}

// The states that are not a list of results: nothing typed, nothing found,
// nothing on the web. On a pane of glass, so the page reads as having an
// answer rather than as having broken.
function EmptyState({ title, children }) {
  return (
    <div className="lk-empty">
      <h2 className="lk-empty__title">{title}</h2>
      {children}
    </div>
  );
}

// The shape of a result, shimmering — so the wait reads as "the list is
// coming" rather than "the page is empty".
function Skeleton() {
  return (
    <div aria-hidden="true" className="lk-sheet">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="lk-row">
          <span className="lk-row__main">
            <span style={s('flex:1;min-width:0;padding-top:3px;')}>
              <span className="lk-skel" style={s('height:13px;width:' + ['58%', '44%', '66%', '50%'][i] + ';')} />
              <span className="lk-skel" style={s('margin-top:9px;width:' + ['76%', '62%', '70%', '58%'][i] + ';')} />
            </span>
          </span>
          <span className="lk-skel" style={s('flex:none;width:150px;height:34px;border-radius:11px;')} />
        </div>
      ))}
    </div>
  );
}

// The loader from the working card: four cubes in the theme's colours.
function BoxLoader() {
  return (
    <span className="riva-boxes" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={'riva-box riva-box-' + i}>
          <span className="riva-box-top" />
          <span className="riva-box-left" />
          <span className="riva-box-right" />
        </span>
      ))}
    </span>
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

function PhoneChip({ phone, onCopied }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { await navigator.clipboard.writeText(phone.display); } catch { /* clipboard unavailable — the number is still on screen */ }
    setCopied(true);
    if (onCopied) onCopied();
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <span className="lk-phone">
      <a href={'tel:' + phone.tel} className="lk-phone__call">
        <Svg w={13} sw={2.2}>{Icons.phone}</Svg>{phone.display}
      </a>
      <button type="button" onClick={copy} aria-label={'Copy ' + phone.display} title="Copy number"
        className={'lk-phone__copy' + (copied ? ' is-done' : '')}>
        <Svg w={14} sw={2.2}>{copied ? Icons.check : Icons.copy}</Svg>
      </button>
    </span>
  );
}

function MailChip({ email }) {
  return (
    <a href={'mailto:' + email} className="lk-mail">{email}</a>
  );
}

function EntryRow({ entry, query, selected, flash }) {
  return (
    <div id={'lk-' + entry.id} className={'lk-row' + (selected ? ' is-sel' : '')}>
      <span className="lk-row__main">
        <span className="lk-row__text">
          <span className="lk-row__label">
            <Highlighted label={entry.label} query={query} />
          </span>
          {entry.note ? <span className="lk-row__note">{entry.note}</span> : null}
          {entry.source === 'cqc' ? (
            <span className="lk-row__meta">
              {/* The export packs several service types into one "|"-joined
                  field; two is enough to tell a dentist from a nursing home. */}
              {(entry.types || '').split('|').filter(Boolean).slice(0, 2).map((t, i) => (
                <span key={i} className="lk-chip">{t}</span>
              ))}
              {entry.authority ? <span className="lk-meta">{entry.authority}</span> : null}
              {entry.url ? (
                <a href={entry.url} target="_blank" rel="noreferrer" className="lk-link">CQC record</a>
              ) : null}
              {!entry.phones.length && entry.website ? (
                <a href={entry.website} target="_blank" rel="noreferrer" className="lk-link" style={s('word-break:break-all;')}>Website</a>
              ) : null}
            </span>
          ) : null}
        </span>
      </span>
      <span className="lk-row__acts">
        {entry.phones.map((p, j) => <PhoneChip key={'p' + j} phone={p} onCopied={flash} />)}
        {entry.emails.map((e, j) => <MailChip key={'e' + j} email={e} />)}
      </span>
    </div>
  );
}

export default function Page() {
  const [query, setQuery] = React.useState('');
  const [selIdx, setSelIdx] = React.useState(-1);
  const [flash, setFlash] = React.useState('');
  const [cqc, setCqc] = React.useState({ entries: [], total: 0, loading: false });
  // The rows the page opens on: the practice's hospital shortlist, kept
  // apart from the search results so a search never overwrites it and it
  // is there again the moment the box is cleared.
  const [suggested, setSuggested] = React.useState([]);
  // Whether the register has answered once. Until it has, the server is
  // loading every row, and that is the only wait worth showing a loader for.
  const [warm, setWarm] = React.useState(registerIsWarm);
  // The web fallback is never automatic — it costs a model call, so it runs
  // only when the reader presses Enter, and only for the query they pressed it
  // on. `for` guards against the results of an old query lingering under a new
  // one the reader has since typed.
  const [web, setWeb] = React.useState({ for: '', contacts: [], results: [], loading: false, reason: '' });
  const inputRef = React.useRef(null);

  const trimmed = query.trim();
  // What is on screen. Before anything is typed that is the shortlist, so
  // the arrow keys and Enter-to-copy work on the opening screen exactly as
  // they do on a search.
  const results = trimmed ? cqc.entries : suggested;
  // A single character is never sent to the register, so it must not read as a
  // search in progress — that was a "Searching…" that could never finish.
  const tooShort = trimmed.length === 1;
  const nothingFound = !!trimmed && trimmed.length >= 2 && !cqc.loading && !results.length;
  const searching = trimmed.length >= 2 && !results.length && !nothingFound;
  const webShown = web.for === trimmed && (web.loading || web.contacts.length || web.results.length || web.reason);
  // A search that missed is most often one word too many. Drop the last word
  // and offer that back, so long as something is actually left to search.
  const words = trimmed.split(/\s+/).filter(Boolean);
  const shorter = words.length > 1 ? words.slice(0, -1).join(' ') : '';

  // Keep keyboard selection in range as the list changes under it.
  React.useEffect(() => { setSelIdx(trimmed ? 0 : -1); }, [trimmed]);

  // The register lives on the server — 57k rows is far too much to hold on a
  // phone. Debounce so a fast typist sends one request instead of one per
  // letter, and track which query each response belongs to so a slow reply
  // cannot overwrite a newer one.
  React.useEffect(() => {
    if (trimmed.length < 2) { setCqc((c) => ({ entries: [], total: c.total, loading: false })); return; }
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

  // What the page opens on, and how many services are searchable behind
  // it. One request, once — the same endpoint answers both, and the count
  // rides along on every later search anyway.
  React.useEffect(() => {
    fetch('/api/cqc', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        markRegisterWarm();
        setWarm(true);
        if (Array.isArray(d.entries)) setSuggested(d.entries);
        setCqc((c) => (c.total ? c : { ...c, total: d.total || 0 }));
      })
      .catch(() => setWarm(true));
  }, []);

  const flashCopied = (label) => {
    setFlash(label);
    setTimeout(() => setFlash(''), 1600);
  };

  const onChange = (e) => setQuery(e.target.value);

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

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setQuery(''); return; }
    // Nothing in the register: Enter is what asks the web instead.
    if (!results.length) {
      if (e.key === 'Enter' && nothingFound && web.for !== trimmed) searchWeb(trimmed);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown'
        ? Math.min((selIdx < 0 ? -1 : selIdx) + 1, results.length - 1)
        : Math.max(selIdx - 1, 0);
      setSelIdx(next);
      const el = document.getElementById('lk-' + results[next].id);
      if (el) el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && selIdx >= 0 && selIdx < results.length) {
      const hit = results[selIdx];
      const p = hit.phones[0];
      if (p) {
        navigator.clipboard.writeText(p.display).catch(() => {});
        flashCopied(p.display + ', ' + hit.label);
      }
    }
  };

  const idle = !query;
  const focusBox = () => { if (inputRef.current) inputRef.current.focus(); };

  return (
    <div style={s('min-height:100vh;display:flex;flex-direction:column;')}>
      <style data-lk="1" dangerouslySetInnerHTML={{ __html: LK_CSS }} />
      <AppHeader subtitle="Instant lookup" />

      <main className="lk-main">
        {results.length ? (
          <>
            <div className="lk-head">
              <span className="lk-head__text">
                <span className="lk-head__title">
                  {trimmed
                    ? results.length + ' match' + (results.length === 1 ? '' : 'es')
                    : 'Hospitals and main switchboards'}
                </span>
                {/* On the opening screen, what the box actually searches. The
                    shortlist is fifteen rows; the register behind it is 57,000,
                    and nobody would guess that from the rows on screen. */}
                <span className="lk-head__meta">
                  {trimmed
                    ? 'From the CQC register'
                    : cqc.total
                      ? 'or search all ' + cqc.total.toLocaleString('en-GB') + ' CQC-registered services'
                      : 'The practice’s shortlist'}
                </span>
              </span>
              {/* The server returns the best 25. Saying so beats letting someone
                  scroll to the bottom and assume that is everything there is. */}
              {trimmed && results.length >= 25 ? (
                <span className="lk-head__note">Best 25 — add a town or postcode to narrow it</span>
              ) : null}
            </div>
            <div className="lk-sheet">
              {results.map((e, i) => (
                <EntryRow key={e.id} entry={e} query={trimmed} selected={i === selIdx} flash={() => flashCopied(e.label)} />
              ))}
            </div>
          </>
        ) : null}

        {/* One character is not a search — the register is not even asked. Say
            that, rather than showing a "Searching…" that never finishes. */}
        {tooShort ? (
          <EmptyState title="Keep typing">
            <p className="lk-empty__body">
              Two letters or more, and the register is searched as you type.
            </p>
          </EmptyState>
        ) : null}

        {/* The first load, while the server reads the whole register in. */}
        {idle && !warm ? <ContactSearchLoader verb="Loading" total={cqc.total} /> : null}

        {searching ? (
          <>
            {warm ? null : <div style={s('margin-bottom:12px;')}><ContactSearchLoader total={cqc.total} query={trimmed} /></div>}
            <Skeleton />
          </>
        ) : null}

        {/* Nothing in the register. The register only holds CQC-registered
            services, so a pharmacy, an interpreting line or a number off a
            letter will legitimately miss — say which, offer a way to narrow the
            search, and offer the web rather than a dead end. The web is not
            automatic: it costs a model call, so the reader asks for it. */}
        {nothingFound && !webShown ? (
          <EmptyState title={'No match for “' + trimmed + '”'}>
            <p className="lk-empty__body">
              This searches the CQC register — GP practices, dentists, hospitals, clinics,
              care and nursing homes. Pharmacies, interpreting lines, individual hospital
              departments and personal numbers are not on it.
            </p>

            <button type="button" className="lk-btn lk-btn--primary" onClick={() => searchWeb(trimmed)}>
              Search the web for a number
            </button>
            <div className="lk-hint">or press <Kbd>Enter</Kbd></div>

            {/* A miss is most often too many words. Offering the shorter query
                as a button beats telling someone to retype it. */}
            {shorter ? (
              <div className="lk-empty__foot">
                <span style={s('font-size:13px;color:var(--rv-ink-3);')}>Try a shorter search</span>
                <button type="button" className="lk-pill lk-pill--solid" onClick={() => { setQuery(shorter); focusBox(); }}>
                  {shorter}
                </button>
              </div>
            ) : null}
          </EmptyState>
        ) : null}

        {/* Web results, on glass and kept visibly apart from the register. The
            numbers come first and the pages they were read off come second:
            someone at the desk needs a number, not a reading list. */}
        {webShown ? (
          <section className="lk-web" aria-label="From the web">
            <div className="lk-web__head">
              <span style={s('min-width:0;')}>
                <span className="lk-web__title">From the web</span>
                <span className="lk-web__sub">Not the CQC register — check before using</span>
              </span>
              <span className="lk-web__badge">Unverified</span>
            </div>
            {web.loading ? (
              <div className="lk-web__work" role="status">
                <BoxLoader />
                <span style={s('min-width:0;')}>
                  <span className="lk-web__worktitle"><span className="riva-shimmer">Reading the pages for a number…</span></span>
                  <span className="lk-web__workdetail">This one takes a few seconds — it opens each page and looks.</span>
                </span>
              </div>
            ) : (
              <>
                {web.contacts.length ? (
                  <div className="lk-sheet">
                    {web.contacts.map((c) => (
                      <div key={c.url} className="lk-row" style={s('display:block;')}>
                        <span className="lk-row__label">{c.title}</span>
                        <span className="lk-row__acts" style={s('margin-top:9px;gap:8px;')}>
                          {c.phones.map((p, j) => (
                            <span key={'p' + j} style={s('display:inline-flex;flex-direction:column;gap:3px;')}>
                              <PhoneChip phone={p} onCopied={() => flashCopied(p.display)} />
                              {p.label || p.kind === 'fax' ? (
                                <span style={s('font-size:11.5px;color:var(--rv-ink-3);padding-left:4px;overflow-wrap:anywhere;')}>
                                  {p.kind === 'fax' ? 'Fax' : p.label}
                                </span>
                              ) : null}
                            </span>
                          ))}
                          {c.emails.map((e, j) => <MailChip key={'e' + j} email={e} />)}
                        </span>
                        <a href={c.url} target="_blank" rel="noreferrer" className="lk-src">
                          Read off {c.host || c.url}
                        </a>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* No number, whether or not pages came back. This is the last
                    stop in the app, so it hands over rather than stopping: an
                    open search in a new tab is what a person would do next
                    anyway. It used to appear only when there were no pages at
                    all, so the commonest failure — pages found, none of them
                    publishing a number — ended on a list of dead links. */}
                {!web.contacts.length ? (
                  <EmptyState title="No number found for this one">
                    <p className="lk-empty__body">
                      {web.reason
                        || (web.results.length
                          ? 'The register has no match, and none of the pages found publishes a phone number.'
                          : 'The register has no match, and the web search found nothing relevant.')}
                    </p>
                    <a href={'https://www.google.com/search?q=' + encodeURIComponent(trimmed + ' phone number')}
                      target="_blank" rel="noreferrer" className="lk-btn lk-btn--secondary">
                      <Svg w={16} sw={2.2}>{Icons.external}</Svg>
                      Search Google for &ldquo;{trimmed}&rdquo;
                    </a>
                    <p className="lk-empty__fine">
                      A number found that way is not from the register &mdash; check it before giving it to a patient.
                    </p>
                  </EmptyState>
                ) : null}

                {/* The pages themselves. Evidence when a number was found, and
                    a starting point when none was — either way they are the
                    supporting detail, so they sit below and read quieter. */}
                {web.results.length ? (
                  <div className="lk-sheet">
                    <div className="lk-pages__label">
                      {web.contacts.length ? 'Pages searched' : 'Pages searched — none published a number'}
                    </div>
                    {web.results.map((r) => (
                      <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="lk-page">
                        <span style={s('min-width:0;')}>
                          <span className="lk-page__title">{r.title}</span>
                          <span className="lk-page__url">{r.url}</span>
                        </span>
                        <span className="lk-page__ext" aria-hidden="true"><Svg w={14} sw={2}>{Icons.external}</Svg></span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {/* Under the opening list: what else the box takes, since nobody
            learns "a postcode works too" from a placeholder, and how to
            work the list from the keyboard. A footnote under real rows
            rather than a card standing in place of them. */}
        {!trimmed ? (
          <div className="lk-try">
            <span className="lk-try__label">Try</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="lk-pill" onClick={() => { setQuery(ex); focusBox(); }}>
                {ex}
              </button>
            ))}
            <p className="lk-keys">
              Use <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move through the list and <Kbd>Enter</Kbd> to copy the number.
            </p>
          </div>
        ) : null}
      </main>

      {/* Copied toast. Fixed above the search bar rather than at the top of the
          results: as a block in the flow it pushed the whole list down by its
          own height the moment anyone copied a number. */}
      {flash ? (
        <div role="status" className="lk-toast">
          <span className="lk-toast__ico" aria-hidden="true"><Svg w={15} sw={2.6}>{Icons.check}</Svg></span>
          <span style={s('min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>Copied {flash}</span>
        </div>
      ) : null}

      {/* Docked search — fixed to the viewport bottom so its position and
          width never shift as results grow or shrink. The shared dock
          (globals.css) places it; the card is this page's own, in the
          composer's shape, with the opening screen's beam while it is empty. */}
      <div className="riva-dock">
        <div className="riva-dock-inner">
          <div className={'lk-search' + (idle ? ' is-idle' : '')}>
            <span className="lk-search__ico" aria-hidden="true"><Svg w={22} sw={2.2}>{Icons.search}</Svg></span>
            <input
              ref={inputRef}
              autoFocus
              className="lk-input"
              type="text"
              value={query}
              onChange={onChange}
              onKeyDown={onKeyDown}
              placeholder="Name, town, postcode…"
              aria-label="Search the CQC register"
            />
            {query ? (
              <button type="button" className="lk-search__clear" onClick={() => { setQuery(''); focusBox(); }} aria-label="Clear search">
                <Svg w={18} sw={2.2}>{Icons.close}</Svg>
              </button>
            ) : (
              <span className="lk-search__keys" aria-hidden="true"><Kbd>↑</Kbd><Kbd>↓</Kbd><Kbd>Enter</Kbd></span>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
