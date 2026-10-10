// THE REASON FOR APPOINTMENT IS THE ACCURX MODE'S JOB, AND ONLY ITS JOB.
//
// It used to be reachable from ordinary Q&A: paste what a patient wrote, and a
// line to put in the appointment came back. Two things were wrong with that.
// The reader had not asked for it — a pasted patient message on the plain path
// is a patient being described, and where they go is the question. And the
// wording came back with NOTHING having decided the destination, which is the
// half that matters: the mode reads for both, and the card shows both.
//
// So this file holds the line. The template is off the picker, the fields it
// filled in are gone, and the only thing plain Q&A still says about a reason
// for appointment is how one is written — the house style, which is a question
// about the practice's rules rather than a line written from somebody's message.
import test from 'node:test';
import assert from 'node:assert/strict';

import { COMMAND_SCHEMAS, renderCommand } from '../lib/templates/route.mjs';
import { appointmentReasonAnswer } from '../lib/templates/writing.mjs';
import { answerToText } from '../lib/questions/flatten.mjs';
import * as writing from '../lib/templates/writing.mjs';

test('no written-reason card exists to be reached', () => {
  assert.equal(writing.writtenReasonAnswer, undefined);
});

test('the house style is still answered, and says where the line gets written', () => {
  const card = appointmentReasonAnswer();
  assert.equal(card.title, 'Writing the reason for appointment');

  const text = answerToText(card);
  assert.match(text, /choose the AccurX mode/i, 'the card does not say where the line is written');
});

test('the mode itself still writes the line, with where the request goes', () => {
  // Unchanged: /accurx asks for the reason on its own schema and renders both
  // halves. Nothing here was taken away from the path the reader arms.
  assert.ok(COMMAND_SCHEMAS.accurxTriage, 'the AccurX mode lost its schema');
  const card = renderCommand('accurxTriage', {
    condition: 'heartburn',
    reason: 'heartburn 3/52, worsening, gaviscon not helping',
    destination: 'gp',
    booking: [],
    details: [],
  }, 'I have had heartburn for about 3 weeks and it is getting worse, gaviscon is not helping');

  const text = answerToText(card);
  assert.match(text, /heartburn 3\/52, worsening, gaviscon not helping/, 'the mode no longer writes the reason line');
  assert.match(text, /Where this goes/, 'the mode no longer says where it goes');
});
