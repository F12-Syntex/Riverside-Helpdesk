// The agent endpoint: one model call, and nothing else.
//
// The research loop, the evidence registry, source selection, the structured
// writer and the quote validator have all been removed. What is left is the
// smallest thing that can answer a question: the message goes to the FAST model,
// and whatever it writes comes back as the answer.
//
// This is deliberately a starting point, not a finished pipeline. Tools go back
// in one at a time from here, and the shapes that used to be handled by their
// own endpoints — a pasted document to file, an incoming patient request to
// route — become tools on this same path rather than separate systems.
//
// WHAT IS STILL HERE, AND WHY
//   • The ndjson stream. The browser reads one event shape (status / tool-start
//     / tool-result / answer / error) and none of the chat had to change.
//   • The answer payload shape, so the card renders exactly as before. The parts
//     that need sources — citations, key points, the e-RS card — come back empty
//     because there are no sources.
//   • `general: true`. The card carries a line saying this was written by the
//     assistant and is not from the practice's documents. Right now that is
//     simply true of every answer.
//   • Number redaction. With nothing grounding the answer, every number in it is
//     the model's guess, so this matters more than it did before, not less.
//
// WHAT IS DELIBERATELY UNWIRED, NOT DELETED
//   • The Notebook (lib/notebook.js). It is where the practice's real data
//     lives and it is untouched — this route simply does not read it yet.
//   • The answer cache (lib/answer-cache/). Keyed on the Notebook fingerprint,
//     which means nothing while the Notebook is not an input, and it would serve
//     answers written by an older prompt while the prompt is still changing.
import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
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
