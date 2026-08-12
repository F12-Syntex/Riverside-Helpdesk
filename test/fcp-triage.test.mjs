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

/* ------------------------------------------------- injuries, in plain words */

// The second message that produced a wrong answer, near enough verbatim. It
// reached the reader as "Not on a pharmacy list — send it to the duty doctor",
// because not one word of it matched: "ribs" was not on the region list at all,
// and "hands are still hurting" missed a list that carries "hand pain" with the
// part and the word "pain" welded together.
const BIKE_FALL = `I fell from my bike this Sunday, but my ribs and hands are still hurting. Despite swelling going down, and despite taking pain medication.
How long have you had this? Is it getting better or worse? Since Sunday. Gotten better but the pain still present.
Have you tried anything to help? Yes ice compress, pain medication, and hand wrap.
Expectations: See what else can be done or if I need further investigation.`;

test('a part that is hurting counts, not only a part in front of the word "pain"', () => {
  const f = mskFeatures(BIKE_FALL);
  assert.ok(f.msk, 'ribs and hands that are hurting are musculoskeletal');
  assert.ok(f.injury, 'coming off a bike is a mechanism of injury');
  assert.ok(!f.caudaEquina && !f.nerveRoot);
});

test('the bike fall reaches the FCP instead of the duty doctor', () => {
  const card = triagePatientAnswer({ condition: 'rib and hand pain after a fall', text: BIKE_FALL });
  const json = flat(card);
  assert.match(card.subtitle, /First Contact Physiotherapist/);
  assert.match(json, /FCP new patient/);
  assert.doesNotMatch(json, /Not on a pharmacy list/);
});

test('it reaches the FCP however badly the router names the condition', () => {
  // The card is titled from `condition` and DECIDED from `text`. This message
  // was routed under the label "medication use", which contains no body part at
  // all — the guards have to survive that.
  const card = triagePatientAnswer({ condition: 'medication use', text: BIKE_FALL });
  assert.match(card.subtitle, /First Contact Physiotherapist/);
});

test('a recent injury carries the caution that a long-standing ache does not', () => {
  const fresh = flat(triagePatientAnswer({ condition: 'rib and hand pain', text: BIKE_FALL }));
  assert.match(fresh, /recent injury/i);
  assert.match(fresh, /put weight on it|out of shape/i);
  assert.match(fresh, /duty doctor/i);

  const old = flat(triagePatientAnswer({ condition: 'knee pain', text: 'Adult with knee pain for a few weeks.' }));
  assert.doesNotMatch(old, /recent injury/i, 'nothing was injured, so nothing should say so');
});

test('a mechanism of injury does not on its own make a message musculoskeletal', () => {
  // The safety half of the same change. A fall names no body part here, and a
  // head injury must never become a physio appointment.
  const f = mskFeatures('Came off his bike this morning and banged his head, feels dizzy.');
  assert.ok(f.injury, 'the fall is read');
  assert.ok(!f.msk, 'but a head is not on the musculoskeletal list');
  const card = triagePatientAnswer({
    condition: 'fall from bike',
    text: 'Came off his bike this morning and banged his head, feels dizzy.',
  });
  assert.doesNotMatch(flat(card), /FCP new patient/, 'this must not read as a physio appointment');
});

test('an injury does not jump the pharmacy check', () => {
  // "Soft tissue injury" is one of the 24 CPSAS conditions. A mechanism of
  // injury must not divert something the pharmacy is funded to handle.
  const card = triagePatientAnswer({
    condition: 'soft tissue injury',
    text: 'Soft tissue injury to the calf after football, asking what they can take.',
  });
  assert.match(flat(card), /Community pharmacy \(Pharmacy First\)/);
});

test('a part and a symptom only count inside the same sentence', () => {
  // "back" is deliberately not a body part: it is a telephone instruction more
  // often than a spine. This must stay a sore throat.
  const f = mskFeatures('Sore throat for two days. Please ring me back this afternoon.');
  assert.ok(!f.msk);
});
