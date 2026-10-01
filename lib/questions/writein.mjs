// WRITING ANSWERS INTO THE NOTEBOOK.
//
// An answered question is useful for an afternoon; the Notebook is what the
// assistant reads. This is the step between: every answered question that has
// not been written in yet is taken to the page it belongs on, and that page is
// rewritten to carry what the answer establishes - new information added where
// it fits, and anything the answer contradicts corrected. Nothing is saved by
// any of this: the server proposes, the reader sees every page's change, and
// only then is anything written (lib/questions/writein.js).
//
// This module is the part with no database or network in it: the prompts,
// which page each question goes to, and the checks a rewrite has to pass
// before it is shown as safe to apply. Tested directly.
import { stripQuestionMarks } from '../notebook/questions.mjs';

/** At most this many questions are written in per run; the rest wait for the next. */
export const MAX_PER_RUN = 40;

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** "Section / Page" for a page, from the notes it sits under. */
export function pagePath(note, byId) {
  const titles = [];
  const seen = new Set();
  for (let cur = note; cur && !seen.has(cur.id); cur = cur.parentId == null ? null : byId.get(cur.parentId)) {
    seen.add(cur.id);
    titles.unshift(oneLine(cur.title) || 'Untitled');
  }
  return titles.join(' / ');
}

/** A page is somewhere an answer can go: under a section, and not a section itself. */
export const isWritablePage = (n) => !!n && n.parentId != null && !n.isSection;

/**
 * The prompt that picks a page for each question that does not already have
 * one. Pages are listed by id and path with the start of what they say, which
 * is enough to place a question and keeps a large Notebook inside one call.
 */
export function routePrompt(pages, questions) {
  const snippet = pages.length > 300 ? 0 : 140;
  const pageLines = pages.map((p) => {
    const start = snippet ? oneLine(stripQuestionMarks(p.body).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#*_>|`-]+/g, ' ')).slice(0, snippet) : '';
    return `${p.id} | ${p.path}${start ? ' | ' + start : ''}`;
  });
  const qLines = questions.map((q) => `${q.id}. Q: ${oneLine(q.question)}\n    A: ${oneLine(q.answer).slice(0, 600)}`);
  return `You file answered questions into a GP practice's internal notebook.

For each question below, choose the ONE existing notebook page whose subject it belongs to, by that page's id. A page fits when a member of staff looking for this answer would open that page. Prefer the most specific page. Only when no page is about the subject at all, give noteId null and a short, plain page title for a new page (e.g. "Podiatry referrals").

PAGES (id | section / title | how it starts):
${pageLines.join('\n')}

QUESTIONS:
${qLines.join('\n')}

Return one placement for every question id.`;
}

/**
 * The prompt that writes a page's answers into it. For a new page `body` is
 * empty and the page is written from the answers alone.
 */
export function writePrompt({ title, body, questions }) {
  const qa = questions.map((q, i) => `${i + 1}. Question: ${oneLine(q.question)}${q.quote ? `\n   (asked about the words "${oneLine(q.quote)}")` : ''}\n   Answer: ${String(q.answer || '').trim()}`).join('\n');
  const isNew = !String(body || '').trim();
  const rules = `Content rules — never break these:
- Treat each answer as fact. Keep its names, phone numbers, times, doses and form names exactly as written.
- Write the answers in as part of the page, in the page's own style — never as a "Q:"/"A:" pair, and never as a note that a question was asked.
- Markdown only: ## and ### headings, lists, | tables |, > quotes, **bold**. You may also use <mark>, <u>, <kbd> and <span style="color:#d5281b|#007f3b|#005eb8">. No other HTML.
- Do not add a # title — the page already has one.
- Output ONLY the page text. No preamble, no explanation, no code fences.`;

  if (isNew) {
    return `You write pages for a GP practice's internal notebook, which reception staff read and an assistant answers from.

Write a new page titled "${oneLine(title)}" from the answered questions below: a short, clear reference page that says what the answers establish, organised under ## headings where there is more than one topic.

${rules}

ANSWERED QUESTIONS:
${qa}`;
  }

  return `You maintain a page of a GP practice's internal notebook, which reception staff read and an assistant answers from. Colleagues asked the questions below about this page and they have been answered. Update the page so it carries what the answers establish.

- New information: add it where it belongs on the page — in the right section, list or table.
- Contradictions: where an answer contradicts the page, the answer is correct. Change the page to match it, and remove the wrong version rather than keeping both.
- Everything else stays exactly as it is: same wording, order, headings, formatting, tables, images (![alt](url) lines, character for character) and HTML. This is an edit, not a rewrite.
- The page may contain question markers: <span data-q="ID">words</span>. Keep every one exactly as written.
${rules}

PAGE "${oneLine(title)}":
${body}

ANSWERED QUESTIONS:
${qa}`;
}

/** A model's page text without an accidental code fence round it. */
export function cleanPage(text) {
  return String(text || '').replace(/^\s*```(?:markdown|md)?\n([\s\S]*?)\n```\s*$/, '$1').trim();
}

const normTitle = (t) => oneLine(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Which page each question goes to.
 *
 * A question asked on a Notebook page goes back to that page while the page
 * exists. Everything else goes where the model placed it; a placement naming
 * a page that is not a page, or no placement at all, becomes a new page, so
 * no answered question is silently dropped. New pages with the same title are
 * one page.
 *
 * @returns {Array<{key:string, noteId:number|null, title:string, questions:object[]}>}
 */
export function groupQuestions(questions, placements, notes) {
  const byId = new Map(notes.map((n) => [Number(n.id), n]));
  const placed = new Map((placements || []).map((p) => [Number(p.id), p]));
  const groups = new Map();
  const add = (key, noteId, title, q) => {
    if (!groups.has(key)) groups.set(key, { key, noteId, title, questions: [] });
    groups.get(key).questions.push(q);
  };
  for (const q of questions) {
    const own = q.origin === 'notebook' ? byId.get(Number(q.noteId)) : null;
    if (isWritablePage(own)) { add('note:' + own.id, own.id, own.title, q); continue; }
    const p = placed.get(Number(q.id));
    const target = p && p.noteId != null ? byId.get(Number(p.noteId)) : null;
    if (isWritablePage(target)) { add('note:' + target.id, target.id, target.title, q); continue; }
    const title = oneLine(p && p.newTitle) || oneLine(q.question).replace(/\?+$/, '').slice(0, 80) || 'Answered questions';
    add('new:' + normTitle(title), null, title, q);
  }
  return [...groups.values()];
}

// Numbers worth noticing if they vanish: phone numbers, times, codes, doses.
const NUMBER_RE = /\d[\d :.\/-]{1,}\d/g;
const numbersIn = (text) => new Set((String(text || '').match(NUMBER_RE) || []).map((n) => n.replace(/[\s-]/g, '')));

/**
 * What a reader should look at before applying a rewrite. Not a refusal -
 * fixing a contradiction can rightly change a number - but said plainly.
 */
export function rewriteWarnings(before, after, questions = []) {
  const warnings = [];
  const was = stripQuestionMarks(before).trim();
  const now = stripQuestionMarks(after).trim();
  if (!now) return ['The rewrite came back empty.'];
  if (was.length > 200 && now.length < was.length * 0.6) {
    warnings.push('The page is much shorter than before — check nothing was dropped.');
  }
  const answers = numbersIn(questions.map((q) => q.answer).join(' '));
  const keptNow = numbersIn(now);
  const gone = [...numbersIn(was)].filter((n) => !keptNow.has(n) && !answers.has(n));
  if (gone.length) {
    warnings.push('No longer on the page: ' + gone.slice(0, 4).join(', ') + (gone.length > 4 ? '…' : '') + '. Check that was meant.');
  }
  return warnings;
}
