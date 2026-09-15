// Does the Notebook disagree with itself?
//
// Rewriting one page tidies its wording. Rewriting the whole Notebook raises a
// question no single page can answer: two pages, each perfectly tidy, that tell
// staff different things — "send the form to physio.referrals@nhs.net" on one
// page and a different address on another, "within 48 hours" here and "within
// 72 hours" there. A rewrite must never choose between them. Which one is right
// is the practice's decision, and a model that picked one would be inventing a
// fact with a tidy sentence around it.
//
// So the sweep runs BEFORE any page is rewritten, and every page it names waits
// until the reader has decided. Two stages, for cost as much as for accuracy:
//
//   candidates  code alone, over the sentences the pages already parse into:
//               pairs that are about the same thing and differ in a fact
//   findings    those pairs, and only those, shown to the reasoning model,
//               which says whether each really is a contradiction
//
// Pure. The model call lives in lib/notebook/coherence.js.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { normForMatch } from '../ai/quote-match.js';
import { isContent } from './sentences.mjs';
import { fieldOf } from './rules.mjs';

// Re-exported: the sweep found the field lines, so callers reading its output
// reach for this here.
export { fieldOf };
import { extractVerbatim } from './validate.mjs';

/** How alike two sentences must be before a difference between them is worth a question. */
export const SIM_MIN = 0.55;
/** The most pairs one sweep will put to the model, whatever the Notebook's size. */
export const MAX_CANDIDATES = 120;
/** Pairs per model call. */
export const COHERENCE_CHUNK = 20;

// Words that carry no subject. Negations are deliberately NOT here: "not" is
// the whole point of half these comparisons.
const STOP = new Set(('a an and are as at be been being by for from had has have if in into is it its of on or that the their'
  + ' then there these this those to was were will with you your our we they he she them us i').split(' '));

// Title words that name no subject — every referral page has them.
const TITLE_STOP = new Set(['referral', 'referrals', 'page', 'notes', 'note', 'process', 'procedure', 'guide', 'info', 'information', 'general', 'new', 'old']);

// The words that carry an instruction's force. Two near-identical sentences
// where one of these is present and the other's is not — "cannot" against
// "can", "must" against "may" — are the opposite instruction in the same words.
const FORCE = new Set(("must mustn't should shouldn't shall may can cannot can't will won't need always never"
  + " not no none without unless except only don't doesn't didn't").split(' '));

const words = (norm) => String(norm || '').split(/[^a-z0-9@.+&_'-]+/).filter(Boolean);
const topical = (norm) => words(norm).filter((t) => t.length > 1 && !STOP.has(t));

const pairId = (a, b) => createHash('sha1').update([a, b].sort().join(' || ')).digest('hex').slice(0, 12);

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

// What the code can see differs between two statements, in the reader's words.
// Numbers, addresses, phone numbers and codes are the differences that make an
// answer wrong; a difference in polarity makes it opposite.
function differences(a, b) {
  const va = extractVerbatim(a);
  const vb = extractVerbatim(b);
  const out = [];
  const only = (from, to) => { const s = new Set(to); return [...new Set(from)].filter((x) => !s.has(x)); };
  for (const kind of ['emails', 'phones', 'numbers', 'codes']) {
    const left = only(va[kind], vb[kind]);
    const right = only(vb[kind], va[kind]);
    if (!left.length && !right.length) continue;
    out.push({ kind, left, right });
  }
  const forceA = new Set(words(normForMatch(a)).filter((t) => FORCE.has(t)));
  const forceB = new Set(words(normForMatch(b)).filter((t) => FORCE.has(t)));
  const leftForce = [...forceA].filter((t) => !forceB.has(t));
  const rightForce = [...forceB].filter((t) => !forceA.has(t));
  if (leftForce.length || rightForce.length) out.push({ kind: 'force', left: leftForce, right: rightForce });
  return out;
}

const describe = (diffs) => diffs.map((d) => {
  const side = (xs) => (xs.length ? xs.slice(0, 3).join(', ') : 'nothing');
  if (d.kind === 'force') {
    const quoted = (xs) => (xs.length ? '\u201c' + xs.slice(0, 3).join('\u201d, \u201c') + '\u201d' : 'nothing of the kind');
    return `one page says ${quoted(d.left)}, the other ${quoted(d.right)}`;
  }
  return `${d.kind}: ${side(d.left)} vs ${side(d.right)}`;
}).join('; ');

const sideOf = (page, sentence) => ({
  noteId: page.noteId,
  title: page.title,
  path: (page.path || []).join(' / '),
  sentenceId: sentence.id,
  text: sentence.text,
});

/**
 * Pairs worth putting to the model.
 *
 * @param {Array<{noteId:number,title:string,path:string[],sentences:Array}>} pages
 * @param {{ max?: number, skip?: Set<string> }} options  skip: pair ids already decided
 * @returns {Array<{id:string,kind:string,subject:string,why:string,score:number,a:object,b:object}>}
 */
export function findCandidates(pages = [], { max = MAX_CANDIDATES, skip = new Set() } = {}) {
  const live = (pages || []).filter((p) => p && p.sentences && p.sentences.length);
  const found = new Map();

  const add = (cand) => {
    if (skip.has(cand.id) || found.has(cand.id)) return;
    found.set(cand.id, cand);
  };

  /* ---- fields: two pages about the same thing, the same label, different values */

  // A title word is distinctive if few pages use it; "physiotherapy" groups two
  // physio pages, "referral" would group the lot.
  const titleWords = new Map(); // token -> noteIds
  for (const p of live) {
    for (const t of new Set(topical(normForMatch(p.title)))) {
      if (TITLE_STOP.has(t) || t.length < 4) continue;
      if (!titleWords.has(t)) titleWords.set(t, []);
      titleWords.get(t).push(p.noteId);
    }
  }
  const spread = Math.max(3, Math.ceil(live.length * 0.2));
  const byId = new Map(live.map((p) => [p.noteId, p]));
  const related = new Map(); // "a:b" page pair -> the word they share
  for (const [token, ids] of titleWords) {
    if (ids.length < 2 || ids.length > spread) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort((x, y) => x - y).join(':');
        if (!related.has(key)) related.set(key, token);
      }
    }
  }
  for (const [key, shared] of related) {
    const [x, y] = key.split(':').map(Number);
    const pa = byId.get(x);
    const pb = byId.get(y);
    if (!pa || !pb) continue;
    const fieldsA = new Map();
    for (const s of pa.sentences) { const f = fieldOf(s.text); if (f && !fieldsA.has(f.field)) fieldsA.set(f.field, { f, s }); }
    for (const s of pb.sentences) {
      const f = fieldOf(s.text);
      if (!f) continue;
      const other = fieldsA.get(f.field);
      if (!other) continue;
      if (normForMatch(other.f.value) === normForMatch(f.value)) continue;
      const a = sideOf(pa, other.s);
      const b = sideOf(pb, s);
      add({
        id: pairId(a.path + a.text, b.path + b.text),
        kind: 'field',
        subject: shared || f.field.toLowerCase(),
        why: `both pages state “${f.field}:” and the values differ`,
        score: 1 + (f.field === 'Send to' || f.field === 'Form' ? 0.2 : 0),
        a,
        b,
      });
    }
  }

  /* ---- echoes: the same sentence on two pages, with a fact changed */

  const statements = [];
  for (const p of live) {
    for (const s of p.sentences) {
      if (!isContent(s) || s.kind === 'label') continue;
      if (s.norm.length < 30 || words(s.norm).length < 6) continue;
      statements.push({ page: p, s, set: new Set(topical(s.norm)) });
    }
  }
  // An inverted index on words few sentences use, so only sentences that could
  // possibly be about the same thing are ever compared.
  const index = new Map();
  for (let i = 0; i < statements.length; i++) {
    for (const t of statements[i].set) {
      if (!index.has(t)) index.set(t, []);
      index.get(t).push(i);
    }
  }
  const common = Math.max(12, Math.ceil(statements.length * 0.02));
  const seen = new Set();
  for (const [, bucket] of index) {
    if (bucket.length < 2 || bucket.length > common) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const key = bucket[i] + ':' + bucket[j];
        if (seen.has(key)) continue;
        seen.add(key);
        const x = statements[bucket[i]];
        const y = statements[bucket[j]];
        if (x.page.noteId === y.page.noteId) continue;
        const sim = jaccard(x.set, y.set);
        // 1 is the same sentence twice — that is the duplicate rule's business,
        // not a disagreement.
        if (sim < SIM_MIN || sim >= 1) continue;
        const diffs = differences(x.s.text, y.s.text);
        if (!diffs.length) continue;
        const a = sideOf(x.page, x.s);
        const b = sideOf(y.page, y.s);
        add({
          id: pairId(a.path + a.text, b.path + b.text),
          kind: 'echo',
          subject: [...x.set].filter((t) => y.set.has(t)).slice(0, 4).join(' '),
          why: describe(diffs),
          score: sim + (diffs.some((d) => d.kind === 'force') ? 0.3 : 0),
          a,
          b,
        });
      }
    }
  }

  return [...found.values()]
    .sort((p, q) => q.score - p.score || (p.id < q.id ? -1 : 1))
    .slice(0, Math.max(0, max));
}

/* ------------------------------------------------------------- the judge */

export const COHERENCE_SCHEMA = z.object({
  findings: z.array(z.object({
    id: z.string(),
    verdict: z.enum(['contradiction', 'consistent', 'unsure']),
    reason: z.string().max(240).default(''),
    question: z.string().max(200).default(''),
    severity: z.enum(['high', 'low']).default('high'),
  })),
});

export function chunkCandidates(candidates, size = COHERENCE_CHUNK) {
  const out = [];
  for (let i = 0; i < (candidates || []).length; i += size) out.push(candidates.slice(i, i + size));
  return out;
}

export function buildCoherencePrompt(candidates) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');
  return [
    'You are auditing a GP practice’s internal notes — the instructions reception and admin staff follow — for pages that disagree with each other. Each pair below was found by code: two statements on two different pages that are about the same thing and differ in a fact. You are not asked to rewrite anything and you are not asked which one is right. You are asked ONE thing per pair: can both statements be true at the same time?',
    '',
    'Answer for each pair:',
    '- "contradiction" — they cannot both be right. A member of staff reading one page would do something different from one reading the other: a different address, number, time, form, destination, priority or order, or the opposite instruction. Someone has to decide which is correct.',
    '- "consistent" — both can be true at once: they describe different services, different circumstances, different stages, or one is a special case of the other, or the difference is only wording.',
    '- "unsure" — you cannot tell from the two statements and their page names alone.',
    '',
    'Also give, for every pair:',
    '- "reason": one sentence saying what the disagreement is, in the practice’s own terms.',
    '- "question": the single question the practice must answer to settle it, phrased for a receptionist to answer — empty if the verdict is not "contradiction".',
    '- "severity": "high" if following the wrong one sends a patient, a form or a phone call to the wrong place, or gets a time, dose or priority wrong; "low" if it is a difference of wording or emphasis.',
    '',
    'Being on different pages is not itself a disagreement, and a practice recording the same thing twice is not a disagreement. A general rule on one page and its exception on another are CONSISTENT — "use the doctor who created the task" and "if the task was created by someone who is not a doctor, use Dr Goel" are one instruction in two places, not two instructions. Only call it a contradiction where a member of staff could follow one and be wrong by the other. Return one finding for EVERY pair id, and nothing for ids that are not listed.',
    '',
    'THE PAIRS',
    '',
    ...(candidates || []).flatMap((c) => [
      `#${c.id}`,
      `PAGE A: ${fence(c.a.path)}`,
      `STATEMENT A: ${fence(c.a.text)}`,
      `PAGE B: ${fence(c.b.path)}`,
      `STATEMENT B: ${fence(c.b.text)}`,
      `THE CODE NOTICED: ${fence(c.why)}`,
      '',
    ]),
  ].join('\n');
}

/**
 * Fold the findings from every chunk back onto the candidates.
 * Consistent pairs are dropped — they are the answer "nothing to see here".
 * A pair no reply mentioned is "unsure", which is flagged but does not block.
 */
export function mergeFindings(candidates, findingArrays, { model = '' } = {}) {
  const byId = new Map();
  for (const arr of findingArrays || []) {
    for (const f of arr || []) {
      if (!f || !f.id) continue;
      byId.set(String(f.id), {
        verdict: f.verdict,
        reason: String(f.reason || ''),
        question: String(f.question || ''),
        severity: f.severity === 'low' ? 'low' : 'high',
      });
    }
  }
  const flagged = [];
  const missing = [];
  for (const c of candidates || []) {
    const f = byId.get(c.id);
    if (!f) { missing.push(c.id); flagged.push({ ...c, verdict: 'unsure', reason: 'No verdict was returned for this pair.', question: '', severity: 'low' }); continue; }
    if (f.verdict === 'consistent') continue;
    flagged.push({ ...c, ...f });
  }
  const contradictions = flagged.filter((f) => f.verdict === 'contradiction');
  return {
    flagged,
    contradictions,
    unsure: flagged.filter((f) => f.verdict === 'unsure'),
    missing,
    ok: contradictions.length === 0,
    model,
    checkedAt: new Date().toISOString(),
  };
}
