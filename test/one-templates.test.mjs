import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findTemplatePages, oneTemplates, templateByName, templatePages,
} from '../lib/referrals/one-templates.mjs';
import { templatePageAnswer } from '../lib/templates/template-pages.mjs';
import { templateCommandAnswer } from '../lib/templates/lookup-command.mjs';
import { contractReasonedAnswer, splitTemplateName } from '../lib/templates/contracts.mjs';

const flat = (card) => JSON.stringify(card);

/* ------------------------------------------------------------- the dataset */

test('the four PCIT documents are all in the dataset, with their date', () => {
  const data = oneTemplates();
  assert.equal(data.publisher, 'Primary Care IT');
  assert.match(data.capturedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(data.documents.map((d) => d.title).sort(), [
    'ARRS Templates',
    'Admin Templates',
    'EMIS OneTemplate Pages (DT003 v1.1)',
    'Non Prescriber Templates',
  ]);
});

test('every template names its launcher, and the big four carry their pages', () => {
  const data = oneTemplates();
  const by = (name) => data.templates.find((t) => t.name === name);
  for (const name of ['OneTemplate Admin', 'OneTemplate NonPrescriber', 'OneTemplate Prescriber', 'OneTemplate Acute']) {
    const template = by(name);
    assert.ok(template, `${name} is missing`);
    assert.ok(template.launcher, `${name} has no launcher`);
    assert.ok(template.pages.length > 15, `${name} has only ${template.pages.length} pages`);
  }
  // Every page belongs to a template and has a name — a page filed under
  // nothing is a reader sent nowhere.
  for (const row of templatePages()) {
    assert.ok(row.page && row.template, JSON.stringify(row));
  }
});

// The admin and nursing documents describe their pages; DT003 only lists them.
// The merge has to keep the description, whichever document it came from.
test('a page listed twice keeps the description the one document gave it', () => {
  const admin = templateByName('OneTemplate Admin');
  const firearms = admin.pages.find((p) => /firearm/i.test(p.name));
  assert.ok(firearms.detail, 'the firearms page lost its description');
  assert.equal(firearms.documents.length, 2, 'the two documents were not merged into one page');
});

/* -------------------------------------------------------------- the lookup */

// The whole point: these are the questions the contract list could never
// answer, because none of them is a commissioned service.
test('a job nobody commissions still finds its page', () => {
  for (const [asked, page, template] of [
    ['firearms', 'Firearm Requests', 'OneTemplate Admin'],
    ['ambulance', 'Ambulance', 'OneTemplate Admin'],
    ['sick note', 'Sick Note Requests', 'OneTemplate Admin'],
    ['spirometry', 'Spirometry', 'OneProcedure'],
    ['hay fever', 'Hay fever', 'OneTemplate Acute'],
  ]) {
    const found = findTemplatePages(asked);
    assert.ok(found.confident, `"${asked}" was not answered outright`);
    assert.equal(found.matches[0].page, page);
    assert.equal(found.matches[0].template, template);
  }
});

test('the asking words do not raise the bar', () => {
  // "which template do I use to record a home visit request" is one thing being
  // asked about and nine words of asking. See lib/referrals/ask.mjs.
  const found = findTemplatePages('which template do I use to record a home visit request');
  assert.match(found.matches[0].page, /Home Visit/i);
});

test('nothing matching is nothing, not the closest page in the file', () => {
  assert.equal(findTemplatePages('printer toner').matches.length, 0);
  assert.equal(findTemplatePages('').matches.length, 0);
  assert.equal(templatePageAnswer('printer toner'), null);
});

test('a page on several templates is one answer, not several', () => {
  const found = findTemplatePages('vaccinations');
  const top = found.matches[0];
  assert.match(top.page, /vaccination/i);
  // The other templates carrying the same page are listed beside it rather than
  // filling the shortlist with the same word four times.
  assert.ok(found.alsoOn.length >= 1, 'the other templates were dropped');
  for (const row of found.alsoOn) assert.equal(row.page.toLowerCase(), top.page.toLowerCase());
  for (const row of found.matches.slice(1)) assert.notEqual(row.page.toLowerCase(), top.page.toLowerCase());
});

/* ---------------------------------------------------------------- the card */

test('the card says where the page is, how to open it and what it records', () => {
  const card = templatePageAnswer('firearms request');
  assert.equal(card.title, 'Firearm Requests');
  assert.match(card.subtitle, /OneTemplate Admin/);
  assert.match(flat(card), /OneLauncher Admin/);
  assert.match(flat(card), /F12/);
  assert.match(flat(card), /firearms certificate request/);
  assert.deepEqual(card.source, ['Primary Care IT OneTemplate page specifications, as at 19 August 2026']);
});

// A page list says what exists. It does not say whether the work is paid for or
// how far PCIT have got building it, and a card that implied either would be
// the contract card's claim made without the contract card's document.
test('the page card carries no build status and no contract area', () => {
  const card = flat(templatePageAnswer('ambulance'));
  assert.doesNotMatch(card, /For Release|In Development|Awaiting Spec|\bQA\b/);
  assert.doesNotMatch(card, /Localisation|NEL-Wide/);
});

test('naming a template answers with its page list', () => {
  const card = templatePageAnswer('OneTemplate Admin');
  assert.equal(card.title, 'OneTemplate Admin');
  assert.match(card.subtitle, /^\d+ pages/);
  const rows = card.blocks.find((b) => b.type === 'table').rows;
  assert.equal(rows.length, templateByName('OneTemplate Admin').pages.length);
  assert.match(flat(card), /Firearm Requests/);
});

/* ------------------------------------------------------------- the command */

// The order is the argument: a commissioned contract answers as a contract,
// with the status and the date only the Sitrep can give. Everything else
// answers as a page.
test('Contract template searches the contract list first, then the pages', () => {
  const contract = templateCommandAnswer({ query: 'ADHD shared pathway' });
  assert.match(contract.subtitle, /as at 28 July 2026/);
  assert.match(flat(contract), /OneTemplate Prescriber/);

  const page = templateCommandAnswer({ query: 'firearms request' });
  assert.equal(page.title, 'Firearm Requests');
});

test('a miss says both of PCIT’s documents were searched, and still never reaches prose', () => {
  const card = templateCommandAnswer({ query: 'printer toner' });
  assert.match(card.title, /no contract by that name/);
  assert.match(flat(card), /OneTemplate page specifications/);
  for (const q of ['', '   ', 'zzzz']) {
    assert.ok(templateCommandAnswer({ query: q }).title, `"${q}" produced no card`);
  }
});

// The mode reads Primary Care IT's documents. It does not read the practice's
// Notebook, and it does not cross to the referral tree.
test('the page lookup is still PCIT only', () => {
  const card = flat(templateCommandAnswer({ query: 'wound care' }));
  assert.doesNotMatch(card, /Referral Tree/);
  assert.doesNotMatch(card, /From the Notebook/);
});

/* --------------------------------------------------- where to find it */

// The complaint this answers: being handed a template name and left to scroll.
// PCIT nest their lists — "Injections" is not a page, it is an entry on the
// Treatment Room page — and the card has to say so or the reader is no better
// off than with the template name alone.
test('an entry names the page it is on, not just the template', () => {
  const found = findTemplatePages('injections');
  assert.equal(found.matches[0].page, 'Injections');
  assert.equal(found.matches[0].heading, 'Treatment Room');
  assert.equal(found.matches[0].template, 'OneTemplate NonPrescriber');

  const card = templatePageAnswer('injections');
  assert.match(card.subtitle, /Treatment Room page of OneTemplate NonPrescriber/);
  const where = card.blocks.find((b) => b.type === 'fields');
  assert.equal(where.title, 'Where to find it');
  assert.deepEqual(where.items.slice(0, 4).map((i) => [i.label, i.value]), [
    ['Press', 'OneLauncher NonPrescriber'],
    ['Then open', 'OneTemplate NonPrescriber'],
    ['The page', 'Treatment Room'],
    ['On that page', 'Injections'],
  ]);
  assert.match(flat(card), /then the Treatment Room page/);
});

test('a page of its own says so rather than inventing a heading', () => {
  const card = templatePageAnswer('firearms request');
  assert.match(card.subtitle, /^A page on OneTemplate Admin/);
  const where = card.blocks.find((b) => b.type === 'fields');
  assert.deepEqual(where.items.slice(0, 3).map((i) => i.value),
    ['OneLauncher Admin', 'OneTemplate Admin', 'Firearm Requests']);
  assert.doesNotMatch(flat(card), /On that page/);
});

// The contract card names a template with the page in brackets. That bracket is
// now resolved against the page specifications, so the reader is told the
// launcher, the page and what is on it.
test('a contract card says where on the template, and what is listed there', () => {
  const card = contractReasonedAnswer({
    template: 'OneTemplate NonPrescriber (Treatment Room page)',
    why: 'B12 injection is a nurse-administered injection in the treatment room.',
  });
  const where = card.blocks.find((b) => b.type === 'fields' && /Where to find it/.test(b.title || ''));
  assert.ok(where, 'the card does not say where on the template');
  assert.deepEqual(where.items.map((i) => i.value),
    ['OneLauncher NonPrescriber', 'OneTemplate NonPrescriber', 'Treatment Room']);
  const listed = card.blocks.find((b) => b.type === 'bullets' && /Listed on the Treatment Room page/.test(b.title || ''));
  assert.ok(listed.items.includes('Injections'), 'the entries on that page are missing');
});

test('a template or page PCIT do not list says nothing rather than guessing', () => {
  const card = contractReasonedAnswer({ template: 'NEL Housebound Winter Vacs (Nonsense page)' });
  assert.ok(!card.blocks.some((b) => /Where to find it/.test(b.title || '')));
  assert.deepEqual(splitTemplateName('OneTemplate NonPrescriber (Wound Care page)'),
    { template: 'OneTemplate NonPrescriber', page: 'Wound Care' });
  assert.deepEqual(splitTemplateName('NEL Housebound Winter Vacs'),
    { template: 'NEL Housebound Winter Vacs', page: '' });
});
