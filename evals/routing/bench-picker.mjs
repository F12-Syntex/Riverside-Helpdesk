// The baseline the router has to beat: what the EXISTING picker does with the
// same cases.
//
//   node evals/routing/bench-picker.mjs report.json
//   node evals/routing/bench-picker.mjs report.json --repeats 3 --concurrency 3
//
// bench-pages.mjs measures the router. On its own that measures nothing
// useful: a turn the router hands back to the picker is not a failure if the
// picker answers it, and a turn the router turns into a question IS a
// regression if the picker would have answered it correctly. So this runs the
// real selection call — same schema, same prompt, same whole-Notebook block as
// app/api/agent/route.js — over the same pages.md, and reports which page it
// named.
//
// It costs one model call per case per repeat, and the whole Notebook goes in
// each time, so it is the expensive half of the comparison. Run it when the
// question is "should the router be on", not on every change.
//
// NOTHING HERE KNOWS WHAT THE ANSWERS SHOULD BE beyond pages.md, which the
// judging session writes (judge.md).
//
// Needs DATABASE_URL and OPENROUTER_API_KEY in .env.local.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
if (!process.env.OPENROUTER_API_KEY) { console.error('OPENROUTER_API_KEY is not set'); process.exit(1); }

const args = process.argv.slice(2);
const outFile = args.find((a) => !a.startsWith('--')) || 'routing-picker-report.json';
const opt = (name, fallback) => { const i = args.indexOf(name); return i > -1 && args[i + 1] ? args[i + 1] : fallback; };
const repeats = Math.max(1, Number(opt('--repeats', 1)) || 1);
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

const { generateObject, generateText, zodSchema } = await import('ai');
const { createOpenRouter } = await import('@openrouter/ai-sdk-provider');
const { buildFullNotebookSources } = await import('../../lib/knowledge-context.mjs');
const { getSql, ensureNotebookSchema } = await import('../../lib/db.js');
const { getModelRoles } = await import('../../lib/settings.js');
const { AI_SDK_EXTRA_BODY } = await import('../../lib/ai/openrouter.mjs');
const { SELECTION_SCHEMA, selectionPrompt, notebookFullText } = await import('../../lib/templates/route.mjs');
const { pagePath } = await import('../../lib/routing/router.mjs');

await ensureNotebookSchema();
const sql = getSql();
const notes = await sql`
  SELECT id, parent_id AS "parentId", title, body, position,
         is_section AS "isSection", kind, fields, status, updated_at AS "updatedAt"
  FROM notes ORDER BY position ASC, id ASC
`;
const pages = buildFullNotebookSources(notes, []);
const notebookText = pages.length ? notebookFullText(pages) : '';
const model = opt('--model', '') || (await getModelRoles()).fast.model;
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, extraBody: AI_SDK_EXTRA_BODY });

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

console.log(`${cases.length} cases x ${repeats} repeat${repeats === 1 ? '' : 's'} on ${model}`);

const jobs = [];
for (let r = 0; r < repeats; r++) for (const c of cases) jobs.push({ r: r + 1, c });
const rows = [];
let done = 0;
async function worker() {
  for (;;) {
    const job = jobs.shift();
    if (!job) return;
    const { c } = job;
    const want = expectedId(c.expected);
    const t0 = Date.now();
    let picked = 'error', named = '', usage = null, error = '', retried = false;
    const text = selectionPrompt({ question: c.question, attached: '', notebook: notebookText, decompose: false, images: 0 });
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
      // this the baseline measures a picker the practice does not run: the
      // first pass alone failed on 30% of these cases.
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
    const ms = Date.now() - t0;
    const got = picked === 'notebook' ? (resolvePage(named) || 'unresolved-page') : picked;
    let verdict;
    if (picked === 'notebook') verdict = got === want ? 'page-correct' : 'page-wrong';
    else if (picked === 'ask') verdict = 'asked';
    else if (picked === 'none') verdict = want === 'none' ? 'none-correct' : 'no-answer';
    else if (picked === 'error') verdict = 'error';
    else verdict = want === 'none' ? 'template-for-none' : 'template-instead-of-page';
    rows.push({ repeat: job.r, question: c.question, want, picked, got, verdict, ms, usage, retried, error });
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${rows.length + jobs.length}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

const n = rows.length;
const count = (v) => rows.filter((x) => x.verdict === v).length;
const rate = (k) => (n ? Math.round((1000 * k) / n) / 10 : 0);
const tok = (f) => Math.round(rows.reduce((s, x) => s + ((x.usage && x.usage[f]) || 0), 0) / (n || 1));
const summary = {
  cases: cases.length, repeats, calls: n, model,
  pageCorrectRate: rate(count('page-correct')),
  pageWrongRate: rate(count('page-wrong')),
  askedRate: rate(count('asked')),
  noAnswerRate: rate(count('no-answer')),
  noneCorrectRate: rate(count('none-correct')),
  templateInsteadOfPageRate: rate(count('template-instead-of-page')),
  templateForNoneRate: rate(count('template-for-none')),
  errorRate: rate(count('error')),
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