import test from 'node:test';
import assert from 'node:assert/strict';
import { pharmacyFirstAnswer, pharmacyListMatch } from '../lib/templates/pharmacy.mjs';
import { triagePatientAnswer } from '../lib/templates/triage.mjs';

// The Pharmacy First card names the exact entry on the lists that matched —
// never just "Minor illness referral".

const rows = (card) => Object.fromEntries(card.blocks
  .filter((b) => b && b.type === 'fields').flatMap((b) => b.items).map((i) => [i.label, i.value]));

test('the most specific entry wins, with the list it is on and the words that matched', () => {
  assert.deepEqual(
    (({ exact, list, words }) => ({ exact, list, words }))(pharmacyListMatch('headache for 2 days')),
    { exact: 'Headache', list: 'Pharmacy First minor illness list', words: 'headache' },
  );
  assert.equal(pharmacyListMatch('sore throat since friday').list, 'Pharmacy First clinical pathway');
  assert.equal(pharmacyListMatch('bad hay fever').exact, 'Hay fever');
  assert.equal(pharmacyListMatch('need a sick note'), null);
});

test('the card is titled by the condition and never says only "minor illness referral"', () => {
  const card = pharmacyFirstAnswer({ condition: 'headache', text: 'headache for 2 days' });
  assert.equal(card.title, 'Headache — Pharmacy First');
  const r = rows(card);
  assert.equal(r.Condition, 'Headache');
  assert.equal(r['Patient’s words'], '“headache”');
  assert.equal(r['Listed on'], 'Pharmacy First minor illness list');
  assert.ok(!JSON.stringify(card).includes('Minor illness referral'));
});

test('a pathway card shows the pathway, its age range and the words', () => {
  const card = triagePatientAnswer({ condition: 'sore throat', text: 'sore throat since friday' });
  const r = rows(card);
  assert.equal(r.Condition, 'Sore throat');
  assert.equal(r['Listed on'], 'Pharmacy First clinical pathway');
  assert.equal(r['Age range'], '5 years and over');
});
