// READING A REFERRAL OFF THE PRACTICE'S OWN PAGE, WITH THE MODEL.
//
// The pairing a referral needs — is it sent on e-RS or by email, what goes in
// Speciality, what goes in Clinic type — is written on the practice's own
// pathway pages, and until now it was got out of them by a parser
// (lib/referrals/pathways.mjs): three recognised page shapes, a label regex, a
// table reader, a bullet reader, and a word-overlap score to decide which row
// the question meant.
//
// That parser is right about the pages it was written against and blind to
// every other way of writing the same thing down. A page that records the
// pairing in a sentence, under a heading it does not recognise, or in a table
// with a third column, reads as a page that records nothing — and the reader is
// told the practice has no process for a referral the practice wrote down.
// Worse, the word score returns SOMETHING for almost any question, so a near
// miss is not a blank card, it is the wrong pairing presented with the same
// confidence as a right one.
//
// So the model reads the page. It is the thing in this app that is good at
// "which of these paragraphs is about a dietitian referral, and what does it
// say goes in Clinic type" — and it is not being asked to write the answer:
// the card is the same card, built from the same blocks, and every value it
// returns is checked against the page it named before any of it is drawn.
//
// WHAT IS CHECKED, AND WHY THAT IS THE WHOLE GUARANTEE. A value that does not
// appear on the named page, character for character, is not a value the
// practice recorded — it is the model completing a pattern. Every string below
// is looked for in the page text and dropped when it is not found, so the worst
// case is a card with a box left open, never a card with an invented speciality
// in it. A dropped value is then a GAP, and the card says which one: an open
// box with "the page does not record this" against it is an answer a
// receptionist can act on, and a quietly blank one is not.
import { z } from 'zod';

export const REFERRAL_READ_SCHEMA = z.object({
  found: z.boolean()
    .describe('True ONLY when a page in the Notebook records how this particular referral is sent. False when no page does. Never fill the rest in from what you know about how the NHS usually works — an invented pairing sends a patient to the wrong clinic.'),
  page: z.string().default('')
    .describe('The exact title of the Notebook page you read this off, copied character for character from its "### " heading. Required whenever found is true.'),
  name: z.string().default('')
    .describe('What is being referred to, as the PAGE names it, in the fewest words and without the word "referral" itself.'),
  route: z.enum(['ers', 'email', 'unclear']).default('unclear')
    .describe('How the page says this referral is SENT. "ers" when it goes on the e-RS "Search for a service" screen. "email" when it is emailed, however the page words it. "unclear" when the page does not say — say unclear rather than assuming e-RS.'),
  specialty: z.string().default('')
    .describe('What goes in the Speciality box on e-RS, copied off the page character for character. Empty when the page does not record one — do not derive it from the service name.'),
  clinicType: z.string().default('')
    .describe('What goes in the Clinic type box on e-RS, copied off the page character for character. Empty when the page does not record one.'),
  priority: z.string().default('')
    .describe('The priority the page records: Routine, 2WW, Urgent. Empty when the page does not say.'),
  hospital: z.string().default('')
    .describe('The hospital or organisation the page names for this referral. Empty when it names none.'),
  hospitalRule: z.string().default('')
    .describe('Where the page gives a RULE for picking the hospital rather than naming one ("the first that is not a telederm"), copy the rule here and leave hospital empty.'),
  emailAddress: z.string().default('')
    .describe('For route "email": the address the page records. Copied character for character.'),
  form: z.string().default('')
    .describe('The form the page says to use, named exactly as the page names it. Empty when the page names none — never compose a form name.'),
  note: z.string().default('')
    .describe('One thing the page says that a reader would get wrong without it. Copied or closely paraphrased from the page. Empty when there is nothing of the kind.'),
  alternatives: z.array(z.object({
    name: z.string().default(''),
    specialty: z.string().default(''),
    clinicType: z.string().default(''),
    hospital: z.string().default(''),
  })).default([])
    .describe('Other versions of this same referral recorded on the SAME page — normal, community, telederm, 2WW — when the message does not say which is wanted. Leave empty when the page records only one.'),
});

// Required before a card can claim to answer the question. Anything here that
// the page does not record is named on the card as a gap rather than left blank.
export const REQUIRED_BY_ROUTE = {
  ers: [
    ['specialty', 'the Speciality to type into e-RS'],
    ['clinicType', 'the Clinic type to type into e-RS'],
  ],
  email: [
    ['emailAddress', 'the address it is emailed to'],
  ],
  unclear: [],
};

const squash = (t) => String(t || '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim();

export function referralReadPrompt({ name = '', question = '', notebook = '' } = {}) {
  return [
    'THE PRACTICE NOTEBOOK — every page it holds, in full, each under its title. This is the ONLY thing you know about this practice. Nothing else you have ever read applies here: not how other surgeries work, not what is usual in the NHS, not what sounds sensible.',
    '',
    notebook,
    '',
    'YOUR JOB',
    '',
    'A member of practice staff is asking how to send a referral. Find the page that records THIS referral and read its values off it, so a card can be drawn with the e-RS screen already filled in.',
    '',
    'RULES',
    '- COPY, DO NOT COMPOSE. Every value you return is checked against the page you named, character for character, and anything not found there is deleted before the reader sees it. A speciality you worked out from the service name will not survive that check, and the box will be empty on the card.',
    '- Name the page in "page", copied exactly from its "### " heading. A page title that does not match one in the Notebook throws the whole read away.',
    '- ROUTE FIRST. The page either sends this on e-RS or sends it by email. Where the page does not say, answer "unclear" — that is a real answer and it is drawn honestly. Assuming e-RS because most referrals are e-RS is how somebody spends ten minutes on a screen that was never going to have this service on it.',
    '- A value the page does not record is EMPTY, not guessed. An empty box is labelled as not recorded on the card, which is true and useful; a guessed one is indistinguishable from a real one.',
    '- Where the page records several versions of this referral and the message does not say which, fill the first into the main values and put the others in "alternatives". Do not pick between them silently.',
    '- If no page records this referral, set found to false and leave everything else alone.',
    '',
    name ? `WHAT IS BEING REFERRED: ${name}` : '',
    '',
    'THE MESSAGE:',
    '"""',
    String(question || '').replace(/"{3,}/g, '""'),
    '"""',
  ].filter((line) => line !== '').join('\n');
}

/**
 * Every value checked against the page it was read off, and what is left
 * turned into the shape the referral card already takes.
 *
 * Returns null when the read cannot be trusted at all — no page, a page title
 * matching nothing in the Notebook, or found: false. The caller leaves
 * whatever the deterministic path built standing, which is the behaviour this
 * whole module is layered on top of rather than replacing.
 */
export function groundReferralRead({ read, pages = [] } = {}) {
  if (!read || !read.found) return null;
  const wanted = squash(read.page);
  if (!wanted) return null;
  const leaf = (t) => squash(t).split('/').pop().trim();
  const page = pages.find((p) => squash(p.docTitle) === wanted)
    || pages.find((p) => leaf(p.docTitle) === leaf(read.page))
    || null;
  if (!page) return null;

  const body = squash(page.text);
  if (!body) return null;
  // A value the page does not contain is not a value the practice recorded.
  const kept = (value) => {
    const v = String(value || '').trim();
    if (!v) return '';
    return body.includes(squash(v)) ? v : '';
  };

  const route = read.route === 'ers' || read.route === 'email' ? read.route : 'unclear';
  const svc = {
    name: String(read.name || '').trim(),
    route,
    specialty: kept(read.specialty),
    clinicType: kept(read.clinicType),
    priority: kept(read.priority),
    hospital: kept(read.hospital),
    hospitalRule: kept(read.hospitalRule),
    email: kept(read.emailAddress),
    form: kept(read.form),
    note: kept(read.note),
    page: page.docTitle,
    fromNotebook: true,
    // Read off the page by a model rather than parsed out of it, which the
    // card says so a reader knows which of the two they are looking at.
    readByModel: true,
    alternatives: (read.alternatives || [])
      .map((alt) => ({
        name: String(alt.name || '').trim(),
        specialty: kept(alt.specialty),
        clinicType: kept(alt.clinicType),
        hospital: kept(alt.hospital),
      }))
      .filter((alt) => alt.name && (alt.specialty || alt.clinicType || alt.hospital)),
  };
  svc.ambiguous = svc.alternatives.length > 0;

  // WHAT THE PAGE DOES NOT RECORD, NAMED. Both the values the model left empty
  // and the values the check deleted end up here, because from the reader's
  // side they are the same thing: the card cannot tell them what to type, and
  // it should say which one rather than showing a blank box.
  svc.gaps = (REQUIRED_BY_ROUTE[route] || [])
    .filter(([key]) => !svc[key === 'emailAddress' ? 'email' : key])
    .map(([, said]) => said);
  if (route === 'unclear') svc.gaps.unshift('whether this goes on e-RS or by email');

  // Nothing survived worth drawing. The caller keeps what it had.
  if (!svc.name && !svc.specialty && !svc.clinicType && !svc.email) return null;
  return svc;
}
