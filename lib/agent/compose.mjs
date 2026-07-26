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
  keyPoints: z.array(z.object({
    text: z.string().describe('One line a busy receptionist can act on, at most 18 words. No preamble.'),
    ref: z.string().describe('The source reference this point comes from — it must be one you used in a section below.'),
    critical: z.boolean().default(false).describe('True only for a point that risks patient safety, a breach, or a missed deadline if it is skipped.'),
  })).default([]).describe('Two to four lines summarising what the reader must take away. Empty when there is no answer.'),
  sections: z.array(z.object({
    heading: z.string().default('').describe('A short label for this section, at most six words, in sentence case. Empty only when the answer is a single short section.'),
    markdown: z.string().describe('The content, as markdown. Headings, numbered steps, tables and bold are all fine.'),
    basis: z.enum(['practice', 'web']).describe('"practice" = from the practice’s documents or Notebook. "web" = from a web page.'),
    ref: z.string().describe('The source reference this is based on: P1/P2… for practice sources, W1/W2… for web pages.'),
    quote: z.string().describe('For practice sources: a verbatim span of at least a dozen words copied exactly from that source, character for character. For web sources: a short quote from the page extract, or an empty string.'),
    critical: z.boolean().default(false).describe('True only when getting this section wrong risks patient safety, a data breach, a missed legal deadline, or a complaint. Never more than two sections.'),
  })).describe('The body of the answer, split into sections by source.'),
  message: z.string().default('').describe('Optional wording to send to a patient. Empty when not asked for.'),
  messageRef: z.string().default('').describe('The source reference backing the message, if any.'),
  messageQuote: z.string().default('').describe('Verbatim quote backing the message, if any.'),
  tip: z.string().default('').describe('Optional short practical tip. Empty if none.'),
  followUps: z.array(z.string()).default([]).describe('At most two questions the reader can tap to ask next, each written exactly as they would type it. Use one when a step has its own procedure that does not belong in this answer — for example creating the referral letter. Empty when the answer is complete on its own.'),
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

function composePrompt({ question, history, evidence, feedback, previous }) {
  const lines = [
    'You are the reception assistant for The Riverside Practice, a UK GP surgery. You are writing the answer that a receptionist will act on.',
    '',
    'THE RULES, IN ORDER OF IMPORTANCE',
    '1. Answer from the PRACTICE SOURCES wherever they cover the question. They are what the practice actually does.',
    '2. Every section you write must name the source it came from and, for practice sources, carry a quote copied EXACTLY from that source — character for character, at least a dozen words. A quote that is paraphrased, tidied or stitched together from two places will be rejected and your section thrown away.',
    '2a. The section TEXT is yours to write. Rewrite the source into plain steps a receptionist can follow — that is the job. Only the `quote` field must be verbatim: it is the proof the section is real, not the text shown to the reader. Never copy a wall of policy prose across just because it is easier to quote.',
    '3. If the practice sources do not cover part of the question and a web page does, you may write that section with basis "web". Say in the text itself that it is general guidance, not the practice’s own. Never dress a web page up as practice policy.',
    '4. If neither covers it, say so. Put what is missing in "gaps" and name who to ask (the practice manager, the duty doctor, the relevant lead). Do not fill the hole from your own knowledge.',
    '5. Never give clinical judgement about a specific patient. If that is what is being asked, set answerable to false and say a clinician must decide.',
    '6. Do not invent telephone numbers, email addresses, names or dates. Any that appear must come from a source.',
    '',
    'SHAPE — this matters as much as the content',
    '- A section is a unit the reader acts on. It is NOT a copy of a source passage. Never write one section per quote: if four passages describe one process, that is ONE section with a numbered list, quoting the passage the steps come from.',
    '- Aim for two to four sections in total. Each one needs a heading of at most six words; a heading is required whenever there is more than one section.',
    '- Start with keyPoints: two to four lines that are the whole answer in brief. One line each, no more than 18 words, the thing to actually do. Every point cites the ref of the section it comes from.',
    '- A process MUST be a numbered markdown list: one action per step, imperative ("Open…", "Select…", "Send…"), under 25 words a step, in the order they are done. Never bury steps in a paragraph and never split one process across sections.',
    '- **Bold** the exact thing to click, type or say — the button, menu, field or form name. Bold nothing else.',
    '- Never restate the steps as prose elsewhere. The numbered list IS the process; a section that repeats it in sentences is wasted reading.',
    '- MOST ANSWERS HAVE NO CRITICAL SECTION. Set critical: true only for a warning the reader could act wrongly without — a safety rule, a legal duty, a deadline, something that causes harm if missed. Never on the main steps, never on background or definitions, and never on more than one section. If everything is red, nothing is.',
    '- Give the whole process end to end, not a fragment of it. No preamble, no summary of what you are about to say, no closing pleasantries.',
    '',
    'REFERRALS — the shape every referral answer takes',
    'The referral process is the SAME every time. The only thing that changes between one referral and the next is the TYPE OF REFERRAL — which means a SPECIALITY and a CLINIC TYPE. Answer accordingly:',
    '- START FROM GETTING THE LETTER, NOT MAKING IT. The doctor has usually already completed the referral document; it is in the patient\'s Consultation. Step one is to find it there. Do NOT walk the reader through creating a letter — no "Add → Document → Create letter", no magnifying glass, no form picking — unless the question explicitly asks how to create a referral letter.',
    '- When you leave the letter-creation steps out, offer them as a followUp instead, worded as the reader would ask it, for example "How do I create the referral letter?". That is what followUps are for: one tap asks it as the next question.',
    '- Then give the standard steps as the sources set them out, in order, end to end. Do not summarise them as "follow the standard process" — write the steps.',
    '- Inside those steps, always say which SPECIALITY and which CLINIC TYPE to set for this particular referral. That pairing IS the "type of referral" field. A referral cannot be sent without both.',
    '- Never guess a speciality or a clinic type, and never leave them as a blank for the reader to fill in. If no source records them for this referral, say so plainly and put it in "gaps", naming who to ask.',
    '- A CANCER referral is a two week wait (2WW) referral. Set the priority to 2WW, not Routine, and use the 2WW clinic type the source gives for that speciality.',
    '- If the question is about an EMAIL referral, give the email steps ONLY: who to email, the address as the source gives it, what to attach, what to record afterwards. Do not also describe the e-RS / Choose and Book route, and never set out both routes for the reader to choose between.',
    '',
  ];
  if (history) lines.push('CONVERSATION SO FAR:', history, '');
  lines.push('QUESTION:', question, '', evidenceBlock(evidence));
  if (feedback) {
    // The repair round is given its own previous answer to correct. Asking for a
    // fresh rewrite instead made it worse as often as better: it would lose the
    // headings and the numbered steps it had already got right while fixing an
    // unrelated quote.
    lines.push(
      '',
      'YOUR PREVIOUS ATTEMPT, AS JSON:',
      JSON.stringify(previous || {}),
      '',
      'It was partly rejected for these defects:',
      feedback,
      '',
      'Return that same answer with those defects fixed. Keep every section, heading, numbered list and key point that is not mentioned above exactly as it is.',
      'Keep everything that was already fine and fix only what is listed. Copy quotes character for character from the source text above; if you cannot find an exact quote for something, drop that section rather than approximating it, and note the gap. Remember the section text is yours to write — only the quote must be verbatim, so a process is still written as numbered steps in your own words.',
    );
  }
  return lines.join('\n');
}

const PROCEDURAL_QUESTION = /\bhow (?:do|does|should|can) (?:i|we|you)\b|\bwhat (?:do|should) (?:i|we) do\b|\bsteps?\b|\bprocess\b|\bprocedure\b/i;
const NUMBERED_STEP = /^\s*\d+[.)]\s+\S/m;

// Structure checks, run alongside the grounding checks and fed back through the
// same repair round. An answer that is correct but arrives as four undifferentiated
// slabs of policy text is not usable by someone with a patient at the desk — so
// "hard to read" is treated as a defect, not a matter of taste.
function structureProblems(sections, question) {
  const problems = [];
  if (!sections.length) return problems;

  const missingHeadings = sections.filter((sec) => !sec.heading).length;
  if (sections.length > 1 && missingHeadings) {
    problems.push(`${missingHeadings} of your ${sections.length} sections have no heading. Give every section a heading of at most six words, or merge the sections that belong together.`);
  }
  if (sections.length > 4) {
    problems.push(`You wrote ${sections.length} sections. That is one per source passage, not one per thing the reader does. Merge them into at most four sections, each with a heading.`);
  }
  if (PROCEDURAL_QUESTION.test(question) && !sections.some((sec) => NUMBERED_STEP.test(sec.markdown))) {
    // Not every "how do I" has a sequence behind it — some sources only set out
    // a standard, not a procedure — so this one lets the model decline.
    problems.push('This question asks how something is done, but no section sets it out as a numbered list. If the sources describe a sequence of actions, write it as numbered steps, one action per step, in the order they happen. If they genuinely describe no procedure, leave the answer as it is.');
  }
  return problems;
}

const REFERRAL_QUESTION = /\brefer(?:ral|rals|red|ring|s)?\b/i;
// "How do I write the referral letter" is the one question the letter belongs in.
const LETTER_ASKED = /\bletters?\b/i;
// The EMIS steps for authoring a referral letter. The doctor has normally done
// this already, so seeing these in an answer about making a referral means the
// reader has been sent to redo work that is sitting in the consultation.
const LETTER_CREATION = /\bcreate (?:a |the )?letter\b|\bcreating the referral letter\b|\bmagnifying glass\b|\badd\s*(?:→|->|›|>)\s*document\b|\bdictat(?:e|ing)\b/i;
const EMAIL_ASKED = /\be-?mail(?:ed|ing|s)?\b/i;
// The other route a referral can take. Naming it alongside the email steps is
// how the reader ends up sending the same referral twice, or by the wrong one.
const ERS_ROUTE = /\be-?rs\b|\be-referrals?\b|\bchoose and book\b|\bc&b\b/i;
const SPECIALITY = /\bspecialit(?:y|ies)\b|\bspecialt(?:y|ies)\b/i;
const CLINIC_TYPE = /\bclinic type\b/i;

// Referral answers have three failure modes that are invisible to the grounding
// checks — every section can be perfectly quoted and the answer still be the
// wrong one to hand a receptionist. Checked here and fed through the same repair
// round as the structure defects.
function referralProblems(sections, question, followUps = []) {
  const problems = [];
  if (!sections.length || !REFERRAL_QUESTION.test(question)) return problems;

  // 1. Making the referral and writing the letter are different jobs. The doctor
  //    has usually already done the letter, so the answer starts by finding it in
  //    the consultation; the creation steps are offered as a follow-up instead.
  if (!LETTER_ASKED.test(question)) {
    const creating = sections.find((sec) => LETTER_CREATION.test(sec.markdown) || LETTER_CREATION.test(sec.heading));
    if (creating) {
      problems.push('This question does not ask how to create a referral letter, so the answer must not walk through creating one. Say the doctor has usually already completed the referral document and it is in the patient’s Consultation, then give the referral steps. Offer "How do I create the referral letter?" in followUps instead of explaining it here.');
    } else if (PROCEDURAL_QUESTION.test(question) && !followUps.some((q) => /\bletters?\b/i.test(q))) {
      // Leaving the letter out silently is only half right — the reader still
      // needs a way to reach those steps when the doctor has not done it.
      problems.push('Add a followUp asking how to create the referral letter, worded as the reader would type it, so they can reach those steps in one tap when the doctor has not already completed the document.');
    }
  }

  // 2. A referral cannot be sent without both fields, so an answer that never
  //    names them has not answered the question. Saying the sources do not
  //    record them satisfies this too — that is a real answer, a blank is not.
  if (PROCEDURAL_QUESTION.test(question)) {
    const body = sections.map((sec) => sec.heading + ' ' + sec.markdown).join('\n');
    if (!SPECIALITY.test(body) || !CLINIC_TYPE.test(body)) {
      problems.push('The answer never says which speciality and which clinic type to set for this referral. Name both, quoting the source that records them — the Notebook page for this referral. If no source records them, say that plainly in the answer instead of leaving it out.');
    }
  }

  // 3. An email referral is its own route from end to end.
  if (EMAIL_ASKED.test(question)) {
    const mixed = sections.find((sec) => ERS_ROUTE.test(sec.markdown) || ERS_ROUTE.test(sec.heading));
    if (mixed) {
      problems.push('This question is about an email referral, so give the email steps only. Remove the e-RS / Choose and Book route from the answer rather than describing both.');
    }
  }
  return problems;
}

// Check one draft against the evidence. Returns the sections that survive, with
// their resolved citations, plus a human-readable list of what failed so the
// model can be told precisely what to fix.
export function validateDraft(draft, evidence, question = '') {
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
      return {
        heading: String(item.heading || '').trim(),
        markdown: text,
        basis: 'web',
        critical: !!item.critical,
        ref: web.ref,
        cite: null,
        web: { title: web.title, url: web.url },
      };
    }
    const found = evidence.verifyPractice(item.quote, item.ref);
    if (!found) {
      problems.push(`${label}: the quote "${String(item.quote || '').slice(0, 60)}…" does not appear in any practice source. Quote exactly, or write this from the web instead, or drop it.`);
      return null;
    }
    return {
      heading: String(item.heading || '').trim(),
      markdown: text,
      basis: 'practice',
      critical: !!item.critical,
      ref: found.ref,
      cite: citationFor(found.chunk, found.exact ? item.quote : ''),
      web: null,
    };
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

  // A key point is a summary of the body, so it may only survive if the section
  // it summarises did. That keeps the "at a glance" box from being the one place
  // an unverified claim slips through — it is the part people actually read.
  const survivingRefs = new Set(kept.map((sec) => sec.ref));
  const keyPoints = (draft.keyPoints || [])
    .map((point) => ({
      text: String(point.text || '').trim(),
      ref: String(point.ref || '').trim().toUpperCase(),
      critical: !!point.critical,
    }))
    .filter((point) => point.text && survivingRefs.has(point.ref))
    .slice(0, 4);

  // A wall of red reads as no red at all. Whatever the model flagged, at most
  // one section and one key point are shown as critical — the first, which is
  // the one it thought mattered most.
  let criticalSections = 0;
  for (const sec of kept) {
    if (!sec.critical) continue;
    criticalSections += 1;
    if (criticalSections > 1) sec.critical = false;
  }
  let criticalPoints = 0;
  for (const point of keyPoints) {
    if (!point.critical) continue;
    criticalPoints += 1;
    if (criticalPoints > 1) point.critical = false;
  }

  if (kept.length && keyPoints.length < 2) {
    problems.push('The "in brief" summary is missing or too short. Give two to four key points, each one line, each citing a ref you used in a section.');
  }
  // Tappable next questions. Kept short and deduplicated: they are a shortcut to
  // the next question, not a second answer.
  const followUps = [...new Set((draft.followUps || [])
    .map((q) => String(q || '').replace(/\s+/g, ' ').trim())
    .filter((q) => q.length > 5 && q.length <= 120))].slice(0, 2);

  problems.push(...structureProblems(kept, question));
  problems.push(...referralProblems(kept, question, followUps));

  return { sections: kept, keyPoints, problems, messageCite, messageWeb, followUps };
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
      prompt: composePrompt({ question, history, evidence, feedback, previous: draft }),
    });
    draft = generated.object;
    if (onStatus) onStatus('Checking every claim against its source');
    result = validateDraft(draft, evidence, question);
    if (!result.problems.length) break;
    if (attempt === MAX_ATTEMPTS) break;
    feedback = result.problems.map((p, i) => `${i + 1}. ${p}`).join('\n');
  }

  const dropped = Math.max(0, (draft.sections || []).length - result.sections.length);
  return {
    answerable: draft.answerable !== false && result.sections.length > 0,
    intro: String(draft.intro || '').trim(),
    keyPoints: result.keyPoints,
    sections: result.sections,
    message: String(draft.message || '').trim(),
    messageCite: result.messageCite,
    messageWeb: result.messageWeb,
    tip: String(draft.tip || '').trim(),
    gaps: String(draft.gaps || '').trim(),
    followUps: result.followUps,
    validation: {
      attempts,
      checked: (draft.sections || []).length,
      verified: result.sections.length,
      dropped,
      problems: result.problems,
    },
  };
}
