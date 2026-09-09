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
  info: { accent: '#005eb8', tint: '#e8f1f8', icon: Icons.infoCircle },
  success: { accent: '#007f3b', tint: '#e6f3ec', icon: Icons.check },
  error: { accent: '#d5281b', tint: '#fbeae8', icon: Icons.alertCircle },
  warn: { accent: '#946800', tint: '#fff6cc', icon: Icons.triangle },
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
          <div key={it.id} className="riva-notify" style={s('display:flex;align-items:flex-start;gap:11px;background:#fff;border:1px solid #d8dde0;border-radius:12px;padding:13px 14px;box-shadow:0 6px 24px rgba(33,43,50,.14);')}>
            <span style={s('flex:none;width:26px;height:26px;border-radius:50%;background:' + t.tint + ';color:' + t.accent + ';display:inline-flex;align-items:center;justify-content:center;')}><Svg w={16} sw={2.2}>{t.icon}</Svg></span>
            <span style={s('flex:1;min-width:0;font-size:14.5px;line-height:1.45;color:#212b32;white-space:pre-wrap;padding-top:3px;')}>{it.message}</span>
            <Hover tag="button" onClick={() => dismiss(it.id)} aria-label="Dismiss" base="flex:none;background:none;border:none;cursor:pointer;color:#768692;padding:2px;display:flex;margin:2px -2px 0 0;" hover="color:#212b32;"><Svg w={16}>{Icons.close}</Svg></Hover>
          </div>
        );
      })}
    </div>
  );
}
