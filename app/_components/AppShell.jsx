'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Svg, Icons } from './ui';
import { VERSION_LABEL, BUILD_LABEL } from '@/lib/version.mjs';

/* The right-hand end of the crumb bar, offered to whatever page is
   inside the shell. AppHeader renders its controls into it, so a tool's
   actions sit on the same line as the crumb rather than in a band of
   their own underneath it — one row of chrome, not two. Null until the
   shell has mounted, which is what tells AppHeader to hold its render:
   there is no DOM node to portal into on the server. */
export const HeaderSlot = React.createContext(null);

/* ------------------------------------------------------------------ *
 * The rail.
 *
 * Every tool in the app used to be reached from a menu button in the
 * corner, which meant the answer to "what else is here?" cost a tap and
 * was never on screen. The rail answers it permanently, with the page
 * you are on marked.
 *
 * THE GROUPS ARE NAMED FOR THE MOMENT THEY BELONG TO
 * --------------------------------------------------
 * ASK is the front desk with a patient waiting. WORK is the half hour
 * afterwards. REFERENCE is what somebody looks up rather than uses.
 * Reception spends its whole day in the first group, which is why it is
 * at the top and why the Q&A is its first entry.
 *
 * IT IS SHORT ON PURPOSE
 * ----------------------
 * A rail earns its place by being scannable, and a rail listing every
 * route is a menu with extra steps. What is here is what somebody opens
 * on an ordinary day. Everything else is one ⌘K away and is listed in
 * EXTRA below rather than deleted, so the palette still finds it and the
 * crumb still knows its name — nothing became unreachable by leaving
 * the rail.
 *
 * It is fixed, so it does not scroll away, and it is out of the flow, so
 * every page keeps the full-height layout it already had — pages make
 * room for it with a margin (see .riva-shell-main in globals.css) rather
 * than being rebuilt around it.
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

/* Settings is reachable and searchable but sits at the foot of the rail
 * rather than in a group, so it is listed here to give ⌘K and the crumb
 * bar its name.
 *
 * WHAT IS IN NEITHER LIST, AND WHY
 * --------------------------------
 * Signposting, the medication check, the templates, the staff rota, the
 * tools index, the full index, the system map and the coder are off the
 * navigation entirely — the rail AND the palette. A search that offered a
 * tool the rail deliberately leaves out would be the rail's decision
 * undone by the box next to it, and it would make ⌘K the place to
 * rediscover exactly what had just been taken away. Their routes still
 * answer, so a bookmarked address still works; nothing in the app links
 * to them.
 *
 * /knowledge is behind the knowledge-admin check in middleware.js, so
 * for nearly everyone a row for it would be a row that 404s.
 *
 * /stats is the audit log — every question asked and who did what. The
 * note in app/stats/layout.js keeps it off the tools index on purpose,
 * and a row in the rail would undo that more thoroughly than listing it
 * ever did. It is reached by typing its address, as before.
 *
 * The Q&A's own Sources view is not here either, because it is a view of
 * that page rather than a page: it toggles from the crumb bar, so leaving
 * it returns to the half-asked question (see AppHeader).
 */
const EXTRA = [
  { href: '/settings', label: 'Settings', group: 'Reference', icon: Icons.settings },
];

const ALL = GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))).concat(EXTRA);

// One address the router sees under two names. /index is served by the
// page in app/site-index (see the rewrite in next.config.mjs), so the
// server renders this component knowing it as /site-index while the
// browser knows it as /index — and the crumb, worked out from the path,
// came out different on each side. Normalising first is what stops that
// from being a hydration mismatch.
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
  // The crumb still has to say where the reader is: naming it from its
  // own path is honest about that, where falling through to the first
  // entry would tell them they are on the Q&A.
  const seg = pathname.split('/').filter(Boolean)[0];
  if (!seg) return null;
  return { href: '/' + seg, group: 'Riverside', label: seg.charAt(0).toUpperCase() + seg.slice(1) };
}

function NavRow({ item, active, onNavigate }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={'riva-rail-row' + (active ? ' is-active' : '')}
      aria-current={active ? 'page' : undefined}
    >
      <span className="riva-rail-ico"><Svg w={15} sw={1.9}>{item.icon}</Svg></span>
      <span className="riva-rail-label">{item.label}</span>
    </Link>
  );
}

/* The ⌘K list. Not a search of the practice's documents — that is what
   the Q&A field is for, and offering a second box that searched
   something else would be the cruellest thing on the page. This one
   moves between tools, which is the thing a keyboard shortcut is
   actually good at, and it lists the whole app rather than only the part
   the rail shows. */
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
              <span className="riva-rail-ico"><Svg w={15} sw={1.9}>{item.icon}</Svg></span>
              <span className="riva-palette-label">{item.label}</span>
              <span className="riva-palette-group">{item.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname() || '/';
  const [openMobile, setOpenMobile] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  // A callback ref rather than a plain one: the page below has to be
  // re-rendered once the node exists, or it would portal into nothing.
  const [slot, setSlot] = React.useState(null);
  const current = matchHref(pathname);

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

  // The rail closes behind you on a phone: it is a full-screen overlay
  // there, so leaving it open over the page you just asked for would be
  // a dead end.
  React.useEffect(() => { setOpenMobile(false); }, [pathname]);

  return (
    <div className="riva-shell">
      <aside className={'riva-rail' + (openMobile ? ' is-open' : '')} aria-label="Tools">
        {/* Whose service this is, and the way back to the front door. The
            logo is here and nowhere else: it used to be reprinted at the
            top of every page, at 30px, on all of them. */}
        <Link href="/" className="riva-rail-brand">
          <span className="riva-rail-mark"><img src="/assets/nhs-logo.png" alt="NHS" /></span>
          <span className="riva-rail-brandtext">
            <span className="riva-rail-brandname">Riverside</span>
            <span className="riva-rail-brandsub">Practice Q&amp;A</span>
          </span>
          <span className="riva-rail-brandchev" aria-hidden="true"><Svg w={13} sw={2}>{Icons.chevronUpDown}</Svg></span>
        </Link>

        <button type="button" className="riva-rail-search" onClick={() => setPaletteOpen(true)}>
          <span className="riva-rail-ico"><Svg w={15} sw={2}>{Icons.search}</Svg></span>
          <span className="riva-rail-searchlabel">Search</span>
          <kbd className="riva-kbd">⌘K</kbd>
        </button>

        <nav className="riva-rail-nav">
          {GROUPS.map((g) => (
            <div className="riva-rail-group" key={g.label}>
              <div className="riva-rail-grouplabel">{g.label}</div>
              {g.items.map((item) => (
                <NavRow key={item.href} item={item} active={current?.href === item.href}
                  onNavigate={() => setOpenMobile(false)} />
              ))}
            </div>
          ))}
        </nav>

        {/* The foot of the rail: which practice, and which build. It
            exists for one exchange — somebody is told a change is live,
            cannot see it, and needs to say what they are actually looking
            at — so it is a plain caption in a fixed place, with the commit
            in the tooltip. */}
        <div className="riva-rail-foot">
          <div className="riva-rail-status" title={BUILD_LABEL}>
            <span className="riva-rail-statustext">The Riverside Practice</span>
            <span className="riva-rail-ver">{VERSION_LABEL}</span>
          </div>
          <NavRow item={{ href: '/settings', label: 'Settings', icon: Icons.settings }}
            active={pathname.startsWith('/settings')} onNavigate={() => setOpenMobile(false)} />
        </div>
      </aside>

      {/* On a phone the rail is an overlay; this is what closes it. */}
      {openMobile && <div className="riva-rail-scrim" onClick={() => setOpenMobile(false)} role="presentation" />}

      <div className="riva-shell-main">
        {/* The crumb: which group, then which tool. It replaces the page
            titles each tool used to print for itself, so every page says
            where it is in the same words and the same place. */}
        <div className="riva-crumbbar">
          <button type="button" className="riva-crumb-menu" onClick={() => setOpenMobile(true)} aria-label="Open tools">
            <Svg w={19} sw={2}>{Icons.menu}</Svg>
          </button>
          <nav className="riva-crumb" aria-label="Breadcrumb">
            <span className="riva-crumb-group">{current?.group || 'Ask'}</span>
            <span className="riva-crumb-sep" aria-hidden="true">/</span>
            <span className="riva-crumb-here">{current?.label || 'Ask a question'}</span>
          </nav>
          <div className="riva-crumb-actions" ref={setSlot} />
        </div>
        {/* The page scrolls inside the shell rather than the window, so a
            tool that asks for the whole screen gets the whole of what is
            left of it and the crumb never scrolls away. */}
        <div className="riva-shell-body">
          <HeaderSlot.Provider value={slot}>{children}</HeaderSlot.Provider>
        </div>
      </div>

      {paletteOpen && <Palette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
