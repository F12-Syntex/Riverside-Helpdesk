// Defragmenting the whole Notebook, one step at a time.
//
// The single-page path (lib/notebook/defrag.js) is the unit of work and is not
// weakened here: every page still gets its own proposal, its own code checks
// and its own meaning verdict, and nothing is written without them. What this
// adds is the two things one page cannot do for itself.
//
//   the sweep    before anything is rewritten, every page is read against
//                every other and the pairs that disagree are put to the judge.
//                A page named in a contradiction nobody has decided is BLOCKED:
//                it is not rewritten, because tidying the wording of a fact
//                that may be wrong is the worst thing this tool could do.
//   the queue    the rest are proposed one at a time and wait in a review list;
//                the reader applies them one by one, or applies in one click
//                every proposal that passed both checks cleanly.
//
// A run is a row, not a promise: each call does ONE unit of work and returns
// the state, so a serverless request never runs long, a closed tab loses
// nothing, and the reader can stop and answer a question at any point.
import {
  listNotes, listAttachments, getNote, applyRevisionedUpdate, updateProposal,
  createDefragRun, getDefragRun, latestDefragRun, updateDefragRun,
  listDefragItems, getDefragItem, updateDefragItem, setDefragItemStatus,
  insertContradictions, listContradictions, getContradiction, updateContradiction, decidedPairKeys,
} from '../notebook.js';
import { analyseNotebook, notebookPages } from './analyse.mjs';
import { findCandidates, chunkCandidates, COHERENCE_CHUNK } from './coherence.mjs';
import { judgeCandidates } from './coherence.js';
import { settleStatement } from './settle.mjs';
import { healthOf } from './rules.mjs';
import { proposeDefrag, applyProposal, rejectProposal } from './defrag.js';

/**
 * How many pages one "apply everything that passed" call writes.
 *
 * One. Writing a page is not cheap — it re-reads the Notebook, re-validates the
 * proposal, snapshots the page and re-embeds it for the assistant — and a
 * request that wrote twenty-five of them in a row would take longer than a
 * serverless request is allowed to live and show the reader nothing until it
 * did. One page per call means the map, the counters and the list move once per
 * page, which is what applying forty rewrites should look like.
 */
export const APPLY_BATCH = 1;

const openBlocking = (rows) => (rows || []).filter((c) => c.status === 'open' && c.verdict === 'contradiction');

// The parts of a fresh validation shapeItem reads — the same fields the row
// would have carried had it been read back from the database.
const slimOf = (validation) => (validation
  ? { ok: validation.ok, pairs: validation.pairs, violationsBefore: validation.violationsBefore, violationsAfter: validation.violationsAfter }
  : null);

/* ------------------------------------------------------------ the state */

function shapeItem(row) {
  const validation = row.validation || null;
  const meaning = row.meaning || null;
  const pairs = (validation && validation.pairs) || [];
  const unsure = ((meaning && meaning.unsure) || []).length;
  const changed = ((meaning && meaning.changed) || []).length;
  const validationOk = !!(validation && validation.ok);
  const meaningOk = !!(meaning && meaning.ok);
  return {
    id: row.id,
    noteId: row.noteId,
    title: row.title,
    path: row.path,
    status: row.status,
    proposalId: row.proposalId || null,
    detail: row.detail || '',
    review: validation
      ? {
        validationOk,
        meaningOk,
        changed,
        unsure,
        // Clean means both checks passed and the judge was sure throughout —
        // the only kind of proposal "apply everything" will write.
        clean: validationOk && meaningOk && unsure === 0 && changed === 0,
        sentences: pairs.length,
        reworded: pairs.filter((p) => !p.same).length,
        before: healthOf((validation.violationsBefore) || []),
        after: healthOf((validation.violationsAfter) || []),
      }
      : null,
  };
}

/**
 * What the NEXT step will work on. The reader watches a run happen on the map,
 * and a page only lights up as it is being worked on if the browser knows which
 * page that is before the step returns.
 */
function upcomingOf(run, items) {
  if (run.status === 'scanning') {
    const chunk = chunkCandidates(run.candidates || [])[run.cursor];
    if (!chunk) return null;
    return { kind: 'scan', pairs: chunk.length, noteIds: [...new Set(chunk.flatMap((c) => [c.a.noteId, c.b.noteId]).filter(Boolean))] };
  }
  if (run.status === 'proposing') {
    const next = items.find((i) => i.status === 'pending');
    if (next) return { kind: 'propose', noteIds: [next.noteId], title: next.title };
  }
  return null;
}

async function buildState(run, event = null) {
  const [itemRows, contradictions] = await Promise.all([listDefragItems(run.id), listContradictions(run.id)]);
  const items = itemRows.map(shapeItem);
  const count = (status) => items.filter((i) => i.status === status).length;
  const blocking = openBlocking(contradictions);
  const candidates = (run.candidates || []).length;
  const chunks = Math.ceil(candidates / COHERENCE_CHUNK);
  const progress = {
    pages: items.length,
    pending: count('pending'),
    blocked: count('blocked'),
    proposed: count('proposed'),
    applied: count('applied'),
    rejected: count('rejected'),
    skipped: count('skipped'),
    failed: count('failed'),
    clean: items.filter((i) => i.status === 'proposed' && i.review && i.review.clean).length,
    candidates,
    scanned: Math.min(candidates, (run.cursor || 0) * COHERENCE_CHUNK),
    chunks,
    flags: contradictions.length,
    awaiting: blocking.length,
  };
  const settled = ['applied', 'rejected', 'skipped', 'failed'];
  const finished = run.status === 'review' && items.every((i) => settled.includes(i.status));
  const status = run.status === 'review' && finished ? 'done' : run.status;
  if (status !== run.status) await updateDefragRun({ id: run.id, status });
  return {
    run: { id: run.id, status, cursor: run.cursor, stats: run.stats || {}, createdAt: run.createdAt, updatedAt: run.updatedAt },
    items,
    contradictions,
    progress,
    // What just happened, and what happens next — the two things the map and
    // the activity list need that a snapshot of the rows cannot tell them.
    event,
    upcoming: upcomingOf({ ...run, status }, items),
    // Nothing more can be done without the reader: every page left is waiting
    // on a contradiction only they can settle.
    waiting: status === 'proposing' && progress.pending === 0 && progress.blocked > 0,
    done: ['review', 'done', 'cancelled'].includes(status),
  };
}

export async function runState(runId) {
  const run = runId ? await getDefragRun(runId) : await latestDefragRun();
  if (!run) return { run: null, items: [], contradictions: [], progress: null, waiting: false, done: true };
  return buildState(run);
}

/* ------------------------------------------------------------- starting */

/**
 * Read every page, find the pairs that might disagree, and queue the pages in
 * the order a reader would want them: the ones the assistant reads worst first.
 * No model is called here — starting a run is free.
 *
 * @param {{ scope?: 'all'|'needs-attention', turnId?: string }} args
 */
export async function startRun({ scope = 'all', turnId = '' } = {}) {
  const [notes, attachments] = await Promise.all([listNotes(), listAttachments().catch(() => [])]);
  const pages = notebookPages(notes, attachments).filter((p) => String(p.page.text || '').trim().length > 0);
  if (!pages.length) return { error: 'There is nothing written in the Notebook to defragment.', status: 400 };

  const report = analyseNotebook(notes, attachments, {});
  const scoreOf = (noteId) => (report.pages[noteId] ? report.pages[noteId].health.score : 100);
  const wanted = scope === 'needs-attention'
    ? pages.filter((p) => (report.pages[p.noteId] ? report.pages[p.noteId].health.band !== 'green' : true))
    : pages;
  if (!wanted.length) return { error: 'Every page already reads cleanly — there is nothing to defragment.', status: 400 };

  // The sweep reads the WHOLE Notebook whatever the rewrite's scope: a page
  // left out of the rewrite can still be the one contradicting a page in it.
  const skip = await decidedPairKeys();
  const candidates = findCandidates(pages, { skip });

  const ordered = wanted.slice().sort((a, b) => scoreOf(a.noteId) - scoreOf(b.noteId) || a.noteId - b.noteId);
  const run = await createDefragRun({
    pages: ordered.map((p) => ({ noteId: p.noteId, title: p.title, path: p.path.join(' / ') })),
    candidates,
    turnId,
  });
  return buildState(await getDefragRun(run.id));
}

/* --------------------------------------------------------- one step of work */

// A page named in an undecided contradiction is blocked; one whose
// contradictions have all been settled goes back in the queue.
async function reconcileBlocks(runId) {
  const contradictions = await listContradictions(runId);
  const blockedNotes = new Set(openBlocking(contradictions).flatMap((c) => [c.noteA, c.noteB]).filter(Boolean));
  await setDefragItemStatus({ runId, noteIds: [...blockedNotes], from: ['pending'], to: 'blocked' });
  const items = await listDefragItems(runId);
  const freed = items.filter((i) => i.status === 'blocked' && !blockedNotes.has(i.noteId)).map((i) => i.noteId);
  await setDefragItemStatus({ runId, noteIds: freed, from: ['blocked'], to: 'pending' });
}

/**
 * One unit: either the next chunk of the coherence sweep, or the next page's
 * proposal. Returns the state; the caller steps again while it is neither
 * done nor waiting.
 */
export async function stepRun({ runId, openrouter, roles, turnId = '' }) {
  const run = await getDefragRun(runId);
  if (!run) return { error: 'No such run.', status: 404 };
  if (run.status === 'cancelled') return buildState(run);

  if (run.status === 'scanning') {
    const chunks = chunkCandidates(run.candidates || []);
    let event = null;
    if (run.cursor < chunks.length) {
      const chunk = chunks[run.cursor];
      const merged = await judgeCandidates({ candidates: chunk, openrouter, model: roles.reasoning.model, turnId });
      if (merged.flagged.length) await insertContradictions(run.id, merged.flagged);
      await updateDefragRun({ id: run.id, cursor: run.cursor + 1 });
      event = {
        kind: 'scan',
        chunk: run.cursor + 1,
        of: chunks.length,
        pairs: chunk.length,
        noteIds: [...new Set(chunk.flatMap((c) => [c.a.noteId, c.b.noteId]).filter(Boolean))],
        found: merged.flagged.map((f) => ({
          verdict: f.verdict,
          severity: f.severity,
          subject: f.subject,
          reason: f.reason,
          a: { noteId: f.a.noteId, title: f.a.title },
          b: { noteId: f.b.noteId, title: f.b.title },
        })),
      };
    }
    const after = await getDefragRun(run.id);
    if (after.cursor >= chunks.length) {
      await updateDefragRun({ id: run.id, status: 'proposing' });
      await reconcileBlocks(run.id);
      const flags = openBlocking(await listContradictions(run.id)).length;
      event = { kind: 'swept', pairs: (run.candidates || []).length, flags, after: event };
    }
    return buildState(await getDefragRun(run.id), event);
  }

  if (run.status === 'proposing') {
    await reconcileBlocks(run.id);
    const items = await listDefragItems(run.id);
    const next = items.find((i) => i.status === 'pending');
    if (!next) {
      const blocked = items.filter((i) => i.status === 'blocked').length;
      if (!blocked) await updateDefragRun({ id: run.id, status: 'review' });
      return buildState(await getDefragRun(run.id), blocked ? { kind: 'waiting', pages: blocked } : { kind: 'queued' });
    }
    const out = await proposeDefrag({ noteId: next.noteId, openrouter, roles, turnId });
    let event = null;
    if (out.error) {
      // "Nothing on this page to rewrite" is not a failure; a model that could
      // not be reached is.
      const status = out.status === 400 ? 'skipped' : 'failed';
      await updateDefragItem({ id: next.id, status, detail: out.error });
      event = { kind: 'propose', noteId: next.noteId, title: next.title, status, detail: out.error };
    } else {
      await updateDefragItem({ id: next.id, status: 'proposed', proposalId: out.proposal.id, detail: '' });
      const shaped = shapeItem({ ...next, status: 'proposed', validation: slimOf(out.validation), meaning: out.meaning });
      event = { kind: 'propose', noteId: next.noteId, title: next.title, status: 'proposed', review: shaped.review };
    }
    return buildState(await getDefragRun(run.id), event);
  }

  return buildState(run);
}

export async function cancelRun(runId) {
  const run = await getDefragRun(runId);
  if (!run) return { error: 'No such run.', status: 404 };
  await updateDefragRun({ id: run.id, status: 'cancelled' });
  return buildState(await getDefragRun(run.id));
}

/* ---------------------------------------------------------- the decisions */

/**
 * Write one side's line. The edit itself is pure and narrow
 * (lib/notebook/settle.mjs): exactly the line the reader was shown, only if it
 * is still there exactly as it was read. Snapshotted first, so the decision can
 * be undone from the page's history like any other change.
 */
async function writeSide({ side, wording, verbatim, turnId }) {
  if (!side || !side.noteId) return { ok: true, unchanged: true };
  const note = await getNote(side.noteId);
  if (!note) return { error: 'One of those pages no longer exists.' };
  const edit = settleStatement({
    body: String(note.body || ''),
    sentenceId: side.sentenceId,
    expect: String(side.text || ''),
    winner: String(wording || ''),
    verbatim,
  });
  if (edit.error) return { error: edit.error };
  if (edit.unchanged) return { ok: true, unchanged: true };
  const result = await applyRevisionedUpdate({ id: side.noteId, body: edit.body, reason: 'contradiction', turnId });
  if (result.error) return { error: result.error };
  return { ok: true, revisionId: result.revisionId, from: edit.from, to: edit.to, noteId: side.noteId, title: side.title };
}

// A page whose text has just changed cannot keep a proposal describing text
// that no longer exists, so it goes back in the queue.
async function requeue(runId, noteIds) {
  if (!runId || !noteIds.length) return;
  const items = await listDefragItems(runId);
  for (const item of items.filter((i) => noteIds.includes(i.noteId) && i.status !== 'applied')) {
    if (item.proposalId && item.proposalStatus === 'draft') await updateProposal({ id: item.proposalId, status: 'superseded' });
    await updateDefragItem({ id: item.id, status: 'pending', proposalId: null, detail: '' });
  }
}

const DECISIONS = {
  a: { status: 'resolved', verbatim: false },
  b: { status: 'resolved', verbatim: false },
  edit: { status: 'resolved', verbatim: true },
  dismiss: { status: 'dismissed', verbatim: false },
  defer: { status: 'deferred', verbatim: false },
  resolved: { status: 'resolved', verbatim: false },
};

/**
 * The reader settles one flag, in their own words.
 *
 *   'a' / 'b'   that side is right; the other page's line is corrected to match
 *   'edit'      the reader has written the wording themselves, for one page or
 *               both — the way a disagreement that is really two situations is
 *               settled: each page says when it applies
 *   'dismiss'   the two pages do not in fact disagree
 *   'defer'     leave both pages as they are; the flag stops blocking and comes
 *               back next run
 *   'resolved'  they fixed it on the page themselves
 *
 * `note` is the reader's own explanation and is kept whatever the decision —
 * it is the record of why the practice reads it that way. `edits` carries the
 * wording they left in each box; a side whose wording is unchanged is not
 * written at all.
 *
 * @param {{ id: number, decision: string, note?: string, edits?: {a?: string, b?: string}, turnId?: string }} args
 */
export async function decideContradiction({ id, decision, note = '', edits = {}, turnId = '' }) {
  const flag = await getContradiction(id);
  if (!flag) return { error: 'No such flag.', status: 404 };
  if (flag.status !== 'open') return { error: 'That has already been settled.', status: 409 };
  const rule = DECISIONS[decision];
  if (!rule) return { error: 'That is not a decision this can act on.', status: 400 };

  // What each side should end up saying. The quick choices are the same thing
  // said shorter: "A is right" is "page B says what page A says".
  const wanted = { a: null, b: null };
  if (decision === 'a') wanted.b = String(flag.sideA?.text || '');
  else if (decision === 'b') wanted.a = String(flag.sideB?.text || '');
  else if (decision === 'edit') {
    for (const key of ['a', 'b']) {
      const typed = String(edits?.[key] ?? '').trim();
      const side = key === 'a' ? flag.sideA : flag.sideB;
      if (typed && typed !== String(side?.text || '').trim()) wanted[key] = typed;
    }
    if (!wanted.a && !wanted.b) return { error: 'Neither page’s wording was changed. Edit one of them, or say both are right.', status: 400 };
  }

  const written = [];
  for (const key of ['a', 'b']) {
    if (wanted[key] == null) continue;
    const out = await writeSide({ side: key === 'a' ? flag.sideA : flag.sideB, wording: wanted[key], verbatim: rule.verbatim, turnId });
    if (out.error) return { error: out.error, status: 409 };
    if (!out.unchanged) written.push(out);
  }

  const reason = decision === 'a' || decision === 'b'
    ? `Kept the wording on “${(decision === 'a' ? flag.sideA : flag.sideB)?.title}”.`
    : decision === 'edit'
      ? `Reworded ${written.length === 2 ? 'both pages' : '“' + (written[0]?.title || 'the page') + '”'}.`
      : decision === 'dismiss'
        ? 'Both are right.'
        : decision === 'defer'
          ? 'Left for now.'
          : 'Settled on the page by hand.';
  const resolution = [reason, String(note || '').trim()].filter(Boolean).join(' ').slice(0, 400);

  await updateContradiction({ id: flag.id, status: rule.status, resolution });
  await requeue(flag.runId, written.map((w) => w.noteId));

  const run = flag.runId ? await getDefragRun(flag.runId) : null;
  if (run && ['proposing', 'review'].includes(run.status)) {
    await reconcileBlocks(run.id);
    // A page that was blocked is a page still to be rewritten.
    const items = await listDefragItems(run.id);
    if (run.status === 'review' && items.some((i) => i.status === 'pending')) await updateDefragRun({ id: run.id, status: 'proposing' });
  }
  const event = {
    kind: 'settled',
    decision,
    resolution,
    note: String(note || '').trim(),
    written: written.map((w) => ({ noteId: w.noteId, title: w.title, from: w.from, to: w.to })),
    noteIds: [flag.noteA, flag.noteB].filter(Boolean),
    subject: flag.subject,
  };
  return {
    ok: true,
    revisionIds: written.map((w) => w.revisionId).filter(Boolean),
    revisionId: written.length === 1 ? written[0].revisionId : null,
    event,
    state: run ? await buildState(await getDefragRun(run.id), event) : null,
  };
}

/* ------------------------------------------------------------ the applying */

export async function applyRunItem({ itemId, turnId = '' }) {
  const item = await getDefragItem(itemId);
  if (!item) return { error: 'No such page in this run.', status: 404 };
  if (!item.proposalId) return { error: 'There is no proposal for that page yet.', status: 409 };
  const out = await applyProposal({ proposalId: item.proposalId, turnId });
  if (out.error) {
    // The page moved under the proposal: put it back in the queue rather than
    // leaving a dead proposal in the list.
    if (out.code === 'changed') await updateDefragItem({ id: item.id, status: 'pending', detail: out.error });
    return { ...out, state: await runState(item.runId) };
  }
  await updateDefragItem({ id: item.id, status: 'applied', detail: '' });
  const event = { kind: 'applied', noteId: item.noteId, title: item.title };
  return { ...out, event, state: await buildState(await getDefragRun(item.runId), event) };
}

export async function rejectRunItem({ itemId }) {
  const item = await getDefragItem(itemId);
  if (!item) return { error: 'No such page in this run.', status: 404 };
  if (item.proposalId) await rejectProposal({ proposalId: item.proposalId });
  await updateDefragItem({ id: item.id, status: 'rejected', detail: '' });
  return { ok: true, state: await runState(item.runId) };
}

/**
 * Apply every proposal that passed both checks with nothing left unsure.
 * Each one is re-validated server-side by applyProposal exactly as a single
 * apply is — this is a loop over that, not a shortcut past it. Bounded per
 * call; the caller repeats while `remaining` is not zero.
 */
/**
 * Apply the next proposals that passed both checks with nothing left unsure.
 * Each one is re-validated server-side by applyProposal exactly as a single
 * apply is — this is a loop over that, not a shortcut past it. `remaining` is
 * what is still clean and waiting after this call, so the caller can keep
 * going and count down as it does.
 */
export async function applyAllClean({ runId, limit = APPLY_BATCH, turnId = '' }) {
  const run = await getDefragRun(runId);
  if (!run) return { error: 'No such run.', status: 404 };
  const clean = (rows) => rows.map(shapeItem).filter((i) => i.status === 'proposed' && i.review && i.review.clean);
  const items = clean(await listDefragItems(run.id));
  const take = Math.max(1, Math.min(10, parseInt(limit, 10) || 1));
  const applied = [];
  const failed = [];
  for (const item of items.slice(0, take)) {
    const out = await applyProposal({ proposalId: item.proposalId, turnId });
    if (out.error) {
      failed.push({ title: item.title, error: out.error });
      if (out.code === 'changed') await updateDefragItem({ id: item.id, status: 'pending', detail: out.error });
      continue;
    }
    await updateDefragItem({ id: item.id, status: 'applied', detail: '' });
    applied.push({ title: item.title, noteId: item.noteId, revisionId: out.revisionId });
  }
  const event = applied.length === 1
    ? { kind: 'applied', noteId: applied[0].noteId, title: applied[0].title }
    : applied.length
      ? { kind: 'appliedMany', titles: applied.map((a) => a.title), noteIds: applied.map((a) => a.noteId), failed: failed.length }
      : null;
  const state = await buildState(await getDefragRun(run.id), event);
  return {
    applied,
    failed,
    // Counted from the state just built, not guessed from the slice: a page
    // that refused to apply is no longer waiting either.
    remaining: state.progress ? state.progress.clean : 0,
    event,
    state,
  };
}
