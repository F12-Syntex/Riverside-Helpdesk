// The screen that runs before a message is sent.
//
// One closed question, on the Super speed role, answered in one word: does this
// message identify a particular patient? The browser calls this before it puts
// anything in the transcript, and a "yes" means the message is never sent at
// all — see lib/safety/patient-data.mjs for why what cannot be redacted is
// refused instead, and app/_components/PatientDataModal.jsx for what the reader
// is shown.
//
// THIS ENDPOINT NEVER SEES MORE THAN THE ASSISTANT WAS ALREADY GOING TO. The
// deterministic redaction (lib/safety/identifiers.mjs) runs in the browser
// before the fetch and again here, so the text screened is the text that was
// about to be posted to /api/agent — the screen adds no exposure of its own.
// That ordering is the whole reason it is safe to send a message to a model in
// order to ask whether it should be sent to a model.
//
// NOTHING IS STORED. No question_log row, no audit entry, no cache: a screened
// message is not a turn, and a check that wrote down every message somebody
// thought better of would be a worse record than the one it protects. The token
// counts go to ai_usage under the `superSpeed` role, which carries no text.
//
// IT FAILS OPEN. Every error path returns `blocked: false` with `screened:
// false`, so the message goes exactly as it did before this existed. A guard
// that fails closed is a guard that takes the assistant down with OpenRouter,
// at a desk with a patient standing at it.
import { NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { PATIENT_DATA_SCHEMA, blocksSend, kindsOf, patientDataMessage, patientDataPrompt } from '@/lib/safety/patient-data.mjs';
import { redactIdentifiers } from '@/lib/safety/identifiers.mjs';
import { getDirectory } from '@/lib/lookup/directory';
import { AI_SDK_EXTRA_BODY } from '@/lib/ai/openrouter.mjs';
import { getModelRoles } from '@/lib/settings';
import { recordUsage } from '@/lib/ai/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A screen nobody is waiting on is a screen that has failed. This is far longer
// than the call should ever take and exists only so the function is not killed
// mid-flight; the real limit is the race below.
export const maxDuration = 30;

// WHAT THE READER WILL ACTUALLY WAIT. Chosen against what is on the other side
// of it: a message they have finished typing and expect to have sent. Past this
// the check is abandoned and the message goes — a screen is worth a moment and
// it is not worth a queue at the desk.
const SCREEN_TIMEOUT_MS = 5000;

// Long enough for anything typed into the field, short enough that a pasted
// consultation does not turn the fast path into a slow one. A message over this
// is screened on its opening — where a name, a number or a date of birth is
// written if it is written at all.
const MAX_SCREEN_CHARS = 4000;

function withTimeout(promise, ms) {
  let timer = null;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), ms); }),
  ]);
}

// The one shape this endpoint returns, so a caller can read the answer the same
// way whether it ran, was skipped, or failed.
const verdict = (extra = {}) => ({
  blocked: false,
  // Whether a model actually answered. The browser does not change what it does
  // on this — a message that was not screened is sent — but a check nobody can
  // tell apart from a pass is a check nobody can tell has stopped working.
  screened: false,
  kinds: [],
  message: '',
  ...extra,
});

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const asked = typeof body?.text === 'string' ? body.text : '';
  // The same redaction the browser ran before calling, run again here — for the
  // reason /api/agent runs it again: the guard is a property of the endpoint
  // rather than of the page, so anything else posting here is held to it too.
  const text = redactIdentifiers(asked, { allow: getDirectory() }).text.trim();

  // Nothing to screen, and no key to screen it with, are the same answer: the
  // message goes. Neither is worth a round trip to say so.
  if (!text || !apiKey) return NextResponse.json(verdict());

  const openrouter = createOpenRouter({ apiKey, extraBody: AI_SDK_EXTRA_BODY });

  let model = '';
  try {
    model = (await getModelRoles()).superSpeed.model;
  } catch (e) {
    // The roles could not be read, so there is no model to screen with. The
    // deterministic redaction above has already run.
    console.warn('[screen] could not read the model roles:', String(e).slice(0, 160));
    return NextResponse.json(verdict());
  }

  try {
    const out = await withTimeout(generateObject({
      model: openrouter(model),
      schema: PATIENT_DATA_SCHEMA,
      temperature: 0,
      prompt: patientDataPrompt(text.slice(0, MAX_SCREEN_CHARS)),
    }), SCREEN_TIMEOUT_MS);
    // No turn id: this is not a turn. The row still names the role, so the
    // settings page can price what the screen costs per message.
    recordUsage({ role: 'superSpeed', phase: 'screen', model, usage: out.usage });

    const kinds = kindsOf(out.object);
    return NextResponse.json(verdict({
      blocked: blocksSend(out.object),
      screened: true,
      kinds,
      // Assembled here from the kinds rather than written by the model, so the
      // popup cannot be made to say anything the code did not choose — and, more
      // to the point, cannot be made to repeat the detail it is refusing.
      message: blocksSend(out.object) ? patientDataMessage(kinds) : '',
    }));
  } catch (e) {
    console.warn('[screen] patient data screen failed:', String(e).slice(0, 160));
    return NextResponse.json(verdict());
  }
}
