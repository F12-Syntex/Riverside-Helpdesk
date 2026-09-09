'use client';

import React from 'react';
import { s, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import RotaSystem from '../_components/rota/RotaSystem';

export default function RotaPage() {
  const [page, setPage] = React.useState('rota');
  const tabs = {
    active: page,
    onSelect: setPage,
    items: [
      { key: 'rota', label: 'Rota', icon: Icons.calendar },
      { key: 'staff', label: 'Staff', icon: Icons.book },
    ],
  };
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Staff rota" tabs={tabs} />
      <main className="riva-rota-main" style={s('flex:1;width:100%;max-width:1000px;margin:0 auto;padding:32px 24px;')}>
        <RotaSystem page={page} />
      </main>
    </div>
  );
}
