// Helpers for discovering and identifying source files. Shared by the ingest
// and status scripts so they agree on what a "document" is.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SOURCES_DIR } from './config.mjs';
import { slugify } from './chunk.mjs';

// Every file under rag/sources (recursively), ignoring dotfiles.
export function listSourceFiles() {
  if (!fs.existsSync(SOURCES_DIR)) return [];
  const out = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const fp = path.join(dir, name);
      const st = fs.statSync(fp);
      if (st.isDirectory()) walk(fp);
      else out.push(fp);
    }
  };
  walk(SOURCES_DIR);
  return out;
}

// Path relative to sources/, with forward slashes (stable across OSes).
export function relPath(filePath) {
  return path.relative(SOURCES_DIR, filePath).replace(/\\/g, '/');
}

// A stable, human-ish document id derived from the path (idempotent re-ingest).
export function docIdFor(filePath) {
  return slugify(relPath(filePath).replace(/\.[^.]+$/, ''));
}

export function docTitleFor(filePath) {
  return path.basename(filePath).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
}

export function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
