'use client';

import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * /diagram — a plain-English map of the whole stack.
 *
 * One screen that shows every moving part of the Riverside assistant and
 * how a question flows through it: browser → server → search the
 * practice's own knowledge → LLM wording → verify → answer. Meant to be
 * readable at a glance by non-technical staff, so it uses labelled boxes
 * and down-arrows rather than any diagramming library.
 * ------------------------------------------------------------------ */

const BLUE = '#005eb8';
const INK = '#212b32';
const MUTED = '#4c6272';
const LINE = '#c3d0d6';

/* A titled box in the flow. `tone` picks the accent colour. */
function Box({ tone = 'plain', kicker, title, children, style }) {
  const tones = {
    plain: { bg: '#fff', border: '#d8e1e5', accent: MUTED },
    blue: { bg: '#f0f6fb', border: '#9dc3e6', accent: BLUE },
    green: { bg: '#effaf2', border: '#a7d8b6', accent: '#006644' },
    amber: { bg: '#fff8ec', border: '#e8cf9a', accent: '#8a6100' },
    ink: { bg: '#212b32', border: '#212b32', accent: '#fff' },
  };
  const t = tones[tone] || tones.plain;
  const dark = tone === 'ink';
  return (
    <div style={s(`background:${t.bg};border:1px solid ${t.border};border-radius:12px;padding:16px 18px;${style || ''}`)}>
      {kicker && (
        <div style={s(`font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${t.accent};margin-bottom:4px;`)}>{kicker}</div>
      )}
      {title && (
        <div style={s(`font-size:17px;font-weight:700;color:${dark ? '#fff' : INK};`)}>{title}</div>
      )}
      {children && (
        <div style={s(`font-size:14.5px;line-height:1.5;color:${dark ? '#cfd8dd' : MUTED};margin-top:6px;`)}>{children}</div>
      )}
    </div>
  );
}

/* A downward connector with an optional label on the line. */
function Down({ label }) {
  return (
    <div style={s('display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 0;')}>
      {label && <div style={s(`font-size:12.5px;font-weight:600;color:${MUTED};`)}>{label}</div>}
      <Svg w={22} sw={2} style={s(`color:${LINE};`)}><line x1="12" y1="4" x2="12" y2="19" /><polyline points="6 13 12 19 18 13" /></Svg>
    </div>
  );
}

/* Small numbered step marker used inside the engine card. */
function Step({ n, title, children }) {
  return (
    <div style={s('display:flex;gap:12px;align-items:flex-start;')}>
      <div style={s(`flex:none;width:26px;height:26px;border-radius:50%;background:${BLUE};color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;`)}>{n}</div>
      <div style={s('flex:1;min-width:0;')}>
        <div style={s(`font-size:15.5px;font-weight:700;color:${INK};`)}>{title}</div>
        <div style={s(`font-size:14px;line-height:1.5;color:${MUTED};margin-top:2px;`)}>{children}</div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="How the system works" />

      <main style={s('flex:1;width:100%;max-width:820px;margin:0 auto;padding:40px 24px 64px;')}>
        <Hover tag={Link} href="/"
          base={`display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:600;color:${MUTED};text-decoration:none;margin-bottom:18px;`}
          hover={`color:${BLUE};`}>
          <Svg w={17} sw={2.2}>{Icons.arrowLeft}</Svg>All practice tools
        </Hover>

        <h1 style={s('font-size:32px;margin:0 0 4px;letter-spacing:-0.02em;')}>How the system works</h1>
        <p style={s(`font-size:17px;color:${MUTED};margin:0 0 30px;max-width:64ch;`)}>
          A simple map of every part of the assistant and how a question travels
          through it. Nothing is made up — every answer is built from the
          practice&rsquo;s own documents and notes, and checked before it&rsquo;s shown.
        </p>

        {/* -------- The live request flow (top to bottom) -------- */}
        <Box tone="blue" kicker="1 · Staff" title="The browser (what you see)">
          The React web app: <strong>Ask a practice question</strong>,{' '}
          <strong>Find a phone number</strong>, the <strong>Notebook</strong> and
          the other tools. Your question is all that leaves the page — no keys or
          knowledge live here.
        </Box>

        <Down label="a question, over HTTPS" />

        <Box tone="plain" kicker="2 · Next.js server" title="API routes  ·  POST /api/ask">
          The app&rsquo;s own backend. It receives the question and runs the answer
          engine below. All secrets (API keys) and knowledge stay here on the
          server, never in the browser.
        </Box>

        <Down />

        {/* The engine — the four steps that build every answer */}
        <div style={s(`background:#fff;border:1px solid #d8e1e5;border-radius:14px;padding:22px 22px 24px;box-shadow:0 1px 2px rgba(33,43,50,.05);`)}>
          <div style={s(`font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${BLUE};margin-bottom:14px;`)}>3 · The answer engine</div>
          <div style={s('display:flex;flex-direction:column;gap:16px;')}>
            <Step n="1" title="Search the practice's own knowledge">
              Find the passages most relevant to the question from the three
              sources below.
            </Step>

            {/* Three knowledge sources sit inside step 1 */}
            <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:2px 0 2px 38px;')}>
              <Box tone="green" kicker="Documents" title="Top passages"
                style="padding:13px 15px;">
                Practice documents, ranked by keyword <em>and</em> meaning
                (full-text + vector search). The best few passages.
              </Box>
              <Box tone="green" kicker="Notebook" title="Every page, in full"
                style="padding:13px 15px;">
                All non-empty <Link href="/notebook" style={s(`color:${BLUE};`)}>Notebook</Link>{' '}
                pages, read live and included whole — never trimmed.
              </Box>
              <Box tone="green" kicker="Contacts" title="Matching numbers"
                style="padding:13px 15px;">
                The phone directory. Numbers and emails are shown exactly, never
                written by the AI.
              </Box>
            </div>

            <Step n="2" title="Word the answer (the LLM)">
              The found passages are handed to the language model as numbered
              <strong> Sources</strong>. It may only use those — no outside
              knowledge — and must quote the source behind every sentence.
            </Step>
            <Step n="3" title="Verify every quote">
              Back on the server, each quote is checked against the real source.
              Wrong citations are corrected; if nothing checks out, the answer
              declines rather than guess.
            </Step>
            <Step n="4" title="Decide the shape">
              A staff how-to gets a step-by-step <strong>answer</strong>; an
              incoming patient message gets <strong>triage</strong> action notes
              (urgency, who to route to, red flags). The model picks which.
            </Step>
          </div>
        </div>

        <Down label="a checked answer, with clickable citations" />

        <Box tone="blue" kicker="Back to staff" title="Answer + sources on screen"
          style="margin-bottom:34px;">
          The reply appears with every source it used, so any staff member can
          open the original document or note and see exactly where it came from.
        </Box>

        {/* -------- The pieces the flow depends on -------- */}
        <h2 style={s(`font-size:15px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MUTED};margin:0 0 14px;`)}>What it runs on</h2>
        <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:34px;')}>
          <Box tone="amber" kicker="Data store" title="PostgreSQL (Neon)">
            Holds the documents and their embeddings, the Notebook pages, the
            contacts directory and the knowledge layer.
          </Box>
          <Box tone="amber" kicker="External AI" title="OpenRouter">
            Runs the chat / vision model that words answers and the embedding
            model used for search. Reached only from the server.
          </Box>
        </div>

        {/* -------- Offline pipeline -------- */}
        <h2 style={s(`font-size:15px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MUTED};margin:0 0 14px;`)}>Prepared ahead of time</h2>
        <Box tone="ink" title="RAG ingest pipeline">
          <span style={s('color:#cfd8dd;')}>
            Separately from live questions, each document in{' '}
            <code style={s('color:#fff;background:#31404a;padding:1px 6px;border-radius:5px;font-size:13px;')}>rag/sources/</code>{' '}
            is parsed (including reading images and PDF pages), cut into chunks,
            turned into embeddings and saved to Postgres. Only changed documents
            are re-processed. This is what the search in step 1 reads from.
          </span>
        </Box>

        <p style={s(`font-size:13.5px;color:${MUTED};margin:28px 0 0;line-height:1.5;`)}>
          In one line: a deterministic search finds the exact practice text, the
          LLM only rephrases it, and a quote check sits between them — so answers
          are readable, grounded and fully traceable.
        </p>
      </main>
    </div>
  );
}
