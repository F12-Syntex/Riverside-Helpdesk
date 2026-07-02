// Notebook data access + the bridge that feeds notes to the assistant.
//
// Notes live in Postgres (see ensureNotebookSchema in lib/db.js). They are read
// at request time by the /api/ask route and injected as citable supplementary
// Sources, so anything written in the notebook is used by the assistant for
// reasoning and referencing — with no re-ingest and no redeploy.
import { getSql, ensureNotebookSchema } from '@/lib/db';
import { selectSupplementarySources } from '@/lib/ai/context.mjs';

export async function listNotes() {
  await ensureNotebookSchema();
  const sql = getSql();
  return sql`
    SELECT id, parent_id AS "parentId", title, body, position, updated_at AS "updatedAt"
    FROM notes
    ORDER BY position ASC, id ASC
  `;
}

export async function createNote({ title, parentId }) {
  await ensureNotebookSchema();
  const sql = getSql();
  const t = String(title || 'Untitled note').trim().slice(0, 200) || 'Untitled note';
  const pid = parentId ? parseInt(parentId, 10) || null : null;
  const rows = await sql`
    INSERT INTO notes (title, parent_id)
    VALUES (${t}, ${pid})
    RETURNING id, parent_id AS "parentId", title, body, position, updated_at AS "updatedAt"
  `;
  return rows[0];
}

export async function updateNote({ id, title, body }) {
  await ensureNotebookSchema();
  const sql = getSql();
  const nid = parseInt(id, 10);
  if (!nid) return null;
  // Update only the fields provided (title and/or body).
  const t = title == null ? null : String(title).slice(0, 200);
  const b = body == null ? null : String(body);
  const rows = await sql`
    UPDATE notes
    SET title = COALESCE(${t}, title),
        body  = COALESCE(${b}, body),
        updated_at = now()
    WHERE id = ${nid}
    RETURNING id, parent_id AS "parentId", title, body, position, updated_at AS "updatedAt"
  `;
  return rows[0] || null;
}

export async function deleteNote(id) {
  await ensureNotebookSchema();
  const sql = getSql();
  const nid = parseInt(id, 10);
  if (!nid) return false;
  await sql`DELETE FROM notes WHERE id = ${nid}`; // children cascade
  return true;
}

/* ----------------------------- Attachments ----------------------------- *
 * Files live in Vercel Blob; note_attachments records which file belongs to
 * which note so the UI can list them and blob cleanup can follow deletes.  */

export async function listAttachments() {
  await ensureNotebookSchema();
  const sql = getSql();
  return sql`
    SELECT id, note_id AS "noteId", url, pathname, filename,
           content_type AS "contentType", size, created_at AS "createdAt"
    FROM note_attachments
    ORDER BY created_at ASC, id ASC
  `;
}

export async function createAttachment({ noteId, url, pathname, filename, contentType, size }) {
  await ensureNotebookSchema();
  const sql = getSql();
  const nid = parseInt(noteId, 10);
  if (!nid) return null;
  const rows = await sql`
    INSERT INTO note_attachments (note_id, url, pathname, filename, content_type, size)
    VALUES (${nid}, ${String(url)}, ${String(pathname)},
            ${String(filename || 'file').slice(0, 300)},
            ${String(contentType || 'application/octet-stream').slice(0, 200)},
            ${parseInt(size, 10) || 0})
    RETURNING id, note_id AS "noteId", url, pathname, filename,
              content_type AS "contentType", size, created_at AS "createdAt"
  `;
  return rows[0] || null;
}

// Removes the row and returns it so the caller can delete the blob too.
export async function deleteAttachment(id) {
  await ensureNotebookSchema();
  const sql = getSql();
  const aid = parseInt(id, 10);
  if (!aid) return null;
  const rows = await sql`
    DELETE FROM note_attachments WHERE id = ${aid}
    RETURNING id, url, pathname
  `;
  return rows[0] || null;
}

// Attachment rows for a note and its direct sub-notes — fetched before a note
// delete so the blobs can be cleaned up after the cascade removes the rows.
export async function attachmentsUnderNote(id) {
  await ensureNotebookSchema();
  const sql = getSql();
  const nid = parseInt(id, 10);
  if (!nid) return [];
  return sql`
    SELECT a.id, a.url, a.pathname
    FROM note_attachments a
    JOIN notes n ON n.id = a.note_id
    WHERE n.id = ${nid} OR n.parent_id = ${nid}
  `;
}

// Build the note "entries" for the assistant: one per note that has body text,
// named by its breadcrumb ("Instructions / How to book appointments") so the
// citation is clear.
function notesToEntries(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const crumb = (r) => {
    const parent = r.parentId ? byId.get(r.parentId) : null;
    const prefix = parent ? (parent.title || 'Untitled note') + ' / ' : '';
    return (prefix + (r.title || 'Untitled note')).slice(0, 120);
  };
  return rows
    .filter((r) => (r.body || '').trim())
    .map((r) => ({ name: crumb(r), text: r.body, origin: 'notebook' }));
}

// Notes selected for a specific query, ready to be numbered as Sources by the
// API route. Queried fresh each request (Postgres is cheap and this keeps note
// edits effective immediately). Never fatal — returns [] if the DB is
// unavailable so the assistant still works.
export async function noteContextSources(query) {
  try {
    const rows = await listNotes();
    const entries = notesToEntries(rows);
    if (!entries.length) return [];
    return selectSupplementarySources(entries, query || '');
  } catch (e) {
    return [];
  }
}
