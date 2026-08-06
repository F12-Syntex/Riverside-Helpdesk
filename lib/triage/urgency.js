/* ------------------------------------------------------------------ *
 * Verifying "urgent" before it costs the practice a duty doctor.
 *
 * Marking a request urgent is not a label, it is a commitment: the duty
 * doctor is interrupted, the request goes into a pink slot, and the
 * practice owes the patient a call back within 2 hours while everything
 * else queues behind it (Duty Doctor Protocol 2025). A same-day
 * appointment costs none of that, and the practice books same day
 * anyway, so "urgent" has to mean something more than "today".
 *
 * The failure mode this file exists to stop is reception (or a model)
 * reading "pain when passing urine, a week now" and reaching for the
 * duty doctor. A week of stable symptoms is not what a duty doctor is
 * for. Blood in the urine, a fever with loin pain, or a patient who has
 * gone confused IS, and the only way to tell them apart is to ask.
 *
 * So this is a question bank, not a classifier. Each question is one a
 * non-clinician can ask down a phone and get a yes or no to, each is
 * attached to the guidance that makes it worth asking, and each says
 * what a "yes" means. Nothing here decides anything clinical: the
 * answers go to a clinician, and the standing rule from the practice's
 * own reception guide is that any doubt goes to the duty doctor anyway.
 *
 * Written as data, matched by keyword, with no model involved — the
 * same guarantee the contacts directory gives for phone numbers. A
 * model can pick the wrong band; it cannot invent a clinical question
 * that was never written here.
 *
 * Pure functions, no I/O, no React.
 * ------------------------------------------------------------------ */

/* -------------------------------------------------------------------
 * The evidence each question rests on.
 *
 * Two kinds, deliberately kept apart. The practice's own protocols are
 * what staff are actually held to and are in the knowledge base, so
 * they carry no link. The national guidance is what those protocols are
 * built on, and is linked so anyone can check the threshold for
 * themselves rather than taking this file's word for it.
 * ----------------------------------------------------------------- */
export const EVIDENCE = {
  practiceUrgentGuide: {
    label: 'Urgent / Emergency Appointment Requests: Reception Guide',
    org: 'The Riverside Practice',
    url: '',
  },
  practiceDutyDoctor: {
    label: 'Duty Doctor Protocol 2025',
    org: 'The Riverside Practice',
    url: '',
  },
  practiceEmergencyCalls: {
    label: 'Emergency Telephone Call Handling Protocol',
    org: 'The Riverside Practice',
    url: '',
  },
  practiceSepsis: {
    label: 'Sepsis Identification and Management Protocol',
    org: 'The Riverside Practice',
    url: '',
  },
  niceSepsis: {
    label: 'NG51: suspected sepsis, recognition, diagnosis and early management',
    org: 'NICE',
    url: 'https://www.nice.org.uk/guidance/ng51',
  },
  niceCancer: {
    label: 'NG12: suspected cancer, recognition and referral',
    org: 'NICE',
    url: 'https://www.nice.org.uk/guidance/ng12',
  },
  niceMeningitis: {
    label: 'NG240: bacterial meningitis and meningococcal disease',
    org: 'NICE',
    url: 'https://www.nice.org.uk/guidance/ng240',
  },
  niceStroke: {
    label: 'NG128: stroke and transient ischaemic attack in over 16s',
    org: 'NICE',
    url: 'https://www.nice.org.uk/guidance/ng128',
  },
  niceChestPain: {
    label: 'CG95: recent onset chest pain of suspected cardiac origin',
    org: 'NICE',
    url: 'https://www.nice.org.uk/guidance/cg95',
  },
  niceUti: {
    label: 'NG109: lower urinary tract infection, antimicrobial prescribing',
    org: 'NICE',
    url: 'https://www.nice.org.uk/guidance/ng109',
  },
  niceFeverishChildren: {
    label: 'NG143: fever in under 5s, assessment and initial management',
    org: 'NICE',
    url: 'https://www.nice.org.uk/guidance/ng143',
  },
  niceSelfHarm: {
    label: 'NG225: self-harm, assessment, management and preventing recurrence',
    org: 'NICE',
    url: 'https://www.nice.org.uk/guidance/ng225',
  },
  niceEctopic: {
    label: 'NG126: ectopic pregnancy and miscarriage',
    org: 'NICE',
    url: 'https://www.nice.org.uk/guidance/ng126',
  },
  girftCaudaEquina: {
    label: 'National suspected cauda equina syndrome pathway',
    org: 'GIRFT, NHS England',
    url: 'https://gettingitrightfirsttime.co.uk/pathway-supports-clinicians-to-diagnose-and-treat-cauda-equina-syndrome-without-delay/',
  },
  cksScrotalPain: {
    label: 'CKS: scrotal pain and swelling',
    org: 'NICE',
    url: 'https://cks.nice.org.uk/topics/scrotal-pain-swelling/',
  },
  cksRedEye: {
    label: 'CKS: red eye',
    org: 'NICE',
    url: 'https://cks.nice.org.uk/topics/red-eye/',
  },
};

/* -------------------------------------------------------------------
 * What a "yes" costs, in the practice's own terms. These are the only
 * four outcomes a question can point at, and they are deliberately not
 * all "urgent": telling a same-day appointment apart from a duty-doctor
 * interrupt is most of the point of asking.
 * ----------------------------------------------------------------- */
export const LEVELS = {
  '999': {
    label: 'Call 999 now',
    note: 'Do not take a message and do not wait for the duty doctor to be free. Dial 999, then tell the duty doctor.',
    tone: 'emergency',
  },
  duty: {
    label: 'Duty doctor now',
    note: 'Pink duty doctor slot, duty doctor told straight away, call back inside 2 hours.',
    tone: 'urgent',
  },
  today: {
    label: 'Seen or called today',
    note: 'A same-day appointment covers this. It does not need the duty doctor interrupted.',
    tone: 'today',
  },
  pathway: {
    label: 'Changes the referral, not today',
    note: 'Not a same-day emergency in itself, but it must reach a GP so the right referral pathway is started.',
    tone: 'pathway',
  },
};

/* -------------------------------------------------------------------
 * The 999 list, copied from the practice's Emergency Telephone Call
 * Handling Protocol and Duty Doctor Protocol. When one of these is on
 * the page there is nothing to verify: the questions below are for
 * deciding whether something is urgent, and this is already past that.
 * ----------------------------------------------------------------- */
export const EMERGENCY_WORDS = [
  { label: 'Chest pain, tightness, sweating or clammy, pain down the left arm', match: /\bchest (?:pain|tightness|pressure)\b|\btight(?:ness)? in (?:the |my |his |her )?chest\b|\bpain (?:radiating |going |spreading )?down (?:the |my |his |her )?left arm\b|\bheart attack\b/i, evidence: ['practiceEmergencyCalls', 'niceChestPain'] },
  { label: 'Unconscious, collapsed or unresponsive', match: /\bunconscious\b|\bcollapsed?\b|\bunresponsive\b|\bpassed out\b|\bfainted and (?:has |had )?not (?:woken|come round)\b|\bwon'?t wake\b|\bwill not wake\b/i, evidence: ['practiceEmergencyCalls'] },
  { label: 'Difficulty breathing or gasping for breath', match: /\b(?:difficulty|trouble|struggling|struggles) (?:with )?breath(?:ing|e)\b|\bcan'?not breathe\b|\bcan'?t breathe\b|\bgasping\b|\bfighting for breath\b|\bnot breathing\b/i, evidence: ['practiceEmergencyCalls'] },
  { label: 'Symptoms of stroke or TIA', match: /\bstroke\b|\bt\.?i\.?a\.?\b|\bface (?:has )?dropp?(?:ed|ing)\b|\bslurred speech\b|\bcan'?t speak\b|\bweak(?:ness)? (?:down |on )?one side\b|\bfast test\b/i, evidence: ['practiceEmergencyCalls', 'niceStroke'] },
  { label: 'Acute allergic reaction', match: /\banaphyla(?:xis|ctic)\b|\ballergic reaction\b|\bthroat (?:is )?(?:closing|swelling)\b|\bswollen (?:lips|tongue|face)\b/i, evidence: ['practiceEmergencyCalls'] },
  { label: 'Bleeding profusely', match: /\bbleeding (?:heavily|profusely|a lot|badly)\b|\bhaemorrhag\w*\b|\bblood everywhere\b|\bwo(?:n'?t|uld not) stop bleeding\b|\bwill not stop bleeding\b/i, evidence: ['practiceEmergencyCalls'] },
  { label: 'Symptoms of sepsis', match: /\bsepsis\b|\bseptic\b|\bblood poisoning\b|\bmottled\b|\bblue lips\b|\bgoing blue\b/i, evidence: ['practiceSepsis', 'niceSepsis'] },
  { label: 'Weak and floppy with a rash, especially in a child', match: /\bfloppy\b|\brash that (?:does not|doesn'?t) (?:go|fade|disappear)\b|\bnon[- ]blanching\b|\bglass test\b/i, evidence: ['practiceEmergencyCalls', 'niceMeningitis'] },
  { label: 'Acute confusion', match: /\b(?:acutely |suddenly |newly )?confus(?:ed|ion)\b|\bnot making sense\b|\bdoesn'?t know where (?:he|she|they) (?:is|are)\b/i, evidence: ['practiceEmergencyCalls', 'niceSepsis'] },
  { label: 'Head injury', match: /\bhead injury\b|\bbanged (?:his|her|their|my) head\b|\bhit (?:his|her|their|my) head\b/i, evidence: ['practiceEmergencyCalls'] },
  { label: 'A seizure or fit', match: /\bseizure\b|\bfitting\b|\bconvulsion\b|\bhad a fit\b/i, evidence: ['practiceEmergencyCalls'] },
  { label: 'Suicidal thoughts or an act of self-harm', match: /\bsuicid\w*\b|\bkill (?:my|him|her|them)self\b|\bend (?:my|his|her|their) life\b|\boverdose\b|\btaken (?:an? )?(?:overdose|tablets)\b|\bself[- ]harm\w*\b/i, evidence: ['practiceDutyDoctor', 'niceSelfHarm'] },
];

/* -------------------------------------------------------------------
 * Asked of every request, whatever it is about. These four come
 * straight out of the practice's own reception guide ("Questions to
 * Ask"), and they are what the duration and severity rules below are
 * built out of: without them there is nothing to reason with.
 * ----------------------------------------------------------------- */
export const ALWAYS_ASK = [
  { ask: 'Can you describe the symptoms?', means: 'The words the patient uses are what the duty doctor is being handed. Write them down as said.', evidence: ['practiceUrgentGuide'] },
  { ask: 'How long have you had this? When exactly did it start?', means: 'Sudden onset today and a week of the same thing are different requests. This is the single most useful question on the page.', evidence: ['practiceUrgentGuide'] },
  { ask: 'How severe is it, 1 to 10? Has it got worse recently?', means: 'Stable is not urgent. Worsening, or worse today than yesterday, is.', evidence: ['practiceUrgentGuide'] },
  { ask: 'Any other symptoms with it, such as fever, being sick or feeling dizzy?', means: 'Most red flags are found here rather than in the symptom the patient led with.', evidence: ['practiceUrgentGuide'] },
  { ask: 'How old is the patient, and is anyone with them?', means: 'Under 5, frail elderly, pregnant, immunosuppressed or alone all lower the bar for the duty doctor.', evidence: ['practiceUrgentGuide'] },
];

/* -------------------------------------------------------------------
 * The presentation-specific questions. `match` is what puts a set on
 * the page; the questions themselves are fixed, so the same request
 * always produces the same checks whoever is on the desk.
 * ----------------------------------------------------------------- */
export const CHECK_SETS = [
  {
    key: 'urinary',
    label: 'Waterworks, urine or bladder',
    // Almost nobody says "urinary" to a receptionist. They say they cannot
    // pass water, that it stings, that they are going all the time. The
    // match has to be written in the words the patient actually uses or
    // the questions that matter never reach the page.
    match: /\burin\w*\b|\bwee(?:s|ing)?\b|\bwater ?works\b|\bpass(?:ing|es|ed)?\s+(?:any\s+)?water\b|\bbladder\b|\bcystitis\b|\bu\.?t\.?i\.?\b|\bpee(?:s|ing)?\b|\bdysuria\b|\bkidney\b|\bfrequency\b|\bgoing (?:to the )?(?:toilet|loo) (?:all the time|a lot|constantly)\b/i,
    questions: [
      { ask: 'Is there blood in the urine that you can see?', level: 'pathway', means: 'Visible blood needs a GP, and in anyone aged 45 or over that is not explained by an infection it starts a suspected cancer referral. That is a pathway to open today, not a reason to interrupt the duty doctor on its own.', evidence: ['niceCancer'] },
      { ask: 'Any pain in your back or side, over the kidneys?', level: 'duty', means: 'Loin pain with urinary symptoms points at the kidney rather than the bladder, and that is a same-day clinical assessment.', evidence: ['niceUti'] },
      { ask: 'Any temperature, shivering or shaking chills you cannot control?', level: 'duty', means: 'Rigors with a urine infection is the classic upper urinary tract picture. Fever plus a source of infection is also the start of the sepsis question.', evidence: ['niceUti', 'niceSepsis'] },
      { ask: 'Are you being sick, or unable to keep fluids or tablets down?', level: 'duty', means: 'Someone who cannot keep oral antibiotics down cannot be treated at home.', evidence: ['niceUti'] },
      { ask: 'Have you been able to pass any urine at all today?', level: '999', means: 'Not passing urine at all, with a painful full bladder, is retention and needs emergency assessment, not an appointment.', evidence: ['practiceUrgentGuide'] },
      { ask: 'Is the patient pregnant, a man, under 16, catheterised, or on chemotherapy or steroids?', level: 'duty', means: 'Each of these takes a urine infection out of the routine box regardless of how mild it sounds.', evidence: ['niceUti', 'practiceUrgentGuide'] },
      { ask: 'Any new confusion or drowsiness, especially in an older patient?', level: '999', means: 'New confusion in an older patient with an infection is a sepsis sign, and the practice protocol sends that to 999.', evidence: ['practiceSepsis', 'niceSepsis'] },
    ],
  },
  {
    key: 'abdominal',
    label: 'Tummy or abdominal pain',
    match: /\babdom\w*\b|\bstomach\b|\btummy\b|\bbelly\b|\bguts?\b|\bcolic\b/i,
    questions: [
      { ask: 'Is the patient pregnant, or could she be? Any bleeding?', level: 'duty', means: 'Pregnant and abdominal pain or bleeding is on the practice duty doctor list by name. Any woman of childbearing age with abdominal pain is a possible ectopic until a clinician says otherwise.', evidence: ['practiceDutyDoctor', 'niceEctopic'] },
      { ask: 'Have you vomited blood, or passed black tarry stools?', level: '999', means: 'That is a gastrointestinal bleed, and it goes to hospital rather than onto a list.', evidence: ['practiceEmergencyCalls'] },
      { ask: 'Is the tummy rigid, or too painful to be touched or to move?', level: '999', means: 'A rigid, board-like abdomen is a surgical emergency.', evidence: ['practiceUrgentGuide'] },
      { ask: 'Any temperature or shivering with it?', level: 'duty', means: 'Fever with abdominal pain moves this out of routine, and starts the sepsis question.', evidence: ['practiceSepsis', 'niceSepsis'] },
      { ask: 'Did it come on suddenly, and how bad is it out of 10?', level: 'duty', means: 'Sudden severe pain behaves differently from a grumbling ache that has been there a fortnight.', evidence: ['practiceUrgentGuide'] },
    ],
  },
  {
    key: 'chest',
    label: 'Chest pain or breathing',
    match: /\bchest\b|\bbreath\w*\b|\bwheez\w*\b|\bpalpitation\w*\b|\bheart\b|\bcough(?:ing)? (?:up )?blood\b/i,
    questions: [
      { ask: 'Is the pain there now, or was it in the last hour?', level: '999', means: 'Chest pain now, or within the last hour, is a 999 call. Do not take a message and ring back.', evidence: ['practiceEmergencyCalls', 'niceChestPain'] },
      { ask: 'Does it spread to the arm, jaw, neck or back?', level: '999', means: 'Radiating chest pain is on the practice 999 list word for word.', evidence: ['practiceEmergencyCalls', 'niceChestPain'] },
      { ask: 'Are you sweaty, clammy, sick or grey with it?', level: '999', means: 'The autonomic symptoms are what separate cardiac pain from muscular pain over the phone.', evidence: ['practiceEmergencyCalls'] },
      { ask: 'Can you finish a sentence without stopping for breath?', level: '999', means: 'Someone who cannot complete a sentence is breathless at rest, whatever they say about how they feel.', evidence: ['practiceEmergencyCalls'] },
      { ask: 'Any coughing up of blood, or a swollen painful calf?', level: '999', means: 'That combination is a possible clot on the lung and goes straight to emergency care.', evidence: ['practiceEmergencyCalls'] },
    ],
  },
  {
    key: 'headache',
    label: 'Headache',
    match: /\bhead ?ache\w*\b|\bmigraine\b|\bhead pain\b/i,
    questions: [
      { ask: 'Did it come on suddenly, and reach its worst within about 5 minutes?', level: '999', means: 'A thunderclap headache is a bleed until proven otherwise and goes to emergency care, however well the patient sounds now.', evidence: ['practiceEmergencyCalls'] },
      { ask: 'Is it the worst headache you have ever had?', level: '999', means: 'The practice guide lists "worst headache" as the phrase to escalate on.', evidence: ['practiceUrgentGuide'] },
      { ask: 'Any temperature, a stiff neck, dislike of bright light, or a rash?', level: '999', means: 'Meningitis can present without a rash, so a no to the rash is not reassurance on its own. A rash that does not fade under a glass is 999.', evidence: ['niceMeningitis', 'practiceEmergencyCalls'] },
      { ask: 'Any weakness, numbness, changed speech or changed vision?', level: '999', means: 'That is a stroke call, not a headache call.', evidence: ['niceStroke', 'practiceEmergencyCalls'] },
      { ask: 'Is the patient pregnant or recently delivered, or on blood thinners?', level: 'duty', means: 'Both change what a new headache means and neither is a routine booking.', evidence: ['practiceUrgentGuide'] },
    ],
  },
  {
    key: 'back',
    label: 'Back pain',
    match: /\bback ?(?:pain|ache)\b|\bsciatica\b|\blower back\b|\bspine\b|\bslipped disc\b/i,
    questions: [
      { ask: 'Any new trouble starting to pass urine, or not knowing when your bladder is full?', level: '999', means: 'New bladder change with back pain is the cauda equina question. The national pathway treats it as an emergency needing a scan within hours, and it is missed because nobody asked.', evidence: ['girftCaudaEquina'] },
      { ask: 'Any loss of control of your bowels, or new numbness between the legs, around the back passage or in the saddle area?', level: '999', means: 'Saddle numbness or incontinence with back pain goes to emergency care the same day, not to physiotherapy.', evidence: ['girftCaudaEquina'] },
      { ask: 'Any new weakness in the legs, or legs giving way?', level: '999', means: 'Progressive leg weakness with back pain is the third cauda equina red flag.', evidence: ['girftCaudaEquina'] },
      { ask: 'Any temperature, night sweats, or a history of cancer?', level: 'duty', means: 'Infection and metastatic disease are the other two things back pain hides, and both need a clinician rather than a routine slot.', evidence: ['niceCancer'] },
    ],
  },
  {
    key: 'child',
    label: 'A child, especially under 5',
    match: /\bchild\b|\bbaby\b|\binfant\b|\btoddler\b|\bmy (?:son|daughter)\b|\b(?:\d|1[0-7]) ?(?:month|year)s? old\b|\bnewborn\b/i,
    questions: [
      { ask: 'Is the child drinking, and how many wet nappies or trips to the toilet today?', level: 'duty', means: 'Not passing urine for 6 hours, or refusing drink for over 24 hours, is on the practice list for under 5s.', evidence: ['practiceUrgentGuide'] },
      { ask: 'What is the temperature? Is it above 38 degrees under 5, or above 39 over 5?', level: 'duty', means: 'Those are the practice guide thresholds, and any fever in a baby under 3 months is a same-day assessment.', evidence: ['practiceUrgentGuide', 'niceFeverishChildren'] },
      { ask: 'Is there a rash? Press a glass against it. Does it fade?', level: '999', means: 'A rash that does not fade is 999. Rashes are harder to see on brown and black skin, so check the eyelids and the roof of the mouth as well.', evidence: ['niceMeningitis', 'practiceEmergencyCalls'] },
      { ask: 'Is the child unusually sleepy, hard to wake, floppy, or crying in a way you cannot settle?', level: '999', means: 'The practice lists all four for under 5s, and they beat any reassuring temperature reading.', evidence: ['practiceUrgentGuide', 'niceFeverishChildren'] },
      { ask: 'Is the breathing fast, noisy, or is the skin pulling in under the ribs?', level: '999', means: 'Work of breathing is the sign a parent will not name unless asked directly.', evidence: ['niceFeverishChildren'] },
    ],
  },
  {
    key: 'mental-health',
    label: 'Mental health',
    match: /\bmental health\b|\bdepress\w*\b|\banxi\w*\b|\bcrisis\b|\bpsychosis\b|\bpsychotic\b|\bvoices\b|\bhopeless\b|\bcannot go on\b|\bcan'?t go on\b/i,
    questions: [
      { ask: 'Are you having thoughts of ending your life?', level: 'duty', means: 'Ask it plainly. Mental health emergencies are on the practice duty doctor list, and asking directly does not plant the idea.', evidence: ['practiceDutyDoctor', 'niceSelfHarm'] },
      { ask: 'Have you already done something to harm yourself, or taken anything?', level: '999', means: 'An act already taken is a 999 call, not a call back.', evidence: ['practiceEmergencyCalls', 'niceSelfHarm'] },
      { ask: 'Do you have a plan, and the means to carry it out?', level: 'duty', means: 'A plan with means is what moves risk from "needs an appointment" to "needs a clinician now".', evidence: ['niceSelfHarm'] },
      { ask: 'Is anyone with you right now?', level: 'duty', means: 'Someone alone and in crisis should not be left with a call back time and nothing else. Keep them on the line.', evidence: ['practiceEmergencyCalls'] },
    ],
  },
  {
    key: 'scrotal',
    label: 'Testicular or scrotal pain',
    match: /\btestic\w*\b|\bscrot\w*\b|\bballs?\b|\bgroin pain\b/i,
    questions: [
      { ask: 'When exactly did the pain start?', level: '999', means: 'Sudden testicular pain is torsion until proven otherwise, and the testicle is only reliably saved inside about 6 hours. This one cannot wait for a call back.', evidence: ['cksScrotalPain'] },
      { ask: 'Is it one side, sudden, and severe? Any sickness with it?', level: '999', means: 'Sudden, one-sided, severe, with vomiting is the torsion picture. Send to emergency urology.', evidence: ['cksScrotalPain'] },
      { ask: 'How old is the patient?', level: '999', means: 'Torsion peaks in teenagers and young men, so a boy with tummy pain and no other explanation gets asked about his testicles too.', evidence: ['cksScrotalPain'] },
    ],
  },
  {
    key: 'eye',
    label: 'Eye problems',
    match: /\beyes?\b|\bvision\b|\bsight\b|\bblurred\b|\bseeing double\b/i,
    questions: [
      { ask: 'Any sudden loss of vision, or a curtain coming across the sight?', level: '999', means: 'Sudden visual loss is a same-day emergency eye assessment.', evidence: ['cksRedEye'] },
      { ask: 'Is the eye painful rather than gritty, and is the vision affected?', level: 'duty', means: 'Pain plus reduced vision separates the eye that needs seeing today from the one that needs a pharmacy.', evidence: ['cksRedEye'] },
      { ask: 'Any injury, chemical splash, or contact lens worn?', level: 'duty', means: 'All three change the answer, and none of them will be volunteered.', evidence: ['cksRedEye'] },
    ],
  },
  {
    key: 'pregnancy',
    label: 'Pregnancy',
    match: /\bpregnan\w*\b|\bexpecting\b|\bweeks? pregnant\b|\bmiscarr\w*\b|\bantenatal\b/i,
    questions: [
      { ask: 'How many weeks pregnant?', level: 'duty', means: 'Under about 12 weeks with pain or bleeding goes to early pregnancy assessment. Later than that, it is maternity, not the practice.', evidence: ['niceEctopic'] },
      { ask: 'Any bleeding, or pain on one side?', level: 'duty', means: 'Pregnant and abdominal pain or bleeding is named on the practice duty doctor list.', evidence: ['practiceDutyDoctor', 'niceEctopic'] },
      { ask: 'Any shoulder tip pain, faintness or collapse?', level: '999', means: 'That is a ruptured ectopic until proven otherwise.', evidence: ['niceEctopic'] },
      { ask: 'After 24 weeks, have the baby’s movements changed or reduced?', level: 'duty', means: 'Reduced movements go straight to the maternity unit and never wait for a GP appointment.', evidence: ['practiceDutyDoctor'] },
    ],
  },
  {
    key: 'infection',
    label: 'Fever or possible infection',
    match: /\bfever\b|\btemperature\b|\bshiver\w*\b|\brigor\w*\b|\bchills?\b|\binfect\w*\b|\bcellulitis\b|\babscess\b|\bunwell\b/i,
    questions: [
      { ask: 'Is the patient shivering or shaking in a way they cannot control?', level: 'duty', means: 'Rigors are the sign that separates a fever from a fever worth worrying about.', evidence: ['practiceSepsis', 'niceSepsis'] },
      { ask: 'Any new confusion, slurred speech, or being harder to rouse than normal?', level: '999', means: 'Altered mental state with infection is the sepsis question the practice protocol names.', evidence: ['practiceSepsis', 'niceSepsis'] },
      { ask: 'Is the breathing fast, or the skin mottled, very pale, blue or ice cold?', level: '999', means: 'Mottled or blue skin is on the practice 999 list.', evidence: ['practiceEmergencyCalls', 'niceSepsis'] },
      { ask: 'How much urine have they passed today?', level: 'duty', means: 'Passing very little is one of the sepsis screening questions and is easy to ask over a phone.', evidence: ['niceSepsis'] },
      { ask: 'Is the patient over 75, frail, pregnant, recently had surgery, or on chemotherapy or steroids?', level: 'duty', means: 'These raise the risk of a bad outcome from any infection, so the same story means something different.', evidence: ['niceSepsis', 'practiceUrgentGuide'] },
    ],
  },
];

/* -------------------------------------------------------------------
 * Reading the request itself.
 * ----------------------------------------------------------------- */

// Duration words to days. Deliberately conservative: an hour and a day
// both round to under a day, because the only threshold that matters
// here is "has this been going on long enough to be stable".
const DURATION_UNITS = [
  [/^(?:min|minute)/i, 1 / 1440],
  [/^(?:hr|hour)/i, 1 / 24],
  [/^day/i, 1],
  [/^(?:wk|week)/i, 7],
  [/^(?:mth|month)/i, 30],
  [/^year/i, 365],
];

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, couple: 2, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, few: 3, several: 4,
};

const DURATION_RE = /\b(?:for|since|over the|in the|past|last|about|around)?\s*(\d+|a|an|one|couple(?:\s+of)?|two|three|four|five|six|seven|eight|nine|ten|few|several)\s+(minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mths?|years?)\b/gi;

// How long the patient says this has been going on, in days. Takes the
// LONGEST duration mentioned: "three days, much worse in the last hour"
// is a three-day problem with a recent change, and the change is picked
// up separately by hasRecentChange.
export function parseDurationDays(text) {
  const src = String(text || '');
  let best = null;
  DURATION_RE.lastIndex = 0;
  for (let m; (m = DURATION_RE.exec(src));) {
    const raw = m[1].toLowerCase().replace(/\s+of$/, '');
    const count = /^\d+$/.test(raw) ? parseInt(raw, 10) : NUMBER_WORDS[raw];
    if (!count) continue;
    const unit = DURATION_UNITS.find(([re]) => re.test(m[2]));
    if (!unit) continue;
    const days = count * unit[1];
    if (!best || days > best.days) best = { days, phrase: m[0].trim() };
  }
  if (best) return best;
  // The shapes people actually use that carry no number at all.
  if (/\b(?:a|one) fortnight\b/i.test(src)) return { days: 14, phrase: 'a fortnight' };
  if (/\bsince yesterday\b/i.test(src)) return { days: 1, phrase: 'since yesterday' };
  if (/\b(?:since|this) (?:this )?(?:morning|afternoon|evening)\b|\bovernight\b|\blast night\b|\btoday\b|\bjust (?:now|started)\b/i.test(src)) return { days: 0.5, phrase: 'today' };
  if (/\bsince (?:last )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bsince last week\b/i.test(src)) return { days: 7, phrase: 'since last week' };
  if (/\bfor (?:ages|months|weeks|years)\b|\bongoing\b|\blong[- ]standing\b|\bchronic\b/i.test(src)) return { days: 30, phrase: 'longstanding' };
  return null;
}

// Anything at all in the request that says today is different from
// yesterday. A week of the same thing is a routine booking; a week of
// the same thing that changed this morning is not.
export function hasRecentChange(text) {
  return /\bworse\b|\bworsen\w*\b|\bdeteriorat\w*\b|\bsudden\w*\b|\ball of a sudden\b|\bout of (?:the )?blue\b|\bflar(?:e|ed|ing)\b|\bspread\w*\b|\bnew\b|\bstarted (?:this morning|today|last night|overnight)\b|\bnever (?:been )?(?:this|so) bad\b|\bunbearable\b/i.test(String(text || ''));
}

// How long a request has to have been running, unchanged and with no
// red flag answered yes, before it stops being a duty doctor question.
// A week is the practice's own working line and the one in the request
// that prompted this: a week of stable urinary pain is a same-day
// appointment, not an interrupt.
export const SETTLED_DAYS = 7;

export function matchEmergencyWords(text) {
  const src = String(text || '');
  return EMERGENCY_WORDS.filter((e) => e.match.test(src)).map((e) => ({ label: e.label, evidence: e.evidence }));
}

// The question sets worth putting on the page for this request. Capped:
// a page of thirty questions is a page nobody works through, and the
// sets are ordered by how much of the request they actually match.
export const MAX_SETS = 3;

export function matchCheckSets(text, limit = MAX_SETS) {
  const src = String(text || '');
  const scored = [];
  for (const set of CHECK_SETS) {
    const hits = (src.match(new RegExp(set.match.source, 'gi')) || []).length;
    if (hits) scored.push({ set, hits });
  }
  scored.sort((a, b) => b.hits - a.hits || CHECK_SETS.indexOf(a.set) - CHECK_SETS.indexOf(b.set));
  return scored.slice(0, limit).map((x) => x.set);
}

function evidenceEntries(ids) {
  return (ids || []).map((id) => (EVIDENCE[id] ? Object.assign({ id }, EVIDENCE[id]) : null)).filter(Boolean);
}

/* -------------------------------------------------------------------
 * The whole card, assembled.
 *
 * Returns null when there is nothing to verify. Note what this does NOT
 * do: it never downgrades anything. It produces questions and the rules
 * for reading the answers, and the last rule is always that doubt goes
 * to the duty doctor, which is the practice's own standing instruction.
 * ----------------------------------------------------------------- */
export function urgencyCheck({ text = '', urgency = 'unclear' } = {}) {
  const emergencyHits = matchEmergencyWords(text);
  const banded = urgency === 'emergency' || urgency === 'urgent' || urgency === 'unclear';
  if (!banded && !emergencyHits.length) return null;

  const duration = parseDurationDays(text);
  const changed = hasRecentChange(text);
  const longstanding = !!duration && duration.days >= SETTLED_DAYS && !changed;

  const sets = matchCheckSets(text).map((set) => ({
    key: set.key,
    label: set.label,
    questions: set.questions.map((q) => ({
      ask: q.ask,
      means: q.means,
      level: q.level,
      levelLabel: LEVELS[q.level].label,
      tone: LEVELS[q.level].tone,
      evidence: evidenceEntries(q.evidence),
    })),
  }));

  // The three ways this ends, written as rules rather than as a verdict,
  // because reception is holding the answers and the assistant is not.
  const decision = [
    {
      when: 'Yes to any question above',
      then: 'Take it at the level that question carries. A 999 question answered yes is dialled, not messaged.',
      evidence: evidenceEntries(['practiceEmergencyCalls', 'practiceDutyDoctor']),
    },
    {
      when: 'No to all of them, and the problem is stable and has been there a week or more',
      then: 'Same-day or booked appointment, not the duty doctor. The practice guide puts symptoms that are "mild, not worsening, or have been persistent but stable" in the non-urgent box.',
      evidence: evidenceEntries(['practiceUrgentGuide']),
    },
    {
      when: 'No to all of them, but it started today, is getting worse, or the patient is very young, frail, pregnant or immunosuppressed',
      then: 'Duty doctor. A short history and a rising curve is exactly what the duty doctor is for.',
      evidence: evidenceEntries(['practiceUrgentGuide', 'practiceDutyDoctor']),
    },
  ];

  const evidence = [];
  const seen = new Set();
  const collect = (list) => { for (const e of list) { if (!seen.has(e.id)) { seen.add(e.id); evidence.push(e); } } };
  for (const hit of emergencyHits) collect(evidenceEntries(hit.evidence));
  for (const set of sets) for (const q of set.questions) collect(q.evidence);
  collect(evidenceEntries(ALWAYS_ASK.flatMap((q) => q.evidence)));
  for (const d of decision) collect(d.evidence);

  return {
    // An emergency is past verifying. The card still appears, but it
    // says so rather than offering a questionnaire to work through.
    level: emergencyHits.length || urgency === 'emergency' ? 'emergency' : 'verify',
    emergencyHits,
    cost: 'Urgent means the duty doctor is interrupted and owes this patient a call inside 2 hours, and everyone else on the list waits behind it. Appointments here are same day anyway, so the question is not "today or not", it is "does this need the duty doctor pulled off everything else".',
    always: ALWAYS_ASK.map((q) => ({ ask: q.ask, means: q.means, evidence: evidenceEntries(q.evidence) })),
    sets,
    duration: duration ? { days: duration.days, phrase: duration.phrase, longstanding } : null,
    changed,
    // Shown only when the request is genuinely an old, stable one, so it
    // reads as a note about this request rather than general advice.
    settledNote: longstanding
      ? 'The request says this has been going on ' + duration.phrase + ' with nothing said about it changing. That on its own is not a duty doctor call. Ask the questions, and if they are all no, book it.'
      : '',
    decision,
    floor: {
      text: 'Asking is not the same as downgrading. If you cannot reach the patient, cannot get answers, or are left in any doubt at all, it goes to the duty doctor. The practice guide is explicit: "If in any doubt it is better to err on the side of caution and leave a message for the duty doctor."',
      evidence: evidenceEntries(['practiceUrgentGuide']),
    },
    evidence,
  };
}
