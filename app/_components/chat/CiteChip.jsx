'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';

// A citation chip. Clicking opens the source in the document viewer; hovering
// (or focusing) reveals the exact source extract that backs the statement, so
// the reader can check the wording without leaving the answer.
export default function CiteChip({ label, snippet, onClick }) {
  const [open, setOpen] = React.useState(false);
  const text = (snippet || '').length > 600 ? snippet.slice(0, 598).trim() + '…' : (snippet || '');

  return (
    <span style={s('position:relative;display:inline-flex;max-width:100%;margin-top:8px;')}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Hover onClick={onClick} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        base="display:inline-flex;align-items:center;gap:7px;max-width:100%;background:#fff;border:1px solid #cfe1f0;border-radius:999px;padding:4px 12px 4px 9px;font:inherit;font-size:12.5px;font-weight:600;color:#005eb8;cursor:pointer;" hover="background:#f7fbff;border-color:#005eb8;">
        <Svg w={13} stroke="#007f3b" sw={2.4} style={s('flex:none;')}>{Icons.shield}</Svg>
        <span style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{label}</span>
      </Hover>

      {text && open && (
        <span role="tooltip" style={s('position:absolute;left:0;bottom:calc(100% + 8px);z-index:60;width:340px;max-width:min(340px,82vw);max-height:min(240px,46vh);overflow-y:auto;overscroll-behavior:contain;background:#212b32;color:#fff;border-radius:10px;padding:11px 13px;font-size:13px;font-weight:400;line-height:1.5;box-shadow:0 6px 22px rgba(33,43,50,.30);text-wrap:pretty;overflow-wrap:anywhere;')}>
          <span style={s('display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#aebfcb;margin-bottom:5px;')}>What this is based on</span>
          <span style={s('display:block;')}>&ldquo;{text}&rdquo;</span>
        </span>
      )}
    </span>
  );
}
