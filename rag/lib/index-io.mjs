// Reads and writes the processed index (the data the runtime serves from).
// Supports per-document upsert so re-ingesting only touches changed files while
// keeping everything else intact.
//
// On disk (rag/processed/):
//   chunks.jsonl     one JSON chunk record per line; each carries a contentHash
//   embeddings.json  { model, dim, hashes:[contentHash], vectors:[[float]] } — one
//                    vector per *unique* contentHash, so identical passages across
//                    documents share a single embedding instead of duplicating it
//   catalog.json     { generatedAt(ISO), model, documents:[{docId,title,summary,tags,chunks,source}] }
//   manifest.json    { documents: { docId: {path,sha256,size,mtime,chunks,title,processedAt(ISO)} } }
import fs from 'node:fs';
import { PROCESSED_DIR, CHUNKS_PATH, EMBEDDINGS_PATH, CATALOG_PATH, MANIFEST_PATH } from './config.mjs';

export function loadStore() {
  // vecByHash maps a chunk's contentHash -> its embedding vector. Because it is
  // keyed by content, a vector survives across re-ingests as long as *some* live
  // chunk still has that text — that is what powers the embedding cache.
  const store = { chunks: [], vecByHash: new Map(), catalog: new Map(), manifest: { documents: {} }, dim: 0, model: '' };
  if (fs.existsSync(CHUNKS_PATH)) {
    for (const line of fs.readFileSync(CHUNKS_PATH, 'utf8').split(/\n/)) {
      const l = line.trim();
      if (l) store.chunks.push(JSON.parse(l));
    }
  }
  if (fs.existsSync(EMBEDDINGS_PATH)) {
    const e = JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, 'utf8'));
    store.dim = e.dim || 0;
    store.model = e.model || '';
    if (e.hashes) {
      e.hashes.forEach((h, i) => store.vecByHash.set(h, e.vectors[i]));
    } else if (e.ids) {
      // Legacy index (vectors keyed by chunk id). Re-key by each chunk's hash so
      // old data is still readable; chunks without a contentHash simply have no
      // cached vector and get re-embedded on the next ingest.
      const byId = new Map();
      e.ids.forEach((id, i) => byId.set(id, e.vectors[i]));
      for (const c of store.chunks) {
        if (c.contentHash && byId.has(c.id)) store.vecByHash.set(c.contentHash, byId.get(c.id));
      }
    }
  }
  if (fs.existsSync(CATALOG_PATH)) {
    const c = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    (c.documents || []).forEach((d) => store.catalog.set(d.docId, d));
  }
  if (fs.existsSync(MANIFEST_PATH)) {
    store.manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    if (!store.manifest.documents) store.manifest.documents = {};
  }
  return store;
}

// Vector for a piece of text if we have already embedded that exact content,
// otherwise null. Lets ingestion skip re-embedding unchanged passages.
export function cachedVector(store, contentHash) {
  return store.vecByHash.get(contentHash) || null;
}

export function removeDoc(store, docId) {
  // Drop the document's chunks only. Vectors are content-addressed and may be
  // shared with other documents, so unreferenced ones are reclaimed by the GC in
  // writeStore rather than deleted here.
  store.chunks = store.chunks.filter((c) => c.docId !== docId);
  store.catalog.delete(docId);
  delete store.manifest.documents[docId];
}

export function upsertDoc(store, { docId, chunks, vectors, catalog, manifest }) {
  removeDoc(store, docId);
  chunks.forEach((c, i) => {
    store.chunks.push(c);
    if (vectors[i]) store.vecByHash.set(c.contentHash, vectors[i]);
  });
  store.catalog.set(docId, catalog);
  store.manifest.documents[docId] = manifest;
  if (vectors[0]) store.dim = vectors[0].length;
}

export function writeStore(store, { model } = {}) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });

  fs.writeFileSync(CHUNKS_PATH, store.chunks.map((c) => JSON.stringify(c)).join('\n') + (store.chunks.length ? '\n' : ''));

  // GC: emit one vector per unique contentHash still referenced by a live chunk.
  // Any vector no longer pointed at by a chunk is dropped automatically.
  const hashes = [];
  const vectors = [];
  const seen = new Set();
  for (const c of store.chunks) {
    if (seen.has(c.contentHash)) continue;
    const v = store.vecByHash.get(c.contentHash);
    if (v) { seen.add(c.contentHash); hashes.push(c.contentHash); vectors.push(v); }
  }
  fs.writeFileSync(EMBEDDINGS_PATH, JSON.stringify({ model: model || store.model, dim: store.dim, hashes, vectors }));

  const documents = [...store.catalog.values()];
  fs.writeFileSync(CATALOG_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), model: model || store.model, documents }, null, 2));

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(store.manifest, null, 2));
}
