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

// A titled panel of label/value rows. Every value is the same size: making the
// important ones bigger read as two different kinds of thing on one card and
// made the panel harder to scan, not easier. Importance is carried by WHAT IS
// IN THE PANEL — put only the values the reader has to type in it, and move the
// rest behind a disclosure.
export const fields = (items, title = '') => ({ type: 'fields', title, items: items.filter(Boolean) });
export const field = (label, value, { missing = '' } = {}) => ({ label, value, missing });

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
export const answer = ({ title, subtitle = '', blocks, source = [], warn = '' }) => ({
  title,
  subtitle,
  blocks: blocks.filter(Boolean),
  source,
  warn,
});
