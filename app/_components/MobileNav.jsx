'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { s, Hover, Svg, Icons } from './ui';

/* ------------------------------------------------------------------ *
 * Full-screen mobile navigation menu.
 *
 * Opened from the header's menu button on small screens (the tab pills are
 * hidden there). Lets staff move between the app's tools and, when on the
 * help bot, between its views (Assistant / Knowledge base / DPIA).
 * ------------------------------------------------------------------ */

const TOOLS = [
  { href: '/', label: 'Practice tools', icon: Icons.home },
  { href: '/helpbot', label: 'Reception help & guidance', icon: Icons.chat },
  { href: '/rota', label: 'Staff rota generator', icon: Icons.calendar },
];

const VIEWS = [
  { key: 'assistant', label: 'Assistant', icon: Icons.chat },
  { key: 'kb', label: 'Knowledge base', icon: Icons.book },
  { key: 'dpia', label: 'DPIA', icon: Icons.shield },
];

const GROUP_LABEL = 'font-size:13px;font-weight:700;color:#768692;text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px;';
const ROW = 'display:flex;align-items:center;gap:14px;text-decoration:none;color:inherit;width:100%;text-align:left;background:#fff;border:1px solid #eef2f4;border-radius:12px;padding:15px 16px;cursor:pointer;font:inherit;';
const ROW_ACTIVE = 'border-color:#005eb8;background:#f7fbff;';

function row(active) {
  return ROW + (active ? ROW_ACTIVE : '');
}

export default function MobileNav({ v, onClose }) {
  const pathname = usePathname();
  const showViews = !!(v && v.onSetView);

  return (
    <div style={s('position:fixed;inset:0;z-index:80;background:#fff;display:flex;flex-direction:column;')}>
      <div style={s('flex:none;height:72px;display:flex;align-items:center;gap:14px;padding:0 18px;border-bottom:1px solid #d8dde0;')}>
        <img src="/assets/nhs-logo.png" alt="NHS" style={s('height:28px;width:auto;display:block;')} />
        <span style={s('flex:1;min-width:0;font-weight:700;font-size:17px;')}>Menu</span>
        <Hover tag="button" onClick={onClose} aria-label="Close menu" base="flex:none;background:none;border:none;cursor:pointer;color:#4c6272;padding:6px;display:flex;" hover="color:#212b32;"><Svg w={26}>{Icons.close}</Svg></Hover>
      </div>

      <div style={s('flex:1;overflow-y:auto;padding:20px 18px 32px;')}>
        <div style={s(GROUP_LABEL)}>Go to</div>
        <div style={s('display:flex;flex-direction:column;gap:10px;')}>
          {TOOLS.map((t) => {
            const active = pathname === t.href;
            return (
              <Hover key={t.href} tag={Link} href={t.href} onClick={onClose} base={row(active)} hover="border-color:#005eb8;background:#f7fbff;">
                <span style={s('flex:none;width:38px;height:38px;border-radius:9px;background:#e8f1f8;color:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}><Svg w={20} sw={2}>{t.icon}</Svg></span>
                <span style={s('flex:1;min-width:0;font-size:17px;font-weight:600;')}>{t.label}</span>
                <Svg w={18} sw={2.2} stroke="#768692" style={s('flex:none;')}>{Icons.chevronRight}</Svg>
              </Hover>
            );
          })}
        </div>

        {showViews && (
          <>
            <div style={s(GROUP_LABEL + 'margin-top:26px;')}>This tool</div>
            <div style={s('display:flex;flex-direction:column;gap:10px;')}>
              {VIEWS.map((view) => {
                const active = v.view === view.key;
                return (
                  <Hover key={view.key} tag="button" onClick={() => { v.onSetView(view.key); onClose(); }} base={row(active)} hover="border-color:#005eb8;background:#f7fbff;">
                    <span style={s('flex:none;width:38px;height:38px;border-radius:9px;background:#e8f1f8;color:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}><Svg w={20} sw={2}>{view.icon}</Svg></span>
                    <span style={s('flex:1;min-width:0;font-size:17px;font-weight:600;')}>{view.label}</span>
                    {active && <Svg w={18} sw={2.6} stroke="#005eb8" style={s('flex:none;')}>{Icons.check}</Svg>}
                  </Hover>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
