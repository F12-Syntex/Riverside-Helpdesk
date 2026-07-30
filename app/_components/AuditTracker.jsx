'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { flush, installAudit, recordPageview } from '@/lib/audit/client';

/* ------------------------------------------------------------------ *
 * Records what is done in the app, for the audit log at /stats.
 *
 * Mounted once in the root layout, so it covers every page without any
 * page having to know it exists. Renders nothing.
 *
 * Only the page view lives here — the request, click and error tracking
 * is installed on the window itself by lib/audit/client.js and does not
 * re-run on navigation. usePathname is enough for App Router routing;
 * the query string is read from the URL at the moment of recording, so
 * this needs no Suspense boundary the way useSearchParams would.
 * ------------------------------------------------------------------ */

export default function AuditTracker() {
  const pathname = usePathname();

  React.useEffect(() => { installAudit(); }, []);

  React.useEffect(() => {
    if (!pathname) return;
    recordPageview(pathname, document.title);
    // Send what is waiting when the page is left, so a machine that is
    // switched off at the end of a shift has already reported its day.
    return () => flush();
  }, [pathname]);

  return null;
}
