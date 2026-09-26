// The router is strictly additive: switched off, or on a miss, it hands the
// turn to the picker with nothing changed — and it never throws into the
// request path, whatever state the database is in.
import assert from 'node:assert/strict';
import test from 'node:test';

import { MIN_NORMALISED_CHARS, routeQuestion } from '../lib/routing/router.mjs';

// No database in these tests. Anything that reaches for one would throw from
// getSql, and the router must swallow that into a miss.
delete process.env.DATABASE_URL;
delete process.env.DEV_DATABASE_URL;

const OFF = { enabled: false, hitCos: 0.82, askCos: 0.7, minMargin: 0.15 };
const ON = { ...OFF, enabled: true };

test('switched off, the router answers "off" without touching anything', async () => {
  const out = await routeQuestion('How do I book a cervical screening appointment?', { thresholds: OFF, record: false });
  assert.equal(out.decision, 'off');
  assert.equal(out.page, null);
  assert.equal(out.clarify, null);
});

test('a question too short to route is a miss before any lookup', async () => {
  const out = await routeQuestion('bp?', { thresholds: ON, record: false });
  assert.equal(out.decision, 'miss');
  assert.equal(out.rung, 'short');
  assert.ok('bp'.length < MIN_NORMALISED_CHARS);
});

test('a database that cannot be reached is a miss, not an error', async () => {
  const out = await routeQuestion('How do I book a cervical screening appointment?', { thresholds: ON, record: false });
  assert.equal(out.decision, 'miss');
  assert.equal(out.rung, 'error');
  assert.equal(out.page, null);
  assert.equal(out.clarify, null);
});

test('a non-hit leaves the picker with exactly the inputs it had', async () => {
  // What the splice in app/api/agent/route.js does with the verdict, copied:
  // templateAnswer and clarify start null and are only set on hit/ambiguous.
  const question = 'How do I book a cervical screening appointment?';
  const notebookText = 'PAGE 1\n…';
  const before = JSON.stringify({ question, notebookText });
  let templateAnswer = null;
  let clarify = null;
  const routed = await routeQuestion(question, { thresholds: ON, record: false });
  if (routed.decision === 'hit') templateAnswer = routed.page;
  else if (routed.decision === 'ambiguous') clarify = routed.clarify;
  assert.equal(templateAnswer, null);
  assert.equal(clarify, null);
  assert.equal(JSON.stringify({ question, notebookText }), before);
});