import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRACTICE_AREAS, buildContractIndex, findContracts, nelContracts, rankContracts,
} from '../lib/referrals/nel-contracts.mjs';
import { contractTemplateAnswer } from '../lib/templates/contracts.mjs';

// The contract-to-template mapping out of PCIT's mobilisation Sitrep. Two things
// are being guarded here. One is that the table was read correctly, which is
// harder than it sounds: its cells wrap over several lines, a row can straddle a
// page break, and reading it by vertical position merges rows silently. The other
// is that the STATUS column is never presented as current — it came off a daily
// bulletin that says of itself that the position changes through the week.

const data = nelContracts();

test('the dataset is the Sitrep: count, date and areas', () => {
  assert.equal(data.capturedAt, '2026-07-28');
  assert.equal(data.contracts.length, 42);
  assert.equal(data.clinicalSystem, 'EMIS Web');
  // 13 NEL-wide + 16 City & Hackney + 3 Newham + 6 Tower Hamlets + 2 Waltham
  // Forest + 2 BHR. They have to sum, or rows have been merged or lost.
  const byArea = {};
  for (const c of data.contracts) byArea[c.area] = (byArea[c.area] || 0) + 1;
  assert.deepEqual(byArea, {
    'NEL-Wide Specifications': 13,
    'City & Hackney Localisations': 16,
    'Newham Localisations': 3,
    'Tower Hamlets Localisations': 6,
    'Waltham Forest Localisations': 2,
    'Barking & Dagenham, Havering & Redbridge': 2,
  });
});

test('no row is prose or a table header that leaked in', () => {
  for (const c of data.contracts) {
    assert.ok(c.specification, 'a row with no specification');
    assert.notEqual(c.specification, 'Specifications');
    assert.ok(!/^As of close of business/.test(c.specification), `prose read as a row: ${c.specification}`);
    assert.ok(data.contracts.length && c.area, `row with no area: ${c.specification}`);
  }
});

// Read by nearest-column-within-tolerance, the en-dash of this specification is
// 53pt from one column edge and 47pt from the next, so it was dropped and the
// name silently changed. Cells belong to the column they start after, not the
// nearest one.
test('a cell that starts mid-column is still part of its cell', () => {
  const found = data.contracts.find((c) => c.specification.startsWith('Respiratory Diagnostics'));
  assert.equal(found.specification, 'Respiratory Diagnostics – Spirometry and Feno (Adults)');
});

test('template names are verbatim, including the several a row can name', () => {
  const byName = (spec) => data.contracts.find((c) => c.specification === spec);
  assert.equal(
    byName('NHS ADHD Shared Pathway for Ongoing Management of Care LES for Adults').templates,
    'OneTemplate Prescriber (Mental Health page) OneTemplate NonPrescriber (Mental Health page)',
  );
  assert.equal(
    byName('Simple Wound Care Service').templates,
    'OneTemplate NonPrescriber (Wound Care page) OneProcedure (Wound Care page)',
  );
  // Five templates on one row, across a page break.
  assert.match(
    byName('Latent Tuberculosis Infection (LTBI) Screening Programme').templates,
    /^Alert: TB screening for new patients Alert: TB screening for existing patients OneTemplate Contract \(TB Screening page\)/,
  );
});

test('a row the table leaves blank stays blank', () => {
  const anticoag = data.contracts.find((c) => c.specification === 'NEL Community Anticoagulation Service');
  assert.equal(anticoag.templates, 'TBC');
  assert.equal(anticoag.status, '');
});

/* ----------------------------------------------------------- the lookup */

test('a contract is found by the words staff would use', () => {
  for (const [asked, expected] of [
    ['ADHD shared pathway', 'NHS ADHD Shared Pathway for Ongoing Management of Care LES for Adults'],
    ['simple wound care', 'Simple Wound Care Service'],
    ['housebound winter vaccination', 'NHS NEL Housebound Check and Winter Vaccination Support'],
  ]) {
    const found = findContracts(asked);
    assert.ok(found.confident, `not confident about "${asked}"`);
    assert.equal(found.matches[0].specification, expected);
  }
});

test('a template name can be asked about too', () => {
  const found = findContracts('OneProcedure Wound Care page');
  assert.ok(found.matches.length);
  assert.equal(found.matches[0].specification, 'Simple Wound Care Service');
});

test('only this practice’s contract areas are its own', () => {
  assert.deepEqual(PRACTICE_AREAS, ['NEL-Wide Specifications', 'City & Hackney Localisations']);
  const found = findContracts('vulnerable children MDTs');
  assert.equal(found.matches.length, 0);
  assert.ok(found.elsewhere.length);
  for (const c of found.elsewhere) assert.ok(!PRACTICE_AREAS.includes(c.area));
});

test('a question the Sitrep has nothing for is answered with nothing', () => {
  for (const asked of ['printer toner', 'car park permit', 'annual leave']) {
    const found = findContracts(asked);
    assert.equal(found.matches.length, 0, `"${asked}" matched ${found.matches[0]?.specification}`);
    assert.equal(found.elsewhere.length, 0);
  }
});

test('the ranking works over invented rows', () => {
  const invented = [
    { area: 'NEL-Wide Specifications', specification: 'Widget Care Service', templates: 'OneTemplate Widget', status: 'QA' },
    { area: 'NEL-Wide Specifications', specification: 'Sprocket Screening', templates: 'OneTemplate Sprocket', status: 'For Release' },
  ];
  const index = buildContractIndex(invented);
  assert.equal(rankContracts(index, 'widget care')[0].specification, 'Widget Care Service');
  assert.equal(rankContracts(index, 'passport renewal').length, 0);
});

/* ------------------------------------------------------------- the card */

test('every card leads with the date the Sitrep was written', () => {
  const card = contractTemplateAnswer('simple wound care');
  assert.match(card.subtitle, /as at 28 July 2026/);
  assert.deepEqual(card.source, ['PCIT NEL PCCIF Contract Mobilisation Sitrep, 28 July 2026']);
});

test('the template name is verbatim and offered to copy', () => {
  const card = contractTemplateAnswer('simple wound care');
  const template = card.blocks.find((b) => b.type === 'fields').items.find((i) => i.label === 'Template');
  assert.equal(template.value, 'OneTemplate NonPrescriber (Wound Care page) OneProcedure (Wound Care page)');
  assert.equal(template.copy, true);
});

// The point of the whole module: a status weeks old must never read as current.
test('a status that is not released warns rather than asserts', () => {
  const card = contractTemplateAnswer('ADHD shared pathway');
  const warn = card.blocks.find((b) => b.type === 'note' && b.tone === 'warn');
  assert.match(warn.text, /As at 28 July 2026/);
  assert.match(warn.text, /QA/);
  assert.match(warn.text, /changes through the week/);
});

test('a released status still says when that was true', () => {
  const card = contractTemplateAnswer('simple wound care');
  assert.ok(card.blocks.some((b) => b.type === 'note' && /Released as at 28 July 2026/.test(b.text)));
});

test('"N/A" means no template, not an unknown status', () => {
  const card = contractTemplateAnswer('high intensity user scheme');
  assert.ok(card.blocks.some((b) => b.type === 'note' && /not recorded through an EMIS template/.test(b.text)));
  assert.ok(!card.blocks.some((b) => b.type === 'note' && /Ask PCIT where it stands/.test(b.text)));
});

test('PCIT’s details are on every card, so checking is one call', () => {
  for (const asked of ['simple wound care', 'vulnerable children MDTs']) {
    const card = contractTemplateAnswer(asked);
    assert.match(JSON.stringify(card.blocks), /support@primarycareit\.co\.uk/);
    assert.match(JSON.stringify(card.blocks), /0333 344 3678/);
  }
});

test('nothing found is null, so the caller can answer another way', () => {
  assert.equal(contractTemplateAnswer('printer toner'), null);
  assert.equal(contractTemplateAnswer(''), null);
});
