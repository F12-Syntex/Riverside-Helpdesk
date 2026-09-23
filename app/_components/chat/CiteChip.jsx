'use client';

import { s, Hover } from '../ui';

// A citation reference: which document, and where in it, the statement above
// came from. Quiet enough not to compete with the answer, but readable — it is
// what someone points at when they are asked "says who?". Clicking opens the
// source in the side panel, showing the exact extract the statement is based
// on (and, on desktop, the full document).
export default function CiteChip({ label, onClick }) {
  return (
    <Hover onClick={onClick} className="riva-lift" title="Open the source"
      base="margin-top:8px;display:inline-flex;align-items:center;max-width:100%;background:#fff;border:1px solid #dde4e7;border-radius:999px;padding:5px 12px;font:inherit;font-size:13.5px;font-weight:600;color:#4c6272;cursor:pointer;transition:border-color .16s ease,background-color .16s ease,color .16s ease;"
      hover="border-color:#005eb8;background:#f7fbff;color:#005eb8;">
      <span style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{label}</span>
    </Hover>
  );
}
