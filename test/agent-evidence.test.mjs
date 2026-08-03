// What a tool deposits, and what survives being deposited twice.
//
// The tools themselves cannot be loaded here — lib/agent/tools.mjs reaches the
// knowledge store, which imports through the bundler's `@/rag` alias — so what
// is pinned down is the registry underneath them: the part that decides which
// reference a source gets and how much of it is kept. That is exactly where
// read_web_page could go wrong quietly, by shortening a page the model has
// already cited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidence } from '../lib/agent/evidence.mjs';

const URL_UNDER_TEST = 'https://example.nhs.uk/contact';

test('a search snippet is kept short', () => {
  const evidence = createEvidence();
  const ref = evidence.addWeb({ url: URL_UNDER_TEST, title: 'Contact us', snippet: 'x'.repeat(5000) });
  assert.equal(evidence.getWeb(ref).snippet.length, 600);
});

test('a page read in full is kept in full', () => {
  const evidence = createEvidence();
  const ref = evidence.addWeb({ url: URL_UNDER_TEST, title: 'Contact us', snippet: 'x'.repeat(9000), full: true });
  assert.equal(evidence.getWeb(ref).snippet.length, 5000);
});

test('reading a page the search already returned upgrades it without changing its reference', () => {
  const evidence = createEvidence();
  const first = evidence.addWeb({ url: URL_UNDER_TEST, title: 'Contact us', snippet: 'Call us on the number below.' });
  const again = evidence.addWeb({ url: URL_UNDER_TEST, title: 'Contact us', snippet: 'y'.repeat(3000), full: true });
  assert.equal(first, again, 'the reference the model may already have cited must not move');
  assert.equal(evidence.getWeb(first).snippet.length, 3000);
});

test('a fuller reading is never replaced by a shorter one', () => {
  const evidence = createEvidence();
  const ref = evidence.addWeb({ url: URL_UNDER_TEST, title: 'Contact us', snippet: 'z'.repeat(3000), full: true });
  evidence.addWeb({ url: URL_UNDER_TEST, title: 'Contact us', snippet: 'a snippet from a later search' });
  assert.equal(evidence.getWeb(ref).snippet.length, 3000);
});

test('paragraphs survive a page read, so a quote can span more than one line', () => {
  const evidence = createEvidence();
  const ref = evidence.addWeb({ url: URL_UNDER_TEST, title: 'Contact us', snippet: 'Opening hours\n\nMonday to Friday, 8am to 6:30pm.', full: true });
  assert.match(evidence.getWeb(ref).snippet, /Opening hours\n\nMonday/);
});
