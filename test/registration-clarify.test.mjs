// Registering a patient, asking a question back, and showing a picture.
//
// The registration page is four branches wearing one procedure. What matters is
// that the branch a message names comes to the front WITHOUT the other three
// disappearing, and that the two rules which are not steps — the under-5
// vaccination warning and the over-5 health check — survive every rendering.
import assert from 'node:assert/strict';
import test from 'node:test';

import { REGISTRATION_SCENARIO_IDS, registrationAnswer } from '../lib/templates/registration.mjs';
import { notebookPageAnswer } from '../lib/templates/notebook.mjs';
import { answerToText } from '../lib/questions/flatten.mjs';

const flat = (card) => answerToText(card);

test('the whole card is shown when the message does not say which situation it is', () => {
  const card = registrationAnswer({});
  const text = flat(card);
  assert.match(card.title, /Register a new patient/);
  assert.match(text, /Shows as a local patient, inactive/);
  assert.match(text, /Shows as a local patient, active/);
  assert.match(text, /Several patients come back/);
  assert.match(text, /No NHS number at all/);
});

test('naming a scenario promotes it and keeps the rest', () => {
  const card = registrationAnswer({ scenario: 'inactive' });
  const text = flat(card);
  assert.match(card.title, /inactive/i);

  // The named branch is in the body of the card, not behind the disclosure.
  const disclosure = text.indexOf('▸');
  const named = text.indexOf('Send **Iqra** a task');
  assert.ok(named > -1 && named < disclosure, 'the named scenario is above the disclosure');

  // And the others are still there, one press away.
  assert.match(text, /Several patients come back/);
  assert.match(text, /Continue to create new patient/);
});

test('the rules that are not steps survive every rendering', () => {
  for (const scenario of ['', ...REGISTRATION_SCENARIO_IDS]) {
    const text = flat(registrationAnswer({ scenario }));
    assert.match(text, /incomplete routine schedule vacs/, scenario + ': the under-5 warning');
    assert.match(text, /\[critical\]/, scenario + ': and it is marked critical');
    assert.match(text, /over 5 are eligible for a new patient health check/, scenario + ': the health check');
    assert.match(text, /named GP/, scenario + ': the finishing steps');
    assert.match(text, /nurse AM appointment/, scenario + ': the booking link');
  }
});

test('an unknown scenario falls back to the whole card rather than an empty one', () => {
  const card = registrationAnswer({ scenario: 'nonsense' });
  assert.match(card.title, /Register a new patient/);
  assert.match(flat(card), /Shows as a local patient, inactive/);
});

test('a Notebook page shows the pictures attached to it', () => {
  const pages = [{
    docTitle: 'Registration and records / Registering a patient on EMIS',
    text: 'Click the EMIS button in the top left.',
    images: ['https://blob.example/screenshot-one.png', 'https://blob.example/screenshot-two.png'],
  }];
  const card = notebookPageAnswer({ pages: ['Registering a patient on EMIS'], all: pages });
  const block = card.blocks.find((b) => b.type === 'images');
  assert.ok(block, 'the page carries its pictures');
  assert.equal(block.items.length, 2);
  assert.equal(block.items[0].url, 'https://blob.example/screenshot-one.png');
  // And the log records that a picture was shown, without pretending to hold it.
  assert.match(flat(card), /\[picture\] https:\/\/blob\.example\/screenshot-one\.png/);
});

test('a page with no attachments gains no empty picture block', () => {
  const pages = [{ docTitle: 'A / B', text: 'Words only.', images: [] }];
  const card = notebookPageAnswer({ pages: ['B'], all: pages });
  assert.equal(card.blocks.find((b) => b.type === 'images'), undefined);
});
