// THE PAGES AN ANSWER CITES, TURNED INTO LINKS BY CODE.
//
// The Q&A writer reads the whole Notebook and cites each page it used by the
// heading it was shown — `[[Notebook: Section / Page]]`. It never writes a
// link: a model asked for a URL writes a plausible one, and a plausible link
// to a practice procedure that opens the wrong page (or none) is worse than no
// link. So the model names the page, and this file decides whether that name
// is a page:
//
//   - a marker naming a real page becomes `[Page](/notebook/<slug>-<id>)`
//     (notebookHref, lib/notebook/links.mjs) — the page's own address, resolved
//     by its id, so a rename never breaks it;
//   - a marker naming no page becomes its own words as plain text, and is
//     reported in `unknown` so the turn can log it. Nothing is linked that
//     code could not find.
//
// Matching is the Notebook's shared title rule (notebookTitleKey /
// notebookLeafKey, lib/templates/notebook.mjs): the full path first, then the
// page's own name when exactly one page carries it. A name two pages share is
// not an address, and guessing would open the wrong one.
//
// The answer then ends with one line naming every page it linked, in the order
// it first cited them: `Sources: [A](href) · [B](href)`. A "Source:" line the
// model wrote anyway is taken off first, so there is only ever the one.
//
// Pure: no network, no database.
import { notebookHref } from '../notebook/links.mjs';
import { notebookLeafKey, notebookTitleKey } from '../templates/notebook.mjs';

const MARKER = /\[\[([^\[\]\n]{1,300})\]\]/g;
// Fenced blocks and inline code spans: a marker inside one is an example, not
// a citation, and is left exactly as written.
const CODE = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g;
// A closing line the model wrote itself, despite being told not to.
// "Source: …", "Sources: …", "**Sources:** …", "**Source**: …" — the last line only.
const MODEL_SOURCES_LINE = /\n+[ \t]*(?:\*\*|_)?sources?(?::(?:\*\*|_)?|(?:\*\*|_)?:)[^\n]*\s*$/i;

/** The page's own name — the last part of its path. */
export function pageName(page) {
  return String((page && page.docTitle) || '').replace(/^notebook:\s*/i, '').split('/').pop().trim();
}

/** The page's address, or '' when it is not a Notebook note. */
export function pageHref(page) {
  const id = String((page && page.docId) || '').match(/^note:(\d+)/);
  return id ? notebookHref({ id: Number(id[1]), title: pageName(page) }) : '';
}

// Link text cannot carry square brackets; a title with them keeps its words.
const linkText = (text) => String(text || '').replace(/\[/g, '(').replace(/\]/g, ')').trim();

/** A markdown link to one cited page. */
export function pageLink(ref) {
  return `[${linkText(ref.title)}](${ref.href})`;
}

/**
 * The closing line naming every cited page, or '' when none was. `label` is
 * "Sources" for an answer, "Closest page" for an "I don't know".
 */
export function sourcesLine(cited = [], label = 'Sources') {
  return cited.length ? `${label}: ` + cited.map(pageLink).join(' · ') : '';
}

/**
 * Does the answer open by saying the Notebook does not cover it? The writer is
 * told to say exactly "I don’t know — the Notebook does not cover this." and
 * then cite the closest page — which is a pointer, not a source.
 */
//
// The whole sentence, not just its first three words, and only on a short
// answer: one that opens "I don't know — the Notebook does not cover discharge
// letters specifically" and then gives the general procedure for every letter
// is an answer, and its pages are its sources.
const DONT_KNOW_MAX_CHARS = 600;
export function saysDontKnow(text = '') {
  const t = String(text || '').trim();
  return t.length <= DONT_KNOW_MAX_CHARS
    && /^\W*i\s+don['’`]?t\s+know\W+the\s+notebook\s+does\s+not\s+cover\b/i.test(t);
}

/**
 * The page one marker names, or null.
 *
 * `index` is built once per call by `pageIndex`.
 */
function findPage(name, index) {
  const full = index.byFull.get(notebookTitleKey(name));
  if (full) return full;
  const leaf = index.byLeaf.get(notebookLeafKey(name));
  return leaf && leaf.length === 1 ? leaf[0] : null;
}

function pageIndex(pages = []) {
  const byFull = new Map();
  const byLeaf = new Map();
  for (const page of pages || []) {
    if (!page || !page.docTitle) continue;
    const full = notebookTitleKey(page.docTitle);
    if (!byFull.has(full)) byFull.set(full, page);
    const leaf = notebookLeafKey(page.docTitle);
    byLeaf.set(leaf, (byLeaf.get(leaf) || []).concat(page));
  }
  return { byFull, byLeaf };
}

/**
 * Replace every `[[…]]` marker in `text` with a link to the page it names.
 *
 * @param {string} text   the answer as the model wrote it
 * @param {Array}  pages  every Notebook page, `{ docId, docTitle }`
 * @returns {{
 *   text: string,     the answer with links and the Sources line
 *   body: string,     the same without the Sources line, for anything that
 *                     has to go between the answer and its sources
 *   cited: Array<{ docId: string, title: string, href: string }>,
 *   unknown: string[] markers that named no page, as written
 * }}
 */
export function resolveReferences(text = '', pages = []) {
  const index = pageIndex(pages);
  const cited = [];
  const unknown = [];

  const resolve = (segment) => segment.replace(MARKER, (whole, inner) => {
    const name = String(inner).trim();
    const page = findPage(name, index);
    const href = page ? pageHref(page) : '';
    if (!page || !href) {
      if (name && !unknown.includes(name)) unknown.push(name);
      return name.replace(/^notebook:\s*/i, '');
    }
    let ref = cited.find((c) => c.docId === page.docId);
    if (!ref) {
      ref = { docId: page.docId, title: pageName(page), href };
      cited.push(ref);
    }
    return pageLink(ref);
  });

  // Resolve outside code only: split on code, keep code as it is.
  const source = String(text || '');
  let out = '';
  let last = 0;
  for (const match of source.matchAll(CODE)) {
    out += resolve(source.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  out += resolve(source.slice(last));

  const body = (cited.length ? out.replace(MODEL_SOURCES_LINE, '') : out).trim();
  const line = sourcesLine(cited);
  return { text: line ? `${body}\n\n${line}` : body, body, cited, unknown };
}

/** The Notebook pages a resolved answer cited, in the order it cited them. */
export function citedPages(cited = [], pages = []) {
  const byId = new Map((pages || []).map((page) => [page.docId, page]));
  return (cited || []).map((ref) => byId.get(ref.docId)).filter(Boolean);
}
