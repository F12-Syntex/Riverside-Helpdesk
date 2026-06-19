// Runtime retrieval, imported by the Next.js API route. Loads the precomputed
// index from rag/processed once, caches it in memory, and answers nearest-
// neighbour queries by brute-force cosine similarity. No database needed at this
// scale (see rag/README.md for when to graduate to a vector DB).
import fs from 'node:fs';
import { CATALOG_PATH, CHUNKS_PATH, EMBEDDINGS_PATH } from './config.mjs';
import { embedOne } from './embed.mjs';

let _index = null;

function loadIndex() {
  if (_index) return _index;
  const idx = { chunks: new Map(), ids: [], vectors: [], dim: 0, catalog: [] };
  try {
    if (fs.existsSync(CHUNKS_PATH)) {
      for (const line of fs.readFileSync(CHUNKS_PATH, 'utf8').split(/\n/)) {
        const l = line.trim();
        if (!l) continue;
        const c = JSON.parse(l);
        idx.chunks.set(c.id, c);
      }
    }
    if (fs.existsSync(EMBEDDINGS_PATH)) {
      const e = JSON.parse(fs.readFileSync(EMBEDDINGS_PATH, 'utf8'));
      idx.ids = e.ids || [];
      idx.vectors = e.vectors || [];
      idx.dim = e.dim || 0;
    }
    if (fs.existsSync(CATALOG_PATH)) {
      idx.catalog = (JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')).documents) || [];
    }
  } catch (e) {
    // A missing or partial index just means "no knowledge base yet" — the app
    // still answers from the practice guides alone.
  }
  _index = idx;
  return idx;
}

export function isReady() {
  return loadIndex().ids.length > 0;
}

// Tier A — the always-on catalogue, so the model is aware of everything that
// exists even when a chunk for it wasn't retrieved.
export function catalogText() {
  const i = loadIndex();
  if (!i.catalog.length) return '';
  return i.catalog
    .map((d) => `- ${d.title}: ${d.summary || ''}${d.tags && d.tags.length ? ' [' + d.tags.join(', ') + ']' : ''}`)
    .join('\n');
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

// Tier B — semantic retrieval of the most relevant chunks for a query.
export async function retrieve(query, k = 4) {
  const i = loadIndex();
  if (!i.ids.length) return [];
  let qv;
  try { qv = await embedOne(query); } catch (e) { return []; }
  if (!qv) return [];
  const scored = [];
  for (let j = 0; j < i.ids.length; j++) {
    const v = i.vectors[j];
    if (v) scored.push({ id: i.ids[j], score: cosine(qv, v) });
  }
  scored.sort((a, b) => b.score - a.score);
  const out = [];
  for (const s of scored.slice(0, k)) {
    const c = i.chunks.get(s.id);
    if (c) out.push({ ...c, score: s.score });
  }
  return out;
}

// Called by ingestion after rewriting the index, so a long-lived dev server
// picks up new content without a restart.
export function resetIndexCache() {
  _index = null;
}
