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
import { COMMAND_SCHEMAS, SELECTION_SCHEMA, commandPrompt, notebookCatalogue, renderCommand, renderSelection, selectionPrompt } from '@/lib/templates/route.mjs';
import { commandByTemplate, forcedTemplate } from '@/lib/commands.mjs';
import { practiceSearchAnswer } from '@/lib/templates/practice.mjs';
import { searchKnowledge } from '@/lib/knowledge';
import { knowledgeHitToDocumentChunk } from '@/lib/knowledge-context.mjs';
import { fullNotebookContext } from '@/lib/notebook';
import { attachmentsBlock, sanitiseAttachments } from '@/lib/attachments/extract.mjs';
import { contactTelSet, digitsOf, redactUnverifiedNumbers } from '@/lib/contacts';
import { AI_SDK_EXTRA_BODY } from '@/lib/ai/openrouter.mjs';
import { getModelRoles } from '@/lib/settings';
import { recordUsage } from '@/lib/ai/usage';
import { recordQuestion } from '@/lib/questions/log';
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
  const question = typeof body?.question === 'string' && body.question.trim() ? body.question : 'Please look at the attached image.';
  const history = typeof body?.history === 'string' ? body.history : '';
  const images = Array.isArray(body?.images)
    ? body.images.filter((u) => typeof u === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(u)).slice(0, 4)
    : [];
  // A document dropped onto the question and already read into text by
  // /api/attach. The reader's own material: context for the model, never stored.
  const attachments = sanitiseAttachments(body?.attachments);
  const attached = attachmentsBlock(attachments);
  // A slash command names the template outright, so nothing is chosen here. Only
  // a template a command claims is honoured (lib/commands.mjs); anything else
  // sent in this field is ignored and the message is answered the ordinary way.
  const command = forcedTemplate(body?.template);

  const openrouter = createOpenRouter({ apiKey, extraBody: AI_SDK_EXTRA_BODY });
  const turnId = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const startedAt = Date.now();
  const machineId = machineFromCookie(request);

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
        const writing = recordQuestion({
          turnId,
          machineId,
          // Logged as it was typed. A message sent with /triage was a different
          // act from the same words typed plain, and the log should say so.
          question: command ? '/' + (commandByTemplate(command)?.name || '') + ' ' + question : question,
          model,
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
        // A COMMAND SKIPS THE CHOOSING. /triage and /document have already said
        // what the message is, so the model is asked for that one template's
        // values and nothing else: no Notebook catalogue to read, a schema with
        // one field in it, and no way for the turn to end up somewhere else.
        const searching = command === 'practiceSearch';
        send({
          type: 'status',
          text: searching ? 'Searching the practice documents' : (command ? 'Filling in the card' : 'Working out what this is'),
        });
        send({
          type: 'tool-start',
          id: 'select',
          tool: searching ? 'search_documents' : 'pick_template',
          label: searching ? 'Searching the practice documents' : (command ? 'Told which answer to give' : 'Choosing the answer'),
          detail: question.slice(0, 120),
        });

        if (command) {
          let commandAnswer = null;

          if (command === 'practiceSearch') {
            // NO MODEL AT ALL. The practice's documents are searched and the
            // passages are shown as they are written — see
            // lib/templates/practice.mjs for why a policy is quoted rather than
            // summarised. Costs nothing and comes back at once.
            let passages = [];
            try {
              const hits = await searchKnowledge(question, 12, { kind: 'document', semantic: true });
              passages = hits.map(knowledgeHitToDocumentChunk).map((chunk) => ({
                docTitle: chunk.docTitle,
                docId: chunk.docId,
                section: chunk.section,
                text: chunk.text,
                url: chunk.view && chunk.view.url ? chunk.view.url : '',
              }));
            } catch (e) {
              // A search that cannot run says so, rather than answering the
              // question some other way — /practice means these documents.
              console.warn('[agent] practice search failed:', String(e).slice(0, 160));
            }
            commandAnswer = practiceSearchAnswer({ query: question, passages });
          } else {
            try {
              const filled = await generateObject({
                model: openrouter(model),
                schema: COMMAND_SCHEMAS[command],
                temperature: 0,
                prompt: commandPrompt({ template: command, question, attached }),
              });
              recordUsage({ turnId, role: 'fast', phase: 'command', model, usage: filled.usage });
              commandAnswer = renderCommand(command, filled.object, question);
            } catch (e) {
              // The values could not be filled in, but the command still said
              // what this is. The card is rendered from nothing rather than
              // answered as something else: a triage of the message as written,
              // or the rules for titling a document.
              console.warn('[agent] command values failed:', String(e).slice(0, 160));
              commandAnswer = renderCommand(command, {}, question);
            }
          }

          send({
            type: 'tool-result',
            id: 'select',
            tool: searching ? 'search_documents' : 'pick_template',
            summary: searching ? (commandAnswer.source || []).join(' · ') || 'Nothing matched' : command,
            items: [],
          });

          send({
            type: 'answer',
            payload: {
              kind: 'answer',
              answerable: true,
              turnId,
              general: false,
              template: commandAnswer,
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
            },
          });
          const writtenCommand = logTurn({
            outcome: 'template',
            template: command,
            source: (commandAnswer?.source || []).join(' · '),
            answer: answerToText(commandAnswer),
            // A search runs no model, and the log should not name one.
            model: searching ? '' : model,
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
        // model falls back to the shapes it can still fill.
        let notebookPages = [];
        try {
          notebookPages = await fullNotebookContext();
        } catch (e) {
          console.warn('[agent] notebook unavailable:', String(e).slice(0, 160));
        }
        const notebookText = notebookPages.length ? notebookCatalogue(notebookPages) : '';

        let templateAnswer = null;
        let picked = 'none';
        try {
          const selection = await generateObject({
            model: openrouter(model),
            schema: SELECTION_SCHEMA,
            temperature: 0,
            prompt: selectionPrompt({ question, attached, notebook: notebookText }),
          });
          recordUsage({ turnId, role: 'fast', phase: 'select', model, usage: selection.usage });
          picked = selection.object.template;
          templateAnswer = renderSelection(selection.object, question, notebookPages);
        } catch (e) {
          // A router that cannot answer is not a turn that cannot answer.
          console.warn('[agent] template selection failed:', String(e).slice(0, 160));
        }

        send({
          type: 'tool-result',
          id: 'select',
          tool: 'pick_template',
          summary: templateAnswer ? picked : 'No template fits — answering directly',
          items: [],
        });

        if (templateAnswer) {
          send({
            type: 'answer',
            payload: {
              kind: 'answer',
              answerable: true,
              // The turn this answer is, so a verdict left on it can be joined
              // back to the answer it was actually about rather than to the
              // next turn that happened to be worded the same way.
              turnId,
              // Built from what the practice recorded, so NOT flagged as the
              // assistant's own work the way the prose fallback is.
              general: false,
              template: templateAnswer,
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
            },
          });
          const written = logTurn({
            outcome: 'template',
            template: picked,
            source: (templateAnswer.source || []).join(' · '),
            answer: answerToText(templateAnswer),
          });
          controller.close();
          await written;
          return;
        }

        send({ type: 'status', text: 'Writing the answer' });

        const userContent = images.length
          ? [{ type: 'text', text: question }].concat(images.map((url) => ({ type: 'image', image: url })))
          : question;

        const generated = await generateText({
          model: openrouter(model),
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
        recordUsage({ turnId, role: 'fast', phase: 'answer', model, usage: generated.usage });

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
          payload: {
            kind: 'answer',
            answerable: true,
            turnId,
            // Not one line of this came from a practice document, and the card
            // says so once at the top rather than leaving it to be assumed.
            general: true,
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
        const written = logTurn({ outcome: 'prose', answer: prose });
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
