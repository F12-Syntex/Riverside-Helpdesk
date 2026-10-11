// The agent endpoint: one question, one answer.
//
// THREE PATHS, decided before any model runs:
//
//   A CONTACT DETAIL the practice directory holds is answered from it,
//   verbatim, with no model at all (lib/templates/directory.mjs).
//
//   A SLASH COMMAND (/accurx, /coding, /practice, /form, /template,
//   /consultation, /medication — lib/commands.mjs) names its card outright.
//   The model fills that one card's values and code renders it, so the shape
//   of the answer cannot drift however the model words things.
//
//   EVERY OTHER QUESTION is answered from the WHOLE NOTEBOOK. The writer is
//   shown every page, in full, and writes a short answer from them alone,
//   citing each page it used by its heading; code turns each citation into a
//   link to the page and refuses any it cannot find
//   (lib/questions/references.mjs). The Notebook is the first, byte-stable
//   part of the prompt and is marked cacheable, so after the first turn the
//   provider reads it from its cache. There is no search, no page picker and
//   no card on this path: the Referrals page (`/`) is where the cards live.
//
// EVERY Q&A ANSWER IS CHECKED BEFORE IT GOES OUT. It is put to a decision
// model (the `check` role) with the question and the pages it cites: does it
// answer what was asked? A low score withdraws it for an honest "I don't know"
// and files the question; a middling one adds a line asking the reader to check
// it against the page; a check that fails or is slow changes nothing
// (lib/questions/answer-check.mjs).
//
// EVERY TURN IS WRITTEN DOWN. As the answer goes out, the question, the answer
// as text, the template that built it and the model that ran are recorded in
// question_log (lib/questions/log.js) and read back at /stats. That is how the
// output is monitored: an answer is only reconstructable while the Notebook page
// behind it is unchanged, so it is stored at the moment it is given.
import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { generateObject, generateText, zodSchema } from 'ai';
import {
  COMMAND_SCHEMAS, DECOMPOSING_COMMANDS, MULTI_COMMAND_SCHEMAS,
  commandPrompt, notebookFullText, proseSystemMessage, renderCommand,
} from '@/lib/templates/route.mjs';
import { acuityBandAnswer, confidentialityAnswer, unresolvedPanel } from '@/lib/templates/safety.mjs';
import { readingVerdict } from '@/lib/templates/accurx-route.mjs';
import { needsAppointmentMode } from '@/lib/triage/destinations.mjs';
import { looksMultiIntent } from '@/lib/safety/requests.mjs';
import { bandFindings, rescore, safetyScan } from '@/lib/safety/scan.mjs';
import { redactIdentifiers } from '@/lib/safety/identifiers.mjs';
import { CLASSIFY_SCHEMA, applyClassification, classifyPrompt, toClassify } from '@/lib/safety/triage-pass.mjs';
import { buildProvenance } from '@/lib/questions/provenance.mjs';
import { checksPatientData, commandByTemplate, forcedTemplate } from '@/lib/commands.mjs';
import { practiceSearchAnswer } from '@/lib/templates/practice.mjs';
import {
  PRACTICE_ANSWER_SCHEMA, groundPracticeAnswer, practiceAnswerPrompt, practiceSources,
} from '@/lib/agent/practice-answer.mjs';
import { formCommandAnswer, templateCommandAnswer } from '@/lib/templates/lookup-command.mjs';
import { contractNotFound, contractReasonedAnswer } from '@/lib/templates/contracts.mjs';
import { directoryAnswerIn } from '@/lib/templates/directory.mjs';
import { findContracts, nelContracts } from '@/lib/referrals/nel-contracts.mjs';
import {
  CONTRACT_INTENT_SCHEMA, INTENT_TIMEOUT_MS, contractFromWeb, contractIntentPrompt,
  contractsForTemplate, pcitPages, resolvePick, searchForContract, sourceLines, templateRoster,
  templatesOf,
} from '@/lib/agent/contract-intent.mjs';
import { searchPassages } from '@/lib/search/search.mjs';
import { knowledgeHitToDocumentChunk } from '@/lib/knowledge-context.mjs';
import { fullNotebookContext } from '@/lib/notebook';
import { attachmentsBlock, sanitiseAttachments } from '@/lib/attachments/extract.mjs';
import { contactTelSet, digitsOf, redactUnverifiedNumbers } from '@/lib/contacts';
import { contactEntries } from '@/lib/contacts-store';
import { notebookProgress } from '@/lib/agent/notebook-progress.mjs';
import { createRouter, reasoningFor } from '@/lib/ai/openrouter.mjs';
import { getModelRoles } from '@/lib/settings';
import { recordUsage } from '@/lib/ai/usage';
import { usageCounts } from '@/lib/ai/usage-counts.mjs';
import { recordQuestion } from '@/lib/questions/log';
import { loggingOffIn } from '@/lib/questions/opt-out.mjs';
import { answerToText } from '@/lib/questions/flatten.mjs';
import { decide, decisionUsage } from '@/lib/ai/decisions.mjs';
import {
  checkProvenance, closestPages, runAnswerCheck, shouldCheck, unknownAnswer, withConfirmLine,
} from '@/lib/questions/answer-check.mjs';
import { citedPages, resolveReferences, saysDontKnow, sourcesLine } from '@/lib/questions/references.mjs';
import { noteUnansweredQuestion } from '@/lib/questions/open';
import { isCollectableQuestion } from '@/lib/questions/gaps.mjs';
import { previousUserMessage } from '@/lib/search/query.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One model call. The five minutes the research loop needed are not needed here.
export const maxDuration = 120;

// Output caps — see readValues for why every call names one. The values read
// back for a card are small; a prose answer a receptionist reads is shorter
// than this.
const READ_MAX_TOKENS = 2000;
// The most one structured-output attempt may take before the text path is
// tried instead — see readValues.
const STRUCTURED_BUDGET_MS = 20_000;
// The Q&A answer is told to stay near 150 words; the cap is well above that
// because the output count includes any thinking the model does first
// (Claude Haiku 5.5 was measured spending ~470 tokens of it), and an answer cut
// off mid-sentence is worse than a long one.
const PROSE_MAX_TOKENS = 3000;

// THE TURN STOPS ITSELF BEFORE THE PLATFORM DOES. At maxDuration the function
// is killed mid-call: the reader is left watching a status line that never
// changes, the turn is never logged, and the only trace is "Task timed out
// after 120 seconds". Every model call on the turn shares this one deadline,
// so a call still running at it is abandoned, and the turn ends the ordinary
// way — an error the reader can see and a failed row on /stats — with time to
// spare for both.
const TURN_BUDGET_MS = 105_000;

// Numbers the answer is allowed to keep: the practice directory, plus anything
// already present in the reader's own message, history or attached document (an
// email being reformatted carries the numbers it arrived with). Every other
// number is the model's invention and is stripped before a receptionist can
// dial it.
const NUMBER_RUN = /\d[-\d.()/ \t ]{7,}\d/g;
function verifiedNumbers(texts = []) {
  const verified = new Set(contactTelSet());
  for (const text of texts) {
    for (const run of String(text || '').match(NUMBER_RUN) || []) {
      const d = digitsOf(run);
      if (d.length >= 9) verified.add(d);
    }
  }
  return verified;
}

// The machine the question was typed at, for the question log. The tracker
// mirrors its id into a year-long cookie (lib/audit/client.js), and that cookie
// is the only thing on the request that says which desk this was: no IP address
// is recorded here or anywhere else in the app.
const MACHINE_COOKIE = /(?:^|;\s*)riva_machine=([^;]+)/;
function machineFromCookie(request) {
  const match = (request.headers.get('cookie') || '').match(MACHINE_COOKIE);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
}

/* ------------------------------------------------------------------ *
 * The deterministic floor, rendered.
 *
 * One card answers one request, and the message may have carried five.
 * Two things go out alongside it, and neither costs a token:
 *
 *   ALERTS, above the card. What the scanners in lib/safety found
 *   anywhere in the message — including in the paragraphs nothing
 *   routed and nothing answered — and who it goes to.
 *
 *   THE PANEL, beside it. Every request the message contained, marked
 *   routed, flagged, refused or unhandled. It is the backstop for
 *   every rule that misses: a pattern cannot match a paraphrase, and
 *   the panel still shows the sentence was written and that nothing
 *   answered it.
 *
 * `cardScans` says whether the card about to render runs the triage
 * net over its own text. When it does, a finding inside the routed
 * complaint is already that card's business and saying it twice is
 * noise. When it does not — a Notebook page, a referral, a filing
 * title — nothing else in this turn will mention it.
 * ------------------------------------------------------------------ */
function safetyOutput(scan, { cardScans = false } = {}) {
  const band = bandFindings(scan, { cardScans });
  return {
    // The emergency band before the refusal: one of them is measured in
    // minutes and the other is not.
    alerts: [
      acuityBandAnswer(band.acuity, { age: scan.age }),
      confidentialityAnswer(band.confidentiality),
    ].filter(Boolean),
    panel: unresolvedPanel(scan),
  };
}

// Stage 2 must never be the reason a turn does not answer. Anything slower than
// this is abandoned and the deterministic floor stands on its own.
const CLASSIFY_TIMEOUT_MS = 15000;

function withTimeout(promise, ms) {
  let timer = null;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), ms); }),
  ]);
}

/**
 * THE ONE SECOND PASS IN THE APP — /accurx only.
 *
 * One small structured call per decomposed request, issued together so five of
 * them cost one round trip rather than five. Each returns an enum and a label:
 * no prose, nothing that could reach the reader as advice.
 *
 * The model may only RAISE acuity — the veto lives in applyClassification, not
 * here — so a weak reading changes nothing and a good one catches the item the
 * patterns could not phrase-match. Every failure path returns the scan exactly
 * as the deterministic floor left it.
 */
async function deepenTriage({ openrouter, model, question, scan, turnId, send }) {
  const { take, skipped } = toClassify((scan.items || []).filter((item) => !item.trivia));
  if (!take.length) return scan;

  send({ type: 'status', text: 'Reading each request' });
  send({
    type: 'tool-start',
    id: 'classify',
    tool: 'read_each_request',
    label: 'Reading each request on its own',
    detail: take.length + (take.length === 1 ? ' request' : ' requests'),
  });

  const verdicts = await Promise.all(take.map(async (item) => {
    try {
      const out = await withTimeout(generateObject({
        model: openrouter(model),
        schema: CLASSIFY_SCHEMA,
        temperature: 0,
        prompt: classifyPrompt(item.text, question),
      }), CLASSIFY_TIMEOUT_MS);
      recordUsage({ turnId, role: 'fast', phase: 'classify', model, usage: out.usage });
      return out.object;
    } catch (e) {
      // One request unread is one request the scanners still ranked. Say so in
      // the log and carry on with the other four.
      console.warn('[agent] request classification failed:', String(e).slice(0, 160));
      return null;
    }
  }));

  const read = new Map(take.map((item, i) => [item.id, verdicts[i]]));
  const raised = verdicts.filter(Boolean).length;

  send({
    type: 'tool-result',
    id: 'classify',
    tool: 'read_each_request',
    summary: raised + ' of ' + take.length + ' read',
    items: [],
  });

  return rescore({
    ...scan,
    items: (scan.items || []).map((item) => (read.has(item.id) ? applyClassification(item, read.get(item.id)) : item)),
    unread: skipped,
  });
}

const NDJSON_HEADERS = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-store, no-transform',
  Connection: 'keep-alive',
};

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY.' }, { status: 500 });
  }

  // The FAST model writes the answer. There is no research phase left for it to
  // drive, and no reasoning phase to hand off to: this is the whole turn. An
  // unset fast role resolves to the reasoning model, so an install that has only
  // ever chosen one model still works.
  const roles = await getModelRoles();
  const model = roles.fast.model;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const asked = typeof body?.question === 'string' && body.question.trim() ? body.question : 'Please look at the attached image.';
  // A slash command names the template outright, so nothing is chosen here. Only
  // a template a command claims is honoured (lib/commands.mjs); anything else
  // sent in this field is ignored and the message is answered the ordinary way.
  const command = forcedTemplate(body?.template);
  // The same local name-and-address check the browser ran before sending
  // (lib/safety/identifiers.mjs), run again here. In the ordinary case this
  // changes nothing — the text arrived already redacted — and that is the
  // point: the guard is a property of the endpoint, not of the page, so a
  // message posted to /api/agent by anything else is held to it too. It runs
  // before the model sees the question and before question_log stores it.
  //
  // EXCEPT ON THE ONE TEMPLATE THAT IS NOT CHECKED. Coding is handed a letter
  // about a patient — that is its input — so the browser sends it unredacted
  // and the endpoint must not redact it either: a guard that runs on only one
  // side of the wire edits the letter without protecting anything, and files it
  // under [name removed]. `checksPatientData` answers for both sides off the
  // same flag (lib/commands.mjs), and a template no command claims is redacted
  // as everything else is.
  const checked = checksPatientData(commandByTemplate(command));
  // Every contact the practice holds, added ones included (lib/contacts-store.js):
  // the names the guard leaves alone, and the rows the directory card answers from.
  const contacts = await contactEntries();
  const question = checked ? redactIdentifiers(asked, { allow: contacts }).text : asked;
  const history = typeof body?.history === 'string' ? body.history : '';
  const images = Array.isArray(body?.images)
    ? body.images.filter((u) => typeof u === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(u)).slice(0, 4)
    : [];
  // A MESSAGE WITH A PICTURE ON IT RUNS ON THE IMAGES ROLE, whichever path it
  // takes below — a command, or the Q&A answer. The model chosen
  // for reading and writing may not see pictures at all, and the one chosen
  // for pictures is chosen for that alone (lib/settings.js). `seeing` is read
  // wherever a model is named, so the choice is made once and cannot drift
  // between the three paths.
  const seeing = images.length > 0;
  const imageModel = roles.images.model;
  // The prompt as the one user message, with the pictures beside it when the
  // message carries any. The AI SDK takes either `prompt` or `messages`, never
  // both, so this returns whichever applies and the call spreads it in.
  const withImages = (text) => (seeing
    ? { messages: [{ role: 'user', content: [{ type: 'text', text }].concat(images.map((url) => ({ type: 'image', image: url }))) }] }
    : { prompt: text });

  // STRUCTURED OUTPUT, WITH A WAY ROUND A PROVIDER THAT REFUSES IT.
  //
  // generateObject asks the provider for JSON that fits the schema, and not
  // every endpoint honours that — least of all a small vision model handed a
  // picture, which is exactly the call this app most needs to succeed. When it
  // fails, the same request is made again as plain text asking for the JSON
  // by hand, the first {...} in the reply is parsed and checked against the
  // schema, and only if THAT fails does the caller see an error. The reader
  // gets the card either way; the log says which way it came.
  //
  // EVERY CALL HERE NAMES ITS OUTPUT CAP. Left unset, OpenRouter reserves the
  // model's whole output window — 65,536 tokens on some — before the call is
  // made, and refuses the request outright when the account cannot cover that
  // reservation: "You requested up to 65536 tokens, but can only afford
  // 1104." The values being read back are a few hundred tokens; a screen of
  // thirty medications is under two thousand. So the cap is that, and a call
  // costs what it uses rather than what the model could have written.
  //
  // CLAUDE GOES STRAIGHT TO THE TEXT PATH. Anthropic's structured output
  // rejected the old page picker's schema — "Schema is too complex" — and on Vertex it
  // took up to 100 seconds to say so, which spent the whole turn budget and
  // left the fallback aborted before it started. The same prompt as plain
  // JSON comes back in about two seconds.
  //
  // And no structured attempt may take more than STRUCTURED_BUDGET_MS, so a
  // provider that stalls on a schema still leaves the fallback time to run.
  const readValues = async ({ model: id, schema, text, role, phase }) => {
    const began = Date.now();
    try {
      if (!reasoningFor(id)) throw new Error('structured output skipped for Claude');
      const abortSignal = AbortSignal.any([deadline, AbortSignal.timeout(STRUCTURED_BUDGET_MS)]);
      const out = await generateObject({ model: openrouter(id), schema, temperature: 0, maxOutputTokens: READ_MAX_TOKENS, abortSignal, ...withImages(text) });
      recordUsage({ turnId, role, phase, model: id, usage: out.usage });
      tookTime(phase, id, began);
      return out.object;
    } catch (first) {
      if (deadline.aborted) throw first;
      console.warn(`[agent] structured ${phase} failed on ${id} after ${seconds(began)}, retrying as text:`, String(first).slice(0, 200));
      const loose = await generateText({
        model: openrouter(id),
        temperature: 0,
        maxOutputTokens: READ_MAX_TOKENS,
        abortSignal: deadline,
        ...withImages(text + '\n\nReply with ONE JSON object and nothing else — no prose, no code fence — matching this JSON Schema:\n' + JSON.stringify(zodSchema(schema).jsonSchema)),
      });
      recordUsage({ turnId, role, phase: phase + 'Text', model: id, usage: loose.usage });
      tookTime(phase + 'Text', id, began);
      const raw = String(loose.text || '');
      const a = raw.indexOf('{');
      const b = raw.lastIndexOf('}');
      if (a === -1 || b === -1) throw first;
      return schema.parse(JSON.parse(raw.slice(a, b + 1)));
    }
  };
  // A document dropped onto the question and already read into text by
  // /api/attach. The reader's own material: context for the model, never stored.
  const attachments = sanitiseAttachments(body?.attachments);
  const attached = attachmentsBlock(attachments);
  // `command` is resolved above the redaction now, because it is what decides
  // whether the redaction runs at all.

  const openrouter = createRouter(apiKey);
  const turnId = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const startedAt = Date.now();
  const deadline = AbortSignal.timeout(TURN_BUDGET_MS);
  // One line per model phase, so a slow turn in the runtime logs says which
  // step it was slow in. lib/ai/openrouter.mjs logs each HTTP attempt beneath
  // these, which is where a retry shows.
  const seconds = (since) => ((Date.now() - since) / 1000).toFixed(1) + 's';
  const tookTime = (phase, id, since) => console.info(`[agent] ${turnId} ${phase} on ${id} took ${seconds(since)} (turn at ${seconds(startedAt)})`);
  const machineId = machineFromCookie(request);
  // This machine's own answer to "record what I ask here?". Set at /settings,
  // held in a cookie on the computer it was set at, and read once per turn.
  const logging = !loggingOffIn(request.headers.get('cookie') || '');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); } catch (e) { /* the reader went away */ }
      };

      // One row per turn, written as the answer goes out: what was asked, what
      // was shown and what built it, so /stats can show the output rather than
      // only the traffic. See lib/questions/log.js for why the audit log does
      // not cover this. Never allowed to fail a turn — recordQuestion swallows
      // its own errors — and on Vercel it is handed to waitUntil so the row is
      // still written after the response has been closed.
      // What a Q&A turn read and cited, once it has: how many Notebook pages
      // the writer was shown, the ids of the pages its answer cited, and any
      // heading it cited that named no page. Kept with the turn's provenance,
      // so a wrong answer on /stats can be traced to the pages it stood on.
      let referencesLog = null;
      // What the answer check made of the answer, once it has run: the score,
      // the model and how long it took — or why it did not run. Kept with the
      // provenance for the same reason as the references: a withdrawn answer, or
      // one that went out with a "check this" line, has to be explainable on
      // /stats, and the scores against staff verdicts are what the thresholds
      // get tuned on.
      let checkLog = null;
      const logTurn = (turn) => {
        // The whole turn's time, in the runtime logs whether or not this desk
        // records its questions — it carries no words of the question.
        console.info(`[agent] ${turnId} ${turn.outcome}${turn.template ? ' ' + turn.template : ''} in ${seconds(startedAt)}`);
        // Switched off at this desk: no row, and nothing else about the turn
        // changes. The caller still awaits something, so every path that ends a
        // turn reads the same whether the log is on or off.
        if (!logging) return Promise.resolve();
        const writing = recordQuestion({
          turnId,
          machineId,
          // Logged as it was typed. A message sent with /accurx was a different
          // act from the same words typed plain, and the log should say so.
          question: command ? '/' + (commandByTemplate(command)?.name || '') + ' ' + question : question,
          // The model the pictures were read by, when there were any: the log
          // should name what actually ran.
          model: seeing ? imageModel : model,
          durationMs: Date.now() - startedAt,
          images: images.length,
          attachments: attachments.length,
          ...turn,
          provenance: (referencesLog || checkLog)
            ? {
              ...(turn.provenance || {}),
              ...(referencesLog ? { references: referencesLog } : {}),
              ...(checkLog ? { check: checkLog } : {}),
            }
            : turn.provenance,
        });
        if (process.env.VERCEL) {
          try { waitUntil(writing); } catch (e) { /* awaited below instead */ }
        }
        return writing;
      };

      // Every answer this endpoint sends has the same shape, and it was written
      // out four times. Once, with the differences passed in: a field added to
      // an answer should not be a field three other answers quietly lack.
      const payload = (extra = {}) => ({
        kind: 'answer',
        answerable: true,
        // The turn this answer is, so a verdict left on it — or an item closed
        // on its panel — joins back to the answer it was actually about rather
        // than to the next turn worded the same way.
        turnId,
        // Built from what the practice recorded, so NOT flagged as the
        // assistant's own work the way the prose fallback is.
        general: false,
        template: null,
        // The deterministic floor: what was found anywhere in the message, and
        // everything the message asked for. Never model output.
        alerts: [],
        panel: null,
        intro: '',
        keyPoints: [],
        sections: [],
        message: '',
        messageCite: null,
        messageWeb: null,
        tip: '',
        gaps: '',
        followUps: [],
        clarify: null,
        referralRoute: null,
        citations: [],
        contacts: [],
        validation: { attempts: 0, checked: 0, verified: 0, dropped: 0, problems: [] },
        ...extra,
      });

      // THE NOTEBOOK, FETCHED AT MOST ONCE A TURN.
      //
      // Every page, as live in the notes table — read only by the Q&A path
      // below (commands never open it). fullNotebookContext keeps the pages in
      // server memory and re-reads them only when a one-row version check says
      // the Notebook changed, so this is usually one small query. The writer
      // is shown all of it; code also needs every page, to resolve the pages
      // the answer cites and to build the number allow-list.
      //
      // A Notebook that cannot be read is answered without it rather than
      // failing the turn — the same best-effort it always had.
      //
      // DECLARED ABOVE EVERY PATH THAT READS IT. This endpoint has thrown
      // ReferenceError twice from a `const` read before the line declaring it
      // ran (see `reading` below); anything a later branch needs is declared
      // up here or in the branch that uses it, never after it.
      let notebookRead = null;
      const notebook = async () => {
        if (notebookRead) return notebookRead;
        try {
          notebookRead = await fullNotebookContext();
        } catch (e) {
          console.warn('[agent] notebook unavailable:', String(e).slice(0, 160));
          notebookRead = [];
        }
        return notebookRead;
      };

      // What the reader saw, as text, for the log: the bands above the card and
      // the card itself. A band is part of the answer, not decoration around
      // it, and a log that omitted it would not show what was on screen.
      const shownText = (alerts, card) => [...(alerts || []), card]
        .filter(Boolean)
        .map((part) => answerToText(part))
        .filter(Boolean)
        .join('\n\n---\n\n');

      try {
        // A COMMAND NAMES ITS CARD. /accurx and /coding have already said
        // what the message is, so the model is asked for that one template's
        // values and nothing else: no Notebook to read, a schema with
        // one field in it, and no way for the turn to end up somewhere else.
        const searching = command === 'practiceSearch';
        // The two list lookups. Named here rather than described as "filling in
        // the card", which is what the model-filled commands do and would be a
        // lie about a path no model is on.
        // NAMED, NOT DESCRIBED. The reader chose a document; the line that says
        // what is happening says which document, in the words printed on it.
        const lookingUp = command === 'referralForm' ? 'the NEL Referral Tree (EMIS Web)'
          : command === 'contractTemplate' ? 'Primary Care IT’s contract and OneTemplate documents'
            : '';
        const said = searching ? 'Searching the practice documents'
          : lookingUp ? `Looking it up in ${lookingUp}`
            // A picture is read before anything is filled in, and the line
            // says so: the wait on a screenshot is the model looking at it.
            : seeing ? (images.length === 1 ? 'Reading the picture' : 'Reading the pictures')
              : command ? 'Filling in the card' : 'Reading the Notebook';
        send({ type: 'status', text: said });
        send({
          type: 'tool-start',
          id: 'select',
          tool: searching ? 'search_documents' : lookingUp ? 'look_up_list' : command ? 'pick_template' : 'read_notebook',
          label: searching || lookingUp ? said : (command ? 'Told which answer to give' : 'Reading the Notebook'),
          detail: question.slice(0, 120),
        });

        // The whole message, scanned, whatever this turn turns out to be. It is
        // reassigned once the model has had a chance to split the message up;
        // until then it stands on the message as one piece, so a turn that
        // fails before that point still carries its safety findings.
        let scan = safetyScan({ message: question });
        let stage2 = '';

        // THE DIRECTORY IS ASKED BEFORE THE MODEL IS.
        //
        // "What is the number for the Riverside Practice?" fitted no template,
        // so it fell through to prose — and the prose path is told it cannot see
        // the practice's own material, so the assistant answered "ask the
        // practice manager" about a number sitting in this repository. The sheet
        // was never consulted, because nothing on that path consulted it.
        //
        // A message that is asking for a contact detail, and names something the
        // directory holds, is now answered from the directory: the row, verbatim
        // from structured data, no model, no tokens and nothing to mis-type. A
        // message that is not asking for one, or names something the directory
        // does not hold, returns null here and the turn goes on exactly as
        // before — the check costs a few string comparisons.
        const directoryCard = command ? null : directoryAnswerIn(contacts, question);
        if (directoryCard) {
          send({
            type: 'tool-result',
            id: 'select',
            tool: 'read_notebook',
            summary: 'Found in the practice directory',
            items: [],
          });
          // The bands still apply. A red flag in the same message as a request
          // for a number is still a red flag.
          const directorySafety = safetyOutput(scan, { cardScans: false });
          send({
            type: 'answer',
            payload: payload({
              template: directoryCard,
              alerts: directorySafety.alerts,
              panel: directorySafety.panel,
            }),
          });
          const writtenDirectory = logTurn({
            outcome: 'template',
            template: 'directory',
            source: (directoryCard.source || []).join(' · '),
            answer: shownText(directorySafety.alerts, directoryCard),
            // Nothing was asked of a model, and the log should not name one.
            model: '',
            provenance: buildProvenance({ scan, card: directoryCard }),
          });
          controller.close();
          await writtenDirectory;
          return;
        }

        if (command) {
          let commandAnswer = null;
          // /accurx only: what reading the whole message made of where it goes.
          // Declared out here so the turn can be logged with it.
          let route = null;
          // WHETHER THIS IS THE READING PATH, DECLARED WHERE IT IS READ.
          //
          // It was declared inside the else-branch below and read again after
          // that branch had closed, to decide whether the deterministic scanners
          // band the card. Every /accurx threw ReferenceError there: the model
          // had already been paid for, the card had already been built, and the
          // reader got a failed turn. It is declared with `route` now, because
          // the two are read in the same places.
          const reading = command === 'accurxTriage';

          if (command === 'practiceSearch') {
            // THE DOCUMENTS, ANSWERED — NOT PRINTED.
            //
            // This branch used to run no model at all: the passages search
            // found were shown word for word, five of them, each cut at 700
            // characters and finished with an ellipsis. The words were exact and
            // the answer was unreadable — most of what arrived was about
            // something the reader had not asked, and the part that was about
            // their question stopped halfway through a sentence.
            //
            // So the documents are read and the question is answered, in the
            // same shape as every other answer: prose, with a chip under each
            // part naming the document it stands on and opening it at the exact
            // words. Nothing is lost — the verbatim text is one tap away,
            // instead of in front of everybody.
            //
            // The guarantee moved rather than went: every part quotes its
            // Source, the quote is checked against the retrieved passage here on
            // the server, and a part whose words are not found is deleted before
            // the reader sees it (lib/agent/practice-answer.mjs). What survives
            // is what the documents were found to say.
            let chunks = [];
            try {
              const hits = await searchPassages(question, { kinds: ['document'], limit: 12 });
              chunks = hits.map(knowledgeHitToDocumentChunk);
              // What the search found, for the working card: the documents
              // the passages came from, in the order they ranked.
              const titles = [...new Set(chunks.map((c) => c.docTitle).filter(Boolean))];
              send({ type: 'progress', stage: 'documents', matched: chunks.length, matches: titles.slice(0, 6).map((title) => ({ title })) });
            } catch (e) {
              // A search that cannot run says so, rather than answering the
              // question some other way — /practice means these documents.
              console.warn('[agent] practice search failed:', String(e).slice(0, 160));
            }
            // The old card, for the two cases the written answer cannot cover:
            // nothing was retrieved, or nothing that was written could be
            // verified. Showing the passages is a worse answer than a written
            // one and a far better answer than none.
            const passages = chunks.map((chunk) => ({
              docTitle: chunk.docTitle,
              docId: chunk.docId,
              section: chunk.section,
              text: chunk.text,
              url: chunk.view && chunk.view.url ? chunk.view.url : '',
              // The rendered pages of the document this passage sits on, for
              // the forms and posters whose point is what they look like.
              images: (chunk.images || []).map((src) => '/' + String(src).replace(/^\//, '')),
            }));
            commandAnswer = practiceSearchAnswer({ query: question, passages });

            const { refMap, extracts } = practiceSources(chunks);
            if (extracts.length && apiKey) {
              try {
                send({ type: 'status', text: 'Reading the documents' });
                // WRITTEN BY THE REASONING MODEL, like every other answer in
                // this app. Reading and searching are taken off it; the writing
                // never is.
                const written = await generateObject({
                  model: openrouter(roles.reasoning.model),
                  schema: PRACTICE_ANSWER_SCHEMA,
                  temperature: 0.2,
                  abortSignal: deadline,
                  prompt: practiceAnswerPrompt({ question, extracts }),
                });
                recordUsage({ turnId, role: 'reasoning', phase: 'practice', model: roles.reasoning.model, usage: written.usage });
                const grounded = written.object.answerable
                  ? groundPracticeAnswer({
                    written: written.object,
                    refMap,
                    redact: (t) => redactUnverifiedNumbers(t, verifiedNumbers([question, history, attached])),
                  })
                  : { intro: '', sections: [], citations: [] };
                if (grounded.sections.length) {
                  send({
                    type: 'tool-result',
                    id: 'select',
                    tool: 'search_documents',
                    summary: grounded.citations.map((c) => c.docTitle).join(' · ') || 'The practice documents',
                    items: [],
                  });
                  const practiceSafety = safetyOutput(scan, { cardScans: false });
                  send({
                    type: 'answer',
                    payload: payload({
                      intro: grounded.intro,
                      sections: grounded.sections,
                      citations: grounded.citations,
                      alerts: practiceSafety.alerts,
                      panel: practiceSafety.panel,
                    }),
                  });
                  const writtenPractice = logTurn({
                    // Built out of the practice's own documents, which is what
                    // 'template' means in the log — the outcomes are the three
                    // things a reader of /stats has to tell apart, and this is
                    // not the model writing from general knowledge.
                    outcome: 'template',
                    template: command,
                    source: grounded.citations.map((c) => c.docTitle).join(' · '),
                    answer: [
                      shownText(practiceSafety.alerts, null),
                      grounded.intro,
                      ...grounded.sections.map((sec) => sec.markdown),
                    ].filter(Boolean).join('\n\n'),
                    model: roles.reasoning.model,
                    provenance: buildProvenance({ scan }),
                  });
                  controller.close();
                  await writtenPractice;
                  return;
                }
              } catch (e) {
                // The passages card is already built and is a true answer. A
                // failed call, or an answer none of which could be verified,
                // leaves it standing.
                console.warn('[agent] practice answer failed:', String(e).slice(0, 160));
              }
            }
          } else if (command === 'referralForm' || command === 'contractTemplate') {
            // NO MODEL AT ALL, and no network either — both lists are files in
            // this repository, so the card is built and returned in the time it
            // takes to rank a few hundred strings.
            //
            // The reader named the list by typing the command, so a miss is
            // answered by a published list saying it has nothing, NOT by falling
            // through to prose about it — a model writing plausibly about a form
            // that is not on PCIT's list is precisely what typing /form is meant
            // to rule out.
            //
            // ONE DOCUMENT EACH, AND NO NOTEBOOK. Referral form reads PCIT's
            // "NEL Referral Tree introduction & document list (EMIS Web)";
            // Contract template reads PCIT's NEL Local Contract Specifications.
            // Neither reads the practice's own pages, and neither falls through
            // to the other's document: a miss is a miss, named as one, with the
            // document and its capture date on the card. The scope is stated
            // once, in lib/templates/lookup-command.mjs, so it cannot become a
            // property of whichever branch a caller happened to reach.
            commandAnswer = command === 'referralForm'
              ? formCommandAnswer({ query: question })
              : templateCommandAnswer({ query: question });

            // A CONTRACT NOBODY NAMED IS STILL A CONTRACT SOMEBODY MEANT.
            //
            // The string match above is right and stays first, and for the
            // questions it answers this whole block never runs. But reception do
            // not ask in the document's words: "B12 injection" is not the name
            // of any of the 42 contracts and appears nowhere on the page, so the
            // match says no contract by that name — while the service it is
            // recorded under is sitting on the list, along with the template and
            // the page to open. That is a question about meaning, and the string
            // match cannot answer it by design.
            //
            // So a MISS — and only a miss — searches the web for how this is
            // commissioned in North East London, then asks a model to pick one
            // row off the document. The model picks; it never writes. Everything
            // on the card is copied out of the row it chose, the choice is
            // thrown away unless the name matches a row character for character
            // (lib/agent/contract-intent.mjs), and the card says outright that
            // the contract was worked out rather than named.
            //
            // A failure of either call leaves the honest "no contract by that
            // name" card exactly as it was.
            // Both of PCIT's documents came back with nothing — the contract
            // list has no such row and no template carries a page by that name.
            const missed = command === 'contractTemplate'
              && /no contract by that name/i.test(String(commandAnswer?.title || ''));
            if (missed && apiKey) {
              try {
                send({ type: 'status', text: 'Working out which contract this belongs under' });
                send({
                  type: 'tool-start',
                  id: 'intent',
                  tool: 'search_web',
                  label: 'Searching for what covers this in North East London',
                  detail: question.slice(0, 120),
                });
                const contracts = nelContracts().contracts;
                const web = await withTimeout(
                  searchForContract({ asked: question, apiKey, model: roles.web.model }),
                  INTENT_TIMEOUT_MS,
                ).catch(() => ({ ok: false, summary: '', results: [] }));
                if (web?.usage) {
                  recordUsage({ turnId, role: 'web', phase: 'contractIntent', model: roles.web.model, usage: web.usage });
                }
                const picked = await withTimeout(generateObject({
                  model: openrouter(model),
                  schema: CONTRACT_INTENT_SCHEMA,
                  temperature: 0,
                  prompt: contractIntentPrompt({
                    asked: question,
                    roster: templateRoster(contracts),
                    web: web && web.ok ? web.summary : '',
                  }),
                }), INTENT_TIMEOUT_MS);
                recordUsage({ turnId, role: 'fast', phase: 'contractIntent', model, usage: picked.usage });
                // THE ANSWER IS A TEMPLATE, NOT A CONTRACT. The reader has a
                // job in front of them and wants to know what to open; a
                // template is a page set holding dozens of entries, so their
                // job is INSIDE one of the 37 templates rather than named on
                // the list of 42 contracts. The model chooses the template; the
                // contracts it records come off the document and are what let a
                // reader check the choice.
                //
                // A MODEL THAT WILL NOT CHOOSE IS NOT A DOCUMENT WITH NOTHING
                // ON IT. When the pick is empty or is a name nobody published,
                // the names the SEARCH used are run back through the document's
                // own matcher — "Wound care service" off the ICB's page reaches
                // "Simple Wound Care Service" — and that row's own templates
                // are the answer, with no model in the path at all.
                const resolved = resolvePick({ pick: picked.object, contracts })
                  || (() => {
                    const bridged = contractFromWeb({
                      web,
                      lookup: (candidate) => findContracts(candidate),
                    });
                    if (!bridged) return null;
                    const named = templatesOf(bridged.contract);
                    if (!named.length) return null;
                    return {
                      template: named[0],
                      records: contractsForTemplate(named[0], contracts),
                      contract: bridged.contract,
                      confident: false,
                      // Composed in code out of verbatim strings — what the web
                      // called the service, and what the document calls it.
                      why: `The web names this service "${bridged.named}", which the document records `
                        + `under "${bridged.contract.specification}".`,
                    };
                  })();
                const reasoned = resolved && contractReasonedAnswer({
                  ...resolved,
                  sources: sourceLines(web && web.results),
                });
                send({
                  type: 'tool-result',
                  id: 'intent',
                  tool: 'search_web',
                  summary: reasoned ? resolved.template : 'No template on the document records this',
                  items: (web && web.results ? web.results : []).slice(0, 4)
                    .map((r) => ({ title: r.title, url: r.url })),
                });
                // Still nothing? The miss card stands, and carries whatever
                // Primary Care IT themselves publish about it: the contract list
                // is 42 rows, and their knowledge base is far wider than that.
                if (reasoned) commandAnswer = reasoned;
                else {
                  const pcit = pcitPages(web && web.results);
                  if (pcit.length) commandAnswer = contractNotFound(question, { pcit });
                }
              } catch (e) {
                // The miss card is already built and is a true answer. A failed
                // search or a failed pick leaves it standing.
                console.warn('[agent] contract intent lookup failed:', String(e).slice(0, 160));
              }
            }
          } else {
            // A long /accurx is decomposed on the same call, exactly as an
            // ordinary message is. A short one is not, so "/accurx pt has a sore
            // throat since Friday" costs what it always cost.
            const decompose = looksMultiIntent(question);

            // ONE CALL ON /accurx, FOR THE WHOLE CARD.
            //
            // It was ten: one per destination asking whether the message was
            // theirs, plus one writing the reason line. The destinations had to
            // be asked one at a time because nothing described them in a form a
            // single prompt could be handed — each check was told about its own
            // service by name and nothing else.
            //
            // lib/triage/destinations.mjs describes them now, so the whole
            // ladder goes into one prompt as data and one reader sees what nine
            // saw between them. Same schema, same veto: what it names is checked
            // against the patterns in accurxAnswer and can only raise.
            //
            // It runs on the `accurx` role rather than `fast` (lib/settings.js),
            // because it is now the call that decides where somebody goes as
            // well as the one that writes the line — the practice can put a
            // better model on it without paying for one everywhere else.
            // A screenshot beats the rest: a command sent with a picture on it
            // — a /medication screen, a /coding letter photographed — is read
            // by the images role, because the others may not see it at all.
            const callModel = seeing ? imageModel : reading ? roles.accurx.model : model;
            const callRole = seeing ? 'images' : reading ? 'accurx' : 'fast';

            // THE NOTEBOOK DOES NOT GO INTO THE /accurx READ.
            //
            // It did, as "the practice's own pages", and it was the wrong
            // source for this question twice over. The routing guide
            // (docs/routing.md, as data in lib/triage/destinations.mjs) is what
            // says where a task goes; the Notebook is how the practice does
            // things, and a reader given both weighed a page about running a
            // clinic against the guide's own account of what that clinic
            // refuses. It also cost a database round-trip and about three
            // thousand prompt tokens on the call the reader waits for.
            //
            // So the ladder is the only source now, and the prompt says so.
            if (reading) send({ type: 'status', text: 'Reading where it goes' });

            try {
              // The pictures go in beside the prompt (readValues). Until
              // this, a command never saw an attached image at all: the
              // prompt was text and the screenshot was dropped on the floor.
              const filled = {
                object: await readValues({
                  model: callModel,
                  schema: (decompose && MULTI_COMMAND_SCHEMAS[command]) || COMMAND_SCHEMAS[command],
                  text: commandPrompt({ template: command, question, attached, decompose, images: images.length }),
                  role: callRole,
                  phase: reading ? 'accurxRead' : 'command',
                }),
              };
              // THE CLINICAL SCANNERS DO NOT RUN ON /accurx ANY MORE.
              //
              // They banded a message by matching words, and no amount of having
              // read the message could retire a band the words had raised. The
              // one that ended it told reception to interrupt a doctor over
              // "chest pain", quoting as its own evidence the sentence saying the
              // chest pain was last winter, that A&E ran every test, that her
              // heart was fine and that it turned out to be reflux.
              //
              // On this path the reading is the only judgement now, its account
              // is on the card, and every request the message made is listed
              // there with what happens to it. The second pass goes with them —
              // there is no band left for it to raise.
              //
              // THE PRIVACY GUARDS ARE NOT PART OF THIS. Identifier redaction and
              // the patient-data screen run before anything is sent and are not
              // clinical judgement: they are about what leaves the building.
              scan = reading
                ? { items: [], complaint: '', routed: null, decomposed: false }
                : safetyScan({ message: question, requests: filled.object.requests });

              if (!reading && DECOMPOSING_COMMANDS.includes(command) && scan.decomposed) {
                scan = await deepenTriage({ openrouter, model, question, scan, turnId, send });
                stage2 = 'triage';
              }

              // Where it goes comes back on the same values now, so renderCommand
              // reads it off them (readingVerdict). What is kept here is whether
              // the reading happened at all, for the log line below.
              route = reading ? readingVerdict(filled.object) : null;
              commandAnswer = renderCommand(command, filled.object, question, {
                complaint: scan.complaint,
                gist: (scan.routed && scan.routed.gist) || '',
              });
            } catch (e) {
              // The call did not come back. The command still said what this is,
              // so the card is rendered from nothing rather than answered as
              // something else: the patterns' own triage of the message as
              // written, or the rules for titling a document. Nothing was read,
              // so nothing raises it — which is exactly what not asking means.
              console.warn('[agent] command values failed:', String(e).slice(0, 160));
              route = null;
              // A picture that was sent and not read is said on the card
              // rather than answered with "paste a screenshot".
              commandAnswer = renderCommand(command, {}, question, { images: images.length, failed: String(e && e.message ? e.message : e).slice(0, 120) });
            }
            if (route) stage2 = stage2 ? stage2 + '+accurxRoute' : 'accurxRoute';
          }

          send({
            type: 'tool-result',
            id: 'select',
            tool: searching ? 'search_documents' : 'pick_template',
            summary: searching ? (commandAnswer.source || []).join(' · ') || 'Nothing matched' : command,
            items: [],
          });

          // Nothing to band on /accurx: the reading is the judgement and its
          // account is on the card itself. Every other command still gets the
          // deterministic floor, which is what it was written for.
          const commandSafety = reading
            ? { alerts: [], panel: null }
            : safetyOutput(scan, { cardScans: DECOMPOSING_COMMANDS.includes(command) });

          send({
            type: 'answer',
            payload: payload({
              template: commandAnswer,
              alerts: commandSafety.alerts,
              panel: commandSafety.panel,
            }),
          });
          const writtenCommand = logTurn({
            outcome: 'template',
            template: command,
            source: (commandAnswer?.source || []).join(' · '),
            answer: shownText(commandSafety.alerts, commandAnswer),
            // A search runs no model, and the log should not name one.
            model: searching ? '' : seeing ? imageModel : model,
            provenance: buildProvenance({
              scan,
              card: commandAnswer,
              stage2,
              // Both halves: what the reading said, and where the card sent
              // them. A read that was overruled by the patterns is exactly the
              // thing worth being able to find later.
              // And, where the card booked an appointment with a doctor, which
              // kind of one. Read off the card's own destination rather than the
              // reading's, because a slot type decided for a destination the
              // card did not settle on is not what anybody booked.
              route: route
                ? {
                  read: route.destination,
                  card: (commandAnswer && commandAnswer.destination) || '',
                  mode: needsAppointmentMode((commandAnswer && commandAnswer.destination) || '')
                    ? (route.appointment || {}).mode || ''
                    : '',
                }
                : null,
            }),
          });
          controller.close();
          await writtenCommand;
          return;
        }

        // THE WHOLE NOTEBOOK, AND ONE ANSWER CITING IT.
        //
        // Every question that is not a command and not a contact number is
        // answered the same way: the writer is shown every page of the
        // Notebook, in full, and writes a short answer from them alone, citing
        // each page it used by its heading. There is no search, no shortlist,
        // no picker and no card on this path any more — the Referrals page
        // (`/`) is the card-shaped front door now, and what reached the Q&A
        // through a picker was a coin toss between a page shown verbatim and
        // a card built for a different question.
        //
        // THE NOTEBOOK IS CACHED, NOT RE-SENT. It is ~43k tokens and the same
        // on every turn until a page is edited, so it is the first, byte-stable
        // part of the system prompt and is marked cacheable
        // (proseSystemMessage, lib/templates/route.mjs): after the first turn
        // the provider reads it from its cache, and ai_usage records how much
        // it read (`cached_input_tokens`).
        //
        // THE CITATIONS ARE RESOLVED BY CODE. The model writes
        // `[[Notebook: Section / Page]]`; resolveReferences
        // (lib/questions/references.mjs) turns each one that names a real page
        // into a link to it, leaves any other as plain words, and ends the
        // answer with the list of pages it linked. The model never writes a
        // link, so it cannot write a wrong one.
        //
        // A Notebook that cannot be read is not a turn that cannot answer: the
        // writer is given the rules that admit it has no practice material.
        const notebookPages = await notebook();
        const notebookText = notebookPages.length ? notebookFullText(notebookPages) : '';
        referencesLog = { pages: notebookPages.length };
        // The working card: the Notebook, every page of it read. The shape
        // the card already draws for a whole-Notebook read —
        // lib/agent/notebook-progress.mjs.
        if (notebookPages.length) send(notebookProgress(notebookPages));

        // The bands. The whole message, scanned once above; no card on this
        // path runs the triage net over its own text, so every finding is
        // the band's to say.
        const safety = safetyOutput(scan, { cardScans: false });

        // THE ANSWER CHECK — see lib/questions/answer-check.mjs. One decision
        // call on the `check` role, in front of an answer that is already
        // written. Never throws: a check that fails, or does not answer within
        // three seconds, comes back as 'pass' and the answer goes out as it was.
        const checkAnswer = async ({ answer: shown, pages }) => {
          send({ type: 'status', text: 'Checking the answer' });
          const checkModel = roles.check.model;
          const result = await runAnswerCheck({
            decide,
            model: checkModel,
            question,
            previous: previousUserMessage(history),
            answer: shown,
            pages,
            signal: deadline,
            onUsage: (usage) => recordUsage({ turnId, role: 'check', phase: 'check', model: checkModel, usage: decisionUsage(usage) }),
          });
          console.info(result.error
            ? `[agent] ${turnId} check on ${checkModel} failed after ${result.ms}ms: ${result.error}`
            : `[agent] ${turnId} check on ${result.model} scored ${result.score} (${result.band}) in ${result.ms}ms`);
          checkLog = checkProvenance(result);
          return result;
        };

        // A WITHDRAWN ANSWER. The check said it does not answer the question,
        // so the reader is told the Notebook does not cover it — with the pages
        // the withdrawn answer cited, as links — and the question is filed on
        // /questions as one the notes cannot answer. Filed here rather than by
        // the question log (lib/questions/log.js files prose with no source
        // line, and "failed" turns), because only this path knows why; and
        // only when this desk records its questions at all, the same promise
        // the log keeps (lib/questions/opt-out.mjs). What was withdrawn is kept
        // in the provenance, so the thresholds can be judged against what they
        // took away.
        const withdraw = async ({ was, prefer = [], alerts = [], panel = null }) => {
          const closest = closestPages({ prefer });
          const filing = logging && isCollectableQuestion(question);
          const card = unknownAnswer({ closest, filed: filing });
          checkLog = {
            ...(checkLog || {}),
            closest: closest.map((p) => p.href || p.title),
            withdrawn: {
              template: was.template || '',
              source: String(was.source || '').slice(0, 400),
              answer: String(was.answer || '').slice(0, 2000),
            },
          };
          send({ type: 'answer', payload: payload({ template: card, alerts, panel }) });
          const writtenUnknown = logTurn({
            outcome: 'template',
            // Its own line on /stats: an answer the check withdrew.
            template: 'unknown:check',
            source: '',
            answer: shownText(alerts, card),
            provenance: buildProvenance({ scan, card }),
          });
          const filed = filing
            ? noteUnansweredQuestion({ question, reason: 'no-page', turnId, machineId })
            : Promise.resolve();
          controller.close();
          await Promise.all([writtenUnknown, filed]);
        };

        send({ type: 'status', text: 'Writing the answer' });

        const userContent = images.length
          ? [{ type: 'text', text: question }].concat(images.map((url) => ({ type: 'image', image: url })))
          : question;

        // A picture is read by the images role, with the whole Notebook beside
        // it exactly as a typed question has it.
        const proseModel = seeing ? imageModel : model;
        const proseBegan = Date.now();
        const generated = await generateText({
          model: openrouter(proseModel),
          abortSignal: deadline,
          // The whole Notebook first, then the rules — one byte-stable,
          // cacheable prefix. Nothing about this question is in it.
          system: proseSystemMessage(notebookText),
          // Capped for the same reason as readValues: an uncapped call reserves
          // the model's whole window and is refused when the balance is low.
          maxOutputTokens: PROSE_MAX_TOKENS,
          messages: [
            ...(history ? [{ role: 'user', content: `Conversation so far:\n${history}` }] : []),
            // The dropped document goes in before the question, as the context
            // the question is asked against.
            ...(attached ? [{ role: 'user', content: attached }] : []),
            { role: 'user', content: userContent },
          ],
          temperature: 0.2,
        });
        recordUsage({ turnId, role: seeing ? 'images' : 'fast', phase: 'answer', model: proseModel, usage: generated.usage });
        tookTime('answer', proseModel, proseBegan);
        {
          const { input, cached } = usageCounts(generated.usage);
          console.info(`[agent] ${turnId} answer read ${input} input tokens, ${cached == null ? 'cache not reported' : cached + ' from the cache'}`);
        }

        const markdown = String(generated.text || '').trim();
        if (!markdown) {
          send({ type: 'error', error: 'The assistant did not return an answer.' });
          const written = logTurn({ outcome: 'failed', error: 'The model returned an empty answer.' });
          controller.close();
          await written;
          return;
        }

        // THE NOTEBOOK COUNTS AS VERIFIED. The model is shown it and told to
        // use its exact wording, so the numbers it writes are largely the
        // practice's own — and the redactor, which strips any number it cannot
        // vouch for, would have cut every one of them out of the answer it just
        // asked for. A number written in the Notebook is a number the practice
        // wrote down; nothing else on this path is.
        const verified = verifiedNumbers([question, history, attached, notebookText]);
        const prose = redactUnverifiedNumbers(markdown, verified);

        // THE CITATIONS, MADE LINKS — or plain words, where a heading names no
        // page. Redacted first, so a link is never built out of a number the
        // redactor would have taken out.
        const refs = resolveReferences(prose, notebookPages);
        const cited = citedPages(refs.cited, notebookPages);
        if (refs.unknown.length) {
          console.warn(`[agent] ${turnId} cited ${refs.unknown.length} heading(s) that name no page: ${refs.unknown.map((u) => JSON.stringify(u.slice(0, 80))).join(', ')}`);
        }
        referencesLog = { ...referencesLog, cited: refs.cited.map((c) => c.docId), unknown: refs.unknown.slice(0, 10).map((u) => u.slice(0, 200)) };
        const citedSource = cited.map((page) => page.docTitle).join(' · ');

        send({
          type: 'tool-result',
          id: 'select',
          tool: 'read_notebook',
          summary: refs.cited.length ? refs.cited.map((c) => c.title).join(' · ') : 'No Notebook page cited',
          items: [],
        });

        // "I DON'T KNOW" NAMES ITS PAGE AS THE CLOSEST, NOT AS A SOURCE. The
        // writer cites the nearest page when the Notebook does not cover the
        // question; calling that page a source would say the answer stood on
        // it. It also keeps the question log honest: a prose answer with no
        // "Sources:" line is filed on /questions as one the notes cannot
        // answer (lib/questions/gaps.mjs).
        const unknownLine = saysDontKnow(refs.body);
        const closingLine = sourcesLine(refs.cited, unknownLine ? 'Closest page' : 'Sources');
        const withClosing = (text) => (closingLine ? `${text}\n\n${closingLine}` : text);
        let body = refs.body;

        // CHECKED AGAINST THE PAGES IT CITES. An answer that cites nothing is
        // checked against the question alone. An answer written with no
        // Notebook at all (it could not be loaded) did not come from it, and is
        // not checked against it.
        if (notebookPages.length && shouldCheck({ images: images.length, attachments: attachments.length })) {
          const checked = await checkAnswer({ answer: withClosing(refs.body), pages: cited });
          if (checked.band === 'unknown') {
            await withdraw({
              was: { template: 'prose', source: citedSource, answer: withClosing(refs.body) },
              // The writer is told to cite the closest page when the Notebook
              // does not cover the question; those pages lead the list.
              prefer: cited,
              alerts: safety.alerts,
              panel: safety.panel,
            });
            return;
          }
          if (checked.band === 'confirm') body = withConfirmLine(body, cited);
        }
        const shownProse = withClosing(body);

        send({
          type: 'answer',
          payload: payload({
            // The assistant's own work when it cited no page of the Notebook;
            // otherwise the pages are in the answer itself, as links, and the
            // reader is not told to go and check the practice's own writing.
            general: !refs.cited.length,
            // Not repeated here: the pages are the answer's own closing line,
            // as links. `references` carries them as data for anything that
            // wants to draw them differently.
            sources: [],
            references: refs.cited,
            alerts: safety.alerts,
            panel: safety.panel,
            sections: [{
              heading: '',
              markdown: shownProse,
              basis: 'general',
              critical: false,
              cite: null,
              web: null,
            }],
            validation: { attempts: 1, checked: 1, verified: 1, dropped: 0, problems: [] },
          }),
        });
        const written = logTurn({
          outcome: 'prose',
          // The pages it cited, in the "Notebook: A / B" form the log's other
          // readers count (the Referrals page's most-asked list, /stats).
          source: unknownLine ? '' : citedSource,
          answer: shownText(safety.alerts, null) + (safety.alerts.length ? '\n\n---\n\n' : '') + shownProse,
          provenance: buildProvenance({ scan }),
        });
        controller.close();
        await written;
      } catch (e) {
        const timedOut = deadline.aborted;
        console.error(`[agent] ${turnId} turn failed after ${seconds(startedAt)}:`, e);
        send({
          type: 'error',
          error: timedOut
            ? 'The model took too long to answer, so this was stopped. Try again, or choose a faster model at /settings.'
            : 'The assistant could not complete this answer.',
          detail: String(e).slice(0, 300),
        });
        const written = logTurn({ outcome: 'failed', error: (timedOut ? `timed out after ${seconds(startedAt)}: ` : '') + String(e).slice(0, 300) });
        controller.close();
        await written;
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
