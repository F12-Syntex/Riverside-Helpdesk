'use client';

import React from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * /diagram — the complete system map.
 *
 * A single reference page that explains the whole stack: the request
 * flowchart, every public page, every API route, the server libraries,
 * the RAG knowledge pipeline and the data/external services. Hidden from
 * the tools index (reachable directly at /diagram); it is documentation,
 * not a day-to-day staff tool.
 *
 * Reflects the current Notebook-only Q&A setup: document (RAG) search and
 * the contacts directory are switched off for answering, though the code
 * and index still exist and are mapped here.
 * ------------------------------------------------------------------ */

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const INK = '#212b32';
const MUTED = '#4c6272';
const BLUE = '#005eb8';
const GREEN = '#007f3b';
const EDGE = '#9fb1ba';

/* ---------- the request flowchart (hero) ---------- */
const NODES = [
  { id: 'staff', x: 40, y: 60, w: 190, h: 100, icon: Icons.chat, title: 'Staff', sub: 'ask in plain English', fill: '#fff', border: '#9dc3e6', ink: INK, subInk: MUTED, ic: BLUE },
  { id: 'app', x: 320, y: 60, w: 200, h: 100, icon: Icons.home, title: 'Practice app', sub: 'the server · /api/ask', fill: BLUE, border: BLUE, ink: '#fff', subInk: '#cfe3f5', ic: '#fff' },
  { id: 'ai', x: 820, y: 60, w: 200, h: 100, icon: Icons.sparkle, title: 'AI wording', sub: 'plain NHS English', fill: '#fff', border: '#9dc3e6', ink: INK, subInk: MUTED, ic: BLUE },
  { id: 'check', x: 820, y: 430, w: 200, h: 100, icon: Icons.shield, title: 'Quote check', sub: 'matched to the Notebook', fill: '#fff', border: '#a7d8b6', ink: INK, subInk: MUTED, ic: GREEN },
  { id: 'answer', x: 320, y: 430, w: 200, h: 100, icon: Icons.check, title: 'Answer', sub: 'shown with its source', fill: '#fff', border: '#a7d8b6', ink: INK, subInk: MUTED, ic: GREEN },
  { id: 'notebook', x: 370, y: 245, w: 300, h: 110, icon: Icons.book, title: 'Notebook', sub: 'every page, in full', fill: '#eaf7ee', border: '#8ccfa3', ink: '#075e34', subInk: '#3f7d5c', ic: GREEN, tag: 'ONLY SOURCE' },
];

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
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="16" fill={n.fill} stroke={n.border} strokeWidth="2" />
      <g transform={`translate(${n.x + 20}, ${n.y + 18})`} fill="none" stroke={n.ic} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{n.icon}</g>
      <text x={n.x + 20} y={n.y + 66} fontFamily={FONT} fontSize="18" fontWeight="700" fill={n.ink}>{n.title}</text>
      <text x={n.x + 20} y={n.y + 88} fontFamily={FONT} fontSize="13" fill={n.subInk}>{n.sub}</text>
      {n.tag && (
        <>
          <rect x={n.x + n.w - 118} y={n.y + 16} width="102" height="22" rx="11" fill={GREEN} />
          <text x={n.x + n.w - 67} y={n.y + 31} fontFamily={FONT} fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle" letterSpacing="0.4">{n.tag}</text>
        </>
      )}
    </g>
  );
}

/* ---------- tag chips ---------- */
const TAGS = {
  AI: { bg: '#e8f1fb', fg: '#005eb8', label: 'AI' },
  Postgres: { bg: '#fdf3e0', fg: '#8a6100', label: 'Postgres' },
  Blob: { bg: '#f0ebfb', fg: '#5b3ca8', label: 'Vercel Blob' },
  Local: { bg: '#fdeceb', fg: '#c0271b', label: 'localhost only' },
  NoAI: { bg: '#e9f7ee', fg: '#077038', label: 'no AI' },
  Index: { bg: '#e9f7ee', fg: '#077038', label: 'on the index' },
  Off: { bg: '#eef2f4', fg: '#5b6b74', label: 'off for now' },
};
function Tag({ k }) {
  const t = TAGS[k];
  if (!t) return null;
  return <span style={s(`display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:${t.bg};color:${t.fg};`)}>{t.label}</span>;
}

/* ---------- a compact card for a page / route / module ---------- */
function Item({ path, name, desc, tags = [] }) {
  return (
    <div style={s('background:#fff;border:1px solid #dce4e8;border-radius:12px;padding:13px 15px;display:flex;flex-direction:column;gap:5px;')}>
      <div style={s('display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;')}>
        {path && <code style={s(`font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;font-weight:700;color:${BLUE};`)}>{path}</code>}
        <span style={s(`font-size:14.5px;font-weight:700;color:${INK};`)}>{name}</span>
      </div>
      <div style={s(`font-size:13px;line-height:1.45;color:${MUTED};`)}>{desc}</div>
      {tags.length > 0 && <div style={s('display:flex;gap:5px;flex-wrap:wrap;margin-top:1px;')}>{tags.map((t) => <Tag key={t} k={t} />)}</div>}
    </div>
  );
}

function Section({ n, title, intro, children }) {
  return (
    <section style={s('margin-top:40px;')}>
      <div style={s('display:flex;align-items:center;gap:11px;margin-bottom:4px;')}>
        <span style={s(`flex:none;width:28px;height:28px;border-radius:8px;background:${BLUE};color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;`)}>{n}</span>
        <h2 style={s(`font-size:21px;margin:0;letter-spacing:-0.01em;color:${INK};`)}>{title}</h2>
      </div>
      {intro && <p style={s(`font-size:14.5px;color:${MUTED};margin:0 0 16px 39px;line-height:1.5;max-width:70ch;`)}>{intro}</p>}
      <div style={s('margin-left:39px;')}>{children}</div>
    </section>
  );
}

function Grid({ children }) {
  return <div style={s('display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;')}>{children}</div>;
}

function GroupLabel({ children }) {
  return <div style={s(`font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${MUTED};margin:20px 0 10px;`)}>{children}</div>;
}

/* ---------- data ---------- */
const PAGES = [
  { path: '/', name: 'Practice tools', desc: 'The landing page: a list of the tools staff can open.', tags: ['Index'] },
  { path: '/helpbot', name: 'Practice Q&A', desc: 'The assistant. Two tabs — Assistant (ask a question) and Knowledge base (browse the source documents).', tags: ['AI', 'Index'] },
  { path: '/lookup', name: 'Instant lookup', desc: 'Fuzzy phone directory. Type part of a name to filter hospital, pharmacy and team numbers. Runs in the browser.', tags: ['NoAI', 'Index'] },
  { path: '/notebook', name: 'Notebook', desc: 'Rich-text practice notes with sub-pages. Stored in Postgres and read in full by the assistant — the current single source.', tags: ['Postgres'] },
  { path: '/signpost', name: 'Signpost a request', desc: 'Paste an AccurX consultation; get who should handle it and how urgently.', tags: ['AI'] },
  { path: '/reason', name: 'Reason for appointment', desc: 'Turn a pasted consultation into a concise clinical reason for the clinician.', tags: ['AI'] },
  { path: '/coding', name: 'Code a document', desc: 'Paste a medical document (or a screenshot); get its one-line filing title back.', tags: ['AI'] },
  { path: '/medications', name: 'Medication check', desc: 'Referenced information about one or more medicines, from public UK sources.', tags: ['AI'] },
  { path: '/rota', name: 'Staff rota', desc: 'Build and balance a weekly staff rota from a saved list of rules.', tags: ['AI', 'Postgres'] },
  { path: '/dpia', name: 'Data protection check', desc: 'The program-wide DPIA document.', tags: [] },
  { path: '/diagram', name: 'System map', desc: 'This page — how everything fits together.', tags: [] },
  { path: '/knowledge', name: 'Knowledge admin', desc: 'Back-office review of documents, notes and conflicts. Returns 404 in production.', tags: ['Local', 'Postgres'] },
];

const API_GROUPS = [
  {
    label: 'Answering & documents',
    items: [
      { path: '/api/ask', name: 'Q&A + triage', desc: 'The main engine: retrieval, prompt, model call, and the server-side quote check. Notebook-only right now.', tags: ['AI', 'Postgres'] },
      { path: '/api/docfile', name: 'Document coding', desc: 'Builds the one-line filing title for a pasted medical document.', tags: ['AI'] },
      { path: '/api/signpost', name: 'Signposting', desc: 'A short routing suggestion for a consultation.', tags: ['AI'] },
      { path: '/api/reason', name: 'Appointment reason', desc: 'A concise clinical reason drawn only from what the patient wrote.', tags: ['AI'] },
    ],
  },
  {
    label: 'Medication',
    items: [
      { path: '/api/medication', name: 'Medicine lookup', desc: 'Looks up one medicine (with an optional question); the browser fans out one request per medicine.', tags: ['AI'] },
      { path: '/api/medication/extract', name: 'Extract names', desc: 'Pulls a list of medicine names out of pasted text.', tags: ['AI'] },
    ],
  },
  {
    label: 'Notebook',
    items: [
      { path: '/api/notebook', name: 'Notes CRUD', desc: 'List, create, update and delete notes (the Neon notes table).', tags: ['Postgres'] },
      { path: '/api/notebook/format', name: 'AI format', desc: 'Restructures a note into a rich reference document; shown as a diff to confirm.', tags: ['AI'] },
      { path: '/api/notebook/organize', name: 'AI organise', desc: 'Sorts a section into sub-pages — dry run first, then apply.', tags: ['AI'] },
      { path: '/api/notebook/attachments', name: 'Attachments', desc: 'Upload and list files against a note. Files in Vercel Blob, metadata in Postgres.', tags: ['Blob', 'Postgres'] },
      { path: '/api/notebook/export', name: 'Export', desc: 'Downloads every note and attachment record as one JSON backup.', tags: ['Postgres'] },
      { path: '/api/notebook/import', name: 'Import', desc: 'Restores a backup additively, keeping the page hierarchy.', tags: ['Postgres'] },
    ],
  },
  {
    label: 'Rota',
    items: [
      { path: '/api/rota', name: 'Rota', desc: 'Load or generate a week: a deterministic base, then the AI applies saved rules.', tags: ['AI', 'Postgres'] },
      { path: '/api/staff', name: 'Staff', desc: 'Staff CRUD for the rota generator.', tags: ['Postgres'] },
    ],
  },
  {
    label: 'Directory & knowledge base',
    items: [
      { path: '/api/directory', name: 'Directory', desc: 'The canonical phone directory that /lookup loads.', tags: ['Postgres'] },
      { path: '/api/kb', name: 'Knowledge base', desc: 'Document listing and page thumbnails for the Knowledge base tab.', tags: ['Postgres'] },
    ],
  },
  {
    label: 'Knowledge admin — localhost only',
    items: [
      { path: '/api/knowledge', name: 'Entries', desc: 'Knowledge-entry CRUD and claim sync.', tags: ['Local', 'Postgres'] },
      { path: '/api/knowledge/analyse', name: 'Analyse', desc: 'Turns a batch of passages into exact-quote claims.', tags: ['Local', 'AI'] },
      { path: '/api/knowledge/conflicts', name: 'Conflicts', desc: 'Lists and resolves detected contradictions.', tags: ['Local'] },
      { path: '/api/knowledge/status', name: 'Status', desc: 'What is indexed and what is pending.', tags: ['Local'] },
      { path: '/api/knowledge/sync', name: 'Sync', desc: 'Reconciles the document bundle, Notebook and contacts.', tags: ['Local'] },
    ],
  },
];

const LIBS = [
  { path: 'lib/ai/prompt.js', name: 'Prompt + parse', desc: 'Builds the model prompt and parses the JSON it returns.' },
  { path: 'lib/ai/quote-match.js', name: 'Quote check', desc: 'Verifies each answer sentence against a real source quote.' },
  { path: 'lib/ai/client.js', name: 'Ask helper', desc: 'The browser-side askQuestion() call.' },
  { path: 'lib/ai/claims.js', name: 'Claims', desc: 'Turns source passages into exact-quote claims for conflict review.' },
  { path: 'lib/ai/context.mjs', name: 'Supplementary context', desc: 'Extra context from URLs or committed rag/context files.' },
  { path: 'lib/knowledge.js', name: 'Knowledge layer', desc: 'Canonical Postgres store for documents, notes, contacts and conflicts.' },
  { path: 'lib/knowledge-bootstrap.js', name: 'Bootstrap', desc: 'Reconciles the committed index bundle on first run.' },
  { path: 'lib/notebook.js', name: 'Notebook data', desc: 'Reads and writes the Neon notes table; loads full context for the assistant.' },
  { path: 'lib/contacts.js', name: 'Contacts', desc: 'Deterministic phone directory and unverified-number redaction.' },
  { path: 'lib/lookup/', name: 'Lookup', desc: 'Directory loader and the fuzzy search used by /lookup.' },
  { path: 'lib/guides/', name: 'Guides', desc: 'Built-in starter questions and categories.' },
  { path: 'lib/db.js', name: 'Database', desc: 'Neon Postgres connection and schema helpers.' },
  { path: 'lib/dpia.js', name: 'DPIA', desc: 'The data-protection assessment content.' },
  { path: 'lib/text-chunk.mjs', name: 'Chunking', desc: 'Shared text-splitting used across the app.' },
];

const RAG = [
  { path: 'rag/sources/', name: 'Source documents', desc: '150+ practice files: Word, PDF, PowerPoint, RTF and images.' },
  { path: 'rag/parsers/', name: 'Parsers', desc: 'Per-format text extraction: doc, docx, pdf, pptx, rtf, image, text.' },
  { path: 'rag/lib/vision.mjs', name: 'Vision', desc: 'Reads images, screenshots and scanned pages with the vision model.', tags: ['AI'] },
  { path: 'rag/lib/chunk.mjs', name: 'Chunk', desc: 'Splits each document into passages.' },
  { path: 'rag/lib/embed.mjs', name: 'Embed', desc: 'Turns passages into embeddings for semantic search.', tags: ['AI'] },
  { path: 'rag/lib/store.mjs', name: 'Retrieval store', desc: 'Runtime search over passages (full-text + vector).' },
  { path: 'rag/processed/', name: 'Built index', desc: 'Portable artifacts: catalog, chunks, embeddings and manifest.' },
  { path: 'rag:ingest / prune', name: 'Pipeline commands', desc: 'npm run rag:ingest / rag:prune / rag:status rebuild and check the index.' },
];

const INFRA = [
  { icon: Icons.book, title: 'PostgreSQL (Neon)', desc: 'Notes, staff, the knowledge layer (entries, claims, conflicts), contacts and document embeddings (pgvector).', tags: ['Postgres'] },
  { icon: Icons.paperclip, title: 'Vercel Blob', desc: 'Stores the actual files attached to Notebook pages; the database keeps only their URLs.', tags: ['Blob'] },
  { icon: Icons.sparkle, title: 'OpenRouter', desc: 'The AI provider: the chat / vision model that words answers, and the embedding model used for search. Reached only from the server.', tags: ['AI'] },
  { icon: Icons.lock, title: 'Access control', desc: 'middleware.js makes /knowledge and /api/knowledge reachable from localhost only — they return 404 in production.', tags: ['Local'] },
];

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
        <p style={s(`font-size:16.5px;color:${MUTED};margin:0 0 8px;max-width:66ch;`)}>
          The whole Riverside Helpdesk on one page: how a question is answered, every page and API route,
          the server libraries, the knowledge pipeline and the services it all runs on.
        </p>
        <p style={s(`font-size:14px;color:${MUTED};margin:0 0 18px;max-width:66ch;line-height:1.5;`)}>
          Q&amp;A currently answers from the <strong>Notebook only</strong>. Document (RAG) search and the
          contacts directory are switched off for answering, but the code and the built index still exist and are
          included below.
        </p>

        {/* Legend */}
        <div style={s('display:flex;gap:8px;flex-wrap:wrap;')}>
          {['AI', 'Postgres', 'Blob', 'Local', 'NoAI', 'Index'].map((k) => <Tag key={k} k={k} />)}
        </div>

        {/* ---- Section 1 · the request flow ---- */}
        <Section n="1" title="How a question is answered"
          intro="Your question loops through the app and comes back as a checked answer, with the Notebook as the single source.">
          <div style={s('background:#fff;border:1px solid #d8e1e5;border-radius:16px;padding:14px;overflow-x:auto;')}>
            <svg viewBox="0 0 1060 560" width="100%" style={s('display:block;min-width:660px;font-family:' + FONT)} role="img"
              aria-label="Flowchart: staff ask the practice app, which reads the Notebook, sends the question to the AI, checks its quotes, and returns a sourced answer.">
              <defs>
                <marker id="ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill={EDGE} />
                </marker>
              </defs>
              {EDGES.map((e, i) => (
                <g key={i}>
                  <path d={e.d} fill="none" stroke={EDGE} strokeWidth="2.2" strokeDasharray={e.dim ? '5 5' : 'none'} markerEnd="url(#ah)" />
                  <text x={e.lx} y={e.ly} fontFamily={FONT} fontSize="13" fontWeight="600" fill={MUTED} textAnchor={e.anchor || 'middle'}>{e.label}</text>
                </g>
              ))}
              {NODES.map(NodeShape)}
            </svg>
          </div>
        </Section>

        {/* ---- Section 2 · public pages ---- */}
        <Section n="2" title="Pages staff can open"
          intro="Every page in the app. Only the ones tagged “on the index” are listed on the landing page; the rest still work at their own address.">
          <Grid>{PAGES.map((p) => <Item key={p.path} {...p} />)}</Grid>
        </Section>

        {/* ---- Section 3 · API routes ---- */}
        <Section n="3" title="API routes (the server)"
          intro="The back-end endpoints the pages call. Keys and knowledge stay here; only the answer goes back to the browser.">
          {API_GROUPS.map((g) => (
            <div key={g.label}>
              <GroupLabel>{g.label}</GroupLabel>
              <Grid>{g.items.map((it) => <Item key={it.path} {...it} />)}</Grid>
            </div>
          ))}
        </Section>

        {/* ---- Section 4 · libraries ---- */}
        <Section n="4" title="Server libraries"
          intro="Shared code the routes build on, under lib/.">
          <Grid>{LIBS.map((l) => <Item key={l.path} {...l} />)}</Grid>
        </Section>

        {/* ---- Section 5 · RAG pipeline ---- */}
        <Section n="5" title="Knowledge pipeline (RAG)"
          intro="Prepared ahead of time, separately from live questions: practice documents are parsed, chunked, embedded and indexed. It feeds the Knowledge base tab and document search — the latter is off for answering right now.">
          <Grid>{RAG.map((r) => <Item key={r.path} {...r} />)}</Grid>
        </Section>

        {/* ---- Section 6 · infrastructure ---- */}
        <Section n="6" title="Data & services"
          intro="Where everything is stored and the outside services the app relies on.">
          <div style={s('display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;')}>
            {INFRA.map((x) => (
              <div key={x.title} style={s('background:#fff;border:1px solid #dce4e8;border-radius:14px;padding:16px 18px;display:flex;gap:14px;align-items:flex-start;')}>
                <div style={s(`flex:none;width:40px;height:40px;border-radius:10px;background:#f0f6fb;color:${BLUE};display:flex;align-items:center;justify-content:center;`)}>
                  <Svg w={20} sw={2}>{x.icon}</Svg>
                </div>
                <div style={s('flex:1;min-width:0;')}>
                  <div style={s(`font-size:15.5px;font-weight:700;color:${INK};`)}>{x.title}</div>
                  <div style={s(`font-size:13.5px;line-height:1.5;color:${MUTED};margin:3px 0 7px;`)}>{x.desc}</div>
                  <div style={s('display:flex;gap:5px;flex-wrap:wrap;')}>{x.tags.map((t) => <Tag key={t} k={t} />)}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <p style={s(`font-size:13px;color:${MUTED};margin:44px 0 0;line-height:1.5;text-align:center;`)}>
          In short: staff pages call server routes, the routes lean on the libraries, and the libraries read the Notebook
          and knowledge index in Postgres — with every answer checked back against its source.
        </p>
      </main>
    </div>
  );
}
