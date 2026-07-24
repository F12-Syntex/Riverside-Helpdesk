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
  {
    href: '/signpost',
    title: 'Signpost an AccurX request',
    description: 'Paste a consultation and get a concise pathway — who should handle it, how urgently, and the next steps.',
    icon: Icons.arrow,
  },
  {
    href: '/reason',
    title: 'Reason for appointment',
    description: 'Turn a consultation into a concise clinical reason for the appointment, in medical terms for the doctor.',
    icon: Icons.stethoscope,
  },
  {
    href: '/coding',
    title: 'Code a document',
    description: 'Paste a document or screenshot and get the one-line filing title, ready for the clinical system.',
    icon: Icons.fileLines,
  },
];

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="AccurX & documents" />

      <main style={s('flex:1;width:100%;max-width:760px;margin:0 auto;padding:40px 24px 56px;')}>
        <Hover tag={Link} href="/"
          base="display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:600;color:#4c6272;text-decoration:none;margin-bottom:18px;"
          hover="color:#005eb8;">
          <Svg w={17} sw={2.2}>{Icons.arrowLeft}</Svg>All practice tools
        </Hover>

        <h1 style={s('font-size:32px;margin:0 0 4px;letter-spacing:-0.02em;')}>AccurX &amp; documents</h1>
        <p style={s('font-size:17px;color:#4c6272;margin:0 0 28px;')}>Tools for handling incoming AccurX requests and documents.</p>

        <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px;')}>
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Hover tag={Link} href={t.href}
                base="display:flex;align-items:flex-start;gap:14px;padding:18px 20px;background:#fff;border-radius:12px;border:1px solid #d8e1e5;text-decoration:none;color:#212b32;"
                hover="border-color:#005eb8;background:#f0f6fb;">
                <Svg style={s('flex:none;margin-top:2px;color:#005eb8;')}>{t.icon}</Svg>
                <span style={s('display:flex;flex-direction:column;gap:3px;')}>
                  <span style={s('font-size:20px;font-weight:600;')}>{t.title}</span>
                  <span style={s('font-size:15px;color:#4c6272;line-height:1.45;')}>{t.description}</span>
                </span>
              </Hover>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
