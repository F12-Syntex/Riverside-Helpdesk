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
import { getModelRoles } from '@/lib/settings';

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
  // The web role: this is searching the internet and reading a page for a
  // number, which is precisely the job that role exists for — and it is the same
  // role the agent's find_contact uses, so the lookup page and the assistant
  // read the web with one model rather than two. Unset, the role falls back to
  // the environment variables this line used to read directly, and then to the
  // practice's model (/settings — see lib/settings.js).
  const model = (await getModelRoles()).web.model;
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
