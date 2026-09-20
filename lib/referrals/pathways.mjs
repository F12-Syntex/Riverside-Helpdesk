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
// nothing passed this test, no pathway was read at all, and every referral card
// fell back to the copied array in lib/templates/referrals.mjs — which still
// says "Not Otherwise Specified" where the practice's hernia page now says
// "Surgery - Not Otherwise Specified". The section name is theirs to change, so
// every name it has carried is matched here.
const PATHWAY_SECTION = /referral\s+pathways?|pathway\s+cards?|clinic\s+types?/i;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  return found.map((b) => finish({
    ...b.fields,
    name: b.name || pageName,
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

/* ------------------------------------------------------------ the lookup */

// What the reader might have called it. The trailing word "referral" is the
// reader's, not the practice's; "(2WW)" and "/ community nurse" are the
// practice's alternatives and each is a name in its own right. Bracketed
// conditions on a block title — "(IF ONLY physiotherapy IS MENTIONED)" — are
// instructions, not names, and are left out.
function namesOf(entry) {
  const names = new Set();
  const add = (s) => {
    const base = norm(s).replace(/\s*referrals?$/, '').replace(/^referrals?\s+(?:to|for)\s+/, '').trim();
    if (base.length >= 2) names.add(base);
  };
  add(entry.name);
  for (const part of String(entry.name).split(/\s*\/\s*|\s*\(|\)\s*/)) {
    if (/\b(?:if|only|same as|when|unless)\b/i.test(part)) continue;
    add(part);
  }
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
// "physio" against "physiotherapy": the asked word is the start of a recorded
// word. Five letters at least, so "ot" and "ent" never open a prefix.
const prefixMatch = (hay, needle) => needle.length >= 5 && new RegExp('\\b' + escapeRe(needle) + '\\w*').test(hay);

// THE WORDS THE READER ACTUALLY SAID.
//
// The dermatology page records "Normal Dermatology", "Normal Telederm" and
// "Normal Community Dermatology", and the name read off the message is the
// bare service: "dermatology". All three fit that word equally well, so the
// tie fell to the shortest recorded name and "community dermatology referral"
// came back as the card for the first hospital that is NOT a community one —
// the opposite of what was asked, with nothing on the card to say so.
//
// What tells those three apart is the qualifier the reader used, and it is in
// the question even where the extracted name dropped it. So a recorded name is
// credited with every word of its own that the question carries, and that
// count breaks the tie before the length of the name does.
const SAID_SKIP = new Set(['referral', 'referrals', 'the', 'and', 'for', 'to', 'of', 'a', 'an']);
// How much of a recorded name the question carries, and how much of it the
// reader never mentioned. The second half matters as much as the first: on a
// page of variants the plain pathway is the one with the fewest words nobody
// asked for, which is what makes "dermatology referral" the normal card rather
// than a toss-up with the community one.
function wordScore(recorded, asked) {
  const words = asked.split(' ').filter(Boolean);
  let hits = 0;
  let missed = 0;
  for (const word of String(recorded).split(' ')) {
    if (word.length < 3 || SAID_SKIP.has(word)) continue;
    // Whole word, or either is the start of the other: "telederm" is how the
    // practice writes what the reader asks for as "teledermatology".
    if (wordMatch(asked, word) || words.some((q) => q.length >= 5 && (word.startsWith(q) || q.startsWith(word)))) hits++;
    else missed++;
  }
  return { hits, missed };
}

/**
 * How well a recorded name fits what was asked. Zero is no fit.
 *
 * Exact beats whole-word beats prefix; within a tier the SHORTER recorded name
 * wins, because it is the closer fit to the words the reader used — "physio"
 * should land on "Physiotherapy", not on "Extended Scope Physiotherapy".
 */
function fit(recorded, wanted, question) {
  let tier = 0;
  if (wanted.some((v) => v === recorded)) tier = 4;
  else if (wanted.some((v) => (v.length > 3 && wordMatch(recorded, v)) || (recorded.length > 3 && wordMatch(v, recorded)))) tier = 3;
  else if (recorded.length >= 3 && wordMatch(question, recorded)) tier = 2;
  else if (wanted.some((v) => prefixMatch(recorded, v)) || prefixMatch(question, recorded)) tier = 1;
  if (!tier) return 0;
  return tier * 1000 - Math.min(recorded.length, 999);
}

// Did the reader ask for a two week wait? The words a task uses for one, and
// nothing looser: "urgent" on its own is a priority the practice sets on plenty
// of routine referrals and is not a cancer pathway.
// What actually gets typed into e-RS, as one string. The hospital rule is part
// of it: the dermatology page's five pathways share two pairings between them
// and are told apart by nothing else.
export const pairingOf = (e) => [e.specialty, e.clinicType, e.hospital, e.hospitalRule]
  .map((s) => String(s || '').toLowerCase()).join('|');

const ASKED_CANCER = /\b2\s*ww\b|\btwo[\s-]?week\b|\bfast[\s-]?track\b|\bcancer\b|\bmalignan\w*|\bneoplas\w*/i;

/**
 * Every pathway the Notebook records that fits this referral, best first.
 * Page order breaks ties, which is the order the practice wrote them in — on
 * the physio page the standard clinic comes before ESP, as the page intends.
 */
export function findPathwayReferrals({ name = '', question = '', variant = '', pages = [] } = {}) {
  const entries = readPathways(pages);
  if (!entries.length) return [];
  const q = norm(question);
  // THE ROW THE MODEL READ, COPIED OFF THE PAGE. It saw the page in full, so
  // where it hands back the heading it took the answer from, that heading is
  // not a word to interpret: it either names a pathway this page records or it
  // does not. A match on it outranks every other signal, because every other
  // signal is a reconstruction of what this one says outright.
  const asked = norm(variant);
  const wanted = variantsOf(name);
  // A QUESTION WORD THAT ENDS IN THE NAME IS A MORE SPECIFIC NAME FOR IT:
  // "teledermatology" for "dermatology". The model reads the bare service off
  // the message, so where the reader was more specific than that, the specific
  // word survives only in the question — and it is the whole of what they
  // asked for.
  for (const word of q.split(' ')) {
    if (word.length > 4 && wanted.some((v) => v.length >= 5 && word !== v && word.endsWith(v))) wanted.push(word);
  }
  // A CANCER PATHWAY IS NEVER THE ANSWER TO A QUESTION THAT DID NOT ASK FOR ONE.
  // The dermatology page records "Normal Dermatology" and "2WW Dermatology", and
  // both fit the word "dermatology" equally well — so the shorter name won and
  // "dermatology referral" came back as the 2WW card, headed "Priority is 2WW,
  // never Routine". That is a routine referral sent down the cancer pathway, and
  // the reader has no way of knowing the page held anything else. Agreement on
  // the two week wait therefore breaks the tie before the length of the name
  // does, in both directions: asked for, a 2WW pathway rises; unasked, it sinks.
  const askedCancer = ASKED_CANCER.test(`${name} ${question}`);
  // The qualifier is counted against the QUESTION alone, never the extracted
  // name: the name is where the qualifier was lost, and "dermatology" in it
  // would hand the generic pathway a free word on a question that asked for
  // teledermatology.
  const scored = [];
  entries.forEach((entry, order) => {
    // Exact, or the heading with the page's own extra words around it:
    // "Normal Community Dermatology" against a row called "Normal Community".
    const named = asked ? namesOf(entry).some((n) => n === asked
      || (n.length >= 5 && (asked.includes(n) || n.includes(asked)))) : false;
    let best = 0;
    let said = 0;
    let unsaid = 99;
    for (const n of namesOf(entry)) {
      best = Math.max(best, fit(n, wanted, q));
      const { hits, missed } = wordScore(n, q);
      if (hits > said || (hits === said && missed < unsaid)) { said = hits; unsaid = missed; }
    }
    if (best || named) scored.push({ entry, score: best, order, said, unsaid, named: named ? 1 : 0, agrees: (!!entry.cancer === askedCancer) ? 1 : 0 });
  });
  // Tier first (it is what the reader's words actually matched), then agreement
  // on the two week wait, then how much of the recorded name the reader said,
  // then how much of it they did not, then the length of the name, then the
  // page's order.
  const tierOf = (n) => Math.ceil(n / 1000);
  scored.sort((a, b) => b.named - a.named || tierOf(b.score) - tierOf(a.score) || b.agrees - a.agrees
    || b.said - a.said || a.unsaid - b.unsaid || b.score - a.score || a.order - b.order);
  // NOTHING IN THE QUESTION CHOSE BETWEEN THEM.
  //
  // Two pathways on one page, both fitting every word the reader wrote, and a
  // different pairing on each: the sort still has to put one first, and it
  // does — on the length of a name, which is not a reason. The card is told,
  // so it can say so rather than present a coin toss as the answer.
  const [top, next] = scored;
  if (top && next && !top.named && next.entry.page === top.entry.page
    && next.score === top.score && next.agrees === top.agrees && next.said === top.said && next.unsaid === top.unsaid
    && pairingOf(next.entry) !== pairingOf(top.entry)) {
    top.entry.ambiguous = true;
  }
  return scored.map((s) => s.entry);
}

/**
 * The pathway the Notebook records for this referral, or null.
 *
 * Matched first on the name the model read off the message, then on the words
 * of the question itself — whole words, or the asked word as the start of a
 * recorded one, so "OT" never matches inside "Orthopaedics" and "physio" does
 * find "Physiotherapy".
 */
export function findPathwayReferral(args = {}) {
  return findPathwayReferrals(args)[0] || null;
}
