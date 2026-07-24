import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToSections, htmlBlockText } from '../rag/parsers/docx.mjs';

// Mammoth renders a Word how-to guide as headings with the step's screenshots
// positioned underneath each heading. The parser must split at those headings so
// a step's chunk carries only that step's picture — not every image in the file.
const HOWTO_HTML = [
  '<h1>Introduction</h1><p>Welcome to the guide.</p>',
  '<h1>Order blood tests</h1><p>Open the patient record.</p>',
  '<p><img src="/assets/rag/f2/img-0.png" /></p>',
  '<p><img src="/assets/rag/f2/img-1.png" /></p>',
  '<h1>Order imaging</h1><p>Choose the imaging option.</p>',
  '<p><img src="/assets/rag/f2/img-2.png" /></p>',
].join('');

test('docx sections split at headings and keep only their own images', () => {
  const sections = htmlToSections(HOWTO_HTML);
  assert.equal(sections.length, 3);

  assert.deepEqual(sections.map((s) => s.section), ['Introduction', 'Order blood tests', 'Order imaging']);

  // The intro has no image; the blood-test step owns img-0 and img-1; imaging
  // owns only img-2. No step inherits another step's screenshot.
  assert.deepEqual(sections[0].images, []);
  assert.deepEqual(sections[1].images, ['assets/rag/f2/img-0.png', 'assets/rag/f2/img-1.png']);
  assert.deepEqual(sections[2].images, ['assets/rag/f2/img-2.png']);

  assert.deepEqual(sections[1].headingPath, ['Order blood tests']);
  assert.ok(sections[1].text.includes('Open the patient record.'));
});

test('non-displayable image formats (WMF/EMF) are dropped', () => {
  const html = '<h1>Form</h1><p>Fill it in.</p><p><img src="/assets/rag/x/img-0.x-wmf" /></p><p><img src="/assets/rag/x/img-1.png" /></p>';
  const [section] = htmlToSections(html);
  assert.deepEqual(section.images, ['assets/rag/x/img-1.png'], 'WMF is not shown; only the PNG survives');
});

test('content before the first heading becomes a lead-in section', () => {
  const html = '<p>Front matter.</p><p><img src="/assets/rag/y/img-0.png" /></p><h1>Body</h1><p>Body text.</p>';
  const sections = htmlToSections(html);
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0].headingPath, []);
  assert.deepEqual(sections[0].images, ['assets/rag/y/img-0.png']);
  assert.equal(sections[1].section, 'Body');
});

test('a document with no headings stays a single section with all its images', () => {
  const html = '<p>Just a paragraph.</p><p><img src="/assets/rag/z/img-0.png" /></p><p><img src="/assets/rag/z/img-1.png" /></p>';
  const sections = htmlToSections(html);
  assert.equal(sections.length, 1);
  assert.deepEqual(sections[0].headingPath, []);
  assert.deepEqual(sections[0].images, ['assets/rag/z/img-0.png', 'assets/rag/z/img-1.png']);
});

test('htmlBlockText preserves paragraph breaks and decodes entities', () => {
  const text = htmlBlockText('<h1>A &amp; B</h1><p>First para.</p><p>Second para.</p>');
  assert.ok(text.includes('A & B'));
  assert.ok(/First para\.\n\nSecond para\./.test(text), 'paragraphs stay separated so the chunker can split them');
});
