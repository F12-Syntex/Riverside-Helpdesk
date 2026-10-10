// One turn's Notebook shortlist: search the index, roll the hits up to the
// live pages, fall back to the whole Notebook whenever search cannot help.
import { orQuery, shortlistQuery } from './query.mjs';
import {
  SHORTLIST_SIZE, SHORTLIST_SIZE_MULTI, buildShortlist, fullShortlist, rankPages,
} from './shortlist.mjs';

// Enough passages to fill a 20-page shortlist even when the best pages each
// match on several passages.
const SEARCH_LIMIT = 80;

// Loaded on first use rather than imported: search.mjs reaches the database
// and the embedding API, and keeping it out of this module's import graph lets
// the shortlist rules be tested with a search passed in.
async function searchNotes(query, options) {
  const { searchPassages } = await import('./search.mjs');
  return searchPassages(query, options);
}

/**
 * The shortlist for one question.
 *
 * NEVER WORSE THAN BEFORE. Every path that cannot produce a meaningful
 * shortlist returns the whole Notebook, which is what every turn read before
 * search existed:
 * - 'no-text': nothing to search with (a picture with no words, "??").
 * - 'search-failed': the database or the embedding API is down. Logged, not
 *   thrown — a turn must not fail because its shortcut did.
 * - 'no-match': search ran and found nothing on any page. With the semantic
 *   arm working there is always a nearest page, so this means the lexical
 *   arm missed and the vectors were unavailable; a titles-only prompt would
 *   leave the writer nothing to answer from.
 */
export async function notebookShortlist({
  question = '', history = '', attached = '', pages = [], multi = false, search = searchNotes,
} = {}) {
  const query = shortlistQuery({ question, history, attached });
  if (!orQuery(query)) return fullShortlist(pages, 'no-text');
  let hits;
  try {
    hits = await search(query, { kinds: ['note'], limit: SEARCH_LIMIT });
  } catch (e) {
    console.warn('[search] notebook shortlist failed, using the whole Notebook: ' + String(e?.message || e).slice(0, 200));
    return fullShortlist(pages, 'search-failed');
  }
  const ranked = rankPages(hits, pages);
  if (!ranked.length) return fullShortlist(pages, 'no-match');
  return buildShortlist({ ranked, pages, size: multi ? SHORTLIST_SIZE_MULTI : SHORTLIST_SIZE });
}
