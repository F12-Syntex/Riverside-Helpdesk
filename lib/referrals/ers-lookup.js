// Referral note → clinical term → SNOMED concept → e-RS Specialty + Clinic Type.
//
// THIS IS THE FALLBACK, NOT THE SOURCE OF TRUTH. The practice's Notebook records
// the speciality and clinic type for the referrals it actually makes, and that is
// what an answer must use whenever it has one. This runs only for a referral the
// Notebook has no page for, and everything it returns is labelled a suggestion.
//
// Why a suggestion and not a mapping: there is no published SNOMED-to-e-RS
// mapping. No edition of the SNOMED CT UK release carries an e-RS refset, and
// the practice's referral types export carries no concept ids. So the two are
// joined by matching the resolved concept's wording against the e-RS vocabulary.
// That is a text match, and it can be wrong — which is why the caller is given
// the score and the alternatives rather than a single confident answer.
//
// What it will never do is invent a route: every pairing returned comes from
// ers_directory, the closed list of pairings e-RS actually accepts.

// Relative rather than aliased so the lookup can be exercised outside Next —
// the ranking here is worth being able to probe from a plain node script.
import { ensureSnomedSchema, getSql } from '../db.js';

// Words in every referral note that identify no condition. Removing them turns
// "urgent 2ww referral for suspected melanoma" into "melanoma".
const NOISE = new Set([
  'referral', 'referrals', 'refer', 'referred', 'referring', 'ref',
  'urgent', 'routine', 'soon', 'priority', 'asap', 'immediate', 'emergency',
  '2ww', 'tww', 'two', 'week', 'wait', 'fast', 'track', 'fasttrack',
  'suspected', 'suspicion', 'query', 'possible', 'probable', 'rule', 'out',
  'patient', 'pt', 'please', 'kindly', 'thanks', 'thank', 'you',
  'for', 'to', 'the', 'a', 'an', 'of', 'and', 'with', 'this', 'that', 'is', 'was', 'has',
  'dr', 'doctor', 'gp', 'clinic', 'appointment', 'appt', 'task', 'note', 'notes',
  'history', 'hx', 'presenting', 'complaint', 'co', 'year', 'old', 'male', 'female',
]);

// A note that says any of these is a two week wait referral, whatever else it
// says. 2WW is its own e-RS specialty, so this decides which half of the
// vocabulary to search before any term matching happens.
const CANCER_SIGNAL = /\b(2ww|tww|two[- ]week|fast[- ]?track|cancer|carcinoma|malignan\w*|melanoma|lymphoma|myeloma|sarcoma|tumour|tumor|neoplasm|metasta\w*|oncolog\w*)\b/i;

export function normaliseTerm(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''`]/g, '')
    // An FSN carries its semantic tag in brackets — "Knee pain (finding)".
    // Nobody types that, and it must not be matched on.
    .replace(/\s*\([^)]*\)\s*$/, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCancerReferral(notes) {
  return CANCER_SIGNAL.test(String(notes || ''));
}

// Pull the clinical condition out of free text. Deterministic on purpose — no
// model call — so the same note always yields the same term and a wrong route
// can be traced back to the words that caused it.
//
// Returns candidates longest first: the longest surviving phrase is the most
// specific ("malignant melanoma skin" before "melanoma").
export function extractClinicalTerm(notes) {
  const cleaned = normaliseTerm(notes);
  if (!cleaned) return [];
  const candidates = [];
  let run = [];
  const flush = () => { if (run.length) candidates.push(run.join(' ')); run = []; };
  for (const word of cleaned.split(' ')) {
    if (NOISE.has(word) || word.length < 2) flush();
    else run.push(word);
  }
  flush();
  return [...new Set(candidates)].sort((a, b) => b.length - a.length);
}

// A concept only helps route a referral if it says what is wrong with the
// patient, or what is to be done about it.
const USEFUL_TAGS = ['disorder', 'finding', 'situation', 'procedure'];
const rankOf = (tag) => {
  const i = USEFUL_TAGS.indexOf(tag);
  return i === -1 ? USEFUL_TAGS.length : i;
};

// Resolve a phrase to a SNOMED concept: exact wording first, trigram similarity
// for the typo. Null when nothing is close enough — better than a bad concept.
async function resolveConcept(sql, phrase, minSimilarity) {
  const exact = await sql`
    SELECT concept_id, term, semantic_tag, is_fsn, 1::float8 AS score
    FROM snomed_terms WHERE term_norm = ${phrase} LIMIT 25
  `;
  const rows = exact.length ? exact : await sql`
    SELECT concept_id, term, semantic_tag, is_fsn, similarity(term_norm, ${phrase})::float8 AS score
    FROM snomed_terms WHERE term_norm % ${phrase}
    ORDER BY score DESC LIMIT 25
  `;
  const usable = rows
    .filter((r) => Number(r.score) >= (exact.length ? 1 : minSimilarity))
    .sort((a, b) => Number(b.score) - Number(a.score)
      || rankOf(a.semantic_tag) - rankOf(b.semantic_tag)
      || Number(b.is_fsn) - Number(a.is_fsn)
      || a.term.length - b.term.length);
  return usable[0] || null;
}

// Words that appear all over the e-RS vocabulary and distinguish nothing.
// "2ww" is dropped because the 2WW half is already selected by specialty — what
// is left of "2WW Skin" is the part that has to match, which is "skin".
const GENERIC_CLINIC_WORDS = new Set([
  '2ww', 'not', 'otherwise', 'specified', 'nos', 'see', 'and', 'or', 'other',
  'service', 'services', 'clinic', 'clinics', 'general', 'assessment', 'medicine',
  'surgery', 'disorders', 'disorder', 'problems', 'care',
]);

const tokensOf = (text) => normaliseTerm(text).split(' ').filter(Boolean);

// The e-RS vocabulary is 406 rows, so it is scored in memory. Whole-string
// trigram similarity is the wrong tool here — "skin cancer" against "2WW Skin"
// scores badly purely because the strings differ in length, when the match is
// in fact exact on the only word that matters. Token overlap does not care.
let _directory = null;
async function loadDirectory(sql) {
  if (_directory) return _directory;
  const rows = await sql`SELECT specialty, clinic_type, specialty_norm, clinic_norm FROM ers_directory`;
  const entries = rows.map((r) => {
    const all = tokensOf(r.clinic_norm);
    const distinctive = all.filter((t) => !GENERIC_CLINIC_WORDS.has(t) && t.length > 2);
    return {
      specialty: r.specialty,
      clinicType: r.clinic_type,
      isCancer: r.specialty_norm === '2ww',
      specialtyTokens: tokensOf(r.specialty_norm).filter((t) => t.length > 2),
      // Fall back to the full token list for a clinic type that is nothing but
      // generic words, e.g. "Not Otherwise Specified".
      tokens: distinctive.length ? distinctive : all,
    };
  });

  // Weight each word by how rare it is across the whole vocabulary. Without
  // this, "carpal tunnel syndrome" matches "Post-COVID-19 Syndrome Service" on
  // the one word shared by half a dozen clinic types, and beats the pairing that
  // is actually right. A word appearing in one clinic type identifies it; a word
  // appearing in twelve identifies nothing.
  const documentFreq = new Map();
  for (const e of entries) {
    for (const t of new Set(e.tokens)) documentFreq.set(t, (documentFreq.get(t) || 0) + 1);
  }
  const n = entries.length;
  for (const e of entries) {
    e.weights = e.tokens.map((t) => Math.log(n / (documentFreq.get(t) || 1)) + 0.25);
  }

  _directory = entries;
  return _directory;
}

// How well does one pairing fit the words in play? Coverage says how much of the
// clinic type was accounted for; the exact-word term rewards hitting the one
// word that identifies it ("eczema" in "Eczema and Dermatitis").
function scoreClinicType(entry, words) {
  if (!entry.tokens.length) return 0;
  let covered = 0;
  let total = 0;
  // The best exact hit, by rarity — matching "carpal" is worth far more than
  // matching "syndrome", and the score has to say so.
  let bestExact = 0;
  let maxWeight = 0;
  entry.tokens.forEach((t, i) => {
    const w = entry.weights[i];
    total += w;
    if (w > maxWeight) maxWeight = w;
    if (words.has(t)) { covered += w; if (w > bestExact) bestExact = w; return; }
    // Singular/plural and prefix forms: "nails" reaches "nail".
    for (const word of words) {
      if (word.length > 3 && (word.startsWith(t) || t.startsWith(word))) { covered += w * 0.7; break; }
    }
  });
  const coverage = covered / total;
  let score = 0.6 * coverage + 0.4 * (maxWeight ? bestExact / maxWeight : 0);
  // The note naming its own specialty ("refer to orthopaedics") is a strong,
  // deliberate signal — the doctor has already chosen.
  if (entry.specialtyTokens.length && entry.specialtyTokens.every((t) => words.has(t))) score += 0.15;
  return Math.min(1, score);
}

// Rank the vocabulary against everything known about the referral. Cancer
// referrals are scored against the 2WW specialty only, and non-cancer ones
// never against it — 2WW is decided by the note, not by a term match.
async function matchDirectory(sql, words, cancer, limit) {
  const directory = await loadDirectory(sql);
  return directory
    .filter((e) => e.isCancer === cancer)
    .map((e) => ({ specialty: e.specialty, clinicType: e.clinicType, score: scoreClinicType(e, words) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || a.clinicType.length - b.clinicType.length)
    .slice(0, limit);
}

/**
 * Suggest the e-RS Specialty and Clinic Type for a referral note.
 *
 * Resolves in stages so the caller can always tell where it stopped, and never
 * returns a confident answer it has not earned:
 *   { matched, cancer, suggestion, alternatives, confidence, source, reason }
 *
 * `suggestion` is null unless a pairing cleared the confidence floor. Even when
 * it is set it is a SUGGESTION from the e-RS vocabulary, never practice policy.
 */
export async function lookupErsMapping(notes, { minSimilarity = 0.4, minConfidence = 0.34 } = {}) {
  const cancer = isCancerReferral(notes);
  const candidates = extractClinicalTerm(notes);
  const base = {
    matched: null, cancer, suggestion: null, alternatives: [],
    confidence: 0, source: 'snomed+ers-directory', reason: 'no-term', candidates,
  };
  if (!candidates.length) return base;

  await ensureSnomedSchema();
  const sql = getSql();

  // The SNOMED hop is what turns a typo or an abbreviation into settled clinical
  // wording. If it finds nothing, the raw phrase is still matched against the
  // vocabulary — a note saying "knee" should not fail just because SNOMED is
  // not loaded.
  let matched = null;
  for (const phrase of candidates) {
    matched = await resolveConcept(sql, phrase, minSimilarity);
    if (matched) break;
  }

  // Score against the note AND the concept it resolved to. The note holds words
  // the concept loses — "refer to orthopaedics for chronic knee pain" resolves
  // to "Chronic pain", which on its own could not find Orthopaedics / Knee.
  const words = new Set([
    ...candidates.flatMap((c) => c.split(' ')),
    ...(matched ? tokensOf(matched.term) : []),
    ...tokensOf(notes),
  ].filter((w) => w.length > 2));

  const ranked = await matchDirectory(sql, words, cancer, 4);

  const out = {
    ...base,
    matched: matched ? {
      conceptId: matched.concept_id,
      term: matched.term,
      semanticTag: matched.semantic_tag,
      score: Number(matched.score),
    } : null,
    reason: matched ? '' : 'no-concept',
  };

  const best = ranked[0];
  if (!best || best.score < minConfidence) {
    // A cancer referral still has a known specialty even when no clinic type is
    // confident enough — 2WW is decided by the note, not by the term match.
    if (cancer) {
      out.suggestion = { specialty: '2WW', clinicType: null };
      out.alternatives = ranked;
      out.confidence = 0;
      out.reason = 'specialty-only';
      return out;
    }
    out.alternatives = ranked;
    out.reason = 'no-confident-match';
    return out;
  }

  out.suggestion = { specialty: best.specialty, clinicType: best.clinicType };
  out.confidence = best.score;
  out.alternatives = ranked.slice(1);
  return out;
}

// Plain-English account of a lookup, for the assistant to pass on rather than
// silently returning nothing. Always states that this is a suggestion.
export function explainLookup(result) {
  const from = result.matched
    ? `SNOMED ${result.matched.conceptId} (${result.matched.term})`
    : `the wording "${result.candidates[0] || ''}"`;
  if (result.suggestion && result.suggestion.clinicType) {
    return `Suggested from ${from}: specialty ${result.suggestion.specialty}, clinic type ${result.suggestion.clinicType}. This is matched from the e-RS referral-types list, not the practice's own notes — confirm it against the doctor's task before sending.`;
  }
  if (result.reason === 'specialty-only') {
    return `This note reads as a cancer referral, so the specialty is 2WW. No clinic type matched ${from} confidently enough to suggest one — take it from the doctor's task.`;
  }
  if (result.reason === 'no-term') return 'No clinical condition could be picked out of the note.';
  if (result.reason === 'no-concept') return `No SNOMED concept matched ${result.candidates.map((c) => `"${c}"`).join(' or ')}, and nothing in the e-RS referral-types list was a close enough match.`;
  return `Nothing in the e-RS referral-types list matched ${from} closely enough to suggest. Take the speciality and clinic type from the doctor's task.`;
}
