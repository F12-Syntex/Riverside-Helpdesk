// Pulling questions out of a pasted wall of text — the rules half.
//
// /questions lets somebody paste a meeting's notes, an email thread or a
// scribbled list and have the model find the questions in it. The model call
// lives in app/api/questions/extract/route.js; everything that decides what
// comes back to the page lives here, with no network in it, so it is tested
// directly (test/questions-extract.test.mjs).
//
// NOTHING IS SAVED BY EXTRACTING. The page shows what was found as a list the
// person ticks, edits and then adds — the same POST a single question uses, so
// the dedupe and the "asked again" count behave exactly as if each had been
// typed into the box.
import { isCollectableQuestion, normaliseQuestion } from './gaps.mjs';

export const MAX_PASTE = 30000;
export const MAX_FOUND = 60;
const MAX_QUESTION = 400;
const MAX_DETAIL = 2000;

export const EXTRACT_PROMPT = `You help the reception team of a UK GP practice keep a list of questions
that the practice has not yet written the answer to.

Below is text somebody has pasted: meeting notes, an email, a chat log, a list,
or a mixture. Find every distinct question in it about how the practice works,
including ones that are only implied ("not sure who orders the flu vaccines"
is the question "Who orders the flu vaccines?").

For each one:
- "question": rewrite it as one clear, self-contained question in plain British
  English, ending in a question mark. Fix spelling. Keep it under 200 characters.
  It must make sense on its own, without the rest of the text.
- "detail": any useful context from the text that goes with it (who raised it,
  what has been tried, why it matters), as one or two short sentences. "" if none.

Rules:
- NEVER include patient-identifiable information: no patient names, dates of
  birth, NHS numbers, addresses or phone numbers of patients. Generalise instead
  ("a patient", "a child"). Staff names and roles may stay.
- Merge duplicates and near-duplicates into one question.
- Skip greetings, sign-offs, rhetorical questions, and things that are already
  answered in the text itself.
- Do not invent questions that the text does not raise.

Reply with ONLY a JSON object of this shape, and nothing else:
{"questions":[{"question":"...","detail":"..."}]}

TEXT:
`;

const clean = (value, max) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * The model's reply, read into the list the page shows.
 *
 * Tolerant of the usual ways a reply goes wrong — a code fence round the JSON,
 * a bare array instead of the object, prose before it, strings instead of
 * objects — and strict about what it lets through: every question is one the
 * store would accept, none is empty, and none appears twice.
 *
 * @param {string} raw  the model's message content
 * @returns {{question:string, detail:string}[]}
 */
export function parseExtracted(raw) {
  const text = String(raw || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    // Prose round the JSON: take the outermost object or array in it.
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) { try { data = JSON.parse(match[0]); } catch (e2) { data = null; } }
  }
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.questions) ? data.questions : []);

  const seen = new Set();
  const out = [];
  for (const item of list) {
    const q = clean(typeof item === 'string' ? item : item && item.question, MAX_QUESTION);
    const detail = typeof item === 'string' ? '' : clean(item && item.detail, MAX_DETAIL);
    const key = normaliseQuestion(q);
    if (!q || !key || seen.has(key) || !isCollectableQuestion(q)) continue;
    seen.add(key);
    out.push({ question: q, detail });
    if (out.length >= MAX_FOUND) break;
  }
  return out;
}
