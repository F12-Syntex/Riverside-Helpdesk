// What a receptionist says, and the words the referral cards use for it.
//
// The Referrals page (lib/search/referrals.mjs) ranks by NAME: the card's
// title and the fields it is filed under. A reader rarely types those — they
// type "skin", "heart tracing", "nurse to visit at home" — so each group below
// is one thing a referral is for, in the words a reader says it and the words
// a card is called. A query word (or phrase) in a group stands for every term
// in it, so "skin" finds Dermatology and Teledermatology, and "camera down
// throat" finds Endoscopy.
//
// Plain data, by hand, read against the live section (11 Oct 2026, 62 pages).
// A new card whose name is already the word people type ("Gym", "Falls
// Clinic") needs nothing here; a card people ask for in other words needs a
// group, or a term added to one. Terms are lower case; a term of several words
// is matched as a phrase.
//
// Relative imports with extensions, not `@/`: the tests run this under plain
// `node`.
import { levenshtein } from '../lookup/fuzzy.js';

export const ALIAS_GROUPS = [
  // Skin.
  ['dermatology', 'derm', 'telederm', 'teledermatology', 'skin', 'mole', 'moles', 'rash', 'rashes', 'eczema', 'psoriasis',
    'acne', 'lesion', 'lesions', 'wart', 'warts', 'melanoma'],
  // Cancer, and the 2WW route that carries it.
  ['2ww', 'two week wait', '2 week wait', 'suspected cancer', 'cancer', 'oncology', 'tumour', 'tumor', 'malignant'],
  ['breast', 'breasts', 'mammogram'],
  ['2ww breast', 'breast lump', 'lump in breast', 'breast clinic 2ww'],
  ['family history', 'fh', 'brca', 'genetic'],
  ['breast screening', 'mammography', 'mammogram'],
  ['bowel cancer screening', 'bowel screening', 'fit test', 'fit kit', 'poo test', 'screening kit'],
  // Heart.
  ['ecg', 'ekg', 'electrocardiogram', 'heart tracing', 'tracing', '48 hour tape', '24 hour tape', 'holter',
    'palpitations', 'heart rhythm', 'irregular heartbeat'],
  ['echo', 'echocardiogram', 'heart scan', 'heart ultrasound', 'murmur', 'heart failure'],
  ['cardiology', 'cardiac', 'heart', 'chest pain', 'angina', 'racpc', 'rapid access chest pain'],
  ['hypertension', 'blood pressure', 'high blood pressure', 'bp'],
  // Nursing at home.
  ['district nurse', 'dn', 'acn', 'adult community nursing', 'community nursing', 'nurse', 'nurses', 'nursing',
    'home visit', 'visit', 'home', 'housebound', 'wound', 'wounds', 'dressing', 'dressings', 'leg ulcer', 'catheter'],
  // Eyes, ears, nose, throat, mouth.
  ['eye', 'eyes', 'ophthalmology', 'optician', 'opticians', 'mecs', 'minor eye', 'vision', 'sight', 'red eye',
    'stye', 'styes', 'eyelid', 'conjunctivitis'],
  ['diabetic eye', 'retinal', 'retinopathy', 'eye screening'],
  ['audiology', 'hearing', 'hearing test', 'deaf', 'deafness', 'hearing aid', 'hearing aids', 'tinnitus'],
  ['ent', 'ear', 'ears', 'nose', 'throat', 'sore throat', 'sinus', 'sinusitis', 'tonsils', 'tonsillitis', 'earache',
    'ear wax', 'tinnitus', 'lawson'],
  ['maxfax', 'maxillofacial', 'max fax', 'oral surgery', 'jaw', 'wisdom tooth', 'wisdom teeth', 'tmj', 'mouth', 'oral'],
  // Gut.
  ['endoscopy', 'gastroscopy', 'ogd', 'camera down throat', 'camera test', 'heartburn', 'reflux', 'indigestion',
    'dyspepsia', 'upper gi', 'swallowing'],
  // Bones, joints, muscles, feet.
  ['orthopaedics', 'orthopaedic', 'ortho', 'orthopedics', 'bone', 'bones', 'joint replacement', 'knee', 'hip',
    'shoulder', 'elbow', 'ankle', 'limb', 'fracture'],
  ['physiotherapy', 'physio', 'physical therapy', 'sports injury', 'back pain', 'neck pain', 'sprain', 'msk',
    'musculoskeletal', 'esp', 'extended scope', 'locomotor', 'knee', 'shoulder', 'back'],
  ['rheumatology', 'rheum', 'rheumatoid', 'arthritis', 'autoimmune', 'lupus', 'gout', 'joint pain', 'joints',
    'inflammatory'],
  ['pain management', 'pain clinic', 'chronic pain', 'pain'],
  ['podiatry', 'podiatrist', 'foot', 'feet', 'chiropody', 'chiropodist', 'toenail', 'toenails', 'at risk foot',
    'diabetic foot', 'bunion', 'verruca'],
  ['walking stick', 'stick', 'walking aid', 'crutches', 'splint', 'wrist splint', 'frame', 'mobility aid'],
  ['falls', 'fall', 'falling', 'fell', 'unsteady', 'balance'],
  // Surgery.
  ['general surgery', 'hernia', 'hernias', 'surgeon', 'gallstones', 'gallbladder'],
  ['minor surgery', 'lipoma', 'cyst', 'cysts', 'skin tag', 'skin tags', 'lump', 'lumps', 'removal', 'excision'],
  // Women's health.
  ['gynaecology', 'gynae', 'gyn', 'gynecology', 'period', 'periods', 'heavy periods', 'menstrual', 'pelvic', 'ovary',
    'ovarian', 'womb', 'uterus', 'menopause', 'coil', 'endometriosis', 'fibroids'],
  ['fertility', 'infertility', 'ivf', 'conceive', 'conceiving', 'trying for a baby'],
  // Children and mental health.
  ['paediatric', 'paediatrics', 'paeds', 'pediatric', 'child', 'children', 'kids', 'kid', 'baby', 'babies', 'infant'],
  ['camhs', 'child mental health', 'children mental health', 'adolescent mental health', 'young person mental health'],
  ['adhd', 'attention deficit'],
  // Breathing, sleep, tiredness, diabetes.
  ['sleep apnoea', 'sleep', 'apnoea', 'apnea', 'snoring', 'snore', 'sleep study', 'osa'],
  ['asthma', 'inhaler', 'wheeze', 'wheezy'],
  ['chronic fatigue', 'cfs', 'fatigue', 'tired', 'tiredness', 'exhausted', 'exhaustion'],
  ['diabetes', 'diabetic', 'eddi', 'blood sugar', 'desmond'],
  // Everything else on the list.
  ['bcg', 'tb vaccine', 'tuberculosis', 'tb'],
  ['gym', 'exercise', 'exercise on referral', 'fitness'],
  ['social prescriber', 'social prescribing', 'social prescription', 'lonely', 'loneliness', 'isolation', 'isolated',
    'link worker', 'housing', 'benefits'],
  ['radiology', 'xray', 'x ray', 'imaging'],
];

// Words that say nothing about which referral: left in, "nurse to visit at
// home" would need "to" and "at" matched as well. The "referral" words are
// stripped earlier (referralQuery).
const STOP = new Set(['a', 'an', 'the', 'to', 'at', 'for', 'of', 'in', 'on', 'with', 'and', 'or', 'my', 'me', 'is',
  'all', 'need', 'needs', 'want', 'wants', 'patient', 'pt', 'please', 'some', 'problem', 'problems', 'issue', 'issues',
  'about', 'from', 'by', 'up', 'out', 'new', 'get', 'send', 'do', 'how', 'who', 'where', 'what', 'time']);

/** Lower case, typographic hyphens plain, everything but letters and digits a space, split. "48-hour" → ["48", "hour"]. */
export function tokens(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―−]/g, '-').match(/[a-z0-9]+/g) || [];
}

const GROUPS = ALIAS_GROUPS.map((terms) => terms.map(tokens).filter((t) => t.length));

// One word against another: the same word, or one typo in a word of five or
// more letters ("dermatolgy", "physoi" is too short to guess at).
function sameWord(a, b) {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && Math.abs(a.length - b.length) <= 1 && levenshtein(a, b, 1) <= 1;
}

function phraseAt(words, at, phrase) {
  if (at + phrase.length > words.length) return false;
  return phrase.every((w, i) => sameWord(words[at + i], w));
}

/**
 * The query as CONCEPTS: each one thing the reader asked for, as the terms
 * (each a token list) that stand for it. Phrases are taken longest first, so
 * "heart tracing" is the ECG and not "heart" and "tracing"; words in the same
 * group are one concept ("nurse to visit at home" is one thing, asked three
 * ways); a word in no group is a concept of itself.
 *
 *   conceptsOf("cancer skin") → [{ words:["cancer"], terms:[["2ww"], …] }, { words:["skin"], terms:[["dermatology"], …] }]
 */
export function conceptsOf(query) {
  const words = tokens(query);
  const out = [];
  const byGroup = new Map();
  let at = 0;
  while (at < words.length) {
    // The longest phrase from any group that starts here.
    let best = 0;
    let groups = [];
    GROUPS.forEach((terms, g) => {
      for (const term of terms) {
        if (term.length < best || !phraseAt(words, at, term)) continue;
        if (term.length > best) { best = term.length; groups = []; }
        if (!groups.includes(g)) groups.push(g);
      }
    });
    if (!best) {
      const word = words[at];
      at += 1;
      if (STOP.has(word) || word.length < 2) continue;
      out.push({ words: [word], terms: [[word]], typed: true });
      continue;
    }
    const said = words.slice(at, at + best);
    at += best;
    // A phrase in a group already asked for is the same concept again.
    const key = groups.join(',');
    const known = byGroup.get(key);
    if (known) { known.words.push(...said); continue; }
    const terms = [];
    const seen = new Set();
    for (const g of groups) {
      for (const term of GROUPS[g]) {
        const k = term.join(' ');
        if (!seen.has(k)) { seen.add(k); terms.push(term); }
      }
    }
    const concept = { words: said, terms, typed: false };
    byGroup.set(key, concept);
    out.push(concept);
  }
  return out;
}

/**
 * Whether `nameWords` (tokens of a card's name text) says `term` (a token
 * list). Each word of the term matches the name's word at the same place.
 *
 * A word the reader TYPED (`typed`, a word in no group) is matched loosely,
 * because it may be half a word or misspelt: as sameWord, as the start of the
 * name's word ("rheum" → "rheumatology"), or inside it ("dermatology" in
 * "teledermatology"). An ALIAS is matched as a whole word (with sameWord's one
 * typo), or — seven letters or more — inside one: a loose alias is how "home"
 * found "Homerton" and "physio" found "Physiological".
 */
export function nameSays(nameWords, term, { typed = false } = {}) {
  // Two typos in a typed word of eight letters or more ("rhumotology"), as
  // the Contact numbers matcher allows.
  const fits = typed
    ? (have, want) => sameWord(have, want) || (want.length >= 3 && have.startsWith(want)) || (want.length >= 5 && have.includes(want))
      || (want.length >= 8 && have.length >= 7 && levenshtein(have, want, 2) <= 2)
    : (have, want) => sameWord(have, want) || (want.length >= 7 && have.includes(want));
  for (let at = 0; at + term.length <= nameWords.length; at++) {
    if (term.every((w, i) => fits(nameWords[at + i], w))) return true;
  }
  return false;
}

/** Every term of every concept, as words for the keyword search (orQuery). */
export function searchWords(concepts) {
  return [...new Set(concepts.flatMap((c) => c.terms.flat()))].join(' ');
}
