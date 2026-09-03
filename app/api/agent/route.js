// The agent endpoint: pick a template, fill it, render it.
//
// Every message takes the same path. The model reads it, chooses the template
// that fits and fills that template's variables — it does not write the answer.
// The answer is the template, rendered in code from the values it returned.
//
// That split is the whole point. Understanding a message is what a model is
// good at, so it does that; the shape of what comes out is what a model is
// unreliable at, so code does that. "How do I refer for an ECG" and "ecg
// referral, how to do this?" reach the same card, because the wording was never
// what decided it.
//
// Determinism where it earns its keep:
//   - the referral service is an enum of what the practice records, so a
//     pathway can be chosen or declined but never invented;
//   - a filing title is assembled from its parts by codingTitle, so its format
//     cannot drift however the model words things;
//   - every card is laid out from the same blocks (lib/templates).
//
// When no template fits, the turn falls through to plain prose on the fast
// model. That answer IS written by the model, has nothing behind it, and says
// so on the card.
//
// THE NOTEBOOK IS A TEMPLATE TOO. It arrives as a list of page titles, and the
// model returns a title — the page is then rendered from the database exactly
// as the practice wrote it. So even the open-ended questions come back as a
// variable filled in, not as prose the model composed: same answer every time,
// about ten output tokens, and no way for a procedure to be paraphrased on its
// way to somebody following it.
//
// WHAT IS DELIBERATELY UNWIRED, NOT DELETED
//   • The answer cache (lib/answer-cache/). With the answer now assembled in
//     code from a page and a template, there is very little left to cache.
//
// EVERY TURN IS WRITTEN DOWN. As the answer goes out, the question, the answer
// as text, the template that built it and the model that ran are recorded in
// question_log (lib/questions/log.js) and read back at /stats. That is how the
// output is monitored: an answer is only reconstructable while the Notebook page
// behind it is unchanged, so it is stored at the moment it is given.
import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { generateObject, generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  CLINICAL_TEMPLATES, COMMAND_SCHEMAS, DECOMPOSING_COMMANDS, MULTI_COMMAND_SCHEMAS, MULTI_SELECTION_SCHEMA, SELECTION_SCHEMA,
  commandPrompt, notebookCatalogue, renderCommand, renderSelection, selectionClarify, selectionPrompt,
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
import { searchKnowledge } from '@/lib/knowledge';
import { knowledgeHitToDocumentChunk } from '@/lib/knowledge-context.mjs';
import { fullNotebookContext } from '@/lib/notebook';
import { attachmentsBlock, sanitiseAttachments } from '@/lib/attachments/extract.mjs';
import { contactTelSet, digitsOf, redactUnverifiedNumbers } from '@/lib/contacts';
import { getDirectory } from '@/lib/lookup/directory';
import { AI_SDK_EXTRA_BODY } from '@/lib/ai/openrouter.mjs';
import { getModelRoles } from '@/lib/settings';
import { recordUsage } from '@/lib/ai/usage';
import { recordQuestion } from '@/lib/questions/log';
import { loggingOffIn } from '@/lib/questions/opt-out.mjs';
import { answerToText } from '@/lib/questions/flatten.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One model call. The five minutes the research loop needed are not needed here.
export const maxDuration = 120;

const SYSTEM = [
  'You are the reception assistant for The Riverside Practice, a UK GP surgery. You are answering a member of practice staff — reception, admin, nursing, clinical or management.',
  '',
  'YOU HAVE NO ACCESS TO THE PRACTICE’S OWN MATERIAL. Its Notebook, policies and guides are not in front of you. So:',
  '- Answer general questions from what you know, plainly and briefly.',
  '- Never invent anything specific to this practice: no telephone numbers, email addresses, staff names, opening times, room numbers, form names, local rules or local pathways. If the answer depends on one of those, say plainly that you cannot see the practice’s own material and name who to ask (the practice manager, the secretaries, the duty doctor).',
  '- Never give clinical judgement about a specific patient. That is a clinician’s decision; route it to the duty doctor.',
  '- If the message could be a medical emergency (chest pain, difficulty breathing, signs of a stroke, severe bleeding, collapse, anaphylaxis, sepsis, a seizure, suicidal thoughts): call 999 now, alert a duty clinician immediately, and stay with the patient.',
  '',
  'HOW TO WRITE',
  '- Plain British English, NHS style. Calm, sentence case, no emoji, no marketing words.',
  '- Short. A busy receptionist with a patient at the desk reads the first few lines and nothing else.',
  '- Markdown: "## " and "### " headings, "- " bullets, "1. " numbered lists for anything done in order, tables where the content is tabular, **bold** for the exact thing to click, type or say.',
  '- No preamble, no summary of what you are about to say, no closing pleasantries. Start with the answer.',
].join('\n');

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
  const question = checked ? redactIdentifiers(asked, { allow: getDirectory() }).text : asked;
  const history = typeof body?.history === 'string' ? body.history : '';
  const images = Array.isArray(body?.images)
    ? body.images.filter((u) => typeof u === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(u)).slice(0, 4)
    : [];
  // A MESSAGE WITH A PICTURE ON IT RUNS ON THE IMAGES ROLE, whichever path it
  // takes below — a command, the template picker, or prose. The model chosen
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
  // A document dropped onto the question and already read into text by
  // /api/attach. The reader's own material: context for the model, never stored.
  const attachments = sanitiseAttachments(body?.attachments);
  const attached = attachmentsBlock(attachments);
  // `command` is resolved above the redaction now, because it is what decides
  // whether the redaction runs at all.

  const openrouter = createOpenRouter({ apiKey, extraBody: AI_SDK_EXTRA_BODY });
  const turnId = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const startedAt = Date.now();
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
      const logTurn = (turn) => {
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

      // THE NOTEBOOK, FETCHED ONCE, WHEREVER IT IS FIRST NEEDED.
      //
      // It used to be one `let notebookPages = []` beside the model call, two
      // hundred lines below the two list commands that also read it — so /form
      // and /template threw `Cannot access 'notebookPages' before
      // initialization` on every single call, ended the turn, and the reader
      // got nothing. A `let` in the same function body is not undefined before
      // its line: it is a ReferenceError, and the branch above it was written
      // as though it were.
      //
      // So it is a function, declared before anything that could want it, and
      // the read happens at most once per turn no matter how many callers ask.
      // A Notebook that cannot be read leaves the templates working rather than
      // failing the turn — the same best-effort it always had.
      //
      // WHY A LIST COMMAND WANTS IT AT ALL, given /form and /template answer
      // from PCIT's two files: because the practice's own written procedure
      // outranks a published list about the same service. A dozen referrals go
      // by email with this practice's own form and address, and the tree will
      // happily answer those with somebody else's — "district nurse" is
      // Islington's service on the tree and RP ACN 2022 here. It is one
      // database read, no model and no tokens, and it is the step that stops
      // the command being the one path that talks somebody out of their own
      // practice's process.
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
        // ONE PIPELINE. The model reads the message, picks the template that
        // fits and fills that template's variables — it never writes the
        // answer. What comes back is rendered in code, so "how do I refer for
        // an ECG" and "ecg referral, how to do this?" produce the same card,
        // and the enum of recorded services means a pathway can be chosen or
        // declined but never invented.
        //
        // Only when no template fits does the turn fall through to prose.
        //
        // A COMMAND SKIPS THE CHOOSING. /accurx and /coding have already said
        // what the message is, so the model is asked for that one template's
        // values and nothing else: no Notebook catalogue to read, a schema with
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
            : command ? 'Filling in the card' : 'Working out what this is';
        send({ type: 'status', text: said });
        send({
          type: 'tool-start',
          id: 'select',
          tool: searching ? 'search_documents' : lookingUp ? 'look_up_list' : 'pick_template',
          label: searching || lookingUp ? said : (command ? 'Told which answer to give' : 'Choosing the answer'),
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
        const directoryCard = command ? null : directoryAnswerIn(getDirectory(), question);
        if (directoryCard) {
          send({
            type: 'tool-result',
            id: 'select',
            tool: 'pick_template',
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
              const hits = await searchKnowledge(question, 12, { kind: 'document', semantic: true });
              chunks = hits.map(knowledgeHitToDocumentChunk);
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
              const filled = await generateObject({
                model: openrouter(callModel),
                schema: (decompose && MULTI_COMMAND_SCHEMAS[command]) || COMMAND_SCHEMAS[command],
                temperature: 0,
                // The pictures go in beside the prompt. Until this, a command
                // never saw an attached image at all: the prompt was text and
                // the screenshot was dropped on the floor.
                ...withImages(commandPrompt({ template: command, question, attached, decompose, images: images.length })),
              });
              recordUsage({
                turnId,
                role: callRole,
                phase: reading ? 'accurxRead' : 'command',
                model: callModel,
                usage: filled.usage,
              });
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
              commandAnswer = renderCommand(command, {}, question);
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

        // THE NOTEBOOK GOES IN AS A LIST, NOT AS TEXT.
        //
        // The model's job is to name the page, not to read every page and write
        // the answer again. So it gets one line per page — title, and the first
        // real line so a modest title can still be recognised — and returns a
        // title. The page itself is rendered from the database, exactly as the
        // practice wrote it.
        //
        // That is roughly 3k tokens in and ten out, against 18k in and 600 out
        // for composing an answer; it is byte-identical on every asking; and it
        // cannot garble a procedure, because nothing rewrites one.
        //
        // Best-effort: a Notebook that cannot be read leaves the templates
        // working rather than failing the turn. The prompt says so, and the
        // model falls back to the shapes it can still fill. Read through the
        // memoised `notebook()` declared at the top of this stream, so a turn
        // that already loaded it for a list command does not load it twice.
        const notebookPages = await notebook();
        const notebookText = notebookPages.length ? notebookCatalogue(notebookPages) : '';

        let templateAnswer = null;
        let clarify = null;
        let picked = 'none';
        // ONE EXTRA FIELD, ON THE SAME CALL, AND ONLY WHEN IT IS WORTH IT.
        //
        // The schema returns exactly one template, so a message asking for five
        // things came back as one card and the other four were never mentioned
        // again. That is structural: no amount of model quality produces five
        // answers from a contract with one slot in it. So the model is also
        // asked where each separate ask starts and ends — extraction, which it
        // does reliably — and code decides everything after that.
        //
        // "How do I refer for an ECG" is one ask. It is asked with exactly the
        // schema and exactly the prompt it was asked with before any of this
        // existed, and costs exactly what it used to.
        const decompose = looksMultiIntent(question);
        try {
          // With a picture attached the picker runs on the images role and is
          // shown the picture, so a screenshot of a letter can be recognised
          // as a document to file rather than read as an empty message.
          const selectModel = seeing ? imageModel : model;
          const selection = await generateObject({
            model: openrouter(selectModel),
            schema: decompose ? MULTI_SELECTION_SCHEMA : SELECTION_SCHEMA,
            temperature: 0,
            ...withImages(selectionPrompt({ question, attached, notebook: notebookText, decompose })),
          });
          recordUsage({ turnId, role: seeing ? 'images' : 'fast', phase: 'select', model: selectModel, usage: selection.usage });
          picked = selection.object.template;
          scan = safetyScan({ message: question, requests: selection.object.requests });
          // A question back, when the message could mean two different things
          // and they have different answers. Null when the model asked without
          // giving anything to choose between, and the turn answers as usual.
          clarify = selectionClarify(selection.object);
          // The card is built from the ONE request it is about, not from the
          // whole message — which is what stops a sentence describing a hoarse
          // voice writing the wording on a knee card.
          templateAnswer = renderSelection(selection.object, question, notebookPages, {
            complaint: scan.complaint,
            gist: (scan.routed && scan.routed.gist) || '',
          });
        } catch (e) {
          // A router that cannot answer is not a turn that cannot answer — and
          // the scan already ran over the whole message, so a turn that ends in
          // prose still carries every finding.
          console.warn('[agent] template selection failed:', String(e).slice(0, 160));
        }

        const safety = safetyOutput(scan, {
          cardScans: !!templateAnswer && CLINICAL_TEMPLATES.includes(picked),
        });

        send({
          type: 'tool-result',
          id: 'select',
          tool: 'pick_template',
          summary: clarify ? 'Asking which was meant' : (templateAnswer ? picked : 'No template fits — answering directly'),
          items: [],
        });

        // ASKING BACK IS AN ANSWER. The message reads two ways and the two ways
        // go different places, so the turn ends in one question with the
        // readings as options; tapping one asks the original question again with
        // the ambiguity settled. Cheaper than a wrong answer and far cheaper
        // than a wrong referral.
        if (clarify) {
          // The bands go out with the question back, not after it. A red flag
          // does not wait for the reader to say which of two things they meant.
          send({
            type: 'answer',
            payload: payload({ clarify, alerts: safety.alerts, panel: safety.panel }),
          });
          const writtenAsk = logTurn({
            outcome: 'template',
            template: 'ask',
            answer: shownText(safety.alerts, null) + '\n\n'
              + [clarify.question, ...clarify.options.map((o) => '- ' + o)].join('\n'),
            provenance: buildProvenance({ scan }),
          });
          controller.close();
          await writtenAsk;
          return;
        }

        if (templateAnswer) {
          send({
            type: 'answer',
            payload: payload({
              template: templateAnswer,
              alerts: safety.alerts,
              panel: safety.panel,
            }),
          });
          const written = logTurn({
            outcome: 'template',
            template: picked,
            source: (templateAnswer.source || []).join(' · '),
            answer: shownText(safety.alerts, templateAnswer),
            provenance: buildProvenance({ scan, card: templateAnswer, pages: notebookPages }),
          });
          controller.close();
          await written;
          return;
        }

        send({ type: 'status', text: 'Writing the answer' });

        const userContent = images.length
          ? [{ type: 'text', text: question }].concat(images.map((url) => ({ type: 'image', image: url })))
          : question;

        const proseModel = seeing ? imageModel : model;
        const generated = await generateText({
          model: openrouter(proseModel),
          system: SYSTEM,
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

        const markdown = String(generated.text || '').trim();
        if (!markdown) {
          send({ type: 'error', error: 'The assistant did not return an answer.' });
          const written = logTurn({ outcome: 'failed', error: 'The model returned an empty answer.' });
          controller.close();
          await written;
          return;
        }

        const verified = verifiedNumbers([question, history, attached]);
        const redact = (t) => redactUnverifiedNumbers(t, verified);
        const prose = redact(markdown);

        send({
          type: 'answer',
          payload: payload({
            // Not one line of this came from a practice document, and the card
            // says so once at the top rather than leaving it to be assumed. The
            // bands above it are the exception and are not the model's work at
            // all — which is precisely why they still apply here.
            general: true,
            alerts: safety.alerts,
            panel: safety.panel,
            sections: [{
              heading: '',
              markdown: prose,
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
          answer: shownText(safety.alerts, null) + (safety.alerts.length ? '\n\n---\n\n' : '') + prose,
          provenance: buildProvenance({ scan }),
        });
        controller.close();
        await written;
      } catch (e) {
        console.error('[agent] turn failed:', e);
        send({ type: 'error', error: 'The assistant could not complete this answer.', detail: String(e).slice(0, 300) });
        const written = logTurn({ outcome: 'failed', error: String(e).slice(0, 300) });
        controller.close();
        await written;
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
