// WHERE THINGS GO. The one file that says so.
//
// The practice has a small number of places a request can end up, and until now
// nothing wrote them down. The routing lived in three places at once: the order
// in lib/templates/triage.mjs, the features in lib/templates/fcp.mjs, and — for
// the signposting page — a prompt that pasted in whatever the Notebook happened
// to have under "Triaging notebook" that day.
//
// That last one is why this file exists. A Notebook page is written for a person
// to read: it is edited, reordered and reworded by whoever is keeping it up, and
// none of that is visible to the code that depended on it. So the routing model
// changed silently, differed between the Q&A and the signposting page, and could
// not be tested — and two of the five places a request actually goes (the nurse
// and the diabetes nurse) were not in the code AT ALL. A patient due a smear, a
// dressing or a diabetic review was routed by a triage that had never heard of
// the nurse clinic, and landed on the duty doctor or, worse, a pharmacy.
//
// So the destinations are written down here, once, as data:
//
//   - lib/templates/triage.mjs routes by them, in the order below.
//   - lib/templates/nurse.mjs renders the two nurse cards from them.
//   - app/api/signpost/route.js builds its prompt from them, so the page and the
//     assistant answer the same question the same way.
//
// THE ORDER IS THE SAFETY MODEL, and it runs top to bottom. Nothing later can
// override something earlier:
//
//    1. Red flags            lib/safety/redflags.mjs. A clinician, whatever else
//                            the message also matches.
//    2. Cauda equina         lib/templates/fcp.mjs.
//    3. Eyes                 the minor eye service, or eye A&E. Above Pharmacy
//                            First because a red sticky eye is on both lists.
//    4. A limb needing a doctor first, then the FCP — lib/templates/fcp.mjs.
//    5. Diabetes             the diabetes nurse for routine care; a doctor for a
//                            new or an unwell one.
//    6. The nurse clinic     the procedures listed below, by name.
//    7. Pharmacy First       lib/templates/pharmacy.mjs.
//    8. Otherwise            a clinician here.
//
// Steps 5 and 6 sit ABOVE Pharmacy First deliberately. "Wound problems and
// dressings" is on the minor illness list, so a dressing change matched the
// pharmacy and stopped there; a diabetic foot check matched nothing at all. They
// sit BELOW the musculoskeletal checks for the same reason: a swollen, numb limb
// is a doctor's question before it is anybody's booking.
//
// NOTHING HERE DIAGNOSES. Every list below is about who does a task, and every
// guard is about who to pass it to — never about what is wrong with the patient.

/* ------------------------------------------------------------- the team */

/**
 * Everywhere a request can go, and what each one is for.
 *
 * `sendTo` is what a card puts on its destination line and what the reader
 * copies. `handles` and `never` are prose: they are shown to the reader on the
 * nurse cards and given to the model on the signposting page, so they are
 * written as a person would say them.
 */
export const DESTINATIONS = [
  {
    key: 'urgent-care',
    label: '999 / A&E or NHS 111',
    sendTo: 'The duty doctor',
    handles: [
      'Anything on the emergency list — chest pain, breathlessness, stroke signs, heavy bleeding, sepsis signs, anaphylaxis, a seizure, suicidal intent, a seriously unwell child.',
      'Back pain with bladder or bowel changes, numbness around the groin or back passage, or symptoms in both legs.',
    ],
    never: ['Nothing waits behind an appointment here. Interrupt the duty doctor, or call 999.'],
  },
  {
    key: 'gp',
    label: 'GP (doctor)',
    sendTo: 'The duty doctor',
    handles: [
      'Undifferentiated or complex symptoms, and anything needing a diagnosis or an examination.',
      'Mental health concerns and safeguarding.',
      'Abnormal results that need interpreting.',
      'Anything urgent the same day.',
      'A limb that is swollen and has lost sensation, or where a clot or a circulation problem has been named.',
    ],
    never: ['Nothing. This is where a request goes when nothing else fits it — an unclear request is a GP request.'],
  },
  {
    key: 'fcp',
    label: 'First Contact Physiotherapist (FCP)',
    sendTo: 'First Contact Physiotherapist (FCP)',
    handles: [
      'Joint, muscle, tendon and back problems in adults, new or ongoing.',
      'Pain travelling into a limb with tingling, numbness or weakness.',
      'A musculoskeletal problem that self-care has already failed, or that is disabling.',
      'Anybody asking for physio, an FCP appointment or an MSK assessment.',
    ],
    never: [
      'Anyone under 16 — FCPs are for adults, so book them with a doctor.',
      'A swollen limb with numbness, or any mention of a clot. That is a doctor first.',
    ],
  },
  {
    key: 'pharmacy-first',
    label: 'Community pharmacy (Pharmacy First)',
    sendTo: 'Community pharmacy (Pharmacy First)',
    handles: [
      'The seven clinical pathways, within their age ranges: uncomplicated UTI, shingles, impetigo, infected insect bites, sinusitis, sore throat, acute otitis media.',
      'Minor illness a pharmacist would reasonably see, and the 24 CPSAS conditions that carry free medicines for eligible patients.',
    ],
    never: [
      'Anything the patient has already treated at maximum dose without relief — a pharmacy has nothing left to offer it.',
      'Back or joint pain with nerve-root symptoms, however the pharmacy lists match the body part.',
    ],
  },
  {
    key: 'diabetes-nurse',
    label: 'Diabetes nurse',
    sendTo: 'The diabetes nurse',
    handles: [
      'Diabetic reviews and recalls, and HbA1c follow-up.',
      'Blood sugar readings and monitoring in a patient already diagnosed.',
      'Diabetic foot checks.',
      'Insulin and diabetes medication queries in an established diabetic.',
    ],
    never: [
      'A patient who has never been diagnosed, or who has just been told they might be. That is a GP appointment.',
      'A diabetic who is unwell now — vomiting, ketones, a hypo, drowsy or confused. That is the duty doctor.',
      'A foot ulcer, a blackened toe, or a foot that looks infected. Duty doctor the same day.',
    ],
  },
  {
    key: 'practice-nurse',
    label: 'Practice nurse',
    sendTo: 'The practice nurse',
    handles: [
      'Immunisations and vaccinations, including childhood ones.',
      'Travel vaccinations and travel advice.',
      'Wound care, dressings and dressing changes.',
      'Stitches, clips and staples out.',
      'Cervical smears and swabs.',
      'Blood pressure checks and ear checks.',
      'B12 injections.',
      'NHS health checks and new patient health checks.',
    ],
    never: [
      'A wound that looks infected — spreading redness, pus, or the patient feeling unwell with it. Duty doctor the same day.',
      'A new symptom that happens to need a procedure. The symptom decides where it goes, not the procedure.',
    ],
  },
];

/** One destination by key, or null. */
export const destination = (key) => DESTINATIONS.find((d) => d.key === key) || null;

/** What a card puts on its destination line, for the key given. */
export const sendTo = (key) => (destination(key) || {}).sendTo || '';

/** What a destination handles, and what it never does — for a card's disclosure. */
export const handledBy = (key) => (destination(key) || {}).handles || [];
export const notHandledBy = (key) => (destination(key) || {}).never || [];

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
// because "my metformin" is how a patient says it, and the diabetes nurse is who
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
 * Routine diabetes care — the diabetes nurse.
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
 * nothing about most of the destinations. This is the same routing the cards
 * use, generated from the same arrays, so the two cannot drift apart.
 */
export function routingGuidance() {
  const block = (d) => [
    `- ${d.key}: ${d.label}`,
    ...d.handles.map((h) => `    handles: ${h}`),
    ...d.never.map((n) => `    never: ${n}`),
  ].join('\n');

  return [
    'THE PRACTICE TEAM — route to exactly one, by key:',
    DESTINATIONS.map(block).join('\n'),
    '',
    'THE ORDER. Run it top to bottom and stop at the first that fits. Nothing later overrides something earlier:',
    '1. Anything on the emergency list, or back pain with bladder, bowel or saddle symptoms — urgent-care, urgency "emergency".',
    '2. An eye problem — the minor eye service at Rose Opticians, unless it is sudden loss of vision, considerable pain, significant trauma or bleeding, a chemical injury, or a problem after eye surgery, which go straight to eye A&E. Route both as gp and say which in the reason.',
    '3. A swollen limb with numbness, or a clot named by anybody — gp, same-day.',
    '4. A joint, muscle, tendon or back problem in an adult — fcp.',
    '5. Diabetes: routine care to diabetes-nurse; a patient not yet diagnosed, one who is unwell now, or a foot that has gone wrong to gp.',
    '6. One of the nurse-clinic procedures named by the request — practice-nurse. A wound that looks infected goes to gp instead.',
    '7. Minor illness or one of the Pharmacy First pathways — pharmacy-first.',
    '8. Anything else, and anything unclear — gp.',
    '',
    'THE NURSE CLINIC',
    `- ${NURSE_CLINIC_DAYS}`,
    ...NURSE_RULES.map((r) => '- ' + r.replace(/\*\*/g, '')),
    '- These need the bloods taken first: ' + BLOODS_FIRST.join(', ').toLowerCase() + '.',
  ].join('\n');
}
