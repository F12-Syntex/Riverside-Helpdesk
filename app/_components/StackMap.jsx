'use client';

import React from 'react';
import { s } from './ui';

/* ------------------------------------------------------------------ *
 * The tech stack, drawn.
 *
 * /diagram answers "how is a question answered". This answers "what is
 * this thing built out of" — every layer, every dependency, every table,
 * every model role, and the numbers behind each. Nine figures, one page,
 * as little prose as each one can be understood with.
 *
 * Every number here was counted from the repository at the version in
 * the strip at the top. When a count moves, move it here: a diagram that
 * is confidently out of date is worse than no diagram.
 * ------------------------------------------------------------------ */

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// The NHS identity palette. Nothing outside this list is used for colour.
const P = {
  blue: '#005eb8', dark: '#003087', bright: '#0072ce', light: '#41b6e6',
  aqua: '#00a499', green: '#009639', lgreen: '#78be20', purple: '#330072',
  pink: '#ae2573', red: '#da291c', orange: '#ed8b00', yellow: '#ffb81c',
  ink: '#231f20', grey: '#425563', mid: '#768692', pale: '#e8edee',
  line: '#d8e1e6', bg: '#f0f4f5',
};

/* ---------- primitives ------------------------------------------- */

// Chips flow like words: each one as wide as its text, wrapping at maxX.
function flow(items, { x0, maxX, rowH = 30, charW = 6.5, pad = 22, gap = 8 }) {
  const out = []; let x = x0, row = 0;
  for (const item of items) {
    const label = typeof item === 'string' ? item : item.t + ' ' + item.v;
    const w = Math.round(label.length * charW + pad);
    if (x + w > maxX && x > x0) { x = x0; row += 1; }
    out.push({ item, x, row, w });
    x += w + gap;
  }
  return { cells: out, rows: row + 1, height: (row + 1) * rowH };
}

function Chip({ cell, y, h = 22, fill, stroke, ink, mono }) {
  const item = cell.item;
  const label = typeof item === 'string' ? item : item.t;
  const value = typeof item === 'string' ? null : item.v;
  return (
    <g>
      <rect x={cell.x} y={y} width={cell.w} height={h} rx={h / 2} fill={fill} stroke={stroke} strokeWidth="1" />
      <text x={cell.x + 11} y={y + h / 2 + 4} fontFamily={mono ? MONO : FONT} fontSize="11.5" fontWeight="600" fill={ink}>
        {label}
        {value ? <tspan fill={P.mid} fontWeight="500">{'  ' + value}</tspan> : null}
      </text>
    </g>
  );
}

function Figure({ n, title, note, children }) {
  return (
    <figure style={s('margin:0 0 30px;background:#fff;border:1px solid ' + P.line + ';border-radius:16px;padding:18px 18px 12px;')}>
      <figcaption style={s('display:flex;align-items:baseline;gap:10px;margin:0 0 12px;')}>
        <span style={s('flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:7px;background:' + P.blue + ';color:#fff;font-size:12px;font-weight:700;')}>{n}</span>
        <span style={s('font-size:17px;font-weight:700;color:' + P.ink + ';')}>{title}</span>
        <span style={s('font-size:13px;color:' + P.mid + ';')}>{note}</span>
      </figcaption>
      {children}
    </figure>
  );
}

function Arrow({ id, colour = '#9fb1ba' }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill={colour} />
    </marker>
  );
}

/* ---------- 0 · the numbers --------------------------------------- */

const STATS = [
  { v: '6.6.0', k: 'version', c: P.blue },
  { v: '639', k: 'commits', c: P.dark },
  { v: '65,684', k: 'lines of code', c: P.bright },
  { v: '20', k: 'pages', c: P.aqua },
  { v: '40', k: 'API routes', c: P.green },
  { v: '122', k: 'lib modules', c: P.lgreen },
  { v: '51', k: 'components', c: P.purple },
  { v: '31', k: 'Postgres tables', c: P.orange },
  { v: '66', k: 'test files', c: P.pink },
  { v: '196', k: 'source documents', c: P.red },
  { v: '2,047', k: 'indexed chunks', c: P.grey },
  { v: '8', k: 'model roles', c: P.yellow },
];

function Stats() {
  return (
    <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px;margin:0 0 26px;')}>
      {STATS.map((t) => (
        <div key={t.k} style={s('background:#fff;border:1px solid ' + P.line + ';border-radius:12px;padding:12px 13px;')}>
          <div style={s('font-size:24px;font-weight:800;letter-spacing:-0.5px;color:' + P.ink + ';font-variant-numeric:tabular-nums;')}>{t.v}</div>
          <div style={s('font-size:12px;font-weight:600;color:' + P.mid + ';margin-top:2px;')}>{t.k}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- 1 · the layers ---------------------------------------- */

const LAYERS = [
  {
    name: 'Browser', sub: 'what runs on the desk', c: P.dark,
    items: ['React 18.3', 'client components', 'Tiptap 2.27', 'pdf.js 6', '@napi-rs/canvas', 'Vercel Analytics', 'Chrome extension', '51 components'],
  },
  {
    name: 'App Router', sub: 'Next.js 14.2 · 20 pages', c: P.blue,
    items: ['/', '/lookup', '/tools', '/questions', '/signpost', '/reason', '/coding', '/notebook', '/medications', '/rota', '/templates', '/stats', '/settings', '/knowledge', '/dpia', '/diagram', '/stack', '/site-index', '/helpbot', 'middleware gate'],
  },
  {
    name: 'Route handlers', sub: '40 endpoints', c: P.bright,
    items: ['agent', 'reason', 'signpost', 'screen', 'docfile', 'medication +extract', 'notebook ×13', 'knowledge ×5', 'routing/learn', 'directory', 'cqc', 'lookup-web', 'rota', 'staff', 'settings +models', 'audit', 'questions +open +dismiss', 'feedback', 'attach', 'kb'],
  },
  {
    name: 'Domain libraries', sub: '122 modules · 28,170 lines', c: P.aqua,
    items: ['agent', 'ai', 'safety ×11', 'routing ×6', 'templates ×24', 'referrals', 'notebook', 'lookup', 'medications', 'rota', 'audit', 'questions', 'guides', 'triage', 'attachments', 'contacts', 'db', 'settings', 'routes', 'dpia'],
  },
  {
    name: 'Data plane', sub: 'where state lives', c: P.green,
    items: ['Neon Postgres', '31 tables', '36 indexes', 'pgvector', 'pg_trgm', 'Vercel Blob', 'rag/processed', '2,047 chunks', 'embeddings.json', 'catalog.json'],
  },
  {
    name: 'Outside', sub: 'everything third party', c: P.purple,
    items: ['OpenRouter', 'model catalogue', 'web-search tool', 'Exa · web hosts', 'CQC register', 'SNOMED · eRS', 'GitHub Actions', 'Vercel'],
  },
];

function Layers() {
  const X0 = 206, MAXX = 1178;
  let y = 14; const bands = [];
  for (const L of LAYERS) {
    const f = flow(L.items, { x0: X0, maxX: MAXX });
    const h = Math.max(62, f.height + 16);
    bands.push({ ...L, y, h, f });
    y += h + 16;
  }
  const H = y + 2;
  return (
    <svg viewBox={'0 0 1200 ' + H} width="100%" style={s('display:block;height:auto;')} role="img"
      aria-label="Six layers: browser, App Router pages, route handlers, domain libraries, data plane, outside services.">
      <defs><Arrow id="layArrow" /></defs>
      {bands.map((b, i) => (
        <g key={b.name}>
          <rect x="16" y={b.y} width="1168" height={b.h} rx="14" fill="#fff" stroke={P.line} strokeWidth="1.5" />
          <rect x="16" y={b.y} width="182" height={b.h} rx="14" fill={b.c} />
          <rect x="120" y={b.y} width="78" height={b.h} fill={b.c} />
          <text x="34" y={b.y + 27} fontFamily={FONT} fontSize="14.5" fontWeight="700" fill="#fff">{b.name}</text>
          <text x="34" y={b.y + 45} fontFamily={FONT} fontSize="11" fill="#ffffffb8">{b.sub}</text>
          {b.f.cells.map((c, j) => (
            <Chip key={j} cell={c} y={b.y + 12 + c.row * 30} fill={P.bg} stroke={P.line} ink={P.ink} mono />
          ))}
          {i < bands.length - 1 && (
            <path d={'M107 ' + (b.y + b.h + 1) + ' L107 ' + (b.y + b.h + 13)} stroke="#9fb1ba" strokeWidth="2" markerEnd="url(#layArrow)" />
          )}
        </g>
      ))}
    </svg>
  );
}

/* ---------- 2 · one turn ------------------------------------------ */

const PIPE = [
  { t: 'Message', s: 'typed at /', c: P.dark, tag: '' },
  { t: 'Patient-data screen', s: 'holds the send', c: P.red, tag: 'super-speed role' },
  { t: 'Redact identifiers', s: 'regex, no model', c: P.grey, tag: 'deterministic' },
  { t: 'Safety scan', s: 'red flags · NG12 · acuity', c: P.orange, tag: '0 model calls' },
  { t: 'Router', s: 'trigger index, lexical + vector', c: P.purple, tag: 'ships OFF' },
  { t: 'Template picker', s: 'model returns a name, not prose', c: P.blue, tag: '24 templates' },
  { t: 'Render in code', s: 'card assembled from blocks', c: P.aqua, tag: '8 commands' },
  { t: 'Quote check · log', s: 'claim dropped if unquoted', c: P.green, tag: '3 tables written' },
];

function Turn() {
  const W = 276, H = 92, GAP = 20;
  const pos = PIPE.map((p, i) => {
    const row = Math.floor(i / 4);
    const col = row % 2 === 0 ? i % 4 : 3 - (i % 4);
    return { ...p, x: 16 + col * (W + GAP), y: 16 + row * (H + 74), row, col, i };
  });
  return (
    <svg viewBox="0 0 1200 372" width="100%" style={s('display:block;height:auto;')} role="img"
      aria-label="A turn: message, patient-data screen, redaction, safety scan, router, template picker, render, quote check.">
      <defs><Arrow id="turnArrow" /></defs>
      {pos.map((p, i) => {
        const n = pos[i + 1]; if (!n) return null;
        if (n.row === p.row) {
          const fromX = p.col < n.col ? p.x + W : p.x;
          const toX = p.col < n.col ? n.x : n.x + W;
          return <path key={'e' + i} d={'M' + fromX + ' ' + (p.y + H / 2) + ' L' + toX + ' ' + (p.y + H / 2)} stroke="#9fb1ba" strokeWidth="2.2" markerEnd="url(#turnArrow)" fill="none" />;
        }
        return <path key={'e' + i} d={'M' + (p.x + W / 2) + ' ' + (p.y + H) + ' L' + (p.x + W / 2) + ' ' + (n.y - 2)} stroke="#9fb1ba" strokeWidth="2.2" markerEnd="url(#turnArrow)" fill="none" />;
      })}
      {pos.map((p) => (
        <g key={p.t}>
          <rect x={p.x} y={p.y} width={W} height={H} rx="14" fill="#fff" stroke={P.line} strokeWidth="1.5" />
          <rect x={p.x} y={p.y} width="6" height={H} rx="3" fill={p.c} />
          <circle cx={p.x + 30} cy={p.y + 26} r="13" fill={p.c} />
          <text x={p.x + 30} y={p.y + 31} fontFamily={FONT} fontSize="12.5" fontWeight="700" fill="#fff" textAnchor="middle">{p.i + 1}</text>
          <text x={p.x + 52} y={p.y + 31} fontFamily={FONT} fontSize="14.5" fontWeight="700" fill={P.ink}>{p.t}</text>
          <text x={p.x + 20} y={p.y + 58} fontFamily={FONT} fontSize="12" fill={P.grey}>{p.s}</text>
          {p.tag ? (
            <>
              <rect x={p.x + 20} y={p.y + 68} width={p.tag.length * 6.4 + 18} height="18" rx="9" fill={p.c} opacity="0.12" />
              <text x={p.x + 29} y={p.y + 81} fontFamily={MONO} fontSize="10.5" fontWeight="700" fill={p.c}>{p.tag}</text>
            </>
          ) : null}
        </g>
      ))}
      <g>
        <rect x="16" y="300" width="1168" height="56" rx="12" fill={P.bg} stroke={P.line} />
        <text x="34" y="324" fontFamily={FONT} fontSize="12.5" fontWeight="700" fill={P.grey}>Router thresholds · app_settings, no redeploy</text>
        {[['hit', '≥ 0.82 cosine', P.green], ['ask back', '≥ 0.70 cosine', P.yellow], ['min margin', '0.05', P.orange], ['else', 'picker as before', P.mid], ['enabled', 'false', P.red]].map((t, i) => (
          <g key={t[0]}>
            <rect x={330 + i * 168} y="310" width="156" height="36" rx="10" fill="#fff" stroke={t[2]} strokeWidth="1.5" />
            <text x={408 + i * 168} y="326" fontFamily={FONT} fontSize="11" fontWeight="700" fill={P.mid} textAnchor="middle">{t[0]}</text>
            <text x={408 + i * 168} y="340" fontFamily={MONO} fontSize="12" fontWeight="700" fill={t[2]} textAnchor="middle">{t[1]}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ---------- 3 · model roles --------------------------------------- */

const ROLES = [
  { k: 'reasoning', u: 'answers · every judgement', m: 'google/gemini-3.5-flash-lite', f: 'chosen at /settings', c: P.blue },
  { k: 'fast', u: 'reading · search loop · extraction', m: 'openai/gpt-oss-120b', f: 'env default', c: P.aqua },
  { k: 'images', u: 'screenshots · photos of letters', m: 'mistralai/ministral-14b-2512', f: 'own default', c: P.pink },
  { k: 'medication', u: 'Medication Check + web tool', m: 'openai/gpt-4.1-nano', f: 'env default', c: P.orange },
  { k: 'embeddings', u: 'knowledge + router vectors', m: 'openai/text-embedding-3-small', f: 'Azure only · no retention', c: P.green },
  { k: 'web', u: 'one open-internet search', m: 'inherits', f: 'medication → fast', c: P.light },
  { k: 'accurx', u: 'where a pasted request goes', m: 'inherits', f: 'fast', c: P.purple },
  { k: 'superSpeed', u: 'the pre-send screen', m: 'inherits', f: 'fast', c: P.red },
];

function Roles() {
  const W = 282, H = 104, GX = 18, GY = 16;
  return (
    <svg viewBox="0 0 1200 316" width="100%" style={s('display:block;height:auto;')} role="img"
      aria-label="Eight model roles, their default models and what each falls back to.">
      {ROLES.map((r, i) => {
        const x = 16 + (i % 4) * (W + GX), y = 14 + Math.floor(i / 4) * (H + GY);
        const inherits = r.m === 'inherits';
        return (
          <g key={r.k}>
            <rect x={x} y={y} width={W} height={H} rx="14" fill="#fff" stroke={inherits ? P.line : r.c} strokeWidth={inherits ? 1.5 : 2} strokeDasharray={inherits ? '6 5' : 'none'} />
            <rect x={x + 14} y={y + 14} width={r.k.length * 7.6 + 20} height="22" rx="11" fill={r.c} />
            <text x={x + 24} y={y + 29} fontFamily={MONO} fontSize="12" fontWeight="700" fill="#fff">{r.k}</text>
            <text x={x + 14} y={y + 56} fontFamily={FONT} fontSize="11.5" fill={P.grey}>{r.u}</text>
            <text x={x + 14} y={y + 78} fontFamily={MONO} fontSize="11.5" fontWeight="700" fill={inherits ? P.mid : P.ink}>{r.m}</text>
            <text x={x + 14} y={y + 94} fontFamily={FONT} fontSize="10.5" fontWeight="600" fill={r.c}>{inherits ? '↳ ' + r.f : r.f}</text>
          </g>
        );
      })}
      <g>
        <rect x="16" y="262" width="1168" height="42" rx="12" fill={P.bg} stroke={P.line} />
        <text x="34" y="288" fontFamily={FONT} fontSize="12.5" fontWeight="700" fill={P.grey}>Every role is one OpenRouter key · overrides stored in app_settings · solid = its own model, dashed = inherited</text>
      </g>
    </svg>
  );
}

/* ---------- 4 · the database -------------------------------------- */

const TABLES = [
  { g: 'Notebook', c: P.blue, t: ['notes', 'note_revisions', 'note_proposals', 'note_attachments', 'note_contradictions', 'note_defrag_runs', 'note_defrag_items', 'notebook_snapshots'] },
  { g: 'Knowledge', c: P.aqua, t: ['knowledge_entries', 'knowledge_passages', 'knowledge_claims', 'knowledge_claim_cache', 'knowledge_conflicts', 'knowledge_conflict_decisions', 'knowledge_analysis_jobs', 'knowledge_sync_state'] },
  { g: 'Audit · usage', c: P.orange, t: ['audit_events', 'audit_machines', 'question_log', 'open_questions', 'answer_feedback', 'ai_usage'] },
  { g: 'Reference data', c: P.dark, t: ['medications', 'medication_aliases', 'snomed_terms', 'ers_directory'] },
  { g: 'Practice ops', c: P.green, t: ['staff', 'rotas', 'app_settings'] },
  { g: 'Routing', c: P.purple, t: ['routing_triggers', 'routing_decisions'] },
];

function Database() {
  const X0 = 30, MAXX = 1170;
  let y = 16; const boxes = [];
  for (const T of TABLES) {
    const f = flow(T.t, { x0: X0 + 14, maxX: MAXX - 14, charW: 6.4 });
    const h = f.height + 44;
    boxes.push({ ...T, y, h, f });
    y += h + 14;
  }
  const H = y + 60;
  return (
    <svg viewBox={'0 0 1200 ' + H} width="100%" style={s('display:block;height:auto;')} role="img"
      aria-label="Thirty-one Postgres tables in six groups, with the extensions and index count.">
      {boxes.map((b) => (
        <g key={b.g}>
          <rect x="16" y={b.y} width="1168" height={b.h} rx="14" fill="#fff" stroke={P.line} strokeWidth="1.5" />
          <rect x="16" y={b.y} width="1168" height="4" rx="2" fill={b.c} />
          <text x="30" y={b.y + 28} fontFamily={FONT} fontSize="13.5" fontWeight="700" fill={b.c}>{b.g}</text>
          <text x={30 + b.g.length * 8 + 12} y={b.y + 28} fontFamily={MONO} fontSize="11.5" fill={P.mid}>{b.t.length + ' tables'}</text>
          {b.f.cells.map((c, j) => <Chip key={j} cell={c} y={b.y + 38 + c.row * 30} fill={P.bg} stroke={P.line} ink={P.ink} mono />)}
        </g>
      ))}
      <g>
        {[['Neon serverless', 'HTTP driver · one fetch per query', P.green], ['pgvector', 'knowledge_passages · routing_triggers', P.purple], ['pg_trgm', 'snomed_terms · ers_directory', P.orange], ['36 indexes', 'incl. 1 unique · 3 vector/trigram', P.blue]].map((t, i) => (
          <g key={t[0]}>
            <rect x={16 + i * 296} y={y} width="280" height="46" rx="12" fill={P.bg} stroke={t[2]} strokeWidth="1.5" />
            <text x={32 + i * 296} y={y + 20} fontFamily={FONT} fontSize="12.5" fontWeight="700" fill={t[2]}>{t[0]}</text>
            <text x={32 + i * 296} y={y + 36} fontFamily={FONT} fontSize="11" fill={P.grey}>{t[1]}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ---------- 5 · the corpus ---------------------------------------- */

const RAG = [
  { t: 'rag/sources', s: '196 files · 54.5 MB', c: P.dark },
  { t: '7 parsers', s: 'pdf · docx · doc · pptx · rtf · text · image', c: P.blue },
  { t: 'chunk', s: 'headings kept, tables kept whole', c: P.bright },
  { t: 'embed', s: 'text-embedding-3-small', c: P.aqua },
  { t: 'rag/processed', s: '188 docs · 2,047 chunks', c: P.green },
  { t: 'search', s: 'cosine + catalogue summaries', c: P.lgreen },
];
const TYPES = [['doc', 116], ['docx', 54], ['rtf', 9], ['pdf', 8], ['pptx', 1]];

function Corpus() {
  const W = 180, GAP = 18;
  const max = TYPES[0][1];
  return (
    <svg viewBox="0 0 1200 250" width="100%" style={s('display:block;height:auto;')} role="img"
      aria-label="Ingestion pipeline from source files through parsers, chunking and embedding to the searchable store, with the file-type mix.">
      <defs><Arrow id="ragArrow" /></defs>
      {RAG.map((r, i) => {
        const x = 16 + i * (W + GAP);
        return (
          <g key={r.t}>
            {i > 0 && <path d={'M' + (x - GAP + 2) + ' 58 L' + (x - 3) + ' 58'} stroke="#9fb1ba" strokeWidth="2.2" markerEnd="url(#ragArrow)" />}
            <rect x={x} y="16" width={W} height="84" rx="14" fill="#fff" stroke={r.c} strokeWidth="1.8" />
            <rect x={x} y="16" width={W} height="4" rx="2" fill={r.c} />
            <text x={x + 14} y="44" fontFamily={MONO} fontSize="13" fontWeight="700" fill={r.c}>{r.t}</text>
            <text x={x + 14} y="68" fontFamily={FONT} fontSize="11" fill={P.grey}>{r.s.split(' · ')[0]}</text>
            <text x={x + 14} y="84" fontFamily={FONT} fontSize="11" fill={P.grey}>{r.s.split(' · ').slice(1).join(' · ')}</text>
          </g>
        );
      })}
      <text x="16" y="136" fontFamily={FONT} fontSize="12.5" fontWeight="700" fill={P.grey}>What the practice actually holds — 188 ingested documents by format</text>
      {TYPES.map((t, i) => {
        const y = 150 + i * 20;
        const w = Math.round((t[1] / max) * 900);
        return (
          <g key={t[0]}>
            <text x="16" y={y + 11} fontFamily={MONO} fontSize="11.5" fontWeight="700" fill={P.ink}>{t[0]}</text>
            <rect x="66" y={y} width={w} height="14" rx="7" fill={[P.blue, P.aqua, P.purple, P.orange, P.pink][i]} />
            <text x={74 + w} y={y + 11} fontFamily={MONO} fontSize="11.5" fontWeight="700" fill={P.grey}>{t[1]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- 6 · dependencies -------------------------------------- */

const DEPS = [
  { g: 'Framework', c: P.blue, d: [{ t: 'next', v: '14.2' }, { t: 'react', v: '18.3' }, { t: 'react-dom', v: '18.3' }] },
  { g: 'AI', c: P.aqua, d: [{ t: 'ai', v: '7.0' }, { t: '@openrouter/ai-sdk-provider', v: '3.0' }, { t: 'zod', v: '3.25' }] },
  { g: 'Data', c: P.green, d: [{ t: '@neondatabase/serverless', v: '1.1' }, { t: '@vercel/blob', v: '2.5' }, { t: '@vercel/functions', v: '3.7' }, { t: '@vercel/analytics', v: '2.0' }] },
  { g: 'Documents', c: P.orange, d: [{ t: 'pdfjs-dist', v: '6.0' }, { t: 'mammoth', v: '1.12' }, { t: 'word-extractor', v: '1.0' }, { t: 'jszip', v: '3.10' }, { t: '@napi-rs/canvas', v: '1.0' }] },
  { g: 'Editor', c: P.purple, d: [{ t: '@tiptap/react', v: '2.27' }, { t: '@tiptap/starter-kit', v: '2.27' }, { t: '13 extensions', v: '2.27' }, { t: 'tiptap-markdown', v: '0.8' }] },
];

function Deps() {
  const X0 = 176, MAXX = 1176;
  let y = 14; const rows = [];
  for (const D of DEPS) {
    const f = flow(D.d, { x0: X0, maxX: MAXX, charW: 6.5, pad: 30 });
    const h = Math.max(50, f.height + 12);
    rows.push({ ...D, y, h, f });
    y += h + 12;
  }
  return (
    <svg viewBox={'0 0 1200 ' + (y + 4)} width="100%" style={s('display:block;height:auto;')} role="img"
      aria-label="Thirty-one production dependencies grouped by what they are for.">
      {rows.map((r) => (
        <g key={r.g}>
          <rect x="16" y={r.y} width="1168" height={r.h} rx="12" fill="#fff" stroke={P.line} strokeWidth="1.5" />
          <rect x="16" y={r.y} width="4" height={r.h} rx="2" fill={r.c} />
          <text x="34" y={r.y + 30} fontFamily={FONT} fontSize="13" fontWeight="700" fill={r.c}>{r.g}</text>
          {r.f.cells.map((c, j) => <Chip key={j} cell={c} y={r.y + 12 + c.row * 30} fill="#fff" stroke={r.c} ink={P.ink} mono />)}
        </g>
      ))}
    </svg>
  );
}

/* ---------- 7 · how it ships -------------------------------------- */

const SHIP = [
  { lane: 'App', c: P.blue, steps: [['push · PR', 'main or any branch'], ['npm test', '65 files · no DB, no key'], ['versions --check', 'package.json vs history'], ['next build', 'catches a deleted import'], ['Vercel', 'App Router · middleware']] },
  { lane: 'Extension', c: P.purple, steps: [['extension/** changed', 'nothing else triggers it'], ['build', 'esbuild · icons'], ['sign .crx', 'one repo secret'], ['GitHub release', 'a pickup point'], ['practice share drive', 'Chrome self-updates']] },
  { lane: 'Content', c: P.green, steps: [['drop a file in rag/sources', 'or write a Notebook page'], ['npm run rag:sync', 'ingest + prune'], ['catalog + embeddings', 'committed artefacts'], ['/knowledge', 'localhost only'], ['live answer', 'no redeploy']] },
];

function Ship() {
  const W = 206, GAP = 14, H = 62;
  return (
    <svg viewBox="0 0 1200 252" width="100%" style={s('display:block;height:auto;')} role="img"
      aria-label="Three delivery lanes: the app through CI to Vercel, the Chrome extension to the practice share drive, and content through ingestion.">
      <defs><Arrow id="shipArrow" /></defs>
      {SHIP.map((L, li) => {
        const y = 14 + li * (H + 16);
        return (
          <g key={L.lane}>
            <rect x="16" y={y} width="116" height={H} rx="12" fill={L.c} />
            <text x="30" y={y + 36} fontFamily={FONT} fontSize="13.5" fontWeight="700" fill="#fff">{L.lane}</text>
            {L.steps.map((st, i) => {
              const x = 146 + i * (W + GAP);
              return (
                <g key={st[0]}>
                  {i > 0 && <path d={'M' + (x - GAP + 1) + ' ' + (y + H / 2) + ' L' + (x - 3) + ' ' + (y + H / 2)} stroke="#9fb1ba" strokeWidth="2" markerEnd="url(#shipArrow)" />}
                  <rect x={x} y={y} width={W} height={H} rx="12" fill="#fff" stroke={P.line} strokeWidth="1.5" />
                  <rect x={x} y={y} width={W} height="3" rx="1.5" fill={L.c} opacity="0.7" />
                  <text x={x + 13} y={y + 27} fontFamily={MONO} fontSize="11.5" fontWeight="700" fill={P.ink}>{st[0]}</text>
                  <text x={x + 13} y={y + 46} fontFamily={FONT} fontSize="10.5" fill={P.mid}>{st[1]}</text>
                </g>
              );
            })}
          </g>
        );
      })}
      <g>
        <rect x="16" y="248" width="0" height="0" />
      </g>
    </svg>
  );
}

/* ---------- 8 · where the code is --------------------------------- */

const CODE = [
  ['lib', 28170, P.aqua, '122 modules'],
  ['app/_components', 11900, P.blue, '51 components'],
  ['test', 9848, P.green, '66 files · node --test'],
  ['app/api', 4736, P.bright, '40 route handlers'],
  ['scripts', 3428, P.orange, '21 build + data scripts'],
  ['rag', 1627, P.purple, 'ingest · parse · embed'],
  ['evals', 672, P.pink, 'routing bench + golden set'],
];

function Code() {
  const max = CODE[0][1];
  return (
    <svg viewBox="0 0 1200 262" width="100%" style={s('display:block;height:auto;')} role="img"
      aria-label="Lines of code by area: lib is the largest at 28,170 lines, then components, tests, API routes, scripts, RAG and evals.">
      {CODE.map((c, i) => {
        const y = 16 + i * 30;
        const w = Math.round((c[1] / max) * 700);
        return (
          <g key={c[0]}>
            <text x="16" y={y + 15} fontFamily={MONO} fontSize="12" fontWeight="700" fill={P.ink}>{c[0]}</text>
            <rect x="180" y={y} width={w} height="20" rx="10" fill={c[2]} />
            <text x={190 + w} y={y + 15} fontFamily={MONO} fontSize="12" fontWeight="700" fill={P.grey}>{c[1].toLocaleString()}</text>
            <text x={270 + w} y={y + 15} fontFamily={FONT} fontSize="11.5" fill={P.mid}>{c[3]}</text>
          </g>
        );
      })}
      <line x1="16" y1="232" x2="1184" y2="232" stroke={P.line} />
      <text x="16" y="252" fontFamily={FONT} fontSize="11.5" fontWeight="700" fill={P.mid}>65,684 lines counted · tests are 15% of them</text>
    </svg>
  );
}

/* ---------- 9 · what leaves the building --------------------------- */

const EGRESS = [
  { t: 'OpenRouter', s: 'question text, Notebook extracts, screenshots', g: 'zero retention', c: P.blue },
  { t: 'Exa · web hosts', s: 'a query, then pages read for a number', g: 'only if unanswered', c: P.orange },
  { t: 'Vercel Blob', s: 'Notebook attachments at public URLs', g: 'practice documents', c: P.purple },
  { t: 'Neon Postgres', s: 'everything the app remembers', g: 'the practice’s own', c: P.green },
  { t: 'Nothing else', s: 'no third-party scripts, no content analytics', g: 'see /dpia', c: P.red },
];

// Two lines, broken at a space rather than through the middle of a word.
function wrap2(text, max) {
  if (text.length <= max) return [text, ''];
  const cut = text.lastIndexOf(' ', max);
  return [text.slice(0, cut), text.slice(cut + 1)];
}

function Egress() {
  const W = 186, GAP = 10;
  return (
    <svg viewBox="0 0 1200 176" width="100%" style={s('display:block;height:auto;')} role="img"
      aria-label="What leaves the practice: OpenRouter, web hosts, Vercel Blob, Neon Postgres, and nothing else.">
      <defs><Arrow id="egrArrow" /></defs>
      <rect x="16" y="52" width="150" height="72" rx="14" fill={P.ink} />
      <text x="34" y="82" fontFamily={FONT} fontSize="13.5" fontWeight="700" fill="#fff">The app</text>
      <text x="34" y="102" fontFamily={FONT} fontSize="11" fill="#ffffffb0">on Vercel</text>
      {EGRESS.map((e, i) => {
        const x = 194 + i * (W + GAP);
        return (
          <g key={e.t}>
            {i === 0 && <path d="M166 88 L189 88" stroke="#9fb1ba" strokeWidth="2.2" markerEnd="url(#egrArrow)" />}
            {i > 0 && <path d={'M' + (x - GAP + 1) + ' 88 L' + (x - 3) + ' 88'} stroke="#9fb1ba" strokeWidth="2" strokeDasharray="4 4" />}
            <rect x={x} y="40" width={W} height="96" rx="14" fill="#fff" stroke={e.c} strokeWidth="1.8" />
            <text x={x + 14} y="66" fontFamily={FONT} fontSize="13" fontWeight="700" fill={e.c}>{e.t}</text>
            <text x={x + 14} y="88" fontFamily={FONT} fontSize="10.5" fill={P.grey}>{wrap2(e.s, 27)[0]}</text>
            <text x={x + 14} y="103" fontFamily={FONT} fontSize="10.5" fill={P.grey}>{wrap2(e.s, 27)[1]}</text>
            <rect x={x + 14} y="112" width={e.g.length * 5.9 + 14} height="16" rx="8" fill={e.c} opacity="0.12" />
            <text x={x + 21} y="124" fontFamily={MONO} fontSize="9.5" fontWeight="700" fill={e.c}>{e.g}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- the page ---------------------------------------------- */

export default function StackMap() {
  return (
    <div style={s('font-family:' + FONT + ';color:' + P.ink + ';')}>
      <Stats />
      <Figure n="1" title="The layers" note="browser down to the things outside the practice">
        <Layers />
      </Figure>
      <Figure n="2" title="One turn" note="what happens between typing and the card">
        <Turn />
      </Figure>
      <Figure n="3" title="Model roles" note="eight call sites, one API key">
        <Roles />
      </Figure>
      <Figure n="4" title="The database" note="Neon Postgres · 31 tables, created on first use">
        <Database />
      </Figure>
      <Figure n="5" title="The corpus" note="how a practice document becomes a quotable chunk">
        <Corpus />
      </Figure>
      <Figure n="6" title="Dependencies" note="31 production packages, nothing else">
        <Deps />
      </Figure>
      <Figure n="7" title="How it ships" note="three lanes, one of them needs no deploy">
        <Ship />
      </Figure>
      <Figure n="8" title="Where the code is" note="lines by area">
        <Code />
      </Figure>
      <Figure n="9" title="What leaves the building" note="every outbound path, and the ones that do not exist">
        <Egress />
      </Figure>
    </div>
  );
}
