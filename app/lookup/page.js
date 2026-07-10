'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { getDirectory, CATEGORIES } from '../../lib/lookup/directory';
import { buildIndex, fuzzySearch, highlightRanges } from '../../lib/lookup/fuzzy';

/* ------------------------------------------------------------------ *
 * Instant lookup — the fuzzy-search phone directory.
 *
 * Type a partial or messy word ("mary", "pha", "homer") and the pre-saved
 * list of hospital switchboards, departments, community teams, pharmacies
 * and system numbers filters instantly. Everything runs in the browser over
 * lib/lookup/directory.js — no network round-trip, no AI, numbers shown
 * verbatim from the data files so they can never be mis-typed.
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
  const [category, setCategory] = React.useState('All');
  const [selIdx, setSelIdx] = React.useState(-1);
  const [flash, setFlash] = React.useState('');
  const inputRef = React.useRef(null);

  const directory = React.useMemo(() => getDirectory(), []);
  const index = React.useMemo(() => buildIndex(directory), [directory]);

  const trimmed = query.trim();
  const results = React.useMemo(() => {
    const pool = trimmed
      ? fuzzySearch(index, trimmed).map((r) => r.entry)
      : directory;
    return category === 'All' ? pool : pool.filter((e) => e.category === category);
  }, [index, directory, trimmed, category]);

  // Keep keyboard selection in range as the list changes under it.
  React.useEffect(() => { setSelIdx(trimmed ? 0 : -1); }, [trimmed, category]);

  const counts = React.useMemo(() => {
    const m = { All: directory.length };
    for (const e of directory) m[e.category] = (m[e.category] || 0) + 1;
    return m;
  }, [directory]);

  const flashCopied = (label) => {
    setFlash(label);
    setTimeout(() => setFlash(''), 1600);
  };

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

  // Grouped view for browsing (no query): sections in category order.
  const grouped = React.useMemo(() => {
    if (trimmed) return null;
    const by = new Map();
    for (const e of results) {
      if (!by.has(e.category)) by.set(e.category, []);
      by.get(e.category).push(e);
    }
    return CATEGORIES.filter((c) => by.has(c)).map((c) => [c, by.get(c)]);
  }, [results, trimmed]);

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Instant lookup" />

      <main style={s('flex:1;width:100%;max-width:860px;margin:0 auto;padding:32px 24px 56px;')}>
        <h1 className="riva-hero-h1" style={s('font-size:30px;margin:0 0 4px;letter-spacing:-0.02em;')}>Instant lookup</h1>
        <p style={s('font-size:16px;color:#4c6272;margin:0 0 18px;line-height:1.5;text-wrap:pretty;')}>
          Start typing a name. Part of a word is fine, and so are spelling mistakes
          (&ldquo;pha&rdquo;, &ldquo;homer&rdquo;, &ldquo;fisio&rdquo;). The list narrows as you type:
          hospital switchboards, departments, community teams, pharmacies and systems.
          Numbers are shown exactly as they were saved, so they cannot be mistyped.
        </p>

        {/* Search box — stays pinned while the results scroll. */}
        <div className="riva-lookup-sticky" style={s('position:sticky;z-index:10;background:#f0f4f5;padding:4px 0 10px;')}>
          <div style={s('position:relative;')}>
            <span style={s('position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#4c6272;display:flex;')}>
              <Svg w={20} sw={2.2}>{Icons.search}</Svg>
            </span>
            <input
              ref={inputRef}
              autoFocus
              className="riva-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search extensions, departments, hospitals, pharmacies…"
              aria-label="Search the practice directory"
              style={s('width:100%;height:52px;padding:0 44px 0 44px;font:inherit;font-size:17px;border:2px solid #4c6272;border-radius:10px;background:#fff;color:#212b32;')}
            />
            {query ? (
              <Hover tag="button" onClick={() => { setQuery(''); if (inputRef.current) inputRef.current.focus(); }} aria-label="Clear search"
                base="position:absolute;right:8px;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:34px;height:34px;border:none;border-radius:8px;background:none;color:#4c6272;cursor:pointer;"
                hover="background:#f0f4f5;color:#212b32;">
                <Svg w={18} sw={2.2}>{Icons.close}</Svg>
              </Hover>
            ) : null}
          </div>

          {/* Category filter chips. */}
          <div style={s('display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;')}>
            {['All', ...CATEGORIES].map((c) => {
              const active = category === c;
              return (
                <Hover key={c} tag="button" onClick={() => setCategory(c)}
                  base={'border:1px solid ' + (active ? '#005eb8;background:#005eb8;color:#fff;' : '#d8dde0;background:#fff;color:#39505f;') + 'border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;'}
                  hover={active ? '' : 'border-color:#005eb8;color:#005eb8;'}>
                  {c}{counts[c] ? <span style={s('opacity:.7;font-weight:500;')}> {counts[c]}</span> : null}
                </Hover>
              );
            })}
          </div>
        </div>

        {/* Copied toast. */}
        {flash ? (
          <div role="status" style={s('display:flex;align-items:center;gap:8px;margin:10px 0 0;padding:9px 13px;background:#007f3b;color:#fff;border-radius:8px;font-size:14px;font-weight:600;animation:rivaUp .18s ease;')}>
            <Svg w={16} sw={2.4}>{Icons.check}</Svg>Copied {flash}
          </div>
        ) : null}

        {/* Results. */}
        {trimmed ? (
          <>
            <div style={s('font-size:13.5px;color:#4c6272;margin:14px 0 8px;')}>
              {results.length
                ? results.length + (results.length === 1 ? ' match' : ' matches') + '. Use the arrow keys to move and Enter to copy the highlighted number'
                : ''}
            </div>
            {results.length ? (
              <div style={s('border:1px solid #d8dde0;border-radius:10px;background:#fff;overflow:hidden;')}>
                {results.map((e, i) => (
                  <div key={e.id} style={s(i ? 'border-top:1px solid #eef1f2;' : '')}>
                    <EntryRow entry={e} query={trimmed} selected={i === selIdx} showCategory flash={() => flashCopied(e.label)} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={s('border:1px solid #d8dde0;border-radius:10px;background:#fff;padding:22px 18px;color:#4c6272;font-size:15px;line-height:1.5;')}>
                No matches for &ldquo;{trimmed}&rdquo;{category !== 'All' ? ' in ' + category : ''}.
                Try fewer letters: 2 or 3 letters of any word in the name is enough
                {category !== 'All' ? ', or switch the filter back to All' : ''}.
              </div>
            )}
          </>
        ) : (
          <div style={s('margin-top:14px;display:flex;flex-direction:column;gap:18px;')}>
            {grouped.map(([cat, entries]) => (
              <section key={cat}>
                <h2 style={s('display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin:0 0 8px;')}>
                  {cat}
                  <span style={s('font-weight:600;color:#aeb7bd;')}>{entries.length}</span>
                </h2>
                <div style={s('border:1px solid #d8dde0;border-radius:10px;background:#fff;overflow:hidden;')}>
                  {entries.map((e, i) => (
                    <div key={e.id} style={s(i ? 'border-top:1px solid #eef1f2;' : '')}>
                      <EntryRow entry={e} query="" selected={false} showCategory={false} flash={() => flashCopied(e.label)} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <p style={s('margin:26px 0 0;font-size:13px;color:#768692;line-height:1.55;')}>
          Sources: the practice&rsquo;s &ldquo;Useful telephone numbers&rdquo; sheet plus the main switchboards of the
          hospitals this practice refers to. To add or correct an entry, edit
          {' '}<code style={s('font-size:12px;background:#e8edee;border-radius:4px;padding:1px 5px;')}>lib/contacts.data.json</code> or
          {' '}<code style={s('font-size:12px;background:#e8edee;border-radius:4px;padding:1px 5px;')}>lib/lookup/hospitals.data.json</code>.
        </p>
      </main>
    </div>
  );
}
