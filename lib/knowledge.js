// Unified knowledge repository. Every source type is stored as an entry with
// searchable passages; the assistant never needs to know whether a result began
// life as a policy file, Notebook page or contact record.
import crypto from 'node:crypto';
import { ensureKnowledgeSchema, getSql } from './db';
import { embedOne, embedTexts } from '@/rag/lib/embed.mjs';
import { cosine } from '@/rag/lib/similarity.mjs';
import { chunkText } from './text-chunk.mjs';

const VECTOR_DIM = 1536;
const KIND_AUTHORITY = { note: 90, contact: 85, document: 70 };

function cleanIdPart(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

export function knowledgeId(kind, sourceRef, title = '') {
  const stem = cleanIdPart(sourceRef || title) || 'item';
  const suffix = crypto.createHash('sha1').update(String(sourceRef || title)).digest('hex').slice(0, 10);
  return `${kind}:${stem}:${suffix}`;
}

function hashOf(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function vectorLiteral(vec) {
  if (!Array.isArray(vec) || vec.length !== VECTOR_DIM) return null;
  return '[' + vec.map((n) => Number(n) || 0).join(',') + ']';
}

function normalisePassages(content, passages) {
  const supplied = Array.isArray(passages) && passages.length ? passages : chunkText(content || '').map((text) => ({ text }));
  return supplied
    .map((p, ordinal) => ({
      ordinal,
      heading: String(p.heading || p.section || '').trim(),
      content: String(p.text || p.content || '').trim(),
      location: p.location || p.view || {},
      embedding: Array.isArray(p.embedding) ? p.embedding : null,
    }))
    .filter((p) => p.content);
}

export async function upsertKnowledgeEntry(input, { embed = true, skipUnchanged = false } = {}) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const kind = ['document', 'note', 'contact'].includes(input.kind) ? input.kind : 'note';
  const title = String(input.title || 'Untitled').trim().slice(0, 500);
  const content = String(input.content || '');
  const sourceRef = String(input.sourceRef || '');
  const id = String(input.id || knowledgeId(kind, sourceRef, title));
  const authority = Math.max(0, Math.min(100, Number(input.authority ?? KIND_AUTHORITY[kind]) || 50));
  const status = ['active', 'draft', 'archived'].includes(input.status) ? input.status : 'active';
  const data = input.data && typeof input.data === 'object' ? input.data : {};
  const passages = normalisePassages(content, input.passages);
  const contentHash = hashOf(title + '\n' + content + '\n' + JSON.stringify(data));

  if (skipUnchanged) {
    const existing = await sql`
      SELECT e.content_hash AS hash, count(p.id)::int AS passages
      FROM knowledge_entries e LEFT JOIN knowledge_passages p ON p.entry_id = e.id
      WHERE e.id = ${id} GROUP BY e.id
    `;
    if (existing[0]?.hash === contentHash && existing[0]?.passages === passages.length) {
      return { id, kind, title, content, data, sourceRef, authority, status, passages: passages.length, unchanged: true };
    }
  }

  const missing = passages.filter((p) => !p.embedding);
  if (embed && missing.length) {
    const vectors = await embedTexts(missing.map((p) => `${title}\n${p.heading}\n${p.content}`));
    missing.forEach((p, i) => { p.embedding = vectors[i] || null; });
  }

  await sql`
    INSERT INTO knowledge_entries (id, kind, title, content, data, source_ref, authority, status, content_hash, updated_at)
    VALUES (${id}, ${kind}, ${title}, ${content}, ${JSON.stringify(data)}::jsonb, ${sourceRef}, ${authority}, ${status}, ${contentHash}, now())
    ON CONFLICT (id) DO UPDATE SET
      kind = EXCLUDED.kind, title = EXCLUDED.title, content = EXCLUDED.content,
      data = EXCLUDED.data, source_ref = EXCLUDED.source_ref,
      authority = EXCLUDED.authority, status = EXCLUDED.status,
      content_hash = EXCLUDED.content_hash, claims_stale = true, updated_at = now()
  `;
  await sql`DELETE FROM knowledge_passages WHERE entry_id = ${id}`;
  for (const p of passages) {
    const pid = `${id}:p${p.ordinal}`;
    const vec = vectorLiteral(p.embedding);
    if (vec) {
      await sql`
        INSERT INTO knowledge_passages (id, entry_id, ordinal, heading, content, embedding, location)
        VALUES (${pid}, ${id}, ${p.ordinal}, ${p.heading}, ${p.content}, ${vec}::vector, ${JSON.stringify(p.location)}::jsonb)
      `;
    } else {
      await sql`
        INSERT INTO knowledge_passages (id, entry_id, ordinal, heading, content, location)
        VALUES (${pid}, ${id}, ${p.ordinal}, ${p.heading}, ${p.content}, ${JSON.stringify(p.location)}::jsonb)
      `;
    }
  }
  return { id, kind, title, content, data, sourceRef, authority, status, passages: passages.length };
}

// Hybrid retrieval combines indexed semantic and lexical candidate sets, then
// applies authority as a small tie-breaker. If pgvector cannot embed the query,
// full-text search remains available rather than failing the assistant.
export async function searchKnowledge(query, limit = 8, { kind = '' } = {}) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const q = String(query || '').trim();
  const filterKind = ['document', 'note', 'contact'].includes(kind) ? kind : '';
  if (!q) return [];
  let qv = null;
  try { qv = vectorLiteral(await embedOne(q)); } catch (e) { qv = null; }

  let rows;
  if (qv) {
    rows = await sql`
      WITH lexical AS (
        SELECT p.id, ts_rank_cd(p.search_doc, websearch_to_tsquery('english', ${q})) AS lexical
        FROM knowledge_passages p
        JOIN knowledge_entries e ON e.id = p.entry_id
        WHERE e.status = 'active' AND (${filterKind} = '' OR e.kind = ${filterKind}) AND p.search_doc @@ websearch_to_tsquery('english', ${q})
        ORDER BY lexical DESC LIMIT 30
      ), semantic AS (
        SELECT p.id, 1 - (p.embedding <=> ${qv}::vector) AS semantic
        FROM knowledge_passages p
        JOIN knowledge_entries e ON e.id = p.entry_id
        WHERE e.status = 'active' AND (${filterKind} = '' OR e.kind = ${filterKind}) AND p.embedding IS NOT NULL
        ORDER BY p.embedding <=> ${qv}::vector LIMIT 30
      ), candidates AS (
        SELECT id FROM lexical UNION SELECT id FROM semantic
      )
      SELECT p.id, p.entry_id AS "entryId", p.heading, p.content, p.location,
             e.kind, e.title, e.data, e.source_ref AS "sourceRef", e.authority,
             coalesce(l.lexical, 0) AS lexical, coalesce(s.semantic, 0) AS semantic,
             (0.68 * coalesce(s.semantic, 0) + 0.27 * least(coalesce(l.lexical, 0), 1) + 0.05 * e.authority / 100.0) AS score
      FROM candidates c
      JOIN knowledge_passages p ON p.id = c.id
      JOIN knowledge_entries e ON e.id = p.entry_id
      LEFT JOIN lexical l ON l.id = p.id
      LEFT JOIN semantic s ON s.id = p.id
      ORDER BY score DESC LIMIT ${Math.max(1, Math.min(30, limit))}
    `;
  } else {
    rows = await sql`
      SELECT p.id, p.entry_id AS "entryId", p.heading, p.content, p.location,
             e.kind, e.title, e.data, e.source_ref AS "sourceRef", e.authority,
             ts_rank_cd(p.search_doc, websearch_to_tsquery('english', ${q})) AS score
      FROM knowledge_passages p JOIN knowledge_entries e ON e.id = p.entry_id
      WHERE e.status = 'active' AND (${filterKind} = '' OR e.kind = ${filterKind}) AND p.search_doc @@ websearch_to_tsquery('english', ${q})
      ORDER BY score DESC LIMIT ${Math.max(1, Math.min(30, limit))}
    `;
  }
  return rows;
}

export async function listKnowledge({ kind = '', query = '', status = 'active', limit = 200 } = {}) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const k = ['document', 'note', 'contact'].includes(kind) ? kind : '';
  const s = ['active', 'draft', 'archived'].includes(status) ? status : 'active';
  const q = String(query || '').trim();
  return sql`
    SELECT e.id, e.kind, e.title, e.content, e.data, e.source_ref AS "sourceRef",
           e.authority, e.status, e.updated_at AS "updatedAt",
           count(p.id)::int AS passages
    FROM knowledge_entries e LEFT JOIN knowledge_passages p ON p.entry_id = e.id
    WHERE e.status = ${s} AND (${k} = '' OR e.kind = ${k})
      AND (${q} = '' OR e.title ILIKE ${'%' + q + '%'} OR e.content ILIKE ${'%' + q + '%'})
    GROUP BY e.id ORDER BY e.updated_at DESC LIMIT ${Math.max(1, Math.min(1000, limit))}
  `;
}

export async function archiveKnowledgeEntry(id) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  await sql`UPDATE knowledge_entries SET status = 'archived', updated_at = now() WHERE id = ${String(id)}`;
}

export async function knowledgeCatalogText() {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT kind, title, data->>'summary' AS summary
    FROM knowledge_entries WHERE status = 'active'
    ORDER BY authority DESC, title ASC LIMIT 1000
  `;
  return rows.map((r) => `- [${r.kind}] ${r.title}${r.summary ? ': ' + r.summary : ''}`).join('\n');
}

export async function knowledgePassagesByTitles(titles) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const wanted = Array.isArray(titles) ? titles.filter(Boolean) : [];
  if (!wanted.length) return [];
  return sql`
    SELECT p.id, p.entry_id AS "entryId", p.heading, p.content, p.location,
           e.kind, e.title, e.data, e.source_ref AS "sourceRef", e.authority, 1.0 AS score
    FROM knowledge_entries e JOIN knowledge_passages p ON p.entry_id = e.id
    WHERE e.status = 'active' AND e.title = ANY(${wanted})
    ORDER BY e.authority DESC, p.ordinal ASC
  `;
}

export async function replaceClaims(entryId, claims) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  await sql`DELETE FROM knowledge_claims WHERE entry_id = ${entryId}`;
  for (const claim of Array.isArray(claims) ? claims.slice(0, 100) : []) {
    const subject = String(claim.subject || '').trim();
    const predicate = String(claim.predicate || '').trim();
    const value = String(claim.value || '').trim();
    if (!subject || !predicate || !value) continue;
    const key = cleanIdPart(subject) + '|' + cleanIdPart(predicate);
    await sql`
      INSERT INTO knowledge_claims (entry_id, subject, predicate, value, normalized_key, quote, confidence)
      VALUES (${entryId}, ${subject}, ${predicate}, ${value}, ${key}, ${String(claim.quote || '')}, ${Number(claim.confidence) || 0.8})
    `;
  }
  await refreshConflicts();
  await sql`UPDATE knowledge_entries SET claims_stale = false WHERE id = ${entryId}`;
}

export async function refreshConflicts() {
  await ensureKnowledgeSchema();
  const sql = getSql();
  // Claims inside one source often describe complementary steps/options. They
  // cannot establish a source-to-source contradiction and are removed from old
  // scans before comparing independent entries.
  const genericPredicates = ['will ensure', 'must have processes in place to', 'must', 'should', 'is', 'has', 'procedure step', 'routing procedure step'];
  await sql`
    DELETE FROM knowledge_conflicts c USING knowledge_claims a, knowledge_claims b
    WHERE c.claim_a = a.id AND c.claim_b = b.id
      AND (a.entry_id = b.entry_id OR lower(trim(a.value)) = lower(trim(b.value))
        OR lower(trim(a.predicate)) = ANY(${genericPredicates}))
  `;
  await sql`
    INSERT INTO knowledge_conflicts (normalized_key, claim_a, claim_b, reason)
    SELECT a.normalized_key, least(a.id, b.id), greatest(a.id, b.id),
           'Two active sources make different claims about the same subject.'
    FROM knowledge_claims a
    JOIN knowledge_claims b ON b.normalized_key = a.normalized_key AND b.id > a.id
    JOIN knowledge_entries ea ON ea.id = a.entry_id AND ea.status = 'active'
    JOIN knowledge_entries eb ON eb.id = b.entry_id AND eb.status = 'active'
    WHERE a.entry_id <> b.entry_id AND lower(trim(a.value)) <> lower(trim(b.value))
      AND NOT (lower(trim(a.predicate)) = ANY(${genericPredicates}))
    ON CONFLICT (claim_a, claim_b) DO NOTHING
  `;
}

export async function listConflicts(status = 'open') {
  await ensureKnowledgeSchema();
  const sql = getSql();
  return sql`
    SELECT c.id, c.normalized_key AS "normalizedKey", c.reason, c.status, c.resolution,
      a.subject, a.predicate, a.value AS "valueA", a.quote AS "quoteA", ea.id AS "entryA", ea.title AS "titleA", ea.authority AS "authorityA",
      b.value AS "valueB", b.quote AS "quoteB", eb.id AS "entryB", eb.title AS "titleB", eb.authority AS "authorityB",
      c.created_at AS "createdAt"
    FROM knowledge_conflicts c
    JOIN knowledge_claims a ON a.id = c.claim_a JOIN knowledge_entries ea ON ea.id = a.entry_id
    JOIN knowledge_claims b ON b.id = c.claim_b JOIN knowledge_entries eb ON eb.id = b.entry_id
    WHERE c.status = ${status}
    ORDER BY greatest(ea.authority, eb.authority) DESC, c.created_at DESC
  `;
}

export async function conflictsForEntries(entryIds) {
  await ensureKnowledgeSchema();
  const ids = Array.isArray(entryIds) ? [...new Set(entryIds.filter(Boolean))] : [];
  if (!ids.length) return [];
  const sql = getSql();
  return sql`
    SELECT c.id, a.subject, a.predicate, a.value AS "valueA", ea.title AS "titleA",
           b.value AS "valueB", eb.title AS "titleB"
    FROM knowledge_conflicts c
    JOIN knowledge_claims a ON a.id = c.claim_a JOIN knowledge_entries ea ON ea.id = a.entry_id
    JOIN knowledge_claims b ON b.id = c.claim_b JOIN knowledge_entries eb ON eb.id = b.entry_id
    WHERE c.status = 'open' AND (a.entry_id = ANY(${ids}) OR b.entry_id = ANY(${ids}))
    ORDER BY c.created_at DESC LIMIT 20
  `;
}

export async function resolveConflict(id, status, resolution = '') {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const s = ['resolved', 'ignored', 'open'].includes(status) ? status : 'resolved';
  await sql`
    UPDATE knowledge_conflicts SET status = ${s}, resolution = ${String(resolution || '')},
      resolved_at = CASE WHEN ${s} = 'open' THEN NULL ELSE now() END
    WHERE id = ${parseInt(id, 10)}
  `;
}

export async function unifiedContacts(query, limit = 5) {
  const hits = (await searchKnowledge(query, limit, { kind: 'contact' })).slice(0, limit);
  return hits.map((r) => ({ label: r.title, phones: r.data?.phones || [], emails: r.data?.emails || [] }));
}

export async function unifiedTelephoneSet() {
  const rows = await listKnowledge({ kind: 'contact', limit: 1000 });
  const out = new Set();
  for (const row of rows) for (const p of (row.data?.phones || [])) {
    const digits = String(p.tel || p.display || '').replace(/\D/g, '');
    if (digits.length >= 9) out.add(digits);
  }
  return out;
}

// Used only as a compatibility fallback while a deployment is being migrated.
export function rankPassagesLocally(rows, vector, limit = 8) {
  return rows.map((r) => ({ ...r, score: cosine(vector, r.embedding) })).sort((a, b) => b.score - a.score).slice(0, limit);
}
