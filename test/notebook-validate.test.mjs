import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProposal, extractVerbatim, alignMap } from '../lib/notebook/validate.mjs';
import { splitSentences } from '../lib/notebook/sentences.mjs';

const PAGE = { docTitle: 'Notebook: Referrals / Referral pathways / Physio', text: '' };
const SRC = `#### Clinic Selection
- **Standard Physiotherapy (IF ONLY physiotherapy IS MENTIONED)**
  - **Clinic type:** Not otherwise specified
  - **Speciality:** Physiotherapy
  - **Location:** **Any that don't include extended**

Ring the patient on 020 8123 4567 before 08:30 and tell Dr Goel. Email nel.physio@nhs.net with the RP form.
![shot](https://x/y.png)`;
PAGE.text = SRC;
const ids = (...n) => n.map((i) => 's' + i);

const GOOD = `#### Clinic Selection
- **Standard Physiotherapy**
  - Speciality: Physiotherapy
  - Clinic type: Not otherwise specified
  - Hospital: Any that don't include extended

Before 08:30, ring the patient on 020 8123 4567 and tell Dr Goel. Send the RP form to nel.physio@nhs.net.
![shot](https://x/y.png)`;
const GOOD_MAP = [
  { text: 'Standard Physiotherapy', from: ids(2) },
  { text: 'Speciality: Physiotherapy', from: ids(4) },
  { text: 'Clinic type: Not otherwise specified', from: ids(3) },
  { text: "Hospital: Any that don't include extended", from: ids(5) },
  { text: 'Before 08:30, ring the patient on 020 8123 4567 and tell Dr Goel.', from: ids(6) },
  { text: 'Send the RP form to nel.physio@nhs.net.', from: ids(7) },
];
const codesOf = (r) => Object.fromEntries(Object.entries(r.checks).map(([k, c]) => [k, c.problems.filter((p) => p.severity === 'error').map((p) => p.code)]));

test('the verbatim class: emails, urls, phones without spaces, times, short codes, mid-sentence names', () => {
  const v = extractVerbatim(SRC);
  assert.deepEqual(v.emails, ['nel.physio@nhs.net']);
  assert.deepEqual(v.phones, ['02081234567']);
  assert.deepEqual(v.numbers, ['08:30']);
  assert.deepEqual(v.codes, ['RP']);
  assert.deepEqual(v.names, ['Dr Goel']);
});

test('a rewrite that keeps every fact, fixes the labels and rewords passes every check', () => {
  const r = validateProposal({ sourceBody: SRC, proposal: { body: GOOD, map: GOOD_MAP }, page: PAGE, typed: 'pathway' });
  assert.ok(r.ok, JSON.stringify(codesOf(r)));
  assert.equal(r.pairs.length, 6);
  // Label lines only lost their bold: the pair is the same sentence.
  assert.ok(r.pairs.find((p) => p.after.startsWith('- Speciality')).same);
  assert.ok(!r.pairs.find((p) => p.after.startsWith('Before 08:30')).same);
  assert.ok(r.violationsAfter.length < r.violationsBefore.length);
});

test('identical text is trivially ok and every pair is marked the same', () => {
  const src = splitSentences(SRC);
  const map = src.filter((s) => ['prose', 'list', 'table', 'label'].includes(s.kind)).map((s) => ({ text: s.text, from: [s.id] }));
  const r = validateProposal({ sourceBody: SRC, proposal: { body: SRC, map }, page: PAGE, typed: 'pathway' });
  assert.ok(r.ok);
  assert.ok(r.pairs.every((p) => p.same));
});

test('a dropped sentence, a changed time, a lower-cased name and an invented sentence are each named', () => {
  const body = GOOD.replace('08:30', '08:00').replace('Send the RP form to nel.physio@nhs.net.', 'Also fax the form to the hospital.').replace('Dr Goel', 'dr goel');
  const map = GOOD_MAP.slice(0, 4).concat([{ text: 'Before 08:00, ring the patient on 020 8123 4567 and tell dr goel.', from: ids(6) }]);
  const r = validateProposal({ sourceBody: SRC, proposal: { body, map }, page: PAGE, typed: 'pathway' });
  assert.ok(!r.ok);
  const c = codesOf(r);
  assert.deepEqual(c.additions, ['unmapped-output']);
  assert.deepEqual(c.coverage, ['uncovered']);
  assert.ok(c.verbatim.includes('numbers-missing') && c.verbatim.includes('numbers-added'));
  assert.ok(c.verbatim.includes('names-missing') && c.verbatim.includes('emails-missing'));
  assert.ok(r.checks.coverage.problems[0].sentenceIds.includes('s7'));
});

test('dropping a sentence is allowed only when an identical one is kept', () => {
  const src = 'Ring the patient before 08:30 today.\n\nRing the patient before 08:30 today.\n\nThen close the task.';
  const okDrop = validateProposal({ sourceBody: src, proposal: { body: 'Ring the patient before 08:30 today.\n\nThen close the task.', map: [{ text: 'Ring the patient before 08:30 today.', from: ['s1'] }, { text: 'Then close the task.', from: ['s3'] }], dropped: [{ id: 's2', why: 'duplicate' }] }, page: null });
  assert.ok(okDrop.ok, JSON.stringify(codesOf(okDrop)));
  const badDrop = validateProposal({ sourceBody: src, proposal: { body: 'Ring the patient before 08:30 today.', map: [{ text: 'Ring the patient before 08:30 today.', from: ['s1', 's2'] }], dropped: [{ id: 's3', why: 'obvious' }] }, page: null });
  assert.deepEqual(codesOf(badDrop).coverage, ['dropped-not-duplicate']);
});

test('a pathway page that loses its clinic type fails structure; an altered image fails images; a leaked marker fails', () => {
  const lost = validateProposal({ sourceBody: SRC, proposal: { body: GOOD.replace('  - Clinic type: Not otherwise specified\n', ''), map: GOOD_MAP.filter((m) => !m.text.startsWith('Clinic type')) }, page: PAGE, typed: 'pathway' });
  assert.ok(codesOf(lost).structure.includes('pathway-pairing-lost'));
  const img = validateProposal({ sourceBody: SRC, proposal: { body: GOOD.replace('y.png', 'z.png'), map: GOOD_MAP }, page: PAGE, typed: 'pathway' });
  assert.deepEqual(codesOf(img).images, ['image-lost', 'image-added']);
  const leak = validateProposal({ sourceBody: SRC, proposal: { body: '[s1] ' + GOOD, map: GOOD_MAP }, page: PAGE, typed: 'pathway' });
  assert.ok(codesOf(leak).additions.includes('annotation-leak'));
});

test('a map entry that is a close paraphrase of exactly one output sentence still aligns', () => {
  const out = splitSentences('Ring the patient on 020 8123 4567 before 08:30, then tell Dr Goel about it.');
  const { aligned, unmatched } = alignMap(out, [{ text: 'Ring the patient on 020 8123 4567 before 08:30, then tell Dr Goel', from: ['s6'] }]);
  assert.equal(aligned.length, 1);
  assert.equal(unmatched.length, 0);
});
