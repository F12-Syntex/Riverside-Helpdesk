import test from 'node:test';
import assert from 'node:assert/strict';
import { NG12_RULES, readAge, scanNg12 } from '../lib/safety/ng12.mjs';
import { scanConfidentiality } from '../lib/safety/confidentiality.mjs';
import { scanRedFlags } from '../lib/safety/redflags.mjs';
import { ACUITY_ORDER, classifyRequest, moreUrgent, rankOf } from '../lib/safety/acuity.mjs';
import { MAX_REQUESTS, looksMultiIntent, normaliseRequests } from '../lib/safety/requests.mjs';
import { matchSpan, sentenceAround, spanWithin } from '../lib/safety/spans.mjs';
import { MAX_CLASSIFIED, applyClassification, toClassify } from '../lib/safety/triage-pass.mjs';
import { safetyScan } from '../lib/safety/scan.mjs';

const ids = (findings) => findings.map((f) => f.ruleId);

/* --------------------------------------------------------------- spans */

test('a span is found however the punctuation and case differ', () => {
  const message = 'I have run out of my ramipril, and the pharmacy wants it reviewed.';
  assert.ok(spanWithin('run out of my Ramipril', message));
  assert.ok(spanWithin('ramipril and the pharmacy wants it reviewed', message), 'a dropped comma is the same span');
  assert.ok(!spanWithin('run out of my atorvastatin', message));
});

test('an empty span is inside nothing — no evidence is not weak evidence', () => {
  assert.ok(!spanWithin('', 'anything at all'));
  assert.ok(!spanWithin('   ', 'anything at all'));
  assert.ok(!spanWithin(null, 'anything at all'));
});

test('a match is reported with the sentence it sits in', () => {
  const text = 'First a knee. Then the voice has been hoarse for six weeks. Then a fit note.';
  const hit = matchSpan(text, /hoarse/i);
  assert.equal(hit.match, 'hoarse');
  assert.equal(hit.span, 'Then the voice has been hoarse for six weeks');
});

test('a long sentence is cut around what matched, not from its start', () => {
  const filler = 'x'.repeat(400);
  const span = sentenceAround(filler + ' hoarse ' + filler, filler.length + 1, 6, 60);
  assert.match(span, /hoarse/, 'the words that fired must survive the cut');
  assert.ok(span.length <= 64);
});

test('a shared pattern does not carry lastIndex between calls', () => {
  // The classic way a scanner starts missing every other message.
  const pattern = /hoarse/gi;
  assert.ok(matchSpan('a hoarse voice', pattern));
  assert.ok(matchSpan('a hoarse voice', pattern));
});

/* ------------------------------------------------------------- requests */

test('the multi-intent gate opens on length or on a joining phrase', () => {
  assert.ok(!looksMultiIntent('how do I refer for an ECG'));
  assert.ok(looksMultiIntent('Can I have a fit note, and also can you check my blood results'));
  assert.ok(looksMultiIntent('a'.repeat(301)));
  assert.ok(!looksMultiIntent('a'.repeat(200)));
});

test('a paraphrased span is kept but marked as not verbatim', () => {
  const message = 'My knee has been sore since March.';
  const { items } = normaliseRequests([
    { text: 'My knee has been sore since March', gist: 'knee' },
    { text: 'the patient reports knee pain', gist: 'knee again' },
  ], message);
  assert.equal(items[0].verbatim, true);
  assert.equal(items[1].verbatim, false, 'a span that is not in the message cannot ground a claim');
});

test('duplicates and blanks are dropped, and the overflow is counted not hidden', () => {
  const many = Array.from({ length: MAX_REQUESTS + 3 }, (_, i) => ({ text: 'request number ' + i }));
  const { items, dropped } = normaliseRequests([...many, { text: '' }, { text: 'request number 0' }], '');
  assert.equal(items.length, MAX_REQUESTS);
  assert.equal(dropped, 5);
});

/* ----------------------------------------------------------------- NG12 */

test('every NG12 rule fires on the wording it was written for', () => {
  const cases = {
    'ng12.hoarseness': 'her voice has been hoarse for six weeks now',
    'ng12.weightLoss': 'I have lost two stone since Christmas',
    'ng12.dysphagia': 'she is having trouble swallowing solid food',
    'ng12.neckLump': 'there is a lump in his neck that has not gone',
    'ng12.haemoptysis': 'he has been coughing up blood this week',
    'ng12.rectalBleeding': 'bleeding from the back passage for a fortnight',
    'ng12.postMenopausalBleeding': 'post-menopausal bleeding started on Sunday',
    'ng12.breastLump': 'she has found a breast lump',
    'ng12.haematuria': 'there is blood in my urine',
  };
  for (const rule of NG12_RULES) {
    assert.ok(cases[rule.id], 'every rule needs a case: ' + rule.id);
    assert.ok(ids(scanNg12(cases[rule.id])).includes(rule.id), rule.id + ' did not fire');
  }
});

test('hoarseness needs the duration NG12 actually names', () => {
  assert.equal(scanNg12('hoarse since yesterday, feels rough').length, 0, 'two days is not three weeks');
  assert.ok(ids(scanNg12('hoarse for over a month')).includes('ng12.hoarseness'));
  assert.ok(ids(scanNg12('croaky voice, four weeks now')).includes('ng12.hoarseness'));
});

test('weight loss only counts when nobody was trying to lose it', () => {
  assert.equal(scanNg12('lost weight on the new diet, very pleased').length, 0);
  assert.ok(ids(scanNg12('unexplained weight loss over the summer')).includes('ng12.weightLoss'));
});

test('a finding carries the words that fired it, so a review can disagree with it', () => {
  const [found] = scanNg12('Separately, my voice has been hoarse for more than three weeks.');
  assert.match(found.span, /hoarse for more than three weeks/);
  assert.equal(found.acuity, 'twoWeekWait');
});

test('an age is read when it is stated and never guessed', () => {
  assert.equal(readAge('58 year old with a cough'), 58);
  assert.equal(readAge('aged 72, calling about a rash'), 72);
  assert.equal(readAge('calling about a rash'), null);
});

/* -------------------------------------------------------- red flags */

test('the red flag net now runs over a message nothing routed to triage', () => {
  const found = scanRedFlags('Please can I have a repeat prescription. I have also had chest pain since Tuesday.');
  assert.deepEqual(ids(found), ['redFlag.emergency']);
  assert.match(found[0].span, /chest pain/);
});

test('cauda equina is only a red flag next to a back problem', () => {
  assert.ok(ids(scanRedFlags('back pain and I cannot pass urine since this morning')).includes('redFlag.caudaEquina'));
  assert.equal(ids(scanRedFlags('long standing urinary incontinence, asking about pads')).length, 0);
});

/* --------------------------------------------------- confidentiality */

test('a request about a relative’s record is caught in both word orders', () => {
  assert.ok(scanConfidentiality("can you check my wife's blood results").length);
  assert.ok(scanConfidentiality('I need the results for my mother').length);
  assert.ok(scanConfidentiality('I am asking on behalf of my father').length);
  assert.ok(scanConfidentiality("she's registered with you too").length);
  assert.ok(scanConfidentiality('my wife needs a fit note for next week').length, 'no possessive, but a verb asking for it');
});

test('merely mentioning a relative is not a third-party request', () => {
  // A rule that shouts at every family word becomes wallpaper within a week,
  // and wallpaper is the failure mode that matters here.
  assert.equal(scanConfidentiality('my wife booked this appointment for me').length, 0);
  assert.equal(scanConfidentiality('my son gave me a lift here this morning').length, 0);
  assert.equal(scanConfidentiality('my knee has been sore since March').length, 0);
  // The writer claiming the thing for themselves, next to a relative they
  // merely mentioned. Refusing this is how a receptionist learns to stop
  // reading the warnings.
  assert.equal(scanConfidentiality("I am my mother-in-law's carer and I have my own appointment to move").length, 0);
  assert.equal(scanConfidentiality("my wife's sister dropped me off, I need my own repeat prescription").length, 0);
});

/* ---------------------------------------------------------- acuity */

test('the order is the order, and it is a total one', () => {
  assert.deepEqual(ACUITY_ORDER, ['admin', 'routine', 'sameDay', 'twoWeekWait', 'emergency']);
  assert.ok(moreUrgent('emergency', 'twoWeekWait'));
  assert.ok(moreUrgent('twoWeekWait', 'admin'));
  assert.ok(!moreUrgent('routine', 'routine'));
  assert.equal(rankOf('nonsense'), rankOf('routine'), 'an unknown level is not treated as the least urgent');
});

test('each level is reached by the thing it is for', () => {
  assert.equal(classifyRequest('he has chest pain and is short of breath').acuity, 'emergency');
  assert.equal(classifyRequest('hoarse for over a month with unexplained weight loss').acuity, 'twoWeekWait');
  assert.equal(classifyRequest('she needs to be seen today, it is getting worse').acuity, 'sameDay');
  assert.equal(classifyRequest('my knee has been sore since March').acuity, 'routine');
  assert.equal(classifyRequest('I need a fit note for last week').acuity, 'admin');
});

test('an admin request with symptoms attached is not an admin request', () => {
  // "My ramipril has run out and I have been dizzy since" is not a
  // prescription job, and ranking it as one is how it waits three days.
  assert.equal(classifyRequest('my ramipril has run out and I have been dizzy since').acuity, 'routine');
});

/* ----------------------------------------- the panel keeps trivia out */

test('a preference about timing is not an unresolved clinical item', () => {
  const s = safetyScan({
    message: 'My knee is still sore. Also could it be an evening appointment if possible, whenever suits.',
    requests: [
      { text: 'My knee is still sore', gist: 'knee' },
      { text: 'could it be an evening appointment if possible, whenever suits', gist: 'evening slot' },
    ],
  });
  assert.equal(s.trivia, 1);
  assert.equal(s.listed.length, 1);
});

/* ------------------------------------------ the second pass, and its veto */

test('the second pass may raise acuity and may never lower it', () => {
  const item = { id: 'r1', acuity: 'emergency', status: 'flagged' };
  const lowered = applyClassification(item, { acuity: 'routine', condition: 'a graze' });
  assert.equal(lowered.acuity, 'emergency', 'the regex is the guarantee; the model is a recall booster');
  assert.equal(lowered.raisedBy, undefined);

  const raised = applyClassification({ id: 'r2', acuity: 'routine' }, { acuity: 'twoWeekWait', condition: 'hoarse voice' });
  assert.equal(raised.acuity, 'twoWeekWait');
  assert.equal(raised.status, 'flagged');
  assert.equal(raised.raisedBy, 'triagePass');
});

test('the second pass can add a refusal and can never withdraw one', () => {
  const added = applyClassification({ id: 'r1', acuity: 'routine' }, { acuity: 'thirdPartyRequest' });
  assert.equal(added.thirdParty, true);
  assert.equal(added.status, 'refused');

  const kept = applyClassification({ id: 'r2', acuity: 'routine', thirdParty: true, status: 'refused' }, { acuity: 'admin' });
  assert.equal(kept.thirdParty, true, 'a model saying "that one is fine" cannot withdraw a refusal');
});

test('a failed or missing classification leaves the item exactly as it was', () => {
  const item = { id: 'r1', acuity: 'sameDay', status: 'unhandled', gist: 'knee' };
  assert.deepEqual(applyClassification(item, null), item);
});

test('the model may fill an empty label and never overwrite one', () => {
  assert.equal(applyClassification({ id: 'r1', acuity: 'routine', gist: '' }, { acuity: 'routine', condition: 'knee pain' }).gist, 'knee pain');
  assert.equal(applyClassification({ id: 'r1', acuity: 'routine', gist: 'knee' }, { acuity: 'routine', condition: 'something else' }).gist, 'knee');
});

test('classification is capped, the overflow is reported, and settled emergencies are skipped', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: 'r' + i, acuity: 'routine' }));
  items[0].acuity = 'emergency';
  const { take, skipped } = toClassify(items);
  assert.equal(take.length, MAX_CLASSIFIED);
  assert.ok(!take.some((item) => item.acuity === 'emergency'), 'nothing sits above emergency to raise it to');
  assert.equal(skipped, 2);
});
