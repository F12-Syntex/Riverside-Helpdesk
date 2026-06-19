// Server-side construction of the prompt sent to the model, and parsing of the
// JSON it returns. Kept separate from the API route so the wording is easy to
// review and change in one place. Pure functions — no I/O, no React.

// Riva's standing instructions. The reader is reception/admin staff, never a
// clinician, so the model must refuse clinical advice and escalate emergencies.
const SYSTEM_INTRO =
  'You are the Riverside Practice Q&A assistant, a help tool for RECEPTION and ADMIN staff at an NHS GP practice. '
  + 'The reader is a receptionist, not a clinician. Help with front-desk and administrative tasks: using EMIS Web, booking and cancelling appointments, registrations, documents and scanning, tasks and messages, repeat prescription requests, and knowing who to pass things to. '
  + 'Answer in plain British English in the NHS style: calm, sentence case, no emoji, no marketing words like "simply" or "easy". Address the reader as "you".\n\n'
  + 'IMPORTANT: Do NOT give clinical or medical advice, diagnoses, symptom assessment, or treatment steps — that is a clinician’s job. If a question needs clinical judgement, tell the receptionist to pass it to a clinician (for example the duty doctor). '
  + 'If the message could be a medical emergency (for example chest pain, difficulty breathing, signs of a stroke, severe bleeding, collapse, anaphylaxis or a seizure), the answer must be: call 999 now, alert a duty clinician immediately, and stay with the patient — do not try to assess or treat them.\n\n';

// Strict grounding: the practice's own documents are the only source of truth.
const GROUNDING =
  'GROUNDING — this is critical: answer ONLY from the practice’s guides and the numbered extracts below. '
  + 'Every statement you make must be supported by them. Do NOT use outside or general knowledge, and do NOT invent menu paths, contact details, policies, names or steps that are not in the supplied material. '
  + 'For each extract you actually rely on, put its number in the "citations" array so the reader can open the source. '
  + 'If the guides and extracts do not contain the answer, do not guess: set steps and message empty, and in "intro" say you could not find it in the practice’s documents and who to ask (the relevant lead, or a clinician for clinical questions).\n\n';

const JSON_SHAPE =
  'Decide how to respond and return ONLY valid JSON, no markdown fences, with this exact shape:\n'
  + '{"guideId":"id of a guide above or empty string","intro":"one short sentence","steps":["step one","step two"],"message":"wording to send to a patient or colleague, or empty string","tip":"one short tip or empty string","images":["exact filename from the list above, or leave empty"],"citations":[1,2]}\n'
  + 'Rules: only use "guideId" when an existing guide directly and fully answers this specific question; if in doubt, answer it yourself rather than returning a guide. Use "steps" for a how-to (1 to 6 steps), OR use "message" when the reader asks for wording to give or send to a patient or colleague (you may draft routine administrative messages such as appointment or review invitations, but never clinical or medical advice). '
  + '"citations" is the list of extract numbers your answer is based on (leave empty only when you return a guideId or genuinely could not find it). '
  + 'If you are unsure or it is outside a receptionist’s role, say so in the intro and advise passing it to a clinician or the practice lead.';

// Assemble the full prompt.
//   catalog          - Tier A: the whole knowledge base's titles+summaries (awareness)
//   extracts         - Tier B: array of { ref, title, location, text } to ground in and cite
//   guideCatalog     - "id: question" list for routing to an existing guide
//   candidateImages  - screenshots the model may reference (validated after)
export function buildAskPrompt({ question, catalog = '', extracts = [], history = '', guideCatalog = '', candidateImages = [] }) {
  let prompt = SYSTEM_INTRO + GROUNDING;

  if (catalog) {
    prompt += 'The practice knowledge base contains these documents (for your awareness):\n' + catalog + '\n\n';
  }

  if (extracts.length) {
    prompt += 'Numbered extracts — your factual source. Cite the ones you use by number:\n';
    for (const ex of extracts) {
      prompt += '[' + ex.ref + '] (' + ex.title + (ex.location ? ' — ' + ex.location : '') + ')\n' + ex.text + '\n\n';
    }
  } else {
    prompt += 'There are no matching extracts in the knowledge base for this question.\n\n';
  }

  if (history) {
    prompt += 'Conversation so far (so you can understand follow-up questions):\n"""\n' + history + '\n"""\n\n';
  }

  prompt += 'Here are the practice’s existing guides. Only return a "guideId" when ONE of these guides DIRECTLY and FULLY answers the staff member’s actual question — that is, the guide is about the same specific task, not merely the same topic or area. If the closest guide only partly answers it, covers a related but different task, or you are at all unsure, do NOT return a guideId: compose your own answer in "steps" or "message" instead. When you do return a guideId, leave steps and message empty — the full guide (with screenshots) is shown to the reader instead:\nGUIDES:\n'
    + guideCatalog + '\n\n';

  if (candidateImages.length) {
    prompt += 'Screenshots available from the extracts above. If one directly illustrates your answer, include its exact filename in the "images" array (up to 3, most relevant first); otherwise use an empty array. Only use filenames from this list:\n'
      + candidateImages.map((im) => '- ' + im).join('\n') + '\n\n';
  }

  prompt += 'The staff member’s latest message is: "' + question + '"\n'
    + 'If it is a follow-up, answer in the context of what was already shown above rather than repeating a whole guide.\n'
    + JSON_SHAPE;

  return prompt;
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
      guideId: typeof o.guideId === 'string' ? o.guideId.trim() : '',
      intro: typeof o.intro === 'string' ? o.intro : '',
      steps: Array.isArray(o.steps) ? o.steps.map((x) => String(x).trim()).filter(Boolean) : [],
      message: typeof o.message === 'string' ? o.message.trim() : '',
      tip: typeof o.tip === 'string' ? o.tip : '',
      images: Array.isArray(o.images) ? o.images.map((x) => String(x).trim()).filter(Boolean) : [],
      citations: Array.isArray(o.citations) ? o.citations.map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n)) : [],
    };
  } catch (e) {
    const lines = (raw || '').split(/\n+/).map((x) => x.replace(/^[-*\d.\)\s]+/, '').trim()).filter(Boolean);
    return { guideId: '', intro: '', steps: lines.slice(0, 6), message: '', tip: '', images: [], citations: [] };
  }
}
