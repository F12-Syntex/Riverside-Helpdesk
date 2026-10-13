// The contact form's own checks (app/_components/contacts/validate.mjs),
// which say first what lib/contacts-store.js would otherwise drop in silence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneProblem, emailProblem, checkDraft, hasProblems, REACH_PROBLEM } from '../app/_components/contacts/validate.mjs';

test('UK numbers are accepted however they are spaced, bracketed or prefixed', () => {
  for (const v of ['020 8510 5555', '(020) 8510 5555', '+44 20 8510 5555', '+44 (0)20 8510 5555', '0044 20 8510 5555',
    '07590 047739', '0800 123 456', '020-8510-5555', '020 7683 4040 ext 1234', '020 7683 4040 x214', '020 7683 4040, ext. 12']) {
    assert.equal(phoneProblem(v), '', v);
  }
});

test('short service numbers and the sheet’s own slash-written alternates pass', () => {
  for (const v of ['111', '116 123', '0207 683 4040/4000', '02085107958/02085105593']) assert.equal(phoneProblem(v), '', v);
});

test('what is not a UK number is said so', () => {
  for (const v of ['abc', '12', '020 8510', '020 8510 5555 5555', '+1 212 555 0100', '020 8510 5555 call after 2', '44+20 8510 5555', '0207 683 4040/abc']) {
    assert.notEqual(phoneProblem(v), '', v);
  }
});

test('a number the contact already had is left alone', () => {
  assert.notEqual(phoneProblem('02076834645-4610'), '');
  assert.equal(phoneProblem('02076834645-4610', ['02076834645-4610']), '');
});

test('email addresses use the server’s own test', () => {
  assert.equal(emailProblem('team@nhs.net'), '');
  assert.equal(emailProblem(' team@nhs.net '), '');
  assert.notEqual(emailProblem('team@nhs'), '');
  assert.equal(emailProblem(''), '');
});

test('a draft needs a name and a way to reach them', () => {
  const draft = (o) => ({ label: '', phones: [''], emails: [''], knownPhones: [], ...o });
  const empty = checkDraft(draft({}));
  assert.ok(empty.label);
  assert.equal(empty.reach, REACH_PROBLEM);
  assert.ok(hasProblems(empty));
  assert.equal(hasProblems(checkDraft(draft({ label: 'Clinic', emails: ['a@b.co'] }))), false);
  assert.equal(hasProblems(checkDraft(draft({ label: 'Clinic', phones: ['020 8510 5555'] }))), false);
  // A wrong number has its own message; "add a number" is not said over it.
  const wrong = checkDraft(draft({ label: 'Clinic', phones: ['12'] }));
  assert.equal(wrong.reach, '');
  assert.ok(wrong.phones[0]);
});
