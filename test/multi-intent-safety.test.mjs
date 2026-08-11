import test from 'node:test';
import assert from 'node:assert/strict';
import { bandFindings, safetyScan } from '../lib/safety/scan.mjs';
import { looksMultiIntent } from '../lib/safety/requests.mjs';
import { acuityBandAnswer, confidentialityAnswer, unresolvedPanel } from '../lib/templates/safety.mjs';
import { renderSelection } from '../lib/templates/route.mjs';
import { fcpAnswer, localFeatures, mskFeatures } from '../lib/templates/fcp.mjs';
import { triagePatientAnswer } from '../lib/templates/triage.mjs';
import { RED_FLAGS } from '../lib/safety/redflags.mjs';

// THE MESSAGE THIS WORK EXISTS FOR, near enough verbatim.
//
// Five requests. The reader got one card, about the knee, and that card said
// "Over-the-counter treatment has already been tried and has not worked" —
// which nobody had written about the knee. The regex had matched "hasn't
// shifted", four paragraphs down, describing the patient's VOICE. The other
// four requests, including a hoarse voice with a stone of weight loss on it,
// left no trace on screen at all.
const ECONSULT = `I am 58 and I have a few things to ask about, sorry for the long message.

First, my right knee has been painful for over a year now. I saw the physio last year but it didn't really help and it is no better.

Also, my voice has been hoarse for more than three weeks and it hasn't shifted. I have lost about a stone in weight without trying.

I have run out of my ramipril and the pharmacy says it needs to be reviewed before they will give me any more.

I also need a fit note for the two weeks I had off work earlier this month, backdated.

And finally, can you check my wife's blood results while you are there? She's registered with you too.`;

// What the model returns for it: the message cut into its separate asks, each
// span copied out of the message word for word.
const REQUESTS = [
  { text: "my right knee has been painful for over a year now. I saw the physio last year but it didn't really help and it is no better", gist: 'knee pain' },
  { text: "my voice has been hoarse for more than three weeks and it hasn't shifted. I have lost about a stone in weight without trying", gist: 'hoarse voice and weight loss' },
  { text: 'I have run out of my ramipril and the pharmacy says it needs to be reviewed before they will give me any more', gist: 'repeat ramipril' },
  { text: 'I also need a fit note for the two weeks I had off work earlier this month, backdated', gist: 'fit note' },
  { text: "can you check my wife's blood results while you are there? She's registered with you too", gist: "wife's blood results" },
];

const scan = () => safetyScan({ message: ECONSULT, requests: REQUESTS });
const flat = (card) => JSON.stringify(card);
const itemFor = (panel, id) => panel.items.find((i) => i.id === id);

/* ------------------------------------------------ 1. nothing vanishes */

test('all five requests are decomposed and all five reach the panel', () => {
  const s = scan();
  assert.equal(s.items.length, 5);
  assert.ok(s.items.every((item) => item.verbatim), 'every span must be findable in the message');

  const panel = unresolvedPanel(s);
  assert.ok(panel, 'a five-request message gets a panel');
  assert.equal(panel.items.length, 5);
  for (const id of ['r1', 'r2', 'r3', 'r4', 'r5']) {
    assert.ok(itemFor(panel, id), 'request ' + id + ' is listed');
  }
  // Every one carries what happened to it. "Listed but unmarked" is the state
  // this panel exists to make impossible.
  assert.ok(panel.items.every((item) => item.statusLabel));
});

/* --------------------------------- 2. the item that mattered clinically */

test('the hoarse voice with weight loss is flagged as a suspected cancer pathway', () => {
  const s = scan();
  const voice = s.items.find((item) => item.id === 'r2');
  assert.equal(voice.acuity, 'twoWeekWait');
  assert.equal(voice.status, 'flagged');

  const panel = unresolvedPanel(s);
  assert.equal(itemFor(panel, 'r2').acuityLabel, 'Suspected cancer pathway');

  // And it is said above the card, not only in the list beside it.
  const band = acuityBandAnswer(bandFindings(s, { cardScans: true }).acuity, { age: s.age });
  const json = flat(band);
  assert.match(json, /suspected cancer pathway referral/i);
  assert.match(json, /hoarse voice lasting three weeks or more/i);
  assert.match(json, /weight loss that was not intended/i);
  assert.match(json, /duty doctor/i);
  // A clinician decides the referral. This band never does.
  assert.match(json, /clinical decision, not a booking one/i);
});

test('the card is the knee, and it is not the first or the longest item', () => {
  const s = scan();
  // The band answers the two-week-wait item; the card takes the most urgent
  // thing the band has not already dealt with.
  assert.equal(s.routed.id, 'r1');
  assert.equal(s.routed.gist, 'knee pain');
  assert.equal(unresolvedPanel(s).items[0].id, 'r2', 'the panel still leads with the most urgent');
});

/* ----------------------- 3. the sentence nobody wrote about the knee */

test('the knee card does not claim over-the-counter treatment was tried', () => {
  const s = scan();
  const card = fcpAnswer({ condition: 'knee pain', text: s.complaint, complaint: s.complaint });
  assert.doesNotMatch(flat(card), /Over-the-counter treatment has already been tried/);
  // It is still an FCP card, and still says why.
  assert.match(card.subtitle, /First Contact Physiotherapist/);
  assert.match(flat(card), /FCP new patient/);
});

test('an assertion is dropped when its evidence lies in another complaint', () => {
  // The ONLY words that make self-care look failed are in the second complaint.
  const message = 'My shoulder has been aching since Tuesday. Separately my cough has not shifted despite the maximum dose of the linctus from the chemist.';
  const shoulder = 'My shoulder has been aching since Tuesday';

  const wide = mskFeatures(message);
  assert.ok(wide.otcTried, 'read message-wide, the evidence is there — and it is about the cough');

  const local = localFeatures(wide, shoulder);
  assert.ok(!local.selfcareFailed, 'the words are outside the shoulder complaint');
  assert.ok(!local.otcTried);

  // And the card falls back to the neutral wording rather than to a claim.
  const bound = fcpAnswer({ condition: 'shoulder pain', text: message, complaint: shoulder });
  assert.doesNotMatch(flat(bound), /Over-the-counter treatment has already been tried/);
  const unbound = fcpAnswer({ condition: 'shoulder pain', text: message });
  assert.match(flat(unbound), /Over-the-counter treatment has already been tried/,
    'without a complaint span the old reach is exactly what it was — which is the bug');
});

/* ------------------------------------- 4. the request about somebody else */

test('the wife’s results are refused, and the refusal is not a routing decision', () => {
  const s = scan();
  assert.equal(s.items.find((item) => item.id === 'r5').status, 'refused');
  assert.equal(unresolvedPanel(s).items.find((i) => i.id === 'r5').statusLabel, 'Refused');

  const card = confidentialityAnswer(bandFindings(s, { cardScans: true }).confidentiality);
  const json = flat(card);
  assert.match(json, /somebody else/i);
  assert.match(json, /Do not look at, discuss, read out or send another person’s record/);
  assert.match(json, /being registered here is not consent/i);
  assert.match(json, /practice manager/i);
  // The rest of the message is still answered. Refusing one item is not a
  // reason to abandon the other four.
  assert.match(json, /Answer the rest of the message normally/i);
});

test('the confidentiality rule is never suppressed by the card below it', () => {
  const s = scan();
  // Even when the card runs the full triage net over its own text, no card
  // refuses a third-party request, so there is nothing to duplicate.
  assert.equal(bandFindings(s, { cardScans: true }).confidentiality.length > 0, true);
  assert.equal(bandFindings(s, { cardScans: false }).confidentiality.length > 0, true);
});

/* ---------------------------------------------- 5. the admin items */

test('the ramipril and the fit note are listed as admin, and are unhandled', () => {
  const panel = unresolvedPanel(scan());
  for (const id of ['r3', 'r4']) {
    const item = itemFor(panel, id);
    assert.equal(item.acuity, 'admin');
    assert.equal(item.status, 'unhandled');
    assert.equal(item.statusLabel, 'Not answered');
    assert.ok(item.askable, 'an unanswered item is one press away from being answered');
  }
  assert.equal(panel.open, 2);
});

/* ------------------------------- 6. a short question is untouched */

test('a short single question is not decomposed and gets no panel', () => {
  const question = 'how do I refer for an ECG';
  assert.ok(!looksMultiIntent(question), 'the gate stays shut, so no extra tokens are spent');

  const s = safetyScan({ message: question });
  assert.equal(s.decomposed, false);
  assert.equal(s.complaint, '', 'nothing to narrow to, so nothing is narrowed');
  assert.equal(unresolvedPanel(s), null);
  assert.deepEqual(bandFindings(s, { cardScans: false }), { acuity: [], confidentiality: [] });
});

test('a card with no complaint span is byte-identical to the card built before any of this', () => {
  const question = 'pt has a sore throat since Friday, no fever';
  const selection = { template: 'triage', condition: 'sore throat' };
  assert.deepEqual(
    renderSelection(selection, question, []),
    triagePatientAnswer({ condition: 'sore throat', text: question }),
  );
});

/* ------------------------ 7. the rules that were already right */

test('the red flag list is the same list, word for word', () => {
  // Moved to lib/safety because it now runs on every turn rather than only
  // inside triage. Moved, not rewritten — this is the guard on that.
  assert.equal(
    RED_FLAGS.source,
    '\\b(chest pain|short(?:ness)? of breath|breathless|difficulty breathing|stroke|face drooping|severe bleed\\w*|haemorrhage|collaps\\w+|unconscious|anaphyla\\w+|sepsis|septic|seizure|suicid\\w+|overdose|head injury|severe abdominal pain|meningitis|non.?blanching|blood in (?:stool|vomit|urine)|coughing up blood)\\b',
  );
});

test('cauda equina behaviour is unchanged, including the saddle wording', () => {
  const card = triagePatientAnswer({
    condition: 'back pain',
    text: 'Bad lower back pain for a week, now numb around the groin and back passage and cannot tell when I am passing urine.',
  });
  const json = flat(card);
  assert.match(card.subtitle, /Emergency/);
  assert.match(json, /duty doctor, now/i);
  assert.match(json, /A&E/);
  assert.match(json, /bladder or bowel changes, numbness around the groin or back passage, or symptoms in both legs/);
  assert.doesNotMatch(json, /Hackney Downs PCN/);
  assert.doesNotMatch(json, /Pharmacy First/);

  // And the saddle wording on the checklist the FCP card asks before booking,
  // which is where it lives.
  const checks = flat(fcpAnswer({ condition: 'knee pain', text: 'Adult with knee pain for a few weeks.' }));
  assert.match(checks, /the area that would touch a saddle/i);
});

test('a red flag anywhere in a multi-intent message still reaches the band', () => {
  const message = 'Can you sort a fit note for last week please. Also I have had chest pain since this morning and I am short of breath.';
  const s = safetyScan({
    message,
    requests: [
      { text: 'Can you sort a fit note for last week please', gist: 'fit note' },
      { text: 'I have had chest pain since this morning and I am short of breath', gist: 'chest pain' },
    ],
  });
  const chest = s.items.find((item) => item.id === 'r2');
  assert.equal(chest.acuity, 'emergency');
  assert.equal(chest.status, 'flagged');

  // The card here is a fit note, which runs no triage net of its own — so the
  // finding has to be said above it or it is said nowhere.
  const band = acuityBandAnswer(bandFindings(s, { cardScans: false }).acuity);
  assert.match(flat(band), /999/);
  assert.match(flat(band), /Interrupt the \*\*duty doctor\*\* now/);
});

test('a finding inside the routed complaint is not repeated above the card', () => {
  // One complaint, one card, and the triage card already escalates it. Saying
  // it twice on one screen is how a band becomes wallpaper.
  const message = 'Patient rang, they have chest pain and feel short of breath.';
  const s = safetyScan({ message });
  assert.equal(bandFindings(s, { cardScans: true }).acuity.length, 0);
  assert.ok(bandFindings(s, { cardScans: false }).acuity.length > 0);
});
