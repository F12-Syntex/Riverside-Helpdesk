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
  + '{"answerable":true,"intro":"one short sentence answering the question","steps":[{"text":"step one","source":1},{"text":"step two","source":2}],"message":"wording to send to a patient or colleague, or empty string","messageSource":0,"tip":"one short tip or empty string"}\n'
  + 'For EVERY step, set "source" to the number of the Source above that supports that step (1, 2, 3 …). Every step must be backed by a Source; do not invent steps that no Source supports. If you use "message", set "messageSource" to the Source number it is based on.\n'
  + 'Use "steps" for a how-to or a list (1 to 6 items), OR use "message" when the reader asks for wording to give or send to a patient or colleague (you may draft routine administrative messages such as appointment or review invitations, but never clinical or medical advice). '
  + 'Set "answerable" to false when the practice documents do not cover the question, or when it asks for clinical judgement about a specific patient. When false, put a one-line reason in "intro" and leave steps and message empty.';

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

// A tiny prompt that rewrites a follow-up into a standalone search query, using
// the conversation so far. This runs BEFORE retrieval so that "how is this done"
// becomes e.g. "how is a smear test done" and finds the right documents. A brand
// new question (topic change) is returned unchanged. Output is the query only —
// one line, no quotes, no explanation.
export function buildCondenseQuery({ history = '', question = '' }) {
  return 'You rewrite a receptionist\'s latest message into a single standalone search query for a document search.\n'
    + 'Use the conversation so far only to resolve references like "this", "it", "the test", or "how is this done" into the actual subject.\n'
    + 'If the latest message is already self-contained, or starts a new topic, return it essentially unchanged.\n'
    + 'Return ONLY the search query as one line of plain text — no quotes, no labels, no explanation.\n\n'
    + 'Conversation so far:\n"""\n' + (history || '(none)') + '\n"""\n\n'
    + 'Latest message: "' + question + '"\n'
    + 'Standalone search query:';
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
        if (x && typeof x === 'object') return { text: String(x.text || '').trim(), source: parseInt(x.source, 10) || 0 };
        return { text: String(x).trim(), source: 0 };
      }).filter((s) => s.text) : [],
      message: typeof o.message === 'string' ? o.message.trim() : '',
      messageSource: parseInt(o.messageSource, 10) || 0,
      tip: typeof o.tip === 'string' ? o.tip : '',
    };
  } catch (e) {
    const lines = (raw || '').split(/\n+/).map((x) => x.replace(/^[-*\d.\)\s]+/, '').trim()).filter(Boolean);
    return { answerable: true, intro: '', steps: lines.slice(0, 6).map((t) => ({ text: t, source: 0 })), message: '', messageSource: 0, tip: '' };
  }
}
