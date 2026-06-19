// Ingestion pipeline:  source file -> parser -> chunks -> embeddings + catalogue.
// Run with:  npm run rag:ingest        (process new/changed files only)
//            npm run rag:ingest -- -f  (force re-process everything)
//
// Idempotent: each file is hashed; unchanged files are skipped. Output is the
// committed index under rag/processed that the live app reads from.
import fs from 'node:fs';
import path from 'node:path';
import { config, PUBLIC_ASSETS_RAG } from './lib/config.mjs';
import { getParser, SUPPORTED_EXTS } from './parsers/index.mjs';
import { chunkText, makeChunkId, estTokens } from './lib/chunk.mjs';
import { embedTexts } from './lib/embed.mjs';
import { summariseDoc } from './lib/summarize.mjs';
import { loadStore, upsertDoc, writeStore } from './lib/index-io.mjs';
import { listSourceFiles, relPath, docIdFor, docTitleFor, sha256 } from './lib/sources.mjs';

function publicCopyFactory(docId) {
  return (absPath) => {
    const destDir = path.join(PUBLIC_ASSETS_RAG, docId);
    fs.mkdirSync(destDir, { recursive: true });
    const name = path.basename(absPath);
    fs.copyFileSync(absPath, path.join(destDir, name));
    return `assets/rag/${docId}/${name}`;
  };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  const cfg = config();
  if (!cfg.apiKey) {
    console.error('OPENROUTER_API_KEY is not set (.env.local). Cannot embed.');
    process.exit(1);
  }

  const store = loadStore();
  const files = listSourceFiles();
  if (!files.length) {
    console.log('No source files in rag/sources/. Drop documents there and re-run.');
    return;
  }

  let processed = 0, skipped = 0, failed = 0;
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const rel = relPath(file);
    const parser = getParser(ext);
    const docId = docIdFor(file);
    if (!parser) {
      console.log(`SKIP   ${rel}  (no parser for ${ext}; supported: ${SUPPORTED_EXTS.join(', ')})`);
      skipped++;
      continue;
    }
    const hash = sha256(file);
    const prev = store.manifest.documents[docId];
    if (!force && prev && prev.sha256 === hash) { skipped++; continue; }

    process.stdout.write(`INGEST ${rel}  … `);
    try {
      const title = docTitleFor(file);
      const ctx = { docId, docTitle: title, sourcePath: file, publicCopy: publicCopyFactory(docId) };
      const sections = await parser.parse(file, ctx);

      const records = [];
      let ci = 0;
      for (const sec of sections) {
        for (const piece of chunkText(sec.text)) {
          records.push({
            id: makeChunkId(docId, ci++),
            docId,
            docTitle: title,
            source: { type: ext.replace('.', ''), path: 'rag/sources/' + rel, ...(sec.page ? { page: sec.page } : {}) },
            headingPath: sec.headingPath || [],
            section: sec.section || '',
            text: piece,
            images: sec.images || [],
            tokens: estTokens(piece),
          });
        }
      }
      if (!records.length) { console.log('no text extracted, skipped'); skipped++; continue; }

      const vectors = await embedTexts(records.map((r) => r.text));
      const sample = records.map((r) => r.text).join('\n\n').slice(0, 4000);
      const { summary, tags } = await summariseDoc(title, sample);

      const st = fs.statSync(file);
      upsertDoc(store, {
        docId,
        chunks: records,
        vectors,
        catalog: { docId, title, summary, tags, chunks: records.length, source: 'rag/sources/' + rel },
        manifest: { path: 'rag/sources/' + rel, sha256: hash, size: st.size, mtime: st.mtimeMs, chunks: records.length, title, processedAt: new Date().toISOString() },
      });
      console.log(`${records.length} chunks`);
      processed++;
    } catch (e) {
      console.log('FAILED: ' + e.message);
      failed++;
    }
  }

  if (processed) writeStore(store, { model: cfg.embedModel });
  const total = Object.keys(store.manifest.documents).length;
  console.log(`\nDone. ${processed} processed, ${skipped} unchanged/skipped, ${failed} failed. Total documents indexed: ${total}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
