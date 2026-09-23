// The model chooses; this decides what is shown.
//
// WHY THIS EXISTS. The answer used to be prose the model wrote out of the
// Notebook, measured afterwards for how much of it was the practice's own
// wording. Measured, not enforced: a sentence it made up was shown just the
// same, under a banner. A receptionist cannot tell a paraphrase that kept the
// meaning from one that lost it, so the only safe rule is that the model writes
// nothing a receptionist acts on.
//
// WHAT THE MODEL MAY DO. Name pages, from a closed list of ids, and point at the
// words on them. Every pointer is checked here in code:
//   - a page id that was not in front of it is dropped;
//   - a CARD pick is drawn from the note's stored fields by renderKind — the
//     model writes nothing on it, so there is nothing on it to get wrong;
//   - a QUOTE pick must be found, whole and verbatim, on the page it names, and
//     what is shown is then the page's OWN text around it, never the model's
//     copy of it;
//   - the one line the model does write (the lead) may not carry a number, an
//     address or a word that appears in neither the question nor the quotes.
// Nothing surviving is not an error. It is the honest answer: the Notebook
// does not cover this, and here are the pages closest to it.
//
// Pure: no model, no database. See test/verify-answer.test.mjs.
import { normForMatch } from '../ai/quote-match.js';
import { isTypedKind, noteKind, renderKind } from '../notebook/kinds.mjs';
import { answer as templateAnswer, images as imageBlock } from '../templates/blocks.mjs';

export const MAX_PICKS = 3;
export const MAX_NEAREST = 3;
// A quote shorter than this is not a quote, it is a phrase that happens to be
// on the page — "call the patient" is on a dozen of them.
export const MIN_QUOTE_CHARS = 16;
export const LEAD_MAX_WORDS = 24;
export const FALLBACK_LEAD = 'From the notebook:';
export const NOT_COVERED = 'The notebook doesn\u2019t cover this.';

/** The id a page is shown to the model under: its note id, prefixed. */
export const pageRef = (page) => 'p' + String(page?.docId || '').replace(/^note:/, '');

/** The page's own title, without the "Notebook:" prefix or the folders above it. */
export const pageTitle = (page) => {
  const path = Array.isArray(page?.path) ? page.path : [];
  return path.length ? path[path.length - 1] : String(page?.docTitle || '').replace(/^Notebook:\s*/, '');
};

// A page broken into the pieces a quote can be cut from: sentences within
// lines. Each piece keeps the line it came from, so a span that crosses a line
// is put back together with its line break and a list stays a list.
//
// A TABLE ROW IS ONE PIECE, and its cell borders do not count: a model quoting
// "Blood test appointments 07342 068 763" from a table has quoted it, pipes or
// no pipes. Only the borders are loosened — every word must still be there.
const TABLE_ROW = /^\s*\|/;
const TABLE_RULE = /^\s*\|?[\s:|-]*-{3,}[\s:|-]*$/;
const norm = (text) => normForMatch(text).replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();

function pieces(lines) {
  const out = [];
  lines.forEach((line, lineNo) => {
    if (!line.trim() || TABLE_RULE.test(line)) return;
    const split = TABLE_ROW.test(line) ? [line] : line.split(/(?<=[.!?])\s+(?=\S)/);
    for (const sentence of split) {
      if (sentence.trim()) out.push({ raw: sentence, line: lineNo, norm: norm(sentence) });
    }
  });
  return out;
}

// A row shown on its own is a line of pipes. When the span is table rows, the
// table's header and rule go above it, so it renders as the table it came from.
function withTableHeader(lines, firstLine, text) {
  if (!TABLE_ROW.test(lines[firstLine] || '')) return text;
  let top = firstLine;
  while (top > 0 && TABLE_ROW.test(lines[top - 1] || '')) top--;
  if (top === firstLine || !TABLE_RULE.test(lines[top + 1] || '')) return text;
  // The span starts at the header itself, or on the rule: nothing to add.
  if (firstLine <= top + 1) return text;
  return lines[top] + '\n' + lines[top + 1] + '\n' + text;
}

/**
 * Where a quote sits on a page, as the page's own words.
 *
 * The smallest run of whole sentences whose text contains the quote exactly,
 * after both are normalised the same way (lib/ai/quote-match.js — formatting
 * and smart quotes do not count as a difference, words do). Returns that run
 * as the page wrote it, or null when the quote is not on the page.
 */
export function locateQuote(quote, sourceText) {
  const q = norm(quote);
  if (q.length < MIN_QUOTE_CHARS) return null;
  const lines = String(sourceText || '').split(/\r?\n/);
  const parts = pieces(lines);
  // Ends forward, starts backward: the first hit is the earliest-ending span,
  // and the shortest one that ends there.
  for (let j = 0; j < parts.length; j++) {
    let joined = '';
    for (let i = j; i >= 0; i--) {
      joined = joined ? parts[i].norm + ' ' + joined : parts[i].norm;
      if (!joined.includes(q)) {
        // Longer than the quote and still not containing it: reaching further
        // back cannot help.
        if (joined.length > q.length + 400) break;
        continue;
      }
      let text = '';
      for (let k = i; k <= j; k++) {
        if (k > i) text += parts[k].line === parts[k - 1].line ? ' ' : '\n';
        text += parts[k].raw;
      }
      return { start: i, end: j, text: withTableHeader(lines, parts[i].line, text.trim()) };
    }
  }
  return null;
}

const STOP = new Set(('a an and are as at be been but by can do does for from has have how i if in is it its of on or '
  + 'our should so that the their them then there these this to was we what when where which who why will with you your '
  + 'notebook page pages says say see here below above about into out up not no yes any all also just only more most '
  + 'need needs use used using get gets make made one two way ways').split(' '));

const words = (text) => (normForMatch(text).match(/[a-z][a-z'-]*/g) || []);

/**
 * The lead line, if it is safe to show.
 *
 * It is the one thing the model writes, so it is held to what a heading can be:
 * short, no numbers, no email or web addresses, and every word that carries
 * meaning already present in the question, the quotes or the page titles. A
 * lead that introduces a fact fails the last test by construction.
 */
export function checkLead(lead, { question = '', support = [] } = {}) {
  const text = String(lead || '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (/\d/.test(text)) return { ok: false, reason: 'number' };
  if (/@|https?:|www\.|\.(?:com|org|uk|net)\b/i.test(text)) return { ok: false, reason: 'address' };
  if (text.split(' ').length > LEAD_MAX_WORDS) return { ok: false, reason: 'long' };
  const known = new Set([question, ...support].flatMap(words));
  const stem = (w) => w.replace(/(?:'s|ing|ed|es|s)$/, '');
  const knownStems = new Set([...known].map(stem));
  const stranger = words(text).find((w) => w.length > 3 && !STOP.has(w) && !known.has(w) && !knownStems.has(stem(w)));
  if (stranger) return { ok: false, reason: 'unsupported word: ' + stranger };
  return { ok: true, text };
}

/**
 * The pages closest to a question, for a decline. Word overlap with the title
 * (counted three times) and the text; no model involved.
 */
export function nearestByWords(question, pages = [], limit = MAX_NEAREST) {
  const want = new Set(words(question).filter((w) => w.length > 2 && !STOP.has(w)));
  if (!want.size) return [];
  return pages
    .map((page) => {
      const title = new Set(words(page.docTitle));
      const body = new Set(words(page.text));
      let score = 0;
      for (const w of want) score += (title.has(w) ? 3 : 0) + (body.has(w) ? 1 : 0);
      return { page, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.page);
}

/**
 * Check what the model chose against the pages it was shown.
 *
 * @param {object} selection  the model's structured reply
 * @param {object[]} pages    the sources from buildFullNotebookSources
 * @param {string} question   the question as the model saw it
 * @returns {{
 *   verdict: 'answer' | 'not_covered' | 'ambiguous',
 *   lead: string,
 *   cards: {page: object, kind: string}[],
 *   quotes: {page: object, text: string}[],
 *   nearest: object[],
 *   dropped: {pick: object, reason: string}[],
 *   checked: number,
 *   leadReason: string,
 * }}
 */
export function verifySelection(selection, pages = [], question = '') {
  const byRef = new Map(pages.map((page) => [pageRef(page), page]));
  const refOf = (raw) => {
    const ref = String(raw || '').trim().replace(/^\[|\]$/g, '');
    return byRef.get(ref) || byRef.get('p' + ref) || null;
  };
  const picks = Array.isArray(selection?.picks) ? selection.picks.slice(0, MAX_PICKS) : [];
  const dropped = [];
  const cards = [];
  const quotes = [];
  const seen = new Set();

  for (const pick of picks) {
    const page = refOf(pick?.page);
    if (!page) { dropped.push({ pick, reason: 'unknown page' }); continue; }
    if (pick?.type === 'card') {
      if (!isTypedKind(page.noteKind)) { dropped.push({ pick, reason: 'not a card' }); continue; }
      const key = 'card:' + page.docId;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({ page, kind: noteKind(page.noteKind).id });
      continue;
    }
    const found = locateQuote(pick?.quote, page.text);
    if (!found) { dropped.push({ pick, reason: 'quote not on page' }); continue; }
    const key = 'quote:' + page.docId + ':' + found.start + '-' + found.end;
    if (seen.has(key)) continue;
    seen.add(key);
    quotes.push({ page, text: found.text });
  }

  const nearestFrom = () => {
    const named = (Array.isArray(selection?.nearest) ? selection.nearest : []).map(refOf).filter(Boolean);
    const unique = [...new Map(named.map((p) => [p.docId, p])).values()].slice(0, MAX_NEAREST);
    return unique.length ? unique : nearestByWords(question, pages);
  };

  const said = String(selection?.verdict || '');
  const kept = cards.length + quotes.length;

  // Two or more pages might be meant: ask, with the pages as the options.
  if (said === 'ambiguous') {
    const options = nearestFrom();
    if (options.length >= 2) {
      return { verdict: 'ambiguous', lead: '', cards: [], quotes: [], nearest: options, dropped, checked: picks.length, leadReason: '' };
    }
  }

  // Nothing survived the checks, or the model said so itself.
  if (!kept || said === 'not_covered') {
    return { verdict: 'not_covered', lead: NOT_COVERED, cards: [], quotes: [], nearest: nearestFrom(), dropped, checked: picks.length, leadReason: '' };
  }

  const support = [...quotes.map((q) => q.text), ...cards.map((c) => c.page.text), ...[...cards, ...quotes].map((x) => x.page.docTitle)];
  const lead = checkLead(selection?.lead, { question, support });
  return {
    verdict: 'answer',
    lead: lead.ok ? lead.text : FALLBACK_LEAD,
    cards,
    quotes,
    nearest: [],
    dropped,
    checked: picks.length,
    leadReason: lead.ok ? '' : lead.reason,
  };
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const updatedLabel = (page) => {
  const d = page?.updatedAt ? new Date(page.updatedAt) : null;
  return d && !Number.isNaN(d.getTime()) ? 'updated ' + DATE.format(d) : 'Notebook';
};
const shortTitle = (page) => String(page?.docTitle || '').replace(/^Notebook:\s*/, '');

/** A citation the answer card can open: the whole page, as saved. */
export function pageCite(page) {
  return {
    docId: page.docId,
    docTitle: page.docTitle,
    location: updatedLabel(page),
    text: page.text,
    images: page.images || [],
    view: null,
  };
}

/**
 * The verified choice, as the answer payload's parts.
 *
 * Every string a reader sees here is either the page's own text, a value from
 * the page's stored fields drawn by its kind, a page title, or fixed wording
 * from this file. The lead is the only exception and it has already been
 * through checkLead.
 */
export function presentVerified(result) {
  const empty = { template: null, sections: [], intro: '', clarify: null, nearest: [], sources: [] };
  if (result.verdict === 'ambiguous') {
    return {
      ...empty,
      clarify: {
        question: 'The notebook has more than one page this could be. Which did you mean?',
        options: result.nearest.map(shortTitle),
        targets: null,
      },
      sources: result.nearest.map((p) => p.docTitle),
    };
  }
  if (result.verdict !== 'answer') {
    return { ...empty, intro: result.lead || NOT_COVERED, nearest: result.nearest.map(pageCite) };
  }

  const sections = [];
  let template = null;
  result.cards.forEach(({ page, kind }, i) => {
    const block = renderKind(kind, page.fields);
    const body = String(page.body || '').trim();
    if (i === 0 && block) {
      // The first card is the answer's card, drawn exactly as the notebook
      // draws it. Anything the practice wrote under it follows as its own words.
      template = templateAnswer({
        title: pageTitle(page),
        subtitle: noteKind(kind).label,
        blocks: [block, page.images?.length ? imageBlock(page.images) : null],
        source: [shortTitle(page)],
      });
      if (body) sections.push({ heading: 'Also on this page', markdown: body, basis: 'notebook', critical: false, cite: pageCite(page), web: null });
      return;
    }
    // A second card, or one that would not draw: its values as the page lists
    // them — still built in code from the stored fields, never by the model.
    sections.push({ heading: pageTitle(page), markdown: page.text, basis: 'notebook', critical: false, cite: pageCite(page), web: null });
  });
  for (const { page, text } of result.quotes) {
    sections.push({ heading: '', markdown: text, basis: 'notebook', critical: false, cite: pageCite(page), web: null });
  }
  const used = [...new Map([...result.cards, ...result.quotes].map((x) => [x.page.docId, x.page])).values()];
  return { ...empty, template, sections, intro: result.lead, sources: used.map((p) => p.docTitle) };
}