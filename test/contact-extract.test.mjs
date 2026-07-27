import test from 'node:test';
import assert from 'node:assert/strict';
import { extractContacts, extractEmails, extractPhones, htmlToText, isDialableUk, normaliseUkNumber } from '../lib/lookup/contact-extract.mjs';

// A number shown to a receptionist has to be a verbatim copy of what its source
// said, and it has to actually be a phone number. These are the rules that keep
// a reference off an invoice from being offered as something to dial.

test('the international and national forms of one number agree', () => {
  assert.equal(normaliseUkNumber('020 7377 7000'), '02073777000');
  assert.equal(normaliseUkNumber('+44 20 7377 7000'), '02073777000');
  assert.equal(normaliseUkNumber('+44 (0)20 7377 7000'), '02073777000');
  assert.equal(normaliseUkNumber('0044 20 7377 7000'), '02073777000');
});

test('only real UK number shapes are dialable', () => {
  assert.ok(isDialableUk('02073777000'));   // London landline
  assert.ok(isDialableUk('01234567891'));   // geographic
  assert.ok(isDialableUk('07917595615'));   // mobile
  assert.ok(isDialableUk('08001690169'));   // freephone
  assert.equal(isDialableUk('0207377700'), true);  // ten digits is still valid
  assert.equal(isDialableUk('123456789'), false);  // no leading zero
  assert.equal(isDialableUk('0407377700'), false); // 04 is not a UK range
  assert.equal(isDialableUk('0111111111'), false); // one repeated digit
  assert.equal(isDialableUk('0123456789'), false); // a counting sequence
  assert.equal(isDialableUk('020737770001'), false); // too long
});

test('a number is returned exactly as the page wrote it', () => {
  const [phone] = extractPhones('Switchboard: 020 8510 5555 (24 hours)');
  assert.equal(phone.display, '020 8510 5555');
  assert.equal(phone.tel, '02085105555');
  assert.equal(phone.label, 'Switchboard');
});

test('the words before a number become its label, and a fax says so', () => {
  const phones = extractPhones('Appointments: 020 7377 7010\nFax: 020 7377 7011');
  assert.equal(phones.length, 2);
  assert.equal(phones[0].label, 'Appointments');
  assert.equal(phones[0].kind, 'phone');
  assert.equal(phones[1].kind, 'fax');
});

test('reference numbers that merely look like phone numbers are left alone', () => {
  // The exact failure this guards: a page footer where the only eleven-digit
  // run on it is the charity's registration.
  assert.deepEqual(extractPhones('Registered charity number 1075769420'), []);
  assert.deepEqual(extractPhones('NHS number: 0123 456 7890'), []);
  assert.deepEqual(extractPhones('Company No. 04005495 · VAT 927 4832 21'), []);
});

test('dates and prices are not numbers to ring', () => {
  assert.deepEqual(extractPhones('Updated 01/02/2024, reviewed 03/04/2025'), []);
  assert.deepEqual(extractPhones('Charges from £0.55 to £10.20 per item'), []);
});

test('the same number written twice is offered once', () => {
  const phones = extractPhones('Call 020 8510 5555 or 02085105555 for the switchboard.');
  assert.equal(phones.length, 1);
});

test('tel: and mailto: links are read before the prose', () => {
  const html = `
    <p>General enquiries</p>
    <a href="tel:+442085105555">Call us</a>
    <a href="mailto:pals@homerton.nhs.uk">Email PALS</a>
    <p>Switchboard 020 7377 7000</p>
  `;
  const { phones, emails } = extractContacts(html);
  assert.equal(phones[0].tel, '02085105555');
  assert.ok(phones.some((p) => p.tel === '02073777000'));
  assert.deepEqual(emails, ['pals@homerton.nhs.uk']);
});

test('a tel: href is upgraded by the same number written out in the page', () => {
  // The switchboard normally appears twice: once as a bare href in the header,
  // once under a heading in the body. The reader should get the readable one.
  const { phones } = extractContacts(
    '<a href="tel:02085105555">Call</a><p>Switchboard: 020 8510 5555 (24 hours)</p>',
  );
  assert.equal(phones.length, 1);
  assert.equal(phones[0].display, '020 8510 5555');
  assert.equal(phones[0].label, 'Switchboard');
});

test('NHS addresses outrank a generic one on the same page', () => {
  const emails = extractEmails('Write to info@somewhere.com or pals@bartshealth.nhs.uk today.');
  assert.equal(emails[0], 'pals@bartshealth.nhs.uk');
});

test('machinery addresses and asset filenames are not contacts', () => {
  assert.deepEqual(extractEmails('no-reply@nhs.net and sprite@2x.png and hello@example.com'), []);
});

test('markup is stripped without gluing words together', () => {
  const text = htmlToText('<h1>Contact</h1><p>Telephone:</p><div>020 8510 5555</div><script>var a="020 1111 2222";</script>');
  assert.match(text, /Contact/);
  assert.match(text, /020 8510 5555/);
  // A number that only exists inside a script tag was never on the page.
  assert.doesNotMatch(text, /020 1111 2222/);
});

test('a page with nothing to ring yields nothing rather than a guess', () => {
  const { phones, emails } = extractContacts('<p>Our opening hours are 8am to 6.30pm, Monday to Friday.</p>');
  assert.deepEqual(phones, []);
  assert.deepEqual(emails, []);
});
