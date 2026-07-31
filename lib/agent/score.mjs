// Word matching, with no dependencies.
//
// Kept apart from tools.mjs deliberately: that module reaches the knowledge
// store, the document index and the network, while this is arithmetic over two
// strings. Selection (select.mjs) and planning (research.mjs) both need the
// scoring without any of that, and it stays directly testable.
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'when', 'how', 'does', 'are', 'you', 'your', 'has', 'have', 'can', 'our', 'not', 'who', 'why', 'about', 'into', 'they', 'them']);

export function terms(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// Lexical score for a page. Title hits count quadruple, and how many of the
// question's words the page covers matters more than raw frequency (a page
// mentioning every word beats one that says a single word ten times).
export function lexicalScore(text, title, want) {
  if (!want.length) return 0;
  const body = String(text || '').toLowerCase();
  const head = String(title || '').toLowerCase();
  let hits = 0;
  let covered = 0;
  for (const w of want) {
    const inBody = body.split(w).length - 1;
    const inHead = head.split(w).length - 1;
    if (inBody || inHead) covered++;
    hits += Math.min(inBody, 8) + inHead * 4;
  }
  return (covered / want.length) * 10 + Math.min(hits, 40) / 40;
}
