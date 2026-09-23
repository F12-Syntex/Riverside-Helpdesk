// What the assistant does with the questions in evals/routing/pages.md:
// answered from the right page, answered from a WRONG page, declined, or asked
// which page was meant. And, underneath, how often the model pointed at
// something that was not there and the checks threw it away.
//
//   node evals/answer/bench-answer.mjs report.json --repeats 5
//   node evals/answer/bench-answer.mjs report.json --repeats 5 --model google/gemini-3.5-flash
//
// It runs the endpoint's own call and checks (selectFromNotebook, then
// verifySelection) against the Notebook of whichever database
// DEV_DATABASE_URL names — never live, see below.
//
// RUN IT MORE THAN ONCE PER CASE. A single pass at temperature 0 has scored
// 8/12 and then 5/12 on a byte-identical prompt (evals/routing/bench.mjs).
//
// The number that matters is WRONG-PAGE RATE: an answer shown from a page the
// question was not about looks exactly as trustworthy as a right one. A
// decline costs the reader a click; a wrong page costs them the mistake.
//
// NOTHING HERE KNOWS WHAT THE ANSWERS SHOULD BE beyond pages.md, which the
// judging agent writes (evals/routing/judge.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
// A bench is not a reason to read the live Notebook: it runs hundreds of
// questions, and nothing it measures needs the live copy.
if (!process.env.DEV_DATABASE_URL) { console.error('DEV_DATABASE_URL is not set — the bench only runs against a branch database.'); process.exit(1); }
if (!process.env.OPENROUTER_API_KEY) { console.error('OPENROUTER_API_KEY is not set'); process.exit(1); }

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i > -1 && args[i + 1] ? args[i + 1] : fallback; };
// The report path is the one argument that is neither a flag nor a flag's value.
const outFile = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || 'answer-report.json';
const repeats = Math.max(1, Number(opt('--repeats', 1)) || 1);

// ---- the cases, from pages.md (fenced examples skipped, as bench-pages does) --
const raw = fs.readFileSync(path.join(root, 'evals', 'routing', 'pages.md'), 'utf8').split(/\r?\n/);
let fenced = false;
const md = raw.map((line) => {
  if (/^\s*```/.test(line)) { fenced = !fenced; return ''; }
  return fenced ? '' : line;
});
const cases = [];
for (let i = 0; i < md.length; i++) {
  const h = /^##\s+\d+\.\s+(.+?)\s*$/.exec(md[i]);
  if (!h) continue;
  for (let j = i + 1; j < md.length && !/^##\s/.test(md[j]); j++) {
    const e = /^\*\*Expected page:\*\*\s*(.+?)\s*$/.exec(md[j]);
    if (e) { cases.push({ question: h[1], expected: e[1] }); break; }
  }
}
if (!cases.length) { console.error('pages.md holds no labelled cases.'); process.exit(2); }

// ---- the endpoint's own pieces -------------------------------------------------
const { createOpenRouter } = await import('@openrouter/ai-sdk-provider');
const { buildFullNotebookSources } = await import('../../lib/knowledge-context.mjs');
const { getSql, ensureNotebookSchema } = await import('../../lib/db.js');
const { getModelRoles } = await import('../../lib/settings.js');
const { AI_SDK_EXTRA_BODY } = await import('../../lib/ai/openrouter.mjs');
const { selectFromNotebook } = await import('../../lib/agent/notebook-answer.mjs');
const { verifySelection } = await import('../../lib/agent/verify-answer.mjs');

await ensureNotebookSchema();
const sql = getSql();
const notes = await sql`
  SELECT id, parent_id AS "parentId", title, body, position,
         is_section AS "isSection", kind, fields, status, updated_at AS "updatedAt"
  FROM notes ORDER BY position ASC, id ASC
`;
const pages = buildFullNotebookSources(notes, []);
const model = opt('--model', (await getModelRoles()).fast.model);
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, extraBody: AI_SDK_EXTRA_BODY });

const norm = (t) => String(t || '').toLowerCase().replace(/^notebook:\s*/i, '').replace(/\s+/g, ' ').trim();
function expectedId(expected) {
  if (/^none$/i.test(expected)) return 'none';
  if (/^note:/.test(expected)) return expected;
  const page = pages.find((p) => norm(p.docTitle) === norm(expected))
    || pages.find((p) => norm(p.docTitle).split('/').pop().trim() === norm(expected).split('/').pop().trim());
  return page ? page.docId : `unresolved:${expected}`;
}
// A case naming a page that is not there would score as a wrong answer that
// never was. Stop — or, with --skip-unresolved, leave it out and say so in the
// report, because relabelling it is the judging agent's call, not this one's.
const broken = cases.filter((c) => expectedId(c.expected).startsWith('unresolved:'));
const skipped = broken.map((c) => ({ question: c.question, expected: c.expected }));
if (broken.length) {
  console.error(`${broken.length} of ${cases.length} cases name a page that does not exist on this database.`);
  for (const c of broken) console.error(`  unresolved: ${c.expected}  (${c.question})`);
  if (!args.includes('--skip-unresolved')) { console.error('Fix pages.md, or pass --skip-unresolved to leave them out.'); process.exit(2); }
  cases.splice(0, cases.length, ...cases.filter((c) => !broken.includes(c)));
}
console.log(`${cases.length} cases (${cases.filter((c) => /^none$/i.test(c.expected)).length} expecting no page), ${pages.length} pages, model ${model}, ${repeats} repeat${repeats === 1 ? '' : 's'}`);

// ---- run ---------------------------------------------------------------------
const rows = [];
for (let r = 0; r < repeats; r++) {
  for (const c of cases) {
    const want = expectedId(c.expected);
    const t0 = Date.now();
    let verdict;
    let used = [];
    let v = null;
    try {
      const selection = await selectFromNotebook({ openrouter, model, pages, question: c.question, role: 'bench' });
      v = verifySelection(selection, pages, c.question);
      used = [...new Set([...v.cards, ...v.quotes].map((x) => x.page.docId))];
      if (v.verdict === 'answer') verdict = want === 'none' ? 'answered-none' : (used.includes(want) ? 'right' : 'wrong');
      else if (v.verdict === 'ambiguous') verdict = v.nearest.some((p) => p.docId === want) ? 'asked' : 'asked-without-it';
      else verdict = want === 'none' ? 'declined-correct' : 'declined';
    } catch (e) {
      verdict = 'error';
      console.error(String(e).slice(0, 200));
    }
    const ms = Date.now() - t0;
    rows.push({
      repeat: r + 1, question: c.question, expected: c.expected, want, verdict, used, ms,
      dropped: v ? v.dropped.map((d) => d.reason) : [], leadReplaced: v ? v.leadReason : '',
    });
    console.log(`[${r + 1}/${repeats}] ${verdict.padEnd(18)} ${String(ms).padStart(6)}ms  drop=${v ? v.dropped.length : '-'}  ${c.question}`);
  }
}

// ---- report ------------------------------------------------------------------
const n = rows.length;
const count = (verdict) => rows.filter((x) => x.verdict === verdict).length;
const pct = (k, of = n) => (of ? Math.round((1000 * k) / of) / 10 : 0);
const covered = rows.filter((x) => x.want !== 'none').length;
const uncovered = n - covered;
const summary = {
  model, cases: cases.length, skipped: skipped.length, repeats, runs: n,
  // Of the questions the Notebook covers, as a percentage:
  right: pct(count('right'), covered),
  wrong: pct(count('wrong'), covered),
  declined: pct(count('declined'), covered),
  asked: pct(count('asked') + count('asked-without-it'), covered),
  // Of the questions it does not:
  declinedCorrectly: pct(count('declined-correct'), uncovered),
  answeredAnyway: pct(count('answered-none'), uncovered),
  errors: count('error'),
  droppedPicks: rows.reduce((sum, x) => sum + x.dropped.length, 0),
  leadsReplaced: rows.filter((x) => x.leadReplaced).length,
  medianMs: rows.map((x) => x.ms).sort((a, b) => a - b)[Math.floor(n / 2)] || 0,
};
// Cases that did not come out the same way every time: the ones a single pass
// would have misreported.
const flaky = cases.map((c) => {
  const seen = new Set(rows.filter((x) => x.question === c.question).map((x) => x.verdict));
  return seen.size > 1 ? { question: c.question, verdicts: [...seen] } : null;
}).filter(Boolean);

fs.writeFileSync(outFile, JSON.stringify({ summary, skipped, flaky, rows }, null, 2));
console.log('\n' + JSON.stringify(summary, null, 2));
if (flaky.length) console.log(`\n${flaky.length} case(s) changed verdict between repeats.`);
console.log(`\nReport written to ${outFile}`);
process.exit(0);
