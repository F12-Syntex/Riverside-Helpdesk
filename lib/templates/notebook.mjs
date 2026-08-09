// A Notebook page, rendered as the answer.
//
// The model does not write this. It names the page, and the page is shown
// exactly as the practice wrote it.
//
// An earlier version had the model read every page and compose an answer from
// them. That was wrong on every count it was meant to help: it re-emitted text
// that already existed and was already correct, it paid output tokens and
// latency to do so, and it introduced the one risk the whole template system
// exists to remove — a model paraphrasing a procedure a receptionist follows.
// Rewriting "put the papers in the yellow scanner" cannot make it more true; it
// can only make it different.
//
// So the model returns a variable, like every other template: which page. What
// the reader sees is the page. That is byte-identical on every asking, costs
// about ten output tokens, and cannot drift from the Notebook because it IS the
// Notebook.
//
// More than one page can be named when an answer genuinely spans two, and both
// are shown whole, in order, each under its own heading. Still no composition —
// just two pages instead of one.
import { answer, text } from './blocks.mjs';

const norm = (t) => String(t || '').toLowerCase().replace(/^notebook:\s*/i, '').replace(/\s+/g, ' ').trim();
// Pages carry their whole path — "Documents and filing / Scanning documents" —
// and a page is usually asked for by its own name.
const leaf = (t) => norm(t).split('/').pop().trim();
const display = (t) => String(t || '').replace(/^notebook:\s*/i, '').split('/').pop().trim();

/**
 * Render the named pages.
 *
 * `pages` are the titles the model returned; `all` is every Notebook page, as
 * `{ docTitle, text }`. A title matching no page is dropped — the model can
 * choose a page or choose none, it cannot invent one.
 */
export function notebookPageAnswer({ pages = [], all = [] }) {
  const byFull = new Map(all.map((p) => [norm(p.docTitle), p]));
  const byLeaf = new Map(all.map((p) => [leaf(p.docTitle), p]));

  const found = [];
  for (const name of pages) {
    const page = byFull.get(norm(name)) || byLeaf.get(leaf(name)) || null;
    if (page && !found.includes(page)) found.push(page);
    if (found.length >= 2) break;
  }
  if (!found.length) return null;

  const blocks = [];
  found.forEach((page, i) => {
    // The first page's title is the card's title, so it is not repeated inside.
    if (i > 0) blocks.push(text(`## ${display(page.docTitle)}`));
    blocks.push(text(String(page.text || '').trim()));
  });

  return answer({
    title: display(found[0].docTitle),
    subtitle: found.length > 1 ? 'Two pages from the Notebook' : 'From the Notebook',
    blocks,
    source: found.map((p) => p.docTitle),
  });
}
