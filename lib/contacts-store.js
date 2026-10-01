// The practice's contacts, as one list that can be added to.
//
// They live where they already lived: `knowledge_entries` rows of kind
// 'contact'. The bundled sheet (lib/contacts.data.json) and the hospital
// shortlist are synced into those rows by lib/knowledge-bootstrap.js; a
// contact added or edited here is the same kind of row with
// `data.backendOverride` set, which is the flag that sync already leaves
// alone — so a hand edit is never put back, and a contact added here is never
// archived for being missing from the sheet.
//
// Every reader — the Contact numbers page, the chat's directory card, and
// the list of names the patient-data guard must not redact — reads through
// `contactDirectory()`, so a contact added at the desk is findable
// everywhere at once. A database that cannot be read leaves the bundled
// directory standing, read-only.
//
// The CQC register is NOT here. It is a published extract of ~57k services
// (lib/lookup/cqc.js), searched on its own and shown in its own box; one of
// its rows becomes a practice contact only when somebody saves it.

import crypto from 'node:crypto';
import { ensureKnowledgeSchema, getSql } from './db';
import { upsertKnowledgeEntry, archiveKnowledgeEntry, getKnowledgeEntry } from './knowledge';
import { getDirectory, categorise, aliasesFor } from './lookup/directory';

const TTL_MS = 60 * 1000;
let cache = null; // { at, entries, editable }

// Where a row came from, in words the page can group by.
function originOf(row) {
  const data = row.data || {};
  if (data.source === 'manual') return 'added';
  if (String(row.sourceRef || '').startsWith('directory:hospitals:')) return 'hospital';
  return 'practice';
}

function fromRow(row) {
  const data = row.data || {};
  const origin = originOf(row);
  return {
    id: row.id,
    label: row.title,
    category: data.category || 'Other numbers',
    aliases: Array.isArray(data.aliases) ? data.aliases : [],
    phones: Array.isArray(data.phones) ? data.phones : [],
    emails: Array.isArray(data.emails) ? data.emails : [],
    note: data.note || '',
    origin,
    // A row from the sheet that somebody has since changed here.
    edited: origin !== 'added' && data.backendOverride === true,
    updatedAt: row.updatedAt || null,
  };
}

// A row of the bundled directory, standing in for the database. `fixed`:
// there is no database row behind it to change.
function fromStatic(entry) {
  return { ...entry, origin: entry.source === 'hospitals' ? 'hospital' : 'practice', edited: false, fixed: true, updatedAt: null };
}

// Every contact, at most a minute old. `editable` is false when the
// database could not be read and the bundled directory is standing in.
export async function contactDirectory({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache;
  let rows = null;
  try {
    await ensureKnowledgeSchema();
    const sql = getSql();
    rows = await sql`
      SELECT id, title, data, source_ref AS "sourceRef", updated_at AS "updatedAt"
      FROM knowledge_entries WHERE kind = 'contact' AND status = 'active'
      ORDER BY title ASC
    `;
  } catch (e) {
    rows = null;
  }
  if (!rows) {
    cache = { at: Date.now(), entries: getDirectory().map(fromStatic), editable: false };
    return cache;
  }
  const entries = rows.map(fromRow);
  // Before the first sync has copied the sheet in, the database holds only
  // what was added by hand. The sheet is still the practice's list, so it
  // stands beside them rather than vanishing.
  const synced = entries.some((e) => e.origin !== 'added');
  cache = { at: Date.now(), entries: synced ? entries : getDirectory().map(fromStatic).concat(entries), editable: true };
  return cache;
}

// The entries alone, for the callers that only search them.
export async function contactEntries() {
  try {
    return (await contactDirectory()).entries;
  } catch (e) {
    return getDirectory().map(fromStatic);
  }
}

export function forgetContacts() {
  cache = null;
}

const clip = (v, n) => String(v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);

// A number as typed, kept readable, with the digits beside it for tel: links
// and matching. Fewer than three digits is not a number.
function cleanPhones(raw) {
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const display = clip(typeof item === 'string' ? item : item && item.display, 40);
    const tel = display.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
    if (tel.replace(/\D/g, '').length < 3) continue;
    const label = clip(item && typeof item === 'object' ? item.label : '', 40);
    out.push(label ? { display, tel, label } : { display, tel });
  }
  return out.slice(0, 8);
}

function cleanEmails(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((e) => clip(e, 120).toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    .slice(0, 6);
}

function cleanList(raw, n) {
  return [...new Set((Array.isArray(raw) ? raw : []).map((a) => clip(a, 80)).filter(Boolean))].slice(0, n);
}

// What a save is allowed to contain, or the reason it is not.
export function validateContact(input) {
  const label = clip(input && input.label, 160);
  if (!label) return { error: 'A name is required.' };
  const phones = cleanPhones(input.phones);
  const emails = cleanEmails(input.emails);
  if (!phones.length && !emails.length) return { error: 'Add at least one phone number or email address.' };
  return {
    contact: {
      label,
      category: clip(input.category, 60) || categorise(label),
      phones,
      emails,
      note: clip(input.note, 400),
      aliases: cleanList(input.aliases, 20),
    },
  };
}

// The text a contact is found by, laid out as the sync lays it out.
const contentOf = (c, aliases) => [c.label, c.note, ...aliases, ...c.phones.map((p) => p.display), ...c.emails].filter(Boolean).join('\n');

// Add a contact (no id) or change one (id). Returns the saved contact.
export async function saveContact(input) {
  const checked = validateContact(input);
  if (checked.error) throw Object.assign(new Error(checked.error), { status: 400 });
  const c = checked.contact;

  let existing = null;
  if (input.id) {
    existing = await getKnowledgeEntry(String(input.id));
    if (!existing || existing.kind !== 'contact') throw Object.assign(new Error('That contact no longer exists.'), { status: 404 });
  }
  const before = (existing && existing.data) || {};
  // The words a reader would use, expanded the way the sheet's own rows are,
  // plus any other names given for it.
  const aliases = [...new Set([...aliasesFor(c.label), ...c.aliases])];
  const sourceRef = existing ? existing.sourceRef : 'manual:' + crypto.randomUUID();
  const data = {
    ...before,
    phones: c.phones,
    emails: c.emails,
    category: c.category,
    aliases,
    note: c.note,
    source: existing ? (before.source || 'directory') : 'manual',
    backendOverride: true,
    correctedAt: new Date().toISOString(),
  };
  const record = {
    ...(existing ? { id: existing.id } : {}),
    kind: 'contact',
    title: c.label,
    content: contentOf(c, aliases),
    data,
    sourceRef,
    authority: 85,
  };
  let entry;
  try {
    entry = await upsertKnowledgeEntry(record, { embed: true });
  } catch (e) {
    // No embedding key, or the embedder is down: the contact is still saved
    // and found by its words; the sync backfills the vector later.
    entry = await upsertKnowledgeEntry(record, { embed: false });
  }
  forgetContacts();
  return fromRow({ id: entry.id, title: entry.title, data: entry.data, sourceRef: entry.sourceRef, updatedAt: new Date().toISOString() });
}

// Take a contact off the list. Archived, not deleted, and marked so the sync
// does not bring a sheet row straight back.
export async function removeContact(id) {
  const existing = await getKnowledgeEntry(String(id || ''));
  if (!existing || existing.kind !== 'contact') throw Object.assign(new Error('That contact no longer exists.'), { status: 404 });
  await archiveKnowledgeEntry(existing.id, { backendOverride: true });
  forgetContacts();
}
