// The agent's tools.
//
// Retrieval is no longer something that happens *to* the model before it is
// asked a question — it is something the model does, on purpose, as many times
// as the question needs. That is the point of the change: a vague question can
// be searched twice with different words, a referral question can open the full
// protocol page instead of a top-K fragment, and a question the practice's own
// material does not cover can be pushed out to the web and labelled as such.
//
// Five tools:
//   search_practice       — hybrid search over practice documents + Notebook
//   list_practice_sources — the titles that exist, so the agent can aim
//   open_practice_source  — one source in full, for end-to-end processes
//   search_web            — the open internet, clearly separated from the above
//   suggest_ers_referral_route
//                         — last resort for one gap only: the e-RS Specialty and
//                           Clinic Type of a referral the Notebook does not cover
//
// Every hit is registered as evidence (see evidence.mjs) before it is handed
// back, so anything the model later cites can be checked against what a tool
// really returned.
import { tool } from 'ai';
import { z } from 'zod';
import { searchKnowledge } from '../knowledge.js';
import { knowledgeHitToDocumentChunk } from '../knowledge-context.mjs';
import { retrieve } from '../../rag/lib/store.mjs';
import { webSearch } from './web-search.mjs';
import { explainLookup, lookupErsMapping } from '../referrals/ers-lookup.js';

// How much of a source's text a search result shows. Long enough for the model
// to lift an exact sentence to quote; open_practice_source has the rest.
const SEARCH_EXCERPT = 1600;
const FULL_SOURCE = 12_000;
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'when', 'how', 'does', 'are', 'you', 'your', 'has', 'have', 'can', 'our', 'not', 'who', 'why', 'about', 'into', 'they', 'them']);

function terms(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// Lexical score for a Notebook page. Notebook pages are staff-authored working
// guidance supplied whole, not vector-indexed passages, so they are scored
// here: title hits count quadruple, and how many of the question's words the
// page covers matters more than raw frequency (a page mentioning every word
// beats one that says a single word ten times).
function lexicalScore(text, title, want) {
  if (!want.length) return 0;
  const body = String(text || '').toLowerCase();
  const head = String(title || '').toLowerCase();
  let hits = 0;
  let covered = 0;
  for (const w of want) {
    const inBody = body.split(w).length - 1;
    const inHead = head.split(w).length - 1;
    if (inBody || inHead) covered++;
    hits += Math.min(inBody, 8) + inHead * 4;
  }
  return (covered / want.length) * 10 + Math.min(hits, 40) / 40;
}

function locationOf(chunk) {
  if (chunk.view && chunk.view.page) return 'Page ' + chunk.view.page;
  if (chunk.section) return chunk.section;
  if (chunk.headingPath && chunk.headingPath.length) return chunk.headingPath.join(' › ');
  return 'Document';
}

function tidy(text) {
  return String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// Build the tool set for one request. `notebookChunks` are the live Notebook
// pages, already loaded; `onEvent` streams tool activity to the browser.
export function createTools({ apiKey, searchModel, notebookChunks = [], evidence, onEvent }) {
  const notify = (event) => { try { onEvent && onEvent(event); } catch (e) { /* the stream is best-effort */ } };
  const callId = (prefix) => prefix + ':' + Math.random().toString(36).slice(2, 8);

  // Documents come from the canonical knowledge store when it is available and
  // the committed index otherwise, exactly as the previous pipeline did.
  async function searchDocuments(query, limit) {
    try {
      const hits = await searchKnowledge(query, limit, { kind: 'content' });
      if (hits.length) return hits.map(knowledgeHitToDocumentChunk);
    } catch (e) { /* fall through to the committed index */ }
    try { return await retrieve(query, limit); } catch (e) { return []; }
  }

  function searchNotebook(query, limit) {
    const want = terms(query);
    return notebookChunks
      .map((chunk) => ({ chunk, score: lexicalScore(chunk.text, chunk.docTitle, want) }))
      .filter((row) => row.score > 1) // at least ~10% of the question's words present
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((row) => row.chunk);
  }

  // One practice lookup: search both channels, register what came back as
  // evidence, and report it on the stream. Shared by the search_practice tool
  // and by the web tool's guard below.
  async function practiceLookup(query, scope = 'all', limit = 5) {
    const id = callId('practice');
    notify({ type: 'tool-start', id, tool: 'search_practice', label: 'Searching practice documents', detail: query });

    const [docs, notes] = await Promise.all([
      scope === 'notebook' ? Promise.resolve([]) : searchDocuments(query, limit),
      scope === 'documents' ? Promise.resolve([]) : Promise.resolve(searchNotebook(query, limit)),
    ]);

    // Notebook guidance is the practice's live working instruction, so it leads
    // the list when both channels match the same question.
    const found = notes.concat(docs).slice(0, limit + 2);
    const sources = found.map((chunk) => {
      const ref = evidence.addPractice(chunk);
      const text = tidy(chunk.text);
      return {
        ref,
        title: chunk.docTitle,
        location: locationOf(chunk),
        kind: chunk.kind === 'notebook' ? 'Notebook (staff guidance)' : 'Practice document',
        text: text.length > SEARCH_EXCERPT
          ? text.slice(0, SEARCH_EXCERPT) + '\n[…truncated — use open_practice_source for the whole thing]'
          : text,
      };
    }).filter((s) => s.ref);

    notify({
      type: 'tool-result',
      id,
      tool: 'search_practice',
      summary: sources.length ? `${sources.length} source${sources.length === 1 ? '' : 's'} found` : 'Nothing found',
      items: sources.map((s) => ({ label: s.title, sub: s.location, ref: s.ref })),
    });
    return sources;
  }

  const search_practice = tool({
    description:
      "Search The Riverside Practice's own material: its policy and procedure documents and the staff Notebook. "
      + 'This is the authoritative source and should be tried first, usually more than once with different wording. '
      + 'Returns numbered sources (P1, P2, …) whose text you may quote verbatim.',
    inputSchema: z.object({
      query: z.string().describe('What to search for. Use the words a staff member would use, not a whole sentence.'),
      scope: z.enum(['all', 'documents', 'notebook']).default('all')
        .describe('Restrict the search. "notebook" is staff-written working guidance; "documents" are formal policies.'),
      limit: z.number().int().min(1).max(8).default(5).describe('How many sources to return.'),
    }),
    execute: async ({ query, scope = 'all', limit = 5 }) => {
      const sources = await practiceLookup(query, scope, limit);
      if (!sources.length) {
        return { sources: [], note: 'The practice material has nothing matching that. Try different words, or search the web and say clearly that the answer is not from practice material.' };
      }
      return { sources };
    },
  });

  const list_practice_sources = tool({
    description:
      'List the titles of the practice Notebook pages that exist, so you can pick one to open in full. '
      + 'Use when a search returns fragments and you need to know what whole pages are available.',
    inputSchema: z.object({
      filter: z.string().default('').describe('Optional word to filter titles by, e.g. "referral".'),
    }),
    execute: async ({ filter = '' }) => {
      const id = callId('list');
      notify({ type: 'tool-start', id, tool: 'list_practice_sources', label: 'Listing practice sources', detail: filter });
      const want = String(filter || '').toLowerCase().trim();
      const titles = notebookChunks
        .map((c) => ({ title: c.docTitle, kind: 'Notebook (staff guidance)' }))
        .filter((t) => !want || t.title.toLowerCase().includes(want));
      notify({
        type: 'tool-result',
        id,
        tool: 'list_practice_sources',
        summary: `${titles.length} page${titles.length === 1 ? '' : 's'}`,
        items: titles.slice(0, 12).map((t) => ({ label: t.title, sub: '' })),
      });
      return { sources: titles, note: 'Use open_practice_source with an exact title to read one in full. Documents are reached through search_practice.' };
    },
  });

  const open_practice_source = tool({
    description:
      'Read one practice source in full, by title. Use this when the process runs across several sections and a search '
      + 'result only gave you the middle of it — an answer must set out the whole process, not a fragment.',
    inputSchema: z.object({
      title: z.string().describe('The source title, as shown by search_practice or list_practice_sources.'),
    }),
    execute: async ({ title }) => {
      const id = callId('open');
      notify({ type: 'tool-start', id, tool: 'open_practice_source', label: 'Opening source', detail: title });
      const want = String(title || '').toLowerCase().trim();
      const match = notebookChunks.find((c) => String(c.docTitle || '').toLowerCase() === want)
        || notebookChunks.find((c) => String(c.docTitle || '').toLowerCase().includes(want));
      if (!match) {
        notify({ type: 'tool-result', id, tool: 'open_practice_source', summary: 'Not found', items: [] });
        return { found: false, note: 'No source with that title. Use list_practice_sources to see what exists.' };
      }
      const ref = evidence.addPractice(match);
      const text = tidy(match.text).slice(0, FULL_SOURCE);
      notify({
        type: 'tool-result',
        id,
        tool: 'open_practice_source',
        summary: 'Opened in full',
        items: [{ label: match.docTitle, sub: text.length + ' characters', ref }],
      });
      return { found: true, source: { ref, title: match.docTitle, location: locationOf(match), kind: 'Notebook (staff guidance)', text } };
    },
  });

  const search_web = tool({
    description:
      'Search the open internet (NHS, NICE, GOV.UK and similar). Use ONLY after the practice material has been searched '
      + 'and did not answer the question. Web findings are NOT practice policy: anything you write from them must be '
      + 'marked as coming from the web and cite the returned W-reference.',
    inputSchema: z.object({
      query: z.string().describe('The web search query.'),
    }),
    execute: async ({ query }) => {
      // The practice's own material always gets first refusal, even when the
      // model is sure the question is a general one. Enforced here rather than
      // left to the prompt: a national rule the practice has written its own
      // version of must not be answered from a web page.
      if (!evidence.practiceCount) await practiceLookup(query, 'all', 5);

      const id = callId('web');
      notify({ type: 'tool-start', id, tool: 'search_web', label: 'Searching the web', detail: query });
      const { ok, summary, results, reason } = await webSearch({ apiKey, model: searchModel, query });
      const sources = results.map((r) => {
        const ref = evidence.addWeb(r);
        return { ref, title: r.title, url: r.url, extract: r.snippet };
      }).filter((s) => s.ref);
      notify({
        type: 'tool-result',
        id,
        tool: 'search_web',
        summary: ok
          ? (sources.length ? `${sources.length} page${sources.length === 1 ? '' : 's'} found` : 'Nothing usable found')
          : (reason || 'Web search unavailable'),
        items: sources.map((s) => ({ label: s.title, sub: s.url, ref: s.ref, url: s.url })),
      });
      if (!ok) return { ok: false, sources: [], note: reason || 'Web search is unavailable. Say so rather than answering from memory.' };
      return { ok: true, summary, sources, note: 'These are web pages, not practice policy. Mark anything taken from them as coming from the web.' };
    },
  });

  // LAST RESORT, for one specific gap: which Specialty and Clinic Type a
  // referral goes under when the practice's own material does not say. It is
  // deliberately not a search tool — it can answer nothing else — and what it
  // returns is marked a suggestion so it cannot be passed off as practice policy.
  const suggest_ers_referral_route = tool({
    description:
      'Suggest the e-RS Specialty and Clinic Type for a referral by matching the clinical condition against the list of referral types e-RS accepts. '
      + 'USE ONLY AFTER search_practice and open_practice_source have failed to find the speciality and clinic type in the practice Notebook — the Notebook is always right and always comes first. '
      + 'What this returns is matched from a list, NOT practice policy: say so in the answer, and tell the reader to confirm it against the doctor’s task before sending.',
    inputSchema: z.object({
      notes: z.string().describe('The referral notes, or the condition being referred, in the words used — e.g. "2ww suspected skin cancer" or "chronic knee pain".'),
    }),
    execute: async ({ notes }) => {
      const id = callId('ers');
      notify({ type: 'tool-start', id, tool: 'suggest_ers_referral_route', label: 'Matching the e-RS referral types', detail: notes });
      let result;
      try {
        result = await lookupErsMapping(notes);
      } catch (e) {
        notify({ type: 'tool-result', id, tool: 'suggest_ers_referral_route', summary: 'Referral-type lookup unavailable', items: [] });
        return { ok: false, note: 'The e-RS referral-type lookup is unavailable. Take the speciality and clinic type from the doctor’s task, and say the practice material does not record them.' };
      }
      const chosen = result.suggestion;
      notify({
        type: 'tool-result',
        id,
        tool: 'suggest_ers_referral_route',
        summary: chosen
          ? `${chosen.specialty}${chosen.clinicType ? ' / ' + chosen.clinicType : ' (no clinic type)'}`
          : 'No confident match',
        items: [
          ...(result.matched ? [{ label: result.matched.term, sub: 'SNOMED ' + result.matched.conceptId }] : []),
          ...result.alternatives.map((a) => ({ label: `${a.specialty} / ${a.clinicType}`, sub: 'alternative' })),
        ],
      });
      return {
        ok: true,
        isSuggestion: true,
        eRS_Specialty: chosen ? chosen.specialty : null,
        eRS_Clinic_Type: chosen ? chosen.clinicType : null,
        confidence: Number(result.confidence.toFixed(2)),
        snomed: result.matched,
        cancerReferral: result.cancer,
        alternatives: result.alternatives,
        explanation: explainLookup(result),
        note: 'Matched from the e-RS referral-types list, not from the practice’s own material. Present it as a suggestion to check against the doctor’s task, never as what the practice does. If the Notebook records a speciality and clinic type for this referral, use the Notebook and ignore this.',
      };
    },
  });

  return { search_practice, list_practice_sources, open_practice_source, search_web, suggest_ers_referral_route };
}
