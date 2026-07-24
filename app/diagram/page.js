'use client';

import React from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * /diagram — the whole system as connected flow diagrams.
 *
 * Two SVG diagrams, almost no prose:
 *   1. the request flow — how a question becomes a checked answer;
 *   2. the full architecture — every page, route, library, service and
 *      the RAG pipeline, drawn as connected nodes with arrows.
 *
 * Hidden from the tools index; reachable directly at /diagram. Reflects
 * the current Notebook-only Q&A (document search + contacts off for
 * answering, but still shown in the map).
 * ------------------------------------------------------------------ */

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const INK = '#212b32';
const MUTED = '#4c6272';
const BLUE = '#005eb8';
const GREEN = '#007f3b';
const EDGE = '#9fb1ba';

/* dependency dot colours */
const DEP = { A: { c: '#005eb8', t: 'OpenRouter (AI)' }, D: { c: '#8a6100', t: 'Postgres' }, B: { c: '#5b3ca8', t: 'Vercel Blob' }, L: { c: '#c0271b', t: 'localhost only' } };

/* =============================================================== *
 * Diagram 1 — the request flow (the loop staff experience).
 * =============================================================== */
const F1_NODES = [
  { x: 40, y: 60, w: 190, h: 100, icon: Icons.chat, title: 'Staff', sub: 'ask in plain English', fill: '#fff', border: '#9dc3e6', ink: INK, subInk: MUTED, ic: BLUE },
  { x: 320, y: 60, w: 200, h: 100, icon: Icons.home, title: 'Practice app', sub: 'the server · /api/ask', fill: BLUE, border: BLUE, ink: '#fff', subInk: '#cfe3f5', ic: '#fff' },
  { x: 820, y: 60, w: 200, h: 100, icon: Icons.sparkle, title: 'AI wording', sub: 'plain NHS English', fill: '#fff', border: '#9dc3e6', ink: INK, subInk: MUTED, ic: BLUE },
  { x: 820, y: 430, w: 200, h: 100, icon: Icons.shield, title: 'Quote check', sub: 'matched to the Notebook', fill: '#fff', border: '#a7d8b6', ink: INK, subInk: MUTED, ic: GREEN },
  { x: 320, y: 430, w: 200, h: 100, icon: Icons.check, title: 'Answer', sub: 'shown with its source', fill: '#fff', border: '#a7d8b6', ink: INK, subInk: MUTED, ic: GREEN },
  { x: 370, y: 245, w: 300, h: 110, icon: Icons.book, title: 'Notebook', sub: 'every page, in full', fill: '#eaf7ee', border: '#8ccfa3', ink: '#075e34', subInk: '#3f7d5c', ic: GREEN, tag: 'ONLY SOURCE' },
];
const F1_EDGES = [
  { d: 'M230 110 L320 110', label: '1 · asks', lx: 275, ly: 100 },
  { d: 'M520 110 L820 110', label: '2 · sends question + Notebook', lx: 670, ly: 100 },
  { d: 'M920 160 L920 430', label: '3 · draft', lx: 932, ly: 300, anchor: 'start' },
  { d: 'M820 480 L520 480', label: 'checked', lx: 670, ly: 470 },
  { d: 'M320 480 L150 480 L150 160', label: '4 · reply + source', lx: 162, ly: 320, anchor: 'start' },
  { d: 'M470 245 L440 160', label: 'reads', lx: 482, ly: 210, anchor: 'start', dim: true },
];
function F1Node(n, i) {
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

/* =============================================================== *
 * Diagram 2 — the full architecture, drawn as a connected graph.
 *  Staff → page → route(s) → engine & libraries → data services,
 *  plus the RAG ingest chain feeding Postgres.
 * =============================================================== */
const COL_X0 = 40;
const COL_STEP = 143;
const COL_W = 128;
const colX = (i) => COL_X0 + COL_STEP * i;

// Each feature is a vertical mini-flow: page box → routes box, with the
// backend services it uses shown as coloured dots.
const FEATURES = [
  { p: '/', name: 'Tools index', routes: ['landing page'], deps: [] },
  { p: '/helpbot', name: 'Practice Q&A', routes: ['/api/ask', '/api/kb'], deps: ['A', 'D'], hero: true },
  { p: '/lookup', name: 'Instant lookup', routes: ['/api/directory'], deps: ['D'] },
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

const PAGE_Y = 116, PAGE_H = 52, ROUTE_Y = 196;
const routeH = (f) => 16 + f.routes.length * 15 + 8;
const ENGINE_Y = 356, ENGINE_H = 92;
const DATA_Y = 496, DATA_H = 92;
const RAG_Y = 636, RAG_H = 60;
const ARCH_W = colX(FEATURES.length - 1) + COL_W + COL_X0;   // right margin
const ARCH_H = RAG_Y + RAG_H + 24;
const BUS_Y = 96, STAFF_CX = (colX(0) + colX(FEATURES.length - 1) + COL_W) / 2;

const ENGINE_CHIPS = ['ai/prompt', 'ai/quote-match', 'ai/client', 'ai/claims', 'ai/context', 'ai/docfile', 'ai/medication', 'ai/rota', 'knowledge', 'knowledge-bootstrap', 'knowledge-context', 'notebook', 'contacts', 'lookup', 'guides', 'medications', 'rota/logic', 'db', 'dpia', 'text-chunk'];

// Three shared data / service nodes along the bottom band.
const DATA_NODES = [
  { cx: 300, w: 420, label: 'PostgreSQL (Neon)', sub: 'notes · staff · knowledge · contacts · embeddings', icon: Icons.book, dep: 'D' },
  { cx: 872, w: 380, label: 'OpenRouter', sub: 'chat / vision · embeddings · analysis', icon: Icons.sparkle, dep: 'A' },
  { cx: 1440, w: 360, label: 'Vercel Blob', sub: 'Notebook attachments', icon: Icons.paperclip, dep: 'B' },
];
const RAG_NODES = ['rag/sources', 'parsers', 'chunk', 'embed (AI)', 'rag/processed'];

// Flow chips across the engine band into up to two rows.
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
const CHIP_ROWS = layoutChips(ENGINE_CHIPS, 70, ENGINE_Y + 38, ARCH_W - 40, 26);

function Dots({ deps, x, y }) {
  return deps.map((d, i) => (
    <g key={d}>
      <circle cx={x + i * 15} cy={y} r="6.5" fill={DEP[d].c} />
      <text x={x + i * 15} y={y + 3.4} fontFamily={FONT} fontSize="8.5" fontWeight="700" fill="#fff" textAnchor="middle">{d}</text>
    </g>
  ));
}

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="System map" />

      <main style={s('flex:1;width:100%;max-width:1000px;margin:0 auto;padding:32px 24px 64px;')}>
        <Hover tag={Link} href="/"
          base={`display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:600;color:${MUTED};text-decoration:none;margin-bottom:14px;`}
          hover={`color:${BLUE};`}>
          <Svg w={17} sw={2.2}>{Icons.arrowLeft}</Svg>All practice tools
        </Hover>

        <h1 style={s('font-size:30px;margin:0 0 4px;letter-spacing:-0.02em;')}>System map</h1>
        <p style={s(`font-size:16px;color:${MUTED};margin:0 0 6px;max-width:66ch;`)}>
          The whole system as one picture. First how a question is answered, then everything it is built from —
          pages, routes, libraries, the knowledge pipeline and the services — drawn as connected boxes.
        </p>
        <p style={s(`font-size:13.5px;color:${MUTED};margin:0 0 20px;`)}>
          Q&amp;A answers from the <strong>Notebook only</strong> right now; document search and contacts are switched off for answering.
        </p>

        {/* -------- Diagram 1 · the request flow -------- */}
        <h2 style={s(`font-size:15px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MUTED};margin:8px 0 10px;`)}>How a question is answered</h2>
        <div style={s('background:#fff;border:1px solid #d8e1e5;border-radius:16px;padding:14px;overflow-x:auto;')}>
          <svg viewBox="0 0 1060 560" width="100%" style={s('display:block;min-width:640px;font-family:' + FONT)} role="img"
            aria-label="Flowchart: staff ask the app, which reads the Notebook, sends it to the AI, checks the quotes, and returns a sourced answer.">
            <defs>
              <marker id="a1" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={EDGE} /></marker>
            </defs>
            {F1_EDGES.map((e, i) => (
              <g key={i}>
                <path d={e.d} fill="none" stroke={EDGE} strokeWidth="2.2" strokeDasharray={e.dim ? '5 5' : 'none'} markerEnd="url(#a1)" />
                <text x={e.lx} y={e.ly} fontFamily={FONT} fontSize="13" fontWeight="600" fill={MUTED} textAnchor={e.anchor || 'middle'}>{e.label}</text>
              </g>
            ))}
            {F1_NODES.map(F1Node)}
          </svg>
        </div>

        {/* -------- Diagram 2 · the full architecture -------- */}
        <div style={s('display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:30px 0 10px;')}>
          <h2 style={s(`font-size:15px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MUTED};margin:0;`)}>Everything, connected</h2>
          <div style={s('display:flex;gap:14px;flex-wrap:wrap;')}>
            {Object.entries(DEP).map(([k, d]) => (
              <span key={k} style={s('display:inline-flex;align-items:center;gap:5px;font-size:12px;color:' + MUTED + ';')}>
                <span style={s(`width:14px;height:14px;border-radius:50%;background:${d.c};color:#fff;font-size:9px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;`)}>{k}</span>{d.t}
              </span>
            ))}
          </div>
        </div>
        <p style={s(`font-size:12.5px;color:${MUTED};margin:0 0 10px;`)}>Scroll sideways to see it all. Each tool flows down: page → its API route(s) → the shared engine &amp; libraries → the data services.</p>

        <div style={s('background:#fff;border:1px solid #d8e1e5;border-radius:16px;padding:14px;overflow-x:auto;')}>
          <svg viewBox={`0 0 ${ARCH_W} ${ARCH_H}`} width={ARCH_W} style={s(`display:block;min-width:${ARCH_W}px;max-width:none;font-family:${FONT};`)} role="img"
            aria-label="Architecture: staff open pages, pages call API routes, routes use the shared engine and libraries, which read Postgres, OpenRouter and Vercel Blob. A RAG ingest chain feeds Postgres.">
            <defs>
              <marker id="a2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={EDGE} /></marker>
              <marker id="a2b" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={BLUE} /></marker>
            </defs>

            {/* Staff + bus */}
            <rect x={STAFF_CX - 95} y="20" width="190" height="46" rx="12" fill={BLUE} />
            <text x={STAFF_CX} y="48" fontFamily={FONT} fontSize="16" fontWeight="700" fill="#fff" textAnchor="middle">Staff · browser</text>
            <path d={`M${STAFF_CX} 66 L${STAFF_CX} ${BUS_Y}`} stroke={EDGE} strokeWidth="2" markerEnd="url(#a2)" />
            <line x1={colX(0) + COL_W / 2} y1={BUS_Y} x2={colX(FEATURES.length - 1) + COL_W / 2} y2={BUS_Y} stroke={EDGE} strokeWidth="2" />

            {/* Feature columns: page → routes, with dots + connectors down to the engine band */}
            {FEATURES.map((f, i) => {
              const x = colX(i), cx = x + COL_W / 2, rh = routeH(f), rBottom = ROUTE_Y + rh;
              const accent = f.hero ? BLUE : '#c9d4da';
              const marker = f.hero ? 'url(#a2b)' : 'url(#a2)';
              const stroke = f.hero ? BLUE : EDGE;
              return (
                <g key={f.p}>
                  {/* bus → page */}
                  <path d={`M${cx} ${BUS_Y} L${cx} ${PAGE_Y}`} stroke={stroke} strokeWidth="2" markerEnd={marker} />
                  {/* page box */}
                  <rect x={x} y={PAGE_Y} width={COL_W} height={PAGE_H} rx="10" fill={f.hero ? '#eaf3fb' : '#fff'} stroke={accent} strokeWidth={f.hero ? 2 : 1.5} />
                  <text x={cx} y={PAGE_Y + 22} fontFamily={MONO} fontSize="12.5" fontWeight="700" fill={BLUE} textAnchor="middle">{f.p}</text>
                  <text x={cx} y={PAGE_Y + 39} fontFamily={FONT} fontSize="11" fill={MUTED} textAnchor="middle">{f.name}</text>
                  {/* page → routes */}
                  <path d={`M${cx} ${PAGE_Y + PAGE_H} L${cx} ${ROUTE_Y}`} stroke={stroke} strokeWidth="2" markerEnd={marker} />
                  {/* routes box */}
                  <rect x={x} y={ROUTE_Y} width={COL_W} height={rh} rx="10" fill="#fff" stroke={accent} strokeWidth={f.hero ? 2 : 1.5} />
                  {f.routes.map((r, j) => (
                    <text key={j} x={x + 10} y={ROUTE_Y + 18 + j * 15} fontFamily={r.startsWith('/') || r.startsWith('lib') ? MONO : FONT} fontSize="10.5" fontWeight={r.startsWith('/') ? 700 : 400} fill={r.startsWith('/') ? INK : MUTED}>{r}</text>
                  ))}
                  <Dots deps={f.deps} x={x + COL_W - 12 - (f.deps.length - 1) * 15} y={ROUTE_Y - 0} />
                  {/* routes → engine band */}
                  <path d={`M${cx} ${rBottom} L${cx} ${ENGINE_Y}`} stroke={stroke} strokeWidth="2" markerEnd={marker} strokeDasharray={f.deps.length ? 'none' : '4 4'} />
                </g>
              );
            })}

            {/* Engine & libraries band */}
            <rect x="50" y={ENGINE_Y} width={ARCH_W - 100} height={ENGINE_H} rx="14" fill="#f5f9fc" stroke="#bcd4ea" strokeWidth="1.5" />
            <text x="70" y={ENGINE_Y + 22} fontFamily={FONT} fontSize="13" fontWeight="700" fill={BLUE}>Server engine &amp; libraries  ·  lib/</text>
            {CHIP_ROWS.map((c, i) => (
              <g key={i}>
                <rect x={c.x} y={c.y - 13} width={c.w} height="20" rx="10" fill="#fff" stroke="#d3e0ea" />
                <text x={c.x + c.w / 2} y={c.y + 1} fontFamily={MONO} fontSize="10.5" fill={INK} textAnchor="middle">{c.label}</text>
              </g>
            ))}

            {/* Engine → data services */}
            {DATA_NODES.map((d, i) => (
              <path key={i} d={`M${d.cx} ${ENGINE_Y + ENGINE_H} L${d.cx} ${DATA_Y}`} stroke={i < 2 ? BLUE : EDGE} strokeWidth="2" markerEnd={i < 2 ? 'url(#a2b)' : 'url(#a2)'} />
            ))}

            {/* Data / service nodes */}
            {DATA_NODES.map((d, i) => (
              <g key={i}>
                <rect x={d.cx - d.w / 2} y={DATA_Y} width={d.w} height={DATA_H} rx="14" fill="#fff" stroke={DEP[d.dep].c} strokeWidth="2" />
                <g transform={`translate(${d.cx - d.w / 2 + 18}, ${DATA_Y + 20})`} fill="none" stroke={DEP[d.dep].c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d.icon}</g>
                <text x={d.cx - d.w / 2 + 52} y={DATA_Y + 34} fontFamily={FONT} fontSize="16" fontWeight="700" fill={INK}>{d.label}</text>
                <text x={d.cx - d.w / 2 + 18} y={DATA_Y + 64} fontFamily={FONT} fontSize="12" fill={MUTED}>{d.sub}</text>
              </g>
            ))}

            {/* RAG ingest chain → Postgres */}
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
            {/* processed → Postgres */}
            <path d={`M${70 + 4 * (150 + 34) + 75} ${RAG_Y} L${70 + 4 * (150 + 34) + 75} ${RAG_Y - 22} L${DATA_NODES[0].cx + 120} ${RAG_Y - 22} L${DATA_NODES[0].cx + 120} ${DATA_Y + DATA_H}`} fill="none" stroke={DEP.D.c} strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#a2)" />
            <text x={DATA_NODES[0].cx + 130} y={RAG_Y - 26} fontFamily={FONT} fontSize="11" fill={DEP.D.c}>indexed into Postgres</text>
          </svg>
        </div>

        <p style={s(`font-size:13px;color:${MUTED};margin:26px auto 0;line-height:1.5;text-align:center;max-width:76ch;`)}>
          Staff open a page, the page calls its API route, the route uses the shared engine &amp; libraries, and those read
          Postgres, OpenRouter and Vercel Blob — with every answer checked against its source before it reaches the screen.
        </p>
      </main>
    </div>
  );
}
