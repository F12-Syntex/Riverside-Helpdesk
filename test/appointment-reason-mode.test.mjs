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

import { COMMAND_SCHEMAS, SELECTION_SCHEMA, renderCommand, renderSelection, selectionPrompt } from '../lib/templates/route.mjs';
import { appointmentReasonAnswer } from '../lib/templates/writing.mjs';
import { answerToText } from '../lib/questions/flatten.mjs';
import * as writing from '../lib/templates/writing.mjs';

const templates = () => SELECTION_SCHEMA.shape.template._def.values;

test('the picker cannot choose a written reason line at all', () => {
  assert.ok(!templates().includes('appointmentReason'), 'appointmentReason is still on the picker');
  // And the fields that existed only to fill it in are gone with it, so no
  // model is asked for a reason line on this path.
  assert.equal(SELECTION_SCHEMA.shape.reason, undefined);
  assert.equal(SELECTION_SCHEMA.shape.details, undefined);
});

test('nothing renders one either, however the selection is shaped', () => {
  const card = renderSelection(
    { template: 'appointmentReason', reason: 'heartburn 3/52, worsening', details: [] },
    'I have had heartburn for about 3 weeks and it is getting worse',
  );
  assert.equal(card, null, 'a reason card was rendered from a plain selection');

  // The card itself no longer exists, so it cannot be reached another way.
  assert.equal(writing.writtenReasonAnswer, undefined);
});

test('the prompt sends a pasted patient message to triage, and names the mode', () => {
  const prompt = selectionPrompt({ question: 'I have had heartburn for 3 weeks', notebook: '' });
  assert.doesNotMatch(prompt, /"appointmentReason"/);
  assert.match(prompt, /REASON FOR APPOINTMENT IS NOT WRITTEN ON THIS PATH/);
  assert.match(prompt, /AccurX mode/);
  // Triage is where a described patient goes now, first person or not.
  assert.match(prompt, /INCLUDING first-person text a patient wrote/);
});

test('the house style is still answered, and says where the line gets written', () => {
  assert.ok(templates().includes('appointmentReasonRules'), 'the house style is unreachable');
  const card = renderSelection({ template: 'appointmentReasonRules' }, 'how should I write the reason for appointment');
  assert.equal(card.title, 'Writing the reason for appointment');

  const text = answerToText(card);
  assert.match(text, /choose the AccurX mode/i, 'the card does not say where the line is written');
  // It teaches the style; it does not write anybody's line.
  assert.equal(answerToText(appointmentReasonAnswer()), text);
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
