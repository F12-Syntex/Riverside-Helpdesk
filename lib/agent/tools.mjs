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
// Five tools:
//   search_practice       — full-text search over practice documents + Notebook
//   list_practice_sources — everything that exists, so the agent can choose
//   open_practice_source  — a Notebook page whole, or one part of a document
//   search_web            — the open internet, clearly separated from the above
//   find_contact          — an actual telephone number or email address, from the
//                           practice directory, the CQC register or a page read
//                           off the web — never one a model wrote
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
import { findWebContacts } from '../lookup/web-contact.mjs';
import { webSearch } from './web-search.mjs';
import { explainLookup, lookupErsMapping } from '../referrals/ers-lookup.js';

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
export function createTools({ apiKey, searchModel, notebookChunks = [], evidence, onEvent, contacts = [], onUsage }) {
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
        return { sources: [], note: 'Nothing in the practice material matches those words. This is a word search, not a understanding of what you meant — try the words the material itself would use, or call list_practice_sources and open the file that looks right. Only go to the web once both have failed.' };
      }
      return { sources, note: 'These are excerpts. To read around one, call open_practice_source with its title.' };
    },
  });

  const list_practice_sources = tool({
    description:
      'List everything the practice holds — its Notebook pages and its documents — with a one-line summary and the size '
      + 'of each document. This is how you decide WHICH file you need: read the list, then open the one that covers the '
      + 'question with open_practice_source. Use it whenever a search returns fragments, returns nothing, or you are '
      + 'about to conclude the practice has no material on something.',
    inputSchema: z.object({
      filter: z.string().default('').describe('Optional word to narrow the list by title or summary, e.g. "referral".'),
      kind: z.enum(['all', 'notebook', 'documents']).default('all')
        .describe('"notebook" is staff-written working guidance; "documents" are the practice’s formal policies and protocols.'),
    }),
    execute: async ({ filter = '', kind = 'all' }) => {
      const id = callId('list');
      notify({ type: 'tool-start', id, tool: 'list_practice_sources', label: 'Listing practice sources', detail: filter });
      const want = titleKey(filter);
      const notes = kind === 'documents' ? [] : notebookChunks
        .map((c) => ({ title: c.docTitle }))
        .filter((t) => !want || titleKey(t.title).includes(want));
      const files = kind === 'notebook' ? [] : (await documents())
        .filter((d) => !want || titleKey(d.title).includes(want) || titleKey(d.summary).includes(want))
        .map((d) => ({
          title: d.title,
          summary: String(d.summary || '').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_EXCERPT),
          // Roughly how many open_practice_source calls it would take to read
          // the whole thing, so the model can weigh opening it.
          parts: Math.max(1, Math.ceil(Number(d.characters || 0) / DOCUMENT_PART)),
        }));

      notify({
        type: 'tool-result',
        id,
        tool: 'list_practice_sources',
        summary: `${notes.length} Notebook page${notes.length === 1 ? '' : 's'}, ${files.length} document${files.length === 1 ? '' : 's'}`,
        items: notes.slice(0, 6).map((t) => ({ label: t.title, sub: 'Notebook' }))
          .concat(files.slice(0, 6).map((d) => ({ label: d.title, sub: 'Document' }))),
      });
      return {
        notebook: notes,
        documents: files,
        note: 'Open any of these by title with open_practice_source. A Notebook page comes back whole. A document comes back one part at a time with an outline of the rest, so ask for the part you actually need rather than reading it end to end.',
      };
    },
  });

  const open_practice_source = tool({
    description:
      'Read one practice source by title — a Notebook page in full, or one part of a document. Use this when a search '
      + 'result gave you the middle of a process and the answer has to set out the whole of it, and use it to read any '
      + 'document you decide is relevant, whether or not a search surfaced it. A document is served a part at a time '
      + 'and every part comes with an outline of the others: read the part you need, not the whole file.',
    inputSchema: z.object({
      title: z.string().describe('The source title, as shown by search_practice or list_practice_sources.'),
      part: z.number().int().min(1).default(1)
        .describe('Which part of a document to read. Ignored for Notebook pages, which always come back whole. The outline in each result says what is in every other part.'),
    }),
    execute: async ({ title, part = 1 }) => {
      const id = callId('open');
      notify({ type: 'tool-start', id, tool: 'open_practice_source', label: 'Opening source', detail: title });
      const want = titleKey(title);

      // A Notebook page is the practice's live working instruction and is short.
      // It is handed over whole — "just take whatever is relevant" does not apply
      // to a page a receptionist is expected to follow line by line.
      const note = notebookChunks.find((c) => titleKey(c.docTitle) === want)
        || notebookChunks.find((c) => titleKey(c.docTitle).includes(want));
      if (note) {
        const ref = evidence.addPractice(note);
        const text = tidy(note.text).slice(0, FULL_SOURCE);
        notify({
          type: 'tool-result',
          id,
          tool: 'open_practice_source',
          summary: 'Opened in full',
          items: [{ label: note.docTitle, sub: text.length + ' characters', ref }],
        });
        return { found: true, source: { ref, title: note.docTitle, location: locationOf(note), kind: 'Notebook (staff guidance)', text } };
      }

      const catalogue = await documents();
      const doc = catalogue.find((d) => titleKey(d.title) === want)
        || catalogue.find((d) => titleKey(d.title).includes(want))
        || catalogue.find((d) => want && titleKey(want).includes(titleKey(d.title)));
      if (!doc) {
        notify({ type: 'tool-result', id, tool: 'open_practice_source', summary: 'Not found', items: [] });
        return { found: false, note: 'No source with that title. Call list_practice_sources to see exactly what exists, then use a title from it.' };
      }

      const loaded = await loadDocumentParts(doc);
      if (!loaded.parts.length) {
        notify({ type: 'tool-result', id, tool: 'open_practice_source', summary: 'Empty document', items: [] });
        return { found: false, note: `"${doc.title}" is in the catalogue but holds no readable text.` };
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
      notify({
        type: 'tool-result',
        id,
        tool: 'open_practice_source',
        summary: loaded.parts.length > 1 ? `Part ${index} of ${loaded.parts.length}` : 'Opened in full',
        items: [{ label: doc.title, sub: chosen.heading, ref }],
      });
      return {
        found: true,
        source: { ref, title: doc.title, location: chosen.heading, kind: 'Practice document', text: chosen.text },
        part: index,
        parts: loaded.parts.length,
        outline: loaded.parts.map((p) => `${p.index}. ${p.heading}`),
        note: loaded.parts.length > 1
          ? `This is part ${index} of ${loaded.parts.length}. The outline says what is in each of the others — call open_practice_source again for the part you still need, and only that part.`
          : 'That is the whole document.',
      };
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
      });
      if (!ok) return { ok: false, sources: [], note: reason || 'Web search is unavailable. Say so rather than answering from memory.' };
      return { ok: true, summary, sources, note: 'These are web pages, not practice policy. Mark anything taken from them as coming from the web.' };
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
      who: z.string().describe('Who to find a number for, as it would be said — "Homerton hospital switchboard", "district nurses", "Language Line", "Whipps Cross radiology".'),
      searchWeb: z.boolean().default(true)
        .describe('Whether to read the web when the directory and the register have nothing. Leave true unless the question is only about the practice’s own numbers.'),
    }),
    execute: async ({ who, searchWeb = true }) => {
      const id = callId('contact');
      const subject = String(who || '').trim();
      notify({ type: 'tool-start', id, tool: 'find_contact', label: 'Finding a number', detail: subject });

      const withDetails = (list) => list.filter((c) => (c.phones || []).length || (c.emails || []).length);
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

      for (const c of found) contacts.push(c);
      notify({
        type: 'tool-result',
        id,
        tool: 'find_contact',
        summary: found.length
          ? `${found.length} contact${found.length === 1 ? '' : 's'} found`
          : 'No number found',
        items: found.map((c) => ({ label: c.label, sub: (c.phones[0]?.display || c.emails[0] || '') + ' — ' + c.source })),
      });

      if (!found.length) {
        return {
          found: false,
          note: `No number could be found for "${subject}" in the practice directory, the CQC register${searchWeb ? ' or on the web' : ''}. ${webReason} Say plainly in the answer that the number is not recorded and name who to ask — do not invent one.`,
        };
      }
      return {
        found: true,
        contacts: found,
        note: 'These numbers and addresses are shown to the reader in a contacts card under your answer, exactly as they are here. '
          + 'Say WHO to ring and what for; do not retype the digits into your prose — an unverified number written in the text is stripped out before it is shown.',
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

  return { search_practice, list_practice_sources, open_practice_source, search_web, find_contact, suggest_ers_referral_route };
}
