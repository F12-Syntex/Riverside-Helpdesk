// The practice's runtime settings: which OpenRouter model the assistant runs
// on, read by every AI route through lib/settings and changed from /settings
// without a redeploy — plus the per-role overrides beside it, so the jobs the
// main model is not the best fit for (searching the web, cheap background work,
// reading an image) can run on a model chosen for that job.
import { NextResponse } from 'next/server';
import { getAiModelSetting, getModelRoleSettings, setAiModel, setModelRole, ROLE_SETTING_KEY } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

// One shape for the page: the main model, and the roles that sit beside it.
async function state() {
  const setting = await getAiModelSetting();
  try {
    const roles = await getModelRoleSettings();
    return { ...setting, roles: roles.roles, roleStored: roles.stored, roleResolved: roles.resolved };
  } catch (e) {
    // The roles are an addition to a page that worked without them. If they
    // cannot be read, the model picker must still load.
    console.warn('[settings] could not read the model roles:', String(e).slice(0, 160));
    return { ...setting, roles: [], roleStored: {}, roleResolved: {} };
  }
}

export async function GET() {
  try {
    return NextResponse.json(await state(), { headers: noStore });
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
    if (typeof body?.model === 'string') await setAiModel(body.model);
    // Roles are sent as { fast: 'openai/gpt-oss-120b', web: '', … }. A blank
    // value clears that role back to inheriting, which is why an empty string
    // has to be told apart from a role that was simply not sent.
    const roles = body?.roles && typeof body.roles === 'object' ? body.roles : {};
    for (const role of Object.keys(ROLE_SETTING_KEY)) {
      if (typeof roles[role] === 'string') await setModelRole(role, roles[role]);
    }
    // Read it back rather than echoing what was sent: the page then shows what
    // is actually stored, including when it was stored.
    return NextResponse.json(await state(), { headers: noStore });
  } catch (e) {
    const message = String(e.message || e);
    // A bad slug is the caller's mistake; anything else is the server's.
    const bad = /OpenRouter model id|model role/.test(message);
    return NextResponse.json({ error: message }, { status: bad ? 400 : 500, headers: noStore });
  }
}
