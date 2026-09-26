'use client';

import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { s, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { markRegisterWarm, registerIsWarm } from '../_components/contacts/ContactSearchLoader';
import { highlightRanges } from '../../lib/lookup/fuzzy';

/* ------------------------------------------------------------------ *
 * Instant lookup — search of the CQC register.
 *
 * Every service registered with the Care Quality Commission in England,
 * searched on the server through /api/cqc (the register is ~57k rows, far
 * too large to hold on a phone). Numbers, addresses and postcodes come
 * verbatim from the published CQC extract and are never authored by a model.
 *
 * THE SHAPE: one floating palette, after the 21st.dev "Command Search"
 * component. The box, the list and the keyboard hints are one card, and a
 * pill glides behind the row the keyboard or pointer is on. What the box
 * takes is shown by typing examples into its placeholder rather than
 * explained in text, and every state that is not a list is an icon, a line
 * and a button.
 * ------------------------------------------------------------------ */

const EXAMPLES = ['dentist barnsley', 'Barnsley Hospital', 'S70 2RD', 'care home sheffield'];
const PILL = { type: 'spring', stiffness: 420, damping: 36 };
const EASE = [0.2, 0.8, 0.3, 1];

const SEARCH_X = (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="m8.5 8.5 5 5" /><path d="m13.5 8.5-5 5" /></>);
const MAIL = (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>);
const GLOBE = (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" /></>);

const LK_CSS = `
.lk{flex:1;width:100%;max-width:720px;margin:0 auto;padding:24px 20px;}

/* ---- the palette: one floating card ---- */
/* ONE SIZE, ALWAYS. The card never grows, shrinks or moves with what is in
   it: the box and the foot are fixed, and everything between scrolls. */
.lk-card{position:relative;display:flex;flex-direction:column;height:min(680px,calc(100vh - 120px));min-height:360px;overflow:hidden;background:rgba(255,255,255,.94);border-radius:22px;
  -webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4);
  box-shadow:0 0 0 1px rgba(33,43,50,.06),0 2px 4px rgba(33,43,50,.04),0 24px 60px -18px rgba(0,48,135,.22);}

/* ---- the box ---- */
.lk-box{flex:none;display:flex;align-items:center;gap:4px;height:62px;padding:0 10px 0 20px;
  background:rgba(255,255,255,.96);border-radius:22px 22px 0 0;}
.lk-box__ico{flex:none;display:flex;color:var(--rv-ink-3);transition:color .15s ease;}
.lk-box:focus-within .lk-box__ico{color:var(--rv-accent);}
.lk-input{flex:1;min-width:0;height:100%;border:none !important;background:transparent !important;outline:none !important;box-shadow:none !important;
  font:inherit;font-size:18px;font-weight:500;letter-spacing:-.01em;padding:0 12px;color:var(--rv-ink);}
.lk-input::placeholder{color:#9aa6ae;font-weight:400;}
.lk-iconbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:none;border-radius:10px;
  background:none;color:var(--rv-ink-3);cursor:pointer;text-decoration:none;transition:background-color .15s ease,color .15s ease,opacity .15s ease;}
.lk-iconbtn:hover{background:#eef2f5;color:var(--rv-ink);}
.lk-iconbtn:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.lk-count{flex:none;margin-right:8px;font-size:12px;font-weight:600;color:#9aa6ae;font-variant-numeric:tabular-nums;}

/* ---- the list ---- */
.lk-body{position:relative;flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 8px 8px;border-top:1px solid #eef2f4;
  scrollbar-width:thin;scrollbar-color:rgba(76,98,114,.25) transparent;}
.lk-group{display:flex;align-items:center;gap:8px;padding:12px 12px 6px;font-size:11.5px;font-weight:650;color:#9aa6ae;letter-spacing:.02em;}
.lk-tag{padding:2px 7px;border-radius:999px;font-size:10.5px;font-weight:700;background:#fdf6e7;color:#8a5a08;}
.lk-list{position:relative;}
.lk-pill{position:absolute;left:0;right:0;top:0;border-radius:14px;background:#edf3f9;box-shadow:inset 0 0 0 1px #dfe9f3;pointer-events:none;}
.lk-row{position:relative;display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;scroll-margin:8px;cursor:default;}
.lk-row__text{flex:1;min-width:0;}
.lk-row__label{display:block;font-size:15px;font-weight:600;color:var(--rv-ink);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lk-row__sub{display:block;margin-top:1px;font-size:12.5px;color:#8a979f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
a.lk-row__sub{text-decoration:none;}
a.lk-row__sub:hover{color:var(--rv-accent);}
.lk-row__acts{flex:none;display:flex;align-items:center;gap:4px;}
.lk-row .lk-iconbtn--quiet{opacity:0;}
.lk-row:hover .lk-iconbtn--quiet,.lk-row.is-sel .lk-iconbtn--quiet,.lk-iconbtn--quiet:focus-visible{opacity:1;}
.lk-mark{background:rgba(0,94,184,.1);color:var(--rv-accent);border-radius:3px;}

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
.lk-btn--primary{background:var(--rv-accent);color:#fff;box-shadow:0 1px 2px rgba(0,48,135,.25),inset 0 1px 0 rgba(255,255,255,.16);}
.lk-btn--primary:hover{background:#0068c9;}
.lk-btn--ghost{background:#f1f5f9;color:var(--rv-ink);}
.lk-btn--ghost:hover{background:#e6edf2;}
.lk-btn .riva-kbd{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.3);color:#fff;}

/* ---- the foot ---- */
.lk-foot{flex:none;display:flex;align-items:center;gap:14px;padding:10px 20px;border-top:1px solid #eef2f4;font-size:12px;font-weight:550;color:#9aa6ae;}
.lk-foot span{display:inline-flex;align-items:center;gap:5px;}

/* ---- the copied toast ---- */
.lk-toast{position:fixed;left:50%;bottom:28px;z-index:60;max-width:calc(100vw - 32px);display:flex;align-items:center;gap:9px;
  padding:9px 16px 9px 13px;border-radius:999px;background:var(--rv-ink);color:#fff;font-size:13.5px;font-weight:600;
  box-shadow:0 12px 32px -8px rgba(33,43,50,.4);}
.lk-toast__ico{flex:none;display:flex;color:#6fd39b;}

@media (max-width:600px){
  .lk{padding:12px;}
  .lk-card{height:calc(100vh - 100px);}
  .lk-box{height:56px;padding-left:16px;}
  .lk-input{font-size:16px;}
  .lk-count,.lk-foot{display:none;}
  .lk-row{flex-wrap:wrap;gap:8px;padding:10px;}
  .lk-row__text{flex:1 1 100%;}
  .lk-row__label{white-space:normal;}
  .lk-row__acts{flex-wrap:wrap;}
  .lk-row .lk-iconbtn--quiet{opacity:1;}
}
@media (prefers-reduced-motion:reduce){
  .lk,.lk-skel{transition:none !important;animation:none !important;}
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

// One line under the name: the practice's own note, else what the service is
// and where. The CQC export packs several types into one "|"-joined field;
// the first says enough.
function subline(entry) {
  if (entry.note) return entry.note;
  const type = (entry.types || '').split('|').filter(Boolean)[0];
  return [type, entry.authority].filter(Boolean).join(' · ');
}

function Row({ entry, query, selected, onHover, flash, rowRef }) {
  const sub = subline(entry);
  return (
    <div id={'lk-' + entry.id} ref={rowRef} className={'lk-row' + (selected ? ' is-sel' : '')} onMouseEnter={onHover}>
      <span className="lk-row__text">
        <span className="lk-row__label"><Highlighted label={entry.label} query={query} /></span>
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
        {entry.phones.map((p, j) => <PhoneNumber key={j} phone={p} onCopied={flash} />)}
      </span>
    </div>
  );
}

export default function Page() {
  const reduce = useReducedMotion();
  const [query, setQuery] = React.useState('');
  const [selIdx, setSelIdx] = React.useState(-1);
  const [flash, setFlash] = React.useState('');
  const [cqc, setCqc] = React.useState({ entries: [], total: 0, loading: false });
  // The rows the page opens on: the practice's hospital shortlist, kept apart
  // from the search results so it is there again the moment the box is cleared.
  const [suggested, setSuggested] = React.useState([]);
  const [warm, setWarm] = React.useState(registerIsWarm);
  // The web fallback is never automatic — it costs a model call, so it runs
  // only when the reader asks, and only for the query they asked on.
  const [web, setWeb] = React.useState({ for: '', contacts: [], results: [], loading: false, reason: '' });
  const inputRef = React.useRef(null);
  const rowRefs = React.useRef(new Map());
  const [pill, setPill] = React.useState(null);

  const trimmed = query.trim();
  const results = trimmed ? cqc.entries : suggested;
  const tooShort = trimmed.length === 1;
  const nothingFound = trimmed.length >= 2 && !cqc.loading && !results.length;
  const searching = trimmed.length >= 2 && !results.length && !nothingFound;
  const webShown = web.for === trimmed && (web.loading || web.contacts.length || web.results.length || web.reason);
  const words = trimmed.split(/\s+/).filter(Boolean);
  const shorter = words.length > 1 ? words.slice(0, -1).join(' ') : '';
  const typed = useTypedPlaceholder(EXAMPLES, !query && !reduce);
  const total = cqc.total ? cqc.total.toLocaleString('en-GB') : '';

  React.useEffect(() => { setSelIdx(trimmed ? 0 : -1); }, [trimmed]);

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

  // The pill is one element, re-measured from the row it sits behind — the
  // 21st component's approach, which stays right while the list reflows.
  const selId = selIdx >= 0 && results[selIdx] ? results[selIdx].id : null;
  React.useLayoutEffect(() => {
    const row = selId != null ? rowRefs.current.get(selId) : null;
    const next = row ? { y: row.offsetTop, h: row.offsetHeight } : null;
    setPill((prev) => (prev && next && prev.y === next.y && prev.h === next.h ? prev : next));
  }, [selId, results]);

  const flashCopied = (label) => {
    setFlash(label);
    setTimeout(() => setFlash(''), 1600);
  };

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
      const el = rowRefs.current.get(results[next].id);
      if (el) el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && selIdx >= 0 && selIdx < results.length) {
      const hit = results[selIdx];
      const p = hit.phones[0];
      if (p) {
        navigator.clipboard.writeText(p.display).catch(() => {});
        flashCopied(p.display + ' · ' + hit.label);
      }
    }
  };

  const focusBox = () => { if (inputRef.current) inputRef.current.focus(); };
  const clear = () => { setQuery(''); focusBox(); };

  return (
    <div style={s('min-height:100vh;display:flex;flex-direction:column;')}>
      <style data-lk="1" dangerouslySetInnerHTML={{ __html: LK_CSS }} />
      <AppHeader subtitle="Instant lookup" />

      <main className="lk">
        <motion.div className="lk-card"
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: EASE }}>

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
              placeholder={typed ? typed + '|' : 'Name, town, postcode…'}
              aria-label="Search the CQC register"
            />
            {query ? (
              <button type="button" className="lk-iconbtn" onClick={clear} aria-label="Clear search">
                <Svg w={16} sw={2.4}>{Icons.close}</Svg>
              </button>
            ) : total ? <span className="lk-count">{total}</span> : null}
          </div>

            <div className="lk-body">
              {results.length ? (
                <>
                  <div className="lk-group">
                    {trimmed ? results.length + (results.length >= 25 ? '+' : '') + ' results' : 'Hospitals'}
                  </div>
                  <div className="lk-list" onMouseLeave={() => { if (!trimmed) setSelIdx(-1); }}>
                    <motion.span className="lk-pill" aria-hidden="true" initial={false}
                      animate={{ y: pill ? pill.y : 0, height: pill ? pill.h : 0, opacity: pill ? 1 : 0 }}
                      transition={reduce ? { duration: 0 } : PILL} />
                    {results.map((entry, i) => (
                      <Row key={entry.id} entry={entry} query={trimmed} selected={i === selIdx}
                        onHover={() => setSelIdx(i)} flash={() => flashCopied(entry.label)}
                        rowRef={(el) => { if (el) rowRefs.current.set(entry.id, el); else rowRefs.current.delete(entry.id); }} />
                    ))}
                  </div>
                </>
              ) : null}

              {searching || (!trimmed && !warm && !results.length) ? <Skeleton /> : null}

              {nothingFound && !webShown ? (
                <State icon={SEARCH_X} title={'Nothing on the register for “' + trimmed + '”'}>
                  <button type="button" className="lk-btn lk-btn--primary" onClick={() => searchWeb(trimmed)}>
                    <Svg w={15} sw={2.2}>{GLOBE}</Svg>Search the web <Kbd>Enter</Kbd>
                  </button>
                  {shorter ? (
                    <button type="button" className="lk-btn lk-btn--ghost" onClick={() => { setQuery(shorter); focusBox(); }}>
                      {shorter}
                    </button>
                  ) : null}
                </State>
              ) : null}

              {/* The web, kept visibly apart from the register: its own group,
                  marked unverified. Numbers first, the pages second. */}
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
                            <span className="lk-row__label">{c.title}</span>
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
                                <span className="lk-row__label" style={s('font-size:14px;font-weight:550;')}>{r.title}</span>
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
        {flash ? (
          <motion.div key="toast" role="status" className="lk-toast"
            initial={{ opacity: 0, y: 10, x: '-50%', scale: 0.96 }} animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: 6, x: '-50%' }} transition={{ duration: 0.22, ease: EASE }}>
            <span className="lk-toast__ico" aria-hidden="true"><Svg w={15} sw={2.6}>{Icons.check}</Svg></span>
            <span style={s('min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>Copied {flash}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
