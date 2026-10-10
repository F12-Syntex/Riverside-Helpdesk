// What the working card shows while a Q&A turn reads the Notebook.
//
// The writer reads EVERY page (app/api/agent/route.js), so there is no search
// result to light up and no page chosen to mark: the true thing to show is the
// Notebook itself, its size and its sections, all of it read. The event keeps
// the shape the card already draws — the `notes` stage, with `matched` equal
// to `total`, which is how the card has always shown a whole-Notebook read —
// so nothing in the browser had to change for it.
//
//   { type: 'progress', stage: 'notes', total, sections: [{ name, count }],
//     terms: [], matched: total, matches: [] }
//
// DISPLAY ONLY. Nothing here feeds the answer.

const sectionOf = (page) => (Array.isArray(page.path) && page.path.length > 1 ? page.path[0] : 'Notebook');
const titleOf = (page) => (Array.isArray(page.path) && page.path.length
  ? page.path[page.path.length - 1]
  : String(page.docTitle || '').replace(/^Notebook:\s*/i, ''));

/** The progress event for a turn reading every one of `pages`. */
export function notebookProgress(pages = []) {
  const list = (Array.isArray(pages) ? pages : [])
    .map((page) => ({ section: sectionOf(page), title: titleOf(page) }))
    .sort((a, b) => a.section.localeCompare(b.section) || a.title.localeCompare(b.title));
  const sections = [];
  for (const row of list) {
    const last = sections[sections.length - 1];
    if (last && last.name === row.section) last.count += 1;
    else sections.push({ name: row.section, count: 1 });
  }
  return { type: 'progress', stage: 'notes', total: list.length, sections, terms: [], matched: list.length, matches: [] };
}
