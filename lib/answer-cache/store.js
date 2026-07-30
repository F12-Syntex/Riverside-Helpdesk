// The answer cache itself: read it before the agent runs, write it after.
//
// Two ways in, cheapest first:
//
//   1. EXACT   — the canonical form of the question (see ./match.mjs) hashed to
//                a key. A direct primary-key hit, no model call, milliseconds.
//   2. SIMILAR — the question embedded once and matched against the stored
//                questions by cosine distance. Costs one embedding call (a
//                fraction of a second) instead of a whole agent turn, so a
//                question asked in different words is still answered instantly.
//
// A row is only ever served while it is still current: same model, same
// Notebook fingerprint (see notebookFingerprint in lib/notebook.js) and inside
// MAX_AGE_DAYS. Anything else is not a cache miss to be worked around — it is a
// stale answer, and stale answers are deleted rather than shown.
import { ensureAnswerCacheSchema, getSql } from '@/lib/db';
import { embedOne } from '@/rag/lib/embed.mjs';
import { MAX_AGE_DAYS, SIMILARITY_THRESHOLD, normaliseQuestion, questionKey } from './match.mjs';

const VECTOR_DIM = 1536;

function vectorLiteral(vec) {
  if (!Array.isArray(vec) || vec.length !== VECTOR_DIM) return null;
  return '[' + vec.map((n) => Number(n) || 0).join(',') + ']';
}

// The row as the browser needs it: the answer itself, plus what it is — an
// answer given earlier, to a question that may have been worded differently.
// The reader is told both, and can always ask for it again (see `refresh`).
function hitFrom(row, match, similarity) {
  return {
    payload: row.payload,
    question: row.question,
    cachedAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    hits: Number(row.hits) || 0,
    match,
    similarity: similarity == null ? 1 : Math.round(Number(similarity) * 1000) / 1000,
  };
}

async function markUsed(sql, id) {
  await sql`UPDATE answer_cache SET hits = hits + 1, used_at = now() WHERE id = ${id}`;
}

/**
 * Look for an answer already given to this question.
 *
 * Returns `{ hit, embedding }`. `hit` is null on a miss; `embedding` is the
 * vector computed while looking (or null), handed back so the caller can pass
 * it to saveCachedAnswer and the question is never embedded twice in one turn.
 */
export async function lookupCachedAnswer({ question, model, fingerprint }) {
  await ensureAnswerCacheSchema();
  const sql = getSql();
  const key = questionKey(question);

  const exact = await sql`
    SELECT id, question, payload, hits, created_at AS "createdAt"
    FROM answer_cache
    WHERE id = ${key}
      AND model = ${model}
      AND fingerprint = ${fingerprint}
      AND created_at > now() - make_interval(days => ${MAX_AGE_DAYS})
  `;
  if (exact[0]) {
    await markUsed(sql, exact[0].id).catch(() => {});
    return { hit: hitFrom(exact[0], 'exact', 1), embedding: null };
  }

  // Worded differently, then. One embedding call, then the nearest stored
  // question — and only if it is near enough to be the same question.
  let embedding = null;
  try {
    embedding = await embedOne(String(question).trim());
  } catch (e) {
    console.warn('[answer-cache] could not embed the question:', String(e).slice(0, 160));
    return { hit: null, embedding: null };
  }
  const qv = vectorLiteral(embedding);
  if (!qv) return { hit: null, embedding: null };

  const near = await sql`
    SELECT id, question, payload, hits, created_at AS "createdAt",
           1 - (embedding <=> ${qv}::vector) AS similarity
    FROM answer_cache
    WHERE model = ${model}
      AND fingerprint = ${fingerprint}
      AND embedding IS NOT NULL
      AND created_at > now() - make_interval(days => ${MAX_AGE_DAYS})
    ORDER BY embedding <=> ${qv}::vector
    LIMIT 1
  `;
  const row = near[0];
  if (row && Number(row.similarity) >= SIMILARITY_THRESHOLD) {
    await markUsed(sql, row.id).catch(() => {});
    return { hit: hitFrom(row, 'similar', row.similarity), embedding };
  }
  return { hit: null, embedding };
}

/**
 * Keep this answer for the next person who asks. Best-effort by design: the
 * answer has already been sent to the browser by the time this runs, so a
 * failure here costs the next asker some time and nothing else.
 */
export async function saveCachedAnswer({ question, model, fingerprint, payload, embedding = null }) {
  await ensureAnswerCacheSchema();
  const sql = getSql();
  const text = String(question).trim();
  const key = questionKey(text);
  const norm = normaliseQuestion(text);

  let vec = vectorLiteral(embedding);
  if (!vec) {
    try { vec = vectorLiteral(await embedOne(text)); } catch (e) { vec = null; }
  }

  // The cache stores what was sent, never a note about where it came from —
  // the "from cache" marker is added when the row is served, so re-serving one
  // can never claim an answer was cached before it was written.
  const { cache, ...answer } = payload || {};

  await sql`
    INSERT INTO answer_cache (id, question, question_norm, model, fingerprint, payload, embedding, hits, created_at, used_at)
    VALUES (${key}, ${text}, ${norm}, ${model}, ${fingerprint}, ${JSON.stringify(answer)}::jsonb,
            ${vec ? vec : null}::vector, 0, now(), now())
    ON CONFLICT (id) DO UPDATE SET
      question = EXCLUDED.question, question_norm = EXCLUDED.question_norm,
      model = EXCLUDED.model, fingerprint = EXCLUDED.fingerprint,
      payload = EXCLUDED.payload,
      embedding = COALESCE(EXCLUDED.embedding, answer_cache.embedding),
      hits = 0, created_at = now(), used_at = now()
  `;

  // Everything that can no longer be served is deleted here rather than left to
  // accumulate: a Notebook edit or a model change retires the whole table, and
  // this is the first write after either.
  try {
    await sql`
      DELETE FROM answer_cache
      WHERE model <> ${model}
         OR fingerprint <> ${fingerprint}
         OR created_at < now() - make_interval(days => ${MAX_AGE_DAYS})
    `;
  } catch (e) { /* pruning is housekeeping, never the point of the request */ }
}

/** Every stored answer, dropped. */
export async function clearAnswerCache() {
  await ensureAnswerCacheSchema();
  const sql = getSql();
  await sql`DELETE FROM answer_cache`;
}
