import test from 'node:test';
import assert from 'node:assert/strict';
import { notebookShortlist } from '../lib/search/notebook.mjs';
import { createNoteEmbedder } from '../lib/search/index-notes.mjs';

// An invented Notebook of 25 pages, none edited recently.
const OLD = new Date(Date.now() - 7 * 24 * 3600 * 1000);
const PAGES = Array.from({ length: 25 }, (_, i) => ({
  id: `note:${i + 1}:full`, docId: `note:${i + 1}`, docTitle: `Notebook: Page ${i + 1}`,
  text: `Text of page ${i + 1}.`, updatedAt: OLD,
}));
const hitsFor = (n) => Array.from({ length: n }, (_, i) => ({ entryId: `note:${i + 1}`, score: 1 - i / 100 }));

// console.warn is part of the contract (a failed search is logged, not
// thrown); keep it out of the test output and count it.
function quietWarn(t) {
  const calls = [];
  t.mock.method(console, 'warn', (...args) => { calls.push(args.join(' ')); });
  return calls;
}

test('empty query falls back to the whole notebook', async () => {
  let searched = false;
  const search = async () => { searched = true; return []; };
  for (const question of ['', '   ', '?! ']) {
    const s = await notebookShortlist({ question, history: '', attached: '', pages: PAGES, search });
    assert.equal(s.full, true);
    assert.equal(s.reason, 'no-text');
    assert.equal(s.pages, PAGES);
  }
  assert.equal(searched, false, 'nothing to search for, so search is not asked');
});

test('a failing search falls back to the whole notebook', async (t) => {
  const warned = quietWarn(t);
  const search = async () => { throw new Error('connection refused'); };
  const s = await notebookShortlist({ question: 'district nurse', pages: PAGES, search });
  assert.equal(s.full, true);
  assert.equal(s.reason, 'search-failed');
  assert.equal(s.pages, PAGES);
  assert.equal(warned.length, 1);
  assert.match(warned[0], /^\[search\]/);
});

test('search finding nothing falls back to the whole notebook', async () => {
  const s = await notebookShortlist({ question: 'district nurse', pages: PAGES, search: async () => [] });
  assert.equal(s.full, true);
  assert.equal(s.reason, 'no-match');
});

test('one request is shortlisted to 12 pages', async () => {
  let asked = null;
  const search = async (query, opts) => { asked = { query, opts }; return hitsFor(25); };
  const s = await notebookShortlist({ question: 'district nurse', history: '', pages: PAGES, search });
  assert.equal(s.full, false);
  assert.equal(s.pages.length, 12);
  assert.equal(s.pages[0].docId, 'note:1');
  assert.deepEqual(asked.opts, { kinds: ['note'], limit: 80 });
  assert.equal(asked.query, 'district nurse');
});

test('multi uses size 20', async () => {
  const s = await notebookShortlist({ question: 'district nurse and the rota', pages: PAGES, multi: true, search: async () => hitsFor(25) });
  assert.equal(s.full, false);
  assert.equal(s.pages.length, 20);
});

test('the follow-up query carries the previous user message to search', async () => {
  let query = '';
  const search = async (q) => { query = q; return hitsFor(3); };
  await notebookShortlist({
    question: 'and for children?',
    history: 'Staff member: how do I refer to the district nurse?\nThe assistant answered: By email.',
    pages: PAGES, search,
  });
  assert.match(query, /district nurse/);
  assert.match(query, /and for children/);
});

/* ------------------------------------------------ background embedding */

// A fill that holds until released, so a test can call the scheduler while a
// run is in flight.
function controlledFill(results) {
  const calls = [];
  let release = null;
  const fill = (kind) => {
    calls.push(kind);
    const value = results.shift() ?? 0;
    return new Promise((resolve, reject) => {
      release = () => (value instanceof Error ? reject(value) : resolve(value));
    });
  };
  return { fill, calls, release: () => release && release() };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

// A fill that answers at once, with the given results in turn.
function instantFill(results) {
  const calls = [];
  const fill = async (kind) => {
    calls.push(kind);
    const value = results.shift() ?? 0;
    if (value instanceof Error) throw value;
    return value;
  };
  return { fill, calls };
}

test('the embedder runs once at a time and reruns for a call made meanwhile', async () => {
  const f = controlledFill([3, 0]);
  const schedule = createNoteEmbedder({ fill: f.fill, now: () => 0, defer: () => {} });
  schedule({ force: true });
  await tick();
  // Two saves land while the first batch is being embedded.
  schedule({ force: true });
  schedule();
  await tick();
  assert.deepEqual(f.calls, ['note'], 'single flight');
  f.release(); await tick();
  assert.deepEqual(f.calls, ['note', 'note'], 'the call made meanwhile reruns it');
  f.release(); await tick();
  assert.equal(f.calls.length, 2);
});

test('the embedder catch-up is throttled to once a minute unless forced', async () => {
  const f = instantFill([]);
  let clock = 1000000;
  const schedule = createNoteEmbedder({ fill: f.fill, now: () => clock, defer: () => {} });
  schedule(); await tick();
  assert.equal(f.calls.length, 1, 'the first catch-up runs');
  clock += 30000;
  schedule(); await tick();
  assert.equal(f.calls.length, 1, 'thirty seconds later: skipped');
  schedule({ force: true }); await tick();
  assert.equal(f.calls.length, 2, 'a save forces it');
  clock += 30000;
  schedule(); await tick();
  assert.equal(f.calls.length, 2, 'the forced run restarted the minute');
  clock += 61000;
  schedule(); await tick();
  assert.equal(f.calls.length, 3, 'a minute on: runs');
});

test('a full batch runs again until the backlog is done', async () => {
  const f = instantFill([200, 200, 75]);
  const schedule = createNoteEmbedder({ fill: f.fill, now: () => 0, defer: () => {} });
  schedule({ force: true }); await tick();
  assert.equal(f.calls.length, 3);
});

test('a backlog that never shrinks stops after ten rounds', async () => {
  const f = instantFill(Array(50).fill(200));
  const schedule = createNoteEmbedder({ fill: f.fill, now: () => 0, defer: () => {} });
  schedule({ force: true }); await tick();
  assert.equal(f.calls.length, 10);
});

test('an embedding failure is logged, never thrown, and the next call retries', async (t) => {
  const warned = quietWarn(t);
  const f = instantFill([new Error('Embedding request failed (500)'), 4]);
  const schedule = createNoteEmbedder({ fill: f.fill, now: () => 0, defer: () => {} });
  assert.doesNotThrow(() => schedule({ force: true }));
  await tick();
  assert.equal(warned.length, 1);
  assert.match(warned[0], /^\[search\] note embedding: Embedding request failed/);
  schedule({ force: true }); await tick();
  assert.equal(f.calls.length, 2);
});

test('a fill that throws before it awaits does not leave a run stuck in flight', async (t) => {
  quietWarn(t);
  let calls = 0;
  const fill = (kind) => { calls++; if (calls === 1) throw new Error('boom'); return Promise.resolve(0); };
  const schedule = createNoteEmbedder({ fill, now: () => 0, defer: () => {} });
  schedule({ force: true }); await tick();
  schedule({ force: true }); await tick();
  assert.equal(calls, 2);
});

test('the run is handed to defer so a serverless request waits for it', async () => {
  const deferred = [];
  const f = instantFill([0]);
  const schedule = createNoteEmbedder({ fill: f.fill, now: () => 0, defer: (p) => deferred.push(p) });
  schedule({ force: true });
  assert.equal(deferred.length, 1);
  await deferred[0];
  assert.equal(f.calls.length, 1);
});

test('the search starts before a loading Notebook arrives', async () => {
  let started = false;
  let arrive = null;
  const pages = new Promise((resolve) => { arrive = () => resolve(PAGES); });
  const search = async () => { started = true; return hitsFor(3); };
  const shortlisting = notebookShortlist({ question: 'district nurse', pages, search });
  await tick();
  assert.equal(started, true, 'search runs while the pages are still loading');
  arrive();
  const s = await shortlisting;
  assert.equal(s.full, false);
  assert.deepEqual(s.pages.map((p) => p.docId), ['note:1', 'note:2', 'note:3']);
});

test('a search that fails while the Notebook loads still falls back to it', async (t) => {
  const warned = quietWarn(t);
  let arrive = null;
  const pages = new Promise((resolve) => { arrive = () => resolve(PAGES); });
  const shortlisting = notebookShortlist({ question: 'district nurse', pages, search: () => { throw new Error('down'); } });
  await tick();
  arrive();
  const s = await shortlisting;
  assert.equal(s.full, true);
  assert.equal(s.reason, 'search-failed');
  assert.equal(s.pages, PAGES);
  assert.equal(warned.length, 1);
});

test('the shortlist ranks by meaning first, then adds the top keyword pages', async () => {
  // Page 25 is the keyword arm's favourite and wins the fused score, but its
  // meaning is weak; pages 1–20 are the meaning arm's, best first.
  const hits = [
    { entryId: 'note:25', score: 0.05, semantic: 0, lexical: 0.9 },
    ...Array.from({ length: 20 }, (_, i) => ({ entryId: `note:${i + 1}`, score: 0.02 - i / 2000, semantic: 0.9 - i / 100, lexical: 0 })),
  ];
  const s = await notebookShortlist({ question: 'district nurse', pages: PAGES, search: async () => hits });
  assert.equal(s.pages[0].docId, 'note:1', 'the best meaning match leads');
  assert.deepEqual(s.pages.slice(0, 12).map((p) => p.docId), Array.from({ length: 12 }, (_, i) => `note:${i + 1}`));
  assert.ok(s.pages.some((p) => p.docId === 'note:25'), 'the top keyword page still makes the shortlist');
  assert.equal(s.why['note:25'], 'words');
});

/* ------------------------------------------------ never hold a turn */

test('a search that never answers falls back to the whole Notebook within the timeout', async (t) => {
  const warned = quietWarn(t);
  const began = Date.now();
  const s = await notebookShortlist({
    question: 'district nurse', pages: PAGES, search: () => new Promise(() => {}), timeoutMs: 40,
  });
  assert.equal(s.full, true);
  assert.equal(s.reason, 'search-failed');
  assert.equal(s.pages, PAGES);
  assert.ok(Date.now() - began < 1000, 'the turn was not held on the hung search');
  assert.equal(warned.length, 1);
  assert.match(warned[0], /^\[search\]/);
});

test('a turn with pictures uses the whole Notebook and does not search', async () => {
  let searched = false;
  const search = async () => { searched = true; return hitsFor(3); };
  const s = await notebookShortlist({ question: 'what do I do with this letter', seeing: true, pages: PAGES, search });
  assert.equal(s.full, true);
  assert.equal(s.reason, 'image');
  assert.equal(s.pages, PAGES);
  assert.equal(searched, false);
});
