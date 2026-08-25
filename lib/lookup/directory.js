// The Instant Lookup directory: one pre-saved, categorised list built from
// (a) the practice's own "Useful Telephone Numbers" data (lib/contacts.data.json)
// and (b) the curated list of hospitals relevant to The Riverside Practice
// (lib/lookup/hospitals.data.json). Numbers are shown verbatim from these files
// and are never authored by the AI — same guarantee as the contacts card.
//
// To update: edit either JSON file; this module only categorises and merges.

import CONTACTS from '../contacts.data.json';
import HOSPITALS from './hospitals.data.json';

export const CATEGORIES = [
  'Hospitals',
  'Departments and clinics',
  'Community and district nursing',
  'Mental health',
  'Pharmacies and supplies',
  'Transport',
  'IT and systems',
  'Social care and advocacy',
  'Other numbers',
];

// First matching rule wins, so put the more specific ones first.
const RULES = [
  ['Transport', /transport|ers medical|dhl/i],
  ['IT and systems', /\bemis\b|docman|smart ?card|it helpdesk|it tech|egton|apollo|open exeter|\bpce\b/i],
  ['Mental health', /mental health|crisis line|talking therap|psycholog|tavistock/i],
  ['Community and district nursing', /nurse|matron|d\/n|\bacn\b|midwife|health visitor|tissue viability/i],
  ['Social care and advocacy', /social|advocate|advocacy|language line|learning disabilit|safeguard/i],
  ['Pharmacies and supplies', /pharmac|prescription|gloves|sharps|incontinence pads|wheel|specsavers|hearing|audiology|eye test/i],
  ['Hospitals', /switchboard|\bhospital\b|\bhosp\b|hospice/i],
];

// Common abbreviations in the telephone-numbers sheet, expanded so a fuzzy
// search for the full word still finds the entry (and vice versa).
const ALIAS_WORDS = {
  huh: 'Homerton university hospital',
  rlh: 'Royal London hospital',
  uclh: 'University College London hospital',
  appt: 'appointment', appts: 'appointments',
  ref: 'referral',
  sec: 'secretary', secretaries: 'secretary',
  tele: 'telephone', tel: 'telephone',
  paed: 'paediatric children',
  gynae: 'gynaecology',
  derm: 'dermatology',
  physio: 'physiotherapy',
  top: 'termination of pregnancy',
  epau: 'early pregnancy assessment unit',
  gtt: 'glucose tolerance test',
  mh: 'mental health',
  ent: 'ear nose throat',
  'c&b': 'choose and book',
  'h/c': 'health centre',
  'd/n': 'district nurse',
};

// Plain hospital switchboards in the contacts sheet are superseded by the
// richer entries in hospitals.data.json — skip them to avoid duplicate rows.
const SKIP_LABELS = new Set([
  'rlh- switchboard',
  'homerton hospital',
  'uclh',
  'guys hosp switchboard',
  'whipps cross',
  'st leonards switchboard',
]);

function categorise(label) {
  for (const [cat, re] of RULES) if (re.test(label)) return cat;
  // Named departments/appointment/booking/results lines default to clinics;
  // bare personal names and one-offs fall through to Other.
  if (/appointment|appt|booking|clinic|screening|department|dept|results?|referral|\bref\b|radiolog|physio|colposcop|endoscop|cytolog|mammogram|smear|antenatal|fertility|cardiolog|dermatolog|gynae|paed|ent\b|surgery|surgical|breast|blood|respiratory|records|centre|practice|gp line|outpatient|starlight|airs|bpas|a&e|casualty/i.test(label)) {
    return 'Departments and clinics';
  }
  return 'Other numbers';
}

function aliasesFor(label) {
  const out = [];
  for (const [abbr, full] of Object.entries(ALIAS_WORDS)) {
    const esc = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Word-start match: "paed" hits "Paed physio" but not "orthopaedics".
    const tail = abbr.length <= 3 ? '\\b' : '';
    if (new RegExp('\\b' + esc + tail, 'i').test(label)) out.push(full);
  }
  return out;
}

let _directory = null;

export function getDirectory() {
  if (_directory) return _directory;
  const entries = [];
  let id = 0;

  for (const h of HOSPITALS) {
    entries.push({
      id: 'h' + id++,
      label: h.label,
      category: 'Hospitals',
      aliases: h.aliases || [],
      phones: h.phones || [],
      emails: h.emails || [],
      note: h.note || '',
      source: 'hospitals',
    });
  }

  const seen = new Set();
  for (const c of CONTACTS) {
    const label = String(c.label || '').trim();
    if (!label) continue;
    const norm = label.toLowerCase().replace(/\s+/g, ' ');
    if (SKIP_LABELS.has(norm)) continue;
    const key = norm + '|' + ((c.phones || [])[0]?.tel || '') + '|' + ((c.emails || [])[0] || '');
    if (seen.has(key)) continue; // the sheet has a few exact repeats
    seen.add(key);
    entries.push({
      id: 'c' + id++,
      label,
      category: categorise(label),
      // The abbreviations expanded from the label, plus any other names the
      // entry was written with. An entry only carries its own aliases when the
      // label cannot be reached from the words a reader would actually use —
      // "the surgery" for The Riverside Practice.
      aliases: [...aliasesFor(label), ...(c.aliases || [])],
      phones: c.phones || [],
      emails: c.emails || [],
      note: c.note || '',
      source: 'directory',
    });
  }

  _directory = entries;
  return entries;
}
