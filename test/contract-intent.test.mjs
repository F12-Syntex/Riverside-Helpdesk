import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contractFromWeb, contractIntentPrompt, contractIntentQuery, contractRoster, pcitPages,
  resolvePick, sourceLines, webNameCandidates,
} from '../lib/agent/contract-intent.mjs';
import { findContracts, nelContracts } from '../lib/referrals/nel-contracts.mjs';
import { contractNotFound, contractReasonedAnswer } from '../lib/templates/contracts.mjs';

// Contract template answers from the NEL Local Contract Specifications, and
// reception do not ask in that document's words: "B12 injection" is not the name
// of any of the 42 contracts and appears nowhere on the page. The string match
// says so, correctly, and then a web search and a model work out which row it
// belongs under.
//
// The model PICKS A ROW. It never writes one. These tests are almost entirely
// about that line holding: what comes back is thrown away unless it is on the
// document, character for character.

const contracts = nelContracts().contracts;
const WOUND = contracts.find((c) => c.specification === 'Simple Wound Care Service');

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

test('every row of the document is offered, with its templates', () => {
  const roster = contractRoster(contracts);
  assert.equal(roster.split('\n').length, contracts.length);
  assert.match(roster, /Simple Wound Care Service \[NEL-Wide Specifications\]/);
  assert.match(roster, /OneTemplate NonPrescriber/);
  // Another borough's localisation is offered too — being told "that one is
  // Tower Hamlets" beats being told nothing.
  assert.ok(contracts.some((c) => !/NEL-Wide|City & Hackney/.test(c.area)));
});

test('the prompt asks for the row the task is delivered under, and forbids inventing one', () => {
  const prompt = contractIntentPrompt({
    asked: 'B12 injection',
    roster: contractRoster(contracts),
    web: 'Something the web said.',
  });
  assert.match(prompt, /B12 injection/);
  assert.match(prompt, /copied exactly/i);
  assert.match(prompt, /Never invent a contract, a template, a page name or a status/);
  assert.match(prompt, /Something the web said\./);
  // Refusing is the safe-looking move for a model and the useless one for the
  // reader: the empty answer is kept for tasks that are plainly not one of these
  // services, and the prompt says so in those words.
  assert.match(prompt, /plainly none of these 42 services/);
  assert.match(prompt, /Do not return empty merely because the words are not on the list/);
  // And three worked examples, each a row on this document reached from desk words.
  assert.match(prompt, /dressing change.*Simple Wound Care Service/);
});

test('a prompt with no web result simply has no web section', () => {
  const prompt = contractIntentPrompt({ asked: 'B12 injection', roster: '- A [X]' });
  assert.doesNotMatch(prompt, /WHAT A WEB SEARCH FOUND/);
  assert.match(prompt, /THE LIST/);
});

/* ------------------------------------- what the model is allowed to return */

test('a specification copied off the document is kept', () => {
  const resolved = resolvePick({
    pick: {
      specification: 'Simple Wound Care Service',
      template: WOUND.templates[0],
      confident: true,
      why: 'Dressings are recorded under it.',
    },
    contracts,
  });
  assert.equal(resolved.contract.specification, 'Simple Wound Care Service');
  assert.equal(resolved.template, WOUND.templates[0]);
  assert.equal(resolved.confident, true);
});

test('a specification nobody published is thrown away', () => {
  for (const specification of ['B12 Injection Service', 'Simple Wound Care', '', '   ']) {
    assert.equal(resolvePick({ pick: { specification }, contracts }), null,
      `"${specification}" should not resolve to a row`);
  }
});

test('a template the row does not list is dropped, and the row survives', () => {
  const resolved = resolvePick({
    pick: { specification: 'Simple Wound Care Service', template: 'OneTemplate Nurse (B12 page)' },
    contracts,
  });
  // The contract is real, so it is answered; the page name was invented, so it
  // is not shown at all. A right contract with a made-up page is worse than a
  // right contract with no page.
  assert.equal(resolved.contract.specification, 'Simple Wound Care Service');
  assert.equal(resolved.template, '');
});

test('case and stray space are forgiven, nothing else is', () => {
  const resolved = resolvePick({
    pick: { specification: '  simple wound care service  ', template: WOUND.templates[0].toUpperCase() },
    contracts,
  });
  assert.equal(resolved.contract.specification, 'Simple Wound Care Service');
  assert.equal(resolved.template, WOUND.templates[0], 'the template is shown as the document writes it');
});

/* ------------------------------------------------------------- the card */

test('a reasoned card says it was reasoned, and still comes off the document', () => {
  const card = contractReasonedAnswer({
    contract: WOUND,
    template: WOUND.templates[0],
    why: 'Dressings done by the HCA are recorded under it.',
    confident: false,
    sources: ['NEL wound care specification — nhs.uk'],
  });
  assert.equal(card.title, 'Simple Wound Care Service');
  assert.match(card.subtitle, /matched by meaning/);
  // It leads with the warning, names the page to open, and shows what it read.
  assert.equal(card.blocks[0].type, 'note');
  assert.match(card.blocks[0].text, /not named in the question/i);
  assert.match(card.blocks[0].text, /check it before recording/i);
  assert.match(JSON.stringify(card.blocks), /Template page to open/);
  assert.match(JSON.stringify(card.blocks), /nhs\.uk/);
  // And the provenance is still the document, not the web.
  assert.match(JSON.stringify(card.source), /NEL Local Contract Specifications/);
});

test('a confident match is stated rather than hedged, and never invented', () => {
  const card = contractReasonedAnswer({ contract: WOUND, confident: true, why: 'The specification says so.' });
  assert.equal(card.blocks[0].tone, 'info');
  assert.doesNotMatch(card.blocks[0].text, /check it before recording/i);
  assert.doesNotMatch(JSON.stringify(card.blocks), /Template page to open/, 'no page was picked, so none is shown');
});

test('no contract means no card, so the honest miss stands', () => {
  assert.equal(contractReasonedAnswer({ contract: null }), null);
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
    summary: '- Wound care service: dressings are done under a local contract.\n- Practices claim per dressing.',
    results: [
      { title: 'Wound care service - NHS North East London', url: 'https://northeastlondon.icb.nhs.uk/x' },
      { title: 'How to change a simple wound dressing', url: 'https://example.nhs.uk/y' },
    ],
  });
  // The site half of a title is not part of the name of a service.
  assert.ok(candidates.includes('Wound care service'), candidates.join(' | '));
  assert.ok(candidates.some((c) => c.startsWith('Wound care service: dressings')
    || c === 'Wound care service'));
  assert.ok(!candidates.some((c) => /NHS North East London$/.test(c)));
});

test('a name the web used reaches the row the document calls it', () => {
  const bridged = contractFromWeb({
    web: { results: [{ title: 'Wound care service - NHS North East London', url: 'https://a.nhs.uk/x' }] },
    lookup: (candidate) => findContracts(candidate),
  });
  assert.equal(bridged.contract.specification, 'Simple Wound Care Service');
  assert.equal(bridged.named, 'Wound care service');
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
