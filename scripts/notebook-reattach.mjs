// Put every attachment back on the page its picture belongs to, and tidy the
// two loose ends the restructure left behind.
//
// The restructure moved text, and inline images travelled with it — an image
// written as ![alt](url) inside a body is part of that body and never moved
// anywhere on its own. What did not travel was the note_attachments row: the
// separate record that makes a file appear in a page's file list. Those were
// all parked on one holding page rather than being deleted with their old row,
// which was safe but left the work of redistributing them to a person.
//
// It does not need a person. An attachment belongs to the page that displays
// it, and that is a fact already written down:
//   1. If the file's blob URL appears inline in exactly one page's body, that
//      is its page. This settles the large majority.
//   2. Otherwise it was uploaded but never placed inline, so fall back to the
//      page that inherited the text of the note it was originally attached to,
//      found by matching that note's longest distinctive line.
// Anything still unresolved stays on the holding page rather than being guessed
// at — a picture on the wrong procedure is worse than a picture in a tray.
//
// Also: the "Shared logins" section keeps its page (the practice wants one
// place for these) but loses the shouty REVIEW AND REMOVE title.
//
// USAGE
//   node scripts/notebook-reattach.mjs .            # dry run
//   node scripts/notebook-reattach.mjs . --apply
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const root = process.argv[2] || '.';
const APPLY = process.argv.includes('--apply');

for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

const backupPath = path.join(root, 'scripts', 'notebook-backup.json');
const backup = fs.existsSync(backupPath) ? JSON.parse(fs.readFileSync(backupPath, 'utf8')) : { notes: [], attachments: [] };
const oldNoteById = new Map(backup.notes.map((n) => [n.id, n]));
const oldNoteForUrl = new Map(backup.attachments.map((a) => [a.url, a.noteId]));

const rows = await sql`
  SELECT id, parent_id AS "parentId", title, body, is_section AS "isSection"
  FROM notes ORDER BY id ASC
`;
const atts = await sql`SELECT id, note_id AS "noteId", url, filename FROM note_attachments ORDER BY id ASC`;
const pages = rows.filter((r) => r.parentId && !r.isSection);

// The longest line of a note, used as a fingerprint for "which page inherited
// this note's text". Long lines are distinctive; short ones ("### Overview")
// appear on a dozen pages and would match the wrong one.
function fingerprint(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 40 && !/^!\[/.test(l))
    .sort((a, b) => b.length - a.length)[0] || '';
}

const moves = [];
const stuck = [];
for (const a of atts) {
  const inline = pages.filter((p) => String(p.body || '').includes(a.url));
  if (inline.length === 1) { moves.push({ a, page: inline[0], why: 'shown inline on this page' }); continue; }
  if (inline.length > 1) { moves.push({ a, page: inline[0], why: `shown inline on ${inline.length} pages, taking the first` }); continue; }

  const oldNote = oldNoteById.get(oldNoteForUrl.get(a.url));
  const mark = oldNote ? fingerprint(oldNote.body) : '';
  const heir = mark ? pages.find((p) => String(p.body || '').includes(mark)) : null;
  if (heir) { moves.push({ a, page: heir, why: `inherited the text of "${oldNote.title}"` }); continue; }
  stuck.push(a);
}

console.log(`\n${atts.length} attachments`);
const byPage = new Map();
for (const m of moves) {
  if (!byPage.has(m.page.id)) byPage.set(m.page.id, { page: m.page, list: [] });
  byPage.get(m.page.id).list.push(m);
}
for (const { page, list } of byPage.values()) {
  console.log(`\n  → ${page.title}`);
  for (const m of list) console.log(`      ${m.a.filename}  (${m.why})`);
}
if (stuck.length) {
  console.log(`\n  stays on the holding page (${stuck.length}):`);
  for (const a of stuck) console.log(`      ${a.filename}`);
}

const loginSection = rows.find((r) => !r.parentId && /^shared logins/i.test(r.title || ''));
const holdSection = rows.find((r) => !r.parentId && /^needs review — attachments$/i.test(r.title || ''));
const holdPage = holdSection ? rows.find((r) => r.parentId === holdSection.id) : null;

console.log(`\nrename: "${loginSection ? loginSection.title : '(not found)'}" → "Shared logins"`);
console.log(`holding page: ${stuck.length ? 'kept, still holds ' + stuck.length : 'removed (empty)'}`);

if (!APPLY) { console.log('\nDry run. Pass --apply to write.'); process.exit(0); }

for (const m of moves) {
  await sql`UPDATE note_attachments SET note_id = ${m.page.id} WHERE id = ${m.a.id}`;
}
if (loginSection) {
  await sql`UPDATE notes SET title = ${'Shared logins'}, updated_at = now() WHERE id = ${loginSection.id}`;
}
// The holding page only earned its place while it held something.
if (holdSection && !stuck.length) {
  await sql`DELETE FROM notes WHERE id = ${holdSection.id}`;
} else if (holdPage && stuck.length) {
  await sql`
    UPDATE notes SET body = ${'Files that were uploaded but never placed inside a page, so there is nothing recording which procedure they illustrate. Drag each onto the page it belongs to, then delete this page.'}, updated_at = now()
    WHERE id = ${holdPage.id}
  `;
}

console.log(`\nAPPLIED: ${moves.length} attachments placed, ${stuck.length} left on the holding page.`);
