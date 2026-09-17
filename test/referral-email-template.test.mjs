// The email an emailed referral goes out with.
//
// Before this, the card told a receptionist to open Accurx, attach the letter
// and send — and left the message itself blank. So the wording was written from
// nothing at the front desk, a dozen times a day, by whoever was on: sometimes
// three lines, sometimes none, sometimes the patient's name typed into a
// message that already has the record attached.
//
// The card writes it now. These tests hold the two things that makes safe: the
// wording is built in code from the service rather than composed by a model,
// and it carries nothing about the patient.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERRAL_SERVICES, referralAnswer, referralEmailBody, referralTemplates } from '../lib/templates/referrals.mjs';
import { answerToText } from '../lib/questions/flatten.mjs';

const svcNamed = (name) => REFERRAL_SERVICES.find((s) => s.name === name);
const emailed = REFERRAL_SERVICES.filter((s) => s.route === 'email');
const windowOf = (card) => card.blocks.find((b) => b.type === 'profMessage');

// The practice's own page, as the Notebook holds it — the path a referral the
// array has never heard of comes down.
const EMAIL_PAGE = {
  docTitle: 'Notebook: Referrals / Email Referrals',
  text: 'These go by email instead of ERS. Create the document, then email it via Message → Message professional → attach EMIS file:\n\n* Dietitian\n* OT (Occupational Therapy)\n',
};

/* ------------------------------------------------------- the card carries it */

test('an emailed referral card comes with the message already written', () => {
  const card = referralTemplates.emailReferral(svcNamed('ECG'));
  const win = windowOf(card);
  assert.ok(win, 'the card draws the professional-message window');
  assert.match(win.body, /^Dear Colleague,/);
  assert.match(win.body, /Please find attached an ECG referral for this patient\./);
  assert.match(win.body, /Thanks,\nThe Riverside Practice$/);
});

test('the steps tell the reader the wording is there to take', () => {
  const card = referralTemplates.emailReferral(svcNamed('ECG'));
  assert.match(JSON.stringify(card), /Copy the wording above/);
});

test('every referral the practice emails gets a written message, not a blank one', () => {
  for (const svc of emailed) {
    const win = windowOf(referralTemplates.emailReferral(svc));
    assert.ok(win, svc.name + ' draws the window');
    assert.ok(win.body.includes('Dear Colleague,'), svc.name + ' opens the message');
    assert.ok(/The Riverside Practice$/.test(win.body), svc.name + ' signs the message');
    assert.ok(win.body.split('\n').filter(Boolean).length >= 4, svc.name + ' says something in between');
  }
});

/* -------------------------------------------- what the wording never carries */

test('nothing about the patient is ever typed into the wording', () => {
  // The record is attached by Accurx. A name, a date of birth or an NHS number
  // in the wording is a second copy of what is already there — and the copy is
  // the one that can be wrong, or be left behind from the last patient.
  for (const svc of emailed) {
    const body = referralEmailBody(svc);
    assert.doesNotMatch(body, /\b(?:date of birth|d\.?o\.?b\.?|nhs number)\b/i, svc.name);
    assert.doesNotMatch(body, /\bMr\b|\bMrs\b|\bMs\b|\bMiss\b/, svc.name);
    // No fill-in-the-blank either: a blank left in a template is a blank that
    // gets sent as a blank.
    assert.doesNotMatch(body, /[[<]\s*(?:name|patient|insert|xxx)/i, svc.name);
    assert.doesNotMatch(body, /_{2,}|X{3,}/, svc.name);
  }
});

test('an emailed referral never mentions e-RS, in the wording or anywhere else', () => {
  const flat = JSON.stringify(referralTemplates.emailReferral(svcNamed('CAMHS')));
  assert.doesNotMatch(flat, /Smartcard/);
  assert.doesNotMatch(flat, /Speciality/);
});

/* ----------------------------------------------- adjusted to the referral */

test('the message names the referral it is for, in the practice’s own words', () => {
  assert.match(referralEmailBody({ name: 'CAMHS' }), /a CAMHS referral/);
  assert.match(referralEmailBody({ name: 'Healthy Together' }), /a Healthy Together referral/);
  // The practice's gloss, its second name and the reader's trailing "referral"
  // are not part of the name a sentence wants.
  assert.match(referralEmailBody({ name: 'Occupational therapy (OT)' }), /an Occupational therapy referral/);
  assert.match(referralEmailBody({ name: 'District nurse / community nurse' }), /a District nurse referral/);
  assert.match(referralEmailBody({ name: 'Gym referral' }), /a Gym referral for this patient/);
});

test('an acronym takes the article it is said with, not the one it is spelt with', () => {
  // "an ECG", because the E is read "ee". Getting this wrong is small and it is
  // the kind of small that makes a practice's email read as machine-written.
  assert.match(referralEmailBody({ name: 'ECG' }), /an ECG/);
  assert.match(referralEmailBody({ name: 'ACERS' }), /an ACERS/);
  assert.match(referralEmailBody({ name: 'OT' }), /an OT/);
  assert.match(referralEmailBody({ name: 'CAMHS' }), /a CAMHS/);
  assert.match(referralEmailBody({ name: 'Echo' }), /an Echo/);
  assert.match(referralEmailBody({ name: 'Dietitian' }), /a Dietitian/);
});

test('a service the practice owes a sentence gets that sentence and no other does', () => {
  assert.match(referralEmailBody(svcNamed('Minor surgery')), /added to your minor surgery list/);
  assert.match(referralEmailBody(svcNamed('District nurse / community nurse')), /one PDF, most recent first/);
  // Four lines and no filler on everything else.
  assert.equal(referralEmailBody(svcNamed('CAMHS')).split('\n').filter(Boolean).length, 4);
});

test('a name the builder cannot make sense of still produces a sendable message', () => {
  for (const name of ['', '   ', '(referrals)', '/']) {
    const body = referralEmailBody({ name });
    assert.match(body, /^Dear Colleague,/);
    assert.match(body, /Please find attached a referral for this patient\./);
    assert.match(body, /The Riverside Practice$/);
  }
});

/* ----------------------------------------------------- the window's own rows */

test('the address the practice records goes in the To box, with the organisation', () => {
  const win = windowOf(referralTemplates.emailReferral(svcNamed('Minor surgery')));
  assert.equal(win.to, 'NELONDONICB.NIGHTINGALEPRACTICE@NHS.NET');
  assert.equal(win.org, 'The Nightingale Practice');
});

test('an address the practice does not record says what actually happens', () => {
  // Not a blank box, which reads as a box somebody forgot to fill in.
  const win = windowOf(referralTemplates.emailReferral(svcNamed('ECG')));
  assert.equal(win.to, '');
  assert.match(win.toMissing, /Fills in automatically from the document/);
});

test('the attachment is the EMIS file, and names the form where there is one', () => {
  const win = windowOf(referralTemplates.emailReferral(svcNamed('District nurse / community nurse')));
  assert.equal(win.attach, 'EMIS file');
  assert.equal(win.form, 'RP ACN 2022');
});

/* ------------------------------------- the referral only the Notebook knows */

test('a referral read off the practice’s page gets the same written message', () => {
  const card = referralAnswer({ question: 'how do I do a dietitian referral', name: 'dietitian', pages: [EMAIL_PAGE] });
  const win = windowOf(card);
  assert.ok(win, 'the Notebook path draws the window too');
  assert.match(win.body, /a Dietitian referral for this patient/);
});

/* ------------------------------------------------------------- the log */

test('the question log stores the wording that was shown, not that a window was', () => {
  const out = answerToText(referralTemplates.emailReferral(svcNamed('Minor surgery')));
  assert.match(out, /New professional message/);
  assert.match(out, /To: NELONDONICB\.NIGHTINGALEPRACTICE@NHS\.NET/);
  assert.match(out, /Organisation: The Nightingale Practice/);
  assert.match(out, /Please find attached a Minor surgery referral for this patient\./);
  assert.match(out, /The Riverside Practice/);
});
