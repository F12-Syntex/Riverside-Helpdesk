// Coverage and outcomes for the router.
//
//   npm run routing:stats            the last 30 days of decisions
//   npm run routing:stats -- --days 7
//
// Prints: trigger counts by source, phrases with no embedding, Notebook pages
// with no triggers at all (the coverage backlog), and the hit / ambiguous /
// miss split from routing_decisions — the miss rate is the fall-through rate.
// Needs DATABASE_URL in .env.local.
import fs from 'node:fs';
import path from 'node:path';

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }

const args = process.argv.slice(2);
const i = args.indexOf('--days');
const days = i > -1 ? Number(args[i + 1]) || 30 : 30;

const { buildFullNotebookSources } = await import('../lib/knowledge-context.mjs');
const { getSql, ensureNotebookSchema, ensureRoutingSchema } = await import('../lib/db.js');
const { routingStats } = await import('../lib/routing/triggers.mjs');
const { getRoutingThresholds } = await import('../lib/routing/thresholds.mjs');
const { pagePath } = await import('../lib/routing/router.mjs');

await ensureNotebookSchema();
await ensureRoutingSchema();
const sql = getSql();
const notes = await sql`
  SELECT id, parent_id AS "parentId", title, body, position,
         is_section AS "isSection", kind, fields, status, updated_at AS "updatedAt"
  FROM notes ORDER BY position ASC, id ASC
`;
const pages = buildFullNotebookSources(notes, []);
const covered = new Set((await sql`SELECT DISTINCT target_ref AS ref FROM routing_triggers WHERE target_kind = 'note'`).map((r) => r.ref));
const uncovered = pages.filter((p) => !covered.has(p.docId));

const t = await getRoutingThresholds();
const { triggers, decisions } = await routingStats({ days });
const pct = (n) => (decisions.total ? Math.round((100 * (n || 0)) / decisions.total) + '%' : '—');

console.log(`router: ${t.enabled ? 'ON' : 'OFF'}  hitCos ${t.hitCos}  askCos ${t.askCos}  minMargin ${t.minMargin}`);
console.log(`triggers: ${triggers.total} (${triggers.generated} generated, ${triggers.tap} tap) over ${triggers.targets} pages; ${triggers.unembedded} without embedding`);
console.log(`pages: ${pages.length} non-empty, ${uncovered.length} with no triggers`);
for (const p of uncovered.slice(0, 40)) console.log(`  - ${pagePath(p.docTitle)}`);
if (uncovered.length > 40) console.log(`  … and ${uncovered.length - 40} more`);
console.log(`decisions (last ${days} days): ${decisions.total} routed — hit ${decisions.hit || 0} (${pct(decisions.hit)}), ambiguous ${decisions.ambiguous || 0} (${pct(decisions.ambiguous)}), miss ${decisions.miss || 0} (${pct(decisions.miss)})`);