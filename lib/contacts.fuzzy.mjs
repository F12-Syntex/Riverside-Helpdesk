// Fuzzy search over the practice contacts directory.
//
// The directory is 150-odd entries and a receptionist is looking for one of
// them while somebody is on the phone, so the search has to forgive how the
// entry is actually named: "hom hosp" has to find "Homerton hospital", "rlh"
// has to find "RLH- switchboard", and "7377" has to find every number that
// contains it. This file is pure — no data, no React — so the ranking can be
// tested on its own (test/contacts-fuzzy.test.mjs).
//
// Nothing here invents or reformats a number: it only chooses which entries to
// show. What is displayed still comes verbatim from lib/contacts.data.json.

const WORD_BREAK = /[^a-z0-9]/;

export function digitsOf(s) {
  return String(s).replace(/\D/g, '');
}

// A character starts a word if it opens the string or follows a separator.
function isBoundary(hay, i) {
  return i === 0 || WORD_BREAK.test(hay[i - 1]);
}

function range(from, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(from + i);
  return out;
}

// The best place `term` appears whole inside `hay` (both lower-cased). A hit
// that starts a word beats one buried mid-word, and one at the very front
// beats everything.
function substringHit(hay, term) {
  let best = null;
  for (let i = hay.indexOf(term); i !== -1; i = hay.indexOf(term, i + 1)) {
    const score = 60 + (isBoundary(hay, i) ? 40 : 0) + (i === 0 ? 10 : 0);
    if (!best || score > best.score) best = { score, indices: range(i, term.length) };
    if (i === 0) break;
  }
  return best;
}

// Every letter of `term`, in order, gaps allowed — so "hmrtn" still finds
// "Homerton" and "nel" finds "North East London". Letters that start a word
// are preferred, which is what makes initialisms work.
function subsequenceHit(hay, term) {
  if (term.length < 2) return null;
  const at = [];
  let from = 0;
  for (const ch of term) {
    const plain = hay.indexOf(ch, from);
    if (plain === -1) return null;
    let pick = plain;
    for (let j = plain; j !== -1; j = hay.indexOf(ch, j + 1)) {
      if (isBoundary(hay, j)) { pick = j; break; }
    }
    at.push(pick);
    from = pick + 1;
  }
  const span = at[at.length - 1] - at[0] + 1;
  const tight = term.length / span;                       // 1 = the letters were contiguous
  const boundaries = at.filter((i) => isBoundary(hay, i)).length;

  // Letters scattered the whole width of a long label are a coincidence, not a
  // match. Keep it only if it reads as an initialism or is reasonably compact.
  if (boundaries < Math.ceil(term.length / 2) && tight < 0.34) return null;

  return { score: 20 * tight + 6 * boundaries, indices: at };
}

function bestHit(hay, term) {
  return substringHit(hay, term) || subsequenceHit(hay, term);
}

/**
 * Turn the raw directory into the shape the matcher reads, once, so a
 * keystroke does no string building. Each prepared row keeps its own entry, so
 * the caller always renders the original data.
 */
export function prepareContacts(entries) {
  return (entries || []).map((entry) => ({
    entry,
    label: entry.label,
    labelLc: String(entry.label || '').toLowerCase(),
    emailsLc: (entry.emails || []).map((e) => String(e).toLowerCase()),
    phonesLc: (entry.phones || []).map((p) => String(p.display || '').toLowerCase()),
    phoneDigits: (entry.phones || []).map((p) => digitsOf(p.tel || p.display)),
  }));
}

// Fields other than the label can win an entry its place, but never outrank a
// match on the name of the thing itself.
const EMAIL_WEIGHT = 0.7;
const PHONE_WEIGHT = 0.85;

// What one word of the query is worth against one prepared row, and where it
// landed in the label (for highlighting — only label hits are highlighted).
function scoreTerm(row, term) {
  const digits = digitsOf(term);
  if (digits.length >= 3 && digits.length === term.length) {
    for (const d of row.phoneDigits) {
      if (d.includes(digits)) return { score: 100, indices: [] };
    }
  }

  const label = bestHit(row.labelLc, term);
  let score = label ? label.score : 0;
  const indices = label ? label.indices : [];

  for (const email of row.emailsLc) {
    const hit = bestHit(email, term);
    if (hit) score = Math.max(score, hit.score * EMAIL_WEIGHT);
  }
  for (const phone of row.phonesLc) {
    const hit = substringHit(phone, term);
    if (hit) score = Math.max(score, hit.score * PHONE_WEIGHT);
  }

  return score > 0 ? { score, indices } : null;
}

/**
 * Search prepared rows. Every word of the query must land somewhere on the
 * entry (so a second word narrows rather than widens), and the entries come
 * back best first.
 *
 * An empty query is not a failed search — it is the whole directory, in
 * alphabetical order, which is what the contacts page opens on.
 *
 * Returns [{ entry, score, indices }] where `indices` are the label character
 * positions that matched, for highlighting.
 */
export function searchPrepared(rows, query, limit = 0) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);

  if (!terms.length) {
    const all = rows.map((r) => ({ entry: r.entry, score: 0, indices: [] }));
    all.sort((a, b) => a.entry.label.localeCompare(b.entry.label, 'en'));
    return limit ? all.slice(0, limit) : all;
  }

  const out = [];
  for (const row of rows) {
    let total = 0;
    const indices = new Set();
    let matchedEveryTerm = true;
    for (const term of terms) {
      const hit = scoreTerm(row, term);
      if (!hit) { matchedEveryTerm = false; break; }
      total += hit.score;
      for (const i of hit.indices) indices.add(i);
    }
    if (matchedEveryTerm) {
      out.push({ entry: row.entry, score: total, indices: [...indices].sort((a, b) => a - b) });
    }
  }

  // Same score: the shorter name is the more exact one ("Podiatry" over
  // "Podiatry — booking queries"), and ties after that settle alphabetically.
  out.sort((a, b) => b.score - a.score
    || a.entry.label.length - b.entry.label.length
    || a.entry.label.localeCompare(b.entry.label, 'en'));

  return limit ? out.slice(0, limit) : out;
}

/** Convenience for callers holding raw entries rather than prepared rows. */
export function searchContactsIn(entries, query, limit = 0) {
  return searchPrepared(prepareContacts(entries), query, limit);
}
