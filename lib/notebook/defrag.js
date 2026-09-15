// One page, rewritten under supervision.
//
//   propose      the reasoning model rewrites the page with a sentence map;
//                code validates it; the judge checks meaning; the proposal is
//                stored server-side with both verdicts
//   revalidate   the reader edited the proposal: validate again, judge only
//                the pairs that are new
//   apply        re-read the page, refuse if it changed since the proposal,
//                re-run the code checks on the stored text, require the stored
//                meaning verdict to be ok and complete, snapshot, write
//
// One proposal, one page, per call. There is no whole-Notebook apply and no
// way to build one from these parts.
import { z } from 'zod';
import { listNotes, listAttachments, insertProposal, getProposal, updateProposal, applyRevisionedUpdate } from '../notebook.js';
import { buildFullNotebookSources } from '../knowledge-context.mjs';
import { readStructured } from '../ai/structured.js';
import { splitSentences, annotate, isContent } from './sentences.mjs';
import { typedOf, runRules, LABELS } from './rules.mjs';
import { validateProposal, hashBody } from './validate.mjs';
import { checkMeaning } from './meaning.js';
import { lineDiff } from './diff.mjs';

export const PROPOSAL_SCHEMA = z.object({
  body: z.string().min(1).describe('The rewritten page, as markdown. No [sN] markers.'),
  map: z.array(z.object({
    text: z.string().min(1).describe('One sentence of the rewritten page, exactly as it appears there.'),
    from: z.array(z.string().regex(/^s\d+$/)).min(1).describe('The source sentence ids this sentence was written from.'),
  })).min(1),
  dropped: z.array(z.object({ id: z.string(), why: z.string().max(120) })).default([])
    .describe('Source sentences left out. Allowed ONLY for an exact duplicate of a sentence that is kept.'),
});

function proposalPrompt({ path, typed, annotated, violations }) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');
  return [
    'You are tidying ONE page of a GP practice’s internal notes so that staff can read it quickly and the practice’s software can read it exactly. You may reword, reorder and merge sentences. You may not change what they instruct, and you may not add anything.',
    '',
    `THE PAGE: ${fence(path)}`,
    typed === 'pathway'
      ? 'This is a REFERRAL PATHWAY page. The software reads its fields from lines written exactly as “Speciality: …”, “Clinic type: …”, “Priority: …”, “Hospital: …”, “Service: …”, “Form: …”, “Send to: …” — one field per line, plain text, no bold on the label. Where the page records several clinics, keep each under its own bold title with its own field lines beneath it. A “Location:” line is the hospital; a “Clinic:” line is the clinic type.'
      : typed === 'contacts'
        ? 'This is a CONTACTS page. Every phone number and email address must survive character for character.'
        : '',
    '',
    'RULES',
    `- Field labels come only from this list: ${LABELS.join(', ')}.`,
    '- NEVER add a field line the page does not state. If the page nowhere says which speciality or clinic type to choose, there is no “Speciality:” line to write — a value you supply is an invented fact and the rewrite will be refused.',
    '- One procedure per page is the aim, but you cannot move text to another page here: if the page holds two unrelated procedures, keep both, each under its own heading.',
    '- No HTML tags and no colour spans. No escaped or unbalanced ** markers. Remove a heading that has nothing under it.',
    '- Keep every fact: every number, time, dose, phone number, email address, code (2WW, RP, ESP, NHS), person’s name, hospital and service name exactly as written.',
    '- Keep every image line (![…](…)) exactly as written, in a sensible place.',
    '- Keep numbered steps in their order.',
    '- Do not write “follow the standard process”; if the page says it, keep the sentence, but do not add such sentences.',
    violations.length ? '- The page currently breaks these rules; fix them:\n' + violations.map((v) => `  · ${v.rule}: ${v.message}`).join('\n') : '',
    '',
    'THE MAP',
    'Every sentence of the page below is prefixed with an id like [s12]. Return "body" (the rewritten page WITHOUT the markers) and "map": one entry per sentence of your body — "text" is that sentence exactly as it appears in your body, "from" lists the source ids it was written from. Every source id must appear in some "from", except an exact duplicate of a kept sentence, which you list in "dropped" with why "duplicate". Nothing in your body may lack a "from".',
    '',
    'THE PAGE, ANNOTATED',
    '"""',
    fence(annotated),
    '"""',
  ].filter((line) => line !== '').join('\n');
}

async function loadContext(noteId) {
  const [notes, attachments] = await Promise.all([listNotes(), listAttachments().catch(() => [])]);
  const note = notes.find((n) => n.id === noteId) || null;
  if (!note) return { error: 'No such page.' };
  if (note.parentId == null || note.isSection) return { error: 'Sections have no page to rewrite.' };
  const sources = buildFullNotebookSources(notes, attachments);
  const page = sources.find((p) => p.docId === 'note:' + noteId) || { docTitle: 'Notebook: ' + note.title, text: String(note.body || ''), images: [] };
  const path = String(page.docTitle || '').replace(/^Notebook:\s*/, '');
  return { note, page, path, typed: typedOf(page) };
}

const shape = (proposal, validation, meaning, note, path) => ({
  proposal: { id: proposal.id, noteId: proposal.noteId, sourceHash: proposal.sourceHash, body: proposal.body, map: proposal.map, status: proposal.status },
  validation,
  meaning,
  before: { title: note.title, body: String(note.body || ''), path },
  diff: lineDiff(String(note.body || '').replace(/\r\n/g, '\n'), String(proposal.body || '')),
});

export async function proposeDefrag({ noteId, openrouter, roles, turnId = '' }) {
  const ctx = await loadContext(noteId);
  if (ctx.error) return { error: ctx.error, status: 400 };
  const { note, page, path, typed } = ctx;
  const source = String(note.body || '').replace(/\r\n/g, '\n');
  const sentences = splitSentences(source);
  if (!sentences.some(isContent)) return { error: 'Nothing on this page to rewrite.', status: 400 };
  const violations = runRules({ note, path: path.split(' / '), sentences, page, typed, dupIndex: null });

  const raw = await readStructured({
    openrouter,
    model: roles.reasoning.model,
    schema: PROPOSAL_SCHEMA,
    prompt: proposalPrompt({ path, typed, annotated: annotate(source, sentences), violations }),
    maxOutputTokens: Math.min(16000, Math.max(2000, Math.ceil(source.length / 2) + 1500)),
    role: 'reasoning',
    phase: 'defragPropose',
    turnId,
  });

  const validation = validateProposal({ sourceBody: source, proposal: raw, page, typed });
  const meaning = validation.ok
    ? await checkMeaning({ pairs: validation.pairs, openrouter, model: roles.reasoning.model, turnId, path })
    : { ok: false, verdicts: {}, changed: [], unsure: [], missing: [], model: '', skipped: 'validation failed' };
  const stored = await insertProposal({ noteId, sourceHash: hashBody(source), body: validation.body, map: raw.map, validation: slim(validation), meaning, turnId });
  return shape(stored, validation, meaning, note, path);
}

export async function revalidateProposal({ proposalId, body, openrouter, roles, turnId = '' }) {
  const proposal = await getProposal(proposalId);
  if (!proposal) return { error: 'No such proposal.', status: 404 };
  if (proposal.status !== 'draft') return { error: 'This proposal is ' + proposal.status + '.', status: 409 };
  const ctx = await loadContext(proposal.noteId);
  if (ctx.error) return { error: ctx.error, status: 400 };
  const { note, page, path, typed } = ctx;
  const source = String(note.body || '').replace(/\r\n/g, '\n');
  if (hashBody(source) !== proposal.sourceHash) return { error: 'The page was edited since this proposal was made. Propose again.', status: 409, code: 'changed' };

  // The reader's edit keeps the model's map where it still fits; anything
  // that no longer matches a sentence shows up as unmapped and blocks.
  const validation = validateProposal({ sourceBody: source, proposal: { body: String(body || ''), map: proposal.map, dropped: [] }, page, typed });
  const cache = (proposal.meaning && proposal.meaning.verdicts) || {};
  const meaning = validation.ok
    ? await checkMeaning({ pairs: validation.pairs, openrouter, model: roles.reasoning.model, turnId, path, cache })
    : { ok: false, verdicts: cache, changed: [], unsure: [], missing: [], model: '', skipped: 'validation failed' };
  const stored = await updateProposal({ id: proposalId, body: validation.body, validation: slim(validation), meaning });
  return shape(stored, validation, meaning, note, path);
}

export async function applyProposal({ proposalId, turnId = '' }) {
  const proposal = await getProposal(proposalId);
  if (!proposal) return { error: 'No such proposal.', status: 404 };
  if (proposal.status !== 'draft') return { error: 'This proposal is ' + proposal.status + '.', status: 409 };
  const ctx = await loadContext(proposal.noteId);
  if (ctx.error) return { error: ctx.error, status: 400 };
  const { note, page, typed } = ctx;
  const source = String(note.body || '').replace(/\r\n/g, '\n');
  if (hashBody(source) !== proposal.sourceHash) return { error: 'The page was edited since this proposal was made. Propose again.', status: 409, code: 'changed' };

  // Nothing from the browser is trusted: the stored text is checked again.
  const validation = validateProposal({ sourceBody: source, proposal: { body: proposal.body, map: proposal.map, dropped: [] }, page, typed });
  if (!validation.ok) return { error: 'The proposal no longer passes validation.', status: 422, code: 'invalid', validation: slim(validation) };
  const meaning = proposal.meaning || {};
  const judged = meaning.verdicts || {};
  const unjudged = validation.pairs.filter((p) => !p.same && !(judged[p.id] && judged[p.id].verdict));
  const changed = validation.pairs.filter((p) => judged[p.id] && judged[p.id].verdict === 'changed');
  if (changed.length || unjudged.length) return { error: 'The meaning check has not passed for every sentence.', status: 422, code: 'meaning', changed: changed.map((p) => p.id), unjudged: unjudged.map((p) => p.id) };

  const result = await applyRevisionedUpdate({ id: proposal.noteId, body: proposal.body, reason: 'defrag', proposalId: proposal.id, turnId });
  if (result.error) return { error: result.error, status: 400 };
  await updateProposal({ id: proposalId, status: 'applied' });
  return { note: result.note, revisionId: result.revisionId, proposalId: proposal.id };
}

export async function rejectProposal({ proposalId }) {
  const proposal = await getProposal(proposalId);
  if (!proposal) return { error: 'No such proposal.', status: 404 };
  await updateProposal({ id: proposalId, status: 'rejected' });
  return { ok: true };
}

// What is stored: the verdicts and problems, not the sentence arrays, which
// are rebuilt from the text whenever they are needed.
function slim(validation) {
  return {
    ok: validation.ok,
    checks: validation.checks,
    pairs: validation.pairs,
    violationsBefore: validation.violationsBefore,
    violationsAfter: validation.violationsAfter,
  };
}
