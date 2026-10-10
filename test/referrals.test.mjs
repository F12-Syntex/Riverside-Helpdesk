// The Referrals page: which pages it lists, what a row says, how a search is
// ranked and what the empty box shows. Pure rules, on an invented Notebook in
// the shape fullNotebookContext() returns.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFullNotebookSources } from '../lib/knowledge-context.mjs';
import {
  HUB_MIN_CARDS, MAX_RESULTS, MIN_RESULTS, alphabetical, filterReferrals, isHub, isLiveCard, pageTitle,
  popularReferrals, priorityTag, rankReferrals, referralNameText, referralPages, referralQuery, routeOf,
  shapeResult,
} from '../lib/search/referrals.mjs';
import { searchReferrals } from '../lib/search/referrals-search.mjs';

const ers = (service, extra = {}) => ({ service, specialty: service, clinicType: 'General', priority: 'Routine', ...extra });

const ROWS = [
  { id: 1, parentId: null, title: 'Referrals', isSection: true, body: '' },
  { id: 2, parentId: 1, title: 'Pathway cards (A to Z)', isSection: true, body: '' },
  { id: 3, parentId: 2, title: 'Normal Dermatology', body: 'Attach photos.', kind: 'ersReferral', fields: ers('Normal Dermatology', { specialty: 'Dermatology' }), status: 'live' },
  { id: 4, parentId: 2, title: '2WW Dermatology', body: 'Suspected skin cancer.', kind: 'ersReferral', fields: ers('2WW Dermatology', { specialty: '2WW', clinicType: '2WW skin', priority: '2WW' }), status: 'live' },
  { id: 5, parentId: 2, title: 'Cardiology: RACPC', body: 'Chest pain.', kind: 'ersReferral', fields: ers('Cardiology: RACPC', { priority: 'Urgent', aliases: ['chest pain clinic'] }), status: 'live' },
  { id: 6, parentId: 2, title: 'District Nurse', body: 'Housebound patients.', kind: 'emailReferral', fields: { service: 'District Nurse', aliases: ['community nursing'], form: 'RP ACN' }, status: 'live' },
  { id: 7, parentId: 2, title: 'ECG and 48-hour tape', body: 'Use the ECG form.', kind: 'emailReferral', fields: { service: 'ECG and 48-hour tape' }, status: 'live' },
  { id: 8, parentId: 2, title: 'Dietitian', body: 'Email the dietitian team.', kind: 'emailReferral', fields: { service: 'Dietitian' }, status: 'draft' },
  // An index of the cards above: a hub.
  { id: 9, parentId: 2, title: 'Pathway index', body: '| Service | Route |\n|---|---|\n| Normal Dermatology | e-RS |\n| 2WW Dermatology | e-RS |\n| Cardiology: RACPC | e-RS |\n| District Nurse | Email |\n| ECG and 48-hour tape | Email |', kind: 'note', status: 'live' },
  // Names one card and is the procedure for every cancer with no card: kept.
  { id: 10, parentId: 1, title: 'Cancer referrals (2WW)', body: 'Every cancer referral is 2WW. For skin, see 2WW Dermatology.', kind: 'note', status: 'live' },
  { id: 11, parentId: null, title: 'Reception', isSection: true, body: '' },
  { id: 12, parentId: 11, title: 'Opening times', body: 'The practice opens at 8am.', kind: 'note', status: 'live' },
];
const PAGES = buildFullNotebookSources(ROWS, []);
const byTitle = (title) => PAGES.find((p) => pageTitle(p) === title);
const titles = (pages) => pages.map(pageTitle);

test('the list is the Referrals section, served pages only, minus hubs', () => {
  const listed = titles(referralPages(PAGES));
  assert.deepEqual(listed, [
    'Normal Dermatology', '2WW Dermatology', 'Cardiology: RACPC', 'District Nurse', 'ECG and 48-hour tape',
    'Dietitian', 'Cancer referrals (2WW)',
  ]);
  // Another section's page never appears, however it is searched.
  assert.ok(!listed.includes('Opening times'));
});

test('a hub is an untyped page naming HUB_MIN_CARDS of the section\'s cards', () => {
  const cards = PAGES.filter(isLiveCard);
  assert.equal(HUB_MIN_CARDS, 5);
  assert.equal(isHub(byTitle('Pathway index'), cards), true);
  // One card named — the cancer procedure — is a page, not an index.
  assert.equal(isHub(byTitle('Cancer referrals (2WW)'), cards), false);
  // Four is one short.
  assert.equal(isHub(byTitle('Pathway index'), cards.slice(0, 4)), false);
  // A card is never a hub, whatever its prose names.
  const card = { ...byTitle('ECG and 48-hour tape'), text: cards.map(pageTitle).join(', ') };
  assert.equal(isHub(card, cards), false);
});

test('a row carries its route chip and priority tag from the card, and its Notebook address', () => {
  const derm = shapeResult(byTitle('2WW Dermatology'));
  assert.equal(derm.route, 'e-RS');
  assert.equal(derm.tag, '2WW');
  assert.equal(derm.where, 'Pathway cards (A to Z)');
  assert.equal(derm.href, '/notebook/2ww-dermatology-4');
  assert.equal(derm.id, 'note:4');
  assert.equal(shapeResult(byTitle('Cardiology: RACPC')).tag, 'Urgent');
  // Routine says nothing.
  assert.equal(priorityTag(byTitle('Normal Dermatology')), null);
  // An email card is Email, and has no e-RS priority.
  assert.equal(routeOf(byTitle('District Nurse')), 'Email');
  assert.equal(priorityTag(byTitle('District Nurse')), null);
  // A plain page and a draft card wear nothing: a draft is served as its prose.
  assert.equal(routeOf(byTitle('Cancer referrals (2WW)')), null);
  assert.equal(routeOf(byTitle('Dietitian')), null);
  assert.equal(shapeResult(byTitle('Cancer referrals (2WW)')).where, '');
});

test('the name text is the title and the card fields, each once, with plain hyphens', () => {
  const page = { ...byTitle('District Nurse') };
  assert.equal(referralNameText(page), 'District Nurse · community nursing · RP ACN');
  const dashed = { ...byTitle('2WW Dermatology'), path: ['Referrals', '2‑Week‑Wait Dermatology'] };
  assert.match(referralNameText(dashed), /^2-Week-Wait Dermatology · /);
  // A plain page is its title.
  assert.equal(referralNameText(byTitle('Cancer referrals (2WW)')), 'Cancer referrals (2WW)');
});

test('the words that only ask for "a referral" are taken out of the query', () => {
  assert.equal(referralQuery('physio referral'), 'physio');
  assert.equal(referralQuery('eddi ref'), 'eddi');
  assert.equal(referralQuery('how do I refer a patient to the district nurse?'), 'how do I a patient to the district nurse?');
  // Typos from the question log.
  assert.equal(referralQuery('hearing referrarl'), 'hearing');
  assert.equal(referralQuery('rheumatology referrral'), 'rheumatology');
  // Nothing else to search with: the word stays.
  assert.equal(referralQuery('referral'), 'referral');
  // Words that merely start alike are kept.
  assert.equal(referralQuery('reflux'), 'reflux');
});

test('ranking is by meaning, then keywords break near-ties, then a card beats a page', () => {
  const pages = referralPages(PAGES);
  const id = (title) => byTitle(title).docId;
  const scores = new Map([
    [id('Cancer referrals (2WW)'), { semantic: 0.45, lexical: 1 }],
    [id('2WW Dermatology'), { semantic: 0.43, lexical: 0.2 }],
    [id('Normal Dermatology'), { semantic: 0.30, lexical: 0 }],
    [id('ECG and 48-hour tape'), { semantic: 0.10, lexical: 0 }],
  ]);
  // The card's own name is nearer than any of its passages.
  const names = new Map([[id('2WW Dermatology'), 0.47]]);
  assert.deepEqual(titles(rankReferrals(pages, { scores, names })).slice(0, 3),
    ['2WW Dermatology', 'Cancer referrals (2WW)', 'Normal Dermatology']);
  // Meaning decides: a keyword-only page does not jump a page that means the query.
  const keywordOnly = new Map([[id('ECG and 48-hour tape'), { semantic: 0.05, lexical: 5 }], [id('District Nurse'), { semantic: 0.4, lexical: 0 }]]);
  assert.equal(titles(rankReferrals(pages, { scores: keywordOnly }))[0], 'District Nurse');
  // Among near-equals the keyword arm breaks the tie.
  const tie = new Map([[id('Normal Dermatology'), { semantic: 0.4, lexical: 0 }], [id('2WW Dermatology'), { semantic: 0.4, lexical: 1 }]]);
  assert.equal(titles(rankReferrals(pages, { scores: tie }))[0], '2WW Dermatology');
  // And a live card beats a plain page that means the query as well.
  const level = new Map([[id('Cancer referrals (2WW)'), { semantic: 0.4 }], [id('2WW Dermatology'), { semantic: 0.39 }]]);
  assert.equal(titles(rankReferrals(pages, { scores: level }))[0], '2WW Dermatology');
});

test('with no vectors the keyword arm ranks alone, and leaves out what it did not find', () => {
  const pages = referralPages(PAGES);
  const scores = new Map([
    [byTitle('ECG and 48-hour tape').docId, { semantic: 0, lexical: 0.4 }],
    [byTitle('District Nurse').docId, { semantic: 0, lexical: 0.9 }],
  ]);
  assert.deepEqual(titles(rankReferrals(pages, { scores })), ['District Nurse', 'ECG and 48-hour tape']);
  assert.deepEqual(rankReferrals(pages, { scores: new Map() }), []);
});

test('a search shows at least MIN_RESULTS, then only what is near the best, up to MAX_RESULTS', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ docId: 'note:' + (100 + i), path: ['Referrals', 'Page ' + i], noteKind: 'note' }));
  const far = new Map(many.map((p, i) => [p.docId, { semantic: i === 0 ? 0.9 : 0.2 }]));
  assert.equal(rankReferrals(many, { scores: far }).length, MIN_RESULTS);
  const close = new Map(many.map((p, i) => [p.docId, { semantic: 0.5 - i * 0.001 }]));
  assert.equal(rankReferrals(many, { scores: close }).length, MAX_RESULTS);
});

test('the empty box: the most asked for over the log, else A–Z', () => {
  const pages = referralPages(PAGES);
  const rows = [
    { source: 'Notebook: Referrals / Pathway cards (A to Z) / District Nurse', asked: 3 },
    { source: 'Notebook: Referrals / Pathway cards (A to Z) / Normal Dermatology', asked: 5 },
    { source: 'Notebook: Referrals / Pathway cards (A to Z) / ECG and 48-hour tape', asked: 3 },
    // A hub, a page outside the section and a page since deleted never count.
    { source: 'Notebook: Referrals / Pathway cards (A to Z) / Pathway index', asked: 50 },
    { source: 'Notebook: Reception / Opening times', asked: 40 },
    { source: 'Notebook: Referrals / Gone', asked: 9 },
  ];
  // Most asked first; ties A–Z.
  assert.deepEqual(titles(popularReferrals(rows, pages)), ['Normal Dermatology', 'District Nurse', 'ECG and 48-hour tape']);
  assert.deepEqual(titles(popularReferrals(rows, pages, 1)), ['Normal Dermatology']);
  // Nothing asked yet: nothing popular, and the list is A–Z.
  assert.deepEqual(popularReferrals([], pages), []);
  assert.deepEqual(titles(alphabetical(pages)), [
    '2WW Dermatology', 'Cancer referrals (2WW)', 'Cardiology: RACPC', 'Dietitian', 'District Nurse',
    'ECG and 48-hour tape', 'Normal Dermatology',
  ]);
});

test('the instant filter matches names and card fields, typos included, never the body', () => {
  const rows = referralPages(PAGES).map(shapeResult);
  assert.equal(filterReferrals(rows, 'district nurse referral')[0].title, 'District Nurse');
  // An alias on the card.
  assert.equal(filterReferrals(rows, 'chest pain clinic')[0].title, 'Cardiology: RACPC');
  // A typo.
  assert.deepEqual(filterReferrals(rows, 'dermatolgy').map((r) => r.title).sort(), ['2WW Dermatology', 'Normal Dermatology']);
  // The body ("Housebound patients") is the server's business.
  assert.deepEqual(filterReferrals(rows, 'housebound'), []);
  assert.deepEqual(filterReferrals(rows, '  '), []);
});

test('the search ranks on keywords alone when the query cannot be embedded', async () => {
  const pages = referralPages(PAGES);
  let asked = null;
  const ranked = await searchReferrals('nurse referral', pages, {
    embed: async () => { throw new Error('embedding API down'); },
    embedMany: async () => { throw new Error('embedding API down'); },
    scorePassages: async (ids, words, vector) => {
      asked = { ids, words, vector };
      return new Map([[byTitle('District Nurse').docId, { semantic: 0, lexical: 0.5 }]]);
    },
    budgetMs: 200,
  });
  assert.deepEqual(titles(ranked), ['District Nurse']);
  // "referral" was taken out before searching, and only the listed pages were scored.
  assert.equal(asked.words, 'nurse');
  assert.equal(asked.vector, null);
  assert.equal(asked.ids.length, pages.length);
});

test('the search scores each page by the nearer of its passages and its name', async () => {
  const pages = referralPages(PAGES);
  const unit = (i) => Array.from({ length: 1536 }, (_, j) => (j === i ? 1 : 0));
  const ranked = await searchReferrals('heart tracing', pages, {
    embed: async () => unit(0),
    // Every name gets a vector; only ECG's points the query's way.
    embedMany: async (texts) => texts.map((t) => (t.startsWith('ECG') ? unit(0) : unit(1))),
    scorePassages: async () => new Map([[byTitle('Cardiology: RACPC').docId, { semantic: 0.4, lexical: 0 }]]),
    budgetMs: 1000,
  });
  assert.deepEqual(titles(ranked).slice(0, 2), ['ECG and 48-hour tape', 'Cardiology: RACPC']);
});
