'use client';

import React from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from './ui';
import MobileNav from './MobileNav';
import ContactsSheet from './ContactsSheet';


export default function AppHeader({ v, subtitle = 'Practice Q&A', tabs = null }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  // The directory opens over the page it was asked for from, and closes back
  // onto it. Nobody goes anywhere, so a half-typed question is still there
  // afterwards.
  const [contactsOpen, setContactsOpen] = React.useState(false);
  const closeContacts = React.useCallback(() => setContactsOpen(false), []);

  return (
    // The header carries no bar of its own — it sits on the page, as the dock
    // does at the foot of it. On phones it becomes sticky (see globals.css),
    // where it takes a background so text cannot scroll through it.
    <header className="riva-header" style={s('flex:none;height:72px;display:flex;align-items:center;gap:14px;padding:0 24px;background:transparent;')}>
      <Hover tag={Link} href="/" aria-label="Back to practice tools" base="background:none;border:none;padding:0;cursor:pointer;display:flex;align-items:center;flex:none;" hover="opacity:.85;">
        <img src="/assets/nhs-logo.png" alt="NHS, back to practice tools" style={s('height:30px;width:auto;display:block;')} />
      </Hover>
      <div className="riva-head-text" style={s('display:flex;flex-direction:column;line-height:1.15;')}>
        <span className="riva-head-title" style={s('font-weight:700;font-size:18px;white-space:nowrap;')}>The Riverside Practice</span>
        <span style={s('font-size:13px;color:#4c6272;')}>{subtitle}</span>
      </div>

      <div style={s('margin-left:auto;display:flex;gap:12px;align-items:center;flex:none;')}>
        {/* The Sources button is out of the header for now. SourcesView, the
            view state and the menu's own entry are all still wired, so it
            comes back by restoring this button alone. */}

        {/* The practice's own telephone directory. A pill rather than a menu
            entry: it is the thing reception reaches for most, and reaching it
            should never cost more than the one tap. It opens the directory
            over this page rather than going to one — see ContactsSheet. On
            phones it keeps the handset and drops the word (see globals.css). */}
        <Hover tag="button" type="button" onClick={() => setContactsOpen(true)} className="riva-contacts-pill"
          aria-label="Contacts" aria-haspopup="dialog" aria-expanded={contactsOpen ? 'true' : 'false'}
          base="display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border-radius:999px;background:#fff;border:1px solid #d8dde0;color:#005eb8;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;white-space:nowrap;"
          hover="background:#e8f1f8;border-color:#005eb8;color:#003087;">
          <Svg w={16} sw={2.2}>{Icons.phone}</Svg>
          <span className="riva-contacts-pill-label">Contacts</span>
        </Hover>

        {/* Page tabs (e.g. Rota / Staff) — segmented control, shown all sizes. */}
        {tabs && (
          <div className="riva-page-tabs riva-tabs-desktop" style={s('display:inline-flex;align-items:center;gap:3px;background:#f0f4f5;border:1px solid #d8dde0;border-radius:10px;padding:3px;')}>
            {tabs.items.map((t) => {
              const active = tabs.active === t.key;
              return (
                <Hover key={t.key} tag="button" onClick={() => tabs.onSelect(t.key)} className="riva-tab"
                  base={'display:inline-flex;align-items:center;gap:7px;border:none;border-radius:7px;padding:7px 14px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;' + (active ? 'background:#fff;color:#005eb8;box-shadow:0 1px 2px rgba(33,43,50,.14);' : 'background:none;color:#4c6272;')}
                  hover={active ? '' : 'color:#212b32;'}>
                  <Svg w={16} sw={2}>{t.icon}</Svg><span className="riva-tab-label">{t.label}</span>
                </Hover>
              );
            })}
          </div>
        )}

        {/* Mobile: a menu button that opens the full navigation overlay. */}
        <Hover tag="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="riva-nav-btn"
          base="align-items:center;justify-content:center;width:42px;height:42px;border-radius:10px;background:#f0f4f5;border:1px solid #d8dde0;color:#212b32;cursor:pointer;" hover="background:#e8f1f8;border-color:#005eb8;">
          <Svg w={22} sw={2.2}>{Icons.menu}</Svg>
        </Hover>
      </div>

      {menuOpen && (
        <MobileNav v={v} tabs={tabs} onClose={() => setMenuOpen(false)}
          onContacts={() => { setMenuOpen(false); setContactsOpen(true); }} />
      )}
      {contactsOpen && <ContactsSheet onClose={closeContacts} />}
    </header>
  );
}
