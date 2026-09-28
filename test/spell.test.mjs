import test from 'node:test';
import assert from 'node:assert/strict';
import { PHONETIC, SPELL_MAX, spellAnswer, spellOut } from '../lib/spell.mjs';
import { commandByName, forcedTemplate, localCommand, modePresets } from '../lib/commands.mjs';

const PRACTICE = 'nelondonicb.theriversidepractice@nhs.net';

test('every letter has a word, and E is England', () => {
  assert.equal(Object.keys(PHONETIC).length, 26);
  assert.equal(PHONETIC.n, 'November');
  assert.equal(PHONETIC.e, 'England');
});

test('the practice email is spelled letter by letter', () => {
  const out = spellOut(PRACTICE);
  assert.equal(out.email, true);
  assert.equal(out.spoken, 'nelondonicb dot theriversidepractice at nhs dot net');
  assert.match(out.letterByLetter, /^N for November, E for England, L for Lima/);
  assert.match(out.letterByLetter, /B for Bravo, dot, T for Tango/);
  assert.match(out.letterByLetter, /, at, N for November, H for Hotel, S for Sierra, dot, N for November/);
  // Every character is on the card, and nothing else is.
  assert.equal(out.groups.flatMap((g) => g.chars).map((c) => c.ch).join(''), PRACTICE);
  assert.deepEqual(out.groups.filter((g) => g.sep).map((g) => g.chars[0].say), ['dot', 'at', 'dot']);
});

test('digits and symbols are said in words', () => {
  const out = spellOut('AB-12_3');
  const said = out.groups.flatMap((g) => g.chars).map((c) => c.say);
  assert.deepEqual(said, ['Alpha', 'Bravo', 'hyphen', 'one', 'two', 'underscore', 'three']);
});

test('capitals are only called out where the string mixes them', () => {
  assert.doesNotMatch(spellOut('SMITH').letterByLetter, /capital/);
  assert.doesNotMatch(spellOut('John.Smith@nhs.net').letterByLetter, /capital/, 'an email is not case-sensitive');
  assert.match(spellOut('McDonald').letterByLetter, /^capital M for Mike, C for Charlie, capital D for Delta/);
});

test('a long string is cut, and says so', () => {
  const out = spellOut('a'.repeat(SPELL_MAX + 20));
  assert.equal(out.truncated, true);
  assert.equal(out.text.length, SPELL_MAX);
});

test('the card carries the tiles and a plain rendering of them', () => {
  const card = spellAnswer(PRACTICE);
  assert.equal(card.title, 'Spelling an email address');
  assert.ok(card.spell);
  const copyable = card.blocks.find((b) => b.type === 'fields').items.find((i) => i.copy);
  assert.equal(copyable.value, PRACTICE);
  assert.ok(card.blocks.some((b) => b.type === 'message' && /N for November/.test(b.text)));
  assert.ok(!spellAnswer('   ').spell, 'nothing to spell is a prompt, not a card of tiles');
});

test('the mode is local: offered in the picker, never honoured by the server', () => {
  const c = commandByName('spell');
  assert.equal(c.fill, 'local');
  assert.equal(localCommand('spellOut'), c);
  assert.equal(forcedTemplate('spellOut'), '', 'the server would be a way for the text to leave');
  assert.deepEqual(modePresets('spell'), [{ label: 'Practice email', value: PRACTICE }]);
  assert.deepEqual(modePresets('accurx'), []);
  assert.deepEqual(modePresets(''), []);
});

test('tiles show letters in capitals unless the case matters', () => {
  const shown = (t) => spellOut(t).groups.flatMap((g) => g.chars).map((c) => c.show).join('');
  assert.equal(shown('nhs.net'), 'NHS.NET', 'a lower-case l reads as a 1');
  assert.equal(shown('McDonald'), 'McDonald');
  assert.equal(shown('a b'), 'A␣B');
});
