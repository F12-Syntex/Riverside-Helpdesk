// Role-based starter prompts shown on the assistant's empty (hero) state.
//
// Structure: a block per staff role, each subdivided into topic groups, each
// group holding a few ready-to-run questions. The UI renders these as quick
// "tap to ask" chips so any member of staff can fire a relevant prompt in one
// click. Questions are phrased to match the practice's own policy/procedure
// documents (the assistant only answers from those), and worded in plain NHS
// style. `icon` names map to glyphs in app/_components/ui.js Icons.
//
// Keep questions short, action-shaped and document-answerable. Avoid anything
// that needs clinical judgement about a specific patient — those are declined.

export const ROLE_PROMPTS = [
  {
    id: 'reception',
    label: 'Reception',
    sub: 'Front desk & admin',
    icon: 'calendar',
    accent: '#005eb8', // NHS blue
    groups: [
      {
        title: 'Appointments & access',
        queries: [
          'How do I book an urgent same-day appointment?',
          'How do I handle a request for a home visit?',
          'How do I register a new patient?',
        ],
      },
      {
        title: 'At the front desk',
        queries: [
          'What should I do if a patient is aggressive or abusive?',
          'How do I verify a patient’s identity?',
          'How do I handle a complaint made at the desk?',
        ],
      },
      {
        title: 'Prescriptions & records',
        queries: [
          'How are repeat prescription requests handled?',
          'How do I process a request for medical records?',
          'How do I handle a Subject Access Request?',
        ],
      },
      {
        title: 'Reporting',
        queries: [
          'How do I report a significant event?',
          'How do I report a data breach?',
        ],
      },
    ],
  },
  {
    id: 'doctors',
    label: 'Doctors',
    sub: 'Clinical & GP',
    icon: 'fileLines',
    accent: '#00A499', // NHS aqua green
    groups: [
      {
        title: 'Referrals & results',
        queries: [
          'What is the process for a two-week-wait cancer referral?',
          'How are tasks and documents workflowed in EMIS Web?',
          'How should abnormal results be actioned?',
        ],
      },
      {
        title: 'Safeguarding & risk',
        queries: [
          'What is the safeguarding referral process for a child?',
          'How do I raise a safeguarding concern for a vulnerable adult?',
          'How do I record and report a significant event?',
        ],
      },
      {
        title: 'Prescribing & medicines',
        queries: [
          'What is the policy on controlled drug prescribing?',
          'How are medication queries from a pharmacy handled?',
        ],
      },
      {
        title: 'Emergencies',
        queries: [
          'What is the practice protocol for a medical emergency?',
          'How do I summon help for a collapsed patient?',
        ],
      },
    ],
  },
  {
    id: 'nurses',
    label: 'Nurses',
    sub: 'Nursing & HCA',
    icon: 'plus',
    accent: '#AE2573', // NHS pink
    groups: [
      {
        title: 'Clinical procedures',
        queries: [
          'How is a cervical smear test carried out?',
          'What is the process for childhood immunisations?',
          'How do I run a chronic disease review?',
        ],
      },
      {
        title: 'Samples & infection control',
        queries: [
          'What is the infection control policy?',
          'How do I label and handle a specimen?',
          'What do I do after a sharps or needlestick injury?',
        ],
      },
      {
        title: 'Vaccines & cold chain',
        queries: [
          'What is the cold chain policy for vaccines?',
          'What do I do if the vaccine fridge fails?',
        ],
      },
      {
        title: 'Safeguarding',
        queries: [
          'How do I raise a safeguarding concern?',
          'How do I report a significant event?',
        ],
      },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    sub: 'Governance & ops',
    icon: 'shield',
    accent: '#330072', // NHS purple
    groups: [
      {
        title: 'Governance & compliance',
        queries: [
          'How do I complete a significant event analysis?',
          'What is the complaints procedure and its timescales?',
          'How do I report and investigate a data breach?',
        ],
      },
      {
        title: 'People & training',
        queries: [
          'What is the induction process for a new staff member?',
          'How is mandatory training recorded?',
          'What is the sickness absence policy?',
        ],
      },
      {
        title: 'Health & safety',
        queries: [
          'What is the fire safety and evacuation procedure?',
          'How do I report a health and safety incident?',
        ],
      },
      {
        title: 'CQC & policies',
        queries: [
          'How do we prepare for a CQC inspection?',
          'Where do I find the practice policies?',
        ],
      },
    ],
  },
];
