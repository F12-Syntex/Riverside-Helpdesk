// Data Protection Impact Assessment for the Riverside Practice Q&A assistant,
// following the ICO's seven-step sample DPIA template (public/assets/
// dpia-template.docx). This is a working self-assessment that records what the
// service currently does and where the DPIA process has got to — it is NOT a
// signed-off, DPO-approved assessment. Keep the per-step `status` and the
// overall `status` honest as the service and its review progress.

export const DPIA = {
  title: 'Data Protection Impact Assessment',
  subtitle: 'Where this service stands against the ICO seven-step DPIA. A working draft for review — not yet signed off by the DPO.',
  status: 'Draft self-assessment',
  updated: '2026-06-20',
  templateUrl: 'assets/dpia-template.docx',

  controller: {
    name: 'The Riverside Practice',
    dpo: 'Practice Data Protection Officer (to confirm)',
    contact: 'Practice Manager / DPO (to confirm)',
  },

  // High-level "what the program currently is on" — one line per step.
  progress: [
    { step: 1, label: 'Identify the need', status: 'complete' },
    { step: 2, label: 'Describe the processing', status: 'complete' },
    { step: 3, label: 'Consultation', status: 'pending' },
    { step: 4, label: 'Necessity & proportionality', status: 'in-progress' },
    { step: 5, label: 'Identify & assess risks', status: 'in-progress' },
    { step: 6, label: 'Measures to reduce risk', status: 'in-progress' },
    { step: 7, label: 'Sign off & record', status: 'pending' },
  ],

  steps: [
    {
      n: 1,
      title: 'Identify the need for a DPIA',
      prompt: 'What the project aims to achieve, the processing involved, and why a DPIA is needed.',
      status: 'complete',
      body: [
        'The Riverside Practice Q&A is an internal assistant for reception and admin staff. Staff ask how to carry out front-desk and EMIS Web tasks (appointments, registrations, scanning, prescriptions, who to escalate to) and the assistant answers strictly from the practice’s own documents.',
        'A DPIA is appropriate because free-text staff queries are processed by a third-party AI provider (OpenRouter) and the indexed document library can contain limited personal data such as staff names and contact details.',
      ],
    },
    {
      n: 2,
      title: 'Describe the processing',
      prompt: 'Nature, scope, context and purpose of the processing.',
      status: 'complete',
      body: [
        'Nature: a staff member types a question. The text is sent to OpenRouter to (a) rewrite follow-ups into a standalone search query and (b) generate an embedding. It is matched against a locally-stored index of practice documents, and the relevant extracts plus the question are sent to OpenRouter’s model to compose an answer grounded only in those extracts. Questions and answers are stored only in the user’s own browser (localStorage); nothing is stored server-side.',
        'Scope: the source data is the practice’s operational documents (policies, protocols, EMIS guides), not clinical patient records — though some documents contain staff or third-party names. Query volume is low (individual staff lookups). Staff are told on screen never to enter patient information.',
        'Context: users are practice staff using the tool as an advisory aid. No automated decisions are made about any individual. The model provider acts as a processor for the query text and document extracts sent to it.',
        'Purpose: help reception staff find the correct, current practice procedure quickly and consistently, reducing errors and reliance on memory.',
      ],
    },
    {
      n: 3,
      title: 'Consultation process',
      prompt: 'How relevant stakeholders are consulted.',
      status: 'pending',
      body: [
        'Outstanding. Planned: review by the practice’s DPO and an information-security lead; staff feedback gathered during a supervised pilot. Individuals (patients) are not directly consulted as the tool is not intended to process patient data.',
      ],
    },
    {
      n: 4,
      title: 'Assess necessity and proportionality',
      prompt: 'Lawful basis, data minimisation, supporting individuals’ rights, and processor controls.',
      status: 'in-progress',
      body: [
        'Lawful basis: likely public task / legitimate interests for practice administration — to be confirmed by the DPO.',
        'Data minimisation: only the question text and the relevant document extracts are processed; no patient identifiers are required, and an on-screen warning instructs staff not to enter patient data. Answers are strictly grounded in practice documents and decline anything not covered.',
        'Processor controls: OpenRouter (and the underlying model provider) act as processors for the query content. A data-processing agreement and written confirmation of no-retention / no-training-on-data are still to be obtained and recorded.',
      ],
    },
    {
      n: 5,
      title: 'Identify and assess risks',
      prompt: 'Source of risk, potential impact, and overall rating (likelihood × severity).',
      status: 'in-progress',
      risks: [
        { risk: 'Staff inadvertently enter patient-identifiable data, which is then sent to the AI provider.', likelihood: 'Possible', severity: 'Severe', overall: 'High' },
        { risk: 'Personal data within practice documents (staff/third-party names) is sent to the model as answer context.', likelihood: 'Probable', severity: 'Significant', overall: 'Medium' },
        { risk: 'Query content is retained or used for model training by the provider.', likelihood: 'Possible', severity: 'Significant', overall: 'Medium' },
        { risk: 'An inaccurate or out-of-date answer leads to an incorrect administrative action.', likelihood: 'Possible', severity: 'Significant', overall: 'Medium' },
      ],
    },
    {
      n: 6,
      title: 'Identify measures to reduce risk',
      prompt: 'Additional measures to reduce or eliminate the medium/high risks above.',
      status: 'in-progress',
      measures: [
        { measure: 'Prominent on-screen warning: never enter patient information; ask about the process only.', effect: 'Reduced', residual: 'Medium', approved: 'In place' },
        { measure: 'Strict grounding — answers come only from practice documents and decline anything not covered.', effect: 'Reduced', residual: 'Low', approved: 'In place' },
        { measure: 'No server-side storage of questions or answers (browser localStorage only).', effect: 'Reduced', residual: 'Low', approved: 'In place' },
        { measure: 'Obtain DPA and written no-retention / no-training assurance from the AI provider.', effect: 'Reduced', residual: 'Medium', approved: 'Outstanding' },
        { measure: 'Add input screening to flag likely patient identifiers before a query is sent.', effect: 'Reduced', residual: 'Low', approved: 'Proposed' },
        { measure: 'Restrict access to practice devices / authenticated staff.', effect: 'Reduced', residual: 'Low', approved: 'Proposed' },
      ],
    },
    {
      n: 7,
      title: 'Sign off and record outcomes',
      prompt: 'Approval of measures and residual risk, DPO advice, and ongoing review.',
      status: 'pending',
      body: [
        'Outstanding. Measures approval, residual-risk approval and DPO advice have not yet been recorded. The service should not be treated as DPIA-approved until the DPO has reviewed steps 4–6, the provider assurances in step 6 are obtained, and sign-off is recorded here with names and dates.',
        'Once signed off, this DPIA should be kept under review by the DPO alongside ongoing compliance.',
      ],
    },
  ],
};
