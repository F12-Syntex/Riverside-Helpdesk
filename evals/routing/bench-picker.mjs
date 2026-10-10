// What the picker does with the golden cases, reading the Notebook the way a
// live turn does: through the search shortlist.
//
//   node evals/routing/bench-picker.mjs report.json
//   node evals/routing/bench-picker.mjs report.json --repeats 3 --concurrency 3
//   node evals/routing/bench-picker.mjs report.json --shortlist-only
//
// Each case's prompt is built exactly as app/api/agent/route.js builds it: the
// question is searched (notebookShortlist in lib/search/notebook.mjs — the real
// hybrid search against the real index), the shortlisted pages go in whole and
// every other page by title (shortlistText), and the real selection call —
// same schema, same prompt, same plain-text retry — names a page.
//
// TWO QUESTIONS, MEASURED SEPARATELY. A wrong page is either search's fault
// (the right page never reached the prompt in full) or the picker's (it was
// there and the picker named another). Every row records whether the expected
// page was shortlisted, and the summary reports that as `shortlistRecall`
// beside the picker's own rates, so a drop in pageCorrectRate can be traced to
// one or the other. `--shortlist-only` answers the first question alone: it
// runs the searches and skips every model call, so it costs query embeddings
// and nothing else — run it after any change to search, the index or the
// shortlist rules. The full run costs one picker call per case per repeat;
// run it when the question is what the picker gets right.
//
// NOTHING HERE KNOWS WHAT THE ANSWERS SHOULD BE beyond pages.md, which the
// judging session writes (judge.md). Whoever changes search or routing code
// runs this but does not read the cases.
//
// Needs DATABASE_URL and OPENROUTER_API_KEY in .env.local (the key embeds the
// query even with --shortlist-only). Run from the repository root.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!(process.env.DEV_DATABASE_URL || process.env.DATABASE_URL)) { console.error('Neither DEV_DATABASE_URL nor DATABASE_URL is set'); process.exit(1); }
if (!process.env.OPENROUTER_API_KEY) { console.error('OPENROUTER_API_KEY is not set'); process.exit(1); }

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i > -1 && args[i + 1] ? args[i + 1] : fallback; };
// The report path is the first argument that is neither a flag nor a flag's value.
const valued = new Set(['--repeats', '--concurrency', '--model']);
const outFile = args.find((a, i) => !a.startsWith('--') && !valued.has(args[i - 1])) || 'routing-picker-report.json';
const shortlistOnly = args.includes('--shortlist-only');
// --full: the baseline — every case reads the whole Notebook, as every turn
// did before the shortlist, so the two can be compared on the same cases.
const fullNotebook = args.includes('--full');
const repeats = shortlistOnly ? 1 : Math.max(1, Number(opt('--repeats', 1)) || 1);
const concurrency = Math.max(1, Number(opt('--concurrency', 3)) || 3);

// Fenced blocks are not cases — pages.md's header shows the format inside one.
const raw = fs.readFileSync(path.join(here, 'pages.md'), 'utf8').split(/\r?\n/);
let fenced = false;
const md = raw.map((line) => {
  if (/^\s*```/.test(line)) { fenced = !fenced; return ''; }
  return fenced ? '' : line;
});
const cases = [];
for (let i = 0; i < md.length; i++) {
  const h = /^##\s+\d+\.\s+(.+?)\s*$/.exec(md[i]);
  if (!h) continue;
  let expected = '';
  for (let j = i + 1; j < md.length && !/^##\s/.test(md[j]); j++) {
    const e = /^\*\*Expected page:\*\*\s*(.+?)\s*$/.exec(md[j]);
    if (e) { expected = e[1]; break; }
  }
  if (expected) cases.push({ question: h[1], expected });
}
if (!cases.length) { console.error('pages.md holds no labelled cases yet.'); process.exit(2); }

// Every module below imports relatively, so plain `node` loads them without
// the Next.js `@/` alias (lib/search/notebook.mjs loads search.mjs itself, on
// first use). lib/notebook.js does use the alias, so the page objects are
// built here from the same query and builder its fullNotebookContext() uses,
// without attachments.
const { buildFullNotebookSources } = await import('../../lib/knowledge-context.mjs');
const { getSql, ensureNotebookSchema } = await import('../../lib/db.js');
const { SELECTION_SCHEMA, selectionPrompt } = await import('../../lib/templates/route.mjs');
const { notebookShortlist } = await import('../../lib/search/notebook.mjs');
const { fullShortlist, shortlistText } = await import('../../lib/search/shortlist.mjs');
const { looksMultiIntent } = await import('../../lib/safety/requests.mjs');
// A page's path without the 'Notebook:' prefix, as pages.md writes it.
const pagePath = (title) => String(title || '').replace(/^notebook:\s*/i, '').trim();

await ensureNotebookSchema();
const sql = getSql();
const notes = await sql`
  SELECT id, parent_id AS "parentId", title, body, position,
         is_section AS "isSection", kind, fields, status, updated_at AS "updatedAt"
  FROM notes ORDER BY position ASC, id ASC
`;
const pages = buildFullNotebookSources(notes, []);

const norm = (t) => String(t || '').toLowerCase().replace(/^notebook:\s*/i, '').replace(/\s+/g, ' ').trim();
const leaf = (t) => norm(t).split('/').pop().trim();
function resolvePage(title) {
  if (!title) return '';
  const p = pages.find((x) => norm(pagePath(x.docTitle)) === norm(title))
    || pages.find((x) => leaf(pagePath(x.docTitle)) === leaf(title));
  return p ? p.docId : '';
}
function expectedId(expected) {
  if (/^none$/i.test(expected)) return 'none';
  if (/^note:/.test(expected)) return expected;
  return resolvePage(expected) || `unresolved:${expected}`;
}

// One shortlist per case, shared by its repeats: search is the same query
// against the same index, and the picker's spread across repeats is what the
// repeats are for. It is the call the endpoint makes for a first message with
// nothing attached; a multi-request message gets the larger shortlist and the
// decomposing prompt there, so it does here.
const shortlists = new Map();
function shortlistFor(c) {
  if (!shortlists.has(c.question)) {
    const multi = looksMultiIntent(c.question);
    const making = fullNotebook
      ? Promise.resolve(fullShortlist(pages, 'baseline'))
      : notebookShortlist({ question: c.question, history: '', attached: '', pages, multi });
    shortlists.set(c.question, making
      .then((shortlist) => ({ shortlist, multi, text: shortlistText(shortlist, pages) })));
  }
  return shortlists.get(c.question);
}

// Whether the expected page reached the prompt in full. A whole-Notebook
// fallback shows every page, so it counts as shortlisted. null when the case
// expects no page, or names one this Notebook does not have — neither says
// anything about search.
function shortlistSummary(shortlist, want) {
  const ids = new Set(shortlist.pages.map((p) => p.docId));
  return {
    size: shortlist.pages.length,
    full: !!shortlist.full,
    reason: shortlist.reason || '',
    containsExpected: /^note:/.test(want) ? (!!shortlist.full || ids.has(want)) : null,
  };
}

// The model is only set up for a full run: --shortlist-only must not need a
// model setting, let alone spend a call.
let model = '';
let openrouter = null;
let ai = null;
if (shortlistOnly) {
  console.log(`${cases.length} cases, shortlist only (no model calls), ${pages.length} pages`);
} else {
  ai = await import('ai');
  const { getModelRoles } = await import('../../lib/settings.js');
  // The endpoint's own provider: a model id pinned to a provider
  // ("…@google-vertex/europe") is sent as the bare id with its routing.
  const { createRouter } = await import('../../lib/ai/openrouter.mjs');
  model = opt('--model', '') || (await getModelRoles()).fast.model;
  openrouter = createRouter(process.env.OPENROUTER_API_KEY);
  console.log(`${cases.length} cases x ${repeats} repeat${repeats === 1 ? '' : 's'} on ${model}, ${pages.length} pages`);
}

async function pick(text) {
  const { generateObject, generateText, zodSchema } = ai;
  let picked = 'error', named = '', usage = null, error = '', retried = false;
  try {
    const out = await generateObject({
      model: openrouter(model),
      schema: SELECTION_SCHEMA,
      temperature: 0,
      maxOutputTokens: 2000,
      prompt: text,
    });
    picked = out.object.template;
    named = (out.object.pages || [])[0] || '';
    usage = out.usage || null;
  } catch (first) {
    // THE SAME RECOVERY THE ENDPOINT HAS. readValues in
    // app/api/agent/route.js re-asks as plain text when a provider will not
    // honour the schema, parses the first {...} and validates it. Without
    // this the bench measures a picker the practice does not run: the first
    // pass alone failed on 30% of these cases.
    retried = true;
    try {
      const loose = await generateText({
        model: openrouter(model),
        temperature: 0,
        maxOutputTokens: 2000,
        prompt: text + '\n\nReply with ONE JSON object and nothing else — no prose, no code fence — matching this JSON Schema:\n' + JSON.stringify(zodSchema(SELECTION_SCHEMA).jsonSchema),
      });
      const rawText = String(loose.text || '');
      const a = rawText.indexOf('{');
      const b = rawText.lastIndexOf('}');
      if (a === -1 || b === -1) throw first;
      const parsed = SELECTION_SCHEMA.parse(JSON.parse(rawText.slice(a, b + 1)));
      picked = parsed.template;
      named = (parsed.pages || [])[0] || '';
      usage = loose.usage || null;
    } catch (second) {
      error = String(second).slice(0, 200);
    }
  }
  return { picked, named, usage, error, retried };
}

const jobs = [];
for (let r = 0; r < repeats; r++) for (const c of cases) jobs.push({ r: r + 1, c });
const total = jobs.length;
const rows = [];
let done = 0;
async function worker() {
  for (;;) {
    const job = jobs.shift();
    if (!job) return;
    const { c } = job;
    const want = expectedId(c.expected);
    const t0 = Date.now();
    const { shortlist, multi, text: notebookText } = await shortlistFor(c);
    const searchMs = Date.now() - t0;
    const sl = shortlistSummary(shortlist, want);
    if (shortlistOnly) {
      rows.push({ question: c.question, want, multi, shortlist: sl, searchMs });
    } else {
      const text = selectionPrompt({ question: c.question, attached: '', notebook: notebookText, decompose: multi, images: 0 });
      const { picked, named, usage, error, retried } = await pick(text);
      const ms = Date.now() - t0;
      const got = picked === 'notebook' ? (resolvePage(named) || 'unresolved-page') : picked;
      let verdict;
      if (picked === 'notebook') verdict = got === want ? 'page-correct' : 'page-wrong';
      else if (picked === 'ask') verdict = 'asked';
      else if (picked === 'none') verdict = want === 'none' ? 'none-correct' : 'no-answer';
      else if (picked === 'error') verdict = 'error';
      else verdict = want === 'none' ? 'template-for-none' : 'template-instead-of-page';
      rows.push({ repeat: job.r, question: c.question, want, picked, got, verdict, shortlist: sl, ms, usage, retried, error });
    }
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${total}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

const n = rows.length;
const count = (v) => rows.filter((x) => x.verdict === v).length;
const rate = (k, of = n) => (of ? Math.round((1000 * k) / of) / 10 : 0);
const tok = (f) => Math.round(rows.reduce((s, x) => s + ((x.usage && x.usage[f]) || 0), 0) / (n || 1));

// Search is measured once per case, not once per repeat.
const perCase = [...new Map(rows.map((x) => [x.question, x.shortlist])).values()];
const withExpected = perCase.filter((s) => s.containsExpected !== null);
const fullFallbacks = {};
for (const s of perCase) if (s.full) fullFallbacks[s.reason || 'unknown'] = (fullFallbacks[s.reason || 'unknown'] || 0) + 1;
const searchSummary = {
  // Of the cases that expect a page, the share whose page reached the prompt in full.
  shortlistRecall: rate(withExpected.filter((s) => s.containsExpected).length, withExpected.length),
  shortlistMisses: withExpected.filter((s) => !s.containsExpected).length,
  casesWithExpectedPage: withExpected.length,
  meanShortlistSize: perCase.length ? Math.round((10 * perCase.reduce((s, x) => s + x.size, 0)) / perCase.length) / 10 : 0,
  // Cases that fell back to the whole Notebook, by reason (no-text / search-failed / no-match).
  fullFallbacks,
};

const summary = shortlistOnly
  ? {
    cases: cases.length, pages: pages.length, shortlistOnly: true,
    ...searchSummary,
    meanSearchMs: n ? Math.round(rows.reduce((s, x) => s + x.searchMs, 0) / n) : 0,
  }
  : {
    cases: cases.length, repeats, calls: n, model, pages: pages.length,
    pageCorrectRate: rate(count('page-correct')),
    pageWrongRate: rate(count('page-wrong')),
    // The part of pageWrongRate that is search's: the expected page was never
    // in the prompt in full. The rest the picker got wrong with it in front of it.
    pageWrongNotShortlistedRate: rate(rows.filter((x) => x.verdict === 'page-wrong' && x.shortlist.containsExpected === false).length),
    askedRate: rate(count('asked')),
    noAnswerRate: rate(count('no-answer')),
    noneCorrectRate: rate(count('none-correct')),
    templateInsteadOfPageRate: rate(count('template-instead-of-page')),
    templateForNoneRate: rate(count('template-for-none')),
    errorRate: rate(count('error')),
    ...searchSummary,
    // How often the provider would not honour the schema and the endpoint had to
    // re-ask as plain text. Not a failure — the reader still gets a card — but
    // it is a second call, and it is most of what a turn's latency is.
    structuredRetryRate: rate(rows.filter((x) => x.retried).length),
    meanMs: n ? Math.round(rows.reduce((s, x) => s + x.ms, 0) / n) : 0,
    meanInputTokens: tok('inputTokens') || tok('promptTokens'),
    meanOutputTokens: tok('outputTokens') || tok('completionTokens'),
  };
fs.writeFileSync(outFile, JSON.stringify({ summary, rows }, null, 2));
console.log('\n' + JSON.stringify(summary, null, 2));
console.log(`\nwritten ${outFile}`);
