// The Call link of a saved number (lib/contacts.phone.mjs), which the server
// builds from what the contact form lets through (validate.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { telOf } from '../lib/contacts.phone.mjs';
import { phoneProblem } from '../app/_components/contacts/validate.mjs';

test('a plain number dials as itself, however it is spaced', () => {
  assert.equal(telOf('020 8510 5555'), '02085105555');
  assert.equal(telOf('(020) 8510-5555'), '02085105555');
  assert.equal(telOf('111'), '111');
});

test('an extension is not dialled as part of the number', () => {
  for (const v of ['020 8510 5555 ext 214', '020 8510 5555 ext. 214', '020 8510 5555 extension 214',
    '020 8510 5555 x214', '020 8510 5555 #214', '020 8510 5555, ext 214']) {
    assert.equal(telOf(v), '02085105555', v);
  }
});

test('a second number or extension after a "/" is not dialled', () => {
  assert.equal(telOf('0207 683 4040/4000'), '02076834040');
  assert.equal(telOf('02076834835/ 02076834144'), '02076834835');
});

test('the "(0)" of +44 is not dialled; a leading 0 in brackets is', () => {
  assert.equal(telOf('+44 (0)20 8510 5555'), '+442085105555');
  assert.equal(telOf('+44(0)20 8510 5555'), '+442085105555');
  assert.equal(telOf('0044 (0)20 8510 5555'), '00442085105555');
  assert.equal(telOf('+44 20 8510 5555'), '+442085105555');
  assert.equal(telOf('(0)20 8510 5555'), '02085105555');
});

test('every number the form accepts dials a UK-length number, not every digit typed', () => {
  for (const v of ['020 7683 4040 ext 1234', '020 7683 4040 x214', '020 7683 4040, ext. 12', '0207 683 4040/4000',
    '02085107958/02085105593', '+44 (0)20 8510 5555', '0044 20 8510 5555']) {
    assert.equal(phoneProblem(v), '', v);
    const digits = telOf(v).replace(/^\+44|^0044/, '0').replace(/\D/g, '');
    assert.ok(digits.length >= 10 && digits.length <= 11, v + ' → ' + telOf(v));
  }
});

// Editing a sheet contact sends its numbers back as displayed. The link it
// is saved with must be the one the sheet already had, or changing a note
// would quietly break the Call button.
test('a bundled number saved back unchanged keeps the tel it was bundled with', () => {
  const sheet = JSON.parse(readFileSync(new URL('../lib/contacts.data.json', import.meta.url), 'utf8'));
  const rows = Array.isArray(sheet) ? sheet : (sheet.entries || sheet.contacts || Object.values(sheet));
  let checked = 0;
  for (const entry of rows) {
    for (const p of entry.phones || []) {
      assert.equal(telOf(p.display), p.tel, p.display);
      checked++;
    }
  }
  assert.ok(checked > 100, 'the sheet has its numbers');
});
