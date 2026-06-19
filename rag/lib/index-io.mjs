// Reads and writes the processed index (the data the runtime serves from).
// Supports per-document upsert so re-ingesting only touches changed files while
// keeping everything else intact.
//
// On disk (rag/processed/):
//   chunks.jsonl     one JSON chunk record per line
//   embeddings.json  { model, dim, ids:[chunkId], vectors:[[float]] } aligned to chunk order
//   catalog.json     { generatedAt(ISO), model, documents:[{docId,title,summary,tags,chunks,source}] }
//   manifest.json    { documents: { docId: {path,sha256,size,mtime,chunks,title,processedAt(ISO)} } }
import fs from 'node:fs';
import { PROCESSED_DIR, CHUNKS_PATH, EMBEDDINGS_PATH, CATALOG_PATH, MANIFEST_PATH } from './config.mjs';

export function loadStore() {
  const store = { chunks: [], emb: new Map(), catalog: new Map(), manifest: { documents: {} }, dim: 0, model: '' };
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
    (e.ids || []).forEach((id, i) => store.emb.set(id, e.vectors[i]));
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

export function removeDoc(store, docId) {
  store.chunks = store.chunks.filter((c) => {
    if (c.docId !== docId) return true;
    store.emb.delete(c.id);
    return false;
  });
  store.catalog.delete(docId);
  delete store.manifest.documents[docId];
}

export function upsertDoc(store, { docId, chunks, vectors, catalog, manifest }) {
  removeDoc(store, docId);
  chunks.forEach((c, i) => { store.chunks.push(c); store.emb.set(c.id, vectors[i]); });
  store.catalog.set(docId, catalog);
  store.manifest.documents[docId] = manifest;
  if (vectors[0]) store.dim = vectors[0].length;
}

export function writeStore(store, { model } = {}) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });

  fs.writeFileSync(CHUNKS_PATH, store.chunks.map((c) => JSON.stringify(c)).join('\n') + (store.chunks.length ? '\n' : ''));

  const ids = [];
  const vectors = [];
  for (const c of store.chunks) {
    const v = store.emb.get(c.id);
    if (v) { ids.push(c.id); vectors.push(v); }
  }
  fs.writeFileSync(EMBEDDINGS_PATH, JSON.stringify({ model: model || store.model, dim: store.dim, ids, vectors }));

  const documents = [...store.catalog.values()];
  fs.writeFileSync(CATALOG_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), model: model || store.model, documents }, null, 2));

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(store.manifest, null, 2));
}
