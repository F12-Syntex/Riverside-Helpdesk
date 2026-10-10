import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERRAL_READ_SCHEMA, groundReferralRead, looksLikeReferral, referralReadPrompt } from '../lib/agent/referral-read.mjs';
import { shortlistText } from '../lib/search/shortlist.mjs';
import { referralCardFromRead } from '../lib/templates/referrals.mjs';

// THE GAP THIS FILE EXISTS FOR. The pairing a referral needs was got off the
// practice's pages by a parser that recognised three page shapes, so a page
// written any other way read as a page recording nothing — and a near miss on
// its word score drew the WRONG pairing with the same confidence as a right
// one. The model reads the page now, and everything it says it read is checked
// against that page before it reaches a card.

const PAGES = [
  {
    docTitle: 'Notebook: Referral pathways / Dietetics',
    text: [
      '# Dietetics',
      'Sent on e-RS.',
      'Speciality: Nutrition and Dietetics',
      'Clinic type: Dietetics - Adult',
      'Hospital: Homerton University Hospital',
    ].join('\n'),
  },
  {
    docTitle: 'Notebook: Referral pathways / Podiatry',
    text: [
      '# Podiatry',
      'Emailed to podiatry.referrals@nhs.net rather than sent on e-RS.',
    ].join('\n'),
  },
];

const READ = {
  found: true,
  page: 'Notebook: Referral pathways / Dietetics',
  name: 'Dietetics',
  route: 'ers',
  specialty: 'Nutrition and Dietetics',
  clinicType: 'Dietetics - Adult',
  priority: '',
  hospital: 'Homerton University Hospital',
  hospitalRule: '',
  emailAddress: '',
  form: '',
  note: '',
  alternatives: [],
};

test('a pairing written on the page survives the check', () => {
  const svc = groundReferralRead({ read: READ, pages: PAGES });
  assert.equal(svc.route, 'ers');
  assert.equal(svc.specialty, 'Nutrition and Dietetics');
  assert.equal(svc.clinicType, 'Dietetics - Adult');
  assert.equal(svc.hospital, 'Homerton University Hospital');
  assert.equal(svc.page, 'Notebook: Referral pathways / Dietetics');
  assert.deepEqual(svc.gaps, []);
});

test('a value that is NOT on the page is deleted and becomes a named gap', () => {
  // The failure this whole module is against: a speciality the model worked
  // out from the service name rather than read off the page.
  const svc = groundReferralRead({
    read: { ...READ, specialty: 'Gastroenterology' },
    pages: PAGES,
  });
  assert.equal(svc.specialty, '', 'an invented speciality must not reach the card');
  assert.deepEqual(svc.gaps, ['the Speciality to type into e-RS']);
  const card = referralCardFromRead(svc);
  const warn = card.blocks.find((b) => b && b.type === 'note' && b.tone === 'warn');
  assert.match(warn.text, /does not record the Speciality to type into e-RS/);
});

test('a page the Notebook does not have throws the whole read away', () => {
  const svc = groundReferralRead({
    read: { ...READ, page: 'Notebook: Referral pathways / Cardiology' },
    pages: PAGES,
  });
  assert.equal(svc, null, 'the caller keeps whatever it already had');
});

test('found: false is not an answer', () => {
  assert.equal(groundReferralRead({ read: { ...READ, found: false }, pages: PAGES }), null);
});

test('an emailed referral keeps its address and is drawn as the emailed card', () => {
  const svc = groundReferralRead({
    read: {
      ...READ,
      page: 'Notebook: Referral pathways / Podiatry',
      name: 'Podiatry',
      route: 'email',
      specialty: '',
      clinicType: '',
      hospital: '',
      emailAddress: 'podiatry.referrals@nhs.net',
    },
    pages: PAGES,
  });
  assert.equal(svc.email, 'podiatry.referrals@nhs.net');
  assert.deepEqual(svc.gaps, []);
  const card = referralCardFromRead(svc);
  assert.match(card.subtitle, /Sent by email/);
});

test('a page that does not say how it is sent gets the card that says so', () => {
  const svc = groundReferralRead({
    read: { ...READ, route: 'unclear' },
    pages: PAGES,
  });
  assert.equal(svc.gaps[0], 'whether this goes on e-RS or by email');
  const card = referralCardFromRead(svc);
  assert.equal(card.flag, 'route-unrecorded');
  assert.match(card.subtitle, /does not say whether this goes on e-RS or by email/);
  // The values the page DID record are still on it: a missing route is not a
  // reason to withhold the rest.
  const shown = card.blocks.find((b) => b && b.type === 'fields');
  assert.ok(shown.items.some((i) => i.value === 'Nutrition and Dietetics'));
});

test('the prompt embeds the Notebook text it is given, ahead of the message', () => {
  const a = referralReadPrompt({ name: 'x', question: 'q1', notebook: 'PAGES' });
  assert.ok(a.startsWith('THE PRACTICE NOTEBOOK'));
  assert.ok(a.includes('\nPAGES\n'));
  assert.ok(a.indexOf('PAGES') < a.indexOf('THE MESSAGE:'));
  // Everything but the message is the same from one question to the next.
  const b = referralReadPrompt({ name: 'x', question: 'q2', notebook: 'PAGES' });
  assert.equal(a.slice(0, a.indexOf('THE MESSAGE:')), b.slice(0, b.indexOf('THE MESSAGE:')));
});

test('the schema refuses a route it was not given', () => {
  assert.throws(() => REFERRAL_READ_SCHEMA.parse({ ...READ, route: 'fax' }));
});

// The read is handed the turn's shortlist: referral pages search ranked in
// full, every other page by title. A titles-only page cannot be read off, and
// the prompt says so.
const OTHERS = [
  { docId: 'note:90', docTitle: 'Notebook: Appointments / Flu vaccination booking', text: 'Book flu jabs in the nurse clinic.' },
];

test('the read sees shortlisted pages whole and is told titles-only pages cannot be read', () => {
  const all = [...PAGES.map((p, i) => ({ docId: 'note:' + (i + 1), ...p })), ...OTHERS];
  const shortlist = { full: false, pages: all.slice(0, PAGES.length), why: {} };
  const prompt = referralReadPrompt({ name: 'dietitian', question: 'dietitian referral', notebook: shortlistText(shortlist, all) });
  assert.ok(prompt.includes(PAGES[0].text.trim().split('\n')[0]), 'a shortlisted page is in full');
  assert.ok(prompt.includes('- Notebook: Appointments / Flu vaccination booking'), 'the other page is named');
  assert.ok(!prompt.includes('Book flu jabs'), 'and not shown');
  assert.match(prompt, /Read ONLY pages shown in full/);
});

test('the early read starts only for messages that say refer', () => {
  for (const q of ['how do I refer for an ECG', 'physio referral', 'ERS for derm', '2ww skin', 'Referring to OT']) {
    assert.ok(looksLikeReferral(q), q);
  }
  for (const q of ['how do I book a flu jab', 'what is a red slot', 'preferred pharmacy change']) {
    assert.ok(!looksLikeReferral(q), q);
  }
});

test('a read naming a page it was shown by title only is thrown away', () => {
  // The read is told it cannot read a titles-only page; if it names one
  // anyway, nothing it says came off that page, so nothing is grounded.
  const pages = PAGES.map((p, i) => ({ ...p, docId: `note:${i + 1}` }));
  assert.equal(groundReferralRead({ read: READ, pages, shown: new Set(['note:2']) }), null);
  assert.equal(groundReferralRead({ read: READ, pages, shown: new Set(['note:1']) }).specialty, 'Nutrition and Dietetics');
  // A whole-Notebook turn showed every page.
  assert.equal(groundReferralRead({ read: READ, pages, shown: null }).specialty, 'Nutrition and Dietetics');
});
