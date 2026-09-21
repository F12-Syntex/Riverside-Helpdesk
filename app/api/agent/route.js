// The agent endpoint: one model call, answering out of the Notebook.
//
// WHAT WAS HERE BEFORE. A template router. The model read the message, chose
// one of about twenty templates and filled in its variables; the answer was
// that template rendered in code. On top of that sat a confidence-scored
// retrieval router, a second call to lift the values out of a tagged page, a
// third to read a referral's pairing, and seven slash commands that each named
// a template outright. Three model calls on a referral turn, a catalogue the
// model had to be taught, and — because a page's format was inherited from the
// folder it sat in and re-read by a model every time — no guarantee that the
// same page came back the same way twice.
//
// WHAT IS HERE NOW. The Notebook goes in whole, the message goes in, and the
// model writes the answer. That is the entire pipeline.
//
// THE CONSISTENCY MOVED INTO THE NOTEBOOK. It used to come from rendering a
// template in code, which is why all of the above existed. It now comes from
// the note: a typed note carries its speciality, its clinic type, its address
// in named fields, validated before the note may be served at all, and written
// into the prompt in one fixed shape by lib/notebook/kinds.mjs. The model is
// asked to lay those values out, not to find them — so there is nothing left
// for it to read differently on a second pass. See lib/notebook/kinds.mjs.
//
// WHAT DID NOT GO. The deterministic floor. Every message is still scanned by
// lib/safety before and independently of the model: the emergency band, the
// confidentiality band and the panel of everything the message asked for are
// not model output and never were, and a pipeline change is not a reason for
// a red flag to stop being a red flag. Names and addresses are still redacted
// at this endpoint as well as in the browser, and a number the answer cannot
// vouch for is still stripped before a receptionist can dial it.
//
// EVERY TURN IS STILL WRITTEN DOWN. As the answer goes out, the question, the
// answer as text and the model that ran are recorded in question_log
// (lib/questions/log.js) and read back at /stats.
import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { answerSystemPrompt, notebookFullText } from '@/lib/agent/notebook-answer.mjs';
import { acuityBandAnswer, confidentialityAnswer, unresolvedPanel } from '@/lib/templates/safety.mjs';
import { bandFindings, safetyScan } from '@/lib/safety/scan.mjs';
import { redactIdentifiers } from '@/lib/safety/identifiers.mjs';
import { buildProvenance } from '@/lib/questions/provenance.mjs';
import { groundedIn } from '@/lib/questions/grounding.mjs';
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

// The answer's output cap. Left unset, OpenRouter reserves the model's whole
// output window — 65,536 tokens on some — before the call is made, and refuses
// the request outright when the account cannot cover that reservation. An
// answer a receptionist reads at the desk is far shorter than this.
const ANSWER_MAX_TOKENS = 1500;

const NDJSON_HEADERS = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
};

// Numbers the answer is allowed to keep: the practice directory, the Notebook,
// plus anything already present in the reader's own message, history or
// attached document (an email being reformatted carries the numbers it arrived
// with). Every other number is the model's invention and is stripped before a
// receptionist can dial it.
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
 * Two things go out alongside the answer, and neither costs a token:
 *
 *   ALERTS, above it. What the scanners in lib/safety found anywhere in
 *   the message — including in the paragraphs the answer does not get to.
 *
 *   THE PANEL, beside it. Every request the message contained, marked
 *   routed, flagged, refused or unhandled. It is the backstop for every
 *   rule that misses: a pattern cannot match a paraphrase, and the panel
 *   still shows the sentence was written.
 * ------------------------------------------------------------------ */
function safetyOutput(scan) {
  const band = bandFindings(scan, { cardScans: false });
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

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY.' }, { status: 500 });
  }

  // The FAST model writes the answer. An unset fast role resolves to the
  // reasoning model, so an install that has only ever chosen one model works.
  const roles = await getModelRoles();
  const model = roles.fast.model;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const asked = typeof body?.question === 'string' && body.question.trim() ? body.question : 'Please look at the attached image.';
  // The same local name-and-address check the browser ran before sending
  // (lib/safety/identifiers.mjs), run again here. In the ordinary case this
  // changes nothing — the text arrived already redacted — and that is the
  // point: the guard is a property of the endpoint, not of the page, so a
  // message posted to /api/agent by anything else is held to it too. It runs
  // before the model sees the question and before question_log stores it.
  const question = redactIdentifiers(asked, { allow: getDirectory() }).text;
  const history = typeof body?.history === 'string' ? body.history : '';
  const images = Array.isArray(body?.images)
    ? body.images.filter((u) => typeof u === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(u)).slice(0, 4)
    : [];
  // A MESSAGE WITH A PICTURE ON IT RUNS ON THE IMAGES ROLE. The model chosen
  // for reading and writing may not see pictures at all, and the one chosen for
  // pictures is chosen for that alone (lib/settings.js).
  const seeing = images.length > 0;
  const answerModel = seeing ? roles.images.model : model;
  // A document dropped onto the question and already read into text by
  // /api/attach. The reader's own material: context for the model, never stored.
  const attachments = sanitiseAttachments(body?.attachments);
  const attached = attachmentsBlock(attachments);

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
      // only the traffic. Never allowed to fail a turn — recordQuestion
      // swallows its own errors — and on Vercel it is handed to waitUntil so
      // the row is still written after the response has been closed.
      const logTurn = (turn) => {
        if (!logging) return Promise.resolve();
        const writing = recordQuestion({
          turnId,
          machineId,
          question,
          model: answerModel,
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

      // What the reader saw, as text, for the log: the bands above the answer
      // and the answer itself. A band is part of the answer, not decoration
      // around it, and a log that omitted it would not show what was on screen.
      const shownText = (alerts, prose) => [...(alerts || []).map((part) => answerToText(part)), prose]
        .filter(Boolean)
        .join('\n\n---\n\n');

      try {
        send({ type: 'status', text: 'Reading the practice notebook' });
        send({
          type: 'tool-start',
          id: 'answer',
          tool: 'read_notebook',
          label: 'Reading the practice notebook',
          detail: question.slice(0, 120),
        });

        // THE WHOLE MESSAGE, SCANNED, before a model is asked anything. The
        // bands and the panel are the same whatever the answer turns out to be,
        // and a turn that fails after this point still carries its findings.
        const scan = safetyScan({ message: question });
        const safety = safetyOutput(scan);

        // THE NOTEBOOK, READ LIVE. Not the mirrored search index: an autosave
        // is visible on the next question, and no page is left out by
        // retrieval. A Notebook that cannot be read leaves the turn answering
        // under the no-access rules rather than failing — and the answer says
        // so, rather than quietly sounding like every other one.
        let pages = [];
        try {
          pages = await fullNotebookContext();
        } catch (e) {
          console.warn('[agent] notebook unavailable:', String(e).slice(0, 160));
        }
        const notebookText = pages.length ? notebookFullText(pages) : '';

        send({
          type: 'tool-result',
          id: 'answer',
          tool: 'read_notebook',
          summary: pages.length ? pages.length + ' pages' : 'The notebook could not be read',
          items: [],
        });
        send({ type: 'status', text: 'Writing the answer' });

        const userContent = images.length
          ? [{ type: 'text', text: question }].concat(images.map((url) => ({ type: 'image', image: url })))
          : question;

        const generated = await generateText({
          model: openrouter(answerModel),
          system: answerSystemPrompt(notebookText),
          maxOutputTokens: ANSWER_MAX_TOKENS,
          messages: [
            ...(history ? [{ role: 'user', content: `Conversation so far:\n${history}` }] : []),
            // The dropped document goes in before the question, as the context
            // the question is asked against.
            ...(attached ? [{ role: 'user', content: attached }] : []),
            { role: 'user', content: userContent },
          ],
          temperature: 0.2,
        });
        recordUsage({ turnId, role: seeing ? 'images' : 'fast', phase: 'answer', model: answerModel, usage: generated.usage });

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

        // AND WHETHER IT IS THE PRACTICE'S OWN WORDS, MEASURED. The answer is
        // compared against the pages it was written from, run of words by run
        // of words: where it is demonstrably made of a page, the page is named
        // and the "this is the assistant's own work" banner goes. Where it is
        // not, the banner is exactly what it always was. See
        // lib/questions/grounding.mjs.
        const madeOf = groundedIn(prose, pages);

        send({
          type: 'answer',
          payload: {
            kind: 'answer',
            answerable: true,
            // The turn this answer is, so a verdict left on it — or an item
            // closed on its panel — joins back to the answer it was actually
            // about rather than to the next turn worded the same way.
            turnId,
            // WHAT THIS ANSWER IS MADE OF, rather than which branch produced
            // it. Where the words are demonstrably the Notebook's, the pages
            // are named and the reader is not told to go and check the
            // practice's own writing.
            general: !madeOf.length,
            sources: madeOf.map((m) => m.docTitle),
            template: null,
            // The deterministic floor. Never model output, which is why it
            // applies to every turn identically.
            alerts: safety.alerts,
            panel: safety.panel,
            intro: '',
            keyPoints: [],
            sections: [{
              heading: '',
              markdown: prose,
              basis: 'general',
              critical: false,
              cite: null,
              web: null,
            }],
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
            validation: { attempts: 1, checked: 1, verified: 1, dropped: 0, problems: [] },
          },
        });
        const written = logTurn({
          outcome: 'prose',
          answer: shownText(safety.alerts, prose),
          provenance: buildProvenance({ scan, pages: pages.filter((page) => madeOf.some((m) => m.docTitle === page.docTitle)) }),
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
