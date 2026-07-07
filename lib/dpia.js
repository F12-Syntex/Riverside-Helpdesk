// Data Protection Impact Assessment for the whole Riverside Helpdesk program —
// the internal staff tool suite for The Riverside Practice (the Practice Q&A
// assistant, the document knowledge base and the practice Notebook; the staff
// rota generator and medication check are currently withdrawn from the tool
// index). It follows the ICO's sample DPIA template
// (public/assets/dpia-template.docx):
// submitting controller details, then the seven steps, with the template's own
// guidance kept verbatim next to the practice's plain-English answers.
//
// This is a working self-assessment — NOT a signed-off, approved document. The
// practice does not currently have a named Data Protection Officer, so review
// and sign-off rests with the partners / practice manager. Keep every answer,
// the risk ratings and the sign-off table honest as the service and review
// progress.

export const DPIA = {
  title: 'Data protection impact assessment',
  program: 'Riverside Helpdesk',
  subtitle: 'The internal staff tool suite for The Riverside Practice — the Practice Q&A assistant, the document knowledge base and the practice Notebook. (A staff rota generator and a medication check tool were built but are currently withdrawn from the tool index.)',
  status: 'Draft — not yet approved',
  stage: 'This assessment has been written but not yet reviewed or signed off by the practice.',
  updated: '2026-07-04',
  templateUrl: 'assets/dpia-template.docx',

  // The note that heads the ICO template, kept so the page reads like the form.
  preamble:
    'This template records the practice’s DPIA process and outcome for the Riverside Helpdesk program. It follows the process set out in the ICO’s DPIA guidance and should be read alongside it.',

  // "Submitting controller details" — the boxed table at the top of the template.
  controller: {
    name: 'The Riverside Practice',
    dpoTitle: 'No named Data Protection Officer appointed',
    contact: 'Partners / Practice Manager (review and sign-off)',
  },

  // The seven ICO steps. `guidance` is the template's own prompt (shown in grey
  // italic, like the form); `body` is the practice's answer. `status` drives the
  // progress dot/badge. Steps 5–7 also carry the template's tables below.
  steps: [
    {
      n: 1,
      title: 'Identify the need for a DPIA',
      status: 'complete',
      guidance: 'Explain broadly what the project aims to achieve and what type of processing it involves. Summarise why you identified the need for a DPIA.',
      body: [
        'Riverside Helpdesk is an internal web app giving practice staff three tools: a Practice Q&A assistant that answers questions about how the practice works using only the practice’s own documents and notes; a browsable knowledge base of those documents; and a Notebook where staff write practice notes and instructions that the assistant then uses automatically as citable context.',
        'Two further tools were built but are currently withdrawn from the staff tool index: a staff rota generator and a medication information check. Their pages are hidden from the index and menus; data already stored for them (staff names and working patterns for the rota; a cache of public medicine information) remains held server-side and is covered by this assessment until deleted.',
        'A DPIA is needed because the Q&A assistant sends free-text staff questions, matching document extracts and notebook notes to a third-party AI provider (OpenRouter) to word each answer; notebook notes are stored in the practice’s database and also sent to the provider to compute search embeddings; the documents and notes can hold staff (and sometimes third-party) names; and there is a foreseeable risk that a staff member could type patient details into a question or a note. Using a new AI technology to process personal data is itself a trigger for a DPIA.',
      ],
    },
    {
      n: 2,
      title: 'Describe the processing',
      status: 'complete',
      guidance: 'Describe the nature, scope, context and purposes of the processing.',
      body: [
        'Nature: Staff type a question (Q&A) or write notes (Notebook) in the browser. For the Q&A assistant the question and a small set of matching extracts from the practice’s own documents and notebook notes are sent to OpenRouter, routed only to providers contractually set not to retain or train on the data, which returns the wording of the answer. Chat history stays in the user’s own browser. Notebook notes and their attachments are stored server-side in the practice’s database (Neon, a managed Postgres service, with files in Vercel Blob); note text is also sent to OpenRouter — pinned to a zero-retention provider — to compute the embeddings used for search, and an optional AI-format feature sends the open note’s text the same way to propose tidier formatting, which the user must confirm. The knowledge base is read-only; source documents are held server-side as the search index used to answer questions.',
        'Scope: The data is staff-facing operational information — questions, practice notes, and the contents of practice policies and protocols, some of which name staff or third parties. The withdrawn rota tool’s data (staff names, roles, working patterns and leave) remains stored in the same database; the withdrawn medication tool stores only public medicine information keyed by medicine name. No patient records are intentionally processed, and no special category or criminal-offence data is sought. Volumes are small (one practice, tens of staff); questions are not retained by the practice, while notes are kept until staff delete them.',
        'Context: Users are the practice’s own staff using a tool provided for their work; they would expect this use. The technology (a large language model accessed through a provider) is novel for the practice, which is why grounding, a no-patient-data warning and zero-retention routing are built in. No children or patients use the tool.',
        'Purposes: To help staff find the correct practice procedure quickly and consistently, and to keep the practice’s working knowledge in one place that the assistant can use — improving accuracy and saving time, with no intended effect on any patient’s data.',
      ],
    },
    {
      n: 3,
      title: 'Consultation process',
      status: 'pending',
      guidance: 'Consider how to consult relevant stakeholders — staff, processors, and security or other experts — or justify why consultation is not appropriate.',
      body: [
        'Outstanding: an information-governance review by the partners / practice manager, and structured feedback from a staff pilot. Written confirmation of data handling is to be obtained from the AI provider (OpenRouter). Patients are not consulted because no patient data is intended to be processed; this assumption is itself one of the risks reviewed below.',
      ],
    },
    {
      n: 4,
      title: 'Assess necessity and proportionality',
      status: 'in-progress',
      guidance: 'Describe compliance and proportionality measures: your lawful basis, whether the processing achieves the purpose, data minimisation, function creep, individuals’ rights, processor compliance and international transfers.',
      body: [
        'Lawful basis to be confirmed by the practice: for staff data, the basis is expected to be the practice’s legitimate interest in running an efficient service / performance of the employment relationship. The processing achieves the purpose and only minimal data is used — for the Q&A assistant, just the question plus the matching extracts, never the whole knowledge base. Function creep is limited by strict grounding (answers come only from practice documents) and a fixed, declared purpose. Individuals’ rights over staff data are handled through the practice’s existing data-protection policies. Processor compliance is addressed by pinning the provider routing to zero-retention providers; the geographic location of those providers and a written data-processing assurance are still to be confirmed.',
      ],
    },
    {
      n: 5,
      title: 'Identify and assess risks',
      status: 'in-progress',
      guidance: 'Describe the source of each risk and the nature of the potential impact on individuals, with likelihood, severity and overall rating.',
      // table headings mirror the ICO template
      table: {
        cols: ['Source of risk and nature of impact', 'Likelihood of harm', 'Severity of harm', 'Overall risk'],
        hints: ['', 'Remote, possible or probable', 'Minimal, significant or severe', 'Low, medium or high'],
        rows: [
          { source: 'A staff member types patient details into a question, which is then sent to the AI provider.', likelihood: 'Possible', severity: 'Severe', overall: 'High' },
          { source: 'A staff member writes patient details into a notebook note, which is then stored in the database and sent to the AI provider as answer context and for search embeddings.', likelihood: 'Possible', severity: 'Severe', overall: 'High' },
          { source: 'Staff or third-party names inside practice documents or notes are sent to the AI as answer context.', likelihood: 'Probable', severity: 'Minimal', overall: 'Medium' },
          { source: 'The AI provider keeps a question or note text, or uses it to train its models.', likelihood: 'Remote', severity: 'Significant', overall: 'Medium' },
          { source: 'An out-of-date or wrong answer leads to an incorrect administrative action.', likelihood: 'Possible', severity: 'Significant', overall: 'Medium' },
          { source: 'Stored data for the withdrawn rota tool (staff names, working patterns, leave) is kept longer than needed now the tool is not offered.', likelihood: 'Possible', severity: 'Minimal', overall: 'Low' },
        ],
      },
    },
    {
      n: 6,
      title: 'Identify measures to reduce risk',
      status: 'in-progress',
      guidance: 'Identify additional measures to reduce or eliminate the risks rated medium or high in step 5.',
      table: {
        cols: ['Risk', 'Options to reduce or eliminate risk', 'Effect on risk', 'Residual risk', 'Measure approved'],
        hints: ['', '', 'Eliminated, reduced or accepted', 'Low, medium or high', 'Yes / no'],
        rows: [
          { risk: 'Patient details entered into a question.', options: 'On-screen “never enter patient information” warning (in place); optional automatic screening to catch and block patient details before a question is sent (to do).', effect: 'Reduced', residual: 'Medium', approved: 'No' },
          { risk: 'Patient details written into a notebook note.', options: 'Staff guidance that the notebook is for practice procedures, never patient information (to do); periodic review of notes for personal data (to do); notes are deletable at any time and deletion also removes their search embeddings (in place).', effect: 'Reduced', residual: 'Medium', approved: 'No' },
          { risk: 'Withdrawn rota tool’s staff data kept without need.', options: 'Decide whether the rota tool returns; if not, delete the stored staff and rota records (to do).', effect: 'Reduced', residual: 'Low', approved: 'No' },
          { risk: 'AI provider retains or trains on the question.', options: 'Route only to providers contractually set to deny retention/training (in place); obtain written assurance from the provider (to do).', effect: 'Reduced', residual: 'Low', approved: 'No' },
          { risk: 'Wrong or out-of-date answer.', options: 'Strict grounding to practice documents with citations and a decline when not covered (in place); periodic review of the document set (to do).', effect: 'Reduced', residual: 'Low', approved: 'No' },
          { risk: 'Names in documents sent as context.', options: 'Minimise extracts sent; review documents for unnecessary personal data before indexing (to do).', effect: 'Reduced', residual: 'Low', approved: 'No' },
        ],
      },
    },
    {
      n: 7,
      title: 'Sign off and record outcomes',
      status: 'pending',
      guidance: 'Record who approved the measures and residual risks, the DPO’s advice, and any consultation responses. If accepting any residual high risk, consult the ICO before going ahead.',
      table: {
        cols: ['Item', 'Name / position / date', 'Notes'],
        rows: [
          { item: 'Measures approved by', who: 'Not yet approved', notes: 'Integrate actions back into the project plan, with a date and owner for completion.' },
          { item: 'Residual risks approved by', who: 'Not yet approved', notes: 'The patient-data risk is currently rated high until automatic screening is added; if accepted as residual high risk, consult the ICO before going ahead.' },
          { item: 'DPO advice provided by', who: 'No named DPO', notes: 'No Data Protection Officer is appointed; the partners / practice manager hold this responsibility for now.' },
          { item: 'Summary of DPO advice', who: '—', notes: 'To follow once a reviewer is confirmed.' },
          { item: 'Consultation responses reviewed by', who: 'Not yet started', notes: 'Pending the staff pilot and IG review in step 3.' },
        ],
      },
    },
  ],
};
