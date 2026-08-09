// Remove the "Needs review" sections the restructure left behind.
//
// The restructure never deleted a near-duplicate passage — it parked it, named
// as a duplicate, because choosing which wording survives is a practice
// decision rather than a script's. That decision has now been made: the
// duplicates go.
//
// Going does not mean going quietly. The duplicate copy of the e-RS send
// walkthrough was compared line by line against the page that survives it, with
// list numbering and markdown emphasis normalised away so that a step which
// differs only by its position is recognised as the same step. Seven of its
// eight apparently-unique lines were re-wordings of steps already on "Standard
// referral flow (e-RS)". One was not:
//
//     "Choose your practice if prompted."
//
// That is a real step on a real screen and it appears nowhere else in the
// notebook, so it is folded into the surviving page before the duplicate is
// deleted. It goes in as an indented bullet under the Smartcard step rather
// than as a new numbered item, because renumbering a thirteen-step list by
// regular expression is how a step quietly ends up in the wrong place.
//
// USAGE
//   node scripts/notebook-prune-review.mjs .            # dry run
//   node scripts/notebook-prune-review.mjs . --apply
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const root = process.argv[2] || '.';
const APPLY = process.argv.includes('--apply');

for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

const rows = await sql`
  SELECT id, parent_id AS "parentId", title, body, is_section AS "isSection"
  FROM notes ORDER BY id ASC
`;

const RESCUED = 'If you are prompted, choose your practice.';
const flow = rows.find((r) => /^Standard referral flow/i.test(r.title || ''));
let newBody = null;
if (flow) {
  const body = String(flow.body || '');
  if (body.includes(RESCUED)) {
    console.log('the rescued step is already on the page — nothing to fold in');
  } else {
    const lines = body.split(/\r?\n/);
    const at = lines.findIndex((l) => /click\s+\*\*smartcard\*\*/i.test(l));
    if (at === -1) { console.error('could not find the Smartcard step; refusing to guess where to put it'); process.exit(1); }
    lines.splice(at + 1, 0, '', '    - ' + RESCUED);
    newBody = lines.join('\n');
    console.log(`fold into "${flow.title}" after line ${at + 1}:`);
    console.log('    - ' + RESCUED);
  }
}

const doomed = rows.filter((r) => !r.parentId && /^needs review/i.test(r.title || ''));
const doomedPages = rows.filter((r) => doomed.some((d) => d.id === r.parentId));

console.log(`\nsections to remove (${doomed.length}):`);
for (const d of doomed) console.log('  ' + d.title);
console.log(`pages removed with them (${doomedPages.length}):`);
for (const p of doomedPages) console.log('  ' + p.title);

// A page about to be deleted must not still own a file. Nothing should, after
// the reattach pass, but checking is cheaper than losing a blob.
const held = doomedPages.length
  ? await sql`SELECT id, filename FROM note_attachments WHERE note_id = ANY(${doomedPages.map((p) => p.id)})`
  : [];
if (held.length) {
  console.error(`\nREFUSING: ${held.length} attachment(s) still sit on a page being deleted:`);
  for (const h of held) console.error('  ' + h.filename);
  process.exit(1);
}
console.log('\nno attachments are held by those pages');

if (!APPLY) { console.log('\nDry run. Pass --apply to write.'); process.exit(0); }

if (newBody !== null) {
  await sql`UPDATE notes SET body = ${newBody}, updated_at = now() WHERE id = ${flow.id}`;
}
for (const d of doomed) {
  await sql`DELETE FROM notes WHERE id = ${d.id}`; // children cascade
}
try {
  const stale = doomedPages.map((p) => `note:${p.id}`);
  if (stale.length) await sql`UPDATE knowledge_entries SET status = 'archived' WHERE id = ANY(${stale})`;
} catch (e) {
  console.warn('could not archive the deleted pages:', String(e).slice(0, 160));
}

console.log(`\nAPPLIED: ${doomed.length} section(s) removed${newBody !== null ? ', 1 step rescued' : ''}.`);
