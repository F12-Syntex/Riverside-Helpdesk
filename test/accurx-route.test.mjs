import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCURX_READ_SCHEMA, DESTINATIONS, accurxReadPrompt, applyRoute, destinationLabel,
  rankOfDestination, readingVerdict, signpostsFrom,
} from '../lib/templates/accurx-route.mjs';
import { accurxAnswer } from '../lib/templates/accurx.mjs';
import { triagePatientAnswer } from '../lib/templates/triage.mjs';
import { resolveRoles, ROLE_KEYS, ROLE_SETTING_KEY } from '../lib/settings.js';
import { CONTINUITY_RULES } from '../lib/templates/writing.mjs';

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
  // Nothing says "the patterns would have sent this to the physio" any more,
  // because the patterns no longer send anything anywhere on this path.
  assert.doesNotMatch(sentTo(card), /Physiotherapist/, 'and the physio is not where it goes');
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
  // And it still quotes what decided it. What it no longer does is report a
  // pattern answer, because there is no longer a pattern answer to report.
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

test('with no reading at all, the card says so and goes to the duty doctor', () => {
  // There is no pattern cascade underneath to fall back on. The practice's own
  // rule covers it — what cannot be placed is the duty doctor's — and the card
  // says that is why, rather than implying anything was assessed.
  const card = accurxAnswer({ condition: 'sore throat', text: 'sore throat since friday', reason: 'sore throat 3/7' });
  assert.equal(card.destination, 'dutyDoctor');
  assert.match(words(card), /could not be read/i);
  assert.match(words(card), /not because anything about it was assessed/i);
});

test('an unsure reading is the same as no reading', () => {
  // "unsure" is a real answer and it means the reading declined to place it, so
  // it lands where anything unplaceable lands.
  const card = accurxAnswer({
    condition: 'sore throat',
    text: 'sore throat since friday',
    reason: 'sore throat 3/7',
    route: { destination: 'unsure', evidence: '' },
  });
  assert.equal(card.destination, 'dutyDoctor');
  assert.match(words(card), /could not be read/i);
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

/* ------------------------------------------------- what the one call said */

// The reading is ONE call now, so there is nothing to fold: the schema returns
// the destination itself. What is left to check is the adapter between what that
// call returns and what applyRoute and signpostsFrom already took — and, above
// all, that a reading which cannot be trusted still means "leave it alone".

test('a destination the reader named is carried through as it stands', () => {
  const verdict = readingVerdict({
    destination: 'dutyDoctor',
    evidence: 'Swelling in both legs',
  });
  assert.equal(verdict.destination, 'dutyDoctor');
  assert.equal(verdict.evidence, 'Swelling in both legs');
  assert.equal(applyRoute('fcp', verdict, MISCARRIAGE).raised, true);
});

// The reading is shown the routing guide and nothing else, so there is no page
// it could have relied on. A model that names one anyway — out of habit, or
// from a Notebook it can no longer see — must not get that title through, where
// it would read as a source somebody could go and check.
test('a page the reader names is dropped: it was shown no pages', () => {
  const verdict = readingVerdict({
    destination: 'dutyDoctor',
    evidence: 'Swelling in both legs',
    page: 'Triaging notebook',
  });
  assert.equal(verdict.page, '');
});

test('"unsure" is a real answer, and it changes nothing', () => {
  const verdict = readingVerdict({ destination: 'unsure', evidence: '' });
  assert.equal(verdict.destination, 'unsure');
  assert.equal(applyRoute('fcp', verdict, MISCARRIAGE).raised, false);
});

test('a destination that is not on the ladder is the same as no answer', () => {
  // The enum stops the model returning one, but these values also arrive from
  // renderCommand's fallback path and from anything a later caller hands in. An
  // id nothing can rank must never raise a card.
  const verdict = readingVerdict({ destination: 'district-nurse', evidence: 'x' });
  assert.equal(verdict.destination, 'unsure');
  assert.equal(applyRoute('fcp', verdict, MISCARRIAGE).raised, false);
});

test('a reading that did not happen is null, not a verdict', () => {
  // The call failed, or the command was not /accurx. applyRoute treats null as
  // never having asked, which is what it is.
  assert.equal(readingVerdict(null), null);
  assert.equal(readingVerdict({}), null);
  assert.equal(readingVerdict({ destination: '' }), null);
  assert.equal(readingVerdict('dutyDoctor'), null);
  assert.equal(applyRoute('fcp', readingVerdict(null), MISCARRIAGE).raised, false);
});

test('the nurse clinics come back for the note, whatever the destination was', () => {
  const verdict = readingVerdict({
    destination: 'dutyDoctor',
    evidence: 'Swelling in both legs',
    nurseClinics: [{ id: 'nurse', evidence: 'my smear is due' }],
  });
  assert.deepEqual(verdict.saidYes.map((s) => s.id), ['nurse']);
  assert.equal(verdict.saidYes[0].evidence, 'my smear is due');
});

test('a nurse clinic that is not one is dropped', () => {
  const verdict = readingVerdict({
    destination: 'gp',
    nurseClinics: [{ id: 'made-up' }, { id: 'diabeticNurse', evidence: 'my diabetic review is due' }],
  });
  assert.deepEqual(verdict.saidYes.map((s) => s.id), ['diabeticNurse']);
  assert.equal(readingVerdict({ destination: 'gp' }).saidYes.length, 0);
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
  // The reader names one destination now rather than voting for several, so the
  // tie is kept where it can still be got wrong: the ladder's own order, which
  // is what the prompt is written from and what a fold would have used.
  const ids = DESTINATIONS.map((d) => d.id);
  assert.ok(ids.indexOf('eyeEmergency') < ids.indexOf('emergency'), 'the specific one is offered first');
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

/* ------------------------------------------------------------------------ *
 * THE EAR THAT WENT TO A PHARMACY.
 *
 * "Ongoing issue with ear infections the past 3-4 months … pain and aching now
 * at a high level … tried ear drops previously … see GP for inspection and
 * medication" came back as "Acute otitis media — Pharmacy First", on a card
 * that printed the pathway's age range of 1 to 17 underneath it.
 *
 * The patterns did what they say: "ear infection" is on the pharmacy list. What
 * was missing was any obligation to say WHY — and every one of the three things
 * that made it wrong (the months, the treatment already tried, the request to
 * be looked at) is in the message and in none of the keywords.
 * ------------------------------------------------------------------------ */

const EAR = [
  'Describe the problem Ongoing issue with ear inflections / issue the past 3-4 months Full feeling',
  'Pain & aching (now at a high level) Both ears, but at different times.',
  'How long have you had this? Is it getting better or worse? 2 months Ongoing past few years.',
  'Have you tried anything to help? Ear drops previously.',
  'Is there anything you are particularly worried about? Yes infection and ongoing care.',
  'Expectations See GP for inspection and medication / care advice.',
].join(' ');

test('the patterns alone still send this ear to a pharmacy', () => {
  // A record, not a wish. This is what the reading exists to catch, and if it
  // ever changes on its own this says so rather than the fix quietly becoming
  // unnecessary and unnoticed.
  assert.equal(triagePatientAnswer({ condition: 'ear infection', text: EAR }).destination, 'pharmacy');
});

test('a reading that reasons about it moves the ear to a doctor', () => {
  const card = accurxAnswer({
    condition: 'recurrent ear pain',
    text: EAR,
    message: EAR,
    reason: 'recurrent ear pain 3-4/12, ear drops tried, req inspection',
    route: {
      destination: 'gp',
      evidence: 'Ear drops previously',
      reasoning: 'Months of recurrent pain in both ears, drops already tried without settling it, and the patient is asking for it to be looked at. A pharmacist cannot examine an ear or review ongoing care.',
      ruledOut: [{ id: 'pharmacy', label: 'Community pharmacy (Pharmacy First)', why: 'The otitis media pathway is for 1 to 17 and covers a new episode, not months of it after treatment has failed.' }],
    },
  });
  assert.equal(card.destination, 'gp');
  assert.ok(!/Pharmacy First/.test(sentTo(card)), 'it must not still say pharmacy');
});

test('the card carries the reasoning, and what it turned down', () => {
  const card = accurxAnswer({
    condition: 'recurrent ear pain',
    text: EAR,
    message: EAR,
    reason: 'recurrent ear pain 3-4/12',
    route: {
      destination: 'gp',
      evidence: 'Ear drops previously',
      reasoning: 'Months of recurrent pain, drops already tried, and the patient is asking for an examination.',
      ruledOut: [{ id: 'pharmacy', label: 'Community pharmacy (Pharmacy First)', why: 'Outside the pathway’s age range and past what self-care can settle.' }],
    },
  });
  const text = words(card);
  assert.match(text, /Months of recurrent pain/, 'the account of the decision is on the card');
  assert.match(text, /Outside the pathway’s age range/, 'and so is the service it turned down');
  assert.match(text, /route it yourself/, 'with the reminder that reception can overrule it');
});

test('the reasoning shows even when the reading agreed with the patterns', () => {
  // "Why is this the pharmacy's?" is asked at the desk about the cards that were
  // right, too. A justification that only appears when something moved is a
  // justification for the reading, not for the answer.
  const card = accurxAnswer({
    condition: 'sore throat',
    text: 'sore throat since friday, no fever',
    message: 'sore throat since friday, no fever',
    reason: 'sore throat 3/7, no fever',
    route: {
      destination: 'pharmacy',
      evidence: 'sore throat since friday',
      reasoning: 'Three days, nothing tried yet, no fever, and the sore throat pathway takes 5 and over.',
      ruledOut: [],
    },
  });
  assert.equal(card.destination, 'pharmacy');
  assert.match(words(card), /Three days, nothing tried yet/);
});

/* ------------------------------------------------------------ the prompt */

test('the one call is shown the whole ladder, both halves of every entry', () => {
  const prompt = accurxReadPrompt({ question: MISCARRIAGE });
  for (const d of DESTINATIONS) {
    assert.ok(prompt.includes(d.label), d.id + ' is on the ladder');
    assert.ok(prompt.includes(d.covers), d.id + ' says what it covers');
    // `refuses` is the half that does the work: a reader told only what a
    // service covers says yes to anything adjacent to it.
    assert.ok(prompt.includes(d.refuses), d.id + ' says what it will not take');
  }
  assert.ok(prompt.includes(MISCARRIAGE.slice(0, 60)), 'and the message itself');
});

// THE GUIDE IS THE ONLY SOURCE, and the prompt has to say so rather than merely
// omit everything else — a reader that is shown one ladder and told nothing
// about its standing will still reach for what it knows about the NHS at large.
test('the ladder is named as the only source, and no Notebook goes in with it', () => {
  const prompt = accurxReadPrompt({ question: MISCARRIAGE });
  assert.ok(/routing guide/i.test(prompt), 'the ladder is named as the practice’s routing guide');
  assert.ok(/only thing you know about this practice/i.test(prompt), 'and as the only thing it knows');
  assert.ok(!/notebook/i.test(prompt), 'the Notebook is not mentioned, offered or asked about');
});

// The lengths are the latency. Every one of these fields is emitted before the
// receptionist sees anything, so a prompt that stops asking for short answers is
// a prompt that has quietly got slower.
test('the prompt asks for short answers, and says why', () => {
  const prompt = accurxReadPrompt({ question: MISCARRIAGE });
  assert.ok(/ANSWER SHORT/.test(prompt), 'brevity is stated up front');
  assert.ok(/ONE sentence, 30 words at most/.test(prompt), 'the reasoning is capped where it is asked for');
});

test('the ladder is written least senior first', () => {
  const prompt = accurxReadPrompt({ question: 'pt has sore throat' });
  const at = (id) => prompt.indexOf(DESTINATIONS.find((d) => d.id === id).label);
  assert.ok(at('pharmacy') < at('gp'), 'a pharmacy is read before a doctor');
  assert.ok(at('gp') < at('dutyDoctor'));
  assert.ok(at('dutyDoctor') < at('emergency'));
});

test('the wording rules go in as two lists, and stay apart', () => {
  const prompt = accurxReadPrompt({
    question: 'heartburn for 3 weeks, best to call after 2pm',
    reasonRules: ['clinical shorthand only'],
    bookingRules: ['when they can attend'],
  });
  assert.match(prompt, /- clinical shorthand only/);
  assert.match(prompt, /- when they can attend/);
  assert.ok(prompt.includes('NEVER in "reason" and NEVER in "condition"'));
});

test('the reader is told it decides nothing about urgency', () => {
  const prompt = accurxReadPrompt({ question: 'pt has sore throat' });
  assert.match(prompt, /Urgency is decided in code/);
  assert.match(prompt, /NOT writing the answer/);
});

/* ------------------------------------------------------------------------ *
 * THE "pt has sore throat" REGRESSION.
 *
 * A sore throat came back as a GP appointment. Nothing was broken in the
 * patterns — they said pharmacy, and still do. The reader was asked which
 * service the message NEEDS, and a GP genuinely can see a sore throat, so the
 * most senior yes turned an agreement into an escalation.
 *
 * The fix is in the question, not in the number of calls, which is why these
 * outlived the fan-out they were written for: the reader is asked for the LEAST
 * senior service that can safely deal with the message. It is the kind of thing
 * that gets "simplified" back out by somebody tidying a long prompt.
 * ------------------------------------------------------------------------ */

test('the question asked is the least senior service, not the one that could', () => {
  const prompt = accurxReadPrompt({ question: 'pt has sore throat' });
  assert.match(prompt, /LEAST SENIOR service/);
  assert.match(prompt, /not the same question as which service could see it/i);
  assert.match(prompt, /A sore throat is the pharmacy’s/, 'the case that broke it is the worked example');
});

test('the GP entry itself says it is not the safe default', () => {
  // A GP appointment reads like the safe answer for anything clinical, and here
  // it is the opposite: naming one takes the patient off the service that would
  // have dealt with them.
  const gp = DESTINATIONS.find((d) => d.id === 'gp');
  assert.match(gp.refuses, /NOT the safe default/);
  assert.ok(accurxReadPrompt({ question: 'pt has sore throat' }).includes(gp.refuses));
});

test('the schema will not take a destination the ladder does not have', () => {
  const ok = ACCURX_READ_SCHEMA.safeParse({ destination: 'pharmacy' });
  assert.equal(ok.success, true);
  assert.equal(ACCURX_READ_SCHEMA.safeParse({ destination: 'district-nurse' }).success, false);
  // Every id on the ladder is offerable, and so is "unsure".
  for (const d of DESTINATIONS) {
    assert.equal(ACCURX_READ_SCHEMA.safeParse({ destination: d.id }).success, true, d.id);
  }
  assert.equal(ACCURX_READ_SCHEMA.safeParse({ destination: 'unsure' }).success, true);
});

test('the one call returns the wording as well as the destination', () => {
  const parsed = ACCURX_READ_SCHEMA.parse({
    destination: 'pharmacy',
    evidence: 'sore throat since friday',
    condition: 'sore throat',
    reason: 'sore throat 3/7, no fever',
    booking: ['telephone after 2pm'],
  });
  assert.equal(parsed.condition, 'sore throat');
  assert.equal(parsed.reason, 'sore throat 3/7, no fever');
  assert.deepEqual(parsed.booking, ['telephone after 2pm']);
  assert.deepEqual(parsed.details, [], 'and the lists default to empty rather than missing');
  assert.deepEqual(parsed.nurseClinics, []);
});

/* ------------------------------------- has it already been dealt with, and by whom */

const KNEE = 'My knee is playing up again. I saw Dr Okafor about it in July, she gave me '
  + 'exercises and said to come back if it did not settle. It has not settled.';

const seenPanel = (card) => flat(card.blocks)
  .find((b) => b.type === 'fields' && String(b.title).startsWith('Already been dealt with')) || null;
const rowOf = (panel, label) => ((panel && panel.items) || []).find((i) => i.label === label) || null;

test('the reading is asked whether somebody has already dealt with this', () => {
  // The third question the card asks, after where it goes and what the line
  // says: who the appointment should be WITH. It is asked of the same call and
  // the rules it is asked under are the ones the card discloses.
  const prompt = accurxReadPrompt({ question: KNEE, continuityRules: CONTINUITY_RULES });
  assert.match(prompt, /HAS IT BEEN DEALT WITH BEFORE/);
  for (const rule of CONTINUITY_RULES) assert.ok(prompt.includes(rule), rule.slice(0, 40));
  // And it may not answer the routing question a second time.
  assert.match(prompt, /Do not let it move the destination/);
});

test('what the reading said about earlier contact survives into the verdict', () => {
  const verdict = readingVerdict({
    destination: 'fcp',
    seenBefore: {
      who: 'Dr Okafor', when: 'in July', what: 'given exercises, told to come back',
      here: true, evidence: 'I saw Dr Okafor about it in July',
    },
  });
  assert.deepEqual(verdict.seenBefore, {
    who: 'Dr Okafor',
    when: 'in July',
    what: 'given exercises, told to come back',
    here: true,
    evidence: 'I saw Dr Okafor about it in July',
  });
  // A reading that said nothing about it says nothing about it. Every value is
  // still present, so nothing downstream has to guess at the shape.
  assert.deepEqual(readingVerdict({ destination: 'fcp' }).seenBefore, {
    who: '', when: '', what: '', here: false, evidence: '',
  });
});

test('the card names who dealt with it, and says to book it back with them', () => {
  const card = accurxAnswer({
    condition: 'knee pain', text: KNEE, reason: 'knee pain recurring, exercises not settled',
    route: readingVerdict({
      destination: 'fcp',
      seenBefore: {
        who: 'Dr Okafor', when: 'in July', what: 'given exercises, told to come back',
        here: true, evidence: 'I saw Dr Okafor about it in July',
      },
    }),
  });
  const panel = seenPanel(card);
  assert.ok(panel, 'the panel is on the card');
  assert.equal(rowOf(panel, 'Dealt with before').value, 'Dr Okafor — in July');
  assert.match(rowOf(panel, 'Book with').value, /Dr Okafor/);
  assert.match(words(card), /I saw Dr Okafor about it in July/, 'quoted from the message');
  // AND IT HAS NOT ROUTED ANYTHING. Where it goes is still what the reading
  // named; a follow-up about the same knee goes to the same service, it just
  // goes to the person who saw the knee.
  assert.equal(sentTo(card), destinationLabel('fcp'));
});

test('nothing found is silence, not a finding', () => {
  // The rule the booking notes learned the hard way. "Nothing says this has been
  // dealt with before" reads as a negative somebody established, under a card
  // where the model was simply told to leave the field empty.
  const card = accurxAnswer({
    condition: 'sore throat', text: 'sore throat since friday', reason: 'sore throat 3/7',
    route: readingVerdict({ destination: 'pharmacy' }),
  });
  assert.equal(seenPanel(card), null);
  assert.doesNotMatch(words(card), /dealt with before/i);
});

test('a quote the message does not contain is dropped, and the panel stands', () => {
  // Exactly what applyRoute does with an escalation it cannot evidence: the
  // finding survives, the sentence claiming the patient wrote something they
  // did not does not.
  const card = accurxAnswer({
    condition: 'rash', text: 'rash again, i was seen about it last month', reason: 'rash recurring',
    route: readingVerdict({
      destination: 'gp',
      seenBefore: { who: '', when: 'last month', what: '', here: true, evidence: 'I saw Dr Nobody in March' },
    }),
  });
  const panel = seenPanel(card);
  assert.ok(panel);
  assert.equal(rowOf(panel, 'Dealt with before').value, 'not said who — last month');
  assert.match(rowOf(panel, 'Book with').value, /check the record/);
  assert.doesNotMatch(words(card), /Dr Nobody/, 'the unprovable quote never reaches the reader');
});

test('nobody books off an emergency card, and nobody books elsewhere either', () => {
  // Two cards that must not carry a "Book with" row, for two different reasons:
  // one because there is no appointment, one because the earlier contact was not
  // this practice's to book against.
  const urgent = accurxAnswer({
    condition: 'chest pain',
    text: 'Crushing chest pain since this morning. I saw Dr Okafor about chest pain in July.',
    reason: 'chest pain since this morning',
    route: readingVerdict({
      destination: 'dutyInterrupt',
      seenBefore: { who: 'Dr Okafor', when: 'in July', what: 'ecg done', here: true, evidence: 'I saw Dr Okafor about chest pain in July' },
    }),
  });
  const onTheDay = seenPanel(urgent);
  assert.ok(onTheDay);
  assert.match(onTheDay.title, /handover/, 'named for what it now is');
  assert.equal(rowOf(onTheDay, 'Book with'), null);

  const elsewhere = accurxAnswer({
    condition: 'ankle pain',
    text: 'Ankle again. The hospital saw it in June and said come back to my GP if sore.',
    reason: 'ankle pain recurring',
    route: readingVerdict({
      destination: 'gp',
      seenBefore: { who: 'the hospital', when: 'in June', what: 'told to see GP if sore', here: false, evidence: 'The hospital saw it in June' },
    }),
  });
  const outside = seenPanel(elsewhere);
  assert.ok(outside);
  assert.equal(rowOf(outside, 'Book with'), null, 'reception cannot book somebody into the hospital');
  assert.match(words(elsewhere), /not this practice/i);
});

test('the card says it has read the message and not the record', () => {
  // The one thing this panel must not be mistaken for. It is the patient's own
  // account of their earlier contact, which is worth acting on and is not the
  // same thing as a consultation somebody has looked up.
  const card = accurxAnswer({
    condition: 'knee pain', text: KNEE, reason: 'knee pain recurring',
    route: readingVerdict({
      destination: 'fcp',
      seenBefore: { who: 'Dr Okafor', when: 'in July', what: '', here: true, evidence: 'I saw Dr Okafor about it in July' },
    }),
  });
  assert.match(words(card), /nothing here has read the record/i);
  assert.match(words(card), /Find that consultation in the record before you book/i);
});
