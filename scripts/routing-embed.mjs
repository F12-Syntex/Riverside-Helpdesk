// Fill every trigger phrase that has no embedding yet, in batches of 64 (the
// batch size rag/lib/embed.mjs already uses).
//
//   npm run routing:embed
//
// Needs DATABASE_URL and OPENROUTER_API_KEY in .env.local.
import fs from 'node:fs';
import path from 'node:path';

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
if (!process.env.OPENROUTER_API_KEY) { console.error('OPENROUTER_API_KEY is not set'); process.exit(1); }

const { fillMissingTriggerEmbeddings } = await import('../lib/routing/triggers.mjs');

let total = 0;
for (;;) {
  const n = await fillMissingTriggerEmbeddings({ limit: 512 });
  total += n;
  if (!n) break;
  console.log(`embedded ${n}`);
}
console.log(`done — ${total} phrases embedded`);