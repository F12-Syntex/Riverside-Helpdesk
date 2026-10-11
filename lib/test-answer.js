/* ------------------------------------------------------------------ *
 * The test answer.
 *
 * Typing "test" into the Q&A plays this instead of calling the model:
 * the same stream of events a real turn sends — the whole Notebook
 * read, the answer written, the answer checked — then one answer in
 * the shape app/api/agent/route.js sends it: prose with links to the
 * Notebook pages it used, and a "Sources:" line under it. A /practice
 * answer's cited sections and a critical section ride along so every
 * part of the layout can be looked at.
 *
 * It exists so the interface can be worked on without spending tokens
 * on a real answer every time. Nothing here is practice guidance: the
 * page titles and numbers are invented, and the answer says so.
 * ------------------------------------------------------------------ */

// "test" plays the researched answer. "test general" plays the other kind of
// turn — an answer that cited no page of the Notebook — so that card can be
// worked on without spending tokens either.
export function isTestQuery(text) {
  return /^test(?: general)?$/i.test(String(text || '').trim());
}

export function isGeneralTestQuery(text) {
  return /^test general$/i.test(String(text || '').trim());
}

// A fake citation. docId is deliberately not a real document, so opening one
// shows the viewer's "source unavailable" state — itself worth being able to
// look at without breaking a real answer to get there.
const cite = (docTitle, location) => ({ docId: 'test-document', docTitle, location, quote: '' });

// A fake Notebook link, in the form lib/questions/references.mjs writes one.
const page = (title) => `[${title}](/notebook/test-page)`;

// The turn's one step, as the server reports it: the Notebook read, ticking
// over `after` milliseconds later with the pages the answer cited.
export const TEST_STEPS = [
  { id: 'select', tool: 'read_notebook', label: 'Reading the Notebook', detail: 'test', after: 3000, summary: 'Test — Complaints procedure' },
];

// The working card's progress, in the shape lib/agent/notebook-progress.mjs
// sends it: an invented Notebook of 132 pages, every one of them read. `at` is
// on the same clock as the steps.
export const TEST_PROGRESS = [
  {
    at: 300,
    event: {
      type: 'progress', stage: 'notes', total: 132,
      sections: [
        { name: 'Appointments', count: 18 }, { name: 'Contacts', count: 9 }, { name: 'Prescriptions', count: 22 },
        { name: 'Reception', count: 31 }, { name: 'Referrals', count: 38 }, { name: 'Results', count: 14 },
      ],
      terms: [],
      matched: 132,
      matches: [],
    },
  },
];

// What the server says as the turn goes, at these points on the same clock.
export const TEST_STATUS = [
  { at: 0, text: 'Reading the Notebook' },
  { at: 1800, text: 'Writing the answer' },
  { at: 3200, text: 'Checking the answer' },
];

// Merged onto the pending message, so it must NOT carry `kind`: that field
// says which card renders the message ('ai'), and overwriting it sends the
// answer down the guide path, where it is looked up by id and not found.
export const TEST_ANSWER = {
  answerable: true,
  general: false,
  intro: '',
  sections: [
    {
      heading: '',
      basis: 'general',
      critical: false,
      cite: null,
      web: null,
      markdown: [
        'This is the **test answer**. It is not practice guidance — it exists so the layout can be checked without spending tokens on a real one ' + page('Test — Complaints procedure') + '.',
        '',
        '**To log a complaint**',
        '1. Open the patient record and check the demographics are the ones in front of you.',
        '2. Record it under the <mark>complaints</mark> heading, with a <kbd>F7</kbd> keyboard key for show.',
        '   - A nested note about step two',
        '3. Pass the task to the Practice Manager ' + page('Test — Reception handover notes') + '.',
        '',
        '| Stage | Who | Within |',
        '| --- | --- | --- |',
        '| Acknowledge | Reception | 3 working days |',
        '| Respond | Practice Manager | 20 working days |',
        '',
        'Sources: ' + page('Test — Complaints procedure') + ' · ' + page('Test — Reception handover notes'),
      ].join('\n'),
    },
    // What a /practice answer adds: a section quoting one document, with the
    // chip that opens it at the words.
    {
      heading: 'A cited section',
      basis: 'documents',
      critical: false,
      cite: cite('Test — Complaints policy', 'page 2'),
      web: null,
      markdown: 'A section written from one practice document, with its citation under it.',
    },
    {
      heading: 'Must not be missed',
      basis: 'documents',
      critical: true,
      cite: cite('Test — Complaints policy', 'page 5'),
      web: null,
      markdown: 'A critical block. Anything that risks patient safety, a data breach or a statutory deadline is shown this way so it cannot be skimmed past.',
    },
  ],
  references: [],
  validation: { dropped: 2 },
  citations: [],
};

/* ------------------------------------------------------------------ *
 * The general answer, played the same way.
 *
 * "test general" stands in for a turn whose answer cited no page of the
 * Notebook: the card's own marker says that not a line of it came from
 * the practice's documents.
 * ------------------------------------------------------------------ */

export const TEST_GENERAL_STEPS = [
  { id: 'select', tool: 'read_notebook', label: 'Reading the Notebook', detail: 'test general', after: 1400, summary: 'No Notebook page cited' },
];

export const TEST_GENERAL_STATUS = [
  { at: 0, text: 'Reading the Notebook' },
  { at: 800, text: 'Writing the answer' },
];

export const TEST_GENERAL_ANSWER = {
  answerable: true,
  // What puts the marker on the card.
  general: true,
  intro: '',
  sections: [
    {
      heading: '',
      basis: 'general',
      critical: false,
      cite: null,
      web: null,
      markdown: [
        'Tidied into short paragraphs, with the request and the date kept at the top.',
        '',
        '- Split one long paragraph into three, one point each.',
        '- Moved the appointment date to the first line, where it is read.',
        '',
        'Anything in **[square brackets]** is missing from what you sent and needs filling in before this goes out.',
      ].join('\n'),
    },
  ],
  references: [],
  citations: [],
  validation: { dropped: 0 },
};
