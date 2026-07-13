// Cold-start reconciliation for bundled sources. A tiny persisted fingerprint
// proves the deployed document/contact bundle is already canonical; unchanged
// server instances do one indexed lookup and never parse the corpus again.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { waitUntil } from '@vercel/functions';
import { ensureKnowledgeSchema, ensureNotebookSchema, getSql } from './db';
import { getDirectory } from './lookup/directory';
import { syncNoteKnowledge } from './notebook';
import { drainKnowledgeAnalysisJobs, enqueueKnowledgeAnalysis, fillMissingKnowledgeEmbeddingsByKind, kickKnowledgeAnalysisWorker, knowledgeId, refreshConflicts, syncKnowledgeClaims, upsertKnowledgeEntry } from './knowledge';
import { getSupplementaryEntries } from './ai/context.mjs';
import { CATALOG_PATH, CHUNKS_PATH, EMBEDDINGS_PATH, MANIFEST_PATH } from '@/rag/lib/config.mjs';

const SOURCE_KEY = 'bundled-knowledge-v3';
const CONTACT_CLAIM_KEY = 'contact-claims-v2';
let currentPromise = null;
let lastResult = null;
let lastCheckedAt = 0;
let backgroundReconcile = null;
let lastNudgeAt = 0;

function read(file, fallback = '') {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { return fallback; }
}

function json(text, fallback) {
  try { return JSON.parse(text); } catch (e) { return fallback; }
}

function fingerprintOf(parts) {
  return crypto.createHash('sha256').update(parts.join('\n--source--\n')).digest('hex');
}

async function mapLimit(items, concurrency, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await fn(items[index], index);
    }
  });
  await Promise.all(workers);
}

// Repair note writes that reached the Notebook table but not canonical
// knowledge (for example, a transient database/embedding failure). The cheap
// timestamp join avoids reparsing every page on each bundle check.
async function reconcileChangedNotes(sql, { all = false } = {}) {
  await ensureNotebookSchema();
  const rows = await sql`
    SELECT n.id,n.parent_id AS "parentId",n.title,n.body,n.is_section AS "isSection",n.updated_at AS "updatedAt"
    FROM notes n LEFT JOIN knowledge_entries e ON e.id=('note:' || n.id::text)
    WHERE n.parent_id IS NOT NULL AND n.is_section=false AND btrim(n.body)<>''
      AND (${!!all} OR e.id IS NULL OR e.status<>'active'
        OR coalesce(e.data->>'noteRevision','')<>(floor(extract(epoch FROM n.updated_at)*1000)::bigint)::text)
    ORDER BY n.updated_at ASC
  `;
  for (const note of rows) await syncNoteKnowledge(note, { autoAnalyse: false });
  await sql`
    UPDATE knowledge_entries e SET status='archived',updated_at=now()
    WHERE e.status='active' AND e.kind='note' AND e.source_ref LIKE 'notebook:%'
      AND NOT EXISTS (
        SELECT 1 FROM notes n WHERE e.id=('note:' || n.id::text)
          AND n.parent_id IS NOT NULL AND n.is_section=false AND btrim(n.body)<>''
      )
  `;
  // Passage sync may have succeeded just before a queue insert failed. Restore
  // every missing stale row (including deterministic contact claims) without
  // resetting the backoff of an existing failed job.
  await sql`
    INSERT INTO knowledge_analysis_jobs(entry_id,target_hash,available_at,attempts,last_error,updated_at)
    SELECT e.id,e.content_hash,now(),0,'',now() FROM knowledge_entries e
    WHERE e.status='active' AND e.claims_stale=true
    ON CONFLICT(entry_id) DO UPDATE SET target_hash=EXCLUDED.target_hash,
      available_at=EXCLUDED.available_at,attempts=0,last_error='',updated_at=now()
    WHERE knowledge_analysis_jobs.target_hash<>EXCLUDED.target_hash
  `;
  return rows.length;
}

export async function ensureBundledKnowledge({ force = false } = {}) {
  if (!force && lastResult && Date.now() - lastCheckedAt < 60000) return lastResult;
  if (currentPromise) return currentPromise;
  currentPromise = (async () => {
    await ensureKnowledgeSchema();
    const sql = getSql();
    const manifestText = read(MANIFEST_PATH, '{}');
    const directory = getDirectory();
    const supplementary = await getSupplementaryEntries().catch(() => []);
    const fingerprint = fingerprintOf([
      'schema-v4-separated-context', manifestText, JSON.stringify(directory),
      ...supplementary.map((item) => `${item.origin}\n${item.name}\n${item.text}`),
    ]);
    const contactClaimState = await sql`SELECT 1 FROM knowledge_sync_state WHERE source_key=${CONTACT_CLAIM_KEY}`;
    if (!contactClaimState.length) {
      await sql`
        UPDATE knowledge_entries SET claims_stale=true
        WHERE status='active' AND kind='contact' AND lower(btrim(title))=ANY(${['contact', 'telephone', 'phone', 'email', 'detail', 'details']})
      `;
      await sql`
        INSERT INTO knowledge_sync_state(source_key,fingerprint,updated_at)
        VALUES(${CONTACT_CLAIM_KEY},'v2',now()) ON CONFLICT(source_key) DO NOTHING
      `;
    }
    const state = await sql`SELECT fingerprint FROM knowledge_sync_state WHERE source_key=${SOURCE_KEY}`;
    if (!force && state[0]?.fingerprint === fingerprint) {
      const notes = await reconcileChangedNotes(sql);
      kickKnowledgeAnalysisWorker();
      return { ready: true, unchanged: true, notes };
    }

    const overrideRows = await sql`SELECT id FROM knowledge_entries WHERE data->>'backendOverride'='true'`;
    const overrides = new Set(overrideRows.map((r) => r.id));
    // Supplementary files/URLs also enter the same store. Full origin identity
    // prevents equal filenames from different sources colliding.
    const supplementaryIds = [];
    for (const item of supplementary) {
      const sourceRef = `supplementary:${item.origin}:${item.name}`;
      const targetId = knowledgeId('note', sourceRef, item.name);
      if (overrides.has(targetId)) { supplementaryIds.push(targetId); continue; }
      const entry = await upsertKnowledgeEntry({
        id: targetId, kind: 'note', title: `Practice context: ${item.name}`,
        content: item.text, data: { origin: item.origin }, sourceRef, authority: 88,
      }, { embed: false });
      supplementaryIds.push(entry.id);
      if (entry.claimsChanged || entry.claimsStale) await enqueueKnowledgeAnalysis(entry.id, entry.contentHash, 0);
    }
    if (supplementaryIds.length) {
      await sql`UPDATE knowledge_entries SET status='archived',updated_at=now() WHERE source_ref LIKE 'supplementary:%' AND coalesce(data->>'backendOverride','false')<>'true' AND NOT (id=ANY(${supplementaryIds}))`;
    } else {
      await sql`UPDATE knowledge_entries SET status='archived',updated_at=now() WHERE source_ref LIKE 'supplementary:%' AND coalesce(data->>'backendOverride','false')<>'true'`;
    }
    await sql`DELETE FROM knowledge_analysis_jobs j USING knowledge_entries e WHERE e.id=j.entry_id AND e.status<>'active'`;
    await refreshConflicts();

    const catalog = json(read(CATALOG_PATH, '{}'), { documents: [] });
    const embeddings = json(read(EMBEDDINGS_PATH, '{}'), {});
    const chunks = read(CHUNKS_PATH)
      .split(/\n/).filter((line) => line.trim()).map((line) => json(line, null)).filter(Boolean);
    const vecByHash = new Map();
    if (Array.isArray(embeddings.hashes)) embeddings.hashes.forEach((h, i) => vecByHash.set(h, embeddings.vectors?.[i]));
    const vecById = new Map();
    if (Array.isArray(embeddings.ids)) embeddings.ids.forEach((id, i) => vecById.set(id, embeddings.vectors?.[i]));
    const byDoc = new Map();
    for (const chunk of chunks) {
      if (!byDoc.has(chunk.docId)) byDoc.set(chunk.docId, []);
      byDoc.get(chunk.docId).push(chunk);
    }

    let documents = 0, contacts = 0, notes = 0;
    const documentIds = [], contactIds = [], changedContacts = [];
    await mapLimit(catalog.documents || [], 6, async (doc) => {
      const sourceChunks = byDoc.get(doc.docId) || [];
      const targetId = `document:${doc.docId}`;
      if (overrides.has(targetId)) { documentIds.push(targetId); documents++; return; }
      const entry = await upsertKnowledgeEntry({
        id: targetId, kind: 'document', title: doc.title,
        content: sourceChunks.map((c) => c.text).join('\n\n'),
        passages: sourceChunks.map((c) => ({
          heading: c.section || (c.headingPath || []).join(' › '), text: c.text,
          embedding: vecByHash.get(c.contentHash) || vecById.get(c.id) || null,
          location: { ...(c.view || {}), images: c.images || [], source: c.source || null },
        })),
        data: { summary: doc.summary || '', tags: doc.tags || [] },
        sourceRef: doc.source || `rag/sources/${doc.docId}`, authority: 70,
      }, { embed: false });
      if (entry.claimsChanged || entry.claimsStale) await enqueueKnowledgeAnalysis(entry.id, entry.contentHash, 0);
      documentIds.push(entry.id);
      documents++;
    });

    await mapLimit(directory, 8, async (item) => {
      const sourceRef = `directory:${item.source}:${item.id}:${item.label.toLowerCase()}`;
      const content = [item.label, item.note || '', ...(item.aliases || []), ...(item.phones || []).map((p) => p.display), ...(item.emails || [])].filter(Boolean).join('\n');
      const targetId = knowledgeId('contact', sourceRef, item.label);
      if (overrides.has(targetId)) { contactIds.push(targetId); contacts++; return; }
      const entry = await upsertKnowledgeEntry({
        id: targetId, kind: 'contact', title: item.label,
        content, data: { phones: item.phones || [], emails: item.emails || [], category: item.category, aliases: item.aliases || [], note: item.note || '' },
        sourceRef, authority: 85,
      }, { embed: false });
      if (entry.claimsChanged || entry.claimsStale) changedContacts.push(entry);
      contactIds.push(entry.id);
      contacts++;
    });
    if (documentIds.length) await sql`UPDATE knowledge_entries SET status='archived',updated_at=now() WHERE kind='document' AND coalesce(data->>'backendOverride','false')<>'true' AND NOT (id=ANY(${documentIds}))`;
    if (contactIds.length) await sql`UPDATE knowledge_entries SET status='archived',updated_at=now() WHERE kind='contact' AND coalesce(data->>'backendOverride','false')<>'true' AND NOT (id=ANY(${contactIds}))`;
    // Contacts are a distinct hybrid RAG corpus. Older deployments stored
    // their lexical search documents but deliberately skipped vectors; backfill
    // those vectors in batches without changing any directory records.
    await fillMissingKnowledgeEmbeddingsByKind('contact');
    await mapLimit(changedContacts, 8, (entry) => syncKnowledgeClaims(entry, { refresh: false }));
    await refreshConflicts(changedContacts.map((entry) => entry.id));

    // Force means re-check source fingerprints, not rewrite unchanged notes.
    notes = await reconcileChangedNotes(sql);
    await sql`DELETE FROM knowledge_analysis_jobs j USING knowledge_entries e WHERE e.id=j.entry_id AND (e.status<>'active' OR e.claims_stale=false)`;
    kickKnowledgeAnalysisWorker();
    await sql`
      INSERT INTO knowledge_sync_state(source_key,fingerprint,updated_at) VALUES(${SOURCE_KEY},${fingerprint},now())
      ON CONFLICT(source_key) DO UPDATE SET fingerprint=EXCLUDED.fingerprint,updated_at=now()
    `;
    return { ready: true, unchanged: false, documents, contacts, notes };
  })();
  try {
    lastResult = await currentPromise;
    lastCheckedAt = Date.now();
    return lastResult;
  } finally {
    currentPromise = null;
  }
}

export async function isUnifiedKnowledgeReady() {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const rows = await sql`SELECT 1 FROM knowledge_sync_state WHERE source_key=${SOURCE_KEY}`;
  return rows.length > 0;
}

// Public requests only perform the indexed readiness lookup. Reconciliation
// and one queued reasoning job continue after the response through Vercel's
// request-lifetime primitive, with the in-process promise as the local fallback.
export async function prepareBundledKnowledge() {
  const ready = await isUnifiedKnowledgeReady().catch(() => false);
  if (!backgroundReconcile && Date.now() - lastNudgeAt > 60000) {
    lastNudgeAt = Date.now();
    backgroundReconcile = ensureBundledKnowledge()
      .then(() => drainKnowledgeAnalysisJobs({ limit: 1 }))
      .catch(() => null)
      .finally(() => { backgroundReconcile = null; });
    if (process.env.VERCEL) {
      try { waitUntil(backgroundReconcile); } catch (e) { /* local Node fallback keeps the promise running */ }
    }
  }
  return ready;
}
