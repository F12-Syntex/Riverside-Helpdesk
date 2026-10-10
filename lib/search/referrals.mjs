// The Referrals page (app/page.js): the Notebook's Referrals section as a list
// a receptionist searches the way they would say it — "skin", "cancer skin",
// "nurse to visit at home" — and the one card that answers it, drawn exactly
// as the Q&A draws it.
//
// What is listed, what is ranked and how, and what the box shows before
// anything is typed, are decided here. Everything in this file is pure — no
// database, no network — so the rules are tested as they are, and the browser
// imports the same file for the instant filter it runs on every keystroke.
// The search that reaches the database and the embedding API is
// lib/search/referrals-search.mjs.
//
// Relative imports with extensions, not `@/`: the tests run this under plain
// `node`.
import { noteKind, normaliseFields, isTypedKind } from '../notebook/kinds.mjs';
import { notebookHref } from '../notebook/links.mjs';
import { buildIndex, fuzzySearch, levenshtein } from '../lookup/fuzzy.js';

/** The Notebook section this page lists. A root section, matched by name. */
export const REFERRALS_SECTION = 'Referrals';

/* ------------------------------------------------------------------ *
 * Which pages are referrals.
 * ------------------------------------------------------------------ */

/**
 * HUB RULE: an untyped page that names five or more of the section's own
 * referral cards is an index of referrals, not a referral, and is left off.
 *
 * Decided from the live section (10 Oct 2026, 64 pages, 38 typed cards):
 *   - "Pathway index" names 17 cards (a table of every card and its route);
 *   - "All specialities and clinic types" names 6 (an 11,000-character list
 *     of every e-RS speciality, "only if no pathway card covers it").
 *   Every other page names three or fewer: "Step 2b: Send by email" 3,
 *   "Community versions of a speciality" 2, "Cancer referrals (2WW)" 1.
 *
 * Both hubs match nearly every query — they contain every referral's name —
 * so left in they sat at the top of "skin" and "cancer skin" above the card
 * that answers it, and opening one shows a list to search again.
 *
 * "Cancer referrals (2WW)" STAYS, deliberately. It reads like a hub, but it
 * is the procedure for every 2WW referral that has no card of its own — lower
 * GI, lung, urology — and the question log shows it answering "2ww lower GI
 * referral" and "2WW urological cancer". Left off, those searches could only
 * offer cards for other cancers. It does rank first for "cancer skin", with
 * the 2WW dermatology cards second and fourth; that page's own skin section
 * says the same as those cards, so it is a right answer, not a wrong one.
 *
 * "Has child pages" was the other candidate rule. No page in the section has
 * any — the containers are sections, which are never served — so it would
 * have excluded nothing. Naming by title is a property of what the page
 * says, so a new index page someone writes next month is caught too.
 */
export const HUB_MIN_CARDS = 5;

const nameKey = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

/** The page's own title: the last segment of its path. */
export function pageTitle(page) {
  const path = Array.isArray(page?.path) ? page.path : [];
  if (path.length) return String(path[path.length - 1]);
  return String(page?.docTitle || '').replace(/^notebook:\s*/i, '').split(' / ').pop();
}

/** A live typed referral card (e-RS or email). A draft is served as its prose, so it is a plain page here too. */
export function isLiveCard(page) {
  return !!page && isTypedKind(page.noteKind) && page.status !== 'draft'
    && (page.noteKind === 'ersReferral' || page.noteKind === 'emailReferral');
}

function inSection(page, section = REFERRALS_SECTION) {
  const path = Array.isArray(page?.path) ? page.path : [];
  return path.length >= 2 && nameKey(path[0]) === nameKey(section);
}

/** Whether `page` names at least HUB_MIN_CARDS of `cards` (see the hub rule above). */
export function isHub(page, cards = []) {
  if (!page || isLiveCard(page)) return false;
  const text = ' ' + nameKey(page.text || page.body || '') + ' ';
  let named = 0;
  for (const card of cards) {
    if (card === page) continue;
    const names = [pageTitle(card), card.fields?.service].map(nameKey).filter((n) => n.length >= 4);
    if (names.some((n) => text.includes(' ' + n + ' '))) named += 1;
    if (named >= HUB_MIN_CARDS) return true;
  }
  return false;
}

/**
 * The referrals: every served page under the Referrals section, minus hubs, in
 * Notebook order. `pages` is fullNotebookContext()'s list (or the same shape).
 */
export function referralPages(pages = [], section = REFERRALS_SECTION) {
  const all = (pages || []).filter((page) => inSection(page, section));
  const cards = all.filter(isLiveCard);
  return all.filter((page) => !isHub(page, cards));
}

/* ------------------------------------------------------------------ *
 * What one result row says.
 * ------------------------------------------------------------------ */

const ROUTE = { ersReferral: 'e-RS', emailReferral: 'Email' };

/** The route chip: "e-RS" or "Email" for a live card, null for a plain page. */
export function routeOf(page) {
  return isLiveCard(page) ? ROUTE[page.noteKind] : null;
}

/** The tag beside it: "2WW" or "Urgent" from an e-RS card's priority, else null. Routine says nothing. */
export function priorityTag(page) {
  if (!isLiveCard(page) || page.noteKind !== 'ersReferral') return null;
  const priority = String(page.fields?.priority || '').trim();
  return priority === '2WW' || priority === 'Urgent' ? priority : null;
}

/** The note id behind a page source ("note:1964" → 1964), or null. */
export function noteIdOf(page) {
  const m = String(page?.docId || '').match(/^note:(\d+)$/);
  return m ? Number(m[1]) : null;
}

/**
 * The words a reader would match a referral by: its title, then for a card
 * the fields it is filed under — service, aliases, speciality, clinic type,
 * hospital, form, email — through the kind's own searchText, so this can
 * never disagree with what the search index holds for the card.
 *
 * Each name once, and typographic hyphens as plain ones. A card's title and
 * service are usually the same words ("2WW Breast · 2WW Breast · 2WW · 2WW
 * Breast"), and repeated they weigh the vector toward whichever word repeats —
 * "2WW" — rather than what the card is for. "2‑Week‑Wait" with U+2011 hyphens
 * is three unfamiliar tokens to the embedding model and one word to a reader.
 */
export function referralNameText(page) {
  const title = pageTitle(page);
  const parts = [title];
  if (isLiveCard(page)) {
    const def = noteKind(page.noteKind);
    parts.push(...String(def.searchText(normaliseFields(def.id, page.fields), { title }) || '').split(' · '));
  }
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const clean = String(part || '').replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out.join(' · ');
}

/** One row of the list, as the API sends it. `card` (the drawn answer) is added by the caller for the rows that carry one. */
export function shapeResult(page) {
  const id = noteIdOf(page);
  const title = pageTitle(page);
  const path = Array.isArray(page?.path) ? page.path.slice(1, -1) : [];
  return {
    id: page.docId,
    title,
    // Where it sits under Referrals — "Pathway cards (A to Z) / ERS referrals".
    where: path.join(' / '),
    route: routeOf(page),
    tag: priorityTag(page),
    // What the instant filter in the browser matches on, before the server's
    // ranking arrives: the same words the card is indexed by.
    names: referralNameText(page),
    href: id == null ? '/notebook' : notebookHref({ id, title }),
  };
}

/* ------------------------------------------------------------------ *
 * The query.
 * ------------------------------------------------------------------ */

// "referral", "ref", "refer", "referrals" and their typos ("referrral",
// "refrral", "referrarl" — all in the question log). On this page every
// result is a referral, so the word says nothing about which one; left in, it
// ranks pages by how often they say "referral" — "physio referral" put
// "Paediatric referrals" first.
function isReferralWord(word) {
  const w = String(word || '').toLowerCase();
  if (w === 'ref' || w === 'refs' || w.startsWith('refer')) return true;
  return w.length >= 6 && (levenshtein(w, 'referral', 2) <= 2 || levenshtein(w, 'referrals', 2) <= 2);
}

/**
 * The query without the words that only say "a referral". Returns the query
 * unchanged when that is all it says ("referral" alone still searches).
 */
export function referralQuery(query) {
  const text = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const kept = text.split(' ').filter((word) => !isReferralWord(word.replace(/[^a-z]/gi, '')));
  return kept.join(' ').trim() || text;
}

/* ------------------------------------------------------------------ *
 * The ranking.
 * ------------------------------------------------------------------ */

// A live card is the thing the reader came to fill in; a plain page is
// guidance about it. When the two mean the query about equally, the card
// goes first. Small: it moves a card past a page a few hundredths ahead on
// meaning ("cancer skin": 2WW Teledermatology past two breast-clinic pages
// that are about cancer but not skin), never past a page that is plainly the
// better match.
//
// MEASURED, 10 Oct 2026, on 34 questions from the question log, each labelled
// with the page that answered it, plus 12 exact names and codes ("racpc",
// "lawson", "mecs"): the right page first for 31 of the 34 and all 12, with or
// without this. What it changes is the order under the first: without it
// "cancer skin" put a breast-clinic page above 2WW Teledermatology.
export const CARD_BONUS = 0.03;
// The keyword arm's say, as a share of its best page's score. Meaning
// decides the order; the keyword arm breaks near-ties toward the page that
// uses the reader's own words, and ranks on its own when there are no vectors.
// On the same set it is close to neutral: 0 put ECG above RACPC for "heart
// tracing" (32 of 34 first) and 0.1 changed nothing at the top. The exact
// names it exists for are already found by the name vectors; it stays as the
// tie-break, and as the whole ranking when the embedding API is down.
export const KEYWORD_WEIGHT = 0.05;
// How many rows a search returns: at least MIN_RESULTS when there are that
// many, then those within SCORE_SPREAD of the best, up to MAX_RESULTS. Past
// the spread it is noise that happens to be nearest; the minimum keeps the
// neighbours of a clear winner in view ("2ww breast lump" → 2WW Breast, and
// the breast clinic and 2WW procedure pages under it).
export const MIN_RESULTS = 4;
export const MAX_RESULTS = 8;
export const SCORE_SPREAD = 0.15;

/**
 * The referrals, best first.
 *
 * MEANING FIRST. Each page's meaning score is the better of two cosines: its
 * best passage (the page as the index holds it), and its name text alone
 * (referralNameText — title and card fields). The name text matters because a
 * card's passage is mostly its prose: "skin" is nearer "Normal Dermatology"'s
 * name than its paragraph about photographs, and by passage alone a foot
 * clinic outranked one of the dermatology cards.
 *
 * Then KEYWORD_WEIGHT × the page's keyword score (relative to the best), then
 * CARD_BONUS for a live card. With no vectors at all — the embedding API down
 * or slow — the keyword arm ranks alone and a page it did not find is left out.
 *
 * @param {object[]} pages    referralPages()
 * @param {Map<string,{semantic?:number,lexical?:number}>} scores  per docId, from the passages
 * @param {Map<string,number>} names  per docId, cosine of the query to referralNameText
 * `cardBonus` and `keywordWeight` are there for the bench; the app uses the constants.
 */
export function rankReferrals(pages = [], {
  scores = new Map(), names = new Map(), limit = MAX_RESULTS, cardBonus = CARD_BONUS, keywordWeight = KEYWORD_WEIGHT,
} = {}) {
  const got = (map, key) => (map && typeof map.get === 'function' ? map.get(key) : undefined);
  const lexMax = Math.max(0, ...pages.map((p) => Number(got(scores, p.docId)?.lexical) || 0));
  const haveMeaning = pages.some((p) => Number(got(scores, p.docId)?.semantic) > 0 || Number(got(names, p.docId)) > 0);
  const rows = [];
  for (const page of pages) {
    const s = got(scores, page.docId) || {};
    const lexical = lexMax > 0 ? (Number(s.lexical) || 0) / lexMax : 0;
    const meaning = Math.max(Number(s.semantic) || 0, Number(got(names, page.docId)) || 0);
    if (!haveMeaning && lexical <= 0) continue;
    const base = haveMeaning ? meaning + keywordWeight * lexical : lexical;
    rows.push({ page, score: base + (isLiveCard(page) ? cardBonus : 0) });
  }
  rows.sort((a, b) => b.score - a.score || pageTitle(a.page).localeCompare(pageTitle(b.page), 'en'));
  if (!rows.length) return [];
  const floor = rows[0].score - (haveMeaning ? SCORE_SPREAD : 1);
  return rows
    .filter((row, i) => i < MIN_RESULTS || row.score >= floor)
    .slice(0, Math.max(1, limit))
    .map((row) => row.page);
}

/* ------------------------------------------------------------------ *
 * The empty box.
 * ------------------------------------------------------------------ */

export const POPULAR_DAYS = 30;
export const POPULAR_MAX = 8;

/**
 * The referrals most asked for, from question_log sources: `rows` are
 * `{ source, asked }` with `source` one "Notebook: A / B / C" string (the log
 * joins several with " · "; the query splits them). Only pages in `pages`
 * count, so a hub, a page outside the section or one since deleted cannot
 * appear. Ties go A–Z.
 */
export function popularReferrals(rows = [], pages = [], limit = POPULAR_MAX) {
  const byTitle = new Map(pages.map((page) => [nameKey(String(page.docTitle || '').replace(/^notebook:\s*/i, '')), page]));
  const counts = new Map();
  for (const row of rows || []) {
    const key = nameKey(String(row?.source || '').replace(/^notebook:\s*/i, ''));
    const page = byTitle.get(key);
    if (!page) continue;
    counts.set(page, (counts.get(page) || 0) + (Number(row.asked) || 0));
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || pageTitle(a[0]).localeCompare(pageTitle(b[0]), 'en'))
    .slice(0, Math.max(0, limit))
    .map(([page]) => page);
}

/** Every referral A–Z by title: the empty box when nothing has been asked yet, and the list under the most-asked ones. */
export function alphabetical(pages = []) {
  return pages.slice().sort((a, b) => pageTitle(a).localeCompare(pageTitle(b), 'en', { sensitivity: 'base' }));
}

/* ------------------------------------------------------------------ *
 * The instant filter, in the browser.
 * ------------------------------------------------------------------ */

/**
 * Rows (shapeResult) matching `query` by their words alone, best first — what
 * the list shows on the keystroke, before the server's ranking comes back.
 *
 * The Contact numbers page's matcher (lib/lookup/fuzzy.js): prefixes, one or
 * two typos ("rhumotology"), every word but one required. It matches the
 * title, the card's fields and where the page sits, and nothing of the body —
 * that is what the server's search is for.
 */
export function filterReferrals(rows = [], query = '') {
  const text = referralQuery(query);
  if (!text) return [];
  const index = buildIndex((rows || []).map((row) => ({
    row,
    label: row.title,
    aliases: [...String(row.names || '').split(' · '), row.route || '', row.tag || ''].filter(Boolean),
  })));
  return fuzzySearch(index, text, 50).map((hit) => hit.entry.row);
}
