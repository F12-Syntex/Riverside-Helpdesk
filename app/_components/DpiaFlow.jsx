'use client';

/* ------------------------------------------------------------------ *
 * The DPIA's own data-flow diagram — step 2, "describe the processing".
 *
 * One picture of what staff put in, what the server does with it, what
 * is stored and who outside the practice receives it. Everything drawn
 * here is stated in the DPIA text and in ARCHITECTURE.md; the diagram
 * adds no claim of its own, so the two cannot drift apart.
 *
 * Hand-laid coordinates, one viewBox, scales to the sheet width.
 * ------------------------------------------------------------------ */

import { s } from './ui';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const INK = '#212b32';
const MUTED = '#4c6272';
const BLUE = '#005eb8';
const AMBER = '#8a6100';
const RED = '#c0271b';
const EDGE = '#9fb1ba';

// The tools the server runs. Named the way the index names them, so a reader
// can go from the diagram to the route list without translating.
const TOOL_CHIPS = [
  'Practice Q&A', 'Instant lookup', 'Signpost', 'Reason',
  'Code a document', 'Notebook', 'Medication check', 'Staff rota',
  'Settings', 'Audit log',
];

// Stored by the practice's own processors.
const STORES = [
  {
    x: 60, w: 250, title: 'Neon (PostgreSQL)', lines: [
      'Notebook notes, and the',
      'knowledge built from them',
      'answer cache — the question,',
      'stored verbatim',
      'audit log — question text,',
      'first 400 characters, kept',
      'with no purge job',
      'staff and rotas · medicines',
      'cache · settings · token counts',
    ],
  },
  {
    x: 330, w: 210, title: 'Vercel Blob', lines: [
      'Notebook file attachments,',
      'whatever they contain.',
      '',
      'Uploaded with public access:',
      'the unguessable URL is the',
      'only thing protecting them.',
    ],
  },
];

// Recipients outside the practice.
const EXTERNAL = [
  {
    x: 640, w: 250, title: 'OpenRouter', lines: [
      'questions · Notebook pages ·',
      'document extracts · pasted',
      'consultation text · screenshots',
      '· medicine questions · text',
      'embedded for search',
      '',
      'Routed only to providers set to',
      'deny retention and training;',
      'where they run is unconfirmed.',
    ],
  },
  {
    x: 900, w: 140, title: 'Exa', lines: [
      'the web-search',
      'query text the',
      'model composed,',
      'through',
      'OpenRouter’s',
      'search tool.',
      '',
      'No documents,',
      'no notes.',
    ],
  },
  {
    x: 1050, w: 120, title: 'Web hosts', lines: [
      'an HTTP GET',
      'when Instant',
      'lookup reads a',
      'page to find a',
      'phone number.',
      '',
      'The server’s IP,',
      'no practice data.',
    ],
  },
];

function Box({ x, y, w, h, title, lines, colour, mono, dash }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="10" fill="#fff" stroke={colour} strokeWidth="1.6" strokeDasharray={dash || 'none'} />
      <text x={x + 14} y={y + 24} fontFamily={mono ? MONO : FONT} fontSize="13.5" fontWeight="700" fill={colour}>{title}</text>
      {lines.map((l, i) => (
        <text key={i} x={x + 14} y={y + 46 + i * 14.5} fontFamily={FONT} fontSize="11" fill={MUTED}>{l}</text>
      ))}
    </g>
  );
}

function chips(items, x0, y0, maxX, rowH) {
  const out = [];
  let x = x0, y = y0;
  for (const label of items) {
    const w = label.length * 6.2 + 20;
    if (x + w > maxX) { x = x0; y += rowH; }
    out.push({ label, x, y, w });
    x += w + 8;
  }
  return out;
}

export default function DpiaFlow() {
  const toolChips = chips(TOOL_CHIPS, 322, 232, 800, 26);

  return (
    <svg viewBox="0 0 1200 650" width="100%" style={s('display:block;height:auto;font-family:' + FONT)} role="img"
      aria-label="Data flow: staff type questions, pasted consultation text and notes into the browser; the server runs the tools; data is stored in Neon Postgres and Vercel Blob and sent to OpenRouter, Exa and web hosts; the browser itself reports to Vercel Analytics and Google Fonts on every page load.">
      <defs>
        <marker id="dpia-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={EDGE} />
        </marker>
      </defs>

      {/* Staff */}
      <rect x="400" y="20" width="320" height="86" rx="12" fill={BLUE} />
      <text x="420" y="50" fontFamily={FONT} fontSize="16" fontWeight="700" fill="#fff">Staff · browser</text>
      <text x="420" y="72" fontFamily={FONT} fontSize="11.5" fill="#cfe3f5">questions · pasted consultation text</text>
      <text x="420" y="90" fontFamily={FONT} fontSize="11.5" fill="#cfe3f5">Notebook notes · file attachments</text>

      {/* Browser-side third parties — nothing to do with the server */}
      <path d="M720 63 L872 63" fill="none" stroke={EDGE} strokeWidth="2" strokeDasharray="5 5" markerEnd="url(#dpia-arrow)" />
      <text x="796" y="54" fontFamily={FONT} fontSize="10.5" fontWeight="600" fill={MUTED} textAnchor="middle">every page load</text>
      <Box x={880} y={20} w={300} h={86} colour={RED} dash="6 4"
        title="Vercel Analytics · Google Fonts"
        lines={['IP address, user agent and page, sent', 'from the staff device itself — before any', 'question is asked.']} />

      {/* Staff → the app */}
      <path d="M560 106 L560 160" fill="none" stroke={EDGE} strokeWidth="2" markerEnd="url(#dpia-arrow)" />
      <text x="572" y="138" fontFamily={FONT} fontSize="11" fontWeight="600" fill={MUTED}>what staff type or paste</text>

      {/* The app */}
      <rect x="300" y="160" width="520" height="170" rx="14" fill="#f2f8fc" stroke={BLUE} strokeWidth="2" />
      <text x="322" y="188" fontFamily={FONT} fontSize="15" fontWeight="700" fill={BLUE}>Riverside Helpdesk — Next.js on Vercel</text>
      <text x="322" y="209" fontFamily={FONT} fontSize="11.5" fill={MUTED}>Server routes. No sign-in: anyone who reaches the URL can use it.</text>
      {toolChips.map((c, i) => (
        <g key={i}>
          <rect x={c.x} y={c.y - 13} width={c.w} height="20" rx="10" fill="#fff" stroke="#cfdfec" />
          <text x={c.x + c.w / 2} y={c.y + 1} fontFamily={FONT} fontSize="10.5" fill={INK} textAnchor="middle">{c.label}</text>
        </g>
      ))}

      {/* Distribution bus: the app to the two groups below */}
      <path d="M560 330 L560 360" fill="none" stroke={EDGE} strokeWidth="2" />
      <line x1="300" y1="360" x2="900" y2="360" stroke={EDGE} strokeWidth="2" />
      <path d="M300 360 L300 400" fill="none" stroke={EDGE} strokeWidth="2" markerEnd="url(#dpia-arrow)" />
      <path d="M900 360 L900 400" fill="none" stroke={EDGE} strokeWidth="2" markerEnd="url(#dpia-arrow)" />
      <text x="312" y="382" fontFamily={FONT} fontSize="11" fontWeight="600" fill={AMBER}>stored</text>
      <text x="888" y="382" fontFamily={FONT} fontSize="11" fontWeight="600" fill={RED} textAnchor="end">leaves the practice</text>

      {/* Stored */}
      <rect x="40" y="400" width="520" height="222" rx="14" fill="#fffdf5" stroke="#e3d3a8" strokeWidth="1.5" />
      <text x="60" y="424" fontFamily={FONT} fontSize="13" fontWeight="700" fill={AMBER}>Stored — the practice’s own processors</text>
      {STORES.map((b) => <Box key={b.title} x={b.x} y={438} w={b.w} h={168} colour={AMBER} title={b.title} lines={b.lines} />)}

      {/* Sent outside */}
      <rect x="620" y="400" width="560" height="222" rx="14" fill="#fff8f7" stroke="#e8bdb7" strokeWidth="1.5" />
      <text x="640" y="424" fontFamily={FONT} fontSize="13" fontWeight="700" fill={RED}>Sent outside the practice</text>
      {EXTERNAL.map((b) => <Box key={b.title} x={b.x} y={438} w={b.w} h={168} colour={RED} title={b.title} lines={b.lines} />)}

      {/* The one thing the picture cannot show */}
      <text x="40" y="640" fontFamily={FONT} fontSize="10.5" fill={MUTED}>
        Chat history stays in the staff member’s own browser. No IP address is stored by the application; the platform, the analytics and the font host see one on every page load.
      </text>
    </svg>
  );
}
