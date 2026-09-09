'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { s, Hover, Svg, Icons } from './ui';
import ContactsSheet from './ContactsSheet';
import { HeaderSlot } from './AppShell';

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
 * controls render into a bar of their own for that one frame. That is
 * also what a page rendered outside the shell falls back to.
 *
 * `subtitle` is still accepted and still ignored — every page passes one,
 * and the crumb bar above says it now. Kept in the signature so no page
 * had to be edited to stop passing it.
 * ------------------------------------------------------------------ */

const PILL = 'display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:9px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s ease,border-color .15s ease,color .15s ease;';
const PILL_REST = 'background:#fff;border:1px solid #d8dde0;color:#005eb8;';
const PILL_ON = 'background:#e8f1f8;border:1px solid #005eb8;color:#003087;';
const PILL_HOVER = 'background:#e8f1f8;border-color:#005eb8;color:#003087;';

export default function AppHeader({ v, subtitle = null, tabs = null, onContacts = null }) {
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
      {slot
        ? createPortal(controls, slot)
        : <header className="riva-header" style={s('flex:none;height:56px;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:0 20px;background:transparent;')}>{controls}</header>}
      {/* The directory is a dialog over the whole app, so it stays in the
          page's own tree. Portalled into the crumb bar it would inherit
          that bar's stacking context and open underneath the rail. */}
      {ownsSheet && contactsOpen && <ContactsSheet onClose={closeContacts} />}
    </>
  );
}
