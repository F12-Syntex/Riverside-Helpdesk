'use client';

import React from 'react';
import { subscribe, dismiss } from './notify';
import { s, Hover, Svg, Icons } from './ui';

/* ------------------------------------------------------------------ *
 * App-wide notification host. Rendered once in the root layout. Shows
 * toasts top-right under the header on desktop, full-width under the header
 * on mobile (see .riva-notify-host in globals.css).
 * ------------------------------------------------------------------ */

const TYPE = {
  info: { accent: '#e0554f', tint: '#221a1a', icon: Icons.infoCircle },
  success: { accent: '#56c98a', tint: '#12211a', icon: Icons.check },
  error: { accent: '#ff7b72', tint: '#17171a', icon: Icons.alertCircle },
  warn: { accent: '#d9ab52', tint: '#241f12', icon: Icons.triangle },
};

export default function Notifications() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => subscribe(setItems), []);
  if (!items.length) return null;

  return (
    <div className="riva-notify-host">
      {items.map((it) => {
        const t = TYPE[it.type] || TYPE.info;
        return (
          <div key={it.id} className="riva-notify" style={s('display:flex;align-items:flex-start;gap:11px;background:#141416;border:1px solid #26262a;border-radius:12px;padding:13px 14px;box-shadow:0 6px 24px rgba(0,0,0,.14);')}>
            <span style={s('flex:none;width:26px;height:26px;border-radius:50%;background:' + t.tint + ';color:' + t.accent + ';display:inline-flex;align-items:center;justify-content:center;')}><Svg w={16} sw={2.2}>{t.icon}</Svg></span>
            <span style={s('flex:1;min-width:0;font-size:14.5px;line-height:1.45;color:#e9e9ec;white-space:pre-wrap;padding-top:3px;')}>{it.message}</span>
            <Hover tag="button" onClick={() => dismiss(it.id)} aria-label="Dismiss" base="flex:none;background:none;border:none;cursor:pointer;color:#74747d;padding:2px;display:flex;margin:2px -2px 0 0;" hover="color:#e9e9ec;"><Svg w={16}>{Icons.close}</Svg></Hover>
          </div>
        );
      })}
    </div>
  );
}
