// TELEPHONE OR FACE-TO-FACE, on the /accurx card.
//
// "A GP appointment here" is not one thing to book, and the card used to stop at
// the destination. These tests hold the three things that matter about the layer
// that answers it: it is asked only where the practice books a doctor's
// appointment, it never touches where the message goes, and an answer nobody
// could work out books a room rather than quietly booking a phone call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCURX_READ_SCHEMA, accurxReadPrompt, readingVerdict } from '../lib/templates/accurx-route.mjs';
import { accurxAnswer } from '../lib/templates/accurx.mjs';
import {
  APPOINTMENT_MODES, BOOKED_WITH_A_DOCTOR, appointmentMode, needsAppointmentMode,
} from '../lib/triage/destinations.mjs';
import { buildProvenance } from '../lib/questions/provenance.mjs';

const flat = (blocks, out = []) => {
  for (const b of blocks || []) {
    out.push(b);
    if (b.type === 'expand') flat(b.blocks, out);
  }
  return out;
};
const panel = (card, title) => flat(card.blocks).find((b) => b.type === 'fields' && b.title === title) || null;
const rowValue = (card, title, label) => {
  const found = panel(card, title);
  if (!found) return '';
  const row = found.items.find((i) => i.label === label);
  return row ? row.value : '';
};
const words = (card) => flat(card.blocks)
  .map((b) => [b.text, b.markdown, b.label, (b.items || []).map((i) => (typeof i === 'string' ? i : [i.label, i.value].join(' '))).join(' ')].filter(Boolean).join(' '))
  .join(' ');

// A reading, as the one /accurx call returns it.
const read = ({ destination = 'gp', mode = 'unsure', why = '' } = {}) => readingVerdict({
  reasoning: 'stable and not urgent',
  destination,
  evidence: '',
  appointment: { mode, why },
  condition: 'ear pain',
  reason: 'ear pain 3/12',
});

const card = (opts) => accurxAnswer({
  condition: 'ear pain',
  text: 'ear has been sore for months',
  reason: 'ear pain 3/12',
  route: read(opts),
  message: 'ear has been sore for months',
});

/* ---------------------------------------------------- where it is asked */

test('only the two routes that book a doctor’s appointment ask the question', () => {
  assert.deepEqual(BOOKED_WITH_A_DOCTOR, ['gp', 'dutyDoctor']);
  assert.ok(needsAppointmentMode('gp'));
  assert.ok(needsAppointmentMode('dutyDoctor'));
  for (const id of ['pharmacy', 'fcp', 'nurse', 'pharmacyTeam', 'doctorTask', 'ae', 'emergency', '']) {
    assert.equal(needsAppointmentMode(id), false, id);
  }
});

test('the schema offers the two slot types and "unsure", and defaults to unsure', () => {
  const parsed = ACCURX_READ_SCHEMA.parse({ destination: 'gp' });
  assert.deepEqual(parsed.appointment, { why: '', mode: 'unsure' });
  assert.ok(ACCURX_READ_SCHEMA.safeParse({ destination: 'gp', appointment: { mode: 'faceToFace' } }).success);
  assert.ok(ACCURX_READ_SCHEMA.safeParse({ destination: 'gp', appointment: { mode: 'telephone' } }).success);
  assert.equal(ACCURX_READ_SCHEMA.safeParse({ destination: 'gp', appointment: { mode: 'video' } }).success, false);
});

test('the prompt hands over the practice’s own test, and says which routes it is for', () => {
  const prompt = accurxReadPrompt({ question: 'ear pain' });
  assert.match(prompt, /look at, listen to, or feel something/i);
  assert.match(prompt, /TELEPHONE OR FACE-TO-FACE/);
  assert.match(prompt, /ONLY if you named gp or dutyDoctor/);
  assert.match(prompt, /If in doubt, book face-to-face/i);
});

/* ------------------------------------------------- what the reading says */

test('the verdict carries the mode, and anything it does not recognise is unsure', () => {
  assert.equal(read({ mode: 'telephone' }).appointment.mode, 'telephone');
  assert.equal(read({ mode: 'faceToFace' }).appointment.mode, 'faceToFace');
  assert.equal(read({ mode: 'video call' }).appointment.mode, 'unsure');
  assert.equal(readingVerdict({ destination: 'gp' }).appointment.mode, 'unsure');
  assert.equal(readingVerdict({ destination: 'gp', appointment: 'telephone' }).appointment.mode, 'unsure');
});

test('an unrecognised mode books a room — never a phone call', () => {
  assert.equal(appointmentMode('nonsense').label, 'Face-to-face');
  assert.ok(appointmentMode('nonsense').hedged);
  assert.equal(APPOINTMENT_MODES.telephone.hedged, false);
});

/* ------------------------------------------------------------- the card */

test('a GP card says which kind of appointment, and why', () => {
  const built = card({ destination: 'gp', mode: 'faceToFace', why: 'needs the ear looked at' });
  assert.equal(rowValue(built, 'Which kind of appointment', 'Book as'), 'Face-to-face');
  assert.equal(rowValue(built, 'Which kind of appointment', 'Because'), 'needs the ear looked at');
  assert.match(words(built), /How telephone or face-to-face was decided/);
});

test('a telephone reading books a telephone slot', () => {
  const built = card({ destination: 'gp', mode: 'telephone', why: 'results discussion' });
  assert.equal(rowValue(built, 'Which kind of appointment', 'Book as'), 'Telephone');
  assert.match(words(built), /Book a telephone slot/);
});

test('the duty doctor is asked the same question', () => {
  const built = card({ destination: 'dutyDoctor', mode: 'faceToFace', why: 'chest to listen to' });
  assert.equal(rowValue(built, 'Which kind of appointment', 'Book as'), 'Face-to-face');
});

test('an unsure reading books face-to-face and says nothing decided it', () => {
  const built = card({ destination: 'gp', mode: 'unsure' });
  assert.equal(rowValue(built, 'Which kind of appointment', 'Book as'), 'Face-to-face');
  assert.match(words(built), /Nothing in the message decided this/);
  // And it does not claim a reason it was not given.
  assert.equal(rowValue(built, 'Which kind of appointment', 'Because'), '');
});

test('nothing about slot types on a card that is not booking a doctor', () => {
  for (const id of ['pharmacy', 'fcp', 'nurse', 'doctorTask', 'districtNurse']) {
    const built = card({ destination: id, mode: 'telephone', why: 'no need to examine' });
    assert.equal(panel(built, 'Which kind of appointment'), null, id);
    assert.doesNotMatch(words(built), /How telephone or face-to-face was decided/, id);
  }
});

test('nobody is offered a slot type on a card where somebody stands up', () => {
  for (const id of ['emergency', 'dutyInterrupt', 'ae', 'eyeEmergency']) {
    const built = card({ destination: id, mode: 'faceToFace', why: 'needs examining' });
    assert.equal(panel(built, 'Which kind of appointment'), null, id);
  }
});

test('a message that could not be read is offered no slot type', () => {
  // Nothing read it, so it is with the duty doctor because that is what the
  // practice does with what it cannot place. A slot type there would be a guess
  // presented as an answer, on the one card that says outright it assessed
  // nothing.
  const built = accurxAnswer({
    condition: 'ear pain',
    text: 'ear has been sore for months',
    reason: 'ear pain 3/12',
    route: null,
    message: 'ear has been sore for months',
  });
  assert.equal(built.destination, 'dutyDoctor');
  assert.match(words(built), /could not be read/i);
  assert.equal(panel(built, 'Which kind of appointment'), null);
});

test('the slot type comes after where it goes and before the reason line', () => {
  const built = card({ destination: 'gp', mode: 'telephone', why: 'results discussion' });
  const titles = flat(built.blocks).filter((b) => b.type === 'fields').map((b) => b.title);
  assert.ok(titles.indexOf('Where this goes') < titles.indexOf('Which kind of appointment'));
  assert.ok(titles.indexOf('Which kind of appointment') < titles.indexOf('Copy into the appointment'));
});

test('the slot type cannot move where the message goes', () => {
  const phone = card({ destination: 'gp', mode: 'telephone' });
  const room = card({ destination: 'gp', mode: 'faceToFace' });
  assert.equal(phone.destination, 'gp');
  assert.equal(room.destination, 'gp');
  assert.equal(rowValue(phone, 'Where this goes', 'Send it to'), rowValue(room, 'Where this goes', 'Send it to'));
});

/* ------------------------------------------------------------ the log */

test('the log records which kind of appointment, and only where one was booked', () => {
  const booked = buildProvenance({ route: { read: 'gp', card: 'gp', mode: 'telephone' } });
  assert.equal(booked.route.mode, 'telephone');
  const not = buildProvenance({ route: { read: 'pharmacy', card: 'pharmacy', mode: '' } });
  assert.equal('mode' in not.route, false);
});
