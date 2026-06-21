'use client';

import { s } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import DpiaView from '../_components/DpiaView';

/* ------------------------------------------------------------------ *
 * Data protection check (DPIA) — its own page.
 *
 * The DPIA covers the whole Riverside Helpdesk program, so it lives at
 * the top level alongside the other tools rather than inside the help
 * bot. The header carries no view tabs here — just the document.
 * ------------------------------------------------------------------ */

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Data protection" />
      <main style={s('flex:1;width:100%;')}>
        <DpiaView />
      </main>
    </div>
  );
}
