// The one knowledge search: Postgres full-text and pgvector over the stored
// passages, fused with reciprocal rank fusion. Notebook pages and /practice
// documents both come through here; what a caller does with the rows (roll
// them up to pages, show passages) is its own business.
//
// Relative imports with extensions, not `@/`: the benches under evals/ run
// this under plain `node`, which knows nothing of the Next.js alias.
import { ensureKnowledgeSchema, getSql } from '../db.js';
import { embedOne } from '../../rag/lib/embed.mjs';
import { orQuery } from './query.mjs';

const VECTOR_DIM = 1536;
// RRF's damping constant: rank 1 scores 1/61, rank 40 scores 1/100, so being
// near the top of BOTH arms beats being first in one.
const RRF_K = 60;
// Candidates taken from each arm before fusing.
const ARM_LIMIT = 40;
const MAX_LIMIT = 2 * ARM_LIMIT;
const KINDS = ['note', 'document', 'contact'];

function vectorLiteral(vec) {
  if (!Array.isArray(vec) || vec.length !== VECTOR_DIM) return null;
  return '[' + vec.map((n) => Number(n) || 0).join(',') + ']';
}

// The same question is often searched more than once in a turn and across a
// conversation's follow-ups; an embedding call is a network round trip, so the
// last 200 are kept. A failed call is forgotten, so the next asks again.
const queryVectorCache = new Map();
export async function queryVector(text) {
  if (queryVectorCache.has(text)) return queryVectorCache.get(text);
  const pending = embedOne(text).then((value) => {
    if (!value) queryVectorCache.delete(text);
    return value;
  }).catch(() => { queryVectorCache.delete(text); return null; });
  queryVectorCache.set(text, pending);
  if (queryVectorCache.size > 200) queryVectorCache.delete(queryVectorCache.keys().next().value);
  return pending;
}

/**
 * Passages of active entries, best first.
 *
 * TWO ARMS, FUSED BY RANK. The lexical arm finds the page that uses the
 * caller's words — a form name, "2WW", a drug — which an embedding blurs; the
 * semantic arm finds the page that means the same thing in other words ("the
 * nurses who visit at home" for district nurses). Their scores are on unrelated
 * scales, so they are fused by rank alone: each passage scores 1/(60+rank) in
 * every arm it appears in, summed, plus a hair of the entry's authority to
 * break ties toward the Notebook.
 *
 * The lexical arm weights the entry's TITLE above its text (setweight 'A'), so
 * a page called "District nurses" outranks a page that mentions them once. It
 * ORs the words (see orQuery).
 *
 * The semantic arm is best-effort: if the query cannot be embedded the lexical
 * arm runs alone, and passages not yet embedded are simply absent from it. A
 * database error is thrown — the caller decides what a failed search means
 * (the Notebook shortlist falls back to the whole Notebook).
 */
export async function searchPassages(query, { kinds = ['note', 'document'], limit = 30 } = {}) {
  const q = String(query || '').trim();
  const wanted = (Array.isArray(kinds) ? kinds : [kinds]).filter((kind) => KINDS.includes(kind));
  if (!q || !wanted.length) return [];
  const words = orQuery(q);
  let qv = null;
  try { qv = vectorLiteral(await queryVector(q)); } catch (e) { qv = null; }
  if (!words && !qv) return [];

  await ensureKnowledgeSchema();
  const sql = getSql();
  const cap = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || 30));
  // `${words} <> ''` and `${qv}::text IS NOT NULL` switch an arm off when it
  // has nothing to search with; both are constants, so the planner drops the
  // arm rather than running it.
  //
  // The semantic arm's `, p.id` tie-break is deliberate: it keeps the planner
  // off the HNSW index and on an exact scan. The index returns its nearest
  // ~40 across EVERY kind and only then filters by kind, so a Notebook search
  // could come back with a handful of rows when documents crowd the
  // neighbourhood. The corpus is a few thousand passages; exact is cheap.
  return sql`
    WITH lexical AS (
      SELECT p.id,
             ts_rank_cd(setweight(to_tsvector('english', e.title), 'A') || p.search_doc,
                        to_tsquery('english', ${words})) AS lexical
      FROM knowledge_passages p
      JOIN knowledge_entries e ON e.id = p.entry_id
      WHERE e.status = 'active' AND e.kind = ANY(${wanted}) AND ${words} <> ''
        AND (setweight(to_tsvector('english', e.title), 'A') || p.search_doc) @@ to_tsquery('english', ${words})
      ORDER BY lexical DESC, p.id
      LIMIT ${ARM_LIMIT}
    ), lexical_ranked AS (
      SELECT id, lexical, row_number() OVER (ORDER BY lexical DESC, id) AS rank FROM lexical
    ), semantic AS (
      SELECT p.id, 1 - (p.embedding <=> ${qv}::vector) AS semantic
      FROM knowledge_passages p
      JOIN knowledge_entries e ON e.id = p.entry_id
      WHERE e.status = 'active' AND e.kind = ANY(${wanted})
        AND ${qv}::text IS NOT NULL AND p.embedding IS NOT NULL
      ORDER BY p.embedding <=> ${qv}::vector, p.id
      LIMIT ${ARM_LIMIT}
    ), semantic_ranked AS (
      SELECT id, semantic, row_number() OVER (ORDER BY semantic DESC, id) AS rank FROM semantic
    ), candidates AS (
      SELECT id FROM lexical_ranked UNION SELECT id FROM semantic_ranked
    )
    SELECT p.id, p.entry_id AS "entryId", p.heading, p.content, p.location,
           e.kind, e.title, e.data, e.source_ref AS "sourceRef", e.authority,
           coalesce(l.lexical, 0)::float8 AS lexical, coalesce(s.semantic, 0)::float8 AS semantic,
           (coalesce(1.0 / (${RRF_K} + l.rank), 0) + coalesce(1.0 / (${RRF_K} + s.rank), 0)
             + 0.001 * e.authority / 100.0)::float8 AS score
    FROM candidates c
    JOIN knowledge_passages p ON p.id = c.id
    JOIN knowledge_entries e ON e.id = p.entry_id
    LEFT JOIN lexical_ranked l ON l.id = p.id
    LEFT JOIN semantic_ranked s ON s.id = p.id
    ORDER BY score DESC, p.id
    LIMIT ${cap}
  `;
}
