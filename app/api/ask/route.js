// Server-side Q&A endpoint. The browser sends the question, a short history
// string, any locally-stored custom guides and (optionally) attached images;
// retrieval, prompt building, the model call, parsing and citation resolution
// all happen here, so the API key and the full knowledge base never reach the
// client.
//
// Answers are markdown sections with explicit provenance: sections backed by
// the practice's documents carry a Source citation with a server-verified
// verbatim quote (opened in the in-page viewer); sections from the model's own
// judgement are flagged as such and shown under a clear "AI judgement" marker.
// Clinical judgement about a specific patient is still declined.
import { NextResponse } from 'next/server';
import { allGuides } from '@/lib/guides';
import { buildAskPrompt, parseAiJson, buildSearchQuery } from '@/lib/ai/prompt';
import { normForMatch, quoteContainment } from '@/lib/ai/quote-match';
import { retrieve, catalogText, chunksByTitle } from '@/rag/lib/store.mjs';
import { supplementarySourcesFor } from '@/lib/ai/context.mjs';
import { notebookContext } from '@/lib/notebook';
import { matchContacts, contactTelSet, digitsOf, redactUnverifiedNumbers } from '@/lib/contacts';
import { searchKnowledge, knowledgeCatalogText, knowledgePassagesByTitles, conflictsForEntries, unifiedContacts, unifiedTelephoneSet } from '@/lib/knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOP_K = 5;
// A retrieved Source sometimes points at a generic process instead of
// stating it ("same as the standard referral process, but to X clinic").
// Plain top-K semantic search then hands the model the pointer without the
// process it points to, and the model has nothing to answer with but the
// pointer — so it just repeats "standard process" back at the reader.
// REFERENCE_PHRASES catches that shape so a second, targeted retrieval can
// fetch the actual steps; REFERENCE_CHASE_K bounds how many extra chunks
// that second pass can add.
const REFERENCE_CHASE_K = 3;
// Referral questions must be answered with the complete referral process, not
// a fragment of it or a pointer to it. Top-K search can return the middle of
// the multi-chunk referral protocol without its beginning or end, so when the
// question is about referrals the practice's referral protocol documents (the
// generic referral protocol and the 2-week-wait protocol) are pinned into the
// Sources in full. The prompt then instructs the model to walk through the
// whole process end to end.
const REFERRAL_QUERY = /\brefer(?:s|red|ral|rals|ring)?\b|\b2\s*ww\b|\b(?:2|two)[\s-]*week\s+(?:wait|referral)/i;
const REFERRAL_DOC_TITLES = /referral/i;
const REFERENCE_PHRASES = [
  /\b(?:standard|usual|normal|routine|same)\s+(?:process|procedure|protocol|pathway)\b/i,
  /\bas\s+(?:per|with)\s+(?:the\s+)?(?:standard|usual|normal)\b/i,
  /\bfollows?\s+(?:the\s+)?(?:standard|usual|normal)\s+(?:process|procedure|protocol)\b/i,
];
// provider routing: only providers that do not retain prompt data, so the
// question and document extracts are never stored by the model provider.
const NO_RETENTION = { data_collection: 'deny' };
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_HEADERS = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://riverside-practice.local',
  'X-Title': 'Riverside Practice Q&A',
});

// Scan the retrieved chunks for a reference-to-elsewhere phrase and return a
// short snippet of surrounding text (keeps nearby keywords, e.g. the named
// specialty) to use as a follow-up retrieval query. Null when nothing matches
// — the common case, so most questions pay no extra retrieval cost at all.
function referenceHint(chunks) {
  for (const c of chunks) {
    const text = c.text || '';
    for (const re of REFERENCE_PHRASES) {
      const m = re.exec(text);
      if (m) {
        const start = Math.max(0, m.index - 60);
        const end = Math.min(text.length, m.index + m[0].length + 60);
        return text.slice(start, end).trim();
      }
    }
  }
  return null;
}

function locationOf(chunk) {
  if (chunk.view && chunk.view.page) return 'Page ' + chunk.view.page;
  if (chunk.section) return chunk.section;
  if (chunk.headingPath && chunk.headingPath.length) return chunk.headingPath.join(' › ');
  return 'Document';
}

// Images that belong to this exact source: a notebook note's attached pictures,
// or the rendered image of the cited PDF page. HTML documents list images for
// the whole document — too imprecise to show against one section, so skipped.
function citeImages(chunk) {
  const imgs = Array.isArray(chunk.images)
    ? chunk.images.filter((u) => typeof u === 'string' && u)
    : [];
  if (!imgs.length) return [];
  if (chunk.view && chunk.view.kind === 'html') return [];
  return imgs.slice(0, 4);
}

function citationFor(chunk, quote = '') {
  // Collapse runs of spaces but keep line breaks: passages (notebook chunks
  // especially) are markdown, and the source panel renders their structure —
  // headings, lists, bold — instead of showing raw markers.
  const tidy = (t) => String(t || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const body = tidy(chunk.text);
  const q = tidy(quote);
  const flat = body.replace(/\s+/g, ' ');
  return {
    docId: chunk.docId,
    docTitle: chunk.docTitle,
    location: locationOf(chunk),
    snippet: flat.length > 220 ? flat.slice(0, 218).trim() + '…' : flat,
    // The full extract that was given to the model as this Source — kept for
    // context and as a fallback when there is no verified quote.
    text: body,
    // The precise verbatim span the step is based on, verified to appear in this
    // source. Empty when the model's quote could not be verified. Drives the
    // exact-passage highlight and the "what this is based on" text.
    quote: q,
    view: chunk.view || null,
    // Pictures that live in this source (notebook attachments / the cited PDF
    // page render) — shown inline in the chat next to the section they back.
    images: citeImages(chunk),
  };
}

// Resolve a step's citation. Given the model's claimed Source number and its
// verbatim quote, find the retrieved chunk that actually contains the quote
// (correcting a wrong source number), and attach the quote so the UI can show
// and highlight the exact words. Falls back to the claimed source when the
// quote can't be verified, so a step is never left without a source.
function resolveCite(refMap, claimedRef, quote) {
  const claimed = refMap.get(claimedRef) || null;
  const quoteN = normForMatch(quote);
  // A source label is only document-backed when there is enough quoted text to
  // verify. Short/missing quotes are suggestions, never evidence.
  if (quoteN.length < 12) return null;

  let bestChunk = null, bestScore = 0;
  for (const [ref, c] of refMap) {
    // Tiny nudge toward the claimed source so an exact tie keeps the model's pick.
    const score = quoteContainment(quoteN, normForMatch(c.text)) + (ref === claimedRef ? 0.001 : 0);
    if (score > bestScore) { bestScore = score; bestChunk = c; }
  }
  if (bestChunk && bestScore >= 0.5) return citationFor(bestChunk, quote); // verified
  return null; // never present an unverified source as document-backed
}

// De-duplicate the distinct sources an answer relied on, keyed by document +
// location, preserving order. Used for the "sources this answer used" list.
function dedupeCitations(cites) {
  const seen = new Set();
  const out = [];
  for (const c of cites) {
    if (!c) continue;
    const key = [c.docId, c.location].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// Coerce the filing-title date to dd-mm-yyyy. The prompt asks for that format,
// but models drift into yyyy-mm-dd or slashes; anything unrecognisable is left
// as written so the reader can see and correct it rather than lose it.
function normaliseDocDate(raw) {
  const t = (raw || '').trim();
  if (!t) return '';
  let m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') + '-' + m[3];
  m = t.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (m) return m[3].padStart(2, '0') + '-' + m[2].padStart(2, '0') + '-' + m[1];
  return t;
}

// Attached images arrive as data URLs. Bound them hard: a handful of images,
// common raster types only, and a size cap well inside what providers accept.
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 6_000_000; // ~4.5 MB of image data per image
function sanitizeImages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const u of raw) {
    if (typeof u !== 'string') continue;
    if (u.length > MAX_IMAGE_CHARS) continue;
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(u)) continue;
    out.push(u);
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

// Single place the model is called. `content` is either the prompt string or,
// when images are attached, an array of multimodal parts. Returns { text } on
// success or { error } (a ready-to-send NextResponse) on any failure, so both
// the Q&A and triage branches share identical provider routing and error
// handling.
async function callModel(apiKey, model, content) {
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: OPENROUTER_HEADERS(apiKey),
      // provider: only route to providers that do not retain prompt data, so the
      // request and document extracts are never stored by the model provider.
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'user', content }], provider: NO_RETENTION }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { error: NextResponse.json({ error: `OpenRouter error (${res.status}).`, detail: detail.slice(0, 500) }, { status: 502 }) };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) return { error: NextResponse.json({ error: 'No content returned by the model.' }, { status: 502 }) };
    return { text };
  } catch (e) {
    return { error: NextResponse.json({ error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) }, { status: 502 }) };
  }
}

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_AI_MODEL;

  if (!apiKey || !model) {
    return NextResponse.json(
      { error: 'Server is missing OPENROUTER_API_KEY or OPENROUTER_AI_MODEL.' },
      { status: 500 },
    );
  }

  let question = '';
  let history = '';
  let customGuides = [];
  let images = [];
  try {
    const body = await request.json();
    question = typeof body?.question === 'string' ? body.question : '';
    history = typeof body?.history === 'string' ? body.history : '';
    customGuides = Array.isArray(body?.customGuides) ? body.customGuides : [];
    images = sanitizeImages(body?.images);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!question.trim() && !images.length) {
    return NextResponse.json({ error: 'Empty question.' }, { status: 400 });
  }
  if (!question.trim()) question = 'Please look at the attached image.';

  // Resolve follow-ups for retrieval by concatenating the recent conversation
  // locally — no extra model call. "how is this done" then searches with the
  // subject carried over from the previous question. The single model call below
  // still receives the full history to interpret the follow-up.
  const searchQuery = buildSearchQuery({ history, question });

  // Canonical hybrid retrieval. Full-text and vector indexes find candidates;
  // the model still reasons over the original passages rather than embeddings.
  let chunks = [];
  let unifiedHits = [];
  let usingUnified = false;
  const hitToChunk = (r) => {
    const loc = r.location || {};
    const { images = [], source, ...view } = loc;
    return {
      id: r.id, docId: r.entryId,
      docTitle: r.kind === 'note' ? `Notebook: ${r.title}` : r.title,
      text: r.content, section: r.heading,
      view: view.kind || view.url ? view : null,
      images, score: Number(r.score || 0), authority: r.authority,
    };
  };
  try {
    unifiedHits = await searchKnowledge(searchQuery, TOP_K + 5);
    usingUnified = unifiedHits.length > 0;
    chunks = unifiedHits.filter((r) => r.kind !== 'contact').slice(0, TOP_K).map(hitToChunk);
  } catch (e) { unifiedHits = []; }
  // Deployment bridge: the old stores remain readable until migration runs.
  if (!usingUnified) try { chunks = await retrieve(searchQuery, TOP_K); } catch (e) { chunks = []; }

  // Reference-chasing: if what came back only points at a generic process
  // ("same as standard, but to Cardiology") rather than stating it, run one
  // more targeted retrieval for that process and merge in whatever it finds
  // that wasn't already retrieved. Only runs when the phrase is actually
  // present, so the common case costs nothing extra.
  const hint = referenceHint(chunks);
  if (hint) {
    try {
      const more = usingUnified
        ? (await searchKnowledge(hint, REFERENCE_CHASE_K)).filter((r) => r.kind !== 'contact').map(hitToChunk)
        : await retrieve(hint, REFERENCE_CHASE_K);
      const known = new Set(chunks.map((c) => c.id));
      for (const c of more) { if (!known.has(c.id)) { chunks.push(c); known.add(c.id); } }
    } catch (e) { /* best-effort */ }
  }

  // Referral pinning: a referral question always gets the referral protocol
  // documents in full, whatever semantic search happened to return, so the
  // answer can set out the complete process rather than a fragment.
  if (REFERRAL_QUERY.test(searchQuery)) {
    try {
      const pinned = usingUnified
        ? (await knowledgePassagesByTitles(REFERRAL_DOC_TITLES)).map(hitToChunk)
        : chunksByTitle(REFERRAL_DOC_TITLES);
      const known = new Set(chunks.map((c) => c.id));
      for (const c of pinned) { if (!known.has(c.id)) { chunks.push(c); known.add(c.id); } }
    } catch (e) { /* best-effort */ }
  }

  // Number them as Sources and keep a ref -> chunk map for citation resolution.
  const refMap = new Map();
  const extracts = chunks.map((c, i) => {
    const ref = i + 1;
    refMap.set(ref, c);
    return { ref, title: c.docTitle, location: locationOf(c), text: c.text };
  });

  // Supplementary context — practice notes / triage instructions gathered at
  // request time so they can be updated without a redeploy: the in-app Notebook
  // (semantically retrieved from its own embeddings in Postgres, exactly like
  // the knowledge base), plus any configured URLs / local rag/context folder.
  // Appended as extra numbered Sources after the knowledge-base chunks, so the
  // model must quote them and the server verifies the quote exactly as for any
  // document. Never fatal.
  let noteCatalog = '';
  if (!usingUnified) try {
    const [remote, nb] = await Promise.all([
      supplementarySourcesFor(searchQuery).catch(() => []),
      notebookContext(searchQuery).catch(() => ({ sources: [], catalog: '' })),
    ]);
    noteCatalog = nb.catalog || '';
    const supp = nb.sources.concat(remote); // notebook first — it's the staff's own guidance
    for (const s of supp) {
      const ref = extracts.length + 1;
      const chunk = { docId: s.docId, docTitle: s.docTitle, text: s.text, section: s.section, view: null, images: s.images || [] };
      refMap.set(ref, chunk);
      extracts.push({ ref, title: chunk.docTitle, location: s.section || 'Note', text: chunk.text });
    }
  } catch (e) { /* supplementary context is optional */ }

  // Configured URL/local context remains optional; Notebook pages are already
  // part of canonical retrieval and are therefore not added twice.
  if (usingUnified) try {
    const remote = await supplementarySourcesFor(searchQuery);
    for (const s of remote) {
      const ref = extracts.length + 1;
      const chunk = { docId: s.docId, docTitle: s.docTitle, text: s.text, section: s.section, view: null, images: s.images || [] };
      refMap.set(ref, chunk);
      extracts.push({ ref, title: chunk.docTitle, location: s.section || 'Note', text: chunk.text });
    }
  } catch (e) { /* supplementary context is optional */ }

  // Deterministic contacts directory match — exact numbers/emails shown to the
  // reader verbatim (never authored by the model). Also build the set of numbers
  // we can vouch for (directory + anything present in the retrieved Sources), so
  // any other phone number the model writes can be stripped as unverified.
  let contacts;
  let verifiedNums;
  if (usingUnified) {
    try { contacts = await unifiedContacts(searchQuery, 5); } catch (e) { contacts = []; }
    try { verifiedNums = await unifiedTelephoneSet(); } catch (e) { verifiedNums = new Set(); }
  } else {
    contacts = matchContacts(searchQuery);
    verifiedNums = new Set(contactTelSet());
  }
  for (const ex of extracts) {
    for (const run of (ex.text.match(/\d[\d ()\/-]{7,}\d/g) || [])) {
      const d = digitsOf(run);
      if (d.length >= 9) verifiedNums.add(d);
    }
  }
  const redact = (t) => redactUnverifiedNumbers(t, verifiedNums);

  const guideCatalog = allGuides(customGuides).map((g) => '- ' + g.question).join('\n');
  // Tier A catalogue: knowledge-base documents plus every notebook note, so the
  // model is aware of the notebook's coverage even when no chunk was retrieved.
  let canonicalCatalog = '';
  if (usingUnified) try { canonicalCatalog = await knowledgeCatalogText(); } catch (e) { canonicalCatalog = ''; }
  const catalog = usingUnified ? canonicalCatalog : [catalogText(), noteCatalog].filter(Boolean).join('\n');
  let conflicts = [];
  if (usingUnified) try { conflicts = await conflictsForEntries(chunks.map((c) => c.docId)); } catch (e) { conflicts = []; }
  const prompt = buildAskPrompt({ question, catalog, extracts, history, guideCatalog, contacts: contacts.map((c) => c.label), conflicts, imageCount: images.length });

  // With images attached, the message becomes multimodal content parts; the
  // prompt text stays identical either way.
  const content = images.length
    ? [{ type: 'text', text: prompt }].concat(images.map((url) => ({ type: 'image_url', image_url: { url } })))
    : prompt;

  try {
    const { text, error } = await callModel(apiKey, model, content);
    if (error) return error;

    const parsed = parseAiJson(text);

    // A pasted medical document to file: the model returned the parts of the
    // filing title; assemble "(dd-mm-yyyy) source department actions/note" here
    // so the format stays identical whatever the model writes. No citations —
    // the title comes from the pasted document itself, not the knowledge base.
    if (parsed.kind === 'docfile') {
      // Undated documents keep the date slot with a visible placeholder, so the
      // title's shape is stable and staff notice the gap and fill it in.
      const date = normaliseDocDate(parsed.date) || 'ddmmyyyy';
      const tail = parsed.actions.length ? parsed.actions.join('; ') : (parsed.note || 'no action');
      const title = ['(' + date + ')', parsed.source, parsed.department, tail]
        .filter(Boolean).join(' ');
      return NextResponse.json({
        kind: 'docfile',
        title,
        date,
        source: parsed.source,
        department: parsed.department,
        actions: parsed.actions,
        note: parsed.note,
      });
    }

    // An item declared as the model's own judgement carries no citation; a
    // "documents" item whose source can't be resolved at all is downgraded to
    // judgement too, so nothing unsourced is ever presented as document-backed.
    const provenance = (s) => {
      const cite = s.basis === 'judgement' ? null : resolveCite(refMap, s.source, s.quote);
      return { cite, basis: cite ? 'documents' : 'judgement' };
    };

    // The model decides for itself whether the message is a staff question or an
    // incoming patient request to route, and returns the matching shape.
    if (parsed.kind === 'triage') {
      const actions = parsed.actions.map((s) => ({ text: redact(s.text), ...provenance(s) }));
      const redFlags = parsed.redFlags.map((s) => ({ text: redact(s.text), ...provenance(s) }));
      const patientMessageCite = resolveCite(refMap, parsed.patientMessageSource, parsed.patientMessageQuote);
      const citations = dedupeCitations(
        actions.map((a) => a.cite).concat(redFlags.map((r) => r.cite)).concat([patientMessageCite]),
      );

      return NextResponse.json({
        kind: 'triage',
        urgency: parsed.urgency,
        urgencyReason: redact(parsed.urgencyReason),
        summary: redact(parsed.summary),
        actions,
        redFlags,
        route: redact(parsed.route),
        patientMessage: redact(parsed.patientMessage),
        patientMessageCite,
        citations,
        contacts,
      });
    }

    // Declines are now rare — only when the message needs clinical judgement
    // about a specific patient (or is otherwise off-limits); the model answers
    // document-silent questions with clearly flagged judgement sections instead.
    if (parsed.answerable === false || (!parsed.sections.length && !parsed.message)) {
      return NextResponse.json({
        kind: 'answer',
        answerable: false,
        intro: parsed.intro || 'This needs a clinician’s judgement, so I cannot answer it here.',
        sections: [],
        message: '',
        messageCite: null,
        tip: '',
        citations: [],
        contacts,
      });
    }

    // Resolve each section's citation by verifying the model's verbatim quote
    // against the retrieved Sources — correcting wrong source numbers and
    // attaching the exact supporting words, so the citation shows accurate,
    // precise text. Judgement sections carry no citation and stay flagged.
    const sections = parsed.sections.map((sec) => ({ markdown: redact(sec.markdown), ...provenance(sec) }));
    const messageCite = resolveCite(refMap, parsed.messageSource, parsed.messageQuote);

    // Each source image appears once, against the first section it backs —
    // several sections often cite the same note or page.
    const seenImg = new Set();
    for (const cite of sections.map((sec) => sec.cite).concat([messageCite])) {
      if (!cite || !cite.images || !cite.images.length) continue;
      cite.images = cite.images.filter((u) => {
        if (seenImg.has(u)) return false;
        seenImg.add(u);
        return true;
      });
    }

    // The distinct sources this answer relied on (for any list/summary use).
    const citations = dedupeCitations(sections.map((s) => s.cite).concat([messageCite]));

    return NextResponse.json({
      kind: 'answer',
      answerable: true,
      intro: redact(parsed.intro),
      sections,
      message: redact(parsed.message),
      messageCite,
      tip: redact(parsed.tip),
      citations,
      contacts,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) },
      { status: 502 },
    );
  }
}
