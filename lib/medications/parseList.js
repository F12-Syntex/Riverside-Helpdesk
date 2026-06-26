// Deterministic parser that turns a pasted blob of text into a clean list of
// distinct medicine names. It copes with the everyday ways staff paste a list —
// commas, new lines, semicolons, bullets, numbered lists, "and" — and with
// prescription-style snippets that carry a strength/frequency ("amoxicillin
// 250mg tds" -> "amoxicillin"). Pure, no I/O.
//
// This is the instant, always-available path. The AI extractor
// (/api/medication/extract) is the smarter one for messy prose; this runs when
// the model is unavailable, or as a backstop when it finds nothing.

const MAX_MEDICINES = 12;     // cap the fan-out from one paste
const MAX_NAME_LEN = 120;     // matches the /api/medication name limit

// Dose units and frequency/route shorthand that are never part of a name.
const FREQ =
  /\b(od|bd|tds|qds|qid|tid|bid|prn|nocte|noct|mane|stat|po|pr|sc|im|iv|inh|neb|top|once|twice|thrice|daily|weekly|monthly|morning|evening|night|tablet|tablets|tab|tabs|capsule|capsules|cap|caps|puff|puffs|dose|doses|as required|when required)\b/gi;

function cleanOne(raw) {
  let t = String(raw || '').trim();
  if (!t) return '';
  // Strip leading list markers: bullets and "1." / "2)" / "(3)" numbering.
  t = t.replace(/^[\s\-*•·–—‣◦>]+/, '').replace(/^\(?\d+[.)]\s*/, '');
  // Cut at the first dose-like run (a space then a digit), so "Amoxicillin
  // 250mg tds" -> "Amoxicillin". A digit glued to a letter ("Vitamin B12") has
  // no preceding space, so it is preserved.
  t = t.replace(/\s+\d.*$/, '');
  // Remove any stray strength/frequency shorthand left over.
  t = t.replace(FREQ, ' ');
  // Drop brackets and trailing punctuation, then collapse whitespace.
  t = t.replace(/[()[\]{}]/g, ' ').replace(/[.,;:/\\|]+$/g, '').replace(/\s+/g, ' ').trim();
  if (t.length < 2 || !/[a-z]/i.test(t)) return ''; // must read like a word
  return t.slice(0, MAX_NAME_LEN);
}

// Parse pasted text into up to MAX_MEDICINES distinct names, in the order they
// appear, deduped case-insensitively.
export function parseMedicineList(text) {
  const str = String(text || '');
  if (!str.trim()) return [];
  const parts = str
    .split(/[\n\r]+/)
    .flatMap((line) => line.split(/[,;|•·]+|\s+&\s+|\s+\band\b\s+/i));
  const out = [];
  const seen = new Set();
  for (const p of parts) {
    const name = cleanOne(p);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_MEDICINES) break;
  }
  return out;
}
