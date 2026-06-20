'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { s, Hover, Svg, Icons } from './ui';

/* ------------------------------------------------------------------ *
 * Full-screen mobile navigation menu.
 *
 * Opened from the header's menu button on small screens (the tab pills are
 * hidden there). Uses the same plain NHS-style underlined links as the tools
 * index. Lets staff move between the app's tools and, when on the help bot,
 * between its views (Assistant / Knowledge base / DPIA).
 * ------------------------------------------------------------------ */

const TOOLS = [
  { href: '/', label: 'Practice tools' },
  { href: '/helpbot', label: 'Reception help & guidance' },
  { href: '/rota', label: 'Staff rota generator' },
];

const VIEWS = [
  { key: 'assistant', label: 'Assistant' },
  { key: 'kb', label: 'Knowledge base' },
  { key: 'dpia', label: 'DPIA' },
];

const GROUP_LABEL = 'font-size:13px;font-weight:700;color:#768692;text-transform:uppercase;letter-spacing:.05em;margin:0 0 14px;';
const LINK_BASE = 'font-size:20px;font-weight:600;color:#005eb8;text-decoration:underline;text-underline-offset:.12em;background:none;border:none;padding:0;cursor:pointer;font-family:inherit;text-align:left;';
const LINK_HOVER = 'color:#003087;text-decoration-thickness:2px;';

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

      <div style={s('flex:1;overflow-y:auto;padding:24px 22px 32px;')}>
        <div style={s(GROUP_LABEL)}>Go to</div>
        <nav style={s('display:flex;flex-direction:column;gap:18px;align-items:flex-start;')}>
          {TOOLS.map((t) => (
            pathname === t.href
              ? <span key={t.href} style={s('font-size:20px;font-weight:600;color:#212b32;')}>{t.label} <span style={s('font-size:15px;font-weight:600;color:#768692;')}>· current</span></span>
              : <Hover key={t.href} tag={Link} href={t.href} onClick={onClose} base={LINK_BASE} hover={LINK_HOVER}>{t.label}</Hover>
          ))}
        </nav>

        {showViews && (
          <>
            <div style={s(GROUP_LABEL + 'margin-top:30px;')}>This tool</div>
            <nav style={s('display:flex;flex-direction:column;gap:18px;align-items:flex-start;')}>
              {VIEWS.map((view) => (
                v.view === view.key
                  ? <span key={view.key} style={s('font-size:20px;font-weight:600;color:#212b32;')}>{view.label} <span style={s('font-size:15px;font-weight:600;color:#768692;')}>· current</span></span>
                  : <Hover key={view.key} tag="button" onClick={() => { v.onSetView(view.key); onClose(); }} base={LINK_BASE} hover={LINK_HOVER}>{view.label}</Hover>
              ))}
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
