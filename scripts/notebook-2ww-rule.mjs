// Record the real 2WW rule on the cancer referrals page.
//
// The page said the speciality and clinic type were "the pairing for the
// suspected cancer" and, under Dermatology, that the speciality was
// "Dermatology". Neither is what e-RS wants. On a two week wait referral:
//
//   Speciality  is literally "2WW", the same on every cancer referral.
//   Clinic type carries the specialty name — "2WW Dermatology".
//
// Recorded in the Notebook as well as in the template because the Notebook is
// where the practice's own knowledge lives: a rule that exists only in code is
// a rule nobody can check, and the next person to read the page would set the
// speciality to Dermatology and send the referral down the routine list.
//
// Idempotent — running it twice changes nothing the second time.
//
// USAGE
//   node scripts/notebook-2ww-rule.mjs .            # dry run, shows the diff
//   node scripts/notebook-2ww-rule.mjs . --apply
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

// Each edit is an exact old → new pair. Nothing is matched loosely: if the page
// has been reworded since, the edit reports itself as not applied rather than
// rewriting something it does not recognise.
const EDITS = [
  {
    what: 'the e-RS table',
    from: '| Type of referral | The **speciality + clinic type** pairing for the suspected cancer |',
    to: [
      '| Speciality | **2WW** — always, on every cancer referral |',
      '| Clinic type | **2WW** followed by the specialty, for example **2WW Dermatology** |',
    ].join('\n'),
  },
  {
    what: 'the "do not guess" warning',
    from: "<mark>Critical: take the exact speciality and clinic type from the doctor's task, or from the referral document itself. Do not guess them.</mark>",
    to: "<mark>Critical: the speciality is **always 2WW**. Take the specialty itself from the doctor's task or the referral document, and put it in the clinic type after 2WW. Do not guess it.</mark>",
  },
  {
    what: 'the Dermatology example',
    from: [
      '*   Speciality: **Dermatology**.',
      "*   Clinic type: the **2WW** skin cancer option for dermatology, as given in the doctor's task.",
    ].join('\n'),
    to: [
      '*   Speciality: **2WW**.',
      '*   Clinic type: **2WW Dermatology**.',
    ].join('\n'),
  },
];

const rows = await sql`SELECT id, title, body FROM notes WHERE title ILIKE '%two week wait%'`;
if (!rows.length) { console.error('No 2WW page found.'); process.exit(1); }
const page = rows[0];
console.log(`page #${page.id} "${page.title}"\n`);

let body = String(page.body || '');
let changed = 0;
for (const edit of EDITS) {
  if (body.includes(edit.to.split('\n')[0])) { console.log(`  already done: ${edit.what}`); continue; }
  if (!body.includes(edit.from)) { console.log(`  NOT FOUND, skipped: ${edit.what}`); continue; }
  body = body.replace(edit.from, edit.to);
  changed += 1;
  console.log(`  updated: ${edit.what}`);
  for (const l of edit.from.split('\n')) console.log('      - ' + l);
  for (const l of edit.to.split('\n')) console.log('      + ' + l);
}

if (!changed) { console.log('\nNothing to change.'); process.exit(0); }
if (!APPLY) { console.log('\nDry run. Pass --apply to write.'); process.exit(0); }

await sql`UPDATE notes SET body = ${body}, updated_at = now() WHERE id = ${page.id}`;
console.log(`\nAPPLIED: ${changed} edit(s) to page #${page.id}.`);
