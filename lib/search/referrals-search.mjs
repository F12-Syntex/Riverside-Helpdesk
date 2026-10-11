// The Referrals page's search: the one part of it that reaches the database.
// What is listed and how it is ranked are the pure rules in
// lib/search/referrals.mjs, and the words a reader says for each referral are
// lib/search/referral-aliases.mjs; this gathers the keyword scores.
//
// Relative imports with extensions, not `@/`: the tests run this under plain
// `node`.
import { ensureKnowledgeSchema, ensureQuestionLogSchema, getSql } from '../db.js';
import { orQuery } from './query.mjs';
import { conceptsOf, searchWords } from './referral-aliases.mjs';
import { POPULAR_DAYS, REFERRALS_SECTION, rankReferrals, referralQuery } from './referrals.mjs';

/**
 * Per page: its best passage's keyword rank (title weighted 'A', as the
 * Notebook search does), over these pages only, so every referral gets a
 * score however many other sections share the words. Sixty-odd pages'
 * passages: a scan of a few hundred rows.
 */
async function passageScores(docIds, words) {
  await ensureKnowledgeSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT p.entry_id AS "entryId",
           max(ts_rank_cd(setweight(to_tsvector('english', e.title), 'A') || p.search_doc, to_tsquery('english', ${words})))::float8 AS lexical
    FROM knowledge_passages p
    JOIN knowledge_entries e ON e.id = p.entry_id
    WHERE e.status = 'active' AND p.entry_id = ANY(${docIds})
      AND (setweight(to_tsvector('english', e.title), 'A') || p.search_doc) @@ to_tsquery('english', ${words})
    GROUP BY p.entry_id
  `;
  return new Map(rows.map((r) => [r.entryId, { lexical: Number(r.lexical) || 0 }]));
}

/**
 * `pages` (referralPages) ranked for `query`, best first (rankReferrals): the
 * query's concepts matched against each page's name, and the concepts' every
 * term searched for in the pages' text. A database error is thrown: the route
 * answers with nothing, and the page keeps its own keyword filter.
 */
export async function searchReferrals(query, pages, { scorePassages = passageScores, ranking = {} } = {}) {
  const concepts = conceptsOf(referralQuery(query));
  const words = orQuery(searchWords(concepts));
  if (!words || !pages.length) return [];
  const scores = await scorePassages(pages.map((p) => p.docId), words);
  return rankReferrals(pages, { ...ranking, concepts, scores });
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
