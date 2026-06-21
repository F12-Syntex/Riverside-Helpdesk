'use client';

import Link from 'next/link';
import { s, Hover } from './_components/ui';
import AppHeader from './_components/AppHeader';

/* ------------------------------------------------------------------ *
 * Tools index — the landing page for The Riverside Practice.
 *
 * A simple list of NHS-style navigation links. Add more by appending
 * to TOOLS.
 * ------------------------------------------------------------------ */

const TOOLS = [
  {
    href: '/helpbot',
    title: 'Practice Q&A',
    description: 'Ask anything about how the practice works — answers come only from the organisation’s own documents. For all staff.',
  },
  {
    href: '/rota',
    title: 'Staff rota generator',
    description: 'Build and balance staff rotas with help from the practice assistant.',
  },
];

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Tools & guidance" />

      <main style={s('flex:1;width:100%;max-width:760px;margin:0 auto;padding:40px 24px 56px;')}>
        <h1 style={s('font-size:32px;margin:0 0 4px;letter-spacing:-0.02em;')}>Practice tools</h1>
        <p style={s('font-size:17px;color:#4c6272;margin:0 0 28px;')}>Choose a tool to get started.</p>

        <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:18px;')}>
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Hover tag={Link} href={t.href}
                base="font-size:20px;font-weight:600;color:#005eb8;text-decoration:underline;text-underline-offset:.12em;"
                hover="color:#003087;text-decoration-thickness:2px;">
                {t.title}
              </Hover>
              <p style={s('margin:4px 0 0;font-size:16px;color:#4c6272;line-height:1.5;text-wrap:pretty;')}>{t.description}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
