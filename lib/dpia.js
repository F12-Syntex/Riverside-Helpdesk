// Data Protection Impact Assessment for the Riverside Practice Q&A assistant,
// following the ICO's seven-step sample DPIA template (public/assets/
// dpia-template.docx). Written in plain English so anyone can understand at a
// glance what the tool does with data and where the assessment has got to. This
// is a working self-assessment — NOT a signed-off, approved document. The
// practice does not currently have a named Data Protection Officer, so review
// and sign-off rests with the partners / practice manager. Keep every `status`
// and the `stage` line honest as the service and review progress.

export const DPIA = {
  title: 'Data protection check (DPIA)',
  subtitle: 'A plain-English summary of what this tool does with information, and how far the check has got.',
  status: 'Draft — not yet approved',
  stage: 'This check has been written but not yet reviewed or signed off by the practice (the partners / practice manager). The practice does not currently have a named Data Protection Officer.',
  updated: '2026-06-20',
  templateUrl: 'assets/dpia-template.docx',

  controller: { name: 'The Riverside Practice', responsible: 'Partners / Practice Manager' },

  // The things a reader most wants to know, in one line each.
  plain: [
    { label: 'What it does', value: 'Helps reception staff find the right practice procedure, answering only from Riverside Practice’s own documents.' },
    { label: 'What information it uses', value: 'The question you type and extracts from Riverside Practice documents. No patient records.' },
    { label: 'Answers come from', value: 'Riverside Practice documents only. The assistant never uses the AI’s general knowledge or any outside source — if it isn’t in our documents, it says so.' },
    { label: 'Where it’s stored', value: 'Nothing is kept on our servers. Your chat history stays only in your own browser.' },
    { label: 'Who it’s shared with', value: 'Only your question and the matching Riverside document extracts are sent to the AI provider (OpenRouter) to word the answer — nothing else, and no patient data.' },
    { label: 'Biggest risk', value: 'Someone typing patient details into a question, which would then be sent to the AI provider.', danger: true },
  ],

  // Safeguards already active vs. work still outstanding before sign-off.
  inPlace: [
    'Answers use Riverside Practice documents only — never the AI’s own or outside knowledge; anything not covered is declined.',
    'On-screen warning: never enter patient information — ask about the process only.',
    'Only the question and matching Riverside extracts are sent to OpenRouter; nothing else.',
    'No questions or answers are stored on our servers (browser only).',
  ],
  todo: [
    'Confirm who is responsible for data protection at the practice.',
    'Review and sign-off by the partners / practice manager.',
    'Written assurance from the AI provider that data is not kept or used for training.',
    'Optional: automatic screening to catch patient details before a question is sent.',
  ],

  // The ICO seven steps, each as a one-line status anyone can scan.
  steps: [
    { n: 1, title: 'Why a check is needed', status: 'complete', summary: 'Identified: questions go to an AI provider and documents hold some staff details.' },
    { n: 2, title: 'What happens to the data', status: 'complete', summary: 'Documented: questions are matched to Riverside documents; answers come only from them; nothing stored on our servers.' },
    { n: 3, title: 'Consultation', status: 'pending', summary: 'Outstanding: information-governance review by the practice, plus staff feedback from a pilot.' },
    { n: 4, title: 'Is it necessary and proportionate', status: 'in-progress', summary: 'Lawful basis to confirm; only minimal data used; provider data agreement still to obtain.' },
    { n: 5, title: 'The risks', status: 'in-progress', summary: 'Main risk is staff entering patient data (high); the others are rated medium.' },
    { n: 6, title: 'How risks are reduced', status: 'in-progress', summary: 'Strict grounding to Riverside documents, an on-screen warning and no server storage are in place; provider assurances still to do.' },
    { n: 7, title: 'Sign off', status: 'pending', summary: 'Not yet signed off by the practice (partners / practice manager).' },
  ],

  // Kept for the risk summary; ratings drive the colour chips.
  risks: [
    { risk: 'A staff member types patient details into a question, which is sent to the AI provider.', overall: 'High' },
    { risk: 'Staff or third-party names inside practice documents are sent to the AI as answer context.', overall: 'Medium' },
    { risk: 'The AI provider keeps the question or uses it to train its models.', overall: 'Medium' },
    { risk: 'An out-of-date answer leads to an incorrect administrative action.', overall: 'Medium' },
  ],
};
