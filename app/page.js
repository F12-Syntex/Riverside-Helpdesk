'use client';

import Link from 'next/link';
import { s, Hover, Svg, Icons } from './_components/ui';
import AppHeader from './_components/AppHeader';

/* ------------------------------------------------------------------ *
 * Tools index — the landing page for The Riverside Practice.
 *
 * A simple list of NHS-style navigation links. Add more by appending
 * to TOOLS.
 * ------------------------------------------------------------------ */

const TOOLS = [
  { href: '/helpbot', title: 'Ask a practice question', icon: Icons.chat },
  { href: '/lookup', title: 'Find a phone number', icon: Icons.search },
  // Hidden from the index but still reachable directly:
  //  - /diagram    — the full system map (documentation, not a daily tool)
  //  - /notebook   — write a practice note
  //  - /medications, /rota — medication check and the staff rota generator
  // Uncomment to bring any back onto the index.
  // { href: '/diagram', title: 'How the system works', icon: Icons.sitemap },
  // { href: '/notebook', title: 'Write a practice note', icon: Icons.edit },
  // {
  //   href: '/medications',
  //   title: 'Medication check',
  //   description: 'Look up clear, referenced information about any medicine — from public UK sources (NHS, BNF/NICE, eMC). Add several at once, with an optional question for each. For all staff.',
  // },
  // {
  //   href: '/rota',
  //   title: 'Staff rota generator',
  //   description: 'Build and balance staff rotas with help from the practice assistant.',
  // },
];

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Tools and guidance" />

      <main style={s('flex:1;width:100%;max-width:760px;margin:0 auto;padding:40px 24px 56px;')}>
        <h1 style={s('font-size:32px;margin:0 0 4px;letter-spacing:-0.02em;')}>Practice tools</h1>
        <p style={s('font-size:17px;color:#4c6272;margin:0 0 28px;')}>Choose a tool to get started.</p>

        <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px;')}>
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Hover tag={Link} href={t.href}
                base="display:flex;align-items:center;gap:14px;padding:18px 20px;background:#fff;border-radius:12px;border:1px solid #d8e1e5;font-size:20px;font-weight:600;color:#212b32;text-decoration:none;"
                hover="border-color:#005eb8;background:#f0f6fb;">
                <Svg style={s('flex:none;color:#005eb8;')}>{t.icon}</Svg>
                {t.title}
              </Hover>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
