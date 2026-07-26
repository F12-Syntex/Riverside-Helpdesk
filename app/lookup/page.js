'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { buildIndex, fuzzySearch, highlightRanges } from '../../lib/lookup/fuzzy';

/* ------------------------------------------------------------------ *
 * Instant lookup — the fuzzy-search phone directory.
 *
 * Type a partial or messy word ("mary", "pha", "homer") and the pre-saved
 * list of hospital switchboards, departments, community teams, pharmacies
 * and system numbers filters instantly. The canonical directory is loaded once
 * from Postgres, then fuzzy search runs locally with no AI; numbers remain
 * structured values and are never authored by a model.
 *
 * Underneath the practice's own numbers sits the CQC register — every service
 * registered in England (~57k rows). That set is far too large to hold on a
 * phone, so it is searched on the server through /api/cqc and shown as a
 * clearly separate second section, never mixed into the practice's own list.
 * ------------------------------------------------------------------ */

const CAT_COLOURS = {
  'Hospitals': 'background:#e8f1f8;color:#003087;',
  'Departments and clinics': 'background:#eef7ee;color:#00532a;',
  'Community and district nursing': 'background:#fdf0e6;color:#7a3b00;',
  'Mental health': 'background:#f3ecfa;color:#4c2c92;',
  'Pharmacies and supplies': 'background:#e9f6f8;color:#005661;',
  'Transport': 'background:#fff3e0;color:#6d4c00;',
  'IT and systems': 'background:#f0f4f5;color:#39505f;',
  'Social care and advocacy': 'background:#fbeef2;color:#7c2855;',
  'Other numbers': 'background:#f0f4f5;color:#4c6272;',
};

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

function EntryRow({ entry, query, selected, showCategory, flash }) {
  return (
    <div id={'lk-' + entry.id}
      style={s('display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:11px 14px;scroll-margin:90px;' +
        (selected ? 'background:#fff7cc;box-shadow:inset 3px 0 0 #ffb81c;' : ''))}>
      <span style={s('flex:1 1 260px;min-width:0;')}>
        <span style={s('display:block;font-size:15.5px;font-weight:600;color:#212b32;line-height:1.35;overflow-wrap:anywhere;')}>
          <Highlighted label={entry.label} query={query} />
        </span>
        {entry.note ? <span style={s('display:block;font-size:13px;color:#4c6272;margin-top:1px;')}>{entry.note}</span> : null}
        {showCategory ? (
          <span style={s('display:inline-block;margin-top:4px;font-size:11.5px;font-weight:700;letter-spacing:.03em;border-radius:4px;padding:1px 7px;' + (CAT_COLOURS[entry.category] || CAT_COLOURS['Other numbers']))}>
            {entry.category}
          </span>
        ) : null}
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
  const [directory, setDirectory] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [showAll, setShowAll] = React.useState(false);
  const [selIdx, setSelIdx] = React.useState(-1);
  const [flash, setFlash] = React.useState('');
  const [cqc, setCqc] = React.useState({ entries: [], loading: false });
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    fetch('/api/directory', { cache: 'no-store' }).then((r) => r.json()).then((data) => setDirectory(Array.isArray(data.entries) ? data.entries : [])).catch(() => setDirectory([]));
  }, []);
  const index = React.useMemo(() => buildIndex(directory), [directory]);

  const trimmed = query.trim();
  const results = React.useMemo(() => {
    if (!trimmed) return [];
    return fuzzySearch(index, trimmed).map((r) => r.entry);
  }, [index, trimmed]);

  // Keep keyboard selection in range as the list changes under it.
  React.useEffect(() => { setSelIdx(trimmed ? 0 : -1); }, [trimmed]);

  // The CQC register lives on the server. Debounce so a fast typist sends one
  // request instead of one per letter, and track which query each response
  // belongs to so a slow reply can't overwrite a newer one.
  React.useEffect(() => {
    if (trimmed.length < 2) { setCqc({ entries: [], loading: false }); return; }
    setCqc((c) => ({ entries: c.entries, loading: true }));
    let live = true;
    const timer = setTimeout(() => {
      fetch('/api/cqc?q=' + encodeURIComponent(trimmed), { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (live) setCqc({ entries: Array.isArray(d.entries) ? d.entries : [], loading: false }); })
        .catch(() => { if (live) setCqc({ entries: [], loading: false }); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [trimmed]);

  const flashCopied = (label) => {
    setFlash(label);
    setTimeout(() => setFlash(''), 1600);
  };

  const onChange = (e) => setQuery(e.target.value);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setQuery(''); return; }
    if (!results.length) return;
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

        {/* The practice's own numbers first — these are the ones reception
            reaches for, and they answer instantly with no round trip. */}
        {trimmed && results.length ? (
          <div style={s('border:1px solid #d8dde0;border-radius:10px;background:#fff;overflow:hidden;')}>
            {results.map((e, i) => (
              <div key={e.id} style={s(i ? 'border-top:1px solid #eef1f2;' : '')}>
                <EntryRow entry={e} query={trimmed} selected={i === selIdx} showCategory flash={() => flashCopied(e.label)} />
              </div>
            ))}
          </div>
        ) : null}

        {/* Then the wider CQC register, kept visibly separate. */}
        {trimmed && cqc.entries.length ? (
          <div style={s(results.length ? 'margin-top:22px;' : '')}>
            <div style={s('display:flex;align-items:baseline;gap:8px;margin:0 2px 8px;')}>
              <span style={s('font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#4c6272;')}>
                Elsewhere in England
              </span>
              <span style={s('font-size:12.5px;color:#8a99a3;')}>CQC register</span>
            </div>
            <div style={s('border:1px solid #d8dde0;border-radius:10px;background:#fff;overflow:hidden;')}>
              {cqc.entries.map((e, i) => (
                <div key={e.id} style={s(i ? 'border-top:1px solid #eef1f2;' : '')}>
                  <EntryRow entry={e} query={trimmed} selected={false} showCategory={false} flash={() => flashCopied(e.label)} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Only give up once the server has had its say. */}
        {trimmed && !results.length && !cqc.entries.length ? (
          <div style={s('padding:48px 18px;color:#8a99a3;font-size:15px;line-height:1.5;text-align:center;')}>
            {cqc.loading ? 'Searching…' : <>No matches for &ldquo;{trimmed}&rdquo;. Try fewer letters.</>}
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
              placeholder="Type a name…"
              aria-label="Search the practice directory"
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
          <Hover tag="button" onClick={() => setShowAll(true)}
            base="flex:none;height:48px;padding:0 20px;font:inherit;font-size:15px;font-weight:600;border-radius:999px;cursor:pointer;border:2px solid #d8dde0;background:#fff;color:#39505f;"
            hover="border-color:#005eb8;color:#005eb8;">
            View all
          </Hover>
        </div>
      </div>

      {/* "View all" — a sheet that rises to fill almost the full screen. */}
      {showAll ? (
        <div style={s('position:fixed;inset:0;z-index:80;background:rgba(33,43,50,.45);display:flex;align-items:flex-end;justify-content:center;')}
          onClick={() => setShowAll(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="riva-lookup-all-sheet"
            style={s('width:100%;max-width:860px;height:92vh;background:#f0f4f5;border-radius:18px 18px 0 0;box-shadow:0 -8px 32px rgba(33,43,50,.25);display:flex;flex-direction:column;overflow:hidden;animation:rivaSheetUp .22s ease;')}>
            <div style={s('flex:none;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #d8dde0;background:#fff;')}>
              <span style={s('font-size:18px;font-weight:700;')}>All numbers <span style={s('color:#8a99a3;font-weight:600;')}>({directory.length})</span></span>
              <Hover tag="button" onClick={() => setShowAll(false)} aria-label="Close"
                base="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border:none;border-radius:8px;background:#f0f4f5;color:#39505f;cursor:pointer;"
                hover="background:#e4e9eb;color:#212b32;">
                <Svg w={18} sw={2.2}>{Icons.close}</Svg>
              </Hover>
            </div>
            <div style={s('flex:1;overflow-y:auto;padding:16px 20px;')}>
              <div style={s('border:1px solid #d8dde0;border-radius:10px;background:#fff;overflow:hidden;')}>
                {directory.map((e, i) => (
                  <div key={e.id} style={s(i ? 'border-top:1px solid #eef1f2;' : '')}>
                    <EntryRow entry={e} query="" selected={false} showCategory flash={() => flashCopied(e.label)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
