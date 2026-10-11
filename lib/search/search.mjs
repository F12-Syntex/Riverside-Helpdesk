// The one knowledge search: Postgres full-text over the stored passages.
// /practice documents come through here; what a caller does with the rows
// (roll them up to pages, show passages) is its own business.
//
// Relative imports with extensions, not `@/`: the tests run this under plain
// `node`, which knows nothing of the Next.js alias.
import { ensureKnowledgeSchema, getSql } from '../db.js';
import { orQuery } from './query.mjs';

const MAX_LIMIT = 80;
const KINDS = ['note', 'document', 'contact'];

/**
 * Passages of active entries, best first.
 *
 * The entry's TITLE is weighted above its text (setweight 'A'), so a document
 * called "District nurses" outranks one that mentions them once. The words
 * are ORed (see orQuery), and ts_rank_cd puts the passage sharing the most of
 * them, closest together, first; a hair of the entry's authority breaks ties
 * toward the Notebook.
 *
 * A database error is thrown — the caller decides what a failed search means
 * (/practice says it found nothing).
 */
export async function searchPassages(query, { kinds = ['note', 'document'], limit = 30 } = {}) {
  const words = orQuery(query);
  const wanted = (Array.isArray(kinds) ? kinds : [kinds]).filter((kind) => KINDS.includes(kind));
  if (!words || !wanted.length) return [];

  await ensureKnowledgeSchema();
  const sql = getSql();
  const cap = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || 30));
  return sql`
    SELECT p.id, p.entry_id AS "entryId", p.heading, p.content, p.location,
           e.kind, e.title, e.data, e.source_ref AS "sourceRef", e.authority,
           (ts_rank_cd(setweight(to_tsvector('english', e.title), 'A') || p.search_doc, to_tsquery('english', ${words}))
             + 0.001 * e.authority / 100.0)::float8 AS score
    FROM knowledge_passages p
    JOIN knowledge_entries e ON e.id = p.entry_id
    WHERE e.status = 'active' AND e.kind = ANY(${wanted})
      AND (setweight(to_tsvector('english', e.title), 'A') || p.search_doc) @@ to_tsquery('english', ${words})
    ORDER BY score DESC, p.id
    LIMIT ${cap}
  `;
}
