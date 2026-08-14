import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCURX_ROUTE_SCHEMA, DESTINATIONS, accurxRoutePrompt, applyRoute, destinationLabel, rankOfDestination,
} from '../lib/templates/accurx-route.mjs';
import { accurxAnswer } from '../lib/templates/accurx.mjs';
import { triagePatientAnswer } from '../lib/templates/triage.mjs';
import { resolveRoles, ROLE_KEYS, ROLE_SETTING_KEY } from '../lib/settings.js';

// The message that made this necessary, as it was pasted in. A patient after a
// recent miscarriage: headaches, both legs swollen and painful, shoulder pain,
// dizziness, bloods awaited. It came back as a physiotherapy appointment.
const MISCARRIAGE = [
  'Describe the problem  After Recent miscarriage. Headache: Severe, persistent headaches requiring',
  'daily pain relievers (2 to 3 times a day). Leg Symptoms: Swelling in both legs, accompanied by',
  'pain/aching also pain specifically in the left shoulder Dizziness: Feeling dizzy or lightheaded,',
  'particularly when looking up. Awaiting full blood test from the GP, but symptoms are ongoing and',
  'concerning.  How long have you had this? Since three weeks having legs swellings and pain.',
  'Have you tried anything to help? Pain killers three times a day.',
  'Expectations  Need to get checked up and wants complete blood test.',
].join(' ');

const flat = (blocks, out = []) => {
  for (const b of blocks || []) {
    out.push(b);
    if (b.type === 'expand') flat(b.blocks, out);
  }
  return out;
};
const sentTo = (card) => {
  const panel = flat(card.blocks).find((b) => b.type === 'fields' && b.title === 'Where this goes');
  return panel ? (panel.items.find((i) => i.label === 'Send it to') || {}).value || '' : '';
};
const words = (card) => flat(card.blocks)
  .map((b) => [b.text, b.markdown, (b.items || []).map((i) => (typeof i === 'string' ? i : i.value)).join(' ')].filter(Boolean).join(' '))
  .join(' ');

/* ------------------------------------------------------------- the ladder */

test('every destination the schema offers is one the ladder ranks', () => {
  for (const d of DESTINATIONS) {
    assert.ok(rankOfDestination(d.id) > 0, d.id);
    assert.ok(destinationLabel(d.id), d.id);
  }
  // "unsure" is a real answer and it must rank below everything, so it can
  // never move anything.
  assert.equal(rankOfDestination('unsure'), 0);
  assert.equal(rankOfDestination('somewhere-else'), 0);
});

test('a clinician outranks a pharmacist and a physiotherapist', () => {
  assert.ok(rankOfDestination('emergency') > rankOfDestination('dutyDoctor'));
  assert.ok(rankOfDestination('dutyDoctor') > rankOfDestination('gp'));
  assert.ok(rankOfDestination('gp') > rankOfDestination('fcp'));
  assert.ok(rankOfDestination('fcp') > rankOfDestination('pharmacy'));
});

/* -------------------------------------------------------------- the veto */

test('the reading may raise where a message goes', () => {
  const out = applyRoute('fcp', { destination: 'dutyDoctor', evidence: 'Swelling in both legs' }, MISCARRIAGE);
  assert.equal(out.destination, 'dutyDoctor');
  assert.equal(out.raised, true);
  assert.equal(out.because, 'Swelling in both legs');
});

test('the reading may NEVER lower it, however sure it sounds', () => {
  for (const said of ['pharmacy', 'fcp', 'gp', 'minorEyeService']) {
    const out = applyRoute('emergency', { destination: said, evidence: 'symptoms are ongoing' }, MISCARRIAGE);
    assert.equal(out.destination, 'emergency', said + ' must not be able to undo an emergency');
    assert.equal(out.raised, false);
  }
  assert.equal(applyRoute('gp', { destination: 'fcp' }, MISCARRIAGE).destination, 'gp');
  // The same destination is not a raise either.
  assert.equal(applyRoute('fcp', { destination: 'fcp' }, MISCARRIAGE).raised, false);
});

test('a verdict that is missing, unsure or nonsense changes nothing', () => {
  for (const verdict of [null, undefined, {}, { destination: 'unsure' }, { destination: 'A&E' }, { destination: '' }]) {
    const out = applyRoute('fcp', verdict, MISCARRIAGE);
    assert.equal(out.destination, 'fcp');
    assert.equal(out.raised, false);
  }
});

test('a quote that is not in the message is dropped, and the raise still stands', () => {
  const out = applyRoute('fcp', {
    destination: 'dutyDoctor',
    evidence: 'the patient reports a possible clot',
  }, MISCARRIAGE);
  assert.equal(out.destination, 'dutyDoctor', 'an unevidenced escalation still escalates — that is the safe direction');
  assert.equal(out.because, '', 'but it does not get to quote words nobody wrote');
});

test('a quote is matched however the punctuation differs', () => {
  const out = applyRoute('fcp', {
    destination: 'dutyDoctor',
    evidence: 'Swelling in both legs, accompanied by pain',
  }, MISCARRIAGE);
  assert.equal(out.because, 'Swelling in both legs, accompanied by pain');
});

/* ------------------------------------------------------------- the card */

test('the patterns alone still send this message to the physiotherapist', () => {
  // Not a wish — a record. This is the behaviour the reading exists to catch,
  // and if it ever changes on its own this test says so rather than the fix
  // quietly becoming unnecessary and unnoticed.
  const patterns = triagePatientAnswer({ condition: 'headache', text: MISCARRIAGE });
  assert.equal(patterns.destination, 'fcp');
});

test('reading the whole message sends it to a doctor today instead', () => {
  const card = accurxAnswer({
    condition: 'headache',
    text: MISCARRIAGE,
    reason: 'severe persistent headaches 3/7, leg swelling and pain 3/7, dizziness, awaiting bloods',
    route: { destination: 'dutyDoctor', evidence: 'Swelling in both legs', page: '' },
  });
  assert.equal(card.destination, 'dutyDoctor');
  assert.match(sentTo(card), /duty doctor/i);
  assert.ok(!/physiotherapist/i.test(sentTo(card)), 'it must not still say FCP');
  // The card says where the words would have sent it, and what moved it.
  assert.match(words(card), /Swelling in both legs/);
  assert.match(words(card), /First Contact Physiotherapist/, 'the reader is told what the wording alone would have done');
});

test('the reason line and the booking notes survive the raise', () => {
  const card = accurxAnswer({
    condition: 'headache',
    text: MISCARRIAGE,
    reason: 'severe persistent headaches 3/7, leg swelling and pain 3/7',
    booking: ['contact whole day asap'],
    route: { destination: 'dutyDoctor', evidence: 'Swelling in both legs' },
  });
  assert.match(words(card), /severe persistent headaches/);
  assert.match(words(card), /contact whole day asap/);
});

test('a raise to an emergency takes the appointment line off the card', () => {
  const card = accurxAnswer({
    condition: 'headache',
    text: MISCARRIAGE,
    reason: 'severe persistent headaches 3/7, leg swelling and pain 3/7',
    route: { destination: 'emergency', evidence: 'Feeling dizzy or lightheaded' },
  });
  assert.equal(card.destination, 'emergency');
  const fieldsBlocks = flat(card.blocks).filter((b) => b.type === 'fields');
  const copies = fieldsBlocks.flatMap((b) => b.items).filter((i) => i.copy);
  assert.equal(copies.length, 0, 'nobody books anything off an emergency card');
  assert.match(words(card), /handover/i);
});

test('a raise that names the physio renders as the physio, not as a doctor', () => {
  // The floor is a pharmacy referral, so anything above rank 1 is a raise —
  // including the destinations that are not a doctor. The card used to answer
  // every non-emergency raise with "A GP appointment here", which is not where
  // the reading sent it and not what the reader should book.
  const text = 'my throat has been sore since Friday';
  assert.equal(triagePatientAnswer({ condition: 'sore throat', text }).destination, 'pharmacy');

  const card = accurxAnswer({
    condition: 'sore throat',
    text,
    reason: 'sore throat 3/7',
    route: { destination: 'fcp', evidence: 'my throat has been sore since Friday' },
  });
  assert.equal(card.destination, 'fcp');
  assert.match(sentTo(card), /Physiotherapist/);
  assert.ok(!/GP appointment here/i.test(words(card)), 'it must not tell them to book a doctor');
  // And it still says what the wording alone would have done, and what moved it.
  assert.match(words(card), /Community pharmacy/);
  assert.match(words(card), /my throat has been sore since Friday/);
});

test('a raise to a doctor still renders the doctor card', () => {
  for (const [said, expected] of [['gp', /GP appointment here/], ['dutyDoctor', /duty doctor/i]]) {
    const card = accurxAnswer({
      condition: 'sore throat',
      text: 'my throat has been sore since Friday',
      reason: 'sore throat 3/7',
      route: { destination: said, evidence: 'my throat has been sore since Friday' },
    });
    assert.equal(card.destination, said);
    assert.match(sentTo(card), expected);
  }
});

test('with no reading at all the card is exactly what it always was', () => {
  const before = accurxAnswer({ condition: 'back pain', text: 'my back has hurt for a week, ibuprofen has not touched it', reason: 'back pain 1/7, ibuprofen ineffective' });
  const after = accurxAnswer({ condition: 'back pain', text: 'my back has hurt for a week, ibuprofen has not touched it', reason: 'back pain 1/7, ibuprofen ineffective', route: null });
  assert.deepEqual(before, after);
  assert.equal(before.destination, 'fcp');
  assert.ok(!/read as one message/i.test(words(before)), 'no reading, no claim that one happened');
});

test('a reading that agrees with the patterns adds nothing to the card', () => {
  const agreed = accurxAnswer({
    condition: 'back pain',
    text: 'my back has hurt for a week, ibuprofen has not touched it',
    reason: 'back pain 1/7, ibuprofen ineffective',
    route: { destination: 'fcp', evidence: 'ibuprofen has not touched it' },
  });
  const alone = accurxAnswer({
    condition: 'back pain',
    text: 'my back has hurt for a week, ibuprofen has not touched it',
    reason: 'back pain 1/7, ibuprofen ineffective',
  });
  assert.deepEqual(agreed, alone);
});

test('the quote is checked against the WHOLE message, not the routed complaint', () => {
  // The words that move an /accurx are usually in a different complaint from
  // the one the card is about. That is the entire reason for reading it.
  const card = accurxAnswer({
    condition: 'headache',
    text: 'Headache: Severe, persistent headaches requiring daily pain relievers',
    complaint: 'Headache: Severe, persistent headaches requiring daily pain relievers',
    message: MISCARRIAGE,
    reason: 'severe persistent headaches 3/7',
    route: { destination: 'dutyDoctor', evidence: 'After Recent miscarriage' },
  });
  assert.match(words(card), /After Recent miscarriage/);
});

/* ------------------------------------------------------------ the prompt */

test('the prompt offers the practice’s destinations and nothing else', () => {
  const prompt = accurxRoutePrompt({ question: MISCARRIAGE, notebook: '- Physiotherapy (FCP) — how FCP works' });
  for (const d of DESTINATIONS) assert.match(prompt, new RegExp('"' + d.id + '"'));
  assert.match(prompt, /Physiotherapy \(FCP\) — how FCP works/, 'the Notebook goes in beside them');
  assert.match(prompt, /You cannot make anything less urgent/);
  assert.ok(prompt.includes(MISCARRIAGE.slice(0, 60)));
});

test('the schema will not accept a destination the practice does not have', () => {
  assert.ok(ACCURX_ROUTE_SCHEMA.safeParse({ destination: 'dutyDoctor' }).success);
  assert.ok(ACCURX_ROUTE_SCHEMA.safeParse({ destination: 'unsure' }).success);
  assert.ok(!ACCURX_ROUTE_SCHEMA.safeParse({ destination: 'A&E' }).success);
  assert.ok(!ACCURX_ROUTE_SCHEMA.safeParse({}).success, 'a destination is not optional');
});

/* -------------------------------------------------------------- the role */

test('the accurx role is settable and inherits from fast, not from reasoning', () => {
  assert.ok(ROLE_KEYS.includes('accurx'));
  assert.equal(ROLE_SETTING_KEY.accurx, 'ai_model_accurx');

  const nothing = resolveRoles({ base: 'a/reasoning', stored: {}, env: {} });
  assert.equal(nothing.accurx.model, 'a/reasoning', 'with no fast model set, fast IS the reasoning model');

  const fastSet = resolveRoles({ base: 'a/reasoning', stored: { fast: 'b/fast' }, env: {} });
  assert.equal(fastSet.accurx.model, 'b/fast', 'it follows fast, not the model above it');
  assert.equal(fastSet.accurx.source, 'fast');

  const chosen = resolveRoles({ base: 'a/reasoning', stored: { fast: 'b/fast', accurx: 'c/reader' }, env: {} });
  assert.equal(chosen.accurx.model, 'c/reader');
  assert.equal(chosen.accurx.source, 'database');

  const fromEnv = resolveRoles({ base: 'a/reasoning', stored: { fast: 'b/fast' }, env: { OPENROUTER_ACCURX_MODEL: 'd/env' } });
  assert.equal(fromEnv.accurx.model, 'd/env');
});

test('adding the role left the others exactly where they were', () => {
  const roles = resolveRoles({ base: 'a/reasoning', stored: { fast: 'b/fast', web: 'c/web' }, env: {} });
  assert.equal(roles.reasoning.model, 'a/reasoning');
  assert.equal(roles.fast.model, 'b/fast');
  assert.equal(roles.web.model, 'c/web');
});
