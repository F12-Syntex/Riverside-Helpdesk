import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, annotate, stripAnnotations, isContent } from '../lib/notebook/sentences.mjs';
import { hashBody } from '../lib/notebook/validate.mjs';

const kinds = (md) => splitSentences(md).map((s) => s.kind + ':' + s.text);

test('prose splits on sentence punctuation, but not on abbreviations', () => {
  assert.deepEqual(kinds('Book the slot e.g. the first free one. Then tell Dr. Goel. Done!'), [
    'prose:Book the slot e.g. the first free one.',
    'prose:Then tell Dr. Goel.',
    'prose:Done!',
  ]);
});

test('soft-wrapped lines are one paragraph; a blank line ends it', () => {
  const md = 'First half of\nthe sentence. Second sentence.\n\nThird.';
  assert.deepEqual(kinds(md), ['prose:First half of the sentence.', 'prose:Second sentence.', 'prose:Third.']);
});

test('headings, table rows, images and labelled lines are atomic', () => {
  const md = [
    '## A heading. With a stop.',
    '| Item | Selection. |',
    '![shot](https://x/y.png)',
    '- **Clinic type:** Not otherwise specified. Really.',
    'Speciality: Cardiology',
  ].join('\n');
  assert.deepEqual(splitSentences(md).map((s) => s.kind), ['heading', 'table', 'image', 'label', 'label']);
  assert.equal(splitSentences(md)[2].text, '![shot](https://x/y.png)');
});

test('a numbered list gives one list sentence per step, split inside a step', () => {
  const md = '1. Open e-RS.\n2. Paste the NHS number. Then confirm.\n3. Save.';
  assert.deepEqual(kinds(md), ['list:Open e-RS.', 'list:Paste the NHS number.', 'list:Then confirm.', 'list:Save.']);
});

test('offsets point into the original text, and annotate round-trips', () => {
  const md = 'Alpha one.\r\nBeta two.\r\n\r\n- Gamma.';
  const s = splitSentences(md);
  const lf = md.replace(/\r\n/g, '\n');
  for (const x of s) assert.equal(lf.slice(x.start, x.end), x.text);
  const a = annotate(md, s);
  assert.equal(a, '[s1] Alpha one.\n[s2] Beta two.\n\n- [s3] Gamma.');
  assert.equal(stripAnnotations(a), lf);
});

test('ids are stable, content kinds are the four that carry facts, hash ignores line endings', () => {
  const a = splitSentences('One. Two.');
  const b = splitSentences('One. Two.');
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  assert.ok(isContent({ kind: 'label' }) && isContent({ kind: 'table' }) && !isContent({ kind: 'heading' }) && !isContent({ kind: 'image' }));
  assert.equal(hashBody('a\r\nb'), hashBody('a\nb'));
});
