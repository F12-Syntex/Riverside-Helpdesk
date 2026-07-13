import fs from 'node:fs';
import zlib from 'node:zlib';
import { CHUNKS_GZIP_PATH, CHUNKS_PATH } from './config.mjs';

// Prefer the compact committed artifact, while retaining a read fallback for
// older deployments and checkouts that still contain plain JSONL.
export function readChunksText() {
  if (fs.existsSync(CHUNKS_GZIP_PATH)) {
    return zlib.gunzipSync(fs.readFileSync(CHUNKS_GZIP_PATH)).toString('utf8');
  }
  return fs.existsSync(CHUNKS_PATH) ? fs.readFileSync(CHUNKS_PATH, 'utf8') : '';
}

export function writeChunksText(text) {
  // Level 9 plus a fixed mtime keeps the generated file small and reproducible.
  const compressed = zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 9, mtime: 0 });
  fs.writeFileSync(CHUNKS_GZIP_PATH, compressed);
  fs.rmSync(CHUNKS_PATH, { force: true });
}
