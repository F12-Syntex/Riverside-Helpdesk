// The confidence-scored router: a fast path IN FRONT of the template picker.
//
// The picker is one generateObject call that must return one of an enum of
// templates — or a page title — with no score anywhere in the decision. A
// near-miss and a total miss are indistinguishable to it, so wording drift
// fails as a cliff: slightly different words and the assistant says it does
// not know. This module puts a score, and a margin, in front of that call:
//
//   question
//     → normalise (./normalise.mjs)
//     → rung 1: exact match on the canonical form            ~0 ms
//     → rung 2: lexical tsvector over the trigger phrases     1 query
//     → rung 3: vector kNN over the trigger phrases           1 embed + 1 query
//     → rung 4: fuse 2 + 3 by RRF                             ./decision.mjs
//     → rung 5: decide on confidence + margin                 ./decision.mjs
//          hit       → the page, rendered directly, NO model call
//          ambiguous → a question back, top 2–3 pages as options
//          miss      → the picker, exactly as it was
//
// STRICTLY ADDITIVE. The worst this can do is what happens today: a miss, an
// error, a database that is down, or the master switch being off all return a
// non-hit and the caller goes on to the picker with inputs it never touched.
// routeQuestion never throws; the caller still wraps it in .catch as belt and
// braces.
//
// ONLY NOTEBOOK PAGES ARE ROUTED TO. A page is answered by rendering it; a
// template needs its variables filled (which referral, which scenario), which
// is exactly the reading the picker does and this module does not. The table
// allows a 'template' target so that can be added later; the router ignores
// them until it can act on one.
import { normaliseQuestion } from './normalise.mjs';
import { getRoutingThresholds } from './thresholds.mjs';
import { exactTriggers, recordRoutingDecision, searchTriggers, vectorLiteral } from './triggers.mjs';
import { clarifyPayload, decide, fuseCandidates } from './decision.mjs';
import { embedOne } from '../../rag/lib/embed.mjs';

// Below this, a canonical question is too thin to route ("bp", "ok?"). Same
// bar the old exact-match cache used.
export const MIN_NORMALISED_CHARS = 8;

const NONE = Object.freeze({ confidence: 0, margin: 0, target: null, page: null, clarify: null, candidates: [] });

export const pageLeaf = (title) => String(title || '').replace(/^notebook:\s*/i, '').split('/').pop().trim();
export const pagePath = (title) => String(title || '').replace(/^notebook:\s*/i, '').trim();

/**
 * Route one question against the trigger index.
 *
 * `pages` are the Notebook rows the turn already loaded (`{ docId, docTitle,
 * text, … }` from fullNotebookContext), used to resolve a target to the page
 * that will be rendered; a target whose page is gone is dropped rather than
 * answered. `thresholds` overrides the stored ones (the bench does this);
 * `record` writes the decision to routing_decisions for the stats.
 *
 * Resolves to `{ decision, confidence, margin, rung, target, page, clarify,
 * candidates }` where decision is 'off' | 'hit' | 'ambiguous' | 'miss'.
 */
export async function routeQuestion(question, { pages = [], thresholds = null, turnId = '', record = true } = {}) {
  try {
    const t = thresholds || await getRoutingThresholds();
    if (!t.enabled) return { decision: 'off', rung: 'switch', ...NONE };

    const norm = normaliseQuestion(question);
    if (norm.length < MIN_NORMALISED_CHARS) return { decision: 'miss', rung: 'short', ...NONE };

    const byRef = new Map((pages || []).map((p) => [p.docId, p]));
    const pageFor = (c) => (c && c.targetKind === 'note' ? byRef.get(c.targetRef) || byRef.get(`note:${c.targetRef}`) || null : null);

    // Rung 1. One distinct page behind an exact phrasing is a hit with nothing
    // to weigh; two distinct pages behind the same words is the ambiguity the
    // margin exists for, so it falls through to the scored rungs.
    const exact = await exactTriggers(norm);
    const exactPages = dedupe(exact.map((row) => ({ ...row, page: pageFor(row) })).filter((c) => c.page));
    if (exactPages.length === 1) {
      const target = exactPages[0];
      const out = { decision: 'hit', rung: 'exact', confidence: 1, margin: 1, target, page: target.page, clarify: null, candidates: [target] };
      if (record) void recordRoutingDecision({ turnId, decision: 'hit', confidence: 1, margin: 1, targetKind: 'note', targetRef: target.targetRef });
      return out;
    }

    // Rungs 2–4. The embedding is best-effort: without it the lexical arm
    // still runs, but nothing can be confident enough to render.
    let vector = null;
    try { vector = vectorLiteral(await embedOne(String(question).trim())); } catch (e) { vector = null; }
    const rows = await searchTriggers(question, { vector });
    const candidates = fuseCandidates(rows)
      .map((c) => ({ ...c, page: pageFor(c) }))
      .filter((c) => c.page);

    // Rung 5.
    const verdict = decide(candidates, t);
    const out = { ...verdict, rung: 'scored', page: verdict.target ? verdict.target.page : null, clarify: null };
    if (verdict.decision === 'ambiguous') {
      out.clarify = clarifyPayload(verdict.candidates, {
        labelOf: (c) => pageLeaf(c.page.docTitle),
        fullLabelOf: (c) => pagePath(c.page.docTitle),
      });
      // Two candidates that render as one label are not a choice; answer the
      // usual way instead.
      if (!out.clarify) out.decision = 'miss';
    }
    if (record) {
      void recordRoutingDecision({
        turnId, decision: out.decision, confidence: out.confidence, margin: out.margin,
        targetKind: out.target ? 'note' : '', targetRef: out.target ? out.target.targetRef : '',
      });
    }
    return out;
  } catch (e) {
    console.warn('[routing] router failed, falling through:', String(e).slice(0, 160));
    return { decision: 'miss', rung: 'error', ...NONE };
  }
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((c) => {
    const key = `${c.targetKind}:${c.targetRef}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}