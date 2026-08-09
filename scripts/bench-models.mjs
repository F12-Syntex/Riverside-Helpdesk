// Which model should the assistant run on?
//
// Not a spec-sheet comparison. The OpenRouter catalogue says 216 models support
// structured output under $1 per million input tokens, and the last three
// models tried taught the same lesson each time: what a model page advertises
// and what an endpoint delivers are different claims. Ling-3.0-flash lists
// structured outputs and no eligible provider serves them; several endpoints
// reject a reasoning-disable outright.
//
// So this runs the REAL path — the same prompt builder, the same zod schema and
// the same provider routing as app/api/agent — against the real Notebook, and
// scores what comes back:
//
//   works     did the structured call succeed at all
//   correct   did it pick the right template and fill the right slot
//   latency   what a receptionist waits, measured rather than advertised
//
// Correctness is scored against questions whose right answer is known, because
// a fast wrong answer is the failure mode this whole design exists to prevent.
//
// USAGE
//   node scripts/bench-models.mjs .                    # the default shortlist
//   node scripts/bench-models.mjs . model-a model-b    # specific models
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import { SELECTION_SCHEMA, selectionPrompt } from '../lib/templates/route.mjs';
import { AI_SDK_EXTRA_BODY } from '../lib/ai/openrouter.mjs';

const root = process.argv[2] || '.';
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

// Cheapest credible candidates from the catalogue, plus the incumbent. Batch
// endpoints are excluded — they are asynchronous, and nobody at a desk waits
// for a batch job. Very small models are excluded too: the prompt is 16k tokens
// and the job is to not lose the page in the middle of it.
const SHORTLIST = [
  'google/gemini-3.5-flash-lite',
  'google/gemini-2.5-flash-lite',
  'inclusionai/ling-2.6-flash',
  'mistralai/mistral-nemo',
  'nex-agi/nex-n2-mini',
  'qwen/qwen3.7-flash',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3-30b-a3b-instruct-2507',
  'nvidia/nemotron-3-nano-30b-a3b',
  'openai/gpt-5-nano',
  'qwen/qwen3.5-flash-02-23',
  'z-ai/glm-4.7-flash',
  'z-ai/glm-5.2',
  'bytedance-seed/seed-1.6-flash',
  'deepseek/deepseek-v4-flash-latest',
  'mistralai/mistral-small-24b-instruct-2501',
  'ibm-granite/granite-4.1-8b',
  'openai/gpt-4.1-nano',
  'minimax/minimax-m2.7',
];

// Questions whose right answer is known, one per behaviour that matters.
const CASES = [
  {
    ask: 'how do I refer for an ECG',
    want: 'names the ECG referral',
    ok: (o) => o.template === 'referral' && o.referralService === 'ECG',
  },
  {
    ask: 'how do I scan a document',
    want: 'answers from the Notebook',
    ok: (o) => o.template === 'notebook'
      && String(o.answer || '').length > 40
      && /scan/i.test(String(o.answer) + (o.pages || []).join(' ')),
  },
  {
    ask: 'pt has a red sticky eye with some discharge',
    want: 'treats it as triage',
    ok: (o) => o.template === 'triage' && String(o.condition || '').trim().length > 2,
  },
];

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
const notes = await sql`
  SELECT id, parent_id AS "parentId", title, body, is_section AS "isSection", position
  FROM notes ORDER BY position ASC, id ASC
`;
const byId = new Map(notes.map((n) => [n.id, n]));
const pathOf = (row) => {
  const parts = [];
  for (let cur = row, hops = 0; cur && hops < 6; cur = byId.get(cur.parentId), hops++) parts.unshift(cur.title);
  return parts.join(' / ');
};
const notebook = notes
  .filter((n) => n.parentId && !n.isSection && String(n.body || '').trim())
  .map((n) => `### Notebook: ${pathOf(n)}\n${String(n.body).trim()}`)
  .join('\n\n');

console.log(`Notebook: ${notes.length} rows, ${notebook.length} chars (~${Math.round(notebook.length / 4)} tokens)\n`);
console.log('model'.padEnd(42), 'score', '  median', ' note');

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, extraBody: AI_SDK_EXTRA_BODY });
const models = process.argv.slice(3).length ? process.argv.slice(3) : SHORTLIST;

const results = [];
for (const model of models) {
  const row = { model, ok: 0, fail: '', ms: [] };
  for (const test of CASES) {
    const started = Date.now();
    try {
      const out = await generateObject({
        model: openrouter(model),
        schema: SELECTION_SCHEMA,
        temperature: 0,
        maxRetries: 0,
        prompt: selectionPrompt({ question: test.ask, notebook }),
      });
      row.ms.push(Date.now() - started);
      if (test.ok(out.object)) row.ok += 1;
      else row.fail = row.fail || `${test.want} → got ${out.object.template}`;
    } catch (e) {
      row.fail = row.fail || String(e.message || e).replace(/\s+/g, ' ').slice(0, 58);
      break;
    }
  }
  row.median = row.ms.length ? [...row.ms].sort((a, b) => a - b)[Math.floor(row.ms.length / 2)] : null;
  results.push(row);
  console.log(
    model.padEnd(42),
    row.ms.length ? `${row.ok}/${CASES.length}`.padEnd(5) : 'ERR  ',
    row.median ? `${row.median}ms`.padStart(8) : ''.padStart(8),
    row.fail ? ' ' + row.fail : '',
  );
}

console.log('\n— answered all three, fastest first —');
const winners = results.filter((x) => x.ok === CASES.length).sort((a, b) => a.median - b.median);
for (const r of winners) console.log(`${r.model.padEnd(42)} ${String(r.median).padStart(6)}ms`);
if (!winners.length) console.log('(none)');
