// Settling a disagreement, in code.
//
// When the reader settles two pages that disagree, what changes is exactly the
// lines they were shown, changed to exactly the wording they left in the box.
// No model takes part: the reader is the author of every word written here.
// Anything that would make the edit something they did not see — the line has
// moved, been edited since, or appears twice on the page — is refused rather
// than guessed at.
//
// Where the reader takes the other page's field line ("Send to: …"), only the
// value moves, so the corrected page keeps its own layout and gains the agreed
// fact. That merge is `mergeWording`, and the browser previews the edit with
// it before the reader commits — the same function the server then runs, so
// what they are shown is what is written.
//
// Pure and browser-safe. The read and the write are in lib/notebook/run.js.
import { splitSentences } from './sentences.mjs';
import { fieldOf } from './rules.mjs';

/**
 * The line `from` becomes when the reader chooses the wording `winner`.
 * Two field lines of the same label exchange only their values.
 */
export function mergeWording(from, winner) {
  const was = String(from || '');
  const to = String(winner || '');
  const fw = fieldOf(to);
  const fl = fieldOf(was);
  if (fw && fl && fw.field === fl.field) {
    const at = was.lastIndexOf(fl.value);
    if (at > -1) return was.slice(0, at) + fw.value + was.slice(at + fl.value.length);
  }
  return to;
}

/**
 * Replace one line of a page, and nothing else.
 *
 * @param {{ body: string, sentenceId: string, expect: string, winner: string,
 *           verbatim?: boolean }} args
 *   verbatim: the wording is the reader's own, so take it exactly as typed
 *             rather than merging it into the line it replaces.
 * @returns {{ body: string, from: string, to: string } | { error: string } | { unchanged: true }}
 */
export function settleStatement({ body, sentenceId, expect, winner, verbatim = false }) {
  const text = String(body || '').replace(/\r\n/g, '\n');
  const from = String(expect || '');
  if (!from) return { error: 'There is no wording recorded for that side.' };

  let start = -1;
  let end = -1;
  const found = splitSentences(text).find((s) => s.id === sentenceId);
  if (found && found.text === from) {
    start = found.start;
    end = found.end;
  } else {
    const first = text.indexOf(from);
    if (first === -1) return { error: 'That line is no longer on the page as it was read. Open the page and settle it there.' };
    if (text.indexOf(from, first + 1) !== -1) return { error: 'That line appears more than once on the page. Open the page and settle it there.' };
    start = first;
    end = first + from.length;
  }

  const to = verbatim ? String(winner || '').trim() : mergeWording(from, winner);
  if (!to) return { error: 'There is no wording recorded for the side you chose.' };
  if (to === from) return { unchanged: true };
  // A line is one line: a reader's edit that ran over several is flattened
  // rather than silently splitting the page's structure underneath them.
  const line = to.replace(/[ \t]*\r?\n[ \t]*/g, ' ').trim();

  return { body: text.slice(0, start) + line + text.slice(end), from, to: line };
}
