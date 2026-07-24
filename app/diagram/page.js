'use client';

import React from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * /diagram — the complete, explained system map.
 *
 * One reference page covering the whole stack: the request flowchart and
 * the three answer shapes, every public page, every UI component, every
 * API route, all the server libraries, the full RAG knowledge pipeline,
 * the data / external services, the configuration and the build/access
 * pieces. Hidden from the tools index; reachable directly at /diagram.
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
  UI: { bg: '#eef2f5', fg: '#42566a', label: 'browser' },
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
        {name && <span style={s(`font-size:14.5px;font-weight:700;color:${INK};`)}>{name}</span>}
      </div>
      <div style={s(`font-size:13px;line-height:1.45;color:${MUTED};`)}>{desc}</div>
      {tags.length > 0 && <div style={s('display:flex;gap:5px;flex-wrap:wrap;margin-top:1px;')}>{tags.map((t) => <Tag key={t} k={t} />)}</div>}
    </div>
  );
}

function Section({ n, title, intro, children }) {
  return (
    <section style={s('margin-top:44px;')}>
      <div style={s('display:flex;align-items:center;gap:11px;margin-bottom:4px;')}>
        <span style={s(`flex:none;width:28px;height:28px;border-radius:8px;background:${BLUE};color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;`)}>{n}</span>
        <h2 style={s(`font-size:21px;margin:0;letter-spacing:-0.01em;color:${INK};`)}>{title}</h2>
      </div>
      {intro && <p style={s(`font-size:14.5px;color:${MUTED};margin:0 0 16px 39px;line-height:1.5;max-width:72ch;`)}>{intro}</p>}
      <div style={s('margin-left:39px;')}>{children}</div>
    </section>
  );
}

function Grid({ children, min = 240 }) {
  return <div style={s(`display:grid;grid-template-columns:repeat(auto-fill,minmax(${min}px,1fr));gap:12px;`)}>{children}</div>;
}

function GroupLabel({ children }) {
  return <div style={s(`font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${MUTED};margin:20px 0 10px;`)}>{children}</div>;
}

function Groups({ data, min }) {
  return data.map((g) => (
    <div key={g.label}>
      <GroupLabel>{g.label}</GroupLabel>
      <Grid min={min}>{g.items.map((it) => <Item key={it.path + it.name} {...it} />)}</Grid>
    </div>
  ));
}

/* ================= data ================= */

const SHAPES = [
  { tone: '#005eb8', bg: '#f0f6fb', title: 'answer', desc: 'A step-by-step how-to for staff, drawn from the Notebook, with a source under each part.' },
  { tone: '#8a6100', bg: '#fff8ec', title: 'triage', desc: 'An incoming patient message routed: an urgency band, the actions to take, who to send it to, and safety-net red flags.' },
  { tone: '#075e34', bg: '#eefaf1', title: 'docfile', desc: 'A pasted medical document turned into a one-line filing title, ready to code into the record.' },
];

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

const COMPONENTS = [
  {
    label: 'Answer & chat',
    items: [
      { path: 'ChatView', name: 'Conversation', desc: 'The assistant thread: your messages and each answer / triage / guide card.' },
      { path: 'AiAnswer', name: 'Answer card', desc: 'A how-to answer: markdown sections, source chips and any AI-judgement note.' },
      { path: 'TriageAnswer', name: 'Triage card', desc: 'A routed patient request: urgency, actions, red flags and where to send it.' },
      { path: 'DocFileAnswer', name: 'Filing card', desc: 'The one-line filing title for a pasted document, with a copy button.' },
      { path: 'GuideCard', name: 'Guide card', desc: 'A built-in step-by-step guide shown as a card.' },
      { path: 'ContactsCard', name: 'Contacts', desc: 'Exact phone numbers and emails from the directory, shown verbatim.' },
      { path: 'CiteChip', name: 'Citation link', desc: 'The quiet grey “source” link under a statement; opens the source panel.' },
      { path: 'JudgementChip', name: 'Judgement marker', desc: 'The amber flag for the assistant’s own judgement, not a document.' },
      { path: 'SuggestBubble', name: 'Starter questions', desc: 'Suggested questions shown on the empty state.' },
      { path: 'Md · Rich', name: 'Safe renderers', desc: 'Render only the limited markdown / inline formatting answers may use.' },
    ],
  },
  {
    label: 'Shell & viewers',
    items: [
      { path: 'AppHeader', name: 'Header', desc: 'The top bar, logo and the Assistant / Knowledge base tabs.' },
      { path: 'MobileNav', name: 'Mobile menu', desc: 'The full-screen navigation overlay on small screens.' },
      { path: 'KbView', name: 'Knowledge base tab', desc: 'Browse the source documents and their page thumbnails.' },
      { path: 'DocumentViewer', name: 'Source panel', desc: 'Opens a cited note or passage beside the answer.' },
      { path: 'PdfSourceView', name: 'PDF page view', desc: 'Renders the exact cited PDF page with the quote highlighted.' },
      { path: 'DpiaView', name: 'DPIA sheet', desc: 'Renders the DPIA as an ICO-style A4 document.' },
      { path: 'Notifications · notify', name: 'Toasts', desc: 'The app-wide notification host.' },
      { path: 'AddGuideModal', name: 'Add guide', desc: 'Create a custom starter guide (saved in the browser).' },
      { path: 'ui.js', name: 'Style kit', desc: 'Shared helpers: the s() style parser, Hover, Svg and the icon set.' },
    ],
  },
  {
    label: 'Tool-specific',
    items: [
      { path: 'RotaSystem', name: 'Rota UI', desc: 'The weekly staff grid, the rules list and the generate button.' },
      { path: 'MedicationCard', name: 'Medicine card', desc: 'One medicine’s referenced information.' },
      { path: 'SourceLink', name: 'Source link', desc: 'A labelled external source link on a medication card.' },
    ],
  },
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

const LIB_GROUPS = [
  {
    label: 'AI & answering',
    items: [
      { path: 'ai/prompt.js', name: 'Prompt + parse', desc: 'Builds the model prompt and parses the JSON it returns.' },
      { path: 'ai/quote-match.js', name: 'Quote check', desc: 'Verifies each answer sentence against a real source quote.' },
      { path: 'ai/client.js', name: 'Ask helper', desc: 'The browser-side askQuestion() call.' },
      { path: 'ai/claims.js', name: 'Claims', desc: 'Turns source passages into exact-quote claims for conflict review.' },
      { path: 'ai/context.mjs', name: 'Supplementary context', desc: 'Extra context from URLs or committed rag/context files.' },
      { path: 'ai/docfile.mjs', name: 'Docfile helpers', desc: 'Date and action helpers for the document filing title.' },
      { path: 'ai/medication.js', name: 'Medication AI', desc: 'Prompt and parsing for the medication tool.' },
      { path: 'ai/rota.js', name: 'Rota AI', desc: 'Prompt and parsing for the rota generator.' },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { path: 'knowledge.js', name: 'Knowledge layer', desc: 'Canonical Postgres store for documents, notes, contacts and conflicts.', tags: ['Postgres'] },
      { path: 'knowledge-bootstrap.js', name: 'Bootstrap', desc: 'Reconciles the committed index bundle on first run.' },
      { path: 'knowledge-context.mjs', name: 'Hit → chunk', desc: 'Turns a knowledge hit into a citable source chunk.' },
      { path: 'knowledge-admin-access.js', name: 'Admin gate', desc: 'The localhost-only check for /knowledge.', tags: ['Local'] },
    ],
  },
  {
    label: 'Data & tools',
    items: [
      { path: 'notebook.js', name: 'Notebook data', desc: 'Reads and writes the notes table; loads full context for the assistant.', tags: ['Postgres'] },
      { path: 'contacts.js', name: 'Contacts', desc: 'Deterministic phone directory and unverified-number redaction.' },
      { path: 'lookup/', name: 'Lookup', desc: 'Directory loader and the fuzzy search used by /lookup.' },
      { path: 'guides/', name: 'Guides', desc: 'Built-in starter questions, categories and seed data.' },
      { path: 'medications/', name: 'Medications', desc: 'Client fetch and the paste-list parser for the medication tool.' },
      { path: 'rota/logic.js', name: 'Rota logic', desc: 'The deterministic base rota the AI then adjusts.' },
      { path: 'db.js', name: 'Database', desc: 'Neon Postgres connection and schema helpers.', tags: ['Postgres'] },
      { path: 'dpia.js', name: 'DPIA', desc: 'The data-protection assessment content.' },
      { path: 'text-chunk.mjs', name: 'Chunking', desc: 'Shared text-splitting used across the app.' },
    ],
  },
];

const RAG_GROUPS = [
  {
    label: 'Run it (npm run rag:*)',
    items: [
      { path: 'rag:ingest', name: 'Ingest', desc: 'Parse, chunk, embed and index new or changed documents.', tags: ['AI'] },
      { path: 'rag:prune', name: 'Prune', desc: 'Remove index entries for documents that were deleted.' },
      { path: 'rag:status', name: 'Status', desc: 'Show what is indexed and what is pending.' },
      { path: 'migrate-legacy', name: 'Migrate', desc: 'One-off migration of the older index format.' },
    ],
  },
  {
    label: 'Read the documents (parsers)',
    items: [
      { path: 'parsers/pdf', name: 'PDF', desc: 'Extracts text and renders each page image.' },
      { path: 'parsers/docx', name: 'Word .docx', desc: 'Modern Word documents.' },
      { path: 'parsers/doc', name: 'Word .doc', desc: 'Legacy Word documents.' },
      { path: 'parsers/pptx', name: 'PowerPoint', desc: 'Slide decks.' },
      { path: 'parsers/rtf', name: 'RTF', desc: 'Rich-text files.' },
      { path: 'parsers/image', name: 'Images', desc: 'Reads pictures and scans with the vision model — no OCR.', tags: ['AI'] },
      { path: 'parsers/text', name: 'Text', desc: 'Plain text and markdown.' },
      { path: 'parsers/index', name: 'Router', desc: 'Picks the right parser for each file type.' },
    ],
  },
  {
    label: 'Build the index (rag/lib)',
    items: [
      { path: 'sources.mjs', name: 'Sources', desc: 'Lists rag/sources and fingerprints each file for change detection.' },
      { path: 'chunk · chunk-artifact', name: 'Chunk', desc: 'Splits documents into passages and writes portable chunk records.' },
      { path: 'embed.mjs', name: 'Embed', desc: 'Turns passages into embeddings for semantic search.', tags: ['AI'] },
      { path: 'vision.mjs', name: 'Vision', desc: 'Reads images, screenshots and scanned pages.', tags: ['AI'] },
      { path: 'summarize.mjs', name: 'Summarise', desc: 'Per-document summaries for the catalogue.', tags: ['AI'] },
      { path: 'store.mjs', name: 'Retrieval store', desc: 'Runtime search over passages (full-text + vector).' },
      { path: 'similarity.mjs', name: 'Similarity', desc: 'Cosine ranking of passages against the query.' },
      { path: 'html · rtf', name: 'Format helpers', desc: 'Shared HTML and RTF handling.' },
      { path: 'config.mjs', name: 'Config', desc: 'Models, paths and limits for the pipeline.' },
      { path: 'index-io.mjs', name: 'Index I/O', desc: 'Reads and writes the processed artifacts.' },
    ],
  },
  {
    label: 'On disk',
    items: [
      { path: 'rag/sources/', name: 'Source files', desc: '150+ practice documents: Word, PDF, PowerPoint, RTF and images.' },
      { path: 'rag/processed/', name: 'Built index', desc: 'catalog.json, chunks.jsonl.gz, embeddings.json and manifest.json.' },
      { path: 'rag/context/', name: 'Baseline notes', desc: 'Committed supplementary notes, reconciled into the store.' },
    ],
  },
];

const INFRA = [
  { icon: Icons.book, title: 'PostgreSQL (Neon)', desc: 'Notes, staff, the knowledge layer (entries, claims, conflicts), contacts and document embeddings (pgvector).', tags: ['Postgres'] },
  { icon: Icons.paperclip, title: 'Vercel Blob', desc: 'Stores the actual files attached to Notebook pages; the database keeps only their URLs.', tags: ['Blob'] },
  { icon: Icons.sparkle, title: 'OpenRouter', desc: 'The AI provider: the chat / vision model that words answers, plus the embedding, analysis and medication models. Reached only from the server, on providers that do not retain prompts.', tags: ['AI'] },
  { icon: Icons.lock, title: 'Access control', desc: 'middleware.js makes /knowledge and /api/knowledge reachable from localhost only — they return 404 in production.', tags: ['Local'] },
];

const CONFIG = [
  { path: 'OPENROUTER_API_KEY', name: '', desc: 'OpenRouter API key. Server-side only; never sent to the browser.' },
  { path: 'OPENROUTER_AI_MODEL', name: '', desc: 'The chat / vision model that words answers. Must be able to read images.' },
  { path: 'OPENROUTER_EMBED_MODEL', name: '', desc: 'The embedding model used for document search.' },
  { path: 'OPENROUTER_ANALYSIS_MODEL', name: '', desc: 'A cheap model for query condensing and document summaries.' },
  { path: 'OPENROUTER_MEDICATION_MODEL', name: '', desc: 'Model for the medication web-search tool.' },
  { path: 'DATABASE_URL', name: '', desc: 'Neon Postgres connection (notes, staff, knowledge, embeddings).', tags: ['Postgres'] },
  { path: 'BLOB_READ_WRITE_TOKEN', name: '', desc: 'Vercel Blob token for Notebook attachments (with BLOB_STORE_ID).', tags: ['Blob'] },
  { path: 'SUPPLEMENTARY_CONTEXT_URLS', name: '', desc: 'Optional extra context URLs (with _TTL to cache them).' },
];

const BUILD = [
  { path: 'middleware.js', name: 'Access gate', desc: 'Serves /knowledge and /api/knowledge only from localhost; 404 elsewhere.', tags: ['Local'] },
  { path: 'scripts/copy-pdf-worker', name: 'PDF worker', desc: 'Copies the PDF.js worker into public/ at build and dev start.' },
  { path: 'scripts/reset-and-seed-rota', name: 'Seed rota', desc: 'Resets and seeds the rota tables for a fresh database.', tags: ['Postgres'] },
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
        <p style={s(`font-size:16.5px;color:${MUTED};margin:0 0 8px;max-width:68ch;`)}>
          The whole Riverside Helpdesk on one page, explained: how a question is answered, every page,
          every screen component, every API route, all the server libraries, the knowledge pipeline,
          the services it runs on and how it is configured.
        </p>
        <p style={s(`font-size:14px;color:${MUTED};margin:0 0 18px;max-width:68ch;line-height:1.5;`)}>
          Q&amp;A currently answers from the <strong>Notebook only</strong>. Document (RAG) search and the
          contacts directory are switched off for answering, but the code and the built index still exist and are
          included below.
        </p>

        <div style={s('display:flex;gap:8px;flex-wrap:wrap;')}>
          {['AI', 'Postgres', 'Blob', 'Local', 'NoAI', 'Index'].map((k) => <Tag key={k} k={k} />)}
        </div>

        {/* 1 · request flow + answer shapes */}
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

          <GroupLabel>The three shapes an answer can take (the model picks)</GroupLabel>
          <Grid min={260}>
            {SHAPES.map((sh) => (
              <div key={sh.title} style={s(`background:${sh.bg};border:1px solid ${sh.tone}33;border-radius:12px;padding:14px 16px;`)}>
                <div style={s(`font-family:ui-monospace,monospace;font-size:13px;font-weight:800;color:${sh.tone};margin-bottom:5px;`)}>{sh.title}</div>
                <div style={s(`font-size:13.5px;line-height:1.5;color:${MUTED};`)}>{sh.desc}</div>
              </div>
            ))}
          </Grid>
        </Section>

        {/* 2 · pages */}
        <Section n="2" title="Pages staff can open"
          intro="Every page in the app. Only the ones tagged “on the index” are listed on the landing page; the rest still work at their own address.">
          <Grid>{PAGES.map((p) => <Item key={p.path} {...p} />)}</Grid>
        </Section>

        {/* 3 · components */}
        <Section n="3" title="Screen components"
          intro="The React building blocks the pages are made of, under app/_components. These run in the browser.">
          <Groups data={COMPONENTS} min={230} />
        </Section>

        {/* 4 · API routes */}
        <Section n="4" title="API routes (the server)"
          intro="The back-end endpoints the pages call. Keys and knowledge stay here; only the answer goes back to the browser.">
          <Groups data={API_GROUPS} />
        </Section>

        {/* 5 · libraries */}
        <Section n="5" title="Server libraries"
          intro="Shared code the routes build on, under lib/.">
          <Groups data={LIB_GROUPS} />
        </Section>

        {/* 6 · RAG */}
        <Section n="6" title="Knowledge pipeline (RAG)"
          intro="Prepared ahead of time, separately from live questions: practice documents are read, chunked, embedded and indexed. It feeds the Knowledge base tab and document search — the search is off for answering right now.">
          <Groups data={RAG_GROUPS} min={220} />
        </Section>

        {/* 7 · data & services */}
        <Section n="7" title="Data & services"
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

        {/* 8 · configuration */}
        <Section n="8" title="Configuration"
          intro="Environment variables set in .env.local (documented in .env.local.example). Nothing here reaches the browser.">
          <Grid min={260}>{CONFIG.map((c) => <Item key={c.path} {...c} />)}</Grid>
        </Section>

        {/* 9 · build & access */}
        <Section n="9" title="Build & access"
          intro="The middleware that guards the admin area, and the scripts that run at build or setup.">
          <Grid min={260}>{BUILD.map((b) => <Item key={b.path} {...b} />)}</Grid>
        </Section>

        <p style={s(`font-size:13px;color:${MUTED};margin:48px 0 0;line-height:1.5;text-align:center;max-width:76ch;margin-left:auto;margin-right:auto;`)}>
          In short: staff pages (built from the components) call server routes, the routes lean on the libraries, and the
          libraries read the Notebook and knowledge index in Postgres — with every answer checked back against its source
          before it reaches the screen.
        </p>
      </main>
    </div>
  );
}
