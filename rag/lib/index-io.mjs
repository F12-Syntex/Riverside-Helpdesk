// Reads and writes the processed index (the data the runtime serves from).
// Supports per-document upsert so re-ingesting only touches changed files while
// keeping everything else intact.
//
// On disk (rag/processed/):
//   chunks.jsonl     one JSON chunk record per line; each carries a contentHash
//   catalog.json     { generatedAt(ISO), documents:[{docId,title,summary,tags,chunks,source}] }
//   manifest.json    { documents: { docId: {path,sha256,size,mtime,chunks,title,processedAt(ISO)} } }
import fs from 'node:fs';
import { PROCESSED_DIR, CATALOG_PATH, MANIFEST_PATH } from './config.mjs';
import { readChunksText, writeChunksText } from './chunk-artifact.mjs';

export function loadStore() {
  const store = { chunks: [], catalog: new Map(), manifest: { documents: {} } };
  for (const line of readChunksText().split(/\n/)) {
    const l = line.trim();
    if (l) store.chunks.push(JSON.parse(l));
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
  store.chunks = store.chunks.filter((c) => c.docId !== docId);
  store.catalog.delete(docId);
  delete store.manifest.documents[docId];
}

export function upsertDoc(store, { docId, chunks, catalog, manifest }) {
  removeDoc(store, docId);
  store.chunks.push(...chunks);
  store.catalog.set(docId, catalog);
  store.manifest.documents[docId] = manifest;
}

export function writeStore(store) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });

  writeChunksText(store.chunks.map((c) => JSON.stringify(c)).join('\n') + (store.chunks.length ? '\n' : ''));

  const documents = [...store.catalog.values()];
  fs.writeFileSync(CATALOG_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), documents }, null, 2));

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(store.manifest, null, 2));
}
