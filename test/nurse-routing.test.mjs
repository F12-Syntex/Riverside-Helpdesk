// The two destinations the triage did not have, and the order they sit in.
//
// Before this, "her stitches need to come out" and "diabetic review due" both
// fell through every check and came back as the duty doctor, and a dressing
// change matched "wound problems and dressings" on the Pharmacy First minor
// illness list and went to a pharmacy. What is tested here is the routing, not
// the wording: which destination the card names, and — for every guard — that
// the thing which must reach a doctor still does.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESTINATIONS, diabetesNeedsGp, needsDiabetesNurse, nurseTask, nurseTaskNeedsGp, routingGuidance, sendTo,
} from '../lib/triage/destinations.mjs';
import { triagePatientAnswer } from '../lib/templates/triage.mjs';

const goesTo = (text, condition = '') => {
  const card = triagePatientAnswer({ condition: condition || text, text });
  const panel = card.blocks.find((b) => b.type === 'fields');
  const where = panel && panel.items.find((i) => i.label === 'Send it to');
  return where ? where.value : '';
};

/* ------------------------------------------------------------ the roster */

test('every destination the practice has is named once, with both lists', () => {
  const keys = DESTINATIONS.map((d) => d.key);
  assert.deepEqual(keys, ['urgent-care', 'gp', 'fcp', 'pharmacy-first', 'diabetes-nurse', 'practice-nurse']);
  assert.equal(new Set(keys).size, keys.length, 'no destination is written twice');
  for (const d of DESTINATIONS) {
    assert.ok(d.sendTo, d.key + ' says what a card puts on its destination line');
    assert.ok(d.handles.length, d.key + ' says what it takes');
    assert.ok(d.never.length, d.key + ' says what it does not');
  }
});

test('the prose the signposting page reads is built from the same arrays', () => {
  const guidance = routingGuidance();
  for (const d of DESTINATIONS) assert.ok(guidance.includes(d.key), d.key + ' is in the prompt');
  assert.match(guidance, /Nurses work Mondays, Wednesdays and Fridays/);
  assert.match(guidance, /top to bottom/);
});

/* ------------------------------------------------------- the nurse clinic */

test('a procedure the nurse does is matched by name', () => {
  assert.equal(nurseTask('pt needs her stitches out on Thursday').id, 'sutures');
  assert.equal(nurseTask('asking for a dressing change on her leg').id, 'dressing');
  assert.equal(nurseTask('due her smear').id, 'smear');
  assert.equal(nurseTask('wants the flu jab').id, 'immunisation');
  assert.equal(nurseTask('needs a blood pressure check').id, 'bp');
  assert.equal(nurseTask('B12 injection is due').id, 'b12');
  assert.equal(nurseTask('asking about travel vaccinations for Nigeria').id, 'travel');
  // Not a procedure. A description of an illness is not a nurse booking.
  assert.equal(nurseTask('pt has a sore throat since Friday'), null);
  assert.equal(nurseTask(''), null);
});

test('travel is read before immunisation, because the six-week rule is the answer', () => {
  const card = triagePatientAnswer({ condition: 'travel jabs', text: 'wants travel jabs before going to Nigeria next month' });
  assert.match(JSON.stringify(card), /six weeks/i);
});

test('a nurse procedure goes to the nurse, not to a pharmacy or a doctor', () => {
  assert.equal(goesTo('pt had stitches at the Royal London and needs them out on Thursday'), sendTo('practice-nurse'));
  assert.equal(goesTo('pt asking for her dressing to be changed'), sendTo('practice-nurse'));
  assert.equal(goesTo('pt is due her cervical smear and wants to book it'), sendTo('practice-nurse'));
});

test('a wound that is going wrong is a doctor, not a dressing appointment', () => {
  assert.ok(nurseTaskNeedsGp(nurseTask('dressing change please'), 'the wound is oozing and the redness is spreading'));
  // The guard is only next to a wound. A smear that mentions a temperature is
  // still a smear.
  assert.equal(nurseTaskNeedsGp(nurseTask('due her smear'), 'she had a temperature last week'), false);

  const text = 'pt needs her dressing changed, the wound is oozing and the redness is spreading up her arm';
  assert.equal(goesTo(text), sendTo('gp'));
  assert.match(JSON.stringify(triagePatientAnswer({ condition: 'dressing change', text })), /duty doctor/i);
});

test('an emergency in the same message still wins over the procedure', () => {
  // The order runs top to bottom and nothing later can take a red flag back.
  const card = triagePatientAnswer({
    condition: 'stitches out',
    text: 'pt wants her stitches out, and says she has had chest pain since this morning',
  });
  assert.match(JSON.stringify(card), /duty doctor/i);
  assert.doesNotMatch(JSON.stringify(card), /nurse clinic/i);
});

/* ---------------------------------------------------------- diabetes care */

test('routine diabetes care goes to the diabetes nurse', () => {
  assert.ok(needsDiabetesNurse('pt says her diabetic review is due and wants to book it'));
  assert.ok(needsDiabetesNurse('diabetic patient asking about his HbA1c follow-up'));
  assert.ok(needsDiabetesNurse('wants a diabetic foot check booked'));
  assert.equal(goesTo('pt says her diabetic review is due and wants to book it'), sendTo('diabetes-nurse'));
});

test('diabetes alone is not a diabetes appointment', () => {
  // A diabetic asking about something else is not routine diabetes care, and the
  // card must not claim it is.
  assert.equal(needsDiabetesNurse('pt is diabetic and asking about a fit note'), false);
});

test('a patient who has not been diagnosed is a doctor', () => {
  assert.ok(diabetesNeedsGp('pt thinks she might be diabetic and wants to be tested'));
  assert.equal(needsDiabetesNurse('pt thinks she might be diabetic and wants a review'), false);
  assert.equal(goesTo('pt thinks she might be diabetic and wants to be tested'), sendTo('gp'));
});

test('an unwell diabetic is a doctor, not a review appointment', () => {
  assert.ok(diabetesNeedsGp('diabetic patient vomiting since last night and sugars are very high'));
  assert.equal(goesTo('diabetic patient vomiting since last night, asking to book her review'), sendTo('gp'));
});

test('a diabetic foot that has gone wrong does not wait for the recall', () => {
  assert.ok(diabetesNeedsGp('diabetic patient says there is an ulcer on his foot that will not heal'));
  const json = JSON.stringify(triagePatientAnswer({
    condition: 'diabetic foot ulcer',
    text: 'diabetic patient says there is an ulcer on his foot that will not heal',
  }));
  assert.match(json, /duty doctor/i);
  assert.match(json, /ulcer/i);
});

/* ------------------------------------------------- what must not have moved */

test('the routes that were already right are unchanged', () => {
  // Simple minor illness still goes to the pharmacy, and a musculoskeletal
  // problem that has failed self-care still goes to the FCP. The two new steps
  // sit between the FCP check and the pharmacy lists and must not have taken
  // anything from either.
  assert.match(goesTo('pt has a sore throat since Friday, no fever'), /Community pharmacy/);
  assert.match(
    goesTo('severe lower back pain radiating into the left leg with numbness, maximum dose ibuprofen has not touched it'),
    /First Contact Physiotherapist/,
  );
  assert.equal(goesTo('pt has chest pain and is short of breath'), 'The duty doctor');
});
