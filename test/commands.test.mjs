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

test('the list is offered while the name is being typed, and not after', () => {
  assert.deepEqual(matchCommands('/').map((c) => c.name), ['triage', 'document']);
  assert.deepEqual(matchCommands('/t').map((c) => c.name), ['triage']);
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

test('every command names a template the renderer knows', () => {
  for (const command of COMMANDS) {
    assert.ok(renderCommand(command.template, {}, 'anything'), command.name + ' renders');
  }
});
