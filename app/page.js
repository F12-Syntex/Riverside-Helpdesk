'use client';

import Link from 'next/link';
import { s, Hover, Svg, Icons } from './_components/ui';

/* ------------------------------------------------------------------ *
 * Tools index — the landing page for The Riverside Practice.
 *
 * A simple list of navigation links. Add more by appending to TOOLS.
 * ------------------------------------------------------------------ */

const TOOLS = [
  {
    href: '/helpbot',
    icon: Icons.chat,
    title: 'Reception help & guidance',
    description: 'Ask how to do something in EMIS, or what to do at the front desk.',
  },
];

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;')}>
      <main style={s('max-width:600px;margin:0 auto;padding:64px 24px 56px;')}>

        <div style={s('display:flex;align-items:center;gap:14px;margin-bottom:8px;')}>
          <img src="/assets/nhs-logo.png" alt="NHS" style={s('height:30px;width:auto;display:block;')} />
          <span style={s('font-weight:700;font-size:18px;')}>The Riverside Practice</span>
        </div>
        <h1 style={s('font-size:30px;margin:20px 0 4px;letter-spacing:-0.02em;')}>Practice tools</h1>
        <p style={s('font-size:17px;color:#4c6272;margin:0 0 28px;')}>Choose a tool to get started.</p>

        <nav style={s('background:#fff;border:1px solid #d8dde0;border-radius:12px;overflow:hidden;')}>
          {TOOLS.map((t, i) => (
            <Hover key={t.href} tag={Link} href={t.href}
              base={'display:flex;align-items:center;gap:14px;text-decoration:none;color:inherit;padding:16px 18px;cursor:pointer;' + (i ? 'border-top:1px solid #eef2f4;' : '')}
              hover="background:#f7fbff;">
              <span style={s('flex:none;width:38px;height:38px;border-radius:9px;background:#e8f1f8;color:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}>
                <Svg w={20} sw={2}>{t.icon}</Svg>
              </span>
              <span style={s('flex:1;min-width:0;')}>
                <span style={s('display:block;font-size:17px;font-weight:600;color:#212b32;')}>{t.title}</span>
                <span style={s('display:block;font-size:14.5px;color:#768692;margin-top:1px;text-wrap:pretty;')}>{t.description}</span>
              </span>
              <Svg w={18} sw={2.2} stroke="#768692" style={s('flex:none;')}>{Icons.chevronRight}</Svg>
            </Hover>
          ))}
        </nav>

      </main>
    </div>
  );
}
