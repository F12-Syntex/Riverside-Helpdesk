import test from 'node:test';
import assert from 'node:assert/strict';
import { extractClinicalTerm, isCancerReferral, normaliseTerm } from '../lib/referrals/ers-lookup.js';

// The extraction step decides what the rest of the lookup ever sees, so it is
// the part worth pinning down — everything downstream follows from which words
// survive here. The database-backed half is exercised against the real tables
// instead: a fake ers_directory would prove nothing about real routing.

test('strips the boilerplate that wraps every referral note', () => {
  assert.deepEqual(extractClinicalTerm('urgent 2ww referral for suspected melanoma'), ['melanoma']);
  assert.deepEqual(extractClinicalTerm('Please refer for suspected skin cancer'), ['skin cancer']);
  assert.deepEqual(extractClinicalTerm('routine referral for eczema'), ['eczema']);
});

test('keeps the longest phrase first, so the most specific wins', () => {
  const out = extractClinicalTerm('patient with chronic knee pain, refer to orthopaedics');
  assert.equal(out[0], 'chronic knee pain');
  assert.ok(out.includes('orthopaedics'));
});

test('a note with no condition in it yields nothing', () => {
  assert.deepEqual(extractClinicalTerm('thanks please refer'), []);
  assert.deepEqual(extractClinicalTerm('   '), []);
});

test('cancer wording marks the referral as two week wait', () => {
  for (const note of ['2ww suspected skin cancer', 'query malignant melanoma', 'fast-track lung tumour', 'lymphoma', 'TWW lower GI']) {
    assert.equal(isCancerReferral(note), true, note);
  }
});

test('ordinary referrals are not marked as two week wait', () => {
  for (const note of ['routine referral for eczema', 'chronic knee pain', 'cataract assessment']) {
    assert.equal(isCancerReferral(note), false, note);
  }
});

test('normalisation drops the semantic tag SNOMED puts on a fully specified name', () => {
  // "Knee pain (finding)" and "Knee pain" must reach the same key, or every FSN
  // would fail to match the words a human actually types.
  assert.equal(normaliseTerm('Knee pain (finding)'), 'knee pain');
  assert.equal(normaliseTerm('Malignant melanoma of skin (disorder)'), 'malignant melanoma of skin');
});

test('normalisation folds case, punctuation and accents together', () => {
  assert.equal(normaliseTerm("Crohn's disease"), 'crohns disease');
  assert.equal(normaliseTerm('Spine - Back Pain (not Scoliosis/Deform)'), 'spine back pain');
  assert.equal(normaliseTerm('  MULTIPLE   spaces  '), 'multiple spaces');
});
