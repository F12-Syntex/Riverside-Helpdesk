// One-time migration of the existing lib/emis-knowledge.js (text already
// extracted from the practice's EMIS PDFs, with linked screenshots) into the new
// chunk format, so current content flows through the same pipeline as everything
// else without needing the original PDFs.
// Run with:  npm run rag:migrate-legacy
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './lib/config.mjs';
import { chunkText, makeChunkId, estTokens } from './lib/chunk.mjs';
import { embedTexts } from './lib/embed.mjs';
import { summariseDoc } from './lib/summarize.mjs';
import { loadStore, upsertDoc, writeStore } from './lib/index-io.mjs';

const DOC_ID = 'emis-web-guides';
const DOC_TITLE = 'EMIS Web guides (imported from practice PDFs)';

// Read EMIS_KB as data without depending on the module system: the file is
// `export const EMIS_KB = [ ...pure JSON... ];`, so slice out the array literal.
function readLegacyKb() {
  const p = path.join(ROOT, 'lib', 'emis-knowledge.js');
  const txt = fs.readFileSync(p, 'utf8');
  const a = txt.indexOf('[');
  const b = txt.lastIndexOf(']');
  if (a === -1 || b === -1) throw new Error('Could not find the EMIS_KB array in lib/emis-knowledge.js');
  return JSON.parse(txt.slice(a, b + 1));
}

async function main() {
  const cfg = config();
  if (!cfg.apiKey) { console.error('OPENROUTER_API_KEY is not set (.env.local).'); process.exit(1); }

  const kb = readLegacyKb();
  console.log(`Read ${kb.length} legacy passages from lib/emis-knowledge.js`);

  const records = [];
  let ci = 0;
  for (const entry of kb) {
    const section = entry.s || '';
    const body = [entry.t, entry.x].filter(Boolean).join('\n');
    const images = Array.isArray(entry.img) ? entry.img : [];
    for (const piece of chunkText(body)) {
      records.push({
        id: makeChunkId(DOC_ID, ci++),
        docId: DOC_ID,
        docTitle: DOC_TITLE,
        source: { type: 'legacy', path: 'lib/emis-knowledge.js' },
        headingPath: section ? [section] : [],
        section,
        text: piece,
        images,
        tokens: estTokens(piece),
      });
    }
  }
  console.log(`Built ${records.length} chunks. Embedding…`);

  const vectors = await embedTexts(records.map((r) => r.text));
  const sample = records.map((r) => r.text).join('\n\n').slice(0, 4000);
  const { summary, tags } = await summariseDoc(DOC_TITLE, sample);

  const store = loadStore();
  upsertDoc(store, {
    docId: DOC_ID,
    chunks: records,
    vectors,
    catalog: {
      docId: DOC_ID,
      title: DOC_TITLE,
      summary: summary || 'How-to guidance for using EMIS Web at reception, with screenshots.',
      tags: tags.length ? tags : ['emis web', 'reception', 'how-to'],
      chunks: records.length,
      source: 'lib/emis-knowledge.js',
    },
    manifest: {
      path: 'lib/emis-knowledge.js',
      sha256: 'legacy-import',
      size: 0,
      mtime: 0,
      chunks: records.length,
      title: DOC_TITLE,
      processedAt: new Date().toISOString(),
    },
  });
  writeStore(store, { model: cfg.embedModel });
  console.log(`Done. Indexed "${DOC_TITLE}" (${records.length} chunks).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
