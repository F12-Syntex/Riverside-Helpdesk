'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Svg, Icons } from './ui';
import { VERSION_LABEL, BUILD_LABEL } from '@/lib/version.mjs';

/* The right-hand end of the top bar, offered to whatever page is inside
   the shell. AppHeader renders its controls into it, so a tool's actions
   sit on the same line as the navigation rather than in a band of their
   own underneath it — one row of chrome, not two. Null until the shell
   has mounted, which is what tells AppHeader to hold its render: there
   is no DOM node to portal into on the server. */
export const HeaderSlot = React.createContext(null);

/* The LEFT-hand end of the same bar, after the brand, for a page's way
   back out of what it is showing. It is a second slot rather than a
   corner of the first because the two ends mean different things: the
   right-hand end is what you can DO here, and a back control is not one
   of those — it is where you came from, and it belongs on the side every
   other back control in the world is on. Same rule otherwise: null until
   the shell has mounted, and empty on the pages that pass no back. */
export const HeaderLeadSlot = React.createContext(null);

/* Whether there is a shell at all. True from the first render, server
   included, where the two slots above are still null. AppHeader reads it
   to know that a null slot means "not mounted yet" rather than "no shell":
   the difference between holding its controls for one frame and drawing
   a 56px row of its own into the page, which the server did, and which
   vanished on hydration and shoved the opening screen up by that much —
   the jump that read as a broken entrance. */
export const ShellPresence = React.createContext(false);

/* ------------------------------------------------------------------ *
 * The shell.
 *
 * One bar across the top and the page underneath, on the light. The
 * rail that used to run down the left was a white column on a grey
 * page; with the whole page now sitting on the shader there is nothing
 * for a column to be a column of, and the tools it listed fit in a row
 * of pills in the middle of the bar — the same row Emergent puts its
 * modes in. The page is the page again, edge to edge.
 *
 * THE GROUPS ARE NAMED FOR THE MOMENT THEY BELONG TO
 * --------------------------------------------------
 * ASK is the front desk with a patient waiting. WORK is the half hour
 * afterwards. REFERENCE is what somebody looks up rather than uses.
 * Reception spends its whole day in the first group, which is why it is
 * first in the row and why the Q&A is its first entry.
 *
 * WHAT THE ROW SHOWS, AND WHERE THE REST IS
 * -----------------------------------------
 * The row is the five tools reception reaches for on an ordinary day.
 * Everything else — Settings, the build — is in the menu at the right,
 * and the whole list is one ⌘K away in the palette. On a phone the row
 * folds into that same menu.
 * ------------------------------------------------------------------ */

const GROUPS = [
  {
    label: 'Ask',
    items: [
      { href: '/', label: 'Ask a question', icon: Icons.chat },
      { href: '/lookup', label: 'Contact numbers', icon: Icons.search },
    ],
  },
  {
    label: 'Work',
    items: [
      { href: '/notebook', label: 'Practice notes', icon: Icons.edit },
    ],
  },
  {
    label: 'Reference',
    items: [
      { href: '/dpia', label: 'Data protection', icon: Icons.shield },
      { href: '/feedback', label: 'Answer feedback', icon: Icons.chat },
    ],
  },
];

/* Settings is reachable and searchable but sits in the menu rather than
 * in the row, so it is listed here to give ⌘K its name.
 *
 * WHAT IS IN NEITHER LIST, AND WHY
 * --------------------------------
 * Signposting, the medication check, the templates, the staff rota, the
 * tools index, the full index, the system map and the coder are off the
 * navigation entirely — the row AND the palette. A search that offered a
 * tool the row deliberately leaves out would be the row's decision
 * undone by the box next to it. Their routes still answer, so a
 * bookmarked address still works; nothing in the app links to them.
 *
 * /knowledge is behind the knowledge-admin check in middleware.js, so
 * for nearly everyone a row for it would be a row that 404s.
 *
 * /stats is the audit log — every question asked and who did what. The
 * note in app/stats/layout.js keeps it off the tools index on purpose.
 * It is reached by typing its address, as before.
 *
 * The Q&A's own Sources view is not here either, because it is a view of
 * that page rather than a page: it toggles from the bar's right-hand end,
 * so leaving it returns to the half-asked question (see AppHeader).
 */
const EXTRA = [
  { href: '/settings', label: 'Settings', group: 'Reference', icon: Icons.settings },
];

const ROW = GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
const ALL = ROW.concat(EXTRA);

// One address the router sees under two names. /index is served by the
// page in app/site-index (see the rewrite in next.config.mjs), so the
// server renders this component knowing it as /site-index while the
// browser knows it as /index — and the active entry, worked out from the
// path, came out different on each side. Normalising first is what stops
// that from being a hydration mismatch.
const ALIAS = { '/site-index': '/index' };

// Which entry is the page being looked at? Longest match wins, so /rota
// does not light up for every page and / does not light up for all of
// them.
function matchHref(rawPath) {
  const pathname = ALIAS[rawPath] || rawPath;
  let best = null;
  for (const item of ALL) {
    if (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  if (best) return best;
  // A page neither list names — /stats, reached by typing its address.
  // The bar still has to say where the reader is: naming it from its own
  // path is honest about that, where falling through to the first entry
  // would tell them they are on the Q&A.
  const seg = pathname.split('/').filter(Boolean)[0];
  if (!seg) return null;
  return { href: '/' + seg, group: 'Riverside', label: seg.charAt(0).toUpperCase() + seg.slice(1) };
}

function NavRow({ item, active, onNavigate }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={'riva-menu-row' + (active ? ' is-active' : '')}
      aria-current={active ? 'page' : undefined}
    >
      <span className="riva-menu-ico"><Svg w={15} sw={1.9}>{item.icon}</Svg></span>
      <span className="riva-menu-label">{item.label}</span>
    </Link>
  );
}

/* The ⌘K list. Not a search of the practice's documents — that is what
   the Q&A field is for, and offering a second box that searched
   something else would be the cruellest thing on the page. This one
   moves between tools, which is the thing a keyboard shortcut is
   actually good at, and it lists the whole app rather than only the part
   the row shows. */
function Palette({ onClose }) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef(null);

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ALL;
    return ALL.filter((i) => i.label.toLowerCase().includes(needle) || i.group.toLowerCase().includes(needle));
  }, [q]);

  React.useEffect(() => { inputRef.current?.focus(); }, []);
  React.useEffect(() => { setSel(0); }, [q]);

  const go = React.useCallback((item) => { if (item) { onClose(); router.push(item.href); } }, [onClose, router]);

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((n) => Math.min(n + 1, rows.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((n) => Math.max(n - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); go(rows[sel]); }
  }

  return (
    <div className="riva-palette-scrim" onMouseDown={onClose} role="presentation">
      <div className="riva-palette" role="dialog" aria-modal="true" aria-label="Go to"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="riva-palette-field">
          <span className="riva-palette-ico"><Svg w={16} sw={2}>{Icons.search}</Svg></span>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Go to a tool…" aria-label="Go to a tool" className="riva-palette-input" />
          <kbd className="riva-kbd">esc</kbd>
        </div>
        <div className="riva-palette-list">
          {rows.length === 0 && <div className="riva-palette-empty">Nothing here by that name.</div>}
          {rows.map((item, i) => (
            <button key={item.href} type="button" onClick={() => go(item)} onMouseMove={() => setSel(i)}
              className={'riva-palette-row' + (i === sel ? ' is-sel' : '')}>
              <span className="riva-menu-ico"><Svg w={15} sw={1.9}>{item.icon}</Svg></span>
              <span className="riva-palette-label">{item.label}</span>
              <span className="riva-palette-group">{item.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* The menu at the right-hand end of the bar: every tool by group,
   Settings, and which build this is. On a desktop it is the long form of
   the row; on a phone it is the row. */
function Menu({ current, pathname, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div ref={ref} className="riva-menu" role="menu" aria-label="All tools">
      {GROUPS.map((g) => (
        <div className="riva-menu-group" key={g.label}>
          <div className="riva-menu-grouplabel">{g.label}</div>
          {g.items.map((item) => (
            <NavRow key={item.href} item={item} active={current?.href === item.href} onNavigate={onClose} />
          ))}
        </div>
      ))}
      <div className="riva-menu-group">
        <NavRow item={{ href: '/settings', label: 'Settings', icon: Icons.settings }}
          active={pathname.startsWith('/settings')} onNavigate={onClose} />
      </div>
      {/* Which practice, and which build. It exists for one exchange —
          somebody is told a change is live, cannot see it, and needs to
          say what they are actually looking at — so it is a plain caption
          in a fixed place, with the commit in the tooltip. */}
      <div className="riva-menu-foot" title={BUILD_LABEL}>
        <span className="riva-menu-foottext">The Riverside Practice</span>
        <span className="riva-menu-ver">{VERSION_LABEL}</span>
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname() || '/';
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  // A callback ref rather than a plain one: the page below has to be
  // re-rendered once the node exists, or it would portal into nothing.
  const [slot, setSlot] = React.useState(null);
  const [lead, setLead] = React.useState(null);
  const current = matchHref(pathname);
  const closeMenu = React.useCallback(() => setMenuOpen(false), []);

  // ⌘K / Ctrl-K anywhere, except while something is already being typed
  // into — the Q&A field is the one thing on the page people are here to
  // use, and it must never lose a keystroke to the chrome around it.
  React.useEffect(() => {
    function onKey(e) {
      const k = e.key?.toLowerCase();
      if (k === 'k' && (e.metaKey || e.ctrlKey)) {
        const el = document.activeElement;
        const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        if (typing && !e.metaKey && !e.ctrlKey) return;
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The menu closes behind you: leaving it open over the page you just
  // asked for would be a dead end.
  React.useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <div className="riva-shell">
      {/* Three glass islands floating on the light, not a bar: who this is
          (with the way back beside it), the tools, and what can be done
          here. Nothing joins them, so the page runs edge to edge behind. */}
      <header className="riva-top">
        <div className="riva-top-left riva-island">
          {/* Whose service this is, and the way back to the front door. The
              logo is here and nowhere else. */}
          <Link href="/" className="riva-brand" aria-label="The Riverside Practice — home">
            <span className="riva-brand-mark"><img src="/assets/nhs-logo.png" alt="NHS" /></span>
            <span className="riva-brand-name">Riverside</span>
          </Link>

          {/* Where the reader is, when the row is folded away. */}
          <span className="riva-top-here">{current?.label || 'Ask a question'}</span>
        </div>

        {/* A page's way back: a pill hanging under the brand, on its own,
            where a hand goes for "back" and where nothing else is. */}
        <div className="riva-crumb-lead" ref={setLead} />

        <nav className="riva-topnav" aria-label="Tools">
          {ROW.map((item) => {
            const active = current?.href === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={'riva-topnav-item' + (active ? ' is-active' : '')}
                aria-current={active ? 'page' : undefined}>
                <span className="riva-topnav-ico"><Svg w={15} sw={2}>{item.icon}</Svg></span>
                <span className="riva-topnav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="riva-top-right riva-island">
          {/* Where a tool's own controls land (see AppHeader). */}
          <div className="riva-crumb-actions" ref={setSlot} />
          <button type="button" className="riva-top-btn riva-top-search" onClick={() => setPaletteOpen(true)}
            aria-label="Go to a tool (⌘K)" title="Go to a tool — ⌘K">
            <Svg w={17} sw={2}>{Icons.search}</Svg>
          </button>
          <div className="riva-top-menuwrap">
            <button type="button" className={'riva-top-btn' + (menuOpen ? ' is-on' : '')} onClick={() => setMenuOpen((v) => !v)}
              aria-label="All tools" aria-haspopup="menu" aria-expanded={menuOpen ? 'true' : 'false'}>
              <Svg w={19} sw={2}>{Icons.menu}</Svg>
            </button>
            {menuOpen && <Menu current={current} pathname={pathname} onClose={closeMenu} />}
          </div>
        </div>
      </header>

      {/* The page scrolls inside the shell rather than the window, so a
          tool that asks for the whole screen gets the whole of what is
          left of it and the bar never scrolls away. */}
      <div className="riva-shell-body">
        <ShellPresence.Provider value={true}>
          <HeaderSlot.Provider value={slot}>
            <HeaderLeadSlot.Provider value={lead}>{children}</HeaderLeadSlot.Provider>
          </HeaderSlot.Provider>
        </ShellPresence.Provider>
      </div>

      {paletteOpen && <Palette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
