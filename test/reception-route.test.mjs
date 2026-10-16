// ADMIN STOPS BEING A DOCTOR TASK.
//
// The routing guide ended "if a request does not fit one of them, it is a doctor
// task", and none of its routes was the front desk — so a change of address, a
// copy of a letter and "are my bloods back" all went to a doctor as a task. The
// reception route is where those go now. What is held here is that it exists,
// that it sits at the bottom of the ladder, that every account of the ladder the
// reader is given points admin at it, and that it refuses anything clinical.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DESTINATIONS, routingGuidance } from '../lib/triage/destinations.mjs';
import { accurxReadPrompt, readingVerdict, ACCURX_READ_SCHEMA } from '../lib/templates/accurx-route.mjs';
import { howTo } from '../lib/templates/route-card.mjs';
import { noAnswerNote } from '../lib/templates/accurx.mjs';

const byId = (id) => DESTINATIONS.find((d) => d.id === id);

test('reception is a destination, at the bottom of the ladder', () => {
  const r = byId('reception');
  assert.ok(r, 'reception exists');
  assert.equal(r.rank, 1, 'nothing ranks below the front desk');
  assert.ok(r.rank < byId('doctorTask').rank);
  assert.match(r.covers, /change(s)? of address/i);
  assert.match(r.covers, /results/i);
});

test('reception refuses anything clinical, and says where it goes instead', () => {
  const r = byId('reception').refuses;
  assert.match(r, /symptom/i);
  assert.match(r, /not been filed/i, 'an unfiled result is not read out at the desk');
  assert.match(r, /doctor task/i);
  assert.match(r, /pharmacy team/i, 'medication still goes to the pharmacy team');
});

test('the doctor task no longer takes admin, and says whose it is', () => {
  const d = byId('doctorTask');
  assert.match(d.covers, /DOCTOR HAS TO DECIDE OR SIGN/);
  assert.match(d.refuses, /reception’s/);
  assert.match(byId('gp').refuses, /reception’s/);
  assert.match(byId('dutyDoctor').refuses, /reception’s/);
});

test('the signposting prose names reception before the doctor task', () => {
  const g = routingGuidance();
  const admin = g.indexOf('— reception.');
  const task = g.indexOf('— doctorTask.');
  assert.ok(admin > 0 && task > 0);
  assert.ok(admin < task, 'reception is offered before a doctor task');
  assert.match(g, /11\. Anything else, and anything unclear — dutyDoctor/);
});

test('the /accurx reader asks "is there anything clinical in it" first', () => {
  const p = accurxReadPrompt({ question: 'I have moved house, new address is attached' });
  const admin = p.indexOf('IS THERE ANYTHING CLINICAL IN IT');
  const ladder = p.indexOf('RULE OUT THE SERVICES BELOW A DOCTOR FIRST');
  assert.ok(admin > 0 && admin < ladder);
  assert.match(p, /- reception — Reception \/ admin team/);
});

test('the schema accepts reception, and a reading of it survives the adapter', () => {
  const parsed = ACCURX_READ_SCHEMA.parse({ destination: 'reception' });
  assert.equal(parsed.destination, 'reception');
  const v = readingVerdict({ destination: 'reception', reasoning: 'change of address only, nothing clinical' });
  assert.equal(v.destination, 'reception');
});

test('the card tells reception how to action it, and the no-answer line books nobody', () => {
  const steps = howTo('reception').join(' ');
  assert.match(steps, /only\*\* the comment the clinician filed/);
  const line = noAnswerNote({ destination: 'reception', reason: 'change of address' });
  assert.equal(line, 'Tried to call pt re: change of address, admin request. No answer.');
  assert.doesNotMatch(line, /book/);
});
