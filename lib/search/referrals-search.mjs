// The Referrals page's search: the one part of it that reaches the database
// and the embedding API. What is listed and how it is ranked are the pure rules
// in lib/search/referrals.mjs; this gathers their inputs.
//
// Relative imports with extensions, not `@/`: the benches run this under
// plain `node`.
import { ensureKnowledgeSchema, ensureQuestionLogSchema, getSql } from '../db.js';
import { embedTexts } from '../../rag/lib/embed.mjs';
import { orQuery } from './query.mjs';
import { withinMs } from './deadline.mjs';
import { queryVector, QUERY_VECTOR_MS } from './search.mjs';
import { POPULAR_DAYS, REFERRALS_SECTION, rankReferrals, referralNameText, referralQuery } from './referrals.mjs';

// How long the name vectors' one request may take before it is given up. It
// runs in the background past the search's own budget, so a slow first fill
// costs one search its name scores, not its answer.
const NAME_FILL_MS = 15000;

// The name texts' vectors (referralNameText), kept for the life of the server
// instance and keyed by the text itself, so an edited card is embedded afresh
// and an unchanged one never again. Some sixty short strings: one request.
const nameVectors = new Map();
let nameFill = null;

/**
 * The cached vectors, after asking for the missing ones in one request and
 * waiting on it for at most `budgetMs`. A fill that misses the budget keeps
 * going and the next search has its vectors; one that fails is logged, and
 * the next search asks again.
 */
async function namesVectors(pages, { embedMany = embedTexts, budgetMs }) {
  const texts = [...new Set(pages.map(referralNameText).filter(Boolean))];
  const missing = texts.filter((t) => !nameVectors.has(t));
  if (missing.length) {
    if (!nameFill) {
      nameFill = Promise.resolve()
        .then(() => embedMany(missing, { timeoutMs: NAME_FILL_MS }))
        .then((vectors) => { missing.forEach((t, i) => { if (Array.isArray(vectors?.[i])) nameVectors.set(t, vectors[i]); }); })
        .catch((e) => { console.warn('[referrals] name vectors: ' + String(e?.message || e).slice(0, 200)); })
        .finally(() => { nameFill = null; });
    }
    await withinMs(nameFill, budgetMs);
  }
  return nameVectors;
}

/**
 * Start fetching the name vectors without waiting for them. Called when the
 * page loads its list, so the first search of a fresh server instance — seconds
 * later — finds them cached, rather than spending its budget on the fill and
 * ranking by passages alone (which put a foot clinic above Normal
 * Dermatology for "skin").
 */
export function warmReferralNames(pages, { embedMany } = {}) {
  namesVectors(pages, { embedMany, budgetMs: 0 }).catch(() => {});
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Per page: its best passage's cosine to the query vector, and its best
 * passage's keyword rank (title weighted 'A', as the Notebook search does).
 *
 * RESTRICTED TO THESE PAGES, rather than searchPassages() filtered afterwards.
 * The Notebook-wide search keeps its nearest forty passages across every
 * section, so a query near Blood tests or Reception pages could leave half the
 * referrals with no score at all; here every referral gets one. Sixty-odd
 * pages' passages, exact cosine: a scan of a few hundred rows.
 */
async function passageScores(docIds, words, vector) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const qv = Array.isArray(vector) && vector.length ? '[' + vector.map((n) => Number(n) || 0).join(',') + ']' : null;
  const rows = await sql`
    SELECT p.entry_id AS "entryId",
           coalesce(max(CASE WHEN ${qv}::text IS NOT NULL AND p.embedding IS NOT NULL
                             THEN 1 - (p.embedding <=> ${qv}::vector) END), 0)::float8 AS semantic,
           coalesce(max(CASE WHEN ${words} <> ''
                              AND (setweight(to_tsvector('english', e.title), 'A') || p.search_doc) @@ to_tsquery('english', ${words})
                             THEN ts_rank_cd(setweight(to_tsvector('english', e.title), 'A') || p.search_doc, to_tsquery('english', ${words})) END), 0)::float8 AS lexical
    FROM knowledge_passages p
    JOIN knowledge_entries e ON e.id = p.entry_id
    WHERE e.status = 'active' AND p.entry_id = ANY(${docIds})
    GROUP BY p.entry_id
  `;
  return new Map(rows.map((r) => [r.entryId, { semantic: Number(r.semantic) || 0, lexical: Number(r.lexical) || 0 }]));
}

/**
 * `pages` (referralPages) ranked for `query`, best first (rankReferrals).
 *
 * The query is embedded with queryVector — the Q&A's own cache and its
 * QUERY_VECTOR_MS budget — at the same time as the name vectors are fetched.
 * Neither is required: with no query vector the keyword arm ranks alone; with
 * no name vectors, meaning is the passages' alone. A database error is thrown:
 * the route answers with nothing, and the page keeps its own keyword filter.
 */
export async function searchReferrals(query, pages, { embed, embedMany, scorePassages = passageScores, budgetMs = QUERY_VECTOR_MS, ranking = {} } = {}) {
  const text = referralQuery(query);
  const words = orQuery(text);
  if (!words || !pages.length) return [];
  const [vector, vectors] = await Promise.all([
    queryVector(text, embed ? { embed, budgetMs } : { budgetMs }).catch(() => null),
    namesVectors(pages, { embedMany, budgetMs }).catch(() => new Map()),
  ]);
  const scores = await scorePassages(pages.map((p) => p.docId), words, vector);
  const names = new Map();
  if (vector) {
    for (const page of pages) {
      const v = vectors.get(referralNameText(page));
      if (v) names.set(page.docId, cosine(vector, v));
    }
  }
  return rankReferrals(pages, { ...ranking, scores, names });
}

/**
 * How often each Notebook page answered a question over the last `days`, as
 * `{ source, asked }` rows for popularReferrals. Every answered turn that cited
 * a page counts — a referral card, a Notebook page answer — whichever template
 * drew it; a failed turn does not. The log's `source` joins a turn's pages
 * with " · ", split here the way summariseBySource (lib/questions/log.js)
 * splits it.
 */
export async function referralAskCounts({ days = POPULAR_DAYS } = {}) {
  await ensureQuestionLogSchema();
  const sql = getSql();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return sql`
    SELECT trim(src) AS source, count(*)::int AS asked
    FROM question_log q
    CROSS JOIN LATERAL unnest(string_to_array(q.source, ' · ')) AS src
    WHERE q.at >= ${since}::timestamptz AND q.outcome <> 'failed' AND q.source <> ''
      AND trim(src) ILIKE ${'Notebook: ' + REFERRALS_SECTION + ' /%'}
    GROUP BY trim(src)
  `;
}
