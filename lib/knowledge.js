// Canonical knowledge repository. Documents, Notebook pages and contacts share
// storage and conflict-review machinery, but their live context paths are kept
// deliberately separate: document RAG, full Notebook context and contact RAG.
import crypto from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { ensureKnowledgeSchema, getSql } from './db';
import { embedOne, embedTexts } from '@/rag/lib/embed.mjs';
import { cosine } from '@/rag/lib/similarity.mjs';
import { chunkText } from './text-chunk.mjs';
import { CLAIM_SCHEMA_VERSION, classifyClaimPairs, extractPassageClaimGroups } from './ai/claims';
import { contactHitsToCards } from './knowledge-context.mjs';
import { getAiModel } from './settings.js';

const VECTOR_DIM = 1536;
const KIND_AUTHORITY = { note: 90, contact: 85, document: 70 };
const queryVectorCache = new Map();
const analysisTimers = new Map();
let backgroundWorkerTimer = null;

async function queryVector(text) {
  if (queryVectorCache.has(text)) return queryVectorCache.get(text);
  const pending = embedOne(text).then((value) => {
    if (!value) queryVectorCache.delete(text);
    return value;
  }).catch(() => { queryVectorCache.delete(text); return null; });
  queryVectorCache.set(text, pending);
  if (queryVectorCache.size > 200) queryVectorCache.delete(queryVectorCache.keys().next().value);
  return pending;
}

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

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value ?? null);
}

function vectorLiteral(vec) {
  if (!Array.isArray(vec) || vec.length !== VECTOR_DIM) return null;
  return '[' + vec.map((n) => Number(n) || 0).join(',') + ']';
}

function vectorFromText(raw) {
  if (!raw) return null;
  try { const value = JSON.parse(String(raw)); return Array.isArray(value) && value.length === VECTOR_DIM ? value : null; }
  catch (e) { return null; }
}

function normalisePassages(content, passages) {
  const supplied = Array.isArray(passages) && passages.length ? passages : chunkText(content || '').map((text) => ({ text }));
  // Drop empty passages BEFORE numbering, so ordinals stay contiguous (0..n-1).
  // The upsert treats ordinals as contiguous (it deletes ordinal >= length and
  // matches old rows by ordinal); a gap left by a pre-filter index would delete a
  // real passage and skip re-inserting it, silently losing searchable content.
  return supplied
    .map((p) => ({
      heading: String(p.heading || p.section || '').trim(),
      content: String(p.text || p.content || '').trim(),
      location: p.location || p.view || {},
      embedding: Array.isArray(p.embedding) ? p.embedding : null,
    }))
    .filter((p) => p.content)
    .map((p, ordinal) => ({ ordinal, ...p }));
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
  // Parent ids, attachment locations and other metadata do not change what a
  // note asserts. Contact structured data does, so include it in that kind's
  // analysis hash. This prevents moves/image edits from retriggering reasoning.
  const contentHash = hashOf(kind + '\n' + title + '\n' + content + (kind === 'contact' ? '\n' + stableJson(data) : ''));
  for (const p of passages) {
    p.embeddingHash = hashOf(title + '\n' + p.heading + '\n' + p.content);
    p.recordHash = hashOf(p.embeddingHash + '\n' + JSON.stringify(p.location));
  }

  const oldEntries = await sql`
    SELECT title,data,content_hash AS hash,source_ref AS "sourceRef",authority,status,claims_stale AS "claimsStale"
    FROM knowledge_entries WHERE id = ${id}
  `;
  const oldEntry = oldEntries[0] || null;
  const oldPassages = oldEntry ? await sql`
    SELECT ordinal, heading, content, content_hash AS hash, embedding::text AS embedding, location
    FROM knowledge_passages WHERE entry_id = ${id} ORDER BY ordinal
  ` : [];
  const passagesSame = oldPassages.length === passages.length
    && passages.every((p, i) => oldPassages[i] && oldPassages[i].hash === p.recordHash);
  const metadataSame = oldEntry && oldEntry.hash === contentHash && oldEntry.sourceRef === sourceRef
    && Number(oldEntry.authority) === authority && oldEntry.status === status
    && stableJson(oldEntry.data || {}) === stableJson(data);
  if (metadataSame && passagesSame) {
    return { id, kind, title, content, data, sourceRef, authority, status, contentHash, passages: passages.length, unchanged: true, claimsStale: !!oldEntry.claimsStale };
  }

  // Reuse vectors for unchanged semantic passage text, even if its ordinal or
  // image/location metadata moved. Only genuinely new text is embedded.
  const oldVectors = new Map();
  for (const p of oldPassages) oldVectors.set(hashOf(oldEntry.title + '\n' + p.heading + '\n' + p.content), vectorFromText(p.embedding));
  for (const p of passages) if (!p.embedding && oldVectors.has(p.embeddingHash)) p.embedding = oldVectors.get(p.embeddingHash);

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
      content_hash = EXCLUDED.content_hash,
      claims_stale = knowledge_entries.claims_stale OR knowledge_entries.content_hash <> EXCLUDED.content_hash,
      updated_at = now()
  `;
  await sql`DELETE FROM knowledge_passages WHERE entry_id = ${id} AND ordinal >= ${passages.length}`;
  const changedPassages = [];
  for (const p of passages) {
    const old = oldPassages.find((x) => x.ordinal === p.ordinal);
    if (old?.hash === p.recordHash) continue;
    changedPassages.push({
      id: `${id}:p${p.ordinal}`, ordinal: p.ordinal, heading: p.heading,
      content: p.content, contentHash: p.recordHash,
      embedding: vectorLiteral(p.embedding) || '', location: p.location,
    });
  }
  if (changedPassages.length) {
    await sql`
      WITH passage_input AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(changedPassages)}::jsonb) AS x(
          id text,ordinal integer,heading text,content text,"contentHash" text,embedding text,location jsonb
        )
      )
      INSERT INTO knowledge_passages(id,entry_id,ordinal,heading,content,content_hash,embedding,location)
      SELECT p.id,${id},p.ordinal,p.heading,p.content,p."contentHash",NULLIF(p.embedding,'')::vector,p.location
      FROM passage_input p
      ON CONFLICT(id) DO UPDATE SET ordinal=EXCLUDED.ordinal,heading=EXCLUDED.heading,
        content=EXCLUDED.content,content_hash=EXCLUDED.content_hash,
        embedding=EXCLUDED.embedding,location=EXCLUDED.location
    `;
  }
  return { id, kind, title, content, data, sourceRef, authority, status, contentHash,
    passages: passages.length, unchanged: false, claimsChanged: !oldEntry || oldEntry.hash !== contentHash,
    claimsStale: !!oldEntry?.claimsStale };
}

export async function enqueueKnowledgeAnalysis(entryId, targetHash, delayMs = 2000) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  // delayMs is in milliseconds; clamp to a 60-SECOND ceiling in the same unit
  // before converting. Clamping to 60 first collapsed every debounce (250-2000 ms)
  // to 0.06 s, so the durable queue never actually coalesced rapid autosaves.
  const seconds = Math.max(0, Math.min(60000, Number(delayMs) || 0)) / 1000;
  await sql`
    INSERT INTO knowledge_analysis_jobs(entry_id,target_hash,available_at,attempts,last_error,locked_until,lease_token,updated_at)
    VALUES(${entryId},${targetHash},now()+(${seconds} * interval '1 second'),0,'',NULL,'',now())
    ON CONFLICT(entry_id) DO UPDATE SET target_hash=EXCLUDED.target_hash,
      available_at=EXCLUDED.available_at,attempts=0,last_error='',
      locked_until=CASE WHEN knowledge_analysis_jobs.locked_until>now() THEN knowledge_analysis_jobs.locked_until ELSE NULL END,
      lease_token=CASE WHEN knowledge_analysis_jobs.locked_until>now() THEN knowledge_analysis_jobs.lease_token ELSE '' END,
      updated_at=now()
  `;
  // On a long-lived Node process, process the coalesced note after its quiet
  // period. The durable row remains the fallback for serverless freezes/crashes
  // and later reconciliation passes.
  if (String(entryId).startsWith('note:') && delayMs > 0) {
    const previous = analysisTimers.get(entryId);
    if (previous) { clearTimeout(previous.timer); previous.resolve(); }
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });
    const timer = setTimeout(() => {
      analysisTimers.delete(entryId);
      Promise.resolve(drainKnowledgeAnalysisJobs({ entryIds: [entryId], limit: 1, force: true }))
        .catch(() => {}).finally(resolveDone);
    }, Math.max(250, delayMs));
    if (timer.unref) timer.unref();
    analysisTimers.set(entryId, { timer, resolve: resolveDone });
    if (process.env.VERCEL) {
      try { waitUntil(done); } catch (e) { /* long-lived fallback uses the timer */ }
    }
  }
}

async function fillMissingKnowledgeEmbeddings(entry) {
  // Notebook pages are supplied whole, and documents are now chosen and opened
  // by the assistant rather than retrieved by vector, so neither is embedded.
  // Contacts remain a hybrid corpus: a caller asking for "the district nurses"
  // has no title to pick from, so wording still has to be matched semantically.
  if (!entry?.id || entry.kind === 'note' || entry.kind === 'document') return;
  const sql = getSql();
  const missing = await sql`
    SELECT p.id,p.heading,p.content,p.content_hash AS "contentHash"
    FROM knowledge_passages p JOIN knowledge_entries e ON e.id=p.entry_id
    WHERE p.entry_id=${entry.id} AND p.embedding IS NULL
      AND e.status='active' AND e.content_hash=${entry.contentHash}
    ORDER BY p.ordinal
  `;
  if (!missing.length) return;
  const vectors = await embedTexts(missing.map((p) => `${entry.title}\n${p.heading}\n${p.content}`));
  const updates = missing.map((p, index) => ({
    id: p.id, contentHash: p.contentHash, embedding: vectorLiteral(vectors[index]) || '',
  })).filter((item) => item.embedding);
  if (!updates.length) throw new Error('Embedding model returned no usable vectors.');
  await sql`
    WITH embedding_input AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb)
        AS x(id text,"contentHash" text,embedding text)
    )
    UPDATE knowledge_passages p SET embedding=i.embedding::vector
    FROM embedding_input i
    WHERE p.id=i.id AND p.content_hash=i."contentHash" AND p.embedding IS NULL
  `;
}

// Efficiently backfill one RAG corpus in batches. This is primarily used when
// upgrading the existing contact directory from lexical-only rows to hybrid
// lexical + semantic retrieval without rewriting any contact data.
export async function fillMissingKnowledgeEmbeddingsByKind(kind) {
  const targetKind = kind === 'contact' ? kind : '';
  if (!targetKind) return 0;
  await ensureKnowledgeSchema();
  const sql = getSql();
  const missing = await sql`
    SELECT p.id,p.heading,p.content,p.content_hash AS "contentHash",e.title
    FROM knowledge_passages p JOIN knowledge_entries e ON e.id=p.entry_id
    WHERE e.kind=${targetKind} AND e.status='active' AND p.embedding IS NULL
    ORDER BY e.id,p.ordinal
  `;
  if (!missing.length) return 0;
  const vectors = await embedTexts(missing.map((p) => `${p.title}\n${p.heading}\n${p.content}`));
  if (vectors.length !== missing.length) {
    throw new Error(`Embedding model returned ${vectors.length} vectors for ${missing.length} ${targetKind} passages.`);
  }
  const updates = missing.map((p, index) => ({
    id: p.id, contentHash: p.contentHash, embedding: vectorLiteral(vectors[index]) || '',
  })).filter((item) => item.embedding);
  if (!updates.length) throw new Error(`Embedding model returned no usable ${targetKind} vectors.`);
  await sql`
    WITH embedding_input AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb)
        AS x(id text,"contentHash" text,embedding text)
    )
    UPDATE knowledge_passages p SET embedding=i.embedding::vector
    FROM embedding_input i
    WHERE p.id=i.id AND p.content_hash=i."contentHash" AND p.embedding IS NULL
  `;
  return updates.length;
}

export async function syncKnowledgeClaims(entryOrId, { refresh = true } = {}) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const entry = typeof entryOrId === 'string'
    ? (await sql`SELECT id,kind,title,content,data,source_ref AS "sourceRef",content_hash AS "contentHash" FROM knowledge_entries WHERE id=${entryOrId} AND status='active'`)[0]
    : entryOrId;
  if (!entry?.id) return { ok: false, error: 'Knowledge entry not found.' };
  const metadata = (!entry.contentHash || !entry.sourceRef)
    ? (await sql`SELECT content_hash AS "contentHash",source_ref AS "sourceRef" FROM knowledge_entries WHERE id=${entry.id}`)[0]
    : null;
  const contentHash = entry.contentHash || metadata?.contentHash;
  entry.sourceRef = entry.sourceRef || metadata?.sourceRef || '';
  entry.contentHash = contentHash;
  await fillMissingKnowledgeEmbeddings(entry);
  const passages = await sql`SELECT id,heading,content,content_hash AS "contentHash" FROM knowledge_passages WHERE entry_id=${entry.id} ORDER BY ordinal`;
  const model = process.env.OPENROUTER_ANALYSIS_MODEL || await getAiModel();
  const cacheKeys = passages.map((p) => hashOf([
    CLAIM_SCHEMA_VERSION, model, p.contentHash,
    entry.kind === 'contact' ? entry.sourceRef : '',
  ].join('|')));
  const cachedRows = cacheKeys.length ? await sql`SELECT content_hash AS key,claims FROM knowledge_claim_cache WHERE content_hash=ANY(${cacheKeys})` : [];
  const cachedByKey = new Map(cachedRows.map((r) => [r.key, Array.isArray(r.claims) ? r.claims : JSON.parse(r.claims || '[]')]));
  const claimGroups = new Array(passages.length);
  const missingIndexes = [];
  passages.forEach((passage, i) => {
    if (cachedByKey.has(cacheKeys[i])) claimGroups[i] = cachedByKey.get(cacheKeys[i]);
    else missingIndexes.push(i);
  });
  for (let at = 0; at < missingIndexes.length; at += 8) {
    const indexes = missingIndexes.slice(at, at + 8);
    const result = await extractPassageClaimGroups({
      title: entry.title, kind: entry.kind,
      data: { ...(entry.data || {}), sourceRef: entry.sourceRef },
      passages: indexes.map((i) => passages[i]),
    });
    if (!result.ok) throw new Error(result.error || 'Claim analysis failed.');
    for (let offset = 0; offset < indexes.length; offset++) {
      const i = indexes[offset], key = cacheKeys[i], claims = result.groups[offset] || [];
      claimGroups[i] = claims;
      await sql`
        INSERT INTO knowledge_claim_cache(content_hash,claims) VALUES(${key},${JSON.stringify(claims)}::jsonb)
        ON CONFLICT(content_hash) DO NOTHING
      `;
    }
  }
  const claims = claimGroups.flat().filter(Boolean);
  // Never apply a slow analysis result over a newer autosave.
  const latest = await sql`SELECT content_hash AS "contentHash" FROM knowledge_entries WHERE id=${entry.id}`;
  if (latest[0]?.contentHash !== contentHash) {
    await enqueueKnowledgeAnalysis(entry.id, latest[0]?.contentHash || '', 1000);
    return { ok: false, superseded: true };
  }
  const applied = await replaceClaims(entry.id, claims, contentHash, { refresh });
  if (!applied) {
    const current = await sql`SELECT content_hash AS "contentHash" FROM knowledge_entries WHERE id=${entry.id}`;
    if (current[0]) await enqueueKnowledgeAnalysis(entry.id, current[0].contentHash, 250);
    return { ok: false, superseded: true };
  }
  return { ok: true, claims: claims.length };
}

// Atomically lease coalesced jobs. A crash leaves the row available again after
// two minutes; a new save replaces the target hash and clears the lease.
export async function drainKnowledgeAnalysisJobs({ entryIds = [], limit = 2, force = false } = {}) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const ids = Array.isArray(entryIds) ? [...new Set(entryIds.filter(Boolean))] : [];
  const jobs = [];
  for (let i = 0; i < Math.max(1, Math.min(8, limit)); i++) {
    const leaseToken = crypto.randomUUID();
    let leased;
    if (ids.length) {
      leased = await sql`
        WITH candidate AS (
          SELECT entry_id FROM knowledge_analysis_jobs
          WHERE entry_id=ANY(${ids}) AND (locked_until IS NULL OR locked_until<now())
            AND (${!!force} OR available_at<=now())
          ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE knowledge_analysis_jobs j
        SET locked_until=now()+interval '2 minutes',lease_token=${leaseToken},attempts=j.attempts+1,updated_at=now()
        FROM candidate WHERE j.entry_id=candidate.entry_id
        RETURNING j.entry_id AS "entryId",j.target_hash AS "targetHash",j.attempts,j.lease_token AS "leaseToken"
      `;
    } else {
      leased = await sql`
        WITH candidate AS (
          SELECT entry_id FROM knowledge_analysis_jobs
          WHERE (locked_until IS NULL OR locked_until<now()) AND (${!!force} OR available_at<=now())
          ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE knowledge_analysis_jobs j
        SET locked_until=now()+interval '2 minutes',lease_token=${leaseToken},attempts=j.attempts+1,updated_at=now()
        FROM candidate WHERE j.entry_id=candidate.entry_id
        RETURNING j.entry_id AS "entryId",j.target_hash AS "targetHash",j.attempts,j.lease_token AS "leaseToken"
      `;
    }
    const job = leased[0];
    if (!job) break;
    jobs.push(job);
  }
  return Promise.all(jobs.map(async (job) => {
    try {
      const result = await syncKnowledgeClaims(job.entryId);
      if (result.superseded) {
        await sql`
          UPDATE knowledge_analysis_jobs SET locked_until=NULL,lease_token=''
          WHERE entry_id=${job.entryId} AND lease_token=${job.leaseToken}
        `;
      } else {
        await sql`
          DELETE FROM knowledge_analysis_jobs
          WHERE entry_id=${job.entryId} AND target_hash=${job.targetHash} AND lease_token=${job.leaseToken}
        `;
      }
      return { entryId: job.entryId, ok: true };
    } catch (e) {
      const delay = Math.min(300, 5 * Math.max(1, Number(job.attempts) || 1));
      await sql`
        UPDATE knowledge_analysis_jobs SET locked_until=NULL,lease_token='',
          last_error=CASE WHEN target_hash=${job.targetHash} THEN ${String(e).slice(0,500)} ELSE last_error END,
          available_at=CASE WHEN target_hash=${job.targetHash} THEN now()+(${delay} * interval '1 second') ELSE available_at END,
          updated_at=now()
        WHERE entry_id=${job.entryId} AND lease_token=${job.leaseToken}
      `;
      return { entryId: job.entryId, ok: false, error: String(e).slice(0,200) };
    }
  }));
}

export function kickKnowledgeAnalysisWorker(delayMs = 1000) {
  if (backgroundWorkerTimer) return;
  backgroundWorkerTimer = setTimeout(async () => {
    backgroundWorkerTimer = null;
    const result = await drainKnowledgeAnalysisJobs({ limit: 1 }).catch(() => []);
    if (result.length) kickKnowledgeAnalysisWorker(1500);
  }, Math.max(250, delayMs));
  if (backgroundWorkerTimer.unref) backgroundWorkerTimer.unref();
}

// Register a bounded queue drain with the current serverless request when one
// exists. Bulk imports/organising return promptly while the durable jobs keep
// progressing; a local Node process simply runs the same promise normally.
export function continueKnowledgeAnalysis(limit = 1) {
  const task = drainKnowledgeAnalysisJobs({ limit: Math.max(1, Math.min(2, limit)) }).catch(() => []);
  if (process.env.VERCEL) {
    try { waitUntil(task); } catch (e) { /* local Node keeps the started promise running */ }
  }
  return task;
}

// Retrieval over the stored passages. Lexical by default: the assistant reaches
// documents by choosing them from the catalogue and opening them, the way it
// chooses a Notebook page, so full-text search only has to point it at the right
// title rather than carry the whole burden of finding an answer. `semantic: true`
// adds the vector candidate set and is used for contacts, which are looked up by
// description ("the district nurses") and have no title to pick from.
export async function searchKnowledge(query, limit = 8, { kind = '', semantic = false } = {}) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const q = String(query || '').trim();
  const filterKind = ['document', 'note', 'contact', 'content'].includes(kind) ? kind : '';
  if (!q) return [];
  let qv = null;
  if (semantic) {
    try { qv = vectorLiteral(await queryVector(q)); } catch (e) { qv = null; }
  }

  let rows;
  if (qv) {
    rows = await sql`
      WITH lexical AS (
        SELECT p.id, ts_rank_cd(p.search_doc, websearch_to_tsquery('english', ${q})) AS lexical,
               row_number() OVER (ORDER BY ts_rank_cd(p.search_doc, websearch_to_tsquery('english', ${q})) DESC) AS rank
        FROM knowledge_passages p
        JOIN knowledge_entries e ON e.id = p.entry_id
        WHERE e.status = 'active' AND (${filterKind} = '' OR (${filterKind}='content' AND e.kind<>'contact') OR e.kind=${filterKind}) AND p.search_doc @@ websearch_to_tsquery('english', ${q})
        ORDER BY lexical DESC LIMIT 30
      ), semantic AS (
        SELECT p.id, 1 - (p.embedding <=> ${qv}::vector) AS semantic,
               row_number() OVER (ORDER BY p.embedding <=> ${qv}::vector) AS rank
        FROM knowledge_passages p
        JOIN knowledge_entries e ON e.id = p.entry_id
        WHERE e.status = 'active' AND (${filterKind} = '' OR (${filterKind}='content' AND e.kind<>'contact') OR e.kind=${filterKind}) AND p.embedding IS NOT NULL
        ORDER BY p.embedding <=> ${qv}::vector LIMIT 30
      ), candidates AS (
        SELECT id FROM lexical UNION SELECT id FROM semantic
      )
      SELECT p.id, p.entry_id AS "entryId", p.heading, p.content, p.location,
             e.kind, e.title, e.data, e.source_ref AS "sourceRef", e.authority,
             coalesce(l.lexical, 0) AS lexical, coalesce(s.semantic, 0) AS semantic,
             (coalesce(1.0/(60+l.rank),0) + coalesce(1.0/(60+s.rank),0) + 0.001 * e.authority / 100.0) AS score
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
      WHERE e.status = 'active' AND (${filterKind} = '' OR (${filterKind}='content' AND e.kind<>'contact') OR e.kind=${filterKind}) AND p.search_doc @@ websearch_to_tsquery('english', ${q})
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
           e.authority, e.status, e.claims_stale AS "claimsStale", e.updated_at AS "updatedAt",
           count(p.id)::int AS passages
    FROM knowledge_entries e LEFT JOIN knowledge_passages p ON p.entry_id = e.id
    WHERE e.status = ${s} AND (${k} = '' OR e.kind = ${k})
      AND (${q} = '' OR e.title ILIKE ${'%' + q + '%'} OR e.content ILIKE ${'%' + q + '%'})
    GROUP BY e.id ORDER BY e.updated_at DESC LIMIT ${Math.max(1, Math.min(1000, limit))}
  `;
}

export async function getKnowledgeEntry(id) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT e.id,e.kind,e.title,e.content,e.data,e.source_ref AS "sourceRef",
      e.authority,e.status,e.claims_stale AS "claimsStale",e.updated_at AS "updatedAt",
      count(p.id)::int AS passages
    FROM knowledge_entries e LEFT JOIN knowledge_passages p ON p.entry_id=e.id
    WHERE e.id=${String(id || '')} GROUP BY e.id
  `;
  return rows[0] || null;
}

export async function archiveKnowledgeEntry(id, { backendOverride = false } = {}) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  if (backendOverride) {
    await sql`
      UPDATE knowledge_entries SET status='archived',
        data=data || ${JSON.stringify({ backendOverride: true, correctedAt: new Date().toISOString() })}::jsonb,
        updated_at=now() WHERE id=${String(id)}
    `;
  } else {
    await sql`UPDATE knowledge_entries SET status='archived',updated_at=now() WHERE id=${String(id)}`;
  }
  await sql`DELETE FROM knowledge_analysis_jobs WHERE entry_id=${String(id)}`;
  await refreshConflicts();
}

export async function knowledgeCatalogText({ kind = '' } = {}) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const filterKind = ['document', 'note', 'contact'].includes(kind) ? kind : '';
  const rows = await sql`
    SELECT kind, title, data->>'summary' AS summary
    FROM knowledge_entries WHERE status = 'active'
      AND (${filterKind} = '' OR kind = ${filterKind})
    ORDER BY authority DESC, title ASC LIMIT 1000
  `;
  return rows.map((r) => `- [${r.kind}] ${r.title}${r.summary ? ': ' + r.summary : ''}`).join('\n');
}

// The document catalogue the assistant picks from — one row per document, with
// the summary written at ingestion and enough size information to know what
// opening it will cost. Deliberately free of body text: this is the list the
// model reads to decide WHICH file it needs, and it is read on every referral
// question, so it has to stay small.
export async function listKnowledgeDocuments({ filter = '', limit = 200 } = {}) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const q = String(filter || '').trim();
  return sql`
    SELECT e.id, e.title, e.data->>'summary' AS summary, e.source_ref AS "sourceRef",
           e.updated_at AS "updatedAt", count(p.id)::int AS passages,
           coalesce(sum(length(p.content)), 0)::int AS characters
    FROM knowledge_entries e LEFT JOIN knowledge_passages p ON p.entry_id = e.id
    WHERE e.kind = 'document' AND e.status = 'active'
      AND (${q} = '' OR e.title ILIKE ${'%' + q + '%'} OR coalesce(e.data->>'summary','') ILIKE ${'%' + q + '%'})
    GROUP BY e.id ORDER BY e.title ASC LIMIT ${Math.max(1, Math.min(1000, limit))}
  `;
}

// One document's passages, in document order, so a caller can serve it a part at
// a time instead of pushing the whole file into a prompt.
export async function knowledgeEntryPassages(entryId) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const id = String(entryId || '');
  if (!id) return [];
  return sql`
    SELECT p.id, p.entry_id AS "entryId", p.ordinal, p.heading, p.content, p.location,
           e.kind, e.title, e.data, e.source_ref AS "sourceRef", e.authority
    FROM knowledge_passages p JOIN knowledge_entries e ON e.id = p.entry_id
    WHERE p.entry_id = ${id} ORDER BY p.ordinal ASC
  `;
}

export async function knowledgePassagesByTitles(titles, { kind = '' } = {}) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const filterKind = ['document', 'note', 'contact'].includes(kind) ? kind : '';
  if (titles instanceof RegExp) {
    return sql`
      SELECT p.id,p.entry_id AS "entryId",p.heading,p.content,p.location,
             e.kind,e.title,e.data,e.source_ref AS "sourceRef",e.authority,1.0 AS score
      FROM knowledge_entries e JOIN knowledge_passages p ON p.entry_id=e.id
      WHERE e.status='active' AND (${filterKind}='' OR e.kind=${filterKind})
        AND e.title ~* ${titles.source}
      ORDER BY e.authority DESC,p.ordinal ASC
    `;
  }
  const wanted = Array.isArray(titles) ? titles.filter(Boolean) : [];
  if (!wanted.length) return [];
  return sql`
    SELECT p.id, p.entry_id AS "entryId", p.heading, p.content, p.location,
           e.kind, e.title, e.data, e.source_ref AS "sourceRef", e.authority, 1.0 AS score
    FROM knowledge_entries e JOIN knowledge_passages p ON p.entry_id = e.id
    WHERE e.status = 'active' AND (${filterKind}='' OR e.kind=${filterKind})
      AND e.title = ANY(${wanted})
    ORDER BY e.authority DESC, p.ordinal ASC
  `;
}

export async function replaceClaims(entryId, claims, expectedHash = '', { refresh = true } = {}) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  if (!expectedHash) {
    const entry = await sql`SELECT content_hash AS "contentHash" FROM knowledge_entries WHERE id=${entryId}`;
    expectedHash = entry[0]?.contentHash || '';
  }
  const passages = await sql`SELECT id, content FROM knowledge_passages WHERE entry_id = ${entryId} ORDER BY ordinal`;
  const verified = [];
  for (const claim of Array.isArray(claims) ? claims.slice(0, 1000) : []) {
    const subject = String(claim.subject || '').trim();
    const predicate = String(claim.predicate || '').trim();
    const value = String(claim.value || '').trim();
    const quote = String(claim.quote || '').trim();
    const passage = quote.length >= 3 ? passages.find((p) => String(p.content || '').includes(quote)) : null;
    // Unsupported model output must never participate in a contradiction.
    if (!subject || !predicate || !value || !passage) continue;
    const key = cleanIdPart(subject) + '|' + cleanIdPart(predicate);
    const fingerprint = hashOf(entryId + '|' + key + '|' + value.toLowerCase().trim() + '|' + quote);
    verified.push({ passageId: passage.id, subject, predicate, value, normalizedKey: key, quote, fingerprint, confidence: Number(claim.confidence) || 0.8 });
  }
  // One statement locks the entry revision and conditionally replaces its
  // claims. A newer autosave either waits and marks them stale afterwards, or
  // wins first and makes this old result a no-op.
  const applied = await sql`
    WITH current_entry AS MATERIALIZED (
      SELECT id FROM knowledge_entries
      WHERE id=${entryId} AND content_hash=${expectedHash} AND status='active'
      FOR UPDATE
    ), removed AS (
      DELETE FROM knowledge_claims c USING current_entry e
      WHERE c.entry_id=e.id RETURNING c.id
    ), claim_input AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(verified)}::jsonb) AS x(
        "passageId" text,subject text,predicate text,value text,"normalizedKey" text,
        quote text,fingerprint text,confidence real
      )
    ), inserted AS (
      INSERT INTO knowledge_claims(entry_id,passage_id,subject,predicate,value,normalized_key,quote,fingerprint,confidence)
      SELECT e.id,i."passageId",i.subject,i.predicate,i.value,i."normalizedKey",i.quote,i.fingerprint,i.confidence
      FROM current_entry e CROSS JOIN claim_input i RETURNING id
    ), marked AS (
      UPDATE knowledge_entries e SET claims_stale=false
      WHERE e.id IN (SELECT id FROM current_entry)
        AND (SELECT count(*) FROM removed)>=0 AND (SELECT count(*) FROM inserted)>=0
      RETURNING e.id
    ) SELECT id FROM marked
  `;
  if (!applied.length) return false;
  if (refresh) await refreshConflicts(entryId);
  return true;
}

export async function refreshConflicts(entryIds = '') {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const ids = Array.isArray(entryIds)
    ? [...new Set(entryIds.filter(Boolean))]
    : (entryIds ? [entryIds] : []);
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
    DELETE FROM knowledge_conflicts c USING knowledge_claims a,knowledge_claims b,knowledge_entries ea,knowledge_entries eb
    WHERE c.claim_a=a.id AND c.claim_b=b.id AND ea.id=a.entry_id AND eb.id=b.entry_id
      AND (ea.status<>'active' OR eb.status<>'active')
  `;
  if (!ids.length) return;
  let afterA = '0', afterB = '0';
  for (let page = 0; page < 20; page++) {
    const candidates = await sql`
      SELECT a.id AS "claimA",b.id AS "claimB",a.fingerprint AS "fingerprintA",b.fingerprint AS "fingerprintB",
        a.normalized_key AS "normalizedKey",a.subject,a.predicate,
        a.value AS "valueA",a.quote AS "quoteA",ea.title AS "titleA",
        b.value AS "valueB",b.quote AS "quoteB",eb.title AS "titleB"
      FROM knowledge_claims a
      JOIN knowledge_claims b ON b.id>a.id AND b.entry_id<>a.entry_id
        AND (b.normalized_key=a.normalized_key OR (
          lower(trim(b.subject))=lower(trim(a.subject))
          AND similarity(lower(b.predicate),lower(a.predicate))>=0.65
        ))
      JOIN knowledge_entries ea ON ea.id=a.entry_id AND ea.status='active'
      JOIN knowledge_entries eb ON eb.id=b.entry_id AND eb.status='active'
      WHERE (a.entry_id=ANY(${ids}) OR b.entry_id=ANY(${ids}))
        AND (a.id>${afterA}::bigint OR (a.id=${afterA}::bigint AND b.id>${afterB}::bigint))
        AND lower(trim(a.value))<>lower(trim(b.value))
        AND NOT (lower(trim(a.predicate))=ANY(${genericPredicates}))
      ORDER BY a.id,b.id LIMIT 120
    `;
    if (!candidates.length) break;
    for (let at = 0; at < candidates.length; at += 30) {
      const batch = candidates.slice(at, at + 30);
      const decisions = await classifyClaimPairs(batch);
      const byIndex = new Map(decisions.map((decision) => [Number(decision.index), decision]));
      const missing = batch.map((_, index) => byIndex.has(index) ? -1 : index).filter((index) => index >= 0);
      const retries = await Promise.all(missing.map((index) => classifyClaimPairs([batch[index]])));
      missing.forEach((index, retryIndex) => {
        const decision = retries[retryIndex]?.find((item) => Number(item.index) === 0);
        if (decision) byIndex.set(index, decision);
      });
      if (batch.some((_, index) => !byIndex.has(index))) throw new Error('Contradiction classifier omitted one or more claim pairs.');
      for (let index = 0; index < batch.length; index++) {
        const decision = byIndex.get(index);
        const c = batch[index];
      const confidence = Number(decision.confidence) || 0;
      if (!c || decision.relation !== 'contradiction' || confidence < 0.9) continue;
      const pairFingerprint = hashOf([c.fingerprintA, c.fingerprintB].sort().join('|'));
      const prior = await sql`SELECT status, resolution FROM knowledge_conflict_decisions WHERE pair_fingerprint=${pairFingerprint}`;
      await sql`
        INSERT INTO knowledge_conflicts(normalized_key,claim_a,claim_b,reason,pair_fingerprint,confidence,status,resolution)
        SELECT ${c.normalizedKey},ca.id,cb.id,${String(decision.reason || 'The claims cannot both apply.')},${pairFingerprint},${confidence},${prior[0]?.status || 'open'},${prior[0]?.resolution || ''}
        FROM knowledge_claims ca,knowledge_claims cb
        WHERE ca.id=${c.claimA} AND cb.id=${c.claimB}
        ON CONFLICT(claim_a,claim_b) DO UPDATE SET reason=EXCLUDED.reason,
          pair_fingerprint=EXCLUDED.pair_fingerprint,confidence=EXCLUDED.confidence,
          status=EXCLUDED.status,resolution=EXCLUDED.resolution
      `;
      }
    }
    const last = candidates[candidates.length - 1];
    afterA = String(last.claimA); afterB = String(last.claimB);
    if (candidates.length < 120) break;
  }
}

export async function listConflicts(status = 'open') {
  await ensureKnowledgeSchema();
  const sql = getSql();
  return sql`
    SELECT c.id, c.normalized_key AS "normalizedKey", c.reason, c.status, c.resolution, c.confidence,
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

export async function conflictsForPassages(passageIds) {
  await ensureKnowledgeSchema();
  const ids = Array.isArray(passageIds) ? [...new Set(passageIds.filter(Boolean))] : [];
  if (!ids.length) return [];
  const sql = getSql();
  return sql`
    SELECT c.id, a.subject, a.predicate, a.value AS "valueA", ea.title AS "titleA",
           b.value AS "valueB", eb.title AS "titleB",
           pa.id AS "passageA", pa.heading AS "headingA", pa.content AS "contentA", pa.location AS "locationA", ea.id AS "entryA", ea.kind AS "kindA",
           pb.id AS "passageB", pb.heading AS "headingB", pb.content AS "contentB", pb.location AS "locationB", eb.id AS "entryB", eb.kind AS "kindB"
    FROM knowledge_conflicts c
    JOIN knowledge_claims a ON a.id = c.claim_a JOIN knowledge_entries ea ON ea.id = a.entry_id
    JOIN knowledge_claims b ON b.id = c.claim_b JOIN knowledge_entries eb ON eb.id = b.entry_id
    JOIN knowledge_passages pa ON pa.id=a.passage_id JOIN knowledge_passages pb ON pb.id=b.passage_id
    WHERE c.status = 'open' AND (a.passage_id = ANY(${ids}) OR b.passage_id = ANY(${ids}))
    ORDER BY c.created_at DESC LIMIT 20
  `;
}

export async function resolveConflict(id, status, resolution = '') {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const s = ['resolved', 'ignored', 'open'].includes(status) ? status : 'resolved';
  const rows = await sql`SELECT pair_fingerprint AS "pairFingerprint" FROM knowledge_conflicts WHERE id=${parseInt(id, 10)}`;
  if (s !== 'open' && rows[0]?.pairFingerprint) {
    await sql`
      INSERT INTO knowledge_conflict_decisions(pair_fingerprint,status,resolution,updated_at)
      VALUES(${rows[0].pairFingerprint},${s},${String(resolution || '')},now())
      ON CONFLICT(pair_fingerprint) DO UPDATE SET status=EXCLUDED.status,resolution=EXCLUDED.resolution,updated_at=now()
    `;
  }
  if (s === 'open' && rows[0]?.pairFingerprint) await sql`DELETE FROM knowledge_conflict_decisions WHERE pair_fingerprint=${rows[0].pairFingerprint}`;
  await sql`
    UPDATE knowledge_conflicts SET status = ${s}, resolution = ${String(resolution || '')},
      resolved_at = CASE WHEN ${s} = 'open' THEN NULL ELSE now() END
    WHERE id = ${parseInt(id, 10)}
  `;
}

export async function unifiedContacts(query, limit = 5) {
  const hits = await searchKnowledge(query, Math.max(limit, 8), { kind: 'contact', semantic: true });
  return contactHitsToCards(hits, limit);
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
