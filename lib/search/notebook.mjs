// One turn's Notebook shortlist: search the index, roll the hits up to the
// live pages, fall back to the whole Notebook whenever search cannot help.
import { orQuery, shortlistQuery } from './query.mjs';
import {
  SHORTLIST_SIZE, SHORTLIST_SIZE_MULTI, buildShortlist, fullShortlist, rankPages,
} from './shortlist.mjs';
import { TIMED_OUT, withinMs } from './deadline.mjs';

// Enough passages to fill a 20-page shortlist even when the best pages each
// match on several passages.
const SEARCH_LIMIT = 80;
// How long a turn waits for search before it reads the whole Notebook instead.
// A search is one embedding (itself given up at 2.5 s, lib/search/search.mjs)
// and one query; a database that has stopped answering must not hold a turn
// that has 105 seconds in all, most of them needed by the models.
export const SEARCH_TIMEOUT_MS = 4000;

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
 * - 'image': the turn has pictures. What it is about is in the picture, which
 *   search cannot read, and the words typed beside one ("what do I do with
 *   this?") say nothing about which page it needs.
 * - 'no-text': nothing to search with (no words typed, "??").
 * - 'search-failed': the database or the embedding API is down, or search
 *   did not answer within SEARCH_TIMEOUT_MS. Logged, not thrown — a turn must
 *   not fail, or wait, because its shortcut did.
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
  question = '', history = '', attached = '', pages = [], multi = false, seeing = false,
  search = searchNotes, timeoutMs = SEARCH_TIMEOUT_MS,
} = {}) {
  if (seeing) return fullShortlist(await pages, 'image');
  const query = shortlistQuery({ question, history, attached });
  if (!orQuery(query)) return fullShortlist(await pages, 'no-text');
  // Started before the pages are awaited. Wrapped so a search that throws at
  // once becomes a rejection like any other; the empty catch only stops a
  // rejection that lands while the pages are still loading — or after the
  // deadline has given up on it — from being reported as unhandled.
  const searching = Promise.resolve().then(() => search(query, { kinds: ['note'], limit: SEARCH_LIMIT }));
  searching.catch(() => {});
  // The deadline runs from the moment search starts, not from when the pages
  // arrive: the turn's wait is what it bounds.
  const answered = withinMs(searching, timeoutMs);
  answered.catch(() => {});
  const all = await pages;
  let hits;
  try {
    hits = await answered;
    if (hits === TIMED_OUT) throw new Error(`no answer in ${timeoutMs} ms`);
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
