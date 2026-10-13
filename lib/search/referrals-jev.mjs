// THE REFERRALS SMART SEARCH: which referral is the reader looking for?
//
// The Referrals page searches twice. In the browser, on every keystroke, it
// matches names (filterReferrals) so the list answers at once. Then, a moment
// after typing stops, the server answers properly — and that answer is a
// decision model's: TypeSafe's Jev, on OpenRouter's decisions endpoint
// (lib/ai/decisions.mjs), the same model and the same `check` role as the
// answer check.
//
// ONE CALL, ONE QUESTION PER REFERRAL. Jev is handed what was typed and asked,
// for every referral in the section at once, "is this the referral they are
// looking for?" — each a named closed question with its own 0–1 answer. Sixty
// referrals is about 6k tokens in, answered in well under a second, for a few
// thousandths of a penny. The reader typed "nurse to visit at home", not
// "District Nurse", and a question asked of each referral by name is what
// finds the one they meant.
//
// CODE DECIDES WHAT THE NUMBERS MEAN. A referral scoring JEV_MATCH or more is
// a match; matches are listed best first, and a tie keeps the keyword ranking's
// order. Jev chooses nothing it is not asked about and writes nothing.
//
// A JEV THAT FAILS CHANGES NOTHING. No key, a refused request, or no reply
// within JEV_TIMEOUT_MS, and the search is the keyword ranking it was before
// (lib/search/referrals-search.mjs) — runReferralJev never throws.
//
// WHAT IT IS SENT. What was typed, after identifier redaction (the caller's
// job), and each referral's name, where it sits, the names it is known by and
// the opening of its page. Nothing about who is searching.
//
// Pure: no network and no database. The caller passes `decide` in.
import { pageTitle, referralNameText } from './referrals.mjs';

// STARTING VALUES, from live probes on 2026-10-13: the referral meant scored
// 0.59–0.86 ("mole getting bigger" → 2WW Dermatology 0.59, Normal Dermatology
// 0.31; "cant hear properly" → Audiology 0.86), the nearest wrong one 0.24
// ("cant hear properly" → District Nurse), and everything else under 0.1.
export const JEV_MATCH = 0.3;

// On the server, behind a 250 ms debounce, with the instant matches already
// showing: long enough for a cold Jev (about 1.2 s), short enough that a
// stalled provider leaves the keyword ranking up quickly.
export const JEV_TIMEOUT_MS = 4000;

// What fits. Jev reads 32k tokens; sixty referrals at this length is about 6k.
const QUERY_CHARS = 200;
const NAMES_CHARS = 200;
const OPENING_CHARS = 220;

export const JEV_STATE_CONTEXT = 'Reception staff at an NHS GP practice are searching the practice’s list of referrals for the one they need to make. They type it the way they would say it: a condition, a symptom, a service or a clinic.';

const plain = (text) => String(text || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[#>*_`|~]+/g, ' ')
  .replace(/-{3,}/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const cut = (text, max) => {
  const clean = plain(text);
  return clean.length > max ? clean.slice(0, max).replace(/\s+\S*$/, '') + '…' : clean;
};

/** What Jev is told about one referral: its name, where it sits, what else it is called, how its page opens. */
export function referralBrief(page) {
  const title = pageTitle(page);
  const path = Array.isArray(page?.path) ? page.path.slice(1, -1).join(' / ') : '';
  const others = referralNameText(page).split(' · ').filter((n) => n && n !== title).join(', ');
  const parts = [`"${title}"`];
  if (path) parts.push(`(under ${path})`);
  if (others) parts.push(`— also known as: ${cut(others, NAMES_CHARS)}`);
  const opening = cut(page?.text, OPENING_CHARS);
  if (opening) parts.push(`— ${opening}`);
  return parts.join(' ');
}

/** The question names, in page order: r0, r1, … */
export const questionKey = (i) => 'r' + i;

/** One closed question per referral, keyed by questionKey. */
export function jevQuestions(pages = []) {
  const questions = {};
  (pages || []).forEach((page, i) => {
    questions[questionKey(i)] = {
      type: 'noul',
      instructions: `Is this the referral the reader is searching for? Referral: ${referralBrief(page)}`,
      criteria: {
        true: 'It is the referral they want, or one that would be made for what they typed',
        false: 'It is a referral for something else',
      },
    };
  });
  return questions;
}

/** The state Jev reads: what was typed, and what the page is. */
export function jevState(query) {
  return { search: String(query || '').trim().slice(0, QUERY_CHARS), context: JEV_STATE_CONTEXT };
}

/**
 * The scores in a reply, as a Map from docId to a number in [0, 1]. Anything
 * that is not one is left out, so a half-answered reply ranks only what it
 * answered.
 */
export function jevScores(pages = [], answers = {}) {
  const scores = new Map();
  (pages || []).forEach((page, i) => {
    const reply = answers ? answers[questionKey(i)] : null;
    const n = reply ? Number(reply.noul) : NaN;
    if (Number.isFinite(n) && n >= 0 && n <= 1) scores.set(page.docId, Math.round(n * 1000) / 1000);
  });
  return scores;
}

/**
 * The matches, best first: every page scoring `match` or more. A tie keeps
 * `order` — the keyword ranking's docIds — and then the pages' own order.
 */
export function rankByJev(pages = [], scores = new Map(), { order = [], match = JEV_MATCH } = {}) {
  const at = new Map((order || []).map((id, i) => [id, i]));
  const rest = (order || []).length;
  return (pages || [])
    .map((page, i) => ({ page, i, score: scores.get(page.docId) }))
    .filter((row) => typeof row.score === 'number' && row.score >= match)
    .sort((a, b) => b.score - a.score
      || (at.has(a.page.docId) ? at.get(a.page.docId) : rest + a.i) - (at.has(b.page.docId) ? at.get(b.page.docId) : rest + b.i))
    .map((row) => row.page);
}

/**
 * Ask Jev. Never throws.
 *
 * Returns `{ scores, model, ms }` when it answered, and `{ error, model, ms }`
 * when it did not — the caller keeps the keyword ranking then.
 */
export async function runReferralJev({ decide, model, query, pages = [], signal = null, onUsage = null } = {}) {
  const began = Date.now();
  try {
    if (!pages.length) throw new Error('no referrals to ask about');
    const out = await decide({
      model,
      state: jevState(query),
      questions: jevQuestions(pages),
      timeoutMs: JEV_TIMEOUT_MS,
      signal,
    });
    const scores = jevScores(pages, out && out.answers);
    if (!scores.size) throw new Error('Jev returned no scores');
    if (onUsage && out.usage) {
      try { onUsage(out.usage, out.model || model); } catch (e) { /* the measurement is worth less than the search */ }
    }
    return { scores, model: (out && out.model) || model, ms: Date.now() - began };
  } catch (e) {
    const message = e && e.name === 'TimeoutError' ? `no reply within ${JEV_TIMEOUT_MS} ms` : String((e && e.message) || e);
    return { error: message.slice(0, 200), model: model || '', ms: Date.now() - began };
  }
}

/**
 * A small memory of recent answers, so the same search typed again — or
 * typed by the next person at the desk — is not asked twice. Keyed by the
 * search and the referrals it was asked about, so an edit in Practice notes is
 * a new question. Oldest out first.
 */
export function createJevCache({ max = 300, ttlMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const store = new Map();
  const keyOf = (query, pages) => String(query || '').trim().toLowerCase().replace(/\s+/g, ' ')
    + '\u0000' + (pages || []).map((p) => p.docId + '=' + pageTitle(p) + ':' + String(p.text || '').length).join('|');
  return {
    get(query, pages) {
      const key = keyOf(query, pages);
      const hit = store.get(key);
      if (!hit) return null;
      if (now() - hit.at > ttlMs) { store.delete(key); return null; }
      return hit.scores;
    },
    set(query, pages, scores) {
      const key = keyOf(query, pages);
      store.delete(key);
      store.set(key, { at: now(), scores });
      while (store.size > max) store.delete(store.keys().next().value);
    },
    get size() { return store.size; },
  };
}
