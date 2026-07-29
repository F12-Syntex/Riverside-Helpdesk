// The practice's runtime settings. Today that is one thing: which OpenRouter
// model the assistant runs on, read by every AI route through lib/settings and
// changed from /settings without a redeploy.
import { NextResponse } from 'next/server';
import { getAiModelSetting, setAiModel } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    return NextResponse.json(await getAiModelSetting(), { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: 'Could not read the settings: ' + String(e.message || e) }, { status: 500, headers: noStore });
  }
}

export async function PUT(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers: noStore });
  }

  try {
    await setAiModel(body?.model);
    // Read it back rather than echoing what was sent: the page then shows what
    // is actually stored, including when it was stored.
    return NextResponse.json(await getAiModelSetting(), { headers: noStore });
  } catch (e) {
    const message = String(e.message || e);
    // A bad slug is the caller's mistake; anything else is the server's.
    const bad = /OpenRouter model id/.test(message);
    return NextResponse.json({ error: message }, { status: bad ? 400 : 500, headers: noStore });
  }
}
