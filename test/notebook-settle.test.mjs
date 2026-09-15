import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences } from '../lib/notebook/sentences.mjs';
import { settleStatement, mergeWording } from '../lib/notebook/settle.mjs';

const idOf = (body, text) => (splitSentences(body).find((s) => s.text === text) || {}).id;

test('the chosen field value replaces the other page’s, and only that value', () => {
  const body = '# Physiotherapy\n\nSpeciality: Physiotherapy\n- **Send to:** physio.team@nhs.uk\n\nRing first.\n';
  const out = settleStatement({
    body,
    sentenceId: idOf(body, '- **Send to:** physio.team@nhs.uk'),
    expect: '- **Send to:** physio.team@nhs.uk',
    winner: 'Send to: physio.referrals@nhs.net',
  });
  assert.equal(out.body, '# Physiotherapy\n\nSpeciality: Physiotherapy\n- **Send to:** physio.referrals@nhs.net\n\nRing first.\n');
  assert.equal(out.to, '- **Send to:** physio.referrals@nhs.net');
});

test('prose is replaced whole, and nothing else on the page moves', () => {
  const body = 'Send the form within 72 hours of the appointment.\n\nRing the ward if it is urgent.\n';
  const expect = 'Send the form within 72 hours of the appointment.';
  const out = settleStatement({ body, sentenceId: idOf(body, expect), expect, winner: 'Send the form within 48 hours of the appointment.' });
  assert.equal(out.body, 'Send the form within 48 hours of the appointment.\n\nRing the ward if it is urgent.\n');
});

test('a line that has since been edited away is refused, not guessed at', () => {
  const out = settleStatement({
    body: 'Send the form within 24 hours.\n',
    sentenceId: 's1',
    expect: 'Send the form within 72 hours of the appointment.',
    winner: 'Send the form within 48 hours of the appointment.',
  });
  assert.match(out.error, /no longer on the page/);
  assert.equal(out.body, undefined);
});

test('a line that appears twice is refused — the reader chose one of them', () => {
  const line = 'Send the form within 72 hours of the appointment.';
  const out = settleStatement({ body: line + '\n\nAlso: ' + line + '\n', sentenceId: 'sX', expect: line, winner: 'Send it within 48 hours.' });
  assert.match(out.error, /more than once/);
});

test('the sentence id is trusted only when the text under it still matches', () => {
  const body = 'First line here about the form.\nSend the form within 72 hours of the appointment.\n';
  // s1 is the FIRST sentence; the text does not match it, so the fallback by
  // text finds the right line rather than overwriting the wrong one.
  const out = settleStatement({ body, sentenceId: 's1', expect: 'Send the form within 72 hours of the appointment.', winner: 'Send the form within 48 hours of the appointment.' });
  assert.equal(out.body, 'First line here about the form.\nSend the form within 48 hours of the appointment.\n');
});

test('choosing the wording a page already has changes nothing', () => {
  const body = 'Send to: physio@nhs.net\n';
  const out = settleStatement({ body, sentenceId: idOf(body, 'Send to: physio@nhs.net'), expect: 'Send to: physio@nhs.net', winner: 'Send to: physio@nhs.net' });
  assert.equal(out.unchanged, true);
  assert.equal(out.body, undefined);
});

test('an empty side is refused rather than blanking a line', () => {
  assert.match(settleStatement({ body: 'x', sentenceId: 's1', expect: '', winner: 'y' }).error, /no wording recorded/);
  assert.match(settleStatement({ body: 'Send to: a@b.net\n', sentenceId: 's1', expect: 'Send to: a@b.net', winner: '' }).error, /no wording recorded/);
});

test('mergeWording moves only the value between two field lines of one label', () => {
  assert.equal(mergeWording('- **Send to:** a@nhs.uk', 'Send to: b@nhs.net'), '- **Send to:** b@nhs.net');
  assert.equal(mergeWording('Priority: Routine', 'Priority: Urgent'), 'Priority: Urgent');
  // Different labels, or prose, take the chosen wording whole.
  assert.equal(mergeWording('Priority: Routine', 'Hospital: Homerton'), 'Hospital: Homerton');
  assert.equal(mergeWording('Ring within 72 hours.', 'Ring within 48 hours.'), 'Ring within 48 hours.');
});

test('the reader’s own wording is written exactly as typed, not merged into the old line', () => {
  const body = '- **Send to:** a@nhs.uk\n';
  const mine = '- **Send to:** a@nhs.uk for adults, camhs.referrals@nhs.net for under-18s';
  const out = settleStatement({ body, sentenceId: 's1', expect: '- **Send to:** a@nhs.uk', winner: mine, verbatim: true });
  assert.equal(out.body, mine + '\n');
});

test('a reader’s edit that runs over several lines is flattened into the one line it replaces', () => {
  const body = 'Ring the ward first.\nSend the form after.\n';
  const out = settleStatement({ body, sentenceId: 'sX', expect: 'Send the form after.', winner: 'Send the form after,\n  but only once the ward has confirmed.', verbatim: true });
  assert.equal(out.body, 'Ring the ward first.\nSend the form after, but only once the ward has confirmed.\n');
});
