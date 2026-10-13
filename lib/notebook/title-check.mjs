// What is wrong with a page's title, if anything, as it is being typed.
//
// A title is how a page is found: the tree, the search, the page's own
// address (lib/notebook/links.mjs) and the assistant's citations all go by
// it. So the Notebook says, under the title, when one cannot do that job —
// and says it while it is being typed rather than after the autosave has
// already sent it. Pure, so the rules are tested rather than eyeballed.
//
//   empty      nothing but spaces: never saved (the old title stands)
//   long       at the limit the server cuts to (lib/notebook.js keeps 200)
//   duplicate  a sibling — the same section, or another section at the top
//              — already has it, spaced and cased differently or not. The
//              slug link to either of them is then ambiguous, so it is said,
//              though it is not stopped: two pages can share a name.

export const TITLE_MAX = 200;
/** From here on the title shows how much room is left. */
export const TITLE_COUNT_FROM = 160;

/** A title as it is compared: trimmed, spaces collapsed, case ignored. */
export function titleKey(title) {
  return String(title == null ? '' : title).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * @param title     what is in the box now
 * @param siblings  the titles of the other notes under the same parent
 * @returns {{ empty: boolean, long: boolean, length: number, duplicate: boolean, showCount: boolean }}
 */
export function checkTitle(title, siblings = [], max = TITLE_MAX) {
  const raw = String(title == null ? '' : title);
  const key = titleKey(raw);
  const length = raw.length;
  return {
    empty: key === '',
    long: length >= max,
    length,
    duplicate: key !== '' && siblings.some((s) => titleKey(s) === key),
    showCount: length >= Math.min(TITLE_COUNT_FROM, max),
  };
}

/**
 * A title as the tree, the crumbs and the messages show it. A title of
 * nothing but spaces is as empty as no title: while the box holds only
 * spaces, the row and the crumb say "Untitled" rather than going blank.
 */
export function shownTitle(title, fallback = 'Untitled') {
  return String(title == null ? '' : title).trim() || fallback;
}

/** The title to put back when the box is left empty: the last saved one, else a plain default. */
export function fallbackTitle(previous, isSection = false) {
  const prev = String(previous == null ? '' : previous).trim();
  return prev || (isSection ? 'Untitled section' : 'Untitled page');
}
