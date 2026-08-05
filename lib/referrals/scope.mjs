// When a question is about MAKING a referral, and when that referral is one
// e-RS actually sends.
//
// The e-RS card — request type, priority, speciality, clinic type — is the first
// thing on the answer and the part that gets acted on. It was appearing on
// answers that had nothing to do with sending a referral, because everything
// downstream keyed off one regex: the word "refer" anywhere in the question.
// That word does far too much work in English and in a GP surgery:
//
//   "the policy referred to above"        — pointing at a document
//   "a patient referred to us by 111"     — a referral coming IN
//   "how do I chase a referral"           — one already sent
//   "where is the referral policy"        — about referrals, not making one
//
// None of those has an e-RS form behind it, and a card of four e-RS fields above
// the answer to any of them tells a receptionist to go and fill one in.
//
// So the decision is split in two, and both halves have to agree before the card
// is shown for a pairing the practice never wrote down:
//
//   isReferralRequest(question)  — is the reader making or sending a referral?
//   answerReferralRoute(text)    — does the answer actually route it on e-RS?
//
// Pure string handling, no database and no model, so both are directly testable.

// The noun is the strong signal — "a referral", "referrals" — because nothing
// else in English uses it. The verb is weaker: "refer to" is also how a document
// points at another document.
const REFERRAL_NOUN = /\breferrals?\b/i;
const REFERRAL_VERB = /\brefer(?:s|red|ring)?\b/i;

// The word pointing at something to read rather than sending a patient anywhere.
// Told apart by what sits either side of it: a document being pointed AT, or a
// document doing the pointing.
const DOCUMENT = '(?:polic(?:y|ies)|guide|guides|guidance|guidelines?|document|documents|handbook|manual|notebook|page|pages|section|appendix|protocols?|sops?|chart|table|list|form|leaflet|poster)';
const REFERENCE_SENSE = new RegExp(`\\brefer(?:s|red|ring)?\\s+to\\s+(?:the\\s+|our\\s+|that\\s+|this\\s+)?(?:${DOCUMENT}|above|below|attached|link|it)\\b`, 'i');
// "Where does the policy refer to chaperones", "the guide refers to smartcards".
const DOCUMENT_REFERS = new RegExp(`\\b${DOCUMENT}\\s+refers?\\s+to\\b`, 'i');
const REFERRED_TO_AS = /\breferred\s+to\s+as\b/i;

// A referral coming INTO the practice. The practice is the receiving end, so
// there is no e-RS form for the reader to fill in.
const INCOMING = [
  /\brefer(?:red|ral|rals)?\b[^.?]{0,24}\b(?:to us|to the practice|to this practice|to our practice|into the practice)\b/i,
  /\breferrals?\s+(?:from|received|incoming|we receive|sent to us)\b/i,
  /\brefer(?:red|ral)\w*\b[^.?]{0,20}\bby\s+(?:111|999|a hospital|the hospital|another practice|a&e|the ambulance)\b/i,
];

// A referral that has already gone. Chasing it, cancelling it or asking how long
// it takes is a question about an existing referral, not a request to send one.
const ALREADY_SENT = /\b(?:chase|chasing|chased|status|track|tracking|progress|how long|waiting list|wait(?:ing)? times?|rejected|returned|declined|cancel(?:led|ling)?|withdraw\w*|amend(?:ed|ing)?|reschedul\w*|lost|missing|not heard|heard nothing)\b/i;

// …unless the same question is also about sending one. "Send" and "sent" are
// deliberately absent: "a referral I already sent" is the shape being excluded.
const MAKING = /\b(?:make|making|submit|submitting|raise|raising|create|creating|complete|completing|refer)\b/i;

/**
 * Is this question a request to make or send a referral?
 *
 * Permissive about wording — "dermatology referral?", "how do I refer someone
 * for physio", "2ww skin" all qualify — and strict about the four shapes above,
 * which are the ones that were putting an e-RS card where none belonged.
 */
export function isReferralRequest(question) {
  const q = String(question || '');
  if (!q.trim()) return false;

  const noun = REFERRAL_NOUN.test(q);
  const verb = REFERRAL_VERB.test(q);
  if (!noun && !verb) return false;

  // Only the verb, and it is pointing at something to read. "Refer to the
  // chaperone policy" is not a referral question by any reading, and neither is
  // "where does the policy refer to chaperones".
  if (!noun && (REFERENCE_SENSE.test(q) || DOCUMENT_REFERS.test(q) || REFERRED_TO_AS.test(q))) return false;
  if (INCOMING.some((re) => re.test(q))) return false;
  if (ALREADY_SENT.test(q) && !MAKING.test(q)) return false;
  return true;
}

// The answer says in so many words that e-RS is NOT the route.
const NOT_ERS = [
  /\b(?:not|rather than|instead of)\b[^.]{0,40}\be-?rs\b/i,
  /\be-?rs\b[^.]{0,40}\b(?:is not|are not|isn.t|aren.t|does not|doesn.t|cannot|can.t)\b/i,
];

// A directive to do something ON e-RS. This is positive evidence: the reader is
// being sent to the e-RS form, so the four fields are what they need.
const USES_ERS = [
  /\b(?:on|in|via|through|onto|using|open|opens|opening)\s+(?:the\s+)?e-?rs\b/i,
  /\be-?rs\b\s*(?:referral|form|screen|worklist|service)/i,
  /\bchoose and book\b/i,
  /\bc&b\b/i,
  /\be-?referral service\b/i,
];

// Another route entirely. Named without any e-RS directive, the answer is about
// getting the referral somewhere by other means.
const OTHER_ROUTE = /\be-?mail(?:ed|s|ing)?\b|\baccurx\b|\bpost(?:ed|ing)? it\b|\bfax\b/i;

/**
 * Which route the written answer actually describes.
 *
 * @returns 'ers'        — the steps put the referral on e-RS
 *          'not-ers'    — the answer says e-RS is not the route
 *          'other'      — another route is named and e-RS never is
 *          'unstated'   — the answer does not say either way
 */
export function answerReferralRoute(text) {
  const t = String(text || '');
  if (!t.trim()) return 'unstated';
  if (NOT_ERS.some((re) => re.test(t))) return 'not-ers';
  if (USES_ERS.some((re) => re.test(t))) return 'ers';
  if (OTHER_ROUTE.test(t)) return 'other';
  return 'unstated';
}

/**
 * May this answer carry an e-RS card?
 *
 * `source` is where the pairing came from, and it sets how much the answer has
 * to prove:
 *
 *   'practice'  — the practice wrote the pairing down for this referral, so the
 *                 card is shown unless the answer sends the reader elsewhere.
 *   'suggested' — nothing the practice records covers it and the pairing was
 *                 matched from the e-RS referral-types list. That is a value for
 *                 a form, so the answer has to actually open that form: the card
 *                 needs positive evidence the referral goes on e-RS, not merely
 *                 the absence of evidence that it does not.
 */
export function allowsErsCard({ question, answerText, source = 'practice' } = {}) {
  if (!isReferralRequest(question)) return false;
  const route = answerReferralRoute(answerText);
  if (route === 'not-ers' || route === 'other') return false;
  if (source === 'suggested') return route === 'ers';
  return true;
}
