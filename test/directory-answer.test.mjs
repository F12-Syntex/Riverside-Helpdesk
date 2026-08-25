import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryAnswerIn, directorySubject } from '../lib/templates/directory.mjs';

// The question that started this: "what is the number for the riverside
// practice?" was answered with "I cannot see the practice's own material", from
// a pipeline holding the practice's whole telephone sheet. So these are the two
// halves of the fix — recognising the ask, and refusing the ones that are not
// asks at all. The directory below is invented; the real one is
// lib/contacts.data.json merged with the hospitals in lib/lookup/directory.js.

const DIRECTORY = [
  {
    label: 'The Riverside Practice',
    aliases: ['riverside', 'the practice', 'our practice', 'the surgery', 'us', 'reception'],
    note: 'Our own main line — reception.',
    phones: [{ display: '020 8806 1928', tel: '02088061928' }],
    emails: ['nelondonicb.theriversidepractice@nhs.net'],
    source: 'directory',
  },
  {
    label: 'The Riverside Practice fax line',
    aliases: ['our fax'],
    phones: [{ display: '020 8806 8823', tel: '02088068823' }],
    emails: [],
    source: 'directory',
  },
  {
    label: 'District Nurse (Rachel)',
    phones: [{ display: '07917 595615', tel: '07917595615' }],
    emails: [],
    source: 'directory',
  },
  {
    label: 'District Nurse Direct Number',
    phones: [{ display: '020 7683 4835', tel: '02076834835' }],
    emails: [],
    source: 'directory',
  },
  {
    label: 'Medical records email',
    phones: [],
    emails: ['sbs-i.medicalrecords@example.nhs.net'],
    source: 'directory',
  },
  {
    label: 'Homerton University Hospital (HUH)',
    aliases: ['HUH', 'Homerton'],
    note: 'Main switchboard.',
    phones: [{ display: '020 8510 5555', tel: '02085105555' }],
    emails: [],
    source: 'hospitals',
  },
];

const rows = (card) => card.blocks.find((b) => b.type === 'contacts').items;
const dialled = (card) => rows(card).map((r) => r.tel).filter(Boolean);

test('the practice is asked for by name, and the answer is its own row', () => {
  const card = directoryAnswerIn(DIRECTORY, 'what is the number for the riverside practice?');
  assert.ok(card);
  assert.equal(rows(card)[0].tel, '020 8806 1928');
});

test('the practice is also asked for as "us", "our" and "the surgery"', () => {
  for (const asked of ['what is the number for us', 'whats our number', 'what is the surgery number']) {
    assert.equal(directorySubject(asked), 'The Riverside Practice', asked);
    assert.equal(rows(directoryAnswerIn(DIRECTORY, asked))[0].tel, '020 8806 1928', asked);
  }
});

test('politeness in front of the name is not part of the name', () => {
  assert.equal(directorySubject('can you give me the district nurse number'), 'district nurse');
});

test('a single hit is titled with the entry and drops the repeated label', () => {
  const card = directoryAnswerIn(DIRECTORY, 'what is the number for homerton');
  assert.equal(card.title, 'Homerton University Hospital (HUH)');
  assert.equal(rows(card)[0].label, '');
  assert.equal(rows(card)[0].tel, '020 8510 5555');
  assert.deepEqual(card.source, ['Hospital directory — local acute trusts']);
});

test('several entries by the same name are all shown, each with its label', () => {
  const card = directoryAnswerIn(DIRECTORY, 'number for the district nurse');
  assert.equal(dialled(card).length, 2);
  assert.ok(rows(card).every((r) => r.label));
});

test('a second number on a row is carried, never dropped', () => {
  const two = [{
    label: 'IT helpdesk',
    phones: [{ display: '0345 140 8000', tel: '03451408000' }, { display: '020 7000 9999', tel: '02070009999' }],
    emails: [],
    source: 'directory',
  }];
  const card = directoryAnswerIn(two, 'what is the number for the IT helpdesk');
  assert.equal(rows(card)[0].tel, '0345 140 8000');
  assert.match(rows(card)[0].note, /020 7000 9999/);
});

test('asked for an email, a row holding only a fax number is not offered', () => {
  const card = directoryAnswerIn(DIRECTORY, 'what is the email for the riverside practice');
  assert.equal(rows(card).length, 1);
  assert.equal(rows(card)[0].email, 'nelondonicb.theriversidepractice@nhs.net');
});

test('reaching somebody counts as asking, even without the word "number"', () => {
  assert.equal(directorySubject('how do I contact medical records'), 'medical records');
  assert.ok(directoryAnswerIn(DIRECTORY, 'how do I contact medical records'));
});

test('a question about how something is done is left to the templates', () => {
  for (const asked of [
    'how do I refer for an ECG',
    'what is the process for a sick note',
    'how do I register a patient with us',
    'what is the policy on contacting a patient',
  ]) {
    assert.equal(directorySubject(asked), '', asked);
    assert.equal(directoryAnswerIn(DIRECTORY, asked), null, asked);
  }
});

test('a name the directory does not hold is not answered with the nearest one', () => {
  assert.equal(directoryAnswerIn(DIRECTORY, 'what is the number for the moon'), null);
  assert.equal(directoryAnswerIn(DIRECTORY, 'what is the number for cardiology at Barts'), null);
});

test('a pasted message is not a lookup, whatever nouns it contains', () => {
  const pasted = 'Patient rang about her results. She says she has had a cough for three weeks '
    + 'and would like a telephone appointment, her contact number is on the record and she can '
    + 'be reached any afternoon after two, please could somebody call her back today.';
  assert.equal(directorySubject(pasted), '');
});
