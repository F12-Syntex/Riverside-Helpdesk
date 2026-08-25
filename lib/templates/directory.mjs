// "What is the number for the Riverside Practice?" — answered from the
// directory, by name, with no model anywhere in the path.
//
// WHY THIS EXISTS. The assistant holds the practice's whole telephone sheet and
// still could not answer the simplest question anybody asks it. A message that
// no template fits falls through to prose, and the prose path is told outright
// that it cannot see the practice's own material — so a question whose answer
// is one row of a file in this repository came back as "I cannot see the
// practice's own material, ask the practice manager". The directory was never
// consulted, because nothing on that path consults it.
//
// So the router is asked one cheap question first: is this message somebody
// asking for a contact detail, and does the directory hold it? Both yes, and the
// answer is that row, rendered from structured data exactly as the contacts card
// renders it — the number is never authored by a model and so can never be
// mis-typed. Either one no, and nothing changes: the turn goes on to the
// template selection it always did.
//
// PURE ON PURPOSE. The entries are passed in rather than imported, so the whole
// thing can be tested against a fixture (test/directory-answer.test.mjs) and so
// the caller decides which directory is being searched — the merged one from
// lib/lookup/directory.js, which is the practice's sheet plus the hospitals.
import { searchContactsIn } from '../contacts.fuzzy.mjs';
import { answer, contacts, note } from './blocks.mjs';

// A message asking for a way to reach somebody. The nouns are what a reader
// actually types at the desk; "address" is deliberately absent, because the
// directory holds none and a card that answers a different question is worse
// than no card.
const DETAIL = '(?:phone|telephone|tel|mobile|direct dial|fax|extension|ext|e-?mail|email|number|line|contact details?|contact number|contact)';

// A message that is asking how something is DONE is not asking who to ring,
// even when it uses the word "contact" on the way past. These belong to the
// templates and the Notebook, and the directory must not take them.
const NOT_A_LOOKUP = /\b(?:refer|referral|referred|policy|procedure|protocol|register|registration|form|template|prescri\w*|fit note|sick note|complain\w*|book (?:an|a) appointment)\b/i;

// "Who do I ring about transport" asks for a way to reach somebody without
// using one of the nouns above — the verb is the ask. So this one opens the
// gate by itself as well as capturing its subject.
const REACH = /\b(?:how (?:do|can|would) (?:i|we|you)|who (?:do|should) (?:i|we)|where do (?:i|we))\s+(?:call|ring|phone|contact|email|reach|get hold of|get in touch with)\s+(?:for\s+|about\s+|regarding\s+)?(.+)$/i;

// The ways the ask is worded, each capturing the thing being asked about.
const PATTERNS = [
  // "the number for the district nurse", "email for medical records"
  new RegExp(`\\b${DETAIL}\\s+(?:for|of|to|at)\\s+(.+)$`, 'i'),
  // "what number do I call for bowel screening" — the noun and the thing are
  // the two ends of the sentence, with the verb between them.
  /\b(?:call|ring|phone|contact|email|dial)\s+(?:for|about|regarding)\s+(.+)$/i,
  // "how do I contact the district nurse", "who do I ring about transport"
  REACH,
  // "riverside practice number", "homerton switchboard telephone"
  new RegExp(`^(.+?)(?:'s|’s)?\\s+(?:direct\\s+|main\\s+|contact\\s+)?${DETAIL}\\b`, 'i'),
];

// Words that carry no subject of their own and only get in the way of the match.
const LEADING = /^(?:the|a|an|our|my|their|its|for|about|regarding|please|to|at|of|is|are|there)\s+/i;
const TRAILING = /[\s,.!?]+(?:please|thanks|thank you|asap|urgently)?[\s,.!?]*$/i;
// How the ask opens, stripped one word at a time until a real word is reached.
// "Can you give me the emis support number" carries six words of politeness in
// front of the two that name the entry, and every one of them counts against
// the match — a subject is the thing, not the sentence it arrived in.
const ASKING = /^(?:hi|hello|hey|please|can|could|would|you|i|we|do|does|did|know|give|show|tell|find|get|have|got|need|want|me|us|what|whats|what's|which|who|is|are|there|any|the|a|an|of|for|about|to|at|pls|plz)\b[\s,]*/i;

// The practice talking about itself. None of these words is on the entry's
// label, and a reader asking for "our number" is not going to type "The
// Riverside Practice" — so the phrase is resolved here rather than hoping the
// fuzzy matcher finds a name that was never said.
const SELF = new Set([
  'us', 'we', 'here', 'practice', 'the practice', 'our practice', 'this practice',
  'surgery', 'the surgery', 'our surgery', 'this surgery', 'reception',
  'the reception', 'front desk', 'the front desk', 'riverside', 'the riverside',
  'riverside practice', 'the riverside practice', 'riverside surgery',
  'the riverside surgery', 'the riverside practise', 'riverside practise',
  // "what's our number" leaves nothing behind but the possessive, and at this
  // desk "ours" is one practice.
  'our', 'ours', 'this', 'the',
]);
const SELF_LABEL = 'The Riverside Practice';

/**
 * What this message is asking for a contact detail about, or '' if it is not
 * asking for one at all.
 */
export function directorySubject(message) {
  const asked = String(message || '').trim().replace(/\s+/g, ' ');
  // A paragraph is not somebody asking for a number, whatever nouns it happens
  // to contain — it is a message to route, and the router should have it.
  if (!asked || asked.length > 160) return '';
  if (NOT_A_LOOKUP.test(asked)) return '';
  if (!new RegExp(`\\b${DETAIL}\\b`, 'i').test(asked) && !REACH.test(asked)) return '';

  for (const pattern of PATTERNS) {
    const found = asked.match(pattern);
    if (!found) continue;
    const captured = String(found[1] || '').replace(TRAILING, '').trim();
    // "the number for us" is the whole subject in a word the stripper below
    // would throw away, so the practice is recognised before anything is cut.
    if (SELF.has(captured.toLowerCase())) return SELF_LABEL;
    // "what is the number for..." — on the third pattern the question words sit
    // in front of the subject and are not part of it. Stripped to a fixed point
    // rather than once, because they arrive in any order and any number.
    let subject = captured;
    for (let last = ''; last !== subject;) {
      last = subject;
      subject = subject.replace(ASKING, '').replace(LEADING, '').trim();
    }
    subject = subject.replace(TRAILING, '').trim();
    if (SELF.has(subject.toLowerCase())) return SELF_LABEL;
    // One or two characters cannot pick an entry out of a hundred and fifty;
    // whatever they matched would be a coincidence.
    if (subject.length < 3) continue;
    return subject;
  }
  return '';
}

// A whole word landing on a name scores 60, and on the front of one 100
// (lib/contacts.fuzzy.mjs). Scattered letters score far less, and that is
// exactly the kind of hit that produces a confident card about the wrong
// department — so a hit has to average a real word per query term to count.
const PER_TERM = 45;
// Everything close to the best hit is shown, because "district nurse" is
// genuinely several entries and picking one of them for the reader is a guess.
const KEEP_WITHIN = 0.55;
const MOST = 3;

function detailsOf(entry) {
  const phones = (entry.phones || []).map((p) => p.display).filter(Boolean);
  const emails = (entry.emails || []).filter(Boolean);
  if (!phones.length && !emails.length) return null;
  return {
    label: entry.label,
    tel: phones[0] || '',
    email: emails[0] || '',
    // Everything the entry holds beyond the first of each, plus whatever the
    // sheet wrote next to it. Shown, never dropped: a second number on a row is
    // there because somebody needed it.
    note: [...phones.slice(1), ...emails.slice(1), entry.note || ''].filter(Boolean).join(' · '),
  };
}

/**
 * The directory's answer to this message, or null when it has none.
 *
 * `entries` are directory rows: { label, aliases, phones:[{display,tel}],
 * emails, note, source }.
 */
export function directoryAnswerIn(entries, message) {
  const subject = directorySubject(message);
  if (!subject) return null;

  // Somebody asking for an email address is not helped by a row that has only a
  // fax number on it. Asked for a number, or asked without saying which, and
  // every row the name matched is shown.
  const asked = String(message || '');
  const wantsEmail = /\be-?mail\b/i.test(asked)
    && !/\b(?:phone|telephone|tel|number|fax|ring|call)\b/i.test(asked);
  const holdsWhatWasAsked = (entry) => !wantsEmail || (entry.emails || []).length > 0;

  const terms = subject.split(/\s+/).filter(Boolean).length;
  const hits = searchContactsIn(entries || [], subject, 8)
    .filter((h) => h.score >= PER_TERM * terms)
    .filter((h) => holdsWhatWasAsked(h.entry));
  if (!hits.length) return null;

  const best = hits[0].score;
  const kept = hits.filter((h) => h.score >= best * KEEP_WITHIN).slice(0, MOST);
  const items = kept.map((h) => detailsOf(h.entry)).filter(Boolean);
  if (!items.length) return null;

  // One hit is titled with the entry, so the name is not printed twice on a
  // small card — the same reason lib/templates/library.mjs drops the label on a
  // single contact. Several hits keep their labels and are titled with what was
  // asked for, because telling them apart is the whole point.
  const one = items.length === 1;
  const sources = [...new Set(kept.map((h) => (h.entry.source === 'hospitals'
    ? 'Hospital directory — local acute trusts'
    : 'Practice directory — Useful Telephone Numbers')))];

  return answer({
    title: one ? items[0].label : subject,
    blocks: [
      contacts(items.map((item) => (one ? { ...item, label: '' } : item))),
      one ? null : note('The directory holds more than one entry by that name. Check the name before dialling.', 'info'),
    ],
    source: sources,
  });
}
