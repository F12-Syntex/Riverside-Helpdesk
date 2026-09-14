import test from 'node:test';
import assert from 'node:assert/strict';
import { findPathwayReferral, isPathwayPage, readPathways } from '../lib/referrals/pathways.mjs';
import { referralAnswer } from '../lib/templates/referrals.mjs';

// THE GAP THIS FILE EXISTS FOR. The practice keeps its e-RS pairings in the
// Notebook under "Referral pathways / All Clinic types and their specialities".
// The referral card was built from a copy of that list typed into code, so a
// pathway the practice added — or corrected — on its own page never reached
// the reader. The pages below are the three shapes the practice writes them in.

// 1. A page per referral, labelled fields.
const VASCULAR = {
  docTitle: 'Notebook: Referrals / Referral pathways / All Clinic types and their specialities / Vascular surgery',
  text: `Speciality: Vascular Surgery
Clinic type: Varicose Veins
Hospital: Royal London Hospital
Note: The doctor names the side in the letter.`,
};

// 2. A table.
const TABLE = {
  docTitle: 'Notebook: Referrals / Referral pathways / All Clinic types and their specialities / Common referrals',
  text: `The boxes to set on e-RS for each of these.

| Referral | Speciality | Clinic type | Priority |
| --- | --- | --- | --- |
| Hernia | Not Otherwise Specified | Hernias | Routine |
| Suspected skin cancer (2WW) | 2WW | 2WW Dermatology | 2WW |
| ENT — hearing loss | ENT | Hearing Loss | |`,
};

// 3. A list.
const LIST = {
  docTitle: 'Notebook: Referrals / Referral pathways / Other pathways',
  text: `- Rheumatology — Rheumatology — Inflammatory Arthritis
- Speech and language: Speech and Language Therapy / Adult`,
};

// A pathway the array in code ALSO records, with a different clinic type. The
// practice's page is newer and must win.
const RACPC = {
  docTitle: 'Notebook: Referrals / Referral pathways / All Clinic types and their specialities / Rapid Access Chest Pain Clinic',
  text: `Speciality: Cardiology
Clinic type: Rapid Access Chest Pain
Priority: Urgent`,
};

// Not under the pathways section, however much it looks like one.
const ELSEWHERE = {
  docTitle: 'Notebook: Front desk / Useful notes',
  text: 'Speciality: Podiatry\nClinic type: Nail Surgery',
};

const PAGES = [VASCULAR, TABLE, LIST, RACPC, ELSEWHERE];
const flat = (card) => JSON.stringify(card);

test('only pages under the Referral pathways section are read as pathways', () => {
  assert.ok(isPathwayPage(VASCULAR));
  assert.ok(isPathwayPage(LIST));
  assert.equal(isPathwayPage(ELSEWHERE), false);
  const names = readPathways(PAGES).map((e) => e.name);
  assert.ok(names.includes('Vascular surgery'));
  assert.ok(names.includes('Hernia'));
  assert.ok(names.includes('Rheumatology'));
  assert.ok(!names.some((n) => /Podiatry|Useful notes/.test(n)));
});

test('a page per referral: the title names it and the labelled lines fill the card', () => {
  const card = referralAnswer({ question: 'how do I refer for vascular surgery', name: 'vascular surgery', pages: PAGES });
  assert.match(card.title, /Vascular surgery referral/);
  assert.match(flat(card), /Vascular Surgery/);
  assert.match(flat(card), /Varicose Veins/);
  assert.match(flat(card), /Royal London Hospital/);
  assert.match(flat(card), /names the side/);
  assert.ok(card.source.includes(VASCULAR.docTitle), 'the page it came from is on the card');
  assert.doesNotMatch(card.subtitle, /Not recorded/);
});

test('a table row is a pathway, matched by the name the model read', () => {
  const entry = findPathwayReferral({ name: 'hernia', pages: PAGES });
  assert.equal(entry.specialty, 'Not Otherwise Specified');
  assert.equal(entry.clinicType, 'Hernias');
  assert.equal(entry.route, 'ers');
});

test('a 2WW row keeps 2WW in both boxes and is flagged as cancer', () => {
  const card = referralAnswer({ question: '2ww skin cancer referral', name: 'skin cancer', pages: PAGES });
  const fields = card.blocks.find((b) => b.type === 'fields').items;
  assert.equal(fields.find((f) => f.label === 'Speciality').value, '2WW');
  assert.equal(fields.find((f) => f.label === 'Clinic type').value, '2WW Dermatology');
  assert.match(card.warn, /2WW/);
});

test('a list line is a pathway: name, speciality, clinic type', () => {
  const entry = findPathwayReferral({ name: 'rheumatology', pages: PAGES });
  assert.equal(entry.specialty, 'Rheumatology');
  assert.equal(entry.clinicType, 'Inflammatory Arthritis');
  const salt = findPathwayReferral({ name: 'speech and language', pages: PAGES });
  assert.equal(salt.specialty, 'Speech and Language Therapy / Adult');
});

test('the practice page outranks the copy in code when both record a referral', () => {
  const card = referralAnswer({ question: 'racpc referral', name: 'rapid access chest pain clinic', pages: PAGES });
  assert.match(flat(card), /Rapid Access Chest Pain/);
  assert.doesNotMatch(flat(card), /Ischaemic Heart Disease/);
  assert.ok(card.source.includes(RACPC.docTitle));
});

test('matched from the question when the model named nothing', () => {
  const entry = findPathwayReferral({ name: '', question: 'how do I do a hernia referral', pages: PAGES });
  assert.equal(entry.name, 'Hernia');
});

test('without a pathway page the code list still answers as before', () => {
  const card = referralAnswer({ question: 'racpc referral', name: 'racpc', pages: [ELSEWHERE] });
  assert.match(flat(card), /Ischaemic Heart Disease/);
});

test('nothing recorded anywhere is still the honest card', () => {
  const card = referralAnswer({ question: 'how do I refer for hyperbaric oxygen', name: 'hyperbaric oxygen', pages: PAGES });
  assert.match(card.subtitle, /Not recorded/);
});
