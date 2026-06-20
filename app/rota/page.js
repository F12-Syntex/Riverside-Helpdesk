'use client';

import { s } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import RotaTool from '../_components/rota/RotaTool';

export default function RotaPage() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Staff rota generator" />
      <main style={s('flex:1;width:100%;max-width:820px;margin:0 auto;padding:32px 24px 56px;')}>
        <RotaTool />
      </main>
    </div>
  );
}
