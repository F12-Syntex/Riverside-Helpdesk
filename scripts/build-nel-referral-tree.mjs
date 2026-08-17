// Turns PCIT's "NEL Referral Tree introduction & document list (EMIS Web)" into
// the dataset the referral card answers from (lib/referrals/nel-tree.data.json).
//
//   npm run data:nel-tree
//
// The published article is a 16-page PDF: two pages of prose, thirteen pages of
// one big table, one page of prose. The table is a form per row, grouped first by
// clinical category ("Urgent", "End Of Life") and then, inside each category, by
// borough — with a tick in each of the five area columns the form is available
// in. Reception's question is "which form, and can we see it", so the row IS the
// answer and every form name is kept CHARACTER FOR CHARACTER: it is the string
// staff type into the Referral Tree, and a tidied-up version of it finds nothing.
//
// WHY THE TICKS ARE READ BY COORDINATE. Flattened page text gives the ticks in
// reading order but not which column each one sat in, so a row ending "✔ ✔" is
// two boroughs out of five with no way to say which — "Wider determinants of
// health questionnaire NEL" is NH and WF, and nothing in the text says so. pdfjs
// reports a text item's position, the five columns sit at stable x centres across
// all thirteen pages, and the header row on page 3 says which centre is which
// area. So the ticks are matched to columns by x and the availability is exact
// rather than guessed. A row whose ticks cannot be placed is reported and marked
// rather than filled in.
//
// Re-run it whenever PCIT publish a newer version of the article; nothing else
// needs changing. The capture date is read out of the page rather than set here,
// so an answer can say how old the list is.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SOURCE = path.join(ROOT, 'rag', 'sources', 'NEL Referral Tree introduction & document list (EMIS Web).pdf');
const OUT = path.join(ROOT, 'lib', 'referrals', 'nel-tree.data.json');

// The five area columns, in the order the table prints them. `x` is the centre a
// tick is drawn at, taken from the header row and confirmed against every page.
const AREAS = [
  { code: 'CH', name: 'City & Hackney', x: 367 },
  { code: 'NH', name: 'Newham', x: 421 },
  { code: 'BHR', name: 'Barking & Dagenham, Havering & Redbridge', x: 468 },
  { code: 'TH', name: 'Tower Hamlets', x: 515 },
  { code: 'WF', name: 'Waltham Forest', x: 563 },
];
// Half the gap between neighbouring columns, so a tick belongs to one column or
// to none. The tightest pair is BHR/TH at 47pt apart.
const COLUMN_TOLERANCE = 20;
// Everything left of the first tick column is the form's name. It is NOT one text
// item: "HRS Referral -  external agencies" is drawn as two, and a name read only
// from the leftmost item is silently truncated to "HRS Referral -" — which is
// then a string that finds nothing in the tree. So the whole width of the label
// column is taken, and the pieces are rejoined by the gaps between them.
const LABEL_X_MAX = AREAS[0].x - COLUMN_TOLERANCE;

// The categories, exactly as the table prints them. Hardcoded rather than
// inferred: a category header and a form row that happens to carry no tick look
// identical otherwise, and a category quietly read as a form is the kind of
// mistake that shows up as a missing answer months later. A header this list does
// not know is reported instead of being folded into the forms.
const CATEGORIES = [
  'Admin',
  'Community (incl. Weight Management)',
  'Elderly Care',
  'End Of Life',
  'IFR',
  'Investigations, Screening, Imaging & Procedures',
  'Lifestyle, Carers',
  'Mental Health (incl. Autism, LD)',
  'Paeds & Young People',
  'Reproduction (incl. Sexual Health)',
  'ADULT Safeguarding, Domestic Violence & Notifications',
  'Specialist',
  'Urgent',
  'AREA Specific',
  'TNW Outpatient Referrals from May 2019',
  'PCN Specific',
  'NEL Information documents to print',
];

// Rows that are furniture rather than content: the table's own header, the two
// callout boxes, the footer URL and the prose headings. Matched on the whole
// label so a form whose name merely starts the same way is never dropped.
const FURNITURE = [
  'North East London Referral Trees',
  'Sections & Form Names (As in Referral Tree protocol)',
  'Use Ctrl + F to search for the referral form name',
];
// The table ends here and the article goes back to prose. Said outright, because
// the last category is still open at this point and prose under an open category
// reads as a row of it — which is how "Click here" became a referral form.
const TABLE_END = ['How to get it', 'Fitting your practice'];
const FURNITURE_STARTS = [
  'https://support.primarycareit.co.uk',
  'Certain forms may not be available',
  'an for your area, you will be able to see',
  'The following list contains all the categories',
  'List of all Categories & Referral Forms',
  'The Referral tree is accessible via our OneLaunchers',
  'Click here for the support article',
  'The Referral Tree is designed to support',
  'Practices can incorporate this',
  'Providing a standardised approach',
  'Ensuring forms are up-to-date',
  'Supporting both clinical and non clinical staff',
  'Ensure secretarial and administrative staff',
  'Share this support article',
  'Encourage use of the template',
  'within your practice',
];

const AREA_CODES = new Set(AREAS.map((a) => a.code));
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Every text item on a page, grouped into rows by the baseline it sits on. */
async function pageRows(doc, pageNo) {
  const content = await (await doc.getPage(pageNo)).getTextContent();
  const byBaseline = new Map();
  for (const item of content.items) {
    const str = String(item.str || '');
    if (!str.trim()) continue;
    const y = Math.round(item.transform[5]);
    const x = Math.round(item.transform[4]);
    if (!byBaseline.has(y)) byBaseline.set(y, []);
    byBaseline.get(y).push({ x, str, width: item.width || 0 });
  }
  // Top of the page downwards, and left to right within a row: document order.
  return [...byBaseline.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, cells]) => ({ y, cells: cells.sort((a, b) => a.x - b.x) }));
}

/** The area a tick at this x belongs to, or null when it belongs to none. */
function areaAt(x) {
  for (const area of AREAS) if (Math.abs(x - area.x) <= COLUMN_TOLERANCE) return area.code;
  return null;
}

/**
 * The pieces of a label, rejoined.
 *
 * A gap between where one piece ends and the next begins is a space in the
 * original; no gap means the two are halves of the same word, split by a font
 * change, and gluing a space in would corrupt the name.
 */
function joinLabel(cells) {
  let out = '';
  let end = null;
  for (const cell of cells) {
    if (end !== null && cell.x - end > 1) out += ' ';
    out += cell.str;
    end = cell.x + cell.width;
  }
  return norm(out);
}

function classify({ cells }) {
  const label = joinLabel(cells.filter((c) => c.x <= LABEL_X_MAX));
  const areas = [];
  let strayTicks = 0;
  for (const cell of cells) {
    if (cell.str.trim() !== '✔') continue;
    const area = areaAt(cell.x);
    if (area) { if (!areas.includes(area)) areas.push(area); } else strayTicks += 1;
  }
  return { label, areas, strayTicks };
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source PDF not found:\n  ${SOURCE}\n\nPut PCIT's article there and re-run.`);
    process.exit(1);
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const standardFontDataUrl = pathToFileURL(path.join(ROOT, 'node_modules', 'pdfjs-dist', 'standard_fonts')).href + '/';
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(SOURCE)),
    isEvalSupported: false,
    standardFontDataUrl,
  }).promise;

  let capturedAt = '';
  const forms = [];
  const byKey = new Map();
  const unplaced = [];
  const unstated = [];
  const unknownHeaders = [];
  let category = '';
  let section = '';

  for (let p = 1; p <= doc.numPages; p++) {
    for (const row of await pageRows(doc, p)) {
      const { label, areas, strayTicks } = classify(row);
      if (!label) continue;

      // "…found on our Referral tree as of 18/06/2026:" — the list's own date,
      // which every answer is stamped with.
      if (!capturedAt) {
        const dated = /as of (\d{2})\/(\d{2})\/(\d{4})/.exec(label);
        if (dated) capturedAt = `${dated[3]}-${dated[2]}-${dated[1]}`;
      }

      if (TABLE_END.includes(label)) { category = ''; section = ''; continue; }
      if (FURNITURE.includes(label)) continue;
      if (FURNITURE_STARTS.some((start) => label.startsWith(start))) continue;

      if (CATEGORIES.includes(label)) { category = label; section = ''; continue; }
      if (AREA_CODES.has(label)) { section = label; continue; }

      // Before the first category the page is still prose, and prose has no
      // ticks. Once inside the table every row is a form.
      if (!category) continue;

      // A row with no tick anywhere. Two different things, kept apart: the table
      // prints a handful of forms with the availability column left empty, and a
      // stray sentence from a callout box would also land here.
      if (!areas.length) {
        if (strayTicks) { unplaced.push({ page: p, label }); continue; }
        // A long sentence is prose that escaped the filters, not a form name.
        if (label.length > 120 || /[.:]$/.test(label)) { unknownHeaders.push({ page: p, label }); continue; }
      }

      const key = `${category}||${label.toLowerCase()}`;
      // The table lists a few forms twice — the same name under two boroughs, or
      // repeated for emphasis. One entry, the union of what it is ticked for.
      const seen = byKey.get(key);
      if (seen) {
        for (const area of areas) if (!seen.areas.includes(area)) seen.areas.push(area);
        if (section && !seen.sections.includes(section)) seen.sections.push(section);
        continue;
      }
      const entry = {
        name: label,
        category,
        areas: [...areas],
        sections: section ? [section] : [],
        page: p,
      };
      if (!areas.length) unstated.push({ page: p, label, section });
      byKey.set(key, entry);
      forms.push(entry);
    }
  }

  // Order the areas as the table prints them, so the data reads like the page.
  const order = new Map(AREAS.map((a, i) => [a.code, i]));
  for (const form of forms) form.areas.sort((a, b) => order.get(a) - order.get(b));

  const counts = Object.fromEntries(AREAS.map((a) => [a.code, forms.filter((f) => f.areas.includes(a.code)).length]));

  const data = {
    source: 'https://support.primarycareit.co.uk/portal/en-gb/kb/articles/nel-referral-tree-introduction-document-list-ew',
    document: 'NEL Referral Tree introduction & document list (EMIS Web)',
    publisher: 'Primary Care IT',
    capturedAt,
    // How the Referral Tree is opened, quoted from the article so the card can
    // show the steps without a model writing them.
    opening: [
      'Open a patient record',
      'Launch the Referral Tree from one of our OneLaunchers or directly from F12',
      'Select the relevant clinical category (e.g. Investigations, Community or Specialist, Urgent)',
      'Choose the required referral form',
      'Complete and save the letter',
    ],
    areas: AREAS.map(({ code, name }) => ({ code, name })),
    categories: CATEGORIES,
    counts,
    forms: forms.map(({ page, sections, ...keep }) => keep),
  };

  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');

  console.log(`Read   ${SOURCE.replace(ROOT + '/', '')}`);
  console.log(`Wrote  ${OUT.replace(ROOT + '/', '')}`);
  console.log(`\n${forms.length} forms across ${CATEGORIES.length} categories, as of ${capturedAt || 'an unknown date'}.`);
  for (const area of AREAS) console.log(`   ${area.code.padEnd(4)} ${String(counts[area.code]).padStart(3)}  ${area.name}`);

  if (unstated.length) {
    console.log(`\n${unstated.length} form(s) print no tick in any column. Availability is left empty rather than assumed:`);
    for (const u of unstated) console.log(`   p${u.page}  ${u.section ? `[${u.section}] ` : ''}${u.label}`);
  }
  if (unplaced.length) {
    console.log(`\n${unplaced.length} row(s) carry a tick that sits in no column — CHECK THESE, the table may have moved:`);
    for (const u of unplaced) console.log(`   p${u.page}  ${u.label}`);
  }
  if (unknownHeaders.length) {
    console.log(`\n${unknownHeaders.length} row(s) were read as prose and dropped. Confirm none is a form:`);
    for (const u of unknownHeaders) console.log(`   p${u.page}  ${u.label.slice(0, 100)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
