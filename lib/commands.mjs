// The modes: saying which answer you want, instead of hoping.
//
// The assistant works out what a message is, and it is good at it — but the
// cases where being wrong costs most are the ones where the reader already
// knows. A pasted AccurX request needs routing and writing up; a referral form
// is a string out of a published list. Choosing the mode says so outright, and
// the template is then chosen in code rather than by a model.
//
// THEY USED TO BE TYPED, AS SLASH COMMANDS. "/accurx", "/form" and the rest
// were a second way in beside the picker, with their own list hanging off the
// field. The picker is the one way in now: a thing nobody has been told to
// type is a thing nobody types, and two ways to say the same thing were two
// things to keep in step.
//
// Shared by the browser (which offers the picker) and the server (which
// honours only a template a mode claims), so neither can be asked for a mode
// the other does not have.

// `fill` says how the card's content is found. 'model' asks the model for that
// template's variables; 'search' asks the practice's own documents and shows
// what they say, with no model in the path at all; 'lookup' takes the rest of the
// line as a query against one fixed list — PCIT's referral forms, PCIT's contract
// templates — and also has no model in its path.
//
// A 'lookup' COMMAND HAS EXACTLY ONE DOCUMENT, AND IT IS NAMED IN THE LABEL.
// "Form" and "Template" were the names of the things being looked for, which
// told a reader nothing about where the answer would come from — and both were
// quietly reading more than their document: the contract lookup answered out of
// the practice's Notebook, and the referral lookup out of the practice's
// emailed-referrals page. They are named for their documents now, one document
// each: "Referral form" is PCIT's NEL Referral Tree introduction & document
// list (EMIS Web), "Contract template" is PCIT's NEL Local Contract
// Specifications, and neither reads anything else — not the Notebook, not the
// other one's document, and no model.
//
// A 'lookup' COMMAND ANSWERS FROM ITS OWN LIST OR SAYS IT CANNOT. It never falls
// through to prose. The whole reason to type /form rather than asking in words is
// that the answer is a string out of a published list; a model writing something
// plausible about a form that is not on the list is the exact failure the command
// exists to prevent. Asking in ordinary words still works and still goes through
// the router, where a fall-through to prose is the right behaviour.
export const COMMANDS = [
  {
    name: 'accurx',
    template: 'accurxTriage',
    fill: 'model',
    label: 'AccurX',
    icon: 'chat',
    placeholder: 'Paste the AccurX request',
    summary: 'Where it goes, and the reason line',
    detail: 'Paste an AccurX request. Answers with the route and the urgency, and the reason line to copy, on one card.',
    usage: '/accurx paste the AccurX request',
    example: '/accurx I have had heartburn for 3 weeks and gaviscon is not helping, please call after 2pm',
  },
  {
    name: 'consultation',
    template: 'consultationNote',
    fill: 'model',
    label: 'Consultation',
    icon: 'stethoscope',
    placeholder: 'Write up what was said and done with the patient',
    summary: 'Turn a contact into the record entry',
    detail: 'Write up a telephone call, a conversation at the desk or a message exchange in your own words — what the patient asked, what was done, what was agreed. Answers with one line in clinical shorthand to put on the patient’s record, so whoever they reach next knows what has already happened. Names and addresses are taken out before it is sent: the entry goes on a record that already says who the patient is.',
    usage: '/consultation what was said and done',
    example: '/consultation pt rang re sore throat a week, wants antibiotics, booked tel appt with Dr Okafor tomorrow pm, told to ring 111 if worse tonight',
  },
  {
    name: 'medication',
    template: 'repeatMedication',
    fill: 'model',
    label: 'Repeat medication',
    icon: 'pill',
    placeholder: 'Paste a screenshot of the repeat medication screen',
    summary: 'Format a medication screenshot for AccurX',
    // THE INPUT IS A PICTURE. The other commands are handed text; this one is
    // handed the repeat-medication screen, pasted as a screenshot, and it is
    // read by the Images model (lib/settings.js) rather than the one that
    // writes answers. A typed list still works, for the desk with no screen.
    detail: 'Paste a screenshot of the patient’s repeat medication screen. Answers with every medication read off it, under the screen’s own headings — Repeat, Variable use repeat — each with its own Copy button, so the AccurX repeat prescription form can be filled one box at a time. The picture is read by the Images model chosen at /settings.',
    usage: '/medication then paste the screenshot (Ctrl+V), or type the list',
    example: '/medication Citalopram 20mg tablets, Mirtazapine 45mg tablets',
  },
  {
    name: 'form',
    folder: true,
    template: 'referralForm',
    fill: 'lookup',
    label: 'Referral form',
    icon: 'fileLines',
    placeholder: 'What is the referral for? "suspected skin cancer"',
    summary: 'Search the NEL Referral Tree (EMIS Web)',
    detail: 'Searches one document — Primary Care IT’s "NEL Referral Tree introduction & document list (EMIS Web)" — and answers with the form’s name exactly as it is listed, and the category it is under. Nothing else is searched.',
    usage: '/form what the referral is for',
    example: '/form suspected skin cancer',
  },
  {
    name: 'template',
    folder: true,
    template: 'contractTemplate',
    fill: 'lookup',
    label: 'Contract template',
    icon: 'copy',
    placeholder: 'Which contract, template or page? "wound care"',
    summary: 'Search PCIT’s contract and OneTemplate documents',
    detail: 'Searches Primary Care IT’s NEL Local Contract Specifications and their OneTemplate page specifications: the EMIS Web template(s) for a contract with the build status PCIT last reported, or — for the everyday jobs no contract pays for — which template carries the page, how to open it and what it records. Works from a template’s name too. Nothing outside PCIT is searched.',
    usage: '/template the contract, template or page',
    example: '/template ADHD shared pathway',
  },
  {
    name: 'practice',
    folder: true,
    template: 'practiceSearch',
    fill: 'search',
    label: 'Practice documents',
    icon: 'book',
    placeholder: 'What to look for in the practice documents',
    summary: 'Search this practice’s policies and protocols',
    detail: 'Searches the policies and protocols and shows the passages themselves, word for word.',
    usage: '/practice what to look for',
    example: '/practice consent to share medical records',
  },
];

// The templates the server will render for a mode.
export const COMMAND_TEMPLATES = COMMANDS.map((c) => c.template);

// `hidden` withdraws a mode from the picker without breaking it: the server
// still honours its template. Nothing sets it at the moment.
export const OFFERED = COMMANDS.filter((c) => !c.hidden);

export const commandByName = (name) => {
  const wanted = String(name || '').toLowerCase();
  return COMMANDS.find((c) => c.name === wanted) || null;
};

/**
 * Is a message sent under this mode checked for patient data?
 *
 * A mode can opt out with `checked: false`, turning off BOTH the
 * name-and-address redaction and the patient-data screen together — half a
 * guard is the worst of the two. No mode does since Coding was withdrawn.
 * Takes the command rather than its name, so the browser and the endpoint
 * cannot be handed different answers for the same message.
 */
export const checksPatientData = (command) => !(command && command.checked === false);

export const commandByTemplate = (template) =>
  COMMANDS.find((c) => c.template === template) || null;

// The server is handed a template, not a command name, and honours it only if a
// command claims it. Anything else is answered the ordinary way.
export const forcedTemplate = (template) =>
  (COMMAND_TEMPLATES.includes(String(template || '')) ? String(template) : '');

/* ------------------------------------------------------------------ *
 * Choosing the kind of answer with a button.
 *
 * The picker in the field offers every mode, every time, and these are
 * the words it uses.
 *
 * The resting state is not a command. It is what almost every message
 * is, and what the field starts in.
 *
 * IT USED TO GO BACK THERE AFTER EVERY MESSAGE. The argument was that a
 * mode left on the wrong setting by somebody halfway through a phone
 * call answers an ordinary question out of the referral-form list. What
 * it cost was the case the modes exist for: looking up three forms in a
 * row meant re-arming the picker three times, and the second miss is the
 * one where somebody stops. A mode
 * now lasts until it is changed, and the two things that make that safe
 * are that the disc wears the mode's own icon rather than a colour (see
 * `icon` below) and that Escape drops it in one key.
 * ------------------------------------------------------------------ */
export const QA_MODE = {
  name: '',
  label: 'Q&A',
  icon: 'search',
  summary: 'Ask anything — the assistant works out what it is',
  placeholder: 'Ask a question, type a name for its number',
};

/* ------------------------------------------------------------------ *
 * `icon` IS THE MODE, DRAWN.
 *
 * The disc in the field turned blue when anything other than Q&A was
 * armed, and that said A mode is on without saying WHICH — one bit of
 * information for a choice with six answers. The placeholder said the
 * rest in words, and words in a placeholder are read once and then
 * stopped being read.
 *
 * So each mode carries the glyph the disc wears while it is armed, and
 * the list draws the same glyph beside each name, so the picture in the
 * field is the picture that was chosen. They are keys into `Icons` in
 * app/_components/ui.js rather than markup, because this module is
 * imported by the server too and must not pull JSX into it.
 *
 * Now that a mode LASTS until it is changed, this is not decoration: the
 * disc is the only thing on screen that says the next question will be
 * answered out of a list rather than asked.
 * ------------------------------------------------------------------ */

/** Every mode the picker offers, Q&A first. */
export const MODES = [QA_MODE, ...OFFERED.map((c) => ({
  name: c.name, label: c.label, icon: c.icon, summary: c.summary, placeholder: c.placeholder,
  folder: Boolean(c.folder),
}))];

/* ------------------------------------------------------------------ *
 * THE FOLDER: the modes that are looked for, behind one row.
 *
 * Referral form, Contract template and Practice documents are used to
 * LOOK SOMETHING UP a few times a week, where AccurX, Consultation and
 * Repeat medication are used to WRITE SOMETHING UP a dozen times a day.
 * So the three lookups sit behind one row that opens to reveal them.
 *
 * `folder` is a flag on the command rather than a second list, so a
 * foldered mode is still a mode in every other respect: MODES holds it,
 * and isMode accepts it. Only the picker draws it differently.
 * ------------------------------------------------------------------ */
export const MODE_FOLDER = {
  label: 'Documents & lookups',
  summary: 'Referral forms, contract templates, practice documents',
  icon: 'folder',
};

/** The modes drawn at the top of the picker, and the ones behind the folder. */
export const TOP_MODES = MODES.filter((m) => !m.folder);
export const FOLDER_MODES = MODES.filter((m) => m.folder);

/** The icon a mode wears. Q&A's magnifying glass for anything unknown. */
export const modeIcon = (name) =>
  ((MODES.find((m) => m.name === String(name || '')) || QA_MODE).icon || QA_MODE.icon);

/** Is this a real mode name? Guards what comes back out of storage. */
export const isMode = (name) => MODES.some((m) => m.name === String(name || ''));

/** What the field asks for in this mode. Q&A's wording for anything unknown. */
export const modePlaceholder = (name) =>
  (MODES.find((m) => m.name === String(name || '')) || QA_MODE).placeholder;
