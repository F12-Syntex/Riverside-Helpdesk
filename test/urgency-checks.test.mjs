import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECK_SETS,
  EVIDENCE,
  LEVELS,
  MAX_SETS,
  SETTLED_DAYS,
  hasRecentChange,
  matchCheckSets,
  matchEmergencyWords,
  parseDurationDays,
  urgencyCheck,
} from '../lib/triage/urgency.js';
import { TEST_TRIAGE_ANSWER, TEST_TRIAGE_REQUEST } from '../lib/test-answer.js';

// Marking a request urgent interrupts the duty doctor and puts every other
// patient behind it. These are the rules that decide whether that cost is
// worth paying, and none of them may be reached by a model: the questions,
// the thresholds and the evidence behind them are all fixed here.

test('reads how long the patient says it has been going on', () => {
  assert.equal(parseDurationDays('burning when I pee for a week').days, 7);
  assert.equal(parseDurationDays('three days of tummy pain').days, 3);
  assert.equal(parseDurationDays('started about 2 hours ago').days, 2 / 24);
  assert.equal(parseDurationDays('going on for a couple of months').days, 60);
  assert.equal(parseDurationDays('since yesterday').days, 1);
  assert.equal(parseDurationDays('came on this morning').days, 0.5);
  assert.equal(parseDurationDays('had it for a fortnight').days, 14);
  assert.equal(parseDurationDays('my back hurts'), null);
});

test('takes the longest duration mentioned, so a recent flare does not hide an old problem', () => {
  assert.equal(parseDurationDays('sore for 3 weeks, much worse in the last 2 hours').days, 21);
});

test('a change of any kind is noticed separately from the duration', () => {
  assert.ok(hasRecentChange('it is much worse today'));
  assert.ok(hasRecentChange('came on suddenly'));
  assert.equal(hasRecentChange('same as it has been all week'), false);
});

test('a week of stable urinary pain is not a duty doctor call', () => {
  const v = urgencyCheck({ text: 'I have had pain when passing urine for a week now.', urgency: 'urgent' });
  assert.equal(v.level, 'verify');
  assert.equal(v.duration.longstanding, true);
  assert.match(v.settledNote, /not a duty doctor call/);
  assert.ok(v.sets.some((s) => s.key === 'urinary'));
});

test('the same complaint with blood, fever or rigors puts the questions that matter on the page', () => {
  const v = urgencyCheck({ text: 'Burning when passing urine, some blood in it, shivering and pain in my side since this morning.', urgency: 'urgent' });
  const urinary = v.sets.find((s) => s.key === 'urinary');
  assert.ok(urinary, 'the urinary set is offered');
  assert.ok(urinary.questions.some((q) => /blood in the urine/i.test(q.ask)));
  assert.ok(urinary.questions.some((q) => /back or side/i.test(q.ask)));
  assert.ok(urinary.questions.some((q) => /shivering/i.test(q.ask)));
  // Nothing about it reads as settled, so no "book it" note is offered.
  assert.equal(v.duration.longstanding, false);
  assert.equal(v.settledNote, '');
});

test('visible blood changes the referral rather than pulling the duty doctor', () => {
  const v = urgencyCheck({ text: 'blood in my urine', urgency: 'urgent' });
  const q = v.sets.find((s) => s.key === 'urinary').questions.find((x) => /blood in the urine/i.test(x.ask));
  assert.equal(q.level, 'pathway');
  assert.ok(q.evidence.some((e) => e.id === 'niceCancer'));
});

test('the 999 list stops the questionnaire rather than working through it', () => {
  const v = urgencyCheck({ text: 'Patient has chest pain and is sweaty and clammy.', urgency: 'urgent' });
  assert.equal(v.level, 'emergency');
  assert.ok(v.emergencyHits.length >= 1);
  assert.ok(v.emergencyHits.some((h) => /chest pain/i.test(h.label)));
});

test('999 words are caught even when the model banded the request as routine', () => {
  const v = urgencyCheck({ text: 'Wants a fit note. Also mentioned they think it might be sepsis.', urgency: 'routine' });
  assert.ok(v, 'a routine band does not suppress the emergency list');
  assert.equal(v.level, 'emergency');
});

test('nothing is offered for a genuinely routine request', () => {
  assert.equal(urgencyCheck({ text: 'Can I have a repeat prescription for my inhaler please.', urgency: 'routine' }), null);
  assert.equal(urgencyCheck({ text: 'Please can I have a copy of my vaccination record.', urgency: 'self-care' }), null);
});

test('back pain always asks the cauda equina questions', () => {
  const v = urgencyCheck({ text: 'Bad lower back pain for two days.', urgency: 'urgent' });
  const back = v.sets.find((s) => s.key === 'back');
  assert.ok(back);
  assert.equal(back.questions.filter((q) => q.level === '999').length, 3);
  assert.ok(back.questions.every((q) => q.evidence.length));
});

test('the page never grows past what someone will actually work through', () => {
  const v = urgencyCheck({
    text: 'Chest, tummy, head, back, eye, urine, fever, pregnant, child, testicle, mental health.',
    urgency: 'unclear',
  });
  assert.ok(v.sets.length <= MAX_SETS);
});

test('every question carries a level and at least one piece of evidence', () => {
  for (const set of CHECK_SETS) {
    for (const q of set.questions) {
      assert.ok(LEVELS[q.level], set.key + ': "' + q.ask + '" has a known level');
      assert.ok(q.evidence.length, set.key + ': "' + q.ask + '" cites something');
      for (const id of q.evidence) {
        assert.ok(EVIDENCE[id], set.key + ': unknown evidence id ' + id);
      }
    }
  }
});

test('every piece of national evidence is linkable and every practice one is named', () => {
  for (const [id, e] of Object.entries(EVIDENCE)) {
    assert.ok(e.label && e.org, id + ' is labelled');
    if (id.startsWith('practice')) assert.equal(e.url, '', id + ' is a practice document, not a link');
    else assert.match(e.url, /^https:\/\//, id + ' links to its source');
  }
});

test('the safety floor is always on the card and always cited', () => {
  const v = urgencyCheck({ text: 'Sore throat for eight days, no other symptoms.', urgency: 'unclear' });
  assert.match(v.floor.text, /in any doubt/i);
  assert.ok(v.floor.evidence.length);
  assert.equal(v.decision.length, 3);
  assert.ok(v.evidence.length, 'the card lists the sources it used');
});

test('the settled rule uses the practice’s own week-long line', () => {
  assert.equal(SETTLED_DAYS, 7);
  const six = urgencyCheck({ text: 'Tummy ache for 6 days.', urgency: 'urgent' });
  assert.equal(six.duration.longstanding, false);
  const eight = urgencyCheck({ text: 'Tummy ache for 8 days.', urgency: 'urgent' });
  assert.equal(eight.duration.longstanding, true);
});

test('a long history that is getting worse is not treated as settled', () => {
  const v = urgencyCheck({ text: 'Tummy ache for 2 weeks but much worse today.', urgency: 'urgent' });
  assert.equal(v.duration.longstanding, false);
  assert.equal(v.settledNote, '');
});

test('the words a patient actually uses reach the right questions', () => {
  // Nobody rings reception and says "urinary". Each of these is a real
  // phrasing that must still land on the waterworks questions.
  for (const said of [
    'burning when I pass water',
    'it stings when I wee',
    'cannot pass any water since last night',
    'think I have cystitis again',
    'my waterworks are playing up',
    'peeing every 20 minutes',
  ]) {
    const sets = matchCheckSets(said);
    assert.ok(sets.some((s) => s.key === 'urinary'), 'missed: ' + said);
  }
});

test('matching is by what the request is about, best first', () => {
  const sets = matchCheckSets('My son is 3 and has a fever and a rash');
  assert.equal(sets[0].key === 'child' || sets[0].key === 'infection', true);
  assert.equal(matchEmergencyWords('rash that does not fade').length, 1);
});

test('the "test triage" fixture shows the card it is meant to demonstrate', () => {
  // The fixture exists so the card can be looked at without spending a
  // token on it, and it is only worth having if it actually produces the
  // awkward case: a week of urinary symptoms that reads urgent and is not.
  const check = TEST_TRIAGE_ANSWER.urgencyCheck;
  assert.ok(check, 'the fixture carries a verification block');
  assert.equal(check.level, 'verify');
  assert.ok(check.sets.some((s) => s.key === 'urinary'), 'the waterworks questions are on it');
  assert.equal(check.duration.longstanding, true);
  assert.match(check.settledNote, /book it/);
  assert.match(TEST_TRIAGE_REQUEST, /pass water/);
});
