// How old the message says the patient is — only where it says so outright.
//
// Shared by every rule with an age gate: the Pharmacy First pathways
// (./pharmacy-first.mjs) and the FCP, which takes 16 and over only
// (lib/templates/pharmacy.mjs). Kept on its own so neither has to import the
// other to read an age.

// HOW OLD THE MESSAGE SAYS THEY ARE, only where it says so outright.
//
// "3 years" on its own is how long something has gone on as often as it is an
// age, so a bare number of years is never read as one: it needs "old", "yo",
// "y/o" or "aged" beside it. Months and weeks old are babies, and count as the
// fraction of a year they are.
const AGE_PATTERNS = [
  { re: /\b(\d{1,3})\s*-?\s*(?:years?|yrs?|yr)\s*-?\s*old\b/gi, scale: 1 },
  { re: /\b(\d{1,3})\s*(?:yo|y\/o|y\.o\.?)(?![a-z])/gi, scale: 1 },
  { re: /\baged?\s*:?\s*(\d{1,3})\b(?!\s*(?:months?|weeks?|days?)\b)/gi, scale: 1 },
  { re: /\b(\d{1,2})\s*-?\s*(?:months?|mo|mths?)\s*-?\s*old\b/gi, scale: 1 / 12 },
  { re: /\b(\d{1,2})\s*-?\s*(?:weeks?|wks?)\s*-?\s*old\b/gi, scale: 1 / 52 },
];

/** Every age the message states outright, deduplicated. More than one means it is about more than one person. */
export function statedAges(message) {
  const text = String(message || '');
  const found = new Set();
  for (const { re, scale } of AGE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n <= 120) found.add(Math.round(n * scale * 100) / 100);
    }
  }
  return [...found];
}
