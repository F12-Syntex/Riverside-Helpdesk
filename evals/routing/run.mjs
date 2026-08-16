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
import { looksMultiIntent } from '../../lib/safety/requests.mjs';

// .env.local, read the way next reads it, because this runs outside next.
function loadEnv() {
  const file = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function readMessage(message, decompose) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { skipped: 'no OPENROUTER_API_KEY — patterns only' };

  const model = process.env.EVAL_MODEL || 'google/gemini-3.5-flash-lite';
  const openrouter = createOpenRouter({ apiKey });
  const out = await generateObject({
    model: openrouter(model),
    // The SAME schema the endpoint uses, decomposition included when the gate
    // opens. Marking the routing on a call that could only ever return one
    // request would mark a system nobody runs.
    // One schema, whatever the message. The reading returns its own requests.
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

// THE DETERMINISTIC HALF, RUN THE WAY THE CARD RUNS IT.
//
// This passed `condition: ''` once, and triagePatientAnswer answers an empty
// condition with the card that asks the reader to describe the problem — so the
// floor was empty on every case and the evaluation was marking one layer of a
// two-layer system. The card itself never does that: accurxAnswer hands it the
// condition the model named, falling back to the message. So does this.
const decompose = looksMultiIntent(message);

let reading = null;
let values = {};
if (wantsRead) {
  try {
    const got = await readMessage(message, decompose);
    if (got.skipped) reading = { skipped: got.skipped };
    else {
      values = got.values || {};
      reading = { model: got.model, ...values };
    }
  } catch (e) {
    reading = { failed: String(e).slice(0, 300) };
  }
}

const patterns = triagePatientAnswer({
  condition: String(values.condition || '').trim() || message,
  text: message,
});

// The scan over the message as one piece, for the alerts printed below.
//
// IT IS NOT GIVEN `values.requests` ANY MORE, and it must not be: those are
// `{ what, who, goes, note }` from the reading, not the `{ gist, text }` spans
// the scanner splits a message into. Handing one shape to something expecting
// the other scanned nothing, silently.
const scan = safetyScan({ message });

// The card EXACTLY as /api/agent renders it on the reading path, which means no
// complaint and no gist. The endpoint zeroes the scan there — see
// app/api/agent/route.js, `{ items: [], complaint: '', routed: null,
// decomposed: false }` — because the reading is the only judgement now. A
// harness that passed a complaint in would narrow the card to one request where
// production never narrows it, and would be marking a pipeline nobody runs.
const card = renderCommand('accurxTriage', values, message, { complaint: '', gist: '' }) || patterns;

console.log(JSON.stringify({
  patternsDestination: patterns.destination || '',
  destination: card.destination || patterns.destination || '',
  title: card.title || '',
  subtitle: card.subtitle || '',
  // Whether the message was split at all, what it split into, and which one the
  // card is about. A card that answers one of nine requests is only judgeable
  // next to the other eight.
  // What the reading found the message was asking for. `r.what` is the field
  // ACCURX_READ_SCHEMA actually defines; this read `r.gist || r.text`, which are
  // the old split's names, so every request printed as `null` and the one thing
  // a multi-request case is judged on was invisible to the judge.
  decomposed: {
    gate: decompose,
    split: !!scan.decomposed,
    requests: (values.requests || []).map((r) => [r.what, r.goes, r.note].filter(Boolean).join(' → ')),
  },
  answering: scan.complaint ? ((scan.routed && scan.routed.gist) || scan.complaint) : '(the whole message)',
  reading: reading || 'not run (pass --read)',
  routeVerdict: wantsRead ? readingVerdict(values) : null,
  alerts: (scan.items || []).map((i) => ({ rule: i.ruleId, acuity: i.acuity, label: i.label })),
  card: answerToText(card),
}, null, 2));
