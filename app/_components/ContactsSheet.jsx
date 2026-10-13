'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Svg, Icons } from './ui';
import { searchContacts } from '@/lib/contacts';
import ContactSearchLoader, { markRegisterWarm, registerIsWarm } from './contacts/ContactSearchLoader';

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
 *
 * It wears the same chrome as every other dialog (the shared popup
 * block in globals.css: the frosted panel, the centred title, the round
 * close) and the Contacts page's language inside it: a filled search
 * pill, matches picked out in blue, numbers as white pills. Nothing opens
 * it at the moment — the header's Contacts pill is off (AppHeader) — but
 * it is kept working for when it comes back.
 * ------------------------------------------------------------------ */

const COPIED_MS = 1400;

// How long the typing has to settle before the register is asked. Short
// enough to feel immediate, long enough that a word typed at speed is one
// request rather than six.
const CQC_DEBOUNCE_MS = 180;

// One letter is not a search — the register is not even asked.
const CQC_MIN_CHARS = 2;

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

const CS_CSS = `
.cs-search{position:relative;display:flex;}
.cs-search__ico{position:absolute;left:16px;top:50%;transform:translateY(-50%);display:flex;color:var(--rv-ink-3);pointer-events:none;transition:color .15s ease;}
.cs-search:focus-within .cs-search__ico{color:var(--rv-accent);}
.cs-input{flex:1;min-width:0;height:46px;padding:0 46px;border:1px solid transparent !important;border-radius:999px;background:var(--rv-surface-3);
  font:inherit;font-size:16px;color:var(--rv-ink);outline:none !important;transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease;}
.cs-input::placeholder{color:var(--rv-ink-4);}
.cs-input:hover{background:#e9eef0;}
.cs-input:focus{background:#fff;border-color:var(--rv-accent) !important;box-shadow:0 0 0 3px rgba(0,94,184,.18);}
.cs-clear{position:absolute;right:11px;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;
  border:none;border-radius:50%;background:var(--rv-ink-3);color:#fff;cursor:pointer;transition:background-color .15s ease;}
.cs-clear:hover{background:var(--rv-ink-2);}
.cs-clear:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}
.cs-status{display:flex;align-items:center;gap:10px;min-height:20px;margin-top:8px;padding:0 8px;font-size:13px;color:var(--rv-ink-2);}
.cs-status__ok{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--rv-green);}
.cs-status__bad{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--rv-danger-ink);}
.cs-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;}
.cs-row{display:flex;align-items:center;gap:14px;padding:12px 4px;}
.cs-row + .cs-row{border-top:1px solid rgba(33,43,50,.07);}
.cs-row__text{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}
.cs-row__name{font-size:15.5px;font-weight:600;color:var(--rv-ink);}
.cs-row__note{font-size:13px;color:var(--rv-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cs-row__mails{display:flex;flex-wrap:wrap;gap:4px 12px;}
.cs-row__mail{font-size:13px;font-weight:550;color:var(--rv-accent);text-decoration:none;overflow-wrap:anywhere;}
.cs-row__mail:hover{text-decoration:underline;text-underline-offset:3px;}
.cs-nums{flex:none;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;}
.cs-num{display:inline-flex;align-items:center;height:34px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px var(--rv-line),0 1px 2px rgba(33,43,50,.05);transition:box-shadow .15s ease;}
.cs-num:hover{box-shadow:0 0 0 1px var(--rv-accent-line),0 3px 8px -3px rgba(0,48,135,.2);}
.cs-num.is-done{box-shadow:0 0 0 1px var(--rv-green);}
/* The number is the button: one click and it is on the clipboard. */
.cs-num__copy{display:inline-flex;align-items:center;gap:7px;height:100%;padding:0 10px 0 13px;border:none;border-radius:999px;background:none;
  font:inherit;font-size:14.5px;font-weight:650;color:var(--rv-accent);cursor:pointer;font-variant-numeric:tabular-nums;white-space:nowrap;}
.cs-num.is-done .cs-num__copy{color:var(--rv-green);}
.cs-num__call{display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;margin-right:3px;border-radius:999px;color:var(--rv-ink-3);
  text-decoration:none;transition:background-color .15s ease,color .15s ease;}
.cs-num__call:hover{background:var(--rv-accent-dim);color:var(--rv-accent);}
.cs-num__copy:focus-visible,.cs-num__call:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.cs-group{position:sticky;top:0;z-index:1;margin:6px 0 0;padding:14px 4px 6px;border-top:1px solid var(--rv-divider);background:rgba(255,255,255,.94);
  font-size:13px;font-weight:600;color:var(--rv-ink-3);}
.cs-note{margin:14px 4px 4px;font-size:14.5px;line-height:1.5;color:var(--rv-ink-2);}
.cs-mark{background:rgba(0,94,184,.1);color:var(--rv-accent);border-radius:3px;}
@media (max-width:700px){
  .cs-row{flex-direction:column;align-items:stretch;gap:8px;}
  .cs-nums{justify-content:flex-start;}
}
`;

// The label with the characters the search matched picked out, so it is
// obvious why an entry is in the list — in the same blue as the Contacts
// page's matches.
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
        ? <mark key={i} className="cs-mark">{p.text}</mark>
        : <span key={i}>{p.text}</span>))}
    </>
  );
}

export default function ContactsSheet({ onClose }) {
  const [query, setQuery] = React.useState('');
  // What the last copy did: { display, ok }. "Copied" is only ever said
  // once the clipboard has said yes.
  const [copied, setCopied] = React.useState(null);
  // The sheet is opened from the header, which sits inside the page's own
  // stacking context — the dock and the hero heading would draw straight
  // through it. Hanging it off <body> puts it above the page it covers
  // whatever the page is made of.
  const [mounted, setMounted] = React.useState(false);
  const field = React.useRef(null);
  const sheet = React.useRef(null);
  const copyTimer = React.useRef(null);
  // What had focus before the sheet opened: it gets it back on closing.
  const opener = React.useRef(null);

  React.useEffect(() => {
    opener.current = document.activeElement;
    setMounted(true);
    return () => {
      const back = opener.current;
      if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
    };
  }, []);

  // The register loads on the server the first time it is asked, which is
  // the one slow moment. Start that as the sheet opens, so it is done by the
  // time the second letter is typed, and say what is loading meanwhile.
  const [warm, setWarm] = React.useState(registerIsWarm);
  React.useEffect(() => {
    if (registerIsWarm()) return undefined;
    let live = true;
    fetch('/api/cqc', { cache: 'no-store' })
      .then(() => { markRegisterWarm(); if (live) setWarm(true); })
      .catch(() => { if (live) setWarm(true); });
    return () => { live = false; };
  }, []);

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
        .then((d) => { markRegisterWarm(); setCqc({ for: trimmed, entries: d.entries || [], loading: false }); })
        .catch(() => { if (!controller.signal.aborted) setCqc({ for: trimmed, entries: [], loading: false }); });
    }, CQC_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [trimmed]);

  // Only ever shown against the query it was fetched for.
  const cqcRows = cqc.for === trimmed ? cqc.entries : [];

  // Escape closes it from anywhere, which is what a keyboard expects of
  // something that opened over what it was doing; and Tab goes round the
  // sheet rather than out into the page it covers.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !sheet.current) return;
      const items = [...sheet.current.querySelectorAll(FOCUSABLE)].filter((n) => n.getClientRects().length);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (!sheet.current.contains(at)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
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
    const show = (ok) => {
      setCopied({ display, ok });
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), ok ? COPIED_MS : 3600);
    };
    // A browser that refuses the clipboard is told so: the number is still
    // on screen to be selected by hand.
    write.then(() => show(true), () => show(false));
  }, []);

  // Enter takes the obvious action: copy the first number of the best match.
  const onFieldKey = (e) => {
    if (e.key !== 'Enter') return;
    const first = results[0] && results[0].entry;
    const phone = first && (first.phones || [])[0];
    if (phone) copy(phone.display);
  };

  if (!mounted) return null;

  const done = copied && copied.ok ? copied.display : '';

  return createPortal(
    <div className="riva-modal-overlay" onMouseDown={onClose}>
      <style dangerouslySetInnerHTML={{ __html: CS_CSS }} />
      <div ref={sheet} className="riva-sheet riva-contacts-sheet" role="dialog" aria-modal="true" aria-labelledby="cs-title"
        style={{ maxWidth: '620px' }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="ap-head">
          <h2 id="cs-title" className="ap-title">Contacts</h2>
          <button type="button" className="ap-close" onClick={onClose} aria-label="Close contacts">
            <Svg w={14} sw={2.6}>{Icons.close}</Svg>
          </button>
        </div>

        <div style={{ padding: '8px 20px 10px' }}>
          <div className="cs-search">
            <span className="cs-search__ico" aria-hidden="true"><Svg w={17} sw={2.2}>{Icons.search}</Svg></span>
            <input
              ref={field}
              className="cs-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onFieldKey}
              type="text"
              autoComplete="off"
              aria-label="Search contacts"
              placeholder="A name, a department, a town, a postcode, a number" />
            {searching && (
              <button type="button" className="cs-clear" onClick={() => { setQuery(''); if (field.current) field.current.focus(); }} aria-label="Clear search">
                <Svg w={13} sw={3}>{Icons.close}</Svg>
              </button>
            )}
          </div>
          <div className="cs-status" aria-live="polite">
            <span>
              {results.length} {results.length === 1 ? 'contact' : 'contacts'}{searching ? ' here' : ''}
              {cqcRows.length ? ' · ' + cqcRows.length + ' on the register' : ''}
            </span>
            {copied && copied.ok && (
              <span className="cs-status__ok"><Svg w={13} sw={3}>{Icons.check}</Svg> Copied {copied.display}</span>
            )}
            {copied && !copied.ok && (
              <span className="cs-status__bad"><Svg w={13} sw={2.4}>{Icons.alertCircle}</Svg> Could not copy. Select the number instead.</span>
            )}
          </div>
        </div>

        {warm ? null : <div style={{ padding: '0 20px' }}><ContactSearchLoader compact verb="Loading" /></div>}

        {/* The list scrolls inside the sheet, which is a fixed size: it is the
            same shape with one match as with a hundred, so nothing under the
            cursor moves as the letters go in. */}
        <div className="riva-contacts-list" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 20px 18px' }}>
          {results.length > 0 && (
            <ul className="cs-list">
              {results.map((r, i) => (
                <Row key={r.entry.label + '#' + i} result={r} done={done} onCopy={copy} />
              ))}
            </ul>
          )}

          {results.length === 0 && (
            <p className="cs-note">
              {searching
                ? 'Nothing in the practice’s own list matches “' + trimmed + '”.'
                : 'Type to search.'}
            </p>
          )}

          {/* Everything else registered in England, under its own heading so
              it is never mistaken for one of the practice's own numbers. */}
          {searching && (cqcRows.length > 0 || cqc.loading) && (
            <>
              <div className="cs-group">CQC register</div>
              {cqcRows.length > 0 ? (
                <ul className="cs-list">
                  {cqcRows.map((entry, i) => (
                    <Row key={entry.id || entry.label + '#cqc' + i} result={{ entry, indices: [] }} done={done} onCopy={copy} />
                  ))}
                </ul>
              ) : (
                <p className="cs-note" role="status">Searching…</p>
              )}
            </>
          )}

          {searching && !cqc.loading && cqcRows.length === 0 && trimmed.length >= CQC_MIN_CHARS && results.length === 0 && (
            <p className="cs-note">
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
function Row({ result, done, onCopy }) {
  const { entry, indices } = result;
  const phones = entry.phones || [];
  const emails = entry.emails || [];

  return (
    <li className="cs-row riva-contact-row">
      <div className="cs-row__text">
        <span className="cs-row__name">
          <Label text={entry.label} indices={indices} />
        </span>
        {/* A register entry carries its address: two branches of the same
            chain are the same name, and this is the line that tells them
            apart. */}
        {entry.note && <span className="cs-row__note">{entry.note}</span>}
        {emails.length > 0 && (
          <span className="cs-row__mails">
            {emails.map((e) => <a key={e} href={'mailto:' + e} className="cs-row__mail">{e}</a>)}
          </span>
        )}
      </div>

      <div className="cs-nums riva-contact-numbers">
        {phones.map((p) => {
          const isCopied = done === p.display;
          return (
            <span key={p.tel + p.display} className={'cs-num' + (isCopied ? ' is-done' : '')}>
              <button type="button" className="cs-num__copy" onClick={() => onCopy(p.display)}
                title={'Copy ' + p.display} aria-label={'Copy ' + p.display + ' for ' + entry.label}>
                <span>{p.display}</span>
                <Svg w={13} sw={2.2}>{isCopied ? Icons.check : Icons.copy}</Svg>
              </button>
              {/* And for anyone reading this on a phone, the handset dials it. */}
              <a href={'tel:' + p.tel} className="cs-num__call" title={'Call ' + p.display} aria-label={'Call ' + p.display}>
                <Svg w={14} sw={2.2}>{Icons.phone}</Svg>
              </a>
            </span>
          );
        })}
      </div>
    </li>
  );
}
