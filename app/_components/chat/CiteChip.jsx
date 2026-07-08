'use client';

import { s, Hover, Svg, Icons } from '../ui';

// A citation reference, kept deliberately quiet: a small grey text link under
// the statement it backs. Clicking opens the source in the side panel, which
// shows the exact extract the statement is based on (and, on desktop, the full
// document).
export default function CiteChip({ label, onClick }) {
  return (
    <Hover onClick={onClick} title="Open the source" base="margin-top:5px;display:inline-flex;align-items:center;gap:5px;max-width:100%;background:none;border:none;padding:0;font:inherit;font-size:12px;font-weight:500;color:#768692;cursor:pointer;" hover="color:#005eb8;">
      <Svg w={11} sw={2} style={s('flex:none;opacity:.75;')}>{Icons.fileLines}</Svg>
      <span style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px dotted #b9c2c8;')}>{label}</span>
    </Hover>
  );
}
