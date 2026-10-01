// THE SHAPE OF A QUESTION.
//
// A question on its own ("Which clinic type do we select?") cannot be
// answered by somebody who was not there when it came up. So a question is
// three things:
//
//   title     what it is about, as a short label:   Chest pain clinic type (C15)
//   points    the facts that frame it, word for word as they were given:
//               - Rapid Access Chest Pain Clinic card: speciality Cardiology, …
//               - All specialities and clinic types list: Cardiology has both …
//   question  the question itself:                   Which clinic type do we select?
//
// Older questions were stored as a question and a free "detail" note; the AI
// tidy-up on /questions turns those into this shape (REFORMAT_PROMPT), and
// the bulk paste produces it directly (lib/questions/extract.mjs). This module
// is the part with no network or database in it: cleaning each part, reading
// pasted points, and reading the model's replies. Tested directly.
import { normaliseQuestion } from './gaps.mjs';

export const MAX_TITLE = 120;
export const MAX_POINT = 600;
export const MAX_POINTS = 20;

/** A title: one line, trimmed, capped. */
export function cleanTitle(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().replace(/[:\s]+$/, '').slice(0, MAX_TITLE);
}

/**
 * The context points, from an array or from pasted text with one per line.
 * Bullet marks ("* ", "- ", "• ", "1. ") come off the front; the words are
 * otherwise kept exactly - this is the reader's own wording and is never
 * rephrased here.
 */
export function cleanPoints(value) {
  const list = Array.isArray(value) ? value : String(value == null ? '' : value).split(/\r?\n/);
  const out = [];
  for (const raw of list) {
    const text = String(raw == null ? '' : raw)
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(?:[*\-•–·]|\d+[.)])\s+/, '')
      .trim();
    if (text) out.push(text.slice(0, MAX_POINT));
    if (out.length >= MAX_POINTS) break;
  }
  return out;
}

/** The key two askings of the same question share: its title and its wording. */
export function questionKey({ title = '', question = '' } = {}) {
  return normaliseQuestion([cleanTitle(title), question].filter(Boolean).join(' '));
}

/**
 * Text pasted in the template's own shape - a title line, bullet points and
 * a "Question:" line - read into its parts. Anything that is not in that
 * shape comes back as `null`, and the caller treats it as a plain question.
 *
 *   Chest pain clinic type (C15)
 *   * Rapid Access Chest Pain Clinic card: …
 *   * Question: Which clinic type do we select?
 */
export function parseTemplate(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  let question = '';
  const rest = [];
  for (const line of lines) {
    const m = line.replace(/^(?:[*\-•–·]|\d+[.)])\s+/, '').match(/^(?:question|q)\s*[:\-–]\s*(.+)$/i);
    if (m && !question) question = m[1].trim();
    else rest.push(line);
  }
  // No "Question:" line: a last line ending in "?" is the question.
  if (!question && rest.length >= 2 && /\?\s*$/.test(rest[rest.length - 1])) {
    question = rest.pop().replace(/^(?:[*\-•–·]|\d+[.)])\s+/, '');
  }
  if (!question) return null;
  const bullet = /^(?:[*\-•–·]|\d+[.)])\s+/;
  const title = rest.length && !bullet.test(rest[0]) ? rest.shift() : '';
  return { title: cleanTitle(title), points: cleanPoints(rest), question: question.replace(/\s+/g, ' ').trim() };
}

export const REFORMAT_PROMPT = `You tidy a GP practice's list of open questions into one template, so each
question can be understood by someone who was not there when it was asked.

The template has three parts:
- "title": a short label for what the question is about, 2-8 words, taken from
  the words already there. Keep any code or reference in brackets, e.g.
  "Chest pain clinic type (C15)".
- "points": the facts that give the question its context, one per item. Take
  them WORD FOR WORD from the question and its notes: copy the wording exactly,
  including names, codes, quotes and punctuation. Split a note into separate
  points where it lists separate facts, but never shorten, summarise, reword or
  drop anything. [] when there is no context.
- "question": the question itself, as it was asked. Only move context out of it
  into points when the question carries a long preamble; otherwise keep it
  exactly as written.

Never add facts that are not in the text. Every word of the original question
and notes must appear in the title, the points or the question.

For each item below, return {"id": <its id>, "title": "...", "points": [...], "question": "..."}.
Reply with ONLY a JSON object: {"items":[...]}

ITEMS:
`;

/** The prompt's ITEMS block for some rows. */
export function reformatItems(rows) {
  return rows.map((r) => JSON.stringify({
    id: Number(r.id),
    question: String(r.question || ''),
    notes: String(r.detail || ''),
    ...(r.quote ? { askedAboutTheWords: String(r.quote) } : {}),
    ...(r.noteTitle ? { onTheNotebookPage: String(r.noteTitle) } : {}),
  })).join('\n');
}

function readJson(raw) {
  const text = String(raw || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(text); } catch (e) { /* fall through */ }
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (e) { return null; }
}

/**
 * The model's reformat, read and checked against the rows it was given: only
 * ids that were sent, each once, and never an empty question.
 */
export function parseReformatted(raw, rows) {
  const data = readJson(raw);
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
  const wanted = new Map(rows.map((r) => [Number(r.id), r]));
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const id = Number(item && item.id);
    if (!wanted.has(id) || seen.has(id)) continue;
    const question = String((item && item.question) || '').replace(/\s+/g, ' ').trim();
    if (!question) continue;
    seen.add(id);
    out.push({ id, title: cleanTitle(item.title), points: cleanPoints(item.points), question: question.slice(0, 400) });
  }
  return out;
}

/** Normalise a row read back from the database: points as a clean array. */
export function rowPoints(value) {
  if (Array.isArray(value)) return cleanPoints(value);
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try { return cleanPoints(JSON.parse(value)); } catch (e) { return []; }
  }
  return [];
}
