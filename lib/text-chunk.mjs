// Shared passage chunking for canonical storage: split on headings/blank lines,
// pack blocks up to ~900 chars, never more than 1500 in one passage. These are
// what search indexes and ranks (lib/search/): a Notebook page is found by its
// best passage, and then shown to the model whole, from the live notes table —
// a passage is never what the model reads as the page. Documents use their RAG
// ingestion chunks instead.
const PACK = 900;
const MAX = 1500;

// A block longer than a passage, cut into passage-sized pieces at the last
// line break, sentence end or space before the cap — at the cap itself only
// when there is none. EVERY CHARACTER IS KEPT: a page is found by its passages,
// so text cut off the end of a long paragraph could never be found at all.
function splitLong(block) {
  const out = [];
  let rest = block;
  while (rest.length > MAX) {
    const head = rest.slice(0, MAX);
    const floor = MAX / 2;
    let cut = head.lastIndexOf('\n');
    if (cut < floor) cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! ')) + 1;
    if (cut < floor) cut = head.lastIndexOf(' ');
    if (cut < floor) cut = MAX;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function chunkText(text) {
  const blocks = String(text).replace(/\r\n/g, '\n')
    .split(/\n(?=#{1,6}\s)|\n{2,}/).map((b) => b.trim()).filter(Boolean)
    .flatMap((b) => (b.length > MAX ? splitLong(b) : [b]));
  const out = [];
  let cur = '';
  for (const b of blocks) {
    if (!cur) cur = b;
    else if (cur.length + b.length + 2 <= PACK) cur += '\n\n' + b;
    else { out.push(cur); cur = b; }
    if (cur.length >= PACK) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
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
