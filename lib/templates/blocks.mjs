// The vocabulary a template answer is built from.
//
// A template returns DATA, never a string of markup and never a decision. Every
// branch is taken in JavaScript before the blocks are built, so a template is a
// list of blocks and nothing else. That is the line that stops this becoming a
// little templating language with its own conditionals, loops and bugs — the
// trap the redesign notes call out.
//
// Blocks are deliberately few. Each exists because an answer genuinely needs
// it, and a new one should have to earn its place the same way:
//
//   fields   a small set of label/value rows. `key: true` marks the values the
//            reader came for — for a referral that is the speciality and the
//            clinic type, the only things that change between one referral and
//            the next, so they are rendered as the headline.
//   steps    an ordered procedure. One action per step.
//   bullets  an unordered list.
//   note     a single line that changes what the reader does: info, warn, or
//            critical for a safety rule.
//   table    genuinely tabular content.
//   expand   a labelled disclosure holding its own blocks — for the procedure a
//            reader usually does NOT need (creating the referral letter, when
//            the doctor has normally already done it).
//   contacts structured contact details, so a number is never retyped by a
//            model into prose.
//   text     markdown, for the rare case none of the above fits.
//   ask      a question back with tappable options, when the answer genuinely
//            depends on something only the reader knows.
//   ers      the e-RS search screen, drawn with the referral filled in.
//   profMessage
//            the Accurx professional-message window, drawn with the referral
//            email already written in it.
//   pathology
//            the EMIS test-request screen, drawn with the blood form filled
//            in — the boxes to tick, the Ordered Items list and Clinical
//            Details.

// A titled panel of label/value rows. Every value is the same size: making the
// important ones bigger read as two different kinds of thing on one card and
// made the panel harder to scan, not easier. Importance is carried by WHAT IS
// IN THE PANEL — put only the values the reader has to type in it, and move the
// rest behind a disclosure.
export const fields = (items, title = '') => ({ type: 'fields', title, items: items.filter(Boolean) });

// `copy` marks a value the reader takes somewhere else and types in — a filing
// title that goes onto the document, a speciality that goes into e-RS. It is the
// same argument the message block makes for itself: the one thing the reader
// should never have to do is retype something the card is already showing them,
// and selecting text by hand on a touchscreen at the front desk is worse than
// retyping it.
//
// Only set when true, so a field that does not carry one is byte-identical to
// what it was before this existed.
//
// `hint` is a second, quieter line under the value: what goes WITH the value
// without being part of it. A medication's directions and quantity sit under
// the drug-and-strength that gets copied — the reader checks them against the
// screen, and does not paste them into the box. Only set when given, for the
// same reason as `copy`.
export const field = (label, value, { missing = '', copy = false, hint = '' } = {}) => ({
  label,
  value,
  missing,
  ...(copy ? { copy: true } : {}),
  ...(hint ? { hint } : {}),
});

export const steps = (items) => ({ type: 'steps', items: items.filter(Boolean) });
export const bullets = (items, title = '') => ({ type: 'bullets', title, items: items.filter(Boolean) });
export const note = (text, tone = 'info') => ({ type: 'note', tone, text });
export const table = (head, rows) => ({ type: 'table', head, rows });
export const expand = (label, blocks, hint = '') => ({ type: 'expand', label, hint, blocks: blocks.filter(Boolean) });
export const contacts = (items) => ({ type: 'contacts', items: items.filter(Boolean) });
export const text = (markdown) => ({ type: 'text', markdown });
// Wording to send to the patient, with a Copy button. Its own block because a
// message is not prose to read: it is text to move somewhere else, and the one
// thing the reader must not have to do is retype it or select it by hand.
export const message = (text, label = 'Send this to the patient') => ({ type: 'message', label, text });

export const ask = (question, options) => ({ type: 'ask', question, options });

// The e-RS "Search for a service" screen, drawn with the values filled in.
//
// A referral is typed into that screen and nowhere else, so the card shows the
// screen rather than a table of labels the reader then has to map onto it.
// Referring clinician is left for the reader: it is whoever created the task.
// A value the practice does not record is shown as missing IN the box it
// belongs to, so a blank never reads as "nothing to set".
//
// `clinicTypeOptions` is the case where the practice records a choice the card
// cannot make for the reader; `clinicTypeCondition` is a rule against the
// field ("Extended Scope only when the doctor asked for it"). `hospitalRule` is
// the same thing against the organisation: where the practice records how to
// pick the hospital rather than which one ("the first that is not a telederm"),
// the rule is shown against the box and the box is left open, because a rule
// drawn into the dropdown reads as the name of a hospital that does not exist.
export const ers = ({
  requestType = 'Referral',
  priority = 'Routine',
  specialty = '',
  clinicType = '',
  clinicTypeOptions = [],
  clinicTypeCondition = '',
  hospital = '',
  hospitalRule = '',
  pathway = '',
  missing = 'Not recorded — take it from the doctor’s task',
} = {}) => ({
  type: 'ers',
  requestType,
  priority,
  specialty,
  clinicType,
  clinicTypeOptions: (clinicTypeOptions || []).filter(Boolean),
  clinicTypeCondition,
  hospital,
  hospitalRule,
  pathway,
  missing,
});

// The Accurx "New professional message" window, drawn with the email already
// written in it.
//
// Same argument as the e-RS screen above, for the other half of the job: an
// emailed referral is typed into that one window and nowhere else, so the card
// shows the window rather than a table of labels the reader then has to map
// onto it. What changes between one emailed referral and the next is the
// address, the attachment and one line of the wording — everything else is the
// same every time, which is exactly what a template is for.
//
// The wording is DATA, built in JavaScript from the service (see
// referralEmailBody in ./referrals.mjs), never written by a model: a body a
// model composes is a body nobody checked, going to another organisation over
// the practice's name.
//
// No patient detail is ever in it. Accurx attaches the record itself, so a name
// or a date of birth typed into the wording is a second copy of something that
// is already there — and the one that can be wrong.
export const profMessage = ({
  to = '',
  toMissing = 'Fills in automatically from the document',
  org = '',
  body = '',
  attach = 'EMIS file',
  form = '',
  assignedTo = 'You',
} = {}) => ({ type: 'profMessage', to, toMissing, org, body, attach, form, assignedTo });


// The EMIS "Test Requests" screen, drawn with the blood form already filled in.
//
// Same argument as the e-RS screen and the professional-message window above,
// for the third screen a template answer ends up in front of: a blood form is
// raised on that one screen and nowhere else, so the card shows the screen
// rather than a list of test names the reader then has to find boxes for.
//
// THREE PARTS. `groups` are the
// screen's own sections with the boxes that get ticked; `ordered` is the
// Ordered Items list on the right, which is what is actually sent and what the
// reader checks their own screen against. `clinicalDetails` is the box under
// it: the type of health check, which the laboratory reads to know why the
// sample was sent, and which is the thing most often left empty.
//
// `offered` is every box the form carries, section by section, for the card
// that could not tick them in for the reader. "Which items do I select" is
// what such a question is really asking, and the boxes are the same boxes
// whatever the review — so the list of them is the closest true answer there
// is. Given, the screen draws all of them and ticks the ones in `groups`,
// which is what the real screen does.
//
// A part the practice has not recorded is said IN the box it belongs to, so an
// empty list never reads as "nothing to tick".
export const pathology = ({
  section = 'Pathology',
  groups = [],
  offered = [],
  ordered = [],
  clinicalDetails = '',
  ticksMissing = '',
  orderedMissing = '',
  detailsMissing = '',
} = {}) => ({
  type: 'pathology',
  section,
  groups: (groups || [])
    .map((g) => ({ heading: String(g && g.heading || ''), tests: (g && g.tests || []).filter(Boolean) }))
    .filter((g) => g.tests.length),
  offered: (offered || [])
    .map((g) => ({ heading: String(g && g.heading || ''), tests: (g && g.tests || []).filter(Boolean) }))
    .filter((g) => g.tests.length),
  ordered: (ordered || []).filter(Boolean),
  clinicalDetails,
  ticksMissing,
  orderedMissing,
  detailsMissing,
});

// Where ONE block came from, when it is not where the rest of the card came
// from. Almost every block inherits the card's `source` and needs nothing here;
// the exception is a block a deterministic rule put on the card — an NG12
// finding, a red flag — where the honest provenance is the rule that fired and
// the words it matched, not the Notebook page the card was built from. Read
// back into the question log so a significant event review can reconstruct why
// a line was on screen. Purely additive: a block without it is unchanged.
export const sourced = (block, source) => (block && source ? { ...block, source } : block);

// Pictures the practice attached to the page the answer came from: a screenshot
// of the screen being described, the form being filled in. They are shown, not
// described — "click the button in the top left" is a sentence, and a screenshot
// of it is the answer. Never generated and never fetched from anywhere else:
// every image here is one somebody at the practice uploaded.
export const images = (items, caption = '') => ({
  type: 'images',
  caption,
  items: (items || [])
    .map((item) => (typeof item === 'string' ? { url: item, alt: '' } : item))
    .filter((item) => item && item.url),
});

// The finished answer. `source` names the notebook pages it was built from, so
// the debug page can show which page each template stands in for, and a real
// answer can carry its provenance without a model being asked to remember it.
// `destination` is where a routing card sends the patient, as an id rather than
// as the words on the card — see lib/templates/accurx-route.mjs, which needs to
// know how senior a card's answer is before it may replace it with a more
// senior one. It is carried only by the cards that route somebody, and the key
// is left off entirely otherwise so every other answer is byte-identical to
// what it was before this existed.
// `flag` marks an answer the practice should hear about — a referral its notes
// do not record. Shown on the card and written into the question log, so the
// gap is counted rather than met with a shrug at the desk.
export const answer = ({ title, subtitle = '', blocks, source = [], warn = '', destination = '', flag = '' }) => ({
  title,
  subtitle,
  blocks: blocks.filter(Boolean),
  source,
  warn,
  ...(destination ? { destination } : {}),
  ...(flag ? { flag } : {}),
});
