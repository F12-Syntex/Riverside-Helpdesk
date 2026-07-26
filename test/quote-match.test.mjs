import test from 'node:test';
import assert from 'node:assert/strict';
import { normForMatch, quoteContainment } from '../lib/ai/quote-match.js';

// These two functions decide whether a section survives into the answer, so a
// false rejection here is not a formatting nit — it drops the section, and an
// answer whose sections all drop becomes "check with the relevant lead", with
// no steps and nothing cited. Which is exactly what markdown was causing.

const contains = (quote, source) => quoteContainment(normForMatch(quote), normForMatch(source));

test('a quote matches its source through bold markers', () => {
  const source = 'These go by **email** instead of ERS. Create the document, then email it via **Message → Message professional → attach EMIS file**:';
  assert.equal(contains('These go by email instead of ERS. Create the document, then email it', source), 1);
});

test('a quote matches through the editor’s highlight and colour markup', () => {
  const source = '<mark>Critical: Use the doctor who created the task as the referring clinician.</mark> <span style="color:#005eb8">The recipient\'s email address is automatically populated.</span>';
  assert.equal(contains('Critical: Use the doctor who created the task as the referring clinician.', source), 1);
  assert.equal(contains("The recipient's email address is automatically populated.", source), 1);
});

test('a quote matches through headings, bullets and blockquotes', () => {
  const source = '### Step 2 — Choose the route\n\n> **Note:** This selection may vary depending on the specific referral.';
  assert.equal(contains('Note: This selection may vary depending on the specific referral.', source), 1);
});

test('a numbered process can be quoted as the prose it describes', () => {
  // The source numbers its steps; a model quoting them writes them as a run of
  // sentences. Leaving the "1." and "2." in made the quote non-contiguous, so a
  // correct quote of the e-RS steps was rejected and the section dropped.
  const source = '1.  Access the **e-Referral Service (e-RS)** website.\n2.  Click **Smartcard**.\n3.  Click **Referring clinician admin**.';
  assert.equal(contains('Access the e-Referral Service (e-RS) website. Click Smartcard. Click Referring clinician admin.', source), 1);
});

test('bulleted lines fold the same way', () => {
  const source = '*   Speciality: **Dermatology**.\n*   Clinic type: the **2WW** skin cancer option.';
  assert.equal(contains('Speciality: Dermatology. Clinic type: the 2WW skin cancer option.', source), 1);
});

test('smart quotes and dashes still fold together', () => {
  assert.equal(contains('the patient’s record — see below', "the patient's record - see below"), 1);
});

test('words that are not in the source still fail', () => {
  // Stripping formatting exists to stop real quotes being rejected. It must not
  // start accepting invented ones.
  const source = 'These go by **email** instead of ERS.';
  assert.ok(contains('These go by post instead of ERS, within five working days', source) < 0.5);
  assert.equal(contains('Refer urgently to the on-call surgical team', source), 0);
});

test('formatting alone is not enough text to prove anything', () => {
  // evidence.mjs requires 12 normalised characters before a quote counts.
  assert.ok(normForMatch('**email**').length < 12);
});
