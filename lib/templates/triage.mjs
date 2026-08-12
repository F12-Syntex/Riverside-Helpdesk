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
//   2. Cauda equina      back pain with bladder, bowel or saddle symptoms. Its
//                        own step because it is the one spinal presentation that
//                        cannot wait for an appointment of any kind.
//   3. Anything to do with the EYES, which the practice sends to the minor eye
//      service. Checked BEFORE Pharmacy First, because a red sticky eye is on
//      both lists and the optician is the one who can actually examine it.
//   4. Musculoskeletal   the FCP, whenever the problem has nerve-root symptoms,
//                        has already failed self-care, is disabling, or physio
//                        was asked for. Checked BEFORE Pharmacy First, because
//                        "back pain" is on the pharmacy lists and sciatica that
//                        has beaten maximum-dose ibuprofen is not a self-care
//                        problem however the lists match it.
//   5. Pharmacy First    clinical pathway, CPSAS or minor illness.
//   6. Otherwise         a clinician here.
//
// Nothing later can override something earlier. A description matching both a
// red flag and the CPSAS list is a red flag.
//
// AND IT ALL RUNS OVER THE WHOLE MESSAGE. The router reduces what the patient
// wrote to a short condition name — "bad back" becomes "back pain" — and every
// feature above lives in the sentences it drops. So `condition` titles the card
// and `text` decides it.
import { answer, bullets, expand, field, fields, message, note, steps } from './blocks.mjs';
import { CLINICAL_PATHWAYS, CPSAS_CONDITIONS, MINOR_ILLNESS, findClinicalPathway, pharmacyFirstAnswer } from './pharmacy.mjs';
import { caudaEquinaAnswer, fcpAnswer, gpAssessmentAnswer, isSpinalEmergency, mskFeatures, needsFcp, needsGpFirst } from './fcp.mjs';
// Emergencies and things that must reach a clinician today, whatever else the
// description also matches. The list itself now lives in lib/safety/redflags.mjs
// — unchanged, word for word — because it stopped being a triage rule the day
// it started running on every turn rather than only on the ones that reached
// here. Imported back so this file behaves exactly as it always has.
import { RED_FLAGS } from '../safety/redflags.mjs';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// REFERRING IS THE EXCEPTION, NOT THE DEFAULT.
//
// This was the wrong way round and it produced a bad answer: anything
// eye-shaped went to the optician unless it matched a narrow list of
// exclusions, so "severe eye trauma with eye bleeding" — which matched none of
// the words on that list — was sent to Rose Opticians with a cheerful message
// about bringing their glasses. Referring by default means every gap in the
// exclusions becomes a wrong referral, and the gaps are invisible until one
// reaches a patient.
//
// So there are three lists now, and a description must EARN its way to MECS:
//   EYE_TO_AE       goes straight to A&E. Checked first, matched broadly.
//   EYE_NOT_MECS    already under someone else's care.
//   MECS_TREATS_RE  what the practice's page says the optician treats. Only a
//                   match here is referred; anything else goes to a clinician.

// Broad on purpose. The page gives "significant trauma" with penetrating injury
// and lacerations as EXAMPLES, so matching only the examples missed the whole
// category — which is exactly what went wrong. Bleeding from an eye is not a
// minor eye condition under any reading.
const EYE_TO_AE = new RegExp([
  'sudden loss of vision', 'lost (?:my |their |all )?(?:sight|vision)',
  '(?:considerable|severe|intense|excruciating) (?:eye |ocular )?pain',
  '(?:severe|significant|serious|major|bad) (?:eye |ocular |facial )?(?:trauma|injur\\w+|damage)',
  'bleed\\w*', 'blood', 'haemorrhag\\w+', 'hyphaema',
  'penetrat\\w+', 'laceration\\w*', 'stab\\w*', 'impale\\w*',
  'chemical', 'bleach', 'acid', 'alkali', 'burn\\w*',
  'after (?:eye )?surgery', 'recent eye surgery', 'post.?operative',
].join('|'), 'i');

// Already under someone else's care, so not a MECS job either.
const EYE_NOT_MECS = /\b(cataract\w*|glaucoma|dry eye)\b/i;

// What the practice's page says the optician treats. A description has to match
// one of these to be referred anywhere near Rose Opticians.
const MECS_TREATS_RE = new RegExp([
  'red', 'redd\\w+', 'pink',
  'discomfort', 'irritat\\w+', 'sore', 'gritty', 'itch\\w*',
  'discharg\\w+', 'watering', 'watery', 'weep\\w+', 'sticky', 'crust\\w*', 'liquid', 'goo\\w*', 'mucus', 'pus',
  'flash\\w*', 'floater\\w*',
  'scratch\\w*', 'graze\\w*', 'mild trauma',
  'foreign body', 'something in (?:the |their |his |her )?eye', 'grit', 'dust', 'eyelash',
  'double vision', 'diplopia',
  'conjunctiv\\w+', 'stye', 'styes', 'chalazion',
  'reduc\\w+ (?:in )?vision', 'blurred', 'blurry',
].join('|'), 'i');

// Not every eye problem contains the word "eye". "Flashes and floaters" and
// "sudden loss of vision" are both on the practice's MECS page and neither
// mentions one, so both fell past the eye check to the duty doctor — the second
// of those should have gone straight to A&E.
const EYE = /\b(eye|eyes|eyelid|conjunctiv\w+|stye|styes|chalazion|vision|sight|floaters?|flashes|blurred|cataract\w*|glaucoma|optician|optometr\w+|mecs)\b/i;
const STYE = /\b(stye|styes|chalazion|lump on (?:the )?eyelid)\b/i;

const DUTY = 'The duty doctor';

// WHERE IT GOES IS THE ONE THING THAT LEAVES THIS CARD.
//
// Every routing card below carries a Copy on its destination and on nothing
// else. That value is the whole output of a triage — it gets typed into the
// task, the note or the appointment that passes the patient on — and one copy
// per card is what keeps it a signal: a Copy on every row would be four buttons
// and no indication of which one the reader actually came for.
//
// The two EMERGENCY cards deliberately do not have one. Nobody types anything
// off "interrupt the duty doctor now" — they stand up — and a copy pill on an
// emergency card is a decoration on the one card that must read as an
// instruction. The same goes for the cauda equina card in fcp.mjs.

// The card is titled with what was described, and what was described is
// sometimes the whole pasted message — the router is allowed to leave the
// condition empty and fall back to the question. Matching still runs over the
// full text; only the heading is cut.
const heading = (said) => (said.length > 64 ? said.slice(0, 61).replace(/[\s,;.]+$/, '') + '…' : said);

function emergency(what, why) {
  return answer({
    title: heading(what),
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
 *
 * `condition` is the description in whatever words the staff member used, and
 * titles the card. `text` is the message it came from — the whole online
 * consultation, if that is what was pasted in. Every check below runs over both,
 * so a red flag the router summarised out of `condition` still decides where
 * this goes.
 *
 * `complaint` is the verbatim span of the one request this card is about, when
 * the message carried several. It narrows what the cards below may CLAIM about
 * the patient; it never narrows what is checked for.
 */
export function triagePatientAnswer({ condition = '', text = '', complaint = '' } = {}) {
  const said = String(condition || '').trim();
  const full = [said, String(text || '')].filter(Boolean).join('\n');
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

  if (RED_FLAGS.test(full)) {
    return emergency(said, 'This is not a minor illness. It needs a clinician, not a pharmacy.');
  }

  // Read the musculoskeletal features once, here, and use them at both of the
  // points below that need them.
  const msk = mskFeatures(full);

  // CAUDA EQUINA. Back or limb pain with bladder, bowel, saddle or both-leg
  // symptoms. Above the eye check and everything under it, because this is the
  // one that is measured in hours.
  if (isSpinalEmergency(msk)) return caudaEquinaAnswer({ condition: said });

  // EYES GO TO THE MINOR EYE SERVICE. The practice's page lists what MECS
  // treats — red eyes and lids, discomfort, discharge and watering, flashes and
  // floaters, reduced vision, mild trauma, a suspected foreign body, double
  // vision — and separately lists what must go straight to A&E. Anything on the
  // first list is an optician appointment, not one of ours and not a pharmacy
  // one, so the eye check runs before Pharmacy First rather than after it.
  if (EYE.test(full)) {
    if (EYE_TO_AE.test(full)) {
      return answer({
        title: heading(said),
        subtitle: 'Straight to eye A&E',
        blocks: [
          // Named rather than left as "nearest A&E". An eye emergency wants an
          // eye hospital, and sending someone to a general A&E for it costs
          // them the wait twice over.
          fields([
            field('Send it to', 'Moorfields Eye Hospital (MEH) — eye A&E', { copy: true }),
          ], 'Where this goes'),
          note('This is on the list the minor eye service does not cover. <mark>The patient goes straight to eye A&E at Moorfields.</mark>', 'critical'),
          bullets([
            'Sudden loss of vision, considerable eye pain, significant trauma or bleeding, a chemical injury or burn, or a problem after recent eye surgery.',
            'Tell the duty doctor what you have advised.',
          ]),
        ],
        source: ['Minor eye service — styes (Rose Opticians)', 'Hospital codes'],
      });
    }
    if (EYE_NOT_MECS.test(full)) {
      return answer({
        title: heading(said),
        subtitle: 'Not a MECS condition',
        blocks: [
          fields([field('Send it to', DUTY, { copy: true })], 'Where this goes'),
          note('MECS does not cover conditions already monitored by an optometrist or the hospital eye service — cataracts, glaucoma and dry eye. Book it here.', 'info'),
        ],
        source: ['Minor eye service — styes (Rose Opticians)'],
      });
    }
    if (MECS_TREATS_RE.test(full)) return minorEyeServiceAnswer({ condition: said });

    // An eye problem that is on neither list. It is NOT referred: the optician
    // is only for what the page says the optician treats, and quietly sending
    // everything else is how a serious injury ends up with an appointment to
    // bring your glasses to.
    return answer({
      title: heading(said),
      subtitle: 'Not on the minor eye service list',
      blocks: [
        fields([field('Send it to', DUTY, { copy: true })], 'Where this goes'),
        note('This is not one of the conditions the minor eye service treats, so do not refer it to Rose Opticians. Pass it to the duty doctor to decide.', 'warn'),
        expand('What the optician can see', [bullets(MECS_TREATS)]),
        expand('What must go straight to A&E', [bullets(MECS_TO_AE)]),
      ],
      source: ['Minor eye service — styes (Rose Opticians)'],
    });
  }

  // MUSCULOSKELETAL, BEFORE PHARMACY FIRST.
  //
  // "Back pain / musculoskeletal pain" is a CPSAS condition and "lower back
  // pain" is a listed minor illness, so every back problem matched the pharmacy
  // lists and stopped there. That is right for simple backache and wrong for
  // everything else, and the lists cannot tell them apart because they are
  // written by body part. The features can; see fcp.mjs.
  // AND SOME MUSCULOSKELETAL-LOOKING PROBLEMS ARE NOT THE PHYSIO'S EITHER.
  //
  // A limb that is swollen AND has lost sensation is vascular or neurological
  // until a clinician says otherwise. This sits above the FCP branch and above
  // the pharmacy lists both — "ankle or foot pain or swelling" is a listed
  // minor illness, and a swollen numb leg must not reach a pharmacy any more
  // than it should reach a physiotherapist.
  if (needsGpFirst(msk)) return gpAssessmentAnswer({ condition: said, text, complaint });

  if (needsFcp(msk)) return fcpAnswer({ condition: said, text, complaint });

  // Pharmacy First. The card it builds already handles the age gate and whether
  // the medicines are free, so triage does not duplicate any of that — it puts
  // the destination on the front and hands the rest over.
  const pathway = findClinicalPathway(full);
  const onList = pathway
    || CPSAS_CONDITIONS.some((c) => norm(full).includes(norm(c.split(' / ')[0].replace(/\s*\(.*\)/, ''))))
    || MINOR_ILLNESS.some((c) => norm(full).includes(norm(c.split(/[,(]/)[0])));

  if (onList) {
    const card = pharmacyFirstAnswer({ condition: said, text, complaint });
    return answer({
      title: card.title,
      subtitle: card.subtitle,
      blocks: [
        fields([field('Send it to', 'Community pharmacy (Pharmacy First)', { copy: true })], 'Where this goes'),
        ...card.blocks,
      ],
      source: card.source,
    });
  }

  // A joint or muscle problem that none of the pharmacy lists happened to word
  // the same way ("knee pain" is not the listed "knee or lower leg pain"). It is
  // still an FCP job, and the duty doctor card below would be a worse answer
  // than the one the practice actually uses.
  if (msk.msk) return fcpAnswer({ condition: said, text, complaint });

  // Nothing matched. Not a failure — most things do belong here — but it must
  // not read as "the pharmacy cannot take it", because the minor illness list
  // is explicitly not exhaustive.
  return answer({
    title: heading(said),
    subtitle: 'Not on a pharmacy list',
    blocks: [
      fields([field('Send it to', DUTY, { copy: true })], 'Where this goes'),
      note('This is not one of the Pharmacy First pathways or the CPSAS conditions. Book it here, or pass it to the duty doctor if it needs seeing today.', 'info'),
      expand('Could a pharmacy still take it?', [
        note('The minor illness list is not exhaustive — a pharmacy can take anything reasonably minor, and the pharmacist uses their judgement.', 'info'),
        bullets(CLINICAL_PATHWAYS.map((p) => `**${p.name}** — ${p.age}`)),
      ]),
    ],
    source: ['Triage guidelines', 'Pharmacy First and CPSAS'],
  });
}

/* --------------------------------------------------- minor eye service */

// What the optician can see, straight from the practice's page. Kept as text
// rather than as matching rules: this is shown to the reader so they can judge
// whether the thing in front of them belongs here, and that is a judgement, not
// a pattern match.
const MECS_TREATS = [
  'Sudden or recent reduction in vision in one or both eyes',
  'Red eye(s) or eyelids',
  'Pain or discomfort in the eyes, around the eye area or the temples',
  'Recent onset or sudden increase of flashes and floaters',
  'Mild trauma, for example a scratch to the surface of the eye or lid',
  'A suspected foreign body in the eye',
  'Recent onset of double vision',
  'Significant recent discharge from, or watering of, the eye',
];

const MECS_TO_AE = [
  'Sudden loss of vision in one or both eyes',
  'Considerable eye pain',
  'Significant trauma, such as a penetrating injury or a laceration',
  'A chemical injury or burn',
  'Problems arising from recent eye surgery',
];

const ROSE_MESSAGE = [
  'Please call Rose Opticians on 0208 975 1971 and ask for a Minor Eye Service (MECS) appointment.',
  '',
  'They can assess and treat minor eye problems, and they will let us know the outcome afterwards.',
  '',
  'Please bring a list of your current medicines and your glasses. You may not be able to drive straight after the eye examination.',
  '',
  'If they cannot see you within 24 hours, please let us know.',
].join('\n');

/**
 * The minor eye service card, with the wording to send the patient.
 *
 * Referring here is not a form anybody submits — the patient rings the optician
 * themselves — so the thing the reader actually needs is the message, and it
 * carries its own Copy rather than being text to retype.
 */
export function minorEyeServiceAnswer({ condition = '' } = {}) {
  const said = String(condition || '').trim();
  return answer({
    title: said ? heading(said) : 'Minor eye service',
    subtitle: 'Rose Opticians — the patient books it themselves',
    blocks: [
      fields([
        field('Send it to', 'Rose Opticians — Minor Eye Service'),
        field('Telephone', '0208 975 1971'),
      ], 'Where this goes'),
      message(ROSE_MESSAGE),
      note('If they cannot be seen <mark>within 24 hours</mark>, tell the GP immediately.', 'critical'),
      expand('What the optician can see', [
        bullets(MECS_TREATS),
        note('Not covered: anything already monitored by an optometrist or the hospital eye service — cataracts, glaucoma, dry eye.', 'info'),
      ]),
      expand('When it must go to A&E instead', [
        bullets(MECS_TO_AE),
        note('These are not minor eye conditions. The patient goes directly to their nearest A&E.', 'critical'),
      ]),
    ],
    source: ['Minor eye service — styes (Rose Opticians)'],
  });
}
