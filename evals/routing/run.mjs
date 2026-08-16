// Route one message, and print what the reader would have seen.
//
// THIS FILE KNOWS NOTHING ABOUT THE TEST CASES, and that is the point.
//
// Code that routes must not be written against the answers it will be marked
// on. If it were, the fix for a failing case would be a fix for THAT CASE — a
// phrase added to a list, a branch for one presentation — and the evaluation
// would go green while the system got worse: more rules, each right about one
// message and blind to the next one written slightly differently.
//
// So this takes a message and produces a card, and somebody else does the
// marking. evals/routing/cases.md holds the cases and their expected routes; it
// is read by the evaluating agent (see judge.md), never by this script and never
// by whoever is changing lib/.
//
//   node evals/routing/run.mjs <file-with-the-message>       the patterns alone
//   node evals/routing/run.mjs <file> --read                 the real /accurx path
//
// --read makes the same single model call /accurx makes — destination, the
// reasoning behind it, and the wording. It needs OPENROUTER_API_KEY, and without
// one it says so and reports the patterns rather than pretending.
import fs from 'node:fs';
import path from 'node:path';

import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import { ACCURX_READ_SCHEMA, accurxReadPrompt, readingVerdict } from '../../lib/templates/accurx-route.mjs';
import { renderCommand } from '../../lib/templates/route.mjs';
import { triagePatientAnswer } from '../../lib/templates/triage.mjs';
import { answerToText } from '../../lib/questions/flatten.mjs';
import { BOOKING_RULES, REASON_RULES } from '../../lib/templates/writing.mjs';
import { safetyScan } from '../../lib/safety/scan.mjs';

// .env.local, read the way next reads it, because this runs outside next.
function loadEnv() {
  const file = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function readMessage(message) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { skipped: 'no OPENROUTER_API_KEY — patterns only' };

  const model = process.env.EVAL_MODEL || 'google/gemini-3.5-flash-lite';
  const openrouter = createOpenRouter({ apiKey });
  const out = await generateObject({
    model: openrouter(model),
    schema: ACCURX_READ_SCHEMA,
    temperature: 0,
    // No Notebook. This harness is about the routing model, and a Notebook that
    // differs between runs makes a failure impossible to attribute.
    prompt: accurxReadPrompt({
      question: message,
      reasonRules: REASON_RULES,
      bookingRules: BOOKING_RULES,
    }),
  });
  return { model, values: out.object };
}

const file = process.argv[2];
const wantsRead = process.argv.includes('--read');
if (!file) {
  console.error('usage: node evals/routing/run.mjs <file-with-the-message> [--read]');
  process.exit(2);
}

loadEnv();
const message = fs.readFileSync(file, 'utf8').trim();

// What the deterministic cascade alone makes of it. Always reported: a
// disagreement between the two halves is the most useful line on the page.
const patterns = triagePatientAnswer({ condition: '', text: message });

let reading = null;
let values = {};
if (wantsRead) {
  try {
    const got = await readMessage(message);
    if (got.skipped) reading = { skipped: got.skipped };
    else {
      values = got.values || {};
      reading = { model: got.model, ...values };
    }
  } catch (e) {
    reading = { failed: String(e).slice(0, 300) };
  }
}

// The card as the app renders it, including the reading's raise where there was
// one: renderCommand is the same function /api/agent calls.
const card = renderCommand('accurxTriage', values, message, {}) || patterns;
const scan = safetyScan({ message });

console.log(JSON.stringify({
  patternsDestination: patterns.destination || '',
  destination: card.destination || patterns.destination || '',
  title: card.title || '',
  subtitle: card.subtitle || '',
  reading: reading || 'not run (pass --read)',
  routeVerdict: wantsRead ? readingVerdict(values) : null,
  alerts: (scan.items || []).map((i) => ({ rule: i.ruleId, acuity: i.acuity, label: i.label })),
  card: answerToText(card),
}, null, 2));
