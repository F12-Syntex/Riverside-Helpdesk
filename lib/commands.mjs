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
    placeholder: 'Paste the AccurX request',
    summary: 'Where it goes, and the reason line',
    detail: 'Paste an AccurX request. Answers with the route and the urgency, and the reason line to copy, on one card.',
    usage: '/accurx paste the AccurX request',
    example: '/accurx I have had heartburn for 3 weeks and gaviscon is not helping, please call after 2pm',
  },
  {
    name: 'document',
    template: 'documentCoding',
    fill: 'model',
    label: 'Document',
    placeholder: 'Paste the letter or discharge summary',
    summary: 'File a letter',
    detail: 'Paste a letter or discharge summary. Answers with the filing title, date and department.',
    usage: '/document paste the letter',
    example: '/document Discharge summary, Homerton, 07-Aug-2026',
  },
  {
    name: 'form',
    template: 'referralForm',
    fill: 'lookup',
    label: 'Form',
    placeholder: 'What is the referral for? "suspected skin cancer"',
    summary: 'Find a referral form',
    detail: 'Searches the NEL Referral Tree and answers with the form’s name exactly as it is listed, and the category it is under.',
    usage: '/form what the referral is for',
    example: '/form suspected skin cancer',
  },
  {
    name: 'template',
    template: 'contractTemplate',
    fill: 'lookup',
    label: 'Template',
    placeholder: 'Which contract, or which template? "wound care"',
    summary: 'Which EMIS template records a contract',
    detail: 'Answers with the EMIS Web template(s) for a NEL contract, and the build status they had when Primary Care IT last reported. Works from a template’s name too.',
    usage: '/template the contract or template name',
    example: '/template ADHD shared pathway',
  },
  {
    name: 'practice',
    template: 'practiceSearch',
    fill: 'search',
    label: 'Practice',
    placeholder: 'What to look for in the practice documents',
    summary: 'Search the practice documents',
    detail: 'Searches the policies and protocols and shows the passages themselves, word for word.',
    usage: '/practice what to look for',
    example: '/practice consent to share medical records',
  },
];

export const COMMAND_TEMPLATES = COMMANDS.map((c) => c.template);

export const commandByName = (name) =>
  COMMANDS.find((c) => c.name === String(name || '').toLowerCase()) || null;

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
  return COMMANDS.filter((c) => c.name.startsWith(typed));
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
 * is, and what the field goes back to after each one is sent: a mode
 * that stayed put would eventually be left on the wrong setting by
 * somebody halfway through a phone call, and an ordinary question
 * answered out of the referral-form list is worse than no answer,
 * because it is a confident one.
 * ------------------------------------------------------------------ */
export const QA_MODE = {
  name: '',
  label: 'Q&A',
  summary: 'Ask anything — the assistant works out what it is',
  placeholder: 'Ask a question, type a name for its number',
};

/** Every mode the picker offers, Q&A first. */
export const MODES = [QA_MODE, ...COMMANDS.map((c) => ({
  name: c.name, label: c.label, summary: c.summary, placeholder: c.placeholder,
}))];

/** What the field asks for in this mode. Q&A's wording for anything unknown. */
export const modePlaceholder = (name) =>
  (MODES.find((m) => m.name === String(name || '')) || QA_MODE).placeholder;
