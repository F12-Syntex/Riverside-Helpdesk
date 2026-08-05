// The agent's tools.
//
// Retrieval is no longer something that happens *to* the model before it is
// asked a question — it is something the model does, on purpose, as many times
// as the question needs. That is the point of the change: a vague question can
// be searched twice with different words, a referral question can open the full
// protocol page instead of a top-K fragment, and a question the practice's own
// material does not cover can be pushed out to the web and labelled as such.
//
// Documents are no longer fetched by embedding. The model picks the file it
// wants from a catalogue and opens it, exactly as it already picks a Notebook
// page — which is both more predictable and easier to explain when an answer is
// wrong ("it never opened the referrals protocol" beats "the vectors missed").
// Full-text search stays, but its job is now to point at a title rather than to
// be the only way content is ever reached.
//
// Documents are big, so they are read a part at a time and the parsed file is
// cached between calls: the cost of opening the wrong one is a page, not a turn.
// Notebook pages are staff-written working guidance and short, so they still
// come back whole.
//
// EVERY TOOL TAKES A LIST. A model that has decided it needs three wordings of
// a search, or the four documents it has just listed, should not spend three or
// four steps of a bounded loop getting them one at a time — each of those steps
// is a whole model call made only to ask for something it had already worked
// out. So searching, opening, outlining, reading web pages and looking up
// contacts all take an array and run it in one go. Asking for one thing is
// asking for a list of one.
//
// The tools:
//   search_practice       — full-text search over practice documents, the
//                           Notebook and the EMIS guides, several wordings at once
//   list_practice_sources — everything that exists, so the agent can choose
//   outline_practice_sources
//                         — a document's headings WITHOUT its text, so the right
//                           part can be opened without paying for the wrong one
//   open_practice_sources — Notebook pages and guides whole, documents a part at
//                           a time, several sources at once
//   search_web            — the open internet, clearly separated from the above
//   read_web_page         — one page the search named, read properly rather than
//                           by its snippet
//   find_contact          — an actual telephone number or email address, from the
//                           practice directory, the CQC register or a page read
//                           off the web — never one a model wrote
//   check_rota            — who is actually working, from the saved rota
//   suggest_ers_referral_route
//                         — last resort for one gap only: the e-RS Specialty and
//                           Clinic Type of a referral the Notebook does not cover
//
// Every hit is registered as evidence (see evidence.mjs) before it is handed
// back, so anything the model later cites can be checked against what a tool
// really returned.
import { tool } from 'ai';
import { z } from 'zod';
import { knowledgeEntryPassages, listKnowledgeDocuments, searchKnowledge, unifiedContacts } from '../knowledge.js';
import { knowledgeHitToDocumentChunk } from '../knowledge-context.mjs';
import { matchContacts } from '../contacts.js';
import { searchCqc } from '../lookup/cqc.js';
import { fetchPageHtml, findWebContacts } from '../lookup/web-contact.mjs';
import { htmlToText } from '../lookup/contact-extract.mjs';
import { webSearch } from './web-search.mjs';
import { explainLookup, lookupErsMapping } from '../referrals/ers-lookup.js';
import { SEED_GUIDES } from '../guides/seed.js';
import { ensureSchema, getSql } from '../db.js';
import { currentMonday, isoOf, shiftRange, weekDays, weekRangeLabel } from '../rota/logic.js';

// How much of a source's text a search result shows. Long enough for the model
// to lift an exact sentence to quote; open_practice_source has the rest.
const SEARCH_EXCERPT = 1600;
// A Notebook page is short and is opened whole. A document is not: the practice's
// policies run to tens of thousands of characters, and pushing one into the
// prompt to reach two paragraphs of it is how a turn runs out of room.
const FULL_SOURCE = 12_000;
const DOCUMENT_PART = 6_000;
// A summary is there to help the model choose a file, not to be read for content.
const SUMMARY_EXCERPT = 160;
// How much of a web page is kept when one is read in full. A "contact us" page
// or an NHS guidance page says what it has to say well inside this; the cap is
// there so one enormous page cannot swallow the turn.
const WEB_PAGE_CHARS = 5_000;
// How many things one call may ask for. Generous enough that a model never has
// to split what it already knows it wants, bounded so a bad list cannot open
// the whole library.
const MAX_BATCH = 6;
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

const titleKey = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();

// The EMIS Web guides as sources.
//
// Twenty-odd step-by-step guides ship with the app, screenshots and all, and
// until now the agent could not see one of them: "how do I register a patient"
// was answered from whatever policy prose happened to mention registration
// while a guide written for exactly that question sat unread. They are staff
// instruction like a Notebook page, so they are treated as one — searchable,
// listable, openable by title — rather than bolted on as a special case.
//
// A guide is always whole: its steps are numbered and a receptionist follows
// them in order, so half of one is worse than none.
function guideChunk(guide) {
  const steps = (guide.steps || []).map((st, i) => `${i + 1}. ${String(st.text || '').trim()}`).filter((line) => line.length > 3);
  const text = [
    String(guide.intro || '').trim(),
    steps.join('\n'),
    guide.tip ? `Tip: ${guide.tip}` : '',
    guide.warning ? `Important: ${guide.warning}` : '',
  ].filter(Boolean).join('\n\n');
  return {
    id: `guide:${guide.id}`,
    docId: `guide:${guide.id}`,
    docTitle: `EMIS Web guide: ${guide.question}`,
    text,
    section: 'Step-by-step guide',
    view: null,
    // The screenshots belong to the steps, and are carried so the answer that
    // cites the guide can show the reader the screen it is talking about.
    images: (guide.steps || []).map((st) => st.image).filter(Boolean).slice(0, 4),
    kind: 'guide',
    // Not shown to the model as text; used only to score the guide against a
    // question worded the way staff actually word it.
    keywords: (guide.keywords || []).join(' '),
  };
}

// Pack a document's stored passages into readable parts, never splitting a
// passage across two. A part is what one open_practice_source call returns:
// large enough to follow a process from beginning to end, small enough that
// opening the wrong file costs a page rather than the whole context window.
function packDocumentParts(entryId, passages) {
  const parts = [];
  let current = null;
  const close = () => { if (current && current.text.trim()) parts.push(current); current = null; };

  for (const passage of passages) {
    const body = tidy(passage.content);
    if (!body) continue;
    const heading = String(passage.heading || '').trim();
    if (current && current.text.length + body.length + 2 > DOCUMENT_PART) close();
    if (!current) {
      // The location carries what the document viewer needs to jump to this
      // spot — the PDF page, the HTML anchor — so it is kept with the part it
      // opens, not thrown away when the passages are joined.
      const { images: _ignored, source: _source, ...view } = passage.location || {};
      current = {
        heading: heading || `Part ${parts.length + 1}`,
        text: '',
        view: (view.kind || view.url) ? view : null,
        images: [],
      };
    }
    current.text += (current.text ? '\n\n' : '') + (heading ? `## ${heading}\n${body}` : body);
    for (const url of Array.isArray(passage.location?.images) ? passage.location.images : []) {
      if (current.images.length < 4 && !current.images.includes(url)) current.images.push(url);
    }
  }
  close();
  return parts.map((part, i) => ({ ...part, index: i + 1, id: `${entryId}:part${i + 1}` }));
}

// The parsed parts of one document, kept between calls and between turns and
// revalidated against the row's updated_at. Reading part three after part two,
// or the same protocol on the next question, costs no parsing and no database
// round trip: it is the FILE that is cached, never the prompt.
const DOCUMENT_CACHE_MAX = 24;
const documentCache = new Map();

async function loadDocumentParts(doc) {
  const stamp = String(doc.updatedAt || '');
  const cached = documentCache.get(doc.id);
  if (cached && cached.stamp === stamp) {
    documentCache.delete(doc.id);
    documentCache.set(doc.id, cached); // re-insert so the eviction order stays honest
    return cached;
  }
  const passages = await knowledgeEntryPassages(doc.id);
  const loaded = { stamp, title: doc.title, parts: packDocumentParts(doc.id, passages) };
  documentCache.set(doc.id, loaded);
  while (documentCache.size > DOCUMENT_CACHE_MAX) documentCache.delete(documentCache.keys().next().value);
  return loaded;
}

// Build the tool set for one request. `notebookChunks` are the live Notebook
// pages, already loaded; `onEvent` streams tool activity to the browser.
export function createTools({ apiKey, searchModel, notebookChunks = [], evidence, onEvent, contacts = [], onUsage, customGuides = [] }) {
  // The shipped guides plus anything the practice has written itself, prepared
  // once per request rather than per search.
  const guideChunks = SEED_GUIDES.concat(Array.isArray(customGuides) ? customGuides : [])
    .filter((g) => g && g.question && Array.isArray(g.steps) && g.steps.length)
    .map(guideChunk);
  const notify = (event) => { try { onEvent && onEvent(event); } catch (e) { /* the stream is best-effort */ } };
  // What the web role spent, when it ran. Reported rather than returned: a tool
  // hands its result to the model, and this is for the books, not the answer.
  const meter = (role, model, usage) => { try { onUsage && usage && onUsage(role, model, usage); } catch (e) { /* never fail a tool over accounting */ } };
  const callId = (prefix) => prefix + ':' + Math.random().toString(36).slice(2, 8);

  // The document catalogue, fetched once per request. It is read to answer
  // list_practice_sources and again to resolve a title in open_practice_source,
  // and it does not change under a single turn.
  let documentList = null;
  async function documents() {
    if (!documentList) documentList = listKnowledgeDocuments().catch(() => []);
    return documentList;
  }

  // Full-text search over the practice's documents. Notebook pages are scored
  // separately below, from the copies already loaded in memory, so this asks
  // only for documents rather than returning every Notebook page twice.
  async function searchDocuments(query, limit) {
    try {
      const hits = await searchKnowledge(query, limit, { kind: 'document' });
      return hits.map(knowledgeHitToDocumentChunk);
    } catch (e) { return []; }
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

  // Guides are scored on their keywords as well as their text: a guide is
  // written against one task and its author has already listed the words staff
  // use for it ("log on", "smartcard", "sign in"), which is exactly the gap a
  // word search otherwise falls into.
  function searchGuides(query, limit) {
    const want = terms(query);
    return guideChunks
      .map((chunk) => ({ chunk, score: lexicalScore(chunk.text + ' ' + chunk.keywords, chunk.docTitle, want) }))
      .filter((row) => row.score > 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((row) => row.chunk);
  }

  const kindLabel = (kind) => (kind === 'notebook' ? 'Notebook (staff guidance)'
    : kind === 'guide' ? 'EMIS Web guide (step-by-step)'
      : 'Practice document');

  // One practice lookup: search all three channels, register what came back as
  // evidence, and report it on the stream. Shared by the search_practice tool
  // and by the web tool's guard below.
  async function practiceLookup(query, scope = 'all', limit = 5) {
    const id = callId('practice');
    notify({ type: 'tool-start', id, tool: 'search_practice', label: 'Searching practice documents', detail: query });

    const [docs, notes, guides] = await Promise.all([
      scope === 'all' || scope === 'documents' ? searchDocuments(query, limit) : Promise.resolve([]),
      scope === 'all' || scope === 'notebook' ? Promise.resolve(searchNotebook(query, limit)) : Promise.resolve([]),
      scope === 'all' || scope === 'guides' ? Promise.resolve(searchGuides(query, limit)) : Promise.resolve([]),
    ]);

    // Notebook guidance is the practice's live working instruction, so it leads
    // the list when several channels match the same question.
    const found = notes.concat(guides, docs).slice(0, limit + 2);
    const sources = found.map((chunk) => {
      const ref = evidence.addPractice(chunk);
      const text = tidy(chunk.text);
      return {
        ref,
        title: chunk.docTitle,
        location: locationOf(chunk),
        kind: kindLabel(chunk.kind),
        text: text.length > SEARCH_EXCERPT
          ? text.slice(0, SEARCH_EXCERPT) + '\n[…truncated — use open_practice_sources for the whole thing]'
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
      "Search The Riverside Practice's own material: its policy and procedure documents, the staff Notebook and the "
      + 'step-by-step EMIS Web guides. This is the authoritative source and should be tried first. '
      + 'PASS SEVERAL WORDINGS AT ONCE — staff and documents use different words for the same thing, and searching '
      + '"sick note", "fit note" and "med3" together costs one step instead of three. '
      + 'Returns numbered sources (P1, P2, …) whose text you may quote verbatim.',
    inputSchema: z.object({
      queries: z.array(z.string()).min(1).max(4)
        .describe('One search per entry. Use the words a staff member would use, not whole sentences. Give every wording you would otherwise try one after another.'),
      scope: z.enum(['all', 'documents', 'notebook', 'guides']).default('all')
        .describe('Restrict the search. "notebook" is staff-written working guidance; "documents" are formal policies; "guides" are the illustrated EMIS Web walkthroughs.'),
      limit: z.number().int().min(1).max(8).default(5).describe('How many sources to return per wording.'),
    }),
    execute: async ({ queries, scope = 'all', limit = 5 }) => {
      const wanted = queries.map((q) => String(q || '').trim()).filter(Boolean).slice(0, 4);
      if (!wanted.length) return { results: [], note: 'No search terms were given.' };

      // Run together: these are database and in-memory lookups, and a model
      // that asked for four wordings should wait for the slowest, not the sum.
      const runs = await Promise.all(wanted.map((q) => practiceLookup(q, scope, limit)));

      // The same page found by two wordings is one source, not two. It keeps
      // its reference (the evidence registry already deduplicated it) and its
      // text is not repeated into the second result.
      const seen = new Set();
      const results = runs.map((sources, i) => ({
        query: wanted[i],
        sources: sources.map((s) => {
          if (seen.has(s.ref)) return { ref: s.ref, title: s.title, location: s.location, kind: s.kind, text: '(same source as above)' };
          seen.add(s.ref);
          return s;
        }),
      }));

      if (!seen.size) {
        return { results, note: 'Nothing in the practice material matches any of those words. This is a word search, not an understanding of what you meant — try the words the material itself would use, or call list_practice_sources and open the file that looks right. Only go to the web once both have failed.' };
      }
      return { results, note: 'These are excerpts. To read around one, call open_practice_sources with its title — several at once if you need several.' };
    },
  });

  const list_practice_sources = tool({
    description:
      'List everything the practice holds — its Notebook pages, its documents and its EMIS Web guides — with a '
      + 'one-line summary and the size of each document. This is how you decide WHICH file you need: read the list, '
      + 'then open the ones that cover the question with open_practice_sources. Use it whenever a search returns '
      + 'fragments, returns nothing, or you are about to conclude the practice has no material on something.',
    inputSchema: z.object({
      filter: z.string().default('').describe('Optional word to narrow the list by title or summary, e.g. "referral".'),
      kind: z.enum(['all', 'notebook', 'documents', 'guides']).default('all')
        .describe('"notebook" is staff-written working guidance; "documents" are the practice’s formal policies and protocols; "guides" are illustrated EMIS Web walkthroughs.'),
    }),
    execute: async ({ filter = '', kind = 'all' }) => {
      const id = callId('list');
      notify({ type: 'tool-start', id, tool: 'list_practice_sources', label: 'Listing practice sources', detail: filter });
      const want = titleKey(filter);
      const wants = (text) => !want || titleKey(text).includes(want);
      const notes = kind === 'all' || kind === 'notebook'
        ? notebookChunks.map((c) => ({ title: c.docTitle })).filter((t) => wants(t.title))
        : [];
      const guides = kind === 'all' || kind === 'guides'
        ? guideChunks.map((g) => ({ title: g.docTitle })).filter((g) => wants(g.title + ' ' + g.keywords))
        : [];
      const files = kind === 'all' || kind === 'documents'
        ? (await documents())
          .filter((d) => wants(d.title) || wants(d.summary))
          .map((d) => ({
            title: d.title,
            summary: String(d.summary || '').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_EXCERPT),
            // Roughly how many parts it would take to read the whole thing, so
            // the model can weigh opening it.
            parts: Math.max(1, Math.ceil(Number(d.characters || 0) / DOCUMENT_PART)),
          }))
        : [];

      notify({
        type: 'tool-result',
        id,
        tool: 'list_practice_sources',
        summary: `${notes.length} Notebook page${notes.length === 1 ? '' : 's'}, ${files.length} document${files.length === 1 ? '' : 's'}, ${guides.length} guide${guides.length === 1 ? '' : 's'}`,
        items: notes.slice(0, 6).map((t) => ({ label: t.title, sub: 'Notebook' }))
          .concat(files.slice(0, 6).map((d) => ({ label: d.title, sub: 'Document' })))
          .concat(guides.slice(0, 4).map((g) => ({ label: g.title, sub: 'Guide' }))),
      });
      return {
        notebook: notes,
        documents: files,
        guides,
        note: 'Open any of these by title with open_practice_sources, listing every one you want in a single call. A Notebook page or a guide comes back whole. A document comes back one part at a time — call outline_practice_sources first if you are not sure which part holds the answer.',
      };
    },
  });

  // Reading ONE source, by title. The shared engine under open_practice_sources:
  // the tools themselves take lists, and this is what a list is made of.
  async function openOne(title, part = 1) {
    const want = titleKey(title);

    // A Notebook page is the practice's live working instruction and is short.
    // A guide is a numbered walkthrough. Both are handed over whole — "just
    // take whatever is relevant" does not apply to something a receptionist is
    // expected to follow line by line.
    const whole = notebookChunks.find((c) => titleKey(c.docTitle) === want)
      || guideChunks.find((g) => titleKey(g.docTitle) === want)
      || notebookChunks.find((c) => titleKey(c.docTitle).includes(want))
      || guideChunks.find((g) => titleKey(g.docTitle).includes(want));
    if (whole) {
      const ref = evidence.addPractice(whole);
      const text = tidy(whole.text).slice(0, FULL_SOURCE);
      return {
        found: true,
        item: { label: whole.docTitle, sub: text.length + ' characters', ref },
        source: { ref, title: whole.docTitle, location: locationOf(whole), kind: kindLabel(whole.kind), text },
      };
    }

    const catalogue = await documents();
    const doc = catalogue.find((d) => titleKey(d.title) === want)
      || catalogue.find((d) => titleKey(d.title).includes(want))
      || catalogue.find((d) => want && titleKey(want).includes(titleKey(d.title)));
    if (!doc) {
      return {
        found: false,
        item: { label: title, sub: 'no source with that title' },
        note: `No source called "${title}". Call list_practice_sources to see exactly what exists, then use a title from it.`,
      };
    }

    const loaded = await loadDocumentParts(doc);
    if (!loaded.parts.length) {
      return {
        found: false,
        item: { label: doc.title, sub: 'no readable text' },
        note: `"${doc.title}" is in the catalogue but holds no readable text.`,
      };
    }
    const index = Math.min(Math.max(1, Math.round(Number(part) || 1)), loaded.parts.length);
    const chosen = loaded.parts[index - 1];
    const ref = evidence.addPractice({
      id: chosen.id,
      docId: doc.id,
      docTitle: doc.title,
      text: chosen.text,
      section: chosen.heading,
      view: chosen.view,
      images: chosen.images,
      kind: 'document',
    });
    return {
      found: true,
      item: { label: doc.title, sub: chosen.heading, ref },
      source: { ref, title: doc.title, location: chosen.heading, kind: 'Practice document', text: chosen.text },
      part: index,
      parts: loaded.parts.length,
      outline: loaded.parts.map((p) => `${p.index}. ${p.heading}`),
    };
  }

  const outline_practice_sources = tool({
    description:
      'Show what is IN a document — the heading and size of every part — without returning any of its text. '
      + 'Use this before opening a long document you are not certain about: it costs almost nothing and tells you '
      + 'which part to ask for, instead of paying for a part that turns out to be the wrong one. Notebook pages and '
      + 'guides have no parts (they are always returned whole), so this only reports their length.',
    inputSchema: z.object({
      titles: z.array(z.string()).min(1).max(MAX_BATCH)
        .describe('The titles to outline, exactly as list_practice_sources or search_practice gave them.'),
    }),
    execute: async ({ titles }) => {
      const wanted = titles.map((t) => String(t || '').trim()).filter(Boolean).slice(0, MAX_BATCH);
      const id = callId('outline');
      notify({ type: 'tool-start', id, tool: 'outline_practice_sources', label: 'Looking at what is in each file', detail: wanted.join(', ') });

      const catalogue = await documents();
      const outlines = [];
      for (const title of wanted) {
        const want = titleKey(title);
        const whole = notebookChunks.find((c) => titleKey(c.docTitle).includes(want))
          || guideChunks.find((g) => titleKey(g.docTitle).includes(want));
        if (whole) {
          outlines.push({ title: whole.docTitle, kind: kindLabel(whole.kind), parts: 1, characters: String(whole.text || '').length, outline: ['1. Whole page'] });
          continue;
        }
        const doc = catalogue.find((d) => titleKey(d.title) === want)
          || catalogue.find((d) => titleKey(d.title).includes(want));
        if (!doc) {
          outlines.push({ title, found: false, note: 'No source with that title.' });
          continue;
        }
        const loaded = await loadDocumentParts(doc);
        outlines.push({
          title: doc.title,
          kind: 'Practice document',
          parts: loaded.parts.length,
          characters: loaded.parts.reduce((n, p) => n + p.text.length, 0),
          outline: loaded.parts.map((p) => `${p.index}. ${p.heading} (${p.text.length} characters)`),
        });
      }

      notify({
        type: 'tool-result',
        id,
        tool: 'outline_practice_sources',
        summary: `${outlines.length} file${outlines.length === 1 ? '' : 's'} outlined`,
        items: outlines.map((o) => ({ label: o.title, sub: o.found === false ? 'not found' : `${o.parts} part${o.parts === 1 ? '' : 's'}` })),
      });
      return { outlines, note: 'No text has been read yet and none of this is a source you may quote. Call open_practice_sources for the parts you actually need.' };
    },
  });

  const open_practice_sources = tool({
    description:
      'Read practice sources by title — a Notebook page or an EMIS guide whole, or a named part of a document. '
      + 'LIST EVERY SOURCE YOU NEED IN ONE CALL: opening four files together costs one step, opening them one at a '
      + 'time costs four. Use this when a search result gave you the middle of a process and the answer has to set '
      + 'out the whole of it, and to read any document you decide is relevant whether or not a search surfaced it. '
      + 'A document is served a part at a time and every part comes with an outline of the others.',
    inputSchema: z.object({
      sources: z.array(z.object({
        title: z.string().describe('The source title, as shown by search_practice, list_practice_sources or outline_practice_sources.'),
        part: z.number().int().min(1).default(1)
          .describe('Which part of a document to read. Ignored for Notebook pages and guides, which always come back whole.'),
      })).min(1).max(MAX_BATCH).describe('Every source you want, in one call. Ask for the same document twice with different parts to read two parts of it.'),
    }),
    execute: async ({ sources }) => {
      const wanted = sources.filter((s) => s && String(s.title || '').trim()).slice(0, MAX_BATCH);
      const id = callId('open');
      notify({
        type: 'tool-start',
        id,
        tool: 'open_practice_sources',
        label: wanted.length === 1 ? 'Opening source' : `Opening ${wanted.length} sources`,
        detail: wanted.map((s) => s.title).join(', '),
      });

      const opened = [];
      for (const want of wanted) opened.push(await openOne(want.title, want.part));

      notify({
        type: 'tool-result',
        id,
        tool: 'open_practice_sources',
        summary: opened.filter((o) => o.found).length
          ? `${opened.filter((o) => o.found).length} of ${opened.length} opened`
          : 'Nothing opened',
        items: opened.map((o) => o.item),
        ok: opened.some((o) => o.found),
      });

      return {
        opened: opened.map((o) => (o.found
          ? { found: true, source: o.source, part: o.part, parts: o.parts, outline: o.outline }
          : { found: false, note: o.note })),
        note: 'Every source above carries a P-reference. Anything you still need — another part, another file — ask for in a single further call rather than one at a time.',
      };
    },
  });

  const search_web = tool({
    description:
      'Search the open internet (NHS, NICE, GOV.UK and similar). Use ONLY after the practice material has been searched '
      + 'and did not answer the question. Web findings are NOT practice policy: anything you write from them must be '
      + 'marked as coming from the web and cite the returned W-reference.',
    inputSchema: z.object({
      queries: z.array(z.string()).min(1).max(3).describe('The web searches to run. Give them all at once rather than one per step.'),
    }),
    execute: async ({ queries }) => {
      const wanted = queries.map((q) => String(q || '').trim()).filter(Boolean).slice(0, 3);
      if (!wanted.length) return { ok: false, results: [], note: 'No search terms were given.' };

      // The practice's own material always gets first refusal, even when the
      // model is sure the question is a general one. Enforced here rather than
      // left to the prompt: a national rule the practice has written its own
      // version of must not be answered from a web page.
      if (!evidence.practiceCount) await practiceLookup(wanted[0], 'all', 5);

      const runOne = async (query) => {
        const id = callId('web');
        notify({ type: 'tool-start', id, tool: 'search_web', label: 'Searching the web', detail: query });
        const { ok, summary, results, reason, usage } = await webSearch({ apiKey, model: searchModel, query });
        meter('web', searchModel, usage);
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
          // A search that could not run is not a search that found nothing; the
          // timeline marks it as a failure rather than a quiet empty result.
          ok,
        });
        return { query, ok, summary, sources, reason: ok ? '' : (reason || 'Web search is unavailable.') };
      };

      const results = await Promise.all(wanted.map(runOne));
      const anyOk = results.some((r) => r.ok);
      if (!anyOk) {
        return { ok: false, results, note: results[0].reason || 'Web search is unavailable. Say so rather than answering from memory.' };
      }
      return {
        ok: true,
        results,
        note: 'These are web pages, not practice policy — mark anything taken from them as coming from the web. '
          + 'The extracts are snippets: if the answer turns on what a page actually says, call read_web_page with its URL.',
      };
    },
  });

  // Reading a page, not skimming a search result.
  //
  // A snippet is one or two sentences a search engine thought were relevant,
  // and an answer written from snippets is an answer written from the beginnings
  // of sentences. When the question turns on what a page actually says — the
  // steps on an NHS service page, the criteria on a NICE page — the page itself
  // has to be read, and what is read is registered as the same W-reference the
  // search handed out, so the quote check still applies.
  const read_web_page = tool({
    description:
      'Read one or more web pages properly, rather than by the snippet a search returned. Use it after search_web '
      + 'when the answer depends on what a page actually says. The pages must be ones search_web returned — do not '
      + 'invent URLs. Web pages are NOT practice policy, and anything written from them must say so.',
    inputSchema: z.object({
      urls: z.array(z.string()).min(1).max(3).describe('The page URLs to read, exactly as search_web returned them.'),
      find: z.string().default('')
        .describe('Optional word or phrase to centre the extract on, e.g. "opening hours". The page is long; this returns the part of it that mentions this rather than the top of the page.'),
    }),
    execute: async ({ urls, find = '' }) => {
      const wanted = urls.map((u) => String(u || '').trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 3);
      const id = callId('read');
      notify({ type: 'tool-start', id, tool: 'read_web_page', label: 'Reading the page', detail: wanted.join(', ') });
      if (!wanted.length) {
        notify({ type: 'tool-result', id, tool: 'read_web_page', summary: 'No usable URL', items: [], ok: false });
        return { pages: [], note: 'No usable URL was given. Use a URL exactly as search_web returned it.' };
      }

      const readOne = async (url) => {
        const html = await fetchPageHtml(url);
        if (!html) return { url, ok: false, note: 'That page could not be read — it blocked us, timed out, or is not a web page.' };
        const title = (html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i) || [])[1] || url;
        const text = tidy(htmlToText(html));
        if (!text) return { url, ok: false, note: 'That page holds no readable text.' };

        // Centre the extract on what was asked for. A long page whose relevant
        // paragraph is two thirds of the way down is otherwise returned as its
        // own navigation menu.
        const needle = String(find || '').trim().toLowerCase();
        const at = needle ? text.toLowerCase().indexOf(needle) : -1;
        const from = at > WEB_PAGE_CHARS / 2 ? at - Math.floor(WEB_PAGE_CHARS / 3) : 0;
        const extract = (from ? '…' : '') + text.slice(from, from + WEB_PAGE_CHARS) + (text.length > from + WEB_PAGE_CHARS ? '…' : '');

        const ref = evidence.addWeb({ url, title: tidy(title), snippet: extract, full: true });
        return { url, ok: true, ref, title: tidy(title), text: extract, characters: text.length };
      };

      const pages = await Promise.all(wanted.map(readOne));
      const read = pages.filter((p) => p.ok);
      notify({
        type: 'tool-result',
        id,
        tool: 'read_web_page',
        summary: read.length ? `${read.length} of ${pages.length} read` : 'Could not read the page',
        items: pages.map((p) => ({ label: p.title || p.url, sub: p.ok ? `${p.characters} characters` : 'could not be read', ref: p.ref, url: p.url })),
        ok: !!read.length,
      });
      return {
        pages,
        note: read.length
          ? 'This is the page text, under its W-reference. It is general information found online, never practice policy.'
          : 'None of those pages could be read. Say what is missing rather than answering from memory.',
      };
    },
  });

  // Getting an actual number in front of the reader.
  //
  // "Ring the district nurses" is not an answer; the number is the answer. Three
  // places are tried in order of how much they can be trusted, and the first one
  // that holds a number wins:
  //
  //   1. the practice's own directory — structured data, exact, authoritative
  //   2. the CQC register — every service registered in England, verbatim from
  //      the published extract
  //   3. the open web — the page is READ and the number lifted out of it, with
  //      the host it came from carried along so the reader can judge it
  //
  // No digit on any of those paths is written by a model. What comes back is
  // shown to the reader in the contacts card, from this structured data, so it
  // cannot be mis-typed on the way through the answer.
  const find_contact = tool({
    description:
      'Find a real telephone number or email address for a service, department, team or organisation. '
      + 'Searches the practice’s own directory first, then the CQC register of every service registered in England, '
      + 'then reads the web and takes the number off the page. '
      + 'CALL THIS whenever the question asks for a number, an email address, or who to ring — and whenever the '
      + 'practice material names a service without giving its number. Never write a number from memory, and never '
      + 'answer "look it up" or "check the directory" when this tool can produce the number itself.',
    inputSchema: z.object({
      who: z.array(z.string()).min(1).max(4)
        .describe('Who to find numbers for, as they would be said — "Homerton hospital switchboard", "district nurses", "Language Line", "Whipps Cross radiology". List everyone the answer will need to name, in one call.'),
      searchWeb: z.boolean().default(true)
        .describe('Whether to read the web when the directory and the register have nothing. Leave true unless the question is only about the practice’s own numbers.'),
    }),
    execute: async ({ who, searchWeb = true }) => {
      const subjects = who.map((w) => String(w || '').trim()).filter(Boolean).slice(0, 4);
      const id = callId('contact');
      notify({ type: 'tool-start', id, tool: 'find_contact', label: 'Finding a number', detail: subjects.join(', ') });
      const withDetails = (list) => list.filter((c) => (c.phones || []).length || (c.emails || []).length);

      const lookOne = async (subject) => {
        const found = [];

        // 1. The practice's own directory. The canonical store when it is up, the
        //    committed JSON when it is not — the same two paths /api/ask uses.
        let directory = [];
        try { directory = await unifiedContacts(subject, 4); } catch (e) { directory = []; }
        if (!directory.length) directory = matchContacts(subject, 4);
        for (const c of withDetails(directory)) {
          found.push({ label: c.label, phones: c.phones || [], emails: c.emails || [], source: 'Practice directory', note: '' });
        }

        // 2. The CQC register — 57k services, and the reason a hospital department
        //    the practice has never written down is still reachable.
        if (!found.length) {
          try {
            for (const entry of withDetails(searchCqc(subject, 6)).slice(0, 3)) {
              found.push({ label: entry.label, phones: entry.phones, emails: [], source: 'CQC register', note: entry.note || '' });
            }
          } catch (e) { /* the register is optional; the web is still ahead */ }
        }

        // 3. The web, read rather than linked.
        let webReason = '';
        if (!found.length && searchWeb) {
          const web = await findWebContacts({ apiKey, model: searchModel, query: subject, maxPages: 3 });
          webReason = web.reason || '';
          for (const c of (web.contacts || []).slice(0, 3)) {
            found.push({ label: c.title, phones: c.phones, emails: c.emails, source: `Read from ${c.host}`, note: '', url: c.url });
          }
        }
        return { subject, found, webReason };
      };

      const looked = await Promise.all(subjects.map(lookOne));
      const all = [];
      const missing = [];
      for (const row of looked) {
        if (!row.found.length) {
          missing.push(`${row.subject} — nothing in the practice directory, the CQC register${searchWeb ? ' or on the web' : ''}. ${row.webReason}`.trim());
          continue;
        }
        for (const c of row.found) { all.push(c); contacts.push(c); }
      }

      notify({
        type: 'tool-result',
        id,
        tool: 'find_contact',
        summary: all.length
          ? `${all.length} contact${all.length === 1 ? '' : 's'} found`
          : 'No number found',
        items: all.map((c) => ({ label: c.label, sub: (c.phones[0]?.display || c.emails[0] || '') + ' — ' + c.source })),
      });

      if (!all.length) {
        return {
          found: false,
          missing,
          note: 'No number could be found. Say plainly in the answer that the number is not recorded and name who to ask — do not invent one.',
        };
      }
      return {
        found: true,
        contacts: all,
        missing,
        note: 'These numbers and addresses are shown to the reader in a contacts card under your answer, exactly as they are here. '
          + 'Say WHO to ring and what for; do not retype the digits into your prose — an unverified number written in the text is stripped out before it is shown. '
          + 'Anything listed under "missing" was genuinely not found: say so rather than passing over it.',
      };
    },
  });

  // Who is actually working.
  //
  // "Ask whoever is on the late shift" is not an answer either — the name is.
  // The rota is already in the database, generated and published week by week,
  // and a question like "who is on this afternoon" or "is Simin in on Thursday"
  // was previously answered by searching policy documents for the word "rota".
  // What comes back here is the saved grid, not a guess: the shift codes and the
  // times the practice set, turned into one readable page and registered as a
  // source so the answer can quote it like any other.
  const SHIFT_WORD = { E: 'Early', L: 'Late', F: 'Full day', AL: 'Annual leave', OFF: 'Off' };
  const check_rota = tool({
    description:
      'Look up who is working, from the practice’s saved rota. Use it for any question about who is on, who is on '
      + 'early or late, who is on leave, or who to ask on a particular day. Returns the real saved grid — never guess '
      + 'at a name or a shift, and if the week has not been generated say so.',
    inputSchema: z.object({
      when: z.string().default('')
        .describe('A date as YYYY-MM-DD, or blank for the current week. Any date in a week returns that whole week.'),
      day: z.string().default('')
        .describe('Optional single date as YYYY-MM-DD to report on its own — the rest of the week is still summarised.'),
    }),
    execute: async ({ when = '', day = '' }) => {
      const id = callId('rota');
      const ISO = /^\d{4}-\d{2}-\d{2}$/;
      const asked = ISO.test(when) ? when : (ISO.test(day) ? day : '');
      notify({ type: 'tool-start', id, tool: 'check_rota', label: 'Checking the rota', detail: asked || 'this week' });

      // The Monday of whichever week was asked about.
      let monday;
      if (asked) {
        const [y, m, d] = asked.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        const wd = dt.getDay();
        dt.setDate(dt.getDate() + (wd === 0 ? -6 : 1 - wd));
        monday = isoOf(dt);
      } else {
        monday = isoOf(currentMonday());
      }

      let rows = [];
      let staff = [];
      try {
        await ensureSchema();
        const sql = getSql();
        [rows, staff] = await Promise.all([
          sql`SELECT schedule FROM rotas WHERE week_starting = ${monday}`,
          sql`SELECT id, name FROM staff ORDER BY name ASC`,
        ]);
      } catch (e) {
        notify({ type: 'tool-result', id, tool: 'check_rota', summary: 'The rota is unavailable', items: [], ok: false });
        return { found: false, note: 'The rota could not be read. Say the rota was unavailable rather than guessing who is on.' };
      }

      const schedule = rows[0]?.schedule || null;
      if (!schedule?.grid) {
        notify({ type: 'tool-result', id, tool: 'check_rota', summary: 'No rota saved for that week', items: [], ok: false });
        return {
          found: false,
          weekStarting: monday,
          note: `No rota has been published for the week beginning ${monday}. Say that plainly — do not work out who is probably on.`,
        };
      }

      // The roster frozen into the week when it was saved is the truth for that
      // week: a staff member who has since left was still on it.
      const roster = Array.isArray(schedule.roster) && schedule.roster.length ? schedule.roster : staff;
      const days = weekDays(monday);
      const times = schedule.times || null;
      const wanted = ISO.test(day) ? day : '';

      const lines = [];
      for (const d of days) {
        if (wanted && d.iso !== wanted) continue;
        const on = [];
        const off = [];
        for (const person of roster) {
          const code = (schedule.grid[person.id] || [])[days.indexOf(d)] || 'OFF';
          const word = SHIFT_WORD[code] || code;
          if (code === 'E' || code === 'L' || code === 'F') on.push(`${person.name} — ${word} (${shiftRange(times, code)})`);
          else off.push(`${person.name} — ${word}`);
        }
        lines.push(`${d.long} ${d.date}\nWorking: ${on.length ? on.join('; ') : 'nobody recorded'}\nNot in: ${off.length ? off.join('; ') : 'nobody'}`);
      }

      const text = `Rota for the week beginning ${monday} (${weekRangeLabel(monday)})\n\n${lines.join('\n\n')}`;
      const ref = evidence.addPractice({
        id: `rota:${monday}${wanted ? ':' + wanted : ''}`,
        docId: `rota:${monday}`,
        docTitle: `Staff rota — week beginning ${monday}`,
        text,
        section: wanted || weekRangeLabel(monday),
        view: null,
        images: [],
        kind: 'notebook',
      });

      notify({
        type: 'tool-result',
        id,
        tool: 'check_rota',
        summary: wanted ? `Rota for ${wanted}` : `Rota for the week of ${monday}`,
        items: [{ label: `Week beginning ${monday}`, sub: `${roster.length} staff`, ref }],
      });
      return {
        found: true,
        weekStarting: monday,
        source: { ref, title: `Staff rota — week beginning ${monday}`, kind: 'Practice rota', text },
        note: 'This is the published rota. Quote it like any other source, and name people as the rota names them.',
      };
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
      + 'AND ONLY WHEN THE READER IS SENDING A REFERRAL ON e-RS. Not for a referral arriving from a hospital or from 111, not for one already sent that is being chased or cancelled, not for a waiting time, and not because the question happens to contain the word "referral" — none of those has an e-RS form behind it, and a speciality and clinic type would be answering a question nobody asked. '
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
        notify({ type: 'tool-result', id, tool: 'suggest_ers_referral_route', summary: 'Referral-type lookup unavailable', items: [], ok: false });
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

  return {
    search_practice,
    list_practice_sources,
    outline_practice_sources,
    open_practice_sources,
    search_web,
    read_web_page,
    find_contact,
    check_rota,
    suggest_ers_referral_route,
  };
}
