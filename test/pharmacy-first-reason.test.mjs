import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHARMACY_REASONS, PHARMACY_REASON_IDS, checkPharmacyReason, pharmacyReason, statedAges,
} from '../lib/triage/pharmacy-first.mjs';
import { ACCURX_READ_SCHEMA, accurxReadPrompt, readingVerdict } from '../lib/templates/accurx-route.mjs';
import { accurxAnswer } from '../lib/templates/accurx.mjs';
import { CLINICAL_PATHWAYS } from '../lib/templates/pharmacy.mjs';
import { PHARMACY_MINOR_ILLNESS, SELF_CARE_CONDITIONS } from '../lib/triage/destinations.mjs';

// When /accurx sends a message to the pharmacy it has to say which entry on the
// practice's Pharmacy First lists the message is, and code checks it rather than
// taking the reading's word for it.

const flat = (blocks, out = []) => {
  for (const b of blocks || []) {
    if (!b) continue;
    out.push(b);
    if (b.type === 'expand') flat(b.blocks, out);
  }
  return out;
};
const words = (card) => flat(card.blocks)
  .map((b) => [b.text, b.markdown, b.title, (b.items || []).map((i) => (typeof i === 'string' ? i : [i.label, i.value].join(' '))).join(' ')].filter(Boolean).join(' '))
  .join(' ');

const THROAT = 'sore throat since friday, no fever, can I see a GP please';

const card = (pharmacyReasonSaid, message = THROAT) => accurxAnswer({
  condition: 'sore throat',
  text: message,
  message,
  reason: 'sore throat 3/7, no fever',
  route: readingVerdict({
    reasoning: 'Three days of a sore throat, nothing tried, no fever.',
    destination: 'pharmacy',
    evidence: 'sore throat since friday',
    pharmacyReason: pharmacyReasonSaid,
  }),
});

/* ------------------------------------------------------------- the lists */

test('every entry on the practice’s three lists is a reason, and nothing else is', () => {
  assert.equal(PHARMACY_REASONS.length, CLINICAL_PATHWAYS.length + PHARMACY_MINOR_ILLNESS.length + SELF_CARE_CONDITIONS.length);
  assert.equal(new Set(PHARMACY_REASON_IDS).size, PHARMACY_REASON_IDS.length, 'no id means two things');
  for (const p of CLINICAL_PATHWAYS) assert.ok(pharmacyReason('Pathway: ' + p.name), p.name);
  for (const n of PHARMACY_MINOR_ILLNESS) assert.ok(pharmacyReason('Minor illness: ' + n), n);
  for (const n of SELF_CARE_CONDITIONS) assert.ok(pharmacyReason('Self-care: ' + n), n);
  assert.equal(pharmacyReason('Pathway: Tonsillitis'), null);
  assert.equal(pharmacyReason('Sore throat'), null, 'the list prefix is part of the name');
});

test('every pathway carries its age gate as numbers', () => {
  for (const p of CLINICAL_PATHWAYS) assert.equal(typeof p.min, 'number', p.name);
  assert.equal(pharmacyReason('Pathway: Acute otitis media').max, 17);
  assert.equal(pharmacyReason('Pathway: Uncomplicated UTI').max, 64);
});

test('the schema only accepts a condition from the lists', () => {
  const ok = ACCURX_READ_SCHEMA.safeParse({ destination: 'pharmacy', pharmacyReason: { condition: 'Pathway: Sore throat', evidence: 'x' } });
  assert.ok(ok.success);
  const bad = ACCURX_READ_SCHEMA.safeParse({ destination: 'pharmacy', pharmacyReason: { condition: 'Pathway: Tonsillitis', evidence: 'x' } });
  assert.ok(!bad.success);
  // Absent is "none", which is what every other destination gives.
  assert.equal(ACCURX_READ_SCHEMA.parse({ destination: 'gp' }).pharmacyReason.condition, 'none');
});

test('the prompt shows the reading the lists it is held to', () => {
  const prompt = accurxReadPrompt({ question: THROAT });
  assert.match(prompt, /pharmacyReason/);
  assert.match(prompt, /Pathway: Acute otitis media \(1 to 17 years\)/);
  assert.match(prompt, /Minor illness: Hay fever/);
  assert.match(prompt, /Self-care: Haemorrhoids/);
});

/* -------------------------------------------------------------- ages */

test('an age is read only where the message says it is one', () => {
  assert.deepEqual(statedAges('my 7 year old son has earache'), [7]);
  assert.deepEqual(statedAges('I am 45yo'), [45]);
  assert.deepEqual(statedAges('aged 70, sore throat'), [70]);
  assert.deepEqual(statedAges('my 8 month old has impetigo'), [0.67]);
  assert.deepEqual(statedAges('ear pain for 3 years'), [], 'a duration is not an age');
  assert.deepEqual(statedAges('sore throat since friday'), []);
});

/* ------------------------------------------------------------- the check */

test('a reason on the list, quoted from the message, is accepted', () => {
  const checked = checkPharmacyReason({ condition: 'Pathway: Sore throat', evidence: 'sore throat since friday' }, THROAT);
  assert.equal(checked.ok, true);
  assert.equal(checked.reason.kind, 'pathway');
  assert.equal(checked.age, 'notStated');
});

test('no reason, or one that is not on the lists, is refused', () => {
  assert.equal(checkPharmacyReason({ condition: 'none', evidence: '' }, THROAT).ok, false);
  assert.equal(checkPharmacyReason(undefined, THROAT).ok, false);
  const invented = checkPharmacyReason({ condition: 'Pathway: Tonsillitis', evidence: 'sore throat' }, THROAT);
  assert.equal(invented.ok, false);
  assert.match(invented.problem, /not on the practice’s Pharmacy First lists/);
});

test('words the patient did not write are refused', () => {
  const checked = checkPharmacyReason({ condition: 'Pathway: Sore throat', evidence: 'painful swallowing for a week' }, THROAT);
  assert.equal(checked.ok, false);
  assert.match(checked.problem, /are not in the message/);
  assert.equal(checkPharmacyReason({ condition: 'Pathway: Sore throat', evidence: '' }, THROAT).ok, false);
});

test('a pathway outside the age the message gives is refused', () => {
  const ear = 'I am 45 years old and have had earache for two days';
  const adult = checkPharmacyReason({ condition: 'Pathway: Acute otitis media', evidence: 'earache for two days' }, ear);
  assert.equal(adult.ok, false);
  assert.match(adult.problem, /age as 45/);
  assert.match(adult.problem, /1 to 17/);

  const child = checkPharmacyReason({ condition: 'Pathway: Acute otitis media', evidence: 'earache for two days' }, 'my 7 year old has had earache for two days');
  assert.equal(child.ok, true);
  assert.equal(child.age, 'fits');

  // A minor illness has no age gate, so the same adult ear is a valid minor illness referral.
  assert.equal(checkPharmacyReason({ condition: 'Minor illness: Earache', evidence: 'earache for two days' }, ear).ok, true);
});

test('two ages in one message leave the gate for reception to check', () => {
  const both = 'my 14 year old has a sore throat, and I am 40 years old';
  const checked = checkPharmacyReason({ condition: 'Pathway: Sore throat', evidence: 'has a sore throat' }, both);
  assert.equal(checked.ok, true);
  assert.equal(checked.age, 'unclear');
});

/* -------------------------------------------------------------- the card */

test('a checked reason is on the card, under where it goes', () => {
  const built = card({ condition: 'Pathway: Sore throat', evidence: 'sore throat since friday' });
  assert.equal(built.destination, 'pharmacy');
  const panel = flat(built.blocks).find((b) => b.type === 'fields' && b.title === 'Why Pharmacy First');
  assert.ok(panel, 'the panel is there');
  const rows = Object.fromEntries(panel.items.map((i) => [i.label, i.value]));
  assert.equal(rows.Condition, 'Sore throat');
  assert.equal(rows['Age range'], '5 years and over');
  assert.equal(rows['Patient’s words'], '“sore throat since friday”');
  assert.match(words(built), /does not give the patient’s age/, 'and it asks for the age to be checked');
  assert.equal(built.accurx.pharmacy.condition, 'Sore throat');
  assert.equal(built.accurx.pharmacyRefused, '');
});

test('a minor illness has no age row and no age warning', () => {
  const built = card({ condition: 'Self-care: Acute sore throat', evidence: 'sore throat since friday' });
  assert.equal(built.destination, 'pharmacy');
  assert.doesNotMatch(words(built), /Age range/);
  assert.doesNotMatch(words(built), /patient’s age/);
});

test('a pharmacy with no valid reason is not sent to the pharmacy', () => {
  for (const said of [
    undefined,
    { condition: 'none', evidence: '' },
    { condition: 'Pathway: Sore throat', evidence: 'words nobody wrote' },
  ]) {
    const built = card(said);
    assert.equal(built.destination, 'dutyDoctor', JSON.stringify(said));
    assert.match(words(built), /Not sent to the pharmacy/);
    assert.match(words(built), /Why the reading proposed the pharmacy/);
    assert.ok(built.accurx.pharmacyRefused);
    assert.equal(built.accurx.pharmacy, null);
    assert.doesNotMatch(built.accurx.noAnswer, /pharmacy/i, 'the no-answer line does not signpost where it is not going');
  }
});

test('an adult sent down the children’s ear pathway is refused', () => {
  const message = 'I am 45 years old and have had earache for two days';
  const built = card({ condition: 'Pathway: Acute otitis media', evidence: 'earache for two days' }, message);
  assert.equal(built.destination, 'dutyDoctor');
  assert.match(words(built), /age as 45/);
});

test('nothing changes for a card that is not going to the pharmacy', () => {
  const built = accurxAnswer({
    condition: 'knee pain', text: 'knee pain 2 months', message: 'knee pain 2 months', reason: 'knee pain 2/12',
    route: readingVerdict({ destination: 'fcp', evidence: 'knee pain' }),
  });
  assert.equal(built.destination, 'fcp');
  assert.doesNotMatch(words(built), /Pharmacy First|Not sent to the pharmacy/);
  assert.equal(built.accurx.pharmacy, null);
  assert.equal(built.accurx.pharmacyRefused, '');
});

test('an adult’s musculoskeletal pain named as a pharmacy reason goes to the FCP', () => {
  const message = 'lower back pain since gardening yesterday, what can I take';
  const checked = checkPharmacyReason({ condition: 'Minor illness: Sprains, strains and aches', evidence: 'lower back pain' }, message);
  assert.equal(checked.ok, false);
  assert.equal(checked.redirect, 'fcp');

  const built = card({ condition: 'Self-care: Minor pain, discomfort and fever (aches and sprains, headache, period pain, back pain)', evidence: 'lower back pain' }, message);
  assert.equal(built.destination, 'fcp');
  assert.match(words(built), /First Contact Physiotherapist/);

  // A headache on the same catch-all entry is not musculoskeletal and stays.
  assert.equal(checkPharmacyReason({ condition: 'Self-care: Minor pain, discomfort and fever (aches and sprains, headache, period pain, back pain)', evidence: 'headache' }, 'headache for two days').ok, true);
  // Nor is a child's sprain, which the FCP would not see.
  assert.equal(checkPharmacyReason({ condition: 'Minor illness: Sprains, strains and aches', evidence: 'sprained his ankle' }, 'my 10 year old sprained his ankle').ok, true);
});
