import test from 'node:test';
import assert from 'node:assert/strict';
import { findEmailedReferral, referralAnswer } from '../lib/templates/referrals.mjs';
import { renderSelection } from '../lib/templates/route.mjs';

// The practice's own page, in the shape the Notebook actually holds it.
//
// THE BUG THIS FILE EXISTS FOR. "Dietitian" is on this page. It was never in
// REFERRAL_SERVICES. So the assistant read the page correctly when asked what
// can be emailed, and answered "how do I do a dietitian referral" with "not
// recorded in the practice's notes" — asserting the practice has no process for
// something the practice had written down. That is worse than a gap: a gap is
// visible, and this was not.
const EMAIL_PAGE = {
  docTitle: 'Notebook: Referrals / Email Referrals',
  text: `These go by email instead of ERS. Create the document, then email it via Message → Message professional → attach EMIS file:

* ACERS
* ECG
* Echo
* Minor Surgery
* OT (Occupational Therapy)
* District / Community Nurse
* Hackney ARC
* CAMHS
* Healthy Together
* Social Prescriber
* Gym referrals
* Dietitian`,
};

const ERS_PAGE = {
  docTitle: 'Notebook: Referrals / Standard referral flow',
  text: 'Open e-RS, smartcard, referring clinician admin, then refer or seek advice.',
};

// A page that mentions a referral in passing. Mentioning is not listing.
const PROSE_PAGE = {
  docTitle: 'Notebook: Front desk / Opening times',
  text: 'The practice opens at 8am. Dietitian clinics run on Tuesdays. Email the team if unsure about a referral.',
};

const PAGES = [EMAIL_PAGE, ERS_PAGE, PROSE_PAGE];
const flat = (card) => JSON.stringify(card);

/* ------------------------------------------- the referral that was missed */

test('a referral the practice lists as emailed gets the email card, not "not recorded"', () => {
  const card = referralAnswer({ question: 'how do I do a dietitian referral', name: 'dietitian', pages: PAGES });
  assert.match(card.title, /Dietitian referral/);
  assert.match(card.subtitle, /Sent by email/);
  assert.doesNotMatch(flat(card), /Not recorded in the practice/);
  // The steps are the emailing ones, not the e-RS ones.
  assert.match(flat(card), /Message professional/);
  assert.doesNotMatch(flat(card), /Smartcard/);
});

test('the card names the page and quotes the line, rather than asserting it', () => {
  const card = referralAnswer({ question: 'dietitian referral', name: 'dietitian', pages: PAGES });
  assert.ok(card.source.includes(EMAIL_PAGE.docTitle), 'the page it came from is on the card');
  assert.match(flat(card), /list this among the referrals sent by email/);
  assert.match(flat(card), /“Dietitian”/, 'the practice’s own line, quoted, never reworded');
});

test('the practice’s wording titles the card, not the reader’s', () => {
  const found = findEmailedReferral({ name: 'occupational therapy', pages: PAGES });
  assert.equal(found.name, 'OT (Occupational Therapy)');
  assert.equal(found.page, EMAIL_PAGE.docTitle);
});

test('the reader’s trailing "referral" does not stop it matching', () => {
  for (const name of ['dietitian', 'Dietitian', 'dietitian referral', 'Dietitian referrals']) {
    assert.ok(findEmailedReferral({ name, pages: PAGES }), name + ' should match');
  }
});

test('a plural on the page still matches a singular ask', () => {
  // The page says "Gym referrals"; the reader says "gym".
  assert.ok(findEmailedReferral({ name: 'gym', pages: PAGES }));
});

/* -------------------------------------------------- what must NOT happen */

test('a prose mention is not a listing', () => {
  // "Dietitian clinics run on Tuesdays" is a fact about clinics, not a routing
  // rule, and the page it is on is not a list of emailed referrals.
  assert.equal(findEmailedReferral({ name: 'dietitian', pages: [PROSE_PAGE] }), null);
  assert.equal(findEmailedReferral({ name: 'dietitian', pages: [ERS_PAGE] }), null);
});

test('with no Notebook loaded it falls back rather than guessing', () => {
  assert.equal(findEmailedReferral({ name: 'dietitian', pages: [] }), null);
  // Without the page, the practice's own answer for "dietitian" is unavailable
  // — and nothing else on this path may stand in for it. Not an invented e-RS
  // pairing, which is what this test has always forbidden, and no longer the
  // NEL Referral Tree either: that document belongs to the Referral form mode,
  // so the card says the practice has not recorded it and names the mode that
  // searches the tree. Nothing is guessed either way.
  const card = referralAnswer({ question: 'how do I do a dietitian referral', name: 'dietitian', pages: [] });
  assert.match(card.subtitle, /Not recorded/);
  assert.doesNotMatch(JSON.stringify(card.source), /Referral Tree/);
  assert.match(flat(card), /choose Referral form/);
  assert.doesNotMatch(flat(card), /Smartcard/);

  // A name neither the practice nor the tree has is still the honest card.
  const nothing = referralAnswer({ question: 'how do I do a printer toner referral', name: 'printer toner', pages: [] });
  assert.match(nothing.subtitle, /Not recorded/);
});

test('a referral on no list at all still gets the honest card', () => {
  const card = referralAnswer({ question: 'how do I refer to vascular surgery', name: 'vascular surgery', pages: PAGES });
  assert.match(card.subtitle, /Not recorded in the practice’s notes/);
  assert.match(flat(card), /ask the secretaries or the referring GP/);
  // Never the standard steps with two blank boxes, which reads as an answer.
  assert.doesNotMatch(flat(card), /Smartcard/);
});

test('a recorded pairing beats a name on a list', () => {
  // The array records a speciality and clinic type for this one. That is more
  // specific than list membership and must win, or a referral with a known
  // pairing would be sent by email with the pairing thrown away.
  const card = referralAnswer({ question: 'how do I refer for a hernia', name: 'hernia', pages: PAGES });
  assert.match(card.subtitle, /Sent on e-RS/);
  assert.match(flat(card), /Hernias/);
});

test('an empty name cannot match anything', () => {
  // Fails toward the honest card: no name, no lookup, no claim.
  assert.equal(findEmailedReferral({ name: '', pages: PAGES }), null);
  assert.equal(findEmailedReferral({ name: '   ', pages: PAGES }), null);
  assert.equal(findEmailedReferral({ name: 'referral', pages: PAGES }), null);
});

/* ------------------------------------------------------ through the router */

test('the router passes the name and the Notebook through', () => {
  const card = renderSelection(
    { template: 'referral', referralService: 'none', referralName: 'dietitian' },
    'how do I do a dietitian referral',
    PAGES,
  );
  assert.match(card.title, /Dietitian referral/);
  assert.match(card.subtitle, /Sent by email/);
});

test('the router still answers when the model leaves the name empty', () => {
  // It falls back to stripping the question, which is worse but not nothing.
  const card = renderSelection(
    { template: 'referral', referralService: 'none', referralName: '' },
    'how do I do a dietitian referral',
    PAGES,
  );
  assert.match(card.subtitle, /Sent by email/);
});
