import test from 'node:test';
import assert from 'node:assert/strict';
import { squarify, layoutTree } from '../lib/notebook/treemap.mjs';
import { lineDiff, splitRows } from '../lib/notebook/diff.mjs';

const overlaps = (a, b) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;

test('areas are proportional, cells do not overlap, and all sit inside the rect', () => {
  const items = [6, 6, 4, 3, 2, 2, 1].map((value, i) => ({ id: 'i' + i, value }));
  const rect = { x: 10, y: 5, w: 6, h: 4 };
  const cells = squarify(items, rect);
  const total = 24;
  cells.forEach((c, i) => assert.ok(Math.abs(c.w * c.h - (items[i].value / total) * 24) < 1e-6, 'area ' + i));
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) assert.ok(!overlaps(cells[i], cells[j]), `${i} overlaps ${j}`);
  for (const c of cells) {
    assert.ok(c.x >= rect.x - 1e-6 && c.y >= rect.y - 1e-6 && c.x + c.w <= rect.x + rect.w + 1e-6 && c.y + c.h <= rect.y + rect.h + 1e-6);
  }
  // The paper's worked example: nothing worse than the 1 in the corner.
  const worst = Math.max(...cells.map((c) => Math.max(c.w / c.h, c.h / c.w)));
  assert.ok(worst <= 2.8, 'worst aspect ' + worst);
});

test('degenerate rects and empty inputs terminate and return a cell per item', () => {
  assert.equal(squarify([{ id: 1, value: 3 }, { id: 2, value: 0 }], { x: 0, y: 0, w: 1000, h: 1 }).length, 2);
  assert.equal(squarify([{ id: 1, value: 3 }], { x: 0, y: 0, w: 1, h: 1000 })[0].w, 1);
  assert.deepEqual(squarify([], { x: 0, y: 0, w: 10, h: 10 }), []);
  assert.equal(squarify([{ id: 1, value: 0 }], { x: 3, y: 4, w: 10, h: 10 })[0].w, 0);
});

test('layoutTree reserves a header for sections and lists parents before children', () => {
  const tree = {
    id: 0, kind: 'root', value: 30,
    children: [
      { id: 1, kind: 'section', value: 20, children: [{ id: 3, kind: 'page', value: 15 }, { id: 4, kind: 'page', value: 5 }] },
      { id: 2, kind: 'page', value: 10 },
    ],
  };
  const cells = layoutTree(tree, { x: 0, y: 0, w: 300, h: 200 }, { padding: 2, header: 16 });
  const ids = cells.map((c) => c.id);
  assert.ok(ids.indexOf(1) < ids.indexOf(3) && ids.indexOf(1) < ids.indexOf(4));
  const section = cells.find((c) => c.id === 1);
  const page3 = cells.find((c) => c.id === 3);
  assert.ok(page3.y >= section.y + 16);
  assert.ok(page3.x + page3.w <= section.x + section.w + 1e-6);
});

test('lineDiff and splitRows pair removed lines with the added lines that follow', () => {
  const d = lineDiff('a\nb\nc', 'a\nB\nc\nd');
  assert.deepEqual(d.map((x) => x.t + x.s), [' a', '-b', '+B', ' c', '+d']);
  assert.deepEqual(splitRows(d), [
    { left: 'a', right: 'a', kind: 'same' },
    { left: 'b', right: 'B', kind: 'changed' },
    { left: 'c', right: 'c', kind: 'same' },
    { left: null, right: 'd', kind: 'added' },
  ]);
});
