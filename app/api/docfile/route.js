// Document-coding endpoint. Staff paste the text of a medical document (or a
// screenshot of it) with patient identifiers removed, and get back the one-line
// filing title "(dd-Mmm-yyyy) SOURCE DEPARTMENT actions-or-note" used to code
// the document into the clinical system. Dedicated, lightweight version of the
// docfile branch in /api/ask: no retrieval — the pasted document is the only
// evidence for the title — with the same server-side date and active-item
// sanitisation so nothing unevidenced reaches the title.
//
// The title's tail is the document's ACTIVE items: what the practice has to do,
// what changed on the prescription, and what plan is already running. The
// narrative — history, examination, findings — never reaches the title.
//
// The one piece of context it does read is the practice's own coding guidance:
// the "Document coding" section of the in-app Notebook is loaded live and folded
// into the prompt (source/department naming, what counts as a practice action
// here, and so on). It is best-effort — if the Notebook cannot be read the
// endpoint still codes the document from the pasted text alone.
import { NextResponse } from 'next/server';
import { parseAiJson } from '@/lib/ai/prompt';
import { notebookSectionContext } from '@/lib/notebook';
import { resolveDocfileDate, docfileActiveItems, sanitizeDocfileNote } from '@/lib/ai/docfile.mjs';
import { getAiModel } from '@/lib/settings';
import { chatRequest } from '@/lib/ai/openrouter.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;


// Same bounds as /api/ask for attached images.
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 6_000_000;
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

// The Notebook section whose subtree holds the practice's document-coding guidance.
const CODING_SECTION = 'Document coding';

// The docfile rules from the main ask prompt, standalone. The reply shape keeps
// kind:"docfile" so the shared parseAiJson returns the docfile object.
function buildPrompt(text, imageCount, guidance) {
  // Practice coding guidance from the Notebook is authoritative for this
  // practice's conventions (source/department naming, local abbreviations, what
  // counts as a practice action). It supplements — never overrides — the
  // evidence and safety rules below (no patient identifiers, evidence-quoted
  // dates and actions only).
  const guidanceBlock = guidance
    ? 'PRACTICE DOCUMENT-CODING GUIDANCE (from the practice\'s Notebook — follow it for this practice\'s conventions; it does NOT relax the evidence and no-identifier rules below):\n"""\n'
      + guidance + '\n"""\n\n'
    : '';
  return 'You code incoming medical documents for a UK GP practice (The Riverside Practice). '
    + 'The staff member has pasted a medical document about a patient'
    + (imageCount ? ' and attached ' + imageCount + ' screenshot(s) of it' : '')
    + '. Produce the parts of its one-line filing title.\n\n'
    + guidanceBlock
    + 'Reply with ONLY this JSON (no markdown fences):\n'
    + '{"kind":"docfile","date":"dd-Mmm-yyyy","dateEvidence":"exact date as printed","dateType":"discharge|attendance|clinic|report|letter","source":"Ipswich Hospital","department":"Cardiology","actions":[{"text":"repeat U&E 2/52","evidence":"exact words from the document that this item comes from"}],"note":"","noteEvidence":""}\n'
    + 'The reader files the document under the one-line title "(date) source department actions-or-note", so every field must be as short as possible:\n'
    + '- Use ONLY the pasted document and attached image(s). Today’s date is not evidence. Never add professional judgement.\n'
    + '- "date": copy the clinical event date. Priority is discharge date, attendance/clinic/consultation date, then report/procedure date; use the letter date only when no event date exists. NEVER use date of birth, a historical diagnosis/medication date, referral date, or a received/scanned/printed date. Always dd-Mmm-yyyy with a three-letter English month, for example 07-Aug-2026. Empty string if uncertain.\n'
    + '- "dateEvidence": copy the chosen date EXACTLY as printed, for example "7/8/26". "date" must be the same date normalised to dd-Mmm-yyyy. If you cannot quote the chosen date, leave both fields empty.\n'
    + '- "source": the shortest recognisable name of the hospital, trust site or service that produced the document (for example "Ipswich Hospital" or a common local abbreviation the document itself uses such as "HUH" or "MEH", not the trust’s full legal name).\n'
    + '- "department": the department, specialty or clinic (for example "Cardiology", "ED", "Dermatology"); empty string if none is identifiable.\n'
    + '- "actions": the LIVE items only — what a busy GP has to know NOW, in three kinds:\n'
    + '  (a) TASK — anything the document asks the GP, primary care or the practice to do: prescribe, issue, arrange, request, repeat, monitor, refer, chase, book, act on a result.\n'
    + '  (b) MEDICATION — any prescription change: a drug started, stopped, switched, dose increased or reduced, a discharge/TTO supply to continue, or a course to complete. Give the drug, the dose and how long, for example "start apixaban 5mg BD 3/12".\n'
    + '  (c) PLAN — what is still to happen: follow-up or clinic appointment, referral made, tests booked, results awaited, monitoring due, care handed back to the GP. For example "cardiology f/u 3/12" or "awaiting MRI head".\n'
    + '  Each item MUST carry an "evidence" quote copied exactly from the document. No evidence quote means no item. An empty array is right when the document holds none of these.\n'
    + '- NEVER include the story: presenting complaint, past history, examination, observations, findings, results commentary, unchanged repeat medication, social background, reassurance, or anything already done and finished. A finding earns a place only when it comes with a task, a prescription change or a plan.\n'
    + '- NEVER infer that a GP must review a document. Drop "GP to review", "GP r/v", "review letter/result/document", "for GP information", "note diagnosis", "update record" and similar comments unless the document explicitly says the GP/practice must urgently review a named patient issue or perform a named task.\n'
    + '- Do not include a task assigned to the hospital, community team, clinic or patient UNLESS it is the plan the GP needs to know is running.\n'
    + '- 0 to 6 items, tasks first, then medication, then plan. Each one a terse fragment of a few words in practice shorthand — never a sentence, never more than about 10 words.\n'
    + '- "note": normally empty. Do not add "FYI", "no action", reassurance or commentary. Use a very short status only when the document explicitly states a filing-relevant outcome such as discharge or DNA, and copy those exact words into "noteEvidence". No evidence means an empty note.\n'
    + '- NEVER include the patient’s name, NHS number, date of birth, address or any other patient identifier in any field, even if the pasted document still contains one.\n\n'
    + 'Document text:\n"""\n' + String(text || '').replace(/"{3,}/g, '""') + '\n"""';
}

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  // The model is a practice setting now, changed at /settings — see lib/settings.js.
  const model = await getAiModel();
  if (!apiKey) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY.' }, { status: 500 });
  }

  let text = '';
  let images = [];
  try {
    const body = await request.json();
    text = typeof body?.text === 'string' ? body.text.trim() : '';
    images = sanitizeImages(body?.images);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!text && !images.length) return NextResponse.json({ error: 'Paste the document text or attach a screenshot.' }, { status: 400 });
  if (text.length > 40_000) return NextResponse.json({ error: 'Document text is too long.' }, { status: 400 });

  // Practice coding guidance is best-effort: a missing or unreachable Notebook
  // must never stop staff getting a filing title.
  const guidance = await notebookSectionContext(CODING_SECTION).catch(() => '');

  const prompt = buildPrompt(text, images.length, guidance);
  const content = images.length
    ? [{ type: 'text', text: prompt }].concat(images.map((url) => ({ type: 'image_url', image_url: { url } })))
    : prompt;

  try {
    // No-retention routing and no extended reasoning, both from lib/ai/openrouter.
    const res = await fetch(...chatRequest(apiKey, {
      model, temperature: 0.1, messages: [{ role: 'user', content }],
    }));
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenRouter error (${res.status}).`, detail: detail.slice(0, 500) }, { status: 502 });
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '';
    if (!raw) return NextResponse.json({ error: 'No content returned by the model.' }, { status: 502 });

    const parsed = parseAiJson(raw);
    if (parsed.kind !== 'docfile') {
      return NextResponse.json({ error: 'This does not look like a medical document to code. Paste the document text itself.' }, { status: 422 });
    }

    // Same assembly as /api/ask: verified date (or a visible placeholder so the
    // title's shape is stable and staff fill the gap in), evidence-checked
    // actions and note.
    const date = resolveDocfileDate({
      date: parsed.date, dateEvidence: parsed.dateEvidence,
      documentText: text, hasImages: images.length > 0,
    }) || 'dd-Mmm-yyyy';
    // The live items, each tagged task / medication / plan so the page can group
    // them; the title itself keeps them in that same order, tasks first.
    const items = docfileActiveItems(parsed.actions, { documentText: text, hasImages: images.length > 0 });
    const actions = items.map((item) => item.text);
    const note = sanitizeDocfileNote({
      note: parsed.note, noteEvidence: parsed.noteEvidence,
      documentText: text, hasImages: images.length > 0,
    });
    const tail = actions.length ? actions.join('; ') : note;
    const title = ['(' + date + ')', parsed.source, parsed.department, tail].filter(Boolean).join(' ');

    return NextResponse.json({ title, date, source: parsed.source, department: parsed.department, actions, items, note });
  } catch (e) {
    return NextResponse.json({ error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) }, { status: 502 });
  }
}
