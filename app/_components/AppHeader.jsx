'use client';

import React from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from './ui';
import MobileNav from './MobileNav';

const TABS = [
  { key: 'assistant', label: 'Assistant', icon: Icons.chat },
  { key: 'kb', label: 'Knowledge base', icon: Icons.book },
];

export default function AppHeader({ v, subtitle = 'Practice Q&A', tabs = null }) {
  const showTabs = !!(v && v.onSetView);
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <header className="riva-header" style={s('flex:none;height:72px;display:flex;align-items:center;gap:14px;padding:0 24px;background:#fff;border-bottom:1px solid #d8dde0;')}>
      <Hover tag={Link} href="/" aria-label="Back to practice tools" base="background:none;border:none;padding:0;cursor:pointer;display:flex;align-items:center;flex:none;" hover="opacity:.85;">
        <img src="/assets/nhs-logo.png" alt="NHS — back to practice tools" style={s('height:30px;width:auto;display:block;')} />
      </Hover>
      <div className="riva-head-text" style={s('display:flex;flex-direction:column;line-height:1.15;')}>
        <span className="riva-head-title" style={s('font-weight:700;font-size:18px;white-space:nowrap;')}>The Riverside Practice</span>
        <span style={s('font-size:13px;color:#4c6272;')}>{subtitle}</span>
      </div>

      <div style={s('margin-left:auto;display:flex;gap:12px;align-items:center;flex:none;')}>
        {/* Desktop: tab pills for the bot views. Hidden on mobile. */}
        {showTabs && (
          <div className="riva-tabs-desktop" style={s('display:inline-flex;align-items:center;gap:3px;background:#f0f4f5;border:1px solid #d8dde0;border-radius:10px;padding:3px;')}>
            {TABS.map((t) => {
              const active = v.view === t.key;
              return (
                <Hover key={t.key} tag="button" onClick={() => v.onSetView(t.key)} className="riva-tab"
                  base={'display:inline-flex;align-items:center;gap:7px;border:none;border-radius:7px;padding:7px 15px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;' + (active ? 'background:#fff;color:#005eb8;box-shadow:0 1px 2px rgba(33,43,50,.14);' : 'background:none;color:#4c6272;')}
                  hover={active ? '' : 'color:#212b32;'}>
                  <Svg w={16} sw={2}>{t.icon}</Svg><span className="riva-tab-label">{t.label}</span>
                </Hover>
              );
            })}
          </div>
        )}

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

      {menuOpen && <MobileNav v={v} tabs={tabs} onClose={() => setMenuOpen(false)} />}
    </header>
  );
}
