// Why the pharmacy — named from the practice's own lists, and checked in code.
//
// A card saying "Community pharmacy (Pharmacy First)" used to rest on nothing
// but the reading's word for it. The reasoning line said why in prose, and prose
// can say anything: a pathway the patient is too old for, a condition that is on
// no list the practice keeps, a symptom the patient never wrote down. Reception
// had no way to tell a referral the guide supports from one the model argued
// itself into.
//
// So when /accurx names the pharmacy it must also name WHICH ENTRY on the
// practice's own Pharmacy First lists the message is — one of the seven clinical
// pathways, one of the minor illness referrals, or one of the self-care
// conditions (docs/routing.md, "Pharmacy First referral") — and quote the
// patient's words for it. Nothing here takes that on trust:
//
//   the name     has to be on one of those lists, exactly. A condition that is
//                not on them is not a reason, however reasonable it sounds.
//   the words    have to be in the message, character for character. A quote
//                the patient did not write is the model's word again.
//   the age      a clinical pathway's age range is a gate. Where the message
//                states an age, it is held to it; where it states none, the card
//                says so and asks reception to check before referring, rather
//                than assuming one either way.
//
// A pharmacy destination that fails any of those is not a pharmacy referral.
// lib/templates/accurx.mjs sends it where the practice sends anything it cannot
// place — the duty doctor — and says on the card exactly which check failed.
import { spanWithin } from '../safety/spans.mjs';
import { CLINICAL_PATHWAYS } from '../templates/pharmacy.mjs';
import { mskFeatures } from '../templates/fcp.mjs';
import { PHARMACY_MINOR_ILLNESS, SELF_CARE_CONDITIONS } from './destinations.mjs';
import { statedAges } from './ages.mjs';

export { statedAges };

export const PHARMACY_REASON_KINDS = {
  pathway: 'Pharmacy First clinical pathway — the pharmacist can treat',
  minorIllness: 'Minor illness referral',
  selfCare: 'Self-care list — not routinely prescribed here',
};

// Prefixed so the three lists can share a name ("Sore throat" is a pathway AND a
// minor illness) without the id meaning two things, and so the value reads as
// what it is wherever it turns up.
const PREFIX = { pathway: 'Pathway', minorIllness: 'Minor illness', selfCare: 'Self-care' };

/** Every valid reason, one per entry on the practice's lists. `id` is what the reading names. */
export const PHARMACY_REASONS = [
  ...CLINICAL_PATHWAYS.map((p) => ({
    id: PREFIX.pathway + ': ' + p.name,
    kind: 'pathway',
    name: p.name,
    age: p.age,
    min: p.min,
    max: p.max,
    women: !!p.women,
  })),
  ...PHARMACY_MINOR_ILLNESS.map((name) => ({ id: PREFIX.minorIllness + ': ' + name, kind: 'minorIllness', name })),
  ...SELF_CARE_CONDITIONS.map((name) => ({ id: PREFIX.selfCare + ': ' + name, kind: 'selfCare', name })),
];

export const PHARMACY_REASON_IDS = PHARMACY_REASONS.map((r) => r.id);

const BY_ID = new Map(PHARMACY_REASONS.map((r) => [r.id, r]));

/** A reason by the id the reading gave, or null for anything not on the lists. */
export const pharmacyReason = (id) => BY_ID.get(String(id || '').trim()) || null;

/**
 * Hold what the reading said about the pharmacy to the practice's lists.
 *
 * @param {object} said     the reading's `pharmacyReason` — { condition, evidence }
 * @param {string} message  the whole message, which the quote and the age are checked against
 *
 * Returns { ok, reason, quote, age, problem }. `problem` is the sentence the
 * card shows when it is not ok; `age` is 'fits', 'notStated' or 'unclear' on a
 * pathway, and '' for the two lists that have no age gate.
 */
export function checkPharmacyReason(said, message = '') {
  const given = (said && typeof said === 'object') ? said : {};
  const named = String(given.condition || '').trim();
  const quote = String(given.evidence || '').trim();
  const reason = pharmacyReason(named);
  const fail = (problem) => ({ ok: false, reason, quote: '', age: '', problem });

  if (!named || named === 'none') {
    return fail('It did not name which condition on the practice’s Pharmacy First lists this is.');
  }
  if (!reason) {
    return fail('It gave “' + named.slice(0, 80) + '”, which is not on the practice’s Pharmacy First lists.');
  }
  if (!quote) {
    return fail('It named ' + reason.name.toLowerCase() + ' but quoted nothing from the message to show it.');
  }
  if (!spanWithin(quote, message)) {
    return fail('It named ' + reason.name.toLowerCase() + ', but the words it quoted for it — “' + quote.slice(0, 120) + '” — are not in the message.');
  }

  // MUSCULOSKELETAL PAIN IN AN ADULT IS THE FCP'S, even where a list carries it.
  // Back pain and sprains are on the self-care and minor illness lists, and the
  // practice's routing guide still sends them to the FCP. So a reason that can
  // only be musculoskeletal, or the catch-all pain entry on a message that is,
  // goes there instead — unless the message says the patient is under 16, which
  // the FCP does not see.
  const ages = statedAges(message);
  const child = ages.length === 1 && ages[0] < 16;
  const mskOnly = reason.id === 'Minor illness: Sprains, strains and aches';
  const mskMaybe = /^Self-care: Minor pain/.test(reason.id);
  if (!child && (mskOnly || mskMaybe) && mskFeatures(message).msk) {
    return {
      ok: false, reason, quote: '', age: '', redirect: 'fcp',
      problem: 'It named ' + reason.name.toLowerCase() + ', but this is musculoskeletal pain in an adult — the practice’s routing guide sends that to the FCP, not the pharmacy.',
    };
  }

  if (reason.kind !== 'pathway') return { ok: true, reason, quote, age: '', problem: '' };

  if (ages.length === 1) {
    const [n] = ages;
    const low = typeof reason.min === 'number' && n < reason.min;
    const high = typeof reason.max === 'number' && n > reason.max;
    if (low || high) {
      return fail('The message gives the age as ' + (n < 1 ? 'under 1' : n) + ', and the ' + reason.name.toLowerCase()
        + ' pathway is for ' + reason.age.toLowerCase() + '. Outside the age range the pharmacist cannot treat under it.');
    }
    return { ok: true, reason, quote, age: 'fits', problem: '' };
  }
  // No age, or more than one person's: the gate stands, and reception checks it.
  return { ok: true, reason, quote, age: ages.length ? 'unclear' : 'notStated', problem: '' };
}
