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
