// What a note IS, and what that fixes about it.
//
// The rules under test are the ones the old output tag could not give: the
// shape is a property of the NOTE rather than of the folder it sits in, an
// incomplete card is a draft and is never served, and the values are written
// out in one fixed shape built in code rather than lifted out of prose by a
// model at answer time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyFields, fieldsMarkdown, isTypedKind, noteIssues, noteKind, normaliseFields,
  renderKind, statusFor, suggestKind, NOTE_KIND_IDS,
} from '../lib/notebook/kinds.mjs';
import { buildFullNotebookSources } from '../lib/knowledge-context.mjs';

const ERS = {
  service: 'Audiology / hearing test',
  aliases: ['hearing test', 'audiology'],
  specialty: 'Diagnostic Physiological Measurement',
  clinicType: 'Audiology - Hearing Assess',
  hospitalRule: 'Pick the first hospital listed',
  priority: 'Routine',
  requestType: 'Referral',
  form: 'AQP Direct Access',
};

test('an unknown kind is the plain note rather than a throw', () => {
  assert.equal(noteKind('nonsense').id, 'note');
  assert.equal(noteKind('').id, 'note');
  assert.equal(isTypedKind('note'), false);
  assert.equal(isTypedKind('ersReferral'), true);
  assert.deepEqual(NOTE_KIND_IDS, ['note', 'ersReferral', 'emailReferral', 'bloodTestSet']);
});

test('fields are coerced to the kind, and nothing else is kept', () => {
  const clean = normaliseFields('ersReferral', {
    specialty: '  Dermatology  ',
    aliases: 'skin\n\n2ww skin\n',
    priority: 'Whenever',
    somethingElse: 'dropped',
  });
  assert.equal(clean.specialty, 'Dermatology');
  assert.deepEqual(clean.aliases, ['skin', '2ww skin']);
  // An enum falls back to its first option rather than storing a value the
  // screen cannot draw.
  assert.equal(clean.priority, 'Routine');
  assert.equal('somethingElse' in clean, false);
  // Every field a kind has exists, so nothing reads back undefined.
  for (const field of noteKind('ersReferral').fields) assert.ok(field.key in clean);
});

test('an empty card is a draft, a complete one is live', () => {
  assert.equal(statusFor('ersReferral', emptyFields('ersReferral')), 'draft');
  assert.equal(statusFor('ersReferral', ERS), 'live');
  // A plain note has nothing to be incomplete about.
  assert.equal(statusFor('note', {}), 'live');
});

test('what is missing is named per box, never as "incomplete"', () => {
  const issues = noteIssues('ersReferral', { service: 'Dermatology' });
  const fields = issues.map((i) => i.field);
  assert.ok(fields.includes('specialty'));
  // Either a clinic type or the choices to pick between — not both required.
  assert.ok(fields.includes('clinicType'));
  assert.equal(noteIssues('ersReferral', { ...ERS, clinicType: '', clinicTypeOptions: ['A', 'B'] }).length, 0);
});

test('an email referral needs an address or a rule for finding one', () => {
  assert.ok(noteIssues('emailReferral', { service: 'Echo' }).some((i) => i.field === 'to'));
  assert.equal(noteIssues('emailReferral', { service: 'Echo', toRule: 'Fills in from the document' }).length, 0);
  assert.equal(noteIssues('emailReferral', { service: 'Echo', to: 'echo@example.nhs.uk' }).length, 0);
  // A thing that is not an address is refused rather than drawn into the To box.
  assert.ok(noteIssues('emailReferral', { service: 'Echo', to: 'the cardiology team' }).some((i) => i.field === 'to'));
});

test('the values are written out in one shape, built from the fields', () => {
  const md = fieldsMarkdown('ersReferral', ERS);
  assert.match(md, /\*\*Speciality:\*\* Diagnostic Physiological Measurement/);
  assert.match(md, /\*\*Also called:\*\* hearing test, audiology/);
  // An empty field is absent rather than printed as a blank line.
  assert.equal(/Hospital or service/.test(md), false);
});

test('rendering is pure and per kind, and a plain note draws no screen', () => {
  assert.equal(renderKind('note', {}), null);
  assert.equal(renderKind('ersReferral', ERS).type, 'ers');
  assert.equal(renderKind('emailReferral', { to: 'echo@example.nhs.uk' }).type, 'profMessage');
  assert.equal(renderKind('bloodTestSet', { ordered: ['FBC'] }).type, 'pathology');
});

test('a draft is never served, and a card with no prose still is', () => {
  const notes = [
    { id: 1, parentId: null, title: 'Referrals', isSection: true },
    { id: 2, parentId: 1, title: 'Audiology', body: '', kind: 'ersReferral', fields: ERS, status: 'live' },
    { id: 3, parentId: 1, title: 'Half written', body: 'notes', kind: 'ersReferral', fields: {}, status: 'draft' },
    { id: 4, parentId: 1, title: 'Prose', body: 'Do the thing.', kind: 'note', status: 'live' },
  ];
  const sources = buildFullNotebookSources(notes);
  const titles = sources.map((s) => s.docTitle);
  assert.deepEqual(titles, ['Notebook: Referrals / Audiology', 'Notebook: Referrals / Prose']);
  // The card leads with its values, under the name of what it is.
  assert.match(sources[0].text, /\*\*e-RS referral\*\*/);
  assert.match(sources[0].text, /\*\*Clinic type:\*\* Audiology - Hearing Assess/);
  assert.equal(sources[0].noteKind, 'ersReferral');
  // A plain page is its page, untouched.
  assert.equal(sources[1].text, 'Do the thing.');
});

test('a page that looks like a card is suggested, never converted', () => {
  assert.equal(suggestKind('**Route:** e-RS\n**Speciality:** Dermatology\n**Clinic type:** Skin'), 'ersReferral');
  assert.equal(suggestKind('Send to: echo@example.nhs.uk\nAttach: EMIS file'), 'emailReferral');
  // One stray label in a page about something else is not a card.
  assert.equal(suggestKind('Priority: get the post opened before 10am.'), '');
  assert.equal(suggestKind(''), '');
});
