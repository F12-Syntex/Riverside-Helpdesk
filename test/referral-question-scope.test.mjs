import test from 'node:test';
import assert from 'node:assert/strict';
import { isReferralRequest, answerReferralRoute, allowsErsCard } from '../lib/referrals/scope.mjs';

// The e-RS card is the first thing on the answer and the part that gets acted
// on, and it was being decided by the word "refer" appearing anywhere in the
// question. That word does far too much work: it puts four e-RS fields above
// answers about a referral arriving from a hospital, one already sent, or a
// policy that merely uses it. These pin the line.

test('asking how to make a referral is a referral request', () => {
  for (const q of [
    'How do I refer a patient to dermatology?',
    'How do I do an ECG referral?',
    'dermatology referral?',
    'How do I make a 2ww referral for suspected skin cancer?',
    'Can you refer someone for physio?',
    'What speciality do I use when referring a patient to cardiology?',
    'How do I create a referral letter?',
  ]) {
    assert.equal(isReferralRequest(q), true, q);
  }
});

test('a referral coming into the practice is not a referral request', () => {
  for (const q of [
    'What do I do with a referral sent to us by the hospital?',
    'A patient was referred to us by 111 — what happens next?',
    'How do we handle referrals from other practices?',
    'What do I do when a patient is referred to the practice by A&E?',
  ]) {
    assert.equal(isReferralRequest(q), false, q);
  }
});

test('a referral already sent is not a referral request', () => {
  for (const q of [
    'How do I chase a referral?',
    'A patient has not heard about their referral, what do I do?',
    'How long do dermatology referrals take?',
    'What do I do with a rejected referral?',
    'How do I cancel a referral?',
  ]) {
    assert.equal(isReferralRequest(q), false, q);
  }
});

test('the word pointing at a document is not a referral request', () => {
  for (const q of [
    'Where does the policy refer to chaperones?',
    'What is the DNA process referred to as in the notebook?',
    'Refer to the guidance on sharps — where is it?',
  ]) {
    assert.equal(isReferralRequest(q), false, q);
  }
});

test('questions with no referral in them at all are not referral requests', () => {
  for (const q of ['How do I book a routine appointment?', 'What is the number for Whipps Cross?', '']) {
    assert.equal(isReferralRequest(q), false, q);
  }
});

test('a question that both chases and makes one is still a referral request', () => {
  // "Making" wins: the reader is about to fill the form in, whatever else they
  // also asked.
  assert.equal(isReferralRequest('How do I make a referral and how long is the wait?'), true);
});

test('the route the answer describes is read from its own steps', () => {
  assert.equal(answerReferralRoute('Set the speciality and send it on e-RS.'), 'ers');
  assert.equal(answerReferralRoute('Book it through Choose and Book.'), 'ers');
  assert.equal(answerReferralRoute('ECG referrals are emailed, not sent on e-RS.'), 'not-ers');
  assert.equal(answerReferralRoute('Attach the letter in Accurx and email it to the team.'), 'other');
  assert.equal(answerReferralRoute('Find the doctor’s document in the Consultation and send it.'), 'unstated');
  assert.equal(answerReferralRoute(''), 'unstated');
});

test('an e-RS directive beats a passing mention of email', () => {
  assert.equal(
    answerReferralRoute('Send it on e-RS. Email the practice manager if no slot is available.'),
    'ers',
  );
});

test('a matched pairing needs the answer to actually open e-RS', () => {
  const question = 'How do I refer a patient to dermatology?';
  assert.equal(allowsErsCard({ question, answerText: 'Send it on e-RS.', source: 'suggested' }), true);
  // Silence is not evidence: a value matched from a list needs the form to exist.
  assert.equal(allowsErsCard({ question, answerText: 'Send it.', source: 'suggested' }), false);
  // A pairing the practice wrote down is shown unless the answer routes elsewhere.
  assert.equal(allowsErsCard({ question, answerText: 'Send it.', source: 'practice' }), true);
  assert.equal(allowsErsCard({ question, answerText: 'Email it to the team.', source: 'practice' }), false);
});

test('no card at all for a question that is not about making a referral', () => {
  assert.equal(allowsErsCard({
    question: 'How do I chase a referral?',
    answerText: 'Open it on e-RS and check the status.',
    source: 'practice',
  }), false);
});
