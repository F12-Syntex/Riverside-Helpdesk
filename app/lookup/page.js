'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
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

function Highlighted({ label, query }) {
  const ranges = query ? highlightRanges(label, query) : [];
  if (!ranges.length) return label;
  const parts = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) parts.push(label.slice(at, a));
    parts.push(<mark key={i} style={s('background:#ffeb3b;color:inherit;border-radius:2px;padding:0 1px;')}>{label.slice(a, b)}</mark>);
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
    <span style={s('display:inline-flex;align-items:stretch;')}>
      <a href={'tel:' + phone.tel}
        style={s('display:inline-flex;align-items:center;gap:5px;background:#e8f1f8;color:#003087;border-radius:999px 0 0 999px;padding:4px 8px 4px 12px;font-size:14.5px;font-weight:600;text-decoration:none;font-variant-numeric:tabular-nums;')}>
        <Svg w={12} sw={2.2}>{Icons.phone}</Svg>{phone.display}
      </a>
      <Hover tag="button" onClick={copy} aria-label={'Copy ' + phone.display} title="Copy number"
        base={'display:inline-flex;align-items:center;border:none;cursor:pointer;border-radius:0 999px 999px 0;padding:4px 10px 4px 7px;font:inherit;' + (copied ? 'background:#007f3b;color:#fff;' : 'background:#d9e8f5;color:#003087;')}
        hover={copied ? '' : 'background:#c8ddf0;'}>
        <Svg w={13} sw={2.2}>{copied ? Icons.check : Icons.copy}</Svg>
      </Hover>
    </span>
  );
}

function EntryRow({ entry, query, selected, flash }) {
  return (
    <div id={'lk-' + entry.id}
      style={s('display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:11px 14px;scroll-margin:90px;' +
        (selected ? 'background:#fff7cc;box-shadow:inset 3px 0 0 #ffb81c;' : ''))}>
      <span style={s('flex:1 1 260px;min-width:0;')}>
        <span style={s('display:block;font-size:15.5px;font-weight:600;color:#212b32;line-height:1.35;overflow-wrap:anywhere;')}>
          <Highlighted label={entry.label} query={query} />
        </span>
        {entry.note ? <span style={s('display:block;font-size:13px;color:#4c6272;margin-top:1px;')}>{entry.note}</span> : null}
        {entry.source === 'cqc' ? (
          <span style={s('display:flex;flex-wrap:wrap;align-items:center;gap:5px 10px;margin-top:5px;')}>
            {/* The export packs several service types into one "|"-joined
                field; two is enough to tell a dentist from a nursing home. */}
            {(entry.types || '').split('|').filter(Boolean).slice(0, 2).map((t, i) => (
              <span key={i} style={s('font-size:11.5px;font-weight:700;letter-spacing:.03em;border-radius:4px;padding:1px 7px;background:#eef7ee;color:#00532a;')}>{t}</span>
            ))}
            {entry.authority ? <span style={s('font-size:12.5px;color:#4c6272;')}>{entry.authority}</span> : null}
            {entry.url ? (
              <a href={entry.url} target="_blank" rel="noreferrer" style={s('font-size:12.5px;font-weight:600;color:#005eb8;text-decoration:none;')}>CQC record</a>
            ) : null}
            {!entry.phones.length && entry.website ? (
              <a href={entry.website} target="_blank" rel="noreferrer" style={s('font-size:12.5px;font-weight:600;color:#005eb8;text-decoration:none;word-break:break-all;')}>Website</a>
            ) : null}
          </span>
        ) : null}
      </span>
      <span style={s('display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex:none;max-width:100%;')}>
        {entry.phones.map((p, j) => <PhoneChip key={'p' + j} phone={p} onCopied={flash} />)}
        {entry.emails.map((e, j) => (
          <a key={'e' + j} href={'mailto:' + e}
            style={s('display:inline-flex;align-items:center;background:#f0f4f5;color:#005eb8;border-radius:999px;padding:4px 11px;font-size:13px;font-weight:600;text-decoration:none;word-break:break-all;')}>
            {e}
          </a>
        ))}
      </span>
    </div>
  );
}

export default function Page() {
  const [query, setQuery] = React.useState('');
  const [selIdx, setSelIdx] = React.useState(-1);
  const [flash, setFlash] = React.useState('');
  const [cqc, setCqc] = React.useState({ entries: [], total: 0, loading: false });
  // The web fallback is never automatic — it costs a model call, so it runs
  // only when the reader presses Enter, and only for the query they pressed it
  // on. `for` guards against the results of an old query lingering under a new
  // one the reader has since typed.
  const [web, setWeb] = React.useState({ for: '', results: [], loading: false, reason: '' });
  const inputRef = React.useRef(null);

  const trimmed = query.trim();
  const results = cqc.entries;
  const nothingFound = !!trimmed && trimmed.length >= 2 && !cqc.loading && !results.length;
  const webShown = web.for === trimmed && (web.loading || web.results.length || web.reason);

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
        .then((d) => { if (live) setCqc({ entries: Array.isArray(d.entries) ? d.entries : [], total: d.total || 0, loading: false }); })
        .catch(() => { if (live) setCqc((c) => ({ entries: [], total: c.total, loading: false })); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [trimmed]);

  // How many services are searchable, for the idle state. Cheap: the count
  // rides along on every search response, so this only runs once.
  React.useEffect(() => {
    fetch('/api/cqc', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setCqc((c) => (c.total ? c : { ...c, total: d.total || 0 })))
      .catch(() => {});
  }, []);

  const flashCopied = (label) => {
    setFlash(label);
    setTimeout(() => setFlash(''), 1600);
  };

  const onChange = (e) => setQuery(e.target.value);

  const searchWeb = React.useCallback((q) => {
    if (q.length < 3) return;
    setWeb({ for: q, results: [], loading: true, reason: '' });
    fetch('/api/lookup-web?q=' + encodeURIComponent(q), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setWeb({ for: q, results: Array.isArray(d.results) ? d.results : [], loading: false, reason: d.reason || '' }))
      .catch(() => setWeb({ for: q, results: [], loading: false, reason: 'Web search is unavailable.' }));
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

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Instant lookup" />

      <main style={s('flex:1;width:100%;max-width:860px;margin:0 auto;padding:24px 24px 140px;')}>
        {/* Copied toast. */}
        {flash ? (
          <div role="status" style={s('display:flex;align-items:center;gap:8px;margin:0 0 14px;padding:9px 13px;background:#007f3b;color:#fff;border-radius:8px;font-size:14px;font-weight:600;animation:rivaUp .18s ease;')}>
            <Svg w={16} sw={2.4}>{Icons.check}</Svg>Copied {flash}
          </div>
        ) : null}

        {trimmed && results.length ? (
          <div style={s('border:1px solid #d8dde0;border-radius:10px;background:#fff;overflow:hidden;')}>
            {results.map((e, i) => (
              <div key={e.id} style={s(i ? 'border-top:1px solid #eef1f2;' : '')}>
                <EntryRow entry={e} query={trimmed} selected={i === selIdx} flash={() => flashCopied(e.label)} />
              </div>
            ))}
          </div>
        ) : null}

        {/* Only give up once the server has had its say. */}
        {trimmed && !results.length && !nothingFound ? (
          <div style={s('padding:48px 18px;color:#8a99a3;font-size:15px;line-height:1.5;text-align:center;')}>Searching&hellip;</div>
        ) : null}

        {/* Nothing in the register. The register only holds CQC-registered
            services, so a pharmacy, an interpreting line or a number off a
            letter will legitimately miss — offer the web rather than a dead
            end. Not automatic: it costs a model call, so the reader asks. */}
        {nothingFound && !webShown ? (
          <div style={s('padding:40px 18px;text-align:center;')}>
            <p style={s('margin:0 0 14px;color:#8a99a3;font-size:15px;line-height:1.5;')}>
              Nothing in the register for &ldquo;{trimmed}&rdquo;.
            </p>
            <Hover tag="button" onClick={() => searchWeb(trimmed)}
              base="display:inline-flex;align-items:center;gap:9px;padding:10px 18px;border-radius:999px;border:2px solid #d8dde0;background:#fff;color:#005eb8;font:inherit;font-size:15px;font-weight:600;cursor:pointer;"
              hover="border-color:#005eb8;background:#f7fbff;">
              <Svg w={16} sw={2.2}>{Icons.search}</Svg>
              Finish typing, then press <kbd style={s('font:inherit;font-weight:700;')}>Enter</kbd> to search the web
            </Hover>
          </div>
        ) : null}

        {/* Web results, kept visibly apart from the register. */}
        {webShown ? (
          <div>
            <div style={s('display:flex;align-items:baseline;gap:8px;margin:0 2px 8px;')}>
              <span style={s('font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#8a6100;')}>From the web</span>
              <span style={s('font-size:12.5px;color:#8a99a3;')}>not the CQC register &mdash; check before using</span>
            </div>
            {web.loading ? (
              <div style={s('padding:28px 18px;color:#8a99a3;font-size:15px;text-align:center;')}>Searching the web&hellip;</div>
            ) : web.results.length ? (
              <div style={s('border:1px solid #ecd39a;background:#fffdf5;border-radius:10px;overflow:hidden;')}>
                {web.results.map((r, i) => (
                  <a key={r.url} href={r.url} target="_blank" rel="noreferrer"
                    style={s('display:block;padding:12px 14px;text-decoration:none;color:inherit;' + (i ? 'border-top:1px solid #f3e6c6;' : ''))}>
                    <span style={s('display:block;font-size:15.5px;font-weight:600;color:#005eb8;line-height:1.35;overflow-wrap:anywhere;')}>{r.title}</span>
                    {r.snippet ? <span style={s('display:block;font-size:13px;color:#4c6272;margin-top:2px;line-height:1.45;')}>{r.snippet.slice(0, 180)}</span> : null}
                    <span style={s('display:block;font-size:12px;color:#8a99a3;margin-top:3px;overflow-wrap:anywhere;')}>{r.url}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div style={s('padding:28px 18px;color:#8a99a3;font-size:15px;text-align:center;')}>
                {web.reason || 'Nothing useful found on the web either.'}
              </div>
            )}
          </div>
        ) : null}

        {/* Idle: say what is being searched, since a register of this size is
            only useful if you know what you can ask it for. */}
        {!trimmed ? (
          <div style={s('padding:48px 18px;color:#8a99a3;font-size:15px;line-height:1.6;text-align:center;')}>
            {cqc.total ? cqc.total.toLocaleString('en-GB') + ' services registered with the CQC in England.' : 'The CQC register of services in England.'}
            <br />Search by name, town, postcode, service type or phone number.
          </div>
        ) : null}
      </main>

      {/* Docked search bar — fixed to the viewport bottom so its position and
          width never shift as results grow/shrink or a scrollbar appears.
          Styled to match the chat composer on /helpbot (white bar, pill input,
          same heights) for a consistent feel across the tools. */}
      <div style={s('position:fixed;left:0;right:0;bottom:0;z-index:10;background:#fff;border-top:1px solid #d8dde0;box-shadow:0 -4px 14px rgba(33,43,50,.04);')}>
        <div style={s('max-width:820px;margin:0 auto;padding:14px 24px 18px;padding-bottom:calc(18px + env(safe-area-inset-bottom));display:flex;gap:10px;align-items:center;')}>
          <div style={s('position:relative;flex:1;')}>
            <span style={s('position:absolute;left:16px;top:50%;transform:translateY(-50%);color:#4c6272;display:flex;')}>
              <Svg w={20} sw={2.2}>{Icons.search}</Svg>
            </span>
            <input
              ref={inputRef}
              autoFocus
              className="riva-input"
              type="text"
              value={query}
              onChange={onChange}
              onKeyDown={onKeyDown}
              placeholder="Name, town, postcode…"
              aria-label="Search the CQC register"
              style={s('width:100%;height:48px;padding:0 46px;font:inherit;font-size:17px;border:2px solid #d8dde0;border-radius:999px;background:#f0f4f5;color:#212b32;outline:none;')}
            />
            {query ? (
              <Hover tag="button" onClick={() => { setQuery(''); if (inputRef.current) inputRef.current.focus(); }} aria-label="Clear search"
                base="position:absolute;right:8px;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:34px;height:34px;border:none;border-radius:50%;background:none;color:#4c6272;cursor:pointer;"
                hover="background:#e4e9eb;color:#212b32;">
                <Svg w={18} sw={2.2}>{Icons.close}</Svg>
              </Hover>
            ) : null}
          </div>
        </div>
      </div>

    </div>
  );
}
