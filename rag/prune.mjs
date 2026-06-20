// Reclaim space for documents that are indexed but whose source file is gone
// (deleted or renamed). Pruning is deliberately a separate, explicit step — a
// normal `rag:ingest` never deletes content as a side-effect, so curating
// rag/sources/ is non-destructive until you ask for cleanup.
//
// Run with:  npm run rag:prune            (remove orphaned documents)
//            npm run rag:prune -- --dry    (list what would be removed only)
import { config } from './lib/config.mjs';
import { loadStore, removeDoc, writeStore } from './lib/index-io.mjs';
import { listSourceFiles, docIdFor } from './lib/sources.mjs';

function main() {
  const dry = process.argv.slice(2).some((a) => a === '--dry' || a === '--dry-run' || a === '-n');

  const store = loadStore();
  const live = new Set(listSourceFiles().map(docIdFor));
  const orphans = Object.entries(store.manifest.documents)
    .filter(([docId]) => !live.has(docId))
    .map(([docId, m]) => ({ docId, path: m.path, chunks: m.chunks || 0 }));

  if (!orphans.length) {
    console.log('Nothing to prune — every indexed document still has a source file.');
    return;
  }

  console.log(`${dry ? 'Would remove' : 'Removing'} ${orphans.length} orphaned document(s):`);
  for (const o of orphans) console.log(`  - ${o.docId}  (${o.chunks} chunks, source was ${o.path})`);

  if (dry) {
    console.log('\nDry run — nothing changed. Re-run without --dry to apply.');
    return;
  }

  for (const o of orphans) removeDoc(store, o.docId);
  // writeStore garbage-collects any embedding no longer referenced by a live
  // chunk, so the removed documents' vectors are reclaimed automatically.
  writeStore(store, { model: config().embedModel });

  const docs = Object.keys(store.manifest.documents).length;
  console.log(`\nDone. Pruned ${orphans.length} document(s). ${docs} document(s), ${store.chunks.length} chunk(s) remain.`);
}

main();
