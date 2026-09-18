// What the router does with the questions in pages.md — hit, ask, miss or
// WRONG — and what it costs to find out.
//
//   node evals/routing/bench-pages.mjs report.json --repeats 5
//   node evals/routing/bench-pages.mjs report.json --repeats 5 --hit 0.85 --ask 0.7 --margin 0.2
//
// Same discipline as bench.mjs, for the same reason: RUN IT MORE THAN ONCE
// PER CASE. The router's own arithmetic is deterministic, but the embedding
// behind the vector arm is a model call, and bench.mjs records 8/12 then 5/12
// on a byte-identical prompt. Routes are read across repeats; latency from
// one pass is fine.
//
// The number that matters is WRONG-PAGE RATE. A miss costs a model call the
// turn was going to make anyway; a wrong page rendered confidently looks
// complete and authoritative and has no gaps section to tip the reader off.
//
// NOTHING HERE KNOWS WHAT THE ANSWERS SHOULD BE beyond pages.md, which the
// judging agent writes (judge.md). The thresholds come from app_settings
// unless overridden on the command line; the master switch is ignored here so
// the router can be measured while it is still off for staff.
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
if (!process.env.OPENROUTER_API_KEY) { console.error('OPENROUTER_API_KEY is not set — the vector arm cannot run'); process.exit(1); }

const args = process.argv.slice(2);
const outFile = args.find((a) => !a.startsWith('--')) || 'routing-pages-report.json';
const opt = (name, fallback) => { const i = args.indexOf(name); return i > -1 && args[i + 1] ? args[i + 1] : fallback; };
const repeats = Math.max(1, Number(opt('--repeats', 1)) || 1);

// ---- the cases, from pages.md ---------------------------------------------
const md = fs.readFileSync(path.join(here, 'pages.md'), 'utf8').split(/\r?\n/);
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
if (!cases.length) {
  console.error('pages.md holds no labelled cases yet — see its header for how they are written, and judge.md for who writes them.');
  process.exit(2);
}

// ---- the router, exactly as the endpoint runs it -----------------------------
const { buildFullNotebookSources } = await import('../../lib/knowledge-context.mjs');
const { getSql, ensureNotebookSchema } = await import('../../lib/db.js');
const { getRoutingThresholds } = await import('../../lib/routing/thresholds.mjs');
const { routeQuestion, pagePath } = await import('../../lib/routing/router.mjs');

await ensureNotebookSchema();
const sql = getSql();
const notes = await sql`
  SELECT id, parent_id AS "parentId", title, body, position,
         is_section AS "isSection", output_tag AS "outputTag", updated_at AS "updatedAt"
  FROM notes ORDER BY position ASC, id ASC
`;
const pages = buildFullNotebookSources(notes, []);
const stored = await getRoutingThresholds();
const thresholds = {
  enabled: true,
  hitCos: Number(opt('--hit', stored.hitCos)),
  askCos: Number(opt('--ask', stored.askCos)),
  minMargin: Number(opt('--margin', stored.minMargin)),
};

const norm = (t) => String(t || '').toLowerCase().replace(/^notebook:\s*/i, '').replace(/\s+/g, ' ').trim();
function expectedId(expected) {
  if (/^none$/i.test(expected)) return 'none';
  if (/^note:/.test(expected)) return expected;
  const page = pages.find((p) => norm(pagePath(p.docTitle)) === norm(expected))
    || pages.find((p) => norm(pagePath(p.docTitle)).split('/').pop().trim() === norm(expected).split('/').pop().trim());
  return page ? page.docId : `unresolved:${expected}`;
}

// ---- run ---------------------------------------------------------------------
const rows = [];
for (let r = 0; r < repeats; r++) {
  for (const c of cases) {
    const want = expectedId(c.expected);
    const t0 = Date.now();
    const out = await routeQuestion(c.question, { pages, thresholds, record: false });
    const ms = Date.now() - t0;
    const got = out.decision === 'hit' ? out.page.docId : out.decision;
    let verdict;
    if (out.decision === 'hit') verdict = got === want ? 'hit' : 'wrong';
    else if (out.decision === 'ambiguous') verdict = (out.clarify?.targets || []).includes(want) ? 'ambiguous' : 'ambiguous-without-it';
    else verdict = want === 'none' ? 'miss-correct' : 'miss';
    rows.push({ repeat: r + 1, question: c.question, expected: c.expected, want, decision: out.decision, rung: out.rung, got, verdict, confidence: out.confidence, margin: out.margin, ms });
    console.log(`[${r + 1}/${repeats}] ${verdict.padEnd(22)} ${out.decision.padEnd(9)} c=${String(out.confidence).padEnd(5)} m=${String(out.margin).padEnd(5)} ${ms}ms  ${c.question}`);
  }
}

// ---- report ------------------------------------------------------------------
const n = rows.length;
const count = (v) => rows.filter((x) => x.verdict === v).length;
const rate = (k) => (n ? Math.round((1000 * k) / n) / 10 : 0);
const summary = {
  cases: cases.length, repeats, routed: n, thresholds,
  hitRate: rate(count('hit')),
  wrongPageRate: rate(count('wrong')),
  ambiguousRate: rate(count('ambiguous') + count('ambiguous-without-it')),
  ambiguousWithoutAnswerRate: rate(count('ambiguous-without-it')),
  fallThroughRate: rate(count('miss') + count('miss-correct')),
  meanMs: n ? Math.round(rows.reduce((s, x) => s + x.ms, 0) / n) : 0,
};
fs.writeFileSync(outFile, JSON.stringify({ summary, rows }, null, 2));
console.log('\n' + JSON.stringify(summary, null, 2));
console.log(`\nwritten ${outFile}. WRONG-PAGE RATE is the one that matters.`);