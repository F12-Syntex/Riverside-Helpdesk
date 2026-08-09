// Record where an eye emergency actually goes.
//
// The minor eye service page ends its A&E list with "go directly to your
// nearest Accident and Emergency Department" — generic, and not what the
// practice does. Eye emergencies go to Moorfields.
//
// The notes already imply it without ever saying it: the hospital-codes page
// gives MEH as Moorfields Eye Hospital, and the A&E-documents page explains how
// to code a Moorfields attendance (MEH, department E/R), which only happens
// because patients attend there. Implied is not recorded, and a rule nobody
// wrote down is one the next person has to rediscover — so it gets written down.
//
// Idempotent: running it twice changes nothing the second time.
//
// USAGE
//   node scripts/notebook-eye-ae.mjs .            # dry run, shows the diff
//   node scripts/notebook-eye-ae.mjs . --apply
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

const FROM = '<mark>If you have any of the following, you must go directly to your nearest **Accident and Emergency Department**:</mark>';
const TO = [
  '<mark>If you have any of the following, the patient goes straight to eye A&E at **Moorfields Eye Hospital (MEH)**, not to a general A&E:</mark>',
  '',
  'Eye emergencies go to Moorfields. A general A&E will usually send them on, which costs the patient the wait twice.',
].join('\n');

const rows = await sql`SELECT id, title, body FROM notes WHERE title ILIKE '%minor eye%'`;
if (!rows.length) { console.error('No minor eye service page found.'); process.exit(1); }
const page = rows[0];
console.log(`page #${page.id} "${page.title}"\n`);

const body = String(page.body || '');
if (body.includes('Moorfields Eye Hospital (MEH)')) { console.log('Already recorded. Nothing to do.'); process.exit(0); }
if (!body.includes(FROM)) { console.error('The A&E line has been reworded — refusing to guess. Edit the page by hand.'); process.exit(1); }

console.log('  - ' + FROM);
for (const l of TO.split('\n')) console.log('  + ' + l);

if (!APPLY) { console.log('\nDry run. Pass --apply to write.'); process.exit(0); }
await sql`UPDATE notes SET body = ${body.replace(FROM, TO)}, updated_at = now() WHERE id = ${page.id}`;
console.log(`\nAPPLIED to page #${page.id}.`);
