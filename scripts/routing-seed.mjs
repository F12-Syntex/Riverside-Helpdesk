// Seed the router's trigger index from the Notebook: one fast-role call per
// page, writing 8–15 phrasings a receptionist would type for it.
//
//   npm run routing:seed              every page whose content changed since last time
//   npm run routing:seed -- --force   every page, regardless
//   npm run routing:seed -- --limit 5 --dry   show what would be generated
//
// A page is skipped when its content hash matches the hash its generated
// triggers were made from; tap-learned phrasings are never touched. Pages are
// read straight from the notes table through the same builder the assistant
// uses (lib/knowledge-context.mjs), so what is seeded is exactly what can be
// rendered. Embeddings are filled in batches at the end.
//
// Needs DATABASE_URL and OPENROUTER_API_KEY in .env.local.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
if (!process.env.OPENROUTER_API_KEY) { console.error('OPENROUTER_API_KEY is not set'); process.exit(1); }

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => { const i = args.indexOf(name); return i > -1 && args[i + 1] ? args[i + 1] : fallback; };
const force = flag('--force');
const dry = flag('--dry');
const limit = Number(opt('--limit', 0)) || 0;
const concurrency = Number(opt('--concurrency', 3)) || 3;

const { buildFullNotebookSources } = await import('../lib/knowledge-context.mjs');
const { getSql, ensureNotebookSchema } = await import('../lib/db.js');
const { getModelRoles } = await import('../lib/settings.js');
const { contentHash, generatedHashes, replaceGeneratedTriggers, fillMissingTriggerEmbeddings } = await import('../lib/routing/triggers.mjs');
const { generateTriggersForPage } = await import('../lib/routing/generate.mjs');
const { pagePath } = await import('../lib/routing/router.mjs');

await ensureNotebookSchema();
const sql = getSql();
const notes = await sql`
  SELECT id, parent_id AS "parentId", title, body, position,
         is_section AS "isSection", kind, fields, status, updated_at AS "updatedAt"
  FROM notes ORDER BY position ASC, id ASC
`;
const pages = buildFullNotebookSources(notes, []);
const hashes = await generatedHashes();
const model = opt('--model', '') || (await getModelRoles()).fast.model;

const todo = pages
  .map((page) => ({ page, hash: contentHash(page.docTitle + '\n' + page.text) }))
  .filter(({ page, hash }) => force || hashes.get(`note:${page.docId}`) !== hash)
  .slice(0, limit || undefined);

console.log(`${pages.length} pages; ${todo.length} to (re)generate on ${model}${dry ? ' [dry run]' : ''}`);

let done = 0, failed = 0, phrasesWritten = 0;
const queue = todo.slice();
async function worker() {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    const { page, hash } = item;
    const title = pagePath(page.docTitle);
    try {
      const { phrases } = await generateTriggersForPage({ title, text: page.text }, { apiKey: process.env.OPENROUTER_API_KEY, model });
      if (dry) {
        console.log(`\n${title}\n  ${phrases.join('\n  ')}`);
      } else {
        const { inserted } = await replaceGeneratedTriggers({ targetKind: 'note', targetRef: page.docId, sourceHash: hash, phrases });
        phrasesWritten += inserted;
        console.log(`ok   ${title} — ${inserted} phrases`);
      }
      done++;
    } catch (e) {
      failed++;
      console.warn(`FAIL ${title}: ${String(e).slice(0, 200)}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

let embedded = 0;
if (!dry) {
  for (;;) {
    const n = await fillMissingTriggerEmbeddings({ limit: 512 });
    embedded += n;
    if (!n) break;
  }
}
console.log(`\ngenerated ${done}, failed ${failed}, phrases written ${phrasesWritten}, embedded ${embedded}`);
process.exit(failed && !done ? 1 : 0);