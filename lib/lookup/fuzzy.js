// The Instant Lookup fuzzy-match engine. Pure functions, no dependencies, no
// network — everything runs client-side over the pre-saved directory so results
// appear on every keystroke.
//
// "Fuzzy" here means a query token matches a directory entry when it is an
// exact token, a prefix ("pha" → "pharmacy"), a substring ("mary" →
// "Rosemary"), one-or-two typos away (Levenshtein, "fisio" → "physio"), or an
// in-order subsequence ("hmrtn" → "homerton"). Digit queries match phone
// numbers. Higher-confidence match kinds score higher, so exact/prefix hits
// always rank above loose ones.

export function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[‘’']/g, '') // apostrophes: St Leonard's → st leonards
    .replace(/\ba&e\b/g, ' ae ') // A&E stays one searchable unit
    .replace(/&/g, ' and ');
}

// Connectives carry no meaning for a directory lookup, and because "&" becomes
// "and" they'd otherwise make "a&e"-style queries match half the list.
const STOP = new Set(['and', 'the', 'of', 'for', 'at', 'to', 'in', 'on', 'or']);

export function tokenize(str) {
  return (normalize(str).match(/[a-z0-9]+/g) || []).filter((t) => !STOP.has(t));
}

// Phonetic fold: "ph" sounds like "f", so "fisio" can reach "physio" within
// one edit. Applied to match tokens only — display/highlighting is untouched.
function fold(t) {
  return t.replace(/ph/g, 'f');
}

// Damerau (OSA) edit distance with early exit — swapped letters ("nures" →
// "nurse") count as one edit, since that's the most common typing slip. We
// only ever care about distances 0–2.
export function levenshtein(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    [prev2, prev, curr] = [prev, curr, prev2 || new Array(b.length + 1)];
  }
  return prev[b.length];
}

function isSubsequence(q, c) {
  let i = 0;
  for (let j = 0; j < c.length && i < q.length; j++) if (c[j] === q[i]) i++;
  return i === q.length;
}

// How well does one query token match one candidate token? 0 = no match.
function scoreTokenPair(q, c) {
  if (q === c) return 100;
  if (c.startsWith(q)) return q.length >= 2 ? 80 + Math.round(15 * (q.length / c.length)) : 45;
  if (q.length >= 3 && c.includes(q)) return 65;
  if (q.length >= 4) {
    const d = levenshtein(q, c, 2);
    if (d === 1) return 60;
    if (d === 2 && q.length >= 6) return 45;
    // Fuzzy prefix: the typo is inside an unfinished word ("fisio" →
    // "physiotherapy" once ph-folded).
    if (c.length > q.length && levenshtein(q, c.slice(0, q.length), 1) === 1) return 50;
  }
  if (q.length >= 3 && q.length <= c.length && isSubsequence(q, c)) return 30;
  return 0;
}

// Precompute the searchable text of each entry once. Entries need
// { label, category?, aliases?, phones?[{tel}], emails? }.
export function buildIndex(entries) {
  return entries.map((entry) => {
    const tokens = new Set();
    const add = (t) => { tokens.add(t); tokens.add(fold(t)); };
    for (const t of tokenize(entry.label)) add(t);
    for (const a of entry.aliases || []) for (const t of tokenize(a)) add(t);
    for (const t of tokenize(entry.category || '')) add(t);
    for (const e of entry.emails || []) for (const t of tokenize(e.split('@')[0])) add(t);
    const labelNorm = normalize(entry.label);
    return {
      entry,
      tokens: [...tokens],
      labelNorm,
      collapsed: labelNorm.replace(/[^a-z0-9]/g, ''), // "stleonards" matches across word gaps
      digits: (entry.phones || []).map((p) => String(p.tel).replace(/\D/g, '')),
    };
  });
}

// Rank entries against a query. Every query token must match somewhere (AND),
// so extra words narrow the list instead of widening it.
export function fuzzySearch(index, query, limit = 50) {
  const qTokens = tokenize(query).slice(0, 8);
  if (!qTokens.length) return [];
  // A one-word query must match; a longer query may miss one word (heavily
  // penalised) so "phone lines" still surfaces the phone entries.
  const needed = Math.max(1, qTokens.length - 1);
  const out = [];
  for (const item of index) {
    let total = 0;
    let matched = 0;
    for (const qt of qTokens) {
      let best = 0;
      if (qt.length >= 3 && /^\d+$/.test(qt)) {
        for (const d of item.digits) {
          if (d.startsWith(qt)) { best = 95; break; }
          if (d.includes(qt) && best < 85) best = 85;
        }
      }
      if (best < 100) {
        const qf = fold(qt);
        for (const ct of item.tokens) {
          let sc = scoreTokenPair(qt, ct);
          if (qf !== qt) sc = Math.max(sc, scoreTokenPair(qf, ct));
          if (sc > best) best = sc;
          if (best >= 100) break;
        }
      }
      if (!best && qt.length >= 4 && item.collapsed.includes(qt)) best = 55;
      if (best) { matched++; total += best; }
      else total -= 40;
    }
    if (matched < needed || total <= 0) continue;
    if (item.labelNorm.startsWith(qTokens[0])) total += 8; // matches at the start feel more "meant"
    out.push({ entry: item.entry, score: total });
  }
  out.sort((a, b) => b.score - a.score || a.entry.label.length - b.entry.label.length);
  return out.slice(0, limit);
}

// [start, end) ranges of the query tokens inside a label, for <mark>-style
// highlighting. Only literal (case-insensitive) occurrences are highlighted —
// typo/subsequence matches rank the row but don't paint it.
export function highlightRanges(label, query) {
  const hay = normalize(label);
  // normalize() only lowercases/strips combining marks & apostrophes, which can
  // shift offsets; fall back to plain lowercase when lengths diverge.
  const base = hay.length === label.length ? hay : label.toLowerCase();
  const ranges = [];
  for (const qt of tokenize(query)) {
    if (qt.length < 2) continue;
    let from = 0;
    for (let guard = 0; guard < 20; guard++) {
      const at = base.indexOf(qt, from);
      if (at === -1) break;
      ranges.push([at, at + qt.length]);
      from = at + 1;
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
