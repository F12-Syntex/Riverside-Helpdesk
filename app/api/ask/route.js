// Server-side Q&A endpoint. The browser sends the question, a short history
// string, any locally-stored custom guides and (optionally) attached images;
// retrieval, prompt building, the model call, parsing and citation resolution
// all happen here, so the API key and the full knowledge base never reach the
// client.
//
// Answers are markdown sections with explicit provenance and are strict to
// source: sections backed by the practice's documents carry a Source citation
// with a server-verified verbatim quote (opened in the in-page viewer); the
// only judgement-flagged sections are meta statements ("the documents do not
// cover this, ask X"), shown under a clear "AI judgement" marker — the model
// does not add advice or steps of its own. Clinical judgement about a specific
// patient is still declined.
import { NextResponse } from 'next/server';
import { allGuides } from '@/lib/guides';
import { buildAskPrompt, parseAiJson, buildSearchQuery } from '@/lib/ai/prompt';
import { dedupeCitations, locationOf, resolveCite } from '@/lib/ai/citations.mjs';
import { retrieve, catalogText, chunksByTitle } from '@/rag/lib/store.mjs';
import { getSupplementaryEntries } from '@/lib/ai/context.mjs';
import { matchContacts, contactTelSet, digitsOf, redactUnverifiedNumbers } from '@/lib/contacts';
import { getDirectory } from '@/lib/lookup/directory';
import { redactIdentifiers } from '@/lib/safety/identifiers.mjs';
import { searchKnowledge, knowledgeCatalogText, knowledgePassagesByTitles, conflictsForPassages, unifiedContacts, unifiedTelephoneSet } from '@/lib/knowledge';
import { prepareBundledKnowledge } from '@/lib/knowledge-bootstrap';
import { fullNotebookContext } from '@/lib/notebook';
import { knowledgeHitToDocumentChunk } from '@/lib/knowledge-context.mjs';
import { resolveDocfileDate, docfileActiveItems, sanitizeDocfileNote } from '@/lib/ai/docfile.mjs';
import { getAiModel, getModelRoles } from '@/lib/settings';
import { chatRequest } from '@/lib/ai/openrouter.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TOP_K = 5;
// Q&A source scope (temporary). The assistant currently answers from the
// practice Notebook ONLY: document (RAG) retrieval, the knowledge catalogue and
// conflict detection are switched off, and the contacts directory is not shown.
// Every non-empty Notebook page is still loaded in full. Flip either flag back
// to true to restore that channel.
const USE_DOCUMENTS = false;
const USE_CONTACTS = false;
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
    // No-retention routing and no extended reasoning, both from
    // lib/ai/openrouter. This endpoint builds a filing title or routes a patient
    // request from material it has already been given; deliberation before
    // answering is time the reader waits for nothing.
    const res = await fetch(...chatRequest(apiKey, {
      model, temperature: 0.2, messages: [{ role: 'user', content }],
    }));
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
  // The model is a practice setting now, changed at /settings — see lib/settings.js.
  // A message with a picture on it is moved onto the images role further down,
  // once the images have been read out of the body.
  let model = await getAiModel();

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Server is missing OPENROUTER_API_KEY.' },
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
  // The images role sees pictures; the model above may not. Same rule as
  // /api/agent: a message carrying an image runs on the role chosen for it.
  if (images.length) model = (await getModelRoles()).images.model;
  if (!question.trim() && !images.length) {
    return NextResponse.json({ error: 'Empty question.' }, { status: 400 });
  }
  if (!question.trim()) question = 'Please look at the attached image.';
  // The same local name-and-address guard /api/agent applies, for the same
  // reason: an endpoint that answers questions must not be the way a patient's
  // name reaches a model, whoever posted to it. See lib/safety/identifiers.mjs.
  question = redactIdentifiers(question, { allow: getDirectory() }).text;

  // Resolve follow-ups for retrieval by concatenating the recent conversation
  // locally — no extra model call. "how is this done" then searches with the
  // subject carried over from the previous question. The single model call below
  // still receives the full history to interpret the follow-up.
  const searchQuery = buildSearchQuery({ history, question });

  // Keep the three knowledge paths separate. Documents and contacts use their
  // own RAG searches. Every live Notebook page is loaded in full, regardless of
  // the question, so no staff instruction disappears because it ranked below a
  // top-K cutoff.
  let chunks = [];
  let usingUnified = false;
  let notebookChunks = [];
  let supplementaryChunks = [];
  const [readiness, notebook, supplementary] = await Promise.allSettled([
    prepareBundledKnowledge(),
    fullNotebookContext(),
    getSupplementaryEntries(),
  ]);
  usingUnified = readiness.status === 'fulfilled' && !!readiness.value;
  // Notebook guidance is authoritative and requested in full. Never silently
  // answer without it when the live Notebook cannot be read.
  if (notebook.status !== 'fulfilled') {
    return NextResponse.json(
      { error: 'The practice Notebook is temporarily unavailable, so no answer was generated.' },
      { status: 503 },
    );
  }
  notebookChunks = notebook.value;
  if (supplementary.status === 'fulfilled') {
    supplementaryChunks = supplementary.value
      .filter((item) => item && String(item.text || '').trim())
      .map((item, index) => ({
        id: `supplementary:${index}:full`,
        docId: `supplementary:${item.origin}:${item.name}`,
        docTitle: `Practice context: ${item.name}`,
        text: String(item.text),
        section: 'Complete note', view: null, images: [], kind: 'notebook',
      }));
  }
  if (USE_DOCUMENTS) {
    try {
      if (usingUnified) {
        const documentHits = await searchKnowledge(searchQuery, TOP_K, { kind: 'document' });
        chunks = documentHits.map(knowledgeHitToDocumentChunk);
      }
    } catch (e) {
      // A transient canonical-search failure must still leave staff with the
      // bundled read-only index rather than an empty answer context.
      usingUnified = false;
    }
    // Deployment bridge: the committed document index remains readable until a
    // new canonical schema has completed its first reconciliation.
    if (!usingUnified) try { chunks = await retrieve(searchQuery, TOP_K); } catch (e) { chunks = []; }
  } else {
    // Notebook-only mode: never surface the document store as a canonical source.
    usingUnified = false;
  }

  // Reference-chasing: if what came back only points at a generic process
  // ("same as standard, but to Cardiology") rather than stating it, run one
  // more targeted retrieval for that process and merge in whatever it finds
  // that wasn't already retrieved. Only runs when the phrase is actually
  // present, so the common case costs nothing extra.
  const hint = USE_DOCUMENTS ? referenceHint(chunks) : null;
  if (hint) {
    try {
      const more = usingUnified
        ? (await searchKnowledge(hint, REFERENCE_CHASE_K, { kind: 'document' })).map(knowledgeHitToDocumentChunk)
        : await retrieve(hint, REFERENCE_CHASE_K);
      const known = new Set(chunks.map((c) => c.id));
      for (const c of more) { if (!known.has(c.id)) { chunks.push(c); known.add(c.id); } }
    } catch (e) { /* best-effort */ }
  }

  // Referral pinning: a referral question always gets the referral protocol
  // documents in full, whatever semantic search happened to return, so the
  // answer can set out the complete process rather than a fragment.
  if (USE_DOCUMENTS && REFERRAL_QUERY.test(searchQuery)) {
    try {
      const pinned = usingUnified
        ? (await knowledgePassagesByTitles(REFERRAL_DOC_TITLES, { kind: 'document' })).map(knowledgeHitToDocumentChunk)
        : chunksByTitle(REFERRAL_DOC_TITLES);
      const known = new Set(chunks.map((c) => c.id));
      for (const c of pinned) { if (!known.has(c.id)) { chunks.push(c); known.add(c.id); } }
    } catch (e) { /* best-effort */ }
  }

  // Number retrieved document passages first, then append every complete
  // Notebook/practice-context page. All remain citable, but the prompt presents
  // the two groups separately so the model understands their different paths.
  const refMap = new Map();
  const extracts = [];
  const addExtract = (chunk, sourceType) => {
    const ref = extracts.length + 1;
    refMap.set(ref, chunk);
    extracts.push({ ref, title: chunk.docTitle, location: locationOf(chunk), text: chunk.text, sourceType });
  };
  for (const chunk of chunks) addExtract(chunk, 'document');
  for (const chunk of notebookChunks) addExtract(chunk, 'notebook');
  for (const chunk of supplementaryChunks) addExtract(chunk, 'notebook');

  let conflicts = [];
  if (USE_DOCUMENTS && usingUnified) try {
    conflicts = await conflictsForPassages(chunks.map((c) => c.id));
    const known = new Set(chunks.map((c) => c.id));
    for (const c of conflicts) for (const side of ['A', 'B']) {
      const pid = c['passage' + side];
      if (!pid || known.has(pid)) continue;
      // Notes are already present in full and contacts have their own RAG/card
      // path. Conflict expansion may only add another document passage.
      if (c['kind' + side] !== 'document') continue;
      const loc = c['location' + side] || {};
      const { images = [], source, ...view } = loc;
      const chunk = {
        id: pid, docId: c['entry' + side],
        docTitle: c['title' + side],
        text: c['content' + side], section: c['heading' + side],
        view: view.kind || view.url ? view : null, images,
      };
      addExtract(chunk, 'document');
      known.add(pid);
    }
  } catch (e) { conflicts = []; }

  // Deterministic contacts directory match — exact numbers/emails shown to the
  // reader verbatim (never authored by the model). Also build the set of numbers
  // we can vouch for (directory + anything present in the retrieved Sources), so
  // any other phone number the model writes can be stripped as unverified.
  let contacts = [];
  let verifiedNums = new Set();
  if (USE_CONTACTS) {
    if (usingUnified) {
      try { contacts = await unifiedContacts(searchQuery, 5); } catch (e) { contacts = []; }
      try { verifiedNums = await unifiedTelephoneSet(); } catch (e) { verifiedNums = new Set(); }
    } else {
      contacts = matchContacts(searchQuery);
      verifiedNums = new Set(contactTelSet());
    }
  }
  for (const ex of extracts) {
    // Same separator set as the redactor (dots, nbsp, tabs included) so a number
    // written with those in a Source is recognised as verified, not redacted.
    for (const run of (ex.text.match(/\\d[-\\d.()\\/ \\t ]{7,}\\d/g) || [])) {
      const d = digitsOf(run);
      if (d.length >= 9) verifiedNums.add(d);
    }
  }
  const redact = (t) => redactUnverifiedNumbers(t, verifiedNums);

  const guideCatalog = allGuides(customGuides).map((g) => '- ' + g.question).join('\n');
  // The catalogue is document-only. Notebook pages are already supplied in full
  // and contacts are selected by their own RAG query.
  let canonicalCatalog = '';
  if (USE_DOCUMENTS && usingUnified) try { canonicalCatalog = await knowledgeCatalogText({ kind: 'document' }); } catch (e) { canonicalCatalog = ''; }
  const catalog = USE_DOCUMENTS ? (usingUnified ? canonicalCatalog : catalogText()) : '';
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
    // filing title; assemble "(dd-Mmm-yyyy) source department actions/note" here
    // so the format stays identical whatever the model writes. No citations —
    // the title comes from the pasted document itself, not the knowledge base.
    if (parsed.kind === 'docfile') {
      // Undated documents keep the date slot with a visible placeholder, so the
      // title's shape is stable and staff notice the gap and fill it in.
      const date = resolveDocfileDate({
        date: parsed.date, dateEvidence: parsed.dateEvidence,
        documentText: question, hasImages: images.length > 0,
      }) || 'dd-Mmm-yyyy';
      // Live items only — a task for us, a prescription change, or the plan —
      // each tagged with its kind for the card; see lib/ai/docfile.mjs.
      const items = docfileActiveItems(parsed.actions, { documentText: question, hasImages: images.length > 0 });
      const actions = items.map((entry) => entry.text);
      const note = sanitizeDocfileNote({
        note: parsed.note, noteEvidence: parsed.noteEvidence,
        documentText: question, hasImages: images.length > 0,
      });
      const tail = actions.length ? actions.join('; ') : note;
      const title = ['(' + date + ')', parsed.source, parsed.department, tail]
        .filter(Boolean).join(' ');
      return NextResponse.json({
        kind: 'docfile',
        title,
        date,
        source: parsed.source,
        department: parsed.department,
        actions,
        items,
        note,
      });
    }

    // Decide provenance AND whether an item may be shown at all. An item the model
    // marked "judgement" is a permitted meta statement (kept, flagged). One it
    // claimed came from the documents is kept ONLY if its quote verifies against a
    // Source; an unverifiable "documents" item is unsourced substance and is
    // dropped entirely — never relabelled and shown under the judgement flag,
    // which is reserved for meta statements ("the documents do not cover this").
    const groundItem = (s) => {
      if (s.basis === 'judgement') return { cite: null, basis: 'judgement', keep: true };
      const cite = resolveCite(refMap, s.source, s.quote);
      return { cite, basis: 'documents', keep: !!cite };
    };
    const shown = (items) => items.filter((it) => it.keep).map(({ keep, ...rest }) => rest);

    // The model decides for itself whether the message is a staff question or an
    // incoming patient request to route, and returns the matching shape.
    if (parsed.kind === 'triage') {
      const actions = shown(parsed.actions.map((s) => ({ text: redact(s.text), ...groundItem(s) })));
      const redFlags = shown(parsed.redFlags.map((s) => ({ text: redact(s.text), ...groundItem(s) })));
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

    // Declines are rare — only when the message needs clinical judgement about
    // a specific patient (or is otherwise off-limits); for document-silent
    // questions the model says the documents do not cover it and names who to
    // ask, rather than answering from its own knowledge.
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
    // precise text. Judgement sections carry no citation and stay flagged; a
    // section that claimed the documents but does not verify is dropped, not shown.
    const sections = shown(parsed.sections.map((sec) => ({ markdown: redact(sec.markdown), ...groundItem(sec) })));
    const messageCite = resolveCite(refMap, parsed.messageSource, parsed.messageQuote);

    // Everything the model wrote was unverifiable and was dropped, and there is no
    // message to fall back on. Decline honestly rather than showing the model's
    // intro, which was summarising content that is not grounded in any Source.
    if (!sections.length && !parsed.message) {
      return NextResponse.json({
        kind: 'answer',
        answerable: false,
        intro: 'I could not find this in the practice’s documents, so I cannot answer it from them here.',
        sections: [],
        message: '',
        messageCite: null,
        tip: '',
        citations: [],
        contacts,
      });
    }

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
