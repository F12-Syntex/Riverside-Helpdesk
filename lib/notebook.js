// Notebook data access + the bridge that feeds notes to the assistant.
//
// Notes live in Postgres (see ensureNotebookSchema in lib/db.js). The assistant
// reads every page directly and in full. Changed pages are also mirrored into
// canonical passages for administration and conflict analysis, not retrieval.
import { getSql, ensureNotebookSchema } from '@/lib/db';
import { chunkText, chunkHeading } from '@/lib/text-chunk.mjs';
import { archiveKnowledgeEntry, continueKnowledgeAnalysis, enqueueKnowledgeAnalysis, upsertKnowledgeEntry } from '@/lib/knowledge';
import { buildFullNotebookSources, buildSectionNotebookContext } from '@/lib/knowledge-context.mjs';

export async function listNotes() {
  await ensureNotebookSchema();
  const sql = getSql();
  return sql`
    SELECT id, parent_id AS "parentId", title, body, position,
           is_section AS "isSection", updated_at AS "updatedAt"
    FROM notes
    ORDER BY position ASC, id ASC
  `;
}
// A section is a name-only container: any root note, or a nested note that
// was explicitly converted (is_section).
const isSectionRow = (r) => !r.parentId || r.isSection;

// Tree depth cap, mirrored by the notebook UI: sections + 3 levels of pages.
const MAX_TREE_DEPTH = 4;

export async function createNote({ title, parentId }) {
  await ensureNotebookSchema();
  const sql = getSql();
  const t = String(title || 'Untitled note').trim().slice(0, 200) || 'Untitled note';
  const pid = parentId ? parseInt(parentId, 10) || null : null;
  const rows = await sql`
    INSERT INTO notes (title, parent_id)
    VALUES (${t}, ${pid})
    RETURNING id, parent_id AS "parentId", title, body, position,
              is_section AS "isSection", updated_at AS "updatedAt"
  `;
  return rows[0];
}

export async function updateNote({ id, title, body, isSection }) {
  await ensureNotebookSchema();
  const sql = getSql();
  const nid = parseInt(id, 10);
  if (!nid) return null;
  // Update only the fields provided (title, body and/or isSection). Sections
  // are name-only categories: their title can change but body writes are
  // ignored, whatever the client sends.
  const t = title == null ? null : String(title).slice(0, 200);
  const b = body == null ? null : String(body);
  const sec = typeof isSection === 'boolean' ? isSection : null;
  const rows = await sql`
    UPDATE notes
    SET title = COALESCE(${t}, title),
        is_section = COALESCE(${sec}, is_section),
        body  = CASE WHEN parent_id IS NULL OR COALESCE(${sec}, is_section) THEN body ELSE COALESCE(${b}, body) END,
        updated_at = now()
    WHERE id = ${nid}
    RETURNING id, parent_id AS "parentId", title, body, position,
              is_section AS "isSection", updated_at AS "updatedAt"
  `;
  const row = rows[0] || null;
  // The save is complete only when canonical passages are current.
  if (row) await syncNoteKnowledge(row);
  return row;
}

// Move a note into another section (drag-and-drop in the notebook sidebar).
// The target must be a section; root sections stay put; moves that would
// create a cycle or nest deeper than the tree allows are rejected. Returns
// { note } on success or { error } with a human-readable reason. The canonical
// entry metadata is refreshed without re-embedding unchanged text.
export async function moveNote({ id, parentId }) {
  await ensureNotebookSchema();
  const sql = getSql();
  const nid = parseInt(id, 10);
  const pid = parseInt(parentId, 10);
  if (!nid || !pid) return { error: 'A valid id and target section are required.' };
  const rows = await listNotes();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const note = byId.get(nid);
  const target = byId.get(pid);
  if (!note) return { error: 'Note not found.' };
  if (!target) return { error: 'Target section not found.' };
  if (!note.parentId) return { error: 'Top-level sections cannot be moved into another section.' };
  if (!isSectionRow(target)) return { error: 'Notes can only be moved into a section.' };
  if (nid === pid || note.parentId === target.id) return { note }; // nothing to do
  for (let cur = target, hops = 0; cur && hops < 20; cur = byId.get(cur.parentId), hops++) {
    if (cur.id === nid) return { error: 'A note cannot be moved inside itself.' };
  }
  // Depth of the target plus the moved subtree must stay within the cap
  // (depths are 0-based, so the deepest allowed row sits at MAX_TREE_DEPTH - 1).
  let depth = 0;
  for (let cur = byId.get(target.parentId), hops = 0; cur && hops < 20; cur = byId.get(cur.parentId), hops++) depth++;
  let height = 0;
  for (let frontier = [nid]; frontier.length;) {
    frontier = rows.filter((r) => frontier.includes(r.parentId)).map((r) => r.id);
    if (frontier.length) height++;
  }
  if (depth + 1 + height > MAX_TREE_DEPTH - 1) return { error: 'That move would nest pages too deep.' };
  const updated = await sql`
    UPDATE notes SET parent_id = ${pid}, updated_at = now()
    WHERE id = ${nid}
    RETURNING id, parent_id AS "parentId", title, body, position,
              is_section AS "isSection", updated_at AS "updatedAt"
  `;
  const moved = updated[0] || null;
  if (moved) await syncNoteKnowledge(moved).catch(() => {});
  return { note: moved };
}

// One note's identity row — used by the attachments route to check the target
// exists and is a page (sections are name-only and hold no files).
export async function getNote(id) {
  await ensureNotebookSchema();
  const sql = getSql();
  const nid = parseInt(id, 10);
  if (!nid) return null;
  const rows = await sql`SELECT id, parent_id AS "parentId", title, body, is_section AS "isSection" FROM notes WHERE id = ${nid}`;
  return rows[0] || null;
}

// Bulk import for backup restore: recreates every note with fresh ids
// (parents before children, old→new ids remapped) and re-links attachment
// metadata to the new note ids. Purely additive — existing notes are kept, and
// every imported page is added to canonical knowledge before returning.
export async function importNotebook({ notes = [], attachments = [] }) {
  await ensureNotebookSchema();
  const sql = getSql();
  const map = new Map(); // old id -> new id
  let remaining = notes.filter((n) => n && typeof n === 'object');
  let guard = 0;
  while (remaining.length && guard++ < 25) {
    const next = [];
    for (const n of remaining) {
      const hasParent = n.parentId != null;
      const pid = hasParent ? map.get(n.parentId) : null;
      if (hasParent && pid == null) { next.push(n); continue; } // parent not inserted yet
      const rows = await sql`
        INSERT INTO notes (title, body, parent_id, is_section)
        VALUES (${String(n.title || 'Untitled').slice(0, 200)}, ${String(n.body || '')}, ${pid}, ${!!n.isSection})
        RETURNING id
      `;
      map.set(n.id, rows[0].id);
    }
    if (next.length === remaining.length) break; // only orphans left
    remaining = next;
  }
  // Orphans (parent missing from the file): keep the data as top-level notes.
  for (const n of remaining) {
    const rows = await sql`
      INSERT INTO notes (title, body, parent_id, is_section)
      VALUES (${String(n.title || 'Untitled').slice(0, 200)}, ${String(n.body || '')}, ${null}, ${!!n.isSection})
      RETURNING id
    `;
    map.set(n.id, rows[0].id);
  }
  let files = 0;
  for (const a of attachments) {
    const nid = a && map.get(a.noteId);
    if (!nid || !a.url) continue;
    await sql`
      INSERT INTO note_attachments (note_id, url, pathname, filename, content_type, size)
      VALUES (${nid}, ${String(a.url)}, ${String(a.pathname || '')},
              ${String(a.filename || 'file').slice(0, 300)},
              ${String(a.contentType || 'application/octet-stream').slice(0, 200)},
              ${parseInt(a.size, 10) || 0})
    `;
    files++;
  }
  const newIds = [...map.values()];
  if (newIds.length) {
    const imported = await sql`
      SELECT id,parent_id AS "parentId",title,body,is_section AS "isSection"
      FROM notes WHERE id=ANY(${newIds})
    `;
    for (const note of imported) await syncNoteKnowledge(note, { autoAnalyse: false }).catch(() => {});
    continueKnowledgeAnalysis(1);
  }
  return { notes: map.size, attachments: files };
}

export async function deleteNote(id) {
  await ensureNotebookSchema();
  const sql = getSql();
  const nid = parseInt(id, 10);
  if (!nid) return false;
  const subtree = await sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM notes WHERE id = ${nid}
      UNION ALL SELECT n.id FROM notes n JOIN tree t ON n.parent_id = t.id
    ) SELECT id FROM tree
  `;
  for (const row of subtree) await archiveKnowledgeEntry(`note:${row.id}`).catch(() => {});
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

// The Q&A assistant deliberately receives the complete Notebook on every
// request. Read from the live Notebook tables, not the mirrored search index,
// so an autosave is visible immediately and no page is omitted by retrieval.
export async function fullNotebookContext() {
  const notes = await listNotes();
  const attachments = await listAttachments().catch(() => []);
  return buildFullNotebookSources(notes, attachments);
}

// The state of the Notebook in one short string, in one cheap query.
//
// Answers are written from the Notebook, so a cached answer is only good while
// the Notebook it was written from is unchanged. Rather than hooking every
// place a note can be written, the answer cache stores this fingerprint with
// each answer and refuses to serve a row whose fingerprint no longer matches:
// any edit moves max(updated_at), any new or deleted note or attachment moves a
// count, and every answer written before the change retires itself.
export async function notebookFingerprint() {
  await ensureNotebookSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT (SELECT count(*) FROM notes) AS notes,
           (SELECT coalesce(max(updated_at), to_timestamp(0)) FROM notes) AS "updatedAt",
           (SELECT count(*) FROM note_attachments) AS files
  `;
  const row = rows[0] || {};
  const at = new Date(row.updatedAt || 0).getTime() || 0;
  return `${row.notes || 0}:${row.files || 0}:${at}`;
}

// The guidance under one named Notebook section, as a single markdown string
// (see buildSectionNotebookContext). Read live so an autosave shows up
// immediately. Used by the signpost and document-coding endpoints to pick up
// just the section that governs each — "Triaging notebook" / "Document coding".
export async function notebookSectionContext(sectionTitle) {
  const notes = await listNotes();
  return buildSectionNotebookContext(notes, sectionTitle);
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
  const attachment = rows[0] || null;
  if (attachment) {
    const note = await sql`SELECT id,parent_id AS "parentId",title,body,is_section AS "isSection" FROM notes WHERE id=${nid}`;
    if (note[0]) await syncNoteKnowledge(note[0]).catch(() => {});
  }
  return attachment;
}

// Removes the row and returns it so the caller can delete the blob too.
export async function deleteAttachment(id) {
  await ensureNotebookSchema();
  const sql = getSql();
  const aid = parseInt(id, 10);
  if (!aid) return null;
  const rows = await sql`
    DELETE FROM note_attachments WHERE id = ${aid}
    RETURNING id, note_id AS "noteId", url, pathname
  `;
  const removed = rows[0] || null;
  if (removed) {
    const note = await sql`SELECT id,parent_id AS "parentId",title,body,is_section AS "isSection" FROM notes WHERE id=${removed.noteId}`;
    if (note[0]) await syncNoteKnowledge(note[0]).catch(() => {});
  }
  return removed;
}

// Attachment rows for a note and all its descendants (notes nest to any
// depth) — fetched before a note delete so the blobs can be cleaned up after
// the cascade removes the rows.
export async function attachmentsUnderNote(id) {
  await ensureNotebookSchema();
  const sql = getSql();
  const nid = parseInt(id, 10);
  if (!nid) return [];
  return sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM notes WHERE id = ${nid}
      UNION ALL
      SELECT n.id FROM notes n JOIN tree t ON n.parent_id = t.id
    )
    SELECT a.id, a.url, a.pathname
    FROM note_attachments a
    JOIN tree t ON t.id = a.note_id
  `;
}

/* --------------------------- AI organise ------------------------------ *
 * Redistributing the contents of one section (typically an "Uncategorised"
 * holding area) into the rest of the notebook. The organize API route asks
 * the model for an allocation plan — which section/page each piece of text
 * belongs on, with the text reformatted for its new home — and, once the
 * user confirms, this function applies it: find-or-create the target
 * sections and pages, append the text, move each note's attachments to its
 * main destination, and remove the emptied source pages.                  */

const normTitle = (t) => String(t || '').trim().toLowerCase();

// The section's whole subtree, deepest rows last (parents before children).
function subtreeOf(rows, rootId) {
  const out = [];
  let frontier = [rootId];
  while (frontier.length) {
    const next = [];
    for (const r of rows) if (frontier.includes(r.parentId)) { out.push(r); next.push(r.id); }
    frontier = next;
  }
  return out;
}

export async function applyOrganizePlan({ sectionId, allocations }) {
  await ensureNotebookSchema();
  const sql = getSql();
  const sid = parseInt(sectionId, 10);
  if (!sid) throw new Error('A valid sectionId is required.');

  const rows = await listNotes();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const section = byId.get(sid);
  if (!section || !isSectionRow(section)) throw new Error('That note is not a section.');

  const sourceNotes = subtreeOf(rows, sid);
  const sourceIds = new Set(sourceNotes.map((r) => r.id));

  const applied = { moved: 0, newSections: 0, newPages: 0, removed: 0 };

  async function insertNote(title, parentId, isSec) {
    const inserted = await sql`
      INSERT INTO notes (title, parent_id, is_section)
      VALUES (${String(title || 'Untitled').slice(0, 200)}, ${parentId}, ${!!isSec})
      RETURNING id, parent_id AS "parentId", title, body, position,
                is_section AS "isSection", updated_at AS "updatedAt"
    `;
    const row = inserted[0];
    rows.push(row);
    byId.set(row.id, row);
    if (parentId == null || isSec) applied.newSections++; else applied.newPages++;
    return row;
  }

  // Resolve "Section" or "Section / Sub-section" to the container the target
  // page lives under, creating missing levels. Content never goes back into
  // the section being organised — such parts land in "General" instead.
  async function resolveContainer(path) {
    const segs = String(path || '').split('/').map((p) => p.trim()).filter(Boolean).slice(0, 2);
    if (!segs.length || normTitle(segs[0]) === normTitle(section.title)) segs[0] = 'General';
    let cur = rows.find((r) => !r.parentId && r.id !== sid && normTitle(r.title) === normTitle(segs[0]));
    if (!cur) cur = await insertNote(segs[0], null, false);
    if (segs[1]) {
      let sub = rows.find((r) => r.parentId === cur.id && !sourceIds.has(r.id) && normTitle(r.title) === normTitle(segs[1]));
      if (!sub) sub = await insertNote(segs[1], cur.id, true);
      cur = sub;
    }
    return cur;
  }

  const touched = new Map();     // pageId -> row, for the embedding sync below
  const sourceTouched = new Map(); // cleared source pages must leave canonical search
  const firstTarget = new Map(); // source note id -> the page its content (and attachments) went to

  for (const alloc of Array.isArray(allocations) ? allocations : []) {
    const src = byId.get(parseInt(alloc && alloc.noteId, 10));
    if (!src || !sourceIds.has(src.id)) continue;
    for (const part of Array.isArray(alloc.parts) ? alloc.parts : []) {
      const md = String((part && part.markdown) || '').trim().slice(0, 30000);
      if (!md) continue;
      const container = await resolveContainer(part.section);
      const pageTitle = String((part && part.page) || '').trim() || src.title || 'Untitled';
      let page = rows.find((r) => r.parentId === container.id && !r.isSection && !sourceIds.has(r.id) && normTitle(r.title) === normTitle(pageTitle));
      if (!page) page = await insertNote(pageTitle, container.id, false);
      const body = (page.body || '').trim();
      page.body = body ? body + '\n\n' + md : md;
      await sql`UPDATE notes SET body = ${page.body}, updated_at = now() WHERE id = ${page.id}`;
      touched.set(page.id, page);
      if (!firstTarget.has(src.id)) { firstTarget.set(src.id, page.id); applied.moved++; }
    }
  }

  // A note's files follow its content to its main destination.
  for (const [srcId, pageId] of firstTarget) {
    await sql`UPDATE note_attachments SET note_id = ${pageId} WHERE note_id = ${srcId}`;
  }

  // Remove the emptied source pages, children before parents. A note is kept
  // when its content was NOT reallocated (never delete unmoved writing), when
  // it still has attachments, or when a kept note sits beneath it; a kept note
  // whose own content did move has its body cleared.
  const withAtt = new Set(sourceIds.size ? (await sql`
    SELECT DISTINCT note_id AS "noteId" FROM note_attachments WHERE note_id = ANY(${[...sourceIds]})
  `).map((r) => r.noteId) : []);
  const kept = new Set();
  for (const n of sourceNotes.slice().reverse()) {
    const cleared = firstTarget.has(n.id) || !(n.body || '').trim();
    const keptChild = rows.some((r) => r.parentId === n.id && kept.has(r.id));
    if (!cleared || withAtt.has(n.id) || keptChild) {
      kept.add(n.id);
      if (firstTarget.has(n.id)) {
        await sql`UPDATE notes SET body = '', updated_at = now() WHERE id = ${n.id}`;
        n.body = '';
        sourceTouched.set(n.id, n);
      }
    } else {
      await sql`DELETE FROM notes WHERE id = ${n.id}`; // children already handled
      await archiveKnowledgeEntry(`note:${n.id}`).catch(() => {});
      applied.removed++;
    }
  }

  // Keep the assistant's semantic index in step — best-effort, like updateNote.
  for (const page of touched.values()) await syncNoteKnowledge(page, { autoAnalyse: false }).catch(() => {});
  for (const page of sourceTouched.values()) await syncNoteKnowledge(page, { autoAnalyse: false }).catch(() => {});
  continueKnowledgeAnalysis(1);

  return applied;
}

// Chunking shape shared with the supplementary-context pipeline — see
// lib/text-chunk.mjs. Inline images are reduced to their alt text before
// chunking — blob URLs are noise to embeddings and to the source passages
// shown in the chat (the pictures themselves reach the chat through the
// note's attachments instead).
function chunkBody(text) {
  return chunkText(String(text).replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1'));
}
const sectionOf = chunkHeading;

// Sync one changed page into canonical knowledge. Passage hashes preserve and
// reuse vectors for unchanged text; claim work is coalesced by content hash.
export async function syncNoteKnowledge(note, { autoAnalyse = true, attempt = 0 } = {}) {
  await ensureNotebookSchema();
  const sql = getSql();
  const nid = parseInt(note.id, 10);
  if (!nid) return;
  // Always index the database's latest revision rather than a possibly stale
  // snapshot returned to another tab or mutation path.
  const latest = await sql`
    SELECT id,parent_id AS "parentId",title,body,is_section AS "isSection",updated_at AS "updatedAt"
    FROM notes WHERE id=${nid}
  `;
  if (!latest[0]) { await archiveKnowledgeEntry(`note:${nid}`).catch(() => {}); return; }
  note = latest[0];
  const revision = new Date(note.updatedAt).getTime();
  const title = String(note.title || '').trim();
  // Sections (top-level) are name-only categories — never indexed. An empty
  // chunk list below clears any embeddings left from when they held text.
  const isSection = note.parentId == null || !!note.isSection;
  const chunks = isSection ? [] : chunkBody(note.body || '').map((text, i) => ({
    heading: sectionOf(text, i), text,
  }));
  // Compatibility bridge: the Notebook editor now writes through to the same
  // canonical store used by documents and contacts. Sections are containers,
  // not knowledge, so converting a page to a section archives its entry.
  if (isSection || !chunks.length) {
    await archiveKnowledgeEntry(`note:${nid}`).catch(() => {});
    const after = await sql`SELECT updated_at AS "updatedAt" FROM notes WHERE id=${nid}`;
    if (attempt < 2 && after[0] && new Date(after[0].updatedAt).getTime() !== revision) {
      return syncNoteKnowledge({ id: nid }, { autoAnalyse, attempt: attempt + 1 });
    }
    return;
  } else {
    let images = [];
    try {
      const atts = await sql`SELECT url FROM note_attachments WHERE note_id = ${nid} AND content_type LIKE 'image/%' ORDER BY created_at ASC LIMIT 4`;
      images = atts.map((a) => a.url);
    } catch (e) { /* attachments are optional */ }
    const entry = await upsertKnowledgeEntry({
      id: `note:${nid}`, kind: 'note', title, content: note.body || '',
      data: { legacyNoteId: nid, parentId: note.parentId, noteRevision: revision }, sourceRef: `notebook:${nid}`, authority: 90,
      passages: chunks.map((c) => ({ ...c, location: { images } })),
    }, { embed: false });
    if (entry.claimsChanged || entry.claimsStale) {
      // The editor already coalesces keystrokes before saving. Queue one short,
      // non-blocking analysis job for the final text instead of holding the
      // save response open while a reasoning model runs.
      await enqueueKnowledgeAnalysis(entry.id, entry.contentHash, autoAnalyse ? 250 : 0);
    }
    const after = await sql`SELECT updated_at AS "updatedAt" FROM notes WHERE id=${nid}`;
    if (attempt < 2 && after[0] && new Date(after[0].updatedAt).getTime() !== revision) {
      return syncNoteKnowledge({ id: nid }, { autoAnalyse, attempt: attempt + 1 });
    }
    return entry;
  }
}
