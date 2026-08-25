// One citation, built once, for every path that shows one.
//
// A citation is the chip under a line of an answer: which document, where in
// it, and the exact words the line stands on. It has to be built the same way
// wherever it comes from — the Q&A endpoint, the practice-document answer —
// because the rule it enforces is the same rule: a statement is shown as
// document-backed ONLY when the words it quotes are found, verbatim, in a
// passage that was actually retrieved. These functions were private to
// app/api/ask/route.js while it was the only caller. It is not any more, and a
// second copy of this rule is a second rule.
import { normForMatch, quoteContainment } from './quote-match.js';

export function locationOf(chunk) {
  if (chunk.view && chunk.view.page) return 'Page ' + chunk.view.page;
  if (chunk.section) return chunk.section;
  if (chunk.headingPath && chunk.headingPath.length) return chunk.headingPath.join(' › ');
  return 'Document';
}

// Only image formats a browser can actually render inline. Word embeds legacy
// vector art as WMF/EMF ("img-N.x-wmf"), which would show as a broken thumbnail,
// so those are never offered as a step's picture.
const DISPLAYABLE_IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const MAX_CITE_IMAGES = 4;

// Images that belong to this exact source: a notebook note's attached pictures,
// or the rendered image of the cited PDF page. A whole HTML document's images
// used to be attached to every one of its chunks, which is too imprecise to show
// against a single section, so HTML images are only shown when the set is already
// small enough to be section-scoped (the heading-split ingest keeps it so).
export function citeImages(chunk) {
  const imgs = Array.isArray(chunk.images)
    ? chunk.images.filter((u) => typeof u === 'string' && DISPLAYABLE_IMAGE.test(u))
    : [];
  if (!imgs.length) return [];
  if (chunk.view && chunk.view.kind === 'html' && imgs.length > MAX_CITE_IMAGES) return [];
  return imgs.slice(0, MAX_CITE_IMAGES);
}

export function citationFor(chunk, quote = '') {
  // Collapse runs of spaces but keep line breaks: passages (notebook chunks
  // especially) are markdown, and the source panel renders their structure —
  // headings, lists, bold — instead of showing raw markers.
  const tidy = (t) => String(t || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const body = tidy(chunk.text);
  const q = tidy(quote);
  const flat = body.replace(/\s+/g, ' ');
  return {
    docId: chunk.docId,
    docTitle: chunk.docTitle,
    location: locationOf(chunk),
    snippet: flat.length > 220 ? flat.slice(0, 218).trim() + '…' : flat,
    // The full extract that was given to the model as this Source — kept for
    // context and as a fallback when there is no verified quote.
    text: body,
    // The precise verbatim span the step is based on, verified to appear in this
    // source. Empty when the model's quote could not be verified. Drives the
    // exact-passage highlight and the "what this is based on" text.
    quote: q,
    view: chunk.view || null,
    // Pictures that live in this source (notebook attachments / the cited PDF
    // page render) — shown inline in the chat next to the section they back.
    images: citeImages(chunk),
  };
}

// Resolve a step's citation. Given the model's claimed Source number and its
// verbatim quote, find the retrieved chunk that actually contains the quote
// (correcting a wrong source number), and attach the quote so the UI can show
// and highlight the exact words. Falls back to the claimed source when the
// quote can't be verified, so a step is never left without a source.
export function resolveCite(refMap, claimedRef, quote) {
  const quoteN = normForMatch(quote);
  // A source label is only document-backed when there is enough quoted text to
  // verify. Short/missing quotes are suggestions, never evidence.
  if (quoteN.length < 12) return null;

  let bestChunk = null, bestScore = 0;
  for (const [ref, c] of refMap) {
    // Tiny nudge toward the claimed source so an exact tie keeps the model's pick.
    const score = quoteContainment(quoteN, normForMatch(c.text)) + (ref === claimedRef ? 0.001 : 0);
    if (score > bestScore) { bestScore = score; bestChunk = c; }
  }
  if (!bestChunk || bestScore < 0.5) return null; // never present an unverified source as document-backed
  // Show the model's quote only when it appears in the Source verbatim. A partial
  // match means the model trimmed or embellished it (a real opening followed by
  // invented words), so drop the quote and let the UI fall back to the Source's
  // own extract — the reader is never shown model-authored words as a quotation.
  const exact = quoteContainment(quoteN, normForMatch(bestChunk.text)) >= 1;
  return citationFor(bestChunk, exact ? quote : '');
}

// De-duplicate the distinct sources an answer relied on, keyed by document +
// location, preserving order. Used for the "sources this answer used" list.
export function dedupeCitations(cites) {
  const seen = new Set();
  const out = [];
  for (const c of cites) {
    if (!c) continue;
    const key = [c.docId, c.location].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
