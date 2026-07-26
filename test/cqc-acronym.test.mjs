import test from 'node:test';
import assert from 'node:assert/strict';
import { acronymsFor } from '../lib/lookup/cqc.js';

// Staff say the initials, not the name: HUH, MEH, RLH. The register stores only
// full names, so the initials are derived at load and matched as their own kind
// of hit. (acronymsFor takes an already-normalised name — lowercase, no
// punctuation — which is what norm() produces inside the module.)

test('initials are taken from the first letter of every word', () => {
  assert.deepEqual(acronymsFor('homerton university hospital'), ['huh']);
  assert.deepEqual(acronymsFor('moorfields eye hospital'), ['meh']);
  assert.deepEqual(acronymsFor('royal london hospital'), ['rlh']);
});

test('a connecting word gives both forms, because both get said', () => {
  // "Guy's & St Thomas'" normalises to "guys and st thomas" — said as GAST and
  // as GST, so both have to match.
  assert.deepEqual(acronymsFor('guys and st thomas'), ['gast', 'gst']);
  assert.deepEqual(acronymsFor('hospital of the university'), ['hotu', 'hu']);
});

test('a one-word name has no acronym', () => {
  // "Homerton" on its own is the name, not initials for anything.
  assert.deepEqual(acronymsFor('homerton'), []);
  assert.deepEqual(acronymsFor(''), []);
});

test('numbers and stray punctuation do not become initials', () => {
  assert.deepEqual(acronymsFor('- lister house surgery'), ['lhs']);
  assert.deepEqual(acronymsFor('3 shires hospital'), ['3sh']);
});

test('dropping the connectives is skipped when too little would be left', () => {
  // "house of the" would reduce to a single letter, which identifies nothing.
  assert.deepEqual(acronymsFor('house of the'), ['hot']);
});
