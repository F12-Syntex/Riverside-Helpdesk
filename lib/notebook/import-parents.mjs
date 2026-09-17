// Which new id each note's parent has, when a backup is restored.
//
// Pure (no database) so the awkward files can be tested directly: a parent the
// file does not contain, a loop in the parent chain, a note with no id, two
// notes sharing one. None of that needs Postgres to be sure of, and all of it
// used to be decided implicitly by an insert loop running out of passes.

/**
 * Work out, for every note in a backup, which new id its parent now has.
 *
 * Pure, and separate from the insert, because this is where the awkward files
 * are dealt with and none of it needs a database to be sure of:
 *
 *   A parent the file does not contain, or a loop in the parent chain, leaves
 *   the page at the TOP LEVEL rather than lost — the same thing the old
 *   insert-by-depth loop did with what it could not place, decided here instead
 *   of by running out of passes.
 *
 *   A note with no id of its own, or with an id another note already used, is
 *   still imported but cannot be named as anybody's parent. A hand-edited file
 *   with two notes numbered 4 must not quietly make half the notebook a child
 *   of one of them.
 *
 * @param {Array} rows    the file's notes
 * @param {Array} newIds  the id each of those now has, in the same order
 * @returns {{map: Map, parents: Array}} old id -> new id, and each row's parent
 */
export function importParents(rows, newIds) {
  const map = new Map();        // the id the file used -> the id it now has
  const parentInFile = new Map();
  rows.forEach((n, i) => {
    if (n.id == null || map.has(n.id)) return;
    map.set(n.id, newIds[i]);
    parentInFile.set(n.id, n.parentId == null ? null : n.parentId);
  });

  const rootable = (oldId) => {
    const seen = new Set();
    let cur = oldId;
    while (cur != null && !seen.has(cur)) {
      seen.add(cur);
      if (!parentInFile.has(cur)) return false; // names a note the file does not hold
      cur = parentInFile.get(cur);
    }
    return cur == null; // reached the top without going round
  };

  return {
    map,
    parents: rows.map((n) => (n.parentId != null && rootable(n.parentId) ? map.get(n.parentId) : null)),
  };
}
