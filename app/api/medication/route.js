// Server-side endpoint for the Medication Check tool. One request looks up ONE
// medicine (with an optional specific question); the browser fans out one request
// per medicine so cached ones return instantly and slow ones never block others.
//
// Flow per request:
//   0. If the question itself describes an obvious emergency, return urgent-help
//      guidance immediately — a deterministic backstop that the citation filter
//      can never reduce to "ask a pharmacist", and no model call is made.
//   1. Look the medicine up in the cache (the `medications` table). A general
//      lookup that is already stored, or a question already asked, is returned
//      straight away — no model call — so repeat lookups are instant.
//   2. On a miss, ask the model (with OpenRouter's web-search server tool,
//      restricted to authoritative UK sources) to gather and synthesise the
//      information, grounding every point in a source it actually read.
//   3. Verify each point's quote against the real fetched passages, keep only
//      points backed by a genuine source, fetch a best-effort image, then cache
//      the result. The cache grows over time: new questions and any new sourced
//      facts are merged into what is already stored for the medicine.
//
// The answers are GENERAL medicines information from public UK sources — never
// advice about a specific patient. That framing lives in lib/ai/medication.js.
import { NextResponse } from 'next/server';
import { getSql, ensureMedicationSchema } from '@/lib/db';
import {
  buildMedicationPrompt,
  parseMedicationJson,
  groundMedication,
  SECTION_ORDER,
  ALLOWED_SOURCE_DOMAINS,
} from '@/lib/ai/medication';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Route only to providers that do not retain prompt data (consistent with the
// other AI routes). The query carries no patient data — just a medicine name and
// a general question — but we keep the same privacy posture.
const NO_RETENTION = { data_collection: 'deny' };
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_HEADERS = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://riverside-practice.local',
  'X-Title': 'Riverside Practice Medication Check',
});

const MODEL_TIMEOUT_MS = 60000; // web search makes the first lookup slower
const IMAGE_TIMEOUT_MS = 4500;  // image is best-effort — never hold the answer up
const MAX_QUERIES = 50;         // cap the stored questions per medicine (oldest evicted)

// Urgent-help wording shown when a question looks like an emergency. Accurate and
// non-clinical: 999 for the listed emergencies, 111 for urgent non-emergencies,
// no invented doses or assessment.
const EMERGENCY_MESSAGE =
  'If someone may have taken an overdose, is having a severe allergic reaction, is struggling to breathe, or has collapsed, call 999 now. For urgent advice that is not life-threatening, call NHS 111. This tool gives general information only and cannot advise about a specific person — do not delay getting help.';

// Obvious emergencies in the staff member's own question. A deterministic
// backstop so an urgent case is never reduced to "ask a pharmacist" by the
// citation filter; intentionally broad and erring toward showing 999 help.
function looksLikeEmergency(q) {
  return /\b(overdose|overdosed|too many (tablets|pills|capsules)|took too much|\d{2,}\s*(tablets|pills|capsules)|can('?t| ?not) breathe|difficulty breathing|struggling to breathe|collaps(e|ed|ing)|unconscious|unresponsive|passed out|anaphylax|severe (allergic|reaction)|swollen (throat|face|tongue|lips)|blue lips|seizure|fitting|not breathing)\b/i.test(String(q || ''));
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const normText = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
const normQuery = (q) => normText(q).slice(0, 300);
// Loose comparison that ignores spacing, hyphens and case, so a mere formatting
// difference (e.g. "co codamol" vs "co-codamol") is not treated as a correction.
const normLoose = (t) => normText(t).replace(/[^a-z0-9]/g, '');

const bySectionOrder = (a, b) => {
  const ia = SECTION_ORDER.indexOf(a.key);
  const ib = SECTION_ORDER.indexOf(b.key);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
};

// Keep only points that carry a verified source; drop sections left empty. This
// is what guarantees every point shown is backed by a real reference.
function keepSourced(sections) {
  return (sections || [])
    .map((sec) => ({ ...sec, points: (sec.points || []).filter((p) => p.cite && p.cite.url) }))
    .filter((sec) => sec.points.length)
    .sort(bySectionOrder);
}

function dedupeRefs(refs) {
  const seen = new Set();
  const out = [];
  for (const r of refs || []) {
    if (!r || !r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    out.push({ url: r.url, title: r.title || r.url });
  }
  return out;
}

// References must back a point actually shown: derive them from the points that
// survive, never from a raw reference union, so a capped-out point can't leave an
// orphan source in the list.
function refsFromSections(sections) {
  return dedupeRefs(
    (sections || [])
      .flatMap((sec) => sec.points || [])
      .filter((p) => p.cite && p.cite.url)
      .map((p) => ({ url: p.cite.url, title: p.cite.title })),
  );
}

// Merge freshly-sourced sections into what is already cached for a medicine, so
// repeated use deepens the stored knowledge. New points are appended (deduped by
// text); each section is capped so the cache cannot grow without bound.
function mergeSections(existing, incoming) {
  const byKey = new Map();
  for (const sec of existing || []) byKey.set(sec.key, { ...sec, points: sec.points.slice(0, 8) });
  for (const sec of incoming || []) {
    const cur = byKey.get(sec.key);
    if (!cur) { byKey.set(sec.key, { ...sec, points: sec.points.slice(0, 8) }); continue; }
    const have = new Set(cur.points.map((p) => normText(p.text)));
    for (const p of sec.points) {
      if (cur.points.length >= 8) break;
      if (have.has(normText(p.text))) continue;
      have.add(normText(p.text));
      cur.points.push(p);
    }
  }
  return [...byKey.values()].sort(bySectionOrder);
}

// Best-effort medicine image from Wikipedia's public REST API. Open-licensed and
// reliable, attributed clearly as a Wikipedia image (kept separate from the
// clinical text references). Returns null on anything unexpected — and only when
// the resolved article actually looks like the medicine — so we never show a
// wrong or placeholder image.
async function fetchMedicineImage(name) {
  const title = String(name || '').trim();
  if (!title) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(
      'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title),
      {
        signal: ctrl.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RiversidePracticeHelpdesk/1.0 (NHS GP practice medicines information tool)',
        },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.type && data.type !== 'standard') return null; // disambiguation, mainpage, etc.
    // Relevance gate: the resolved article must either match the typed name
    // (tolerating brand→generic redirects) or read like a medicine — otherwise a
    // name collision could surface an unrelated image.
    const desc = `${data.description || ''} ${data.extract || ''}`.toLowerCase();
    const isMed = /\b(medication|medicine|drug|antibiotic|analgesic|anti-?inflammatory|antidepressant|antihistamine|statin|inhaler|tablet|capsule|painkiller|nsaid|ssri|opioid|laxative|steroid)\b/.test(desc);
    const nameMatch = normText(data.title).includes(normText(title)) || normText(title).includes(normText(data.title));
    if (!isMed && !nameMatch) return null;
    const img = (data.thumbnail && data.thumbnail.source) || (data.originalimage && data.originalimage.source) || '';
    if (!img) return null;
    let host = '';
    try { host = new URL(img).hostname.toLowerCase(); } catch (e) { return null; }
    if (!/(^|\.)wikimedia\.org$/.test(host) && !/(^|\.)wikipedia\.org$/.test(host)) return null;
    const page = (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) || '';
    return { url: img, source: 'Wikipedia', sourcePage: page, alt: (data.title || title) + ' — illustrative image from Wikipedia' };
  } catch (e) {
    return null; // timeout or network error — image is optional
  } finally {
    clearTimeout(timer);
  }
}

// Call the model with web search and ground the reply. Returns
//   { ok, found, emergency, name, alsoKnownAs, summary, sections, references, queryAnswer }
// or { ok:false, reason } on a transport/parse failure. Errors are logged
// server-side, never echoed to the caller.
async function fetchFromModel({ apiKey, model, name, query, needsBase }) {
  const prompt = buildMedicationPrompt({ name, query, needsBase });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODEL_TIMEOUT_MS);
  let data;
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: OPENROUTER_HEADERS(apiKey),
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
        // Force a JSON object reply. Smaller/cheaper models otherwise sometimes
        // answer in prose ("Ibuprofen is a painkiller that…"), which has no JSON
        // to parse and made every such lookup wrongly read as "not found".
        response_format: { type: 'json_object' },
        tools: [
          {
            type: 'openrouter:web_search',
            parameters: {
              engine: 'exa',
              max_results: 8,
              search_context_size: 'high',
              allowed_domains: ALLOWED_SOURCE_DOMAINS,
            },
          },
        ],
        provider: NO_RETENTION,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[medication] OpenRouter error ${res.status}:`, detail.slice(0, 400));
      return { ok: false, reason: `OpenRouter error (${res.status})` };
    }
    data = await res.json();
  } catch (e) {
    console.error('[medication] model fetch failed:', e);
    return { ok: false, reason: 'Could not reach the medicines service.' };
  } finally {
    clearTimeout(timer);
  }

  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  const text = (msg && msg.content) || '';
  const annotations = (msg && Array.isArray(msg.annotations)) ? msg.annotations : [];
  if (!text) return { ok: false, reason: 'No information returned.' };

  const parsed = parseMedicationJson(text);
  if (!parsed.found) {
    return { ok: true, found: false, emergency: parsed.emergency, name: parsed.name || name, summary: (parsed.summary && parsed.summary.text) || '' };
  }
  const grounded = groundMedication(parsed, annotations);
  const sections = keepSourced(grounded.sectionsResolved);
  return {
    ok: true,
    found: true,
    emergency: parsed.emergency,
    name: parsed.name || name,
    alsoKnownAs: grounded.alsoKnownAs, // { text, cite } | null
    summary: grounded.summary,         // { text, cite } | null
    sections,
    references: refsFromSections(sections),
    queryAnswer: grounded.queryResolved
      ? { ...grounded.queryResolved, points: grounded.queryResolved.points.filter((p) => p.cite && p.cite.url) }
      : null,
  };
}

// A fixed urgent-help response. Bypasses the model and the citation filter
// entirely and is never cached, so urgent guidance is always shown verbatim.
function emergencyResponse({ slug, name, retrievedAt }) {
  return NextResponse.json({
    status: 'ok',
    slug,
    name,
    alsoKnownAs: null,
    summary: null,
    image: null,
    sections: [],
    references: [],
    query: '',
    queryAnswer: { question: '', emergency: true, safetyMessage: EMERGENCY_MESSAGE, points: [], references: [] },
    fromCache: false,
    retrievedAt,
  });
}

// Read one medicine's cached row. Returns the row, null when absent, or undefined
// on a hard read failure (so the caller can return a 500 rather than treat it as
// a miss and re-fetch needlessly).
async function readMedication(sql, slug) {
  try {
    const rows = await sql`SELECT name, data, queries, retrieved_at AS "retrievedAt" FROM medications WHERE slug = ${slug}`;
    return rows[0] || null;
  } catch (e) {
    console.error('[medication] cache read error:', e);
    return undefined;
  }
}

// Learn a spelling/synonym alias (typed name -> canonical slug) so the same typo
// is corrected instantly next time. Best-effort: never fatal.
async function rememberAlias(sql, alias, slug, name) {
  if (!alias || !slug || alias === slug) return;
  try {
    await sql`
      INSERT INTO medication_aliases (alias, slug, name)
      VALUES (${alias}, ${slug}, ${name || ''})
      ON CONFLICT (alias) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name
    `;
  } catch (e) { /* alias learning is an optimisation */ }
}

// Keep at most `max` cached questions per medicine, evicting the oldest.
function trimQueries(obj, max) {
  const entries = Object.entries(obj || {});
  if (entries.length <= max) return Object.fromEntries(entries);
  return Object.fromEntries(
    entries
      .sort((a, b) => String((b[1] && b[1].retrievedAt) || '').localeCompare(String((a[1] && a[1].retrievedAt) || '')))
      .slice(0, max),
  );
}

// Shape one cached/fresh medicine into the response the client renders.
// `correctedFrom` is the term the staff member actually typed when it was
// auto-corrected to this medicine (empty when no correction was made).
function buildResponse({ slug, name, data, queryEntry, query, fromCache, retrievedAt, correctedFrom }) {
  return NextResponse.json({
    status: 'ok',
    slug,
    name: data.name || name,
    correctedFrom: correctedFrom || '',
    alsoKnownAs: data.alsoKnownAs || null,
    summary: data.summary || null,
    image: data.image || null,
    sections: data.sections || [],
    references: data.references || [],
    query: query || '',
    queryAnswer: queryEntry || null,
    fromCache: !!fromCache,
    retrievedAt: retrievedAt || null,
  });
}

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  // This tool needs a model that reliably follows the "return JSON, grounded in
  // sources" instruction with the web-search tool. A dedicated var lets us use a
  // solid, cheap one here (e.g. openai/gpt-4.1-nano) without changing the global
  // OPENROUTER_AI_MODEL the Q&A tool and the vision RAG ingester rely on.
  const model = process.env.OPENROUTER_MEDICATION_MODEL || process.env.OPENROUTER_AI_MODEL;

  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (!name) return NextResponse.json({ error: 'A medicine name is required.' }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: 'That medicine name is too long.' }, { status: 400 });

  const typedSlug = slugify(name);
  if (!typedSlug) return NextResponse.json({ error: 'That medicine name could not be read.' }, { status: 400 });
  const qkey = normQuery(query);

  // 0) Emergency backstop — before anything else, before any model call, and
  //    never cached. The citation filter must never be able to suppress this.
  if (qkey && looksLikeEmergency(query)) {
    return emergencyResponse({ slug: typedSlug, name, retrievedAt: new Date().toISOString() });
  }

  let sql;
  try {
    await ensureMedicationSchema();
    sql = getSql();
  } catch (e) {
    console.error('[medication] schema/connection error:', e);
    return NextResponse.json({ error: 'The medicines cache is unavailable.' }, { status: 500 });
  }

  // 1) Resolve the typed name via a learned alias — a correction the model has
  //    already confirmed on a previous lookup — so a repeated misspelling or
  //    synonym is corrected instantly. We do NOT fuzzy-guess locally: drug names
  //    sit close together (prednisone/prednisolone, fluoxetine/fluvoxamine), so a
  //    distance heuristic could serve a DIFFERENT real medicine. The web-search
  //    model is the only corrector for a name we have not confirmed before.
  //    `correctedFrom` records the typed term when we change it, for the UI.
  let lookupSlug = typedSlug;
  let correctedFrom = '';
  try {
    const aliasRows = await sql`SELECT slug FROM medication_aliases WHERE alias = ${typedSlug}`;
    if (aliasRows[0] && aliasRows[0].slug && aliasRows[0].slug !== typedSlug) {
      lookupSlug = aliasRows[0].slug;
      correctedFrom = name;
    }
  } catch (e) { /* aliases are an optimisation */ }

  // 2) Read the cache for the resolved slug.
  const row = await readMedication(sql, lookupSlug);
  if (row === undefined) return NextResponse.json({ error: 'Could not read the medicines cache.' }, { status: 500 });

  // Treat the cache as a usable base only when it has at least one sourced
  // section — never serve an empty (zero-source) base as a permanent hit.
  let cachedData = row && row.data && Array.isArray(row.data.sections) && row.data.sections.length ? row.data : null;
  const cachedQuery = qkey && row && row.queries ? row.queries[qkey] : null;

  // 3) Pure cache hit — return instantly, no model call.
  if (cachedData && (!qkey || cachedQuery)) {
    return buildResponse({
      slug: lookupSlug,
      name: row.name,
      data: cachedData,
      queryEntry: cachedQuery || null,
      query,
      fromCache: true,
      retrievedAt: row.retrievedAt,
      correctedFrom,
    });
  }

  if (!apiKey || !model) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY or OPENROUTER_AI_MODEL.' }, { status: 500 });
  }

  // 4) Miss — fetch. The model gets the ORIGINAL typed name so it can correct and
  //    confirm the medicine by web search.
  const needsBase = !cachedData;
  // One retry: the web-search model call occasionally returns a transient
  // upstream error (a 5xx from the provider). A single retry turns most of those
  // into a successful answer instead of a "try again" the user has to trigger.
  let result = await fetchFromModel({ apiKey, model, name, query, needsBase });
  if (!result.ok) result = await fetchFromModel({ apiKey, model, name, query, needsBase });
  if (!result.ok) {
    return NextResponse.json({ status: 'error', message: 'Sorry, the medicines information could not be retrieved just now. Please try again.' }, { status: 502 });
  }

  // The model sometimes finds the medicine but its quotes don't verify against
  // the fetched passages, leaving nothing safe to show. When we have no cached
  // base to fall back on, one more attempt usually grounds cleanly — so retry
  // once rather than wrongly telling staff it "could not be verified".
  const groundedEmpty = (r) =>
    !((r.sections || []).length && (r.references || []).length)
    && !(r.queryAnswer && r.queryAnswer.points.length && r.queryAnswer.references.length);
  if (result.found && needsBase && groundedEmpty(result)) {
    const retry = await fetchFromModel({ apiKey, model, name, query, needsBase });
    if (retry.ok && retry.found && !groundedEmpty(retry)) result = retry;
  }

  // Secondary emergency catch: a question the model judged an emergency. Not
  // cached; urgent guidance shown instead of an answer.
  if (qkey && result.emergency) {
    return emergencyResponse({ slug: lookupSlug, name: result.name || name, retrievedAt: new Date().toISOString() });
  }

  if (!result.found) {
    return NextResponse.json({
      status: 'not_found',
      slug: typedSlug,
      name: result.name || name,
      message: result.summary || `“${name}” could not be found in the NHS, BNF or eMC sources. Check the spelling and try again.`,
    });
  }

  // 5) Correct via the model: its canonical name is authoritative (web-searched).
  //    If it differs from what we searched under, re-key onto the canonical slug,
  //    learn the alias for next time, and merge into the CANONICAL entry only —
  //    never inherit a different medicine's cached data.
  const canonicalName = ((result.name || name).replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()) || (result.name || name);
  let storeSlug = lookupSlug;
  let skipCacheWrite = false;
  const modelSlug = slugify(canonicalName);
  if (modelSlug && modelSlug !== lookupSlug) {
    storeSlug = modelSlug;
    // Flag a correction only when the names genuinely differ (not mere spacing or
    // hyphenation), so we never show a false "you searched ...".
    if (!correctedFrom && normLoose(name) !== normLoose(canonicalName)) correctedFrom = name;
    await rememberAlias(sql, typedSlug, modelSlug, canonicalName);
    // Re-read the CANONICAL entry; the looked-up slug's data may belong to a
    // different medicine, so it is never used as the merge base here.
    const canon = await readMedication(sql, storeSlug);
    if (canon === undefined) {
      // Couldn't verify the canonical row — don't risk overwriting it.
      cachedData = null;
      skipCacheWrite = true;
    } else {
      cachedData = (canon && canon.data && Array.isArray(canon.data.sections) && canon.data.sections.length) ? canon.data : null;
    }
  }

  // References are crucial: never present medicines information with no real
  // source behind it (unless we are deepening an already-sourced cached entry).
  const hasBaseSources = (result.sections || []).length && (result.references || []).length;
  const hasQuerySources = result.queryAnswer && result.queryAnswer.points.length && result.queryAnswer.references.length;
  if (!cachedData && !hasBaseSources && !hasQuerySources) {
    return NextResponse.json({ status: 'error', message: 'The information found could not be verified against a trusted source, so it was not shown. Please try again.' }, { status: 502 });
  }

  const nowIso = new Date().toISOString();
  const image = !cachedData ? await fetchMedicineImage(canonicalName) : cachedData.image;

  // 6) Persist. Build/refresh the general data, then append the question.
  let data;
  if (cachedData) {
    const mergedSections = mergeSections(cachedData.sections, result.sections);
    data = {
      ...cachedData,
      // Deepen the stored knowledge with any newly sourced facts; references
      // always track exactly the points that survive the merge.
      sections: mergedSections,
      references: refsFromSections(mergedSections),
      image: cachedData.image || image || null,
    };
  } else {
    data = {
      name: result.name || name,
      alsoKnownAs: result.alsoKnownAs || null,
      summary: result.summary || null,
      image: image || null,
      sections: result.sections,
      references: result.references,
      retrievedAt: nowIso,
    };
  }

  let queryEntry = null;
  if (qkey) {
    if (hasQuerySources) {
      queryEntry = {
        question: (result.queryAnswer && result.queryAnswer.question) || query,
        points: result.queryAnswer.points,
        references: result.queryAnswer.references,
        retrievedAt: nowIso,
      };
    } else {
      // The general info was retrieved but the specific question could not be
      // answered from a trusted source — say so honestly without caching it.
      queryEntry = { question: query, points: [], references: [], unanswered: true, retrievedAt: nowIso };
    }
  }

  // skipCacheWrite is set when the canonical row couldn't be read during re-key —
  // writing then could clobber a real entry with a single fresh fetch.
  if (!skipCacheWrite) {
    try {
      await sql`
        INSERT INTO medications (slug, name, data, retrieved_at, updated_at)
        VALUES (${storeSlug}, ${data.name || name}, ${JSON.stringify(data)}::jsonb, now(), now())
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, data = EXCLUDED.data, updated_at = now()
      `;
      // Only cache a question we could actually answer from sources, and keep at
      // most MAX_QUERIES per medicine (evicting the oldest). Read the current
      // questions first so re-keying onto an existing canonical never wipes them.
      if (qkey && queryEntry && !queryEntry.unanswered) {
        const cur = await sql`SELECT queries FROM medications WHERE slug = ${storeSlug}`;
        const merged = { ...((cur[0] && cur[0].queries) || {}), [qkey]: queryEntry };
        const trimmed = trimQueries(merged, MAX_QUERIES);
        await sql`UPDATE medications SET queries = ${JSON.stringify(trimmed)}::jsonb, updated_at = now() WHERE slug = ${storeSlug}`;
      }
    } catch (e) {
      console.error('[medication] cache write error:', e);
      // Caching is an optimisation — still return the answer we have.
    }
  }

  return buildResponse({
    slug: storeSlug,
    name: data.name || name,
    data,
    queryEntry,
    query,
    fromCache: false,
    retrievedAt: nowIso,
    correctedFrom,
  });
}
