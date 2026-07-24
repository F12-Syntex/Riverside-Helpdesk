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
    href: '/lookup',
    title: 'Find a phone number',
    description: 'Search hospitals, departments and pharmacies by name — typos OK.',
  },
  {
    href: '/helpbot',
    title: 'Ask a practice question',
    description: 'Answers come only from the practice’s own documents.',
  },
  // Medication check and the Staff rota generator are hidden from the index
  // for now (the /medications and /rota routes still work if visited
  // directly). Uncomment to bring them back.
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
  {
    href: '/notebook',
    title: 'Write a practice note',
    description: 'Saved notes feed the practice Q&A instantly.',
  },
  {
    href: '/dpia',
    title: 'Data protection check (DPIA)',
    description: 'Status of the programme’s data protection impact assessment.',
  },
];

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Tools and guidance" />

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
