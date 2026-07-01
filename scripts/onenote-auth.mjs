// One-time helper to obtain a OneNote (Microsoft Graph) refresh token using the
// OAuth device-code flow — no redirect URI, no secret, works for personal and
// work Microsoft accounts. You run this once locally; you paste the printed
// refresh token into your environment (ONENOTE_REFRESH_TOKEN). The running app
// then exchanges it for short-lived access tokens itself (see lib/ai/context.mjs).
//
// Setup (once):
//   1. Go to https://entra.microsoft.com  ->  App registrations  ->  New registration.
//      - Supported account types: pick "Accounts in any organizational directory
//        and personal Microsoft accounts" if you use a personal OneNote.
//      - Under Authentication -> Advanced settings, set "Allow public client
//        flows" = Yes (required for the device-code flow).
//      - Under API permissions, add Microsoft Graph -> Delegated -> Notes.Read
//        (and offline_access). Grant/consent.
//   2. Copy the Application (client) ID.
//
// Run:
//   ONENOTE_CLIENT_ID=<client-id> node scripts/onenote-auth.mjs
//   # personal account only? add ONENOTE_TENANT=consumers
//
// Then set in Vercel (Project -> Settings -> Environment Variables):
//   ONENOTE_CLIENT_ID, ONENOTE_REFRESH_TOKEN, and optionally ONENOTE_TENANT,
//   ONENOTE_SECTION / ONENOTE_NOTEBOOK to limit which pages are read.

const clientId = process.env.ONENOTE_CLIENT_ID;
const tenant = process.env.ONENOTE_TENANT || 'common';
const scope = 'offline_access Notes.Read';

if (!clientId) {
  console.error('Set ONENOTE_CLIENT_ID first, e.g.\n  ONENOTE_CLIENT_ID=<client-id> node scripts/onenote-auth.mjs');
  process.exit(1);
}

const base = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dcRes = await fetch(`${base}/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope }).toString(),
  });
  const dc = await dcRes.json();
  if (!dcRes.ok) {
    console.error('Device code request failed:', dc.error_description || JSON.stringify(dc));
    process.exit(1);
  }

  console.log('\n' + '='.repeat(64));
  console.log('  Open:  ' + dc.verification_uri);
  console.log('  Code:  ' + dc.user_code);
  console.log('  Sign in with the account whose OneNote you want to read.');
  console.log('='.repeat(64) + '\n');
  console.log('Waiting for you to finish signing in…');

  const deadline = Date.now() + (dc.expires_in || 900) * 1000;
  let interval = (dc.interval || 5) * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);
    const tRes = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: dc.device_code,
      }).toString(),
    });
    const tok = await tRes.json();
    if (tRes.ok && tok.refresh_token) {
      console.log('\n✔ Success. Add these to your environment (Vercel + .env.local):\n');
      console.log('ONENOTE_CLIENT_ID=' + clientId);
      if (tenant !== 'common') console.log('ONENOTE_TENANT=' + tenant);
      console.log('ONENOTE_REFRESH_TOKEN=' + tok.refresh_token);
      console.log('\nKeep the refresh token secret — it grants read access to your notes.');
      return;
    }
    if (tok.error === 'authorization_pending') continue;
    if (tok.error === 'slow_down') { interval += 5000; continue; }
    console.error('\nSign-in failed:', tok.error_description || tok.error || 'unknown error');
    process.exit(1);
  }
  console.error('\nTimed out waiting for sign-in. Run the script again.');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
