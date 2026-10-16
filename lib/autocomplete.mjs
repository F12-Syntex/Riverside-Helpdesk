// SUGGESTIONS AS YOU TYPE, FROM WHAT THE PAGE ALREADY HOLDS.
//
// The Ask field used to be a blank box: whatever was typed went to a model, and
// the only way to find out the Notebook had a page called "Fit notes" was to ask
// a question and see it linked at the foot of the answer. This lists, under the
// field as somebody types, the things the practice has already written down that
// match — and a slash lists the modes.
//
// EVERYTHING HERE IS ALREADY IN THE BROWSER. The Notebook's titles, the contact
// directory and the guides are fetched when the page opens; the questions are
// this page's own, asked since it was opened. Nothing is sent anywhere to
// suggest anything, and nothing typed is kept: a suggestion is worked out from
// the field as it stands and forgotten on the next keystroke. That matters at a
// shared reception machine, where the transcript is cleared on every load on
// purpose — a "recent searches" list kept in storage would put it back.
//
// Pure and deterministic, so it is tested under plain `node`.
import { levenshtein, normalize, tokenize } from './lookup/fuzzy.js';

export const SUGGEST_LIMIT = 6;
// Long text is a pasted letter or a consultation, not something being typed
// towards a known page — and a list popping over a paste is in the way.
export const SUGGEST_MAX_INPUT = 80;

/**
 * The kinds of suggestion, in the order they win a tie, and what each says
 * about itself on its row.
 *   page     a Notebook page — asking it opens the practice's own answer
 *   guide    one of the built-in EMIS how-tos
 *   contact  a directory entry — asked, it is answered from the directory
 *            with no model at all
 *   recent   a question already asked on this page
 *   mode     a slash, and one of the answer modes
 */
export const KINDS = {
  recent: { rank: 0, tag: 'Asked earlier' },
  page: { rank: 1, tag: 'Notebook' },
  contact: { rank: 2, tag: 'Contact' },
  guide: { rank: 3, tag: 'EMIS guide' },
  mode: { rank: 4, tag: 'Mode' },
};

const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/**
 * Everything that can be suggested, built once whenever what the page holds
 * changes (not on every keystroke).
 *
 * @param notes     Notebook rows as /api/notebook returns them — sections skipped
 * @param guides    the guides, { id, question }
 * @param contacts  directory entries, { id, label }
 * @param modes     lib/commands.mjs MODES — the slash list
 * @param recent    questions asked on this page, newest first
 */
export function buildSuggestions({ notes = [], guides = [], contacts = [], modes = [], recent = [] } = {}) {
  const out = [];
  const seen = new Set();
  const add = (kind, label, value, extra = {}) => {
    const shown = clean(label);
    if (!shown) return;
    const key = kind === 'mode' ? 'mode:' + extra.mode : normalize(shown);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      kind,
      label: shown,
      value: clean(value) || shown,
      tag: KINDS[kind].tag,
      words: tokenize(shown + ' ' + (extra.keys || '')),
      flat: normalize(shown),
      ...extra,
    });
  };
  for (const q of recent) add('recent', q, q);
  for (const n of notes) {
    if (!n || n.isSection || n.kind === 'section') continue;
    const title = clean(n.title);
    if (!title || /^untitled/i.test(title)) continue;
    add('page', title, title, { id: n.id });
  }
  for (const c of contacts) {
    if (!c || !c.label) continue;
    // Worded as the question the directory answers on its own (see
    // lib/templates/directory.mjs), so choosing it costs no model call.
    add('contact', 'Number for ' + clean(c.label), 'What is the number for ' + clean(c.label) + '?', { keys: 'phone number contact telephone email' });
  }
  for (const g of guides) {
    if (g && g.question) add('guide', g.question, g.question, { id: g.id });
  }
  for (const m of modes) {
    if (!m || !m.name) continue;
    add('mode', m.label, '', { mode: m.name, icon: m.icon, summary: m.summary || '', keys: m.name });
  }
  return out;
}

// How well one typed word is met by a candidate's words. The last word is
// still being typed, so it only has to be the start of one.
function wordScore(token, words, last) {
  let best = 0;
  for (const w of words) {
    if (w === token) return 4;
    if (w.startsWith(token)) best = Math.max(best, last ? 3.5 : 2.5);
    else if (token.length >= 4 && w.length >= 4 && levenshtein(token, last ? w.slice(0, token.length) : w, 1) <= 1) best = Math.max(best, 1.5);
  }
  return best;
}

/**
 * The suggestions for what is in the field now, best first.
 *
 * Every typed word has to be met by the candidate — a suggestion that ignores
 * half of what was typed is noise — but loosely: the start of a word, or one
 * slip in a longer one ("dermotology"). A slash at the start lists the modes
 * instead, and nothing else.
 */
export function suggest(all, input, { limit = SUGGEST_LIMIT } = {}) {
  const raw = String(input || '');
  const typed = raw.trim();
  if (!typed || typed.length > SUGGEST_MAX_INPUT) return [];

  if (typed.startsWith('/')) {
    const want = normalize(typed.slice(1)).trim();
    return all
      .filter((s) => s.kind === 'mode')
      .filter((s) => !want || s.flat.includes(want) || String(s.mode).startsWith(want))
      // Every mode, not the first six: the slash IS the list of them.
      .slice(0, Math.max(limit, 10));
  }
  if (typed.length < 2) return [];

  const tokens = tokenize(typed);
  if (!tokens.length) return [];
  const flatTyped = normalize(typed);

  const scored = [];
  for (const s of all) {
    if (s.kind === 'mode') continue;
    // Nothing that is exactly what was typed: it would offer the reader their
    // own words back.
    if (s.flat === flatTyped) continue;
    let total = 0;
    let ok = true;
    tokens.forEach((t, i) => {
      const sc = wordScore(t, s.words, i === tokens.length - 1);
      if (!sc) ok = false;
      total += sc;
    });
    if (!ok) continue;
    // Starting with exactly what was typed is the strongest sign of all — it is
    // also what lets the rest be shown in the field (completionFor).
    if (s.flat.startsWith(flatTyped)) total += 3;
    // Fewer leftover words is a closer match: "ECG" beats "ECG for a child".
    total -= Math.max(0, s.words.length - tokens.length) * 0.15;
    scored.push({ s, total });
  }
  scored.sort((a, b) => b.total - a.total || KINDS[a.s.kind].rank - KINDS[b.s.kind].rank || a.s.label.length - b.s.label.length);
  return scored.slice(0, limit).map((x) => x.s);
}

// The words a question is made of that say nothing about what it is about.
const FILLER = new Set([
  'how', 'do', 'does', 'did', 'i', 'we', 'you', 'they', 'what', 'whats', 'is', 'are', 'was', 'can', 'could',
  'would', 'should', 'my', 'our', 'their', 'a', 'an', 'it', 'this', 'that', 'with', 'about', 'who', 'when',
  'where', 'which', 'why', 'need', 'needs', 'want', 'wants', 'get', 'got', 'patient', 'patients', 'pt', 'please',
  'there', 'have', 'has', 'be', 'if', 'any', 'someone', 'somebody', 'go', 'goes', 'send', 'make', 'from', 'up',
]);

/**
 * Notebook pages related to a question already asked — offered under its
 * answer as somewhere to go next.
 *
 * Looser than `suggest` on purpose: a question is a sentence, and asking that
 * every word of it appear in a page title would find nothing. So a page is
 * related when it shares a word that MEANS something with the question (the
 * filler above removed), and pages that share more come first. Pages the
 * answer already linked are left out — they are on the card already.
 */
// A word in more than this share of the Notebook's titles says nothing about
// which page is meant: in a Notebook with a Referrals section, "referral" is in
// half of them, and "related to a question about referring" was every page.
const COMMON_SHARE = 0.08;

const sameWord = (w, x) => x === w || (w.length >= 4 && x.startsWith(w)) || (x.length >= 4 && w.startsWith(x));

export function related(all, text, { exclude = [], limit = 4 } = {}) {
  const pages = all.filter((s) => s.kind === 'page');
  if (!pages.length) return [];
  const common = Math.max(2, Math.ceil(pages.length * COMMON_SHARE));
  const words = tokenize(text)
    .filter((w) => w.length >= 3 && !FILLER.has(w))
    // How many titles carry the word decides whether it can tell pages apart.
    .filter((w) => pages.filter((p) => p.words.some((x) => sameWord(w, x))).length <= common);
  if (!words.length) return [];
  const skip = new Set(exclude.map((t) => normalize(String(t || '')).trim()));
  const flatAsked = normalize(text).trim();
  const scored = [];
  for (const s of pages) {
    if (skip.has(s.flat) || s.flat === flatAsked) continue;
    let hits = 0;
    for (const w of words) if (s.words.some((x) => sameWord(w, x))) hits++;
    if (hits) scored.push({ s, hits });
  }
  scored.sort((a, b) => b.hits - a.hits || a.s.words.length - b.s.words.length);
  return scored.slice(0, limit).map((x) => x.s);
}

/**
 * The rest of the top suggestion, to be drawn faintly in the field after what
 * has been typed — or '' when the top suggestion does not start with it, since
 * a completion that rewrote the start of somebody's words would be a correction.
 *
 * Case-insensitive on what was typed; the remainder is the suggestion's own.
 */
export function completionFor(input, top) {
  const typed = String(input || '');
  if (!top || top.kind === 'mode' || !typed.trim()) return '';
  const label = top.label;
  if (label.length <= typed.length) return '';
  if (label.slice(0, typed.length).toLowerCase() !== typed.toLowerCase()) return '';
  return label.slice(typed.length);
}
