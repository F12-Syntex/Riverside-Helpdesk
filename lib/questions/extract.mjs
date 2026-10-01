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
import { isCollectableQuestion } from './gaps.mjs';
import { cleanPoints, cleanTitle, questionKey } from './template.mjs';

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

Return each one in this template:
- "title": a short label for what the question is about, 2-8 words, taken from
  the text's own words. Keep any code or reference in brackets, e.g.
  "Chest pain clinic type (C15)".
- "points": every fact in the text that gives this question its context, one
  per item, WORD FOR WORD. Copy the wording exactly as written - names, codes,
  quoted labels, pathways, numbers and punctuation included. Never shorten,
  summarise, reword or leave out a detail; when a fact is long, keep it long.
  [] only when the text gives no context for it.
- "question": the question itself, in the text's own words. Only tidy it when
  it is merely implied, into one clear question ending in a question mark.

Rules:
- Keep everything. A detail that seems minor to you may be the one the person
  answering needs; when in doubt, include it as a point.
- NEVER include patient-identifiable information: no patient names, dates of
  birth, NHS numbers, addresses or phone numbers of patients. Replace just
  those words with "a patient" and keep the rest of the sentence as written.
  Staff names and roles may stay.
- Only merge two questions when they are the same question word for word.
- Skip greetings and sign-offs. Do not invent questions or facts the text does
  not contain.

Reply with ONLY a JSON object of this shape, and nothing else:
{"questions":[{"title":"...","points":["...","..."],"question":"..."}]}

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
 * @returns {{title:string, points:string[], question:string, detail:string}[]}
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
    const title = typeof item === 'string' ? '' : cleanTitle(item && item.title);
    // An older-shaped reply's "detail" is kept, as a point, rather than lost.
    const points = typeof item === 'string' ? [] : cleanPoints([
      ...(Array.isArray(item && item.points) ? item.points : []),
      ...(item && item.detail ? [clean(item.detail, MAX_DETAIL)] : []),
    ]);
    const key = questionKey({ title, question: q });
    if (!q || !key || seen.has(key) || !isCollectableQuestion(q)) continue;
    seen.add(key);
    out.push({ title, points, question: q, detail: '' });
    if (out.length >= MAX_FOUND) break;
  }
  return out;
}
