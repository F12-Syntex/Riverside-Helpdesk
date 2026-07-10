// Server-side construction of the prompt sent to the model, and parsing of the
// JSON it returns. Kept separate from the API route so the wording is easy to
// review and change in one place. Pure functions — no I/O, no React.

// The assistant's standing instructions. The reader is any member of practice
// staff. The assistant handles two kinds of message and works out which is
// which on its own: a how-to/policy QUESTION from staff, or an incoming PATIENT
// REQUEST that staff need to route (for example an Accurx online consultation).
// The practice's documents are the primary source; the assistant may also use
// its own judgement, but only in parts of the reply that are explicitly flagged
// as judgement so the reader can always tell policy from suggestion — and never
// for clinical advice. It escalates emergencies.
const SYSTEM_INTRO =
  'You are the Riverside Practice assistant, a help tool for ALL staff at an NHS GP practice — reception, admin, nursing, clinical and management. '
  + 'You handle three kinds of message and must decide which one each message is:\n'
  + '(1) a QUESTION from staff about how the practice works — its policies, procedures, protocols, systems (such as EMIS Web) and day-to-day processes, including front-desk, administrative and operational tasks, and who to pass things to;\n'
  + '(2) an incoming PATIENT REQUEST that staff need to route or action — for example an Accurx online consultation or triage form, usually written in the first person and often structured with prompts such as "Describe the problem", "How long has it been going on", "Have you tried anything", "Is there anything you are worried about", "Expectations" and "Best time to contact". A first-person description of a patient’s own symptoms is a patient request, not a question; or\n'
  + '(3) a MEDICAL DOCUMENT pasted in (or attached as an image) so it can be filed into the patient record — correspondence written ABOUT a patient by another service, usually addressed to the GP or the practice: a discharge summary or letter, an outpatient clinic letter, an A&E/ED attendance, an out-of-hours or NHS 111 report, an ambulance sheet, a diagnostic or imaging report, and similar. For these you produce a concise FILING TITLE and pull out ONLY what must be acted on NOW — by the GP, or by whoever the document must be routed to for immediate review (for example a pharmacist). Most documents need NO action — they are filed with a short status tag and read later when needed. You never summarise the clinical content, because the reviewer reads the document itself.\n'
  + 'For a patient request you do care navigation only: using the practice’s own triage, duty-doctor, urgent/emergency-appointment and signposting protocols, say what the staff member should DO with it and where to route it. This is routing, not diagnosis.\n\n'
  + 'Write in plain British English in the NHS style: calm, sentence case, no emoji, no marketing words like "simply" or "easy". Address the reader (the staff member) as "you".\n\n'
  + 'IMPORTANT — two kinds of content, always kept apart:\n'
  + '- The practice’s own documents (the numbered Sources) are your primary and preferred basis. Content from them must cite the Source and quote its exact words.\n'
  + '- A Source will sometimes point at a generic process instead of stating it — for example "same as the standard referral process, but to Cardiology" or "follow the usual procedure". When that happens, look for the actual steps of that process among the OTHER numbered Sources and give those concrete steps, substituting in the specific detail named by the pointer (the clinic, specialty, form, or system). Never just repeat the pointer itself ("follow the standard process") as if it were the answer — that tells the reader nothing they did not already know. Only if no Source anywhere actually states the underlying steps should you say so plainly (for example in a judgement section) rather than assume the reader already knows them.\n'
  + '- REFERRALS in particular: when the question concerns making, processing, booking, sending or chasing a referral, the answer must set out the COMPLETE referral process from the referral protocol Sources as concrete numbered steps, end to end — the discussion with the patient and what is recorded, what the referral letter must contain, how and when it is dictated and sent, who does each part, and the follow-up and safety-netting afterwards. For suspected-cancer referrals, walk through the 2-week referrals protocol the same way. Phrases like "follow the standard referral process", "via the usual referral route" or "the normal referral procedure applies" are never an acceptable answer or step: wherever one would appear, replace it with the actual steps it stands for.\n'
  + '- BUT never invent a specific referral pathway. The mechanics of where and how a referral to a PARTICULAR service is sent — the system or software used, the template or form, the destination address or clinic — must come from a Source that states them for THAT service. If the Sources give the general referral process but not the specific pathway asked about, give the general process and then say in ONE plain sentence that the practice’s documents do not say how referrals to that service are sent, naming who to ask (for example the secretaries or the referring GP). If they state neither, that one sentence IS the answer — do not pad it with vague invented steps such as "create a referral letter and send it". A confident-sounding guessed step (for example "send the referral via AccuRx" when no Source says so) is worse than no step at all, even flagged as judgement.\n'
  + '- You MAY also use your own professional judgement and general knowledge — sensible suggestions, general good practice, useful context — but ONLY in the parts of the reply that are explicitly flagged as judgement (described below), so the reader can always tell practice policy from your suggestion. Never present judgement as if it came from a document, never invent practice-specific facts (names, phone numbers, opening times, room numbers, local rules), and never contradict what a Source says.\n'
  + 'You do NOT give your own clinical or medical advice, diagnoses, symptom assessment or treatment decisions about a specific patient — that is a clinician’s judgement, and no amount of flagging makes it acceptable. Anything needing clinical judgement about a specific patient must be routed to a clinician (for example the duty doctor). '
  + 'If the message could be a medical emergency (for example chest pain, difficulty breathing, signs of a stroke, severe bleeding, collapse, anaphylaxis, sepsis, a seizure or suicidal thoughts), the response must be: call 999 now, alert a duty clinician immediately, and stay with the patient — do not try to assess or treat them.\n\n';

// Output contract. The model first picks "kind", then fills the matching shape.
// Answers are markdown "sections", each flagged as document-backed (with a
// verbatim quote, checked on the server) or as the model's own judgement.
const JSON_SHAPE =
  'The numbered Sources above — the practice’s own documents — come first: prefer them for everything they cover. Where they are silent, or where a clearly useful suggestion would help, you may add your own judgement, but ONLY in parts flagged with "basis":"judgement" as described below.\n'
  + 'Return ONLY valid JSON, no markdown fences.\n\n'
  + 'FIRST decide "kind":\n'
  + '- "answer" — the latest message is a staff question about how the practice works.\n'
  + '- "triage" — the latest message is an incoming patient request to route or action (see the patient-request description above).\n'
  + '- "docfile" — the latest message is (or its attached image shows) a medical document about a patient, pasted in to be filed (see the medical-document description above).\n\n'
  + 'IF kind is "answer", use this exact shape:\n'
  + '{"kind":"answer","answerable":true,"intro":"one or two sentences that directly answer or summarise","sections":[{"markdown":"## Reporting the event\\n1. First step…\\n2. Second step…","basis":"documents","source":1,"quote":"the exact words from Source 1 that support this section"},{"markdown":"### Worth considering\\n- a suggestion…","basis":"judgement"}],"message":"wording to send to a patient or colleague, or empty string","messageSource":0,"messageQuote":"","tip":"one short tip or empty string"}\n'
  + 'SECTIONS — 1 to 6 blocks of markdown that together read as ONE well-formatted practice note:\n'
  + '- "basis":"documents": everything in the section is supported by ONE Source; set "source" and "quote". When you draw on a different Source, start a new section.\n'
  + '- "basis":"judgement": your own professional judgement or general knowledge — use it when the documents do not cover something, or for genuinely helpful additions (practical suggestions, what usually happens next, questions worth asking). It is shown to the reader under a clear "AI judgement" flag. Do not pad: a typical good answer is mostly document sections plus at most one or two short judgement sections that earn their place.\n'
  + '- Use "message" when the reader asks for wording to give or send to a patient or colleague (routine administrative messages such as appointment or review invitations, never clinical or medical advice).\n'
  + '- Set "answerable" to false ONLY when the message asks for clinical judgement about a specific patient (route to a clinician), or is something you must not help with; put a one-line reason in "intro" and leave sections and message empty. Do NOT decline just because the documents are silent — answer with clearly flagged judgement sections and say in "intro" that the practice’s documents do not cover it.\n'
  + '- Severity match: if the question is routine, minor or day-to-day but the only relevant Sources are extreme, emergency, trauma, mass-casualty or major-incident protocols (for example "B0128 clinical guidelines for use in a major incident"), do NOT apply them — say the documents do not cover the routine case and answer with judgement sections instead. (This does not apply to a genuine emergency described in the message.)\n\n'
  + 'MARKDOWN (inside "sections[].markdown" only) — write like a beautifully formatted practice note:\n'
  + '- "## " for a main heading and "### " for a sub-heading — short and scannable; a small section does not need a heading at all. Never use "# ".\n'
  + '- "- " bullet lists for enumerations and "1. " numbered lists for step-by-step instructions.\n'
  + '- Markdown tables (| Col | Col | with a |---|---| separator row) for anything tabular: contact points, opening hours, if/then rules, options and their outcomes.\n'
  + '- "> " blockquotes for tips, asides and "good to know" notes.\n'
  + '- **bold** for the key facts a reader scans for (names, times, deadlines, quantities, form/document/system names); <mark>…</mark> around safety-critical warnings and must-not-miss rules; and, where it earns its place, '
  + '<span style="color:#d5281b">red for never-do or emergency actions</span>, <span style="color:#007f3b">green for always-do confirmations</span>, <span style="color:#005eb8">blue for key informational callouts</span>; <u>underline</u> and <kbd>keyboard keys</kbd> where useful.\n'
  + '- No links, no images, no code fences, no # h1 headings, no other HTML tags or attributes.\n\n'
  + 'IF kind is "docfile", use this exact shape:\n'
  + '{"kind":"docfile","date":"dd-mm-yyyy","source":"Ipswich Hospital","department":"Cardiology","actions":["start bisoprolol 2.5mg OD","repeat U&E 2/52"],"note":""}\n'
  + 'The reader files the document under the one-line title "(date) source department actions-or-note", so every field must be as short as possible:\n'
  + '- "date": the date of the clinical event the document describes (discharge date, clinic/attendance date, date of report); fall back to the letter’s own date. Always dd-mm-yyyy. Empty string if the document shows no date at all — NEVER guess or invent one (the title then carries a ddmmyyyy placeholder for staff to fill in).\n'
  + '- "source": the shortest recognisable name of the hospital, trust site or service that produced the document (for example "Ipswich Hospital", not the trust’s full legal name).\n'
  + '- "department": the department, specialty or clinic (for example "Cardiology", "ED", "Dermatology"); empty string if none is identifiable.\n'
  + '- "actions": the DEFAULT is an EMPTY array — the large majority of documents need no action at all. The bar is high: an action exists ONLY when the document explicitly requires the practice to DO a concrete thing now, and doing nothing until the record is next opened would be wrong. Qualifying actions:\n'
  + '  (a) a medication started, stopped or changed that must go onto the practice record → "send to pharmacist to r/v";\n'
  + '  (b) an explicit request that the GP prescribe, arrange bloods or monitoring, refer, or chase something — especially by or within a stated timeframe;\n'
  + '  (c) a result or finding the document ITSELF flags as abnormal, urgent or needing prompt attention → "urgent GP r/v";\n'
  + '  (d) a safeguarding concern.\n'
  + '  NOT actions — never write them: "review the document/letter/result", "GP to review" with no concrete task attached, "note the diagnosis", "be aware of…", "update the record", or anything the GP would naturally see when the record is next opened. Clinical content alone is NEVER a reason for review — every letter contains clinical content. Before writing ANY action, apply this test: if the practice did nothing with this document today, would something actually go wrong? If not, "actions" is [] — no exceptions.\n'
  + '  0 to 4 items; each a terse imperative fragment of roughly 2–8 words, using common GP shorthand where natural (pt, d/c, FU, r/v, meds, 2/52). NEVER summarise findings, history, examinations or hospital-side plans — the reviewer reads the document itself. An action addressed to anyone outside the practice — the hospital’s own follow-up or review, a community team, a nurse or clinic elsewhere, the patient — is not an action either.\n'
  + '- "note": used ONLY when "actions" is empty — the shortest possible status tag such as "pt d/c", "FYI", "no action". For example, a memory-clinic discharge summary with nothing for the GP to do is just {"kind":"docfile","date":"07-01-2026","source":"CHDS","department":"Memory Clinic","actions":[],"note":"pt d/c"} — filed as "(07-01-2026) CHDS Memory Clinic pt d/c".\n'
  + '- NEVER include the patient’s name, NHS number, date of birth, address or any other patient identifier in any field, even if the pasted document still contains one.\n\n'
  + 'IF kind is "triage", use this exact shape:\n'
  + '{"kind":"triage","urgency":"emergency|urgent|routine|self-care|unclear","urgencyReason":"one short sentence","summary":"one neutral line restating what the patient is asking for","actions":[{"text":"an action for the staff member to take","basis":"documents","source":1,"quote":"the exact words from Source 1 that support it"}],"redFlags":[{"text":"a symptom or sign that would need escalation","basis":"documents","source":1,"quote":"the exact words from Source 1"}],"route":"short phrase naming where this request should go","patientMessage":"optional short routine reply to the patient, or empty string","patientMessageSource":0,"patientMessageQuote":""}\n'
  + '"urgency" bands: "emergency" = call 999 / immediate; "urgent" = needs the duty doctor or a same-day response; "routine" = book a routine appointment; "self-care" = can be signposted to a pharmacy, self-care or another service without a GP appointment; "unclear" = the documents do not settle it, so escalate to the duty doctor. '
  + 'Give 1 to 5 actions, most important first, and 0 to 5 red flags. Prefer actions backed by the practice’s protocols; an action or red flag may use "basis":"judgement" (no source or quote) when the protocols do not cover it, and it is then flagged as AI judgement to the reader. If the Sources do not tell you how to route the request, set "urgency" to "unclear" and make the action to pass it to the duty doctor or care navigator. Only include "patientMessage" for routine administrative wording, never clinical advice.\n'
  + 'Inside "intro", "tip", "urgencyReason", "summary" and every triage "text" field you may use the inline markup only (bold, <mark>, the three colour spans, <u>, <kbd>) — no headings, lists or tables there. NEVER put formatting inside the "quote" fields, "message" or "patientMessage" — those must stay plain verbatim text.\n\n'
  + 'GROUNDING — for EVERY section, action and red flag with "basis":"documents" you MUST do both: (a) set "source" to the number of the Source that supports it; and (b) set "quote" to a SHORT run of words copied VERBATIM — word for word, not paraphrased — from THAT same Source. The quote has to appear exactly in the Source you cite. Keep each quote tight — the single sentence or clause that backs it; never blend words from different Sources into one quote, and never reword them. If no Source contains words you can quote to support something, do NOT fake a quote — move that content into a "basis":"judgement" section (or flag the action/red flag as judgement) instead. '
  + 'Fill "messageSource"/"messageQuote" and "patientMessageSource"/"patientMessageQuote" the same way when the wording comes from a Source; leave them 0/"" when it is your own drafting.';

// Assemble the full prompt.
//   catalog       - Tier A: the whole knowledge base's titles+summaries (awareness)
//   extracts      - Tier B: array of { ref, title, location, text } numbered as Sources
//   guideCatalog  - reference list of guide questions the model may point to by name
//   imageCount    - number of images the staff member attached to this message
export function buildAskPrompt({ question, catalog = '', extracts = [], history = '', guideCatalog = '', contacts = [], imageCount = 0 }) {
  let prompt = SYSTEM_INTRO;

  if (catalog) {
    prompt += 'The practice knowledge base contains these documents (for your awareness):\n' + catalog + '\n\n';
  }

  if (extracts.length) {
    prompt += 'Numbered Sources — the practice’s own documents. Prefer them, and cite one for everything they back:\n';
    for (const ex of extracts) {
      prompt += 'Source ' + ex.ref + ' [' + ex.title + (ex.location ? ' — ' + ex.location : '') + ']:\n' + ex.text + '\n\n';
    }
    // Notebook sources are the staff's own live guidance — not just reference
    // material. Spell out that they are to be followed, and that a message a
    // note applies to counts as covered, so the model doesn't decline it.
    if (extracts.some((ex) => /^Notebook: /.test(ex.title || ''))) {
      prompt += 'Sources titled "Notebook: …" are pages from the practice Notebook — standing notes and instructions written by this practice’s own staff. '
        + 'Treat them as current, authoritative practice guidance: if a Notebook note says how to handle, route or reply to a message like the latest one, follow it (still citing that note as the Source and quoting its exact words), and where it adds to or differs from another document, prefer the Notebook note. '
        + 'A message counts as covered by the practice’s documents whenever a Notebook note applies to it, even if the message is not a conventional question.\n\n';
    }
  } else {
    prompt += 'There are no matching Sources in the knowledge base for this question.\n\n';
  }

  if (history) {
    prompt += 'Conversation so far (so you can understand follow-up questions):\n"""\n' + history + '\n"""\n\n';
  }

  if (guideCatalog) {
    prompt += 'For reference, the practice has step-by-step guides on these topics. Answer the reader’s actual question directly; if a guide covers the broader task you may point to it by name, but still answer what they asked:\n'
      + guideCatalog + '\n\n';
  }

  if (contacts.length) {
    prompt += 'The reader is ALSO shown these exact practice contacts next to your reply, with the phone numbers and emails:\n'
      + contacts.map((c) => '- ' + c).join('\n') + '\n'
      + 'If one is the right place to route to, refer to it BY NAME (for example "call the district nurse"). Do NOT write any phone number or email address yourself — the reader can see the exact details in the contacts shown. Never invent or guess contact details.\n\n';
  }

  prompt += 'The latest message to handle is:\n"""\n' + question + '\n"""\n';

  if (imageCount > 0) {
    prompt += 'The staff member attached ' + imageCount + ' image' + (imageCount === 1 ? '' : 's')
      + ' to this message (for example a screenshot, a photo of a letter or form, or a picture of a screen). The image'
      + (imageCount === 1 ? ' is' : 's are') + ' included with this message — read '
      + (imageCount === 1 ? 'it' : 'them') + ' carefully and use what '
      + (imageCount === 1 ? 'it shows' : 'they show') + ' to understand the message. '
      + 'Anything you conclude from an image that is not confirmed by a Source counts as your own judgement and must go in a "basis":"judgement" section.\n';
  }

  prompt += 'Decide whether it is a staff question or an incoming patient request, then respond in the matching shape. If it is a follow-up question, answer in the context of what was already shown above rather than repeating everything.\n'
    + JSON_SHAPE;

  return prompt;
}

// Build a standalone retrieval query WITHOUT a model call. A follow-up like
// "how is this done" carries no searchable keywords on its own, so we prepend
// the most recent staff question(s) from the conversation. That hands the
// embedding the subject ("smear test") for free — no extra network round-trip —
// while the answer model still receives the full history to interpret the
// follow-up. A self-contained question is returned essentially unchanged.
export function buildSearchQuery({ history = '', question = '' }) {
  const q = (question || '').trim();
  if (!history.trim()) return q;
  const priorAsks = history
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^Staff member:/i.test(l))
    .map((l) => l.replace(/^Staff member:\s*/i, '').trim())
    .filter(Boolean)
    .slice(-2); // the immediately preceding question(s) hold the subject of "this"/"it"
  if (!priorAsks.length) return q;
  return (priorAsks.join(' ') + ' ' + q).replace(/\s+/g, ' ').trim();
}

// Parse the model's reply into a known shape. The model decides "kind" itself,
// so this returns an "answer" object (intro/sections/message/tip), a "triage"
// object (urgency/actions/redFlags/route/patientMessage) or a "docfile" object
// (date/source/department/actions/note for a filing title). Tolerates
// stray markdown fences and partial JSON; falls back to a plain answer.
// Models sometimes emit trailing garbage after the JSON object (a duplicated
// tail, commentary, a second object). lastIndexOf('}') swallows that garbage
// into the candidate string and the parse fails; instead walk from the first
// '{' tracking string/escape state and take the first balanced object.
function balancedJson(str) {
  const a = str.indexOf('{');
  if (a === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = a; i < str.length; i++) {
    const ch = str[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return str.slice(a, i + 1); }
  }
  return null;
}

// Inline "Source N" mentions belong in the source/quote fields, not the prose —
// strip them wherever the model leaks them into text.
function stripInlineSources(text) {
  return String(text || '')
    .replace(/[.,;(\s]*\b[Ss]ources?\s+\d+(?:\s*(?:,|and|&)\s*(?:[Ss]ources?\s+)?\d+)*\)?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Same clean-up for a multi-line markdown section — collapse runs of spaces but
// keep the newlines, which carry the markdown block structure.
function stripInlineSourcesMd(text) {
  return String(text || '')
    .replace(/[.,;(]*[ \t]*\b[Ss]ources?\s+\d+(?:\s*(?:,|and|&)\s*(?:[Ss]ources?\s+)?\d+)*\)?/g, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
}

export function parseAiJson(raw) {
  const str = (raw || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  // Triage actions/red flags: inline text with basis + source/quote.
  const item = (x) => (x && typeof x === 'object')
    ? {
        text: stripInlineSources(x.text),
        basis: x.basis === 'judgement' ? 'judgement' : 'documents',
        source: parseInt(x.source, 10) || 0,
        quote: typeof x.quote === 'string' ? x.quote : '',
      }
    : { text: stripInlineSources(x), basis: 'documents', source: 0, quote: '' };
  // Answer sections: a markdown block with basis + source/quote. Tolerates the
  // model using "text" for the markdown field.
  const mdItem = (x) => (x && typeof x === 'object')
    ? {
        markdown: stripInlineSourcesMd(x.markdown != null ? x.markdown : x.text),
        basis: x.basis === 'judgement' ? 'judgement' : 'documents',
        source: parseInt(x.source, 10) || 0,
        quote: typeof x.quote === 'string' ? x.quote : '',
      }
    : { markdown: stripInlineSourcesMd(x), basis: 'documents', source: 0, quote: '' };
  const BANDS = ['emergency', 'urgent', 'routine', 'self-care', 'unclear'];
  try {
    // Balanced extraction first; fall back to a first-{…last-} slice for
    // output that is merely truncated but parseable after the naive cut.
    let o;
    const bal = balancedJson(str);
    try { o = JSON.parse(bal !== null ? bal : str); }
    catch (e1) {
      const a = str.indexOf('{');
      const b = str.lastIndexOf('}');
      if (a === -1 || b <= a) throw e1;
      o = JSON.parse(str.slice(a, b + 1));
    }
    if (o.kind === 'docfile') {
      // Filing-title fields are single short lines — collapse any stray
      // whitespace the model leaves in them.
      const line = (v) => typeof v === 'string' ? stripInlineSources(v).replace(/\s+/g, ' ').trim() : '';
      return {
        kind: 'docfile',
        date: line(o.date),
        source: line(o.source),
        department: line(o.department),
        actions: Array.isArray(o.actions) ? o.actions.map(line).filter(Boolean).slice(0, 6) : [],
        note: line(o.note),
      };
    }
    if (o.kind === 'triage') {
      return {
        kind: 'triage',
        urgency: BANDS.includes(o.urgency) ? o.urgency : 'unclear',
        urgencyReason: typeof o.urgencyReason === 'string' ? stripInlineSources(o.urgencyReason) : '',
        summary: typeof o.summary === 'string' ? stripInlineSources(o.summary) : '',
        actions: Array.isArray(o.actions) ? o.actions.map(item).filter((s) => s.text) : [],
        redFlags: Array.isArray(o.redFlags) ? o.redFlags.map(item).filter((s) => s.text) : [],
        route: typeof o.route === 'string' ? o.route.trim() : '',
        patientMessage: typeof o.patientMessage === 'string' ? o.patientMessage.trim() : '',
        patientMessageSource: parseInt(o.patientMessageSource, 10) || 0,
        patientMessageQuote: typeof o.patientMessageQuote === 'string' ? o.patientMessageQuote : '',
      };
    }
    let sections = Array.isArray(o.sections) ? o.sections.map(mdItem).filter((s) => s.markdown) : [];
    // Older-shape replies (or a model ignoring the new shape): map numbered
    // steps into one markdown line each so nothing is lost.
    if (!sections.length && Array.isArray(o.steps)) {
      sections = o.steps.map(item).filter((s) => s.text)
        .map((s, i) => ({ markdown: (i + 1) + '. ' + s.text, basis: s.basis, source: s.source, quote: s.quote }));
    }
    return {
      kind: 'answer',
      answerable: o.answerable === false ? false : true,
      intro: typeof o.intro === 'string' ? stripInlineSources(o.intro) : '',
      sections,
      message: typeof o.message === 'string' ? o.message.trim() : '',
      messageSource: parseInt(o.messageSource, 10) || 0,
      messageQuote: typeof o.messageQuote === 'string' ? o.messageQuote : '',
      tip: typeof o.tip === 'string' ? stripInlineSources(o.tip) : '',
    };
  } catch (e) {
    // Unparseable output. If it still looks like (broken) JSON, salvage the
    // field values by regex rather than showing raw JSON syntax to reception.
    if (/^\s*\{\s*"/.test(str)) {
      // Some models leave literal newlines/control characters inside JSON
      // strings; escape them so decoding a salvaged value can't throw.
      const unquote = (v) => {
        try {
          return JSON.parse('"' + v.replace(/[\u0000-\u001f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '"');
        } catch (err) { return v; }
      };
      const grab = (key) => {
        const m = str.match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\[\\s\\S])*)"'));
        return m ? stripInlineSources(unquote(m[1])) : '';
      };
      const sections = [];
      const secRe = /"(?:markdown|text)"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/g;
      for (let m; (m = secRe.exec(str)) && sections.length < 8;) {
        const t = stripInlineSourcesMd(unquote(m[1]));
        if (t && !sections.some((s2) => s2.markdown === t)) sections.push({ markdown: t, basis: 'documents', source: 0, quote: '' });
      }
      const intro = grab('intro');
      const tip = grab('tip');
      if (intro || sections.length) {
        return { kind: 'answer', answerable: true, intro, sections, message: '', messageSource: 0, messageQuote: '', tip };
      }
    }
    // Plain-prose fallback — drop anything that still looks like JSON syntax.
    const lines = (raw || '').split(/\n+/)
      .map((x) => x.replace(/^[-*\d.\)\s]+/, '').trim())
      .filter((x) => x && !/[{}\[\]]|"\w+"\s*:/.test(x));
    return {
      kind: 'answer',
      answerable: lines.length > 0,
      intro: '',
      sections: lines.slice(0, 6).map((t) => ({ markdown: stripInlineSourcesMd(t), basis: 'documents', source: 0, quote: '' })),
      message: '', messageSource: 0, messageQuote: '', tip: '',
    };
  }
}
