import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft } from '../lib/agent/compose.mjs';

// Referral answers can be perfectly grounded and still be the wrong answer to
// hand a receptionist: the letter explained when nobody asked for it, the
// speciality and clinic type missing so the referral cannot actually be sent,
// or both routes described when only the email one applies. These checks run
// alongside the grounding checks and feed the same repair round.

// A stub evidence registry that verifies everything, so these tests exercise the
// scope rules on their own rather than the quote matching.
function evidenceStub() {
  const chunk = { docId: 'p1', docTitle: 'Dermatology referral', text: 'Set the speciality and the clinic type before sending.', view: null, images: [] };
  return {
    verifyPractice: (quote, ref) => ({ ref: String(ref || 'P1').toUpperCase(), chunk, exact: true }),
    getWeb: () => null,
    practiceList: () => [chunk],
    webList: () => [],
  };
}

function section(heading, markdown) {
  return { heading, markdown, basis: 'practice', ref: 'P1', quote: 'Set the speciality and the clinic type before sending.' };
}

// Any answer needs two key points citing a surviving section, or every draft
// here trips that unrelated check instead of the one under test.
const POINTS = [
  { text: 'Set the speciality and clinic type before sending.', ref: 'P1' },
  { text: 'Record the referral in the patient notes.', ref: 'P1' },
];

const complete = () => [
  section('Make the referral', '1. Open the referral screen.\n2. Set the **speciality** to Dermatology.\n3. Set the **clinic type** to 2WW suspected skin cancer.\n4. Send it.'),
];

test('a referral answer that names neither field is sent back for repair', () => {
  const draft = { sections: [section('Make the referral', '1. Open the referral screen.\n2. Send it.')], keyPoints: POINTS };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to dermatology?');
  assert.ok(problems.some((p) => /speciality and which clinic type/i.test(p)));
});

test('naming both the speciality and the clinic type satisfies the check', () => {
  const draft = { sections: complete(), keyPoints: POINTS };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to dermatology?');
  assert.deepEqual(problems, []);
});

test('saying the notes do not record the fields counts as answering', () => {
  // A stated gap is a real answer; a silent omission is not.
  const draft = {
    sections: [section('Make the referral', '1. Open the referral screen.\n2. The notes do not record the **speciality** or **clinic type** for this referral — ask the practice manager before sending.')],
    keyPoints: POINTS,
  };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to dermatology?');
  assert.deepEqual(problems, []);
});

test('a letter section is rejected when the question never asked about a letter', () => {
  const draft = { sections: [...complete(), section('Writing the referral letter', 'Dictate the letter within two working days.')], keyPoints: POINTS };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to dermatology?');
  assert.ok(problems.some((p) => /does not ask how to create a referral letter/i.test(p)));
});

test('the letter is allowed once the question asks for it', () => {
  const draft = { sections: [section('Writing the referral letter', '1. Dictate the letter within two working days.\n2. Check it for accuracy.')], keyPoints: POINTS };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I create a referral letter?');
  assert.equal(problems.filter((p) => /referral letter/i.test(p)).length, 0);
});

test('an email referral answer may not also describe the e-RS route', () => {
  const draft = {
    sections: [...complete(), section('If e-RS is unavailable', 'Book through Choose and Book instead.')],
    keyPoints: POINTS,
  };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I do an email referral to the diabetes team?');
  assert.ok(problems.some((p) => /email steps only/i.test(p)));
});

test('email-only steps pass unchanged', () => {
  const draft = {
    sections: [section('Send the email referral', '1. Attach the form.\n2. Set the **speciality** to Diabetes and the **clinic type** to Adult diabetes.\n3. Email it to the address in the notes.')],
    keyPoints: POINTS,
  };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I do an email referral to the diabetes team?');
  assert.deepEqual(problems, []);
});

test('questions that are not about referrals are left alone', () => {
  const draft = { sections: [section('Book the appointment', '1. Open the appointment book.\n2. Choose the slot.')], keyPoints: POINTS };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I book a routine appointment?');
  assert.deepEqual(problems, []);
});
