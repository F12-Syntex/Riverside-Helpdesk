'use client';

import React from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * /diagram — a clean, single-view flowchart of the whole stack.
 *
 * A directed flow drawn as SVG: the question loops through the practice
 * app (Staff → App → AI → Check → Answer → Staff), with the Notebook
 * feeding in as the single source. Reflects the current Notebook-only
 * setup (document search and the contacts directory are switched off).
 * ------------------------------------------------------------------ */

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const INK = '#212b32';
const MUTED = '#4c6272';
const BLUE = '#005eb8';
const GREEN = '#007f3b';
const EDGE = '#9fb1ba';

// Boxes in the flow. Each is drawn as a rounded rect with an icon, a title
// and a one-line subtitle.
const NODES = [
  { id: 'staff', x: 40, y: 60, w: 190, h: 100, icon: Icons.chat, title: 'Staff', sub: 'ask in plain English', fill: '#fff', border: '#9dc3e6', ink: INK, subInk: MUTED, ic: BLUE },
  { id: 'app', x: 320, y: 60, w: 200, h: 100, icon: Icons.home, title: 'Practice app', sub: 'the server · /api/ask', fill: BLUE, border: BLUE, ink: '#fff', subInk: '#cfe3f5', ic: '#fff' },
  { id: 'ai', x: 820, y: 60, w: 200, h: 100, icon: Icons.sparkle, title: 'AI wording', sub: 'plain NHS English', fill: '#fff', border: '#9dc3e6', ink: INK, subInk: MUTED, ic: BLUE },
  { id: 'check', x: 820, y: 430, w: 200, h: 100, icon: Icons.shield, title: 'Quote check', sub: 'matched to the Notebook', fill: '#fff', border: '#a7d8b6', ink: INK, subInk: MUTED, ic: GREEN },
  { id: 'answer', x: 320, y: 430, w: 200, h: 100, icon: Icons.check, title: 'Answer', sub: 'shown with its source', fill: '#fff', border: '#a7d8b6', ink: INK, subInk: MUTED, ic: GREEN },
  { id: 'notebook', x: 370, y: 245, w: 300, h: 110, icon: Icons.book, title: 'Notebook', sub: 'every page, in full', fill: '#eaf7ee', border: '#8ccfa3', ink: '#075e34', subInk: '#3f7d5c', ic: GREEN, tag: 'ONLY SOURCE' },
];

// Directed connectors. `d` is an SVG path; `label` sits at (lx, ly).
const EDGES = [
  { d: 'M230 110 L320 110', label: '1 · asks', lx: 275, ly: 100 },
  { d: 'M520 110 L820 110', label: '2 · sends question + Notebook', lx: 670, ly: 100 },
  { d: 'M920 160 L920 430', label: '3 · draft', lx: 932, ly: 300, anchor: 'start' },
  { d: 'M820 480 L520 480', label: 'checked', lx: 670, ly: 470 },
  { d: 'M320 480 L150 480 L150 160', label: '4 · reply + source', lx: 162, ly: 320, anchor: 'start' },
  { d: 'M470 245 L440 160', label: 'reads', lx: 482, ly: 210, anchor: 'start', dim: true },
];

function NodeShape(n) {
  return (
    <g key={n.id}>
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="16"
        fill={n.fill} stroke={n.border} strokeWidth="2" />
      <g transform={`translate(${n.x + 20}, ${n.y + 18})`} fill="none"
        stroke={n.ic} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {n.icon}
      </g>
      <text x={n.x + 20} y={n.y + 66} fontFamily={FONT} fontSize="18" fontWeight="700" fill={n.ink}>{n.title}</text>
      <text x={n.x + 20} y={n.y + 88} fontFamily={FONT} fontSize="13" fill={n.subInk}>{n.sub}</text>
      {n.tag && (
        <>
          <rect x={n.x + n.w - 118} y={n.y + 16} width="102" height="22" rx="11" fill={GREEN} />
          <text x={n.x + n.w - 67} y={n.y + 31} fontFamily={FONT} fontSize="11" fontWeight="700"
            fill="#fff" textAnchor="middle" letterSpacing="0.4">{n.tag}</text>
        </>
      )}
    </g>
  );
}

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="How the system works" />

      <main style={s('flex:1;width:100%;max-width:1000px;margin:0 auto;padding:32px 24px 56px;')}>
        <Hover tag={Link} href="/"
          base={`display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:600;color:${MUTED};text-decoration:none;margin-bottom:14px;`}
          hover={`color:${BLUE};`}>
          <Svg w={17} sw={2.2}>{Icons.arrowLeft}</Svg>All practice tools
        </Hover>

        <h1 style={s('font-size:30px;margin:0 0 4px;letter-spacing:-0.02em;')}>How the system works</h1>
        <p style={s(`font-size:16.5px;color:${MUTED};margin:0 0 24px;max-width:64ch;`)}>
          Your question loops through the practice app and comes back as a checked
          answer. Right now the <strong>Notebook is the only source</strong> — every
          page is read in full, and nothing else is looked at.
        </p>

        {/* The flowchart. Scrolls sideways on very small screens. */}
        <div style={s('background:#fff;border:1px solid #d8e1e5;border-radius:16px;padding:14px;overflow-x:auto;box-shadow:0 1px 2px rgba(33,43,50,.05);')}>
          <svg viewBox="0 0 1060 560" width="100%" style={s('display:block;min-width:660px;font-family:' + FONT)} role="img"
            aria-label="Flowchart: Staff ask the practice app, which reads the Notebook, sends the question to the AI, checks its quotes, and returns a sourced answer to staff.">
            <defs>
              <marker id="ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill={EDGE} />
              </marker>
            </defs>

            {/* connectors first, so the boxes sit on top */}
            {EDGES.map((e, i) => (
              <g key={i}>
                <path d={e.d} fill="none" stroke={EDGE} strokeWidth="2.2"
                  strokeDasharray={e.dim ? '5 5' : 'none'} markerEnd="url(#ah)" />
                <text x={e.lx} y={e.ly} fontFamily={FONT} fontSize="13" fontWeight="600"
                  fill={MUTED} textAnchor={e.anchor || 'middle'}>{e.label}</text>
              </g>
            ))}

            {NODES.map(NodeShape)}
          </svg>
        </div>

        {/* Plain-words backup for the flow, and a way in. */}
        <div style={s('display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;margin-top:20px;')}>
          <p style={s(`font-size:13.5px;color:${MUTED};margin:0;line-height:1.5;max-width:60ch;`)}>
            <strong>1</strong> You ask → <strong>2</strong> the app reads your Notebook and sends it to the AI →
            <strong> 3</strong> the AI words it → the quotes are checked → <strong>4</strong> you get the answer with its source.
          </p>
          <Hover tag={Link} href="/helpbot"
            base={`display:inline-flex;align-items:center;gap:7px;padding:11px 18px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;background:${BLUE};color:#fff;flex:none;`}
            hover="background:#004a94;">
            Try it<Svg w={17} sw={2.2}>{Icons.arrow}</Svg>
          </Hover>
        </div>
      </main>
    </div>
  );
}
