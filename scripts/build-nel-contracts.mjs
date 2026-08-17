// Turns PCIT's NEL PCCIF contract mobilisation Sitrep into the dataset behind
// the contract-template card (lib/referrals/nel-contracts.data.json).
//
//   npm run data:nel-contracts
//
// The Sitrep is a daily bulletin issued during the mobilisation of PCIT's
// Primary Care Clinical Information and Facilitation Service across North East
// London. Most of it is prose that goes out of date within the week. One table in
// it does not: which EMIS Web template implements which NEL contract
// specification. That is the part staff need — "the ADHD shared pathway, which
// template is that?" — and it is what this script keeps.
//
// THE STATUS COLUMN IS A SNAPSHOT AND IS TREATED AS ONE. Every row carries a
// build status (For Release / QA / In Development / Awaiting Spec) which the
// document itself says will change through the week. So the capture date is
// carried alongside it and the card leads with it, rather than presenting a
// status from one Tuesday as the current state of the world.
//
// WHY THE PARSING LOOKS LIKE THIS. The table is not one row of text per row of
// table: every cell wraps over several baselines, cells of one logical row sit at
// different heights, and a row can straddle a page break. Reading it by vertical
// position does not work — the Area values wrap to anywhere between one and four
// lines, so the gap between two rows is sometimes smaller than the gap inside one,
// and rows silently merge.
//
// What does work is leaving the items in the order the PDF draws them. A table is
// drawn cell by cell, row by row, so each logical row arrives as one contiguous
// run and a new run begins at the Area cell. So the items are NOT sorted: they are
// walked in content-stream order, tagged with a column by their x, and a new row
// is started whenever the Area column comes round again. Cell contents are
// appended in the order drawn, which also carries a row across a page break for
// free — the continuation is simply the next item in the stream.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SOURCE = path.join(ROOT, 'rag', 'sources', 'PCIT NEL PCCIF Contract Mobilisation Sitrep 28-Jul-2026.pdf');
const OUT = path.join(ROOT, 'lib', 'referrals', 'nel-contracts.data.json');

// The five columns of the EMIS Web table, at the x each one starts at.
const COLUMNS = [
  { key: 'area', x: 78 },
  { key: 'specification', x: 166 },
  { key: 'templates', x: 266 },
  { key: 'comment', x: 402 },
  { key: 'status', x: 503 },
];
// A little slack for glyphs that start marginally left of their column's edge.
const COLUMN_SLACK = 10;

// The table runs from the EMIS Web header row to the SystmOne paragraph. Reading
// begins after the LAST header cell rather than the first, so "Specifications" and
// "Status" are not mistaken for a row of content.
const HEADER_ENDS = /^Status$/;
// The paragraph that follows the table. Matched on its opening words as well as
// its later ones, because it is drawn in pieces and the first piece would
// otherwise be read as one more row of the table.
const TABLE_ENDS = /^As of close of business|status of progress for|SystmOne users/i;

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * Which column an item at this x belongs to, or null when it is left of the table.
 *
 * The column a cell belongs to is the last one whose left edge it starts at or
 * after — not the nearest one. Nearest is wrong for anything that does not start
 * hard against the edge: the en-dash of "Respiratory Diagnostics – Spirometry and
 * Feno (Adults)" is drawn at x=219, which is 53pt from the Specifications edge and
 * 47pt from the Template one, so a nearest-within-tolerance rule threw the dash
 * away and quietly changed the name.
 */
function columnAt(x) {
  let chosen = null;
  for (const col of COLUMNS) if (x >= col.x - COLUMN_SLACK) chosen = col.key;
  return chosen;
}

/**
 * Every table item on every page, in the order the PDF draws them, tagged with
 * its column. Deliberately NOT sorted — see the note at the top of the file.
 */
async function tableItems(doc) {
  const out = [];
  let started = false;
  let ended = false;
  for (let p = 1; p <= doc.numPages && !ended; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    for (const raw of content.items) {
      const str = norm(raw.str);
      if (!str) continue;
      const x = Math.round(raw.transform[4]);
      if (!started) { if (HEADER_ENDS.test(str) && columnAt(x) === 'status') started = true; continue; }
      if (TABLE_ENDS.test(str)) { ended = true; break; }
      const column = columnAt(x);
      // Prose inside the table region sets in at the left margin and runs wide;
      // the superscript "th" of a date is the other thing that lands nearby.
      if (!column) continue;
      out.push({ str, x, page: p, column });
    }
  }
  return out;
}

/**
 * The table's rows, cut at each return of the Area column.
 *
 * A cell's lines are joined in the order drawn. The status cell is sometimes
 * drawn before the last of the template lines, which is why every column is a
 * list appended to rather than a single value read once.
 */
function rowsFrom(items) {
  const rows = [];
  let current = null;
  const started = (row) => row && (row.specification.length || row.templates.length
    || row.comment.length || row.status.length);
  for (const item of items) {
    if (item.column === 'area' && started(current)) current = null;
    if (!current) {
      current = { area: [], specification: [], templates: [], comment: [], status: [] };
      rows.push(current);
    }
    current[item.column].push(item.str);
  }
  return rows;
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source PDF not found:\n  ${SOURCE}`);
    process.exit(1);
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const standardFontDataUrl = pathToFileURL(path.join(ROOT, 'node_modules', 'pdfjs-dist', 'standard_fonts')).href + '/';
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(SOURCE)),
    isEvalSupported: false,
    standardFontDataUrl,
  }).promise;

  const items = await tableItems(doc);
  const rows = rowsFrom(items);
  if (!rows.length) { console.error('No table rows found — the Sitrep layout has changed.'); process.exit(1); }

  const STATUSES = ['For Release', 'QA', 'In Development', 'Awaiting Spec', 'N/A'];
  const contracts = rows.map((row) => ({
    area: norm(row.area.join(' ')),
    specification: norm(row.specification.join(' ')),
    // A row often names several templates; they are kept as one string because
    // the table wraps them and there is no separator to split on that a name
    // could not itself contain.
    templates: norm(row.templates.join(' ')),
    comment: norm(row.comment.join(' ')),
    status: norm(row.status.join(' ')),
  })).filter((c) => c.specification);

  // One row really does carry two: its alert was released while its searches were
  // still being written, and the table shows both. Faithful, so it is reported
  // rather than corrected.
  const compound = contracts.filter((c) => c.status && !STATUSES.includes(c.status)
    && STATUSES.some((s) => c.status.includes(s)));
  const unknownStatus = contracts.filter((c) => c.status && !STATUSES.includes(c.status)
    && !compound.includes(c));

  const data = {
    source: 'PCIT NEL PCCIF Contract Mobilisation — Previous Day Sitrep',
    publisher: 'Primary Care IT',
    // The Sitrep's own date. Everything below is true as at this day and the card
    // says so before it says anything else.
    capturedAt: '2026-07-28',
    clinicalSystem: 'EMIS Web',
    statuses: STATUSES,
    support: {
      tel: '0333 344 3678',
      email: 'support@primarycareit.co.uk',
      portal: 'https://support.primarycareit.co.uk',
    },
    contracts,
  };
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');

  console.log(`Read   ${SOURCE.replace(ROOT + '/', '')}`);
  console.log(`Wrote  ${OUT.replace(ROOT + '/', '')}`);
  console.log(`\n${contracts.length} contract specifications, as at ${data.capturedAt}.`);
  const byStatus = {};
  for (const c of contracts) byStatus[c.status || '(none)'] = (byStatus[c.status || '(none)'] || 0) + 1;
  for (const [k, n] of Object.entries(byStatus)) console.log(`   ${String(n).padStart(3)}  ${k}`);
  console.log('\nby area:');
  const byArea = {};
  for (const c of contracts) byArea[c.area] = (byArea[c.area] || 0) + 1;
  for (const [k, n] of Object.entries(byArea)) console.log(`   ${String(n).padStart(3)}  ${k}`);
  if (compound.length) {
    console.log(`\n${compound.length} row(s) show more than one status, as the table does:`);
    for (const c of compound) console.log(`   ${c.specification} → ${JSON.stringify(c.status)}`);
  }
  if (unknownStatus.length) {
    console.log(`\n${unknownStatus.length} row(s) have an unrecognised status — CHECK THESE:`);
    for (const c of unknownStatus) console.log(`   ${c.specification} → ${JSON.stringify(c.status)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
