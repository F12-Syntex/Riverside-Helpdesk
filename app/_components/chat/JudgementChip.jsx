'use client';

import { s } from '../ui';

// Provenance marker for content that comes from the assistant's own judgement
// rather than a practice document — the amber counterpart of CiteChip. Not a
// button: there is no source to open, the flag itself is the information.
export default function JudgementChip({ label = 'AI judgement, not from the practice’s documents' }) {
  return (
    <span style={s('margin-top:8px;display:inline-flex;align-items:center;max-width:100%;background:#fff8e6;border:1px solid #ecd39a;border-radius:999px;padding:4px 12px;font-size:12.5px;font-weight:600;color:#8a6100;')}>
      <span style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{label}</span>
    </span>
  );
}
