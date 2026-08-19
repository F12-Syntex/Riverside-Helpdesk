import test from 'node:test';
import assert from 'node:assert/strict';
import { ASK_WORDS, askedFor } from '../lib/referrals/ask.mjs';
import { findReferralForms } from '../lib/referrals/nel-tree.mjs';
import { findContracts } from '../lib/referrals/nel-contracts.mjs';
import { formCommandAnswer, templateCommandAnswer } from '../lib/templates/lookup-command.mjs';
import { MODES, isMode, modeIcon } from '../lib/commands.mjs';

// Two things are guarded here, and both are about a reader who asked in English
// rather than in list-speak.
//
// One: the words that did the asking must not count towards the bar an answer
// has to clear. Both lookups raise that bar with every word typed, which is what
// stops a weak match becoming a confident wrong form — and it was counting
// "which", "do I use" and "template" as though they named something.
//
// Two: a command names the list to search FIRST, not the list to refuse. The
// report that produced this file was "retinal screening template — no contract
// by that name", when the referral tree has the form and always did.

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

/* ------------------------------------------------------ crossing the two */

const leadNote = (card) => (card.blocks[0] && card.blocks[0].type === 'note' ? card.blocks[0].text : '');

test('/template answers from the referral tree when no contract has the name', () => {
  const card = templateCommandAnswer({ query: 'retinal screening template' });
  assert.match(JSON.stringify(card), /retinal-eye screening/);
  assert.match(leadNote(card), /No NEL contract by that name/);
  assert.match(leadNote(card), /form to open in EMIS/);
});

test('/form answers from the contract list when the tree has nothing', () => {
  const card = formCommandAnswer({ query: 'housebound winter vacs' });
  assert.match(JSON.stringify(card), /Housebound Check and Winter Vaccination/);
  assert.match(leadNote(card), /Nothing on the NEL Referral Tree matches/);
  assert.match(leadNote(card), /not a referral form/);
});

test('a list that answers outright is not crossed and says nothing about the other', () => {
  assert.equal(leadNote(formCommandAnswer({ query: 'suspected skin cancer' })), '');
  assert.equal(leadNote(templateCommandAnswer({ query: 'simple wound care' })), '');
});

test('this practice own row beats another borough row on the other list', () => {
  // The tree has a phlebotomy form for Waltham Forest and none for City &
  // Hackney; the contract list has this practice's own phlebotomy row.
  const card = formCommandAnswer({ query: 'phlebotomy' });
  assert.match(leadNote(card), /Nothing on the NEL Referral Tree matches/);
  assert.doesNotMatch(card.title, /not on this practice/);
});

test('a query neither list has still ends at a card that says so', () => {
  assert.match(formCommandAnswer({ query: 'printer toner' }).title, /no form by that name/);
  assert.match(templateCommandAnswer({ query: 'printer toner' }).title, /no contract by that name/);
  // And an empty query cannot reach either list.
  assert.match(formCommandAnswer({ query: '' }).title, /no form by that name/);
  assert.match(templateCommandAnswer({ query: '' }).title, /no contract by that name/);
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
