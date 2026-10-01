// Writing answered questions into the Notebook: the half that reads the
// database and calls the model. What goes where, the prompts and the checks
// are in ./writein.mjs.
//
// TWO STEPS, AND NOTHING SAVED BY THE FIRST. `planWriteIn` finds each answered
// question's page and proposes each page's new text; the reader sees every
// change. `applyWriteIn` writes the ones they kept - after taking a whole-
// Notebook save, so the run can be undone from /notebook/saves, and a revision
// of each page it touches - and refuses any page that has changed since it
// was proposed rather than overwrite somebody's edit.
import crypto from 'node:crypto';
import { z } from 'zod';
import { readStructured } from '../ai/structured.js';
import { chatRequest } from '../ai/openrouter.mjs';
import { applyRevisionedUpdate, createNote, getNote, listNotes, updateNote } from '../notebook.js';
import { createSnapshot } from '../notebook/snapshots.js';
import { stripQuestionMarks } from '../notebook/questions.mjs';
import { listUnwrittenAnswers, markQuestionsWritten } from './open.js';
import {
  MAX_PER_RUN, cleanPage, groupQuestions, isWritablePage, pagePath, rewriteWarnings, routePrompt, writePrompt,
} from './writein.mjs';

const hash = (text) => crypto.createHash('sha256').update(String(text || '')).digest('hex');

const PLACEMENTS = z.object({
  placements: z.array(z.object({
    id: z.number(),
    noteId: z.number().nullable(),
    newTitle: z.string(),
  })),
});

// Pages are rewritten a few at a time: tens of pages at most, and a provider
// that rate-limits a burst would fail the whole run.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

async function rewrite({ apiKey, model, title, body, questions }) {
  const res = await fetch(...chatRequest(apiKey, {
    model, temperature: 0, messages: [{ role: 'user', content: writePrompt({ title, body, questions }) }],
  }));
  if (!res.ok) throw new Error(`OpenRouter error (${res.status}).`);
  const data = await res.json();
  return cleanPage(data?.choices?.[0]?.message?.content || '');
}

/**
 * Propose the rewrite of every page an unwritten answer belongs on.
 *
 * @returns {Promise<{pages: object[], more: boolean}>}
 */
export async function planWriteIn({ apiKey, openrouter, roles, turnId = '' }) {
  const { rows: questions, more } = await listUnwrittenAnswers({ limit: MAX_PER_RUN });
  if (!questions.length) return { pages: [], more: false };

  const notes = await listNotes();
  const byId = new Map(notes.map((n) => [Number(n.id), n]));
  const pages = notes.filter(isWritablePage).map((n) => ({ id: n.id, path: pagePath(n, byId), body: n.body || '' }));

  // Only questions without a page of their own need placing.
  const loose = questions.filter((q) => !(q.origin === 'notebook' && isWritablePage(byId.get(Number(q.noteId)))));
  let placements = [];
  if (loose.length && pages.length) {
    const out = await readStructured({
      openrouter, model: roles.fast.model, schema: PLACEMENTS, prompt: routePrompt(pages, loose),
      maxOutputTokens: 4000, role: 'fast', phase: 'questionPlace', turnId,
    });
    placements = out.placements || [];
  }

  const groups = groupQuestions(questions, placements, notes);
  const proposed = await mapLimit(groups, 4, async (g) => {
    const note = g.noteId == null ? null : byId.get(Number(g.noteId));
    const before = note ? note.body || '' : '';
    // The markers of questions being written in come off first, words kept:
    // once the answer is in the page the question is finished with.
    const anchors = g.questions.filter((q) => q.origin === 'notebook' && Number(q.noteId) === Number(g.noteId)).map((q) => q.anchor);
    const source = stripQuestionMarks(before, anchors);
    const base = {
      key: g.key,
      noteId: note ? note.id : null,
      title: g.title,
      path: note ? pagePath(note, byId) : 'Uncategorised / ' + g.title,
      isNew: !note,
      before,
      sourceHash: hash(before),
      questions: g.questions.map((q) => ({ id: q.id, question: q.question, answer: q.answer })),
    };
    try {
      const after = stripQuestionMarks(await rewrite({ apiKey, model: roles.reasoning.model, title: g.title, body: source, questions: g.questions }), anchors);
      if (!after.trim()) return { ...base, after: '', warnings: [], error: 'The model returned nothing for this page.' };
      return { ...base, after, warnings: rewriteWarnings(before, after, g.questions), error: '' };
    } catch (e) {
      return { ...base, after: '', warnings: [], error: String(e.message || e).slice(0, 200) };
    }
  });

  return { pages: proposed, more };
}

// The holding section new pages go into, made if the Notebook has none.
async function uncategorisedSection(notes) {
  const found = notes.find((n) => n.parentId == null && /^\s*uncategori[sz]ed\s*$/i.test(n.title || ''));
  return found || createNote({ title: 'Uncategorised', parentId: null });
}

/**
 * Write the pages the reader kept.
 *
 * @param {Array<{noteId:number|null, title:string, body:string, sourceHash:string, questionIds:number[]}>} pages
 */
export async function applyWriteIn({ pages = [], turnId = '' } = {}) {
  const keep = (Array.isArray(pages) ? pages : [])
    .filter((p) => p && typeof p.body === 'string' && p.body.trim())
    .slice(0, MAX_PER_RUN);
  if (!keep.length) return { results: [], snapshotId: null };

  const snapshot = await createSnapshot({ label: 'Before writing in answers from Questions', kind: 'auto' }).catch(() => null);
  const notes = await listNotes();
  let section = null;
  const results = [];

  for (const p of keep) {
    const ids = (Array.isArray(p.questionIds) ? p.questionIds : []).map(Number).filter((n) => n > 0);
    try {
      let noteId;
      if (p.noteId != null) {
        const current = await getNote(p.noteId);
        if (!current) { results.push({ noteId: p.noteId, title: p.title, error: 'That page has been deleted.' }); continue; }
        if (hash(current.body || '') !== p.sourceHash) {
          results.push({ noteId: p.noteId, title: current.title, error: 'Changed since this was proposed — run it again.' });
          continue;
        }
        const out = await applyRevisionedUpdate({ id: p.noteId, body: p.body, reason: 'questions', turnId });
        if (out.error) { results.push({ noteId: p.noteId, title: current.title, error: out.error }); continue; }
        noteId = p.noteId;
      } else {
        if (!section) section = await uncategorisedSection(notes);
        const made = await createNote({ title: String(p.title || 'Answered questions').slice(0, 200), parentId: section.id });
        await updateNote({ id: made.id, body: p.body });
        noteId = made.id;
      }
      await markQuestionsWritten(ids);
      results.push({ noteId, title: p.title, written: ids.length, isNew: p.noteId == null });
    } catch (e) {
      results.push({ noteId: p.noteId, title: p.title, error: String(e.message || e).slice(0, 200) });
    }
  }
  return { results, snapshotId: snapshot && snapshot.id ? snapshot.id : null };
}
