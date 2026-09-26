// Real staff questions, for labelling into the router's golden set.
//
//   npm run routing:questions                     the prose fall-throughs, newest first
//   npm run routing:questions -- --all --limit 200
//   npm run routing:questions -- --out evals/routing/questions.txt
//
// The questions come from question_log, which stores what was asked verbatim
// (the identifier redaction has already run on it — see lib/safety/identifiers.mjs
// — so no name or address reaches this file). Duplicates are folded on their
// canonical form and counted, so the list is ranked by how often the practice
// actually asks the thing rather than by who typed it last.
//
// WHY THE PROSE ONES FIRST. An outcome of `prose` means no template and no
// Notebook page fitted, so the assistant wrote the answer itself with nothing
// behind it. That set IS the coverage backlog, and it is the wording the
// router most needs to learn. `--all` widens it to every outcome.
//
// This prints questions and the Notebook page list. It does NOT label them:
// labelling is the judging session's job and must not be done by whoever
// changes lib/routing/ (evals/routing/judge.md).
//
// Needs DATABASE_URL in .env.local.
import fs from 'node:fs';
import path from 'node:path';

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!(process.env.DEV_DATABASE_URL || process.env.DATABASE_URL)) { console.error('Neither DEV_DATABASE_URL nor DATABASE_URL is set'); process.exit(1); }

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => { const i = args.indexOf(name); return i > -1 && args[i + 1] ? args[i + 1] : fallback; };
const limit = Math.max(1, Number(opt('--limit', 120)) || 120);
const all = flag('--all');
const outFile = opt('--out', '');

const { buildFullNotebookSources } = await import('../lib/knowledge-context.mjs');
const { getSql, ensureNotebookSchema, ensureQuestionLogSchema } = await import('../lib/db.js');
const { normaliseQuestion } = await import('../lib/routing/normalise.mjs');
const { pagePath } = await import('../lib/routing/router.mjs');

await ensureNotebookSchema();
await ensureQuestionLogSchema();
const sql = getSql();

const notes = await sql`
  SELECT id, parent_id AS "parentId", title, body, position,
         is_section AS "isSection", kind, fields, status, updated_at AS "updatedAt"
  FROM notes ORDER BY position ASC, id ASC
`;
const pages = buildFullNotebookSources(notes, []);

const rows = all
  ? await sql`SELECT question, outcome, template, at FROM question_log ORDER BY at DESC LIMIT 2000`
  : await sql`SELECT question, outcome, template, at FROM question_log WHERE outcome = 'prose' ORDER BY at DESC LIMIT 2000`;

// Fold on the canonical form: the same question asked six ways is one case.
const folded = new Map();
for (const row of rows) {
  const q = String(row.question || '').trim();
  // A slash command already names its template, so it was never the router's
  // to route. A pasted letter or consultation is not a question.
  if (!q || q.startsWith('/') || q.length > 400) continue;
  const key = normaliseQuestion(q);
  if (key.length < 8) continue;
  const cur = folded.get(key);
  if (cur) { cur.count++; if (!cur.outcomes.includes(row.outcome)) cur.outcomes.push(row.outcome); continue; }
  folded.set(key, { question: q, count: 1, outcomes: [row.outcome], at: row.at });
}
const ranked = [...folded.values()].sort((a, b) => b.count - a.count || new Date(b.at) - new Date(a.at)).slice(0, limit);

const lines = [];
lines.push(`# ${ranked.length} question${ranked.length === 1 ? '' : 's'} to label${all ? '' : ' (fell through to prose)'}`);
lines.push('#');
lines.push('# One per line: how many times it was asked, then the question as typed.');
lines.push('# Label each into evals/routing/pages.md against the page list below.');
lines.push('');
ranked.forEach((r, i) => lines.push(`${String(i + 1).padStart(3)}. [asked ${r.count}x | ${r.outcomes.join(',')}] ${r.question}`));
lines.push('');
lines.push(`# ---- every non-empty Notebook page (${pages.length}) ----`);
for (const p of pages) lines.push(`# ${p.docId}\t${pagePath(p.docTitle)}`);

const text = lines.join('\n') + '\n';
if (outFile) { fs.writeFileSync(outFile, text); console.log(`written ${outFile} — ${ranked.length} questions, ${pages.length} pages`); }
else console.log(text);