// An embedding call is a network round trip to a third party; a turn must not
// wait on one that never answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { embedTexts } from '../rag/lib/embed.mjs';
import { queryVector } from '../lib/search/search.mjs';

process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-key';

// A fetch that never answers, except by honouring its abort signal.
function hangingFetch(t) {
  const seen = [];
  t.mock.method(globalThis, 'fetch', (url, init = {}) => {
    seen.push(init.signal);
    return new Promise((resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal.reason || new Error('aborted')));
    });
  });
  return seen;
}

test('an embedding request is abandoned at its timeout', async (t) => {
  const signals = hangingFetch(t);
  // AbortSignal.timeout's timer does not hold the process open (a server's
  // sockets do that); here nothing else would, so something must.
  const hold = setTimeout(() => {}, 5000);
  const began = Date.now();
  try {
    await assert.rejects(embedTexts(['district nurse'], { timeoutMs: 40 }));
  } finally {
    clearTimeout(hold);
  }
  assert.ok(Date.now() - began < 2000);
  assert.ok(signals[0], 'the request carried a signal');
});

test('an embedding request has a timeout even when the caller names none', async (t) => {
  const signals = hangingFetch(t);
  const pending = embedTexts(['x']).catch(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(signals[0] instanceof AbortSignal, 'bulk ingest is bounded too, per request');
  assert.equal(signals[0].aborted, false);
  // Not awaited to its (long) default; AbortSignal.timeout's timer is unref'd,
  // so it does not hold the test process open.
  void pending;
});

test('a query vector that hangs is null within its budget and is not remembered', async () => {
  const began = Date.now();
  const hung = await queryVector('a question nobody embeds', { embed: () => new Promise(() => {}), budgetMs: 30 });
  assert.equal(hung, null);
  assert.ok(Date.now() - began < 1000);
  // The next turn asks again rather than waiting on the hung promise.
  const vec = Array(1536).fill(0.1);
  let asked = 0;
  const again = await queryVector('a question nobody embeds', { embed: async () => { asked++; return vec; }, budgetMs: 1000 });
  assert.equal(asked, 1);
  assert.equal(again, vec);
});

test('the query vector passes its budget to the embedding request', async () => {
  let options = null;
  await queryVector('budget passed through', { embed: async (text, opts) => { options = opts; return null; }, budgetMs: 1234 });
  assert.equal(options.timeoutMs, 1234);
});
