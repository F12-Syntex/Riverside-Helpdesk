'use client';

/* ------------------------------------------------------------------ *
 * /database — what this app has stored, all of it, in one place.
 *
 * The practice owns its data; this is the page that proves it. Every
 * table in the Postgres database and every file in the blob store, read
 * and only read: no edit, no delete, no query box (see
 * app/api/database/route.js, which builds nothing but SELECTs).
 *
 * Development machine only, like /knowledge. The page shows the question
 * log, the audit trail and every file anybody has ever uploaded, and a
 * page that shows all of that to whoever types its address is not a page
 * that should answer on the public deployment. The gate is in
 * middleware.js; the route still exists everywhere, it simply 404s.
 * ------------------------------------------------------------------ */

import AppHeader from '../_components/AppHeader';
import DatabaseExplorer from '../_components/database/DatabaseExplorer';

export default function DatabasePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f5', display: 'flex', flexDirection: 'column' }}>
      <AppHeader subtitle="Database" />
      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 1480, margin: '0 auto', padding: '24px 24px 28px', boxSizing: 'border-box' }}>
        <DatabaseExplorer />
      </main>
    </div>
  );
}
