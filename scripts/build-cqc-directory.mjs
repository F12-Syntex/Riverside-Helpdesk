// Converts the CQC "Locations" CSV export into the compact dataset the Instant
// Lookup searches (lib/lookup/cqc.data.json.gz).
//
//   npm run data:cqc -- <path-to-csv>
//
// The published CSV is ~19 MB of spreadsheet-shaped text: four banner lines, a
// header row, then one row per CQC-registered location in England. This script
// keeps only the fields reception actually needs to reach a service, repairs the
// phone numbers (Excel eats the leading zero), and writes positional arrays —
// no per-row key repetition — gzipped, because ~57k locations is ~13 MB of JSON
// and it is read from disk rather than bundled.
//
// Re-run it whenever CQC publish a newer extract; nothing else needs changing.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'lib', 'lookup', 'cqc.data.json.gz');

// RFC 4180 field splitter: handles quoted fields containing commas, embedded
// newlines and "" escapes. Yields rows of raw strings.
function* parseCsv(text) {
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); yield row; row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); yield row; }
}

// The export drops the leading zero from every UK number (10 digits left for a
// landline or mobile, 9 for the few short forms). Anything that doesn't look
// like a dialable UK number is discarded rather than guessed at.
function normalisePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('44')) return '0' + d.slice(2);
  if (d.startsWith('0')) return d;
  if (d.length === 9 || d.length === 10) return '0' + d;
  return '';
}

// "7-9 White Kennet Street,London" — the export comma-joins address lines with
// no space, which reads as one run-on string.
function tidyAddress(raw) {
  return String(raw || '').split(',').map((p) => p.trim()).filter(Boolean).join(', ');
}

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-cqc-directory.mjs <path-to-csv>');
  process.exit(1);
}

const text = fs.readFileSync(src, 'utf8');

const columns = (header) => {
  const col = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Column "${name}" is missing — has the CQC export changed?`);
    return i;
  };
  return {
    name: col('Name'),
    alsoKnownAs: col('Also known as'),
    address: col('Address'),
    postcode: col('Postcode'),
    phone: col('Phone number'),
    website: col("Service's website (if available)"),
    types: col('Service types'),
    provider: col('Provider name'),
    authority: col('Local authority'),
    region: col('Region'),
    url: col('Location URL'),
  };
};

// One pass: the first few lines are the export's banner, then the header row,
// then the data. (Breaking out of the generator to find the header first would
// close it and discard everything after.)
const out = [];
let C = null;
let noPhone = 0;
for (const row of parseCsv(text)) {
  if (!C) {
    if (row[0] === 'Name' && row.includes('Postcode')) C = columns(row);
    continue;
  }
  const name = (row[C.name] || '').trim();
  if (!name) continue;
  const phone = normalisePhone(row[C.phone]);
  if (!phone) noPhone++;
  const provider = (row[C.provider] || '').trim();
  out.push([
    name,
    phone,
    (row[C.postcode] || '').trim(),
    tidyAddress(row[C.address]),
    // Multi-valued in the export ("Dentist|GP practice"); kept as given.
    (row[C.types] || '').trim(),
    (row[C.authority] || '').trim(),
    (row[C.region] || '').trim(),
    // The provider is usually the location's own name plus "Limited"; only
    // worth storing when it genuinely differs.
    provider === name ? '' : provider,
    (row[C.website] || '').trim(),
    (row[C.url] || '').trim(),
    (row[C.alsoKnownAs] || '').trim(),
  ]);
}
if (!C) throw new Error('Could not find the header row (expected a row starting with "Name").');

// Positional arrays keep the file small; lib/lookup/cqc.js owns the field order.
const payload = {
  fields: ['name', 'phone', 'postcode', 'address', 'types', 'authority', 'region', 'provider', 'website', 'url', 'alias'],
  source: path.basename(src),
  rows: out,
};

fs.writeFileSync(OUT, zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 }));
const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
console.log(`${out.length} locations -> ${path.relative(process.cwd(), OUT)} (${mb} MB gzipped), ${noPhone} without a usable phone number`);
