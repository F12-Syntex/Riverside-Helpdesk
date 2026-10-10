// THE ANSWER CHECK: does what we are about to show actually answer what was asked?
//
// Every other guard in the turn checks an answer against its SOURCE — a number
// the Notebook does not contain is redacted, a referral value not found on its
// page is dropped, a /practice quote not found in its passage is deleted. None
// of them asks whether the answer is an answer to THIS QUESTION. A correct,
// verbatim page about phlebotomy hours is still the wrong thing to show
// somebody who asked about the district nurse, and every check above passes it.
//
// So, before a Notebook answer goes out, one closed question goes to a decision
// model (lib/ai/decisions.mjs, the `check` role on /settings): given the
// question, the answer as the reader will see it, and the pages it came from,
// how likely is it that the answer gives the reader what they asked for? The
// reply is one number, and code decides what it means:
//
//   below 0.5   the answer is not shown. The reader is told plainly that the
//               Notebook does not cover this, given the closest pages, and the
//               question is filed on /questions as one the notes cannot answer.
//   0.5 – 0.8   the answer is shown, with one line asking the reader to check
//               it against the page before acting on it.
//   0.8 and up  the answer is shown unchanged.
//
// A CHECK THAT FAILS CHANGES NOTHING. No key, a refused request, or no reply
// within three seconds, and the answer goes out exactly as it would have
// without the check — which is also why there is no switch for it. The check
// can only ever take an answer away or add a line under it; it can never write
// one.
//
// WHAT IT IS SENT. The question as it reached the endpoint (after identifier
// redaction), the staff member's previous message when there is one — "and for
// children?" is not a question on its own, and the check would otherwise fail
// every follow-up — the answer as text, and the text of the Notebook pages it
// came from. Nothing else: no attachment, no picture, no conversation beyond
// that one line. A turn with an attachment or a picture is not checked at all,
// because its answer stands on material the check is not shown.
//
// Pure: no network and no database. The caller passes `decide` in, so the band
// logic, the request and the failure path are tested directly.
import { answer, bullets, note } from '../templates/blocks.mjs';
import { notebookHref } from '../notebook/links.mjs';

// STARTING VALUES. Chosen from a handful of live pairs (a right district-nurse
// answer scored 0.88 and 0.94 on two asks; a district-nurse question answered
// with phlebotomy hours 0.02; generic maternity advice for a fax number 0.01),
// not from labelled turns. They are the numbers to tune once the question log
// has a few hundred `check` scores against staff verdicts.
export const CHECK_UNKNOWN_BELOW = 0.5;
export const CHECK_CONFIRM_BELOW = 0.8;

// The check sits on the critical path, in front of an answer that is already
// written. Jev answers in about 300 ms warm and 1.2 s cold; three seconds is
// enough for both and short enough that a stalled provider costs the reader
// little.
export const CHECK_TIMEOUT_MS = 3000;

// What fits. Jev reads 32k tokens; the source pages are cut to about 18k of
// them (four characters a token, roughly), the answer to about 6k, leaving room
// for the question and the instructions.
export const CHECK_SOURCE_CHARS = 72_000;
export const CHECK_ANSWER_CHARS = 24_000;
const QUESTION_CHARS = 2_000;
const PREVIOUS_CHARS = 500;

// The pages offered when the answer is withdrawn.
export const CLOSEST_PAGES = 3;

// The templates that answer FROM THE NOTEBOOK, and so the ones checked: a page
// shown as the practice wrote it, and a referral card read off a pathway page.
// The other cards are code — a filing title, a triage ladder, the registration
// steps — whose shape was decided before any question was asked.
export const CHECKED_TEMPLATES = ['notebook', 'referral'];

export const CHECK_NAME = 'answers';
export const CHECK_QUESTIONS = {
  [CHECK_NAME]: {
    type: 'noul',
    instructions: 'Does the answer actually answer the question that was asked, using the practice information it was given?',
    criteria: {
      true: 'It gives the reader what they asked for',
      false: 'It answers a different question, is vague or generic, or does not give what was asked.',
    },
  },
};

/**
 * What a score means. 'unknown' withdraws the answer, 'confirm' adds the line,
 * 'pass' leaves it alone — and so does anything that is not a number, because
 * a check that did not come back must not change what the reader sees.
 */
export function checkBand(score) {
  const n = typeof score === 'number' ? score : NaN;
  if (!Number.isFinite(n)) return 'pass';
  if (n < CHECK_UNKNOWN_BELOW) return 'unknown';
  if (n < CHECK_CONFIRM_BELOW) return 'confirm';
  return 'pass';
}

/**
 * Should this answer be checked at all?
 *
 * A prose answer always (it is the model's own writing, from the shortlist). A
 * card only when it was built from the Notebook, and not when it already says
 * it has nothing — a "not recorded" card is the honest answer the check would
 * only produce again. Never a turn with pictures or an attachment: its answer
 * stands on material the check is not shown, and must not be sent.
 */
export function shouldCheck({ prose = false, picked = '', card = null, images = 0, attachments = 0 } = {}) {
  if (images > 0 || attachments > 0) return false;
  if (prose) return true;
  if (!card || card.flag) return false;
  return CHECKED_TEMPLATES.includes(String(picked || ''));
}

const cut = (value, max) => String(value == null ? '' : value).trim().slice(0, max);

/**
 * The Notebook pages an answer was built from, by the titles it cites —
 * matched the way the provenance matches them (lib/questions/provenance.mjs),
 * so the check reads the same pages the log says the answer stood on.
 */
export function pagesForSources(titles = [], pages = []) {
  const found = [];
  for (const title of titles || []) {
    const want = String(title || '').toLowerCase().trim();
    if (!want) continue;
    const page = (pages || []).find((p) => String(p.docTitle || '').toLowerCase().includes(want));
    if (page && !found.includes(page)) found.push(page);
  }
  return found;
}

/**
 * The state the decision model reads. Pages go in the order given — the ones
 * the answer was built from first — and are cut at the budget, so a long
 * Notebook can only lose its least relevant pages.
 */
export function checkState({ question = '', previous = '', answer: shown = '', pages = [] } = {}) {
  let room = CHECK_SOURCE_CHARS;
  const parts = [];
  const seen = new Set();
  for (const page of pages || []) {
    if (!page || room <= 0 || seen.has(page.docId || page.docTitle)) continue;
    seen.add(page.docId || page.docTitle);
    const block = `### ${String(page.docTitle || '').replace(/^notebook:\s*/i, '')}\n${String(page.text || '').trim()}`;
    parts.push(block.slice(0, room));
    room -= block.length + 2;
  }
  const state = {
    question: cut(question, QUESTION_CHARS),
    answer: cut(shown, CHECK_ANSWER_CHARS),
    sources: parts.join('\n\n'),
  };
  const before = cut(previous, PREVIOUS_CHARS);
  if (before) state.previousQuestion = before;
  return state;
}

/**
 * Run the check. Never throws.
 *
 * Returns `{ score, model, ms, band }` when the model answered, and
 * `{ error, model, ms, band: 'pass' }` when it did not — the caller can apply
 * the band either way and a failure changes nothing.
 */
export async function runAnswerCheck({ decide, model, question, previous = '', answer: shown, pages = [], signal = null, onUsage = null } = {}) {
  const began = Date.now();
  try {
    const out = await decide({
      model,
      state: checkState({ question, previous, answer: shown, pages }),
      questions: CHECK_QUESTIONS,
      timeoutMs: CHECK_TIMEOUT_MS,
      signal,
    });
    const reply = out && out.answers ? out.answers[CHECK_NAME] : null;
    const score = reply ? Number(reply.noul) : NaN;
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('the check returned no score');
    if (onUsage && out.usage) {
      try { onUsage(out.usage, out.model || model); } catch (e) { /* the measurement is worth less than the answer */ }
    }
    const rounded = Math.round(score * 1000) / 1000;
    return { score: rounded, model: out.model || model, ms: Date.now() - began, band: checkBand(rounded) };
  } catch (e) {
    const message = e && e.name === 'TimeoutError' ? `no reply within ${CHECK_TIMEOUT_MS} ms` : String((e && e.message) || e);
    return { error: message.slice(0, 200), model: model || '', ms: Date.now() - began, band: 'pass' };
  }
}

// "Notebook: Referrals / District nurse" -> its own name, and where it sits.
function pageLabel(page) {
  const path = String(page.docTitle || '').replace(/^notebook:\s*/i, '').split('/').map((s) => s.trim()).filter(Boolean);
  const name = path.pop() || '';
  return { name, under: path.join(' › ') };
}

/**
 * The pages to offer when the answer is withdrawn: what search ranked closest,
 * when it ranked anything. A whole-Notebook fallback is the Notebook in its own
 * order, not a ranking, so it offers the pages the withdrawn answer came from
 * instead — the nearest thing to "closest" it has.
 */
export function closestPages({ shortlist = null, fallback = [], prefer = [] } = {}) {
  const ranked = shortlist && !shortlist.full ? shortlist.pages || [] : [];
  const pick = [];
  // `prefer` first: the pages a withdrawn written answer itself pointed to.
  // The writer is told to name the closest page when it cannot answer, and it
  // read the pages; search only ranked them.
  for (const page of [...(prefer || []), ...(ranked.length ? ranked : fallback || [])]) {
    if (page && !pick.some((p) => (p.docId || p.docTitle) === (page.docId || page.docTitle))) pick.push(page);
  }
  return pick.slice(0, CLOSEST_PAGES).map((page) => {
    const { name, under } = pageLabel(page);
    const id = String(page.docId || '').match(/^note:(\d+)/);
    return { title: name, under, href: id ? notebookHref({ id: Number(id[1]), title: name }) : '' };
  }).filter((p) => p.title);
}

/**
 * The Notebook pages a piece of writing names, in the order it names them —
 * by the page's own title, the last part of its path. Titles shorter than
 * MIN_NAMED characters ("Start", "Bloods") are left out: they turn up in
 * sentences that are not naming a page.
 */
const MIN_NAMED = 8;
export function pagesNamedIn(markdown = '', pages = []) {
  const text = String(markdown || '').toLowerCase();
  if (!text) return [];
  const hits = [];
  for (const page of pages || []) {
    const { name } = pageLabel(page);
    if (name.length < MIN_NAMED) continue;
    const at = text.indexOf(name.toLowerCase());
    if (at >= 0) hits.push({ page, at });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.page);
}

/**
 * The answer a withdrawn answer is replaced with.
 *
 * Said in as few words as it can be, the way the "not recorded" referral card
 * says it: it is not here, these are the nearest pages, and — when it has
 * been — that the practice has been told. The page names are written out
 * rather than linked: the chat cards render no links, and the reader finds a
 * page by its name in Practice notes.
 */
export function unknownAnswer({ closest = [], filed = false } = {}) {
  return answer({
    title: 'Not in the Notebook',
    subtitle: 'The practice’s notes do not answer this',
    ...(filed ? { flag: 'unknown' } : {}),
    blocks: [
      note('I don’t know — the practice’s Notebook does not cover this, so no answer is shown rather than one that does not answer the question.', 'warn'),
      closest.length
        ? bullets(closest.map((p) => `**${p.title}**${p.under ? ' — Practice notes › ' + p.under : ''}`), 'Closest pages')
        : null,
      bullets([
        'Ask the practice manager or the secretaries.',
        filed
          ? 'This question has been added to the open questions, so the answer can be written into the Notebook.'
          : 'If the answer should be in the Notebook, add it under Open questions.',
      ]),
    ],
    source: [],
  });
}

// The line under a doubtful answer. Names the page when there is one, so the
// reader knows exactly what to check it against.
function confirmText(pages = []) {
  const named = (pages || []).map(pageLabel).map((p) => p.name).filter(Boolean).slice(0, 2);
  const against = named.length ? `the page (**${named.join('** and **')}**)` : 'the practice’s page';
  return `Check this against ${against} before acting on it — it may not answer exactly what was asked.`;
}

/** A card with the check line added at the foot. */
export function withConfirmNote(card, pages = []) {
  if (!card) return card;
  return { ...card, blocks: [...(card.blocks || []), note(confirmText(pages), 'warn')] };
}

/** Prose with the check line added as its last paragraph. */
export function withConfirmLine(markdown, pages = []) {
  return `${String(markdown || '').trim()}\n\n${confirmText(pages)}`;
}

/** What the turn's provenance records about the check. */
export function checkProvenance(result) {
  if (!result) return null;
  if (result.error) return { error: result.error, model: result.model, ms: result.ms };
  return { score: result.score, model: result.model, ms: result.ms, band: result.band };
}
