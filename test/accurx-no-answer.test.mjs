import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accurxAnswer, noAnswerNote } from '../lib/templates/accurx.mjs';

test('the no-answer note says who we tried to book with and what for', () => {
  assert.equal(
    noAnswerNote({ destination: 'gp', reason: 'sore throat 3/7.', mode: 'telephone' }),
    'Tried to call pt to book tel appt with GP re: sore throat 3/7. No answer.',
  );
  assert.equal(
    noAnswerNote({ destination: 'nurse', reason: '' }),
    'Tried to call pt to book appt with practice nurse. No answer.',
  );
});

test('somewhere the practice does not book into, the note says signpost', () => {
  assert.equal(
    noAnswerNote({ destination: 'pharmacy', reason: 'sore throat 3/7', sendTo: 'Community pharmacy (Pharmacy First)' }),
    'Tried to call pt re: sore throat 3/7, to signpost to Community pharmacy (Pharmacy First). No answer.',
  );
});

test('the AccurX card carries the note, except on a card that means now', () => {
  const booked = accurxAnswer({
    condition: 'sore throat', text: 'my throat has been sore since Friday', reason: 'sore throat 3/7',
    route: { destination: 'gp', evidence: 'my throat has been sore since Friday' },
  });
  assert.match(booked.accurx.noAnswer, /^Tried to call pt to book appt with GP re: sore throat 3\/7\. No answer\.$/);

  const now = accurxAnswer({
    condition: 'chest pain', text: 'crushing chest pain now', reason: 'chest pain',
    route: { destination: 'emergency', evidence: 'crushing chest pain now' },
  });
  assert.equal(now.accurx.noAnswer, '');
});

test('the reading writes the no-answer line when it has one', async () => {
  const { renderCommand } = await import('../lib/templates/route.mjs');
  const line = 'Tried to call pt to book tel appt with GP re: heartburn 3/52; also to advise repeat req sent to pharmacy team. No answer.';
  const card = renderCommand('accurxTriage', {
    destination: 'gp', evidence: 'heartburn', reason: 'heartburn 3/52, gaviscon not helping', noAnswer: line,
  }, 'I have had heartburn for 3 weeks and gaviscon is not helping, also need my repeat');
  assert.equal(card.accurx.noAnswer, line);
});

test('the schema asks the reading for the no-answer line, and the prompt says what it is', async () => {
  const { ACCURX_READ_SCHEMA, accurxReadPrompt } = await import('../lib/templates/accurx-route.mjs');
  assert.equal(ACCURX_READ_SCHEMA.parse({ destination: 'gp' }).noAnswer, '');
  assert.match(accurxReadPrompt({ question: 'x' }), /"noAnswer"/);
});
