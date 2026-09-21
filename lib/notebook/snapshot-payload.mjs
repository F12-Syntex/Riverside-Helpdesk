// The shape a Notebook save is stored and exchanged in, and the one function
// that decides whether a lump of JSON is one.
//
// It is deliberately the same shape /api/notebook/export downloads, so a save
// downloaded from the saves list and a backup file taken any other way are
// interchangeable: either can be imported as a save and loaded back.
//
// Pure (no database) so it can be tested directly.
import { isNoteKind } from './kinds.mjs';

export const SNAPSHOT_KIND = 'riverside-notebook-backup';

// The ceiling /api/notebook/import already enforces, applied to anything that
// arrives from a file before it is stored.
export const MAX_NOTES = 5000;

/**
 * Keep only the parts of a backup a load needs, with every field coerced to
 * the type and length the notes table accepts. Note ids are kept as written:
 * they are not database ids on the way back in, only the way a note in the file
 * names its parent, and importNotebook remaps them.
 *
 * Returns null when there is nothing restorable in it — no notes, or more than
 * the import ceiling allows.
 */
export function normalisePayload(data) {
  const notes = Array.isArray(data?.notes) ? data.notes.filter((n) => n && typeof n === 'object') : [];
  if (!notes.length || notes.length > MAX_NOTES) return null;
  const attachments = Array.isArray(data?.attachments) ? data.attachments.filter((a) => a && typeof a === 'object') : [];
  return {
    version: 1,
    kind: SNAPSHOT_KIND,
    exportedAt: typeof data?.exportedAt === 'string' ? data.exportedAt : new Date().toISOString(),
    notes: notes.map((n) => ({
      id: n.id,
      parentId: n.parentId == null ? null : n.parentId,
      title: String(n.title || 'Untitled').slice(0, 200),
      body: String(n.body || ''),
      isSection: !!n.isSection,
      // WHAT THE NOTE IS, and what it holds. A backup taken before notes had a
      // kind carries none, and 'note' — free writing, exactly what those pages
      // were — is right for every one of them. The values are passed through as
      // written and coerced to the kind on the way into the database, so a file
      // cannot put a field on a note whose kind does not have one.
      kind: isNoteKind(n.kind) ? String(n.kind) : 'note',
      fields: n.fields && typeof n.fields === 'object' && !Array.isArray(n.fields) ? n.fields : {},
    })),
    // An attachment with no url is a record of a file nobody can fetch, so it
    // is dropped rather than restored as a dead link.
    attachments: attachments.map((a) => ({
      noteId: a.noteId,
      url: String(a.url || ''),
      pathname: String(a.pathname || ''),
      filename: String(a.filename || 'file').slice(0, 300),
      contentType: String(a.contentType || 'application/octet-stream').slice(0, 200),
      size: parseInt(a.size, 10) || 0,
    })).filter((a) => a.url),
  };
}

// A save's name: what the reader typed, or a sensible stand-in for the kind.
export function cleanLabel(label, fallback) {
  const t = String(label || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  return t || fallback;
}
