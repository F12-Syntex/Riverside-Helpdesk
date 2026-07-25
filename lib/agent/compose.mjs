// Writing the answer, and then checking it.
//
// The agent's research phase is free to search as much as it likes; this is the
// part that decides what the reader is actually allowed to see. Two rules, both
// enforced in code rather than trusted to the prompt:
//
//   1. A section that claims the practice's own material must carry a verbatim
//      quote that really appears in a passage a tool returned. Verified against
//      the evidence registry, not against the model's say-so.
//   2. A section that claims the web must cite a W-reference that a real search
//      returned, and it is labelled as web content in the UI — never presented
//      as practice policy.
//
// Anything that fails is fed back to the model once, naming what failed and
// why. Whatever still fails after that is dropped. If everything is dropped,
// the answer becomes an honest "I could not find this", which is the correct
// answer to a question the practice's material does not cover.
import { generateObject } from 'ai';
import { z } from 'zod';

const MAX_ATTEMPTS = 2;

export const AnswerSchema = z.object({
  answerable: z.boolean().describe('False only when the question needs a clinician’s judgement about a specific patient, or nothing was found to answer it with.'),
  intro: z.string().describe('One or two sentences framing the answer, or explaining why there is none.'),
  sections: z.array(z.object({
    markdown: z.string().describe('The content, as markdown. Headings, numbered steps, tables and bold are all fine.'),
    basis: z.enum(['practice', 'web']).describe('"practice" = from the practice’s documents or Notebook. "web" = from a web page.'),
    ref: z.string().describe('The source reference this is based on: P1/P2… for practice sources, W1/W2… for web pages.'),
    quote: z.string().describe('For practice sources: a verbatim span of at least a dozen words copied exactly from that source, character for character. For web sources: a short quote from the page extract, or an empty string.'),
  })).describe('The body of the answer, split into sections by source.'),
  message: z.string().default('').describe('Optional wording to send to a patient. Empty when not asked for.'),
  messageRef: z.string().default('').describe('The source reference backing the message, if any.'),
  messageQuote: z.string().default('').describe('Verbatim quote backing the message, if any.'),
  tip: z.string().default('').describe('Optional short practical tip. Empty if none.'),
  gaps: z.string().default('').describe('What the practice’s own material does NOT cover, stated plainly. Empty when it covers everything asked.'),
});

function locationOf(chunk) {
  if (chunk.view && chunk.view.page) return 'Page ' + chunk.view.page;
  if (chunk.section) return chunk.section;
  if (chunk.headingPath && chunk.headingPath.length) return chunk.headingPath.join(' › ');
  return 'Document';
}

const DISPLAYABLE_IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const MAX_CITE_IMAGES = 4;

// Pictures that belong to this exact source: a Notebook note's attachments, or
// the rendered image of a cited PDF page. A whole HTML document's images are too
// imprecise to show against a single section unless the set is already small.
function citeImages(chunk) {
  const imgs = Array.isArray(chunk.images) ? chunk.images.filter((u) => typeof u === 'string' && DISPLAYABLE_IMAGE.test(u)) : [];
  if (!imgs.length) return [];
  if (chunk.view && chunk.view.kind === 'html' && imgs.length > MAX_CITE_IMAGES) return [];
  return imgs.slice(0, MAX_CITE_IMAGES);
}

// The citation object the chat UI and the document viewer both consume. Same
// shape the previous pipeline produced, so every downstream component (source
// panel, PDF page jump, quote highlight, thumbnails) keeps working unchanged.
export function citationFor(chunk, quote = '') {
  const tidy = (t) => String(t || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const body = tidy(chunk.text);
  const flat = body.replace(/\s+/g, ' ');
  return {
    docId: chunk.docId,
    docTitle: chunk.docTitle,
    location: locationOf(chunk),
    snippet: flat.length > 220 ? flat.slice(0, 218).trim() + '…' : flat,
    text: body,
    quote: tidy(quote),
    view: chunk.view || null,
    images: citeImages(chunk),
  };
}

function evidenceBlock(evidence) {
  const practice = evidence.practiceList();
  const web = evidence.webList();
  const parts = [];

  if (practice.length) {
    parts.push('PRACTICE SOURCES (authoritative — the practice’s own documents and Notebook):');
    for (const c of practice) {
      parts.push(`[${c.ref}] ${c.docTitle} — ${locationOf(c)}\n${String(c.text || '').trim()}`);
    }
  } else {
    parts.push('PRACTICE SOURCES: none were found for this question.');
  }

  if (web.length) {
    parts.push('\nWEB PAGES (NOT practice policy — general information found online):');
    for (const w of web) parts.push(`[${w.ref}] ${w.title} — ${w.url}\n${w.snippet}`);
  }
  return parts.join('\n\n');
}

function composePrompt({ question, history, evidence, feedback }) {
  const lines = [
    'You are the reception assistant for The Riverside Practice, a UK GP surgery. You are writing the answer that a receptionist will act on.',
    '',
    'THE RULES, IN ORDER OF IMPORTANCE',
    '1. Answer from the PRACTICE SOURCES wherever they cover the question. They are what the practice actually does.',
    '2. Every section you write must name the source it came from and, for practice sources, carry a quote copied EXACTLY from that source — character for character, at least a dozen words. A quote that is paraphrased, tidied or stitched together from two places will be rejected and your section thrown away.',
    '3. If the practice sources do not cover part of the question and a web page does, you may write that section with basis "web". Say in the text itself that it is general guidance, not the practice’s own. Never dress a web page up as practice policy.',
    '4. If neither covers it, say so. Put what is missing in "gaps" and name who to ask (the practice manager, the duty doctor, the relevant lead). Do not fill the hole from your own knowledge.',
    '5. Never give clinical judgement about a specific patient. If that is what is being asked, set answerable to false and say a clinician must decide.',
    '6. Do not invent telephone numbers, email addresses, names or dates. Any that appear must come from a source.',
    '',
    'STYLE',
    '- Write for someone doing the task now: short sections, numbered steps for a process, the whole process end to end rather than a fragment of it.',
    '- Markdown is fine (headings, lists, tables, bold). Keep it tight — no preamble, no summary of what you are about to say.',
    '',
  ];
  if (history) lines.push('CONVERSATION SO FAR:', history, '');
  lines.push('QUESTION:', question, '', evidenceBlock(evidence));
  if (feedback) {
    lines.push(
      '',
      'YOUR PREVIOUS ATTEMPT WAS PARTLY REJECTED. Fix these and rewrite the whole answer:',
      feedback,
      '',
      'Copy quotes character for character from the source text above. If you cannot find an exact quote for something, drop that section rather than approximating it, and note the gap.',
    );
  }
  return lines.join('\n');
}

// Check one draft against the evidence. Returns the sections that survive, with
// their resolved citations, plus a human-readable list of what failed so the
// model can be told precisely what to fix.
export function validateDraft(draft, evidence) {
  const kept = [];
  const problems = [];

  const check = (item, label) => {
    const text = String(item.markdown || '').trim();
    if (!text) return null;
    if (item.basis === 'web') {
      const web = evidence.getWeb(item.ref);
      if (!web) {
        problems.push(`${label}: cites "${item.ref}", which is not a web page any search returned. Cite a real W-reference or drop it.`);
        return null;
      }
      return { markdown: text, basis: 'web', cite: null, web: { title: web.title, url: web.url } };
    }
    const found = evidence.verifyPractice(item.quote, item.ref);
    if (!found) {
      problems.push(`${label}: the quote "${String(item.quote || '').slice(0, 60)}…" does not appear in any practice source. Quote exactly, or write this from the web instead, or drop it.`);
      return null;
    }
    return { markdown: text, basis: 'practice', cite: citationFor(found.chunk, found.exact ? item.quote : ''), web: null };
  };

  (draft.sections || []).forEach((sec, i) => {
    const ok = check(sec, `Section ${i + 1}`);
    if (ok) kept.push(ok);
  });

  // The suggested patient message is optional and never load-bearing, so a
  // failed citation demotes it to unsourced wording rather than rejecting it.
  let messageCite = null;
  let messageWeb = null;
  if (String(draft.message || '').trim()) {
    const found = evidence.verifyPractice(draft.messageQuote, draft.messageRef);
    if (found) messageCite = citationFor(found.chunk, found.exact ? draft.messageQuote : '');
    else {
      const web = evidence.getWeb(draft.messageRef);
      if (web) messageWeb = { title: web.title, url: web.url };
    }
  }

  return { sections: kept, problems, messageCite, messageWeb };
}

// Write an answer, check it, and give the model one chance to fix what failed.
// `onStatus` reports each stage so the browser can show what is happening.
export async function composeVerifiedAnswer({ model, question, history, evidence, onStatus }) {
  let draft = null;
  let result = null;
  let attempts = 0;
  let feedback = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    if (onStatus) onStatus(attempt === 1 ? 'Writing the answer' : 'Correcting unverified claims');
    const generated = await generateObject({
      model,
      schema: AnswerSchema,
      temperature: 0.2,
      prompt: composePrompt({ question, history, evidence, feedback }),
    });
    draft = generated.object;
    if (onStatus) onStatus('Checking every claim against its source');
    result = validateDraft(draft, evidence);
    if (!result.problems.length) break;
    if (attempt === MAX_ATTEMPTS) break;
    feedback = result.problems.map((p, i) => `${i + 1}. ${p}`).join('\n');
  }

  const dropped = Math.max(0, (draft.sections || []).length - result.sections.length);
  return {
    answerable: draft.answerable !== false && result.sections.length > 0,
    intro: String(draft.intro || '').trim(),
    sections: result.sections,
    message: String(draft.message || '').trim(),
    messageCite: result.messageCite,
    messageWeb: result.messageWeb,
    tip: String(draft.tip || '').trim(),
    gaps: String(draft.gaps || '').trim(),
    validation: {
      attempts,
      checked: (draft.sections || []).length,
      verified: result.sections.length,
      dropped,
      problems: result.problems,
    },
  };
}
