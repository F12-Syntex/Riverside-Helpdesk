'use client';

import { s, Hover, Svg, Icons } from '../ui';

// A citation chip. Clicking opens the source in the side panel, which shows the
// exact extract that backs the statement (and, on desktop, the full document).
export default function CiteChip({ label, onClick }) {
  return (
    <Hover onClick={onClick} base="margin-top:8px;display:inline-flex;align-items:center;gap:7px;max-width:100%;background:#fff;border:1px solid #cfe1f0;border-radius:999px;padding:4px 12px 4px 9px;font:inherit;font-size:12.5px;font-weight:600;color:#005eb8;cursor:pointer;" hover="background:#f7fbff;border-color:#005eb8;">
      <Svg w={13} stroke="#007f3b" sw={2.4} style={s('flex:none;')}>{Icons.shield}</Svg>
      <span style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{label}</span>
    </Hover>
  );
}
