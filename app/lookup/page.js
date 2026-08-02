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

// Searches worth showing someone who has never used this before. The register
// answers to more than a name, and nobody discovers that from a placeholder.
const EXAMPLES = ['dentist barnsley', 'Barnsley Hospital', 'S70 2RD', 'care home sheffield'];

// A key, drawn as one. The old markup used a bare <kbd> with `font:inherit`,
// which made it indistinguishable from the sentence around it.
function Kbd({ children }) {
  return (
    <kbd style={s('display:inline-block;min-width:20px;padding:1px 6px;border:1px solid #d8dde0;border-bottom-width:2px;border-radius:5px;background:#fff;color:#4c6272;font:inherit;font-size:12px;font-weight:700;line-height:1.5;text-align:center;')}>
      {children}
    </kbd>
  );
}

// A centred block for the states that are not a list of results: nothing typed,
// nothing found, nothing on the web. They used to be a line of grey text in the
// middle of an empty page, which reads as a page that has broken rather than
// one that has an answer.
function EmptyState({ icon, tone = 'quiet', title, children }) {
  const ring = tone === 'warn' ? 'background:#fff6cc;color:#946200;'
    : tone === 'error' ? 'background:#fdf2f2;color:#d5281b;'
      : 'background:#e8f1f8;color:#005eb8;';
  return (
    <div style={s('border:1px solid #d8dde0;background:#fff;border-radius:14px;padding:30px 26px;text-align:center;animation:rivaUp .2s ease;')}>
      <span style={s('display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;margin-bottom:14px;' + ring)}>
        <Svg w={24} sw={2}>{icon}</Svg>
      </span>
      <h2 style={s('margin:0;font-size:19px;font-weight:700;color:#212b32;letter-spacing:-.01em;line-height:1.3;')}>{title}</h2>
      {children}
    </div>
  );
}

// The shape of a result, greyed — so the wait reads as "the list is coming"
// rather than "the page is empty".
function Skeleton() {
  const bar = (w, h, mt) => s('display:block;height:' + h + 'px;width:' + w + ';border-radius:5px;background:#eef1f2;margin-top:' + mt + 'px;');
  return (
    <div aria-hidden="true" style={s('border:1px solid #d8dde0;border-radius:10px;background:#fff;overflow:hidden;animation:rivaBlink 1.6s ease-in-out infinite;')}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={s('display:flex;align-items:center;gap:14px;padding:14px;' + (i ? 'border-top:1px solid #eef1f2;' : ''))}>
          <span style={s('flex:1;min-width:0;')}>
            <span style={bar(['58%', '44%', '66%', '50%'][i], 15, 0)} />
            <span style={bar(['76%', '62%', '70%', '58%'][i], 11, 7)} />
          </span>
          <span style={s('flex:none;width:132px;height:26px;border-radius:999px;background:#eef1f2;')} />
        </div>
      ))}
    </div>
  );
}

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
  const [web, setWeb] = React.useState({ for: '', contacts: [], results: [], loading: false, reason: '' });
  const inputRef = React.useRef(null);

  const trimmed = query.trim();
  const results = cqc.entries;
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

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Instant lookup" />

      <main style={s('flex:1;width:100%;max-width:860px;margin:0 auto;padding:24px 24px 128px;')}>
        {trimmed && results.length ? (
          <>
            <div style={s('display:flex;align-items:baseline;gap:8px;margin:0 4px 8px;')}>
              <span style={s('font-size:13px;font-weight:700;color:#4c6272;')}>
                {results.length} match{results.length === 1 ? '' : 'es'}
              </span>
              {/* The server returns the best 25. Saying so beats letting someone
                  scroll to the bottom and assume that is everything there is. */}
              {results.length >= 25 ? (
                <span style={s('font-size:12.5px;color:#8a99a3;')}>best 25 shown — add a town or postcode to narrow it</span>
              ) : null}
            </div>
            <div style={s('border:1px solid #d8dde0;border-radius:10px;background:#fff;overflow:hidden;')}>
              {results.map((e, i) => (
                <div key={e.id} style={s(i ? 'border-top:1px solid #eef1f2;' : '')}>
                  <EntryRow entry={e} query={trimmed} selected={i === selIdx} flash={() => flashCopied(e.label)} />
                </div>
              ))}
            </div>
          </>
        ) : null}

        {/* One character is not a search — the register is not even asked. Say
            that, rather than showing a "Searching…" that never finishes. */}
        {tooShort ? (
          <EmptyState icon={Icons.search} title="Keep typing">
            <p style={s('margin:8px 0 0;font-size:15px;line-height:1.55;color:#4c6272;')}>
              Two letters or more, and the register is searched as you type.
            </p>
          </EmptyState>
        ) : null}

        {searching ? <Skeleton /> : null}

        {/* Nothing in the register. The register only holds CQC-registered
            services, so a pharmacy, an interpreting line or a number off a
            letter will legitimately miss — say which, offer a way to narrow the
            search, and offer the web rather than a dead end. The web is not
            automatic: it costs a model call, so the reader asks for it. */}
        {nothingFound && !webShown ? (
          <EmptyState icon={Icons.search} tone="warn" title={'No match for “' + trimmed + '”'}>
            <p style={s('margin:8px auto 0;max-width:52ch;font-size:15px;line-height:1.55;color:#4c6272;')}>
              This searches the CQC register — GP practices, dentists, hospitals, clinics,
              care and nursing homes. Pharmacies, interpreting lines, individual hospital
              departments and personal numbers are not on it.
            </p>

            <Hover tag="button" onClick={() => searchWeb(trimmed)}
              base="display:inline-flex;align-items:center;gap:9px;margin-top:18px;padding:11px 20px;border-radius:999px;border:none;background:#005eb8;color:#fff;font:inherit;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 4px 0 #002a52;"
              active="transform:translateY(4px);box-shadow:none;"
              hover="background:#0071d4;">
              <Svg w={17} sw={2.2}>{Icons.globe}</Svg>
              Search the web for a number
            </Hover>
            <div style={s('margin-top:9px;font-size:12.5px;color:#8a99a3;')}>
              or press <Kbd>Enter</Kbd>
            </div>

            {/* A miss is most often too many words. Offering the shorter query
                as a button beats telling someone to retype it. */}
            {shorter ? (
              <div style={s('margin-top:20px;padding-top:16px;border-top:1px solid #eef1f2;')}>
                <span style={s('font-size:13px;color:#768692;')}>Try a shorter search: </span>
                <Hover tag="button" onClick={() => setQuery(shorter)}
                  base="display:inline-flex;align-items:center;padding:3px 12px;border-radius:999px;border:1px solid #d8dde0;background:#fff;color:#005eb8;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;"
                  hover="border-color:#005eb8;background:#f7fbff;">
                  {shorter}
                </Hover>
              </div>
            ) : null}
          </EmptyState>
        ) : null}

        {/* Web results, kept visibly apart from the register. The numbers come
            first and the pages they were read off come second: someone at the
            desk needs a number, not a reading list. */}
        {webShown ? (
          <div>
            <div style={s('display:flex;align-items:baseline;gap:8px;margin:0 2px 8px;')}>
              <span style={s('font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#8a6100;')}>From the web</span>
              <span style={s('font-size:12.5px;color:#8a99a3;')}>not the CQC register &mdash; check before using</span>
            </div>
            {web.loading ? (
              <div style={s('border:1px solid #ecd39a;background:#fffdf5;border-radius:10px;padding:26px 18px;display:flex;flex-direction:column;align-items:center;gap:10px;')}>
                <span style={s('display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#fff6cc;color:#946200;')}>
                  <Svg w={17} sw={2.2} style={s('animation:rivaSpin .9s linear infinite;')}>{Icons.spinner}</Svg>
                </span>
                <span style={s('font-size:15px;font-weight:600;color:#212b32;')}>Reading the pages for a number&hellip;</span>
                <span style={s('font-size:13px;color:#768692;')}>This one takes a few seconds — it opens each page and looks.</span>
              </div>
            ) : (
              <>
                {web.contacts.length ? (
                  <div style={s('border:1px solid #ecd39a;background:#fffdf5;border-radius:10px;overflow:hidden;margin-bottom:14px;')}>
                    {web.contacts.map((c, i) => (
                      <div key={c.url} style={s('padding:12px 14px;' + (i ? 'border-top:1px solid #f3e6c6;' : ''))}>
                        <span style={s('display:block;font-size:15.5px;font-weight:600;color:#212b32;line-height:1.35;overflow-wrap:anywhere;')}>{c.title}</span>
                        <span style={s('display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px;')}>
                          {c.phones.map((p, j) => (
                            <span key={'p' + j} style={s('display:inline-flex;flex-direction:column;gap:2px;')}>
                              <PhoneChip phone={p} onCopied={() => flashCopied(p.display)} />
                              {p.label || p.kind === 'fax' ? (
                                <span style={s('font-size:11.5px;color:#8a99a3;padding-left:12px;overflow-wrap:anywhere;')}>
                                  {p.kind === 'fax' ? 'Fax' : p.label}
                                </span>
                              ) : null}
                            </span>
                          ))}
                          {c.emails.map((e, j) => (
                            <a key={'e' + j} href={'mailto:' + e}
                              style={s('display:inline-flex;align-items:center;background:#f0f4f5;color:#005eb8;border-radius:999px;padding:4px 11px;font-size:13px;font-weight:600;text-decoration:none;word-break:break-all;')}>
                              {e}
                            </a>
                          ))}
                        </span>
                        <a href={c.url} target="_blank" rel="noreferrer"
                          style={s('display:block;font-size:12px;color:#8a99a3;margin-top:6px;overflow-wrap:anywhere;text-decoration:none;')}>
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
                  <EmptyState icon={Icons.alertCircle} tone="error" title="No number found for this one">
                    <p style={s('margin:8px auto 0;max-width:52ch;font-size:15px;line-height:1.55;color:#4c6272;')}>
                      {web.reason
                        || (web.results.length
                          ? 'The register has no match, and none of the pages found publishes a phone number.'
                          : 'The register has no match, and the web search found nothing relevant.')}
                    </p>
                    <a href={'https://www.google.com/search?q=' + encodeURIComponent(trimmed + ' phone number')}
                      target="_blank" rel="noreferrer"
                      style={s('display:inline-flex;align-items:center;gap:8px;margin-top:18px;padding:10px 18px;border-radius:999px;border:2px solid #d8dde0;background:#fff;color:#005eb8;font-size:15px;font-weight:600;text-decoration:none;')}>
                      <Svg w={16} sw={2.2}>{Icons.external}</Svg>
                      Search Google for &ldquo;{trimmed}&rdquo;
                    </a>
                    <p style={s('margin:16px auto 0;max-width:52ch;font-size:13px;line-height:1.5;color:#8a99a3;')}>
                      A number found that way is not from the register &mdash; check it before giving it to a patient.
                    </p>
                  </EmptyState>
                ) : null}

                {/* The pages themselves. Evidence when a number was found, and
                    a starting point when none was — either way they are the
                    supporting detail, so they sit below and read quieter. */}
                {web.results.length ? (
                  <div style={s('border:1px solid #d8dde0;background:#fff;border-radius:10px;overflow:hidden;' + (web.contacts.length ? '' : 'margin-top:14px;'))}>
                    <div style={s('padding:8px 14px;background:#f7fafb;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#768692;')}>
                      {web.contacts.length ? 'Pages searched' : 'Pages searched — none published a number'}
                    </div>
                    {web.results.map((r) => (
                      <a key={r.url} href={r.url} target="_blank" rel="noreferrer"
                        style={s('display:block;padding:11px 14px;text-decoration:none;color:inherit;border-top:1px solid #eef1f2;')}>
                        <span style={s('display:block;font-size:14.5px;font-weight:600;color:#005eb8;line-height:1.35;overflow-wrap:anywhere;')}>{r.title}</span>
                        <span style={s('display:block;font-size:12px;color:#8a99a3;margin-top:3px;overflow-wrap:anywhere;')}>{r.url}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {/* Idle: say what is being searched, since a register of this size is
            only useful if you know what you can ask it for — and show it, since
            nobody learns "a postcode works too" from a placeholder. */}
        {!trimmed ? (
          <EmptyState icon={Icons.search} title={cqc.total ? cqc.total.toLocaleString('en-GB') + ' services, searchable' : 'The CQC register of services in England'}>
            <p style={s('margin:8px auto 0;max-width:52ch;font-size:15px;line-height:1.55;color:#4c6272;')}>
              Every service registered with the Care Quality Commission in England. Search by
              name, town, postcode, service type or phone number.
            </p>
            <div style={s('display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:18px;')}>
              {EXAMPLES.map((ex) => (
                <Hover key={ex} tag="button" onClick={() => { setQuery(ex); if (inputRef.current) inputRef.current.focus(); }}
                  base="display:inline-flex;align-items:center;padding:5px 14px;border-radius:999px;border:1px solid #d8dde0;background:#fff;color:#005eb8;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;"
                  hover="border-color:#005eb8;background:#f7fbff;">
                  {ex}
                </Hover>
              ))}
            </div>
            <p style={s('margin:20px auto 0;max-width:52ch;font-size:13px;line-height:1.5;color:#8a99a3;')}>
              Use <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move through matches and <Kbd>Enter</Kbd> to copy the number.
            </p>
          </EmptyState>
        ) : null}
      </main>

      {/* Copied toast. Fixed above the search bar rather than at the top of the
          results: as a block in the flow it pushed the whole list down by its
          own height the moment anyone copied a number. */}
      {flash ? (
        <div role="status" style={s('position:fixed;left:50%;bottom:118px;transform:translateX(-50%);z-index:20;max-width:calc(100vw - 32px);display:flex;align-items:center;gap:8px;padding:10px 16px;background:#007f3b;color:#fff;border-radius:999px;font-size:14px;font-weight:600;box-shadow:0 4px 14px rgba(33,43,50,.18);animation:rivaUp .18s ease;')}>
          <Svg w={16} sw={2.4}>{Icons.check}</Svg>
          <span style={s('min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>Copied {flash}</span>
        </div>
      ) : null}

      {/* Docked search bar — fixed to the viewport bottom so its position and
          width never shift as results grow/shrink or a scrollbar appears.
          Uses the shared floating dock (see globals.css) so it matches the
          chat composer on /helpbot and the rule bar on /rota. */}
      <div className="riva-dock">
        <div className="riva-dock-inner" style={s('display:flex;gap:10px;align-items:center;')}>
          <div style={s('position:relative;flex:1;')}>
            <span style={s('position:absolute;left:20px;top:50%;transform:translateY(-50%);color:#4c6272;display:flex;')}>
              <Svg w={22} sw={2.2}>{Icons.search}</Svg>
            </span>
            <input
              ref={inputRef}
              autoFocus
              className="riva-input riva-dock-field riva-dock-field-icon"
              type="text"
              value={query}
              onChange={onChange}
              onKeyDown={onKeyDown}
              placeholder="Name, town, postcode…"
              aria-label="Search the CQC register"
              style={s('width:100%;font:inherit;border:2px solid #d8dde0;border-radius:999px;background:#f0f4f5;color:#212b32;outline:none;')}
            />
            {query ? (
              <Hover tag="button" onClick={() => { setQuery(''); if (inputRef.current) inputRef.current.focus(); }} aria-label="Clear search"
                base="position:absolute;right:12px;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:38px;height:38px;border:none;border-radius:50%;background:none;color:#4c6272;cursor:pointer;"
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
