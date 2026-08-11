// The slash commands: saying which answer you want, instead of hoping.
//
// The assistant works out what a message is, and it is good at it — but the two
// cases where being wrong costs most are the two where the reader already knows.
// "Pt has a sore throat" is a triage; a pasted discharge summary is a document
// to file. Typing the command says so outright, and the template is then chosen
// in code rather than by a model.
//
// Two commands, no more, for the same reason there are two shortcuts on the
// opening screen: a list nobody can hold in their head is a list nobody uses.
//
// Shared by the browser (which offers the list as you type "/") and the server
// (which honours only a template a command claims), so neither can be asked for
// a command the other does not have.

export const COMMANDS = [
  {
    name: 'triage',
    template: 'triage',
    summary: 'Where a patient goes',
    detail: 'Describe what the patient has. Answers with the route, the urgency and the red flags.',
    usage: '/triage what the patient has',
    example: '/triage pt has a sore throat since Friday, no fever',
  },
  {
    name: 'document',
    template: 'documentCoding',
    summary: 'File a letter',
    detail: 'Paste a letter or discharge summary. Answers with the filing title, date and department.',
    usage: '/document paste the letter',
    example: '/document Discharge summary, Homerton, 07-Aug-2026',
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
 * Only while the field holds a command name being typed — "/", "/t", "/triage"
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

// "/triage", or "/triage " with nothing after it: the command is chosen and the
// message is missing, which is what the usage line under the field is for.
export function awaitingArguments(text) {
  const parsed = parseCommand(text);
  return parsed && !parsed.rest ? parsed.command : null;
}
