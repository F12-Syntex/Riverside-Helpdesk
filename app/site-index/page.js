'use client';

import Link from 'next/link';
import { s } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { API_GROUPS, API_ROUTES, PAGES, PAGE_GROUPS, routesInGroup } from '@/lib/routes';

/* ------------------------------------------------------------------ *
 * /index — the deep index.
 *
 * Served at /index; the directory is site-index because "index" is a
 * reserved route name in the App Router (it normalises /index back to /
 * and the build fails on it). next.config.mjs rewrites one onto the
 * other, so the address staff are given is /index.
 *
 * The landing page at "/" is deliberately two links: the tools staff use
 * every day, and nothing to read past. That leaves everything else — the
 * reception helpers, the rota, the system map, the settings — reachable
 * only by someone who already knows the address.
 *
 * This page is the other half of that trade: every route the app serves,
 * pages and API endpoints alike, with what each one is for. Generated
 * from lib/routes.js, so a route added there appears here.
 *
 * A client component like every other page here, because the shared
 * style helpers in _components/ui are client-side: a server component
 * cannot call a function it imported across that boundary. The page
 * itself holds no state and does no work in the browser beyond
 * rendering. The title lives in layout.js for the same reason.
 * ------------------------------------------------------------------ */

const CARD = 'display:block;padding:16px 18px;background:#fff;border:1px solid #d8e1e5;border-radius:12px;text-decoration:none;color:inherit;';
const PATH = 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13.5px;color:#4c6272;overflow-wrap:anywhere;';

// A small caps label: what is special about this route, if anything.
function Tag({ tone = 'grey', children }) {
  const tones = {
    grey: 'background:#f0f4f5;border-color:#d8dde0;color:#4c6272;',
    blue: 'background:#e8f1f8;border-color:#aac7e0;color:#00437e;',
    amber: 'background:#fdf3e7;border-color:#e4c69a;color:#7a4708;',
  };
  return (
    <span style={s('display:inline-block;flex:none;padding:2px 8px;border:1px solid;border-radius:999px;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;' + tones[tone])}>
      {children}
    </span>
  );
}

function Tags({ route }) {
  const tags = [];
  if (route.landing) tags.push(<Tag key="landing" tone="blue">On the landing page</Tag>);
  if (route.hidden) tags.push(<Tag key="hidden" tone="amber">Not linked anywhere</Tag>);
  if (route.local) tags.push(<Tag key="local" tone="amber">Development machine only</Tag>);
  if (route.methods) tags.push(<Tag key="methods">{route.methods.join(' · ')}</Tag>);
  if (!tags.length) return null;
  return <span style={s('display:flex;flex-wrap:wrap;gap:6px;')}>{tags}</span>;
}

function Body({ route }) {
  return (
    <>
      <div style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;')}>
        <span style={s('font-size:18px;font-weight:700;color:#005eb8;')}>{route.title}</span>
        <span style={s(PATH)}>{route.path}</span>
      </div>
      <p style={s('margin:7px 0 0;font-size:15px;line-height:1.5;color:#4c6272;')}>{route.summary}</p>
      {(route.landing || route.hidden || route.local || route.methods) && (
        <div style={s('margin-top:10px;')}><Tags route={route} /></div>
      )}
    </>
  );
}

function Group({ title, routes, linked }) {
  if (!routes.length) return null;
  return (
    <section style={s('margin:0 0 30px;')}>
      <h2 style={s('font-size:15px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#768692;margin:0 0 12px;')}>
        {title}
      </h2>
      <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;')}>
        {routes.map((route) => (
          <li key={route.path}>
            {/* API endpoints are not pages: linking to them would send staff to
                raw JSON, or to a 405 for the ones that only accept a POST. */}
            {linked
              ? <Link href={route.path} style={s(CARD)}><Body route={route} /></Link>
              : <div style={s(CARD)}><Body route={route} /></div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Full index" />

      <main style={s('flex:1;width:100%;max-width:860px;margin:0 auto;padding:40px 24px 64px;')}>
        <h1 style={s('font-size:32px;margin:0 0 6px;letter-spacing:-0.02em;')}>Everything in this app</h1>
        <p style={s('font-size:17px;color:#4c6272;margin:0 0 8px;line-height:1.55;')}>
          The <Link href="/" style={s('color:#005eb8;font-weight:600;')}>practice tools page</Link> shows the two tools
          used every day. This is the whole list: {PAGES.length} pages and {API_ROUTES.length} API endpoints, including
          the ones deliberately kept off the front.
        </p>
        <p style={s('font-size:15px;color:#768692;margin:0 0 32px;line-height:1.5;')}>
          Anything marked <em>development machine only</em> returns a 404 in the live app.
        </p>

        <h2 style={s('font-size:24px;margin:0 0 18px;letter-spacing:-0.01em;')}>Pages</h2>
        {PAGE_GROUPS.map((group) => (
          <Group key={group} title={group} routes={routesInGroup(PAGES, group)} linked />
        ))}

        <h2 style={s('font-size:24px;margin:34px 0 6px;letter-spacing:-0.01em;')}>API endpoints</h2>
        <p style={s('font-size:15px;color:#4c6272;margin:0 0 22px;line-height:1.5;')}>
          What the pages above call. Listed for reference — they answer to the app, not to a browser address bar.
        </p>
        {API_GROUPS.map((group) => (
          <Group key={group} title={group} routes={routesInGroup(API_ROUTES, group)} />
        ))}
      </main>
    </div>
  );
}
