'use client';

import { s } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * Staff rota generator.
 *
 * Placeholder scaffold. The full front-end design will be dropped in
 * here and wired up to the practice AI system (see lib/ai/client.js).
 * ------------------------------------------------------------------ */

export default function RotaPage() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Staff rota generator" />

      <main style={s('flex:1;width:100%;max-width:760px;margin:0 auto;padding:40px 24px 56px;')}>
        <h1 style={s('font-size:32px;margin:0 0 4px;letter-spacing:-0.02em;')}>Staff rota generator</h1>
        <p style={s('font-size:17px;color:#4c6272;margin:0;')}>This tool is being set up.</p>
      </main>
    </div>
  );
}
