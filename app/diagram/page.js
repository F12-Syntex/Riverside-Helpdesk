'use client';

import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import SystemMap from '../_components/SystemMap';

/* ------------------------------------------------------------------ *
 * /diagram — the system map on a page of its own. The map itself lives
 * in _components/SystemMap, because the Q&A shows it too.
 * ------------------------------------------------------------------ */

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="System map" />

      <main style={s('flex:1;width:100%;max-width:1440px;margin:0 auto;padding:32px 24px 56px;')}>
        <Hover tag={Link} href="/"
          base="display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:600;color:#4c6272;text-decoration:none;margin-bottom:14px;"
          hover="color:#005eb8;">
          <Svg w={17} sw={2.2}>{Icons.arrowLeft}</Svg>Back to the Q&amp;A
        </Hover>

        <SystemMap />
      </main>
    </div>
  );
}
