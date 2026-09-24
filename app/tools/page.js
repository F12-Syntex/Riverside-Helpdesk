'use client';

import Link from 'next/link';
import { s, Hover } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * Tools index for The Riverside Practice.
 *
 * A short grid of cards on the light — the shape Emergent gives its
 * showcase — one per tool staff reach for. Add more by appending to
 * TOOLS.
 * ------------------------------------------------------------------ */

const TOOLS = [
  { href: '/', title: 'Ask a practice question', blurb: 'Answered only from the practice’s own documents, with a quote behind every claim.' },
  { href: '/lookup', title: 'Find a phone number', blurb: 'Every service on the CQC register, by name, town, postcode or acronym.' },
  // The practice's own directory is not here: it is the Contacts pill in the
  // bar, on every page, and opens over the page rather than replacing it.
  // Hidden from the index but still reachable directly:
  //  - /settings   — which AI model the assistant runs on (in the menu, not here)
  //  - /diagram    — the full system map (documentation, not a daily tool)
  //  - /notebook   — write a practice note
  //  - /medications, /rota — medication check and the staff rota generator
  // Uncomment to bring any back onto the index.
  // { href: '/diagram', title: 'How the system works' },
  // { href: '/notebook', title: 'Write a practice note' },
];

const CARD = 'display:flex;flex-direction:column;gap:14px;padding:22px 22px 20px;background:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.85);border-radius:18px;text-decoration:none;color:#212b32;box-shadow:0 1px 2px rgba(33,43,50,.04),0 12px 34px rgba(0,48,135,.08);backdrop-filter:saturate(160%) blur(14px);-webkit-backdrop-filter:saturate(160%) blur(14px);transition:transform .18s ease,box-shadow .18s ease,background-color .18s ease;';

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Tools and guidance" />

      <main style={s('flex:1;width:100%;max-width:820px;margin:0 auto;padding:56px 24px 64px;')}>
        <h1 style={s('font-size:36px;margin:0 0 6px;letter-spacing:-0.025em;line-height:1.1;')}>Practice tools</h1>
        <p style={s('font-size:17px;color:#4c6272;margin:0 0 30px;')}>Choose a tool to get started.</p>

        <ul className="riva-grid-2" style={s('list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:14px;')}>
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Hover tag={Link} href={t.href} base={CARD}
                hover="transform:translateY(-2px);background:#fff;box-shadow:0 2px 4px rgba(33,43,50,.05),0 18px 44px rgba(0,48,135,.14);">
                <span style={s('display:flex;flex-direction:column;gap:4px;')}>
                  <span style={s('font-size:18px;font-weight:700;letter-spacing:-0.01em;')}>{t.title}</span>
                  <span style={s('font-size:14.5px;color:#4c6272;line-height:1.45;')}>{t.blurb}</span>
                </span>
              </Hover>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
