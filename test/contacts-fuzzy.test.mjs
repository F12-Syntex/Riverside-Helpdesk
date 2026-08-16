import test from 'node:test';
import assert from 'node:assert/strict';
import { searchContactsIn } from '../lib/contacts.fuzzy.mjs';

// The contacts page is searched by somebody with a patient on the line, who
// types what they call the thing rather than what the directory calls it.
// These are the misses the ranking has to forgive — and the ones it must not.
// The directory below is invented; the real one is lib/contacts.data.json.

const DIRECTORY = [
  { label: 'Homerton hospital', phones: [{ display: '020 8510 5555', tel: '02085105555' }], emails: [] },
  { label: 'RLH- switchboard', phones: [{ display: '020 7377 7000', tel: '02073777000' }], emails: [] },
  { label: 'Bowel screening', phones: [{ display: '020 7377 7218', tel: '02073777218' }], emails: [] },
  { label: 'North East London ICB', phones: [{ display: '020 3688 1000', tel: '02036881000' }], emails: [] },
  { label: 'District nurses', phones: [{ display: '020 7000 1111', tel: '02070001111' }], emails: ['district.nurses@example.nhs.uk'] },
  { label: 'Podiatry', phones: [{ display: '020 7000 2222', tel: '02070002222' }], emails: [] },
  { label: 'Podiatry — booking queries', phones: [{ display: '020 7000 3333', tel: '02070003333' }], emails: [] },
];

const labels = (rows) => rows.map((r) => r.entry.label);

test('an empty search is the whole directory, in alphabetical order', () => {
  const rows = searchContactsIn(DIRECTORY, '');
  assert.equal(rows.length, DIRECTORY.length);
  assert.deepEqual(labels(rows), [...labels(rows)].sort((a, b) => a.localeCompare(b, 'en')));
});

test('a name typed in full comes back first', () => {
  assert.equal(labels(searchContactsIn(DIRECTORY, 'homerton'))[0], 'Homerton hospital');
});

test('half a word is enough, and a second word narrows it', () => {
  assert.equal(labels(searchContactsIn(DIRECTORY, 'hom'))[0], 'Homerton hospital');
  assert.deepEqual(labels(searchContactsIn(DIRECTORY, 'hom hosp')), ['Homerton hospital']);
});

test('letters dropped out of a word still find it', () => {
  assert.equal(labels(searchContactsIn(DIRECTORY, 'hmrtn'))[0], 'Homerton hospital');
});

test('an initialism finds the words it stands for', () => {
  assert.ok(labels(searchContactsIn(DIRECTORY, 'nel')).includes('North East London ICB'));
});

test('part of a number finds the entry that holds it', () => {
  assert.deepEqual(labels(searchContactsIn(DIRECTORY, '8510')), ['Homerton hospital']);
  assert.equal(labels(searchContactsIn(DIRECTORY, '7377')).length, 2);
});

test('an email address is searchable, but the name still ranks first', () => {
  assert.ok(labels(searchContactsIn(DIRECTORY, 'example')).includes('District nurses'));
  assert.equal(labels(searchContactsIn(DIRECTORY, 'nurses'))[0], 'District nurses');
});

test('the shorter, more exact name wins a tie', () => {
  assert.deepEqual(labels(searchContactsIn(DIRECTORY, 'podiatry')), ['Podiatry', 'Podiatry — booking queries']);
});

test('every word has to land, so two words narrow rather than widen', () => {
  assert.deepEqual(labels(searchContactsIn(DIRECTORY, 'podiatry booking')), ['Podiatry — booking queries']);
});

test('letters scattered across a label are a coincidence, not a match', () => {
  assert.deepEqual(searchContactsIn(DIRECTORY, 'zzz'), []);
  // "hpl" is in "Homerton hospital" only as three letters far apart and buried
  // mid-word — the sort of hit that would put the whole directory behind
  // every query.
  assert.equal(labels(searchContactsIn(DIRECTORY, 'hpl')).includes('Homerton hospital'), false);
});

test('a limit caps the list without changing its order', () => {
  const all = searchContactsIn(DIRECTORY, '');
  assert.deepEqual(labels(searchContactsIn(DIRECTORY, '', 2)), labels(all).slice(0, 2));
});

test('the entry that comes back is the directory’s own object, untouched', () => {
  const [row] = searchContactsIn(DIRECTORY, 'homerton');
  assert.equal(row.entry, DIRECTORY[0]);
  assert.equal(row.entry.phones[0].display, '020 8510 5555');
});

test('the matched characters are reported, for highlighting', () => {
  const [row] = searchContactsIn(DIRECTORY, 'hom');
  assert.deepEqual(row.indices, [0, 1, 2]);
});
