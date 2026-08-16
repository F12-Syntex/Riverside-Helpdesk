// What the one /accurx call costs, and whether it still gets the route right.
//
// run.mjs answers "what card would this message produce". This answers the other
// question the practice has to keep asking: "what does that cost the person at
// the desk, and did making it cheaper make it worse". Same reading, deliberately
// separate scripts — a harness that prints a card is read by a person, and a
// harness that prints numbers is diffed against another run of itself.
//
//   node evals/routing/bench.mjs after.json --repeats 5
//   git stash && node evals/routing/bench.mjs before.json --repeats 5 && git stash pop
//
// The two files are then comparable, because the only thing that differed
// between them is the tree.
//
// RUN IT MORE THAN ONCE PER CASE, ALWAYS. temperature 0 is not determinism: the
// same twelve messages, on a byte-identical prompt (79,586 input tokens both
// times, so provably identical), scored 8/12 on one run and 5/12 on the next.
// A single pass over this suite cannot tell a prompt improvement from the
// weather, and every "we fixed three cases" claim made from one pass is a claim
// about noise. `--repeats` exists because that mistake was made here first.
//
// The latency and token numbers are stable across runs and can be read from a
// single pass. The ROUTES cannot. It reads the twelve hard cases in ./messages, makes
// the real call for each, and writes one row per case: where it went, whether
// that is what cases-hard.md expects, the wall time, the tokens in and out, and
// how long the reasoning came back.
//
// NOTHING HERE KNOWS WHAT THE ANSWERS SHOULD BE beyond the list below, which is
// transcribed from cases-hard.md. That is the same separation run.mjs keeps and
// it is kept for the same reason: a benchmark that can be tuned against is a
// benchmark that will be, and the tuning will look like progress.
//
// It needs OPENROUTER_API_KEY, and says so rather than pretending without one.
import fs from 'node:fs';
import path from 'node:path';
// fileURLToPath, not a hand-rolled strip: the repository path has spaces in it,
// and a URL spells those %20. Slicing the pathname off by hand looked for
// "Riverside%20Surgery" on disk and did not find it.
import { fileURLToPath } from 'node:url';

import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import { ACCURX_READ_SCHEMA, accurxReadPrompt } from '../../lib/templates/accurx-route.mjs';
import { BOOKING_RULES, REASON_RULES } from '../../lib/templates/writing.mjs';

// .env.local, read the way next reads it, because this runs outside next.
function loadEnv() {
  const file = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

// THE NOTEBOOK, AS IT USED TO GO IN. One line per page is all the reading ever
// saw of it, so this is faithful in both shape and size. The working tree's
// accurxReadPrompt ignores the argument entirely — that removal is half of what
// is being measured — so passing it makes the same call fair against either
// tree, rather than measuring two different harnesses.
const NOTEBOOK = Array.from(
  { length: 90 },
  (_, i) => `- Practice page ${i + 1} — how the practice handles the thing on page ${i + 1}, in one line`,
).join('\n');

const EXPECTED = [
  'minorEyeService', 'fcp', 'dutyDoctor', 'ae', 'dutyDoctor', 'dutyDoctor',
  'doctorTask', 'diabeticNurse', 'nurse', 'nurse', 'pharmacy', 'dutyInterrupt',
];

const out = process.argv[2];
if (!out) {
  console.error('usage: node evals/routing/bench.mjs <report.json>');
  process.exit(2);
}
if (!process.env.OPENROUTER_API_KEY) {
  console.error('no OPENROUTER_API_KEY — this harness makes real calls and will not pretend it did');
  process.exit(2);
}

const MODEL = process.env.EVAL_MODEL || 'google/gemini-3.5-flash-lite';
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const here = path.dirname(fileURLToPath(import.meta.url));

async function once(n, expected) {
  const message = fs.readFileSync(path.join(here, 'messages', `hard-${String(n).padStart(2, '0')}.txt`), 'utf8').trim();
  const started = Date.now();
  try {
    const res = await generateObject({
      model: openrouter(MODEL),
      schema: ACCURX_READ_SCHEMA,
      temperature: 0,
      prompt: accurxReadPrompt({
        question: message,
        notebook: NOTEBOOK,
        reasonRules: REASON_RULES,
        bookingRules: BOOKING_RULES,
      }),
    });
    const u = res.usage || {};
    const v = res.object;
    return {
      n,
      expected,
      dest: v.destination,
      hit: v.destination === expected,
      ms: Date.now() - started,
      in: u.inputTokens ?? u.promptTokens ?? 0,
      out: u.outputTokens ?? u.completionTokens ?? 0,
      reasoning: String(v.reasoning || ''),
      reasoningWords: String(v.reasoning || '').split(/\s+/).filter(Boolean).length,
      requests: (v.requests || []).length,
      flags: (v.flags || []).length,
      conflicts: (v.conflicts || []).length,
      ruledOut: (v.ruledOut || []).length,
    };
  } catch (e) {
    // A case that could not be read is reported as one, never dropped. A
    // benchmark that quietly runs eleven of twelve lies about both halves of
    // what it measures: the accuracy AND the mean.
    return {
      n, expected, dest: '', hit: false, error: String(e).slice(0, 160),
      ms: Date.now() - started, in: 0, out: 0,
      reasoning: '', reasoningWords: 0, requests: 0, flags: 0, conflicts: 0, ruledOut: 0,
    };
  }
}

const repeatsAt = process.argv.indexOf('--repeats');
const REPEATS = repeatsAt > -1 ? Math.max(1, Number(process.argv[repeatsAt + 1]) || 1) : 1;

// Every case, every repeat, issued together. They are independent calls and the
// thing being measured is what one of them costs, not how fast this script can
// get through them.
const rows = (await Promise.all(
  Array.from({ length: REPEATS }, (_, pass) =>
    EXPECTED.map((expected, i) => once(i + 1, expected).then((r) => ({ ...r, pass: pass + 1 })))).flat(),
)).sort((a, b) => a.n - b.n || a.pass - b.pass);

// PER CASE, ACROSS THE REPEATS. A case that lands right three times in five is
// not the same as one that lands right five times in five, and reporting only
// the total hides exactly the difference worth acting on.
const byCase = EXPECTED.map((expected, i) => {
  const mine = rows.filter((r) => r.n === i + 1);
  const hits = mine.filter((r) => r.hit).length;
  const got = {};
  for (const r of mine) got[r.dest || 'ERROR'] = (got[r.dest || 'ERROR'] || 0) + 1;
  return {
    n: i + 1,
    expected,
    hits,
    of: mine.length,
    answers: Object.entries(got).sort((a, b) => b[1] - a[1]).map(([d, c]) => `${d}×${c}`).join(' '),
  };
});
for (const c of byCase) {
  console.log(`${String(c.n).padStart(2)}. want ${c.expected.padEnd(16)} ${String(c.hits)}/${c.of}  ${c.answers}`);
}

const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
const mean = (k) => Math.round(sum(k) / rows.length);
const summary = {
  model: MODEL,
  cases: EXPECTED.length,
  repeats: REPEATS,
  calls: rows.length,
  // Out of every call made, not out of twelve — which is the number that can be
  // compared between two trees without lying about how sure it is.
  hits: rows.filter((r) => r.hit).length,
  hitRate: +(rows.filter((r) => r.hit).length / rows.length).toFixed(3),
  // How many cases never wavered, either way. A suite whose total is steady
  // while its cases flip is a suite that has not measured anything.
  alwaysRight: byCase.filter((c) => c.hits === c.of).length,
  alwaysWrong: byCase.filter((c) => c.hits === 0).length,
  errors: rows.filter((r) => r.error).length,
  meanIn: mean('in'),
  meanOut: mean('out'),
  meanMs: mean('ms'),
  meanReasoningWords: mean('reasoningWords'),
};
console.log('\n' + JSON.stringify(summary, null, 2));
fs.writeFileSync(out, JSON.stringify({ summary, byCase, rows }, null, 2));
console.log(`report → ${out}`);
