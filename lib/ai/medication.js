// Prompt construction, response parsing and citation grounding for the
// Medication Check tool. Pure functions — no I/O, no React — so the wording is
// easy to review in one place (mirrors lib/ai/prompt.js).
//
// Unlike the Practice Q&A tool, which is grounded in the practice's OWN
// documents, this tool answers from authoritative UK public medicines sources
// (the NHS website medicines section, the BNF / NICE, and the electronic
// Medicines Compendium — SPC/PIL). The model is given OpenRouter's web-search
// server tool; it must base every point on a source it actually retrieved and
// attach that source's URL plus a short verbatim quote. groundMedication() then
// verifies each quote against the real fetched passages (the response
// annotations) before a citation is attached, and the route drops any point that
// is not verified, so every claim shown is backed by a genuine, checkable source
// — references are never invented and an unverifiable point is never displayed.
import { normForMatch, quoteContainment } from './quote-match';

// The minimum containment score for a quote to count as verified. Higher than
// /api/ask's threshold (0.5): this tool makes medical claims, so we require the
// quote to be almost entirely present in the source, not just its opening run.
const VERIFY_THRESHOLD = 0.85;

// The authoritative UK domains the web search is restricted to. Keeping the
// search on these sources is what makes the answers trustworthy and the
// references suitable for an NHS GP practice.
export const ALLOWED_SOURCE_DOMAINS = [
  'nhs.uk',
  'bnf.nice.org.uk',
  'nice.org.uk',
  'medicines.org.uk', // electronic Medicines Compendium (eMC) — SPCs and PILs
];

// The general sections we ask for, in order. "plain" sections are written for
// non-clinical reception/admin staff and shown first; "clinical" sections carry
// the deeper detail and are revealed on demand in the UI.
export const SECTION_ORDER = [
  'uses',
  'how_to_take',
  'side_effects',
  'storage',
  'warnings',
  'cautions',
  'interactions',
  'pregnancy',
];

const SECTION_TITLES = {
  uses: "What it's used for",
  how_to_take: 'How and when to take it',
  side_effects: 'Common side effects',
  storage: 'Storage and handling',
  warnings: 'Important warnings',
  cautions: 'Cautions — who should check first',
  interactions: 'Interactions with other medicines',
  pregnancy: 'Pregnancy and breastfeeding',
};

const PLAIN_SECTIONS = new Set(['uses', 'how_to_take', 'side_effects', 'storage', 'warnings']);

function sectionTitle(key) { return SECTION_TITLES[key] || 'About this medicine'; }
function isPlainSection(key) { return PLAIN_SECTIONS.has(key); }

// The assistant's standing instructions. The reader is any member of practice
// staff, including non-clinical reception and admin. The tool gives GENERAL
// medicines information from public UK sources — never advice about a specific
// patient.
const SYSTEM_INTRO =
  'You are the medicines information assistant for The Riverside Practice, an NHS GP surgery. You give clear, factual, general information about a medicine for ALL staff — including non-clinical reception and admin staff — so they understand what a medicine is and can talk about it confidently.\n\n'
  + 'You answer ONLY from authoritative UK public sources: the NHS website medicines section (nhs.uk), the BNF / NICE (bnf.nice.org.uk, nice.org.uk), and the electronic Medicines Compendium — SPCs and patient information leaflets (medicines.org.uk). Use the web search tool to find current information from these sources, and base every single point on something you actually read in a source.\n\n'
  + 'Write in plain British English in the NHS style: calm, sentence case, short sentences, no emoji, and no marketing words like "simply" or "easy". Explain any unavoidable medical term in plain words.\n\n'
  + 'CRITICAL — this is GENERAL information, not advice about a specific patient. Do NOT make clinical decisions, do NOT tell anyone what dose to take, and do NOT diagnose. You may state general facts that a source gives (for example the standard adult dose the NHS or BNF lists), but always as what the source says, attributed to it — never as an instruction. If a question turns on whether the medicine, a dose or a combination is right for a particular individual — their age, pregnancy, other medicines or a condition, whether or not a name is given — still give the relevant general fact the source states, but make clear that whether it suits that person is a decision for a clinician (the prescriber, pharmacist or duty doctor) and point staff to the BNF or a pharmacist. Never give a yes/no answer for a specific person.\n\n'
  + 'If the question itself could describe a medical emergency (for example an overdose, a severe allergic reaction, difficulty breathing or collapse), set "emergency" to true and do not attempt to answer it — the tool will show urgent-help guidance instead.\n\n'
  + 'If the medicine name looks misspelt, abbreviated, or is a brand or colloquial name (for example "paracitalmol", "amoxil", "calpol"), work out the medicine the staff member most likely means, confirm it with web search, and return its correct, usual UK name in "name". Treat "found" as false ONLY if you genuinely cannot identify any real medicine it could be.\n\n'
  + 'NEVER invent a source URL or a quote. Every quote MUST be copied word for word from a page you actually retrieved with the search tool. If you cannot find authoritative information for the medicine, set "found" to false and say so briefly.';

// The exact JSON shape we want back, with the per-point grounding rule.
const JSON_SHAPE =
  'Return ONLY valid JSON — no markdown fences, no commentary — with this exact shape:\n'
  + '{\n'
  + '  "found": true,\n'
  + '  "emergency": false,\n'
  + '  "name": "the medicine\'s usual name, properly capitalised",\n'
  + '  "alsoKnownAs": { "text": "common brand or alternative names, comma separated", "url": "https://...", "quote": "verbatim words from that page listing the names" },\n'
  + '  "summary": { "text": "one or two plain sentences: what it is and what it is mainly used for", "url": "https://www.nhs.uk/medicines/...", "quote": "verbatim words from that page" },\n'
  + '  "sections": [\n'
  + '    { "key": "uses", "title": "What it\'s used for", "points": [ { "text": "one clear fact in plain English", "url": "https://www.nhs.uk/medicines/...", "quote": "a short run of words copied EXACTLY from that page that backs this point" } ] }\n'
  + '  ],\n'
  + '  "queryAnswer": { "question": "the staff member\'s question", "points": [ { "text": "...", "url": "...", "quote": "..." } ] }\n'
  + '}\n\n'
  + 'RULES:\n'
  + '- Use these section keys when you have sourced information for them, in this order: ' + SECTION_ORDER.join(', ') + '. Put the everyday information first (uses, how_to_take, side_effects, storage, warnings) and the more clinical detail after (cautions, interactions, pregnancy). Omit a section if you have no sourced facts for it. Keep each section to 2–6 points.\n'
  + '- GROUNDING — for EVERY point, AND for "summary" and "alsoKnownAs", you MUST provide both: (a) "url" — the exact source page you took it from; and (b) "quote" — a SHORT run of words copied VERBATIM (word for word, not reworded) from THAT page, proving it. If you cannot quote a source for a point, leave the point out. If you cannot quote a source for "alsoKnownAs", omit it.\n'
  + '- Only use URLs on these domains: ' + ALLOWED_SOURCE_DOMAINS.join(', ') + '.\n'
  + '- Be detailed but clear: write reference information ABOUT the medicine in general, in plain enough English that a non-clinical staff member with no medical training understands it. Do NOT write it as direct instructions to a patient; phrase anything about doses as what the source states (for example "the BNF lists the usual adult dose as ...") and never as an instruction to take something.\n'
  + '- Include "queryAnswer" ONLY if a specific question is asked below; answer it with grounded general facts the same way. If the question is about whether the medicine, a dose or a combination is suitable for a particular individual (their age, pregnancy, other medicines or a condition), give the relevant general fact but add that suitability for that person is for the prescriber or pharmacist to decide and point to the BNF — do not give a yes/no for the individual. If no question is asked, omit "queryAnswer" entirely.\n'
  + '- If you cannot find authoritative information, return {"found": false, "name": "<the name as given>", "summary": {"text": "one short sentence saying it could not be found in NHS, BNF or eMC sources"}, "sections": []}.';

// Build the prompt for one medicine (with an optional specific question).
//   name      - the medicine the staff member typed
//   query     - an optional specific question about it ('' for general info only)
//   needsBase - whether we still need the general sections (false when we already
//               have them cached and only the new question is missing)
export function buildMedicationPrompt({ name, query = '', needsBase = true }) {
  const q = (query || '').trim();
  let prompt = SYSTEM_INTRO + '\n\n';
  prompt += 'The medicine to look up is: "' + String(name || '').trim() + '"\n\n';

  if (q) {
    prompt += 'The staff member has a specific question about it: "' + q + '"\n';
    if (needsBase) {
      prompt += 'Answer that question in "queryAnswer", AND also provide the general sections about the medicine. Keep to the standing rules above.\n\n';
    } else {
      prompt += 'Answer that question in "queryAnswer", keeping to the standing rules above. You may also include any general sections that add useful context, but the question is the priority.\n\n';
    }
  } else {
    prompt += 'No specific question was asked — provide the general information sections about this medicine.\n\n';
  }

  prompt += 'First use the web search tool to read the authoritative sources, then ' + JSON_SHAPE;
  return prompt;
}

// ---- Parsing -------------------------------------------------------------

function cleanStr(v) { return typeof v === 'string' ? v.trim() : ''; }

// A grounded text field: { text, url, quote }. Accepts a bare string for
// resilience (it then carries no source and will be dropped by grounding).
function parsePointObject(raw) {
  if (raw && typeof raw === 'object') {
    return { text: cleanStr(raw.text), url: cleanStr(raw.url), quote: typeof raw.quote === 'string' ? raw.quote : '' };
  }
  if (typeof raw === 'string') return { text: raw.trim(), url: '', quote: '' };
  return { text: '', url: '', quote: '' };
}

function parsePoints(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(parsePointObject).filter((p) => p.text);
}

// Parse the model's reply into a known shape. Tolerates stray markdown fences and
// returns { found:false } when the JSON can't be read, so the route declines
// cleanly rather than showing junk.
export function parseMedicationJson(raw) {
  let str = (raw || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const a = str.indexOf('{');
  const b = str.lastIndexOf('}');
  if (a !== -1 && b !== -1) str = str.slice(a, b + 1);
  try {
    const o = JSON.parse(str);
    const found = o.found === false ? false : true;
    const sections = Array.isArray(o.sections)
      ? o.sections
          .map((sec) => (sec && typeof sec === 'object'
            ? { key: cleanStr(sec.key) || 'about', title: cleanStr(sec.title), points: parsePoints(sec.points) }
            : null))
          .filter((sec) => sec && sec.points.length)
      : [];
    let queryAnswer = null;
    if (o.queryAnswer && typeof o.queryAnswer === 'object') {
      const points = parsePoints(o.queryAnswer.points);
      queryAnswer = { question: cleanStr(o.queryAnswer.question), points };
    }
    return {
      found,
      emergency: o.emergency === true,
      name: cleanStr(o.name),
      alsoKnownAs: parsePointObject(o.alsoKnownAs),
      summary: parsePointObject(o.summary),
      sections,
      queryAnswer,
    };
  } catch (e) {
    return { found: false, emergency: false, name: '', alsoKnownAs: { text: '', url: '', quote: '' }, summary: { text: '', url: '', quote: '' }, sections: [], queryAnswer: null };
  }
}

// ---- Citation grounding --------------------------------------------------
// The Sources are the web-search result passages (the response annotations).

const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
};

// Whether a URL sits on one of the allowed authoritative domains.
function isAllowedSourceUrl(url) {
  const h = hostOf(url);
  if (!h) return false;
  return ALLOWED_SOURCE_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
}

// Resolve one point to a VERIFIED citation, or none. `annotations` is the array
// of real fetched passages: [{ url, title, content }]. We find the passage whose
// content actually contains the model's quote (>= VERIFY_THRESHOLD) and cite THAT
// passage's real URL + title, correcting a wrong URL. There is deliberately NO
// fallback to an unverified URL: if the quote does not verify against a fetched
// allowed-domain passage, the point gets no citation and the route then drops it,
// so a medical claim is never shown with a source that does not actually back it.
// The stored quote is kept only when the WHOLE quote is verbatim-contained, so a
// cached quote is always genuinely verbatim (never a half-fabricated tail).
//   Returns { text, cite: { url, title, quote } | null }.
function resolvePoint(point, annotations) {
  const quoteN = normForMatch(point.quote);
  let best = null;
  let bestScore = 0;
  let bestBodyN = '';
  if (quoteN.length >= 12) {
    for (const an of annotations) {
      const bodyN = normForMatch(an.content);
      const score = quoteContainment(quoteN, bodyN) + (an.url === point.url ? 0.001 : 0); // nudge to model's pick on a tie
      if (score > bestScore) { bestScore = score; best = an; bestBodyN = bodyN; }
    }
  }
  if (best && bestScore >= VERIFY_THRESHOLD && isAllowedSourceUrl(best.url)) {
    const exact = bestBodyN.includes(quoteN);
    return { text: point.text, cite: { url: best.url, title: best.title || hostOf(best.url), quote: exact ? point.quote.trim() : '' } };
  }
  return { text: point.text, cite: null };
}

function resolvePoints(points, annotations) {
  return (points || []).map((p) => resolvePoint(p, annotations));
}

// Build the deduped list of distinct sources actually used by a set of resolved
// points — the "references" shown for a medicine. Real, verified URLs only.
function collectReferences(resolvedPointGroups) {
  const seen = new Set();
  const refs = [];
  for (const group of resolvedPointGroups) {
    for (const p of group) {
      if (!p.cite || !p.cite.url) continue;
      if (seen.has(p.cite.url)) continue;
      seen.add(p.cite.url);
      refs.push({ url: p.cite.url, title: p.cite.title });
    }
  }
  return refs;
}

// Turn a parsed model reply + the response annotations into the grounded,
// citation-verified shapes the API returns and the cache stores. summary and
// alsoKnownAs are grounded too and returned only when verified.
//   { summary, alsoKnownAs, sectionsResolved, queryResolved, references }
export function groundMedication(parsed, annotationsRaw) {
  const annotations = (Array.isArray(annotationsRaw) ? annotationsRaw : [])
    .map((a) => (a && a.url_citation ? a.url_citation : a))
    .filter((a) => a && a.url)
    .map((a) => ({ url: cleanStr(a.url), title: cleanStr(a.title), content: typeof a.content === 'string' ? a.content : '' }));

  const groundField = (field) => {
    if (!field || !field.text) return null;
    const r = resolvePoint(field, annotations);
    return r.cite ? r : null; // shown only when its source verifies
  };

  const sectionsResolved = (parsed.sections || []).map((sec) => ({
    key: sec.key,
    tier: isPlainSection(sec.key) ? 'plain' : 'clinical',
    title: sec.title || sectionTitle(sec.key),
    points: resolvePoints(sec.points, annotations),
  }));

  let queryResolved = null;
  if (parsed.queryAnswer) {
    const points = resolvePoints(parsed.queryAnswer.points, annotations);
    queryResolved = {
      question: parsed.queryAnswer.question,
      points,
      references: collectReferences([points]),
    };
  }

  const references = collectReferences(sectionsResolved.map((s) => s.points));
  return {
    summary: groundField(parsed.summary),
    alsoKnownAs: groundField(parsed.alsoKnownAs),
    sectionsResolved,
    queryResolved,
    references,
  };
}
