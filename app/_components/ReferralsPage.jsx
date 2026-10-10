'use client';

import React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { s, Svg, Icons } from './ui';
import AppHeader from './AppHeader';
import TemplateView from './templates/TemplateView';
import { highlightRanges } from '../../lib/lookup/fuzzy';
import { noteKind } from '../../lib/notebook/kinds.mjs';
import { filterReferrals } from '../../lib/search/referrals.mjs';

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
 * THE SHAPE IS CONTACT NUMBERS' (app/lookup/page.js): the same 820px
 * column, the heading centred above, the box drawn like the composer,
 * one card of rows that never changes size, the keyboard hints at its
 * foot. A row here also OPENS: the best match is open as soon as there
 * is one, and the card inside it is the Q&A's own card for that page
 * (TemplateView, built on the server exactly as an answer is) — so a
 * referral looks the same wherever it is found.
 *
 * With nothing typed: the referrals most asked for over the last 30
 * days, then all of them A–Z.
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

.rf-body{position:relative;flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 8px 8px;
  scrollbar-width:thin;scrollbar-color:rgba(76,98,114,.25) transparent;}
.rf-group{display:flex;align-items:center;gap:8px;padding:12px 12px 6px;font-size:11.5px;font-weight:650;color:#9aa6ae;letter-spacing:.02em;}
.rf-group__n{font-variant-numeric:tabular-nums;font-weight:600;color:#b5bfc6;}
.rf-group__live{display:inline-flex;align-items:center;gap:5px;margin-left:auto;font-weight:600;color:#b5bfc6;}
.rf-group__live .rf-spin{animation:rf-spin 1s linear infinite;display:flex;}
@keyframes rf-spin{to{transform:rotate(360deg);}}

/* ---- a referral: the row, and the card it opens to ---- */
.rf-item{border-radius:14px;scroll-margin:8px;}
.rf-item.is-open{margin:4px 0 8px;background:#f8fafb;box-shadow:inset 0 0 0 1px #e3e9ed;}
.rf-row{position:relative;display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:none;border-radius:14px;
  background:none;font:inherit;text-align:left;color:inherit;cursor:pointer;}
.rf-row:hover{background:#f6f8fa;}
.rf-item.is-sel > .rf-row{background:#f1f5f9;}
.rf-item.is-open > .rf-row,.rf-item.is-open > .rf-row:hover{background:none;}
.rf-row:focus-visible{outline:2px solid var(--rv-accent);outline-offset:-2px;}
.rf-row__text{flex:1;min-width:0;}
.rf-row__name{display:block;font-size:15px;font-weight:600;color:var(--rv-ink);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rf-item.is-open .rf-row__name{white-space:normal;}
.rf-row__sub{display:block;margin-top:1px;font-size:12.5px;color:#8a979f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rf-row__tags{flex:none;display:flex;align-items:center;gap:6px;}
.rf-chev{flex:none;display:flex;color:#9aa6ae;transition:transform .2s ease;}
.rf-item.is-open .rf-chev{transform:rotate(180deg);}
.rf-tag{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;}
.rf-tag--2ww{background:#fdecea;color:#b42318;box-shadow:inset 0 0 0 1px #f4b8b1;}
.rf-tag--urgent{background:#fdf6e7;color:#8a5a08;box-shadow:inset 0 0 0 1px #ecd9ad;}
.rf-mark{background:rgba(0,94,184,.1);color:var(--rv-accent);border-radius:3px;}
.rf-open{padding:2px 12px 14px;}
.rf-open__foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;}

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
.rf-btn--sm{height:32px;padding:0 13px;font-size:13px;gap:6px;}
.rf-btn--primary{background:var(--rv-accent);color:#fff;box-shadow:0 1px 2px rgba(0,48,135,.25),inset 0 1px 0 rgba(255,255,255,.16);}
.rf-btn--primary:hover{background:#0068c9;}
.rf-btn--ghost{background:#fff;color:var(--rv-ink);box-shadow:inset 0 0 0 1px #dde4e7;}
.rf-btn--ghost:hover{background:#f1f5f9;}

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
  .rf-row{flex-wrap:wrap;gap:6px 8px;padding:10px;}
  .rf-row__text{flex:1 1 70%;}
  .rf-row__name{white-space:normal;}
  .rf-open{padding:2px 6px 10px;}
}
@media (prefers-reduced-motion:reduce){
  .rf-skel,.rf-chev,.rf-group__live .rf-spin{transition:none !important;animation:none !important;}
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

// One referral. The row says what it is and how it goes; open, it is the
// Q&A's card for the page and the way to the page itself.
function Referral({ row, query, open, selected, onToggle, itemRef }) {
  return (
    <div ref={itemRef} className={'rf-item' + (open ? ' is-open' : '') + (selected ? ' is-sel' : '')}>
      <button type="button" className="rf-row" onClick={onToggle} aria-expanded={open ? 'true' : 'false'}>
        <span className="rf-row__text">
          <span className="rf-row__name"><Highlighted label={row.title} query={query} /></span>
          {row.where ? <span className="rf-row__sub">{row.where}</span> : null}
        </span>
        <span className="rf-row__tags">
          <PriorityTag tag={row.tag} />
          <RouteChip route={row.route} />
        </span>
        <span className="rf-chev" aria-hidden="true"><Svg w={16} sw={2.2}>{Icons.chevronDown}</Svg></span>
      </button>
      {open ? (
        <div className="rf-open">
          {row.card ? <TemplateView answer={row.card} /> : null}
          <div className="rf-open__foot">
            <Link href={row.href} className="rf-btn rf-btn--ghost rf-btn--sm">
              <Svg w={14} sw={2.2}>{Icons.edit}</Svg>Open in Practice notes
            </Link>
          </div>
        </div>
      ) : null}
    </div>
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
  const [openId, setOpenId] = React.useState(null);
  const [selIdx, setSelIdx] = React.useState(-1);
  const picked = React.useRef(false);
  const inputRef = React.useRef(null);
  const itemRefs = React.useRef(new Map());

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

  // What the arrow keys move through, in the order it is drawn.
  const flat = React.useMemo(() => (trimmed
    ? results.map((row) => ({ key: 'r:' + row.id, row }))
    : popular.map((row) => ({ key: 'p:' + row.id, row })).concat(book.rows.map((row) => ({ key: 'a:' + row.id, row })))),
  [trimmed, results, popular, book.rows]);

  // A new query: the reader has not chosen anything in it yet.
  React.useEffect(() => { picked.current = false; setSelIdx(trimmed ? 0 : -1); }, [trimmed]);
  // The best match is open — until the reader opens something else. The
  // instant matches open theirs; the server's ranking, when it lands,
  // replaces them and opens its own.
  const topId = trimmed && results.length ? results[0].id : null;
  React.useEffect(() => { if (!picked.current) setOpenId(topId); }, [topId, trimmed]);

  const toggle = (id, idx) => {
    picked.current = true;
    setSelIdx(idx);
    setOpenId((cur) => (cur === id ? null : id));
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setQuery(''); return; }
    if (!flat.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown'
        ? Math.min((selIdx < 0 ? -1 : selIdx) + 1, flat.length - 1)
        : Math.max(selIdx - 1, 0);
      setSelIdx(next);
      const el = itemRefs.current.get(flat[next].key);
      if (el) el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && selIdx >= 0 && selIdx < flat.length) {
      e.preventDefault();
      toggle(flat[selIdx].row.id, selIdx);
    }
  };

  const clear = () => { setQuery(''); if (inputRef.current) inputRef.current.focus(); };
  const refFor = (key) => (el) => { if (el) itemRefs.current.set(key, el); else itemRefs.current.delete(key); };
  const selKey = selIdx >= 0 && flat[selIdx] ? flat[selIdx].key : '';
  const item = (prefix, startIdx) => (row, i) => {
    const key = prefix + row.id;
    // With nothing typed a referral is listed twice (most asked, and A–Z);
    // it opens in the place it was clicked.
    const open = trimmed ? openId === row.id : openId === key;
    return (
      <Referral key={key} row={row} query={trimmed} open={open} selected={selKey === key} itemRef={refFor(key)}
        onToggle={() => (trimmed ? toggle(row.id, startIdx + i) : toggle(key, startIdx + i))} />
    );
  };
  const nothing = !!trimmed && answered && !results.length;

  return (
    <div className="riva-page-fill" style={s('height:100vh;overflow:hidden;display:flex;flex-direction:column;background:#f0f4f5;')}>
      <style data-rf="1" dangerouslySetInnerHTML={{ __html: RF_CSS }} />
      <AppHeader subtitle="Referrals" />

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
          <div className="rf-body">
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
                <div>{popular.map(item('p:', 0))}</div>
              </section>
            ) : null}
            {book.loaded && !trimmed && book.rows.length ? (
              <section aria-label="All referrals">
                <div className="rf-group">All referrals, A–Z <span className="rf-group__n">{book.rows.length}</span></div>
                <div>{book.rows.map(item('a:', popular.length))}</div>
              </section>
            ) : null}

            {/* Typed: the matches, best first. */}
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
                {results.map(item('r:', 0))}
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
              <span><Kbd>Esc</Kbd> clear</span>
            </span>
            {/* Not a referral, or not this one: the Q&A, with what was typed. */}
            <Link href={askHref(trimmed)} className="rf-foot__ask">
              Not what you need? <strong>Ask a question</strong>
              <Svg w={13} sw={2.4}>{Icons.arrow}</Svg>
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
