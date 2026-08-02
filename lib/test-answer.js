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

export function isTestQuery(text) {
  return /^test$/i.test(String(text || '').trim());
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

export const TEST_ANSWER = {
  kind: 'answer',
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
        'This is body text with **bold**, *italic*, `inline code`, a ==highlight== and a keyboard key such as <kbd>F7</kbd>.',
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
