'use client';

import React from 'react';

/* ------------------------------------------------------------------ *
 * Small helpers that let us keep the design's inline-style strings
 * almost verbatim while rendering real React.
 * ------------------------------------------------------------------ */

// Convert a CSS declaration string ("a:b;c-d:e") into a React style object.
export function s(str) {
  const o = {};
  if (!str) return o;
  for (const part of String(str).split(';')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (!k) continue;
    const val = part.slice(idx + 1).trim();
    const ck = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    o[ck] = val;
  }
  return o;
}

// Hover/active styling via real CSS pseudo-classes (so it can never get "stuck").
const _hoverReg = new Map();
let _hoverSeq = 0;

function _important(css) {
  return String(css).split(';').map((p) => {
    const i = p.indexOf(':');
    if (i === -1) return '';
    const k = p.slice(0, i).trim();
    const val = p.slice(i + 1).trim();
    if (!k || !val) return '';
    return k + ':' + val + ' !important;';
  }).join('');
}

function _hoverClass(hover, active) {
  const key = hover + '@@' + active;
  let cls = _hoverReg.get(key);
  if (!cls) { cls = 'rh' + (++_hoverSeq); _hoverReg.set(key, cls); }
  return cls;
}

function _injectHover(cls, hover, active) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('rh-' + cls)) return;
  let body = '';
  if (hover) body += '.' + cls + ':hover{' + _important(hover) + '}';
  if (active) body += '.' + cls + ':active{' + _important(active) + '}';
  if (!body) return;
  const el = document.createElement('style');
  el.id = 'rh-' + cls;
  el.textContent = body;
  document.head.appendChild(el);
}

export function Hover({ tag = 'button', base = '', hover = '', active = '', className = '', children, ...rest }) {
  const cls = _hoverClass(hover, active);
  React.useEffect(() => { _injectHover(cls, hover, active); }, [cls, hover, active]);
  const Tag = tag;
  return (
    <Tag {...rest} className={(className ? className + ' ' : '') + cls} style={s(base)}>
      {children}
    </Tag>
  );
}

// Inline SVG wrapper — the inner path/line/etc. geometry is supplied as children.
export function Svg({ w = 24, h, stroke = 'currentColor', sw = 2, fill = 'none', style, children }) {
  return (
    <svg width={w} height={h || w} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {children}
    </svg>
  );
}

// Reusable icon glyphs (the inner geometry only).
export const Icons = {
  triangle: (<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
  alertCircle: (<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>),
  infoCircle: (<><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>),
  phone: (<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></>),
  image: (<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>),
  copy: (<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  up: (<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>),
  close: (<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
  plus: (<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>),
  arrow: (<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>),
  arrowLeft: (<><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>),
  chevronRight: (<><polyline points="9 18 15 12 9 6" /></>),
  shield: (<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></>),
  refresh: (<><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>),
  fileLines: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></>),
  file: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>),
  chat: (<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>),
  check: (<><polyline points="20 6 9 17 4 12" /></>),
  book: (<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>),
};

export function assetSrc(p) {
  if (!p) return p;
  if (/^(https?:)?\//.test(p)) return p;
  return '/' + p;
}
