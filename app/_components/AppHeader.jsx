'use client';

import Link from 'next/link';
import { s, Hover, Svg, Icons } from './ui';

const TABS = [
  { key: 'assistant', label: 'Assistant', icon: Icons.chat },
  { key: 'kb', label: 'Knowledge base', icon: Icons.book },
  { key: 'dpia', label: 'DPIA', icon: Icons.shield },
];

export default function AppHeader({ v, subtitle = 'Reception help & guidance' }) {
  const showTabs = !!(v && v.onSetView);
  return (
    <header className="riva-header" style={s('flex:none;height:72px;display:flex;align-items:center;gap:14px;padding:0 24px;background:#fff;border-bottom:1px solid #d8dde0;')}>
      <Hover tag={Link} href="/" aria-label="Back to practice tools" base="background:none;border:none;padding:0;cursor:pointer;display:flex;align-items:center;flex:none;" hover="opacity:.85;">
        <img src="/assets/nhs-logo.png" alt="NHS — back to practice tools" style={s('height:30px;width:auto;display:block;')} />
      </Hover>
      <div className="riva-head-text" style={s('display:flex;flex-direction:column;line-height:1.15;')}>
        <span className="riva-head-title" style={s('font-weight:700;font-size:18px;white-space:nowrap;')}>The Riverside Practice</span>
        <span style={s('font-size:13px;color:#4c6272;')}>{subtitle}</span>
      </div>
      {showTabs && (
        <div style={s('margin-left:auto;display:flex;gap:12px;align-items:center;')}>
          <div style={s('display:inline-flex;align-items:center;gap:3px;background:#f0f4f5;border:1px solid #d8dde0;border-radius:999px;padding:3px;')}>
            {TABS.map((t) => {
              const active = v.view === t.key;
              return (
                <Hover key={t.key} tag="button" onClick={() => v.onSetView(t.key)} className="riva-tab"
                  base={'display:inline-flex;align-items:center;gap:7px;border:none;border-radius:999px;padding:7px 15px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;' + (active ? 'background:#fff;color:#005eb8;box-shadow:0 1px 2px rgba(33,43,50,.14);' : 'background:none;color:#4c6272;')}
                  hover={active ? '' : 'color:#212b32;'}>
                  <Svg w={16} sw={2}>{t.icon}</Svg><span className="riva-tab-label">{t.label}</span>
                </Hover>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
