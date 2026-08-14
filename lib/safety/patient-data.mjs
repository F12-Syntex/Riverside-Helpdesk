// Patient details, stopped at the send button.
//
// WHAT THIS IS FOR, AND WHY IT IS NOT ./identifiers.mjs AGAIN.
//
// That module is regex, a word list and a token scan. It catches the shapes it
// knows — a name behind a title, a postcode, a street address — and it REDACTS
// them, on the argument set out at the top of that file: blocking the send
// makes somebody retype a sentence under time pressure, and the words it can
// recognise it can also remove, so removing them is strictly better than
// refusing them.
//
// The half it cannot do anything about is the half it does not recognise. An
// NHS number is ten digits and so is a phone number and so is an order number.
// A date of birth is a date. "Reg no 4471982" is a hospital number at one trust
// and a stock code at another. No word list separates those, and a rule loose
// enough to try eats every ordinary question that has a number in it.
//
// SO WHAT CANNOT BE REMOVED IS REFUSED INSTEAD. A model reads the message —
// after the deterministic redaction, so it sees exactly the text that was
// already going to be sent and not a character more — and answers one closed
// question: is there anything in here that identifies a particular patient? If
// there is, the message does not go, and the reader is told which kind of thing
// to take out. That is a different bargain from the redactor's and it is the
// right one here: what can be recognised and removed is removed; what can only
// be recognised is stopped.
//
// THE ANSWER NEVER CARRIES THE DETAIL. It is a yes or a no and a list of KINDS
// — "an NHS number", "a date of birth" — and there is deliberately nowhere in
// the schema for a quote. This is the same rule ./identifiers.mjs keeps for its
// findings and it matters more here, not less: a refusal whose own explanation
// repeats the NHS number has published the thing it refused to send.
//
// IT FAILS OPEN, AND THAT IS DELIBERATE. No key, a timeout, a refusal, an
// unreadable answer — the message goes, exactly as it did before any of this
// existed. A screen that fails closed is a screen that takes the whole
// assistant down with OpenRouter, at a desk with a patient standing at it, and
// the deterministic redaction underneath has already run either way. The one
// thing this must never do is become the reason nobody can ask a question.
import { z } from 'zod';

/**
 * What counts, and what each one is called on the popup.
 *
 * Written as the thing a receptionist would look for in their own sentence
 * rather than as a data-protection category: somebody re-reading a message they
 * have just been stopped from sending needs to find the words, not classify
 * them.
 */
export const PATIENT_DATA_KINDS = [
  { id: 'name', label: 'a patient’s name' },
  { id: 'dateOfBirth', label: 'a date of birth' },
  { id: 'nhsNumber', label: 'an NHS number' },
  { id: 'recordNumber', label: 'a hospital, EMIS or record number' },
  { id: 'address', label: 'an address or postcode' },
  { id: 'contact', label: 'a patient’s phone number or email' },
  { id: 'other', label: 'something else that identifies one particular patient' },
];

const KIND_IDS = PATIENT_DATA_KINDS.map((k) => k.id);
const BY_ID = new Map(PATIENT_DATA_KINDS.map((k) => [k.id, k]));

export const kindLabel = (id) => (BY_ID.get(String(id || '')) || {}).label || '';

/**
 * One message, screened. Two fields, no prose, and nowhere to quote anything.
 */
export const PATIENT_DATA_SCHEMA = z.object({
  found: z.enum(['yes', 'no'])
    .describe('Is there anything in this message that identifies one particular patient? "yes" or "no". Nothing else is an answer.'),
  kinds: z.array(z.enum(KIND_IDS)).default([])
    .describe('If you answered "yes": which kinds are in it. Names the KIND only — never write out the detail itself, not here and not anywhere. Empty if you answered "no".'),
});

/**
 * What the screen is asked.
 *
 * The hard half of this prompt is not finding identifiers, it is NOT finding
 * them. Everything a receptionist types is about a patient — that is the job —
 * and a screen that reads "the patient wants their results" as patient data
 * blocks every message in the building on its first afternoon, gets switched
 * off by lunchtime, and protects nobody. So the examples run in both
 * directions, and the ones that must pass come first.
 */
export function patientDataPrompt(text) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');
  return [
    'You are checking one message a member of staff at a UK GP surgery is about to send to an assistant that answers questions about how the practice works. You are answering ONE question about it, and nothing else.',
    '',
    'THE QUESTION: does this message contain anything that identifies one particular patient?',
    '',
    'THE ANSWER IS "no" FOR ALMOST EVERY MESSAGE. Staff describe patients all day and that is the whole job. Describing somebody is not identifying them.',
    '',
    'THESE ARE ALL "no" — do not block any of them:',
    '- "pt has a sore throat since Friday, no fever"',
    '- "patient wants their blood results, who do I ask"',
    '- "a lady called about her husband’s referral"',
    '- "82 year old man, chest pain, what do I do"',
    '- "how do I code a discharge summary from Homerton"',
    '- "which days is Dr Ahmed in" — a colleague is not a patient',
    '- "the number for colposcopy at the Royal London"',
    '- any age, any symptom, any date of an appointment, any dose, any hospital, any department, any staff name.',
    '',
    'THESE ARE "yes":',
    '- a patient’s name, first name and surname together, or a name behind Mr/Mrs/Ms/Miss',
    '- a date of BIRTH — not an appointment date, not the date of a letter, not "since Friday"',
    '- an NHS number (ten digits, sometimes written 000 000 0000)',
    '- a hospital number, EMIS number, record number or case reference for a patient',
    '- a home address or a postcode',
    '- a patient’s own telephone number or email address',
    '- anything else that would let somebody pick that one patient out: an employer and a job title together, a school and a class, a rare combination that names them.',
    '',
    'WHEN YOU ARE NOT SURE, ANSWER "no". Being wrong the other way stops a colleague asking a question they are entitled to ask, with somebody waiting at the desk.',
    '',
    'NEVER WRITE THE DETAIL ITSELF. You return a yes or a no and a list of kinds. There is nowhere in your answer for the name, the number or the address, and repeating one back would put it on the screen it is being kept off.',
    '',
    'Some messages arrive with [name removed] or [address removed] already in them. That is this system having done its job — it is not patient data and it is not a reason to answer "yes".',
    '',
    'THE MESSAGE:',
    '"""',
    fence(text),
    '"""',
  ].join('\n');
}

/**
 * Does this verdict stop the send?
 *
 * Only an explicit "yes" does. Anything else — a "no", a missing verdict, a
 * shape that is not what was asked for — is a message that goes, which is the
 * open direction and the one every failure path here takes.
 */
export function blocksSend(verdict) {
  return !!verdict && String(verdict.found || '') === 'yes';
}

/** The kinds that were named, cleaned of anything not on the list. */
export function kindsOf(verdict) {
  const said = (verdict && Array.isArray(verdict.kinds) ? verdict.kinds : [])
    .map((id) => String(id || ''))
    .filter((id) => BY_ID.has(id));
  return [...new Set(said)];
}

/**
 * What the popup says was found, in one sentence.
 *
 * A "yes" that named no kind still gets a sentence. The screen was sure enough
 * to stop the message and the reader is owed an explanation either way — a
 * general one is worth more than a blank space where the reason should be.
 */
export function patientDataMessage(kinds = []) {
  const labels = kinds.map(kindLabel).filter(Boolean);
  if (!labels.length) return 'This message looks like it identifies one particular patient.';
  const list = labels.length === 1
    ? labels[0]
    : labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
  return 'This message looks like it contains ' + list + '.';
}
