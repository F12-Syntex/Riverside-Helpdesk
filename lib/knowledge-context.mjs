// Pure context-shaping helpers. Keeping these separate from database access
// makes the three knowledge paths explicit and testable:
//   - documents are retrieved as passages by RAG;
//   - Notebook pages are supplied whole on every request;
//   - contacts are retrieved separately and rendered from structured data.

function notePath(note, byId) {
  const titles = [];
  const seen = new Set();
  let current = note;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const title = String(current.title || '').trim();
    if (title) titles.unshift(title);
    current = current.parentId == null ? null : byId.get(current.parentId);
  }
  return titles.join(' / ') || 'Untitled note';
}

// Return every non-empty Notebook page as one complete source. The body is not
// chunked, shortened or selected by the question: the exact saved page reaches
// the answer model. Section/container rows are represented through the path.
export function buildFullNotebookSources(notes, attachments = []) {
  const rows = Array.isArray(notes) ? notes : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const imagesByNote = new Map();

  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    if (!attachment || !String(attachment.contentType || '').startsWith('image/') || !attachment.url) continue;
    const images = imagesByNote.get(attachment.noteId) || [];
    if (images.length < 4) images.push(String(attachment.url));
    imagesByNote.set(attachment.noteId, images);
  }

  return rows
    .filter((row) => row && row.parentId != null && !row.isSection && String(row.body || '').trim())
    .map((row) => ({
      id: `note:${row.id}:full`,
      docId: `note:${row.id}`,
      docTitle: `Notebook: ${notePath(row, byId)}`,
      text: String(row.body),
      section: 'Complete note',
      view: null,
      images: imagesByNote.get(row.id) || [],
      kind: 'notebook',
    }));
}

export function knowledgeHitToDocumentChunk(hit) {
  const location = hit?.location || {};
  const { images = [], source, ...view } = location;
  return {
    id: hit?.id,
    docId: hit?.entryId,
    docTitle: hit?.title || 'Untitled document',
    text: hit?.content || '',
    section: hit?.heading || '',
    view: view.kind || view.url ? view : null,
    images,
    score: Number(hit?.score || 0),
    authority: hit?.authority,
    kind: 'document',
  };
}

export function contactHitsToCards(hits, limit = 5) {
  const out = [];
  const seen = new Set();
  for (const hit of Array.isArray(hits) ? hits : []) {
    const key = hit?.entryId || hit?.id || hit?.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      label: hit.title,
      phones: Array.isArray(hit.data?.phones) ? hit.data.phones : [],
      emails: Array.isArray(hit.data?.emails) ? hit.data.emails : [],
    });
    if (out.length >= limit) break;
  }
  return out;
}
