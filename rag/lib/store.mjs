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
  // entries: one {id, vec} per chunk that has an embedding, ready for scoring.
  // Vectors are stored once per unique contentHash, so several chunks may share
  // the same vector — we resolve that mapping here at load time.
  const idx = { chunks: new Map(), entries: [], dim: 0, catalog: [] };
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
      idx.dim = e.dim || 0;
      if (e.hashes) {
        const vecByHash = new Map();
        e.hashes.forEach((h, i) => vecByHash.set(h, e.vectors[i]));
        for (const c of idx.chunks.values()) {
          const v = c.contentHash && vecByHash.get(c.contentHash);
          if (v) idx.entries.push({ id: c.id, vec: v });
        }
      } else if (e.ids) {
        // Legacy index keyed by chunk id (pre content-addressing).
        (e.ids || []).forEach((id, i) => { if (e.vectors[i]) idx.entries.push({ id, vec: e.vectors[i] }); });
      }
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
  return loadIndex().entries.length > 0;
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

// Two near-identical chunks above this cosine similarity are treated as the same
// fact for retrieval. Documents that repeat the same information then contribute
// it to the answer once — sparing the model's context window — while every
// distinct source is still surfaced for citation (nothing is dropped from disk).
const NEAR_DUP_SIM = 0.95;

// Tier B — semantic retrieval of the most relevant chunks for a query, with
// near-duplicate passages collapsed so overlapping documents don't crowd out
// other relevant content.
export async function retrieve(query, k = 4) {
  const i = loadIndex();
  if (!i.entries.length) return [];
  let qv;
  try { qv = await embedOne(query); } catch (e) { return []; }
  if (!qv) return [];
  const scored = [];
  for (const en of i.entries) scored.push({ id: en.id, vec: en.vec, score: cosine(qv, en.vec) });
  scored.sort((a, b) => b.score - a.score);

  const out = [];
  const kept = [];
  for (const s of scored) {
    if (out.length >= k) break;
    if (kept.some((v) => cosine(v, s.vec) >= NEAR_DUP_SIM)) continue; // redundant with one already chosen
    const c = i.chunks.get(s.id);
    if (c) { out.push({ ...c, score: s.score }); kept.push(s.vec); }
  }
  return out;
}

// Called by ingestion after rewriting the index, so a long-lived dev server
// picks up new content without a restart.
export function resetIndexCache() {
  _index = null;
}
