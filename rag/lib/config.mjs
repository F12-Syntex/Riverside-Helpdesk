// Shared configuration and filesystem paths for the RAG engine. Used by both
// the offline ingestion scripts (run via `node`) and the live Next.js API route.
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
export const RAG_DIR = path.join(ROOT, 'rag');
export const SOURCES_DIR = path.join(RAG_DIR, 'sources');
export const PROCESSED_DIR = path.join(RAG_DIR, 'processed');
// Display copies of images referenced by chunks live under public/ so the
// browser can load them. Raw source files never go in public/.
export const PUBLIC_ASSETS_RAG = path.join(ROOT, 'public', 'assets', 'rag');

export const CATALOG_PATH = path.join(PROCESSED_DIR, 'catalog.json');
export const CHUNKS_PATH = path.join(PROCESSED_DIR, 'chunks.jsonl');
export const EMBEDDINGS_PATH = path.join(PROCESSED_DIR, 'embeddings.json');
export const MANIFEST_PATH = path.join(PROCESSED_DIR, 'manifest.json');

// Next.js loads .env.local automatically; standalone `node` scripts do not, so
// we parse it ourselves (without adding a dotenv dependency). Existing env vars
// always win, so this never overrides a value set in the real environment.
let _loaded = false;
export function loadEnv() {
  if (_loaded) return;
  _loaded = true;
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

export function config() {
  loadEnv();
  return {
    apiKey: process.env.OPENROUTER_API_KEY,
    chatModel: process.env.OPENROUTER_AI_MODEL,
    // Embeddings are served by OpenRouter too; one key for everything.
    embedModel: process.env.OPENROUTER_EMBED_MODEL || 'openai/text-embedding-3-small',
    base: 'https://openrouter.ai/api/v1',
    referer: 'https://riverside-practice.local',
    title: 'Riverside Practice Q&A',
  };
}
