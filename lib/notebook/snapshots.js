// Saves of the whole Notebook, and loading one back.
//
// note_revisions (lib/notebook.js) undoes ONE page. This undoes the notebook:
// a row here is every page and attachment record at one moment, stored in the
// same JSON shape /api/notebook/export downloads. That sameness is the point —
// a save can be downloaded as a backup file, and a backup file can be imported
// as a save, without converting anything.
//
// Loading is destructive by design: it REPLACES the notebook, so a load leaves
// you with exactly what the save held rather than two copies of everything
// (/api/notebook/import is the additive door, and stays that way). What makes
// that safe is that a load snapshots the state it is about to discard first —
// an 'auto' save — so the load itself can be rolled back from the same list.
import { getSql, ensureNotebookSchema } from '@/lib/db';
import { listNotes, listAttachments, importNotebook } from '@/lib/notebook';
import { archiveKnowledgeEntries } from '@/lib/knowledge';
import { SNAPSHOT_KIND, normalisePayload, cleanLabel } from '@/lib/notebook/snapshot-payload.mjs';

export { SNAPSHOT_KIND, normalisePayload };

// Saves taken automatically before a load are housekeeping, not the reader's
// own saves: only the most recent few are worth keeping, and only they are
// ever pruned.
const KEEP_AUTO = 10;

// What the notebook holds right now, in backup shape.
export async function currentPayload() {
  const [notes, attachments] = await Promise.all([listNotes(), listAttachments().catch(() => [])]);
  return { version: 1, kind: SNAPSHOT_KIND, exportedAt: new Date().toISOString(), notes, attachments };
}

export async function listSnapshots({ limit = 100 } = {}) {
  await ensureNotebookSchema();
  const sql = getSql();
  return sql`
    SELECT id, label, kind, note_count AS "noteCount", attachment_count AS "attachmentCount", created_at AS "createdAt"
    FROM notebook_snapshots
    ORDER BY created_at DESC, id DESC
    LIMIT ${Math.min(parseInt(limit, 10) || 100, 500)}
  `;
}

export async function getSnapshot(id) {
  await ensureNotebookSchema();
  const sql = getSql();
  const sid = parseInt(id, 10);
  if (!sid) return null;
  const rows = await sql`
    SELECT id, label, kind, note_count AS "noteCount", attachment_count AS "attachmentCount",
           payload, created_at AS "createdAt"
    FROM notebook_snapshots WHERE id = ${sid}
  `;
  return rows[0] || null;
}

export async function deleteSnapshot(id) {
  await ensureNotebookSchema();
  const sql = getSql();
  const sid = parseInt(id, 10);
  if (!sid) return false;
  const rows = await sql`DELETE FROM notebook_snapshots WHERE id = ${sid} RETURNING id`;
  return rows.length > 0;
}

// Store a payload as a save. `kind` is 'manual' (the reader pressed Save),
// 'auto' (taken before a load) or 'import' (came from a file).
export async function storeSnapshot({ payload, label = '', kind = 'manual' }) {
  await ensureNotebookSchema();
  const sql = getSql();
  const clean = normalisePayload(payload);
  if (!clean) return null;
  const k = ['manual', 'auto', 'import'].includes(kind) ? kind : 'manual';
  const rows = await sql`
    INSERT INTO notebook_snapshots (label, kind, note_count, attachment_count, payload)
    VALUES (${cleanLabel(label, k === 'auto' ? 'Before loading a save' : 'Save')}, ${k},
            ${clean.notes.length}, ${clean.attachments.length}, ${JSON.stringify(clean)}::jsonb)
    RETURNING id, label, kind, note_count AS "noteCount", attachment_count AS "attachmentCount", created_at AS "createdAt"
  `;
  if (k === 'auto') await pruneAuto();
  return rows[0] || null;
}

// Save the notebook as it stands.
export async function createSnapshot({ label = '', kind = 'manual' } = {}) {
  const payload = await currentPayload();
  if (!payload.notes.length && kind !== 'auto') return { error: 'There are no notes to save yet.' };
  if (!payload.notes.length) return null; // empty notebook: nothing worth an auto save
  return storeSnapshot({ payload, label, kind });
}

async function pruneAuto() {
  const sql = getSql();
  await sql`
    DELETE FROM notebook_snapshots
    WHERE kind = 'auto' AND id NOT IN (
      SELECT id FROM notebook_snapshots WHERE kind = 'auto' ORDER BY created_at DESC, id DESC LIMIT ${KEEP_AUTO}
    )
  `;
}

// Empty the notebook, in three statements rather than one per page.
//
// The attached FILES are deliberately left in blob storage: every save that
// mentions one holds only its url, so deleting the file here would hollow out
// the saves that are the whole point of this page. Only the rows go, and what
// the assistant can cite is archived with them.
//
// It used to delete root by root through deleteNote, and each of those archived
// its subtree one page at a time and refreshed the conflict table for every
// one. Clearing a few hundred pages — which is the first half of loading a save
// over them — was most of the wait. Everything is going, so there is no subtree
// to walk: the ids are read once, archived in bulk, and the table is emptied.
async function clearNotebook() {
  const sql = getSql();
  const rows = await sql`SELECT id FROM notes`;
  if (!rows.length) return;
  await archiveKnowledgeEntries(rows.map((r) => `note:${r.id}`)).catch(() => {});
  await sql`DELETE FROM notes`;
}

/**
 * Load a save: replace the notebook with what it holds.
 *
 * The state being left is saved first, so this is reversible from the same
 * list. Returns { restored, safetyId } or { error }.
 */
export async function loadSnapshot(id, { onProgress = null } = {}) {
  const snap = await getSnapshot(id);
  if (!snap) return { error: 'That save no longer exists.' };
  const payload = normalisePayload(snap.payload);
  if (!payload) return { error: 'That save has no notes in it.' };
  const say = (phase, done, total) => {
    if (typeof onProgress === 'function') {
      try { onProgress({ phase, done, total }); } catch (e) { /* reporting never fails a load */ }
    }
  };
  say('saving', 0, 0);
  const safety = await createSnapshot({ kind: 'auto', label: `Before loading “${snap.label}”` });
  say('clearing', 0, 0);
  await clearNotebook();
  const restored = await importNotebook({ notes: payload.notes, attachments: payload.attachments, onProgress });
  return { restored, safetyId: safety && safety.id ? safety.id : null, snapshot: { id: snap.id, label: snap.label } };
}
