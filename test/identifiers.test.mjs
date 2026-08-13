import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REDACTIONS, identifierNote, identifierWarning, redactIdentifiers, scanIdentifiers,
} from '../lib/safety/identifiers.mjs';

const redact = (t, opts) => redactIdentifiers(t, opts).text;
const kinds = (t, opts) => scanIdentifiers(t, opts).map((f) => f.kind);
const ids = (t, opts) => scanIdentifiers(t, opts).map((f) => f.ruleId);

/* ----------------------------------------------------------------- names */

test('a name behind a title goes, however it was capitalised', () => {
  assert.equal(redact('Mrs Smith wants a fit note'), REDACTIONS.name + ' wants a fit note');
  assert.equal(redact('mrs smith wants a fit note'), REDACTIONS.name + ' wants a fit note');
  assert.equal(redact('Mr. J Patel rang about his results'), REDACTIONS.name + ' rang about his results');
});

test('a first name and a surname go together, as one hole', () => {
  const out = redactIdentifiers('Sarah Wilkinson rang about her knee');
  assert.equal(out.text, REDACTIONS.name + ' rang about her knee');
  assert.equal(out.findings.length, 1);
});

test('a title in front of a full name is still one name, not two', () => {
  const out = redactIdentifiers('Miss Sarah Wilkinson has cancelled');
  assert.equal(out.text, REDACTIONS.name + ' has cancelled');
  assert.equal(out.findings.length, 1);
});

test('a name written under a label goes, and the label stays', () => {
  assert.equal(redact('Name: John Smith'), 'Name: ' + REDACTIONS.name);
  assert.equal(redact("patient's name is Doreen Whitfield"), "patient's name is " + REDACTIONS.name);
  assert.equal(redact('surname - Okafor'), 'surname - ' + REDACTIONS.name);
  // A record header writes it the other way round, and half a name is not a
  // redaction.
  assert.equal(redact('NAME: SMITH, JOHN'), 'NAME: ' + REDACTIONS.name);
});

test('a patient named beside the word patient goes', () => {
  assert.equal(redact('the patient John Smith needs a review'), 'the patient ' + REDACTIONS.name + ' needs a review');
  assert.equal(redact('called Doreen Whitfield'), 'called ' + REDACTIONS.name);
});

test('a clinician is not a patient — a role in front keeps the name', () => {
  const asked = 'Which days is Dr Ahmed Hussain in this week?';
  assert.equal(redact(asked), asked, 'the rota question has to survive');
  assert.equal(redact('Nurse Rachel Adams is on leave'), 'Nurse Rachel Adams is on leave');
  assert.equal(redact('ask the community matron Alison Wade'), 'ask the community matron Alison Wade');
});

test('a name the practice has written down itself is a contact, not a patient', () => {
  const directory = [{ label: 'Community Matron (Alison Wade)' }, 'District Nurse (Rachel)'];
  assert.equal(redact('what is the number for Alison Wade', { allow: directory }), 'what is the number for Alison Wade');
  // Somebody not in the directory is still redacted with the same list in play.
  assert.equal(redact('what is the number for Alison Whitfield', { allow: directory }),
    'what is the number for ' + REDACTIONS.name);
});

test('the ordinary business of the helpdesk is left completely alone', () => {
  const asked = [
    'How do I refer for an ECG?',
    'What is the two week wait pathway for a hoarse voice?',
    'Patient Access is not letting them log in',
    'Can you mark this as urgent and send it to the duty doctor',
    'The patient is waiting on reception',
    'Kind Regards',
    'Kay is on leave from Monday',
    'she needs 2 doses of B12 2mg',
    'NG12 says this is a two week wait',
    'the address is on the letter',
    'their email address is referrals@nhs.net',
  ];
  for (const q of asked) assert.equal(redact(q), q, q);
});

test('a bare first name is never a redaction', () => {
  assert.equal(redact('Sarah in reception took the call'), 'Sarah in reception took the call');
  assert.equal(redact('sarah smith took the call'), 'sarah smith took the call', 'no capital, no claim');
});

/* ------------------------------------------------------------- addresses */

test('a postcode goes', () => {
  assert.equal(redact('they live at E9 6BX'), 'they live at ' + REDACTIONS.address);
  assert.equal(redact('SW1A1AA'), REDACTIONS.address);
});

test('a dose is not a postcode', () => {
  assert.equal(redact('prescribed B12 2mg'), 'prescribed B12 2mg');
});

test('a street address goes, with the flat number in front of it', () => {
  assert.equal(redact('12 Acacia Road'), REDACTIONS.address);
  assert.equal(redact('Flat 4, 12 Acacia Road'), REDACTIONS.address);
  assert.equal(redact('lives at 221b Baker Street now'), 'lives at ' + REDACTIONS.address + ' now');
});

test('a number next to an ordinary noun is not a street', () => {
  assert.equal(redact('it is all in 1 place'), 'it is all in 1 place');
  assert.equal(redact('give it 2 weeks'), 'give it 2 weeks');
});

test('an address under a label goes to the end of the sentence', () => {
  assert.equal(
    redact('Address: 12 Acacia Road, London E9 6BX. Please book them in.'),
    'Address: ' + REDACTIONS.address + '. Please book them in.',
  );
});

/* ------------------------------------------------------- the whole thing */

test('a real message loses the patient and keeps the request', () => {
  const message = 'Mrs Doreen Whitfield of 12 Acacia Road, E9 6BX has run out of ramipril'
    + ' and wants a repeat prescription today.';
  const out = redactIdentifiers(message);
  assert.match(out.text, /has run out of ramipril and wants a repeat prescription today\.$/);
  assert.ok(!/Whitfield|Acacia|E9/.test(out.text), 'nothing identifying may survive');
  assert.deepEqual(kinds(message), ['name', 'address', 'address']);
});

test('redacting twice changes nothing the second time', () => {
  const once = redact('Mrs Smith at 12 Acacia Road');
  assert.equal(redact(once), once);
});

test('a finding never carries the words it found', () => {
  const findings = scanIdentifiers('Mrs Doreen Whitfield of 12 Acacia Road');
  for (const f of findings) {
    assert.ok(!JSON.stringify(f).toLowerCase().includes('whitfield'));
    assert.ok(!JSON.stringify(f).toLowerCase().includes('acacia'));
    assert.ok(Number.isInteger(f.start) && Number.isInteger(f.end) && f.end > f.start);
  }
});

test('nothing found is nothing said', () => {
  assert.deepEqual(scanIdentifiers(''), []);
  assert.deepEqual(scanIdentifiers('   '), []);
  assert.equal(redactIdentifiers('how do I book a smear').changed, false);
  assert.equal(identifierWarning([]), '');
  assert.equal(identifierNote([]), '');
});

test('the warning counts what went and quotes none of it', () => {
  const { findings } = redactIdentifiers('Mrs Doreen Whitfield of 12 Acacia Road, E9 6BX');
  const warning = identifierWarning(findings);
  assert.match(warning, /1 name and 2 addresses were removed/);
  assert.ok(!/Whitfield|Acacia/.test(warning));
  assert.match(identifierNote(findings), /^Patient details removed before sending — 1 name, 2 addresses\.$/);
  assert.match(identifierWarning(findings.slice(0, 1)), /^1 name was removed/);
});

test('the rule that fired is reported, so a false positive can be found', () => {
  assert.deepEqual(ids('Mrs Smith'), ['identifier.titledName']);
  assert.deepEqual(ids('Sarah Wilkinson'), ['identifier.forenameSurname']);
  assert.deepEqual(ids('E9 6BX'), ['identifier.postcode']);
  assert.deepEqual(ids('12 Acacia Road'), ['identifier.streetAddress']);
});
