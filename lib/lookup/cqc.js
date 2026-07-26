// The CQC locations dataset — every service registered with the Care Quality
// Commission in England (GP practices, dentists, hospitals, care and nursing
// homes, homecare agencies, hospices, clinics).
//
// This is the "wider" half of Instant Lookup. The practice's own numbers
// (lib/lookup/directory.js) stay client-side and answer on every keystroke;
// this set is ~57k rows, so it lives on the server and is searched through
// /api/cqc instead of being shipped to the phone.
//
// Numbers, addresses and postcodes are read verbatim from the published CQC
// extract via scripts/build-cqc-directory.mjs — nothing here is authored by a
// model, same guarantee as the rest of the directory.
//
// Server-only: it reads from disk and holds the dataset in module memory.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DATA_FILE = path.join(process.cwd(), 'lib', 'lookup', 'cqc.data.json.gz');

// Field order written by scripts/build-cqc-directory.mjs.
const NAME = 0, PHONE = 1, POSTCODE = 2, ADDRESS = 3, TYPES = 4,
  AUTHORITY = 5, REGION = 6, PROVIDER = 7, WEBSITE = 8, URL = 9, ALIAS = 10;

function norm(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[‘’']/g, '') // St Mary's -> st marys
    .replace(/&/g, ' and ');
}

// Connectives would otherwise match half the dataset — "of", "the" and the
// company suffixes appear in thousands of provider names.
const STOP = new Set(['and', 'the', 'of', 'for', 'at', 'to', 'in', 'on', 'or', 'ltd', 'limited']);

function tokenize(str) {
  return (norm(str).match(/[a-z0-9]+/g) || []).filter((t) => !STOP.has(t));
}

// Words that nobody includes when they say a hospital's initials out loud.
const CONNECTIVES = new Set(['and', 'of', 'the', 'for', 'at', 'in', 'on']);

// The initials of a service's name — how staff actually refer to the big sites.
// "Homerton University Hospital" is HUH, "Moorfields Eye Hospital" is MEH.
//
// Two forms are kept where they differ, because usage varies on the connecting
// words: "Guy's and St Thomas'" is said as both GAST and GST.
export function acronymsFor(nameNorm) {
  const words = String(nameNorm || '').split(' ').filter((w) => /^[a-z0-9]/.test(w));
  // A single word is its own name, not an acronym.
  if (words.length < 2) return [];
  const all = words.map((w) => w[0]).join('');
  const significant = words.filter((w) => !CONNECTIVES.has(w)).map((w) => w[0]).join('');
  return significant !== all && significant.length >= 2 ? [all, significant] : [all];
}

let _data = null;
let _loadFailed = false;

// Parse once per server process. Each row gets pre-normalised haystacks so a
// search is a straight scan with no per-query allocation: `name` (what the
// caller is most likely typing) and `rest` (address, town, service type,
// provider, local authority — matched, but ranked below the name).
function load() {
  if (_data || _loadFailed) return _data;
  try {
    const payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(DATA_FILE)).toString('utf8'));
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    _data = {
      rows,
      source: payload?.source || '',
      name: rows.map((r) => norm(r[NAME])),
      initials: rows.map((r) => acronymsFor(norm(r[NAME]))),
      rest: rows.map((r) => norm([r[ALIAS], r[ADDRESS], r[TYPES], r[AUTHORITY], r[PROVIDER]].filter(Boolean).join(' '))),
      // "E1 7BS" and "e17bs" should both find the same row.
      postcode: rows.map((r) => norm(r[POSTCODE]).replace(/[^a-z0-9]/g, '')),
      digits: rows.map((r) => String(r[PHONE] || '')),
    };
  } catch (e) {
    // A missing or corrupt data file must not take the lookup page down — the
    // practice's own directory is the part reception depends on.
    _loadFailed = true;
    _data = null;
  }
  return _data;
}

export function cqcCount() {
  const d = load();
  return d ? d.rows.length : 0;
}

// How strongly does one query token match one row? 0 = no match, and every
// query token must match somewhere, so extra words narrow the list.
function scoreToken(token, i, d) {
  const name = d.name[i];
  const at = name.indexOf(token);
  if (at === 0) return 100;
  // An acronym is how staff say the big sites — HUH, MEH, RLH. Checked before
  // the substring fallbacks so "meh" reaches Moorfields rather than whichever
  // name happens to contain those three letters in the middle of a word.
  if (token.length >= 2 && d.initials[i].includes(token)) return 96;
  // Start of any word in the name ("mansfield" in "Helping Hands Mansfield")
  // beats a match buried mid-word.
  if (at > 0) return /[^a-z0-9]/.test(name[at - 1]) ? 80 : 55;
  // Postcodes arrive as two short tokens ("e1", "7bs"), and either half is worth
  // matching on its own — "e9" alone usefully narrows to one part of Hackney.
  if (token.length >= 2) {
    const pc = d.postcode[i];
    if (pc.startsWith(token)) return 90;
    if (pc.includes(token)) return 75;
  }
  if (token.length >= 3 && /^\d+$/.test(token) && d.digits[i].includes(token)) return 70;
  if (d.rest[i].includes(token)) return 35;
  return 0;
}

function toEntry(row, i) {
  return {
    id: 'q' + i,
    label: row[NAME],
    category: 'CQC registered services',
    phones: row[PHONE] ? [{ display: row[PHONE], tel: row[PHONE] }] : [],
    emails: [],
    // What reception needs on screen to be sure it is the right branch.
    note: [row[ADDRESS], row[POSTCODE]].filter(Boolean).join(', '),
    types: row[TYPES],
    authority: row[AUTHORITY],
    region: row[REGION],
    provider: row[PROVIDER],
    website: row[WEBSITE],
    url: row[URL],
    source: 'cqc',
  };
}

// Rank the dataset against a free-text query: a name, a town, a postcode, a
// service type ("dentist barnsley"), or a phone number.
export function searchCqc(query, limit = 25) {
  const d = load();
  if (!d) return [];
  const tokens = tokenize(query).slice(0, 6);
  // Single letters match too much to be useful across 57k rows.
  if (!tokens.length || tokens.every((t) => t.length < 2)) return [];

  const collapsed = norm(query).replace(/[^a-z0-9]/g, '');
  const hits = [];
  for (let i = 0; i < d.rows.length; i++) {
    let total = 0;
    let ok = true;
    for (const t of tokens) {
      const sc = scoreToken(t, i, d);
      if (!sc) { ok = false; break; }
      total += sc;
    }
    if (!ok) continue;
    // A full postcode typed with or without its space is a near-certain hit.
    if (collapsed.length >= 5 && d.postcode[i] === collapsed) total += 120;
    // Prefer the service that answers its own phone over one with no number.
    if (d.digits[i]) total += 10;
    hits.push([total, i]);
  }

  hits.sort((a, b) => b[0] - a[0] || d.name[a[1]].length - d.name[b[1]].length);
  return hits.slice(0, limit).map(([, i]) => toEntry(d.rows[i], i));
}
