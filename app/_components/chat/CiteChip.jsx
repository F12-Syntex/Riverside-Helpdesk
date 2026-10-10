'use client';

import { s, Hover } from '../ui';

const CHIP_BASE = 'display:inline-flex;align-items:center;max-width:100%;background:#fff;border:1px solid #dde4e7;border-radius:999px;padding:5px 12px;font:inherit;font-size:13.5px;font-weight:600;color:#4c6272;cursor:pointer;text-decoration:none;transition:border-color .16s ease,background-color .16s ease,color .16s ease;';
const CHIP_HOVER = 'border-color:#005eb8;background:#f7fbff;color:#005eb8;';
const CHIP_LABEL = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

// The pages a Notebook answer was written from, as the line it ends on —
// "Sources: [Blood tests](/notebook/…) · …", lifted out by splitSources in
// ./links.mjs. The same chip as a citation, because it answers the same
// "says who?", but it is a real link, opened in a new tab so the unsaved chat
// is kept. A source whose address was not allowed keeps its name and is not
// clickable.
export function SourceChips({ sources }) {
  if (!sources || !sources.length) return null;
  return (
    <div style={s('margin-top:10px;display:flex;flex-wrap:wrap;align-items:center;gap:6px;')}>
      <span style={s('font-size:12.5px;color:#768692;font-weight:600;margin-right:2px;')}>Sources</span>
      {sources.map((src, i) => {
        const label = <span style={s(CHIP_LABEL)}>{src.label}</span>;
        if (!src.target) {
          return <span key={i} style={s(CHIP_BASE + 'cursor:default;')}>{label}</span>;
        }
        if (src.target.kind === 'internal') {
          return (
            <Hover key={i} tag="a" href={src.target.href} target="_blank" rel="noopener" className="riva-lift"
              title="Open this page of the Notebook in a new tab"
              base={CHIP_BASE} hover={CHIP_HOVER}>{label}</Hover>
          );
        }
        return (
          <Hover key={i} tag="a" href={src.target.href} target="_blank" rel="noopener noreferrer" className="riva-lift"
            title={src.target.href} base={CHIP_BASE} hover={CHIP_HOVER}>{label}</Hover>
        );
      })}
    </div>
  );
}

// A citation reference: which document, and where in it, the statement above
// came from. Quiet enough not to compete with the answer, but readable — it is
// what someone points at when they are asked "says who?". Clicking opens the
// source in the side panel, showing the exact extract the statement is based
// on (and, on desktop, the full document).
export default function CiteChip({ label, onClick }) {
  return (
    <Hover onClick={onClick} className="riva-lift" title="Open the source"
      base={'margin-top:8px;' + CHIP_BASE} hover={CHIP_HOVER}>
      <span style={s(CHIP_LABEL)}>{label}</span>
    </Hover>
  );
}
