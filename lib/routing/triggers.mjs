// The trigger index: the phrasings a Notebook page answers to, and the search
// over them.
//
// A page is reached by wording, and the wording staff use is not the wording
// on the page — "smear" for cervical screening, "2WW" for the two-week-wait
// referral, "med3" for a fit note. So each page carries a list of trigger
// phrases, and the router matches the question against THOSE rather than
// against the page body: short strings that say the same thing many ways,
// which is what both a tsvector and an embedding are good at.
//
// Two sources, one table:
//   generated — a one-off fast-role pass over the page (./generate.mjs, run by
//               `npm run routing:seed`). Regenerated when the page's content
//               hash changes, which is what `source_hash` is for.
//   tap       — a real staff phrasing, learned when somebody taps an option
//               on a "which did you mean?" card. These survive page edits:
//               they are how a person actually said it.
//
// Reuse, not rewrite: the RRF shape is searchKnowledge's (lib/knowledge.js),
// the embeddings come from rag/lib/embed.mjs (Azure-pinned, zero-retention),
// and the canonical form is lib/routing/normalise.mjs. This module imports
// relatively rather than through `@/` so the seed and stats scripts can run it
// under plain node.
import crypto from 'node:crypto';
import { ensureRoutingSchema, getSql } from '../db.js';
import { embedOne, embedTexts } from '../../rag/lib/embed.mjs';
import { normaliseQuestion } from './normalise.mjs';

export const VECTOR_DIM = 1536;
export const TARGET_KINDS = ['note', 'template'];
export const TRIGGER_SOURCES = ['generated', 'tap'];
// Enough to say something; short enough to be a phrasing rather than a page.
export const MIN_PHRASE_CHARS = 3;
export const MAX_PHRASE_CHARS = 160;
export const MAX_PHRASES_PER_TARGET = 20;

/** The same literal form lib/knowledge.js uses, so pgvector reads it. */
export function vectorLiteral(vec) {
  if (!Array.isArray(vec) || vec.length !== VECTOR_DIM) return null;
  return '[' + vec.map((n) => Number(n) || 0).join(',') + ']';
}

export const contentHash = (text) => crypto.createHash('sha256').update(String(text || '')).digest('hex');

export function triggerId(targetKind, targetRef, phraseNorm) {
  return crypto.createHash('sha256').update(`${targetKind}\n${targetRef}\n${phraseNorm}`).digest('hex').slice(0, 40);
}

/**
 * Tidy a list of phrasings: trimmed, de-duplicated on their canonical form,
 * nothing too short to mean anything or too long to be a phrase.
 */
export function cleanPhrases(list = []) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const phrase = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!phrase || phrase.length > MAX_PHRASE_CHARS) continue;
    const norm = normaliseQuestion(phrase);
    if (norm.length < MIN_PHRASE_CHARS || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ phrase, norm });
    if (out.length >= MAX_PHRASES_PER_TARGET) break;
  }
  return out;
}

/** The content hash each target's generated triggers were made from. */
export async function generatedHashes() {
  await ensureRoutingSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT target_kind AS "targetKind", target_ref AS "targetRef", max(source_hash) AS "sourceHash"
    FROM routing_triggers WHERE source = 'generated'
    GROUP BY target_kind, target_ref
  `;
  return new Map(rows.map((r) => [`${r.targetKind}:${r.targetRef}`, r.sourceHash]));
}

/**
 * Replace a target's generated triggers with a fresh list. Tap-learned rows
 * are untouched; a generated phrase that collides with one is simply not
 * inserted (the tap row already says it, in a person's words). Embeddings are
 * filled later in batches — see fillMissingTriggerEmbeddings.
 */
export async function replaceGeneratedTriggers({ targetKind, targetRef, sourceHash = '', phrases = [] }) {
  if (!TARGET_KINDS.includes(targetKind) || !targetRef) throw new Error('replaceGeneratedTriggers: bad target');
  await ensureRoutingSchema();
  const sql = getSql();
  const clean = cleanPhrases(phrases);
  await sql`DELETE FROM routing_triggers WHERE target_kind = ${targetKind} AND target_ref = ${targetRef} AND source = 'generated'`;
  let inserted = 0;
  for (const { phrase, norm } of clean) {
    const rows = await sql`
      INSERT INTO routing_triggers (id, target_kind, target_ref, phrase, phrase_norm, source, source_hash)
      VALUES (${triggerId(targetKind, targetRef, norm)}, ${targetKind}, ${targetRef}, ${phrase}, ${norm}, 'generated', ${sourceHash})
      ON CONFLICT (target_kind, target_ref, phrase_norm) DO NOTHING
      RETURNING id
    `;
    inserted += rows.length;
  }
  return { inserted, kept: clean.length };
}

/**
 * Learn one real phrasing from a tap. Embedded straight away, best-effort: the
 * row is useful to the lexical arm the moment it exists, and the vector arm
 * picks it up on the next batch fill if the embedding call fails here.
 */
export async function addTapTrigger({ targetKind = 'note', targetRef, phrase }) {
  if (!TARGET_KINDS.includes(targetKind) || !targetRef) return null;
  const [clean] = cleanPhrases([phrase]);
  if (!clean) return null;
  await ensureRoutingSchema();
  const sql = getSql();
  const id = triggerId(targetKind, targetRef, clean.norm);
  await sql`
    INSERT INTO routing_triggers (id, target_kind, target_ref, phrase, phrase_norm, source, source_hash)
    VALUES (${id}, ${targetKind}, ${targetRef}, ${clean.phrase}, ${clean.norm}, 'tap', '')
    ON CONFLICT (target_kind, target_ref, phrase_norm) DO UPDATE SET source = 'tap'
  `;
  try {
    const vec = vectorLiteral(await embedOne(clean.phrase));
    if (vec) await sql`UPDATE routing_triggers SET embedding = ${vec}::vector WHERE id = ${id} AND embedding IS NULL`;
  } catch (e) {
    console.warn('[routing] could not embed a tap phrase:', String(e).slice(0, 160));
  }
  return id;
}

/** Fill NULL embeddings in batches. Returns how many rows were filled. */
export async function fillMissingTriggerEmbeddings({ limit = 512 } = {}) {
  await ensureRoutingSchema();
  const sql = getSql();
  const missing = await sql`SELECT id, phrase FROM routing_triggers WHERE embedding IS NULL ORDER BY created_at LIMIT ${Math.max(1, Math.min(2000, limit))}`;
  if (!missing.length) return 0;
  const vectors = await embedTexts(missing.map((r) => r.phrase));
  if (vectors.length !== missing.length) throw new Error(`Embedding model returned ${vectors.length} vectors for ${missing.length} phrases.`);
  const updates = missing
    .map((r, i) => ({ id: r.id, embedding: vectorLiteral(vectors[i]) || '' }))
    .filter((u) => u.embedding);
  if (!updates.length) throw new Error('Embedding model returned no usable vectors.');
  await sql`
    WITH embedding_input AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS x(id text, embedding text)
    )
    UPDATE routing_triggers t SET embedding = i.embedding::vector
    FROM embedding_input i WHERE t.id = i.id AND t.embedding IS NULL
  `;
  return updates.length;
}

/** Rung 1: every trigger whose canonical form IS the question's. */
export async function exactTriggers(phraseNorm) {
  const norm = String(phraseNorm || '').trim();
  if (!norm) return [];
  await ensureRoutingSchema();
  const sql = getSql();
  return sql`
    SELECT target_kind AS "targetKind", target_ref AS "targetRef", phrase, source
    FROM routing_triggers WHERE phrase_norm = ${norm} LIMIT 5
  `;
}

/**
 * Rungs 2 and 3: the lexical arm over the phrases' tsvector and the vector arm
 * over their embeddings, each ranked, joined so a phrase found by both carries
 * both ranks. Fusion is left to fuseCandidates (./decision.mjs) so it can be
 * tested. Without a query vector only the lexical arm runs, and every row
 * comes back with no similarity — which the decision reads as no confidence,
 * so a lexical-only search can never render a page on its own.
 */
export async function searchTriggers(question, { vector = null, limit = 30 } = {}) {
  const q = String(question || '').trim();
  if (!q) return [];
  await ensureRoutingSchema();
  const sql = getSql();
  const top = Math.max(1, Math.min(60, limit));
  if (vector) {
    return sql`
      WITH lexical AS (
        SELECT id, row_number() OVER (ORDER BY ts_rank_cd(search_doc, websearch_to_tsquery('english', ${q})) DESC) AS rank
        FROM routing_triggers
        WHERE search_doc @@ websearch_to_tsquery('english', ${q})
        LIMIT ${top}
      ), semantic AS (
        SELECT id, 1 - (embedding <=> ${vector}::vector) AS similarity,
               row_number() OVER (ORDER BY embedding <=> ${vector}::vector) AS rank
        FROM routing_triggers
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${vector}::vector LIMIT ${top}
      ), candidates AS (
        SELECT id FROM lexical UNION SELECT id FROM semantic
      )
      SELECT t.target_kind AS "targetKind", t.target_ref AS "targetRef", t.phrase, t.source,
             l.rank AS "lexicalRank", s.rank AS "semanticRank", s.similarity
      FROM candidates c
      JOIN routing_triggers t ON t.id = c.id
      LEFT JOIN lexical l ON l.id = t.id
      LEFT JOIN semantic s ON s.id = t.id
    `;
  }
  return sql`
    SELECT t.target_kind AS "targetKind", t.target_ref AS "targetRef", t.phrase, t.source,
           row_number() OVER (ORDER BY ts_rank_cd(search_doc, websearch_to_tsquery('english', ${q})) DESC) AS "lexicalRank",
           NULL::int AS "semanticRank", NULL::real AS similarity
    FROM routing_triggers t
    WHERE search_doc @@ websearch_to_tsquery('english', ${q})
    LIMIT ${top}
  `;
}

/**
 * One row per routed turn, so the fall-through rate can be read back. Best
 * effort and never awaited in the request path.
 */
export async function recordRoutingDecision({ turnId = '', decision, confidence = 0, margin = 0, targetKind = '', targetRef = '' }) {
  try {
    await ensureRoutingSchema();
    const sql = getSql();
    await sql`
      INSERT INTO routing_decisions (turn_id, decision, confidence, margin, target_kind, target_ref)
      VALUES (${String(turnId).slice(0, 40)}, ${String(decision).slice(0, 20)}, ${Number(confidence) || 0}, ${Number(margin) || 0}, ${targetKind}, ${targetRef})
    `;
  } catch (e) {
    console.warn('[routing] could not record a decision:', String(e).slice(0, 160));
  }
}

/** Coverage and outcome counts for `npm run routing:stats`. */
export async function routingStats({ days = 30 } = {}) {
  await ensureRoutingSchema();
  const sql = getSql();
  const [triggers] = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE source = 'generated')::int AS generated,
           count(*) FILTER (WHERE source = 'tap')::int AS tap,
           count(*) FILTER (WHERE embedding IS NULL)::int AS unembedded,
           count(DISTINCT (target_kind, target_ref))::int AS targets
    FROM routing_triggers
  `;
  const decisions = await sql`
    SELECT decision, count(*)::int AS n
    FROM routing_decisions WHERE at > now() - make_interval(days => ${Math.max(1, days)})
    GROUP BY decision
  `;
  const byDecision = Object.fromEntries(decisions.map((r) => [r.decision, r.n]));
  const total = decisions.reduce((n, r) => n + r.n, 0);
  return { triggers, decisions: { ...byDecision, total, days } };
}