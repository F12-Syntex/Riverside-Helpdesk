// Long notebook jobs, reported while they run.
//
// Restoring a backup and loading a save are the two operations that rewrite the
// whole notebook, and both used to happen behind a closed door: the browser
// posted, and nothing moved on screen until it was over. On a few hundred pages
// that was long enough to look broken, long enough to be clicked twice, and —
// on a route capped at sixty seconds — sometimes long enough to time out with
// half a notebook written.
//
// So they stream. One JSON object per line, sent the moment the step happens,
// with the finished result as the last line. This file holds the two halves of
// that arrangement — the server's response and the browser's reader — in one
// place, so the shape they agree on is written down once.
//
// WHY THE ERROR IS A LINE. By the time a step fails the response has already
// begun, so its status is long since 200. A failure is therefore the last line
// with `error` on it, and the reader below surfaces it the same way it would a
// refusal that arrived before the stream opened.

const encoder = new TextEncoder();

/**
 * Run a job and stream its progress as NDJSON.
 *
 * `run(send)` does the work and calls `send(obj)` as often as it likes. Its
 * return value, if any, is sent as a final `{ phase: 'done', ok: true, ... }`.
 *
 * @param {Function} run
 * @returns {Response}
 */
export function progressStream(run) {
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        // A reader that has gone away makes enqueue throw. That is not a reason
        // to abandon the work — the notebook is mid-restore — so it is ignored
        // and the job runs to the end.
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n')); } catch (e) { /* client left */ }
      };
      try {
        const result = await run(send);
        send({ phase: 'done', ok: true, ...(result && typeof result === 'object' ? result : {}) });
      } catch (e) {
        send({ phase: 'error', error: 'That did not finish.', detail: String((e && e.message) || e).slice(0, 300) });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // Proxies buffer a response until it ends unless told not to, which would
      // defeat the entire point of sending it in pieces.
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Read one of those streams in the browser, calling `onStep` for each line.
 *
 * Returns the `done` line, or throws with the message the server sent — so a
 * caller writes one try/catch and does not have to know that some failures
 * arrive as a status code and others as a line.
 *
 * @param {Response} res      the fetch response
 * @param {Function} onStep   called with each parsed line
 */
export async function readProgress(res, onStep) {
  // A refusal BEFORE the stream opened is still an ordinary JSON error.
  if (!res.ok) {
    const out = await res.json().catch(() => ({}));
    throw new Error(out.error || 'That did not finish.');
  }
  if (!res.body) throw new Error('That did not finish.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let failure = '';
  let finished = null;

  const take = (raw) => {
    if (!raw.trim()) return;
    let step;
    try { step = JSON.parse(raw); } catch (e) { return; } // a half-written line
    if (step.phase === 'error') { failure = step.error || 'That did not finish.'; return; }
    if (step.phase === 'done') finished = step;
    try { onStep(step); } catch (e) { /* the caller's problem, not the stream's */ }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const raw of lines) take(raw);
  }
  if (buffer) take(buffer);

  if (failure) throw new Error(failure);
  return finished || {};
}

/**
 * What a phase is called on screen. Held here rather than in each page, so the
 * two places that show one cannot describe the same step differently.
 */
export const PHASE_LABELS = {
  saving: 'Saving what is here first',
  clearing: 'Clearing the notebook',
  notes: 'Restoring pages',
  attachments: 'Re-linking files',
  indexing: 'Indexing for the assistant',
};

export const phaseLabel = (phase) => PHASE_LABELS[phase] || 'Working';
