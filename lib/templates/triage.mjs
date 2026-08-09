// Where does this patient go?
//
// The commonest thing said at the desk is a description of somebody's problem,
// and the only thing the person saying it wants to know is where it goes. That
// is not the same question as "write me the reason for the appointment" — the
// reason line is written once the destination is already settled — and answering
// one with the other is how "pt has mild discomfort in their eyes" came back as
// a tidy clinical summary instead of "send them to the pharmacy".
//
// The order below IS the safety model, and it runs top to bottom:
//
//   1. Red flags         never anywhere but a clinician, whatever else matches.
//   2. Eye red flags     the same, for the ones specific to eyes, because a red
//                        eye is a pharmacy job right up until it is not.
//   3. Minor eye service the practice's own optician route.
//   4. Pharmacy First    clinical pathway, CPSAS or minor illness.
//   5. Otherwise         a clinician here.
//
// Nothing later can override something earlier. A description matching both a
// red flag and the CPSAS list is a red flag.
import { answer, bullets, expand, field, fields, note, steps } from './blocks.mjs';
import { CLINICAL_PATHWAYS, CPSAS_CONDITIONS, MINOR_ILLNESS, findClinicalPathway, pharmacyFirstAnswer } from './pharmacy.mjs';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Emergencies and things that must reach a clinician today, whatever else the
// description also matches.
const RED_FLAGS = /\b(chest pain|short(?:ness)? of breath|breathless|difficulty breathing|stroke|face drooping|severe bleed\w*|haemorrhage|collaps\w+|unconscious|anaphyla\w+|sepsis|septic|seizure|suicid\w+|overdose|head injury|severe abdominal pain|meningitis|non.?blanching|blood in (?:stool|vomit|urine)|coughing up blood)\b/i;

// The eye ones specifically. A red eye is a pharmacy job right up until any of
// these appear, and they are easy to miss inside a sentence that otherwise
// reads exactly like conjunctivitis.
const EYE_RED_FLAGS = /\b(loss of vision|vision loss|lost (?:my |their )?(?:sight|vision)|blurred vision|severe (?:eye )?pain|photophob\w+|light sensitiv\w+|contact lens\w*|chemical|foreign body|penetrat\w+|trauma|injur\w+|halo\w*)\b/i;

const EYE = /\b(eye|eyes|eyelid|conjunctiv\w+|stye|styes|chalazion)\b/i;
const STYE = /\b(stye|styes|chalazion|lump on (?:the )?eyelid)\b/i;
// How a red eye is actually described at the desk. Not one of these words
// appears on any pharmacy list, which is exactly why they are needed here.
const EYE_MINOR = /\b(red|redd\w+|pink|sore|irritat\w+|itch\w*|gritty|sticky|watery|water\w*|weep\w+|discharg\w+|liquid|goo\w*|crust\w*|mucus|pus)\b/i;

const DUTY = 'The duty doctor';

function emergency(what, why) {
  return answer({
    title: what,
    subtitle: 'Not for the pharmacy or a routine appointment',
    blocks: [
      fields([field('Send it to', DUTY)], 'Where this goes'),
      note(why, 'critical'),
      bullets([
        'Pass it to the **duty doctor** now.',
        'If the patient is acutely unwell, call **999** and stay with them.',
      ]),
    ],
    source: ['Triage guidelines'],
  });
}

/**
 * Triage one described problem.
 * `condition` is the description, in whatever words the staff member used.
 */
export function triagePatientAnswer({ condition = '' } = {}) {
  const said = String(condition || '').trim();
  if (!said) {
    return answer({
      title: 'Where does this go?',
      subtitle: 'Say what the patient has',
      blocks: [
        note('Describe the problem and this will say where it goes — the pharmacy, the minor eye service, or a clinician here.', 'info'),
      ],
      source: ['Triage guidelines'],
    });
  }

  if (RED_FLAGS.test(said)) {
    return emergency(said, 'This is not a minor illness. It needs a clinician, not a pharmacy.');
  }

  if (EYE.test(said) && EYE_RED_FLAGS.test(said)) {
    return emergency(
      said,
      'A red eye with pain, changed vision, light sensitivity, an injury, or in a contact lens wearer, is not a minor eye condition. It needs a clinician the same day.',
    );
  }

  // A red, sticky, watering eye is conjunctivitis, which is on the CPSAS list —
  // but almost nobody says "conjunctivitis" at the desk. The reported miss was
  // "mild discomfort in their eyes, slightly reddish and some liquid release":
  // every word of that describes it and not one of them matches the list. The
  // symptoms are named here so the lists do not have to be.
  if (EYE.test(said) && EYE_MINOR.test(said) && !STYE.test(said)) {
    const card = pharmacyFirstAnswer({ condition: 'Conjunctivitis' });
    return answer({
      title: 'Red or sticky eye',
      subtitle: card.subtitle,
      blocks: [
        fields([field('Send it to', 'Community pharmacy (Pharmacy First)')], 'Where this goes'),
        note('Treated as **conjunctivitis** — on the CPSAS list, so the medicines are free for eligible patients.', 'info'),
        ...card.blocks.slice(1),
        expand('When a red eye is NOT for the pharmacy', [
          bullets([
            'Pain rather than discomfort, or any change in vision',
            'Sensitivity to light',
            'A contact lens wearer',
            'An injury, a chemical splash, or something in the eye',
          ]),
          note('Any of these needs a clinician the same day.', 'warn'),
        ]),
      ],
      source: card.source,
    });
  }

  // The practice's own optician route, and it carries a deadline.
  if (STYE.test(said)) {
    return answer({
      title: said,
      subtitle: 'Minor eye service',
      blocks: [
        fields([
          field('Send it to', 'Rose Opticians — Minor Eye Service'),
          field('Telephone', '0208 975 1971'),
        ], 'Where this goes'),
        steps([
          'Ask the patient to call **Rose Opticians** and book an appointment.',
          'Check they can be seen **within 24 hours**.',
        ]),
        note('If they cannot be seen within 24 hours, <mark>tell the GP immediately</mark>.', 'critical'),
      ],
      source: ['Minor eye service — styes (Rose Opticians)'],
    });
  }

  // Pharmacy First. The card it builds already handles the age gate and whether
  // the medicines are free, so triage does not duplicate any of that — it puts
  // the destination on the front and hands the rest over.
  const pathway = findClinicalPathway(said);
  const onList = pathway
    || CPSAS_CONDITIONS.some((c) => norm(said).includes(norm(c.split(' / ')[0].replace(/\s*\(.*\)/, ''))))
    || MINOR_ILLNESS.some((c) => norm(said).includes(norm(c.split(/[,(]/)[0])));

  if (onList) {
    const card = pharmacyFirstAnswer({ condition: said });
    return answer({
      title: card.title,
      subtitle: card.subtitle,
      blocks: [
        fields([field('Send it to', 'Community pharmacy (Pharmacy First)')], 'Where this goes'),
        ...card.blocks,
      ],
      source: card.source,
    });
  }

  // Nothing matched. Not a failure — most things do belong here — but it must
  // not read as "the pharmacy cannot take it", because the minor illness list
  // is explicitly not exhaustive.
  return answer({
    title: said,
    subtitle: 'Not on a pharmacy list',
    blocks: [
      fields([field('Send it to', DUTY)], 'Where this goes'),
      note('This is not one of the Pharmacy First pathways or the CPSAS conditions. Book it here, or pass it to the duty doctor if it needs seeing today.', 'info'),
      expand('Could a pharmacy still take it?', [
        note('The minor illness list is not exhaustive — a pharmacy can take anything reasonably minor, and the pharmacist uses their judgement.', 'info'),
        bullets(CLINICAL_PATHWAYS.map((p) => `**${p.name}** — ${p.age}`)),
      ]),
    ],
    source: ['Triage guidelines', 'Pharmacy First and CPSAS'],
  });
}
