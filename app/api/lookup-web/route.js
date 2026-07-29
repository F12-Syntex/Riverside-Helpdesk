// Web search for Instant Lookup, for the things the CQC register does not hold.
//
//   GET /api/lookup-web?q=...
//
// The register covers services registered with the CQC in England, which leaves
// real gaps: community pharmacies, an interpreting line, a private clinic, a
// number written on a letter. When a search of the register finds nothing, the
// lookup page offers this rather than a dead end.
//
// Deliberately separate from /api/cqc: these are pages found on the internet,
// not register entries, and the page labels them so. Never mixed in.
//
// It returns NUMBERS, not links. Handing someone at the desk five search results
// and letting them hunt is not a lookup — so the pages are read and the numbers
// and addresses are lifted out of them verbatim. No digit here is written by a
// model; see lib/lookup/contact-extract.mjs.
import { NextResponse } from 'next/server';
import { findWebContacts } from '@/lib/lookup/web-contact.mjs';
import { getAiModel } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(request) {
  const q = (request.nextUrl.searchParams.get('q') || '').slice(0, 160).trim();
  if (q.length < 3) {
    return NextResponse.json({ ok: false, contacts: [], results: [], reason: 'Type a little more first.' }, { headers: noStore });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  // The cheapest, fastest model configured — this is a lookup, not research.
  const model = process.env.OPENROUTER_MEDICATION_MODEL || process.env.OPENROUTER_ANALYSIS_MODEL || await getAiModel();
  if (!apiKey || !model) {
    return NextResponse.json({ ok: false, contacts: [], results: [], reason: 'Web search is not set up on this server.' }, { headers: noStore });
  }

  try {
    const { ok, contacts, results, reason } = await findWebContacts({ apiKey, model, query: q });
    return NextResponse.json(
      { ok, contacts: (contacts || []).slice(0, 5), results: (results || []).slice(0, 5), reason: reason || '' },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, contacts: [], results: [], reason: 'Web search is unavailable.' }, { headers: noStore });
  }
}
