// Search of the CQC registered-services dataset for Instant Lookup.
//
//   GET /api/cqc?q=dentist%20barnsley — ranked matches (name, town, postcode,
//                                       service type or phone number)
//   GET /api/cqc                       — the practice's hospital shortlist,
//                                       which is what the page shows before
//                                       anybody has typed
//
// The set is ~57k rows, so unlike /api/directory it is never sent to the
// browser whole: the phone sends the query, the server returns the top matches.
import { NextResponse } from 'next/server';
import { cqcCount, searchCqc } from '@/lib/lookup/cqc';
import { getHospitals } from '@/lib/lookup/directory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const q = (request.nextUrl.searchParams.get('q') || '').slice(0, 120).trim();
  // No query is not "no answer". Before anybody types, the page shows the
  // practice's own hospital shortlist rather than a card explaining what
  // the register is — real rows, in the shape a search returns them, so
  // this page opens with content like every other page does. Ranking 57k
  // rows alphabetically was the other option and it opens on "1 & 2 Flax
  // Cottages", which is not what anybody came here for.
  const suggested = !q;
  const entries = suggested ? getHospitals() : searchCqc(q, 25);
  return NextResponse.json(
    { entries, suggested, total: cqcCount() },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
