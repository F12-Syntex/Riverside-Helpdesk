// Squarified treemap layout (Bruls, Huizing & van Wijk, 2000).
//
// Slice-and-dice gives long thin strips nobody can read a title in; squarify
// keeps each cell as close to square as the numbers allow, which is what makes
// a page's title fit and a hover target hittable. Pure geometry, no DOM.

const sortItems = (items) => items
  .filter((i) => i && Number(i.value) > 0)
  .slice()
  .sort((a, b) => b.value - a.value || String(a.id).localeCompare(String(b.id)));

/**
 * Lay `items` ({id, value}) out inside `rect` ({x, y, w, h}).
 * Returns cells in the ORIGINAL item order. Items with no value get a
 * zero-size cell at the rect's origin so callers can still find them.
 */
export function squarify(items, rect) {
  const list = sortItems(items || []);
  const placed = new Map();
  const total = list.reduce((s, i) => s + i.value, 0);
  if (list.length && rect.w > 0 && rect.h > 0 && total > 0) {
    const scale = (rect.w * rect.h) / total;
    const areaOf = (i) => i.value * scale;
    let free = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    let row = [];

    const worst = (r, side) => {
      const s = r.reduce((a, i) => a + areaOf(i), 0);
      if (!s || !side) return Infinity;
      let m = 0;
      for (const i of r) {
        const a = areaOf(i);
        m = Math.max(m, (side * side * a) / (s * s), (s * s) / (side * side * a));
      }
      return m;
    };

    const layoutRow = (r) => {
      const s = r.reduce((a, i) => a + areaOf(i), 0);
      if (free.w >= free.h) {
        // Wide: the row is a column down the left, its width from its area.
        const w = free.h ? s / free.h : 0;
        let y = free.y;
        for (const i of r) { const h = w ? areaOf(i) / w : 0; placed.set(i.id, { id: i.id, x: free.x, y, w, h }); y += h; }
        free = { x: free.x + w, y: free.y, w: Math.max(0, free.w - w), h: free.h };
      } else {
        const h = free.w ? s / free.w : 0;
        let x = free.x;
        for (const i of r) { const w = h ? areaOf(i) / h : 0; placed.set(i.id, { id: i.id, x, y: free.y, w, h }); x += w; }
        free = { x: free.x, y: free.y + h, w: free.w, h: Math.max(0, free.h - h) };
      }
    };

    for (const item of list) {
      const side = Math.min(free.w, free.h);
      if (!row.length || worst([...row, item], side) <= worst(row, side)) row.push(item);
      else { layoutRow(row); row = [item]; }
    }
    if (row.length) layoutRow(row);
  }
  return (items || []).map((i) => placed.get(i.id) || { id: i.id, x: rect.x, y: rect.y, w: 0, h: 0 });
}

/**
 * Lay a tree of {id, kind, value, children} out recursively. Sections reserve
 * a header strip; pages are leaves. Returns a flat list, parents before their
 * children, each cell carrying its node and depth.
 */
export function layoutTree(root, rect, { padding = 2, header = 16, minCell = 3 } = {}) {
  const out = [];
  const walk = (node, r, depth) => {
    out.push({ id: node.id, kind: node.kind, depth, x: r.x, y: r.y, w: r.w, h: r.h, node });
    const children = node.children || [];
    if (!children.length) return;
    const top = depth === 0 ? 0 : header;
    const inner = { x: r.x + padding, y: r.y + top + padding, w: Math.max(0, r.w - padding * 2), h: Math.max(0, r.h - top - padding * 2) };
    if (inner.w < minCell || inner.h < minCell) return;
    const cells = squarify(children.map((c) => ({ id: c.id, value: Math.max(c.value, 0) })), inner);
    children.forEach((c, i) => {
      const cell = cells[i];
      if (cell.w < minCell || cell.h < minCell) { out.push({ id: c.id, kind: c.kind, depth: depth + 1, x: cell.x, y: cell.y, w: cell.w, h: cell.h, node: c }); return; }
      walk(c, cell, depth + 1);
    });
  };
  walk(root, rect, 0);
  return out;
}
