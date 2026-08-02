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

// The exact failure seen in the chat: "how to do an ECG referral" was answered
// correctly — ECG referrals are emailed through Accurx, not sent on e-RS — and
// the answer still carried an e-RS card at the top of it, naming a speciality
// and clinic type matched from the referral-type list for a form the reader was
// never going to open.
const EMAIL_STEPS = () => [
  section('Email the ECG referral', '1. Open the patient’s **Consultation** and find the ECG referral document.\n2. Open **Accurx** and select **Message → Message professional**.\n3. Click **Attach → EMIS file** and select the referral letter.\n4. Click **Send**.'),
];
const ERS_SUGGESTION = {
  requestType: 'Referral',
  specialty: 'Diagnostic Physiological Measurement',
  clinicType: 'Cardiac Physiology - ECG',
  source: 'suggested',
};

test('an emailed referral does not carry an e-RS card', () => {
  const draft = {
    sections: EMAIL_STEPS(),
    keyPoints: [
      { text: 'ECG referrals are emailed, not sent on e-RS.', ref: 'P1' },
      { text: 'Attach the doctor’s document in Accurx and send it.', ref: 'P1' },
    ],
    followUps: LETTER_FOLLOW_UP,
    referralRoute: ERS_SUGGESTION,
  };
  const { referralRoute } = validateDraft(draft, evidenceStub(), 'How do I do an ECG referral?');
  assert.equal(referralRoute, null);
});

test('a matched pairing is dropped when the steps only ever email it', () => {
  // No "not e-RS" anywhere — the steps simply never open e-RS, so a pairing
  // guessed from the type list has nothing to attach itself to.
  const draft = {
    sections: EMAIL_STEPS(),
    keyPoints: [
      { text: 'Attach the doctor’s document in Accurx and send it.', ref: 'P1' },
      { text: 'Mark the message done in My Inbox afterwards.', ref: 'P1' },
    ],
    followUps: LETTER_FOLLOW_UP,
    referralRoute: ERS_SUGGESTION,
  };
  const { referralRoute } = validateDraft(draft, evidenceStub(), 'How do I do an ECG referral?');
  assert.equal(referralRoute, null);
});

test('an e-RS referral keeps its card even when email is mentioned', () => {
  const draft = {
    sections: [section('Make the referral', '1. Set the **speciality** to Dermatology **on e-RS**.\n2. Set the **clinic type** to the 2WW skin cancer option.\n3. Email the practice manager if no slot is available.')],
    keyPoints: POINTS,
    followUps: LETTER_FOLLOW_UP,
    referralRoute: { requestType: 'Referral', specialty: 'Dermatology', clinicType: 'Skin cancer (2WW)', source: 'practice' },
  };
  const { referralRoute } = validateDraft(draft, evidenceStub(), 'How do I do a cancer dermatology referral?');
  assert.equal(referralRoute?.specialty, 'Dermatology');
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

// The physiotherapy failure: the Notebook makes Extended Scope conditional on
// the doctor having asked for it, the answer says so in its steps, and the card
// then prints "Extended Scope Physiotherapy" as though it were settled. The
// assistant never sees the doctor's task, so it may not pick a side.
const CONDITIONAL_STEPS = () => [
  section('Send the physiotherapy referral', '1. Find the doctor’s referral document in the **Consultation**.\n2. Set the **speciality** to Physiotherapy.\n3. Set the **clinic type** to Musculoskeletal, or to Extended Scope Physiotherapy only if the doctor’s task asks for it.\n4. Send it.'),
];

test('a conditional clinic type is not allowed to be settled on the card', () => {
  const draft = {
    sections: CONDITIONAL_STEPS(),
    keyPoints: POINTS,
    followUps: LETTER_FOLLOW_UP,
    referralRoute: { requestType: 'Referral', priority: 'Routine', specialty: 'Physiotherapy', clinicType: 'Extended Scope Physiotherapy' },
  };
  const { problems, referralRoute } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to physiotherapy?');
  assert.ok(problems.some((p) => /may not pick a side/i.test(p)));
  // Even before the repair round, the card carries the condition rather than
  // presenting one branch of it as the answer.
  assert.match(referralRoute.clinicTypeCondition, /only if the doctor/i);
});

test('an unconditional clinic type is left exactly as written', () => {
  const draft = {
    sections: complete(),
    keyPoints: POINTS,
    followUps: LETTER_FOLLOW_UP,
    referralRoute: { requestType: 'Referral', priority: '2WW', specialty: 'Dermatology', clinicType: '2WW Skin' },
  };
  const { problems, referralRoute } = validateDraft(draft, evidenceStub(), 'How do I do a cancer dermatology referral?');
  assert.deepEqual(problems, []);
  assert.equal(referralRoute.clinicTypeCondition, '');
  assert.deepEqual(referralRoute.clinicTypeOptions, []);
});

test('a choice of clinic types is kept as a choice, with clinicType left empty', () => {
  const draft = {
    sections: CONDITIONAL_STEPS(),
    keyPoints: POINTS,
    followUps: LETTER_FOLLOW_UP,
    referralRoute: {
      requestType: 'Referral', priority: 'Routine', specialty: 'Physiotherapy',
      clinicType: 'Extended Scope Physiotherapy',
      clinicTypeOptions: ['Musculoskeletal', 'Extended Scope Physiotherapy'],
      clinicTypeCondition: 'Extended Scope only if the doctor’s task asks for it.',
    },
  };
  const { problems, referralRoute } = validateDraft(draft, evidenceStub(), 'How do I refer a patient to physiotherapy?');
  assert.deepEqual(problems, []);
  assert.equal(referralRoute.clinicType, '');
  assert.deepEqual(referralRoute.clinicTypeOptions, ['Musculoskeletal', 'Extended Scope Physiotherapy']);
});

test('a single option is the clinic type, not a choice', () => {
  const draft = {
    sections: complete(),
    keyPoints: POINTS,
    followUps: LETTER_FOLLOW_UP,
    referralRoute: { requestType: 'Referral', priority: '2WW', specialty: 'Dermatology', clinicType: '', clinicTypeOptions: ['2WW Skin'] },
  };
  const { problems, referralRoute } = validateDraft(draft, evidenceStub(), 'How do I do a cancer dermatology referral?');
  assert.deepEqual(problems, []);
  assert.equal(referralRoute.clinicType, '2WW Skin');
  assert.deepEqual(referralRoute.clinicTypeOptions, []);
});

test('a conditional clinic type in the source alone is still caught', () => {
  // The steps say nothing conditional; the Notebook page they were written from
  // does. The card must not be more certain than the material it came from.
  const conditional = {
    docId: 'p1', docTitle: 'Physiotherapy referrals',
    text: 'Set the clinic type to Musculoskeletal. Use Extended Scope Physiotherapy only when the doctor has asked for it in the task.',
    view: null, images: [],
  };
  const evidence = {
    verifyPractice: (quote, ref) => ({ ref: String(ref || 'P1').toUpperCase(), chunk: conditional, exact: true }),
    getWeb: () => null,
    practiceList: () => [conditional],
    webList: () => [],
  };
  const draft = {
    sections: [section('Send the referral', '1. Find the doctor’s document in the **Consultation**.\n2. Set the **speciality** and **clinic type** as below.\n3. Send it.')],
    keyPoints: POINTS,
    followUps: LETTER_FOLLOW_UP,
    referralRoute: { requestType: 'Referral', priority: 'Routine', specialty: 'Physiotherapy', clinicType: 'Extended Scope Physiotherapy' },
  };
  const { problems, referralRoute } = validateDraft(draft, evidence, 'How do I refer a patient to physiotherapy?');
  assert.ok(problems.some((p) => /may not pick a side/i.test(p)));
  assert.match(referralRoute.clinicTypeCondition, /only when the doctor has asked/i);
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
