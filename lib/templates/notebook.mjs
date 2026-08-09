// An answer written from the practice's Notebook.
//
// This is the path for everything the templates have no shape for, which is
// most of what staff ask: how registration works, what the nurse does on a
// Wednesday, what to do with a Universal Credit form. The model is handed every
// Notebook page and writes the answer from them.
//
// It is the ONLY place in the assistant where the model composes prose a reader
// acts on, so the grounding is structural rather than trusted:
//
//   - the prompt contains the Notebook and nothing else, so an answer it cannot
//     support from a page is one it has to decline;
//   - it names the pages it used, and a title that is not a real page is
//     dropped here rather than shown — a fabricated citation is worse than no
//     citation, because it reads as provenance;
//   - telephone numbers are still redacted upstream unless a page or the
//     practice directory vouches for them.
//
// What it does NOT do is check every sentence against a verbatim quote. That
// was the old pipeline: it cost a second model call and a repair round, and it
// dropped correct answers whose wording had drifted from the source. The trade
// is deliberate — this path is for questions where being useful matters more
// than being quotable, and the templates still handle everything where a wrong
// value has consequences.
import { answer, text } from './blocks.mjs';

const normTitle = (t) => String(t || '').toLowerCase().replace(/^notebook:\s*/i, '').replace(/\s+/g, ' ').trim();
// Pages are stored with their whole path — "Notebook: Documents and filing /
// Scanning documents" — and the model usually answers with the page's own name.
// Matching only the full string dropped citations off correct answers, which
// reads as "no page named" on an answer that named one perfectly well.
const leafTitle = (t) => normTitle(t).split('/').pop().trim();

/**
 * Build the card.
 *
 * `pages` are the titles the model says it used; `known` is every title the
 * Notebook actually has. Anything not in `known` is dropped.
 */
export function notebookAnswer({ title = '', markdown = '', pages = [], known = [] }) {
  const body = String(markdown || '').trim();
  if (!body) return null;

  const byFull = new Map(known.map((t) => [normTitle(t), t]));
  const byLeaf = new Map(known.map((t) => [leafTitle(t), t]));
  const cited = [];
  for (const page of pages) {
    // Full path first, then the page's own name. A title matching neither is
    // dropped: an invented citation is worse than none, because it reads as
    // provenance.
    const match = byFull.get(normTitle(page)) || byLeaf.get(leafTitle(page)) || null;
    if (match && !cited.includes(match)) cited.push(match);
  }

  return answer({
    title: String(title || '').trim() || 'From the practice Notebook',
    subtitle: cited.length ? '' : 'No page named — worth checking this one',
    blocks: [text(body)],
    source: cited,
  });
}
