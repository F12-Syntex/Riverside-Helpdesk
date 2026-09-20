// Whether an answer the assistant WROTE is, in fact, the practice's own words.
//
// The prose path is the fallback: no template fitted, so the model writes the
// answer itself. It used to be told nothing about the practice, and the card
// said so — "this is not from the practice's documents, check anything that has
// to match how the practice does things" — which was true and worth saying.
//
// Then the whole Notebook went into that prompt, with an instruction to use its
// exact wording. The sentence on the card did not change. So an answer lifted
// almost verbatim off a Notebook page — the practice's own page, its own
// numbers — was handed to a receptionist under a banner telling them it came
// from nowhere and to go and check it. A warning that fires on answers that do
// not need it is a warning nobody reads on the ones that do.
//
// The honest version cannot be a flag set by whichever branch of the route the
// turn came down, because that branch no longer knows. It has to be measured
// against what was actually written, which is what this does: the answer is cut
// into overlapping runs of words and each run is looked for in each page. A run
// six words long is specific enough that finding it twice is not a coincidence
// — "women aged 50 to 71 are" is the page, "of the patient and the" is English.
//
// Pure, no database and no model, so it is directly testable and identical on
// every asking.

const WORDS = 6;

// Markdown, links and punctuation off; digits and the units attached to them
// kept, because "50 to 71" is exactly the kind of run that proves the point.
function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[`*_~#>|[\]()]/g, ' ')
    .replace(/[^a-z0-9%£+./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every run of `size` consecutive words in the text, as a set. */
export function shingles(text, size = WORDS) {
  const words = normalise(text).split(' ').filter(Boolean);
  const out = new Set();
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(' '));
  return out;
}

/**
 * The Notebook pages an answer is actually made of, best first.
 *
 * @param {string} answer the prose as it will be shown
 * @param {Array} pages   the Notebook, as loaded for this turn
 * @param {object} opts   size: the run length; min: the share of the answer's
 *                        runs a page must carry; floor: the fewest runs that
 *                        can count as evidence at all.
 * @returns {Array<{docTitle: string, share: number, runs: number}>}
 */
export function groundedIn(answer, pages = [], { size = WORDS, min = 0.15, floor = 3 } = {}) {
  const asked = shingles(answer, size);
  // A two-line answer has nothing to measure. Saying nothing about where it
  // came from is the safe direction: the general banner stays.
  if (asked.size < floor) return [];
  const out = [];
  for (const page of pages || []) {
    const text = String((page && page.text) || '');
    if (!text.trim()) continue;
    const have = shingles(text, size);
    let runs = 0;
    for (const run of asked) if (have.has(run)) runs++;
    const share = runs / asked.size;
    if (runs >= floor && share >= min) {
      out.push({ docTitle: String((page && page.docTitle) || ''), share: Math.round(share * 100) / 100, runs });
    }
  }
  // Three at most: the line under the answer names where it came from, it does
  // not list every page that shares a sentence with it.
  return out.sort((a, b) => b.share - a.share || b.runs - a.runs).slice(0, 3);
}

/** Just the titles, for the card. */
export const groundedTitles = (answer, pages, opts) => groundedIn(answer, pages, opts).map((g) => g.docTitle);