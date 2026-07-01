// Server-side construction of the prompt sent to the model, and parsing of the
// JSON it returns. Kept separate from the API route so the wording is easy to
// review and change in one place. Pure functions — no I/O, no React.

// The assistant's standing instructions. The reader is any member of practice
// staff. The assistant handles two kinds of message and works out which is
// which on its own: a how-to/policy QUESTION from staff, or an incoming PATIENT
// REQUEST that staff need to route (for example an Accurx online consultation).
// Either way it only explains/applies what the practice's own documents say —
// never its own clinical advice — and it escalates emergencies.
const SYSTEM_INTRO =
  'You are the Riverside Practice assistant, a help tool for ALL staff at an NHS GP practice — reception, admin, nursing, clinical and management. '
  + 'You handle two kinds of message and must decide which one each message is:\n'
  + '(1) a QUESTION from staff about how the practice works — its policies, procedures, protocols, systems (such as EMIS Web) and day-to-day processes, including front-desk, administrative and operational tasks, and who to pass things to; or\n'
  + '(2) an incoming PATIENT REQUEST that staff need to route or action — for example an Accurx online consultation or triage form, usually written in the first person and often structured with prompts such as "Describe the problem", "How long has it been going on", "Have you tried anything", "Is there anything you are worried about", "Expectations" and "Best time to contact". A first-person description of a patient’s own symptoms is a patient request, not a question.\n'
  + 'For a patient request you do care navigation only: using the practice’s own triage, duty-doctor, urgent/emergency-appointment and signposting protocols, say what the staff member should DO with it and where to route it. This is routing, not diagnosis.\n\n'
  + 'Write in plain British English in the NHS style: calm, sentence case, no emoji, no marketing words like "simply" or "easy". Address the reader (the staff member) as "you".\n\n'
  + 'IMPORTANT: You explain and apply what the practice’s documents say; you do NOT give your own clinical or medical advice, diagnoses, symptom assessment or treatment decisions about a specific patient — that is a clinician’s judgement. Anything needing clinical judgement about a specific patient must be routed to a clinician (for example the duty doctor). '
  + 'If the message could be a medical emergency (for example chest pain, difficulty breathing, signs of a stroke, severe bleeding, collapse, anaphylaxis, sepsis, a seizure or suicidal thoughts), the response must be: call 999 now, alert a duty clinician immediately, and stay with the patient — do not try to assess or treat them.\n\n';

// Strict grounding + output contract. The model first picks "kind", then fills
// the matching shape; every step / action / red flag names the Source and quotes
// the verbatim words that back it, checked on the server.
const JSON_SHAPE =
  'Base everything ONLY on the numbered Sources above — the practice’s own documents. Do not use general knowledge to answer a question or to assess a patient.\n'
  + 'Return ONLY valid JSON, no markdown fences.\n\n'
  + 'FIRST decide "kind":\n'
  + '- "answer" — the latest message is a staff question about how the practice works.\n'
  + '- "triage" — the latest message is an incoming patient request to route or action (see the patient-request description above).\n\n'
  + 'IF kind is "answer", use this exact shape:\n'
  + '{"kind":"answer","answerable":true,"intro":"one short sentence answering the question","steps":[{"text":"step one","source":1,"quote":"the exact words from Source 1 that support this step"}],"message":"wording to send to a patient or colleague, or empty string","messageSource":0,"messageQuote":"","tip":"one short tip or empty string"}\n'
  + 'Use "steps" for a how-to or a list (1 to 6 items), OR use "message" when the reader asks for wording to give or send to a patient or colleague (routine administrative messages such as appointment or review invitations, never clinical or medical advice). '
  + 'Set "answerable" to false when the practice documents do not cover the question, or when it asks for clinical judgement about a specific patient; put a one-line reason in "intro" and leave steps and message empty. '
  + 'Severity match: if the question is routine, minor or day-to-day but the only relevant Sources are extreme, emergency, trauma, mass-casualty or major-incident protocols (for example "B0128 clinical guidelines for use in a major incident"), do NOT apply them — set "answerable" to false with this exact "intro": "I could not find a routine protocol for this scenario in the practice’s documents." (This does not apply to a genuine emergency described in the message.)\n\n'
  + 'IF kind is "triage", use this exact shape:\n'
  + '{"kind":"triage","urgency":"emergency|urgent|routine|self-care|unclear","urgencyReason":"one short sentence","summary":"one neutral line restating what the patient is asking for","actions":[{"text":"an action for the staff member to take","source":1,"quote":"the exact words from Source 1 that support it"}],"redFlags":[{"text":"a symptom or sign that would need escalation","source":1,"quote":"the exact words from Source 1"}],"route":"short phrase naming where this request should go","patientMessage":"optional short routine reply to the patient, or empty string","patientMessageSource":0,"patientMessageQuote":""}\n'
  + '"urgency" bands: "emergency" = call 999 / immediate; "urgent" = needs the duty doctor or a same-day response; "routine" = book a routine appointment; "self-care" = can be signposted to a pharmacy, self-care or another service without a GP appointment; "unclear" = the documents do not settle it, so escalate to the duty doctor. '
  + 'Give 1 to 5 actions, most important first, and 0 to 5 red flags. If the Sources do not tell you how to route the request, set "urgency" to "unclear" and make the action to pass it to the duty doctor or care navigator. Only include "patientMessage" for routine administrative wording, never clinical advice.\n\n'
  + 'GROUNDING (both kinds) — for EVERY step, action and red flag you MUST do both: (a) set "source" to the number of the Source that supports it; and (b) set "quote" to a SHORT run of words copied VERBATIM — word for word, not paraphrased — from THAT same Source. The quote has to appear exactly in the Source you cite. Keep each quote tight — the single sentence or clause that backs it; never blend words from different Sources into one quote, and never reword them. If no Source contains words you can quote to support an item, leave that item out. '
  + 'Fill "messageSource"/"messageQuote" and "patientMessageSource"/"patientMessageQuote" the same way when you use those fields.';

// Assemble the full prompt.
//   catalog       - Tier A: the whole knowledge base's titles+summaries (awareness)
//   extracts      - Tier B: array of { ref, title, location, text } numbered as Sources
//   guideCatalog  - reference list of guide questions the model may point to by name
export function buildAskPrompt({ question, catalog = '', extracts = [], history = '', guideCatalog = '', contacts = [] }) {
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

  if (contacts.length) {
    prompt += 'The reader is ALSO shown these exact practice contacts next to your reply, with the phone numbers and emails:\n'
      + contacts.map((c) => '- ' + c).join('\n') + '\n'
      + 'If one is the right place to route to, refer to it BY NAME (for example "call the district nurse"). Do NOT write any phone number or email address yourself — the reader can see the exact details in the contacts shown. Never invent or guess contact details.\n\n';
  }

  prompt += 'The latest message to handle is:\n"""\n' + question + '\n"""\n'
    + 'Decide whether it is a staff question or an incoming patient request, then respond in the matching shape. If it is a follow-up question, answer in the context of what was already shown above rather than repeating everything.\n'
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
// so this returns either an "answer" object (intro/steps/message/tip) or a
// "triage" object (urgency/actions/redFlags/route/patientMessage). Tolerates
// stray markdown fences and partial JSON; falls back to a plain answer.
export function parseAiJson(raw) {
  let str = (raw || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const a = str.indexOf('{');
  const b = str.lastIndexOf('}');
  if (a !== -1 && b !== -1) str = str.slice(a, b + 1);
  const item = (x) => (x && typeof x === 'object')
    ? { text: String(x.text || '').trim(), source: parseInt(x.source, 10) || 0, quote: typeof x.quote === 'string' ? x.quote : '' }
    : { text: String(x).trim(), source: 0, quote: '' };
  const BANDS = ['emergency', 'urgent', 'routine', 'self-care', 'unclear'];
  try {
    const o = JSON.parse(str);
    if (o.kind === 'triage') {
      return {
        kind: 'triage',
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
    }
    return {
      kind: 'answer',
      answerable: o.answerable === false ? false : true,
      intro: typeof o.intro === 'string' ? o.intro : '',
      steps: Array.isArray(o.steps) ? o.steps.map(item).filter((s) => s.text) : [],
      message: typeof o.message === 'string' ? o.message.trim() : '',
      messageSource: parseInt(o.messageSource, 10) || 0,
      messageQuote: typeof o.messageQuote === 'string' ? o.messageQuote : '',
      tip: typeof o.tip === 'string' ? o.tip : '',
    };
  } catch (e) {
    const lines = (raw || '').split(/\n+/).map((x) => x.replace(/^[-*\d.\)\s]+/, '').trim()).filter(Boolean);
    return { kind: 'answer', answerable: true, intro: '', steps: lines.slice(0, 6).map((t) => ({ text: t, source: 0, quote: '' })), message: '', messageSource: 0, messageQuote: '', tip: '' };
  }
}
