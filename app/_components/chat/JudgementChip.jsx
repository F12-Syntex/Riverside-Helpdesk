'use client';

import { s, Svg, Icons } from '../ui';

// Provenance marker for content that comes from the assistant's own judgement
// rather than a practice document — the amber counterpart of CiteChip. Not a
// button: there is no source to open, the flag itself is the information.
export default function JudgementChip({ label = 'AI judgement — not from the practice’s documents' }) {
  return (
    <span style={s('margin-top:8px;display:inline-flex;align-items:center;gap:7px;max-width:100%;background:#fff8e6;border:1px solid #ecd39a;border-radius:999px;padding:4px 12px 4px 9px;font-size:12.5px;font-weight:600;color:#8a6100;')}>
      <Svg w={13} stroke="#b58500" sw={2.2} style={s('flex:none;')}>{Icons.sparkle}</Svg>
      <span style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{label}</span>
    </span>
  );
}
