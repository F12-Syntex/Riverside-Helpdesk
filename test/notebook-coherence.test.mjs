import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences } from '../lib/notebook/sentences.mjs';
import {
  findCandidates, fieldOf, chunkCandidates, buildCoherencePrompt, mergeFindings, COHERENCE_SCHEMA, SIM_MIN,
} from '../lib/notebook/coherence.mjs';

const page = (noteId, title, body, section = 'Referrals') => ({
  noteId,
  title,
  path: [section, title],
  sentences: splitSentences(body),
});

test('two pages about the same service with different field values are a candidate', () => {
  const pages = [
    page(1, 'Physiotherapy', 'Speciality: Physiotherapy\nClinic type: MSK\nSend to: physio.referrals@nhs.net\n'),
    page(2, 'Physiotherapy self-referral', 'Speciality: Physiotherapy\nClinic type: MSK\nSend to: physio.team@nhs.uk\n'),
  ];
  const found = findCandidates(pages);
  const sendTo = found.find((c) => c.kind === 'field' && /Send to/.test(c.why));
  assert.ok(sendTo, 'the differing Send to line should be a candidate');
  assert.equal(sendTo.a.noteId, 1);
  assert.equal(sendTo.b.noteId, 2);
  assert.match(sendTo.a.text, /physio\.referrals@nhs\.net/);
  assert.match(sendTo.b.text, /physio\.team@nhs\.uk/);
  // The fields that agree raise nothing.
  assert.ok(!found.some((c) => /Clinic type/.test(c.why)));
});

test('the same sentence on two pages with a different number is a candidate; identical text is not', () => {
  const same = 'Ring the hospital switchboard and ask for the on-call registrar before you book.';
  const pages = [
    page(3, 'Two week wait', 'The form must reach the hospital within 48 hours of the appointment. ' + same),
    page(4, 'Urgent suspected cancer', 'The form must reach the hospital within 72 hours of the appointment. ' + same, 'Cancer'),
  ];
  const found = findCandidates(pages);
  const hours = found.filter((c) => c.kind === 'echo');
  assert.equal(hours.length, 1);
  assert.match(hours[0].why, /numbers: 48 vs 72/);
  assert.ok(hours[0].score >= SIM_MIN);
});

test('a sentence that differs only in polarity is caught, and says so', () => {
  const pages = [
    page(5, 'Sick notes', 'Reception staff can issue a repeat sick note without asking a doctor first.'),
    page(6, 'Fit notes', 'Reception staff cannot issue a repeat sick note without asking a doctor first.', 'Admin'),
  ];
  const found = findCandidates(pages);
  assert.equal(found.length, 1);
  assert.match(found[0].why, /one page says “can”, the other “cannot”/);
});

test('unrelated pages, and the same statement written twice, raise nothing', () => {
  const line = 'Book the patient into the next available slot and add a task for the duty doctor.';
  const pages = [
    page(7, 'Blood tests', line),
    page(8, 'Blood test bookings', line, 'Admin'),
    page(9, 'Car parking', 'Staff parking permits are renewed every April by the practice manager.', 'Admin'),
  ];
  assert.deepEqual(findCandidates(pages), []);
});

test('a pair already decided is not raised again', () => {
  const pages = [
    page(1, 'Physiotherapy', 'Speciality: Physiotherapy\nSend to: physio.referrals@nhs.net\n'),
    page(2, 'Physiotherapy self-referral', 'Speciality: Physiotherapy\nSend to: physio.team@nhs.uk\n'),
  ];
  const first = findCandidates(pages);
  assert.ok(first.length);
  assert.deepEqual(findCandidates(pages, { skip: new Set(first.map((c) => c.id)) }), []);
});

test('candidate ids are stable across runs and capped by max', () => {
  const pages = [
    page(1, 'Physiotherapy', 'Speciality: Physiotherapy\nSend to: a@nhs.net\nPriority: Routine\n'),
    page(2, 'Physiotherapy extended scope', 'Speciality: Physiotherapy\nSend to: b@nhs.net\nPriority: Urgent\n'),
  ];
  const a = findCandidates(pages).map((c) => c.id);
  const b = findCandidates(pages).map((c) => c.id);
  assert.deepEqual(a, b);
  assert.equal(findCandidates(pages, { max: 1 }).length, 1);
});

test('fieldOf reads the canonical label, aliases included, and ignores prose with a colon', () => {
  assert.deepEqual(fieldOf('Speciality: Cardiology'), { field: 'Speciality', value: 'Cardiology' });
  assert.deepEqual(fieldOf('- **Location:** Homerton'), { field: 'Hospital', value: 'Homerton' });
  assert.equal(fieldOf('Remember: the patient must consent'), null);
});

test('the prompt names every pair with both pages, both statements and what the code noticed', () => {
  const pages = [
    page(1, 'Physiotherapy', 'Speciality: Physiotherapy\nSend to: a@nhs.net\n'),
    page(2, 'Physiotherapy extended scope', 'Speciality: Physiotherapy\nSend to: b@nhs.net\n'),
  ];
  const cands = findCandidates(pages);
  const prompt = buildCoherencePrompt(cands);
  for (const c of cands) {
    assert.ok(prompt.includes('#' + c.id));
    assert.ok(prompt.includes('STATEMENT A: ' + c.a.text));
    assert.ok(prompt.includes('STATEMENT B: ' + c.b.text));
    assert.ok(prompt.includes('PAGE A: ' + c.a.path));
  }
  assert.match(prompt, /"contradiction"/);
  assert.match(prompt, /"consistent"/);
  assert.match(prompt, /"unsure"/);
});

test('findings merge: consistent pairs vanish, a missing verdict becomes a non-blocking unsure', () => {
  const cands = [{ id: 'x1', a: {}, b: {} }, { id: 'x2', a: {}, b: {} }, { id: 'x3', a: {}, b: {} }];
  const merged = mergeFindings(cands, [
    [{ id: 'x1', verdict: 'contradiction', reason: 'two addresses', question: 'Which address?', severity: 'high' }],
    [{ id: 'x2', verdict: 'consistent', reason: 'different clinics' }],
  ], { model: 'm' });
  assert.equal(merged.ok, false);
  assert.equal(merged.contradictions.length, 1);
  assert.equal(merged.contradictions[0].question, 'Which address?');
  assert.deepEqual(merged.missing, ['x3']);
  assert.equal(merged.unsure.length, 1);
  assert.equal(merged.flagged.length, 2);
  assert.equal(merged.model, 'm');
});

test('no contradictions is ok, and chunking covers every pair', () => {
  const cands = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const merged = mergeFindings(cands, [cands.map((c) => ({ id: c.id, verdict: 'consistent', reason: '' }))]);
  assert.ok(merged.ok);
  assert.deepEqual(merged.flagged, []);
  assert.deepEqual(chunkCandidates(cands, 2).map((c) => c.length), [2, 1]);
});

test('the schema accepts a finding and rejects a made-up verdict', () => {
  assert.ok(COHERENCE_SCHEMA.safeParse({ findings: [{ id: 'a', verdict: 'contradiction', reason: 'r', question: 'q', severity: 'high' }] }).success);
  assert.ok(!COHERENCE_SCHEMA.safeParse({ findings: [{ id: 'a', verdict: 'maybe' }] }).success);
});
