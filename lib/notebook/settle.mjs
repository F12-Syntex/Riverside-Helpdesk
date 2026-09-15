// Settling a disagreement, in code.
//
// When the reader says which of two pages is right, the other page is corrected
// to match. That edit is not a rewrite and no model takes part in it: exactly
// one line changes, it is the line the sweep showed the reader, and it is
// changed to the wording they chose. Anything else — the line has moved, been
// edited, or appears twice — is refused, because an edit the reader did not see
// is not a decision they made.
//
// Where both sides are field lines of the same label, only the value moves, so
// the corrected page keeps its own layout ("- **Send to:** …" stays a bullet)
// and gains the agreed fact.
//
// Pure. The read and the write are in lib/notebook/run.js.
import { splitSentences } from './sentences.mjs';
import { fieldOf } from './coherence.mjs';

/**
 * @param {{ body: string, sentenceId: string, expect: string, winner: string }} args
 * @returns {{ body: string, from: string, to: string } | { error: string } | { unchanged: true }}
 */
export function settleStatement({ body, sentenceId, expect, winner }) {
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

  // Same label on both sides: change the value, keep the line.
  let to = String(winner || '');
  const fw = fieldOf(to);
  const fl = fieldOf(from);
  if (fw && fl && fw.field === fl.field) {
    const at = from.lastIndexOf(fl.value);
    if (at > -1) to = from.slice(0, at) + fw.value + from.slice(at + fl.value.length);
  }
  if (!to) return { error: 'There is no wording recorded for the side you chose.' };
  if (to === from) return { unchanged: true };

  return { body: text.slice(0, start) + to + text.slice(end), from, to };
}
