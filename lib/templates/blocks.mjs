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

export const fields = (items) => ({ type: 'fields', items: items.filter(Boolean) });
export const field = (label, value, { key = false, missing = '' } = {}) => ({ label, value, key, missing });

export const steps = (items) => ({ type: 'steps', items: items.filter(Boolean) });
export const bullets = (items) => ({ type: 'bullets', items: items.filter(Boolean) });
export const note = (text, tone = 'info') => ({ type: 'note', tone, text });
export const table = (head, rows) => ({ type: 'table', head, rows });
export const expand = (label, blocks, hint = '') => ({ type: 'expand', label, hint, blocks: blocks.filter(Boolean) });
export const contacts = (items) => ({ type: 'contacts', items: items.filter(Boolean) });
export const text = (markdown) => ({ type: 'text', markdown });
export const ask = (question, options) => ({ type: 'ask', question, options });

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
