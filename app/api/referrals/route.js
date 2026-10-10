// The Referrals page's data (app/page.js, app/_components/ReferralsPage.jsx).
//
//   GET /api/referrals        — every referral in the Notebook's Referrals
//                               section (hubs left out), A–Z, each with the
//                               card it opens to, and the ids of the most asked
//                               for over the last 30 days
//   GET /api/referrals?q=skin — the same rows for the best matches, best first
//
// Pages come from fullNotebookContext() — the live Notebook, memoised until a
// row changes — so an edit in Practice notes is on this page at the next
// request. Ranking is lib/search/referrals.mjs; the database and embedding
// calls are lib/search/referrals-search.mjs.
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
  alphabetical, isLiveCard, popularReferrals, referralPages, shapeResult,
} from '@/lib/search/referrals.mjs';
import { referralAskCounts, searchReferrals, warmReferralNames } from '@/lib/search/referrals-search.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function cardFor(page) {
  const plain = notebookPageAnswer({ pages: [page.docTitle], all: [page] });
  if (!plain || !isLiveCard(page)) return plain;
  return withKindCard(plain, { page, kind: noteKind(page.noteKind) });
}

const row = (page) => ({ ...shapeResult(page), card: cardFor(page) });

export async function GET(request) {
  const q = (request.nextUrl.searchParams.get('q') || '').slice(0, 200).trim();
  let pages;
  try {
    pages = referralPages(await fullNotebookContext());
  } catch (e) {
    console.warn('[referrals] notebook: ' + String(e?.message || e).slice(0, 200));
    return NextResponse.json({ error: 'The Notebook could not be read.' }, { status: 503, headers: NO_STORE });
  }

  if (!q) {
    // The page is open and about to be searched: fetch the card names'
    // vectors now, in the background, so the first search has them.
    warmReferralNames(pages);
    // The most asked for is a nicety: a log that cannot be read leaves the
    // page on its A–Z list, which is what an install with no questions yet
    // shows anyway.
    let popular = [];
    try {
      popular = popularReferrals(await referralAskCounts(), pages).map((page) => page.docId);
    } catch (e) {
      console.warn('[referrals] most asked: ' + String(e?.message || e).slice(0, 200));
    }
    return NextResponse.json({ referrals: alphabetical(pages).map(row), popular }, { headers: NO_STORE });
  }

  try {
    const ranked = await searchReferrals(q, pages);
    return NextResponse.json({ q, results: ranked.map(row) }, { headers: NO_STORE });
  } catch (e) {
    // The page already shows its own keyword matches and keeps them.
    console.warn('[referrals] search: ' + String(e?.message || e).slice(0, 200));
    return NextResponse.json({ q, results: null, error: 'Search is unavailable.' }, { status: 503, headers: NO_STORE });
  }
}
