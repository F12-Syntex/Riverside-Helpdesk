// Loads the referral-routing lookup: the e-RS referral types the practice can
// actually choose, and the SNOMED terms used to reach them.
//
//   npm run data:ers -- --release "C:/Users/synte/snomed_ers_mapping"
//   npm run data:ers -- --dry-run          (parse and report, write nothing)
//   npm run data:ers -- --ers-only         (skip the 216 MB SNOMED pass)
//
// Two sources, deliberately kept apart:
//
//   ereferrals.csv  — the CLOSED list of valid Specialty + Clinic Type pairings.
//                     Small, and the only thing a suggestion may be drawn from.
//   sct2_Description_Snapshot-en_*.txt
//                   — SNOMED descriptions, filtered to the concepts that can
//                     route a referral (disorder / finding / situation /
//                     procedure). Turns messy note wording into settled clinical
//                     wording before it is matched.
//
// There is no SNOMED-to-e-RS mapping to load: no edition of the SNOMED CT UK
// release carries an e-RS refset, and the referral types export carries no
// concept ids. The two are joined at query time, by text, in lib/referrals.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes('--' + name);
const opt = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? fallback : argv[i + 1];
};

const DRY = flag('dry-run');
const ERS_ONLY = flag('ers-only');
const RELEASE = opt('release', 'C:/Users/synte/snomed_ers_mapping');
const ERS_CSV = opt('ers', path.join(ROOT, 'ereferrals.csv'));

// Concepts worth keeping: the ones that say what is wrong with the patient, or
// what is to be done about it. The rest of SNOMED (organisms, substances, body
// structures, products) cannot route a referral and would only add noise to the
// trigram index.
const KEEP_TAGS = new Set(['disorder', 'finding', 'situation', 'procedure']);

const FSN = '900000000000003001';

function normaliseTerm(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''`]/g, '')
    .replace(/\s*\([^)]*\)\s*$/, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// RFC 4180 line splitter. The export quotes a clinic type containing a comma
// ("Blood Cancers (Myeloma, Lymphoma)") but leaves the specialty "Ear, Nose &
// Throat" unquoted, so a row can still come back with three fields — handled
// where it is read, not here.
function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(field); field = ''; }
    else field += ch;
  }
  out.push(field);
  return out;
}

function readErsDirectory(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  if (header[0] !== 'specialty' || header[1] !== 'clinic type') {
    throw new Error(`Unexpected header in ${path.basename(file)}: ${lines[0]}`);
  }
  const rows = [];
  const seen = new Set();
  for (const line of lines.slice(1)) {
    const parts = splitCsvLine(line);
    // Only the LAST field is the clinic type. Anything before it belongs to a
    // specialty that contained an unquoted comma.
    const clinicType = parts[parts.length - 1].trim();
    const specialty = parts.slice(0, -1).join(',').trim();
    if (!specialty || !clinicType) continue;
    const key = specialty + '|' + clinicType;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push([specialty, clinicType, normaliseTerm(specialty), normaliseTerm(clinicType)]);
  }
  return rows;
}

function findDescriptionFile(release) {
  const hits = [];
  const walk = (dir, depth = 0) => {
    if (depth > 5) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (/^sct2_Description_.*Snapshot-en.*\.txt$/i.test(e.name)) hits.push(full);
    }
  };
  walk(release);
  if (!hits.length) throw new Error(`No sct2_Description_Snapshot-en file found under ${release}`);
  // Prefer the International edition: it carries the full clinical hierarchy,
  // where the UK files hold only what the UK adds on top of it.
  return hits.sort((a, b) => (/International/i.test(b) ? 1 : 0) - (/International/i.test(a) ? 1 : 0)
    || fs.statSync(b).size - fs.statSync(a).size)[0];
}

// Pass 1 decides which concepts are worth keeping, from the semantic tag on
// their Fully Specified Name. Pass 2 takes every active description of those
// concepts, so the synonyms people actually type are searchable too.
async function readSnomedTerms(file) {
  const keep = new Map(); // conceptId -> semantic tag
  const stats = { rows: 0, active: 0 };

  const scan = async (onRow) => {
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      const c = line.split('\t');
      if (c.length >= 8) onRow(c);
    }
  };

  await scan((c) => {
    stats.rows++;
    if (c[2] !== '1') return; // active rows only
    stats.active++;
    if (c[6] !== FSN) return;
    const tag = (/\(([^)]+)\)\s*$/.exec(c[7]) || [])[1];
    if (tag && KEEP_TAGS.has(tag)) keep.set(c[4], tag);
  });

  const rows = [];
  const seen = new Set();
  await scan((c) => {
    if (c[2] !== '1') return;
    const tag = keep.get(c[4]);
    if (!tag) return;
    const norm = normaliseTerm(c[7]);
    if (norm.length < 3) return;
    const key = c[4] + '|' + norm;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push([c[4], c[7], norm, tag, c[6] === FSN]);
  });

  return { rows, concepts: keep.size, stats };
}

function connect() {
  let url = process.env.DATABASE_URL;
  if (!url) {
    // Convenience for a local run: the app keeps this in .env.local.
    const envFile = path.join(ROOT, '.env.local');
    if (fs.existsSync(envFile)) {
      const m = /^DATABASE_URL=(.*)$/m.exec(fs.readFileSync(envFile, 'utf8'));
      if (m) url = m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  if (!url) throw new Error('DATABASE_URL is not set — add it to .env.local.');
  return neon(url, { fetchOptions: { cache: 'no-store' } });
}

// Neon's HTTP driver sends one request per statement, so rows go up in blocks
// via unnest rather than one INSERT each.
async function insertBatched(label, rows, send, size = 2000) {
  let done = 0;
  for (let i = 0; i < rows.length; i += size) {
    await send(rows.slice(i, i + size));
    done += Math.min(size, rows.length - i);
    process.stdout.write(`\r  ${label}: ${done}/${rows.length}`);
  }
  process.stdout.write('\n');
}

const ers = readErsDirectory(ERS_CSV);
console.log(`e-RS referral types: ${ers.length} Specialty + Clinic Type pairings from ${path.basename(ERS_CSV)}`);
console.log(`  ${new Set(ers.map((r) => r[0])).size} specialties, of which ${ers.filter((r) => r[0] === '2WW').length} are 2WW pairings`);

let snomed = { rows: [], concepts: 0, stats: { rows: 0, active: 0 } };
if (!ERS_ONLY) {
  const descFile = findDescriptionFile(RELEASE);
  console.log(`\nSNOMED descriptions: ${path.relative(RELEASE, descFile)}`);
  snomed = await readSnomedTerms(descFile);
  console.log(`  ${snomed.stats.rows} rows, ${snomed.stats.active} active, ${snomed.concepts} routable concepts, ${snomed.rows.length} searchable terms`);
}

if (DRY) {
  console.log('\n--dry-run: nothing written.');
  console.log('sample pairings:', ers.slice(0, 3).map((r) => `${r[0]} / ${r[1]}`).join(' | '));
  if (snomed.rows.length) console.log('sample terms:', snomed.rows.slice(0, 3).map((r) => r[1]).join(' | '));
  process.exit(0);
}

const sql = connect();
console.log('\nwriting to Postgres…');

// Same definitions as ensureSnomedSchema() in lib/db.js, repeated so the script
// can run standalone against a fresh database.
await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
await sql`CREATE TABLE IF NOT EXISTS snomed_terms (concept_id text NOT NULL, term text NOT NULL, term_norm text NOT NULL, semantic_tag text NOT NULL DEFAULT '', is_fsn boolean NOT NULL DEFAULT false, PRIMARY KEY (concept_id, term_norm))`;
await sql`CREATE TABLE IF NOT EXISTS ers_directory (specialty text NOT NULL, clinic_type text NOT NULL, specialty_norm text NOT NULL, clinic_norm text NOT NULL, PRIMARY KEY (specialty, clinic_type))`;

await sql`TRUNCATE ers_directory`;
await insertBatched('e-RS pairings', ers, (batch) => sql`
  INSERT INTO ers_directory (specialty, clinic_type, specialty_norm, clinic_norm)
  SELECT * FROM unnest(
    ${batch.map((r) => r[0])}::text[], ${batch.map((r) => r[1])}::text[],
    ${batch.map((r) => r[2])}::text[], ${batch.map((r) => r[3])}::text[]
  ) ON CONFLICT DO NOTHING
`);

if (snomed.rows.length) {
  // Indexes are built after the load: maintaining a GIN index across a million
  // inserts costs far more than building it once at the end.
  await sql`DROP INDEX IF EXISTS snomed_terms_trgm_idx`;
  await sql`TRUNCATE snomed_terms`;
  await insertBatched('SNOMED terms', snomed.rows, (batch) => sql`
    INSERT INTO snomed_terms (concept_id, term, term_norm, semantic_tag, is_fsn)
    SELECT * FROM unnest(
      ${batch.map((r) => r[0])}::text[], ${batch.map((r) => r[1])}::text[],
      ${batch.map((r) => r[2])}::text[], ${batch.map((r) => r[3])}::text[],
      ${batch.map((r) => r[4])}::boolean[]
    ) ON CONFLICT DO NOTHING
  `);
  console.log('  building indexes…');
  await sql`CREATE INDEX IF NOT EXISTS snomed_terms_norm_idx ON snomed_terms (term_norm)`;
  await sql`CREATE INDEX IF NOT EXISTS snomed_terms_trgm_idx ON snomed_terms USING gin (term_norm gin_trgm_ops)`;
}
await sql`CREATE INDEX IF NOT EXISTS ers_directory_trgm_idx ON ers_directory USING gin (clinic_norm gin_trgm_ops)`;

const [{ e }] = await sql`SELECT count(*)::int AS e FROM ers_directory`;
const [{ s }] = await sql`SELECT count(*)::int AS s FROM snomed_terms`;
console.log(`\ndone: ers_directory ${e} rows, snomed_terms ${s} rows`);
