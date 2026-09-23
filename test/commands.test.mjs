// The modes. The point of choosing one is that the answer stops being a
// guess, so what matters here is that the mode is recognised and that no mode
// can render something else — including when the model returns nothing usable.
import assert from 'node:assert/strict';
import test from 'node:test';

import * as commands from '../lib/commands.mjs';
import {
  COMMANDS, COMMAND_TEMPLATES, MODES, QA_MODE, TOP_MODES, FOLDER_MODES, commandByName, commandByTemplate,
  forcedTemplate, modePlaceholder, checksPatientData,
} from '../lib/commands.mjs';
import { commandPrompt, renderCommand } from '../lib/templates/route.mjs';
import { consultationEntry, plainEnglish } from '../lib/templates/writing.mjs';
import { triagePatientAnswer } from '../lib/templates/triage.mjs';
import { choosePassages, practiceSearchAnswer } from '../lib/templates/practice.mjs';

// The picker is the one way in. The typed "/" commands, and the Contact and
// Coding modes, were withdrawn.
test('there are no slash commands, and no Contact or Coding mode', () => {
  for (const gone of ['matchCommands', 'parseCommand', 'awaitingArguments', 'isLocalCommand']) {
    assert.equal(commands[gone], undefined, gone + ' is still exported');
  }
  for (const name of ['contact', 'contacts', 'number', 'coding', 'document', 'meds']) {
    assert.equal(commandByName(name), null, name + ' still resolves');
  }
  assert.equal(commandByName('medication').template, 'repeatMedication');
});

test('the server honours only a template a command claims', () => {
  assert.equal(forcedTemplate('accurxTriage'), 'accurxTriage');
  assert.equal(forcedTemplate('consultationNote'), 'consultationNote');
  assert.equal(forcedTemplate('practiceSearch'), 'practiceSearch');
  assert.equal(forcedTemplate('repeatMedication'), 'repeatMedication');
  // The withdrawn modes are not honoured: sent up anyway, the message is
  // answered the ordinary way. The router can still choose documentCoding.
  assert.equal(forcedTemplate('contactSearch'), '');
  assert.equal(forcedTemplate('documentCoding'), '');
  // Anything else — including a real template no command offers — is ignored,
  // so the field cannot be used to force an arbitrary card. "triage" is one of
  // those now: the router still chooses it, but no command claims it.
  assert.equal(forcedTemplate('triage'), '');
  assert.equal(forcedTemplate('appointmentBooking'), '');
  assert.equal(forcedTemplate('referral'), '');
  assert.equal(forcedTemplate('notebook'), '');
  assert.equal(forcedTemplate(''), '');
  assert.equal(commandByTemplate('accurxTriage').name, 'accurx');
  assert.equal(commandByTemplate('triage'), null);
});

test('the coding card falls back to the coding rules, never to prose', () => {
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

// /consultation writes the one line that goes on the record. The line is
// assembled in code from the parts, so its shape cannot drift; and when there
// are no parts it falls back to the rules for writing one, never to prose.
test('/consultation assembles the record entry from its parts, in order', () => {
  const card = renderCommand('consultationNote', {
    contact: 'tel c/w pt',
    summary: 'sore throat 1/52, req abx',
    actions: ['adv not prescribed without assessment', 'booked tel appt Dr Okafor 03-Sep pm'],
    safetyNet: 'adv 111 if worse o/n',
    unclear: [],
  }, 'pt rang re sore throat');
  assert.ok(card && card.title);
  const entry = card.blocks.find((b) => b.type === 'fields').items[0];
  assert.equal(entry.value, 'tel c/w pt: sore throat 1/52, req abx; adv not prescribed without assessment; booked tel appt Dr Okafor 03-Sep pm; adv 111 if worse o/n');
  assert.equal(entry.copy, true, 'the entry carries its own Copy');
  assert.equal(consultationEntry({ contact: 'pt attended desk' }), 'pt attended desk');
  assert.equal(consultationEntry({ summary: 'req sick note' }), 'req sick note');
  assert.equal(consultationEntry({}), '');

  // What the note left open is said back, never filled in.
  const open = renderCommand('consultationNote', {
    contact: 'tel c/w pt', summary: 'chasing referral', actions: ['tasked secretaries'], unclear: ['which referral'],
  });
  assert.match(JSON.stringify(open.blocks.find((b) => b.type === 'note')), /which referral/);

  // Nothing to build an entry from: still the practice's own material.
  const nothing = renderCommand('consultationNote', {});
  assert.ok(nothing && nothing.title, 'the rules card answers instead');
  assert.notEqual(nothing.title, 'Record entry');
});

// The card is checked by the person who just wrote the note, and what they are
// checking is that everything they said is in the entry. A line of shorthand is
// the worst place to notice something missing, so the card takes the entry apart
// and reads it back in words.
test('/consultation shows the entry in plain words and part by part', () => {
  const card = renderCommand('consultationNote', {
    contact: 'tel pt re appt, no answer',
    summary: 'fever, cough w/ mucus, sore throat 1/52 unchanged, req abx',
    actions: ['to book appt Fri'],
    safetyNet: '',
    unclear: [],
  }, 'called the pt for an appt, no answer');

  const [written, parts] = card.blocks.filter((b) => b.type === 'fields');
  const entry = written.items[0];
  assert.equal(entry.value, 'tel pt re appt, no answer: fever, cough w/ mucus, sore throat 1/52 unchanged, req abx; to book appt Fri');
  // The reading sits under the entry as a hint, so it is never inside the Copy:
  // what goes on the record is the shorthand.
  assert.match(entry.hint, /telephone call to patient/i);
  assert.match(entry.hint, /1 week unchanged/);
  assert.match(entry.hint, /requests antibiotics/);
  assert.equal(entry.copy, true);

  assert.deepEqual(parts.items.map((f) => f.label), ['Contact', 'What it was about', 'What was done', 'Safety-netting']);
  assert.equal(parts.items[1].value, 'fever, cough w/ mucus, sore throat 1/52 unchanged, req abx');
  // An empty part is shown as missing rather than left off the card: none given
  // is the finding, and it is why nothing was added.
  assert.equal(parts.items[3].value, '');
  assert.match(parts.items[3].missing, /none given/i);
});

// Only the abbreviations change. The two lines on the card say the same thing,
// so the reading is done here rather than by a model that could reword it.
test('the plain reading expands the shorthand and nothing else', () => {
  assert.equal(
    plainEnglish('tel c/w pt: sore throat 1/52, req abx; adv 111 if worse o/n'),
    'Telephone call with patient: sore throat 1 week, requests antibiotics; advised 111 if worse overnight',
  );
  assert.equal(
    plainEnglish('pt attended desk: req sick note 2/52 back pain; d/w Dr Okafor; s/n given'),
    'Patient attended desk: requests sick note 2 weeks back pain; discussed with Dr Okafor; safety-netting given',
  );
  // Durations take the plural from their own number, and 3/7 is days not weeks.
  assert.match(plainEnglish('cough 3/7 worsening'), /3 days worsening/);
  assert.match(plainEnglish('r/v 1/12'), /Review 1 month/, 'the line reads as a sentence, so it starts with a capital');
  assert.equal(plainEnglish(''), '');
});

// The rules the model is given, and the rules the card discloses, are one list.
// This is the half of it that keeps a symptom from being dropped for brevity.
test('/consultation is told to shorten by shorthand, never by leaving things out', () => {
  const prompt = commandPrompt({ template: 'consultationNote', question: 'pt rang, fever, cough, mucus, sore throat 1 week unchanged, wants abx' });
  assert.match(prompt, /NOTHING THE NOTE SAYS IS LEFT OUT/);
  assert.match(prompt, /EVERY symptom the note names/);
  assert.match(prompt, /Say how the contact ended where the patient was not reached/);
});

// A command always answers with its own card. When the call behind it did not
// come back, the card that stands in for the answer has to SAY so — otherwise
// the house style is indistinguishable from the answer, and a mode that could
// not reach a model reads as a mode that does not work.
test('a command whose model call failed says so on the card it falls back to', () => {
  const credits = renderCommand('consultationNote', {}, 'pt rang re sore throat', {
    failed: 'This request requires more credits, or fewer max_tokens. You requested up to 2000 tokens, but can only afford 626.',
  });
  const warn = credits.blocks.find((b) => b.type === 'note' && b.tone === 'warn');
  assert.match(warn.text, /No entry was written from your note/);
  // The provider's sentence is for whoever holds the account; the card says
  // what it means for the person who just typed a note.
  assert.match(warn.text, /out of credit/i);
  assert.match(warn.text, /openrouter\.ai\/settings\/credits/);
  assert.match(credits.subtitle, /No entry could be written/);

  // Anything unrecognised keeps the provider's own words rather than being
  // smoothed into "something went wrong".
  const odd = renderCommand('consultationNote', {}, 'x', { failed: 'kaboom' });
  assert.match(odd.blocks.find((b) => b.type === 'note' && b.tone === 'warn').text, /did not come back: kaboom/);

  // The same card asked for on purpose is unchanged: no warning, and the
  // subtitle it always had.
  const asked = renderCommand('consultationNote', {}, 'how do I write up a call?');
  assert.equal(asked.blocks.filter((b) => b.type === 'note' && b.tone === 'warn').length, 1, 'only the standing warning about what may go on a record');
  assert.match(asked.subtitle, /shorthand it is read in/);
  assert.doesNotMatch(JSON.stringify(asked), /out of credit/i);

  // Filing a document falls the same way, for the same reason.
  const coding = renderCommand('documentCoding', {}, 'a letter', { failed: 'rate limit exceeded (429)' });
  assert.match(coding.blocks.find((b) => b.type === 'note' && b.tone === 'warn').text, /No filing title was built/);
  assert.match(coding.blocks.find((b) => b.type === 'note' && b.tone === 'warn').text, /rate-limiting/);
});

// The prompt for a written-up contact says the job and the rules, and puts
// the note inside a fence rather than into the instructions.
test('/consultation asks the model for parts and hands it the note fenced', () => {
  const prompt = commandPrompt({ template: 'consultationNote', question: 'pt rang about """the""" thing' });
  assert.match(prompt, /contact they have just had with a patient/);
  assert.match(prompt, /NOT writing the answer/);
  assert.match(prompt, /Never invent an action/);
  assert.match(prompt, /THE MESSAGE:\n"""\npt rang about ""the"" thing\n"""$/);
  // And says nothing about filing a document, which is the other prompt.
  assert.doesNotMatch(prompt, /filing title/);
});

test('a template no command claims renders nothing', () => {
  assert.equal(renderCommand('referral', {}, 'ecg'), null);
  assert.equal(renderCommand('', {}, ''), null);
  // The two the commands lost. Nothing can force their cards through the command
  // path any more; a described symptom still reaches the triage card through the
  // ordinary router.
  assert.equal(renderCommand('triage', { condition: 'sore throat' }, 'pt sore throat'), null);
  assert.equal(renderCommand('appointmentBooking', { reason: 'sore throat 3/7' }, 'pasted'), null);
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
  // The wording survives whole — as prose under the document's name, not as a
  // blockquote: unedited is not the same as unformatted.
  assert.match(rendered, /### Data Sharing Policy — Consent\\n\\nWritten consent must be recorded before any record is shared/);
  assert.doesNotMatch(rendered, /> Written consent/);
  // No link: the renderer has no links, so one would arrive as square brackets.
  assert.doesNotMatch(rendered, /\[Open the document\]/);
  assert.deepEqual(card.source, ['Data Sharing Policy', 'Confidentiality poster']);
  // The claim that no model touched it is on the card, once, quietly.
  assert.match(card.subtitle, /Word for word from 2 practice documents/);
});

test('/practice keeps the document own paragraphs and lists', () => {
  const card = practiceSearchAnswer({
    query: 'infection control',
    passages: [{
      docTitle: 'Infection Control',
      text: 'Hands are washed between   patients.\n\nThe room is cleaned:\n- wipe the couch\n- change the paper\n\n\n\nRecord it in the log.',
    }],
  });
  const body = card.blocks.find((b) => b.type === 'text').markdown;
  // Paragraph breaks and the list survive; the runs of spaces and the run of
  // blank lines — a PDF extractor's punctuation, not the policy's — do not.
  assert.match(body, /patients\.\n\nThe room is cleaned:\n- wipe the couch\n- change the paper\n\nRecord it in the log\./);
  assert.doesNotMatch(body, /  /);
  assert.doesNotMatch(body, /\n\n\n/);
});

test('/practice reads a document heading as words, not as markup', () => {
  const card = practiceSearchAnswer({
    query: 'consent',
    passages: [{ docTitle: 'Policy', text: '## Consent\n> Ask first.' }],
  });
  const body = card.blocks.find((b) => b.type === 'text').markdown;
  // One heading on the block — the one naming the document — and no quote bar.
  assert.equal(body.split('\n').filter((l) => l.startsWith('#')).length, 1);
  assert.match(body, /\nConsent\nAsk first\./);
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
  const passage = card.blocks.find((b) => b.type === 'text').markdown;
  assert.ok(passage.length < 780, 'the excerpt is bounded');
  assert.match(passage, /\[…\]$/);
});

/* --------------------------------------------------------------- /accurx */

// The whole promise of the command: one paste, both answers. A card carrying
// only one of them would be one of the two commands it replaced, renamed.
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
  // The reading decides on this path now, so the test supplies one — which is
  // what /api/agent always does. Without it there is nothing to route by, and
  // the card says so rather than guessing from the words.
  const card = renderCommand('accurxTriage', {
    condition: 'chest pain',
    reason: 'chest pain since this morning, sob',
    destination: 'emergency',
    evidence: 'crushing pain in my chest since this morning',
    reasoning: 'Crushing central chest pain since this morning with breathlessness, happening now.',
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
    condition: 'eye injury',
    reason: 'eye trauma with bleeding',
    destination: 'eyeEmergency',
    evidence: 'I got hit in the eye and it is bleeding',
    reasoning: 'A blunt injury to the eye with bleeding, happening now.',
  }, 'I got hit in the eye and it is bleeding'));
  assert.match(ae, /Moorfields/);
  assert.match(ae, /For the handover note/);
  assert.doesNotMatch(ae, /Copy into the appointment/);

  const mecs = JSON.stringify(renderCommand('accurxTriage', {
    condition: 'conjunctivitis',
    reason: 'red sticky eye 3/7, no vision change',
    destination: 'minorEyeService',
    evidence: 'My eye has been red and sticky for 3 days',
    reasoning: 'Three days of a red, sticky eye with no change in vision — what the minor eye service sees.',
  }, 'My eye has been red and sticky for 3 days'));
  assert.match(mecs, /Rose Opticians/);
  assert.match(mecs, /Copy into the appointment/);
  assert.doesNotMatch(mecs, /not an appointment to book/);
});

test('/accurx keeps the wording rules out of the middle of the routing', () => {
  // Three disclosures about house style, sitting between "where this goes" and
  // the steps for booking it, are three disclosures in the way of somebody doing
  // the thing. They go last, whichever order the rest of the card is in — and
  // the third arrived with the panel that says who to book it with, which is
  // house style in exactly the same sense as the other two.
  for (const card of [
    renderCommand('accurxTriage', { condition: 'sore throat', reason: 'sore throat 3/7' }, 'pt sore throat since Friday'),
    renderCommand('accurxTriage', { condition: 'chest pain', reason: 'chest pain since this morning' }, 'crushing chest pain since this morning, short of breath'),
  ]) {
    const last = card.blocks.slice(-4).map((b) => b.label || b.type);
    assert.deepEqual(last, [
      'How the reason was written',
      'What belongs in a booking note',
      'How earlier contact was looked for',
      'note',
    ]);
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
  // it has not: the reason line is a rewrite. Which half did what is said
  // outright — and it no longer claims a triage order underneath it, because
  // there is not one.
  const json = JSON.stringify(renderCommand('accurxTriage', {
    condition: 'sore throat',
    reason: 'sore throat 3/7',
    destination: 'pharmacy',
    evidence: 'sore throat',
    reasoning: 'Three days of a sore throat, nothing tried yet, no fever.',
  }, 'sore throat'));
  assert.match(json, /reading the whole message/i);
  assert.match(json, /judges nothing/i);
  assert.match(json, /no keyword matching underneath/i);
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

test('the coding card offers the filing title', () => {
  const card = renderCommand('documentCoding', {
    document: { date: '07-Aug-2026', site: 'HUH', department: 'Ophthalmology', actions: ['d/c'] },
  });
  assert.deepEqual(copied(card).map((f) => f.label), ['Title']);
});

test('a triage card offers where it goes', () => {
  const card = triagePatientAnswer({ condition: 'sore throat', text: 'pt sore throat' });
  const one = copied(card);
  assert.deepEqual(one.map((f) => f.label), ['Send it to']);
  assert.match(one[0].value, /Community pharmacy/);
});

test('exactly one value per card carries it', () => {
  // A Copy on every row would be four buttons on a referral card and no signal
  // about which one the reader actually needs, so it stays opt-in.
  for (const card of [
    triagePatientAnswer({ condition: 'knee pain', text: 'adult with knee pain for weeks' }),
    triagePatientAnswer({ condition: 'stitches out', text: 'pt needs her stitches out on Thursday' }),
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
  const red = triagePatientAnswer({ condition: 'chest pain', text: 'pt has chest pain and is short of breath' });
  assert.equal(copied(red).length, 0);

  const spinal = triagePatientAnswer({
    condition: 'back pain',
    text: 'Bad lower back pain, now numb around the groin and cannot tell when passing urine.',
  });
  assert.equal(copied(spinal).length, 0);
});

/* ------------------------------------------------------------ the picker */

// These guard the words the picker uses, which live beside the modes so the
// button and the server cannot drift apart.

test('every mode carries the words the picker needs', () => {
  for (const c of COMMANDS) {
    assert.ok(c.label, `${c.name} has no label`);
    assert.ok(c.placeholder, `${c.name} has no placeholder`);
    assert.ok(c.summary, `${c.name} has no summary`);
    assert.ok(!c.placeholder.startsWith('/'), `${c.name}'s placeholder names a command`);
  }
});

test('the modes are Q&A first, then every command, and nothing else', () => {
  assert.deepEqual(MODES.map((m) => m.name), ['', 'accurx', 'consultation', 'medication', 'form', 'template', 'practice']);
  assert.equal(MODES[0].label, 'Q&A');
  assert.equal(MODES[0].name, '', 'the resting mode is not a command');
  // Every mode but the first must be a real command, or the picker offers
  // something the server will not honour.
  for (const m of MODES.slice(1)) {
    assert.ok(commandByName(m.name), `${m.name} is not a command`);
    assert.equal(forcedTemplate(commandByName(m.name).template), commandByName(m.name).template);
  }
  assert.deepEqual(COMMAND_TEMPLATES, COMMANDS.map((c) => c.template));
});

// The picker draws the writing modes at the top and the lookups behind a
// folder. Splitting the list must lose nothing: the two halves are the whole.
test('the folder holds the lookups, and the two halves are every mode', () => {
  assert.deepEqual(TOP_MODES.map((m) => m.name), ['', 'accurx', 'consultation', 'medication']);
  assert.deepEqual(FOLDER_MODES.map((m) => m.name), ['form', 'template', 'practice']);
  assert.deepEqual(TOP_MODES.concat(FOLDER_MODES).map((m) => m.name).sort(), MODES.map((m) => m.name).sort());
  assert.equal(QA_MODE.folder, undefined, 'the resting mode is never behind the folder');
});

test('the field asks for the right thing in each mode', () => {
  assert.equal(modePlaceholder(''), QA_MODE.placeholder);
  assert.match(modePlaceholder('form'), /referral/i);
  assert.match(modePlaceholder('template'), /contract|template/i);
  assert.match(modePlaceholder('practice'), /practice documents/i);
  assert.match(modePlaceholder('accurx'), /AccurX/);
  assert.match(modePlaceholder('consultation'), /said and done/i);
  assert.match(modePlaceholder('medication'), /screenshot/i);
  // A withdrawn or unknown mode is Q&A, so a stale value kept in a browser
  // cannot leave the field captioned with something that no longer exists.
  assert.equal(modePlaceholder('contact'), QA_MODE.placeholder);
  assert.equal(modePlaceholder('coding'), QA_MODE.placeholder);
  assert.equal(modePlaceholder('nonsense'), QA_MODE.placeholder);
  assert.equal(modePlaceholder(undefined), QA_MODE.placeholder);
});

test('every command is offered', () => {
  assert.deepEqual(COMMANDS.filter((c) => c.hidden).map((c) => c.name), []);
  for (const c of COMMANDS) assert.ok(MODES.some((m) => m.name === c.name), `${c.name} is not a mode`);
});

/* ---------------------------------------------------------------- the guards */

// Two guards read a message for patient data: the name-and-address redaction
// and the screen. One flag answers for both, and no mode switches it off now
// that Coding is withdrawn.
test('every mode is checked for patient data', () => {
  for (const c of COMMANDS) assert.equal(checksPatientData(c), true, `${c.name} is unguarded`);
  assert.equal(checksPatientData(null), true);
  assert.equal(checksPatientData(undefined), true);
  assert.equal(checksPatientData(commandByTemplate('documentCoding')), true);
  assert.equal(checksPatientData({ checked: false }), false, 'the flag still works');
});
