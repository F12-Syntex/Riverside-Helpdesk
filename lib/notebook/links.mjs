// EVERY NOTEBOOK PAGE HAS ITS OWN ADDRESS.
//
//   /notebook/pharmacy-first-the-seven-conditions-1286
//
// The words are the page's title, so a link pasted into a message says where
// it goes before anybody clicks it. The number on the end is the page's id,
// and it is what the link is actually resolved by — so renaming a page, or two
// pages sharing a title, never breaks a link somebody has already sent. A link
// with no number ("/notebook/pharmacy-first-the-seven-conditions") still works
// while exactly one page has that title, and a bare id ("/notebook/1286") works
// always.

/** A title as URL words: lowercase, ASCII, hyphen-separated, at most 60 characters. */
export function slugify(title = '') {
  const words = String(title || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['‘’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (words.length <= 60) return words;
  const cut = words.slice(0, 60);
  return cut.slice(0, cut.lastIndexOf('-') > 30 ? cut.lastIndexOf('-') : 60).replace(/-+$/, '');
}

/** The address of one page. */
export function notebookHref(note) {
  if (!note || note.id == null) return '/notebook';
  const slug = slugify(note.title);
  return '/notebook/' + (slug ? slug + '-' : '') + note.id;
}

/** What a path segment names: an id (trailing number) and/or the title words. */
export function parseNoteRef(segment = '') {
  let ref = String(segment || '');
  try { ref = decodeURIComponent(ref); } catch (e) { /* keep it raw */ }
  ref = ref.trim().replace(/^\/+|\/+$/g, '');
  const all = ref.match(/^(\d+)$/);
  if (all) return { id: Number(all[1]), slug: '' };
  const tail = ref.match(/^(.*?)-(\d+)$/);
  if (tail) return { id: Number(tail[2]), slug: slugify(tail[1]) };
  return { id: null, slug: slugify(ref) };
}

/** The segment after /notebook/ in a pathname, or '' for the notebook itself. */
export function noteSegment(pathname = '') {
  const m = String(pathname || '').match(/^\/notebook\/([^/?#]+)\/?$/);
  return m ? m[1] : '';
}

/**
 * The note a segment points at, or null.
 *
 * By id first. Then by title words, only when exactly one page matches — a
 * title shared by two pages is not an address, and guessing would open the
 * wrong one.
 */
export function resolveNote(notes = [], segment = '') {
  const { id, slug } = parseNoteRef(segment);
  if (id != null) {
    const hit = notes.find((n) => Number(n.id) === id);
    if (hit) return hit;
  }
  if (!slug) return null;
  const matches = notes.filter((n) => slugify(n.title) === slug);
  return matches.length === 1 ? matches[0] : null;
}
