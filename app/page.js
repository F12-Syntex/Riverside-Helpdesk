'use client';

import Link from 'next/link';
import { s, Hover, Svg, Icons } from './_components/ui';

/* ------------------------------------------------------------------ *
 * Tools index — the landing page for The Riverside Practice.
 *
 * Each entry is a tool the practice can open. Add more by appending
 * to TOOLS below; the grid lays them out automatically.
 * ------------------------------------------------------------------ */

const TOOLS = [
  {
    href: '/helpbot',
    icon: Icons.chat,
    title: 'Reception help & guidance',
    description: 'Ask how to do something in EMIS, or what to do at the front desk. Answers come from the practice’s own documents.',
  },
];

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>

      <header style={s('flex:none;height:72px;display:flex;align-items:center;gap:14px;padding:0 24px;background:#fff;border-bottom:1px solid #d8dde0;')}>
        <img src="/assets/nhs-logo.png" alt="NHS" style={s('height:30px;width:auto;display:block;')} />
        <div style={s('display:flex;flex-direction:column;line-height:1.15;')}>
          <span style={s('font-weight:700;font-size:18px;white-space:nowrap;')}>The Riverside Practice</span>
          <span style={s('font-size:13px;color:#4c6272;')}>Tools &amp; guidance</span>
        </div>
      </header>

      <main style={s('flex:1;width:100%;max-width:960px;margin:0 auto;padding:48px 24px 56px;')}>
        <div style={s('text-align:center;margin-bottom:32px;')}>
          <div style={s('width:72px;height:72px;border-radius:18px;background:#fff;border:1px solid #d8dde0;box-shadow:0 1px 3px rgba(33,43,50,.08);display:inline-flex;align-items:center;justify-content:center;')}>
            <img src="/assets/logo.png" alt="The Riverside Practice" style={s('width:44px;height:44px;display:block;')} />
          </div>
          <h1 style={s('font-size:36px;margin:18px 0 8px;letter-spacing:-0.02em;')}>Practice tools</h1>
          <p style={s('font-size:19px;color:#4c6272;max-width:560px;margin:0 auto;text-wrap:pretty;')}>Choose a tool to get started.</p>
        </div>

        <div style={s('display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;')}>
          {TOOLS.map((t) => (
            <Hover key={t.href} tag={Link} href={t.href}
              base="display:flex;flex-direction:column;gap:14px;text-decoration:none;color:inherit;background:#fff;border:1px solid #d8dde0;border-radius:16px;box-shadow:0 1px 3px rgba(33,43,50,.08);padding:24px;cursor:pointer;"
              hover="border-color:#005eb8;background:#f7fbff;box-shadow:0 4px 12px rgba(33,43,50,.10);">
              <span style={s('flex:none;width:48px;height:48px;border-radius:12px;background:#e8f1f8;color:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}>
                <Svg w={26} sw={1.9}>{t.icon}</Svg>
              </span>
              <div>
                <div style={s('font-size:20px;font-weight:700;letter-spacing:-0.01em;')}>{t.title}</div>
                <p style={s('margin:6px 0 0;font-size:15.5px;color:#4c6272;line-height:1.5;text-wrap:pretty;')}>{t.description}</p>
              </div>
              <span style={s('margin-top:auto;display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:600;color:#005eb8;')}>
                Open <Svg w={17} sw={2.2}>{Icons.arrow}</Svg>
              </span>
            </Hover>
          ))}
        </div>
      </main>
    </div>
  );
}
