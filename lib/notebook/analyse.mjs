// The fragmentation report: every Notebook page, its health and why.
//
// Built from the same rows the assistant reads, run through the same parsers
// it uses, so "red on the map" means "the assistant cannot read this" and
// nothing softer. Pure: rows in, report out.
import { buildFullNotebookSources } from '../knowledge-context.mjs';
import { splitSentences, isContent } from './sentences.mjs';
import { runRules, healthOf, typedOf } from './rules.mjs';

const BAND_RANK = { green: 0, amber: 1, red: 2 };
const worse = (a, b) => (BAND_RANK[b] > BAND_RANK[a] ? b : a);

/**
 * Where each sentence lives, for the duplicate rule.
 * @returns {Map<string, Array<{noteId:number, sentenceId:string, title:string}>>}
 */
export function buildDupIndex(pages) {
  const index = new Map();
  for (const p of pages) {
    for (const s of p.sentences) {
      if (!isContent(s) || s.kind === 'label') continue;
      if (s.norm.length < 40) continue;
      if (!index.has(s.norm)) index.set(s.norm, []);
      index.get(s.norm).push({ noteId: p.noteId, sentenceId: s.id, title: p.title });
    }
  }
  return index;
}

/**
 * @param {Array} notes        listNotes() rows
 * @param {Array} attachments  listAttachments() rows
 * @param {Object} signals     { [noteId]: { asked, bad, flagged, lastAsked, staleAnswers } }
 */
export function analyseNotebook(notes = [], attachments = [], signals = {}) {
  const rows = (notes || []).filter(Boolean);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sources = buildFullNotebookSources(rows, attachments);
  const pageByNote = new Map(sources.map((p) => [Number(String(p.docId).replace(/^note:/, '')), p]));

  const pathOf = (row) => {
    const titles = [];
    const seen = new Set();
    let cur = row;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      titles.unshift(String(cur.title || '').trim() || 'Untitled');
      cur = cur.parentId == null ? null : byId.get(cur.parentId);
    }
    return titles;
  };

  // First pass: sentences per page, so duplicates can be found across pages.
  const pages = rows
    .filter((r) => r.parentId != null && !r.isSection)
    .map((r) => {
      const page = pageByNote.get(r.id) || { docTitle: 'Notebook: ' + pathOf(r).join(' / '), text: '', images: [] };
      const sentences = splitSentences(page.text);
      return { noteId: r.id, title: String(r.title || 'Untitled'), row: r, page, sentences, path: pathOf(r) };
    });
  const dupIndex = buildDupIndex(pages);

  // Second pass: rules and health.
  const reports = {};
  for (const p of pages) {
    const typed = typedOf(p.page);
    const violations = runRules({ note: p.row, path: p.path, sentences: p.sentences, page: p.page, typed, dupIndex });
    const chars = String(p.page.text || '').length;
    const duplicates = violations.filter((x) => x.rule === 'duplicate').map((x) => {
      const s = p.sentences.find((q) => q.id === x.sentenceIds[0]);
      return { sentenceId: x.sentenceIds[0], text: s ? s.text : '', others: (dupIndex.get(s?.norm) || []).filter((o) => o.noteId !== p.noteId) };
    });
    reports[p.noteId] = {
      id: p.noteId,
      title: p.title,
      path: p.path,
      chars,
      sentenceCount: p.sentences.filter(isContent).length,
      typed,
      violations,
      duplicates,
      stub: violations.some((x) => x.rule === 'stub'),
      health: healthOf(violations),
      signals: signals[p.noteId] || null,
      updatedAt: p.row.updatedAt || null,
    };
  }

  // The tree, with values and bands rolled up.
  const kids = new Map();
  for (const r of rows) {
    const k = r.parentId == null ? 0 : r.parentId;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k).push(r);
  }
  const build = (r) => {
    const isSection = r.parentId == null || r.isSection;
    if (!isSection) {
      const rep = reports[r.id];
      return { id: r.id, title: String(r.title || 'Untitled'), kind: 'page', parentId: r.parentId, path: pathOf(r), value: Math.max(40, rep ? rep.chars : 0), health: rep ? rep.health : healthOf([]) };
    }
    const children = (kids.get(r.id) || []).map(build);
    const value = children.reduce((s, c) => s + c.value, 0);
    const band = children.reduce((b, c) => worse(b, c.health.band === 'grey' ? 'green' : c.health.band), 'green');
    return { id: r.id, title: String(r.title || 'Untitled'), kind: 'section', parentId: r.parentId, path: pathOf(r), value, health: { score: null, band: children.length ? band : 'grey' }, children };
  };
  const roots = (kids.get(0) || []).map(build);
  const tree = { id: 0, title: 'Notebook', kind: 'root', parentId: null, path: [], value: roots.reduce((s, c) => s + c.value, 0), health: { score: null, band: roots.reduce((b, c) => worse(b, c.health.band === 'grey' ? 'green' : c.health.band), 'green') }, children: roots };

  const all = Object.values(reports);
  const totals = {
    pages: all.length,
    sections: rows.filter((r) => r.parentId == null || r.isSection).length,
    chars: all.reduce((s, p) => s + p.chars, 0),
    red: all.filter((p) => p.health.band === 'red').length,
    amber: all.filter((p) => p.health.band === 'amber').length,
    green: all.filter((p) => p.health.band === 'green').length,
    stubs: all.filter((p) => p.stub).length,
    duplicates: all.reduce((s, p) => s + p.duplicates.length, 0),
    errors: all.reduce((s, p) => s + p.violations.filter((x) => x.severity === 'error').length, 0),
  };

  return { generatedAt: new Date().toISOString(), tree, pages: reports, totals };
}
