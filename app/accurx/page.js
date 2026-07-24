'use client';

import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * AccurX & documents — a folder grouping the tools that turn an
 * incoming AccurX consultation or a scanned document into something the
 * team can act on: signpost it, summarise its clinical reason, or code
 * a document for filing. Reached from the tools index; each card opens
 * the tool itself.
 * ------------------------------------------------------------------ */

const TOOLS = [
  { href: '/signpost', title: 'Signpost a request', icon: Icons.arrow },
  { href: '/reason', title: 'Reason for appointment', icon: Icons.stethoscope },
  { href: '/coding', title: 'Code a document', icon: Icons.fileLines },
];

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="AccurX & documents" />

      <main style={s('flex:1;width:100%;max-width:760px;margin:0 auto;padding:40px 24px 56px;')}>
        <h1 style={s('font-size:32px;margin:0 0 4px;letter-spacing:-0.02em;')}>AccurX &amp; documents</h1>
        <p style={s('font-size:17px;color:#4c6272;margin:0 0 28px;')}>Tools for handling incoming AccurX requests and documents.</p>

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
