/* ------------------------------------------------------------------ *
 * The test answer.
 *
 * Typing "test" into the Q&A plays this instead of calling the model:
 * the same stream of agent steps, then one answer that uses every part
 * of the layout — key points, ordinary and critical sections, an AI
 * judgement block, a web-sourced block, a referral route, a suggested
 * message, a tip, gaps, follow-ups, contacts and citations — plus the
 * markdown the answer renderer supports.
 *
 * It exists so the interface can be worked on without spending tokens
 * on a real answer every time. Nothing here is practice guidance: the
 * document titles and numbers are invented, and the answer says so.
 * ------------------------------------------------------------------ */

import { urgencyCheck } from './triage/urgency.js';

// "test" plays the researched answer. "test general" plays the other kind of
// turn — a request the assistant carried out itself, with nothing looked up —
// so that card can be worked on without spending tokens either. "test triage"
// plays the third card, an incoming patient request being routed.
export function isTestQuery(text) {
  return /^test(?: general| triage)?$/i.test(String(text || '').trim());
}

export function isGeneralTestQuery(text) {
  return /^test general$/i.test(String(text || '').trim());
}

export function isTriageTestQuery(text) {
  return /^test triage$/i.test(String(text || '').trim());
}

// A fake citation. docId is deliberately not a real document, so opening one
// shows the viewer's "source unavailable" state — itself worth being able to
// look at without breaking a real answer to get there.
const cite = (docTitle, location) => ({ docId: 'test-document', docTitle, location, quote: '' });

// The agent's work, played one step at a time: each tool appears when it
// starts and ticks over `after` milliseconds later.
export const TEST_STEPS = [
  { id: 't1', tool: 'search_documents', label: 'Searching the practice documents', detail: 'complaints procedure', after: 700, summary: '6 passages' },
  { id: 't2', tool: 'read_document', label: 'Reading Complaints policy', detail: 'pages 2–4', after: 900, summary: 'read' },
  { id: 't3', tool: 'search_notebook', label: 'Checking the notebook', detail: 'reception handover notes', after: 700, summary: '1 note' },
  { id: 't4', tool: 'lookup_contact', label: 'Looking up a contact', detail: 'Practice Manager', after: 500, summary: '1 match' },
  { id: 't5', tool: 'web_search', label: 'Checking NHS England guidance', detail: 'complaints timescales', after: 900, summary: '2 results' },
];

// What the agent says between lookups, at these points on the same clock.
export const TEST_STATUS = [
  { at: 0, text: 'Working out what is being asked' },
  { at: 4200, text: 'Writing the answer' },
];

// Merged onto the pending message, so it must NOT carry `kind`: that field
// says which card renders the message ('ai'), and overwriting it sends the
// answer down the guide path, where it is looked up by id and not found.
export const TEST_ANSWER = {
  answerable: true,
  intro: 'This is the **test answer**. It is not practice guidance — it exists so the layout can be checked without spending tokens on a real one.',
  keyPoints: [
    { text: 'Every block below is a real part of the answer layout, filled with invented content.' },
    { text: 'A point that risks safety, a breach or a deadline is shown like this one.', critical: true },
    { text: 'Numbers and document titles here are made up. Do not act on them.' },
  ],
  sections: [
    {
      heading: 'An ordinary section',
      basis: 'documents',
      cite: cite('Test — Complaints policy', 'page 2'),
      markdown: [
        'This is body text with **bold**, *italic*, `inline code`, a keyboard key such as <kbd>F7</kbd>, and the one <mark>highlighted phrase</mark> that answers the question.',
        '',
        '### A sub-heading',
        '',
        'A short paragraph under it, long enough to wrap onto a second line so line height and measure can be judged properly rather than guessed at.',
        '',
        '- A bulleted point',
        '- Another one, with a [link](https://www.nhs.uk) in it',
        '  - And a nested point beneath',
        '',
        '> A quoted passage, as it would be lifted from a document.',
      ].join('\n'),
    },
    {
      heading: 'A procedure',
      basis: 'documents',
      cite: cite('Test — Reception handbook', 'page 11'),
      markdown: [
        '1. Open the patient record and check the demographics are the ones in front of you.',
        '2. Record the request under the correct heading.',
        '   - A nested note about step two',
        '   - A second nested note',
        '3. Pass the task to the duty clinician.',
        '4. Tell the patient when to expect a reply.',
      ].join('\n'),
    },
    {
      heading: 'A table',
      basis: 'documents',
      cite: cite('Test — Timescales', 'appendix A'),
      markdown: [
        '| Stage | Who | Within |',
        '| --- | --- | --- |',
        '| Acknowledge | Reception | 3 working days |',
        '| Investigate | Practice Manager | 10 working days |',
        '| Respond | Partner | 20 working days |',
      ].join('\n'),
    },
    {
      heading: 'Must not be missed',
      basis: 'documents',
      critical: true,
      cite: cite('Test — Complaints policy', 'page 5'),
      markdown: 'A critical block. Anything that risks patient safety, a data breach or a statutory deadline is shown this way so it cannot be skimmed past.',
    },
    {
      heading: 'Where the documents stop',
      basis: 'judgement',
      markdown: 'An AI judgement block: written from the assistant’s own reasoning rather than the practice’s material, and marked so it is never mistaken for policy.',
    },
    {
      heading: 'From outside the practice',
      basis: 'web',
      web: { title: 'NHS England — complaints guidance', url: 'https://www.england.nhs.uk/' },
      markdown: 'A web-sourced block. It links out, is marked as coming from the internet, and is never shown as practice policy.',
    },
  ],
  referralRoute: {
    requestType: 'Referral',
    priority: '2WW',
    specialty: 'Test — Dermatology',
    clinicType: 'Skin lesion',
    clinicTypeOptions: ['Skin lesion', 'Skin cancer (2WW)'],
    clinicTypeCondition: 'Only when the doctor has asked for the two-week-wait pathway.',
  },
  message: 'Dear patient,\n\nThank you for contacting the practice. Your complaint has been logged and the Practice Manager will reply within 10 working days.\n\nKind regards,\nThe Riverside Practice',
  messageCite: cite('Test — Complaints policy', 'page 6'),
  tip: 'A tip block, for the thing everyone forgets on the second attempt.',
  gaps: 'What the practice’s own material does not cover is said here, plainly, instead of being filled in with a guess.',
  followUps: [
    'How do I log a complaint on EMIS?',
    'Who is the Caldicott Guardian?',
  ],
  validation: { dropped: 2 },
  // Asking back. In a real answer this appears INSTEAD of the body, when the
  // question has more than one documented answer; here it rides along so the
  // box can be looked at without waiting for an ambiguous question.
  clarify: {
    question: 'Which complaint are you handling?',
    options: ['A patient complaint', 'A complaint about another practice', 'A staff concern'],
  },
  contacts: [
    {
      label: 'Test — Practice Manager',
      note: 'Complaints and staffing',
      phones: [{ display: '020 7000 0001', tel: '02070000001' }],
      emails: ['test.manager@example.nhs.uk'],
    },
    {
      label: 'Test — Reception desk',
      phones: [{ display: '020 7000 0002', tel: '02070000002' }],
      emails: [],
    },
  ],
  citations: [],
};

/* ------------------------------------------------------------------ *
 * The general request, played the same way.
 *
 * "test general" stands in for a turn where nothing was looked up: the
 * research loop recognised a request to carry out — format this email,
 * shorten this message — and the answer was written straight from the
 * message. One tool step, no citations, and the card's own marker
 * saying that not a line of it came from the practice's documents.
 * ------------------------------------------------------------------ */

export const TEST_GENERAL_STEPS = [
  { id: 'g1', tool: 'general_request', label: 'Doing this directly', detail: 'reformat a pasted email', after: 600, summary: 'nothing to look up' },
];

export const TEST_GENERAL_STATUS = [
  { at: 0, text: 'Working out what is being asked' },
  { at: 800, text: 'Doing this directly' },
];

export const TEST_GENERAL_ANSWER = {
  answerable: true,
  // What puts the marker on the card and keeps the answer out of the cache.
  general: true,
  intro: 'Tidied into short paragraphs, with the request and the date kept at the top.',
  keyPoints: [],
  sections: [
    {
      heading: 'What changed',
      basis: 'general',
      markdown: [
        '- Split one long paragraph into three, one point each.',
        '- Moved the appointment date to the first line, where it is read.',
        '- Cut the repeated apology and the closing paragraph that said nothing.',
        '',
        'Anything in **[square brackets]** is missing from what you sent and needs filling in before this goes out.',
      ].join('\n'),
    },
  ],
  message: [
    'Dear [name],',
    '',
    'Your appointment is on [date] at [time] with the practice nurse.',
    '',
    'Please bring a list of your current medication, and let us know as early as you can if you cannot make it so the slot can go to someone else.',
    '',
    'Kind regards,',
    'The Riverside Practice',
  ].join('\n'),
  tip: 'Read it back before sending — the assistant cannot see who this is going to.',
  gaps: '',
  followUps: ['Make this shorter', 'Rewrite it for a text message'],
  referralRoute: null,
  clarify: null,
  contacts: [],
  citations: [],
  validation: { dropped: 0 },
};

/* ------------------------------------------------------------------ *
 * The triage card, played the same way.
 *
 * "test triage" stands in for an incoming patient request being routed.
 * The request it plays is deliberately the awkward one: a week of
 * urinary pain, which sounds urgent, reads as urgent, and is not — the
 * card has to show reception how to tell.
 *
 * The verification block is NOT a fixture. It is built by calling the
 * same urgencyCheck() the server calls, on the same request text, so
 * what is on screen here is exactly what a real answer would show and
 * the demo cannot drift away from the real thing.
 * ------------------------------------------------------------------ */

export const TEST_TRIAGE_REQUEST = [
  'Describe the problem: burning when I pass water and I need to go all the time.',
  'How long has it been going on: about a week now.',
  'Have you tried anything: drinking more water and some sachets from the chemist.',
  'Is there anything you are worried about: I would like something for it today please, it is urgent.',
].join('\n');

export const TEST_TRIAGE_STEPS = [
  { id: 'r1', tool: 'search_documents', label: 'Reading the triage protocols', detail: 'urgent and emergency appointments', after: 800, summary: '4 passages' },
  { id: 'r2', tool: 'search_documents', label: 'Checking the duty doctor protocol', detail: 'response times', after: 700, summary: '2 passages' },
];

export const TEST_TRIAGE_STATUS = [
  { at: 0, text: 'Working out what is being asked' },
  { at: 1100, text: 'Routing the request' },
];

export const TEST_TRIAGE_ANSWER = {
  answerKind: 'triage',
  // Banded urgent because the patient asked for it to be, which is exactly
  // the band this card exists to test rather than take on trust.
  urgency: 'urgent',
  urgencyReason: 'The patient has asked to be seen today and called it urgent. Nothing in the request says it is worsening and no red flag is stated, so verify before this takes a duty doctor slot.',
  summary: 'Patient reports a week of burning and frequency passing urine, and is asking to be seen today.',
  actions: [
    { text: 'Ask the verification questions below before deciding, and write the answers into the record.', basis: 'judgement' },
    { text: 'If they are all no, book a same-day appointment rather than adding a pink duty doctor slot.', basis: 'judgement' },
    { text: 'Tell the patient to call back if any of the answers change, especially blood, fever or back pain.', basis: 'judgement' },
  ],
  redFlags: [
    { text: 'Blood in the urine, pain over the kidneys, shivering, being sick, or new confusion.', basis: 'judgement' },
  ],
  route: 'Same-day appointment list (test fixture, not real routing)',
  patientMessage: 'Thank you for contacting the practice. We will call you today. If you notice blood in your urine, a temperature, shivering, or pain in your back or side before then, please ring us straight away.',
  patientMessageCite: null,
  citations: [],
  contacts: [
    {
      label: 'Test — Duty doctor bypass line',
      note: 'Health and social care professionals only',
      phones: [{ display: '020 7000 0003', tel: '02070000003' }],
      emails: [],
    },
    {
      label: 'Test — Medical records',
      note: 'No telephone line, email only',
      phones: [],
      emails: ['test.medicalrecords@example.nhs.uk'],
    },
  ],
  // Built, not written: the same function the server runs, on the text above.
  urgencyCheck: urgencyCheck({ text: TEST_TRIAGE_REQUEST, urgency: 'urgent' }),
};
