import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCURX_CHECK_SCHEMA, DESTINATIONS, accurxCheckPrompt, applyRoute, destinationLabel, foldChecks,
  pagesFor, rankOfDestination,
} from '../lib/templates/accurx-route.mjs';
import { accurxAnswer } from '../lib/templates/accurx.mjs';
import { triagePatientAnswer } from '../lib/templates/triage.mjs';
import { resolveRoles, ROLE_KEYS, ROLE_SETTING_KEY } from '../lib/settings.js';

// The message that made this necessary, as it was pasted in. A patient after a
// recent miscarriage: headaches, both legs swollen and painful, shoulder pain,
// dizziness, bloods awaited. It came back as a physiotherapy appointment.
const MISCARRIAGE = [
  'Describe the problem  After Recent miscarriage. Headache: Severe, persistent headaches requiring',
  'daily pain relievers (2 to 3 times a day). Leg Symptoms: Swelling in both legs, accompanied by',
  'pain/aching also pain specifically in the left shoulder Dizziness: Feeling dizzy or lightheaded,',
  'particularly when looking up. Awaiting full blood test from the GP, but symptoms are ongoing and',
  'concerning.  How long have you had this? Since three weeks having legs swellings and pain.',
  'Have you tried anything to help? Pain killers three times a day.',
  'Expectations  Need to get checked up and wants complete blood test.',
].join(' ');

const flat = (blocks, out = []) => {
  for (const b of blocks || []) {
    out.push(b);
    if (b.type === 'expand') flat(b.blocks, out);
  }
  return out;
};
const sentTo = (card) => {
  const panel = flat(card.blocks).find((b) => b.type === 'fields' && b.title === 'Where this goes');
  return panel ? (panel.items.find((i) => i.label === 'Send it to') || {}).value || '' : '';
};
const words = (card) => flat(card.blocks)
  .map((b) => [b.text, b.markdown, (b.items || []).map((i) => (typeof i === 'string' ? i : i.value)).join(' ')].filter(Boolean).join(' '))
  .join(' ');

/* ------------------------------------------------------------- the ladder */

test('every destination the schema offers is one the ladder ranks', () => {
  for (const d of DESTINATIONS) {
    assert.ok(rankOfDestination(d.id) > 0, d.id);
    assert.ok(destinationLabel(d.id), d.id);
  }
  // "unsure" is a real answer and it must rank below everything, so it can
  // never move anything.
  assert.equal(rankOfDestination('unsure'), 0);
  assert.equal(rankOfDestination('somewhere-else'), 0);
});

test('a clinician outranks a pharmacist and a physiotherapist', () => {
  assert.ok(rankOfDestination('emergency') > rankOfDestination('dutyDoctor'));
  assert.ok(rankOfDestination('dutyDoctor') > rankOfDestination('gp'));
  assert.ok(rankOfDestination('gp') > rankOfDestination('fcp'));
  assert.ok(rankOfDestination('fcp') > rankOfDestination('pharmacy'));
});

test('a nurse clinic can never take a message off a doctor', () => {
  for (const clinic of ['nurse', 'diabeticNurse']) {
    assert.ok(rankOfDestination('gp') > rankOfDestination(clinic), clinic);
    for (const floor of ['gp', 'dutyDoctor', 'emergency']) {
      assert.equal(applyRoute(floor, { destination: clinic, evidence: 'Pain killers three times a day' }, MISCARRIAGE).destination, floor);
    }
  }
});

/* -------------------------------------------------------------- the veto */

test('the reading may raise where a message goes', () => {
  const out = applyRoute('fcp', { destination: 'dutyDoctor', evidence: 'Swelling in both legs' }, MISCARRIAGE);
  assert.equal(out.destination, 'dutyDoctor');
  assert.equal(out.raised, true);
  assert.equal(out.because, 'Swelling in both legs');
});

test('the reading may NEVER lower it, however sure it sounds', () => {
  for (const said of ['pharmacy', 'fcp', 'gp', 'minorEyeService']) {
    const out = applyRoute('emergency', { destination: said, evidence: 'symptoms are ongoing' }, MISCARRIAGE);
    assert.equal(out.destination, 'emergency', said + ' must not be able to undo an emergency');
    assert.equal(out.raised, false);
  }
  assert.equal(applyRoute('gp', { destination: 'fcp' }, MISCARRIAGE).destination, 'gp');
  // The same destination is not a raise either.
  assert.equal(applyRoute('fcp', { destination: 'fcp' }, MISCARRIAGE).raised, false);
});

test('a verdict that is missing, unsure or nonsense changes nothing', () => {
  for (const verdict of [null, undefined, {}, { destination: 'unsure' }, { destination: 'A&E' }, { destination: '' }]) {
    const out = applyRoute('fcp', verdict, MISCARRIAGE);
    assert.equal(out.destination, 'fcp');
    assert.equal(out.raised, false);
  }
});

test('a quote that is not in the message is dropped, and the raise still stands', () => {
  const out = applyRoute('fcp', {
    destination: 'dutyDoctor',
    evidence: 'the patient reports a possible clot',
  }, MISCARRIAGE);
  assert.equal(out.destination, 'dutyDoctor', 'an unevidenced escalation still escalates — that is the safe direction');
  assert.equal(out.because, '', 'but it does not get to quote words nobody wrote');
});

test('a quote is matched however the punctuation differs', () => {
  const out = applyRoute('fcp', {
    destination: 'dutyDoctor',
    evidence: 'Swelling in both legs, accompanied by pain',
  }, MISCARRIAGE);
  assert.equal(out.because, 'Swelling in both legs, accompanied by pain');
});

/* ------------------------------------------------------------- the card */

test('the patterns alone still send this message to the physiotherapist', () => {
  // Not a wish — a record. This is the behaviour the reading exists to catch,
  // and if it ever changes on its own this test says so rather than the fix
  // quietly becoming unnecessary and unnoticed.
  const patterns = triagePatientAnswer({ condition: 'headache', text: MISCARRIAGE });
  assert.equal(patterns.destination, 'fcp');
});

test('reading the whole message sends it to a doctor today instead', () => {
  const card = accurxAnswer({
    condition: 'headache',
    text: MISCARRIAGE,
    reason: 'severe persistent headaches 3/7, leg swelling and pain 3/7, dizziness, awaiting bloods',
    route: { destination: 'dutyDoctor', evidence: 'Swelling in both legs', page: '' },
  });
  assert.equal(card.destination, 'dutyDoctor');
  assert.match(sentTo(card), /duty doctor/i);
  assert.ok(!/physiotherapist/i.test(sentTo(card)), 'it must not still say FCP');
  // The card says where the words would have sent it, and what moved it.
  assert.match(words(card), /Swelling in both legs/);
  assert.match(words(card), /First Contact Physiotherapist/, 'the reader is told what the wording alone would have done');
});

test('the reason line and the booking notes survive the raise', () => {
  const card = accurxAnswer({
    condition: 'headache',
    text: MISCARRIAGE,
    reason: 'severe persistent headaches 3/7, leg swelling and pain 3/7',
    booking: ['contact whole day asap'],
    route: { destination: 'dutyDoctor', evidence: 'Swelling in both legs' },
  });
  assert.match(words(card), /severe persistent headaches/);
  assert.match(words(card), /contact whole day asap/);
});

test('a raise to an emergency takes the appointment line off the card', () => {
  const card = accurxAnswer({
    condition: 'headache',
    text: MISCARRIAGE,
    reason: 'severe persistent headaches 3/7, leg swelling and pain 3/7',
    route: { destination: 'emergency', evidence: 'Feeling dizzy or lightheaded' },
  });
  assert.equal(card.destination, 'emergency');
  const fieldsBlocks = flat(card.blocks).filter((b) => b.type === 'fields');
  const copies = fieldsBlocks.flatMap((b) => b.items).filter((i) => i.copy);
  assert.equal(copies.length, 0, 'nobody books anything off an emergency card');
  assert.match(words(card), /handover/i);
});

test('a raise that names the physio renders as the physio, not as a doctor', () => {
  // The floor is a pharmacy referral, so anything above rank 1 is a raise —
  // including the destinations that are not a doctor. The card used to answer
  // every non-emergency raise with "A GP appointment here", which is not where
  // the reading sent it and not what the reader should book.
  const text = 'my throat has been sore since Friday';
  assert.equal(triagePatientAnswer({ condition: 'sore throat', text }).destination, 'pharmacy');

  const card = accurxAnswer({
    condition: 'sore throat',
    text,
    reason: 'sore throat 3/7',
    route: { destination: 'fcp', evidence: 'my throat has been sore since Friday' },
  });
  assert.equal(card.destination, 'fcp');
  assert.match(sentTo(card), /Physiotherapist/);
  assert.ok(!/GP appointment here/i.test(words(card)), 'it must not tell them to book a doctor');
  // And it still says what the wording alone would have done, and what moved it.
  assert.match(words(card), /Community pharmacy/);
  assert.match(words(card), /my throat has been sore since Friday/);
});

test('a raise to a doctor still renders the doctor card', () => {
  for (const [said, expected] of [['gp', /GP appointment here/], ['dutyDoctor', /duty doctor/i]]) {
    const card = accurxAnswer({
      condition: 'sore throat',
      text: 'my throat has been sore since Friday',
      reason: 'sore throat 3/7',
      route: { destination: said, evidence: 'my throat has been sore since Friday' },
    });
    assert.equal(card.destination, said);
    assert.match(sentTo(card), expected);
  }
});

test('with no reading at all the card is exactly what it always was', () => {
  const before = accurxAnswer({ condition: 'back pain', text: 'my back has hurt for a week, ibuprofen has not touched it', reason: 'back pain 1/7, ibuprofen ineffective' });
  const after = accurxAnswer({ condition: 'back pain', text: 'my back has hurt for a week, ibuprofen has not touched it', reason: 'back pain 1/7, ibuprofen ineffective', route: null });
  assert.deepEqual(before, after);
  assert.equal(before.destination, 'fcp');
  assert.ok(!/read as one message/i.test(words(before)), 'no reading, no claim that one happened');
});

test('a reading that agrees with the patterns adds nothing to the card', () => {
  const agreed = accurxAnswer({
    condition: 'back pain',
    text: 'my back has hurt for a week, ibuprofen has not touched it',
    reason: 'back pain 1/7, ibuprofen ineffective',
    route: { destination: 'fcp', evidence: 'ibuprofen has not touched it' },
  });
  const alone = accurxAnswer({
    condition: 'back pain',
    text: 'my back has hurt for a week, ibuprofen has not touched it',
    reason: 'back pain 1/7, ibuprofen ineffective',
  });
  assert.deepEqual(agreed, alone);
});

test('the quote is checked against the WHOLE message, not the routed complaint', () => {
  // The words that move an /accurx are usually in a different complaint from
  // the one the card is about. That is the entire reason for reading it.
  const card = accurxAnswer({
    condition: 'headache',
    text: 'Headache: Severe, persistent headaches requiring daily pain relievers',
    complaint: 'Headache: Severe, persistent headaches requiring daily pain relievers',
    message: MISCARRIAGE,
    reason: 'severe persistent headaches 3/7',
    route: { destination: 'dutyDoctor', evidence: 'After Recent miscarriage' },
  });
  assert.match(words(card), /After Recent miscarriage/);
});

/* ------------------------------------------------------- folding the checks */

const yes = (id, evidence = '', page = '') => ({ id, belongs: 'yes', evidence, page });
const no = (id) => ({ id, belongs: 'no', evidence: '', page: '' });

test('the most senior service that said yes is the one that wins', () => {
  const folded = foldChecks([
    yes('fcp', 'pain specifically in the left shoulder'),
    yes('dutyDoctor', 'Swelling in both legs'),
    yes('gp', 'Awaiting full blood test from the GP'),
    no('pharmacy'),
  ]);
  assert.equal(folded.destination, 'dutyDoctor');
  assert.equal(folded.evidence, 'Swelling in both legs', 'and it is that service’s own quote, not another’s');
});

test('a tie at the same rank goes to the more specific service, in ladder order', () => {
  const shared = [...new Set(DESTINATIONS.map((d) => d.rank))]
    .map((rank) => DESTINATIONS.filter((d) => d.rank === rank))
    .filter((group) => group.length > 1);
  assert.ok(shared.length, 'this test is only meaningful while several services share a rank');
  for (const group of shared) {
    const folded = foldChecks(group.map((d) => yes(d.id)));
    assert.equal(folded.destination, group[0].id, 'the first at that rank, which is the most specific');
  }
});

test('nothing said yes is a real answer, and it changes nothing', () => {
  const folded = foldChecks(DESTINATIONS.map((d) => no(d.id)));
  assert.equal(folded.destination, 'unsure');
  assert.equal(applyRoute('fcp', folded, MISCARRIAGE).raised, false);
});

test('"unsure" from a check counts as a no', () => {
  const folded = foldChecks([{ id: 'dutyDoctor', belongs: 'unsure', evidence: 'Swelling in both legs' }, no('gp')]);
  assert.equal(folded.destination, 'unsure');
});

test('checks that did not come back cost their own vote and nothing else', () => {
  // One timeout, one refusal, one good answer. The good one still stands.
  const folded = foldChecks([null, yes('gp', 'symptoms are ongoing'), null]);
  assert.equal(folded.destination, 'gp');
  // Every one of them failing is the same as never having asked.
  assert.equal(foldChecks([null, null, null]), null);
  assert.equal(foldChecks([]), null);
  assert.equal(applyRoute('fcp', foldChecks([]), MISCARRIAGE).raised, false);
});

test('a yes for a service that is not on the ladder is ignored', () => {
  assert.equal(foldChecks([yes('district-nurse'), yes('pharmacy')]).destination, 'pharmacy');
  assert.equal(foldChecks([yes('district-nurse')]).destination, 'unsure');
});

/* ------------------------------------------------------- the eye A&E */

const CHEMICAL = 'i got bleach in my eye at work this morning and it is really painful';

test('an eye emergency is its own destination, not the general one', () => {
  const card = triagePatientAnswer({ condition: 'chemical eye injury', text: CHEMICAL });
  assert.equal(card.destination, 'eyeEmergency');
  assert.match(sentTo(card), /Moorfields/);
  // The three things reception has to say next: where, that it is open, and
  // that nobody has to arrange anything first.
  assert.match(words(card), /162 City Road/);
  assert.match(words(card), /24 hours/);
  assert.match(words(card), /walk in/i);
});

test('the eye A&E ties with 999 and takes the tie', () => {
  // Everything that reaches an eye A&E is an emergency, so both checks say yes
  // to it. The tie must go to the one that names the hospital — a general A&E
  // is an eye emergency answered twice as slowly.
  assert.equal(rankOfDestination('eyeEmergency'), rankOfDestination('emergency'));
  assert.equal(foldChecks([yes('emergency'), yes('eyeEmergency', 'bleach in my eye')]).destination, 'eyeEmergency');
  // And neither can shove the other sideways once the patterns have chosen.
  assert.equal(applyRoute('emergency', { destination: 'eyeEmergency' }, CHEMICAL).raised, false);
  assert.equal(applyRoute('eyeEmergency', { destination: 'emergency' }, CHEMICAL).raised, false);
});

// On its words alone this is a minor eye service referral: "red", "sore" and
// "watering" are all on the MECS list, and none of the words the cascade reads
// as an eye emergency ("chemical", "bleach", "acid", "burn") is in it. Reading
// it is what notices that decanting drain cleaner is a chemical injury.
const DRAIN_CLEANER = 'my eye is red and sore and watering after i was decanting drain cleaner at work';

const eyeRaise = () => accurxAnswer({
  condition: 'sore eye',
  text: DRAIN_CLEANER,
  reason: 'red sore watering eye after chemical exposure at work',
  route: { destination: 'eyeEmergency', evidence: 'decanting drain cleaner at work' },
});

test('reading a message to the eye A&E renders Moorfields, not the duty doctor', () => {
  assert.equal(triagePatientAnswer({ condition: 'sore eye', text: DRAIN_CLEANER }).destination, 'minorEyeService');

  const card = eyeRaise();
  assert.equal(card.destination, 'eyeEmergency');
  assert.match(sentTo(card), /Moorfields/);
  assert.ok(!/duty doctor now/i.test(sentTo(card)), 'it must not answer an eye emergency with 999');
  assert.match(words(card), /walk in/i);
  assert.match(words(card), /162 City Road/);
  assert.match(words(card), /decanting drain cleaner at work/, 'and it shows what moved it');
});

test('nobody books an appointment off the eye A&E card either', () => {
  const card = eyeRaise();
  assert.match(words(card), /handover/i);
  const copied = flat(card.blocks).filter((b) => b.type === 'fields')
    .flatMap((b) => b.items).filter((i) => i.copy).map((i) => i.value);
  // The one Copy on the card is where the patient is going — which IS the thing
  // that leaves it. The reason line does not get one: there is no appointment.
  assert.deepEqual(copied, [destinationLabel('eyeEmergency')]);
  assert.ok(!copied.some((v) => /eye pain and watering/.test(v)));
});

/* --------------------------------------------------- the nurse signpost */

const SMEAR = 'my smear is due and i also have a sore throat since friday';

test('a nurse clinic that lost still gets named on the card', () => {
  const card = accurxAnswer({
    condition: 'sore throat',
    text: SMEAR,
    reason: 'sore throat 3/7, smear due',
    route: {
      destination: 'pharmacy',
      evidence: '',
      page: '',
      saidYes: [{ id: 'nurse', evidence: 'my smear is due', page: '' }, { id: 'pharmacy', evidence: '', page: '' }],
    },
  });
  // Where it goes is untouched — the patterns said pharmacy and it still does.
  assert.equal(card.destination, 'pharmacy');
  assert.match(words(card), /practice nurse/i);
  assert.match(words(card), /my smear is due/, 'and it shows the words that say so');
  assert.match(words(card), /nothing here has changed it/i);
});

test('the note is never shown beside an answer that means today', () => {
  const nurse = [{ id: 'nurse', evidence: 'Pain killers three times a day', page: '' }];
  for (const destination of ['dutyDoctor', 'emergency']) {
    const card = accurxAnswer({
      condition: 'headache',
      text: MISCARRIAGE,
      reason: 'severe persistent headaches 3/7',
      route: { destination, evidence: 'Swelling in both legs', saidYes: nurse },
    });
    assert.ok(!/practice nurse/i.test(words(card)), destination + ' must not offer a nurse slot');
  }
});

test('a nurse clinic the card IS sending them to is not also suggested', () => {
  const card = accurxAnswer({
    condition: 'sore throat',
    text: SMEAR,
    reason: 'sore throat 3/7, smear due',
    route: {
      destination: 'nurse',
      evidence: 'my smear is due',
      saidYes: [{ id: 'nurse', evidence: 'my smear is due', page: '' }],
    },
  });
  assert.equal(card.destination, 'nurse', 'a pharmacy floor is below a nurse clinic, so this is a raise');
  assert.match(sentTo(card), /practice nurse/i);
  assert.ok(!/does what is being asked for/i.test(words(card)), 'it must not signpost where it is already sending them');
});

test('a nurse quote that is not in the message is dropped, and the note stands', () => {
  const card = accurxAnswer({
    condition: 'sore throat',
    text: SMEAR,
    reason: 'sore throat 3/7',
    route: {
      destination: 'pharmacy',
      saidYes: [{ id: 'nurse', evidence: 'the patient asked for a cervical screening appointment', page: '' }],
    },
  });
  assert.match(words(card), /practice nurse/i);
  assert.ok(!/cervical screening appointment/.test(words(card)), 'it does not get to quote words nobody wrote');
});

test('a reading with no nurse in it leaves the card exactly as it was', () => {
  const withOut = accurxAnswer({ condition: 'sore throat', text: SMEAR, reason: 'sore throat 3/7' });
  const withEmpty = accurxAnswer({
    condition: 'sore throat',
    text: SMEAR,
    reason: 'sore throat 3/7',
    route: { destination: 'unsure', evidence: '', page: '', saidYes: [] },
  });
  assert.deepEqual(withEmpty, withOut);
});

/* ------------------------------------------------------------ the prompt */

test('each check is asked about its own service and is shown no others', () => {
  const fcp = DESTINATIONS.find((d) => d.id === 'fcp');
  const prompt = accurxCheckPrompt({
    destination: fcp,
    question: MISCARRIAGE,
    notebook: '- Physiotherapy (FCP) — how FCP works',
  });
  assert.match(prompt, new RegExp('does this message need ' + fcp.label.replace(/[().]/g, '\\$&'), 'i'));
  assert.match(prompt, /Physiotherapy \(FCP\) — how FCP works/, 'the Notebook goes in beside it');
  assert.match(prompt, /You cannot make anything less urgent/);
  assert.ok(prompt.includes(MISCARRIAGE.slice(0, 60)));
  // The whole point of splitting it up: no weighing against the others, and
  // nothing to defer to.
  for (const other of DESTINATIONS.filter((d) => d.id !== 'fcp')) {
    assert.ok(!prompt.includes(other.label), 'a check must not be shown ' + other.id);
  }
});

test('every destination can be asked, and says what it refuses', () => {
  for (const d of DESTINATIONS) {
    const prompt = accurxCheckPrompt({ destination: d, question: 'my knee hurts' });
    assert.ok(prompt.includes(d.covers), d.id + ' must say what it covers');
    assert.ok(prompt.includes(d.refuses), d.id + ' must say what it will not take');
  }
});

test('a check gets the Notebook pages about its own service and no others', () => {
  const pages = [
    { docTitle: 'Physiotherapy (FCP)', text: 'How the first contact physiotherapist works.' },
    { docTitle: 'Pharmacy First and CPSAS', text: 'What the community pharmacy can treat.' },
    { docTitle: 'Bin collections', text: 'Tuesdays.' },
  ];
  assert.deepEqual(pagesFor('fcp', pages).map((p) => p.docTitle), ['Physiotherapy (FCP)']);
  assert.deepEqual(pagesFor('pharmacy', pages).map((p) => p.docTitle), ['Pharmacy First and CPSAS']);
  // A page is matched on its first line too, not only its title.
  assert.deepEqual(
    pagesFor('fcp', [{ docTitle: 'Knees', text: 'Musculoskeletal problems in adults.' }]).map((p) => p.docTitle),
    ['Knees'],
  );
  assert.deepEqual(pagesFor('somewhere-else', pages), [], 'an unknown service gets nothing');
  assert.deepEqual(pagesFor('fcp', []), []);
});

test('the schema will not accept an answer that is not yes, no or unsure', () => {
  assert.ok(ACCURX_CHECK_SCHEMA.safeParse({ belongs: 'yes' }).success);
  assert.ok(ACCURX_CHECK_SCHEMA.safeParse({ belongs: 'unsure' }).success);
  assert.ok(!ACCURX_CHECK_SCHEMA.safeParse({ belongs: 'maybe' }).success);
  assert.ok(!ACCURX_CHECK_SCHEMA.safeParse({ belongs: 'dutyDoctor' }).success, 'a check names no destination — it was handed one');
  assert.ok(!ACCURX_CHECK_SCHEMA.safeParse({}).success, 'an answer is not optional');
});

/* -------------------------------------------------------------- the role */

test('the accurx role is settable and inherits from fast, not from reasoning', () => {
  assert.ok(ROLE_KEYS.includes('accurx'));
  assert.equal(ROLE_SETTING_KEY.accurx, 'ai_model_accurx');

  const nothing = resolveRoles({ base: 'a/reasoning', stored: {}, env: {} });
  assert.equal(nothing.accurx.model, 'a/reasoning', 'with no fast model set, fast IS the reasoning model');

  const fastSet = resolveRoles({ base: 'a/reasoning', stored: { fast: 'b/fast' }, env: {} });
  assert.equal(fastSet.accurx.model, 'b/fast', 'it follows fast, not the model above it');
  assert.equal(fastSet.accurx.source, 'fast');

  const chosen = resolveRoles({ base: 'a/reasoning', stored: { fast: 'b/fast', accurx: 'c/reader' }, env: {} });
  assert.equal(chosen.accurx.model, 'c/reader');
  assert.equal(chosen.accurx.source, 'database');

  const fromEnv = resolveRoles({ base: 'a/reasoning', stored: { fast: 'b/fast' }, env: { OPENROUTER_ACCURX_MODEL: 'd/env' } });
  assert.equal(fromEnv.accurx.model, 'd/env');
});

test('adding the role left the others exactly where they were', () => {
  const roles = resolveRoles({ base: 'a/reasoning', stored: { fast: 'b/fast', web: 'c/web' }, env: {} });
  assert.equal(roles.reasoning.model, 'a/reasoning');
  assert.equal(roles.fast.model, 'b/fast');
  assert.equal(roles.web.model, 'c/web');
});
