import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCriteria, ROUTING_CRITERIA } from '../lib/triage/criteria.mjs';
import { readingVerdict } from '../lib/templates/accurx-route.mjs';
import { accurxAnswer } from '../lib/templates/accurx.mjs';

test('criteria keep known ids once, in order, at most four, with fixed labels', () => {
  const out = cleanCriteria([
    { id: 'age', value: 'under 10.' },
    { id: 'made-up', value: 'x' },
    { id: 'age', value: 'again' },
    { id: 'duration', value: '3 months' },
    { id: 'worsening' },
    { id: 'redFlag', value: 'chest pain' },
    { id: 'onset', value: 'sudden' },
  ]);
  assert.deepEqual(out.map((c) => c.id), ['age', 'duration', 'worsening', 'redFlag']);
  assert.equal(out[0].label, 'Age');
  assert.equal(out[0].value, 'under 10');
  assert.equal(out[2].value, '');
  assert.equal(new Set(ROUTING_CRITERIA.map((c) => c.id)).size, ROUTING_CRITERIA.length);
});

test('the AccurX card carries the criteria, and none when nothing was read', () => {
  const route = readingVerdict({
    reasoning: 'Child under 10 with a sore throat for two days, otherwise well.',
    criteria: [{ id: 'age', value: 'under 10' }, { id: 'pathway', value: 'sore throat' }],
    destination: 'gp',
    evidence: '',
  });
  const card = accurxAnswer({ condition: 'sore throat', text: 'my 6 year old has a sore throat', route, message: 'my 6 year old has a sore throat' });
  assert.deepEqual(card.accurx.criteria.map((c) => c.label), ['Age', 'Pathway condition']);
  assert.ok(card.blocks.some((b) => b && b.title === 'Why here'));

  const unread = accurxAnswer({ condition: 'sore throat', text: 'x', route: null, message: 'x' });
  assert.deepEqual(unread.accurx.criteria, []);
});
