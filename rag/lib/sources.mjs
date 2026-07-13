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

// Resolve every supported source to a stable, unique id. Historical imports
// used only the extensionless path, so differently formatted copies such as
// `Policy.doc` and `Policy.docx` could silently overwrite each other. Preserve
// the manifest-backed id for the already indexed source and give additional
// colliding files a deterministic extension suffix.
export function resolveSourceDocIds(filePaths, manifest = { documents: {} }) {
  const groups = new Map();
  for (const file of filePaths) {
    const baseId = docIdFor(file);
    if (!groups.has(baseId)) groups.set(baseId, []);
    groups.get(baseId).push({ file, rel: relPath(file), baseId });
  }

  const resolved = new Map();
  for (const [baseId, rows] of groups) {
    if (rows.length === 1) {
      resolved.set(rows[0].file, baseId);
      continue;
    }

    const legacyPath = manifest.documents?.[baseId]?.path || '';
    const ordered = [...rows].sort((a, b) => a.rel.localeCompare(b.rel));
    const owner = ordered.find((row) => `rag/sources/${row.rel}` === legacyPath) || ordered[0];
    resolved.set(owner.file, baseId);

    const used = new Set([baseId]);
    for (const row of ordered) {
      if (row === owner) continue;
      const ext = slugify(path.extname(row.rel).slice(1) || 'file');
      const stem = baseId.slice(0, Math.max(1, 60 - ext.length - 1));
      let candidate = `${stem}-${ext}`;
      if (used.has(candidate)) {
        const suffix = crypto.createHash('sha1').update(row.rel).digest('hex').slice(0, 8);
        candidate = `${baseId.slice(0, 51)}-${suffix}`;
      }
      used.add(candidate);
      resolved.set(row.file, candidate);
    }
  }
  return resolved;
}

export function docTitleFor(filePath) {
  return path.basename(filePath).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
}

export function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
