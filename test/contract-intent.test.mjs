import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contractFromWeb, contractIntentPrompt, contractIntentQuery, contractsForTemplate, pcitPages,
  resolvePick, sourceLines, templateNames, templateRoster, templatesOf, webNameCandidates,
} from '../lib/agent/contract-intent.mjs';
import { findContracts, nelContracts } from '../lib/referrals/nel-contracts.mjs';
import { contractNotFound, contractReasonedAnswer } from '../lib/templates/contracts.mjs';

// Contract template answers from the NEL Local Contract Specifications, and
// reception do not ask in that document's words: "B12 injection" is the name of
// no contract and of no template, and appears nowhere on the page. It is INSIDE
// one of the templates — a template is a page set holding dozens of entries —
// and which one is a question about meaning, which a string match cannot answer.
//
// So a miss searches the web and asks a model which template holds the job. The
// model PICKS A NAME OFF THE DOCUMENT. It never writes one, and these tests are
// mostly about that line holding: what comes back is thrown away unless it is on
// the document character for character.

const contracts = nelContracts().contracts;
const WOUND = contracts.find((c) => c.specification === 'Simple Wound Care Service');
const TREATMENT_ROOM = 'OneTemplate NonPrescriber (Treatment Room page)';

/* ------------------------------------------------- what the web is asked */

test('the web is asked about commissioning, not about the condition', () => {
  const query = contractIntentQuery('B12 injection');
  assert.match(query, /"B12 injection"/);
  assert.match(query, /North East London/);
  assert.match(query, /enhanced service/i);
  assert.match(query, /EMIS Web/);
  // The clinical question is not what anybody asked.
  assert.doesNotMatch(query, /symptom|deficiency|treatment for/i);
});

/* ------------------------------------------- what the model is handed */

test('the templates are what is offered, each with what it records', () => {
  // The question is which template to OPEN. The 42 rows name 37 distinct
  // templates between them, and one template records several contracts — the
  // Treatment Room page carries three, the Local Contracts page five.
  const roster = templateRoster(contracts);
  const names = templateNames(contracts);
  assert.equal(roster.split('\n').length, names.length);
  assert.match(roster, /OneTemplate NonPrescriber \(Wound Care page\) — records: Simple Wound Care Service/);
  assert.match(roster, new RegExp(TREATMENT_ROOM.replace(/[()]/g, '\\$&') + ' — records: .+;'));
  // "TBC" and "N/A" are how the document says there is no template. Neither is
  // a thing to open in EMIS, so neither is ever offered as one.
  assert.ok(!names.includes('TBC'));
  assert.ok(!names.includes('N/A'));
  assert.equal(templatesOf({ templates: ['N/A', 'TBC'] }).length, 0);
});

test('a template knows which contracts it records', () => {
  const rows = contractsForTemplate(TREATMENT_ROOM, contracts);
  assert.ok(rows.length >= 2, 'the treatment room page records more than one contract');
  for (const row of rows) assert.ok(row.templates.includes(TREATMENT_ROOM));
});

test('the prompt asks which template holds the job, and forbids inventing one', () => {
  const prompt = contractIntentPrompt({
    asked: 'B12 injection',
    roster: templateRoster(contracts),
    web: 'Something the web said.',
  });
  assert.match(prompt, /B12 injection/);
  assert.match(prompt, /copied exactly/i);
  assert.match(prompt, /Never invent a template, a page name, a contract or a status/);
  assert.match(prompt, /Something the web said\./);
  // Why the answer is a template and not a contract, said in the prompt itself.
  assert.match(prompt, /page set holding dozens of entries/);
  // Refusing is the safe-looking move for a model and the useless one for a
  // reader with the job in front of them.
  assert.match(prompt, /Choose the most likely one/);
  assert.match(prompt, /is not helped by silence/);
  // Clinical work always has a template, even when no contract names the task —
  // "ear syringing" is a treatment room job and belongs on the treatment room
  // page. The empty answer is for things that are not clinical work at all.
  assert.match(prompt, /Clinical work done in the practice always has a template/);
  assert.match(prompt, /a passport countersignature, a room booking, an invoice/);
  // Worked examples, each a template on this document reached from desk words.
  assert.match(prompt, /dressing change.*Wound Care page/);
  assert.match(prompt, /taking bloods.*Phlebotomy page/);
});

test('a prompt with no web result simply has no web section', () => {
  const prompt = contractIntentPrompt({ asked: 'B12 injection', roster: '- A — records: B' });
  assert.doesNotMatch(prompt, /WHAT A WEB SEARCH FOUND/);
  assert.match(prompt, /THE TEMPLATES/);
});

/* ------------------------------------- what the model is allowed to return */

test('a template copied off the document is kept, with what it records', () => {
  const resolved = resolvePick({
    pick: {
      template: TREATMENT_ROOM,
      specification: 'Phlebotomy',
      confident: true,
      why: 'Injections given in the treatment room are recorded there.',
    },
    contracts,
  });
  assert.equal(resolved.template, TREATMENT_ROOM);
  assert.equal(resolved.contract.specification, 'Phlebotomy');
  assert.ok(resolved.records.length >= 2, 'the other contracts it records come off the document');
  assert.equal(resolved.confident, true);
});

test('a template nobody published is thrown away', () => {
  for (const template of ['OneTemplate Nurse (B12 page)', 'Treatment Room', '', '   ']) {
    assert.equal(resolvePick({ pick: { template }, contracts }), null,
      `"${template}" should not resolve to a template`);
  }
  // Including the document's two words for "there isn't one".
  assert.equal(resolvePick({ pick: { template: 'N/A' }, contracts }), null);
  assert.equal(resolvePick({ pick: { template: 'TBC' }, contracts }), null);
});

test('a contract the template does not record is dropped, and the template survives', () => {
  const resolved = resolvePick({
    pick: { template: TREATMENT_ROOM, specification: 'Duty Doctor' },
    contracts,
  });
  // The template is real, so it is answered; the pairing was invented, so it is
  // not shown. A right template under a wrong contract is worse than a right
  // template on its own.
  assert.equal(resolved.template, TREATMENT_ROOM);
  assert.equal(resolved.contract, null);
});

test('a template that records exactly one contract needs nobody to say which', () => {
  const resolved = resolvePick({ pick: { template: 'OneProcedure (Wound Care page)' }, contracts });
  assert.equal(resolved.contract.specification, 'Simple Wound Care Service');
});

test('case and stray space are forgiven, nothing else is', () => {
  const resolved = resolvePick({
    pick: { template: '  ' + TREATMENT_ROOM.toUpperCase() + '  ' },
    contracts,
  });
  assert.equal(resolved.template, TREATMENT_ROOM, 'shown as the document writes it');
});

/* ------------------------------------------------------------- the card */

test('the card answers with the template, and says it was worked out', () => {
  const card = contractReasonedAnswer({
    template: TREATMENT_ROOM,
    records: contractsForTemplate(TREATMENT_ROOM, contracts),
    contract: contracts.find((c) => c.specification === 'Phlebotomy'),
    why: 'Injections given by a nurse in the treatment room are recorded there.',
    confident: false,
    sources: ['Wound care service — northeastlondon.icb.nhs.uk'],
  });
  // The template is the answer, so it is the title and the copyable field.
  assert.equal(card.title, TREATMENT_ROOM);
  assert.match(card.subtitle, /most likely for what you asked/);
  assert.equal(card.blocks[0].type, 'note');
  assert.equal(card.blocks[0].tone, 'warn');
  assert.match(card.blocks[0].text, /a template holds many pages/i);
  assert.match(JSON.stringify(card.blocks), /Template to open/);
  assert.match(JSON.stringify(card.blocks), /This template records/);
  assert.match(JSON.stringify(card.blocks), /northeastlondon\.icb\.nhs\.uk/);
  // Provenance is the document, not the web.
  assert.match(JSON.stringify(card.source), /NEL Local Contract Specifications/);
});

test('a confident match is stated rather than hedged', () => {
  const card = contractReasonedAnswer({
    template: 'OneProcedure (Wound Care page)',
    contract: WOUND,
    confident: true,
    why: 'The template is the wound care page.',
  });
  assert.equal(card.blocks[0].tone, 'info');
  assert.doesNotMatch(card.blocks[0].text, /check the entry is there/i);
  assert.match(JSON.stringify(card.blocks), /Simple Wound Care Service/);
});

test('no template means no card, so the honest miss stands', () => {
  assert.equal(contractReasonedAnswer({ template: '' }), null);
  assert.equal(contractReasonedAnswer(), null);
});

/* ------------------------------- the web's own words, back on the document */

// A model that will not choose is not the same as a document with nothing on
// it. "Dressing change" came back as no contract while "Simple Wound Care
// Service" sat in the list the model had just read — and the search had returned
// a page titled "Wound care service — NHS North East London", which is the
// answer said out loud. So the names the search used are run back through the
// document's own matcher.

test('the names the search used are pulled out of titles and bullets', () => {
  const candidates = webNameCandidates({
    summary: '- Wound care service: dressings are done under a local contract.',
    results: [
      { title: 'Wound care service - NHS North East London', url: 'https://northeastlondon.icb.nhs.uk/x' },
      { title: 'How to change a simple wound dressing', url: 'https://example.nhs.uk/y' },
    ],
  });
  // The site half of a title is not part of the name of a service.
  assert.ok(candidates.includes('Wound care service'), candidates.join(' | '));
  assert.ok(!candidates.some((c) => /NHS North East London$/.test(c)));
});

test('a name the web used reaches the row the document calls it', () => {
  const bridged = contractFromWeb({
    web: { results: [{ title: 'Wound care service - NHS North East London', url: 'https://a.nhs.uk/x' }] },
    lookup: (candidate) => findContracts(candidate),
  });
  assert.equal(bridged.contract.specification, 'Simple Wound Care Service');
  assert.equal(bridged.named, 'Wound care service');
  // And that row's own templates are what the reader is then given.
  assert.equal(templatesOf(bridged.contract)[0], 'OneTemplate NonPrescriber (Wound Care page)');
});

test('a loose web name reaches nothing, because a guess about a guess must not be confident', () => {
  const bridged = contractFromWeb({
    web: { results: [{ title: 'Vitamin B12 or folate deficiency anaemia - Treatment - NHS', url: 'https://nhs.uk/x' }] },
    lookup: (candidate) => findContracts(candidate),
  });
  assert.equal(bridged, null);
});

/* ------------------------ what Primary Care IT publish outside the list */

test('PCIT pages are read off the search results, by host', () => {
  const pages = pcitPages([
    { title: 'Injection: B12 Template - Primary Care IT | Knowledge base', url: 'https://support.primarycareit.co.uk/portal/en-gb/kb/articles/injection-b12-template' },
    { title: 'Vitamin B12 injection', url: 'https://parnellpharmacy.co.uk/vitamin-b12-injection/' },
    { title: 'Not a URL', url: 'nonsense' },
  ]);
  assert.deepEqual(pages, ['Injection: B12 Template - Primary Care IT | Knowledge base']);
});

test('the miss card carries them, and still says the document had nothing', () => {
  const card = contractNotFound('b12 injection', { pcit: ['Injection: B12 Template'] });
  assert.match(card.title, /no contract by that name/);
  assert.match(JSON.stringify(card.blocks), /outside the contract list/);
  assert.match(JSON.stringify(card.blocks), /Injection: B12 Template/);
  // The provenance is still the document. The PCIT pages are a signpost, not a row.
  assert.match(JSON.stringify(card.source), /NEL Local Contract Specifications/);
});

test('with no PCIT pages the miss card is exactly what it was', () => {
  assert.deepEqual(contractNotFound('printer toner'), contractNotFound('printer toner', { pcit: [] }));
});

/* ---------------------------------------------------- what was read */

test('sources are named by page and host, and capped', () => {
  const lines = sourceLines([
    { url: 'https://www.northeastlondon.icb.nhs.uk/services/x', title: 'Local services' },
    { url: 'https://support.primarycareit.co.uk/portal/a', title: 'OneTemplate pages' },
    { url: 'not a url', title: 'Untitled page' },
    { url: 'https://a.example/1', title: 'One' },
    { url: 'https://b.example/2', title: 'Two' },
    { url: 'https://c.example/3', title: 'Three' },
  ]);
  assert.equal(lines.length, 4);
  assert.equal(lines[0], 'Local services — northeastlondon.icb.nhs.uk');
  assert.equal(lines[1], 'OneTemplate pages — support.primarycareit.co.uk');
  assert.equal(lines[2], 'Untitled page', 'a URL that will not parse still shows its title');
});
