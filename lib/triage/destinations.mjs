// WHERE THINGS GO. The one file the code reads.
//
// IT IS TRANSCRIBED FROM docs/routing.md — the practice's own Accurx Task
// Routing Guide, written for a person, in full: what each route is, when to
// route there, when not to, how to action it, and the local detail. That
// document is the source; this file is the machine-readable half of it, and the
// two are edited together in the same commit. If they ever disagree, the
// document is right and this file is the bug.
//
// Adding a route means adding its entry below — id, label, the line a card
// copies, what it covers, what it refuses, its seniority — and everything that
// routes picks it up: the pattern cascade in lib/templates/triage.mjs, the
// /accurx reader's prompt and enum in lib/templates/accurx-route.mjs, and the
// signposting page.
//
// THE RULE THAT OVERRIDES EVERY OTHER RULE, from the guide's own front page:
// when you are not sure, route UPWARD. The duty doctor is the correct
// destination for anything that cannot confidently be placed. A task sent to the
// wrong clinician costs a few minutes; a missed escalation does not. Everything
// below is built to fail in that direction — the cascade's fallback is the duty
// doctor, the reader may only ever raise, and "unsure" leaves the patterns where
// they already were.
//
// THE PATTERN ORDER IS THE SAFETY MODEL of lib/templates/triage.mjs, and it runs
// top to bottom. Nothing later can override something earlier:
//
//    1. Red flags            lib/safety/redflags.mjs. A clinician, whatever else
//                            the message also matches.
//    2. Cauda equina         lib/templates/fcp.mjs.
//    3. Eyes                 the minor eye service, or the eye A&E.
//    4. A limb needing a doctor first, then the FCP — lib/templates/fcp.mjs.
//    5. Diabetes             the diabetes review for routine care; a doctor for
//                            a patient not yet diagnosed, one who is unwell now,
//                            or a foot that has gone wrong.
//    6. The nurse clinic     the procedures listed below, named by the request.
//    7. Pharmacy First       lib/templates/pharmacy.mjs.
//    8. Otherwise            a clinician here.
//
// Steps 5 and 6 sit ABOVE Pharmacy First deliberately: "wound problems and
// dressings" is on the minor illness list, so a dressing change matched the
// pharmacy and stopped there. They sit BELOW the musculoskeletal checks because
// a swollen, numb limb is a doctor's question before it is anybody's booking.
//
// `rank` IS A DIFFERENT ORDERING FROM THAT, and it is the reader's. It is not
// urgency and not acuity — it is HOW SENIOR THE PAIR OF EYES IS, which is the
// only ordering under which "never move it down" means what it has to mean. See
// lib/templates/accurx-route.mjs.
//
// NOTHING HERE DIAGNOSES. Every list is about who does a piece of work, and
// every guard is about who to pass it to — never about what is wrong with the
// patient. The guide says the same in its own words: this is a care navigation
// tool, not a clinical assessment tool.

/* ------------------------------------------------------------- the team */

/**
 * Every route the guide lists, as data.
 *
 * `sendTo` is what a card puts on its destination line and what the reader
 * copies — so for the routes that mean "do something now" it is written as the
 * instruction rather than as a place. `covers` and `refuses` are what the
 * /accurx reader is told about each one, and `refuses` is the half that does the
 * work: a reader told only what a service covers says yes to anything adjacent
 * to it. `signpost` marks the two nursing routes, whose losing "yes" becomes a
 * note on the card rather than its destination. `doc` names the guide's own
 * heading, so an entry can be checked against the page it came from.
 *
 * THE ARRAY ORDER IS THE READER'S TIE-BREAK, most specific first within a rank.
 *
 * ONE ROUTE FROM THE GUIDE IS NOT AN ENTRY HERE: the red button. It is the
 * in-practice alarm — it brings staff to the front desk and does nothing for a
 * caller or for a message — and everything this file routes arrived in writing.
 * It is on the emergency entry instead, as what to do as well when the patient
 * is in the building, which is where reception needs to be told about it.
 */
export const DESTINATIONS = [
  /* ---------------------------------- what the practice reaches for first */
  {
    id: 'minorEyeService',
    rank: 1,
    section: 'A',
    doc: 'Eye emergency — local detail',
    label: 'The minor eye service (Rose Opticians)',
    sendTo: 'Rose Opticians — Minor Eye Service',
    covers: 'An eye problem a community optician can see: styes, red or sore eyes, mild trauma or a scratch to the surface of the eye, a suspected foreign body, recent flashes and floaters, recent double vision, significant discharge or watering. An optometrist can examine an eye, which is why an eye problem comes here rather than to a pharmacy or a physiotherapist.',
    refuses: 'Sudden loss of vision, a chemical splash, a penetrating injury or a foreign body that cannot be flushed out, severe eye pain with vomiting or halos or a hard red eye, or a curtain or shadow across the vision. All of those are the eye emergency route. Gradual blurring over weeks is a routine optician or GP question. Anything already watched by an optometrist or the hospital eye service — cataracts, glaucoma, dry eye — is not a minor eye service job either.',
  },
  {
    id: 'pharmacy',
    rank: 1,
    section: 'C',
    doc: 'Pharmacy First referral',
    label: 'Community pharmacy (Pharmacy First)',
    sendTo: 'Community pharmacy (Pharmacy First)',
    covers: 'A Pharmacy First pathway within its age range — uncomplicated UTI in women 16 to 64, shingles 18 and over, impetigo 1 and over, infected insect bites 1 and over, sinusitis 12 and over, sore throat 5 and over, acute otitis media 1 to 17 — or minor illness more broadly: cough, cold, diarrhoea, constipation, mouth ulcers, rashes, hay fever, sprains and strains, blocked ear or wax, red or sticky eye, teething, scabies, athlete’s foot, wound dressings. Referring rather than signposting transfers clinical responsibility to the pharmacist, who assesses, treats and follows the patient up.',
    refuses: 'Anybody outside the age range for that pathway — the pharmacist cannot treat and the request stays with us. A patient who is systemically unwell rather than just locally unwell. A pregnant patient with a UTI. The same problem presenting again after pharmacy treatment has already failed. Suspected shingles affecting the eye or the tip of the nose, which is the duty doctor’s.',
  },
  {
    id: 'midwife',
    rank: 1,
    section: 'D',
    doc: 'Midwife — antenatal self-referral',
    label: 'The midwife (antenatal self-referral)',
    sendTo: 'Homerton antenatal self-referral — the patient refers themselves',
    covers: 'Starting antenatal care: a newly pregnant patient asking how to book in, questions about the 12-week or other scans, or a patient asking to be referred to a midwife. All pregnancy care is arranged directly with the midwifery service and the patient does not need to see a GP first.',
    refuses: 'A pregnant patient describing a physical symptom rather than asking an administrative question. Bleeding, severe abdominal pain, reduced fetal movements or a severe headache are an interrupt, not a self-referral. Medication safety in pregnancy is the pharmacy team’s or a doctor task; options after an unplanned pregnancy are a doctor task.',
  },
  {
    id: 'socialPrescriber',
    rank: 1,
    section: 'D',
    doc: 'Social prescriber',
    label: 'The social prescriber',
    sendTo: 'The PCN social prescriber',
    covers: 'Practical, social and emotional support that is not a clinical appointment: money worries, debt, benefits applications and help with forms, housing problems and council services, loneliness and isolation, community activity or exercise, and carers needing support in their own right.',
    refuses: 'A patient in mental health crisis or expressing thoughts of self-harm — the duty doctor, immediately. Coordination of care packages, transport or social services, which is the care coordinator’s. A medical report to support a benefits claim, which is an administrative and clinical task. If the patient is distressed rather than stuck, a clinician comes first.',
  },

  /* --------------------------- the practice’s own services, below a doctor */
  {
    id: 'diabeticNurse',
    rank: 2,
    signpost: true,
    section: 'B',
    doc: 'Diabetes review',
    label: 'The diabetes review (nursing team)',
    sendTo: 'The diabetes review — nursing team',
    covers: 'Structured diabetes care for somebody already on the register: the annual or interval review, a newly diagnosed patient’s first review, a patient asking about a diabetes blood test, at-risk reviews for non-diabetic hyperglycaemia, and patients recalled after an abnormal HbA1c. Any practice nurse can do a routine check; the specialist diabetes nurse takes newly diagnosed patients, poor control, and anything a general check cannot settle.',
    refuses: 'A diabetic patient who feels unwell today — vomiting, drowsiness, extreme readings, or an infection that is not settling. That is the duty doctor however overdue the review is. Foot problems with broken skin, discolouration or a wound that is not healing are a doctor task, urgently. Eye symptoms in a diabetic patient are a separate question for the doctor. Requests to change insulin doses go to the pharmacy team, not into a review booking.',
  },
  {
    id: 'fcp',
    rank: 2,
    section: 'B',
    doc: 'First Contact Physiotherapist (FCP)',
    label: 'First Contact Physiotherapist (FCP)',
    sendTo: 'First Contact Physiotherapist (FCP)',
    covers: 'A musculoskeletal problem in an adult: neck and back pain, sciatica and nerve pain radiating into a limb with pins and needles or numbness, shoulder, elbow, wrist and hand pain, hip, knee, ankle and foot pain, muscle, tendon and soft tissue problems, flare-ups of a longstanding MSK problem, osteoarthritis, and weakness or giving way after a minor injury. Anybody asking for a physiotherapy referral for a new MSK problem comes here — the FCP is the assessment, not a step before it, and can order imaging and bloods and refer onward directly.',
    refuses: 'Anyone under 16 — FCPs are trained and equipped for adults only. A suspected fracture or dislocation, significant recent trauma, or an inability to weight-bear at all, which is A&E. A hot, swollen, red joint, especially with fever — the duty doctor, same day. Back pain with loss of bladder or bowel control, saddle numbness or new weakness in both legs — an interrupt, immediately. Back pain with unexplained weight loss, night sweats or a history of cancer. Pain that is part of a wider illness where the patient is systemically unwell. Chest pain the patient calls muscular is a duty doctor question until a doctor says otherwise. Post-operative or wound problems after orthopaedic surgery, and anything a hospital has already said needs physiotherapy, are a doctor task.',
  },
  {
    id: 'nurse',
    rank: 2,
    signpost: true,
    section: 'B',
    doc: 'Practice nurse',
    label: 'The practice nurse',
    sendTo: 'The practice nurse',
    covers: 'Nursing and healthcare assistant work, in clinics on Mondays, Wednesdays and Fridays: long-term condition reviews (asthma, at-risk, mental health, learning disability), cervical screening, swabs and ear checks, dressings and wound care for patients who can attend, travel vaccinations and childhood immunisations, blood tests, blood pressure checks and ECGs, NHS Health Checks and new patient health checks, and HRT reviews.',
    refuses: 'Blood tests for anyone under 16 — the practice is not equipped for paediatric phlebotomy and nurses take blood from 16 and over only. Acute illness needing diagnosis, which is the duty list. Contraceptive pill requests, which are the pharmacy team’s. Diabetes care in a diagnosed diabetic, which is the diabetes review. A wound that looks infected, is spreading or is not healing is a doctor’s before it is a dressing.',
  },
  {
    id: 'pharmacyTeam',
    rank: 2,
    section: 'C',
    doc: 'Practice pharmacy team',
    label: 'The practice pharmacy team',
    sendTo: 'The practice pharmacy team',
    covers: 'Every medication-related request, without exception: repeat prescriptions and queries about them, what a medicine is for, dosing or side effects, changes of quantity, formulation or nominated pharmacy, contraceptive pill requests and continuation, queries from a community pharmacist about one of our prescriptions, and discharge medication queries after a hospital stay. Allow about three working days.',
    refuses: 'A new symptom that happens to involve medication — if the patient is asking to be seen about a problem, that is a clinical route. A suspected adverse reaction where the patient is unwell now is the duty doctor. Nothing is issued without a prescription request, controlled drugs least of all.',
  },
  {
    id: 'districtNurse',
    rank: 2,
    section: 'D',
    doc: 'District Nurse / Adult Community Nursing',
    label: 'The district nurse (adult community nursing)',
    sendTo: 'District Nurse — adult community nursing',
    covers: 'Nursing care at home for patients who cannot attend the surgery: wound care, dressings and leg ulcer management, injections, catheter care and blood tests at home, palliative and end of life care, continence assessment and pressure area care. Being housebound is the gateway, and it is asked directly.',
    refuses: 'A patient who can physically attend the surgery, even with difficulty — that is the practice nurse. Help with shopping, benefits or isolation, which is the social prescriber’s. Urgent deterioration in a housebound patient, which is the duty doctor. Where it is unclear whether the patient is genuinely housebound, it is a doctor task rather than a referral.',
  },

  /* ------------------------------ a doctor, but not necessarily an appointment */
  {
    id: 'doctorTask',
    rank: 3,
    section: 'B',
    doc: 'Doctor task',
    label: 'A doctor task',
    sendTo: 'A task to the doctor',
    covers: 'A written task where no appointment is needed yet and the doctor decides what happens next: any request for a referral (the doctor chooses the service, speciality and priority), test results that have returned and need review, fit notes needing a clinical decision, queries about advice a doctor gave previously, and anything that would once have been signposted to an outside service where the right service is a clinical judgement.',
    refuses: 'Anything time-critical — tasks are not read in real time. Medication requests, which go to the pharmacy team. Straightforward bookings where a slot already exists. Reception does not choose a speciality, a clinic type or a priority, even when the patient has researched one themselves.',
  },
  {
    id: 'gp',
    rank: 3,
    section: 'B',
    doc: 'GP routine appointment',
    label: 'A GP appointment here',
    sendTo: 'A GP appointment here',
    covers: 'A booked telephone or face-to-face appointment for something that is not urgent: ongoing symptoms that are stable and want reviewing, follow-up after a hospital letter or a previous consultation, results the doctor asked to discuss, medication questions needing a doctor rather than the pharmacy team, long-term condition concerns outside a nurse-led review, a second opinion, and requests for a particular doctor where continuity matters.',
    // The refusal that "pt has sore throat" was missing. A GP appointment reads
    // like the safe answer for anything clinical, and here it is the opposite:
    // this entry is only ever consulted to move a message UP, so a loose yes
    // does not add a doctor's opinion — it takes the patient off the pharmacy,
    // the physio or the nurse clinic that was going to see them.
    refuses: 'Anything the patient describes as getting worse or as having changed — reassess for the duty list. Minor illness inside a Pharmacy First pathway with nothing complicating it. An MSK problem in an adult with no red flags, which is the FCP’s and is faster. Reviews that belong to the nursing team. Purely administrative requests, which are a doctor task rather than an appointment. New patients who have not had their new patient check. A GP appointment is NOT the safe default here — the practice’s own rules already provide the default, and naming it only ever takes a message away from a service that would have dealt with it.',
  },

  /* ------------------------------------------------------------ a doctor today */
  {
    id: 'dutyDoctor',
    rank: 4,
    section: 'B',
    doc: 'Duty / on-call GP',
    label: 'The duty doctor — today',
    sendTo: 'The duty doctor',
    covers: 'Same-day assessment by a doctor, and the default for anything that cannot confidently be placed elsewhere: new symptoms over hours or days in a patient who is unwell with them, fever in somebody very young, frail or immunosuppressed, a known long-term condition getting worse, a suspected infection needing examination, pain that is new, severe or escalating, a patient seen recently and calling back no better, and anything that worries the reader with no clear alternative.',
    refuses: 'Administrative requests — letters, forms, chasing results, registration. Minor illness squarely inside a Pharmacy First pathway with no complicating features. MSK pain in an adult with no red flags. Medication requests. Anything on the 999 or interrupt lists, which do not wait for a call-back.',
  },

  /* --------------------------------------------- nobody waits for a call-back */
  {
    id: 'dutyInterrupt',
    rank: 5,
    section: 'A',
    doc: 'Duty doctor interrupt',
    label: 'Interrupt the duty doctor — now',
    sendTo: 'Interrupt the duty doctor now — walk to them, do not send a task',
    covers: 'A patient who cannot wait for a call-back but is not yet a 999: breathless, confused or struggling to finish sentences; a child who is floppy, not feeding, not responding normally, or has a rash that does not fade under a glass; new severe pain of sudden onset — worst headache ever, sudden abdominal pain, testicular pain; a pregnant patient with bleeding, severe abdominal pain, reduced fetal movements or a severe headache; anyone describing thoughts of ending their life, or a plan to harm themselves or someone else; a patient getting visibly worse while you are speaking to them.',
    refuses: 'Symptoms that are stable and have been present for days — that is the duty list. Requests for results, medication or letters, however insistent. Anything on the 999 list, which is an ambulance first and a conversation afterwards.',
  },
  {
    id: 'ae',
    rank: 5,
    section: 'A',
    doc: 'A&E — self-transport',
    label: 'A&E — the patient travels there themselves',
    sendTo: 'Homerton Hospital A&E — the patient makes their own way',
    covers: 'An urgent problem needing hospital assessment today where the patient is stable enough to travel themselves or with a family member: a suspected fracture or dislocation after a fall or injury, a wound needing stitching or a deep cut that will not stop bleeding with pressure, a head injury with vomiting, drowsiness or loss of consciousness at the time, burns beyond a small superficial area, or acute severe pain the practice cannot assess safely today.',
    refuses: 'Anything on the 999 list — those patients must not drive or be driven. Longstanding problems the patient is frustrated about waiting for. Minor illness: sore throats, coughs and rashes go to Pharmacy First or the duty list. If it is unclear whether the patient is safe to travel, that is the duty doctor before any advice is given.',
  },

  /* -------------------------------------------------------- somebody stands up */
  // ABOVE `emergency` IN THE ARRAY, at the same rank, so a message that is both
  // wins here. Anything reaching the eye A&E is an emergency by definition and
  // both would fit; the tie-break sends it to the one that names the hospital,
  // because a general A&E is an eye emergency answered twice as slowly.
  {
    id: 'eyeEmergency',
    rank: 6,
    section: 'A',
    doc: 'Eye emergency',
    label: 'Moorfields Eye Hospital (MEH) — eye A&E',
    sendTo: 'Moorfields Eye Hospital (MEH) — eye A&E',
    covers: 'An eye problem that cannot wait and a community optician cannot manage: sudden loss of vision in one or both eyes, a chemical splash (advise irrigation immediately while arranging), a penetrating injury or a foreign body that cannot be flushed out, severe eye pain with vomiting or halos around lights or a hard red eye, or a sudden curtain or shadow across the vision. The eye A&E is open around the clock and the patient can walk in.',
    refuses: 'Anything the minor eye service can see — a stye, a gritty or red eye, conjunctivitis, mild watering or discharge. Gradual blurring over weeks. And any emergency that is not about the eye: somebody with chest pain does not go to an eye hospital.',
  },
  {
    id: 'emergency',
    rank: 6,
    section: 'A',
    doc: '999 — Ambulance',
    label: '999 — ambulance',
    sendTo: 'Call 999 now, then tell the duty doctor',
    covers: 'An immediate threat to life or limb, which is not a triage decision and needs nobody’s permission: central or crushing chest pain, or pain radiating to jaw or arm with sweating, nausea or breathlessness; stroke signs (FAST); severe difficulty breathing, unable to speak in full sentences, blue lips; anaphylaxis; unresponsive, fitting for more than five minutes, or not rousable; heavy bleeding that does not stop with pressure; signs of sepsis; a suspected overdose or an act of self-harm already causing physical harm. If the patient is in the building, press the red button at the same time — the two are not alternatives.',
    refuses: 'Symptoms the patient has had for days and is now asking about, which are the duty doctor’s. Anxiety about symptoms with none of the above features. If any part of the reader is unsure whether it is a 999, it is treated as one and the duty doctor is told: nobody is criticised for calling an ambulance that turned out not to be needed.',
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

/* --------------------------------------------------------- the hard gates */

/**
 * The guide's own table.
 *
 * "These are absolute. They are not clinical judgements and reception does not
 * need permission to apply them." Kept as data because every one of them is a
 * question a booking either answers or gets wrong, and because a rule nobody can
 * find is a rule nobody applies.
 */
export const HARD_GATES = [
  { gate: 'Under 16 — blood tests', rule: 'Not done at the practice. Nurses are not trained in paediatric venepuncture and the equipment is not here.' },
  { gate: 'Under 16 — FCP', rule: 'FCPs see adults only. Route to a doctor.' },
  { gate: 'HPV vaccination', rule: 'Our nurse can only vaccinate patients aged 24 and under. 25 and over access it independently.' },
  { gate: 'Travel vaccinations', rule: 'Six weeks’ notice required.' },
  { gate: 'NHS Health Checks', rule: 'Offered to patients aged 40 and over only.' },
  { gate: 'New patients', rule: 'No routine appointment until the new patient check has been done.' },
  { gate: 'Health check bloods', rule: 'Must be taken before 13:00 for a morning nurse appointment.' },
  { gate: 'Nurse clinics', rule: 'Mondays, Wednesdays and Fridays only.' },
  { gate: 'Pharmacy First age ranges', rule: 'Outside the age range the pathway is closed and the request stays with us.' },
  { gate: 'Medication', rule: 'Nothing is issued without a prescription request, controlled drugs least of all. Allow three working days.' },
];

/**
 * The flags that change what else happens, never where the request goes.
 *
 * "Never delay the clinical route while you decide" — so they are a reminder
 * beside a card and are not, and must not become, destinations.
 */
export const MODIFYING_FLAGS = [
  '**Safeguarding** — any concern about a child or an adult at risk goes to the safeguarding lead as well as the clinical route.',
  '**Domestic abuse** — never leave a message, never send correspondence to the home address, and check it is safe to call back before agreeing a time.',
  '**Interpreter needed** — book Language Line and note the language on the appointment.',
  '**Carer status** — record it, and consider whether the carer needs a route of their own.',
  '**Learning disability or reasonable adjustments** — longer appointments, quieter times, a named contact, or written follow-up.',
  '**Digital exclusion** — do not signpost a self-referral link to somebody who cannot use it. Arrange the route for them.',
];

/* --------------------------------------------------- the nurse clinic */

export const NURSE_CLINIC_DAYS = 'Nurses work Mondays, Wednesdays and Fridays.';

// The rules that get a nurse booking wrong, from the guide's hard gates.
export const NURSE_RULES = [
  'Travel vaccinations need **six weeks** notice.',
  'Health-check bloods must be taken **before 1 pm** for a morning nurse appointment.',
  'Nurses take blood from **16 and over** only — there is no paediatric phlebotomy here.',
  'HPV vaccination is given by our nurse to patients **24 and under**; 25 and over arrange it themselves.',
  'NHS Health Checks are offered from **40** and over.',
  'Saturday phlebotomy is available at the Nightingale Practice Enhanced Access hub.',
];

// The reviews that cannot be booked until the bloods are back. Booking them the
// wrong way round wastes both appointments, and results take about five working
// days — so an unnecessary blood test is a smaller problem than a wasted review.
export const BLOODS_FIRST = [
  'Diabetes reviews',
  'At-risk reviews (non-diabetic hyperglycaemia)',
  'Mental health reviews',
  'Learning disability reviews',
  'NHS Health Checks',
  'New patient health checks',
];

// What the nurse clinic takes, as a list rather than the paragraph the reader is
// given. Same content, shown to the reader on the card.
export const NURSE_COVERS = [
  'Long-term condition reviews — asthma, at-risk, mental health, learning disability',
  'Cervical screening, swabs and ear checks',
  'Dressings and wound care, for patients who can attend the surgery',
  'Travel vaccinations and childhood immunisations',
  'Blood tests, blood pressure checks and ECGs',
  'NHS Health Checks and new patient health checks',
  'HRT reviews — the nurse needs a BMI and a blood pressure reading recorded',
];

export const NURSE_REFUSES = [
  'Blood tests for anyone **under 16** — the practice is not equipped for paediatric phlebotomy.',
  'Acute illness needing diagnosis. That is the duty list.',
  'Contraceptive pill requests — the pharmacy team.',
  'Diabetes care in a diagnosed diabetic — the diabetes review.',
  'A wound that looks infected, is spreading or is not healing. A doctor sees it before a dressing does.',
];

export const DIABETIC_NURSE_COVERS = [
  'The annual or interval review for a patient on the diabetes register',
  'A newly diagnosed patient’s first review — a double appointment, and the education programme',
  'A patient asking about a diabetes blood test, booked as a nurse appointment',
  'At-risk reviews for non-diabetic hyperglycaemia',
  'A patient recalled after an abnormal HbA1c',
];

export const DIABETIC_NURSE_REFUSES = [
  'A diabetic who feels unwell today — vomiting, drowsiness, extreme readings, an infection that is not settling. **Duty doctor**, however overdue the review is.',
  'A foot with broken skin, discolouration or a wound that is not healing. **Doctor task, urgently.**',
  'Eye symptoms in a diabetic patient — a separate question for the doctor.',
  'Requests to change insulin doses — the **pharmacy team**, not a review booking.',
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
    note: 'Travel vaccinations need **six weeks** notice. If they are travelling sooner than that, say so at the point of booking.',
  },
  {
    id: 'immunisation',
    label: 'An immunisation or vaccination',
    re: /\b(immunis\w+|immuniz\w+|vaccin\w+|booster|flu jab|covid jab|shingles jab|pneumo\w+|childhood (?:jabs?|injections?)|hpv|bcg|mmr)\b/i,
    note: 'HPV is given here to patients **24 and under** only.',
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
    note: 'If the patient cannot get to the surgery at all, this is the **district nurse** rather than the nurse clinic. Ask.',
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
    id: 'bloods',
    label: 'A blood test',
    re: /\b(blood tests?|bloods\b|phlebotom\w+|blood form|fasting bloods?)\b/i,
    // A BLOOD TEST ASKED FOR AND A BLOOD TEST BEING CHASED ARE DIFFERENT ROUTES.
    // The first is a nurse appointment; the second is results, which the guide
    // sends to the doctor as a task. Both say "blood test", so the difference
    // has to be read from the words around it.
    not: /\bresults?\b|awaiting|chas\w+|came back|come back|gone through|any news/i,
    note: 'Bloods for a morning nurse appointment must be taken **before 1 pm**, and nurses here take blood from **16 and over** only.',
  },
  {
    id: 'ecg',
    label: 'An ECG',
    re: /\becgs?\b|\belectrocardiogram\b/i,
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
    id: 'hrt',
    label: 'An HRT review',
    re: /\bhrt\b|\bhormone replacement\b/i,
    note: 'The nurse needs a **BMI and blood pressure** recorded for an HRT review.',
  },
  {
    id: 'healthcheck',
    label: 'An NHS or new patient health check',
    re: /\b(nhs health check|health check|new patient (?:health )?check|well ?(?:man|woman) check)\b/i,
    note: 'This needs the **bloods first**, taken **before 1 pm**. NHS Health Checks are for patients **40 and over**.',
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
  // `not` is how a task declines a message that says its words while asking for
  // something else — see the blood test, which is a nurse appointment when it is
  // being asked for and a doctor task when it is being chased.
  return NURSE_TASKS.find((task) => task.re.test(t) && !(task.not && task.not.test(t))) || null;
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

// The words that make a message about diabetes at all.
export const DIABETES = new RegExp('\\b(?:' + [
  'diabet\\w+', 'hba1c', 'hb a1c',
  'blood sugars?', 'blood glucose', 'sugar levels?', 'glucose (?:reading\\w*|level\\w*|monitor\\w*)',
  'insulin', 'metformin', 'gliclazide', 'dapagliflozin', 'empagliflozin', 'sitagliptin',
  'libre', 'dexcom', 'finger ?prick', 'test strips?',
].join('|') + ')', 'i');

// Routine diabetes care: the reviews, the recalls, the readings, the blood test.
// Diabetes alone is not enough — "I am diabetic and my chest hurts" is a chest,
// and the red flags have already taken it.
//
// DOSE CHANGES ARE DELIBERATELY NOT HERE. The guide sends a request to change an
// insulin dose to the pharmacy team rather than into a review booking, and the
// pattern cascade has no pharmacy-team branch — so it falls through to a
// clinician instead of being claimed by an appointment that would not answer it.
export const DIABETES_ROUTINE = new RegExp([
  'review\\w*', 'recall\\w*', 'annual', 'check.?up', 'due\\b', 'overdue',
  'hba1c', 'foot check', 'feet checked', 'foot screening',
  'blood test', 'bloods\\b',
  'reading\\w*', 'monitor\\w*', 'diary',
  'appointment', 'book\\w*',
].join('|'), 'i');

// AND THE SHAPES THAT ARE NOT THE NURSING TEAM'S.
//
// A patient who has not been diagnosed, a diabetic who is unwell now, a foot
// that has gone wrong, and eye symptoms in a diabetic. All of them are a
// doctor's, and the foot is a doctor's today — a diabetic foot ulcer is not a
// foot check and does not wait for the recall.
//
// "Newly diagnosed" is deliberately absent: the guide books a newly diagnosed
// patient their first review, as a double appointment with the specialist nurse.
export const DIABETES_TO_GP = new RegExp([
  // Not diagnosed at all.
  '(?:think|thinks|worried|wonder\\w*)[^.!?]{0,40}diabet\\w+',
  '(?:might|may|could) (?:be|have|have got)[^.!?]{0,20}diabet\\w+',
  'suspect\\w*[^.!?]{0,20}diabet\\w+',
  'never been (?:tested|diagnosed|checked)', 'not (?:been )?diagnosed',
  'pre.?diabet\\w+',
  // Unwell now.
  'hypos?\\b', 'hypoglycaem\\w+', 'hypoglycem\\w+',
  'ketone\\w*', 'dka\\b', 'ketoacidosis',
  'vomit\\w+', 'being sick', 'drowsy', 'confus\\w+',
  'passed out', 'fainted', 'unwell', 'very thirsty', 'passing (?:a lot of|lots of) urine',
  'sugars? (?:are |is |been |very |really )*(?:high|low|through the roof|dropping)',
  // The foot, and the eye.
  'foot ulcer', 'ulcer on (?:my|their|his|her|the) (?:foot|toe|heel|leg)',
  'black\\w* (?:toe|foot|heel)', 'infect\\w+ (?:foot|toe|heel)',
  '(?:foot|toe|heel)[^.!?]{0,25}(?:infect\\w+|ulcer\\w*|not healing|won\'?t heal|gangrene|broken skin|discolour\\w+)',
  'gangrene',
  '(?:eye|eyes|vision|sight)[^.!?]{0,30}(?:blurr\\w+|chang\\w+|worse|floater\\w*|flashes)',
].join('|'), 'i');

/** Is this a diabetes message at all? */
export const mentionsDiabetes = (text = '') => DIABETES.test(String(text || ''));

/**
 * Routine diabetes care — the diabetes review.
 *
 * Both halves are required and the exclusion wins: the message has to be about
 * diabetes, has to be asking for something routine, and must carry none of the
 * shapes above. Anything else falls through to the rest of the order, which ends
 * at a clinician.
 */
export function needsDiabetesNurse(text = '') {
  const t = String(text || '');
  if (!mentionsDiabetes(t)) return false;
  if (DIABETES_TO_GP.test(t)) return false;
  return DIABETES_ROUTINE.test(t);
}

/** A diabetes message that must reach a doctor rather than the nursing team. */
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
    'THE RULE THAT OVERRIDES EVERY OTHER RULE: when you are not sure, route UPWARD. dutyDoctor is the correct destination for anything you cannot confidently place. A task sent to the wrong clinician costs a few minutes; a missed escalation does not.',
    '',
    'THE ORDER. Run it top to bottom and stop at the first that fits. Nothing later overrides something earlier:',
    '1. An immediate threat to life or limb — emergency. A patient who cannot wait for a call-back but is not that — dutyInterrupt.',
    '2. An eye problem — minorEyeService, unless it is sudden loss of vision, a chemical splash, a penetrating injury, severe pain with vomiting or halos, or a curtain across the vision, which are eyeEmergency.',
    '3. Needs hospital today but is safe to travel — ae. A swollen limb with numbness, or a clot named by anybody — dutyDoctor.',
    '4. A joint, muscle, tendon or back problem in an adult — fcp.',
    '5. Diabetes: routine care to diabeticNurse; a patient not yet diagnosed, one who is unwell now, or a foot that has gone wrong to dutyDoctor.',
    '6. One of the nurse-clinic procedures named by the request — nurse. A wound that looks infected goes to dutyDoctor instead.',
    '7. Anything about a medicine — pharmacyTeam. Minor illness or a Pharmacy First pathway — pharmacy.',
    '8. Care at home for somebody who cannot attend — districtNurse. Starting antenatal care — midwife. Money, housing, isolation — socialPrescriber.',
    '9. A referral, a result, a fit note, or anything else needing a doctor’s decision but no appointment — doctorTask.',
    '10. Anything else, and anything unclear — dutyDoctor.',
    '',
    'THE NURSE CLINIC',
    `- ${NURSE_CLINIC_DAYS}`,
    ...NURSE_RULES.map((r) => '- ' + r.replace(/\*\*/g, '')),
    '- These need the bloods taken first: ' + BLOODS_FIRST.join(', ').toLowerCase() + '.',
    '',
    'HARD GATES — absolute, and not clinical judgements:',
    ...HARD_GATES.map((g) => `- ${g.gate}: ${g.rule}`),
  ].join('\n');
}
