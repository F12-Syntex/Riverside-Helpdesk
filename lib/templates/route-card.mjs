// The card for a destination, built from the practice's own description of it.
//
// WHY THIS EXISTS. Every other card builder in this folder decides the route as
// well as rendering it: fcpAnswer re-reads the message for musculoskeletal
// features, pharmacyFirstAnswer re-matches the condition lists. That was the
// design while patterns did the routing, and it is exactly what has been taken
// out of /accurx — a message routed by READING it must not then be handed to a
// renderer that quietly re-decides where it goes on the words alone.
//
// So this builds a card from `id` and nothing else: what the destination is
// called, the line reception copies, what the practice's guide says that service
// covers and refuses, and the steps for the routes that have steps. It never
// looks at the message.
//
// The steps are the practice's own, from docs/routing.md. They are the part a
// receptionist cannot work out from a destination name.
import { bullets, expand, field, fields, note, steps } from './blocks.mjs';
import { DESTINATIONS, NURSE_CLINIC_DAYS, coveredBy, refusedBy, sendTo } from '../triage/destinations.mjs';

const BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

// How each route is actioned, where the guide says there is something reception
// has to DO rather than something they have to know. Absent means the
// destination line is the whole instruction.
const HOW = {
  emergency: [
    'Dial **999** from the desk phone. Stay on the line and give the practice address.',
    'If the patient is in the building, press the **red button** at the same time — the two are not alternatives.',
    'Tell the **duty doctor** immediately afterwards, and record what happened.',
  ],
  dutyInterrupt: [
    'Take a **call-back number** before doing anything else.',
    '**Walk to the duty doctor.** Do not send a task — tasks are not read in real time.',
    'If you cannot reach a duty clinician immediately, send the patient to **A&E**.',
    'Do not end the call until you have been told what to tell the patient.',
  ],
  ae: [
    'Advise the patient to attend, and tell the **duty doctor** what you have advised.',
    'Record the advice in the patient record.',
    'Never arrange transport yourself — if they cannot get there safely, that is a **999**.',
  ],
  eyeEmergency: [
    'Tell the **duty doctor** before advising the patient where to go.',
    'For a chemical injury, tell them to start **rinsing the eye with clean water** while you are still speaking.',
    'Moorfields Eye Hospital, **162 City Road, EC1V 2PD**. The eye A&E is open **24 hours** and the patient can **walk in** — no referral, no appointment, nothing for reception to arrange first.',
  ],
  dutyDoctor: [
    'Decide whether an examination is likely: if it is, book **face-to-face** rather than a telephone slot.',
    'Book the earliest slot, and record the reason **in the patient’s own words**.',
    'Take a contact number and the best times to call.',
    'If they deteriorate while waiting, escalate as a **duty doctor interrupt**.',
  ],
  gp: [
    'Book the next suitable slot and record the reason so the doctor can prepare.',
    'If the patient cannot attend in core hours, offer an **Enhanced Access** appointment at a PCN hub.',
    'Acknowledge the request through **Screen Messages** once booked.',
  ],
  doctorTask: [
    'Write the task **in the patient’s own words** — do not summarise symptoms into clinical phrasing.',
    'Include what they are asking for, how long it has been going on, and a contact number.',
    'Mark it to the named doctor if they have an existing relationship, otherwise to the **duty doctor**.',
  ],
  pharmacy: [
    'On EMIS, refer through **Local Services** (or **PharmRefer**).',
    'Let the patient **choose the pharmacy** — they may use any participating one, not just the nearest.',
    'Tell them which pharmacy it went to, and that the pharmacy will contact them.',
  ],
  pharmacyTeam: [
    'Send it to the **pharmacy team** as a task. Allow about **three working days**.',
    'Nothing is issued without a prescription request, controlled drugs least of all.',
  ],
  nurse: [
    `Book a **nurse appointment**. ${NURSE_CLINIC_DAYS}`,
    'Check whether it needs **bloods first** — and health-check bloods must be taken **before 1 pm**.',
    'Put what the patient asked for in the booking note, in their words.',
  ],
  diabeticNurse: [
    'Book the **blood test first**, then the review — booking them the wrong way round wastes both.',
    'Newly diagnosed patients get a **double appointment**, with the specialist diabetes nurse.',
    'Bloods for a morning nurse appointment must be taken **before 1 pm**.',
  ],
  fcp: [
    'On EMIS: **Find slot**, then **Find across organisation slot**, then **Hackney Downs PCN**, then **FCP new patient**.',
    'Ask before booking: which part, how long, was there an injury, can they weight-bear, any numbness or weakness, any change in bladder or bowel control — and **how old they are**.',
    'Tell the patient it is with a **First Contact Physiotherapist**, not a doctor: a senior physiotherapist who can arrange scans directly.',
    'Follow-ups are not booked here — send a task to the **FCP group** on EMIS.',
  ],
  minorEyeService: [
    'The patient rings **Rose Opticians** themselves and asks for a Minor Eye Service appointment.',
    'If they cannot be seen **within 24 hours**, tell the GP.',
  ],
  districtNurse: [
    'Ask directly whether the patient can get to the surgery at all, and record the answer — **being housebound is the gateway**.',
    'The referral goes on the **RP ACN 2022** form, with supporting documents as a single PDF.',
    'The doctor confirms the clinical need before it is sent.',
  ],
  midwife: [
    'Give the patient the **Homerton antenatal self-referral form** — they refer themselves, with no GP appointment first.',
    'Record that they were signposted, so the practice knows the pregnancy has been notified.',
  ],
  socialPrescriber: [
    'Book through reception, or email the PCN social prescribing team through AccurX.',
    '**Ask the patient’s permission before sending** — this is a support service, not an automatic referral.',
  ],
};

/**
 * The card for wherever this message goes.
 *
 * @param id         a destination id from lib/triage/destinations.mjs
 * @param condition  what titles the card
 * @param because    the patient's own words that decided it, already checked
 */
export function destinationCard({ id = '', condition = '', because = '' } = {}) {
  const found = BY_ID.get(String(id || ''));
  const said = String(condition || '').trim() || 'This request';
  const title = said.length > 64 ? said.slice(0, 61).replace(/[\s,;.]+$/, '') + '…' : said;

  // An id nothing recognises is not a destination, and the safe reading of that
  // is the practice's own rule: what cannot be placed is the duty doctor's.
  // Never a card that quietly names nowhere.
  if (!found) {
    return destinationCard({ id: 'dutyDoctor', condition: said, because });
  }

  // Nobody types anything off a card where somebody in this building stands up
  // — they stand up. But A&E and the eye A&E are the patient travelling, and the
  // hospital is the thing reception reads out to them, so those keep their Copy.
  const urgent = found.rank >= 5;
  const noCopy = found.id === 'emergency' || found.id === 'dutyInterrupt';
  const how = HOW[found.id] || [];

  return {
    title,
    subtitle: found.label,
    destination: found.id,
    blocks: [
      fields(
        [field('Send it to', sendTo(found.id), noCopy ? {} : { copy: true })],
        'Where this goes',
      ),

      urgent
        ? note('This is not an appointment, and nobody is booking anything off this card.', 'critical')
        : null,

      because
        ? note('What decided it — the patient’s own words: “' + because + '”', 'info')
        : null,

      how.length ? (urgent ? bullets(how) : steps(how)) : null,

      expand('What this service takes, and what it does not', [
        note(coveredBy(found.id), 'info'),
        note(refusedBy(found.id), 'warn'),
      ]),
    ],
    source: ['Triage guidelines'],
  };
}

/** Does this destination mean somebody moves now, rather than books something? */
export const meansNow = (id) => {
  const found = BY_ID.get(String(id || ''));
  return !!found && found.rank >= 5;
};
