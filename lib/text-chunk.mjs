// Shared passage chunking for canonical storage: split on headings/blank lines,
// pack blocks up to ~900 chars, cap each chunk at 1500. Documents use their RAG
// ingestion chunks; Notebook pages use these only for conflict analysis and
// administration, while the answer prompt receives each live page in full.
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
