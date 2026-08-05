// What the e-RS card shows when the practice's own notes record nothing.
//
// The Notebook is the source of truth for the speciality and clinic type of a
// referral the practice actually makes. It does not cover every referral, and
// until now a referral it had no page for reached the reader as "not recorded —
// take it from the doctor's task", even though the lookup in ers-lookup.js had
// already worked a pairing out from the practice's own e-RS referral-types
// export. That pairing was offered to the writer as a hint and was lost whenever
// the writer did not pick it up.
//
// This decides, after the answer has been written, which of the two the card is
// showing — and hands back the provenance of a determined one so the reader is
// told what it was determined FROM rather than being asked to trust it:
//
//   practice-recorded → shown as it stands, no provenance, no caveat
//   determined        → shown with the SNOMED concept it resolved through, the
//                       e-RS referral-types list it was matched against, how
//                       good the match was, and what else was close
//
// FILLING THE CARD IN IS THE NARROW CASE, not the default. Determining a pairing
// puts four e-RS fields at the top of an answer that never had them, so it needs
// all three of these to be true, and each one is checked here rather than
// trusted to whatever produced the lookup:
//
//   1. the reader is actually making a referral (not chasing one, not receiving
//      one, not reading a policy that mentions the word) — lib/referrals/scope
//   2. the answer routes it on e-RS, said in the answer's own steps
//   3. the match is firm enough to act on
//
// Without them the card was appearing on answers with no referral in them at
// all, because a lookup that returned anything was enough to conjure one.
//
// Pure so it can be tested without a database or a model: everything it needs
// arrives as arguments.
import { isReferralRequest, answerReferralRoute } from './scope.mjs';

// How good a match has to be before it becomes a card the practice never wrote.
// The lookup's own floor (lib/referrals/ers-lookup.js) is lower on purpose: a
// weak match is still worth OFFERING to the writer as a labelled hint, which it
// can weigh against the sources. Printing one in the box the reader copies into
// e-RS is a different act and is held to a higher bar.
const MIN_DETERMINED_CONFIDENCE = 0.5;

const flat = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const same = (a, b) => flat(a) === flat(b);

// Is this value written down in one of the sources the answer actually read?
// Used to catch a pairing that came from the lookup but was labelled "practice"
// by the writer — the label decides whether the reader is warned, so it cannot
// be taken on trust.
function recordedInSources(value, sourceTexts) {
  const needle = flat(value);
  if (!needle) return false;
  return sourceTexts.some((text) => flat(text).includes(needle));
}

function hasPairing(route) {
  if (!route) return false;
  return !!(route.specialty || route.clinicType || (route.clinicTypeOptions || []).length);
}

// The pairing on the card is the one the lookup returned, rather than something
// the sources record. Both fields have to agree: a card naming the suggestion's
// speciality but a clinic type of its own came from somewhere else.
function matchesSuggestion(route, suggestion) {
  if (!same(route.specialty, suggestion.specialty)) return false;
  if (!route.clinicType && !suggestion.clinicType) return true;
  return same(route.clinicType, suggestion.clinicType);
}

function provenanceOf(suggestion) {
  return {
    // Named rather than described, because this line is the answer to "where did
    // this come from?" and it has to survive being read at speed.
    basis: 'e-RS referral types',
    snomed: suggestion.snomed || null,
    confidence: typeof suggestion.confidence === 'number' ? suggestion.confidence : null,
    alternatives: (suggestion.alternatives || [])
      .filter((a) => a && a.specialty && a.clinicType)
      .map((a) => ({ specialty: a.specialty, clinicType: a.clinicType }))
      .slice(0, 3),
    cancer: !!suggestion.cancer,
    explanation: String(suggestion.explanation || ''),
  };
}

// Is this match firm enough to become a card in its own right? A cancer referral
// is the one exception: its specialty is settled by the note saying "2WW", not
// by how well any term matched, so it does not have to clear a bar meant for the
// term match.
function confidentEnough(suggestion) {
  if (suggestion.cancer && !suggestion.clinicType) return true;
  if (typeof suggestion.confidence !== 'number') return true;
  return suggestion.confidence >= MIN_DETERMINED_CONFIDENCE;
}

/**
 * Settle the referral card against the lookup.
 *
 * @param route        the referralRoute the writer produced, or null
 * @param suggestion   { specialty, clinicType, snomed, alternatives, confidence,
 *                       cancer, explanation } from lookupErsMapping, or null
 * @param sourceTexts  the text of every practice source the answer read
 * @param question     the reader's question, so a pairing is only filled in for
 *                     someone actually making a referral
 * @param answerText   the written answer, so a pairing is only filled in when
 *                     its own steps put the referral on e-RS
 * @returns { route, determination } — `determination` is null when the pairing
 *          came from the practice's own material, and carries the provenance
 *          when it was worked out here.
 */
export function determineReferralRoute({
  route = null, suggestion = null, sourceTexts = [], question = '', answerText = '',
} = {}) {
  const usable = suggestion && (suggestion.specialty || suggestion.clinicType) ? suggestion : null;
  if (!usable) return { route: route || null, determination: null };

  // Nothing came out of the answer at all, or nothing that says where the
  // referral goes. This is the case the whole thing exists for: the Notebook has
  // no page for this referral, so the pairing is filled in from the lookup and
  // labelled as determined rather than left as a blank the reader must fill.
  //
  // It is also the case that put e-RS cards on answers about chasing a referral,
  // about one arriving from a hospital, and about referrals emailed to a service
  // — so a card is only conjured here for a referral being MADE, ON e-RS, from a
  // match firm enough to act on. A route the writer produced and the composer
  // then dropped as out of scope reaches this branch as null, and must stay null.
  if (!hasPairing(route)) {
    if (!isReferralRequest(question)) return { route: route || null, determination: null };
    if (answerReferralRoute(answerText) !== 'ers') return { route: route || null, determination: null };
    if (!confidentEnough(usable)) return { route: route || null, determination: null };
    return {
      route: {
        requestType: (route && route.requestType) || 'Referral',
        // A cancer referral's priority is settled by the note, not by the match.
        priority: (route && route.priority) || (usable.cancer ? '2WW' : ''),
        specialty: usable.specialty || '',
        clinicType: usable.clinicType || '',
        clinicTypeOptions: [],
        clinicTypeCondition: (route && route.clinicTypeCondition) || '',
        source: 'suggested',
      },
      determination: provenanceOf(usable),
    };
  }

  if (route.source === 'suggested') return { route, determination: provenanceOf(usable) };

  // Labelled as the practice's own, but no source the answer read says it. If it
  // is word for word what the lookup returned, it came from the lookup, and the
  // reader is owed the caveat that goes with that.
  if (matchesSuggestion(route, usable)
    && !recordedInSources(route.specialty, sourceTexts)
    && !recordedInSources(route.clinicType, sourceTexts)) {
    return { route: { ...route, source: 'suggested' }, determination: provenanceOf(usable) };
  }

  return { route, determination: null };
}
