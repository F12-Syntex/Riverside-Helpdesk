'use client';

import React from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * /diagram — one system diagram, with a detail control.
 *
 * A single connected diagram that scales to the viewport width (no
 * horizontal scroll). A three-way control changes how much is shown:
 *   1 · Overview     — the request loop (how a question is answered)
 *   2 · Architecture — Staff → every page → engine → data services
 *   3 · Full detail  — adds each page's API routes, the libraries and RAG
 *
 * Hidden from the tools index; reachable directly at /diagram. Reflects
 * the current Notebook-only Q&A (document search + contacts off for
 * answering, but still drawn in the map).
 * ------------------------------------------------------------------ */

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const INK = '#212b32';
const MUTED = '#4c6272';
const BLUE = '#005eb8';
const GREEN = '#007f3b';
const EDGE = '#9fb1ba';

const DEP = { A: { c: '#005eb8', t: 'OpenRouter (AI)' }, D: { c: '#8a6100', t: 'Postgres' }, B: { c: '#5b3ca8', t: 'Vercel Blob' }, L: { c: '#c0271b', t: 'localhost only' } };

/* =============================================================== *
 * Level 1 — the request loop.
 * =============================================================== */
const L1_NODES = [
  { x: 40, y: 60, w: 190, h: 100, icon: Icons.chat, title: 'Staff', sub: 'ask in plain English', fill: '#fff', border: '#9dc3e6', ink: INK, subInk: MUTED, ic: BLUE },
  { x: 320, y: 60, w: 200, h: 100, icon: Icons.home, title: 'Practice app', sub: 'the server · /api/agent', fill: BLUE, border: BLUE, ink: '#fff', subInk: '#cfe3f5', ic: '#fff' },
  { x: 820, y: 60, w: 200, h: 100, icon: Icons.sparkle, title: 'Research loop', sub: 'the AI picks its own tools', fill: '#fff', border: '#9dc3e6', ink: INK, subInk: MUTED, ic: BLUE },
  { x: 820, y: 430, w: 200, h: 100, icon: Icons.shield, title: 'Quote check', sub: 'every claim, or it is dropped', fill: '#fff', border: '#a7d8b6', ink: INK, subInk: MUTED, ic: GREEN },
  { x: 320, y: 430, w: 200, h: 100, icon: Icons.check, title: 'Answer', sub: 'shown with its source', fill: '#fff', border: '#a7d8b6', ink: INK, subInk: MUTED, ic: GREEN },
  { x: 370, y: 245, w: 300, h: 110, icon: Icons.book, title: 'Notebook', sub: 'every page, in full', fill: '#eaf7ee', border: '#8ccfa3', ink: '#075e34', subInk: '#3f7d5c', ic: GREEN, tag: 'FIRST SOURCE' },
];
const L1_EDGES = [
  { d: 'M230 110 L320 110', label: '1 · asks', lx: 275, ly: 100 },
  { d: 'M520 110 L820 110', label: '2 · sends the question', lx: 670, ly: 100 },
  // The loop back on itself — search, read a page whole, search again with
  // different words. That is what changed from one shot to an agent. Drawn above
  // the node, in clear space: edges are painted before nodes, so a label placed
  // across one is covered by it.
  { d: 'M872 60 C 872 26, 968 26, 968 58', label: 'searches · reads · repeats', lx: 920, ly: 18, anchor: 'middle', dim: true },
  { d: 'M920 160 L920 430', label: '3 · draft', lx: 932, ly: 300, anchor: 'start' },
  { d: 'M820 480 L520 480', label: 'checked', lx: 670, ly: 470 },
  { d: 'M320 480 L150 480 L150 160', label: '4 · reply + source', lx: 162, ly: 320, anchor: 'start' },
  { d: 'M670 280 L820 175', label: 'tools read it', lx: 700, ly: 245, anchor: 'start', dim: true },
];
function L1Node(n, i) {
  return (
    <g key={i}>
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="16" fill={n.fill} stroke={n.border} strokeWidth="2" />
      <g transform={`translate(${n.x + 20}, ${n.y + 18})`} fill="none" stroke={n.ic} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{n.icon}</g>
      <text x={n.x + 20} y={n.y + 66} fontFamily={FONT} fontSize="18" fontWeight="700" fill={n.ink}>{n.title}</text>
      <text x={n.x + 20} y={n.y + 88} fontFamily={FONT} fontSize="13" fill={n.subInk}>{n.sub}</text>
      {n.tag && (<><rect x={n.x + n.w - 118} y={n.y + 16} width="102" height="22" rx="11" fill={GREEN} /><text x={n.x + n.w - 67} y={n.y + 31} fontFamily={FONT} fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle" letterSpacing="0.4">{n.tag}</text></>)}
    </g>
  );
}
function FlowDiagram() {
  return (
    <svg viewBox="0 0 1060 560" width="100%" style={s('display:block;height:auto;font-family:' + FONT)} role="img"
      aria-label="The request loop: staff ask the app, which reads the Notebook, sends it to the AI, checks the quotes, and returns a sourced answer.">
      <defs><marker id="a1" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={EDGE} /></marker></defs>
      {L1_EDGES.map((e, i) => (
        <g key={i}>
          <path d={e.d} fill="none" stroke={EDGE} strokeWidth="2.2" strokeDasharray={e.dim ? '5 5' : 'none'} markerEnd="url(#a1)" />
          <text x={e.lx} y={e.ly} fontFamily={FONT} fontSize="13" fontWeight="600" fill={MUTED} textAnchor={e.anchor || 'middle'}>{e.label}</text>
        </g>
      ))}
      {L1_NODES.map(L1Node)}
    </svg>
  );
}

/* =============================================================== *
 * Levels 2 & 3 — the architecture, drawn at two detail levels.
 * =============================================================== */
const COL_X0 = 40, COL_STEP = 143, COL_W = 128;
const colX = (i) => COL_X0 + COL_STEP * i;

const FEATURES = [
  { p: '/', name: 'Tools index', routes: ['landing page'], deps: [] },
  { p: '/helpbot', name: 'Practice Q&A', routes: ['/api/agent', '+ tool loop · compose', '/api/ask', '/api/kb'], deps: ['A', 'D'], hero: true },
  { p: '/lookup', name: 'Instant lookup', routes: ['/api/directory', '/api/cqc'], deps: ['D'] },
  { p: '/notebook', name: 'Notebook', routes: ['/api/notebook', '+ format · organize', '+ attachments', '+ import · export'], deps: ['A', 'D', 'B'] },
  { p: '/signpost', name: 'Signpost', routes: ['/api/signpost'], deps: ['A'] },
  { p: '/reason', name: 'Reason', routes: ['/api/reason'], deps: ['A'] },
  { p: '/coding', name: 'Code a doc', routes: ['/api/docfile'], deps: ['A'] },
  { p: '/medications', name: 'Medication', routes: ['/api/medication', '+ extract'], deps: ['A'] },
  { p: '/rota', name: 'Staff rota', routes: ['/api/rota', '/api/staff'], deps: ['A', 'D'] },
  { p: '/dpia', name: 'DPIA', routes: ['lib/dpia'], deps: [] },
  { p: '/diagram', name: 'System map', routes: ['this page'], deps: [] },
  { p: '/knowledge', name: 'Knowledge admin', routes: ['/api/knowledge', '+ analyse · conflicts', '+ status · sync'], deps: ['L', 'D', 'A'] },
];
const ENGINE_CHIPS = ['agent/tools', 'agent/compose', 'agent/evidence', 'agent/web-search', 'referrals/ers-lookup', 'lookup/cqc', 'ai/prompt', 'ai/quote-match', 'ai/client', 'ai/claims', 'ai/context', 'ai/docfile', 'ai/medication', 'ai/rota', 'knowledge', 'knowledge-bootstrap', 'knowledge-context', 'notebook', 'contacts', 'lookup', 'guides', 'medications', 'rota/logic', 'db', 'dpia', 'text-chunk'];
const DATA_NODES = [
  { cx: 300, w: 420, label: 'PostgreSQL (Neon)', sub: 'notes · staff · knowledge · contacts · embeddings · snomed · e-RS types', icon: Icons.book, dep: 'D' },
  { cx: 872, w: 380, label: 'OpenRouter', sub: 'chat / vision · embeddings · analysis', icon: Icons.sparkle, dep: 'A' },
  { cx: 1440, w: 360, label: 'Vercel Blob', sub: 'Notebook attachments', icon: Icons.paperclip, dep: 'B' },
];
const RAG_NODES = ['rag/sources', 'parsers', 'chunk', 'embed (AI)', 'rag/processed'];

const ARCH_W = colX(FEATURES.length - 1) + COL_W + COL_X0;
const routeH = (f) => 16 + f.routes.length * 15 + 8;

function layoutChips(items, x0, y0, maxX, rowH) {
  const out = []; let x = x0, y = y0;
  for (const label of items) {
    const w = label.length * 6.4 + 18;
    if (x + w > maxX) { x = x0; y += rowH; }
    out.push({ label, x, y, w });
    x += w + 8;
  }
  return out;
}
function Dots({ deps, x, y }) {
  return deps.map((d, i) => (
    <g key={d}>
      <circle cx={x + i * 15} cy={y} r="6.5" fill={DEP[d].c} />
      <text x={x + i * 15} y={y + 3.4} fontFamily={FONT} fontSize="8.5" fontWeight="700" fill="#fff" textAnchor="middle">{d}</text>
    </g>
  ));
}

function ArchDiagram({ full }) {
  const showRoutes = full, showLibs = full;
  const PAGE_Y = 116, PAGE_H = 54, ROUTE_Y = 196;
  const maxRH = showRoutes ? Math.max(...FEATURES.map(routeH)) : 0;
  const afterCols = showRoutes ? ROUTE_Y + maxRH : PAGE_Y + PAGE_H;
  const ENGINE_Y = afterCols + 60;
  const ENGINE_H = showLibs ? 92 : 52;
  const DATA_Y = ENGINE_Y + ENGINE_H + 46;
  const DATA_H = 92;
  const RAG_Y = DATA_Y + DATA_H + 50;
  const RAG_H = 58;
  const H = RAG_Y + RAG_H + 22;
  const BUS_Y = 96, STAFF_CX = (colX(0) + colX(FEATURES.length - 1) + COL_W) / 2;
  const chips = showLibs ? layoutChips(ENGINE_CHIPS, 70, ENGINE_Y + 38, ARCH_W - 40, 26) : [];

  return (
    <svg viewBox={`0 0 ${ARCH_W} ${H}`} width="100%" style={s('display:block;height:auto;font-family:' + FONT)} role="img"
      aria-label="Architecture: staff open pages, pages call routes, routes use the engine and libraries, which read Postgres, OpenRouter and Vercel Blob; a RAG chain feeds Postgres.">
      <defs>
        <marker id="a2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={EDGE} /></marker>
        <marker id="a2b" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={BLUE} /></marker>
      </defs>

      {/* Staff + bus */}
      <rect x={STAFF_CX - 95} y="20" width="190" height="46" rx="12" fill={BLUE} />
      <text x={STAFF_CX} y="48" fontFamily={FONT} fontSize="16" fontWeight="700" fill="#fff" textAnchor="middle">Staff · browser</text>
      <path d={`M${STAFF_CX} 66 L${STAFF_CX} ${BUS_Y}`} stroke={EDGE} strokeWidth="2" markerEnd="url(#a2)" />
      <line x1={colX(0) + COL_W / 2} y1={BUS_Y} x2={colX(FEATURES.length - 1) + COL_W / 2} y2={BUS_Y} stroke={EDGE} strokeWidth="2" />

      {/* Feature columns */}
      {FEATURES.map((f) => {
        const i = FEATURES.indexOf(f);
        const x = colX(i), cx = x + COL_W / 2, rh = routeH(f), rBottom = ROUTE_Y + rh;
        const stroke = f.hero ? BLUE : EDGE, marker = f.hero ? 'url(#a2b)' : 'url(#a2)', accent = f.hero ? BLUE : '#c9d4da';
        const downFrom = showRoutes ? rBottom : PAGE_Y + PAGE_H;
        return (
          <g key={f.p}>
            <path d={`M${cx} ${BUS_Y} L${cx} ${PAGE_Y}`} stroke={stroke} strokeWidth="2" markerEnd={marker} />
            <rect x={x} y={PAGE_Y} width={COL_W} height={PAGE_H} rx="10" fill={f.hero ? '#eaf3fb' : '#fff'} stroke={accent} strokeWidth={f.hero ? 2 : 1.5} />
            <text x={cx} y={PAGE_Y + 22} fontFamily={MONO} fontSize="12.5" fontWeight="700" fill={BLUE} textAnchor="middle">{f.p}</text>
            <text x={cx} y={PAGE_Y + 39} fontFamily={FONT} fontSize="11" fill={MUTED} textAnchor="middle">{f.name}</text>
            {!showRoutes && f.deps.length > 0 && <Dots deps={f.deps} x={cx - (f.deps.length - 1) * 7.5} y={PAGE_Y + PAGE_H + 16} />}

            {showRoutes && (
              <>
                <path d={`M${cx} ${PAGE_Y + PAGE_H} L${cx} ${ROUTE_Y}`} stroke={stroke} strokeWidth="2" markerEnd={marker} />
                <rect x={x} y={ROUTE_Y} width={COL_W} height={rh} rx="10" fill="#fff" stroke={accent} strokeWidth={f.hero ? 2 : 1.5} />
                {f.routes.map((r, j) => (
                  <text key={j} x={x + 10} y={ROUTE_Y + 18 + j * 15} fontFamily={r.startsWith('/') || r.startsWith('lib') ? MONO : FONT} fontSize="10.5" fontWeight={r.startsWith('/') ? 700 : 400} fill={r.startsWith('/') ? INK : MUTED}>{r}</text>
                ))}
                <Dots deps={f.deps} x={x + COL_W - 12 - (f.deps.length - 1) * 15} y={ROUTE_Y} />
              </>
            )}

            <path d={`M${cx} ${showRoutes ? rBottom : PAGE_Y + PAGE_H + (f.deps.length ? 26 : 0)} L${cx} ${ENGINE_Y}`} stroke={stroke} strokeWidth="2" markerEnd={marker} strokeDasharray={f.deps.length ? 'none' : '4 4'} />
          </g>
        );
      })}

      {/* Engine band */}
      <rect x="50" y={ENGINE_Y} width={ARCH_W - 100} height={ENGINE_H} rx="14" fill="#f5f9fc" stroke="#bcd4ea" strokeWidth="1.5" />
      <text x="70" y={ENGINE_Y + (showLibs ? 22 : 31)} fontFamily={FONT} fontSize="13" fontWeight="700" fill={BLUE}>Server engine &amp; libraries  ·  lib/{showLibs ? '' : '  (prompt · quote-check · knowledge · notebook · contacts · lookup · guides · rota · …)'}</text>
      {chips.map((c, i) => (
        <g key={i}>
          <rect x={c.x} y={c.y - 13} width={c.w} height="20" rx="10" fill="#fff" stroke="#d3e0ea" />
          <text x={c.x + c.w / 2} y={c.y + 1} fontFamily={MONO} fontSize="10.5" fill={INK} textAnchor="middle">{c.label}</text>
        </g>
      ))}

      {/* Engine → data services */}
      {DATA_NODES.map((d, i) => (
        <path key={i} d={`M${d.cx} ${ENGINE_Y + ENGINE_H} L${d.cx} ${DATA_Y}`} stroke={i < 2 ? BLUE : EDGE} strokeWidth="2" markerEnd={i < 2 ? 'url(#a2b)' : 'url(#a2)'} />
      ))}
      {DATA_NODES.map((d, i) => (
        <g key={i}>
          <rect x={d.cx - d.w / 2} y={DATA_Y} width={d.w} height={DATA_H} rx="14" fill="#fff" stroke={DEP[d.dep].c} strokeWidth="2" />
          <g transform={`translate(${d.cx - d.w / 2 + 18}, ${DATA_Y + 20})`} fill="none" stroke={DEP[d.dep].c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d.icon}</g>
          <text x={d.cx - d.w / 2 + 52} y={DATA_Y + 34} fontFamily={FONT} fontSize="16" fontWeight="700" fill={INK}>{d.label}</text>
          <text x={d.cx - d.w / 2 + 18} y={DATA_Y + 64} fontFamily={FONT} fontSize="12" fill={MUTED}>{d.sub}</text>
        </g>
      ))}

      {/* RAG chain → Postgres */}
      <text x="70" y={RAG_Y - 8} fontFamily={FONT} fontSize="12" fontWeight="700" fill={MUTED}>RAG ingest (offline, npm run rag:ingest) — builds the document index</text>
      {RAG_NODES.map((r, i) => {
        const w = 150, gap = 34, x = 70 + i * (w + gap);
        return (
          <g key={i}>
            <rect x={x} y={RAG_Y} width={w} height={RAG_H} rx="10" fill="#fbfdff" stroke="#cddbe6" strokeWidth="1.5" />
            <text x={x + w / 2} y={RAG_Y + RAG_H / 2 + 4} fontFamily={MONO} fontSize="11.5" fontWeight="700" fill={INK} textAnchor="middle">{r}</text>
            {i < RAG_NODES.length - 1 && <path d={`M${x + w} ${RAG_Y + RAG_H / 2} L${x + w + gap} ${RAG_Y + RAG_H / 2}`} stroke={EDGE} strokeWidth="2" markerEnd="url(#a2)" />}
          </g>
        );
      })}
      <path d={`M${70 + 4 * 184 + 75} ${RAG_Y} L${70 + 4 * 184 + 75} ${RAG_Y - 22} L${DATA_NODES[0].cx + 120} ${RAG_Y - 22} L${DATA_NODES[0].cx + 120} ${DATA_Y + DATA_H}`} fill="none" stroke={DEP.D.c} strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#a2)" />
      <text x={DATA_NODES[0].cx + 130} y={RAG_Y - 26} fontFamily={FONT} fontSize="11" fill={DEP.D.c}>indexed into Postgres</text>
    </svg>
  );
}

/* =============================================================== */
const LEVELS = [
  { key: 1, label: 'Overview', caption: 'How a question becomes a checked answer.' },
  { key: 2, label: 'Architecture', caption: 'Staff → every page → the shared engine → the data services.' },
  { key: 3, label: 'Full detail', caption: 'Adds each page’s API routes, the libraries and the RAG pipeline.' },
];

export default function Page() {
  const [level, setLevel] = React.useState(2);
  const current = LEVELS.find((l) => l.key === level);

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="System map" />

      <main style={s('flex:1;width:100%;max-width:1440px;margin:0 auto;padding:32px 24px 56px;')}>
        <Hover tag={Link} href="/"
          base={`display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:600;color:${MUTED};text-decoration:none;margin-bottom:14px;`}
          hover={`color:${BLUE};`}>
          <Svg w={17} sw={2.2}>{Icons.arrowLeft}</Svg>All practice tools
        </Hover>

        <h1 style={s('font-size:30px;margin:0 0 4px;letter-spacing:-0.02em;')}>System map</h1>
        <p style={s(`font-size:16px;color:${MUTED};margin:0 0 18px;max-width:70ch;`)}>
          One diagram of the whole system. Use the control to change how much detail is shown. Q&amp;A runs as an
          <strong> agent</strong>: it chooses its own searches, reads whole pages when it needs the full process, and can
          fall back to the web. The <strong>Notebook comes first</strong>, and every claim must quote a source it
          actually retrieved or it is dropped before you see it.
        </p>

        {/* Detail control */}
        <div style={s('display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:6px;')}>
          <span style={s(`font-size:13px;font-weight:700;color:${MUTED};`)}>Detail</span>
          <div style={s('display:inline-flex;background:#e7edf0;border:1px solid #d3dde3;border-radius:10px;padding:3px;gap:3px;')}>
            {LEVELS.map((l) => {
              const on = l.key === level;
              return (
                <Hover key={l.key} tag="button" onClick={() => setLevel(l.key)}
                  base={`border:none;border-radius:7px;padding:7px 15px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;${on ? `background:#fff;color:${BLUE};box-shadow:0 1px 2px rgba(33,43,50,.14);` : 'background:none;color:#54697a;'}`}
                  hover={on ? '' : 'color:#212b32;'}>
                  <span style={s('opacity:.6;margin-right:6px;')}>{l.key}</span>{l.label}
                </Hover>
              );
            })}
          </div>
          <span style={s(`font-size:13.5px;color:${MUTED};`)}>{current.caption}</span>
        </div>

        {/* Dot legend (only meaningful when routes/pages carry them) */}
        {level >= 2 && (
          <div style={s('display:flex;gap:16px;flex-wrap:wrap;margin:10px 0 12px;')}>
            {Object.entries(DEP).map(([k, d]) => (
              <span key={k} style={s(`display:inline-flex;align-items:center;gap:6px;font-size:12px;color:${MUTED};`)}>
                <span style={s(`width:15px;height:15px;border-radius:50%;background:${d.c};color:#fff;font-size:9px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;`)}>{k}</span>{d.t}
              </span>
            ))}
          </div>
        )}

        {/* The one diagram */}
        <div style={s('background:#fff;border:1px solid #d8e1e5;border-radius:16px;padding:16px;box-shadow:0 1px 2px rgba(33,43,50,.05);')}>
          {level === 1 ? <FlowDiagram /> : <ArchDiagram full={level === 3} />}
        </div>

        <p style={s(`font-size:12.5px;color:${MUTED};margin:14px 0 0;`)}>
          On a narrow screen, pick a lower detail level to keep it readable — the diagram always fits the width.
        </p>
      </main>
    </div>
  );
}
