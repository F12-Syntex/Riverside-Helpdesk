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
import { chunkText, makeChunkId, estTokens, contentHashOf } from './lib/chunk.mjs';
import { embedTexts } from './lib/embed.mjs';
import { summariseDoc } from './lib/summarize.mjs';
import { loadStore, upsertDoc, writeStore, cachedVector } from './lib/index-io.mjs';
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

// Lets a parser write a derived asset (a rendered PDF page, an extracted DOCX
// image, an HTML rendition) into public/ so the browser can load it.
function publicWriteFactory(docId) {
  return (filename, buffer) => {
    // Never let a parser-supplied name escape the document's asset directory.
    const safeName = path.basename(String(filename));
    if (!safeName || safeName === '.' || safeName === '..') throw new Error(`Invalid asset filename: ${filename}`);
    const destDir = path.join(PUBLIC_ASSETS_RAG, docId);
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, safeName), buffer);
    return `assets/rag/${docId}/${safeName}`;
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
      const ctx = {
        docId,
        docTitle: title,
        sourcePath: file,
        publicCopy: publicCopyFactory(docId),
        publicWrite: publicWriteFactory(docId),
      };
      const sections = await parser.parse(file, ctx);

      // Serve the original document (or rendition) once so the UI can open it
      // in-browser, and give every chunk a "view" locator pointing at it.
      const e = ext.replace('.', '');
      const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(e);
      let originalUrl = null;
      const ensureOriginal = () => { if (!originalUrl) originalUrl = ctx.publicCopy(file); return originalUrl; };
      const buildView = (sec) => {
        if (sec.view && sec.view.url) {
          const v = { kind: sec.view.kind || 'file', url: sec.view.url };
          if (sec.view.anchor) v.anchor = sec.view.anchor;
          if (sec.page) v.page = sec.page;
          return v;
        }
        if (e === 'pdf') { const v = { kind: 'pdf', url: ensureOriginal() }; if (sec.page) v.page = sec.page; return v; }
        if (isImg) return { kind: 'image', url: (sec.images && sec.images[0]) || ensureOriginal() };
        if (e === 'md' || e === 'markdown') { const v = { kind: 'markdown', url: ensureOriginal() }; if (sec.view && sec.view.anchor) v.anchor = sec.view.anchor; return v; }
        if (e === 'txt') { const v = { kind: 'text', url: ensureOriginal() }; if (sec.view && sec.view.anchor) v.anchor = sec.view.anchor; return v; }
        return { kind: 'file', url: ensureOriginal() };
      };

      const records = [];
      let ci = 0;
      for (const sec of sections) {
        const view = buildView(sec);
        for (const piece of chunkText(sec.text)) {
          records.push({
            id: makeChunkId(docId, ci++),
            docId,
            docTitle: title,
            source: { type: e, path: 'rag/sources/' + rel, ...(sec.page ? { page: sec.page } : {}) },
            headingPath: sec.headingPath || [],
            section: sec.section || '',
            text: piece,
            images: sec.images || [],
            view,
            tokens: estTokens(piece),
            contentHash: contentHashOf(piece),
          });
        }
      }
      if (!records.length) { console.log('no text extracted, skipped'); skipped++; continue; }

      // Embed only passages we have never embedded before. Reuse cached vectors
      // for text already in the index (shared boilerplate, or paragraphs that
      // survived an edit elsewhere in this file) so re-ingest stays cheap and the
      // store never holds two copies of the same vector.
      const vectors = new Array(records.length);
      const toEmbed = [];
      const toEmbedIdx = [];
      const localByHash = new Map();
      records.forEach((r, i) => {
        const hit = cachedVector(store, r.contentHash) || localByHash.get(r.contentHash);
        if (hit) { vectors[i] = hit; return; }
        localByHash.set(r.contentHash, null); // reserve so duplicates within this doc embed once
        toEmbed.push(r.text);
        toEmbedIdx.push(i);
      });
      if (toEmbed.length) {
        const fresh = await embedTexts(toEmbed);
        fresh.forEach((v, k) => {
          const i = toEmbedIdx[k];
          vectors[i] = v;
          localByHash.set(records[i].contentHash, v);
        });
        // Backfill any same-doc duplicates that reserved before their vector existed.
        records.forEach((r, i) => { if (!vectors[i]) vectors[i] = localByHash.get(r.contentHash); });
      }
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
      const reused = records.length - toEmbed.length;
      console.log(`${records.length} chunks` + (reused ? ` (${toEmbed.length} embedded, ${reused} reused)` : ''));
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
