// The Notebook shortlist: which pages the model reads in full on this turn.
//
// The model is shown the shortlisted pages whole and every other page by title
// only. Pages always come from the live Notebook (fullNotebookContext() in
// lib/notebook.js); search results only decide their order. So a page whose
// index row is stale or missing is still shown as the practice wrote it, and a
// page the picker names from the titles list is rendered from the full
// Notebook, which stays loaded in code. Pure, so it is tested without a
// database.
import { notebookFullText } from '../templates/route.mjs';

export const SHORTLIST_SIZE = 12;
// A message asking several things needs room for a page per request.
export const SHORTLIST_SIZE_MULTI = 20;
// A page edited in the last hour may not be embedded yet (that happens in the
// background), and is the page somebody is most likely asking about. It joins
// the shortlist whether or not search ranked it — a handful at most.
export const RECENT_MS = 3600000;
export const RECENT_MAX = 5;

export const OTHER_PAGES_HEADING = 'OTHER PAGES (titles only, text not shown):';

/**
 * Passage hits rolled up to Notebook pages, best first.
 *
 * A page's rank is its best passage's: a long page with one exactly-right
 * paragraph should beat a short page that is vaguely about everything. A hit
 * whose entry is not a page of this Notebook (a document, an archived note the
 * index has not caught up with) is dropped — the index only ranks, it never
 * adds a page.
 */
export function rankPages(hits = [], pages = []) {
  const byDoc = new Map(pages.map((page) => [page.docId, page]));
  const best = new Map();
  for (const hit of hits || []) {
    const page = byDoc.get(hit?.entryId);
    if (!page) continue;
    const score = Number(hit.score) || 0;
    if (!best.has(page.docId) || score > best.get(page.docId)) best.set(page.docId, score);
  }
  return [...best.entries()].sort((a, b) => b[1] - a[1]).map(([docId]) => byDoc.get(docId));
}

function editedAt(page) {
  const t = page?.updatedAt == null ? NaN : new Date(page.updatedAt).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** The top `size` ranked pages, then up to RECENT_MAX recently edited ones not already in. */
export function buildShortlist({ ranked = [], pages = [], size = SHORTLIST_SIZE, now = Date.now() } = {}) {
  const chosen = ranked.slice(0, Math.max(0, size));
  const why = {};
  for (const page of chosen) why[page.docId] = 'match';
  const recent = pages
    .filter((page) => !why[page.docId])
    .map((page) => ({ page, at: editedAt(page) }))
    .filter(({ at }) => Number.isFinite(at) && now - at <= RECENT_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, RECENT_MAX);
  for (const { page } of recent) { chosen.push(page); why[page.docId] = 'recent'; }
  return { full: false, pages: chosen, why };
}

/** The whole Notebook: today's behaviour, for when there is nothing to search with or search failed. */
export function fullShortlist(pages = [], reason = '') {
  return { full: true, pages, why: {}, reason };
}

/**
 * The Notebook as the prompt carries it.
 *
 * A full shortlist is byte-identical to notebookFullText, so a fallback turn
 * reads exactly what every turn read before the shortlist existed. Otherwise
 * the shortlisted pages come first, whole, in the same `### title` shape; then
 * every other page by title, in Notebook order, so the model knows the page
 * exists and can name it even when search missed it.
 */
export function shortlistText(shortlist, allPages = []) {
  if (!shortlist || shortlist.full) return notebookFullText(allPages);
  const shown = new Set(shortlist.pages.map((page) => page.docId));
  const blocks = shortlist.pages.map((page) => `### ${page.docTitle}\n${String(page.text || '').trim()}`);
  const others = allPages.filter((page) => !shown.has(page.docId));
  if (others.length) blocks.push(OTHER_PAGES_HEADING + '\n' + others.map((page) => `- ${page.docTitle}`).join('\n'));
  return blocks.join('\n\n');
}
