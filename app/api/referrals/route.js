// The Referrals page's data (app/page.js, app/_components/ReferralsPage.jsx).
//
//   GET /api/referrals        — every referral in the Notebook's Referrals
//                               section (hubs left out), A–Z, each with the
//                               card it opens to, and the ids of the most asked
//                               for over the last 30 days
//   GET /api/referrals?q=skin — the same rows for the best matches, best first,
//                               as TypeSafe's Jev judges them (lib/search/
//                               referrals-jev.mjs), or by keyword when Jev
//                               does not answer
//
// Pages come from fullNotebookContext() — the live Notebook, memoised until a
// row changes — so an edit in Practice notes is on this page at the next
// request. Ranking is lib/search/referrals.mjs; the keyword search over the
// pages' text is lib/search/referrals-search.mjs.
//
// THE CARD IS THE Q&A'S CARD. A live e-RS or email card is drawn exactly as a
// Q&A answer that picked the page draws it: the page (notebookPageAnswer) with
// its screen built from the saved fields above it (withKindCard). A plain page
// is the page, as a Notebook page answer shows it. Built here, in code, from
// the stored page — no model is anywhere in it.
import { NextResponse } from 'next/server';
import { fullNotebookContext } from '@/lib/notebook';
import { noteKind } from '@/lib/notebook/kinds.mjs';
import { notebookPageAnswer } from '@/lib/templates/notebook.mjs';
import { withKindCard } from '@/lib/templates/route.mjs';
import {
  MAX_RESULTS, alphabetical, isLiveCard, popularReferrals, referralPages, shapeResult,
} from '@/lib/search/referrals.mjs';
import { referralAskCounts, searchReferrals } from '@/lib/search/referrals-search.mjs';
import { createJevCache, rankByJev, runReferralJev } from '@/lib/search/referrals-jev.mjs';
import { decide, decisionUsage } from '@/lib/ai/decisions.mjs';
import { redactIdentifiers } from '@/lib/safety/identifiers.mjs';
import { getModelRoles } from '@/lib/settings';
import { recordUsage } from '@/lib/ai/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function cardFor(page) {
  const plain = notebookPageAnswer({ pages: [page.docTitle], all: [page] });
  if (!plain || !isLiveCard(page)) return plain;
  return withKindCard(plain, { page, kind: noteKind(page.noteKind) });
}

const row = (page) => ({ ...shapeResult(page), card: cardFor(page) });

// Recent searches' scores, per server instance: the same search asked again is
// not sent to Jev again.
const jevCache = createJevCache();

// Jev's scores for this search, from memory or from one call. Null when it did
// not answer, and the keyword ranking stands.
async function jevScoresFor(q, pages) {
  const query = redactIdentifiers(q).text;
  const remembered = jevCache.get(query, pages);
  if (remembered) return remembered;
  let model = '';
  try {
    model = (await getModelRoles()).check.model;
  } catch (e) {
    console.warn('[referrals] jev model: ' + String(e?.message || e).slice(0, 200));
    return null;
  }
  const result = await runReferralJev({
    decide,
    model,
    query,
    pages,
    onUsage: (usage, used) => { recordUsage({ role: 'check', phase: 'referralSearch', model: used, usage: decisionUsage(usage) }); },
  });
  if (result.error) {
    console.warn('[referrals] jev on ' + model + ' failed after ' + result.ms + 'ms: ' + result.error);
    return null;
  }
  jevCache.set(query, pages, result.scores);
  return result.scores;
}

export async function GET(request) {
  const q = (request.nextUrl.searchParams.get('q') || '').slice(0, 200).trim();
  // The ask counts do not depend on the Notebook, so on the A–Z list they are
  // read alongside it rather than after it. Caught here and settled below, so
  // a failed log is never an unhandled rejection when the Notebook fails first.
  const asks = q ? null : referralAskCounts().then((counts) => ({ counts }), (error) => ({ error }));
  let pages;
  try {
    pages = referralPages(await fullNotebookContext());
  } catch (e) {
    console.warn('[referrals] notebook: ' + String(e?.message || e).slice(0, 200));
    return NextResponse.json({ error: 'The Notebook could not be read.' }, { status: 503, headers: NO_STORE });
  }

  if (!q) {
    // The most asked for is a nicety: a log that cannot be read leaves the
    // page on its A–Z list, which is what an install with no questions yet
    // shows anyway.
    let popular = [];
    try {
      const { counts, error } = await asks;
      if (error) throw error;
      popular = popularReferrals(counts, pages).map((page) => page.docId);
    } catch (e) {
      console.warn('[referrals] most asked: ' + String(e?.message || e).slice(0, 200));
    }
    return NextResponse.json({ referrals: alphabetical(pages).map(row), popular }, { headers: NO_STORE });
  }

  // Both at once: Jev's judgement, and the keyword ranking that breaks its ties
  // and stands in for it when it does not answer.
  const [jev, keyword] = await Promise.all([
    jevScoresFor(q, pages),
    searchReferrals(q, pages).then((ranked) => ({ ranked }), (error) => ({ error })),
  ]);
  if (jev) {
    const order = keyword.ranked ? keyword.ranked.map((p) => p.docId) : [];
    const ranked = rankByJev(pages, jev, { order }).slice(0, MAX_RESULTS);
    return NextResponse.json({ q, by: 'jev', results: ranked.map(row) }, { headers: NO_STORE });
  }
  if (keyword.ranked) {
    return NextResponse.json({ q, by: 'keyword', results: keyword.ranked.map(row) }, { headers: NO_STORE });
  }
  // The page already shows its own keyword matches and keeps them.
  console.warn('[referrals] search: ' + String(keyword.error?.message || keyword.error).slice(0, 200));
  return NextResponse.json({ q, results: null, error: 'Search is unavailable.' }, { status: 503, headers: NO_STORE });
}
