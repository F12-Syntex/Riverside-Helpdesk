// The practice's own referral pathways, read from the Notebook.
//
// WHY THIS EXISTS. The e-RS speciality and clinic type for a referral used to
// come from one place only: the REFERRAL_SERVICES array in
// lib/templates/referrals.mjs, a copy of the practice's pages made once. The
// practice keeps the real list in the Notebook, under "Referral pathways" —
// including a folder called "All Clinic types and their specialities" that
// records, for every referral it makes, exactly what goes in the two e-RS
// boxes. Anything added there after the copy was made was invisible: the
// reader asked about a referral the practice had written down and was told
// "not recorded in the practice's notes".
//
// So the pathway pages are read here, every turn, and consulted BEFORE the
// array. A pathway the practice records is answerable the moment they save it,
// and it wins over the array when the two disagree, because the Notebook is the
// practice's and the array is ours.
//
// WHAT IS READ. Only pages whose Notebook path passes through a section named
// for referral pathways or clinic types (see PATHWAY_SECTION). Nothing in the
// rest of the Notebook is treated as a pairing, however much it looks like one.
//
// HOW A PAGE IS READ. The practice writes these pages by hand, in more than one
// shape, so three are understood and a page may use any of them:
//
//   1. A PAGE PER REFERRAL — the page title names the service and the body
//      carries labelled lines: "Speciality: Cardiology", "Clinic type:
//      Ischaemic Heart Disease", "Priority: Urgent", "Hospital: …".
//   2. A TABLE — a header row with a speciality column and a clinic type
//      column, one referral per row.
//   3. A LIST — one referral per line, the parts separated by a dash, a pipe
//      or a colon: "Hernia — Not Otherwise Specified — Hernias".
//
// Nothing is inferred: a field the page does not carry is left blank, and the
// card says so. Pure string handling, no database and no model, so it is
// directly testable and byte-identical on every asking.

const PATHWAY_SECTION = /referral\s+pathways?|clinic\s+types?/i;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The Notebook path of a page, as buildFullNotebookSources titles it:
// "Notebook: Referrals / Referral pathways / All Clinic types … / Hernia".
function pathOf(page) {
  return String(page?.docTitle || '').replace(/^notebook:\s*/i, '').split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
}

/** Is this Notebook page held under the practice's referral-pathways section? */
export function isPathwayPage(page) {
  const segments = pathOf(page);
  // The page's own title does not make it a pathway page; a section above it does.
  return segments.slice(0, -1).some((seg) => PATHWAY_SECTION.test(seg));
}

/* ------------------------------------------------------------ the fields */

// The labels the practice writes, mapped to the field they set. Several
// spellings per field, because "speciality" and "specialty" are both in use
// on the same pages.
const LABELS = [
  ['specialty', /^(?:e-?rs\s+)?special(?:i)?ty(?:\s+area)?$/i],
  ['clinicType', /^clinic\s*type$/i],
  ['priority', /^priority$/i],
  ['hospital', /^(?:hospital|trust|provider)$/i],
  ['pathway', /^(?:service|pathway|e-?rs\s+service|service\s+name)$/i],
  ['form', /^(?:form|referral\s+form|letter|template)$/i],
  ['to', /^(?:e-?mail|e-?mail\s+to|send\s+to|address|email\s+address)$/i],
  ['route', /^(?:route|sent\s+(?:by|via|on)|via|how|method)$/i],
  ['note', /^(?:notes?|nb|remember|warning|caveat)$/i],
  ['aliases', /^(?:aliases|also\s+(?:called|known\s+as)|aka|other\s+names)$/i],
];

function labelOf(key) {
  const k = String(key || '').replace(/[*_`]/g, '').trim();
  for (const [field, re] of LABELS) if (re.test(k)) return field;
  return null;
}

const clean = (s) => String(s || '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

// A labelled line: "Speciality: Cardiology", "**Clinic type** – Hernias".
const LABELLED = /^\s*(?:[-*•+]\s+)?([A-Za-z][A-Za-z -]{1,30}?)\s*(?::|—|–|-)\s+(.+?)\s*$/;

function readLabelled(line) {
  const m = LABELLED.exec(line);
  if (!m) return null;
  const field = labelOf(m[1]);
  if (!field) return null;
  return { field, value: clean(m[2]) };
}

// "Sent by email" / "route: email" — anything naming email is the emailed
// route; everything else is e-RS, which is the default.
const routeOf = (value) => (/e-?mail|accurx/i.test(String(value || '')) ? 'email' : 'ers');

const isCancer = (entry) => /\b2\s*ww\b|two\s+week/i.test([entry.priority, entry.specialty, entry.clinicType].join(' '));

function finish(entry, page, line) {
  const out = {
    name: clean(entry.name),
    route: entry.route ? routeOf(entry.route) : (entry.to ? 'email' : 'ers'),
    specialty: clean(entry.specialty),
    clinicType: clean(entry.clinicType),
    priority: clean(entry.priority),
    hospital: clean(entry.hospital),
    pathway: clean(entry.pathway),
    form: clean(entry.form),
    to: clean(entry.to),
    note: clean(entry.note),
    aliases: String(entry.aliases || '').split(/[,;/]/).map(clean).filter(Boolean),
    fromNotebook: true,
    page: String(page?.docTitle || ''),
    line: clean(line),
  };
  out.cancer = isCancer(out);
  return out;
}

/* ------------------------------------------------------------- the shapes */

// 1. A page per referral: the title is the service, the body labels the fields.
function readPageAsEntry(page) {
  const title = pathOf(page).pop() || '';
  const entry = { name: title.replace(/\s*referrals?\b\s*(?=\(|$)/i, '').trim() || title };
  let found = 0;
  let firstLine = '';
  for (const raw of String(page.text || '').split(/\r?\n/)) {
    const read = readLabelled(raw);
    if (!read) continue;
    if (entry[read.field] == null) { entry[read.field] = read.value; found++; if (!firstLine) firstLine = raw; }
  }
  if (!found || (!entry.specialty && !entry.clinicType && !entry.to && !entry.route)) return null;
  return finish(entry, page, firstLine);
}

// 2. A markdown table with a speciality and a clinic-type column.
function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(clean);
}

const isRule = (cells) => cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '');

function readTables(page) {
  const lines = String(page.text || '').split(/\r?\n/);
  const out = [];
  let header = null;
  for (const raw of lines) {
    if (!/\|/.test(raw)) { header = null; continue; }
    const cells = splitRow(raw);
    if (isRule(cells)) continue;
    if (!header) {
      const columns = cells.map((c) => labelOf(c));
      if (!columns.includes('specialty') && !columns.includes('clinicType')) { continue; }
      // The name column is the first one that is not a known field.
      const nameAt = columns.findIndex((c) => !c);
      header = { columns, nameAt: nameAt === -1 ? 0 : nameAt };
      continue;
    }
    const entry = { name: cells[header.nameAt] || '' };
    if (!entry.name) continue;
    header.columns.forEach((field, i) => { if (field && i !== header.nameAt && cells[i]) entry[field] = cells[i]; });
    if (!entry.specialty && !entry.clinicType && !entry.to && !entry.route) continue;
    out.push(finish(entry, page, raw));
  }
  return out;
}

// 3. A list: "Name — Speciality — Clinic type", "Name: Speciality / Clinic type".
// Two parts at least, and the first must not be one of the labels above —
// "Speciality: Cardiology" is a field of the page, not a referral called
// Speciality.
//
// ONLY LIST ITEMS. A heading, a sentence or a paragraph is not a referral,
// however many dashes it has in it: "#### Follow-up Appointments
// (Physiotherapy referral - FCP) ..." was being read as a referral called
// "#### Follow-up Appointments (Physiotherapy referral" with a speciality of
// "FCP)". So the line has to carry a bullet or a number, and a part with an
// unclosed bracket is a sentence cut in half, not a name.
const unbalanced = (s) => (s.match(/\(/g) || []).length !== (s.match(/\)/g) || []).length;

function readListLines(page) {
  const out = [];
  for (const raw of String(page.text || '').split(/\r?\n/)) {
    if (/\|/.test(raw)) continue;
    if (!/^\s*(?:[-*•+]|\d+[.)])\s+/.test(raw)) continue;
    const line = raw.replace(/^\s*(?:[-*•+]|\d+[.)])\s+/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s+(?:—|–|->|→)\s+|\s*:\s+|\s+-\s+/).map(clean).filter(Boolean);
    if (parts.length < 2) continue;
    if (labelOf(parts[0])) continue;
    const [name, specialty, clinicType, ...rest] = parts;
    if (!name || name.length > 60) continue;
    if (/^#/.test(name) || unbalanced(name) || unbalanced(specialty)) continue;
    out.push(finish({ name, specialty, clinicType: clinicType || '', note: rest.join(' — ') }, page, raw));
  }
  return out;
}

/**
 * Every referral pathway the Notebook records, read from the pathway pages.
 *
 * @param {Array} pages the Notebook, as loaded for this turn (buildFullNotebookSources shape)
 */
export function readPathways(pages = []) {
  const out = [];
  for (const page of pages || []) {
    if (!isPathwayPage(page)) continue;
    const whole = readPageAsEntry(page);
    if (whole) { out.push(whole); continue; }
    const tables = readTables(page);
    if (tables.length) { out.push(...tables); continue; }
    out.push(...readListLines(page));
  }
  return out;
}

/* ------------------------------------------------------------ the lookup */

// What the reader might have called it. The trailing word "referral" is the
// reader's, not the practice's; "(2WW)" and "/ community nurse" are the
// practice's alternatives and each is a name in its own right.
function namesOf(entry) {
  const names = new Set();
  const add = (s) => {
    const base = norm(s).replace(/\s*referrals?$/, '').replace(/^referrals?\s+(?:to|for)\s+/, '').trim();
    if (base.length >= 2) names.add(base);
  };
  add(entry.name);
  for (const part of String(entry.name).split(/\s*\/\s*|\s*\(|\)\s*/)) add(part);
  for (const alias of entry.aliases || []) add(alias);
  return [...names];
}

function variantsOf(name) {
  const base = norm(name).replace(/\s*referrals?$/, '').trim();
  if (!base) return [];
  const out = new Set([base]);
  if (base.endsWith('s')) out.add(base.slice(0, -1)); else out.add(base + 's');
  return [...out];
}

const wordMatch = (hay, needle) => new RegExp('\\b' + escapeRe(needle) + '\\b').test(hay);

/**
 * The pathway the Notebook records for this referral, or null.
 *
 * Matched first on the name the model read off the message, then on the words
 * of the question itself — longest recorded name wins, whole words only, so
 * "OT" never matches inside "Orthopaedics".
 */
export function findPathwayReferral({ name = '', question = '', pages = [] } = {}) {
  const entries = readPathways(pages);
  if (!entries.length) return null;

  const wanted = variantsOf(name);
  let best = null;
  for (const entry of entries) {
    for (const n of namesOf(entry)) {
      const byName = wanted.some((v) => v === n || (v.length > 3 && wordMatch(n, v)) || (n.length > 3 && wordMatch(v, n)));
      const byQuestion = n.length >= 3 && wordMatch(norm(question), n);
      if (!byName && !byQuestion) continue;
      const score = (byName ? 1000 : 0) + n.length;
      if (!best || score > best.score) best = { entry, score };
    }
  }
  return best ? best.entry : null;
}
