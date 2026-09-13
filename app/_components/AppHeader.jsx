'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { s, Hover, Svg, Icons } from './ui';
import ContactsSheet from './ContactsSheet';
import { HeaderSlot, HeaderLeadSlot, ShellPresence } from './AppShell';

/* ------------------------------------------------------------------ *
 * The action row at the top of a tool.
 *
 * It used to carry the NHS logo, the practice's name and the name of the
 * tool, on every page. The rail now says all three — permanently, and in
 * one place — so repeating them here was a second answer to a question
 * nobody was still asking, and it cost the page 72px of its best space.
 *
 * What is left is the part that was never said anywhere else: the things
 * you can DO on this page — Contacts, Sources, and a tool's own tabs —
 * and they are not drawn here at all. They are portalled up into the
 * right-hand end of the shell's crumb bar, so the page begins at the top
 * of the page and the chrome is one row rather than two.
 *
 * Until the shell has mounted there is no slot to portal into, so the
 * controls are held for that one frame. Only a page rendered with no
 * shell at all (ShellPresence false) gets a bar of its own — inside the
 * shell that bar used to be server-rendered into the page and then
 * vanish on hydration, moving everything under it up by 56px.
 *
 * `subtitle` is still accepted and still ignored — every page passes one,
 * and the crumb bar above says it now. Kept in the signature so no page
 * had to be edited to stop passing it.
 *
 * `back` is a page's way out of what it is showing — { label, onClick } —
 * and it goes to the LEFT of the crumb, not in with the controls on the
 * right. The Q&A drew its own underneath the bar, in a band of its own,
 * left-aligned to the window while the answer it belonged to was centred
 * in an 820px column; on a wide screen it sat some 400px away from
 * anything it had to do with. Handing it to the shell is what puts it
 * back on the same row as the rest of the chrome.
 * ------------------------------------------------------------------ */

const PILL = 'display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:9px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s ease,border-color .15s ease,color .15s ease;';
const PILL_REST = 'background:#fff;border:1px solid #d8dde0;color:#005eb8;';
const PILL_ON = 'background:#e8f1f8;border:1px solid #005eb8;color:#003087;';
const PILL_HOVER = 'background:#e8f1f8;border-color:#005eb8;color:#003087;';
// The way back is solid where every other pill is white: it is the one
// control on the bar that undoes something, and it has to be seen first.
const BACK = 'background:#005eb8;border:1px solid #005eb8;color:#fff;box-shadow:0 6px 18px rgba(0,94,184,.28);';
const BACK_HOVER = 'background:#003087;border-color:#003087;color:#fff;';

export default function AppHeader({ v, subtitle = null, tabs = null, onContacts = null, back = null }) {
  // The directory opens over the page it was asked for from, and closes back
  // onto it. Nobody goes anywhere, so a half-typed question is still there
  // afterwards.
  //
  // A page that puts the Contacts pill somewhere better than a header corner —
  // the Q&A page has it under the box, where it is actually seen — passes its
  // own opener in. The header then drops its pill rather than showing a second
  // one.
  const [contactsOpen, setContactsOpen] = React.useState(false);
  const closeContacts = React.useCallback(() => setContactsOpen(false), []);
  const openContacts = onContacts || (() => setContactsOpen(true));
  const ownsSheet = !onContacts;

  // Sources — everything the assistant is allowed to read from. It is a
  // view of the Q&A page rather than a page of its own, so it toggles
  // here rather than being a rail entry: leaving it puts the reader back
  // on the question they were part-way through asking.
  const canSources = !!(v && v.onSetView);

  const slot = React.useContext(HeaderSlot);
  const lead = React.useContext(HeaderLeadSlot);
  const inShell = React.useContext(ShellPresence);

  // Styled as the other chrome pills are, so the bar reads as one row of
  // controls rather than a back control that wandered in from elsewhere.
  const backControl = back ? (
    <Hover tag="button" type="button" onClick={back.onClick} className="riva-crumb-back"
      aria-label={back.label || 'Back'}
      base={PILL + BACK} hover={BACK_HOVER}>
      <Svg w={15} sw={2.1}>{Icons.arrowLeft}</Svg>
      <span className="riva-crumb-back-label">{back.label || 'Back'}</span>
    </Hover>
  ) : null;

  const controls = (
    <>
      {canSources && (
        <Hover tag="button" type="button" onClick={() => v.onSetView(v.isKb ? 'assistant' : 'kb')}
          aria-pressed={v.isKb ? 'true' : 'false'} className="riva-contacts-pill"
          base={PILL + (v.isKb ? PILL_ON : PILL_REST)}
          hover={v.isKb ? '' : PILL_HOVER}>
          <Svg w={15} sw={2.1}>{Icons.book}</Svg>
          <span className="riva-contacts-pill-label">{v.isKb ? 'Back to questions' : 'Sources'}</span>
        </Hover>
      )}

      {/* Page tabs (e.g. Rota / Staff) — a segmented control, at every size. */}
      {tabs && (
        <div className="riva-page-tabs" style={s('display:inline-flex;align-items:center;gap:2px;background:#f0f4f5;border:1px solid #d8dde0;border-radius:9px;padding:3px;')}>
          {tabs.items.map((t) => {
            const active = tabs.active === t.key;
            return (
              <Hover key={t.key} tag="button" onClick={() => tabs.onSelect(t.key)} className="riva-tab"
                base={'display:inline-flex;align-items:center;gap:7px;border:none;border-radius:7px;padding:6px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background-color .15s ease,color .15s ease;'
                  + (active ? 'background:#fff;color:#005eb8;box-shadow:0 1px 2px rgba(33,43,50,.14);' : 'background:none;color:#4c6272;')}
                hover={active ? '' : 'color:#212b32;'}>
                <Svg w={15} sw={2}>{t.icon}</Svg><span className="riva-tab-label">{t.label}</span>
              </Hover>
            );
          })}
        </div>
      )}

      {/* The practice's own telephone directory. A pill rather than a rail
          entry: it is the thing reception reaches for most, and reaching it
          should never cost more than the one tap. It opens the directory over
          this page rather than going to one — see ContactsSheet. On phones it
          keeps the handset and drops the word (see globals.css). */}
      {ownsSheet && (
        <Hover tag="button" type="button" onClick={openContacts} className="riva-contacts-pill"
          aria-label="Contacts" aria-haspopup="dialog" aria-expanded={contactsOpen ? 'true' : 'false'}
          base={PILL + PILL_REST} hover={PILL_HOVER}>
          <Svg w={15} sw={2.1}>{Icons.phone}</Svg>
          <span className="riva-contacts-pill-label">Contacts</span>
        </Hover>
      )}
    </>
  );

  return (
    <>
      {backControl && lead && createPortal(backControl, lead)}
      {slot
        ? createPortal(controls, slot)
        : inShell ? null : (
          // No shell to portal into: the page draws its own row, with the
          // way back at the left and the controls still at the right.
          <header className="riva-header" style={s('flex:none;height:56px;display:flex;align-items:center;gap:10px;padding:0 20px;background:transparent;')}>
            {!lead && backControl}
            <div style={s('margin-left:auto;display:flex;align-items:center;gap:10px;')}>{controls}</div>
          </header>
        )}
      {/* The directory is a dialog over the whole app, so it stays in the
          page's own tree. Portalled into the crumb bar it would inherit
          that bar's stacking context and open underneath the rail. */}
      {ownsSheet && contactsOpen && <ContactsSheet onClose={closeContacts} />}
    </>
  );
}
