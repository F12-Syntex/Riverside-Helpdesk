// Shows what is in the knowledge base and what is waiting to be processed.
// Run with:  npm run rag:status
import path from 'node:path';
import { getParser, SUPPORTED_EXTS } from './parsers/index.mjs';
import { loadStore } from './lib/index-io.mjs';
import { listSourceFiles, relPath, docIdFor, sha256 } from './lib/sources.mjs';

function main() {
  const store = loadStore();
  const files = listSourceFiles();
  const seenDocIds = new Set();

  const rows = { new: [], changed: [], current: [], unsupported: [] };
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const rel = relPath(file);
    if (!getParser(ext)) { rows.unsupported.push(rel); continue; }
    const docId = docIdFor(file);
    seenDocIds.add(docId);
    const prev = store.manifest.documents[docId];
    if (!prev) rows.new.push(rel);
    else if (prev.sha256 !== sha256(file)) rows.changed.push(rel);
    else rows.current.push(rel);
  }

  // Documents indexed but whose source file is gone (candidates for cleanup).
  const orphans = Object.entries(store.manifest.documents)
    .filter(([id]) => !seenDocIds.has(id))
    .map(([, m]) => m.path);

  const totalChunks = store.chunks.length;
  const totalDocs = Object.keys(store.manifest.documents).length;

  const list = (label, arr) => {
    if (!arr.length) return;
    console.log(`\n${label} (${arr.length}):`);
    for (const r of arr) console.log('  - ' + r);
  };

  console.log('Riverside knowledge base — status');
  console.log('==================================');
  console.log(`Indexed: ${totalDocs} documents, ${totalChunks} chunks.`);
  console.log(`Sources found: ${files.length} files. Supported types: ${SUPPORTED_EXTS.join(', ')}`);

  list('NEW — not yet processed', rows.new);
  list('CHANGED — will re-process', rows.changed);
  list('UNSUPPORTED — no parser', rows.unsupported);
  list('ORPHANED — indexed but source missing', orphans);
  console.log(`\nUp to date: ${rows.current.length} file(s).`);

  const pending = rows.new.length + rows.changed.length;
  if (pending) console.log(`\n${pending} file(s) pending. Run:  npm run rag:ingest`);
  else console.log('\nEverything is up to date.');
}

main();
