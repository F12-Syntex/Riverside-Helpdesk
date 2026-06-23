// Reset the rota database and seed it with the real team and two recent weeks.
//
//   node scripts/reset-and-seed-rota.mjs            (asks for confirmation)
//   node scripts/reset-and-seed-rota.mjs --yes      (run without prompting)
//
// This WIPES the `staff` and `rotas` tables, re-inserts the six reception staff
// (with mobile numbers where known), then stores the rotas for the weeks
// beginning Mon 15 Jun 2026 and Mon 22 Jun 2026 as history. Those weeks then
// feed the cross-week balancing in lib/rota/logic.js when future rotas are
// generated.
//
// Shifts are recorded as the two standard codes the app uses: E (early, starts
// 7:45) and L (late, starts 10:00). The source messages had some full days
// (7:45–6:30); these are recorded by their START — a full/early start is E — so
// the "who opens" fairness tally is faithful even though the 2-shift grid can't
// store the exact full-day finish.
import readline from 'node:readline';
import { neon } from '@neondatabase/serverless';
import { loadEnv } from '../rag/lib/config.mjs';

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (.env.local). Cannot reach the database.');
  process.exit(1);
}
const sql = neon(url);

const DEFAULT_TIMES = { E: { start: '7:45', end: '4:15' }, L: { start: '10:00', end: '6:30' } };

// name -> mobile (international). Alishba and Pelumi have no number yet, so the
// WhatsApp export falls back to their name for those two.
const STAFF = [
  { name: 'Iqra', phone: '+44 7860 138672' },
  { name: 'Daniel', phone: '+44 7538 435546' },
  { name: 'Simin', phone: '+44 7983 893960' },
  { name: 'Saif', phone: '+44 7459 533082' },
  { name: 'Alishba', phone: '' },
  { name: 'Pelumi', phone: '' },
];

// Mon→Fri shift codes per person, transcribed from the team WhatsApp messages.
const WEEK_15_JUN = {
  Iqra: ['E', 'E', 'E', 'E', 'E'],     // "full days the whole week" (7:45 start)
  Daniel: ['E', 'L', 'E', 'E', 'L'],
  Simin: ['OFF', 'E', 'L', 'L', 'E'],  // no Monday given that week
  Saif: ['L', 'L', 'E', 'L', 'E'],
  Alishba: ['OFF', 'OFF', 'OFF', 'OFF', 'OFF'], // not listed that week
  Pelumi: ['OFF', 'OFF', 'OFF', 'OFF', 'OFF'],  // not listed that week
};
const WEEK_22_JUN = {
  Iqra: ['E', 'E', 'L', 'E', 'E'],
  Daniel: ['E', 'E', 'E', 'E', 'E'],
  Simin: ['E', 'L', 'E', 'L', 'E'],
  Saif: ['E', 'L', 'E', 'E', 'L'],
  Alishba: ['L', 'E', 'L', 'L', 'L'],
  Pelumi: ['L', 'L', 'L', 'L', 'L'],
};

function isMonday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

async function confirm() {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) => rl.question(
    'This will DELETE all staff and rotas, then reseed. Type "reset" to continue: ', res));
  rl.close();
  return answer.trim().toLowerCase() === 'reset';
}

async function main() {
  for (const iso of ['2026-06-15', '2026-06-22']) {
    if (!isMonday(iso)) throw new Error(`${iso} is not a Monday — refusing to seed a misaligned week.`);
  }
  if (!(await confirm())) { console.log('Cancelled — nothing changed.'); return; }

  // Make sure the tables (and the phone column) exist before touching them.
  await sql`CREATE TABLE IF NOT EXISTS staff (id serial PRIMARY KEY, name text NOT NULL, role text NOT NULL DEFAULT '', hours_per_week integer, notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS about text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS leave jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT ''`;
  await sql`CREATE TABLE IF NOT EXISTS rotas (id serial PRIMARY KEY, week_starting date NOT NULL, notes text NOT NULL DEFAULT '', schedule jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS rotas_week_uniq ON rotas (week_starting)`;

  // Wipe and reset identity so the seeded ids start clean.
  await sql`TRUNCATE TABLE rotas, staff RESTART IDENTITY CASCADE`;
  console.log('Cleared staff and rotas.');

  // Insert staff, capturing the generated id for each name.
  const idByName = {};
  for (const p of STAFF) {
    const rows = await sql`INSERT INTO staff (name, phone) VALUES (${p.name}, ${p.phone}) RETURNING id`;
    idByName[p.name] = rows[0].id;
    console.log(`  + ${p.name}${p.phone ? ' (' + p.phone + ')' : ' (no number)'} → id ${rows[0].id}`);
  }

  // Build an id-keyed grid for a week from its name-keyed transcription.
  const toGrid = (byName) => {
    const grid = {};
    for (const [name, row] of Object.entries(byName)) grid[idByName[name]] = row;
    return grid;
  };

  const weeks = [
    { week: '2026-06-15', byName: WEEK_15_JUN },
    { week: '2026-06-22', byName: WEEK_22_JUN },
  ];
  for (const w of weeks) {
    const schedule = { grid: toGrid(w.byName), times: DEFAULT_TIMES, rules: [], seed: 0 };
    await sql`
      INSERT INTO rotas (week_starting, schedule)
      VALUES (${w.week}, ${JSON.stringify(schedule)}::jsonb)
      ON CONFLICT (week_starting) DO UPDATE SET schedule = EXCLUDED.schedule, updated_at = now()
    `;
    console.log(`  ✓ stored rota for week ${w.week}`);
  }

  console.log(`\nDone. ${STAFF.length} staff, ${weeks.length} historical weeks seeded.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
