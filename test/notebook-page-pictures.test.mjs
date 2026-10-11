// A Notebook page answer shows the pictures attached to the page.
import assert from 'node:assert/strict';
import test from 'node:test';

import { notebookPageAnswer } from '../lib/templates/notebook.mjs';
import { answerToText } from '../lib/questions/flatten.mjs';

const flat = (card) => answerToText(card);

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
