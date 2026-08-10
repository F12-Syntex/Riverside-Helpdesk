// Add the "FCP and musculoskeletal triage" page to the Notebook.
//
// The Notebook already holds the FCP facts, but scattered across three pages
// written for three different moments: the booking selections sit inside a list
// of specialist referrals, the under-16 rule is its own two-line page, and the
// follow-up route is on a third under Appointments. None of them answers the
// question that actually gets asked at the desk, which is "somebody has written
// in about their back, where does it go?".
//
// That gap is what produced the wrong answer this page exists to stop: a
// patient with five days of severe lower back pain radiating into one leg, with
// tingling and numbness, no relief from maximum-dose ibuprofen, asking for an
// FCP appointment, was answered with a Pharmacy First minor illness referral —
// because "lower back pain" is on the Pharmacy First list and "back or
// musculoskeletal pain" is one of the 24 CPSAS conditions, and nothing said
// when a back problem stops being a self-care one.
//
// The same rule is enforced in lib/templates/fcp.mjs, but a rule that exists
// only in code is one nobody at the practice can check or correct. So it goes
// on a page as well, in the practice's own words, where a clinician can read it
// and change it.
//
// Filed under Triaging, because that is the question it answers.
//
// Idempotent: running it twice leaves one page, and updates the body if the
// text here has changed.
//
// USAGE
//   node scripts/notebook-add-fcp.mjs .            # dry run
//   node scripts/notebook-add-fcp.mjs . --apply
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

const TITLE = 'FCP and musculoskeletal triage';
const BODY = `The **First Contact Physiotherapist (FCP)** is where adult muscle, joint, tendon and back problems go. The FCP assesses, diagnoses and starts treatment without the patient seeing a GP first, and refers on where imaging, orthopaedics or pain management is needed.

## Where a musculoskeletal problem goes

| What the patient describes | Where it goes |
| --- | --- |
| Bladder or bowel changes, numbness around the groin or back passage, symptoms in both legs | <mark>Duty doctor now, or A&E</mark> |
| Pain travelling into a leg or arm, pins and needles, numbness, weakness | FCP |
| Already taken the maximum dose of painkillers without relief | FCP |
| Severe pain, not sleeping, not walking, not working | FCP |
| Asked for physio, an FCP appointment or an MSK assessment | FCP |
| Simple recent ache or strain, nothing tried yet | Pharmacy First, and FCP if it does not settle |
| Anyone under 16 | A doctor, never an FCP |

<mark>Back pain being on the Pharmacy First list does not make every back problem a pharmacy job.</mark> "Lower back pain" is a listed minor illness and "back or musculoskeletal pain" is one of the 24 CPSAS conditions, but both are written for simple backache. A pharmacist can only offer what is on the shelf, so a patient who has already taken the maximum dose of ibuprofen without relief has nothing to gain from being sent there.

## Ask these before booking anything

Any one of them and this is **not** an FCP appointment. Pass it to the duty doctor straight away, and send the patient to A&E if you cannot reach one. Ask the questions, write down what the patient says, and pass it on. Do not interpret the answers and do not reassure the patient.

- Numbness or pins and needles around the **groin, genitals, buttocks or back passage** — the area that would touch a saddle
- **Loss of bladder control**, or not being able to pass urine, or not feeling it when they do
- **Loss of bowel control**, or not feeling it when they open their bowels
- Numbness, tingling or weakness in **both legs**, or legs giving way
- Numbness or loss of feeling during sex

## Booking an FCP appointment

1. On EMIS, **Find slot**.
2. **Find across organisation slot**.
3. Choose **Hackney Downs PCN**.
4. Choose **FCP new patient**.
5. Book the patient in and tell them it is with a First Contact Physiotherapist, not a doctor.

Where the pain travels into a limb or there is altered sensation, say so in the booking note. It changes how soon the FCP wants to see them.

### Follow-ups

A patient who has already seen an FCP does **not** go into a new-patient slot. Send a **task to the FCP group** on EMIS saying they need a follow-up. The FCP team are on EMIS and manage their own follow-ups.

### Under 16

**Minors under 16 must not be booked with an FCP.** FCPs are trained and equipped for adult patients only, so they go to a doctor.

## Requests for pain relief

Patients writing in about back pain usually ask two things: to be seen, and what they can take. Book the FCP appointment yourself. <mark>The painkiller question is a clinical decision, not a booking one</mark> — pass it to the duty doctor or the practice pharmacist the same day. Do not advise on pain relief at the desk, and do not tell a patient to carry on with something that has already failed.

> Related pages: Physiotherapy (FCP) and Extended Scope Physiotherapy · FCP booking rules · FCP follow-up appointments · Pharmacy First and CPSAS · Pain management referral.`;

const rows = await sql`SELECT id, parent_id AS "parentId", title, body, is_section AS "isSection" FROM notes ORDER BY id ASC`;

const existing = rows.find((r) => r.title === TITLE);
if (existing) {
  if ((existing.body || '') === BODY) {
    console.log(`Already present as #${existing.id} and unchanged. Nothing to do.`);
    process.exit(0);
  }
  console.log(`Update #${existing.id} "${TITLE}" (${BODY.length} chars).`);
  if (!APPLY) { console.log('\nDry run. Pass --apply to write.'); process.exit(0); }
  await sql`UPDATE notes SET body = ${BODY} WHERE id = ${existing.id}`;
  console.log(`APPLIED: page #${existing.id} updated.`);
  process.exit(0);
}

// Triaging first, because "where does this go?" is the question. Appointments
// is the fallback, since that is where the other two FCP pages live.
const section = rows.find((r) => !r.parentId && /^triaging$/i.test(r.title || ''))
  || rows.find((r) => !r.parentId && /triag/i.test(r.title || ''))
  || rows.find((r) => !r.parentId && /appointments/i.test(r.title || ''));
if (!section) { console.error('No Triaging or Appointments section found.'); process.exit(1); }

console.log(`Add "${TITLE}" (${BODY.length} chars) under section #${section.id} "${section.title}"`);
if (!APPLY) { console.log('\nDry run. Pass --apply to write.'); process.exit(0); }

const ins = await sql`
  INSERT INTO notes (title, parent_id, is_section, body)
  VALUES (${TITLE}, ${section.id}, ${false}, ${BODY}) RETURNING id
`;
console.log(`APPLIED: page #${ins[0].id}.`);
