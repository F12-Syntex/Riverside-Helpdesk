// Shared text chunking for retrieval sources: split on headings/blank lines,
// pack blocks up to ~900 chars, cap each chunk at 1500. Used by the
// supplementary-context pipeline (lib/ai/context.mjs) and the Notebook's own
// chunker (lib/notebook.js), which used to each carry an identical copy of
// this plus its own heading-label logic.
export function chunkText(text) {
  const blocks = String(text).replace(/\r\n/g, '\n')
    .split(/\n(?=#{1,6}\s)|\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out = [];
  let cur = '';
  for (const b of blocks) {
    if (!cur) cur = b;
    else if (cur.length + b.length + 2 <= 900) cur += '\n\n' + b;
    else { out.push(cur); cur = b; }
    if (cur.length >= 900) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out.map((s) => (s.length > 1500 ? s.slice(0, 1500) : s));
}

// The heading (or first line) of a chunk, used as its "section" label.
export function chunkHeading(block, i) {
  const m = block.match(/^#{1,6}\s+(.+)/);
  const line = m ? m[1] : block.split('\n')[0];
  return (line || ('Part ' + (i + 1)))
    .replace(/[#*`]/g, '')
    .replace(/^\s*[-•*]\s+/, '')
    .trim().slice(0, 60) || ('Part ' + (i + 1));
}
