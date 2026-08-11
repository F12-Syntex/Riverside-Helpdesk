// The question log stores the answer as text. What it stores has to be what the
// reader saw, because that is the whole reason the log exists — an answer is not
// reconstructable later, once the Notebook page behind it has been edited.
import assert from 'node:assert/strict';
import test from 'node:test';

import { answerToText, answerSummary } from '../lib/questions/flatten.mjs';
import { answer, bullets, contacts, expand, fields, field, message, note, steps, table, text } from '../lib/templates/blocks.mjs';
import { notebookPageAnswer } from '../lib/templates/notebook.mjs';

test('a template answer keeps its title, its steps and their order', () => {
  const card = answer({
    title: 'Refer for an ECG',
    subtitle: 'Sent on e-RS',
    blocks: [
      fields([field('Speciality', 'Cardiology'), field('Clinic type', 'ECG')], 'On the referral'),
      steps(['Open the record.', 'Choose **Cardiology**.', 'Send it.']),
      note('The doctor writes the letter.', 'warn'),
    ],
    source: ['Referrals / ECG'],
  });

  const out = answerToText(card);
  assert.match(out, /^# Refer for an ECG/);
  assert.match(out, /Sent on e-RS/);
  assert.match(out, /Speciality: Cardiology/);
  assert.match(out, /1\. Open the record\./);
  assert.match(out, /2\. Choose \*\*Cardiology\*\*\./);
  assert.match(out, /3\. Send it\./);
  assert.match(out, /\[warn\] The doctor writes the letter\./);
  assert.ok(out.indexOf('1. Open') < out.indexOf('3. Send it.'));
});

test('every block type reaches the text, including what is behind a disclosure', () => {
  const card = answer({
    title: 'Everything',
    blocks: [
      bullets(['One', 'Two'], 'A list'),
      table(['Service', 'Route'], [['ECG', 'e-RS'], ['Podiatry', 'Email']]),
      expand('The long way round', [steps(['Hidden step one.'])], 'rarely needed'),
      contacts([{ label: 'Secretaries', tel: '020 7946 0000', note: 'weekdays' }]),
      message('Your appointment is booked.'),
      text('## A heading\n\nSome prose.'),
    ],
  });

  const out = answerToText(card);
  assert.match(out, /A list/);
  assert.match(out, /- One/);
  assert.match(out, /Service \| Route/);
  assert.match(out, /ECG \| e-RS/);
  assert.match(out, /▸ The long way round — rarely needed/);
  assert.match(out, /1\. Hidden step one\./); // the disclosure's contents, not only its label
  assert.match(out, /Secretaries · 020 7946 0000 · weekdays/);
  assert.match(out, /Your appointment is booked\./);
  assert.match(out, /## A heading/);
});

test('a Notebook page is stored whole, as the page reads', () => {
  const pages = [{
    docTitle: 'Documents and filing / Scanning documents',
    text: 'Put the papers in the yellow scanner.\n\nThen file them.',
  }];
  const card = notebookPageAnswer({ pages: ['Scanning documents'], all: pages });

  const out = answerToText(card);
  assert.match(out, /# Scanning documents/);
  assert.match(out, /Put the papers in the yellow scanner\./);
  assert.match(out, /Then file them\./);
});

test('highlighting is dropped and the text is capped, so one page cannot fill a row', () => {
  const card = answer({ title: 'Long', blocks: [text('<mark>Important</mark> ' + 'x'.repeat(500))] });
  const out = answerToText(card, 200);
  assert.ok(!out.includes('<mark>'), 'the markup the card renders is not part of the wording');
  assert.equal(out.length, 200);
  assert.ok(out.endsWith('…'));
});

test('the summary is the first real line, without its markdown', () => {
  assert.equal(answerSummary('# Refer for an ECG\n\nOpen the record.'), 'Refer for an ECG');
  assert.equal(answerSummary('- First bullet\n- Second'), 'First bullet');
  assert.equal(answerSummary(''), '');
});
