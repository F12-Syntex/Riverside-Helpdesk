// Server-side construction of the prompt sent to the model, and parsing of the
// JSON it returns. Kept separate from the API route so the wording is easy to
// review and change in one place. Pure functions — no I/O, no React.

// The assistant's standing instructions. The reader is any member of practice
// staff; the model explains what the practice's own documents say (never its
// own clinical advice) and escalates emergencies.
const SYSTEM_INTRO =
  'You are the Riverside Practice Q&A assistant, a help tool for ALL staff at an NHS GP practice — reception, admin, nursing, clinical and management. '
  + 'Answer questions about how the practice works: its policies, procedures, protocols, systems (such as EMIS Web) and day-to-day processes — including front-desk, administrative and operational tasks, and who to pass things to. '
  + 'Answer in plain British English in the NHS style: calm, sentence case, no emoji, no marketing words like "simply" or "easy". Address the reader as "you".\n\n'
  + 'IMPORTANT: You explain what the practice’s documents say; you do NOT give your own clinical or medical advice, diagnoses, symptom assessment or treatment decisions about a specific patient — that is a clinician’s judgement. You may share what a clinical policy or protocol document states. If a question needs clinical judgement about a specific patient, advise passing it to a clinician (for example the duty doctor). '
  + 'If the message could be a medical emergency (for example chest pain, difficulty breathing, signs of a stroke, severe bleeding, collapse, anaphylaxis or a seizure), the answer must be: call 999 now, alert a duty clinician immediately, and stay with the patient — do not try to assess or treat them.\n\n';

// Strict grounding: the practice's own documents are the only source of truth,
// and every step must name the Source that backs it.
const JSON_SHAPE =
  'Answer ONLY from the numbered Sources above. Do not use general knowledge. If the Sources do not contain the answer, set "answerable" to false.\n'
  + 'Return ONLY valid JSON, no markdown fences, with this exact shape:\n'
  + '{"answerable":true,"intro":"one short sentence answering the question","steps":[{"text":"step one","source":1,"quote":"the exact words from Source 1 that support this step"}],"message":"wording to send to a patient or colleague, or empty string","messageSource":0,"messageQuote":"","tip":"one short tip or empty string"}\n'
  + 'GROUNDING — for EVERY step you MUST do both: (a) set "source" to the number of the Source that supports it; and (b) set "quote" to a SHORT run of words copied VERBATIM — word for word, not paraphrased — from THAT same Source, proving the step. The quote has to appear exactly in the Source you cite. If no Source contains words you can quote to support a step, leave that step out. When you use "message", fill "messageSource" and "messageQuote" the same way.\n'
  + 'Keep each quote tight — the single sentence or clause that backs the step, copied exactly; never blend words from different Sources into one quote, and never reword them.\n'
  + 'Use "steps" for a how-to or a list (1 to 6 items), OR use "message" when the reader asks for wording to give or send to a patient or colleague (you may draft routine administrative messages such as appointment or review invitations, but never clinical or medical advice). '
  + 'Set "answerable" to false when the practice documents do not cover the question, or when it asks for clinical judgement about a specific patient. When false, put a one-line reason in "intro" and leave steps and message empty.\n\n'
  + 'CRITICAL GROUNDING RULE — severity match: Before answering, judge the severity of the reader’s scenario (routine, minor or day-to-day versus extreme, emergency or major-incident) and check it against the Sources. '
  + 'If the message is about a routine, minor or day-to-day situation (for example minor spotting, a routine check-up, a general query) but the only relevant Sources are extreme, emergency, trauma, mass-casualty or major-incident protocols (for example "B0128 clinical guidelines for use in a major incident"), treat the question as out of scope. '
  + 'Do NOT bridge that gap by applying an emergency or major-incident protocol to a routine situation. Set "answerable" to false and put this exact reason in "intro": "I could not find a routine protocol for this scenario in the practice’s documents." '
  + 'This rule does not override genuine emergencies: if the reader’s own message describes an emergency, follow the 999 guidance above instead.';

// Assemble the full prompt.
//   catalog       - Tier A: the whole knowledge base's titles+summaries (awareness)
//   extracts      - Tier B: array of { ref, title, location, text } numbered as Sources
//   guideCatalog  - reference list of guide questions the model may point to by name
export function buildAskPrompt({ question, catalog = '', extracts = [], history = '', guideCatalog = '' }) {
  let prompt = SYSTEM_INTRO;

  if (catalog) {
    prompt += 'The practice knowledge base contains these documents (for your awareness):\n' + catalog + '\n\n';
  }

  if (extracts.length) {
    prompt += 'Numbered Sources — your only factual source. Back every step with one:\n';
    for (const ex of extracts) {
      prompt += 'Source ' + ex.ref + ' [' + ex.title + (ex.location ? ' — ' + ex.location : '') + ']:\n' + ex.text + '\n\n';
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

  prompt += 'The staff member’s latest message is: "' + question + '"\n'
    + 'Answer this specific question. If it is a follow-up, answer in the context of what was already shown above rather than repeating everything.\n'
    + JSON_SHAPE;

  return prompt;
}

// ---- Triage / care-navigation assist --------------------------------------
// A second mode of the assistant. Instead of answering a staff how-to question,
// the reader pastes an incoming patient request (for example an Accurx online
// consultation or a triage form) and gets action notes — what to DO with the
// request — drawn strictly from the practice's own triage, duty-doctor,
// urgent/emergency-appointment and signposting documents. This is care
// navigation and administrative routing, NOT clinical diagnosis or symptom
// assessment; the same strict grounding and citation checks apply.
const TRIAGE_INTRO =
  'You are the Riverside Practice triage-assist tool. A member of reception / care-navigation staff has received an incoming patient request (for example an Accurx online consultation or a triage form) and needs help deciding what to DO with it. '
  + 'Your job is care navigation and administrative routing: using the practice’s own triage, duty-doctor, urgent/emergency-appointment and signposting protocols, suggest the actions the staff member should take, where to route the request, and what to watch for. '
  + 'Write in plain British English in the NHS style: calm, sentence case, no emoji, no marketing words like "simply" or "easy". Address the reader (the staff member) as "you".\n\n'
  + 'IMPORTANT — you do NOT diagnose, assess symptoms clinically, or give medical or treatment advice about this patient; that is a clinician’s judgement. You only apply the practice’s documented routing rules (for example when a request should go to the duty doctor, be booked routinely, or be signposted to a community pharmacy or self-care). Anything needing clinical judgement about the patient must be routed to a clinician (for example the duty doctor).\n'
  + 'EMERGENCY — if the request describes a possible emergency (for example chest pain, difficulty breathing, signs of a stroke, severe bleeding, collapse, anaphylaxis, sepsis, a seizure, or suicidal thoughts), set "urgency" to "emergency" and make the first action: call 999 now and alert a duty clinician immediately — do not try to assess or treat the patient.\n\n';

const TRIAGE_SHAPE =
  'Base every action and red flag ONLY on the numbered Sources above — the practice’s own documents. Do not use general medical knowledge to assess the patient. '
  + 'If the Sources do not tell you how to route this request, do not guess: set "urgency" to "unclear" and make the action to pass the request to the duty doctor or care navigator to decide.\n'
  + 'Return ONLY valid JSON, no markdown fences, with this exact shape:\n'
  + '{"urgency":"emergency|urgent|routine|self-care|unclear","urgencyReason":"one short sentence","summary":"one neutral line restating what the patient is asking for","actions":[{"text":"an action for the staff member to take","source":1,"quote":"the exact words from Source 1 that support this action"}],"redFlags":[{"text":"a symptom or sign that would need escalation","source":1,"quote":"the exact words from Source 1"}],"route":"short phrase naming where this request should go","patientMessage":"optional short reply the staff member could send the patient, or empty string","patientMessageSource":0,"patientMessageQuote":""}\n'
  + 'GROUNDING — for EVERY action and EVERY red flag you MUST set "source" to the number of the Source that supports it, and set "quote" to a SHORT run of words copied VERBATIM — word for word, not paraphrased — from THAT same Source. The quote has to appear exactly in the Source you cite. If no Source supports an item, leave it out.\n'
  + '"urgency" bands: "emergency" = call 999 / immediate; "urgent" = needs the duty doctor or a same-day response; "routine" = book a routine appointment; "self-care" = can be signposted to a pharmacy, self-care or another service without a GP appointment; "unclear" = the documents do not settle it, so escalate to the duty doctor.\n'
  + 'Give 1 to 5 actions, most important first. Give 0 to 5 red flags — the warning symptoms from the Sources that, if present, would push this request to urgent or emergency.\n'
  + 'Only include "patientMessage" for routine administrative wording (for example confirming a booking or signposting to a pharmacy) — never clinical or treatment advice — and fill "patientMessageSource" and "patientMessageQuote" the same way as actions when you do; otherwise leave it an empty string.';

// Assemble the triage prompt. Same Source/citation machinery as buildAskPrompt,
// but the reader's input is a patient request to route rather than a question.
export function buildTriagePrompt({ submission, catalog = '', extracts = [], guideCatalog = '' }) {
  let prompt = TRIAGE_INTRO;

  if (catalog) {
    prompt += 'The practice knowledge base contains these documents (for your awareness):\n' + catalog + '\n\n';
  }

  if (extracts.length) {
    prompt += 'Numbered Sources — your only factual source. Back every action and red flag with one:\n';
    for (const ex of extracts) {
      prompt += 'Source ' + ex.ref + ' [' + ex.title + (ex.location ? ' — ' + ex.location : '') + ']:\n' + ex.text + '\n\n';
    }
  } else {
    prompt += 'There are no matching Sources in the knowledge base for this request.\n\n';
  }

  if (guideCatalog) {
    prompt += 'For reference, the practice has step-by-step guides on these topics; you may point to one by name if it is relevant:\n' + guideCatalog + '\n\n';
  }

  prompt += 'The incoming patient request to triage is:\n"""\n' + submission + '\n"""\n'
    + 'Produce the action notes for the staff member handling this request.\n'
    + TRIAGE_SHAPE;

  return prompt;
}

// Parse the model's triage reply into a known shape. Mirrors parseAiJson's
// tolerance for stray fences / partial JSON, and normalises the urgency band.
export function parseTriageJson(raw) {
  let str = (raw || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const a = str.indexOf('{');
  const b = str.lastIndexOf('}');
  if (a !== -1 && b !== -1) str = str.slice(a, b + 1);
  const BANDS = ['emergency', 'urgent', 'routine', 'self-care', 'unclear'];
  const item = (x) => (x && typeof x === 'object')
    ? { text: String(x.text || '').trim(), source: parseInt(x.source, 10) || 0, quote: typeof x.quote === 'string' ? x.quote : '' }
    : { text: String(x).trim(), source: 0, quote: '' };
  const empty = { urgency: 'unclear', urgencyReason: '', summary: '', actions: [], redFlags: [], route: '', patientMessage: '', patientMessageSource: 0, patientMessageQuote: '' };
  try {
    const o = JSON.parse(str);
    return {
      urgency: BANDS.includes(o.urgency) ? o.urgency : 'unclear',
      urgencyReason: typeof o.urgencyReason === 'string' ? o.urgencyReason.trim() : '',
      summary: typeof o.summary === 'string' ? o.summary.trim() : '',
      actions: Array.isArray(o.actions) ? o.actions.map(item).filter((s) => s.text) : [],
      redFlags: Array.isArray(o.redFlags) ? o.redFlags.map(item).filter((s) => s.text) : [],
      route: typeof o.route === 'string' ? o.route.trim() : '',
      patientMessage: typeof o.patientMessage === 'string' ? o.patientMessage.trim() : '',
      patientMessageSource: parseInt(o.patientMessageSource, 10) || 0,
      patientMessageQuote: typeof o.patientMessageQuote === 'string' ? o.patientMessageQuote : '',
    };
  } catch (e) {
    return empty;
  }
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

// Parse the model's reply into a known shape. Tolerates stray markdown fences
// and falls back to treating non-JSON output as a plain list of steps.
export function parseAiJson(raw) {
  let str = (raw || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const a = str.indexOf('{');
  const b = str.lastIndexOf('}');
  if (a !== -1 && b !== -1) str = str.slice(a, b + 1);
  try {
    const o = JSON.parse(str);
    return {
      answerable: o.answerable === false ? false : true,
      intro: typeof o.intro === 'string' ? o.intro : '',
      steps: Array.isArray(o.steps) ? o.steps.map((x) => {
        if (x && typeof x === 'object') return { text: String(x.text || '').trim(), source: parseInt(x.source, 10) || 0, quote: typeof x.quote === 'string' ? x.quote : '' };
        return { text: String(x).trim(), source: 0, quote: '' };
      }).filter((s) => s.text) : [],
      message: typeof o.message === 'string' ? o.message.trim() : '',
      messageSource: parseInt(o.messageSource, 10) || 0,
      messageQuote: typeof o.messageQuote === 'string' ? o.messageQuote : '',
      tip: typeof o.tip === 'string' ? o.tip : '',
    };
  } catch (e) {
    const lines = (raw || '').split(/\n+/).map((x) => x.replace(/^[-*\d.\)\s]+/, '').trim()).filter(Boolean);
    return { answerable: true, intro: '', steps: lines.slice(0, 6).map((t) => ({ text: t, source: 0, quote: '' })), message: '', messageSource: 0, messageQuote: '', tip: '' };
  }
}
