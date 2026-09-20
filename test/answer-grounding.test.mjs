import test from 'node:test';
import assert from 'node:assert/strict';
import { groundedIn, shingles } from '../lib/questions/grounding.mjs';

const BREAST = {
  docTitle: 'Notebook: Clinics / NHS breast screening programme',
  text: `# NHS Breast Screening Programme

Women aged 50 to 71 are automatically invited for breast screening.
The first invitation is usually sent between the ages of 50 and 53, then the
patient is recalled every 3 years until her 71st birthday.
Women aged 71 or over may still request screening every 3 years by contacting
their local breast screening service.
If a patient has missed an appointment, give them the contact number shown on
the EMIS homepage and advise them to call to arrange a new slot.`,
};

const CERVICAL = {
  docTitle: 'Notebook: Clinics / Cervical screening',
  text: 'Women aged 25 to 64 are invited for cervical screening every 3 to 5 years depending on their age.',
};

// The answer that started this: written on the prose path, lifted almost whole
// off the practice's page, and shown under a banner saying no practice document
// was used and the reader should go and check it.
const ANSWER = `**NHS Breast Screening Programme**

* Eligibility: Women aged 50 to 71 are automatically invited.
* Invitation schedule: First invitation usually sent between ages 50-53, then recalled every 3 years until the 71st birthday.
* After 71: Women 71 or over may still request screening every 3 years by contacting their local breast-screening service.

If a patient has missed an appointment, give them the contact number shown on the EMIS homepage and advise them to call to arrange a new slot.`;

test('an answer made of a page names the page', () => {
  const [top, ...rest] = groundedIn(ANSWER, [BREAST, CERVICAL]);
  assert.ok(top, 'the page it was written from must be found');
  assert.equal(top.docTitle, BREAST.docTitle);
  assert.ok(top.share >= 0.25, `share was ${top.share}`);
  // A page about a different screening programme shares the odd phrase and
  // must not be named for it.
  assert.equal(rest.length, 0);
});

test('work the assistant really did itself names nothing', () => {
  const own = 'Here is a tidier version of your message:\n\nDear Dr Smith, thank you for your letter about this patient. I would be grateful for your advice on the dose.';
  assert.deepEqual(groundedIn(own, [BREAST, CERVICAL]), []);
});

test('too little to measure is left alone', () => {
  // Nothing to be confident about either way, and the safe direction is the
  // banner the card always showed.
  assert.deepEqual(groundedIn('Yes.', [BREAST]), []);
  assert.deepEqual(groundedIn(ANSWER, []), []);
  assert.deepEqual(groundedIn(ANSWER, [{ docTitle: 'Notebook: Empty', text: '   ' }]), []);
});

test('the runs are words, not characters, and markdown is not one of them', () => {
  const runs = shingles('**Women** aged 50 to 71 are automatically invited.', 6);
  assert.ok([...runs].includes('women aged 50 to 71 are'), [...runs].join(' | '));
});