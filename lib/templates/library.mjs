// Every non-referral answer template, and the registry the debug page reads.
//
// One template per category of question the notebook can actually answer (the
// categories were derived from a pass over all 95 pages). Each is a pure
// function from a small input to a block list: no model call, no retrieval, no
// branching beyond what the input decides.
//
// The split that matters is LOOKUP versus PROCEDURE. About 40 of the notebook's
// 95 pages answer with a fact — a pairing, a number, a fee, what an
// abbreviation means — and those want a fields or table block and nothing else.
// The rest answer with an ordered list of actions. Mixing the two is what made
// the old answers long: a lookup wrapped in six paragraphs of process.
import { answer, bullets, contacts, expand, field, fields, note, steps, table } from './blocks.mjs';
import { REFERRAL_SERVICES, referralAnswer, referralTemplates } from './referrals.mjs';
import { appointmentReasonAnswer, documentCodingAnswer } from './writing.mjs';
import { pharmacyFirstAnswer, pharmacyReferralAnswer } from './pharmacy.mjs';
import { minorEyeServiceAnswer, triagePatientAnswer } from './triage.mjs';
import { fcpAnswer } from './fcp.mjs';
import { registrationAnswer } from './registration.mjs';

/* ------------------------------------------------------------- 1. lookups */

// The card is already titled with the service, so the contact block carries no
// label of its own — naming it twice was the same words twice on one small
// card. The number is the answer, so it is the biggest thing here.
export function contactAnswer({ name, phone = '', email = '', hours = '', extra = '', note: n = '' }) {
  return answer({
    title: name,
    blocks: [
      contacts([{ label: '', tel: phone, email, note: [hours, extra].filter(Boolean).join(' · ') }]),
      n ? note(n, 'info') : null,
    ],
    source: ['Contact directory — services and departments'],
  });
}

// Title is the term, so the row does not repeat it. Related terms are the
// definition of information nobody asked for, so they sit behind a disclosure.
export function abbreviationAnswer({ term, meaning, related = [] }) {
  return answer({
    title: term,
    blocks: [
      fields([field('Means', meaning)]),
      related.length ? expand('Related abbreviations', [table(['Short', 'Meaning'], related)]) : null,
    ],
    source: ['Abbreviations — practice and referral terms', 'Glossary of service acronyms'],
  });
}

export function policyAnswer({ subject, rule, detail = [], who = '' }) {
  return answer({
    title: subject,
    blocks: [
      note(rule, 'critical'),
      detail.length ? bullets(detail) : null,
      who ? expand('Where this came from', [bullets([`Confirmed by ${who}.`])]) : null,
    ],
    source: ['HPV vaccine eligibility'],
  });
}

export function feeAnswer({ item, fee, turnaround = '', process: proc = [], rule = '' }) {
  return answer({
    title: item,
    blocks: [
      fields([
        field('Fee', fee),
        turnaround ? field('Turnaround', turnaround) : null,
      ]),
      rule ? note(rule, 'critical') : null,
      proc.length ? steps(proc) : null,
    ],
    source: ['Private letters (non-NHS work)', 'Medical reports and records requests'],
  });
}

/* ---------------------------------------------------------- 2. procedures */

export function procedureAnswer({ task, where = '', steps: list, warnings = [], tip = '', source = [] }) {
  return answer({
    title: task,
    subtitle: where,
    blocks: [
      ...warnings.map((w) => note(w, 'warn')),
      steps(list),
      tip ? note(tip, 'info') : null,
    ],
    source,
  });
}

export function bookingAnswer({ what, route, steps: list, prep = [], rules = [] }) {
  return answer({
    title: what,
    subtitle: route,
    blocks: [
      prep.length ? fields(prep.map((p) => field(p.label, p.value)), 'Book this') : null,
      rules.length ? note(rules[0], 'warn') : null,
      steps(list),
      rules.length > 1 ? bullets(rules.slice(1)) : null,
    ],
    source: ['Appointment types and booking rules'],
  });
}

export function documentAnswer({ kind, action, steps: list, titleRule = '', warnings = [] }) {
  return answer({
    title: kind,
    subtitle: action,
    blocks: [
      titleRule ? note(titleRule, 'info') : null,
      ...warnings.map((w) => note(w, 'warn')),
      steps(list),
    ],
    source: ['Titling clinic and clinical letters', 'Filing incoming documents'],
  });
}

export function triageAnswer({ request, destination, why = '', actions = [] }) {
  return answer({
    title: request,
    blocks: [
      fields([field('Send it to', destination)]),
      why ? note(why, 'info') : null,
      actions.length ? bullets(actions) : null,
    ],
    source: ['Triage guidelines — pharmacy requests and blood forms'],
  });
}

export function notCoveredAnswer({ subject, ask: askWho = 'the practice manager' }) {
  return answer({
    title: subject,
    subtitle: 'Not in the practice’s notes',
    blocks: [
      note(`The practice’s notes do not cover ${subject.toLowerCase()}.`, 'warn'),
      bullets([`Ask ${askWho}.`, 'Once someone answers it, add a page for it so the next person does not have to ask.']),
    ],
    source: [],
  });
}

/* ------------------------------------------------------------ 3. registry */
// What the debug page walks. `sample` is a real question, so the page shows
// each template as staff would actually see it.

const emailSvc = REFERRAL_SERVICES.find((s) => s.name === 'Social prescriber');
const ersSvc = REFERRAL_SERVICES.find((s) => s.name.startsWith('Rapid Access'));
const ersGap = REFERRAL_SERVICES.find((s) => s.name === 'Sleep apnoea');
const cancerSvc = REFERRAL_SERVICES.find((s) => s.cancer);

export const TEMPLATES = [
  {
    id: 'referral.process',
    group: 'Referrals',
    label: 'e-RS referral — no service named',
    why: 'The flow is identical every time, so "how do referrals work" has a real answer. The two boxes are left open and said to be open.',
    sample: 'How do I do an e-RS referral?',
    render: () => referralTemplates.referralProcessAnswer(),
  },
  {
    id: 'referral.ers',
    group: 'Referrals',
    label: 'e-RS referral — pairing recorded',
    why: 'The standard flow, with the two fields that change between referrals as the headline.',
    sample: 'How do I refer for a rapid access chest pain clinic?',
    render: () => referralTemplates.ersReferral(ersSvc),
  },
  {
    id: 'referral.ers.gap',
    group: 'Referrals',
    label: 'e-RS referral — pairing NOT recorded',
    why: 'Same flow, but the two boxes say so rather than showing a guess.',
    sample: 'How do I refer someone for sleep apnoea?',
    render: () => referralTemplates.ersReferral(ersGap),
  },
  {
    id: 'referral.ers.cancer',
    group: 'Referrals',
    label: 'e-RS referral — 2WW cancer',
    why: 'Priority is 2WW, never Routine, and that is the loudest thing on the card.',
    sample: 'Two week wait referral for suspected skin cancer',
    render: () => referralTemplates.ersReferral(cancerSvc),
  },
  {
    id: 'referral.email',
    group: 'Referrals',
    label: 'Email referral',
    why: 'No e-RS anywhere in the answer — showing both routes is how one referral gets sent twice.',
    sample: 'How do I refer to the social prescriber?',
    render: () => referralTemplates.emailReferral(emailSvc),
  },
  {
    id: 'referral.unknown',
    group: 'Referrals',
    label: 'Referral we have nothing on',
    why: 'The honest answer. Not the standard steps with two blanks at the top.',
    sample: 'How do I refer to the Royal Free vascular clinic?',
    render: () => referralAnswer({ question: 'Royal Free vascular clinic' }),
  },

  {
    id: 'contact',
    group: 'Lookups',
    label: 'Contact lookup',
    why: 'Structured, so a number is never retyped by a model into prose.',
    sample: 'What is the number for Language Line?',
    render: () => contactAnswer({ name: 'Language Line', phone: '0203 376 8185', extra: 'Access code 77390273' }),
  },
  {
    id: 'abbreviation',
    group: 'Lookups',
    label: 'Abbreviation lookup',
    why: 'One fact. No preamble, no process.',
    sample: 'What does NDH mean?',
    render: () => abbreviationAnswer({
      term: 'NDH',
      meaning: 'Non-diabetic hyperglycaemia — the "at-risk review"',
      related: [['DSN', 'Diabetic Specialist Nurse'], ['T2DM', 'Type 2 Diabetes'], ['HbA1c', 'Haemoglobin A1c']],
    }),
  },
  {
    id: 'fee',
    group: 'Lookups',
    label: 'Fee and non-NHS work',
    why: 'The number first, the payment rule as a hard warning.',
    sample: 'How much is a private letter?',
    render: () => feeAnswer({
      item: 'Private letter (non-NHS work)',
      fee: 'From £20',
      turnaround: 'The doctor reviews the request first',
      rule: 'Take payment only after the doctor has approved the request — never before.',
      process: [
        'Patient submits the request. Online → task Dr Goel. Paper form → put it in the tray with a note requesting authorisation.',
        'Once authorised, send an email to make payment.',
        'When the patient attends, give them a receipt from the invoice book in the drawer.',
        "Put the money in an envelope with the invoice attached, in Dr Goel's tray.",
        'Add a note on Consultations: "Payment received for private letter."',
      ],
    }),
  },
  {
    id: 'policy',
    group: 'Lookups',
    label: 'Policy / eligibility',
    why: 'A rule someone could get wrong, stated once and loudly.',
    sample: 'Can we give the HPV vaccine to a 26 year old?',
    render: () => policyAnswer({
      subject: 'HPV vaccine eligibility',
      rule: 'Our nurse can give the HPV vaccine only to patients **24 years and under**.',
      detail: ['Patients aged 25 and over must access it independently.'],
      who: 'Nurse MJ, 27/09/2024',
    }),
  },

  {
    id: 'booking',
    group: 'Procedures',
    label: 'Appointment booking',
    why: 'Prep requirements above the steps, because getting those wrong wastes the appointment.',
    sample: 'How do I book a blood test?',
    render: () => bookingAnswer({
      what: 'Booking a blood test',
      route: 'Cross-organisation slot',
      prep: [{ label: 'Slot', value: 'EA Bloods Only' }, { label: 'Organisation', value: 'Hackney Downs PCN' }],
      rules: ['Health-check bloods must be taken before 1 pm.'],
      steps: ['Press **Find Slot**.', 'Choose **Find across organisation slot**.', 'Choose **Hackney Downs PCN**.', 'Choose **EA Bloods Only** and book the patient.'],
    }),
  },
  {
    id: 'procedure',
    group: 'Procedures',
    label: 'EMIS how-to',
    why: 'The generic shape for any "how do I do X in EMIS" question.',
    sample: 'How do I scan a document?',
    render: () => procedureAnswer({
      task: 'Scanning documents',
      where: 'EMIS Web',
      warnings: ['Check the documents scanned correctly in the source files before saving.'],
      steps: [
        'Put the paper documents into the **yellow scanner**.',
        'On EMIS go to **Scanning documents** and click **Scan**.',
        'Set the document type — usually **Clinical notes** or **Administrative documents**.',
        'Select the scanned files and click **Add to section**.',
        "On the patient's record, click **Save in active record**. If you are not on their record, click **Save in new record**.",
      ],
      tip: 'A workflow task is only for Dr Goel. Anything for anyone else goes as a normal task.',
      source: ['Scanning documents', 'Scanning — which task type to raise'],
    }),
  },
  {
    id: 'document',
    group: 'Procedures',
    label: 'Incoming document',
    why: 'The title is the deliverable, so the titling rule sits above the steps.',
    sample: 'How do I file a clinic letter?',
    render: () => documentAnswer({
      kind: 'Clinic and clinical letters',
      action: 'Titling and filing',
      titleRule: 'Title format: **date first**, then hospital and department, then what is useful — last review date, follow-up date, any medication change.',
      warnings: ['Read it through for actions for the GP. If there are none, complete the task.'],
      steps: [
        'Open the document and **keep the type the same**.',
        'Change the **date** to the date of the clinic letter.',
        'Add the **hospital and department** (RLH = Royal London Hospital). If no hospital is named, just the department.',
        'Add the date the patient was **last reviewed**, plus follow-up date or medication change if there was one.',
      ],
    }),
  },
  {
    id: 'triage',
    group: 'Procedures',
    label: 'Triage / signposting',
    why: 'The destination is the whole answer, so nothing sits above it.',
    sample: 'A patient is asking about their medication — where does that go?',
    render: () => triageAnswer({
      request: 'Pharmacy and medication requests',
      destination: 'The pharmacy team',
      why: 'All pharmacy-related requests are always sent to the pharmacy team.',
      actions: ['We cannot issue medication without a prescription request — especially controlled drugs.', 'Allow about 3 working days.'],
    }),
  },
  {
    id: 'registration',
    group: 'Procedures',
    label: 'Registration',
    why: 'A long procedure whose length is really four branches. The path up to the trace form and the finishing steps are the same every time, so they are always shown; the branches sit behind one disclosure. The under-5 vaccination warning is above everything, because it is the only line here about a person rather than a screen.',
    sample: 'How do I register a new patient?',
    render: () => registrationAnswer({}),
  },
  {
    id: 'registration.scenario',
    group: 'Procedures',
    label: 'Registration — one scenario named',
    why: 'When the message says which situation it is, that branch comes to the front and the other three go behind the disclosure. Same card, same words, one less thing to read past with a patient waiting.',
    sample: 'Registering someone but they show as inactive under local patient',
    render: () => registrationAnswer({ scenario: 'inactive' }),
  },
  {
    id: 'clinic',
    group: 'Procedures',
    label: 'Nurse / HCA clinic',
    why: 'Which day, and what has to happen first — the two things that get it wrong.',
    sample: 'What does the nurse do, and which days?',
    render: () => answer({
      title: 'Nurse and HCA services',
      subtitle: 'Nurses work Mondays, Wednesdays and Fridays',
      blocks: [
        bullets([
          'Travel and childhood vaccinations',
          'Asthma, diabetes, at-risk, mental health and learning disability reviews',
          'NHS and new patient health checks',
          'Smear tests, swabs, ear checks, blood pressure, dressings',
        ]),
        note('These reviews need a **blood test first**: diabetes, at-risk, mental health, learning disability, NHS health checks, new patient health checks.', 'warn'),
        note('Travel vaccinations need **6 weeks** notice. Health-check bloods must be taken **before 1 pm**.', 'critical'),
      ],
      source: ['Nurse and HCA services, and which days', 'Reviews that need a blood test first'],
    }),
  },
  {
    id: 'results',
    group: 'Procedures',
    label: 'Results enquiry',
    why: 'A branch on one fact — have they come back — so it is two short paths, not a paragraph.',
    sample: 'A patient is chasing their blood results',
    render: () => answer({
      title: 'Blood results',
      subtitle: 'Patient chasing results',
      blocks: [
        fields([field('Normal turnaround', '1 week (5 working days)')]),
        steps([
          'Check **Diary → Awaiting sample**.',
          'If it is not there, check **Investigations → Patient report list → Completed**, duration **All**.',
        ]),
        note('**If the results are back** — task the doctor to review them, then arrange a call with the patient.', 'info'),
        note('**If it has been more than 5 working days** — apologise for the delay and contact the labs to chase.', 'warn'),
      ],
      source: ['Blood results at the front desk', 'Chasing blood test results (triage)'],
    }),
  },
  {
    id: 'documentCoding',
    group: 'Writing',
    label: 'Document coding',
    why: 'House style for the filing title. The examples are built by the same function that builds a real title, so they cannot drift from the rule.',
    sample: 'How do I title a discharge letter?',
    render: () => documentCodingAnswer(),
  },
  {
    id: 'appointmentReason',
    group: 'Writing',
    label: 'Appointment reason',
    why: 'Turning what a patient wrote into the one line a clinician reads.',
    sample: 'How should I write the reason for the appointment?',
    render: () => appointmentReasonAnswer(),
  },

  {
    id: 'triage.pharmacy',
    group: 'Procedures',
    label: 'Triage — where does this patient go?',
    why: 'The destination is the answer, so nothing sits above it. Checks red flags first, then the eye service, then Pharmacy First.',
    sample: 'pt has mild discomfort in their eyes, slightly reddish with some discharge',
    render: () => triagePatientAnswer({ condition: 'mild discomfort in their eyes, slightly reddish with some discharge' }),
  },
  {
    id: 'triage.redFlag',
    group: 'Procedures',
    label: 'Triage — red flag',
    why: 'Nothing later in the order can override this. A pharmacy answer here would look exactly as confident as a correct one.',
    sample: 'patient has a red eye and says their vision has gone blurry',
    render: () => triagePatientAnswer({ condition: 'red eye and blurred vision' }),
  },
  {
    id: 'minorEyeService',
    group: 'Procedures',
    label: 'Minor eye service — message to the patient',
    why: 'The patient rings the optician themselves, so the message IS the answer — with its own Copy, because retyping it is the one thing nobody should have to do.',
    sample: 'Send this patient to Rose Opticians for their eye',
    render: () => minorEyeServiceAnswer({ condition: 'Red, sticky eye' }),
  },
  {
    id: 'pharmacyReferral',
    group: 'Procedures',
    label: 'Pharmacy First — making the referral',
    why: 'Deciding and doing are different moments. This is the doing.',
    sample: 'How do I send a Pharmacy First referral?',
    render: () => pharmacyReferralAnswer(),
  },
  {
    id: 'pharmacyFirst',
    group: 'Procedures',
    label: 'Pharmacy First — clinical pathway',
    why: 'The age range is the gateway, so it is the loudest thing on the card: outside it the pharmacist cannot treat.',
    sample: 'Can I send a patient with a sore throat to the pharmacy?',
    render: () => pharmacyFirstAnswer({ condition: 'sore throat' }),
  },
  {
    id: 'fcp',
    group: 'Procedures',
    label: 'FCP — musculoskeletal appointment',
    why: 'Back and joint pain is on the Pharmacy First lists, so it used to stop there. The features decide instead: nerve-root symptoms, failed self-care, severity or a request for physio all make it an FCP appointment. The cauda equina questions sit above the booking steps, not below them.',
    sample: 'Severe lower back pain since a workout, radiating down the left leg with tingling and numbness in the thigh. Maximum dose ibuprofen has not touched it and she cannot sleep. Asking for an FCP appointment.',
    render: () => fcpAnswer({
      condition: 'lower back pain radiating into the left leg',
      text: 'Severe lower back pain since a workout, radiating down the left leg with tingling and numbness in the thigh. Maximum dose ibuprofen has not touched it and she cannot sleep. Asking for an FCP appointment.',
    }),
  },
  {
    id: 'fcp.caudaEquina',
    group: 'Procedures',
    label: 'FCP — cauda equina',
    why: 'The one spinal presentation measured in hours. Nothing below it in the order can take it back, and the card gives no destination except a clinician now.',
    sample: 'Back pain going into both legs, numb around the groin and cannot tell when passing urine',
    render: () => fcpAnswer({
      condition: 'back pain with saddle numbness',
      text: 'Back pain going into both legs, numb around the groin and cannot tell when passing urine',
    }),
  },
  {
    id: 'pharmacyFirst.overview',
    group: 'Procedures',
    label: 'Pharmacy First — what it takes',
    why: 'Asked with no condition named, the answer is the lists rather than a shrug.',
    sample: 'What can we send to Pharmacy First?',
    render: () => pharmacyFirstAnswer({}),
  },

  {
    id: 'notCovered',
    group: 'Fallback',
    label: 'Nothing recorded',
    why: 'Short and honest. Padding this out is the worst thing that can be done with it.',
    sample: 'What is our repeat prescription process?',
    render: () => notCoveredAnswer({ subject: 'The repeat prescription process', ask: 'the practice manager or the pharmacy team' }),
  },
];

export const TEMPLATE_GROUPS = [...new Set(TEMPLATES.map((t) => t.group))];
