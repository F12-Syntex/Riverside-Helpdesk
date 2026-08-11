// Data Protection Impact Assessment for the whole Riverside Helpdesk program —
// the internal staff tool suite for The Riverside Practice. It follows the ICO's
// sample DPIA template (public/assets/dpia-template.docx): submitting controller
// details, then the seven steps, with the template's own guidance kept verbatim
// next to the practice's plain-English answers.
//
// The technical basis for every statement here is ARCHITECTURE.md in this
// repository, which describes the system as built and marks what could not be
// established from the code as [to confirm]. When a tool, a store or a recipient
// changes, update ARCHITECTURE.md and this file together — and the data-flow
// diagram in app/_components/DpiaFlow.jsx, which draws what step 2 describes.
//
// This is a working self-assessment — NOT a signed-off, approved document. The
// practice does not currently have a named Data Protection Officer, so review
// and sign-off rests with the partners / practice manager. Keep every answer,
// the risk ratings and the sign-off table honest as the service and review
// progress.

export const DPIA = {
  title: 'Data protection impact assessment',
  program: 'Riverside Helpdesk',
  subtitle: 'The internal staff tool suite for The Riverside Practice: the Practice Q&A assistant, the document knowledge base and the practice Notebook, plus the reception helpers that read text pasted from a patient consultation (Signpost, Reason for appointment, Code a document), Instant lookup, the medication check, the staff rota generator, the model settings and the activity audit log.',
  status: 'Draft: not yet approved',
  stage: 'This assessment has been written but not yet reviewed or signed off by the practice.',
  updated: '2026-08-06',
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
  // progress dot/badge. Step 2 also carries the data-flow diagram; steps 5–7
  // carry the template's tables.
  steps: [
    {
      n: 1,
      title: 'Identify the need for a DPIA',
      status: 'complete',
      guidance: 'Explain broadly what the project aims to achieve and what type of processing it involves. Summarise why you identified the need for a DPIA.',
      body: [
        'Riverside Helpdesk is an internal web app for practice staff. It is not patient-facing, is not part of the clinical record, and neither reads from nor writes to EMIS Web or AccurX. It provides: a Practice Q&A assistant that answers questions about how the practice works from the practice’s own documents and notes, with a verbatim quote behind every claim; a browsable knowledge base of those documents; a Notebook where staff write the practice’s own procedures, which the assistant reads live as citable context; Instant lookup, which finds a telephone number in the practice directory, then the CQC register, then by reading web pages; three reception helpers that work on text pasted out of a patient’s online consultation or a hospital document — Signpost, Reason for appointment and Code a document; a medication information check; a staff rota generator; a settings page choosing which AI model each role runs on; and an activity audit log.',
        'Only the Q&A assistant and Instant lookup are offered on the tool index. The Notebook, the medication check, the rota generator, the reception helpers, the system map and the audit log are not listed there but remain fully reachable by anyone who knows or is given the address; the DPIA treats them as live processing, because they are.',
        'A DPIA is needed because: free-text staff questions, matching document extracts and whole Notebook pages are sent to a third-party AI provider (OpenRouter) to word each answer; the reception helpers exist to process text pasted out of a patient consultation or a hospital letter, so patient data reaches the AI provider by design; notebook notes are stored in the practice’s database and sent to the provider for claim extraction and search embeddings; documents and notes name staff and sometimes third parties; the audit log and the answer cache store the text staff type; there is a foreseeable risk of a staff member typing patient details into a question or a note; and no part of the application requires a sign-in. Using a new AI technology to process personal data is itself a trigger for a DPIA.',
      ],
    },
    {
      n: 2,
      title: 'Describe the processing',
      status: 'complete',
      guidance: 'Describe the nature, scope, context and purposes of the processing.',
      body: [
        'Nature: Staff type a question, paste consultation or document text, or write notes in the browser. For the Q&A assistant the question, the extracts the model chose to search for and whole Notebook pages it opened are sent to OpenRouter, which returns the wording of the answer; every call is routed only to providers contractually set not to retain or train on the data. The reception helpers send the pasted text (and, for document coding, any screenshot) the same way and store nothing. Instant lookup searches a local copy of the CQC register, and where the register holds no number sends a model-composed search query to Exa through OpenRouter and then fetches the pages found. Notebook notes and attachments are stored server-side (Neon, a managed Postgres service; files in Vercel Blob at public URLs); note text is sent to OpenRouter for claim extraction and for the embeddings used by search, and optional AI formatting sends the open note the same way and shows a diff the user must confirm. Chat history stays in the staff member’s own browser. The activity audit log records what was done, on which machine, and — for the assistant, lookup and medication routes — the first 400 characters of the text typed. The answer cache stores the question verbatim alongside the answer. Figure 1 draws all of this.',
        'Scope: Mostly staff-facing operational information — questions, practice notes, and the contents of practice policies and protocols, some of which name staff or third parties. Patient data is in scope in two distinct ways: pasted consultation and hospital-document text, which is intended (the reception helpers exist for it, and the pages tell staff to remove identifiers first, though nothing enforces this and nothing is stored), and patient details typed into a question or a note, which is not intended and is stored. The rota holds staff names, roles, hours, mobile numbers and leave; the medication cache holds public medicine information plus the questions asked about each medicine. No special-category or criminal-offence data is sought by any feature, and nothing prevents it arriving in free text. Volumes are small — one practice, tens of staff.',
        'Context: Users are the practice’s own staff using a tool provided for their work; they would expect this use. The technology (large language models reached through a provider) is novel for the practice, which is why grounding, quote-checking, the "no patient information" warnings and zero-retention routing are built in. No patients or children use the tool. Recipients outside the practice are: OpenRouter and whichever model provider it routes to; Exa, for web-search query text; the web hosts Instant lookup reads; Neon and Vercel Blob as storage processors; and — from the staff device, on every page load, before anything is asked — Vercel Analytics and Google Fonts, which receive IP address and user agent.',
        'Purposes: To help staff find the correct practice procedure quickly and consistently, to route and record incoming patient requests accurately, and to keep the practice’s working knowledge in one place the assistant can use. This improves accuracy and saves time, with no intended effect on any patient’s clinical record.',
      ],
    },
    {
      n: 3,
      title: 'Consultation process',
      status: 'pending',
      guidance: 'Consider how to consult relevant stakeholders (staff, processors, and security or other experts) or justify why consultation is not appropriate.',
      body: [
        'Outstanding: an information-governance review by the partners / practice manager, and structured feedback from a staff pilot. Written confirmation of data handling is to be obtained from the AI provider (OpenRouter), and the hosting, database region and repository visibility questions in ARCHITECTURE.md §15 settled with whoever administers those accounts. Patients are not consulted directly; the reception helpers process text patients wrote to the practice for their own care, within the practice’s existing privacy notice, and the practice should confirm that notice covers processing by an AI provider.',
      ],
    },
    {
      n: 4,
      title: 'Assess necessity and proportionality',
      status: 'in-progress',
      guidance: 'Describe compliance and proportionality measures: your lawful basis, whether the processing achieves the purpose, data minimisation, function creep, individuals’ rights, processor compliance and international transfers.',
      body: [
        'Lawful basis to be confirmed by the practice: for staff data, the basis is expected to be the practice’s legitimate interest in running an efficient service / performance of the employment relationship; for the patient text passing through the reception helpers, the basis is expected to sit with the practice’s existing provision of care and its Article 9(2)(h) condition, which the IG review must confirm before those tools are relied on more widely.',
        'The processing achieves the purpose and the data used is minimised: the assistant sends the question plus what it chose to read, never the whole knowledge base; the reception helpers keep nothing; the audit log stores the first 400 characters of typed text, not the whole of it. The question log is the deliberate exception: for the Q&A assistant alone it keeps the question as typed and the answer as it was shown, because an answer cannot be checked after the fact — the Notebook page behind it gets edited — and output nobody can check is the larger risk. Function creep is limited by strict grounding — answers come only from practice material, with a verbatim quote behind each claim and a decline when the material does not cover the question — and by a fixed, declared purpose per tool.',
        'Individuals’ rights over staff data are handled through the practice’s existing data-protection policies; a Notebook note and its attachments can be deleted at any time, which also removes the knowledge and embeddings derived from it. Three stores do not yet honour that pattern: the audit log has no retention limit, purge job or deletion route; the question log holds the question and the answer indefinitely on the same terms; and the answer cache holds the question verbatim until it ages out or a Notebook edit invalidates it.',
        'Processor compliance is addressed by pinning provider routing to zero-retention providers on every call; the geographic location of those providers, the Neon database region and a written data-processing assurance are still to be confirmed, and until they are the international-transfer position cannot be stated. Access control is the weakest measure and is not yet a control at all: no route requires a sign-in, so anyone who can reach the deployment can read the Notebook, the staff records, the audit log and the settings, and the practice’s policy documents are served publicly with predictable addresses.',
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
          { source: 'No sign-in on any route: anyone who reaches the address can read the Notebook, staff records, the audit log and the settings, or ask the assistant anything.', likelihood: 'Possible', severity: 'Severe', overall: 'High' },
          { source: 'A staff member types patient details into a question. The text goes to the AI provider, is stored in the question log in full alongside the answer that was given, is stored truncated in the audit log, and for cacheable questions verbatim in the answer cache.', likelihood: 'Possible', severity: 'Severe', overall: 'High' },
          { source: 'A staff member writes patient details into a notebook note, which is stored in the database and sent to the AI provider for claim extraction and search embeddings.', likelihood: 'Possible', severity: 'Severe', overall: 'High' },
          { source: 'Patient consultation or hospital-document text pasted into Signpost, Reason or Code a document still carries identifiers when it is sent to the AI provider. The pages ask staff to remove them; nothing enforces it.', likelihood: 'Probable', severity: 'Significant', overall: 'High' },
          { source: 'A Notebook attachment holding patient or staff information sits in Vercel Blob at a public URL, readable indefinitely by anyone given the link.', likelihood: 'Possible', severity: 'Significant', overall: 'Medium' },
          { source: 'The audit log and the question log keep the text staff typed — the question log also keeping the answer in full — with no retention limit, no purge job and no deletion route, so both accumulate indefinitely.', likelihood: 'Probable', severity: 'Significant', overall: 'Medium' },
          { source: 'Staff or third-party names inside practice documents or notes are sent to the AI as answer context.', likelihood: 'Probable', severity: 'Minimal', overall: 'Medium' },
          { source: 'The AI provider, or the model company it routes to, keeps text or uses it to train models; or routes it outside the UK/EEA. Provider location is unconfirmed.', likelihood: 'Remote', severity: 'Significant', overall: 'Medium' },
          { source: 'An out-of-date or wrong answer leads to an incorrect administrative action, or a wrongly routed patient request.', likelihood: 'Possible', severity: 'Significant', overall: 'Medium' },
          { source: 'The practice’s own policy documents are served publicly from predictable addresses, and the repository holds them and the telephone directory; repository visibility is unconfirmed.', likelihood: 'Possible', severity: 'Minimal', overall: 'Medium' },
          { source: 'Every page load reports the staff device’s IP address and user agent to Vercel Analytics and Google Fonts, neither of which is needed for the tool to work.', likelihood: 'Probable', severity: 'Minimal', overall: 'Low' },
          { source: 'A model-composed web-search query carries content from a staff question to Exa.', likelihood: 'Possible', severity: 'Minimal', overall: 'Low' },
          { source: 'Staff data held for the rota (names, mobile numbers, working patterns, leave) and the medicines cache is kept indefinitely, with no review point.', likelihood: 'Possible', severity: 'Minimal', overall: 'Low' },
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
          { risk: 'No sign-in on any route.', options: 'Put the deployment behind practice authentication, or at minimum behind platform access protection with per-person accounts; treat the localhost-only rule used for the knowledge admin as the pattern for every administrative page (to do).', effect: 'Reduced', residual: 'High', approved: 'No' },
          { risk: 'Patient details entered into a question.', options: 'On-screen “never enter patient information” warning (in place); automatic screening to catch and block identifiers before a question is sent (to do); stop storing question text in the audit log, or shorten and time-limit it (to do); time-limit the question log, which keeps the question and the answer in full (to do).', effect: 'Reduced', residual: 'High', approved: 'No' },
          { risk: 'Patient details written into a notebook note.', options: 'Staff guidance that the Notebook is for practice procedures, never patient information (to do); periodic review of notes for personal data (to do); notes are deletable at any time and deletion also removes the derived knowledge and embeddings (in place).', effect: 'Reduced', residual: 'Medium', approved: 'No' },
          { risk: 'Identifiers left in text pasted into the reception helpers.', options: 'Instruction to remove identifiers before pasting (in place); nothing is stored server-side (in place); automatic identifier screening or redaction before the call (to do); confirm the lawful basis and privacy-notice cover for this processing in the IG review (to do).', effect: 'Reduced', residual: 'Medium', approved: 'No' },
          { risk: 'Notebook attachments readable at public URLs.', options: 'Serve attachments through an authenticated route instead of public Blob access, or move to private Blob with signed URLs (to do); unguessable random suffixes (in place).', effect: 'Reduced', residual: 'Medium', approved: 'No' },
          { risk: 'Audit log and question log grow for ever and hold typed text.', options: 'Set a retention period and add a purge job and a deletion route covering both (to do); decide how long the question log needs to keep answers to be useful for monitoring output, which is the only reason it holds them (to do); decide whether the audit log needs question text at all, or only its length (to do).', effect: 'Reduced', residual: 'Medium', approved: 'No' },
          { risk: 'AI provider retains or trains on the text, or processes it outside the UK/EEA.', options: 'Route only to providers contractually set to deny retention and training (in place); obtain written assurance from OpenRouter and establish where the routed providers run (to do).', effect: 'Reduced', residual: 'Medium', approved: 'No' },
          { risk: 'Wrong or out-of-date answer.', options: 'Strict grounding to practice material, a verbatim quote behind every claim, unverifiable content dropped, and a decline when the material does not cover the question (in place); periodic review of the document set and the Notebook (to do).', effect: 'Reduced', residual: 'Low', approved: 'No' },
          { risk: 'Names in documents sent as context.', options: 'Send only the extracts the model asked for (in place); review documents for unnecessary personal data before indexing (to do).', effect: 'Reduced', residual: 'Low', approved: 'No' },
          { risk: 'Practice documents public; repository visibility unknown.', options: 'Confirm repository visibility and make it private if it is not (to do); decide whether the display copies need to be public, or served behind the same authentication as the app (to do).', effect: 'Reduced', residual: 'Medium', approved: 'No' },
          { risk: 'Analytics and font requests from staff devices.', options: 'Self-host the web font to remove Google Fonts entirely; decide whether Vercel Analytics is needed for an internal tool and remove it if not (to do).', effect: 'Eliminated', residual: 'Low', approved: 'No' },
          { risk: 'Rota and medicines data kept without a review point.', options: 'Decide whether the rota tool returns to the index; if not, delete the stored staff and rota records. Set a review date either way (to do).', effect: 'Reduced', residual: 'Low', approved: 'No' },
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
          { item: 'Measures approved by', who: 'Not yet approved', notes: 'Integrate actions back into the project plan, with a date and owner for completion. Authentication and the audit-log retention decision are the two that block everything else.' },
          { item: 'Residual risks approved by', who: 'Not yet approved', notes: 'Three risks are currently rated high: no sign-in, patient details typed into a question, and identifiers left in text pasted into the reception helpers. If any is accepted as a residual high risk, consult the ICO before going ahead.' },
          { item: 'DPO advice provided by', who: 'No named DPO', notes: 'No Data Protection Officer is appointed; the partners / practice manager hold this responsibility for now.' },
          { item: 'Summary of DPO advice', who: 'None yet', notes: 'To follow once a reviewer is confirmed.' },
          { item: 'Consultation responses reviewed by', who: 'Not yet started', notes: 'Pending the staff pilot and IG review in step 3.' },
        ],
      },
    },
  ],
};
