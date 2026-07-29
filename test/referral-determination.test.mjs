import test from 'node:test';
import assert from 'node:assert/strict';
import { determineReferralRoute } from '../lib/referrals/route-determination.mjs';

// A referral the Notebook has no page for must still reach the reader with a
// speciality and a clinic type — determined from the practice's e-RS
// referral-types export — and must never reach them looking like something the
// practice wrote down. These are the two failures worth pinning: a determined
// pairing dropped, and a determined pairing shown unmarked.

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
  const { route, determination } = determineReferralRoute({ route: null, suggestion, sourceTexts: [] });
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
