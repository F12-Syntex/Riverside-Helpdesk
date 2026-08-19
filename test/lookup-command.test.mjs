import test from 'node:test';
import assert from 'node:assert/strict';
import { ASK_WORDS, askedFor } from '../lib/referrals/ask.mjs';
import { findReferralForms } from '../lib/referrals/nel-tree.mjs';
import { findContracts } from '../lib/referrals/nel-contracts.mjs';
import { formCommandAnswer, templateCommandAnswer } from '../lib/templates/lookup-command.mjs';
import { MODES, isMode, modeIcon } from '../lib/commands.mjs';

// Two things are guarded here.
//
// One: the words that did the asking must not count towards the bar an answer
// has to clear. Both lookups raise that bar with every word typed, which is what
// stops a weak match becoming a confident wrong form — and it was counting
// "which", "do I use" and "template" as though they named something, so "which
// template for ADHD" was answered "no contract by that name".
//
// Two: each command has ONE document and reads nothing else. Referral form is
// PCIT's "NEL Referral Tree introduction & document list (EMIS Web)"; Contract
// template is PCIT's "NEL Local Contract Specifications". Not the practice's
// Notebook, not each other's document, and no model.

/* ------------------------------------------------- the asking, separated */

test('the asking words go, the clinical words stay', () => {
  assert.equal(askedFor('which template for adhd'), 'adhd');
  assert.equal(askedFor('what form do I use for suspected skin cancer'), 'suspected skin cancer');
  assert.equal(askedFor('retinal screening template'), 'retinal screening');
  // Words that look like filler and are not: every one of these is in a real
  // row's name, and dropping them would lose the row.
  assert.equal(askedFor('simple wound care service'), 'simple wound care service');
  assert.equal(askedFor('adhd shared pathway'), 'adhd shared pathway');
  assert.equal(askedFor('cervical screening'), 'cervical screening');
});

test('a query made only of asking words is left alone', () => {
  // There is nothing else to search with, and searching for nothing is worse
  // than searching for the word that was typed.
  assert.equal(askedFor('template'), 'template');
  assert.equal(askedFor('which form'), 'which form');
  assert.equal(askedFor(''), '');
});

test('nothing clinical is on the list of asking words', () => {
  const clinical = ['screening', 'service', 'pathway', 'care', 'check', 'clinic', 'adult', 'children', 'urgent', 'cancer'];
  for (const word of clinical) {
    assert.equal(ASK_WORDS.has(word), false, `${word} is not an asking word`);
  }
});

/* -------------------------------------------- the bar, counted correctly */

test('asking in English finds what asking in list-speak finds', () => {
  // Four words about one contract. The bar used to be 200 for an answer worth
  // 108, and the card said no contract had that name.
  assert.ok(findContracts('which template for adhd').matches.length);
  assert.ok(findReferralForms('what form do I use for adhd').matches.length);
  assert.equal(
    findReferralForms('form for a dexa scan').matches[0].name,
    findReferralForms('dexa scan').matches[0].name,
  );
});

test('the extra words still narrow rather than widen', () => {
  // Trimming must not turn a specific query into a loose one: two clinical words
  // are still two words, and both still have to earn their place.
  assert.equal(findReferralForms('passport renewal').matches.length, 0);
  assert.equal(findContracts('printer toner').matches.length, 0);
});

test('a form named outright is still one form, not a shortlist of two', () => {
  // The row's own name is never trimmed. Nearly every row ends "Referral Form",
  // so trimming it would let one clinical word name a row outright and hide the
  // second, real answer.
  const forms = findReferralForms('vasectomy');
  assert.equal(forms.confident, false);
  assert.ok(forms.matches.length >= 2);
});

/* ------------------------------------------------- one document each */

// Referral form reads PCIT's "NEL Referral Tree introduction & document list
// (EMIS Web)". Contract template reads PCIT's "NEL Local Contract
// Specifications". Neither reads the practice's Notebook, neither reads the
// other's document, and neither calls a model — so a miss is reported as a
// miss, on a card naming the document that was searched and the day it was
// captured.

const NL = String.fromCharCode(10);
const sourceOf = (card) => JSON.stringify(card.source || []);
const leadNote = (card) => (card.blocks[0] && card.blocks[0].type === 'note' ? card.blocks[0].text : '');

test('Referral form answers only out of the NEL Referral Tree', () => {
  for (const query of ['suspected skin cancer', 'tongue tie', 'printer toner', '']) {
    const card = formCommandAnswer({ query });
    assert.match(sourceOf(card), /NEL Referral Tree introduction & document list \(EMIS Web\)/,
      `"${query}" did not name the referral tree`);
    assert.doesNotMatch(sourceOf(card), /Local Contract Specifications/);
  }
});

test('Contract template answers only out of the NEL Local Contract Specifications', () => {
  for (const query of ['simple wound care', 'adhd shared pathway', 'printer toner', '']) {
    const card = templateCommandAnswer({ query });
    assert.match(sourceOf(card), /NEL Local Contract Specifications/,
      `"${query}" did not name the contract specifications`);
    assert.doesNotMatch(sourceOf(card), /Referral Tree/);
  }
});

test('a document that has nothing says so, and does not try the other one', () => {
  // "Retinal screening" is on the referral tree and is not a contract; "wound
  // care" is a contract and is not on the tree. Each command reports its own
  // document's miss rather than answering out of the other's.
  const template = templateCommandAnswer({ query: 'retinal screening' });
  assert.match(template.title, /no contract by that name/);
  assert.doesNotMatch(JSON.stringify(template), /retinal-eye screening/);

  const form = formCommandAnswer({ query: 'housebound winter vacs' });
  assert.match(form.title, /no form by that name/);
  assert.doesNotMatch(JSON.stringify(form), /Housebound Check and Winter Vaccination/);
});

test('neither command reads the practice Notebook', () => {
  // Contract template returned a page the practice wrote about diabetic eye
  // screening, headed "From the Notebook", for a question about which EMIS
  // template records a contract. Referral form did the same with the
  // emailed-referrals page. Pages are passed here and must be ignored.
  const pages = [
    { docTitle: 'Diabetic eye screening referral', text: '- Screening referrals go by email' },
    { docTitle: 'Referrals sent by email', text: ['These go by email:', '- District nurse'].join(NL) },
  ];
  const template = templateCommandAnswer({ query: 'diabetic eye screening', pages });
  assert.doesNotMatch(JSON.stringify(template), /Notebook/);
  assert.match(sourceOf(template), /NEL Local Contract Specifications/);

  const form = formCommandAnswer({ query: 'district nurse', pages });
  assert.doesNotMatch(JSON.stringify(form), /Notebook/);
  assert.match(sourceOf(form), /NEL Referral Tree introduction/);
});

test('the card that says nothing was found names what was searched', () => {
  assert.match(leadNote(formCommandAnswer({ query: 'printer toner' })),
    /NEL Referral Tree introduction & document list \(EMIS Web\)/);
  assert.match(leadNote(formCommandAnswer({ query: 'printer toner' })), /this document and no other/);
  // Contract template reads two of Primary Care IT's documents now — the
  // contract list and the OneTemplate page specifications — so its card names
  // both, and still says that nothing outside PCIT was searched.
  assert.match(leadNote(templateCommandAnswer({ query: 'printer toner' })),
    /NEL Local Contract Specifications/);
  assert.match(leadNote(templateCommandAnswer({ query: 'printer toner' })),
    /OneTemplate page specifications/);
  assert.match(leadNote(templateCommandAnswer({ query: 'printer toner' })),
    /Primary Care IT’s documents and no others/);
});

test('an empty query cannot reach either document', () => {
  assert.match(formCommandAnswer({ query: '' }).title, /no form by that name/);
  assert.match(templateCommandAnswer({ query: '   ' }).title, /no contract by that name/);
});

/* ------------------------------------------------------- the mode picker */

test('every mode carries an icon, and Q&A keeps the magnifying glass', () => {
  for (const mode of MODES) assert.ok(mode.icon, `${mode.label} has an icon`);
  assert.equal(modeIcon(''), 'search');
  assert.equal(new Set(MODES.map((m) => m.icon)).size, MODES.length, 'no two modes share a glyph');
});

test('only a real mode name survives coming back out of storage', () => {
  // The mode is kept in localStorage now, and it reaches the server as the
  // template to force: a name no command claims must be dropped.
  assert.equal(isMode(''), true);
  assert.equal(isMode('form'), true);
  assert.equal(isMode('document'), false, 'a hidden command is not a mode the picker offers');
  assert.equal(isMode('rm -rf'), false);
});
