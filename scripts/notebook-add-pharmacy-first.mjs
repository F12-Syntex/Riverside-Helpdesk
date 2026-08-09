// Add the Pharmacy First / CPSAS page to the Notebook.
//
// The template in lib/templates/pharmacy.mjs answers the question, but the
// Notebook is where the practice's own knowledge is supposed to live, and a
// rule that exists only in code is one nobody can check or correct. So the same
// facts go on a page: the seven clinical pathways with their age gates, the 24
// conditions that carry free medicines, who is eligible, and how to refer.
//
// Filed under Triaging, because that is the question it answers — whether this
// has to be an appointment at all.
//
// Idempotent: running it twice leaves one page.
//
// USAGE
//   node scripts/notebook-add-pharmacy-first.mjs .            # dry run
//   node scripts/notebook-add-pharmacy-first.mjs . --apply
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

const TITLE = 'Pharmacy First and CPSAS';
const BODY = `Community pharmacy takes three different kinds of referral, and which one it is decides what the pharmacist can do. All referrals go electronically through **Local Services** on EMIS, or **PharmRefer**.

## The seven clinical pathways

The pharmacist can **treat**, not just advise. <mark>The age range is the gateway — outside it they cannot treat under the pathway, so it stays with us.</mark>

| Pathway | Age range |
| --- | --- |
| Uncomplicated UTI | Women 16 to 64 years |
| Shingles | 18 years and over |
| Impetigo | 1 year and over |
| Infected insect bites | 1 year and over |
| Sinusitis | 12 years and over |
| Sore throat | 5 years and over |
| Acute otitis media | 1 to 17 years |

## Minor illness referrals

Anything reasonably considered a minor illness can go, and the list is **not exhaustive**: acne, allergic reaction, ankle or foot pain, athlete's foot, bites and stings, blisters, constipation, cough, cold and flu, diarrhoea, ear discharge or wax, earache, red eye, sticky or watery eye, eyelid problems, hair loss, headache, blocked ear, hip or thigh pain, knee or lower leg pain, lower back pain, mouth ulcers, nasal congestion, pain passing urine, rectal pain, scabies, scratches and grazes, shoulder pain, skin rash, sleep difficulties, sore throat, teething, tiredness, toe pain, vaginal discharge or itch, vomiting, wound dressings, wrist or hand pain.

## The 24 conditions with free medicines (CPSAS)

Free-of-charge over-the-counter medicines for **eligible** patients: athlete's foot, insect bites and stings, back or musculoskeletal pain, nappy rash, conjunctivitis, paediatric fever / teething / pain, constipation, period pain, contact dermatitis, ringworm, diarrhoea, scabies, fever, soft tissue injury, haemorrhoids, oral thrush, hay fever, threadworm, headache, toothache, head lice, vaginal thrush, indigestion or heartburn, warts and verrucae.

### Who is eligible for the free medicines

- Under 16, with at least one parent who would be eligible
- 16, 17 or 18 in full-time education, with at least one parent who would be eligible
- Any young person under the care of the Local Authority
- Care leavers aged 16 to 25
- On Universal Credit at a level giving free prescriptions, or another low-income benefit that does
- Homeless people, asylum seekers and refugees
- Full help under the NHS Low Income Scheme (HC2), which also covers their partner and young dependants

<mark>Walk-in without a GP referral is only for patients who are homeless, asylum seekers or refugees. Everyone else must be referred by us.</mark>

## Good to know

- Referred patients must be registered with a NEL GP practice.
- 347 of 369 NEL community pharmacies provide CPSAS; a list of those that do not is on the ICB Medicines Portal.
- Medicines are for infrequent minor illness. Repeat requests may mean a long-term condition that needs a GP.
- Service queries: nelondonicb.medicinesoptimisationenquiries@nhs.net

> Source: Community Pharmacy Selfcare Advice Service (CPSAS) and Pharmacy First — NEL overview, NHS North East London ICB.`;

const rows = await sql`SELECT id, parent_id AS "parentId", title, is_section AS "isSection" FROM notes ORDER BY id ASC`;
const existing = rows.find((r) => r.title === TITLE);
if (existing) { console.log(`Already present as #${existing.id}. Nothing to do.`); process.exit(0); }

const section = rows.find((r) => !r.parentId && /^triaging$/i.test(r.title || ''))
  || rows.find((r) => !r.parentId && /triag/i.test(r.title || ''));
if (!section) { console.error('No Triaging section found.'); process.exit(1); }

console.log(`Add "${TITLE}" (${BODY.length} chars) under section #${section.id} "${section.title}"`);
if (!APPLY) { console.log('\nDry run. Pass --apply to write.'); process.exit(0); }

const ins = await sql`
  INSERT INTO notes (title, parent_id, is_section, body)
  VALUES (${TITLE}, ${section.id}, ${false}, ${BODY}) RETURNING id
`;
console.log(`APPLIED: page #${ins[0].id}.`);
