'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { searchContacts } from '@/lib/contacts';

/* ------------------------------------------------------------------ *
 * The practice directory, as a page of its own.
 *
 * The whole directory is in the page from the moment it opens — no
 * request, no spinner, no "no results yet" screen — so searching it is
 * a keystroke rather than a round trip. The field takes the caret on
 * arrival and takes it back whenever anybody starts typing, because the
 * only thing anyone comes here to do is type a name.
 *
 * Every number shown is a verbatim copy of lib/contacts.data.json: this
 * page never reformats one. Clicking the number copies it; the handset
 * beside it dials, for whoever is on a phone.
 * ------------------------------------------------------------------ */

const COPIED_MS = 1400;

// The label with the characters the search matched picked out, so it is
// obvious why an entry is in the list.
function Label({ text, indices }) {
  if (!indices || !indices.length) return <>{text}</>;
  const hit = new Set(indices);
  const parts = [];
  let run = '';
  let runHit = hit.has(0);
  for (let i = 0; i < text.length; i++) {
    const isHit = hit.has(i);
    if (isHit !== runHit) {
      parts.push({ text: run, hit: runHit });
      run = '';
      runHit = isHit;
    }
    run += text[i];
  }
  if (run) parts.push({ text: run, hit: runHit });
  return (
    <>
      {parts.map((p, i) => (p.hit
        ? <mark key={i} style={s('background:#fff2c9;color:inherit;border-radius:3px;padding:0 1px;')}>{p.text}</mark>
        : <span key={i}>{p.text}</span>))}
    </>
  );
}

export default function Page() {
  const [query, setQuery] = React.useState('');
  const [copied, setCopied] = React.useState('');
  const field = React.useRef(null);
  const copyTimer = React.useRef(null);

  const results = React.useMemo(() => searchContacts(query), [query]);
  const searching = query.trim().length > 0;

  React.useEffect(() => () => clearTimeout(copyTimer.current), []);

  // The field starts with the caret, and gets it back the moment somebody
  // types anywhere on the page — so no one has to aim at it first.
  React.useEffect(() => {
    if (field.current) field.current.focus();
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = field.current;
      if (!el || document.activeElement === el) return;
      const tag = (document.activeElement || {}).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key.length === 1 || e.key === 'Backspace') el.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const copy = React.useCallback((display) => {
    const write = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(display)
      : Promise.reject(new Error('no clipboard'));
    write.then(() => {
      setCopied(display);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(''), COPIED_MS);
    }).catch(() => { /* a browser that refuses the clipboard still shows the number */ });
  }, []);

  // Enter takes the obvious action: copy the first number of the best match.
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setQuery(''); return; }
    if (e.key !== 'Enter') return;
    const first = results[0] && results[0].entry;
    const phone = first && (first.phones || [])[0];
    if (phone) copy(phone.display);
  };

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Contacts" />

      <main className="riva-contacts-main" style={s('flex:1;width:100%;max-width:820px;margin:0 auto;padding:24px 24px 64px;')}>
        <h1 className="riva-hero-h1" style={s('font-size:32px;margin:0 0 4px;letter-spacing:-0.02em;')}>Contacts</h1>
        <p style={s('font-size:17px;color:#4c6272;margin:0 0 20px;')}>
          The practice’s own numbers. Type any part of a name, and click a number to copy it.
        </p>

        {/* The search field sticks to the top of the page: the list can be
            scrolled without losing the thing that filters it. */}
        <div style={s('position:sticky;top:0;z-index:10;padding:8px 0 12px;background:linear-gradient(#f0f4f5 78%,rgba(240,244,245,0));')}>
          <div style={s('position:relative;display:flex;')}>
            <span aria-hidden="true" style={s('position:absolute;left:20px;top:50%;transform:translateY(-50%);display:flex;color:#8a99a3;pointer-events:none;')}>
              <Svg w={20} sw={2.2}>{Icons.search}</Svg>
            </span>
            <input
              ref={field}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              type="text"
              autoComplete="off"
              aria-label="Search contacts"
              placeholder="Search contacts — a name, a department, part of a number"
              style={s('flex:1;min-width:0;font:inherit;font-size:17px;padding:16px 52px;border:2px solid #d8dde0;border-radius:999px;background:#fff;outline:none;color:#212b32;')} />
            {searching && (
              <Hover tag="button" type="button" onClick={() => { setQuery(''); if (field.current) field.current.focus(); }} aria-label="Clear search"
                base="position:absolute;right:14px;top:50%;transform:translateY(-50%);width:32px;height:32px;border-radius:50%;background:#f0f4f5;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#4c6272;padding:0;"
                hover="background:#e1e8ea;color:#212b32;">
                <Svg w={14} sw={2.6}>{Icons.close}</Svg>
              </Hover>
            )}
          </div>
        </div>

        <div aria-live="polite" style={s('display:flex;align-items:center;gap:10px;min-height:22px;margin:0 0 14px;padding:0 4px;font-size:13.5px;color:#4c6272;')}>
          <span>{results.length} {results.length === 1 ? 'contact' : 'contacts'}{searching ? ' found' : ''}</span>
          {copied && (
            <span style={s('display:inline-flex;align-items:center;gap:6px;font-weight:600;color:#007f3b;')}>
              <Svg w={14} sw={3}>{Icons.check}</Svg> Copied {copied}
            </span>
          )}
        </div>

        {results.length === 0 ? (
          <div style={s('background:#fff;border:1px solid #d8e1e5;border-radius:14px;padding:32px 24px;text-align:center;')}>
            <p style={s('font-size:17px;font-weight:600;margin:0 0 6px;')}>Nothing here matches “{query.trim()}”</p>
            <p style={s('font-size:15px;color:#4c6272;margin:0;')}>
              This list is the practice’s own numbers only. For anywhere else in England, try{' '}
              <a href="/lookup" style={s('color:#005eb8;')}>Instant lookup</a>.
            </p>
          </div>
        ) : (
          <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;')}>
            {results.map((r, i) => (
              <Row key={r.entry.label + '#' + i} result={r} copied={copied} onCopy={copy} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

// One contact: its name, then everything you can do with it on the same line
// where possible, so the common case is a single click.
function Row({ result, copied, onCopy }) {
  const { entry, indices } = result;
  const phones = entry.phones || [];
  const emails = entry.emails || [];

  return (
    <li className="riva-contact-row" style={s('display:flex;align-items:center;gap:16px;background:#fff;border:1px solid #d8e1e5;border-radius:14px;padding:14px 16px;')}>
      <div style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;')}>
        <span style={s('font-size:16.5px;font-weight:700;color:#212b32;')}>
          <Label text={entry.label} indices={indices} />
        </span>
        {emails.length > 0 && (
          <span style={s('display:flex;flex-wrap:wrap;gap:6px 12px;')}>
            {emails.map((e) => (
              <Hover key={e} tag="a" href={'mailto:' + e}
                base="font-size:13.5px;color:#005eb8;text-decoration:none;overflow-wrap:anywhere;"
                hover="text-decoration:underline;">{e}</Hover>
            ))}
          </span>
        )}
      </div>

      <div className="riva-contact-numbers" style={s('flex:none;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;')}>
        {phones.map((p) => {
          const isCopied = copied === p.display;
          return (
            <span key={p.tel + p.display} style={s('display:inline-flex;align-items:center;gap:2px;')}>
              {/* The number is the button: one click and it is on the clipboard. */}
              <Hover tag="button" type="button" onClick={() => onCopy(p.display)}
                title={'Copy ' + p.display} aria-label={'Copy ' + p.display + ' for ' + entry.label}
                base={'display:inline-flex;align-items:center;gap:8px;border-radius:999px 8px 8px 999px;padding:9px 12px 9px 15px;font:inherit;font-size:16px;font-weight:700;cursor:pointer;border:1px solid '
                  + (isCopied ? '#007f3b;background:#eaf5ee;color:#00602c;' : '#cfdde8;background:#f4f9fc;color:#005eb8;')}
                hover="background:#e8f1f8;border-color:#005eb8;">
                <span style={s('font-variant-numeric:tabular-nums;')}>{p.display}</span>
                <Svg w={14} sw={2.2}>{isCopied ? Icons.check : Icons.copy}</Svg>
              </Hover>
              {/* And for anyone reading this on a phone, the handset dials it. */}
              <Hover tag="a" href={'tel:' + p.tel} title={'Call ' + p.display} aria-label={'Call ' + p.display}
                base="display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:8px 999px 999px 8px;border:1px solid #cfdde8;background:#f4f9fc;color:#005eb8;text-decoration:none;"
                hover="background:#e8f1f8;border-color:#005eb8;">
                <Svg w={15} sw={2.2}>{Icons.phone}</Svg>
              </Hover>
            </span>
          );
        })}
      </div>
    </li>
  );
}
