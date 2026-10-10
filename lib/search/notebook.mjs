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
 *
 * `pages` MAY BE A PROMISE. Search needs the pages only to roll its hits up,
 * not to run, so a caller still loading the Notebook hands over the load and
 * the search runs beside it: the embedding call and the Notebook read overlap
 * instead of queueing.
 */
export async function notebookShortlist({
  question = '', history = '', attached = '', pages = [], multi = false, search = searchNotes,
} = {}) {
  const query = shortlistQuery({ question, history, attached });
  if (!orQuery(query)) return fullShortlist(await pages, 'no-text');
  // Started before the pages are awaited. Wrapped so a search that throws at
  // once becomes a rejection like any other; the empty catch only stops a
  // rejection that lands while the pages are still loading from being
  // reported as unhandled — it is awaited, and handled, below.
  const searching = Promise.resolve().then(() => search(query, { kinds: ['note'], limit: SEARCH_LIMIT }));
  searching.catch(() => {});
  const all = await pages;
  let hits;
  try {
    hits = await searching;
  } catch (e) {
    console.warn('[search] notebook shortlist failed, using the whole Notebook: ' + String(e?.message || e).slice(0, 200));
    return fullShortlist(all, 'search-failed');
  }
  // MEANING FIRST, NOT THE FUSED SCORE. The question's words are ORed, so the
  // keyword arm matches common words across half the Notebook, and fusing it
  // in lets a page that is middling on both arms outrank the page the meaning
  // arm put first. Measured on the picker bench's cases: the expected page was
  // in the top 12 for 34 of 41 fused, 40 of 41 by meaning alone. The keyword
  // arm still contributes its top few pages (exact names and codes), and ranks
  // on its own when there are no vectors to rank by.
  const meaning = rankPages(hits, all, 'semantic');
  const ranked = meaning.length ? meaning : rankPages(hits, all);
  if (!ranked.length) return fullShortlist(all, 'no-match');
  return buildShortlist({
    ranked,
    keyword: meaning.length ? rankPages(hits, all, 'lexical') : [],
    pages: all,
    size: multi ? SHORTLIST_SIZE_MULTI : SHORTLIST_SIZE,
  });
}
