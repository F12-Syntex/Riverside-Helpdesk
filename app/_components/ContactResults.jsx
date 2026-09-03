'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from './ui';
import { Label } from './ContactsSheet';

/* ------------------------------------------------------------------ *
 * Contact mode: the directory IS the page.
 *
 * With Contact chosen on the disc, whatever is typed in the field is a
 * search rather than a question, and this is what the page shows in
 * place of the conversation: every match in the practice's own list,
 * best first, with the CQC register beneath it under its own heading so
 * a number from the register is never mistaken for one of the practice's
 * own. Every number is verbatim from the directory or the register; the
 * search only chooses what to show.
 *
 * It replaces the panel that used to float over the field as soon as
 * something was typed. That panel guessed whether the text was a lookup
 * and was wrong both ways; this list appears only because somebody said
 * they were looking for a contact, so it can afford to be the whole
 * page and to show the whole directory when nothing has been typed yet.
 *
 * The number is the button, as on the contacts sheet: one click and it
 * is on the clipboard, and the row that was copied says so until the
 * next one is. The keyboard walks the list from the field — ↑ ↓ pick a
 * row, Enter copies it, Escape leaves the mode — so the common case is
 * done without the mouse.
 * ------------------------------------------------------------------ */

export default function ContactResults({ v }) {
  // Walking the list with the arrow keys scrolls the page to the row: a
  // selected row below the fold is a selection nobody can see.
  React.useEffect(() => {
    const el = document.querySelector('.riva-contact-results [aria-selected="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [v.contactSelected]);

  return (
    <div className="riva-contact-results" style={s('animation:rivaAnswerIn .3s cubic-bezier(.2,.7,.3,1) both;')}>
      <div style={s('display:flex;align-items:center;gap:12px;margin:8px 0 0;')}>
        <span style={s('flex:none;display:flex;color:#005eb8;')}><Svg w={22} sw={2.2}>{Icons.phone}</Svg></span>
        <h1 style={s('flex:1;min-width:0;font-size:28px;font-weight:700;letter-spacing:-0.02em;margin:0;')}>Contacts</h1>
      </div>
      <div aria-live="polite" style={s('display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin:8px 0 18px;font-size:14px;color:#4c6272;')}>
        <span>{v.contactSummary}</span>
        {v.hasCopied && (
          <span style={s('display:inline-flex;align-items:center;gap:6px;font-weight:600;color:#007f3b;')}>
            <Svg w={13} sw={3}>{Icons.check}</Svg> Copied {v.copiedNumber}
          </span>
        )}
      </div>

      {v.contacts.length === 0 && (
        <p style={s('margin:0;font-size:15px;color:#4c6272;')}>
          {v.contactQuery
            ? 'Nothing in the practice’s own list matches “' + v.contactQuery + '”' + (v.contactRegisterSearching ? ' — searching the register…' : '.')
            : 'Type to search.'}
        </p>
      )}

      <div role="listbox" aria-label="Contacts" style={s('display:flex;flex-direction:column;')}>
        {v.contacts.map((r, i) => (
          <React.Fragment key={r.key}>
            {/* A heading wherever the list changes hands: the practice's own
                numbers, then the register of every service in England. */}
            {r.group !== (v.contacts[i - 1] || {}).group && (
              <div style={s('padding:' + (i ? '22px' : '0') + ' 0 8px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a99a3;')}>
                {r.group}
              </div>
            )}
            <div role="option" aria-selected={r.isSelected} className="riva-contact-row"
              style={s('display:flex;align-items:center;gap:14px;padding:11px 12px;border-radius:12px;border:1px solid ' + (r.isSelected ? '#005eb8;background:#e8f1f8;' : '#dde4e7;background:#fff;') + 'margin-bottom:6px;')}>
              <div style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;')}>
                <span style={s('font-size:15.5px;font-weight:700;color:#212b32;')}>
                  <Label text={r.label} indices={r.indices} />
                </span>
                {r.detail && (
                  <span style={s('font-size:13px;color:#4c6272;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{r.detail}</span>
                )}
                {r.emails.length > 0 && (
                  <span style={s('display:flex;flex-wrap:wrap;gap:4px 12px;')}>
                    {r.emails.map((e) => (
                      <Hover key={e} tag="a" href={'mailto:' + e}
                        base="font-size:13px;color:#005eb8;text-decoration:none;overflow-wrap:anywhere;"
                        hover="text-decoration:underline;">{e}</Hover>
                    ))}
                  </span>
                )}
              </div>
              <div className="riva-contact-numbers" style={s('flex:none;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;')}>
                {r.phones.map((p) => (
                  <span key={p.tel + p.display} style={s('display:inline-flex;align-items:center;gap:2px;')}>
                    {/* The number is the button: one click and it is on the clipboard. */}
                    <Hover tag="button" type="button" onClick={p.onCopy}
                      title={'Copy ' + p.display} aria-label={'Copy ' + p.display + ' for ' + r.label}
                      base={'display:inline-flex;align-items:center;gap:7px;border-radius:999px 7px 7px 999px;padding:7px 10px 7px 13px;font:inherit;font-size:15px;font-weight:700;cursor:pointer;border:1px solid '
                        + (p.isCopied ? '#007f3b;background:#eaf5ee;color:#00602c;' : '#cfdde8;background:#f4f9fc;color:#005eb8;')}
                      hover="background:#e8f1f8;border-color:#005eb8;">
                      <span style={s('font-variant-numeric:tabular-nums;')}>{p.display}</span>
                      <Svg w={13} sw={2.2}>{p.isCopied ? Icons.check : Icons.copy}</Svg>
                    </Hover>
                    {/* And for anyone reading this on a phone, the handset dials it. */}
                    <Hover tag="a" href={'tel:' + p.tel} title={'Call ' + p.display} aria-label={'Call ' + p.display}
                      base="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:7px 999px 999px 7px;border:1px solid #cfdde8;background:#f4f9fc;color:#005eb8;text-decoration:none;"
                      hover="background:#e8f1f8;border-color:#005eb8;">
                      <Svg w={14} sw={2.2}>{Icons.phone}</Svg>
                    </Hover>
                  </span>
                ))}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>

      {v.contactRegisterSearching && v.contacts.length > 0 && (
        <p style={s('margin:10px 4px 0;font-size:14px;color:#8a99a3;')}>Searching the register…</p>
      )}
    </div>
  );
}
