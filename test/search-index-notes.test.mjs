import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteEmbedder } from '../lib/search/index-notes.mjs';

// The Notebook's search index is kept current in the background: every save
// embeds its own page, and every turn kicks a throttled catch-up.

// console.warn is part of the contract (a failed search is logged, not
// thrown); keep it out of the test output and count it.
function quietWarn(t) {
  const calls = [];
  t.mock.method(console, 'warn', (...args) => { calls.push(args.join(' ')); });
  return calls;
}

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

