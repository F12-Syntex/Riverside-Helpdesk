// The agent endpoint: the assistant's brain for staff questions.
//
// What changed, and why. The old pipeline retrieved five passages once, before
// the model had properly read the question, and then asked it to answer from
// whatever came back. Anything that first search missed was simply unavailable.
// Here the model drives its own retrieval — it searches the practice's material
// as many times as the question needs, opens a whole Notebook page when a
// fragment is not enough, and can go to the web when the practice's own
// material genuinely does not cover the question.
//
// Three phases, all streamed to the browser as they happen so the reader can
// see exactly which tool ran and what it found:
//   1. RESEARCH  — a tool loop (Vercel AI SDK) over the tools in lib/agent/tools
//   2. COMPOSE   — a structured answer, written only from what the tools found
//   3. VALIDATE  — every practice claim is checked against a verbatim quote in
//                  the source it names; failures go back to the model once and
//                  are dropped if they still do not verify (lib/agent/compose)
//
// Two message shapes are not questions at all — a pasted medical document to
// file, and an incoming patient request to route — and those keep their existing
// dedicated cards: the agent recognises them, calls hand_off, and the request is
// delegated to the previous endpoint unchanged.
import { NextResponse } from 'next/server';
import { streamText, stepCountIs, tool } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import { fullNotebookContext, notebookFingerprint } from '@/lib/notebook';
import { getSupplementaryEntries } from '@/lib/ai/context.mjs';
import { isCacheableAnswer, isCacheableRequest } from '@/lib/answer-cache/match.mjs';
import { lookupCachedAnswer, saveCachedAnswer } from '@/lib/answer-cache/store';
import { contactTelSet, digitsOf, redactUnverifiedNumbers } from '@/lib/contacts';
import { createEvidence } from '@/lib/agent/evidence.mjs';
import { createTools } from '@/lib/agent/tools.mjs';
import { composeVerifiedAnswer } from '@/lib/agent/compose.mjs';
import { explainLookup, lookupErsMapping } from '@/lib/referrals/ers-lookup';
import { determineReferralRoute } from '@/lib/referrals/route-determination.mjs';
import { getModelRoles } from '@/lib/settings';
import { selectSources } from '@/lib/agent/select.mjs';
import { recordUsage } from '@/lib/ai/usage';
import { POST as askPOST } from '../ask/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// The research loop's ceiling. Each step is one model call plus whatever tools
// it asked for, so this bounds both cost and how long a reader waits.
const MAX_RESEARCH_STEPS = 6;

const RESEARCH_SYSTEM = [
  'You are the research half of the reception assistant for The Riverside Practice, a UK GP surgery.',
  'Your job in this phase is ONLY to gather evidence with the tools. Someone else writes the answer from what you collect.',
  '',
  'How to work:',
  '- Always search the practice’s own material first with search_practice, and search it more than once when the first wording returns little — staff and documents use different words for the same thing. It is a word search: it finds the words you type, not what you meant.',
  '- YOU CHOOSE THE FILES. list_practice_sources shows every Notebook page and every document the practice holds, with a summary of each. When a search returns fragments, returns nothing, or you are about to conclude the practice has no material on something, list the sources and open the one that plainly covers the question. Nothing pre-selects documents for you.',
  '- open_practice_source reads a Notebook page whole, and reads a document ONE PART AT A TIME. Documents are long: use the outline that comes back to go straight to the part you need, and do not read a file end to end to answer one question. Re-opening a part you have already read is free, so open the part you actually need rather than hoarding the whole file.',
  '- If a result is clearly the middle of a longer process, open the source it came from so the answer can set the process out end to end.',
  '- Only after the practice material has been tried, and only if it does not cover the question, use search_web. Web pages are general guidance, never practice policy.',
  '- CONTACT QUESTIONS: if the question asks for a telephone number, an email address or who to ring, call find_contact — and call it as well whenever the practice material names a service without giving its number. It searches the practice directory, then the CQC register, then reads the web and takes the number off the page. Never write a number yourself, and never leave the answer telling the reader to look one up: the whole point of the question is the number.',
  '- REFERRAL QUESTIONS: a referral cannot be sent without a Speciality and a Clinic Type. Search the practice material for them first — the Notebook is right and always wins. If, after searching, no page records the pairing for this referral, call suggest_ers_referral_route with the condition being referred. Do not leave the answer telling the reader to look it up in the task when this tool can name the pairing from the e-RS referral-types list.',
  '- Two message shapes are not questions: a pasted medical document (a letter or report to be filed) and an incoming patient request that needs routing. If the message is one of those, call hand_off immediately and do nothing else.',
  '',
  'Stop as soon as you have what is needed. When you are done, reply with a one-line note of what you found — nothing more.',
].join('\n');

// Numbers the answer is allowed to contain: the practice directory, plus any
// number appearing in a source a tool actually returned. Anything else the
// model writes is redacted rather than shown to a receptionist who might dial it.
const NUMBER_RUN = /\d[-\d.()/ \t ]{7,}\d/g;
function verifiedNumbers(evidence, contacts = []) {
  const verified = new Set(contactTelSet());
  for (const chunk of evidence.practiceList()) {
    for (const run of String(chunk.text || '').match(NUMBER_RUN) || []) {
      const d = digitsOf(run);
      if (d.length >= 9) verified.add(d);
    }
  }
  // Anything find_contact produced counts as verified in the same sense: it was
  // copied out of the practice directory, the CQC register or a page, never
  // written by the model. A number it looked up is not stripped as a guess.
  for (const contact of contacts) {
    for (const phone of contact.phones || []) {
      const d = digitsOf(phone.tel || phone.display);
      if (d.length >= 9) verified.add(d);
    }
  }
  return verified;
}

// The browser reads one stream shape whatever produced the answer, so a cached
// answer is sent down the same ndjson stream — it just arrives all at once,
// carrying the marker that says where it came from and when.
const NDJSON_HEADERS = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-store, no-transform',
  Connection: 'keep-alive',
};

function cachedAnswerStream(hit) {
  const encoder = new TextEncoder();
  const payload = {
    ...hit.payload,
    // What the card shows: that this was answered earlier, when, and — when the
    // wording differed — which question it was actually the answer to. Reload
    // on the card asks it again for real.
    cache: {
      hit: true,
      match: hit.match,
      similarity: hit.similarity,
      cachedAt: hit.cachedAt,
      question: hit.question,
      hits: hit.hits,
    },
  };
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ type: 'answer', payload }) + '\n'));
      controller.close();
    },
  });
  return new Response(stream, { headers: NDJSON_HEADERS });
}

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  // Which model does which job — a practice setting now, changed at /settings.
  // The reasoning role researches and writes; the web role searches the
  // internet and reads pages for a number; the vision role reads a pasted
  // image. An unset role falls back to the reasoning model, so an install that
  // has only ever chosen one model is unaffected.
  const roles = await getModelRoles();
  const model = roles.reasoning.model;
  const searchModel = roles.web.model;

  if (!apiKey) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY.' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const question = typeof body?.question === 'string' && body.question.trim() ? body.question : 'Please look at the attached image.';
  const history = typeof body?.history === 'string' ? body.history : '';
  const customGuides = Array.isArray(body?.customGuides) ? body.customGuides : [];
  const images = Array.isArray(body?.images)
    ? body.images.filter((u) => typeof u === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(u)).slice(0, 4)
    : [];
  // "Answer this one properly" — the reader pressed Reload on a cached answer,
  // so the stored one is ignored and overwritten with whatever comes back.
  const refresh = body?.refresh === true;

  // The same questions are asked every day, in slightly different words each
  // time, and each one otherwise costs a full agent turn. An answer already
  // given to this question is served straight from the cache — before the
  // Notebook is even loaded, so a hit costs one or two queries rather than
  // twenty seconds — and the card says plainly that it came from the cache.
  const cacheable = isCacheableRequest({ question, history, images });
  let fingerprint = '';
  let cacheEmbedding = null;
  if (cacheable) {
    try {
      fingerprint = await notebookFingerprint();
      if (!refresh) {
        const { hit, embedding } = await lookupCachedAnswer({ question, model, fingerprint });
        cacheEmbedding = embedding;
        if (hit) return cachedAnswerStream(hit);
      }
    } catch (e) {
      // The cache is an optimisation. If it is unavailable the question is
      // answered the slow way, and nothing is stored for the next asker.
      console.warn('[agent] answer cache unavailable:', String(e).slice(0, 160));
      fingerprint = '';
    }
  }

  // Notebook guidance is authoritative and the agent's main source. Never answer
  // silently without it.
  let notebookChunks = [];
  try {
    notebookChunks = await fullNotebookContext();
  } catch (e) {
    return NextResponse.json({ error: 'The practice Notebook is temporarily unavailable, so no answer was generated.' }, { status: 503 });
  }
  try {
    const extra = await getSupplementaryEntries();
    notebookChunks = notebookChunks.concat(
      extra.filter((item) => item && String(item.text || '').trim()).map((item, i) => ({
        id: `supplementary:${i}:full`,
        docId: `supplementary:${item.origin}:${item.name}`,
        docTitle: `Practice context: ${item.name}`,
        text: String(item.text),
        section: 'Complete note',
        view: null,
        images: [],
        kind: 'notebook',
      })),
    );
  } catch (e) { /* optional extra context */ }

  const openrouter = createOpenRouter({
    apiKey,
    // Only providers that do not retain prompt data, so the question and the
    // practice's own text are never stored by the model provider.
    extraBody: {
      provider: { data_collection: 'deny' },
      // No extended reasoning. None of the three phases is a puzzle: the
      // research phase picks which source to open, and the writing phase turns
      // sources it has been handed into steps. On a model that thinks first,
      // that deliberation is most of the wait — paid on every question, for
      // work already pinned down by the prompt and checked in code afterwards.
      // Models that always reason ignore this; the rest answer straight away.
      reasoning: { enabled: false, exclude: true },
    },
  });
  const chat = openrouter(model);
  // One id per turn, so the usage rows written by the research loop and by the
  // writer can be added up into what ONE QUESTION cost rather than what one call
  // cost. Not derived from the question and never stored beside it.
  const turnId = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); } catch (e) { /* the reader went away */ }
      };
      const evidence = createEvidence();

      try {
        send({ type: 'status', text: 'Working out what to look up' });

        // A pasted document or an incoming patient request keeps its existing
        // card. The agent flags it and the previous endpoint produces the shape.
        let handOff = '';
        // Numbers and addresses find_contact turned up during the turn. They
        // reach the reader as structured data in the contacts card, never
        // through the model's prose.
        const foundContacts = [];
        const tools = createTools({
          apiKey,
          searchModel,
          notebookChunks,
          evidence,
          onEvent: send,
          contacts: foundContacts,
          onUsage: (role, usedModel, usage) => recordUsage({ turnId, role, phase: 'search_web', model: usedModel, usage }),
        });
        tools.hand_off = tool({
          description: 'Declare that this message is not a staff question but a pasted medical document to file, or an incoming patient request that needs routing. Call this and stop.',
          inputSchema: z.object({
            kind: z.enum(['document-to-file', 'patient-request']).describe('Which of the two it is.'),
          }),
          execute: async ({ kind }) => {
            handOff = kind;
            send({
              type: 'tool-start',
              id: 'handoff',
              tool: 'hand_off',
              label: kind === 'document-to-file' ? 'Reading the pasted document' : 'Triaging the patient request',
              detail: '',
            });
            return { acknowledged: true, note: 'Stop now. Another part of the system handles this.' };
          },
        });

        const userContent = images.length
          ? [{ type: 'text', text: question }].concat(images.map((url) => ({ type: 'image', image: url })))
          : question;

        // Started HERE, not after the research loop. The e-RS referral-type
        // lookup depends on the question alone — not on anything the loop finds
        // — so it has no reason to wait its turn behind six model calls. It runs
        // against Postgres while the loop is still choosing what to open, and is
        // collected further down, by which time it has long finished.
        const ersPending = /\brefer(?:ral|rals|red|ring|s)?\b/i.test(question)
          ? lookupErsMapping(question).catch((e) => {
            console.warn('[agent] e-RS lookup unavailable:', String(e).slice(0, 160));
            return null;
          })
          : Promise.resolve(null);

        const research = streamText({
          model: chat,
          system: RESEARCH_SYSTEM,
          messages: [
            ...(history ? [{ role: 'user', content: `Conversation so far:\n${history}` }] : []),
            { role: 'user', content: userContent },
          ],
          tools,
          stopWhen: stepCountIs(MAX_RESEARCH_STEPS),
          temperature: 0.2,
        });
        // Drain the stream so the tool loop actually runs. The research model's
        // prose is working notes, not the answer, so none of it is shown; the
        // visible progress comes from the tools themselves.
        //
        // Read the full stream rather than the text: a provider or tool failure
        // arrives as an error part and would otherwise end the text stream
        // quietly, leaving the turn to report "I found nothing" for what was
        // really a broken call.
        let researchError = null;
        for await (const part of research.fullStream) {
          if (part.type === 'error') researchError = part.error;
          else if (part.type === 'tool-error') researchError = part.error;
        }
        if (researchError) throw researchError;
        // What the research phase used, measured. The settings page prices a
        // question from these rows rather than from an advertised rate.
        recordUsage({ turnId, role: 'reasoning', phase: 'research', model, usage: await research.totalUsage.catch(() => null) });

        if (handOff) {
          send({ type: 'status', text: handOff === 'document-to-file' ? 'Building the filing title' : 'Writing the routing notes' });
          const delegated = await askPOST(new Request('http://internal/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, history, customGuides, images }),
          }));
          const data = await delegated.json();
          send({ type: 'answer', payload: data });
          controller.close();
          return;
        }

        // Nothing to write an answer FROM. A contact lookup legitimately lands
        // here — "what is the number for Whipps Cross" needs no policy passage —
        // and the number that was found is the answer, so it is handed over
        // rather than thrown away behind "I could not find anything".
        if (!evidence.practiceCount && !evidence.webCount) {
          send({
            type: 'answer',
            payload: {
              kind: 'answer',
              answerable: false,
              intro: foundContacts.length
                ? 'The practice’s own material does not cover this, but here are the contact details I found.'
                : 'I could not find anything about this in the practice’s Notebook or documents, and nothing usable on the web, so I have nothing to answer from.',
              keyPoints: [],
              sections: [],
              message: '',
              messageCite: null,
              tip: '',
              gaps: foundContacts.length
                ? 'Check the details against the service before giving them to a patient.'
                : 'Ask the practice manager, or the lead for this area.',
              citations: [],
              contacts: foundContacts,
              validation: { attempts: 0, checked: 0, verified: 0, dropped: 0, problems: [] },
            },
          });
          controller.close();
          return;
        }

        // The e-RS referral-type match, run here rather than left to the research
        // model to remember. Asking it nicely in the system prompt was not
        // reliable: it would answer "set the type of referral as indicated in the
        // task" while a lookup that could name the pairing went uncalled.
        //
        // Run for every referral question and offered to the writer, which
        // decides precedence — the practice sources win whenever they record the
        // pairing for this referral. Gating it here on whether the sources
        // mention "speciality" and "clinic type" did not work: the standard flow
        // page names both fields generically, so a referral it gives no values
        // for still looked covered.
        //
        // Everything the lookup used to reach the pairing is kept, not just the
        // pairing itself: a referral the Notebook does not cover is answered
        // from what the practice's data implies, and the reader has to be able
        // to see WHAT it was determined from before acting on it.
        const match = await ersPending;
        const ersSuggestion = match?.suggestion && (match.suggestion.specialty || match.suggestion.clinicType)
          ? {
            specialty: match.suggestion.specialty,
            clinicType: match.suggestion.clinicType,
            snomed: match.matched,
            alternatives: match.alternatives,
            confidence: match.confidence,
            cancer: match.cancer,
            explanation: explainLookup(match),
          }
          : null;

        // What the writer is allowed to read.
        //
        // The research loop is free to open whatever it likes — reading a source
        // is a database query. The writer is the opposite: it runs on the
        // reasoning model and every character it is handed is paid for at that
        // model's input rate. A loop that opened eight sources to settle one
        // question was sending all eight, in full, to be read again.
        //
        // So the sources are ranked against the question and the weakest are
        // held back. Nothing is lost: everything stays in the evidence registry,
        // which is what quotes are still validated against.
        const selection = selectSources(evidence.practiceList(), question);
        if (selection.dropped.length) {
          console.log(`[agent] writer sees ${selection.kept.length}/${evidence.practiceCount} sources (${selection.chars} chars); held back ${selection.dropped.map((d) => d.ref).join(', ')}`);
        }

        const answer = await composeVerifiedAnswer({
          model: chat,
          question,
          history,
          evidence,
          ersSuggestion,
          selectedRefs: selection.refs,
          onStatus: (text) => send({ type: 'status', text }),
          onUsage: (phase, usage) => recordUsage({ turnId, role: 'reasoning', phase, model, usage }),
        });

        // Which of the two the e-RS card is showing: a pairing the practice's own
        // material records, or one determined from the practice's e-RS
        // referral-types export when no Notebook page covers this referral. The
        // determined one carries its provenance to the card — the writer leaving
        // the pairing out, or labelling a matched one as the practice's own, is
        // exactly how it would otherwise reach the reader unmarked.
        const { route: referralRoute, determination } = determineReferralRoute({
          route: answer.referralRoute,
          suggestion: ersSuggestion,
          sourceTexts: evidence.practiceList().map((chunk) => chunk.text),
        });

        // Redact any number the model wrote that no source vouches for.
        const verified = verifiedNumbers(evidence, foundContacts);
        const redact = (t) => redactUnverifiedNumbers(t, verified);
        const sections = answer.sections.map((sec) => ({ ...sec, markdown: redact(sec.markdown) }));
        const keyPoints = answer.keyPoints.map((point) => ({ ...point, text: redact(point.text) }));

        // Each source image is shown once, against the first section it backs.
        const seenImage = new Set();
        for (const sec of sections) {
          if (!sec.cite || !Array.isArray(sec.cite.images)) continue;
          sec.cite.images = sec.cite.images.filter((u) => {
            if (seenImage.has(u)) return false;
            seenImage.add(u);
            return true;
          });
        }

        // The distinct practice sources this answer relied on.
        const citations = [];
        const seenCite = new Set();
        for (const cite of sections.map((sec) => sec.cite).concat([answer.messageCite])) {
          if (!cite) continue;
          const key = [cite.docId, cite.location].join('|');
          if (seenCite.has(key)) continue;
          seenCite.add(key);
          citations.push(cite);
        }

        const payload = {
          kind: 'answer',
          answerable: answer.answerable,
          intro: redact(answer.intro),
          keyPoints,
          sections,
          message: redact(answer.message),
          messageCite: answer.messageCite,
          messageWeb: answer.messageWeb,
          tip: redact(answer.tip),
          gaps: redact(answer.gaps),
          // Questions the reader can tap to ask next, in this same chat.
          followUps: (answer.followUps || []).map((q) => redact(q)),
          // The four e-RS fields, shown on their own above the steps.
          referralRoute: referralRoute ? {
            requestType: redact(referralRoute.requestType),
            priority: redact(referralRoute.priority),
            specialty: redact(referralRoute.specialty),
            clinicType: redact(referralRoute.clinicType),
            // A clinic type the material leaves conditional is shown as the
            // choice it really is, with what decides between the options.
            clinicTypeOptions: (referralRoute.clinicTypeOptions || []).map((v) => redact(v)),
            clinicTypeCondition: redact(referralRoute.clinicTypeCondition),
            source: referralRoute.source,
            // Where a determined pairing came from — the SNOMED concept, the
            // e-RS referral-types list, how close the match was, and what else
            // was close. Null when the practice's own material records it.
            determination,
          } : null,
          citations,
          // Shown as structured data in their own card, so a number reaches
          // the reader exactly as its source wrote it.
          contacts: foundContacts,
          validation: answer.validation,
        };

        send({ type: 'answer', payload });

        // Keep it for the next person who asks. After the answer has been sent,
        // never before: storing it must not make this reader wait, and a cache
        // that cannot be written is not a failed answer.
        if (cacheable && fingerprint && isCacheableAnswer(payload)) {
          try {
            await saveCachedAnswer({ question, model, fingerprint, payload, embedding: cacheEmbedding });
          } catch (e) {
            console.warn('[agent] could not store the answer:', String(e).slice(0, 160));
          }
        }
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
