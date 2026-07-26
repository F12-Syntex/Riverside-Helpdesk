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

// The letter has its own procedure, so a referral answer offers it as a question
// rather than inlining it. Most drafts below carry it so they clear that check.
const LETTER_FOLLOW_UP = ['How do I create the referral letter?'];

const complete = () => [
  section('Make the referral', '1. Find the doctor’s referral document in the patient’s **Consultation**.\n2. Set the **speciality** to Dermatology.\n3. Set the **clinic type** to the 2WW skin cancer option.\n4. Send it.'),
];

test('a referral answer that names neither field is sent back for repair', () => {
  const draft = { sections: [section('Make the referral', '1. Open the referral screen.\n2. Send it.')], keyPoints: POINTS, followUps: LETTER_FOLLOW_UP };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to dermatology?');
  assert.ok(problems.some((p) => /speciality and which clinic type/i.test(p)));
});

test('naming both the speciality and the clinic type satisfies the check', () => {
  const draft = { sections: complete(), keyPoints: POINTS, followUps: LETTER_FOLLOW_UP };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to dermatology?');
  assert.deepEqual(problems, []);
});

test('saying the notes do not record the fields counts as answering', () => {
  // A stated gap is a real answer; a silent omission is not.
  const draft = {
    sections: [section('Make the referral', '1. Open the referral screen.\n2. The notes do not record the **speciality** or **clinic type** for this referral — ask the practice manager before sending.')],
    keyPoints: POINTS,
    followUps: LETTER_FOLLOW_UP,
  };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to dermatology?');
  assert.deepEqual(problems, []);
});

test('walking through creating the letter is rejected when it was not asked for', () => {
  // The exact failure seen in the chat: a dermatology referral answered with
  // "Navigate to Add → Document → Create letter", when the doctor's letter was
  // already sitting in the consultation.
  const draft = {
    sections: [section('Create referral letter', '1. Navigate to **Add → Document → Create letter**.\n2. Click the magnifying glass icon to search for forms.')],
    keyPoints: POINTS,
    followUps: LETTER_FOLLOW_UP,
  };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I do a cancer dermatology referral?');
  assert.ok(problems.some((p) => /must not walk through creating one/i.test(p)));
});

test('leaving the letter out silently still asks for the follow-up to be offered', () => {
  const draft = { sections: complete(), keyPoints: POINTS, followUps: [] };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to dermatology?');
  assert.ok(problems.some((p) => /Add a followUp asking how to create the referral letter/i.test(p)));
});

test('offering the letter as a follow-up satisfies the check', () => {
  const draft = { sections: complete(), keyPoints: POINTS, followUps: LETTER_FOLLOW_UP };
  const { problems, followUps } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to dermatology?');
  assert.deepEqual(problems, []);
  assert.deepEqual(followUps, LETTER_FOLLOW_UP);
});

test('the letter steps are allowed once the question asks for them', () => {
  const draft = {
    sections: [section('Creating the referral letter', '1. Navigate to **Add → Document → Create letter**.\n2. Set the **speciality** and **clinic type** from the task.')],
    keyPoints: POINTS,
  };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I create a referral letter?');
  assert.equal(problems.filter((p) => /referral letter/i.test(p)).length, 0);
});

test('the referral route card satisfies the speciality and clinic type check', () => {
  // The steps no longer have to spell the two fields out in prose — putting them
  // in referralRoute is the better answer, because that is what is shown first.
  const draft = {
    sections: [section('Send the referral', '1. Find the doctor’s document in the **Consultation**.\n2. Send it on e-RS.')],
    keyPoints: POINTS,
    followUps: LETTER_FOLLOW_UP,
    referralRoute: { requestType: 'Referral', priority: '2WW', specialty: 'Dermatology', clinicType: '2WW Skin' },
  };
  const { problems, referralRoute } = validateDraft(draft, evidenceStub(), 'How do I do a cancer dermatology referral?');
  assert.deepEqual(problems, []);
  assert.equal(referralRoute.specialty, 'Dermatology');
  assert.equal(referralRoute.clinicType, '2WW Skin');
});

test('a half-filled route does not count as naming both fields', () => {
  const draft = {
    sections: [section('Send the referral', '1. Find the doctor’s document in the **Consultation**.\n2. Send it on e-RS.')],
    keyPoints: POINTS,
    followUps: LETTER_FOLLOW_UP,
    referralRoute: { requestType: 'Referral', priority: '2WW', specialty: 'Dermatology', clinicType: '' },
  };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I do a cancer dermatology referral?');
  assert.ok(problems.some((p) => /speciality and which clinic type/i.test(p)));
});

test('an empty route is dropped rather than shown as a blank card', () => {
  const draft = { sections: complete(), keyPoints: POINTS, followUps: LETTER_FOLLOW_UP };
  const { referralRoute } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to dermatology?');
  assert.equal(referralRoute, null);
});

test('follow-ups are trimmed, deduplicated and capped at two', () => {
  const draft = {
    sections: complete(),
    keyPoints: POINTS,
    followUps: ['  How do I create the referral letter?  ', 'How do I create the referral letter?', 'Which hospital do I pick?', 'What is 2WW?', 'no'],
  };
  const { followUps } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to dermatology?');
  assert.deepEqual(followUps, ['How do I create the referral letter?', 'Which hospital do I pick?']);
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
    followUps: LETTER_FOLLOW_UP,
  };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I do an email referral to the diabetes team?');
  assert.deepEqual(problems, []);
});

test('questions that are not about referrals are left alone', () => {
  const draft = { sections: [section('Book the appointment', '1. Open the appointment book.\n2. Choose the slot.')], keyPoints: POINTS };
  const { problems } = validateDraft(draft, evidenceStub(), 'How do I book a routine appointment?');
  assert.deepEqual(problems, []);
});
