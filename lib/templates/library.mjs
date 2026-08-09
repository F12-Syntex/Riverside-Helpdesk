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

/* ------------------------------------------------------------- 1. lookups */

export function contactAnswer({ name, phone = '', email = '', hours = '', extra = '', note: n = '' }) {
  return answer({
    title: name,
    subtitle: 'Contact details',
    blocks: [
      contacts([{ label: name, tel: phone, email, note: [hours, extra].filter(Boolean).join(' · ') }]),
      n ? note(n, 'info') : null,
    ],
    source: ['Contact directory — services and departments'],
  });
}

export function abbreviationAnswer({ term, meaning, related = [] }) {
  return answer({
    title: term,
    subtitle: 'What it stands for',
    blocks: [
      fields([field(term, meaning, { key: true })]),
      related.length ? table(['Short', 'Meaning'], related) : null,
    ],
    source: ['Abbreviations — practice and referral terms', 'Glossary of service acronyms'],
  });
}

export function policyAnswer({ subject, rule, detail = [], who = '' }) {
  return answer({
    title: subject,
    subtitle: 'Practice rule',
    blocks: [
      note(rule, 'critical'),
      detail.length ? bullets(detail) : null,
      who ? note(`Confirmed by ${who}.`, 'info') : null,
    ],
    source: ['HPV vaccine eligibility'],
  });
}

export function feeAnswer({ item, fee, turnaround = '', process: proc = [], rule = '' }) {
  return answer({
    title: item,
    subtitle: 'Charge and process',
    blocks: [
      fields([
        field('Fee', fee, { key: true }),
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
      prep.length ? fields(prep.map((p) => field(p.label, p.value, { key: !!p.key }))) : null,
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
    subtitle: 'Where this goes',
    blocks: [
      fields([field('Send it to', destination, { key: true })]),
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
      prep: [{ label: 'Slot', value: 'EA Bloods Only', key: true }, { label: 'Organisation', value: 'Hackney Downs PCN' }],
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
    why: 'A long procedure with branches — the branches go behind a disclosure so the main path stays readable.',
    sample: 'How do I register a new patient?',
    render: () => answer({
      title: 'Registering a patient on EMIS',
      subtitle: 'Registration runs every Wednesday',
      blocks: [
        steps([
          'Find the registration email or the paper form, and check whether NHS details are given under **Patient Details**.',
          'On EMIS click the top-left **EMIS button → Registration → Registration**.',
          'Click **Add Patient → Regular Patient**.',
          'On the patient trace form, note the **NHS number** if it is there.',
          'Keep pressing **Next**, completing the mandatory fields, then save the registration to the record.',
          'Send the **new patient invite** (patients over 5 only), attaching a booking link for a **nurse AM appointment**.',
          'Double-click the **named GP missing** error, press OK, tick the two boxes, then **Save**.',
        ]),
        note('Anyone under 5 with an **incomplete routine schedule vacs** warning must be booked in with the nurse.', 'critical'),
        expand('The patient has no NHS number — what then?', [
          bullets([
            "**Inactive under Local Patient** — task Iqra to check and put the task on hold. Registering an inactive patient needs Iqra's approval.",
            '**Active under Local Patient** — press the patient, then **Register Patient**, and follow the same steps.',
            '**Several patients appear** — call the patient and confirm the NHS number, or their previous address. If neither can be confirmed, do not register them.',
            '**Not born in the UK** — press **Continue to create new patient** and set the NHS number to **NONE**, not a previous number.',
          ]),
        ]),
      ],
      source: ['Registering a patient on EMIS', 'Registration day'],
    }),
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
        fields([field('Normal turnaround', '1 week (5 working days)', { key: true })]),
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
    id: 'notCovered',
    group: 'Fallback',
    label: 'Nothing recorded',
    why: 'Short and honest. Padding this out is the worst thing that can be done with it.',
    sample: 'What is our repeat prescription process?',
    render: () => notCoveredAnswer({ subject: 'The repeat prescription process', ask: 'the practice manager or the pharmacy team' }),
  },
];

export const TEMPLATE_GROUPS = [...new Set(TEMPLATES.map((t) => t.group))];
