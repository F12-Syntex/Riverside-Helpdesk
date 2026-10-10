// What a search is asked for: the words fed to Postgres full-text search, and
// the text a Notebook shortlist searches with. Pure, so both are tested without
// a database.

const MAX_WORDS = 24;
const ATTACHED_CHARS = 1000;
const PREVIOUS_CHARS = 1000;
const QUERY_CHARS = 2000;

/**
 * The question's words, ORed, for `to_tsquery('english', …)`.
 *
 * OR, NOT AND. A natural-language question under AND matches almost nothing:
 * no page contains "how", "do", "refer", "district" and "nurse" all at once,
 * and the one that comes close is ranked no better than a page that has only
 * "district nurse". Under OR every page sharing a word is a candidate and
 * ts_rank_cd puts the one sharing the most, closest together, first. Stop
 * words are left in: to_tsquery drops them itself, and dropping them here would
 * mean keeping a second, drifting English stop list.
 *
 * Only `[a-z0-9]+` survives, so nothing the user typed can be read as tsquery
 * syntax (`&`, `!`, `:*`, `<->`, quotes) — a malformed tsquery is an error,
 * and an error here would cost the turn its shortlist. One-letter fragments
 * ("o" of o'brien, "s" of a possessive) match half the Notebook and go.
 */
export function orQuery(text) {
  const words = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const unique = [...new Set(words.filter((w) => w.length >= 2))];
  return unique.slice(0, MAX_WORDS).join(' | ');
}

// The last thing the staff member asked before this message, from the
// transcript the browser sends (app/_components/QaApp.jsx buildHistory): one
// line per turn, the staff member's starting "Staff member: ", the assistant's
// starting "The assistant". A message typed over several lines continues on
// lines with no label, so the block runs until the next assistant line.
function previousUserMessage(history) {
  const lines = String(history || '').split(/\r?\n/);
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^Staff member:/i.test(lines[i])) { start = i; break; }
  }
  if (start < 0) return '';
  const block = [lines[start].replace(/^Staff member:\s*/i, '')];
  for (let i = start + 1; i < lines.length && !/^The assistant\b/i.test(lines[i]); i++) block.push(lines[i]);
  return block.join('\n').trim();
}

/**
 * The text a Notebook shortlist is searched with.
 *
 * THE PREVIOUS USER MESSAGE IS PART OF IT. "And for children?" names nothing;
 * the page it is about was named one message earlier. Searching without it
 * would shortlist pages about children and drop the very page the follow-up is
 * asking about. Only the staff member's words are used: the assistant's answer
 * is the page already found, and repeating it would bias every follow-up back
 * to the first answer even when the subject has moved on.
 *
 * THE QUESTION COMES FIRST. orQuery keeps the first 24 words and the whole is
 * capped at 2000 characters, so whatever is first survives a long message.
 * That has to be what is being asked now; the earlier message and any
 * attached text (first 1000 characters — enough to say what a letter is about)
 * only add to it.
 */
export function shortlistQuery({ question = '', history = '', attached = '' } = {}) {
  return [
    String(question || '').trim(),
    previousUserMessage(history).slice(0, PREVIOUS_CHARS).trim(),
    String(attached || '').slice(0, ATTACHED_CHARS).trim(),
  ].filter(Boolean).join('\n').slice(0, QUERY_CHARS).trim();
}
