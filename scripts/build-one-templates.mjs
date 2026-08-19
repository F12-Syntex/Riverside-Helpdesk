// Turns Primary Care IT's OneTemplate page specifications into the dataset
// behind the template-page half of the Contract template card
// (lib/referrals/one-templates.data.json).
//
//   npm run data:one-templates
//
// WHAT THESE DOCUMENTS ARE, AND WHY THEY ARE NOT THE SITREP. The Sitrep table
// (scripts/build-nel-contracts.mjs) answers one question: which EMIS template
// records which NEL contract. It names templates and, in brackets, sometimes a
// page — "OneTemplate NonPrescriber (Wound Care page)" — and nothing else. It
// cannot say what is ON a template, so "which template do I use for a firearms
// request" or "where do I record an ambulance" found nothing: neither is a
// commissioned contract and neither appears anywhere in that table.
//
// These four documents are the other half. Primary Care IT publish, per
// launcher, the pages each OneTemplate carries and — in the admin and nursing
// ones — a line saying what each page is for. Together with the Sitrep they let
// the command answer both questions a reader actually asks: which template
// records this contract, and which template has the page for this job.
//
// HOW THEY ARE READ. Word stores a paragraph's text in <w:t> runs and its
// formatting beside it, so the paragraphs are walked in document order and each
// is tagged with three facts that matter: whether it is bold or underlined
// (PCIT use both for the headings that name a template or a group), whether it
// is a list item, and its list LEVEL. Nothing is inferred from indentation or
// spacing, which these four documents do not use consistently.
//
// THE LEVEL IS WHAT MAKES AN ANSWER FINDABLE. PCIT nest their lists: level 0 is
// a page of the template, level 1 is what is on that page. "Injections" is not a
// page — it is an entry on the Treatment Room page of OneTemplate NonPrescriber
// — and being told the template alone leaves a reader opening it and scrolling.
// So a level-1 line carries the level-0 line above it as its heading, and the
// card can say where to find it rather than only which template it is in.
//
// THE HEADINGS ARE MAPPED BY HAND, ON PURPOSE. Every bold/underlined heading in
// every document is listed in SOURCES below, against the template or group it
// introduces. A heading in the source that is not in the table is a hard error
// rather than a line filed under whatever came before it: these documents get
// reissued, and a silently mis-filed page is a reader sent to the wrong
// template. The ARRS document bolds nearly every line, so its headings are
// listed exhaustively and everything else is a page of that one template.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SOURCE_DIR = path.join(ROOT, 'rag', 'sources');
const OUT = path.join(ROOT, 'lib', 'referrals', 'one-templates.data.json');

// The day these four documents were handed over by PCIT. Carried onto every
// card for the same reason the Sitrep's date is: a page list is a snapshot of a
// system somebody is actively building.
const CAPTURED_AT = '2026-08-19';

const T = {
  admin: { name: 'OneTemplate Admin', launcher: 'OneLauncher Admin', audience: 'Admin and reception' },
  prescriber: { name: 'OneTemplate Prescriber', launcher: 'OneLauncher Prescriber', audience: 'Prescribing clinicians' },
  nonPrescriber: { name: 'OneTemplate NonPrescriber', launcher: 'OneLauncher NonPrescriber', audience: 'Nursing team' },
  acute: { name: 'OneTemplate Acute', launcher: 'OneLauncher Prescriber or NonPrescriber', audience: 'Anyone in an acute consultation' },
  arrs: {
    name: 'OneTemplate Additional Roles',
    launcher: 'OneLauncher Additional Roles',
    audience: 'Additional roles team (ARRS)',
    aka: ['One Launcher Additional Roles', 'One Additional Roles & Care Planning'],
  },
  coding: { name: 'OneTemplate Coding', launcher: 'OneLauncher Admin', audience: 'Anyone coding a letter' },
  procedure: { name: 'OneProcedure', launcher: 'OneLauncher', audience: 'Anyone running a procedure clinic' },
  travel: { name: 'OneTravel', launcher: 'OneLauncher', audience: 'Travel clinic' },
  calculator: { name: 'OneCalculator', launcher: 'OneLauncher', audience: 'Anyone scoring a patient' },
  contract: { name: 'OneContract', launcher: 'OneLauncher', audience: 'Anyone recording contract activity' },
};

// heading → what it introduces. `template` files the lines under it against a
// template (several, where PCIT document one page list for two); `group` files
// them under the template already in force, with the heading kept as the group;
// `skip` is for headings that are neither — a stray image anchor, a note.
const SOURCES = [
  {
    file: 'PCIT DT003 EMIS OneTemplate Pages v1.1.docx',
    document: 'EMIS OneTemplate Pages (DT003 v1.1)',
    headings: {
      'OneTemplate Admin (via OneLauncher Admin)': { templates: [T.admin] },
      'OneTemplate Prescriber & NonPrescriber (via OneLauncher Prescriber or OneLauncher NonPrescriber)':
        { templates: [T.prescriber, T.nonPrescriber] },
      LTCs: { group: 'Long-term conditions' },
      'NonPrescriber Extras:': { templates: [T.nonPrescriber], group: 'NonPrescriber extras' },
      'Vaccinations > 5y': { page: true },
      'Wound Care': { page: true },
      'OneTemplate Acute(via OneLauncher Prescriber or NonPrescriber)': { templates: [T.acute] },
      'More OneTemplates': { names: true },
    },
  },
  {
    file: 'PCIT OneTemplate Admin Templates.docx',
    document: 'Admin Templates',
    headings: {
      'Admin One Template': { templates: [T.admin] },
      'Eligibilty checkers': { group: 'Eligibility checkers' },
      'Coding Resources': { templates: [T.coding] },
      Shortcuts: { group: 'Shortcuts' },
    },
  },
  {
    file: 'PCIT OneTemplate Non Prescriber Templates.docx',
    document: 'Non Prescriber Templates',
    headings: {
      'One template – Non Prescriber – Nursing Team': { skip: true },
      'AS THE TEMPLATES ARE DYNAMIC THEY WILL ONLY SHOW IF RELEVANT TO THE PATIENT': { skip: true },
      'One Template': { templates: [T.nonPrescriber] },
      'OneTemplate Acute': { templates: [T.acute] },
      'OneCalculator (Clinical calculators)': { templates: [T.calculator] },
      OneContract: { templates: [T.contract] },
      'More Templates': { names: true },
      'Resources page': { templates: [T.nonPrescriber], group: 'Resources page' },
      'Shows the relevant and contracts outstanding pages as listed above.': { skip: true },
    },
  },
  {
    file: 'PCIT OneTemplate ARRS Templates.docx',
    document: 'ARRS Templates',
    headings: {
      'One Launcher Additional Roles': { templates: [T.arrs] },
      OneProcedure: { templates: [T.procedure] },
      OneContract: { templates: [T.contract] },
      'Shows the relevant and contracts outstanding pages to update contract information': { skip: true },
      'Care plans': { templates: [T.arrs], group: 'Care plans' },
    },
    // This document bolds its page names as well as its headings, so bold alone
    // cannot say which is which. Only the headings above are headings; every
    // other line is a page of whichever template is in force.
    boldIsNotAHeading: true,
  },
];

// An anchored image leaves its position on the paragraph text — "0-914400" and
// "right9060048", a placement and the offsets in EMUs. Nothing else in these
// documents starts with a run of digits, so the prefix is dropped and a
// paragraph that was nothing else is dropped with it.
const IMAGE_ANCHOR = /^(?:left|right|top|bottom|centre|center)?-?\d[\d-]{4,}/;

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** The paragraphs of a .docx, in order, each with the two flags that matter. */
async function paragraphs(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file('word/document.xml').async('string');
  const out = [];
  for (const chunk of xml.split(/(?<=<\/w:p>)/)) {
    const text = clean(
      chunk.replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
    ).replace(IMAGE_ANCHOR, '').trim();
    if (!text) continue;
    const level = /<w:ilvl w:val="(\d+)"/.exec(chunk);
    out.push({
      text,
      strong: chunk.includes('<w:b/>') || chunk.includes('<w:u '),
      list: chunk.includes('<w:numPr>'),
      level: level ? Number(level[1]) : -1,
    });
  }
  return out;
}

/** "Firearms request – to update information about…" → name and detail. */
function splitEntry(text) {
  const at = text.search(/\s[–—-]\s/);
  if (at === -1) return { name: text, detail: '' };
  const name = clean(text.slice(0, at));
  const detail = clean(text.slice(at).replace(/^\s*[–—-]\s*/, ''));
  // A dash inside a name ("Audt-C and referral on if needed") is not a split:
  // the part after it has to read as a sentence about the part before it.
  if (!name || !detail || name.length < 3) return { name: text, detail: '' };
  return { name, detail };
}

// Pages arrive from two documents with two spellings — DT003's "Firearm
// Requests" and the admin document's "Firearms request" — so they are matched
// on a key that ignores case, punctuation and a trailing plural.
const key = (name) => String(name || '').toLowerCase()
  // PCIT write the family name both ways — "One Template Coding" and
  // "OneTemplate Coding" — so the space inside it is closed before matching.
  .replace(/\bone\s+(template|procedure|travel|calculator|contract|launcher)\b/g, 'one$1')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  .split(' ').map((w) => w.replace(/s$/, '')).join(' ');

async function main() {
  const templates = new Map(); // name → record
  const known = new Map(Object.values(T).map((t) => [t.name, t]));
  const documents = [];
  let errors = 0;

  const byName = (text) => known.get(text)
    || [...known.values()].find((x) => key(x.name) === key(text)
      || (x.aka || []).some((a) => key(a) === key(text)));

  const record = (t, doc) => {
    if (!templates.has(t.name)) {
      templates.set(t.name, {
        name: t.name, launcher: t.launcher, audience: t.audience, about: '', documents: [], pages: [],
      });
    }
    const row = templates.get(t.name);
    if (doc && !row.documents.includes(doc)) row.documents.push(doc);
    return row;
  };

  for (const source of SOURCES) {
    const file = path.join(SOURCE_DIR, source.file);
    if (!fs.existsSync(file)) {
      console.error(`[one-templates] missing source: ${source.file}`);
      errors++;
      continue;
    }
    documents.push({ title: source.document, file: source.file });
    const paras = await paragraphs(file);
    const seen = new Set();
    let current = [];        // the templates lines are being filed against
    let group = '';          // the group heading in force, if any
    let heading = '';        // the page a nested line sits on
    let namesOnly = false;   // under "More OneTemplates": a list of template names

    for (const para of paras) {
      const rule = Object.prototype.hasOwnProperty.call(source.headings, para.text)
        ? source.headings[para.text] : null;

      if (rule) {
        seen.add(para.text);
        if (rule.skip) continue;
        if (rule.page) {
          // A heading that is really a page — PCIT bold two of the NonPrescriber
          // extras. Filed like any other line under the template in force.
          for (const row of current) row.pages.push({ name: para.text, detail: '', group, document: source.document });
          continue;
        }
        namesOnly = Boolean(rule.names);
        if (rule.templates) {
          current = rule.templates.map((t) => record(t, source.document));
          group = rule.group || '';
          heading = '';
        } else if (rule.group) {
          group = rule.group;
          heading = '';
        }
        continue;
      }

      // Not a heading. In every document but the ARRS one, a bold line that is
      // not in the table is a heading nobody mapped — which is the failure this
      // script exists to make loud.
      if (para.strong && !source.boldIsNotAHeading && !para.list) {
        console.error(`[one-templates] unmapped heading in ${source.file}: "${para.text}"`);
        errors++;
        continue;
      }

      if (namesOnly) {
        // "More OneTemplates" / "More Templates" list the other templates, and
        // in the nursing document each is followed by its own pages. So a line
        // naming a template switches to it, and anything after it belongs to
        // that template rather than to the one before the heading.
        const named = byName(para.text);
        if (named) { current = [record(named, source.document)]; group = ''; heading = ''; continue; }
        // A name PCIT list without a page list of their own. Recorded as a
        // template with no pages, which is what the document actually says —
        // better than filing its name under whatever came before it.
        if (/^one\b/i.test(para.text)) {
          current = [record({ name: para.text, launcher: '', audience: '' }, source.document)];
          group = '';
          heading = '';
          continue;
        }
        // A line under a named template that starts mid-sentence is PCIT saying
        // what that template is FOR ("to be used by your additional roles team
        // members…"), not naming a page on it.
        if (/^[a-z]/.test(para.text)) {
          for (const row of current) if (!row.about) row.about = para.text;
          continue;
        }
      }

      if (!current.length) continue;
      const { name, detail } = splitEntry(para.text);

      // Level 0 is a page; deeper is something ON that page, which keeps the
      // page as its heading. A level-0 line named after the template itself is
      // the document repeating its own title, so its children hang off nothing.
      if (para.level <= 0) {
        heading = key(name) === key(current[0].name) ? '' : name;
        for (const row of current) row.pages.push({ name, detail, heading: '', group, document: source.document });
        continue;
      }

      // A nested line that starts mid-sentence is describing the page above it,
      // not naming an entry on it ("shows all contract elements that are
      // relevant to your patient"). It becomes that page's description.
      if (/^[a-z]/.test(para.text) && heading) {
        for (const row of current) {
          const page = [...row.pages].reverse().find((p) => p.name === heading && !p.heading);
          if (page && !page.detail) page.detail = para.text;
        }
        continue;
      }

      for (const row of current) row.pages.push({ name, detail, heading, group, document: source.document });
    }

    for (const heading of Object.keys(source.headings)) {
      if (!seen.has(heading)) {
        console.error(`[one-templates] heading gone from ${source.file}: "${heading}"`);
        errors++;
      }
    }
  }

  // One row per page. Where two documents describe the same page, the longer
  // name wins and the detail is kept from whichever document gave one, because
  // only the admin and nursing documents describe their pages at all.
  for (const row of templates.values()) {
    const merged = new Map();
    for (const page of row.pages) {
      // Keyed on the heading too: "Vaccinations" is a page of its own AND an
      // entry on the OneProcedure list, and they are two different places to
      // look.
      const k = `${key(page.heading)}>${key(page.name)}`;
      if (!key(page.name) || key(page.name) === key(row.name)) continue;
      const prev = merged.get(k);
      if (!prev) { merged.set(k, { ...page, documents: [page.document] }); continue; }
      if (!prev.documents.includes(page.document)) prev.documents.push(page.document);
      if (page.name.length > prev.name.length) prev.name = page.name;
      if (!prev.detail && page.detail) prev.detail = page.detail;
      if (!prev.group && page.group) prev.group = page.group;
      if (!prev.heading && page.heading) prev.heading = page.heading;
    }
    row.pages = [...merged.values()].map(({ document, ...page }) => page);
  }

  const data = {
    source: 'Primary Care IT OneTemplate page specifications',
    publisher: 'Primary Care IT',
    clinicalSystem: 'EMIS Web',
    capturedAt: CAPTURED_AT,
    documents,
    templates: [...templates.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };

  if (errors) {
    console.error(`[one-templates] ${errors} problem(s) — nothing written.`);
    process.exit(1);
  }

  fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
  const pages = data.templates.reduce((n, t) => n + t.pages.length, 0);
  console.log(`[one-templates] wrote ${path.relative(ROOT, OUT)} — ${data.templates.length} templates, ${pages} pages`);
}

main().catch((e) => { console.error(e); process.exit(1); });
