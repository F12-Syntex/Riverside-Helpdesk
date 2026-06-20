// One-time / repeatable migration of the legacy lib/*-knowledge.js files (text
// already extracted from the practice's source documents, with linked
// screenshots) into the new chunk format, so existing content flows through the
// same pipeline as everything else without needing the originals.
// Run with:  npm run rag:migrate-legacy
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './lib/config.mjs';
import { chunkText, makeChunkId, estTokens, contentHashOf } from './lib/chunk.mjs';
import { embedTexts } from './lib/embed.mjs';
import { summariseDoc } from './lib/summarize.mjs';
import { loadStore, upsertDoc, writeStore } from './lib/index-io.mjs';

// Each legacy knowledge file becomes one document in the index.
const LEGACY = [
  { file: 'lib/emis-knowledge.js', docId: 'emis-web-guides', title: 'EMIS Web guides (imported from practice PDFs)' },
  { file: 'lib/ucr-knowledge.js', docId: 'ucr-guidance', title: 'UCR guidance' },
  { file: 'lib/handbook-knowledge.js', docId: 'employee-handbook', title: 'Employee handbook' },
];

// Read the array literal out of `export const X = [ ... ];`, tolerating the
// trailing comma some of these files use before a closing bracket/brace.
function readKbArray(relFile) {
  const txt = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
  const a = txt.indexOf('[');
  const b = txt.lastIndexOf(']');
  if (a === -1 || b === -1) throw new Error('Could not find an array in ' + relFile);
  const body = txt.slice(a, b + 1).replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(body);
}

async function migrateOne(store, { file, docId, title }) {
  if (!fs.existsSync(path.join(ROOT, file))) { console.log(`skip ${file} (not found)`); return 0; }
  const kb = readKbArray(file);
  const records = [];
  let ci = 0;
  for (const entry of kb) {
    const section = entry.s || '';
    const body = [entry.t, entry.x].filter(Boolean).join('\n');
    const images = Array.isArray(entry.img) ? entry.img : [];
    // No original file to open for imported content — the screenshot is the
    // viewable source; otherwise the citation just shows the text snippet.
    const view = images.length ? { kind: 'image', url: images[0] } : { kind: 'text' };
    for (const piece of chunkText(body)) {
      records.push({
        id: makeChunkId(docId, ci++),
        docId,
        docTitle: title,
        source: { type: 'legacy', path: file },
        headingPath: section ? [section] : [],
        section,
        text: piece,
        images,
        view,
        tokens: estTokens(piece),
        contentHash: contentHashOf(piece),
      });
    }
  }
  if (!records.length) { console.log(`skip ${file} (no text)`); return 0; }

  process.stdout.write(`${file}: ${kb.length} passages -> ${records.length} chunks, embedding… `);
  const vectors = await embedTexts(records.map((r) => r.text));
  const sample = records.map((r) => r.text).join('\n\n').slice(0, 4000);
  const { summary, tags } = await summariseDoc(title, sample);

  upsertDoc(store, {
    docId,
    chunks: records,
    vectors,
    catalog: { docId, title, summary, tags, chunks: records.length, source: file },
    manifest: { path: file, sha256: 'legacy-import', size: 0, mtime: 0, chunks: records.length, title, processedAt: new Date().toISOString() },
  });
  console.log('done');
  return records.length;
}

async function main() {
  const cfg = config();
  if (!cfg.apiKey) { console.error('OPENROUTER_API_KEY is not set (.env.local).'); process.exit(1); }

  const store = loadStore();
  let total = 0;
  for (const src of LEGACY) total += await migrateOne(store, src);
  if (total) writeStore(store, { model: cfg.embedModel });
  console.log(`\nDone. Indexed ${total} chunks across ${LEGACY.length} legacy file(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
