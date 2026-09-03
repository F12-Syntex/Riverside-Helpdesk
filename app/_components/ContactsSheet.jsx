'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { s, Hover, Svg, Icons } from './ui';
import { searchContacts } from '@/lib/contacts';

/* ------------------------------------------------------------------ *
 * The practice directory, over the page rather than instead of it.
 *
 * Reception works on one screen — the question field — and looking a
 * number up is something done in the middle of a call, not somewhere
 * you go. So this is a sheet on top of whatever was open: the page it
 * covers is still there behind it, still holding the question that was
 * half-typed, and closing it puts you back exactly where you were.
 * Nothing navigates, so there is nothing to come back from.
 *
 * The practice's own directory is already in the page, so it opens
 * instantly and filters as it is typed. Behind it, the same box searches
 * the CQC register — every service registered in England — which is far
 * too large to send to the browser and so is asked for over /api/cqc as
 * the typing settles. The practice's own numbers always come first: they
 * are the ones reception actually rings.
 *
 * Every number is verbatim from lib/contacts.data.json or from the
 * register itself; this sheet chooses what to show and never touches
 * what it says.
 * ------------------------------------------------------------------ */

const COPIED_MS = 1400;

// How long the typing has to settle before the register is asked. Short
// enough to feel immediate, long enough that a word typed at speed is one
// request rather than six.
const CQC_DEBOUNCE_MS = 180;

// One letter is not a search — the register is not even asked.
const CQC_MIN_CHARS = 2;

// The label with the characters the search matched picked out, so it is
// obvious why an entry is in the list. Shared with the Contact mode's page
// (app/_components/ContactResults.jsx), which shows the same search.
export function Label({ text, indices }) {
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

export default function ContactsSheet({ onClose }) {
  const [query, setQuery] = React.useState('');
  const [copied, setCopied] = React.useState('');
  // The sheet is opened from the header, which sits inside the page's own
  // stacking context — the dock and the hero heading would draw straight
  // through it. Hanging it off <body> puts it above the page it covers
  // whatever the page is made of.
  const [mounted, setMounted] = React.useState(false);
  const field = React.useRef(null);
  const copyTimer = React.useRef(null);

  React.useEffect(() => setMounted(true), []);

  const [cqc, setCqc] = React.useState({ for: '', entries: [], loading: false });
  const results = React.useMemo(() => searchContacts(query), [query]);
  const trimmed = query.trim();
  const searching = trimmed.length > 0;

  // The register, asked for once the typing settles. Each request replaces
  // the one before it, and a reply that arrives after the query has moved on
  // is dropped rather than shown against the wrong search.
  React.useEffect(() => {
    if (trimmed.length < CQC_MIN_CHARS) { setCqc({ for: '', entries: [], loading: false }); return undefined; }
    setCqc((c) => ({ ...c, loading: true }));
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/cqc?q=' + encodeURIComponent(trimmed), { cache: 'no-store', signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { entries: [] }))
        .then((d) => setCqc({ for: trimmed, entries: d.entries || [], loading: false }))
        .catch(() => { if (!controller.signal.aborted) setCqc({ for: trimmed, entries: [], loading: false }); });
    }, CQC_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmed]);

  // Only ever shown against the query it was fetched for.
  const cqcRows = cqc.for === trimmed ? cqc.entries : [];

  // Escape closes it from anywhere, which is what a keyboard expects of
  // something that opened over what it was doing.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // And it opens with the caret already in the field — which can only happen
  // once the portal exists, so this waits for it rather than running on the
  // first render, where there is no field to focus yet.
  React.useEffect(() => {
    if (mounted && field.current) field.current.focus();
  }, [mounted]);

  // The page behind holds still while the sheet is open, so scrolling the
  // list never scrolls what it is covering.
  React.useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  React.useEffect(() => () => clearTimeout(copyTimer.current), []);

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
  const onFieldKey = (e) => {
    if (e.key !== 'Enter') return;
    const first = results[0] && results[0].entry;
    const phone = first && (first.phones || [])[0];
    if (phone) copy(phone.display);
  };

  if (!mounted) return null;

  return createPortal(
    <div className="riva-modal-overlay" role="dialog" aria-modal="true" aria-label="Contacts" onMouseDown={onClose}>
      <div className="riva-sheet riva-contacts-sheet" style={{ maxWidth: '620px' }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={s('display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #e4eaec;')}>
          <span style={s('flex:none;display:flex;color:#005eb8;')}><Svg w={19} sw={2.2}>{Icons.phone}</Svg></span>
          <h2 style={s('flex:1;min-width:0;font-size:19px;margin:0;letter-spacing:-0.01em;')}>Contacts</h2>
          <Hover tag="button" type="button" onClick={onClose} aria-label="Close contacts"
            base="flex:none;width:34px;height:34px;border-radius:50%;background:#f0f4f5;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#4c6272;padding:0;"
            hover="background:#e1e8ea;color:#212b32;">
            <Svg w={16} sw={2.4}>{Icons.close}</Svg>
          </Hover>
        </div>

        <div style={s('padding:14px 20px 10px;')}>
          <div style={s('position:relative;display:flex;')}>
            <span aria-hidden="true" style={s('position:absolute;left:16px;top:50%;transform:translateY(-50%);display:flex;color:#8a99a3;pointer-events:none;')}>
              <Svg w={17} sw={2.2}>{Icons.search}</Svg>
            </span>
            <input
              ref={field}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onFieldKey}
              type="text"
              autoComplete="off"
              aria-label="Search contacts"
              placeholder="A name, a department, a town, a postcode, a number"
              style={s('flex:1;min-width:0;font:inherit;font-size:16px;padding:12px 44px;border:2px solid #d8dde0;border-radius:999px;background:#f8fafb;outline:none;color:#212b32;')} />
            {searching && (
              <Hover tag="button" type="button" onClick={() => { setQuery(''); if (field.current) field.current.focus(); }} aria-label="Clear search"
                base="position:absolute;right:11px;top:50%;transform:translateY(-50%);width:28px;height:28px;border-radius:50%;background:#e8edee;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#4c6272;padding:0;"
                hover="background:#d8dfe1;color:#212b32;">
                <Svg w={13} sw={2.6}>{Icons.close}</Svg>
              </Hover>
            )}
          </div>
          <div aria-live="polite" style={s('display:flex;align-items:center;gap:10px;min-height:20px;margin-top:8px;padding:0 6px;font-size:13px;color:#4c6272;')}>
            <span>
              {results.length} {results.length === 1 ? 'contact' : 'contacts'}{searching ? ' here' : ''}
              {cqcRows.length ? ' · ' + cqcRows.length + ' on the register' : ''}
              {cqc.loading && searching ? ' · searching the register…' : ''}
            </span>
            {copied && (
              <span style={s('display:inline-flex;align-items:center;gap:6px;font-weight:600;color:#007f3b;')}>
                <Svg w={13} sw={3}>{Icons.check}</Svg> Copied {copied}
              </span>
            )}
          </div>
        </div>

        {/* The list scrolls inside the sheet, which is a fixed size: it is the
            same shape with one match as with a hundred, so nothing under the
            cursor moves as the letters go in. */}
        <div className="riva-contacts-list" style={s('flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 20px 18px;')}>
          {results.length > 0 && (
            <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;')}>
              {results.map((r, i) => (
                <Row key={r.entry.label + '#' + i} result={r} copied={copied} onCopy={copy} first={i === 0} />
              ))}
            </ul>
          )}

          {results.length === 0 && (
            <p style={s('margin:16px 4px 4px;font-size:14.5px;color:#4c6272;')}>
              {searching
                ? 'Nothing in the practice’s own list matches “' + trimmed + '”.'
                : 'Type to search.'}
            </p>
          )}

          {/* Everything else registered in England, under its own heading so
              it is never mistaken for one of the practice's own numbers. */}
          {searching && (cqcRows.length > 0 || cqc.loading) && (
            <>
              <div style={s('position:sticky;top:0;background:#fff;padding:14px 4px 6px;margin-top:6px;border-top:1px solid #eef1f2;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a99a3;')}>
                CQC register
              </div>
              {cqcRows.length > 0 ? (
                <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;')}>
                  {cqcRows.map((entry, i) => (
                    <Row key={entry.id || entry.label + '#cqc' + i} result={{ entry, indices: [] }} copied={copied} onCopy={copy} first={i === 0} />
                  ))}
                </ul>
              ) : (
                <p style={s('margin:6px 4px;font-size:14px;color:#8a99a3;')}>Searching…</p>
              )}
            </>
          )}

          {searching && !cqc.loading && cqcRows.length === 0 && trimmed.length >= CQC_MIN_CHARS && results.length === 0 && (
            <p style={s('margin:6px 4px;font-size:14px;color:#4c6272;')}>
              Nothing on the register either. Try fewer words, or a town or postcode.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// One contact: its name, then everything you can do with it on the same line,
// so the common case is a single click.
function Row({ result, copied, onCopy, first }) {
  const { entry, indices } = result;
  const phones = entry.phones || [];
  const emails = entry.emails || [];

  return (
    <li className="riva-contact-row" style={s('display:flex;align-items:center;gap:14px;padding:11px 4px;' + (first ? '' : 'border-top:1px solid #eef1f2;'))}>
      <div style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;')}>
        <span style={s('font-size:15.5px;font-weight:700;color:#212b32;')}>
          <Label text={entry.label} indices={indices} />
        </span>
        {/* A register entry carries its address: two branches of the same
            chain are the same name, and this is the line that tells them
            apart. */}
        {entry.note && (
          <span style={s('font-size:13px;color:#4c6272;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{entry.note}</span>
        )}
        {emails.length > 0 && (
          <span style={s('display:flex;flex-wrap:wrap;gap:4px 12px;')}>
            {emails.map((e) => (
              <Hover key={e} tag="a" href={'mailto:' + e}
                base="font-size:13px;color:#005eb8;text-decoration:none;overflow-wrap:anywhere;"
                hover="text-decoration:underline;">{e}</Hover>
            ))}
          </span>
        )}
      </div>

      <div className="riva-contact-numbers" style={s('flex:none;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;')}>
        {phones.map((p) => {
          const isCopied = copied === p.display;
          return (
            <span key={p.tel + p.display} style={s('display:inline-flex;align-items:center;gap:2px;')}>
              {/* The number is the button: one click and it is on the clipboard. */}
              <Hover tag="button" type="button" onClick={() => onCopy(p.display)}
                title={'Copy ' + p.display} aria-label={'Copy ' + p.display + ' for ' + entry.label}
                base={'display:inline-flex;align-items:center;gap:7px;border-radius:999px 7px 7px 999px;padding:7px 10px 7px 13px;font:inherit;font-size:15px;font-weight:700;cursor:pointer;border:1px solid '
                  + (isCopied ? '#007f3b;background:#eaf5ee;color:#00602c;' : '#cfdde8;background:#f4f9fc;color:#005eb8;')}
                hover="background:#e8f1f8;border-color:#005eb8;">
                <span style={s('font-variant-numeric:tabular-nums;')}>{p.display}</span>
                <Svg w={13} sw={2.2}>{isCopied ? Icons.check : Icons.copy}</Svg>
              </Hover>
              {/* And for anyone reading this on a phone, the handset dials it. */}
              <Hover tag="a" href={'tel:' + p.tel} title={'Call ' + p.display} aria-label={'Call ' + p.display}
                base="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:7px 999px 999px 7px;border:1px solid #cfdde8;background:#f4f9fc;color:#005eb8;text-decoration:none;"
                hover="background:#e8f1f8;border-color:#005eb8;">
                <Svg w={14} sw={2.2}>{Icons.phone}</Svg>
              </Hover>
            </span>
          );
        })}
      </div>
    </li>
  );
}
