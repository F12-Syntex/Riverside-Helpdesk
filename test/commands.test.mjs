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
  assert.deepEqual(matchCommands('/').map((c) => c.name), ['triage', 'document', 'practice']);
  assert.deepEqual(matchCommands('/t').map((c) => c.name), ['triage']);
  assert.deepEqual(matchCommands('/p').map((c) => c.name), ['practice']);
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
