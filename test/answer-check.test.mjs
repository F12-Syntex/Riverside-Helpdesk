import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DECISIONS_URL, DECISION_MODELS, decide, decisionRequest, decisionUsage } from '../lib/ai/decisions.mjs';
import {
  CHECK_CONFIRM_BELOW, CHECK_NAME, CHECK_QUESTIONS, CHECK_SOURCE_CHARS, CHECK_TIMEOUT_MS, CHECK_UNKNOWN_BELOW,
  checkBand, checkProvenance, checkState, closestPages, runAnswerCheck, shouldCheck,
  unknownAnswer, withConfirmLine,
} from '../lib/questions/answer-check.mjs';
import { answerToText } from '../lib/questions/flatten.mjs';
import { citedPages, resolveReferences } from '../lib/questions/references.mjs';

// The answer check withdraws a Notebook answer that does not answer the
// question, flags a doubtful one, and — the rule everything else here protects
// — changes NOTHING when the check itself fails.

/* ------------------------------------------------------------ the client */

test('the decision request carries zero retention on top of the no-retention rule', () => {
  const [url, init] = decisionRequest('key-1', { model: 'typesafe/jev-1.13', state: { question: 'q' }, questions: CHECK_QUESTIONS });
  assert.equal(url, DECISIONS_URL);
  assert.equal(url, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer key-1');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'typesafe/jev-1.13');
  assert.deepEqual(body.provider, { data_collection: 'deny', zdr: true });
  assert.deepEqual(body.state, { question: 'q' });
  assert.equal(body.questions[CHECK_NAME].type, 'noul');
  assert.ok(body.questions[CHECK_NAME].criteria.true && body.questions[CHECK_NAME].criteria.false);
  // A decision model writes nothing, so there is nothing to reason about.
  assert.equal('reasoning' in body, false);
});

test('a provider pin is routing, not part of the model name, and keeps the retention rule', () => {
  const [, init] = decisionRequest('k', { model: 'typesafe/jev-1.13@typesafe', state: 's', questions: {} });
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'typesafe/jev-1.13');
  assert.deepEqual(body.provider.only, ['typesafe']);
  assert.equal(body.provider.allow_fallbacks, false);
  assert.equal(body.provider.data_collection, 'deny');
  assert.equal(body.provider.zdr, true);
});

const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

test('decide returns the answers and the usage', async () => {
  let sent = null;
  const out = await decide({
    apiKey: 'k',
    model: 'typesafe/jev-1.13',
    state: 'x',
    questions: CHECK_QUESTIONS,
    fetchImpl: async (url, init) => {
      sent = { url, init };
      return reply(200, { model: 'typesafe/jev-1.13-20260917', answers: { answers: { type: 'noul', noul: 0.94 } }, usage: { input_tokens: 382, output_tokens: 20, cost: 0.000016 }, provider: 'TypeSafe' });
    },
  });
  assert.equal(sent.url, DECISIONS_URL);
  assert.ok(sent.init.signal, 'every call carries a timeout signal');
  assert.equal(out.answers.answers.noul, 0.94);
  assert.equal(out.model, 'typesafe/jev-1.13-20260917');
  assert.equal(out.provider, 'TypeSafe');
  // The charge rides along, so ai_usage records what the check cost.
  assert.deepEqual(decisionUsage(out.usage), { inputTokens: 382, outputTokens: 20, cost: 0.000016 });
});

test('decide throws on a refused request, naming why', async () => {
  await assert.rejects(
    decide({ apiKey: 'k', model: 'typesafe/jev-latest', state: 'x', questions: {}, fetchImpl: async () => reply(400, { error: { message: 'Model typesafe/jev-latest does not exist', code: 400 } }) }),
    /decision 400: Model typesafe\/jev-latest does not exist/,
  );
  await assert.rejects(
    decide({ apiKey: 'k', model: 'a/b', state: 'x', questions: {}, fetchImpl: async () => reply(200, { usage: {} }) }),
    /no answers/,
  );
  await assert.rejects(decide({ apiKey: '', model: 'a/b', state: 'x', questions: {} }), /OPENROUTER_API_KEY/);
});

test('decide gives up at its timeout', async () => {
  const began = Date.now();
  // AbortSignal.timeout does not hold the process open, and nothing else here
  // would: without this the runner sees an empty event loop and cancels.
  const keepAlive = setTimeout(() => {}, 5000);
  after(() => clearTimeout(keepAlive));
  await assert.rejects(
    decide({
      apiKey: 'k',
      model: 'a/b',
      state: 'x',
      questions: {},
      timeoutMs: 50,
      // A provider that never answers: only the abort ends it.
      fetchImpl: (url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      }),
    }),
    (e) => e.name === 'TimeoutError',
  );
  assert.ok(Date.now() - began < 2000);
});

test('the offered decision models include the default, and are priced', () => {
  const ids = DECISION_MODELS.map((m) => m.id);
  assert.ok(ids.includes('typesafe/jev-1.13'));
  // The alias the decisions endpoint refused on 2026-10-10 is not offered.
  assert.ok(!ids.includes('typesafe/jev-latest'));
  for (const m of DECISION_MODELS) assert.equal(typeof m.promptPerMillion, 'number');
});

/* ------------------------------------------------------------- the bands */

test('the bands sit at 0.5 and 0.8, and a missing score changes nothing', () => {
  assert.equal(CHECK_UNKNOWN_BELOW, 0.5);
  assert.equal(CHECK_CONFIRM_BELOW, 0.8);
  assert.equal(checkBand(0), 'unknown');
  assert.equal(checkBand(0.49), 'unknown');
  assert.equal(checkBand(0.5), 'confirm');
  assert.equal(checkBand(0.79), 'confirm');
  assert.equal(checkBand(0.8), 'pass');
  assert.equal(checkBand(1), 'pass');
  for (const nothing of [undefined, null, NaN, '0.1', {}]) assert.equal(checkBand(nothing), 'pass');
});

const decides = (noul) => async () => ({ answers: { [CHECK_NAME]: { type: 'noul', noul } }, usage: { input_tokens: 10, output_tokens: 20 }, model: 'typesafe/jev-1.13-20260917' });

test('a scored check reports its score, model, time and band', async () => {
  let measured = null;
  for (const [noul, band] of [[0.49, 'unknown'], [0.5, 'confirm'], [0.79, 'confirm'], [0.8, 'pass']]) {
    const result = await runAnswerCheck({
      decide: decides(noul),
      model: 'typesafe/jev-1.13',
      question: 'q',
      answer: 'a',
      onUsage: (usage) => { measured = usage; },
    });
    assert.equal(result.score, noul);
    assert.equal(result.band, band, String(noul));
    assert.equal(result.model, 'typesafe/jev-1.13-20260917');
    assert.equal(typeof result.ms, 'number');
    assert.deepEqual(checkProvenance(result), { score: noul, model: 'typesafe/jev-1.13-20260917', ms: result.ms, band });
  }
  assert.deepEqual(measured, { input_tokens: 10, output_tokens: 20 });
});

test('a check that fails passes the answer through unchanged, and says why', async () => {
  const cases = [
    async () => { throw new Error('decision 502: bad gateway'); },
    async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; },
    async () => ({ answers: {} }),
    async () => ({ answers: { [CHECK_NAME]: { type: 'noul', noul: 7 } } }),
  ];
  for (const decide of cases) {
    const result = await runAnswerCheck({ decide, model: 'typesafe/jev-1.13', question: 'q', answer: 'a' });
    assert.equal(result.band, 'pass');
    assert.ok(result.error);
    assert.equal('score' in result, false);
    const logged = checkProvenance(result);
    assert.ok(logged.error);
    assert.equal('score' in logged, false);
  }
  const timedOut = await runAnswerCheck({ decide: cases[1], model: 'm/x', question: 'q', answer: 'a' });
  assert.equal(timedOut.error, `no reply within ${CHECK_TIMEOUT_MS} ms`);
  assert.equal(CHECK_TIMEOUT_MS, 3000);
});

test('the check is asked with the timeout and the turn deadline', async () => {
  let asked = null;
  const deadline = new AbortController().signal;
  await runAnswerCheck({
    decide: async (args) => { asked = args; return { answers: { [CHECK_NAME]: { noul: 0.9 } } }; },
    model: 'typesafe/jev-1.13',
    question: 'how do I refer to the DN?',
    previous: 'district nurse',
    answer: 'Use the DN form.',
    pages: [{ docId: 'note:1', docTitle: 'Notebook: Referrals / District nurse', text: 'Use the DN form.' }],
    signal: deadline,
  });
  assert.equal(asked.timeoutMs, 3000);
  assert.equal(asked.signal, deadline);
  assert.equal(asked.model, 'typesafe/jev-1.13');
  assert.deepEqual(asked.questions, CHECK_QUESTIONS);
  assert.equal(asked.state.question, 'how do I refer to the DN?');
  assert.equal(asked.state.previousQuestion, 'district nurse');
  assert.equal(asked.state.answer, 'Use the DN form.');
  assert.match(asked.state.sources, /^### Referrals \/ District nurse\nUse the DN form\.$/);
});

/* ------------------------------------------------------------ what is sent */

test('the sources are the pages in the order given, cut at the budget', () => {
  const big = 'x'.repeat(CHECK_SOURCE_CHARS);
  const state = checkState({
    question: 'q',
    answer: 'a',
    pages: [
      { docId: 'note:1', docTitle: 'Notebook: First', text: 'one' },
      { docId: 'note:1', docTitle: 'Notebook: First', text: 'one' },
      { docId: 'note:2', docTitle: 'Notebook: Second', text: big },
      { docId: 'note:3', docTitle: 'Notebook: Third', text: 'never reached' },
    ],
  });
  assert.ok(state.sources.startsWith('### First\none\n\n### Second\n'));
  assert.equal(state.sources.split('### First').length, 2, 'a page is sent once');
  assert.ok(!state.sources.includes('Third'));
  assert.ok(state.sources.length <= CHECK_SOURCE_CHARS + 20);
  assert.equal('previousQuestion' in state, false, 'no previous message, no field');
});

test('every Q&A answer is checked, never a turn with pictures or an attachment', () => {
  assert.equal(shouldCheck({}), true);
  assert.equal(shouldCheck({ images: 1 }), false);
  assert.equal(shouldCheck({ attachments: 1 }), false);
});

test('the check reads the pages the answer cites, in citing order — and nothing when it cites none', () => {
  const pages = [
    { docId: 'note:1', docTitle: 'Notebook: Referrals / District Nurse (DN)', text: 'Use the DN form.' },
    { docId: 'note:2', docTitle: 'Notebook: Referrals / Standard referral flow (e-RS)', text: 'Book on e-RS.' },
    { docId: 'note:3', docTitle: 'Notebook: Front desk / Parking', text: 'Never sent.' },
  ];
  const { cited } = resolveReferences('Book it [[Standard referral flow (e-RS)]]; the DN differs [[Notebook: Referrals / District Nurse (DN)]].', pages);
  const state = checkState({ question: 'q', answer: 'a', pages: citedPages(cited, pages) });
  assert.equal(state.sources, '### Referrals / Standard referral flow (e-RS)\nBook on e-RS.\n\n### Referrals / District Nurse (DN)\nUse the DN form.');
  assert.ok(!state.sources.includes('Never sent.'), 'an uncited page is not sent');
  const none = resolveReferences('I don’t know — the Notebook does not cover this.', pages);
  assert.equal(checkState({ question: 'q', answer: 'a', pages: citedPages(none.cited, pages) }).sources, '');
});

/* ------------------------------------------------------- what the reader sees */

test('"I don\'t know" says so, links the closest pages and says when it was filed', () => {
  const cited = [
    { docId: 'note:12', docTitle: 'Notebook: Staff procedures / Car parking', text: '' },
    { docId: 'note:7', docTitle: 'Notebook: Start here', text: '' },
    { docId: 'note:9', docTitle: 'Notebook: Front desk / Opening hours', text: '' },
    { docId: 'note:4', docTitle: 'Notebook: Fourth', text: '' },
  ];
  const closest = closestPages({ prefer: cited });
  assert.equal(closest.length, 3);
  assert.deepEqual(closest[0], { title: 'Car parking', under: 'Staff procedures', href: '/notebook/car-parking-12' });
  assert.deepEqual(closest[1], { title: 'Start here', under: '', href: '/notebook/start-here-7' });

  const filed = unknownAnswer({ closest, filed: true });
  assert.equal(filed.title, 'Not in the Notebook');
  assert.equal(filed.flag, 'unknown');
  assert.deepEqual(filed.source, []);
  assert.equal(filed.blocks[0].type, 'note');
  assert.equal(filed.blocks[0].tone, 'warn');
  assert.match(filed.blocks[0].text, /^I don’t know — the practice’s Notebook does not cover this/);
  assert.equal(filed.blocks[1].title, 'Closest pages');
  assert.deepEqual(filed.blocks[1].items, [
    '[Car parking](/notebook/car-parking-12) — Practice notes › Staff procedures',
    '[Start here](/notebook/start-here-7)',
    '[Opening hours](/notebook/opening-hours-9) — Practice notes › Front desk',
  ]);
  // A page with no address is named, not linked.
  assert.deepEqual(unknownAnswer({ closest: [{ title: 'Loose', under: '', href: '' }] }).blocks[1].items, ['**Loose**']);
  const text = answerToText(filed);
  assert.match(text, /added to the open questions/);

  const unfiled = unknownAnswer({ closest: [], filed: false });
  assert.equal('flag' in unfiled, false, 'a desk that is not logging files nothing, and is not told it did');
  assert.equal(unfiled.blocks.length, 2, 'no closest pages, no empty list');
  assert.doesNotMatch(answerToText(unfiled), /has been added/);
});

test('the cited pages lead, the fallback fills, a page is offered once and nothing cited offers nothing', () => {
  const a = { docId: 'note:1', docTitle: 'Notebook: A', text: '' };
  const b = { docId: 'note:2', docTitle: 'Notebook: B', text: '' };
  assert.deepEqual(closestPages({ prefer: [b], fallback: [a, b] }).map((p) => p.title), ['B', 'A']);
  assert.deepEqual(closestPages({}), []);
});

test('a doubtful answer gains one line naming the page', () => {
  const pages = [{ docId: 'note:1', docTitle: 'Notebook: Referrals / District nurse', text: 'page' }];
  const prose = withConfirmLine('The answer.\n\nSource: District nurse', pages);
  assert.ok(prose.startsWith('The answer.\n\nSource: District nurse\n\nCheck this against the page (**District nurse**)'));
  assert.match(withConfirmLine('x', []), /Check this against the practice’s page/);
});
