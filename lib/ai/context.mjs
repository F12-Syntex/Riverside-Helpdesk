// Supplementary context — extra practice notes read at REQUEST TIME (not baked
// into the build), so they can be edited without a Vercel redeploy. The main
// source is the in-app Notebook (Postgres), wired in separately by lib/notebook.js.
// This module covers two optional extra sources:
//
//   • URLs   — any direct text/markdown/JSON URLs in SUPPLEMENTARY_CONTEXT_URLS.
//   • Local  — text files committed under rag/context/ (a baseline; changing
//     these DOES need a redeploy, unlike the Notebook and URLs).
//
// Whatever is gathered is split into chunks; selectSupplementarySources() picks
// the ones relevant to a query, which the API route appends as extra numbered
// Sources after the knowledge-base chunks. Because they are Sources, the model
// must quote them and the server verifies the quote — the same grounding every
// answer gets. The Notebook reuses selectSupplementarySources() for the same effect.
//
// Everything here is best-effort and never fatal: a slow or failing source is
// skipped (serving the last good copy if we have one) so triage still works.

import fs from 'node:fs/promises';
import path from 'node:path';
import { chunkText, chunkHeading } from '@/lib/text-chunk.mjs';

const TTL_MS = (parseInt(process.env.SUPPLEMENTARY_CONTEXT_TTL || '', 10) || 300) * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES_PER_SOURCE = 200_000;   // ~200 KB per source
const TEXT_EXT = /\.(md|markdown|txt|text|json|csv|tsv|ya?ml)$/i;

function envList(name) {
  return (process.env[name] || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'note';
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { redirect: 'follow', ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url, opts) {
  try {
    const res = await fetchWithTimeout(url, opts);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const sliced = buf.byteLength > MAX_BYTES_PER_SOURCE ? buf.slice(0, MAX_BYTES_PER_SOURCE) : buf;
    return new TextDecoder('utf-8').decode(sliced);
  } catch (e) {
    return null;
  }
}

// ---- HTML -> text (for URL sources that return a web page) ------------------
export function htmlToText(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|table|ul|ol|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---- Generic URL and local-folder sources ----------------------------------
function nameFromUrl(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(last || u.hostname);
  } catch (e) {
    return 'context';
  }
}

async function urlEntries() {
  const out = [];
  for (const url of envList('SUPPLEMENTARY_CONTEXT_URLS')) {
    const text = await fetchText(url);
    if (text) out.push({ name: nameFromUrl(url), text: /</.test(text) && /<[a-z]+[\s>]/i.test(text) ? htmlToText(text) : text, origin: 'URL' });
  }
  return out;
}

async function localEntries() {
  const dir = process.env.SUPPLEMENTARY_CONTEXT_LOCAL_DIR || 'rag/context';
  const abs = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  try {
    const files = await fs.readdir(abs);
    const out = [];
    for (const f of files.sort()) {
      if (!TEXT_EXT.test(f) || /^readme/i.test(f)) continue;
      try {
        const text = await fs.readFile(path.join(abs, f), 'utf8');
        if (text.trim()) out.push({ name: f, text, origin: 'local' });
      } catch (e) { /* skip unreadable file */ }
    }
    return out;
  } catch (e) {
    return [];
  }
}

// ---- Cache -----------------------------------------------------------------
let _cache = { at: 0, entries: [] };
let _inflight = null;

async function loadFresh() {
  const groups = await Promise.all([
    localEntries().catch(() => []),
    urlEntries().catch(() => []),
  ]);
  return groups.flat();
}

// Cached list of raw entries ({ name, text, origin }). Revalidates after the TTL;
// serves the previous copy if a refresh fails, so a flaky source is never fatal.
export async function getSupplementaryEntries() {
  const now = Date.now();
  if (_cache.entries.length && now - _cache.at < TTL_MS) return _cache.entries;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const fresh = await loadFresh();
      if (fresh.length || !_cache.entries.length) _cache = { at: Date.now(), entries: fresh };
      else _cache = { at: Date.now(), entries: _cache.entries }; // keep stale on empty refresh
    } catch (e) {
      _cache = { at: Date.now(), entries: _cache.entries };
    } finally {
      _inflight = null;
    }
    return _cache.entries;
  })();
  return _inflight;
}

// ---- Chunking + relevance selection ----------------------------------------
// Chunking itself (split + pack to ~900 chars, cap 1500) and heading labels
// live in lib/text-chunk.mjs, shared with the Notebook's own chunker.
const toSections = chunkText;
const headingOf = chunkHeading;

function tokenize(s) {
  return (String(s).toLowerCase().match(/[a-z0-9]{3,}/g) || []);
}

function overlapScore(text, qset) {
  const seen = new Set();
  let n = 0;
  for (const tok of tokenize(text)) {
    if (qset.has(tok) && !seen.has(tok)) { seen.add(tok); n++; }
  }
  return n;
}

// Turn the raw entries into ready-to-number Source objects for this query.
// Small entries (<= 1500 chars) are treated as standing instructions and always
// included (within a budget); larger entries are chunked and only their chunks
// that overlap the query are included, ranked by overlap. Bounded in count and
// characters so the prompt stays lean even with a large notebook.
export function selectSupplementarySources(entries, query, opts = {}) {
  const { alwaysBudget = 3000, rankMaxChunks = 4, rankBudget = 5000, maxTotal = 8 } = opts;
  const always = [];
  const big = [];
  for (const e of entries) {
    const text = String(e.text || '').trim();
    if (!text) continue;
    if (text.length <= 1500) {
      always.push({ name: e.name, section: 'Note', text });
    } else {
      toSections(text).forEach((t, i) => big.push({ name: e.name, section: headingOf(t, i), text: t }));
    }
  }

  const qset = new Set(tokenize(query));
  const ranked = big
    .map((c) => ({ c, score: overlapScore(c.text, qset) }))
    .sort((a, b) => b.score - a.score);

  const chosen = [];
  let usedAlways = 0;
  for (const c of always) {
    if (chosen.length >= maxTotal) break;
    if (usedAlways + c.text.length > alwaysBudget) continue;
    chosen.push(c); usedAlways += c.text.length;
  }
  let usedRank = 0;
  let n = 0;
  for (const { c, score } of ranked) {
    if (chosen.length >= maxTotal || n >= rankMaxChunks) break;
    if (score <= 0) break; // only inject large-doc chunks that actually match
    if (usedRank + c.text.length > rankBudget) continue;
    chosen.push(c); usedRank += c.text.length; n++;
  }

  return chosen.map((c, i) => ({
    docId: 'supp-' + slug(c.name) + '-' + i,
    docTitle: 'Practice note: ' + c.name,
    section: c.section,
    text: c.text,
  }));
}

// Convenience: load (cached) then select for a query. The API route calls this.
export async function supplementarySourcesFor(query) {
  const entries = await getSupplementaryEntries();
  if (!entries.length) return [];
  return selectSupplementarySources(entries, query || '');
}
