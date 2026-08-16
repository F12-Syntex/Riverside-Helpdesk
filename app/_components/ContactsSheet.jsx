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
 * The whole directory is already in the page, so it opens instantly and
 * filters as it is typed. Every number is verbatim from
 * lib/contacts.data.json; this sheet chooses what to show and never
 * touches what it says.
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

  const results = React.useMemo(() => searchContacts(query), [query]);
  const searching = query.trim().length > 0;

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
              placeholder="Search a name, a department, part of a number"
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
            <span>{results.length} {results.length === 1 ? 'contact' : 'contacts'}{searching ? ' found' : ''}</span>
            {copied && (
              <span style={s('display:inline-flex;align-items:center;gap:6px;font-weight:600;color:#007f3b;')}>
                <Svg w={13} sw={3}>{Icons.check}</Svg> Copied {copied}
              </span>
            )}
          </div>
        </div>

        {/* The list scrolls inside the sheet, so the search field and the
            count never leave the top of it. */}
        <div className="riva-contacts-list" style={s('max-height:min(56vh,460px);overflow-y:auto;overscroll-behavior:contain;padding:0 20px 18px;')}>
          {results.length === 0 ? (
            <p style={s('margin:18px 4px 8px;font-size:15px;color:#4c6272;')}>
              Nothing here matches “{query.trim()}”. This is the practice’s own list — for anywhere else in England, close this and ask for the number in the question field.
            </p>
          ) : (
            <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;')}>
              {results.map((r, i) => (
                <Row key={r.entry.label + '#' + i} result={r} copied={copied} onCopy={copy} first={i === 0} />
              ))}
            </ul>
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
