// WHERE THINGS GO. The one file the code reads.
//
// IT IS TRANSCRIBED FROM docs/routing.md, WHICH IS THE PRACTICE'S OWN ACCOUNT
// of how a request is routed — written for a person, in full, including any
// destination this file does not have yet. That document is the source; this
// file is the machine-readable half of it, and the two are edited together in
// the same commit. If they ever disagree, the document is right and this file
// is the bug.
//
// Adding a route means adding its entry below — id, label, the line a card
// copies, what it covers, what it refuses, its seniority — and everything that
// routes picks it up: the pattern cascade, the /accurx reader's prompt and enum,
// and the signposting page.
//
// The practice has a small number of places a request can end up, and they were
// written down in three places at once: the pattern order in
// lib/templates/triage.mjs, the reader's list in lib/templates/accurx-route.mjs,
// and — for the signposting page — a live read of whatever the Notebook held
// under "Triaging notebook" that day.
//
// That last one is why this file exists. A Notebook page is written for a person
// to read: it is edited, reordered and reworded by whoever is keeping it up, and
// none of that is visible to the code that depended on it. So the routing model
// changed silently, differed between the signposting page and the assistant, and
// could not be tested — and two of the destinations (the nurse clinic and the
// diabetic nurse) were not in the pattern cascade AT ALL. A patient due a smear,
// a dressing or a diabetic review was routed by a triage that had never heard of
// the nurse clinic, and landed on the duty doctor or, worse, a pharmacy.
//
// So the destinations are written down here, once, and everything reads them:
//
//   - lib/templates/triage.mjs routes by them, in the order below.
//   - lib/templates/nurse.mjs renders the two nurse cards from them.
//   - lib/templates/accurx-route.mjs asks one model check per destination,
//     using this file's `covers` and `refuses` as what that check is told.
//   - app/api/signpost/route.js builds its prompt from them, so the page and the
//     assistant answer the same question the same way.
//
// THE PATTERN ORDER IS THE SAFETY MODEL, and it runs top to bottom. Nothing
// later can override something earlier:
//
//    1. Red flags            lib/safety/redflags.mjs. A clinician, whatever else
//                            the message also matches.
//    2. Cauda equina         lib/templates/fcp.mjs.
//    3. Eyes                 the minor eye service, or the eye A&E at
//                            Moorfields. Above Pharmacy First, because a red
//                            sticky eye is on both lists.
//    4. A limb needing a doctor first, then the FCP — lib/templates/fcp.mjs.
//    5. Diabetes             the diabetic nurse for routine care; a doctor for a
//                            patient not yet diagnosed, one who is unwell now,
//                            or a foot that has gone wrong.
//    6. The nurse clinic     the procedures listed below, named by the request.
//    7. Pharmacy First       lib/templates/pharmacy.mjs.
//    8. Otherwise            a clinician here.
//
// Steps 5 and 6 sit ABOVE Pharmacy First deliberately. "Wound problems and
// dressings" is on the minor illness list, so a dressing change matched the
// pharmacy and stopped there; a diabetic foot check matched nothing at all. They
// sit BELOW the musculoskeletal checks for the same reason: a swollen, numb limb
// is a doctor's question before it is anybody's booking.
//
// `rank` IS A DIFFERENT ORDERING FROM THAT, and it is the reader's. It is not
// urgency and not acuity — it is HOW SENIOR THE PAIR OF EYES IS, which is the
// only ordering under which the reader's "never move it down" rule means what it
// has to mean. See lib/templates/accurx-route.mjs, which folds its checks by it.
//
// NOTHING HERE DIAGNOSES. Every list is about who does a piece of work, and
// every guard is about who to pass it to — never about what is wrong with the
// patient.

/* ------------------------------------------------------------- the team */

/**
 * Everywhere a request can go.
 *
 * `sendTo` is what a card puts on its destination line and what the reader
 * copies. `covers` and `refuses` are what a model check is told about this one
 * destination, and what the reader is shown on the nurse cards; `refuses` is the
 * half that does the work, because a check asked in isolation will otherwise say
 * yes to anything adjacent. `pages` picks the Notebook lines that check gets.
 * `signpost` marks the two nurse clinics, whose losing "yes" becomes a note on
 * the card rather than a destination — see signpostsFrom in accurx-route.mjs.
 *
 * THE ARRAY ORDER IS THE READER'S TIE-BREAK, most specific first within a rank.
 */
export const DESTINATIONS = [
  {
    id: 'minorEyeService',
    rank: 1,
    label: 'The minor eye service (Rose Opticians)',
    sendTo: 'Rose Opticians — Minor Eye Service',
    covers: 'An eye problem on the practice’s MECS list — red or sore eyes, discharge, watering, flashes and floaters, reduced vision, mild trauma, a suspected foreign body. An optometrist can examine an eye, which is why an eye problem comes here rather than to a pharmacy or a physiotherapist.',
    refuses: 'Sudden loss of vision, considerable eye pain, significant trauma, bleeding, a chemical injury or burn, or a problem after recent eye surgery. Every one of those is the eye A&E at Moorfields, not a minor eye service appointment. Also anything already watched by an optometrist or the hospital eye service: cataracts, glaucoma, dry eye.',
    pages: /\beyes?\b|mecs|optic|optom|vision|sight|rose/i,
  },
  {
    id: 'pharmacy',
    rank: 1,
    label: 'Community pharmacy (Pharmacy First)',
    sendTo: 'Community pharmacy (Pharmacy First)',
    covers: 'A Pharmacy First clinical pathway, a CPSAS condition, or ordinary minor illness in somebody otherwise well.',
    refuses: 'Anybody who is not otherwise well, and anything the message gives a reason to look at twice. A pharmacist works from the counter with no notes and no examination.',
    pages: /pharmac|cpsas|minor illness|self.?care|over.the.counter/i,
  },
  {
    id: 'diabeticNurse',
    rank: 2,
    signpost: true,
    label: 'The diabetic nurse',
    sendTo: 'The diabetic nurse',
    covers: 'Diabetes care in somebody who already has the diagnosis: the annual or interim review, HbA1c follow-up, a foot check, a query about insulin or diabetes medication, blood-sugar readings in an established diabetic.',
    refuses: 'Newly suspected diabetes, and a diabetic who is unwell NOW. Both of those are a doctor’s, not a review appointment’s. A foot with an ulcer, a blackened toe or signs of infection is a doctor today, not a foot check.',
    pages: /diabet|hba1c|insulin|\bdsn\b/i,
  },
  {
    id: 'fcp',
    rank: 2,
    label: 'First Contact Physiotherapist (FCP)',
    sendTo: 'First Contact Physiotherapist (FCP)',
    covers: 'A joint, muscle, tendon or back problem in an adult, and NOTHING ELSE. An FCP assesses and rehabilitates musculoskeletal injuries.',
    refuses: 'Everything that is not musculoskeletal, however much it hurts and wherever it is. An FCP does not investigate, does not order urgent bloods, and is NOT who reads swelling, colour change, numbness, breathlessness, dizziness or headache — a symptom that merely happens to be in a limb is not a limb problem. Nobody under 16.',
    pages: /physio|\bfcp\b|musculoskeletal|\bmsk\b|back pain|joint/i,
  },
  {
    id: 'nurse',
    rank: 2,
    signpost: true,
    label: 'The practice nurse',
    sendTo: 'The practice nurse',
    covers: 'Something a nurse or HCA does to a plan somebody has already made: immunisations and travel vaccines, wound care and dressings, taking stitches or clips out, cervical smears, blood pressure checks, ear checks, B12 injections, an NHS or new patient health check, a booked long-term-condition review.',
    refuses: 'A new or unexplained symptom. A nurse clinic runs to a protocol for a decision that has already been taken — it is not where a problem gets worked out for the first time. A wound that looks infected, is spreading or is not healing is a doctor’s before it is a dressing. Diabetes care in a diagnosed diabetic is the diabetic nurse’s, not yours.',
    pages: /nurse|\bhca\b|immunis|immuniz|vaccin|smear|cervical|dressing|wound|\bb12\b|blood pressure|travel|stitch|suture/i,
  },
  {
    id: 'gp',
    rank: 3,
    label: 'A GP appointment here',
    sendTo: 'A GP appointment here',
    covers: 'It needs a DOCTOR: something that has to be diagnosed, examined, investigated or prescribed for, and that none of the practice’s other services is set up to deal with. It can wait for the next ordinary appointment.',
    // The refusal that "pt has sore throat" was missing. A GP appointment reads
    // like the safe answer for anything clinical, and here it is the opposite:
    // this check is only ever consulted to move a message UP, so a loose yes
    // does not add a doctor's opinion — it takes the patient off the pharmacy,
    // the physio or the nurse clinic that was going to see them.
    refuses: 'Anything one of the practice’s other services deals with as ordinary work, when nothing in the message complicates it: a Pharmacy First or minor-illness condition, a minor eye problem, a musculoskeletal problem, a nurse-clinic or diabetic-review job. A GP appointment is NOT the safe default here — the practice’s own rules already provide the default, and a "yes" from you only ever takes a message away from a service that would have dealt with it. Also anything that cannot wait for the next ordinary appointment: that is somebody else’s answer, not a slower version of yours.',
    pages: /\bgp\b|doctor|triag|appointment/i,
  },
  {
    id: 'dutyDoctor',
    rank: 4,
    label: 'The duty doctor — today',
    sendTo: 'The duty doctor',
    covers: 'It needs a clinician’s eyes TODAY: a symptom that could be serious, several symptoms that together could be, a recent pregnancy, miscarriage or birth with new symptoms, swelling in a limb, a symptom nobody has managed to explain, or somebody deteriorating while they wait for something already arranged.',
    refuses: 'An ordinary problem that has been going on unchanged and is not getting worse.',
    pages: /duty|same.?day|urgent|triag|on.the.day/i,
  },
  // ABOVE `emergency` IN THE ARRAY, at the same rank, so a message that is both
  // wins here. Anything that reaches the eye A&E is an emergency by definition
  // and both checks will say yes to it; the tie-break sends it to the one that
  // names the hospital rather than to the one that says "999", and a general
  // A&E is an eye emergency answered twice as slowly.
  {
    id: 'eyeEmergency',
    rank: 5,
    label: 'Moorfields Eye Hospital (MEH) — eye A&E',
    sendTo: 'Moorfields Eye Hospital (MEH) — eye A&E',
    covers: 'An EYE problem that cannot wait: sudden loss of vision, considerable eye pain, significant trauma or a penetrating injury, bleeding in or around the eye, a chemical injury or burn, or a problem after recent eye surgery. Moorfields runs the eye A&E round the clock and the patient can WALK IN — there is no referral to make and no appointment to book.',
    refuses: 'An eye problem the minor eye service can see — a red or sore eye, discharge, watering, flashes and floaters, a scratch, something in the eye. And any emergency that is not about the eye: somebody with chest pain does not go to an eye hospital.',
    pages: /\beyes?\b|moorfields|\bmeh\b|ophthalm|optic|optom|vision|sight/i,
  },
  {
    id: 'emergency',
    rank: 5,
    label: 'The duty doctor now, or 999',
    sendTo: 'The duty doctor',
    covers: 'It cannot wait for an appointment of any kind. Somebody stands up.',
    refuses: 'Anything that can safely be an appointment today — "today" is the duty doctor’s answer, not yours. And an emergency that is purely about the EYE, which goes to the eye A&E at Moorfields rather than to a duty doctor or a general A&E.',
    pages: /emergenc|999|red.?flag|\ba&e\b|ambulance|sepsis|collapse/i,
  },
];

const BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

/** One destination by id, or null. */
export const destination = (id) => BY_ID.get(String(id || '')) || null;

/** What a card puts on its destination line, for the id given. */
export const sendTo = (id) => (destination(id) || {}).sendTo || '';

/** What a destination takes, and what it will not — for a card's disclosure. */
export const coveredBy = (id) => (destination(id) || {}).covers || '';
export const refusedBy = (id) => (destination(id) || {}).refuses || '';

/* --------------------------------------------------- the nurse clinic */

// The days and the two rules that get a nurse booking wrong. From the practice's
// own pages — "Nurse and HCA services, and which days" and "Reviews that need a
// blood test first" — and carried here because the routing card is where the
// reader is standing when they book it.
export const NURSE_CLINIC_DAYS = 'Nurses work Mondays, Wednesdays and Fridays.';
export const NURSE_RULES = [
  'Travel vaccinations need **six weeks** notice.',
  'Health-check bloods must be taken **before 1 pm**.',
];

// The reviews that cannot be booked until the bloods are back. A review booked
// ahead of them is a review that gets cancelled on the day.
export const BLOODS_FIRST = [
  'Diabetes reviews',
  'At-risk reviews',
  'Mental health reviews',
  'Learning disability reviews',
  'NHS health checks',
  'New patient health checks',
];

// What the nurse clinic takes, as a list rather than as the one paragraph the
// model checks are given. Same content, shown to the reader on the card.
export const NURSE_COVERS = [
  'Immunisations and vaccinations, including childhood ones',
  'Travel vaccinations and travel advice',
  'Wound care, dressings and dressing changes',
  'Stitches, clips and staples out',
  'Cervical smears and swabs',
  'Blood pressure checks and ear checks',
  'B12 injections',
  'NHS health checks and new patient health checks',
];

export const NURSE_REFUSES = [
  'A wound that looks infected — spreading redness, pus, or the patient feeling unwell with it. Duty doctor the same day.',
  'A new symptom that happens to need a procedure. The symptom decides where it goes, not the procedure.',
  'Diabetes care in a diagnosed diabetic — that is the diabetic nurse’s.',
];

export const DIABETIC_NURSE_COVERS = [
  'The annual or interim diabetic review, and recalls',
  'HbA1c follow-up',
  'Blood sugar readings and monitoring in a patient already diagnosed',
  'Diabetic foot checks',
  'Insulin and diabetes medication queries in an established diabetic',
];

export const DIABETIC_NURSE_REFUSES = [
  'A patient who has never been diagnosed, or who has just been told they might be. That is a GP appointment.',
  'A diabetic who is unwell now — vomiting, ketones, a hypo, drowsy or confused. That is the duty doctor.',
  'A foot ulcer, a blackened toe, or a foot that looks infected. Duty doctor the same day.',
];

/**
 * The nurse-clinic procedures, matched BY NAME.
 *
 * Every one of these is somebody asking for a TASK — "her stitches need to come
 * out", "due a smear", "wants the flu jab" — rather than describing a symptom.
 * That is why they can safely sit above Pharmacy First: naming the procedure is
 * the whole request, and none of these patterns fires on a description of an
 * illness. Where one might — a dressing on a wound that is going wrong — the
 * guard below sends it to a doctor instead.
 *
 * `note` is the one thing that changes what reception does for that task, and
 * nothing else goes in it.
 */
export const NURSE_TASKS = [
  {
    id: 'travel',
    label: 'Travel vaccinations or travel advice',
    re: /\btravel\w*\b[^.!?]{0,30}\b(jabs?|vaccin\w+|immunis\w+|clinic|advice|appointment|health)\b|\b(jabs?|vaccin\w+|immunis\w+)\b[^.!?]{0,25}\btravel\w*\b|\b(yellow fever|typhoid|rabies vaccin\w+|hepatitis [ab] vaccin\w+)\b/i,
    note: 'Travel vaccinations need **six weeks** notice. If they are travelling sooner than that, say so when you book it.',
  },
  {
    id: 'immunisation',
    label: 'An immunisation or vaccination',
    re: /\b(immunis\w+|immuniz\w+|vaccin\w+|booster|flu jab|covid jab|shingles jab|pneumo\w+|childhood (?:jabs?|injections?)|hpv|bcg|mmr)\b/i,
    note: '',
  },
  {
    id: 'sutures',
    label: 'Stitches, clips or staples out',
    // The window is a whole sentence's worth on purpose. "Stitches at the Royal
    // London last week and she needs them out on Thursday" is how the request is
    // actually written — the thing and the word "out" are a clause apart, with a
    // pronoun in between — and a tight window read that as no request at all.
    re: /\b(stitch(?:es)?|sutures?|clips?|staples?)\b[^.!?]{0,60}\b(out|removal|removed|remove|removing|taking out|take out)\b|\b(remov\w+|taking out|take out)\b[^.!?]{0,60}\b(stitch(?:es)?|sutures?|clips?|staples?)\b/i,
    note: '',
  },
  {
    id: 'dressing',
    label: 'Wound care or a dressing',
    re: /\b(dressings?|re-?dress\w+|bandage\w*|wound (?:care|check|review|clinic)|dressing change)\b/i,
    note: '',
  },
  {
    id: 'smear',
    label: 'A cervical smear',
    re: /\b(smears?|cervical screen\w+|cervical smear|vaginal swab|cervical swab)\b/i,
    note: '',
  },
  {
    id: 'b12',
    label: 'A B12 injection',
    re: /\bb ?-?12\b[^.!?]{0,25}\b(injection|jab|shot|due|booked?)\b|\b(injection|jab|shot)\b[^.!?]{0,20}\bb ?-?12\b|\bhydroxocobalamin\b/i,
    note: '',
  },
  {
    id: 'bp',
    label: 'A blood pressure check',
    re: /\b(blood pressure|bp)\b[^.!?]{0,25}\b(check\w*|reading\w*|review|monitor\w*|machine|recheck)\b|\b(check\w*|monitor\w*)\b[^.!?]{0,20}\b(blood pressure|bp)\b|\babpm\b|\bambulatory blood pressure\b/i,
    note: '',
  },
  {
    id: 'ears',
    label: 'An ear check',
    re: /\b(ear check|ears? checked|look in (?:their|his|her|my) ears?)\b/i,
    note: '',
  },
  {
    id: 'healthcheck',
    label: 'An NHS or new patient health check',
    re: /\b(nhs health check|health check|new patient (?:health )?check|well ?(?:man|woman) check)\b/i,
    note: 'This needs the **bloods first**, and health-check bloods must be taken **before 1 pm**.',
  },
];

/**
 * The nurse-clinic task this message is asking for, or null.
 *
 * First match in the order above wins, and the order is not arbitrary: travel is
 * read before immunisation because "travel jabs" is both, and the six-week rule
 * is the thing reception has to be told.
 */
export function nurseTask(text = '') {
  const t = String(text || '');
  if (!t.trim()) return null;
  return NURSE_TASKS.find((task) => task.re.test(t)) || null;
}

// A DRESSING ON A WOUND THAT IS GOING WRONG IS NOT A NURSE BOOKING.
//
// The nurse changes dressings; she does not decide whether a wound has become
// infected, and reception must not book past the question. Matched on the words
// a patient uses rather than clinical ones, and read only next to a wound task
// — "infection" in a message about a chest is nothing to do with this.
export const WOUND_TROUBLE = new RegExp([
  'infect\\w+', 'pus', 'oozing', 'weeping', 'smell\\w*', 'foul',
  'spreading', 'red streak\\w*', 'getting redder', 'hot (?:and |, )?swollen',
  'not healing', 'won\'?t heal', 'opened (?:back )?up', 'burst',
  'temperature', 'fever\\w*', 'feeling unwell', 'shivery',
].join('|'), 'i');

/**
 * Does this nurse task need a doctor to look at it first?
 *
 * Only the two tasks that involve a wound. A smear that mentions a temperature
 * is not this, and pretending it is would send half the nurse clinic to the duty
 * doctor.
 */
export function nurseTaskNeedsGp(task, text = '') {
  if (!task || !['dressing', 'sutures'].includes(task.id)) return false;
  return WOUND_TROUBLE.test(String(text || ''));
}

/* ------------------------------------------------------------- diabetes */

// The words that make a message about diabetes at all. Medicines are included
// because "my metformin" is how a patient says it, and the diabetic nurse is who
// the practice sends an established diabetic's medication query to.
export const DIABETES = new RegExp('\\b(?:' + [
  'diabet\\w+', 'hba1c', 'hb a1c',
  'blood sugars?', 'blood glucose', 'sugar levels?', 'glucose (?:reading\\w*|level\\w*|monitor\\w*)',
  'insulin', 'metformin', 'gliclazide', 'dapagliflozin', 'empagliflozin', 'sitagliptin',
  'libre', 'dexcom', 'finger ?prick', 'test strips?',
].join('|') + ')', 'i');

// Routine diabetes care: the reviews, the recalls, the readings and the repeat
// questions. Diabetes alone is not enough — "I am diabetic and my chest hurts"
// is a chest, and the red flags above have already taken it.
export const DIABETES_ROUTINE = new RegExp([
  'review\\w*', 'recall\\w*', 'annual', 'check.?up', 'due\\b', 'overdue',
  'hba1c', 'foot check', 'feet checked', 'foot screening',
  'reading\\w*', 'monitor\\w*', 'diary',
  'dose\\w*', 'adjust\\w*', 'repeat', 'prescription', 'test strips?', 'sensor\\w*',
  'appointment', 'book\\w*',
].join('|'), 'i');

// AND THE THREE SHAPES THAT ARE NOT THE NURSE'S.
//
// A patient who has not been diagnosed, a diabetic who is unwell now, and a foot
// that has gone wrong. All three are a doctor, and the third is a doctor today —
// a diabetic foot ulcer is not a foot check and does not wait for the recall.
export const DIABETES_TO_GP = new RegExp([
  // Not diagnosed, or only just.
  '(?:think|thinks|worried|wonder\\w*)[^.!?]{0,40}diabet\\w+',
  '(?:might|may|could) (?:be|have|have got)[^.!?]{0,20}diabet\\w+',
  'suspect\\w*[^.!?]{0,20}diabet\\w+',
  'newly diagnosed', 'just (?:been )?diagnosed', 'recently diagnosed',
  'never been (?:tested|diagnosed|checked)', 'not (?:been )?diagnosed',
  'pre.?diabet\\w+',
  // Unwell now.
  'hypos?\\b', 'hypoglycaem\\w+', 'hypoglycem\\w+',
  'ketone\\w*', 'dka\\b', 'ketoacidosis',
  'vomit\\w+', 'being sick', 'drowsy', 'confus\\w+',
  'passed out', 'fainted', 'unwell', 'very thirsty', 'passing (?:a lot of|lots of) urine',
  'sugars? (?:are |is |been |very |really )*(?:high|low|through the roof|dropping)',
  // The foot.
  'foot ulcer', 'ulcer on (?:my|their|his|her|the) (?:foot|toe|heel|leg)',
  'black\\w* (?:toe|foot|heel)', 'infect\\w+ (?:foot|toe|heel)',
  '(?:foot|toe|heel)[^.!?]{0,25}(?:infect\\w+|ulcer\\w*|not healing|won\'?t heal|gangrene)',
  'gangrene',
].join('|'), 'i');

/** Is this a diabetes message at all? */
export const mentionsDiabetes = (text = '') => DIABETES.test(String(text || ''));

/**
 * Routine diabetes care — the diabetic nurse.
 *
 * Both halves are required and the exclusion wins: the message has to be about
 * diabetes, has to be asking for something routine, and must carry none of the
 * three shapes above. Anything else falls through to the rest of the order,
 * which ends at a clinician.
 */
export function needsDiabetesNurse(text = '') {
  const t = String(text || '');
  if (!mentionsDiabetes(t)) return false;
  if (DIABETES_TO_GP.test(t)) return false;
  return DIABETES_ROUTINE.test(t);
}

/** A diabetes message that must reach a doctor rather than the nurse. */
export function diabetesNeedsGp(text = '') {
  const t = String(text || '');
  return mentionsDiabetes(t) && DIABETES_TO_GP.test(t);
}

/* --------------------------------------------------- the same thing, as prose */

/**
 * The routing model written out for a model to read.
 *
 * Used by the signposting page, which asks a model where a pasted AccurX request
 * goes. It used to be handed whatever the Notebook held under "Triaging
 * notebook" — text nobody could test, that changed under it, and that said
 * nothing about most of the destinations. This is the same routing everything
 * else uses, generated from the array above, so the two cannot drift apart.
 */
export function routingGuidance() {
  const block = (d) => [
    `- ${d.id}: ${d.label}`,
    `    covers: ${d.covers}`,
    `    refuses: ${d.refuses}`,
  ].join('\n');

  return [
    'THE PRACTICE TEAM — route to exactly one, by id:',
    DESTINATIONS.map(block).join('\n'),
    '',
    'THE ORDER. Run it top to bottom and stop at the first that fits. Nothing later overrides something earlier:',
    '1. Anything on the emergency list, or back pain with bladder, bowel or saddle symptoms — emergency.',
    '2. An eye problem — minorEyeService, unless it is sudden loss of vision, considerable pain, significant trauma or bleeding, a chemical injury, or a problem after eye surgery, which are eyeEmergency.',
    '3. A swollen limb with numbness, or a clot named by anybody — dutyDoctor.',
    '4. A joint, muscle, tendon or back problem in an adult — fcp.',
    '5. Diabetes: routine care to diabeticNurse; a patient not yet diagnosed, one who is unwell now, or a foot that has gone wrong to dutyDoctor.',
    '6. One of the nurse-clinic procedures named by the request — nurse. A wound that looks infected goes to dutyDoctor instead.',
    '7. Minor illness or one of the Pharmacy First pathways — pharmacy.',
    '8. Anything else, and anything unclear — gp.',
    '',
    'THE NURSE CLINIC',
    `- ${NURSE_CLINIC_DAYS}`,
    ...NURSE_RULES.map((r) => '- ' + r.replace(/\*\*/g, '')),
    '- These need the bloods taken first: ' + BLOODS_FIRST.join(', ').toLowerCase() + '.',
  ].join('\n');
}
