// The practice's own referral pathways, read from the Notebook.
//
// WHY THIS EXISTS. The practice keeps its referral pathways in the Notebook,
// under "Referral pathways" — including a folder called "All Clinic types and
// their specialities" that records, for every referral it makes, exactly what
// goes in the two e-RS boxes. Reading those pages into pairings is what lets
// the Notebook's own checks (lib/notebook/rules.mjs, lib/notebook/validate.mjs)
// say when a page records a referral without its speciality or clinic type, or
// when an edit lost one.
//
// WHAT IS READ. Only pages whose Notebook path passes through a section named
// for referral pathways or clinic types (see PATHWAY_SECTION). Nothing in the
// rest of the Notebook is treated as a pairing, however much it looks like one.
//
// HOW A PAGE IS READ. The practice writes these pages by hand, in more than one
// shape, so three are understood and a page may use any of them:
//
//   1. LABELLED BLOCKS — lines such as "Speciality: Cardiology", "Clinic type:
//      Ischaemic Heart Disease", "Location: St Leonard's". A page with one such
//      block is one referral named by the page title. A page with several —
//      each under its own heading, or under a bold bullet such as
//      "**Extended Scope Physiotherapy (ESP)**" — is several referrals, one
//      per block, each named by its heading. The physio page records three.
//      Labels may be bold: "**Clinic type:** Not otherwise specified" is how
//      the practice actually writes them.
//   2. A TABLE — a header row with a speciality column and a clinic type
//      column, one referral per row.
//   3. A LIST — one referral per bullet, the parts separated by a dash, a pipe
//      or a colon: "Hernia — Not Otherwise Specified — Hernias". Read ONLY
//      from a page that is nothing but such a list: a page of numbered steps
//      also has bullets with colons in them, and "Click the magnifying glass
//      — Shared folder" is not a referral called "Click the magnifying glass".
//
// Nothing is inferred: a field the page does not carry is left blank, and the
// card says so. Pure string handling, no database and no model, so it is
// directly testable and byte-identical on every asking.

// The practice renames its own sections. "Referral pathways" became "Pathway
// cards (A to Z)", and every card under it went invisible the moment it did:
// nothing passed this test and no pathway was read at all. The section name is
// theirs to change, so every name it has carried is matched here.
const PATHWAY_SECTION = /referral\s+pathways?|pathway\s+cards?|clinic\s+types?/i;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// The Notebook path of a page, as buildFullNotebookSources titles it:
// "Notebook: Referrals / Referral pathways / All Clinic types … / Hernia".
function pathOf(page) {
  // The segments as the Notebook holds them, when the source carries them: a
  // page whose own title has a slash in it survives only this way.
  if (Array.isArray(page?.path) && page.path.length) return page.path.map((s) => String(s).trim()).filter(Boolean);
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
// on the same pages. "Location" is what the physio page calls the hospital.
const LABELS = [
  ['specialty', /^(?:e-?rs\s+)?special(?:i)?ty(?:\s+area)?$/i],
  // "Clinic:" on its own is how two of the pages write the clinic type.
  ['clinicType', /^clinic(?:\s*type)?$/i],
  ['priority', /^priority$/i],
  // A COLUMN THAT NAMES NO HOSPITAL BUT SAYS HOW TO PICK ONE. The dermatology
  // page records five pathways whose speciality and clinic type repeat — what
  // separates them is a "Hospital Selection Rule" of "first hospital that isn't
  // a telederm", "first hospital that is a telederm", "first that is a community
  // hospital". Unread, that column took the one thing that told the five apart
  // with it: three pathways collapsed into one and the card sent every reader to
  // the first hospital on the list.
  ['hospitalRule', /^(?:which\s+(?:hospital|trust|provider|site)|(?:hospital|trust|provider|location|site|organisation|organization)(?:\s+(?:selection|choice)\s*(?:rules?)?|\s+rules?))$/i],
  ['hospital', /^(?:hospital|trust|provider|location|site|organisation|organization)$/i],
  ['pathway', /^(?:service|pathway|e-?rs\s+service|service\s+name)$/i],
  ['form', /^(?:form|referral\s+form|letter|template)$/i],
  ['to', /^(?:e-?mail|e-?mail\s+to|send\s+to|address|email\s+address)$/i],
  ['route', /^(?:route|sent\s+(?:by|via|on)|via|how|method)$/i],
  ['note', /^(?:notes?|nb|remember|warning|caveat)$/i],
  ['aliases', /^(?:aliases|also\s+(?:called|known\s+as)|aka|other\s+names)$/i],
];

// Markdown taken off a piece of text: bold, italics, code, inline HTML, and
// the stray "\*\*" the editor leaves behind.
const clean = (s) => String(s || '')
  .replace(/<[^>]+>/g, '')
  .replace(/\\\*/g, '')
  .replace(/[*_`]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function labelOf(key) {
  const k = clean(key);
  for (const [field, re] of LABELS) if (re.test(k)) return field;
  return null;
}

// A labelled line: "Speciality: Cardiology", "- **Clinic type:** Hernias",
// "**Location** – St Leonard's". The bold is taken off before the label is
// read, which is what lets a bold label count as a label.
const LABELLED = /^\s*(?:[-*•+]\s+)?([A-Za-z][A-Za-z -]{1,30}?)\s*(?::|—|–|-)\s+(.+?)\s*$/;

// A two-column table row is a labelled line standing sideways: the Endoscopy
// page writes "| **Speciality** | **Diagnostic Endoscopy** |" under an
// "Item | Selection" header. Read as "Speciality: Diagnostic Endoscopy".
const VERTICAL_ROW = /^\s*\|?\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|?\s*$/;

function readLabelled(raw) {
  let line = String(raw || '').replace(/\*\*([^*]+?)\*\*/g, '$1').replace(/__([^_]+?)__/g, '$1');
  const row = VERTICAL_ROW.exec(line);
  if (row && (line.match(/\|/g) || []).length <= 3 && labelOf(row[1])) line = `${clean(row[1])}: ${row[2]}`;
  const m = LABELLED.exec(line);
  if (!m) return null;
  const field = labelOf(m[1]);
  if (!field) return null;
  return { field, value: clean(m[2]) };
}

// "Sent by email" / "route: email" — anything naming email is the emailed
// route; everything else is e-RS, which is the default.
const routeOf = (value) => {
  const text = String(value || '');
  // NAMING e-RS BEATS MENTIONING EMAIL. The audiology card writes
  // "Route: e-RS (Step 2a). The form must carry the practice email." — the word
  // email there is about the form, not the route, and reading it as the route
  // sent every audiology referral out as an email the practice does not send.
  if (/\be-?rs\b/i.test(text)) return 'ers';
  return /e-?mail|accurx/i.test(text) ? 'email' : 'ers';
};

// A hospital field whose value tells the reader how to choose rather than which
// one to choose: "First hospital that isn't a telederm", "any site that is a
// community hospital", "must contain Telederm".
const RULE_SHAPED = /^(?:the\s+)?(?:first|last|next|any|each|every|whichever|pick|choose|select|use|must|not?\b|never|only)\b|\bthat\s+(?:is|isn|are|aren|does|do)\b/i;

const isCancer = (entry) => /\b2\s*ww\b|two\s+week/i.test([entry.priority, entry.specialty, entry.clinicType].join(' '));

// A bracketed instruction on a block title — "(IF ONLY physiotherapy IS
// MENTIONED)", "(SAME AS NORMAL physiotherapy)" — is guidance, not part of the
// name, and it would otherwise become the card's title.
const INSTRUCTION = /\s*\((?=[^)]*\b(?:if|only|same as|when|unless)\b)[^)]*\)/gi;

function finish(entry, page, line) {
  const out = {
    name: clean(entry.name).replace(INSTRUCTION, '').trim(),
    route: entry.route ? routeOf(entry.route) : (entry.to ? 'email' : 'ers'),
    specialty: clean(entry.specialty),
    clinicType: clean(entry.clinicType),
    priority: clean(entry.priority),
    hospital: clean(RULE_SHAPED.test(clean(entry.hospital)) ? '' : entry.hospital),
    // A hospital written as an instruction is a rule wherever it was written.
    // "Hospital: first one that isn't a telederm" is not the name of a hospital
    // and must never be drawn into the e-RS dropdown as though it were one.
    hospitalRule: clean(entry.hospitalRule) || clean(RULE_SHAPED.test(clean(entry.hospital)) ? entry.hospital : ''),
    pathway: clean(entry.pathway),
    form: clean(entry.form),
    to: clean(entry.to),
    note: clean(entry.note),
    aliases: [].concat(entry.aliases || []).flatMap((a) => String(a).split(/[,;/]/)).map(clean).filter(Boolean),
    fromNotebook: true,
    page: String(page?.docTitle || ''),
    line: clean(line),
  };
  out.cancer = isCancer(out);
  return out;
}

const hasPairing = (entry) => !!(entry.specialty || entry.clinicType || entry.to || entry.route);
const GENERIC_BLOCK = /^(?:e-?rs|e-?mail(?:ed)?)?\s*referrals?$/i;

/* ------------------------------------------------------------- the shapes */

// 1. Labelled blocks.
//
// A page is cut into blocks at every heading ("### Extended Scope …") and at
// every bullet that is a bold title with no label in it ("- **Standard
// Physiotherapy (IF ONLY physiotherapy IS MENTIONED)**"). Labelled lines are
// gathered into the block they fall in. Nested bullets under a bold title are
// what the practice actually writes, and they land in the right block because
// the title opened it.
const HEADING = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/;
const BOLD_TITLE = /^\s*(?:[-*•+]\s+)?\*\*(.+?)\*\*\s*:?\s*$/;

function readLabelledBlocks(page) {
  const title = pathOf(page).pop() || '';
  const blocks = [];
  let current = { name: '', fields: {}, firstLine: '' };
  const open = (name) => {
    if (Object.keys(current.fields).length) blocks.push(current);
    current = { name, fields: {}, firstLine: '' };
  };
  // A HEADING THAT IS ITSELF A LABEL. Several cards are written as "## Speciality"
  // with the value on the line below, rather than "Speciality: …" on one line.
  // Read as a block opener, such a page yielded no pairing at all — the standard
  // physiotherapy card, one of the most asked for, recorded nothing. So a heading
  // naming a field opens no block: it names the field the next written line fills.
  let pendingField = null;
  for (const raw of String(page.text || '').split(/\r?\n/)) {
    const heading = HEADING.exec(raw);
    if (heading) {
      pendingField = labelOf(heading[1]);
      if (!pendingField) open(clean(heading[1]));
      continue;
    }
    if (pendingField) {
      const value = clean(raw);
      if (value) {
        if (current.fields[pendingField] == null) { current.fields[pendingField] = value; if (!current.firstLine) current.firstLine = raw; }
        pendingField = null;
      }
      continue;
    }
    const read = readLabelled(raw);
    if (read) {
      if (current.fields[read.field] == null) { current.fields[read.field] = read.value; if (!current.firstLine) current.firstLine = raw; }
      continue;
    }
    const bold = BOLD_TITLE.exec(raw);
    if (bold && !labelOf(bold[1])) { open(clean(bold[1])); continue; }
  }
  if (Object.keys(current.fields).length) blocks.push(current);

  const found = blocks.filter((b) => hasPairing(b.fields));
  if (!found.length) return [];

  // "General surgery referral — hernias" is a page about hernias, not a
  // referral called "General surgery referral — hernias referral".
  const pageName = title.replace(/\s*\breferrals?\b/gi, '').replace(/\s+([—–-])\s+/g, ' $1 ').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim() || title;
  if (found.length === 1) {
    return [finish({ ...found[0].fields, name: pageName }, page, found[0].firstLine)];
  }
  // The words of the page title are how a reader names any of its blocks —
  // "physio" for a page titled "Physiotherapy (FCP) and Extended Scope
  // Physiotherapy" — so every block on a multi-block page carries them.
  const titleAliases = title.split(/\s*\/\s*|\s*\(|\)\s*|\s+and\s+/i).map(clean).filter((s) => s.length >= 2);
  // A block titled only with its route — the "e-RS referral" heading a typed
  // page's own card is drawn under — names no referral. Taken as the name it
  // titled the foot health card "e-RS referral referral"; the Service written
  // in the block, or the page, is what it is about.
  const nameOf = (b) => {
    if (b.name && !GENERIC_BLOCK.test(b.name)) return b.name;
    const service = clean(b.fields.pathway);
    return service && service.length <= 40 ? service : pageName;
  };
  return found.map((b) => finish({
    ...b.fields,
    name: nameOf(b),
    aliases: [].concat(b.fields.aliases || [], titleAliases),
  }, page, b.firstLine));
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
  // THE HEADING ABOVE A TABLE IS A NAME FOR ITS ROWS. The dermatology page is
  // five one-row tables, each under its own heading, and the name column says
  // "Normal Telederm" where the heading says "Normal Teledermatology". Read
  // from the column alone, "teledermatology referral" and "community
  // dermatology" matched nothing on a page that answers both: the heading is
  // how the practice titled the pathway and how a reader asks for it, so it is
  // carried as an alias of every row beneath it.
  let heading = '';
  for (const raw of lines) {
    if (!/\|/.test(raw)) {
      header = null;
      const h = HEADING.exec(raw);
      if (h && !labelOf(h[1])) heading = clean(h[1]);
      continue;
    }
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
    if (!hasPairing(entry)) continue;
    const aliases = [].concat(entry.aliases || []);
    if (heading && norm(heading) !== norm(entry.name)) aliases.push(heading);
    out.push(finish({ ...entry, aliases }, page, raw));
  }
  return out;
}

// 3. A list: "Name — Speciality — Clinic type", "Name: Speciality / Clinic type".
//
// ONLY ON A PAGE THAT IS A LIST AND NOTHING ELSE. The first version read every
// bullet on every pathway page and turned the steps on the BCG, Telederm and
// retinal pages into referrals called "Add", "Send", "Consultation" and "Click
// the magnifying glass", each with the rest of the sentence as its speciality.
// So a page with numbered steps, a heading, a table or a labelled line is
// never read this way, and a bullet is only a referral if it has at least two
// parts, the first of which is short, has balanced brackets and is not a label.
const unbalanced = (s) => (s.match(/\(/g) || []).length !== (s.match(/\)/g) || []).length;
const BULLET = /^\s*[-*•+]\s+/;

function isPlainList(page) {
  const lines = String(page.text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return false;
  return lines.every((l) => BULLET.test(l) && !readLabelled(l) && !/\|/.test(l));
}

function readListLines(page) {
  if (!isPlainList(page)) return [];
  const out = [];
  for (const raw of String(page.text || '').split(/\r?\n/)) {
    if (!BULLET.test(raw)) continue;
    const line = clean(raw.replace(BULLET, ''));
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
    const blocks = readLabelledBlocks(page);
    if (blocks.length) { out.push(...blocks); continue; }
    const tables = readTables(page);
    if (tables.length) { out.push(...tables); continue; }
    out.push(...readListLines(page));
  }
  return out;
}
