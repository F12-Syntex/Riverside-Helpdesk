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
  DESTINATIONS, HARD_GATES, diabetesNeedsGp, needsDiabetesNurse, nurseTask, nurseTaskNeedsGp, routingGuidance, sendTo,
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
  // Every route on the guide's own "routes at a glance" page, in ladder order.
  // The red button is the one route that is not an entry: it brings staff to the
  // front desk and does nothing for a message, so it lives on the emergency
  // entry as what to do as well when the patient is in the building.
  const ids = DESTINATIONS.map((d) => d.id);
  assert.deepEqual(ids, [
    'minorEyeService', 'pharmacy', 'midwife', 'socialPrescriber',
    'diabeticNurse', 'fcp', 'nurse', 'pharmacyTeam', 'districtNurse',
    'doctorTask', 'gp', 'dutyDoctor', 'dutyInterrupt', 'ae',
    'eyeEmergency', 'emergency',
  ]);
  assert.equal(new Set(ids).size, ids.length, 'no destination is written twice');
  for (const d of DESTINATIONS) {
    assert.ok(d.sendTo, d.id + ' says what a card puts on its destination line');
    assert.ok(d.covers, d.id + ' says what it takes');
    assert.ok(d.refuses, d.id + ' says what it will not');
    assert.ok(d.rank >= 1, d.id + ' has a seniority the reader can fold by');
    // Which page of docs/routing.md it was transcribed from, so an entry can be
    // checked against the source rather than taken on trust.
    assert.ok(d.doc, d.id + ' names the guide page it came from');
    assert.match(d.section, /^[A-D]$/, d.id + ' names the guide section it is in');
  }
  // The ladder must never let a nurse clinic outrank a doctor, whatever else is
  // added to it — that is what makes their "yes" a note rather than a route.
  const rank = (id) => DESTINATIONS.find((d) => d.id === id).rank;
  for (const clinic of ['nurse', 'diabeticNurse']) assert.ok(rank(clinic) < rank('gp'), clinic);
  assert.ok(rank('gp') < rank('dutyDoctor'));
  assert.ok(rank('dutyDoctor') < rank('dutyInterrupt'));
  assert.ok(rank('dutyInterrupt') < rank('emergency'));
});

test('the prose the signposting page reads is built from the same arrays', () => {
  const guidance = routingGuidance();
  for (const d of DESTINATIONS) assert.ok(guidance.includes(d.id), d.id + ' is in the prompt');
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

test('a blood test asked for is the nurse; one being chased is not', () => {
  // Both say "blood test". The guide books the first as a nurse appointment and
  // sends the second to the doctor as a task, so the words around it decide.
  assert.equal(nurseTask('pt asking to book a blood test').id, 'bloods');
  assert.equal(nurseTask('pt chasing her blood test results'), null);
  assert.equal(nurseTask('awaiting blood test from the GP'), null);
});

test('the guide’s own hard gates are carried, word for word in substance', () => {
  const gates = HARD_GATES.map((g) => g.gate).join(' | ');
  for (const expected of ['Under 16 — FCP', 'HPV vaccination', 'Travel vaccinations', 'Nurse clinics']) {
    assert.ok(gates.includes(expected), expected);
  }
  // They reach the reader too — a gate nobody is shown is a gate nobody applies.
  const guidance = routingGuidance();
  assert.match(guidance, /HARD GATES/);
  assert.match(guidance, /route UPWARD/, 'and the rule that overrides every other rule');
});

test('travel is read before immunisation, because the six-week rule is the answer', () => {
  const card = triagePatientAnswer({ condition: 'travel jabs', text: 'wants travel jabs before going to Nigeria next month' });
  assert.match(JSON.stringify(card), /six weeks/i);
});

test('a nurse procedure goes to the nurse, not to a pharmacy or a doctor', () => {
  assert.equal(goesTo('pt had stitches at the Royal London and needs them out on Thursday'), sendTo('nurse'));
  assert.equal(goesTo('pt asking for her dressing to be changed'), sendTo('nurse'));
  assert.equal(goesTo('pt is due her cervical smear and wants to book it'), sendTo('nurse'));
});

test('a wound that is going wrong is a doctor, not a dressing appointment', () => {
  assert.ok(nurseTaskNeedsGp(nurseTask('dressing change please'), 'the wound is oozing and the redness is spreading'));
  // The guard is only next to a wound. A smear that mentions a temperature is
  // still a smear.
  assert.equal(nurseTaskNeedsGp(nurseTask('due her smear'), 'she had a temperature last week'), false);

  const text = 'pt needs her dressing changed, the wound is oozing and the redness is spreading up her arm';
  assert.equal(goesTo(text), sendTo('dutyDoctor'));
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
  assert.equal(goesTo('pt says her diabetic review is due and wants to book it'), sendTo('diabeticNurse'));
});

test('diabetes alone is not a diabetes appointment', () => {
  // A diabetic asking about something else is not routine diabetes care, and the
  // card must not claim it is.
  assert.equal(needsDiabetesNurse('pt is diabetic and asking about a fit note'), false);
});

test('a patient who has not been diagnosed is a doctor', () => {
  assert.ok(diabetesNeedsGp('pt thinks she might be diabetic and wants to be tested'));
  assert.equal(needsDiabetesNurse('pt thinks she might be diabetic and wants a review'), false);
  assert.equal(goesTo('pt thinks she might be diabetic and wants to be tested'), sendTo('dutyDoctor'));
});

test('an unwell diabetic is a doctor, not a review appointment', () => {
  assert.ok(diabetesNeedsGp('diabetic patient vomiting since last night and sugars are very high'));
  assert.equal(goesTo('diabetic patient vomiting since last night, asking to book her review'), sendTo('dutyDoctor'));
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
