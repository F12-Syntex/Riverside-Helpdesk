import test from 'node:test';
import assert from 'node:assert/strict';
import { fcpAnswer, mskFeatures, needsFcp, isSpinalEmergency } from '../lib/templates/fcp.mjs';
import { pharmacyFirstAnswer } from '../lib/templates/pharmacy.mjs';
import { triagePatientAnswer } from '../lib/templates/triage.mjs';

// The message that produced the wrong answer, near enough verbatim. It reached
// the reader as "Back pain / musculoskeletal pain — Pharmacy First, minor
// illness referral, free medicines for eligible patients", because "lower back
// pain" is on the Pharmacy First minor illness list and "back or
// musculoskeletal pain" is one of the 24 CPSAS conditions.
const SCIATICA = `I completed a weight workout on 5th August and later that day developed sudden, severe stiffness and pain in my lower back, which travels down into my left leg. The pain is mainly in my lower back and the side/back of my left upper thigh. I have also experienced tingling, occasional numbness and sharp pains in the upper thigh. I am concerned that this may be sciatica or a pinched/irritated nerve and would like to be assessed.
The pain has remained severe since 5th August. It is affecting my ability to walk and move normally, prevents me from sleeping, and becomes worse if I stay in one position for too long.
I initially took ibuprofen 400 mg and then Nurofen Express, taking the maximum recommended daily dose, but neither provided relief. I have also tried Deep Heat, Voltarol, heat patches, ice and gentle stretches, without much improvement.
Could I please have advice on appropriate pain relief? I have also read about First Contact Physiotherapists. Would it be possible to arrange an FCP appointment or an appropriate musculoskeletal assessment?`;

// What the router reduces that to. This is the whole reason the guards run over
// the message rather than over the condition.
const AS_ROUTED = 'back pain';

const flat = (card) => JSON.stringify(card);

/* ------------------------------------------------- reading the description */

test('every escalating feature is read out of the message', () => {
  const f = mskFeatures(SCIATICA);
  assert.ok(f.msk, 'musculoskeletal');
  assert.ok(f.nerveRoot, 'pain radiating into the leg, tingling, numbness');
  assert.ok(f.selfcareFailed, 'maximum dose, no relief');
  assert.ok(f.severe, 'severe, cannot sleep, cannot walk normally');
  assert.ok(f.asked, 'asked for an FCP appointment by name');
  assert.ok(!f.caudaEquina, 'no bladder, bowel or saddle symptoms were described');
  assert.ok(needsFcp(f));
  assert.ok(!isSpinalEmergency(f));
});

test('simple new backache keeps none of them', () => {
  const f = mskFeatures('mild backache since yesterday, wants something for it');
  assert.ok(f.msk);
  assert.ok(!f.nerveRoot && !f.selfcareFailed && !f.severe && !f.asked);
  assert.ok(!needsFcp(f));
});

test('bladder and bowel symptoms only count as spinal next to a back problem', () => {
  assert.ok(isSpinalEmergency(mskFeatures('back pain and cannot pass urine since this morning')));
  // A continence problem on its own is a continence problem.
  assert.ok(!isSpinalEmergency(mskFeatures('long standing urinary incontinence, asking about pads')));
});

/* -------------------------------------------------------- where it now goes */

test('the reported message goes to the FCP, not to a pharmacy', () => {
  const card = triagePatientAnswer({ condition: AS_ROUTED, text: SCIATICA });
  const json = flat(card);
  assert.match(card.subtitle, /First Contact Physiotherapist/);
  assert.match(json, /First Contact Physiotherapist \(FCP\)/);
  assert.doesNotMatch(json, /Pharmacy First/);
  assert.doesNotMatch(json, /Community pharmacy/);
  assert.doesNotMatch(json, /Free medicines/);
  assert.doesNotMatch(json, /CPSAS/);
});

test('the FCP card carries the practice’s own booking route and rules', () => {
  const json = flat(triagePatientAnswer({ condition: AS_ROUTED, text: SCIATICA }));
  assert.match(json, /Find across organisation slot/);
  assert.match(json, /Hackney Downs PCN/);
  assert.match(json, /FCP new patient/);
  assert.match(json, /under 16/i);
  assert.match(json, /task to the FCP group/i);
});

test('the cauda equina questions are on the card, above the booking steps', () => {
  const card = triagePatientAnswer({ condition: AS_ROUTED, text: SCIATICA });
  const json = flat(card);
  assert.match(json, /groin, genitals, buttocks or back passage/i);
  assert.match(json, /bladder control/i);
  assert.match(json, /bowel control/i);
  // Against the first booking STEP, not the route field at the top of the card,
  // which names the PCN as a destination rather than as an instruction.
  const checks = json.indexOf('back passage');
  const booking = json.indexOf('Find across organisation slot');
  assert.ok(checks > -1 && booking > -1 && checks < booking, 'the checklist must come before the booking steps');
});

test('the request for pain relief is sent to a clinician, not answered', () => {
  const json = flat(triagePatientAnswer({ condition: AS_ROUTED, text: SCIATICA }));
  assert.match(json, /duty doctor|practice pharmacist/i);
  assert.match(json, /Do not advise on pain relief yourself/i);
});

test('cauda equina features beat everything below them', () => {
  const card = triagePatientAnswer({
    condition: 'back pain',
    text: 'Bad lower back pain for a week, now numb around the groin and back passage and cannot tell when I am passing urine.',
  });
  const json = flat(card);
  assert.match(card.subtitle, /Emergency/);
  assert.match(json, /duty doctor, now/i);
  assert.match(json, /A&E/);
  assert.doesNotMatch(json, /Hackney Downs PCN/, 'this must not read as an appointment to book');
  assert.doesNotMatch(json, /Pharmacy First/);
});

/* --------------------------------------- the pharmacy card refuses it too */

test('the pharmacy template refuses the same message on its own', () => {
  // The router can pick "pharmacyFirst" directly, so the guard cannot live only
  // in triage.
  const json = flat(pharmacyFirstAnswer({ condition: AS_ROUTED, text: SCIATICA }));
  assert.match(json, /First Contact Physiotherapist/);
  assert.doesNotMatch(json, /Minor illness referral/);
  assert.doesNotMatch(json, /Free medicines/);
});

test('simple backache still goes to the pharmacy, with the FCP as the next step', () => {
  const card = triagePatientAnswer({
    condition: 'back pain',
    text: 'Patient rang about a bit of lower back pain since gardening yesterday, asking what they can take.',
  });
  const json = flat(card);
  assert.match(json, /Community pharmacy \(Pharmacy First\)/);
  assert.match(json, /Minor illness referral/);
  assert.match(json, /FCP new patient/, 'the card must say where it goes if self-care does not settle it');
});

test('a red flag anywhere in the message still wins over the pharmacy lists', () => {
  const json = flat(triagePatientAnswer({
    condition: 'sore throat',
    text: 'Sore throat for two days, and this morning they have chest pain and feel short of breath.',
  }));
  assert.match(json, /duty doctor/i);
  assert.doesNotMatch(json, /Pharmacy First clinical pathway/);
});

/* --------------------------------------------------------- direct fcp asks */

test('asking for physio with no other feature still reaches the FCP card', () => {
  const card = fcpAnswer({ condition: 'knee pain', text: 'Patient wants to see the physio about their knee.' });
  assert.match(card.subtitle, /First Contact Physiotherapist/);
  assert.match(flat(card), /FCP new patient/);
});

test('a joint problem the pharmacy lists do not word the same way goes to the FCP', () => {
  // "knee pain" is not the listed "Knee or lower leg pain", so this used to fall
  // through to the duty doctor.
  const card = triagePatientAnswer({ condition: 'knee pain', text: 'Adult with knee pain for a few weeks.' });
  assert.match(card.subtitle, /First Contact Physiotherapist/);
});
