'use client';

import { s } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import RotaSystem from '../_components/rota/RotaSystem';

export default function RotaPage() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Staff rota" />
      <main style={s('flex:1;width:100%;max-width:1000px;margin:0 auto;padding:32px 24px;')}>
        <RotaSystem />
      </main>
    </div>
  );
}
