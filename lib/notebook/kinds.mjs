// What a Notebook note IS, and therefore how it is filled in, checked, shown
// and searched.
//
// THE PROBLEM THIS REPLACES. A page used to inherit its shape from the folder
// it sat in: tag "ERS referrals" as the e-RS screen and every page beneath it
// came back drawn as one. Three things were wrong with that. The format was a
// property of POSITION, so dragging a page out of the folder silently stopped
// it being a referral and nobody was told. The values were lifted out of the
// prose by a model AT ANSWER TIME, so the same page could be read two ways on
// two days — the single biggest threat to "the same referral is always
// formatted the same way". And a page that could not be rendered correctly
// (no speciality, no email address) was served anyway, as a picture of an
// empty form.
//
// THE KIND. A note now DECLARES what it is. The kind fixes the fields it
// holds, what "complete" means for it, how it is shown and what the search
// index sees. A person chooses it when the note is created; it is validated
// when the note is saved; and where the note sits in the tree means nothing.
//
// THE RULES THAT MAKE IT SAFE.
//   - Rendering is a pure function of the stored fields. No model is in the
//     render path, ever.
//   - A note that fails its own rules is stored as a DRAFT with its issues
//     named, and a draft is never served to a reader.
//   - Nothing converts a note from one kind to another on its own. A note that
//     looks like a referral gets a suggestion; it never gets rewritten.
//
// EVERY KIND KEEPS THE FREE TEXT. `body` on the note is the "differences from
// the standard process" prose, and it is shown under the fields exactly as the
// tagged card showed it. So a pathway's letter-creation steps are not lost,
// and everything that already reads `body` — defrag, analyse, coherence,
// snapshots, export — keeps working untouched.
import { ers, pathology, profMessage } from '../templates/blocks.mjs';

/**
 * A field descriptor: one box on the form, one row in the stored `fields`.
 *
 * DESCRIPTORS RATHER THAN A ZOD SCHEMA, because the same list has to drive
 * three things that must not drift apart — the editor's form, the save-time
 * validation and the text the model is shown. A schema would describe the
 * first of those and leave the other two to be written again by hand.
 *
 *   type   'text' one line, 'textarea' several, 'list' an array of strings
 *          (one per line in the editor), 'enum' a fixed choice.
 *   hint   the sentence under the box. It is what the practice reads at 9am
 *          with somebody at the desk, so it says what goes IN the box, not
 *          what the field is called.
 */
const f = (key, label, type, extra = {}) => ({ key, label, type, hint: '', placeholder: '', options: [], ...extra });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Everything a kind stores, empty. A field the practice has not filled in is
// '' or [], never undefined: an editor reading undefined renders an
// uncontrolled box, and a prompt reading it prints "undefined".
export function emptyFields(kind) {
  const def = noteKind(kind);
  const out = {};
  for (const field of def.fields) out[field.key] = field.type === 'list' ? [] : (field.type === 'enum' ? (field.options[0] || '') : '');
  return out;
}

/** Coerce whatever is stored (or posted) into exactly this kind's fields. */
export function normaliseFields(kind, raw) {
  const def = noteKind(kind);
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const field of def.fields) {
    const value = src[field.key];
    if (field.type === 'list') {
      out[field.key] = (Array.isArray(value) ? value : String(value == null ? '' : value).split('\n'))
        .map((item) => String(item == null ? '' : item).trim())
        .filter(Boolean)
        .slice(0, 40);
    } else if (field.type === 'enum') {
      const wanted = String(value == null ? '' : value).trim();
      out[field.key] = field.options.includes(wanted) ? wanted : (field.options[0] || '');
    } else {
      out[field.key] = String(value == null ? '' : value).trim().slice(0, field.type === 'textarea' ? 4000 : 400);
    }
  }
  return out;
}

const filled = (fields, key) => {
  const value = fields[key];
  return Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim());
};

// The "Route:" / "Speciality:" / "Send to" labels a pathway page written as
// prose carries. Two or more of them is what marks a plain note as one that a
// person should probably convert — a deterministic check, run on save, with no
// model in it. See suggestKind.
const CARD_MARKERS = [
  { kind: 'ersReferral', patterns: [/^\s*\**\s*route\s*:/im, /^\s*\**\s*speciality\s*:/im, /^\s*\**\s*specialty\s*:/im, /^\s*\**\s*clinic type\s*:/im, /^\s*\**\s*priority\s*:/im, /\be-?rs\b/i] },
  { kind: 'emailReferral', patterns: [/^\s*\**\s*send to\s*:/im, /[^\s@]+@[^\s@]+\.[^\s@]+/, /\baccurx\b/i, /^\s*\**\s*attach\s*:/im] },
  { kind: 'bloodTestSet', patterns: [/^\s*\**\s*tests?\s*:/im, /\|\s*code\s*\|/i, /\bclinical details\b/i, /\bblood (?:test|form)\b/i] },
];

/**
 * Does this plain note look like a card somebody wrote out by hand?
 *
 * Returns the kind it looks like, or ''. TWO OR MORE markers, because one
 * stray "Priority:" in a page about something else is not a referral. Nothing
 * acts on this: it puts a banner on the page offering to convert, and a person
 * decides. A suggestion never changes how a note is answered.
 */
export function suggestKind(body) {
  const text = String(body || '');
  if (!text.trim()) return '';
  let best = '';
  let bestScore = 0;
  for (const marker of CARD_MARKERS) {
    const score = marker.patterns.filter((re) => re.test(text)).length;
    if (score > bestScore) { best = marker.kind; bestScore = score; }
  }
  return bestScore >= 2 ? best : '';
}

/* ------------------------------------------------------------------ *
 * The kinds.
 *
 * A closed list. A new kind earns its place the same way a block does: the
 * reader is copying values into one particular screen, and a note that names
 * the values without drawing it leaves them hunting for the boxes.
 * ------------------------------------------------------------------ */

const NOTE = {
  id: 'note',
  label: 'Note',
  short: 'Note',
  summary: 'Free writing — whatever the practice wants to say',
  colour: { ink: '#425563', tint: '#f0f4f5', edge: '#aeb7bd' },
  icon: 'fileLines',
  fields: [],
  required: [],
  validate: () => [],
  render: () => null,
  searchText: (fields, note) => String(note?.title || ''),
  toContext: () => '',
};

const ERS_REFERRAL = {
  id: 'ersReferral',
  label: 'e-RS referral',
  short: 'e-RS',
  summary: 'One e-RS pathway — the values that go into "Search for a service"',
  colour: { ink: '#005eb8', tint: '#e8f1f8', edge: '#4a90c9' },
  icon: 'sitemap',
  fields: [
    f('service', 'Service', 'text', { hint: 'What this referral is for, as staff would say it — "Audiology / hearing test".' }),
    f('aliases', 'Also called', 'list', { hint: 'One per line. How somebody might ask for it: "hearing test", "audiology". These are searched exactly.' }),
    f('specialty', 'Speciality', 'text', { hint: 'Exactly as e-RS spells it — "Diagnostic Physiological Measurement".' }),
    f('clinicType', 'Clinic type', 'text', { hint: 'Exactly as e-RS spells it. Leave empty where the reader has to choose — put the choices below.' }),
    f('clinicTypeOptions', 'Clinic type — choices', 'list', { hint: 'Only where this card records a CHOICE. One per line, two or three at most.' }),
    f('clinicTypeCondition', 'Clinic type — rule', 'text', { hint: 'A rule against the clinic type — "Extended Scope only when the doctor has asked for it".' }),
    f('hospital', 'Hospital or service', 'text', { hint: 'A named site — "Homerton University Hospital". A rule for picking one goes below.' }),
    f('hospitalRule', 'Hospital — rule', 'text', { hint: 'How to pick it, where there is no one name — "the first hospital that is not a telederm".' }),
    f('pathway', 'Pathway to search for', 'text', { hint: 'A named RAS service to type into the search box.' }),
    f('priority', 'Priority', 'enum', { options: ['Routine', 'Urgent', '2WW'] }),
    f('requestType', 'Request type', 'enum', { options: ['Referral', 'Advice and Guidance'] }),
    f('form', 'Form', 'text', { hint: 'The letter template name — "AQP Direct Access".' }),
  ],
  required: ['service', 'specialty'],
  validate: (fields) => {
    const issues = [];
    if (!filled(fields, 'clinicType') && !filled(fields, 'clinicTypeOptions')) {
      issues.push({ field: 'clinicType', message: 'Give a clinic type, or the choices the reader picks between.' });
    }
    return issues;
  },
  render: (fields) => ers({
    requestType: fields.requestType || 'Referral',
    priority: fields.priority || 'Routine',
    specialty: fields.specialty,
    clinicType: fields.clinicType,
    clinicTypeOptions: fields.clinicTypeOptions,
    clinicTypeCondition: fields.clinicTypeCondition,
    hospital: fields.hospital,
    hospitalRule: fields.hospitalRule,
    pathway: fields.pathway,
    missing: 'Not recorded — take it from the doctor\u2019s task',
  }),
  searchText: (fields, note) => [note?.title, fields.service, ...(fields.aliases || []), fields.specialty, fields.clinicType, ...(fields.clinicTypeOptions || []), fields.hospital, fields.pathway, fields.form]
    .filter(Boolean).join(' \u00b7 '),
};

const EMAIL_REFERRAL = {
  id: 'emailReferral',
  label: 'Email referral',
  short: 'Email',
  summary: 'One referral sent by AccurX professional message or email',
  colour: { ink: '#00786f', tint: '#e3f3f2', edge: '#3fada5' },
  icon: 'chat',
  fields: [
    f('service', 'Service', 'text', { hint: 'What this referral is for, as staff would say it.' }),
    f('aliases', 'Also called', 'list', { hint: 'One per line. How somebody might ask for it.' }),
    f('to', 'Send to', 'text', { hint: 'The email address, character for character. Leave empty only where the address is not fixed — say how it is found below.' }),
    f('toRule', 'Send to — rule', 'text', { hint: 'Where there is no one address — "fills in from the document", "same address as the ECG referral".' }),
    f('org', 'Organisation', 'text', { hint: 'The team or organisation it goes to.' }),
    f('form', 'Form', 'text', { hint: 'The form the referral goes on — "RP Echo".' }),
    f('attach', 'Attach', 'text', { hint: 'What goes with it. "EMIS file" unless the practice says otherwise.' }),
    f('body', 'Wording', 'textarea', { hint: 'Only where the practice dictates the wording. Never a patient name, date of birth or NHS number \u2014 AccurX attaches the record itself.' }),
  ],
  required: ['service'],
  validate: (fields) => {
    const issues = [];
    if (!filled(fields, 'to') && !filled(fields, 'toRule')) {
      issues.push({ field: 'to', message: 'Give the email address, or say how it is found.' });
    }
    if (filled(fields, 'to') && !EMAIL.test(String(fields.to).trim())) {
      issues.push({ field: 'to', message: 'That is not an email address.' });
    }
    return issues;
  },
  render: (fields) => profMessage({
    to: fields.to,
    toMissing: fields.toRule || 'Fills in automatically from the document',
    org: fields.org,
    body: fields.body,
    attach: fields.attach || 'EMIS file',
    form: fields.form,
  }),
  searchText: (fields, note) => [note?.title, fields.service, ...(fields.aliases || []), fields.org, fields.to, fields.form]
    .filter(Boolean).join(' \u00b7 '),
};

const BLOOD_TEST_SET = {
  id: 'bloodTestSet',
  label: 'Blood test set',
  short: 'Bloods',
  summary: 'The blood tests one review type needs',
  colour: { ink: '#ae2573', tint: '#fbe9f2', edge: '#c15f98' },
  icon: 'pill',
  fields: [
    f('review', 'Review', 'text', { hint: 'What the set is for — "Diabetes review".' }),
    f('aliases', 'Also called', 'list', { hint: 'One per line. How somebody might ask for it.' }),
    f('ordered', 'Tests to order', 'list', { hint: 'One per line, named exactly as the EMIS screen lists them, in the order it lists them.' }),
    f('clinicalDetails', 'Clinical details', 'text', { hint: 'What goes in the Clinical Details box — usually the type of review.' }),
    f('timing', 'Timing', 'text', { hint: 'When the sample has to be taken or sent — "before 1pm for the same-day courier".' }),
  ],
  required: ['review', 'ordered'],
  validate: () => [],
  render: (fields) => pathology({
    ordered: fields.ordered,
    groups: [],
    clinicalDetails: fields.clinicalDetails,
    orderedMissing: 'Nothing recorded to order',
    detailsMissing: 'Not recorded \u2014 the type of health check',
  }),
  searchText: (fields, note) => [note?.title, fields.review, ...(fields.aliases || []), ...(fields.ordered || []), fields.clinicalDetails]
    .filter(Boolean).join(' \u00b7 '),
};

export const NOTE_KINDS = [NOTE, ERS_REFERRAL, EMAIL_REFERRAL, BLOOD_TEST_SET];
export const NOTE_KIND_IDS = NOTE_KINDS.map((k) => k.id);

/** The kinds a person can create from the notebook, in the order offered. */
export const CREATABLE_KINDS = NOTE_KINDS;

/** One kind by id. An unknown id is the plain note, never a throw: a row that
 *  somehow carries a kind this build does not have still opens and still saves. */
export const noteKind = (id) => NOTE_KINDS.find((k) => k.id === String(id || '')) || NOTE;

/** Is this something a note may be created or saved as? */
export const isNoteKind = (id) => NOTE_KIND_IDS.includes(String(id || ''));

/** Is this a kind with fields on it, as opposed to free writing? */
export const isTypedKind = (id) => isNoteKind(id) && id !== 'note';

/**
 * What is wrong with this note, as a list the editor can print against the
 * boxes. Empty means the note is complete and may be served.
 *
 * REQUIRED FIRST, then the kind's own rules. Both are named per field, because
 * "this note is incomplete" sends somebody hunting and "Speciality is missing"
 * does not.
 */
export function noteIssues(kind, rawFields) {
  const def = noteKind(kind);
  const fields = normaliseFields(def.id, rawFields);
  const issues = [];
  for (const key of def.required) {
    if (filled(fields, key)) continue;
    const field = def.fields.find((x) => x.key === key);
    issues.push({ field: key, message: (field ? field.label : key) + ' is needed.' });
  }
  const seen = new Set(issues.map((i) => i.field));
  for (const issue of def.validate(fields) || []) {
    if (seen.has(issue.field)) continue;
    seen.add(issue.field);
    issues.push(issue);
  }
  return issues;
}

/** live or draft, decided by the note itself rather than set by hand. */
export const statusFor = (kind, fields) => (noteIssues(kind, fields).length ? 'draft' : 'live');

/**
 * The note's fields as the lines a reader — or the model — sees.
 *
 * ONE SHAPE PER KIND, built here in code from the stored values. This is what
 * makes "the same referral is always formatted the same way" true: the wording
 * of these lines is not a thing anybody chooses per note, and no model is
 * asked to lift a value out of prose at answer time.
 */
export function fieldLines(kind, rawFields) {
  const def = noteKind(kind);
  if (!def.fields.length) return [];
  const fields = normaliseFields(def.id, rawFields);
  const lines = [];
  for (const field of def.fields) {
    const value = fields[field.key];
    if (Array.isArray(value)) {
      if (value.length) lines.push({ label: field.label, value: value.join(', ') });
    } else if (String(value || '').trim()) {
      lines.push({ label: field.label, value: String(value).trim() });
    }
  }
  return lines;
}

/** The same lines as markdown, for the Notebook text the model is given. */
export function fieldsMarkdown(kind, rawFields) {
  return fieldLines(kind, rawFields).map((line) => '- **' + line.label + ':** ' + line.value).join('\n');
}

/** The screen block for this note, or null. Pure: no model, no database. */
export function renderKind(kind, rawFields) {
  const def = noteKind(kind);
  if (!def.fields.length) return null;
  try {
    return def.render(normaliseFields(def.id, rawFields)) || null;
  } catch (e) {
    // A block that cannot be built is no block. The note's own writing still
    // answers, which is what happened before any of this existed.
    return null;
  }
}

/** What the search index sees for this note: its fields, then its writing. */
export function noteSearchText(note) {
  const def = noteKind(note?.kind);
  const head = def.searchText(normaliseFields(def.id, note?.fields), note);
  const body = String(note?.body || '').trim();
  return [head, body].filter(Boolean).join('\n');
}
