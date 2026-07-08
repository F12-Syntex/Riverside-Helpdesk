// Notebook data access + the bridge that feeds notes to the assistant.
//
// Notes live in Postgres (see ensureNotebookSchema in lib/db.js). They are read
// at request time by the /api/ask route and injected as citable supplementary
// Sources, so anything written in the notebook is used by the assistant for
// reasoning and referencing — with no re-ingest and no redeploy.
import crypto from 'node:crypto';
import { getSql, ensureNotebookSchema } from '@/lib/db';
import { selectSupplementarySources } from '@/lib/ai/context.mjs';
import { embedTexts, embedOne } from '@/rag/lib/embed.mjs';

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
  // Keep the semantic index in step with the note — best-effort; retrieval also
  // repairs any note whose index is out of date (see notebookContext).
  if (row) await syncNoteEmbeddings(row).catch(() => {});
  return row;
}

// One note's identity row — used by the attachments route to check the target
// exists and is a page (sections are name-only and hold no files).
export async function getNote(id) {
  await ensureNotebookSchema();
  const sql = getSql();
  const nid = parseInt(id, 10);
  if (!nid) return null;
  const rows = await sql`SELECT id, parent_id AS "parentId", title FROM notes WHERE id = ${nid}`;
  return rows[0] || null;
}

// Bulk import for backup restore: recreates every note with fresh ids
// (parents before children, old→new ids remapped) and re-links attachment
// metadata to the new note ids. Purely additive — existing notes are kept.
// Embeddings are not written here; the self-heal in notebookContext reindexes
// imported notes on the next question.
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
  return { notes: map.size, attachments: files };
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
      if (firstTarget.has(n.id)) await sql`UPDATE notes SET body = '', updated_at = now() WHERE id = ${n.id}`;
    } else {
      await sql`DELETE FROM notes WHERE id = ${n.id}`; // children already handled
      applied.removed++;
    }
  }

  // Keep the assistant's semantic index in step — best-effort, like updateNote.
  for (const page of touched.values()) await syncNoteEmbeddings(page).catch(() => {});

  return applied;
}

/* ------------------------- Notebook RAG ------------------------------- *
 * Every note body is chunked, embedded and stored in note_embeddings on
 * save. At ask time the query is embedded once and scored against these
 * vectors, so notebook content is retrieved semantically exactly like the
 * knowledge base — and each hit is returned as a numbered Source (with a
 * full breadcrumb title) whose quotes the API route verifies verbatim.   */

// Breadcrumb for a note ("Instructions / Appointments / Home visits") —
// walks the full ancestor chain so citations name the exact page.
function crumbFor(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return (r) => {
    const parts = [];
    for (let cur = r, hops = 0; cur && hops < 10; cur = byId.get(cur.parentId), hops++) {
      parts.unshift(cur.title || 'Untitled note');
    }
    return parts.join(' / ').slice(0, 120);
  };
}

// Same chunking shape the supplementary-context pipeline uses: split on
// headings/blank lines, pack to ~900 chars, cap at 1500.
function chunkBody(text) {
  const blocks = String(text).replace(/\r\n/g, '\n')
    .split(/\n(?=#{1,6}\s)|\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out = [];
  let cur = '';
  for (const b of blocks) {
    if (!cur) cur = b;
    else if (cur.length + b.length + 2 <= 900) cur += '\n\n' + b;
    else { out.push(cur); cur = b; }
    if (cur.length >= 900) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out.map((s) => (s.length > 1500 ? s.slice(0, 1500) : s));
}

function sectionOf(block, i) {
  const m = block.match(/^#{1,6}\s+(.+)/);
  const line = m ? m[1] : block.split('\n')[0];
  return (line || ('Part ' + (i + 1))).replace(/[#*`]/g, '').replace(/^\s*[-•*]\s+/, '').trim().slice(0, 60) || ('Part ' + (i + 1));
}

const hashOf = (s) => crypto.createHash('sha1').update(s).digest('hex');

// Indented outline of the whole notebook (sections → pages → sub-pages) so the
// model can navigate by the section organisation, not just a flat list.
function outlineOf(rows) {
  const kids = new Map();
  for (const r of rows) {
    const k = r.parentId || 0;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k).push(r);
  }
  const lines = [];
  const walk = (pid, depth) => {
    for (const r of kids.get(pid) || []) {
      const label = isSectionRow(r) ? 'Section: ' : '';
      lines.push('  '.repeat(depth) + '- ' + label + (r.title || 'Untitled'));
      walk(r.id, depth + 1);
    }
  };
  walk(0, 0);
  return lines.join('\n');
}

// (Re)embed one note's chunks into note_embeddings. Skips the API call when
// nothing changed. Title is embedded with each chunk so a note is findable by
// its name too. Throws on embedding failure — callers treat it as best-effort.
export async function syncNoteEmbeddings(note) {
  await ensureNotebookSchema();
  const sql = getSql();
  const nid = parseInt(note.id, 10);
  if (!nid) return;
  const title = String(note.title || '').trim();
  // Sections (top-level) are name-only categories — never indexed. An empty
  // chunk list below clears any embeddings left from when they held text.
  const isSection = note.parentId == null;
  const chunks = (isSection ? [] : chunkBody(note.body || '')).map((text, i) => ({
    chunk: i, section: sectionOf(text, i), content: text,
    hash: hashOf(title + ' ' + text),
  }));
  const existing = await sql`SELECT chunk, hash FROM note_embeddings WHERE note_id = ${nid} ORDER BY chunk`;
  const same = existing.length === chunks.length && chunks.every((c, i) => existing[i] && existing[i].hash === c.hash);
  if (same) return;
  const vecs = chunks.length ? await embedTexts(chunks.map((c) => (title ? title + '\n' : '') + c.content)) : [];
  await sql`DELETE FROM note_embeddings WHERE note_id = ${nid}`;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    await sql`
      INSERT INTO note_embeddings (note_id, chunk, section, content, hash, vec)
      VALUES (${nid}, ${c.chunk}, ${c.section}, ${c.content}, ${c.hash}, ${JSON.stringify(vecs[i])})
    `;
  }
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

const NOTE_TOP_K = 6;        // notebook chunks offered to the model per question
const NOTE_MIN_SCORE = 0.2;  // below this the chunk isn't relevant enough to cite

// Lexical overlap: the fraction of the query's distinct words (3+ chars) that
// appear in the text. Combined with the embedding score so a note that
// literally contains the words of a short query ("apple") is always surfaced,
// even when a one-word query embeds too vaguely to clear NOTE_MIN_SCORE.
function lexOverlap(query, text) {
  const qToks = new Set((String(query).toLowerCase().match(/[a-z0-9]{3,}/g) || []));
  if (!qToks.size) return 0;
  const tToks = new Set((String(text).toLowerCase().match(/[a-z0-9]{3,}/g) || []));
  let n = 0;
  for (const t of qToks) if (tToks.has(t)) n++;
  return n / qToks.size;
}

// Keyword fallback (the pre-RAG behaviour) for when embeddings are unavailable.
// Pages only — sections are name-only categories.
function keywordSources(rows, query) {
  const crumb = crumbFor(rows);
  const entries = rows.filter((r) => !isSectionRow(r) && (r.body || '').trim()).map((r) => ({ name: crumb(r), text: r.body, origin: 'notebook' }));
  return entries.length ? selectSupplementarySources(entries, query || '') : [];
}

// The notebook's contribution to a question: semantically retrieved Sources
// plus a catalogue of every note (Tier A awareness — the model knows what the
// notebook covers even when no chunk was retrieved). Never fatal.
export async function notebookContext(query) {
  try {
    const rows = await listNotes();
    // Pages only: sections (root notes and converted ones) are name-only
    // categories and contribute nothing themselves — their names still appear
    // in each page's breadcrumb title.
    const withBody = rows.filter((r) => !isSectionRow(r) && (r.body || '').trim());
    const catalog = rows.length ? 'Notebook outline (sections group the pages beneath them):\n' + outlineOf(rows) : '';
    if (!withBody.length) return { sources: [], catalog };
    const crumb = crumbFor(rows);

    const sql = getSql();
    let emb = await sql`SELECT note_id AS "noteId", chunk, section, content, hash, vec FROM note_embeddings`;

    // Self-heal: (re)index any note whose stored chunks don't match its current
    // text — covers notes written before this feature and failed saves.
    const byNote = new Map();
    for (const e of emb) {
      if (!byNote.has(e.noteId)) byNote.set(e.noteId, []);
      byNote.get(e.noteId).push(e);
    }
    let changed = false;
    for (const r of withBody) {
      const want = chunkBody(r.body).map((t) => hashOf(String(r.title || '').trim() + ' ' + t));
      const have = (byNote.get(r.id) || []).sort((a, b) => a.chunk - b.chunk).map((e) => e.hash);
      if (want.length !== have.length || want.some((h, i) => h !== have[i])) {
        await syncNoteEmbeddings(r).catch(() => {});
        changed = true;
      }
    }
    if (changed) emb = await sql`SELECT note_id AS "noteId", chunk, section, content, hash, vec FROM note_embeddings`;

    if (!emb.length) return { sources: keywordSources(rows, query), catalog };

    let qv = null;
    try { qv = await embedOne(query || ''); } catch (e) { qv = null; }
    if (!qv) return { sources: keywordSources(rows, query), catalog };

    const noteById = new Map(rows.map((r) => [r.id, r]));
    // Hybrid score: semantic similarity plus lexical overlap (title + chunk
    // text). A chunk qualifies when either signal fires, so exact-word matches
    // survive short queries that embed too vaguely for the semantic threshold.
    const scored = emb
      .map((e) => {
        const note = noteById.get(e.noteId);
        const sem = cosine(qv, Array.isArray(e.vec) ? e.vec : JSON.parse(e.vec));
        const lex = note ? lexOverlap(query || '', (note.title || '') + ' ' + e.content) : 0;
        return { e, sem, lex, score: sem + 0.5 * lex };
      })
      .filter((x) => (x.sem >= NOTE_MIN_SCORE || x.lex > 0) && (noteById.get(x.e.noteId) || {}).parentId)
      .sort((a, b) => b.score - a.score)
      .slice(0, NOTE_TOP_K);

    // Image attachments on the retrieved notes ride along with each source, so
    // the chat can show a note's pictures next to the answer they back.
    const imagesByNote = new Map();
    try {
      const ids = [...new Set(scored.map(({ e }) => e.noteId))];
      if (ids.length) {
        const atts = await sql`
          SELECT note_id AS "noteId", url
          FROM note_attachments
          WHERE note_id = ANY(${ids}) AND content_type LIKE 'image/%'
          ORDER BY created_at ASC, id ASC
        `;
        for (const a of atts) {
          if (!imagesByNote.has(a.noteId)) imagesByNote.set(a.noteId, []);
          imagesByNote.get(a.noteId).push(a.url);
        }
      }
    } catch (e) { /* images are optional */ }

    const sources = scored.map(({ e }) => ({
      docId: 'note-' + e.noteId + '-' + e.chunk,
      docTitle: 'Notebook: ' + crumb(noteById.get(e.noteId)),
      section: e.section || 'Note',
      text: e.content,
      images: (imagesByNote.get(e.noteId) || []).slice(0, 4),
    }));
    return { sources, catalog };
  } catch (e) {
    return { sources: [], catalog: '' };
  }
}

// Back-compat shim: sources only.
export async function noteContextSources(query) {
  const { sources } = await notebookContext(query);
  return sources;
}
