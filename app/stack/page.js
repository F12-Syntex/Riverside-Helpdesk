'use client';

import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import StackMap from '../_components/StackMap';

/* ------------------------------------------------------------------ *
 * /stack — what the app is built out of, in nine figures.
 *
 * /diagram answers "how does a question become an answer". This one
 * answers "what is underneath it": layers, turn, model roles, tables,
 * corpus, dependencies, delivery, code size, and everything that leaves
 * the practice. Kept off the tools index — it is for whoever inherits
 * the code, not for reception.
 * ------------------------------------------------------------------ */

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Tech stack" />

      <main style={s('flex:1;width:100%;max-width:1440px;margin:0 auto;padding:32px 24px 56px;')}>
        <Hover tag={Link} href="/diagram"
          base="display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:600;color:#4c6272;text-decoration:none;margin-bottom:14px;"
          hover="color:#005eb8;">
          <Svg w={17} sw={2.2}>{Icons.arrowLeft}</Svg>Back to the system map
        </Hover>

        <StackMap />
      </main>
    </div>
  );
}
