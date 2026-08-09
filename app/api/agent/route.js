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
// WHAT IS DELIBERATELY UNWIRED, NOT DELETED
//   • The Notebook (lib/notebook.js). It is where the practice's real data
//     lives and it is untouched — this route does not read it yet. The template
//     data was transcribed from it by hand.
//   • The answer cache (lib/answer-cache/). Keyed on the Notebook fingerprint,
//     which means nothing while the Notebook is not an input.
import { NextResponse } from 'next/server';
import { generateObject, generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { SELECTION_SCHEMA, renderSelection, selectionPrompt } from '@/lib/templates/route.mjs';
import { fullNotebookContext } from '@/lib/notebook';
import { attachmentsBlock, sanitiseAttachments } from '@/lib/attachments/extract.mjs';
import { contactTelSet, digitsOf, redactUnverifiedNumbers } from '@/lib/contacts';
import { AI_SDK_EXTRA_BODY } from '@/lib/ai/openrouter.mjs';
import { getModelRoles } from '@/lib/settings';
import { recordUsage } from '@/lib/ai/usage';

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

  const openrouter = createOpenRouter({ apiKey, extraBody: AI_SDK_EXTRA_BODY });
  const turnId = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); } catch (e) { /* the reader went away */ }
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
        send({ type: 'status', text: 'Working out what this is' });
        send({ type: 'tool-start', id: 'select', tool: 'pick_template', label: 'Choosing the answer', detail: question.slice(0, 120) });

        // THE WHOLE NOTEBOOK GOES IN THE PROMPT.
        //
        // 96 pages is about 15,000 tokens, which fits comfortably and is the
        // same text on every question. Selecting pages first would save most of
        // those tokens and cost either a second round trip or a keyword match
        // that misses paraphrase — and a missed page is a wrong answer, while a
        // page the model did not need is merely paid for. At this size the
        // trade is not close.
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
        const notebookText = notebookPages
          .map((page) => `### ${page.docTitle}\n${String(page.text || '').trim()}`)
          .join('\n\n');
        const knownPages = notebookPages.map((page) => page.docTitle);

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
          templateAnswer = renderSelection(selection.object, question, knownPages);
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
          controller.close();
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
          controller.close();
          return;
        }

        const verified = verifiedNumbers([question, history, attached]);
        const redact = (t) => redactUnverifiedNumbers(t, verified);

        send({
          type: 'answer',
          payload: {
            kind: 'answer',
            answerable: true,
            // Not one line of this came from a practice document, and the card
            // says so once at the top rather than leaving it to be assumed.
            general: true,
            intro: '',
            keyPoints: [],
            sections: [{
              heading: '',
              markdown: redact(markdown),
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
        controller.close();
      } catch (e) {
        console.error('[agent] turn failed:', e);
        send({ type: 'error', error: 'The assistant could not complete this answer.', detail: String(e).slice(0, 300) });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
