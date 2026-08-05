import test from 'node:test';
import assert from 'node:assert/strict';
import { determineReferralRoute } from '../lib/referrals/route-determination.mjs';

// A referral the Notebook has no page for must still reach the reader with a
// speciality and a clinic type — determined from the practice's e-RS
// referral-types export — and must never reach them looking like something the
// practice wrote down. These are the two failures worth pinning: a determined
// pairing dropped, and a determined pairing shown unmarked.
//
// And a third, which is what filling the card in has to be narrow about: a
// pairing conjured onto an answer that is not about making a referral on e-RS at
// all. Those cases are at the bottom.

// The question and the answer a determined pairing needs behind it: somebody
// making a referral, with steps that put it on e-RS.
const ASKED = 'How do I refer a patient to dermatology?';
const ON_ERS = '1. Find the doctor’s document in the **Consultation**.\n2. Send it on e-RS.';

const suggestion = {
  specialty: 'Dermatology',
  clinicType: 'Skin Lesions',
  snomed: { conceptId: '254651007', term: 'Basal cell carcinoma of skin' },
  alternatives: [{ specialty: 'Dermatology', clinicType: 'Skin Surgery' }],
  confidence: 0.62,
  cancer: false,
  explanation: 'Suggested from SNOMED 254651007.',
};

test('a referral the notes do not cover is filled in from the lookup', () => {
  const { route, determination } = determineReferralRoute({
    route: null, suggestion, sourceTexts: [], question: ASKED, answerText: ON_ERS,
  });
  assert.equal(route.specialty, 'Dermatology');
  assert.equal(route.clinicType, 'Skin Lesions');
  assert.equal(route.requestType, 'Referral');
  assert.equal(route.source, 'suggested');
  assert.equal(determination.snomed.conceptId, '254651007');
  assert.deepEqual(determination.alternatives, [{ specialty: 'Dermatology', clinicType: 'Skin Surgery' }]);
});

test('a cancer referral keeps its priority even when the notes record nothing', () => {
  const { route } = determineReferralRoute({
    route: null,
    suggestion: { ...suggestion, specialty: '2WW', clinicType: '2WW Skin', cancer: true },
    sourceTexts: [],
    question: 'How do I do a 2ww skin cancer referral?',
    answerText: ON_ERS,
  });
  assert.equal(route.priority, '2WW');
});

test('a pairing the practice records is left alone and carries no caveat', () => {
  const route = {
    requestType: 'Referral', priority: 'Routine', specialty: 'Dermatology', clinicType: 'Skin Lesions',
    clinicTypeOptions: [], clinicTypeCondition: '', source: 'practice',
  };
  const out = determineReferralRoute({
    route,
    suggestion,
    sourceTexts: ['Send skin referrals to Dermatology under the Skin Lesions clinic type.'],
  });
  assert.equal(out.route.source, 'practice');
  assert.equal(out.determination, null);
});

test('a determined pairing labelled as the practice’s own is relabelled', () => {
  // The writer decides that label, and getting it wrong is the difference
  // between a checked value and one the reader trusts as practice policy.
  const route = {
    requestType: 'Referral', priority: '', specialty: 'Dermatology', clinicType: 'Skin Lesions',
    clinicTypeOptions: [], clinicTypeCondition: '', source: 'practice',
  };
  const out = determineReferralRoute({
    route,
    suggestion,
    sourceTexts: ['Referrals are made through e-RS once the doctor has completed the document.'],
  });
  assert.equal(out.route.source, 'suggested');
  assert.ok(out.determination);
});

test('a choice of clinic types the material records is never overwritten', () => {
  const route = {
    requestType: 'Referral', priority: '', specialty: 'Physiotherapy', clinicType: '',
    clinicTypeOptions: ['Musculoskeletal', 'Extended Scope'], clinicTypeCondition: 'Extended Scope only if the task asks.',
    source: 'practice',
  };
  const out = determineReferralRoute({ route, suggestion, sourceTexts: [] });
  assert.deepEqual(out.route.clinicTypeOptions, ['Musculoskeletal', 'Extended Scope']);
  assert.equal(out.determination, null);
});

test('no lookup result leaves the answer exactly as it was', () => {
  assert.deepEqual(determineReferralRoute({ route: null, suggestion: null }), { route: null, determination: null });
  const route = { specialty: 'Dermatology', clinicType: '', clinicTypeOptions: [], source: 'practice' };
  assert.deepEqual(determineReferralRoute({ route, suggestion: null }), { route, determination: null });
});

// Filling the card in is the one thing here that CREATES an e-RS card where the
// answer had none. Each of these is a question the word "referral" appears in
// and no e-RS form sits behind, which is how the card was reaching answers that
// had nothing to do with sending one.

test('a question about a referral coming in gets no card', () => {
  const { route, determination } = determineReferralRoute({
    route: null,
    suggestion,
    question: 'What do I do with a referral sent to us by the hospital?',
    answerText: 'Scan it and file it against the patient on e-RS.',
  });
  assert.equal(route, null);
  assert.equal(determination, null);
});

test('a question about chasing a referral already sent gets no card', () => {
  const { route } = determineReferralRoute({
    route: null,
    suggestion,
    question: 'How do I chase a dermatology referral the patient has not heard about?',
    answerText: 'Open the referral on e-RS and check its status.',
  });
  assert.equal(route, null);
});

test('a referral that is not sent on e-RS gets no card', () => {
  const { route } = determineReferralRoute({
    route: null,
    suggestion,
    question: 'How do I do an ECG referral?',
    answerText: '1. Open **Accurx**.\n2. Attach the referral letter and email it to the ECG team.',
  });
  assert.equal(route, null);
});

test('an answer that never says which route it takes gets no determined card', () => {
  // Nothing says e-RS and nothing says otherwise. A pairing matched from a list
  // is a value for a form, so silence is not enough to put one on the answer.
  const { route } = determineReferralRoute({
    route: null, suggestion, question: ASKED,
    answerText: 'Find the doctor’s document in the Consultation and send it.',
  });
  assert.equal(route, null);
});

test('a weak match is not turned into a card the practice never wrote', () => {
  const { route } = determineReferralRoute({
    route: null,
    suggestion: { ...suggestion, confidence: 0.36 },
    question: ASKED,
    answerText: ON_ERS,
  });
  assert.equal(route, null);
});

test('a pairing the writer produced is still labelled, whatever the question', () => {
  // The gates guard filling the card IN. A route the composer already decided to
  // show still gets its provenance settled here.
  const route = {
    requestType: 'Referral', priority: '', specialty: 'Dermatology', clinicType: 'Skin Lesions',
    clinicTypeOptions: [], clinicTypeCondition: '', source: 'practice',
  };
  const out = determineReferralRoute({ route, suggestion, sourceTexts: [], question: ASKED, answerText: ON_ERS });
  assert.equal(out.route.source, 'suggested');
  assert.ok(out.determination);
});
