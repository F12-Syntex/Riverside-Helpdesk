import test from 'node:test';
import assert from 'node:assert/strict';
import { isNativeSearchModel, buildRequestBody, webSearch } from '../lib/agent/web-search.mjs';

// The rule this file protects: a search-grounded model must never be sent the
// web-search tool. Perplexity's endpoints on OpenRouter do not support tool
// calling, so a tools parameter fails the whole call with a 404 — which is what
// "Web search failed (404)" was.

test('search-grounded models are recognised', () => {
  for (const slug of [
    'perplexity/sonar',
    'perplexity/sonar-pro',
    'perplexity/sonar-reasoning-pro',
    'perplexity/sonar-deep-research',
    'openai/gpt-4.1-mini:online',
    'openai/gpt-4o-mini-search-preview',
    'PERPLEXITY/SONAR',
  ]) {
    assert.equal(isNativeSearchModel(slug), true, slug + ' searches natively');
  }
});

test('ordinary models are not', () => {
  for (const slug of ['openai/gpt-4.1-nano', 'google/gemini-3.5-flash-lite', 'openai/gpt-oss-120b', '', null]) {
    assert.equal(isNativeSearchModel(slug), false, String(slug) + ' needs the tool');
  }
});

test('the tools parameter is omitted for a native searcher and present otherwise', () => {
  const native = buildRequestBody({ model: 'perplexity/sonar', query: 'x', withTool: false });
  assert.equal('tools' in native, false, 'no tools key at all, not an empty array');

  const tooled = buildRequestBody({ model: 'openai/gpt-4.1-nano', query: 'x', withTool: true });
  assert.equal(tooled.tools[0].type, 'openrouter:web_search');
});

test('no request asks the model to think first', () => {
  // Searching and listing what came back is not a puzzle. On a model that
  // reasons before answering, that deliberation is most of the wait — paid on
  // every web search and every contact lookup, for nothing a reader sees.
  for (const withTool of [true, false]) {
    const body = buildRequestBody({ model: 'perplexity/sonar', query: 'x', withTool });
    assert.deepEqual(body.reasoning, { effort: 'minimal', exclude: true });
  }
});

// A small fetch double: records the bodies it was called with, replies from a
// queue of canned responses.
function stubFetch(responses) {
  const sent = [];
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body));
    const next = responses.shift();
    return {
      ok: next.status === 200,
      status: next.status,
      json: async () => next.body,
      text: async () => JSON.stringify(next.body ?? ''),
    };
  };
  return sent;
}

test('perplexity is called without tools and its citations become results', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });

  const sent = stubFetch([{
    status: 200,
    body: {
      choices: [{ message: { content: 'A summary.' } }],
      search_results: [{ title: 'NHS advice', url: 'https://www.nhs.uk/a', snippet: 'Some   text.' }],
      citations: ['https://www.nice.org.uk/b'],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    },
  }]);

  const out = await webSearch({ apiKey: 'k', model: 'perplexity/sonar', query: 'EMIS' });
  assert.equal(sent.length, 1);
  assert.equal('tools' in sent[0], false);
  assert.equal(out.ok, true);
  assert.equal(out.summary, 'A summary.');
  assert.deepEqual(out.results.map((r) => r.url), ['https://www.nhs.uk/a', 'https://www.nice.org.uk/b']);
  assert.equal(out.results[0].snippet, 'Some text.');
  // A bare citation has no title of its own; the URL stands in for one.
  assert.equal(out.results[1].title, 'https://www.nice.org.uk/b');
  assert.deepEqual(out.usage, { inputTokens: 10, outputTokens: 20 });
});

test('a 404 on the tooled call is retried without the tool', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });

  const sent = stubFetch([
    { status: 404, body: { error: { message: 'No endpoints found that support tool use' } } },
    { status: 200, body: { choices: [{ message: { content: 'Second time lucky.' } }] } },
  ]);

  const out = await webSearch({ apiKey: 'k', model: 'some/new-search-model', query: 'EMIS' });
  assert.equal(sent.length, 2);
  assert.equal('tools' in sent[0], true);
  assert.equal('tools' in sent[1], false);
  assert.equal(out.ok, true);
  assert.equal(out.summary, 'Second time lucky.');
});

test('a native search that 404s is not retried, and fails honestly', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });

  const sent = stubFetch([{ status: 404, body: { error: { message: 'No such model' } } }]);

  const out = await webSearch({ apiKey: 'k', model: 'perplexity/sonar', query: 'EMIS' });
  assert.equal(sent.length, 1, 'the tool-less call is already what failed');
  assert.equal(out.ok, false);
  assert.match(out.reason, /404/);
});

test('annotations still work, and duplicate URLs are kept once', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });

  stubFetch([{
    status: 200,
    body: {
      choices: [{
        message: {
          content: 'Summary.',
          annotations: [{ type: 'url_citation', url_citation: { url: 'https://www.nhs.uk/a', title: 'NHS', content: 'Body.' } }],
        },
      }],
      citations: ['https://www.nhs.uk/a'],
    },
  }]);

  const out = await webSearch({ apiKey: 'k', model: 'openai/gpt-4.1-nano', query: 'EMIS' });
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].title, 'NHS');
  assert.equal(out.results[0].snippet, 'Body.');
});
