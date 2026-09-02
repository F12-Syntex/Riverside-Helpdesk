// The slash commands: saying which answer you want, instead of hoping.
//
// The assistant works out what a message is, and it is good at it — but the two
// cases where being wrong costs most are the two where the reader already knows.
// A pasted AccurX request needs routing and writing up; a pasted discharge
// summary is a document to file. Typing the command says so outright, and the
// template is then chosen in code rather than by a model.
//
// Kept short for the same reason there are two shortcuts on the opening screen:
// a list nobody can hold in their head is a list nobody uses. Each one earns its
// place by being a case where the reader already knows what they want and being
// wrong about it is expensive.
//
// THERE USED TO BE TWO MORE, AND /accurx IS BOTH OF THEM. /triage said where a
// patient went and nothing about the wording; /appt wrote the wording and said
// outright that it had not decided where they went. Getting both meant pasting
// the same message twice, and the second paste is the one that does not happen
// when the phone rings — so they are gone, and the one card that answers both
// questions from a single paste is what is left. A message typed without a
// command is still routed the ordinary way, and a described symptom still
// reaches the same triage card: that path never went through /triage.
//
// Shared by the browser (which offers the list as you type "/") and the server
// (which honours only a template a command claims), so neither can be asked for
// a command the other does not have.

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
// `checked` says whether a message sent under this command is checked for
// patient data AT ALL, and only one command sets it: Coding, which is false.
// BOTH guards are off there, and both halves of that are deliberate:
//
//   - the name-and-address REDACTION (lib/safety/identifiers.mjs), which
//     ordinarily replaces what it recognises before the request is built, in
//     the browser and again at the endpoint;
//   - the patient-data SCREEN (lib/safety/patient-data.mjs), which ordinarily
//     refuses to send a message identifying a particular patient at all.
//
// WHY THE ONE EXCEPTION. Coding is handed a letter about a patient — that is the
// input, not an accident of one. A discharge summary carries a name, a date of
// birth and a hospital number because that is what a discharge summary is, so on
// this one mode the screen refuses the exact thing being asked for and the
// redactor eats the words the answer is built out of: the site and the
// department are proper nouns, and a redactor that erred toward the letter
// rather than the reader would file the letter under [name removed]. The same
// argument already exempts an ATTACHED document, which is neither screened nor
// redacted for this reason; a letter PASTED into the box is the same letter, and
// was treated differently only because of how it arrived.
//
// WHAT STILL HOLDS ON THIS PATH. Nothing about the answer changes: the filing
// title never carries a name, an NHS number or a date of birth, because
// DOC_CODING_RULES (lib/templates/writing.mjs) says so and the prompt is built
// from that list. What the reader pastes reaches the model as they pasted it,
// which is what the reception helpers at /coding, /signpost and /reason have
// always done, and — like those — it is the paste itself that carries the duty
// to take identifiers out first. It is recorded as such in the DPIA
// (lib/dpia.js, "Identifiers left in text pasted into the reception helpers").
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
    name: 'coding',
    folder: true,
    // IT ANSWERED TO /document FOR AS LONG AS IT WAS HIDDEN, and the people who
    // use it use it by habit, so that spelling still reaches this command.
    // Typing it is rewritten to "/coding " in the field, so the habit teaches
    // the name the picker uses rather than being broken by it. An alias is
    // resolved, and matched while it is being typed; it is never a name on
    // screen, so there is still one Coding row in each list.
    aliases: ['document'],
    template: 'documentCoding',
    fill: 'model',
    checked: false,
    label: 'Coding',
    icon: 'folder',
    placeholder: 'Paste the letter or discharge summary',
    summary: 'Code a pasted letter for filing',
    detail: 'Paste a letter or discharge summary. Answers with the filing title — the clinical event date, the site and department, and the actions the practice is left with. Nothing on this mode is checked for patient data — not the name-and-address redaction, not the screen that refuses a message identifying a patient — because a letter about a patient is the thing it is for. Take identifiers out before pasting, as at /coding, /signpost and /reason.',
    usage: '/coding paste the letter',
    example: '/coding Discharge summary, Homerton, 07-Aug-2026',
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

export const COMMAND_TEMPLATES = COMMANDS.map((c) => c.template);

/* ------------------------------------------------------------------ *
 * NOTHING IS HIDDEN NOW, AND THE FLAG IS KEPT ANYWAY.
 *
 * Two commands were hidden in turn, for the same reason and with the same
 * result. /accurx was hidden and offered again: it is the most used of the
 * lot, and hiding the one command somebody new to the desk would most
 * benefit from finding was the wrong trade for a shorter list. Coding was
 * hidden for longer — as /document, on the argument that the people who
 * use it use it by habit and a habit needs no advertising — which quietly
 * meant that filing a letter, an everyday answer, was reachable only by
 * somebody who had already been told it existed. It is offered now.
 *
 * `hidden` stays as a flag with nothing setting it, because withdrawing a
 * command from the two lists without breaking it is a real thing to want
 * and this is how it is done. Everything that RESOLVES a command —
 * parseCommand, commandByName, forcedTemplate, COMMAND_TEMPLATES —
 * ignores it on purpose. Only the two places that ADVERTISE one honour it.
 * ------------------------------------------------------------------ */
export const OFFERED = COMMANDS.filter((c) => !c.hidden);

// A command answers to its name and to any spelling it used to have. The
// aliases are resolved, never listed: `MODES` and the "/" list are built from
// `name`, so a renamed command has one name on screen and one row in each list.
export const commandByName = (name) => {
  const wanted = String(name || '').toLowerCase();
  return COMMANDS.find((c) => c.name === wanted || (c.aliases || []).includes(wanted)) || null;
};

/**
 * Is a message sent under this command checked for patient data at all?
 *
 * False only for Coding, whose whole job is a pasted letter about a patient —
 * see `checked` at the head of this file. It answers for BOTH guards, the
 * redaction and the screen, so neither can be switched off without the other:
 * half a guard is the worst of the two, editing the reader's letter without
 * being any use against what it was the letter's whole purpose to carry.
 *
 * Takes the command rather than its name, so the browser (which has parsed a
 * typed command, or resolved the armed mode) and the endpoint (which has only
 * the template) cannot be handed different answers for the same message.
 */
export const checksPatientData = (command) => !(command && command.checked === false);

export const commandByTemplate = (template) =>
  COMMANDS.find((c) => c.template === template) || null;

// The server is handed a template, not a command name, and honours it only if a
// command claims it. Anything else is answered the ordinary way.
export const forcedTemplate = (template) =>
  (COMMAND_TEMPLATES.includes(String(template || '')) ? String(template) : '');

/**
 * The commands to offer for what has been typed so far.
 *
 * Only while the field holds a command name being typed — "/", "/a", "/accurx"
 * — and never once there is a space after it: by then the reader is writing the
 * message, and a list over it is in the way.
 */
export function matchCommands(input) {
  const match = /^\s*\/([a-z-]*)$/i.exec(String(input || ''));
  if (!match) return [];
  const typed = match[1].toLowerCase();
  // Matched on the old spelling too, and still shown under the new one: "/doc"
  // offers the Coding row rather than emptying the list under somebody halfway
  // through typing a command that does still work.
  return OFFERED.filter((c) => c.name.startsWith(typed)
    || (c.aliases || []).some((a) => a.startsWith(typed)));
}

/**
 * A command line, split into the command and the message it carries.
 *
 * Returns null for ordinary text and for "/nonsense" — an unknown command is
 * asked as written rather than swallowed, so a stray slash still gets an answer.
 */
export function parseCommand(text) {
  const match = /^\s*\/([a-z-]+)(?:\s+([\s\S]*))?$/i.exec(String(text || ''));
  if (!match) return null;
  const command = commandByName(match[1]);
  if (!command) return null;
  return { command, rest: (match[2] || '').trim() };
}

// "/accurx", or "/accurx " with nothing after it: the command is chosen and the
// message is missing, which is what the usage line under the field is for.
export function awaitingArguments(text) {
  const parsed = parseCommand(text);
  return parsed && !parsed.rest ? parsed.command : null;
}

/* ------------------------------------------------------------------ *
 * Choosing the kind of answer with a button instead of a slash.
 *
 * The commands were only ever reachable by typing "/", so somebody who
 * had not been told they exist never found them — and the two newest are
 * the two most worth finding, because they answer from a published list
 * rather than from a model. The picker in the field offers all of them,
 * every time, and these are the words it uses.
 *
 * The resting state is not a command. It is what almost every message
 * is, and what the field starts in.
 *
 * IT USED TO GO BACK THERE AFTER EVERY MESSAGE. The argument was that a
 * mode left on the wrong setting by somebody halfway through a phone
 * call answers an ordinary question out of the referral-form list. What
 * it cost was the case the modes exist for: looking up three forms in a
 * row meant re-arming the picker three times, and the second miss is the
 * one where somebody goes back to typing the slash — or stops. A mode
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
 * Six modes in one list was a list to read every time the disc was
 * pressed, and four of them — Coding, Referral form, Contract template,
 * Practice documents — are used to LOOK SOMETHING UP a few times a week,
 * where AccurX and Consultation are used to WRITE SOMETHING UP a dozen
 * times a day. So the four sit behind one row that opens to reveal them,
 * and the list at rest is Q&A, AccurX, Consultation and the folder.
 *
 * `folder` is a flag on the command rather than a second list, so a
 * foldered mode is still a mode in every other respect: MODES holds it,
 * isMode accepts it, and the "/" list offers it as it always did. Only
 * the picker draws it differently.
 * ------------------------------------------------------------------ */
export const MODE_FOLDER = {
  label: 'Documents & lookups',
  summary: 'Coding, referral forms, contract templates, practice documents',
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
