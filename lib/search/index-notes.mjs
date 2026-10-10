// Embedding Notebook passages in the background, so a page is searchable by
// meaning a moment after it is saved, with no script for anyone to run.
//
// A save indexes the page's words at once (syncNoteKnowledge in lib/notebook.js
// upserts its passages, and Postgres derives the full-text column) but leaves
// new passages without a vector, because an embedding call inside the save
// would hold the editor's autosave open on a third-party API. This fills the
// gap afterwards:
// - after every save, forced, so the page just written is embedded next;
// - at the start of every Q&A turn, at most once a minute per server instance,
//   so a background run that died (a frozen serverless instance, an API
//   outage) is repaired by the next question, and a backlog — every page that
//   existed before notes were embedded at all — is filled on first use.
// Unchanged text keeps its vector through upsertKnowledgeEntry's hash reuse,
// so only new or edited passages are ever sent to be embedded.
import { waitUntil } from '@vercel/functions';

const THROTTLE_MS = 60000;
// fillMissingKnowledgeEmbeddingsByKind embeds at most this many per call; a
// call that returns a full batch means there may be more behind it.
const BATCH = 200;
// A run never loops forever: if a full batch keeps coming back (rows changing
// under it faster than they are embedded), the next schedule picks it up.
const MAX_ROUNDS = 10;

// Keep a serverless function alive until the run finishes. A long-lived Node
// server simply lets the promise run.
function deferToPlatform(promise) {
  if (!process.env.VERCEL) return;
  try { waitUntil(promise); } catch (e) { /* no request context: the promise runs anyway */ }
}

// Loaded on first use rather than imported: lib/knowledge.js reaches the
// database, and keeping it out of this module's import graph lets the
// scheduling rules be tested with a fill passed in.
async function fillNotes(kind) {
  const { fillMissingKnowledgeEmbeddingsByKind } = await import('../knowledge.js');
  return fillMissingKnowledgeEmbeddingsByKind(kind);
}

/**
 * A scheduler for note embedding: single-flight, throttled, never throwing.
 *
 * SINGLE FLIGHT. Two saves a second apart must not embed the same passages
 * twice, so while a run is going a further call only asks for one more pass
 * when it finishes — which also picks up passages written after the run read
 * its batch.
 */
export function createNoteEmbedder({ fill = fillNotes, now = Date.now, defer = deferToPlatform, throttleMs = THROTTLE_MS } = {}) {
  let running = null;
  let rerun = false;
  let lastStart = -Infinity;

  async function run() {
    try {
      let rounds = 0;
      do {
        rerun = false;
        const filled = await fill('note');
        if (Number(filled) >= BATCH) rerun = true;
      } while (rerun && ++rounds < MAX_ROUNDS);
    } catch (e) {
      console.warn('[search] note embedding: ' + String(e?.message || e).slice(0, 200));
    } finally {
      running = null;
    }
  }

  return function schedule({ force = false } = {}) {
    try {
      if (running) { rerun = true; return; }
      if (!force && now() - lastStart < throttleMs) return;
      lastStart = now();
      // Started on the next microtask, so `running` is set before run() can
      // clear it — a fill that fails at once must not leave a run "in flight"
      // forever.
      running = Promise.resolve().then(run);
      defer(running);
    } catch (e) {
      console.warn('[search] note embedding: ' + String(e?.message || e).slice(0, 200));
    }
  };
}

/** Fire-and-forget: embed every note passage that has no vector yet. */
export const scheduleNoteEmbedding = createNoteEmbedder();
