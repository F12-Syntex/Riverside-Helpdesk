// The practice's own documents, answered instead of quoted.
//
// WHAT THIS REPLACES. /practice used to return the passages search found, word
// for word, five of them, each cut at 700 characters and finished with " […]".
// The guarantee was real — no model, so nothing paraphrased — but the reader
// asked a question and got a wall of policy, most of it about something else,
// stopping mid-thought. "A bunch of things I don't care about" is exactly what
// it was: the search's workings, printed.
//
// SO IT IS AN ANSWER NOW, IN THE SHAPE EVERY OTHER ANSWER USES. The documents
// are read, the question is answered in plain English, and every line carries a
// chip saying which document it stands on. Clicking the chip opens that
// document at the exact words — so the verbatim text did not go anywhere, it
// moved to where somebody who wants it can get it, instead of standing between
// everybody else and the answer.
//
// WHAT THE MODEL MAY AND MAY NOT DO. It may put the document's meaning in its
// own words. It may leave out everything the question did not ask about — that
// is most of the improvement. It may NOT add anything the documents do not say:
// every section quotes the passage it came from, the quote is checked here
// against the retrieved text, and a section whose quote is not found verbatim
// is dropped before the reader sees it (lib/ai/citations.mjs). A model that
// half-remembers a policy produces no section, not a wrong one.
//
// AND NO ELLIPSIS. Not " […]", not "...". A sentence either says something or
// is not written: a trailing ellipsis is the answer telling the reader it gave
// up halfway, which is not a thing the practice's policy did.
import { z } from 'zod';
import { dedupeCitations, locationOf, resolveCite } from '../ai/citations.mjs';

/** How many passages the writer reads, and how many may come from one document. */
export const MAX_SOURCES = 8;
const MAX_PER_DOCUMENT = 3;

/**
 * The passages worth reading, numbered as Sources.
 *
 * Three per document at most: a long policy matches its own wording over and
 * over, and eight extracts from one file is a narrower read than eight files.
 */
export function practiceSources(passages = []) {
  const perDocument = new Map();
  const refMap = new Map();
  const extracts = [];
  for (const passage of passages) {
    if (!passage || !String(passage.text || '').trim()) continue;
    const key = passage.docTitle || passage.docId || '';
    const used = perDocument.get(key) || 0;
    if (used >= MAX_PER_DOCUMENT) continue;
    perDocument.set(key, used + 1);
    const ref = extracts.length + 1;
    refMap.set(ref, passage);
    extracts.push({ ref, title: passage.docTitle || 'Untitled document', location: locationOf(passage), text: passage.text });
    if (extracts.length >= MAX_SOURCES) break;
  }
  return { refMap, extracts };
}

export const PRACTICE_ANSWER_SCHEMA = z.object({
  answerable: z.boolean().describe(
    'True if the Sources below actually answer what was asked. False if they are about something '
    + 'else, or only mention the subject in passing — say so rather than assembling an answer out '
    + 'of whatever was retrieved.',
  ),
  intro: z.string().describe(
    'The answer itself, in one or two sentences, in the first thing the reader sees. Not a '
    + 'restatement of the question, not "the documents say" — the answer. Empty if not answerable.',
  ),
  sections: z.array(z.object({
    heading: z.string().describe(
      'Two or three words naming what this part covers, or an empty string when the answer is '
      + 'short enough not to need dividing up.',
    ),
    markdown: z.string().describe(
      'What the documents say about this part, in plain British English, in your own words. '
      + 'Markdown: "- " bullets, "1. " for anything done in order, **bold** for the exact thing to '
      + 'click, type or say. Say the thing itself rather than describing where it is written. '
      + 'NEVER write an ellipsis of any kind, and never trail off.',
    ),
    source: z.number().describe('The Source number this part comes from.'),
    quote: z.string().describe(
      'The words in that Source this part stands on, copied EXACTLY, character for character, '
      + 'from the Source text — at least a full clause. It is checked against the Source and the '
      + 'part is dropped if it is not found, so copy rather than remember.',
    ),
    critical: z.boolean().describe(
      'True only for something that risks a patient, a breach or a missed deadline if it is not '
      + 'followed. A red block on every section is a red block nobody reads.',
    ),
  })).describe('The answer, in order. Two to five parts; one is fine when the answer is one thing.'),
});

/**
 * What to ask the writer.
 *
 * The reader typed a question and chose the practice-documents mode, so the job
 * is stated as narrowly as it actually is: these documents, this question,
 * nothing else in the world.
 */
export function practiceAnswerPrompt({ question, extracts = [] }) {
  const sources = extracts
    .map((ex) => `Source ${ex.ref} [${ex.title}${ex.location ? ' — ' + ex.location : ''}]:\n${ex.text}`)
    .join('\n\n');
  return [
    'You are answering a member of staff at The Riverside Practice, a UK GP surgery, from the',
    'practice’s own policies and protocols. They asked to be answered from these documents, so',
    'these documents are the whole world: everything you write comes out of the Sources below, and',
    'anything they do not cover is not answered.',
    '',
    'HOW TO WRITE',
    '- Answer the question that was asked. Leave out everything else the Sources happen to say.',
    '- Plain British English, NHS style, sentence case, no emoji, no preamble, no closing line.',
    '- Short. A busy receptionist reads the first few lines and acts on them.',
    '- Your own words are fine and usually clearer than the document’s. The meaning must not move.',
    '- Do not describe the document ("the policy states that…"). Say what to do.',
    '- Never write an ellipsis of any kind, and never stop mid-sentence.',
    '- Every part quotes the Source it came from, copied exactly. A part whose quote is not found',
    '  in its Source is deleted before the reader sees it, so copy the words rather than recall them.',
    '- If the Sources do not answer the question, set answerable to false and write nothing else.',
    '  That is a good answer: it tells the reader to look elsewhere instead of misleading them.',
    '',
    'The practice documents retrieved for this question:',
    '',
    sources || '(nothing was retrieved)',
    '',
    'The question is:',
    '"""',
    String(question || '').trim(),
    '"""',
  ].join('\n');
}

// Belt and braces on the ellipsis rule: the prompt forbids it, and anything the
// model writes anyway is repaired here rather than shown. A sentence that ended
// in one is closed with a full stop; a bracketed one in the middle of a line is
// simply not there.
export function withoutEllipsis(markdown) {
  return String(markdown || '')
    .replace(/\s*\[\s*(?:…|\.{3,})\s*\]/g, '')
    .replace(/\s*\(\s*(?:…|\.{3,})\s*\)/g, '')
    .replace(/\s*(?:…|\.{3,})(?=\s|$)/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/ +([,.;:])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Check what was written against what was retrieved.
 *
 * Returns the sections that survived, in the answer shape the chat already
 * renders — { heading, markdown, basis, critical, cite, web } — plus the
 * distinct sources they relied on.
 */
export function groundPracticeAnswer({ written, refMap, redact = (t) => t }) {
  const sections = [];
  for (const part of (written && written.sections) || []) {
    const markdown = withoutEllipsis(redact(part.markdown));
    if (!markdown) continue;
    const cite = resolveCite(refMap, part.source, part.quote);
    // No verified quote, no section. This is the whole guarantee: what is left
    // on the card is what the documents were found to say.
    if (!cite) continue;
    sections.push({
      heading: String(part.heading || '').trim(),
      markdown,
      basis: 'documents',
      critical: !!part.critical,
      cite,
      web: null,
    });
  }

  // Each source image appears once, against the first section that cites it —
  // several sections often come off the same page.
  const seen = new Set();
  for (const section of sections) {
    if (!section.cite || !section.cite.images || !section.cite.images.length) continue;
    section.cite.images = section.cite.images.filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }

  return {
    intro: withoutEllipsis(redact((written && written.intro) || '')),
    sections,
    citations: dedupeCitations(sections.map((s) => s.cite)),
  };
}
