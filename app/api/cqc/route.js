// Search of the CQC registered-services dataset for Instant Lookup.
//
//   GET /api/cqc?q=dentist%20barnsley — ranked matches (name, town, postcode,
//                                       service type or phone number)
//
// The set is ~57k rows, so unlike /api/directory it is never sent to the
// browser whole: the phone sends the query, the server returns the top matches.
import { NextResponse } from 'next/server';
import { cqcCount, searchCqc } from '@/lib/lookup/cqc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const q = (request.nextUrl.searchParams.get('q') || '').slice(0, 120).trim();
  const entries = q ? searchCqc(q, 25) : [];
  return NextResponse.json(
    { entries, total: cqcCount() },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
