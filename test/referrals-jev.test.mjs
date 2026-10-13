// The Referrals smart search: what Jev is asked, what its numbers mean, and
// that a Jev that fails changes nothing. Pure, on an invented Notebook, with
// `decide` stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFullNotebookSources } from '../lib/knowledge-context.mjs';
import { pageTitle, referralPages } from '../lib/search/referrals.mjs';
import {
  JEV_MATCH, createJevCache, jevQuestions, jevScores, jevState, questionKey, rankByJev, referralBrief, runReferralJev,
} from '../lib/search/referrals-jev.mjs';

const ROWS = [
  { id: 1, parentId: null, title: 'Referrals', isSection: true, body: '' },
  { id: 2, parentId: 1, title: 'Pathway cards (A to Z)', isSection: true, body: '' },
  { id: 3, parentId: 2, title: 'Normal Dermatology', body: 'Attach **photos** of the lesion.', kind: 'ersReferral', fields: { service: 'Normal Dermatology', specialty: 'Dermatology', clinicType: 'General', priority: 'Routine' }, status: 'live' },
  { id: 4, parentId: 2, title: 'District Nurse', body: 'Housebound patients only.', kind: 'emailReferral', fields: { service: 'District Nurse', aliases: ['community nursing'], form: 'RP ACN' }, status: 'live' },
  { id: 5, parentId: 2, title: 'Audiology', body: 'Hearing tests for adults.', kind: 'note', status: 'live' },
];
const PAGES = referralPages(buildFullNotebookSources(ROWS, []));
const ids = (pages) => pages.map(pageTitle);
const reply = (nouls) => ({ answers: Object.fromEntries(nouls.map((n, i) => [questionKey(i), { type: 'noul', noul: n }])), usage: { input_tokens: 10 } });

test('one closed question per referral, each naming it', () => {
  const questions = jevQuestions(PAGES);
  assert.deepEqual(Object.keys(questions), ['r0', 'r1', 'r2']);
  for (const [i, page] of PAGES.entries()) {
    const q = questions[questionKey(i)];
    assert.equal(q.type, 'noul');
    assert.ok(q.instructions.includes('"' + pageTitle(page) + '"'));
    assert.ok(q.criteria.true && q.criteria.false);
  }
});

test('a referral is described by where it sits, its other names and how its page opens, as plain text', () => {
  const brief = referralBrief(PAGES.find((p) => pageTitle(p) === 'District Nurse'));
  assert.ok(brief.includes('(under Pathway cards (A to Z))'));
  assert.ok(/community nursing/i.test(brief));
  assert.ok(brief.includes('Housebound patients only.'));
  const derm = referralBrief(PAGES.find((p) => pageTitle(p) === 'Normal Dermatology'));
  assert.ok(!derm.includes('**'), 'markdown is stripped');
});

test('the state is what was typed and what the page is, nothing else', () => {
  const state = jevState('  nurse to visit at home  ');
  assert.deepEqual(Object.keys(state).sort(), ['context', 'search']);
  assert.equal(state.search, 'nurse to visit at home');
  assert.equal(jevState('x'.repeat(500)).search.length, 200);
});

test('scores are read per referral; anything not a number in [0, 1] is left out', () => {
  const scores = jevScores(PAGES, { r0: { noul: 0.12345 }, r1: { noul: 1.4 }, r2: { noul: 'high' } });
  assert.deepEqual([...scores.entries()], [[PAGES[0].docId, 0.123]]);
});

test('matches are the referrals at JEV_MATCH or more, best first, ties in keyword order', () => {
  const scores = new Map([[PAGES[0].docId, 0.6], [PAGES[1].docId, JEV_MATCH - 0.01], [PAGES[2].docId, 0.6]]);
  assert.deepEqual(ids(rankByJev(PAGES, scores)), ['Normal Dermatology', 'Audiology']);
  assert.deepEqual(ids(rankByJev(PAGES, scores, { order: [PAGES[2].docId] })), ['Audiology', 'Normal Dermatology']);
  assert.deepEqual(rankByJev(PAGES, new Map()), []);
});

test('runReferralJev asks once, with every referral, and reports usage', async () => {
  const calls = [];
  const used = [];
  const out = await runReferralJev({
    decide: async (args) => { calls.push(args); return reply([0.1, 0.9, 0.2]); },
    model: 'typesafe/jev-1.13',
    query: 'nurse to visit at home',
    pages: PAGES,
    onUsage: (usage) => used.push(usage),
  });
  assert.equal(calls.length, 1);
  assert.equal(Object.keys(calls[0].questions).length, PAGES.length);
  assert.equal(calls[0].state.search, 'nurse to visit at home');
  assert.equal(out.scores.get(PAGES[1].docId), 0.9);
  assert.equal(used.length, 1);
  assert.ok(!out.error);
});

test('a Jev that fails, times out or answers nothing never throws', async () => {
  const boom = await runReferralJev({ decide: async () => { throw new Error('decision 503'); }, model: 'm', query: 'q', pages: PAGES });
  assert.match(boom.error, /503/);
  const timeout = await runReferralJev({ decide: async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; }, model: 'm', query: 'q', pages: PAGES });
  assert.match(timeout.error, /no reply within/);
  const empty = await runReferralJev({ decide: async () => ({ answers: {} }), model: 'm', query: 'q', pages: PAGES });
  assert.ok(empty.error);
  const none = await runReferralJev({ decide: async () => reply([1]), model: 'm', query: 'q', pages: [] });
  assert.ok(none.error);
});

test('the cache remembers a search for the same referrals, and forgets on an edit or with age', () => {
  let clock = 0;
  const cache = createJevCache({ max: 2, ttlMs: 1000, now: () => clock });
  const scores = new Map([['a', 1]]);
  cache.set('Skin ', PAGES, scores);
  assert.equal(cache.get('skin', PAGES), scores, 'case and spacing do not matter');
  const edited = PAGES.map((p, i) => (i === 0 ? { ...p, text: p.text + ' more' } : p));
  assert.equal(cache.get('skin', edited), null, 'an edited page is a new question');
  clock = 2000;
  assert.equal(cache.get('skin', PAGES), null, 'too old');
  cache.set('a', PAGES, scores); cache.set('b', PAGES, scores); cache.set('c', PAGES, scores);
  assert.equal(cache.size, 2);
  assert.equal(cache.get('a', PAGES), null, 'oldest out first');
});
