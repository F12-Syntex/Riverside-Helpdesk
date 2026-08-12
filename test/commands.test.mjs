// Slash commands. The point of typing one is that the answer stops being a
// guess, so what matters here is that the command is recognised, that the
// message survives it intact, and that neither command can render something
// else — including when the model returns nothing usable.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMMANDS, awaitingArguments, commandByTemplate, forcedTemplate, matchCommands, parseCommand,
} from '../lib/commands.mjs';
import { renderCommand } from '../lib/templates/route.mjs';
import { choosePassages, practiceSearchAnswer } from '../lib/templates/practice.mjs';

test('the list is offered while the name is being typed, and not after', () => {
  assert.deepEqual(matchCommands('/').map((c) => c.name), ['triage', 'accurx', 'document', 'appt', 'practice']);
  assert.deepEqual(matchCommands('/t').map((c) => c.name), ['triage']);
  assert.deepEqual(matchCommands('/p').map((c) => c.name), ['practice']);
  // Two commands start with an "a", so one more keystroke tells them apart.
  assert.deepEqual(matchCommands('/a').map((c) => c.name), ['accurx', 'appt']);
  assert.deepEqual(matchCommands('/ac').map((c) => c.name), ['accurx']);
  assert.deepEqual(matchCommands('/ap').map((c) => c.name), ['appt']);
  assert.deepEqual(matchCommands('/triage').map((c) => c.name), ['triage']);
  // A space means the message has started; a list over it would be in the way.
  assert.deepEqual(matchCommands('/triage '), []);
  assert.deepEqual(matchCommands('/triage sore throat'), []);
  assert.deepEqual(matchCommands('how do I refer for an ECG'), []);
  assert.deepEqual(matchCommands('/zzz'), []);
});

test('the message survives the command intact', () => {
  const parsed = parseCommand('/triage pt has a sore throat since Friday, no fever');
  assert.equal(parsed.command.template, 'triage');
  assert.equal(parsed.rest, 'pt has a sore throat since Friday, no fever');

  // Several lines of a pasted letter, kept whole.
  const pasted = parseCommand('/document Discharge summary\nHomerton, Ophthalmology\n07-Aug-2026');
  assert.equal(pasted.command.template, 'documentCoding');
  assert.match(pasted.rest, /^Discharge summary\nHomerton/);
});

test('an unknown command is asked as written rather than swallowed', () => {
  assert.equal(parseCommand('/refer for an ECG'), null);
  assert.equal(parseCommand('how do I refer for an ECG'), null);
});

test('a command with nothing after it is a command still being written', () => {
  assert.equal(awaitingArguments('/triage').name, 'triage');
  assert.equal(awaitingArguments('/triage   ').name, 'triage');
  assert.equal(awaitingArguments('/triage a patient'), null);
});

test('the server honours only a template a command claims', () => {
  assert.equal(forcedTemplate('triage'), 'triage');
  assert.equal(forcedTemplate('documentCoding'), 'documentCoding');
  assert.equal(forcedTemplate('practiceSearch'), 'practiceSearch');
  // Anything else — including a real template no command offers — is ignored,
  // so the field cannot be used to force an arbitrary card.
  assert.equal(forcedTemplate('referral'), '');
  assert.equal(forcedTemplate('notebook'), '');
  assert.equal(forcedTemplate(''), '');
  assert.equal(commandByTemplate('triage').name, 'triage');
});

test('/triage always renders a triage, even with no condition named', () => {
  const named = renderCommand('triage', { condition: 'conjunctivitis' }, 'pt eyes red with discharge');
  assert.ok(named && named.title, 'a triage card is rendered');

  // The model returned nothing usable. The message itself is still triaged —
  // falling through to prose would answer a different question.
  const bare = renderCommand('triage', {}, 'pt has chest pain and is short of breath');
  assert.ok(bare && bare.title, 'the message is triaged on its own');
});

test('/document falls back to the coding rules, never to prose', () => {
  const filed = renderCommand('documentCoding', {
    document: { date: '07-Aug-2026', site: 'HUH', department: 'Ophthalmology', actions: [] },
  });
  assert.ok(filed && filed.title);
  const rendered = JSON.stringify(filed);
  assert.match(rendered, /07-Aug-2026/);
  assert.match(rendered, /HUH/);
  assert.match(rendered, /Ophthalmology/);

  // Nothing to build a title from: still the practice's own material.
  const nothing = renderCommand('documentCoding', {});
  assert.ok(nothing && nothing.title, 'the rules card answers instead');
});

test('a template no command claims renders nothing', () => {
  assert.equal(renderCommand('referral', {}, 'ecg'), null);
  assert.equal(renderCommand('', {}, ''), null);
});

test('every model-filled command names a template the renderer knows', () => {
  for (const command of COMMANDS.filter((c) => c.fill === 'model')) {
    assert.ok(renderCommand(command.template, {}, 'anything'), command.name + ' renders');
  }
  // The searching command is not the renderer's to build: it has no values for
  // a model to fill, and its card is made from what the documents actually say.
  for (const command of COMMANDS.filter((c) => c.fill === 'search')) {
    assert.equal(renderCommand(command.template, {}, 'anything'), null);
  }
});

test('/practice shows the passages as written, and says where each came from', () => {
  const card = practiceSearchAnswer({
    query: 'consent to share records',
    passages: [
      {
        docTitle: 'Data Sharing Policy',
        section: 'Consent',
        text: 'Written consent must be recorded before any record is shared with a third party.',
        url: 'assets/rag/data-sharing-policy/document.html',
      },
      {
        docTitle: 'Confidentiality poster',
        section: '',
        text: 'Staff must not discuss patient information where it can be overheard.',
        url: '',
      },
    ],
  });

  const rendered = JSON.stringify(card);
  // The wording survives whole, and is marked as a quotation.
  assert.match(rendered, /> Written consent must be recorded before any record is shared/);
  assert.match(rendered, /### Data Sharing Policy — Consent/);
  // No link: the renderer has no links, so one would arrive as square brackets.
  assert.doesNotMatch(rendered, /\[Open the document\]/);
  assert.deepEqual(card.source, ['Data Sharing Policy', 'Confidentiality poster']);
  assert.match(card.subtitle, /^2 passages/);
});

test('/practice says nothing matched rather than answering some other way', () => {
  const card = practiceSearchAnswer({ query: 'staff parking', passages: [], searched: 60 });
  assert.equal(card.subtitle, 'Nothing in the documents matches');
  assert.deepEqual(card.source, []);
  assert.match(JSON.stringify(card), /60 documents searched/);
});

test('one long policy cannot crowd out the rest', () => {
  const many = [
    { docTitle: 'Long Policy', text: 'first' },
    { docTitle: 'Long Policy', text: 'second' },
    { docTitle: 'Long Policy', text: 'third' },
    { docTitle: 'Other Policy', text: 'fourth' },
    { docTitle: '', text: '   ' }, // nothing to read — dropped
  ];
  const chosen = choosePassages(many);
  assert.equal(chosen.filter((p) => p.docTitle === 'Long Policy').length, 2);
  assert.equal(chosen.length, 3);
});

test('a passage longer than a paragraph is cut at a sentence, and says it was', () => {
  const long = 'Sentence one is here. ' + 'Filler that keeps going and going. '.repeat(40);
  const card = practiceSearchAnswer({ query: 'x', passages: [{ docTitle: 'Doc', text: long }] });
  const quoted = card.blocks.find((b) => b.type === 'text' && b.markdown.startsWith('>')).markdown;
  assert.ok(quoted.length < 760, 'the excerpt is bounded');
  assert.match(quoted, /\[…\]$/);
});

/* ----------------------------------------------------------------- /appt */

test('/appt keeps the reason line and the booking notes apart', () => {
  const card = renderCommand('appointmentBooking', {
    reason: 'heartburn 3/52, worsening, gaviscon not helping; pt concerned re omeprazole/clopidogrel interaction',
    details: [],
    booking: ['telephone after 2pm', 'Turkish interpreter needed'],
  }, 'pasted message');
  const json = JSON.stringify(card);

  assert.match(card.title, /Reason and booking notes/);
  assert.match(json, /Copy into the appointment/);
  assert.match(json, /heartburn 3\/52/);
  assert.match(json, /Booking notes/);
  assert.match(json, /telephone after 2pm/);
  assert.match(json, /Turkish interpreter/);

  // The two lists are read by two different people at two different moments,
  // and the reason rules drop contact preferences on purpose. A booking note
  // that leaked into the reason line would defeat both.
  const reasonField = card.blocks.find((b) => b.type === 'fields').items[0].value;
  assert.doesNotMatch(reasonField, /2pm|interpreter/i);
});

test('/appt says plainly that it has not decided urgency', () => {
  // A card that summarises a patient's message looks exactly like a card that
  // has assessed it. This one has not, and says so.
  const json = JSON.stringify(renderCommand('appointmentBooking', { reason: 'sore throat 2/7' }));
  assert.match(json, /does \*\*not\*\* decide how urgent/i);
  assert.match(json, /shown \*\*above\*\* this card/i);
});

test('/appt falls back to the reason rules, never to prose', () => {
  // Nothing to write a line from — the same shape as /document falling back to
  // the coding rules. Still the practice's own material.
  const bare = renderCommand('appointmentBooking', {}, 'anything');
  assert.ok(bare && bare.title, 'the rules card answers instead');
  assert.match(bare.title, /Writing the reason for appointment/);
});

test('/appt caps both lists rather than rendering whatever came back', () => {
  const many = Array.from({ length: 9 }, (_, i) => 'note ' + i);
  const card = renderCommand('appointmentBooking', { reason: 'knee pain 2/12', details: many, booking: many });
  const lists = card.blocks.filter((b) => b.type === 'bullets');
  for (const list of lists) assert.ok(list.items.length <= 5, 'at most five');
});

/* --------------------------------------------------------------- /accurx */

// The whole promise of the command: one paste, both answers. A card that
// carried only one of them would be /triage or /appt wearing a new name.
test('/accurx routes the patient AND writes the reason line', () => {
  const card = renderCommand('accurxTriage', {
    condition: 'heartburn',
    reason: 'heartburn 3/52, worsening, gaviscon not helping',
    booking: ['telephone after 2pm'],
  }, 'I have had heartburn for about 3 weeks, gaviscon is not helping. Best to call after 2pm.');
  const json = JSON.stringify(card);

  // Where it goes, from the practice's own triage order.
  assert.match(json, /Where this goes/);
  assert.match(json, /Send it to/);
  // And the wording, from the same message.
  assert.match(json, /Copy into the appointment/);
  assert.match(json, /heartburn 3\/52/);
  assert.match(json, /Booking notes/);
  assert.match(json, /telephone after 2pm/);
  // Both halves say where they came from.
  assert.ok(card.source.includes('Appointment reason'), 'the reason rules are cited');
  assert.ok(card.source.length > 1, 'the routing pages are cited too');
});

test('/accurx keeps the reason line clear of the booking notes', () => {
  const card = renderCommand('accurxTriage', {
    condition: 'heartburn',
    reason: 'heartburn 3/52, worsening, gaviscon not helping',
    booking: ['telephone after 2pm', 'Turkish interpreter needed'],
  }, 'pasted message');
  const reason = card.blocks
    .filter((b) => b.type === 'fields')
    .flatMap((b) => b.items)
    .find((item) => item.label === 'Reason');
  assert.doesNotMatch(reason.value, /2pm|interpreter/i);
});

test('/accurx leads with where it goes, then the line to copy', () => {
  // The two things that leave the card, in the order they are used: the
  // destination goes into the task, the reason into what gets booked. Anything
  // between them is something read before the reader gets to what they came for.
  const card = renderCommand('accurxTriage', {
    condition: 'sore throat',
    reason: 'sore throat 3/7, no fever',
  }, 'sore throat since Friday, no fever');
  const titles = card.blocks.filter((b) => b.type === 'fields').map((b) => b.title);
  assert.deepEqual(titles.slice(0, 2), ['Where this goes', 'Copy into the appointment']);
});

test('/accurx demotes the wording when the answer is an emergency', () => {
  // Nobody books an appointment off "interrupt the duty doctor now", so the
  // reason line is not the second thing on the card, and it does not offer a
  // Copy — the same reason the emergency triage cards offer none.
  const card = renderCommand('accurxTriage', {
    condition: 'chest pain',
    reason: 'chest pain since this morning, sob',
  }, 'I have had a crushing pain in my chest since this morning and I am short of breath');
  const json = JSON.stringify(card);

  assert.match(json, /duty doctor/i);
  assert.match(json, /handover/i);
  // The wording is still there — it is what gets said when passing this on.
  assert.match(json, /chest pain since this morning/);
  assert.doesNotMatch(json, /Copy into the appointment/);
  const copies = card.blocks
    .filter((b) => b.type === 'fields')
    .flatMap((b) => b.items)
    .filter((item) => item.copy);
  assert.equal(copies.length, 0, 'an emergency card offers nothing to copy');

  // And it comes after the instruction, never before it.
  const kinds = card.blocks.map((b) => (b.type === 'fields' ? b.title : b.type));
  assert.ok(kinds.indexOf('For the handover note') > kinds.indexOf('bullets'), 'the wording sits below what to do');
});

test('/accurx demotes an eye emergency but not an ordinary eye request', () => {
  // The two sit on the same page of the practice's material and one word apart
  // in the message. Only one of them is somebody standing up.
  const ae = JSON.stringify(renderCommand('accurxTriage', {
    condition: 'eye injury', reason: 'eye trauma with bleeding',
  }, 'I got hit in the eye and it is bleeding'));
  assert.match(ae, /Moorfields/);
  assert.match(ae, /For the handover note/);
  assert.doesNotMatch(ae, /Copy into the appointment/);

  const mecs = JSON.stringify(renderCommand('accurxTriage', {
    condition: 'conjunctivitis', reason: 'red sticky eye 3/7, no vision change',
  }, 'My eye has been red and sticky for 3 days'));
  assert.match(mecs, /Rose Opticians/);
  assert.match(mecs, /Copy into the appointment/);
  assert.doesNotMatch(mecs, /not an appointment to book/);
});

test('/accurx keeps the wording rules out of the middle of the routing', () => {
  // Two disclosures about house style, sitting between "where this goes" and
  // the steps for booking it, are two disclosures in the way of somebody doing
  // the thing. They go last, whichever order the rest of the card is in.
  for (const card of [
    renderCommand('accurxTriage', { condition: 'sore throat', reason: 'sore throat 3/7' }, 'pt sore throat since Friday'),
    renderCommand('accurxTriage', { condition: 'chest pain', reason: 'chest pain since this morning' }, 'crushing chest pain since this morning, short of breath'),
  ]) {
    const last = card.blocks.slice(-3).map((b) => b.label || b.type);
    assert.deepEqual(last, ['How the reason was written', 'What belongs in a booking note', 'note']);
  }
});

test('/accurx still routes when the model wrote no reason line', () => {
  // Half the answer missing is not a reason to give none of it: the routing is
  // decided in code from the message and does not need the model's wording.
  const card = renderCommand('accurxTriage', {}, 'pt has a sore throat since Friday, no fever');
  const json = JSON.stringify(card);
  assert.ok(card && card.title);
  assert.match(json, /Where this goes/);
  assert.match(json, /no reason line to write/i);
});

test('/accurx says what it decided and what it only rewrote', () => {
  // The card looks like it has formed a view of the whole message, and half of
  // it has not. Where the urgency was actually decided is said outright.
  const json = JSON.stringify(renderCommand('accurxTriage', { condition: 'sore throat', reason: 'sore throat 3/7' }, 'sore throat'));
  assert.match(json, /triage order/i);
  assert.match(json, /shown \*\*above\*\* this card/i);
});

test('/accurx caps both lists rather than rendering whatever came back', () => {
  const many = Array.from({ length: 9 }, (_, i) => 'note ' + i);
  const card = renderCommand('accurxTriage', {
    condition: 'knee pain', reason: 'knee pain 2/12', details: many, booking: many,
  }, 'knee pain for two months');
  for (const list of card.blocks.filter((b) => b.type === 'bullets')) {
    assert.ok(list.items.length <= 5, 'at most five');
  }
});

/* ------------------------------------ copying the one value that leaves */

// Every command card ends in one value the reader types somewhere else: a
// filing title onto a document, a reason line into the appointment, a
// destination into the task that passes the patient on. Selecting it by hand on
// a touchscreen at the front desk is worse than retyping it, which is the same
// argument the message block makes for itself.
const copied = (card) => card.blocks
  .filter((b) => b.type === 'fields')
  .flatMap((b) => b.items)
  .filter((item) => item.copy);

test('/document offers the filing title', () => {
  const card = renderCommand('documentCoding', {
    document: { date: '07-Aug-2026', site: 'HUH', department: 'Ophthalmology', actions: ['d/c'] },
  });
  assert.deepEqual(copied(card).map((f) => f.label), ['Title']);
});

test('/appt offers the reason line', () => {
  const card = renderCommand('appointmentBooking', { reason: 'knee pain 2/12, req physio' });
  const one = copied(card);
  assert.deepEqual(one.map((f) => f.label), ['Reason']);
  assert.equal(one[0].value, 'knee pain 2/12, req physio');
});

test('/triage offers where it goes', () => {
  const card = renderCommand('triage', { condition: 'sore throat' }, 'pt sore throat');
  const one = copied(card);
  assert.deepEqual(one.map((f) => f.label), ['Send it to']);
  assert.match(one[0].value, /Community pharmacy/);
});

test('exactly one value per card carries it', () => {
  // A Copy on every row would be four buttons on a referral card and no signal
  // about which one the reader actually needs, so it stays opt-in.
  for (const card of [
    renderCommand('triage', { condition: 'knee pain' }, 'adult with knee pain for weeks'),
    renderCommand('appointmentBooking', { reason: 'sore throat 3/7', booking: ['prefers phone'] }),
    renderCommand('documentCoding', { document: { date: '07-Aug-2026', site: 'HUH', department: 'Cardiology', actions: [] } }),
  ]) {
    assert.equal(copied(card).length, 1, card.title + ' should offer exactly one');
  }
});

test('/accurx is the deliberate exception: two values leave it', () => {
  // One Copy per card is the rule, so that the reader can see which value they
  // came for. /accurx exists because they came for two — the destination for
  // the task that passes the patient on, the reason for the appointment — and
  // making them retype one of them undoes the point of the command.
  const card = renderCommand('accurxTriage', {
    condition: 'sore throat', reason: 'sore throat 3/7, no fever',
  }, 'pt sore throat since Friday, no fever');
  assert.deepEqual(copied(card).map((f) => f.label), ['Send it to', 'Reason']);
});

test('an emergency card offers nothing to copy', () => {
  // Nobody types anything off "interrupt the duty doctor now" — they stand up.
  const red = renderCommand('triage', { condition: 'chest pain' }, 'pt has chest pain and is short of breath');
  assert.equal(copied(red).length, 0);

  const spinal = renderCommand('triage', { condition: 'back pain' },
    'Bad lower back pain, now numb around the groin and cannot tell when passing urine.');
  assert.equal(copied(spinal).length, 0);
});
