// The agent endpoint: the model chooses out of the Notebook, code shows it.
//
// WHAT WAS HERE BEFORE. First a template router — about twenty templates, three
// model calls on a referral turn. Then one call in which the Notebook went in
// whole and the model wrote the answer as prose, measured afterwards for how
// much of it was the practice's own wording. Measured, not enforced: a
// sentence it made up was shown just the same, under a banner.
//
// WHAT IS HERE NOW. The Notebook still goes in whole, and there is still one
// call, but the model no longer writes the answer. It returns a CHOICE — page
// ids, and for each either "this page's card" or a passage quoted from it —
// and lib/agent/verify-answer.mjs checks every part of that choice against the
// pages it was shown:
//   - an id that was not in front of it is dropped;
//   - a card is drawn from the note's stored, validated fields in code;
//   - a quote must be on the page word for word, and what is shown is the
//     page's own sentences around it, not the model's copy;
//   - its one written line, the lead, may carry no number, no address and no
//     word that is in neither the question nor the pages it picked.
// If nothing survives, the answer is that the Notebook does not cover it, with
// the closest pages to open. There is no general-knowledge answer on this path.
//
// WHAT DID NOT GO. The deterministic floor. Every message is still scanned by
// lib/safety before and independently of the model: the emergency band, the
// confidentiality band and the panel of everything the message asked for are
// not model output and never were. Names and addresses are still redacted at
// this endpoint as well as in the browser.
//
// EVERY TURN IS STILL WRITTEN DOWN, in question_log (lib/questions/log.js) and
// read back at /stats — now with what the checks threw away, which is the
// running count of how often the model pointed at something that was not there.
import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { selectFromNotebook } from '@/lib/agent/notebook-answer.mjs';
import { presentVerified, verifySelection } from '@/lib/agent/verify-answer.mjs';
import { acuityBandAnswer, confidentialityAnswer, unresolvedPanel } from '@/lib/templates/safety.mjs';
import { bandFindings, safetyScan } from '@/lib/safety/scan.mjs';
import { redactIdentifiers } from '@/lib/safety/identifiers.mjs';
import { buildProvenance } from '@/lib/questions/provenance.mjs';
import { fullNotebookContext } from '@/lib/notebook';
import { attachmentsBlock, sanitiseAttachments } from '@/lib/attachments/extract.mjs';
import { getDirectory } from '@/lib/lookup/directory';
import { AI_SDK_EXTRA_BODY } from '@/lib/ai/openrouter.mjs';
import { getModelRoles } from '@/lib/settings';
import { recordQuestion } from '@/lib/questions/log';
import { loggingOffIn } from '@/lib/questions/opt-out.mjs';
import { answerToText } from '@/lib/questions/flatten.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One model call. The five minutes the research loop needed are not needed here.
export const maxDuration = 120;

const NDJSON_HEADERS = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
};

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

// For the question log's template column: which of the three things this turn
// was, with ":not-recorded" on a decline so /stats counts it as a gap.
const LOG_TEMPLATE = { answer: 'notebook', ambiguous: 'notebook:ambiguous', not_covered: 'notebook:not-recorded' };

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY.' }, { status: 500 });
  }

  // The FAST model chooses. An unset fast role resolves to the reasoning
  // model, so an install that has only ever chosen one model works.
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
  // /api/attach. The reader's own material: context for the choice, never stored.
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
      const shownText = (alerts, parts) => [...(alerts || []).map((part) => answerToText(part)), ...parts]
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
        // retrieval.
        let pages = [];
        try {
          pages = await fullNotebookContext();
        } catch (e) {
          console.warn('[agent] notebook unavailable:', String(e).slice(0, 160));
        }

        send({
          type: 'tool-result',
          id: 'answer',
          tool: 'read_notebook',
          summary: pages.length ? pages.length + ' pages' : 'The notebook could not be read',
          items: [],
        });

        // NO NOTEBOOK, NOTHING TO CHOOSE FROM. Said as it is, with the bands
        // still above it, and no model asked to fill the gap.
        if (!pages.length) {
          send({
            type: 'answer',
            payload: {
              kind: 'answer', answerable: false, turnId,
              intro: 'The notebook could not be read just now, so there is nothing to answer from. Please try again in a moment.',
              alerts: safety.alerts, panel: safety.panel,
              sections: [], template: null, nearest: [], contacts: [], citations: [],
            },
          });
          const written = logTurn({ outcome: 'failed', error: 'The notebook could not be read.', answer: shownText(safety.alerts, []) });
          controller.close();
          await written;
          return;
        }

        send({ type: 'status', text: 'Finding the page that answers it' });

        const selection = await selectFromNotebook({
          openrouter,
          model: answerModel,
          pages,
          question,
          history,
          attached,
          images,
          role: seeing ? 'images' : 'fast',
          turnId,
        });

        // THE CHECKS. Everything below this line is the page's own text, a
        // card drawn from its stored fields, a page title or fixed wording.
        const verified = verifySelection(selection, pages, question);
        const shown = presentVerified(verified);
        const answered = verified.verdict === 'answer';

        send({
          type: 'answer',
          payload: {
            kind: 'answer',
            answerable: answered || verified.verdict === 'ambiguous',
            // The turn this answer is, so a verdict left on it — or an item
            // closed on its panel — joins back to the answer it was actually
            // about rather than to the next turn worded the same way.
            turnId,
            // Never general: nothing on this path is the model's own knowledge.
            general: false,
            // The pages are named on each quote's citation and on the card, so
            // the footer list is left empty rather than said twice.
            sources: [],
            template: shown.template,
            // The deterministic floor. Never model output, which is why it
            // applies to every turn identically.
            alerts: safety.alerts,
            panel: safety.panel,
            intro: shown.intro,
            keyPoints: [],
            sections: shown.sections,
            nearest: shown.nearest,
            message: '',
            messageCite: null,
            messageWeb: null,
            tip: '',
            gaps: '',
            followUps: [],
            clarify: shown.clarify,
            referralRoute: null,
            citations: [],
            contacts: [],
            // Real counts: what the model chose, and what the checks threw away.
            validation: {
              attempts: 1,
              checked: verified.checked,
              verified: verified.cards.length + verified.quotes.length,
              dropped: answered ? verified.dropped.length : 0,
              problems: verified.dropped.map((d) => d.reason),
            },
          },
        });

        const usedPages = pages.filter((page) => shown.sources.includes(page.docTitle));
        const written = logTurn({
          outcome: 'template',
          template: LOG_TEMPLATE[verified.verdict] || 'notebook',
          source: shown.sources.join(' · '),
          answer: shownText(safety.alerts, [
            shown.intro,
            shown.template ? answerToText(shown.template) : '',
            ...shown.sections.map((sec) => sec.markdown + (sec.cite ? `\n— ${sec.cite.docTitle}` : '')),
            shown.clarify ? shown.clarify.question + ' ' + shown.clarify.options.join(' / ') : '',
            shown.nearest.length ? 'Closest pages: ' + shown.nearest.map((c) => c.docTitle).join(' · ') : '',
            verified.dropped.length ? `[${verified.dropped.length} pick(s) failed the checks: ${verified.dropped.map((d) => d.reason).join(', ')}]` : '',
            verified.leadReason ? `[lead replaced: ${verified.leadReason}]` : '',
          ]),
          provenance: buildProvenance({ scan, pages: usedPages }),
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
