// Writing the answer, and then checking it.
//
// THE MODEL PASSED IN HERE IS THE REASONING ROLE, ALWAYS. Writing is the one job
// that needs the whole context held at once — every source, the conversation,
// which claims the practice's own material actually backs, and what the reader
// will do next — and that is what the reasoning model is chosen for. Cheaper
// roles exist to keep work away from this phase (fewer sources reach it, see
// lib/agent/select.mjs; background jobs run elsewhere), never to take the
// writing off it. A caller handing this a cheap model is a bug, not a saving.
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
//
// The repair round is the slowest thing in a turn — a second full write of the
// answer — so it is spent only on defects that change what the reader does: an
// unverified claim, or a referral sent to the wrong place. A missing heading or
// a fifth section is a defect worth recording, not worth another model call and
// another twenty seconds of waiting.
import { generateObject } from 'ai';
import { z } from 'zod';

const MAX_ATTEMPTS = 2;

// The repair round improves an answer that has already been checked, so it is
// strictly optional. Left unbounded it has been seen to spend nearly three
// minutes producing output that never parses — for defects as small as a missing
// heading. Past this, the checked answer is shown as it stands.
const REPAIR_TIMEOUT_MS = 15_000;

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
  // The four fields that decide where a referral actually goes. Pulled out of
  // the prose because they are what the reader is looking for — burying them in
  // step six of a numbered list is how the wrong clinic type gets sent.
  referralRoute: z.object({
    requestType: z.string().default('').describe('Usually "Referral", unless the source says otherwise (for example "Advice and guidance").'),
    priority: z.string().default('').describe('"Routine", "Urgent", or "2WW" for a suspected cancer referral.'),
    specialty: z.string().default('').describe('The e-RS Speciality to set, exactly as the source names it — for example "Dermatology".'),
    clinicType: z.string().default('').describe('The e-RS Clinic Type to set, exactly as the source names it — for example "2WW Skin". Leave it EMPTY when nothing settles it, and empty when the source makes it conditional — the card then says it is not recorded, which is the honest answer. Never put a guess here.'),
    clinicTypeOptions: z.array(z.string()).default([])
      .describe('ONLY when the source leaves the clinic type conditional — one type normally and a different one when the doctor has asked for it. List EVERY type the source allows, the usual one first, and leave clinicType empty. You cannot see the doctor’s task, so you must not choose between them.'),
    clinicTypeCondition: z.string().default('')
      .describe('One line saying what decides the clinic type, whenever the source does not settle it outright — for example "Extended Scope only if the doctor’s task asks for it; otherwise Musculoskeletal." Empty when the source names one clinic type unconditionally.'),
    source: z.enum(['practice', 'suggested', '']).default('')
      .describe('"practice" when the pairing came from the practice’s own material. "suggested" when it came from suggest_ers_referral_route — that is a match against the e-RS referral-types list, and the reader is told to check it.'),
  }).default({ requestType: '', priority: '', specialty: '', clinicType: '', clinicTypeOptions: [], clinicTypeCondition: '', source: '' })
    .describe('ONLY for a referral question. The exact values to set on e-RS, from the practice material or from suggest_ers_referral_route. Leave every field empty when the question is not about making a referral, or when neither produced a pairing.'),
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

// `keepRefs` trims a repair round down to the sources actually in play. The
// research phase can gather a dozen full Notebook pages; re-sending all of them
// to fix one quote makes the repair call slower and likelier to fail outright,
// which is worse than not repairing at all. Sources that are dropped keep their
// title line, so the model can still see what else exists and ask for it.
function evidenceBlock(evidence, keepRefs = null) {
  const practice = evidence.practiceList();
  const web = evidence.webList();
  const parts = [];

  if (practice.length) {
    parts.push('PRACTICE SOURCES (authoritative — the practice’s own documents and Notebook):');
    for (const c of practice) {
      const head = `[${c.ref}] ${c.docTitle} — ${locationOf(c)}`;
      parts.push(!keepRefs || keepRefs.has(c.ref)
        ? `${head}\n${String(c.text || '').trim()}`
        : `${head}\n(not quoted in your previous attempt — full text omitted here)`);
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

// The e-RS referral-type match, when one was made. Kept out of the evidence
// registry on purpose: it is not a practice source and must never be quotable as
// one. It reaches the writer as a labelled hint instead.
function suggestionBlock(suggestion) {
  if (!suggestion || (!suggestion.specialty && !suggestion.clinicType)) return '';
  const lines = [
    '',
    'E-RS REFERRAL-TYPE MATCH (NOT practice policy — matched from the list of referral types e-RS accepts):',
    `- Speciality: ${suggestion.specialty || '(none matched)'}`,
    `- Clinic type: ${suggestion.clinicType || '(none matched)'}`,
  ];
  if (suggestion.snomed) lines.push(`- Matched from the condition "${suggestion.snomed.term}" (SNOMED ${suggestion.snomed.conceptId})`);
  if (suggestion.alternatives?.length) {
    lines.push('- Other close matches: ' + suggestion.alternatives.map((a) => `${a.specialty} / ${a.clinicType}`).join('; '));
  }
  lines.push(
    'THE PRACTICE SOURCES WIN. If any source above names a speciality or clinic type for this referral — even one that disagrees with the match below — use the source, set referralRoute.source to "practice", and ignore everything in this block. The Notebook is what the practice actually does; this is a match against a list.',
    'Use this ONLY when no source above records the pairing for this referral.',
    'If you use it: put it in referralRoute with source "suggested", and say in the steps that it is matched from the e-RS referral-types list and must be checked against the doctor’s task. Do not quote it as a practice source — it has no P-reference.',
  );
  return lines.join('\n');
}

function composePrompt({ question, history, evidence, feedback, previous, ersSuggestion, selectedRefs }) {
  const lines = [
    'You are the reception assistant for The Riverside Practice, a UK GP surgery. You are writing the answer that a receptionist will act on.',
    '',
    'THE RULES, IN ORDER OF IMPORTANCE',
    '1. Answer from the PRACTICE SOURCES wherever they cover the question. They are what the practice actually does.',
    '2. Every section you write must name the source it came from and, for practice sources, carry a quote copied EXACTLY from that source — character for character, at least a dozen words. A quote that is paraphrased, tidied or stitched together from two places will be rejected and your section thrown away.',
    '2a. The section TEXT is yours to write. Rewrite the source into plain steps a receptionist can follow — that is the job. Only the `quote` field must be verbatim: it is the proof the section is real, not the text shown to the reader. Never copy a wall of policy prose across just because it is easier to quote.',
    '3. If the practice sources do not cover part of the question and a web page does, you may write that section with basis "web". Say in the text itself that it is general guidance, not the practice’s own. Never dress a web page up as practice policy.',
    '4. If neither covers it, say so. Put what is missing in "gaps" and name who to ask (the practice manager, the duty doctor, the relevant lead). Do not fill the hole from your own knowledge.',
    '4a. AND DO NOT FILL IT FROM A NEARBY SOURCE EITHER. When the sources do not record the specific thing asked about — this hospital, this form, this service, this code — say that and stop. Do NOT fall back to the closest process you did find and write that out instead. Those steps are correctly quoted and completely useless: they answer a question nobody asked, and the reader acts on them believing they got an answer. Asked for a short form for a named hospital that is not in the material, the whole answer is that it is not recorded and who to ask — no keyPoints, no steps, two sentences. A short honest answer is a COMPLETE answer, and padding it out is the worst thing you can do with it.',
    '5. Never give clinical judgement about a specific patient. If that is what is being asked, set answerable to false and say a clinician must decide.',
    '6. Do not invent telephone numbers, email addresses, names or dates. Any that appear must come from a source.',
    '6a. Numbers found by find_contact are shown to the reader in a contacts card directly under your answer, exactly as their source wrote them. Say WHO to ring and what for, and let the card carry the digits — a number you retype that no source vouches for is stripped out before the answer is shown, leaving a hole where it was.',
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
    '- That applies when the question is HOW TO MAKE the referral. When it is narrower than that — a named hospital, a particular form, one service\'s own route — and the material does not record that thing, the standard steps are NOT the answer. Say what is not recorded and who to ask, and leave the steps out. Rule 4a governs here.',
    '- FILL IN referralRoute. It is displayed on its own at the top of the answer, because those four values are the whole point of the reader\'s question: request type, priority, speciality, clinic type. The speciality + clinic type pairing IS the "type of referral" field, and a referral cannot be sent without both. Still write the steps as well — referralRoute is the summary, not a replacement for them.',
    '- Never guess a speciality or a clinic type. If the practice material records them, use it and set referralRoute.source to "practice".',
    '- NEVER SETTLE A CONDITION YOU CANNOT CHECK. You cannot see the doctor’s task. If the material gives one clinic type normally and a different one only when the doctor has asked for it, do NOT pick a side: leave referralRoute.clinicType EMPTY, put every clinic type the material allows in referralRoute.clinicTypeOptions with the usual one first, and put what decides between them in referralRoute.clinicTypeCondition. Writing the condition out in the steps and then naming one of them in the card is the same mistake — the card is the part that gets acted on.',
    '- If nothing records a clinic type at all, leave referralRoute.clinicType empty. The card then says it is not recorded and to take it from the doctor’s task, which is the honest answer; a plausible-looking value in that box is how a referral reaches the wrong service.',
    '- If the practice material does NOT record them but suggest_ers_referral_route returned a pairing, put that pairing in referralRoute and set referralRoute.source to "suggested". Say in the steps that it is matched from the e-RS referral-types list and must be checked against the doctor’s task. "Set it as indicated in the task" on its own is NOT an acceptable answer when a pairing was returned — name it.',
    '- Only when neither the practice material nor the suggestion produced a pairing may you leave it to the task, and then say so plainly and put it in "gaps", naming who to ask.',
    '- A CANCER referral is a two week wait (2WW) referral. Set the priority to 2WW, not Routine, and use the 2WW clinic type the source gives for that speciality.',
    '- If the question is about an EMAIL referral, give the email steps ONLY: who to email, the address as the source gives it, what to attach, what to record afterwards. Do not also describe the e-RS / Choose and Book route, and never set out both routes for the reader to choose between.',
    '',
  ];
  if (history) lines.push('CONVERSATION SO FAR:', history, '');

  // What this model is shown in full. On a first attempt that is whatever
  // selection judged relevant to the question (lib/agent/select.mjs) — the
  // research loop opens sources freely, and this is the model that is expensive
  // to feed. Null means everything, which is what a caller that does no
  // selection gets.
  let keepRefs = selectedRefs || null;
  // On a repair, narrow further: the sources the previous attempt drew on and
  // any named in the defects are the ones a fix can need to re-quote.
  if (feedback && previous) {
    keepRefs = new Set((previous.sections || []).map((sec) => String(sec.ref || '').toUpperCase()));
    for (const ref of feedback.match(/\bP\d+\b/g) || []) keepRefs.add(ref.toUpperCase());
  }
  lines.push('QUESTION:', question, '', evidenceBlock(evidence, keepRefs));
  const suggestion = suggestionBlock(ersSuggestion);
  if (suggestion) lines.push(suggestion);
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

// Wording that leaves a clinic type conditional rather than settled — "Extended
// Scope Physiotherapy, but only when the doctor has asked for it". The assistant
// never sees the doctor's task, so it cannot resolve one of these; printing one
// branch of it in the e-RS card is how a referral reaches the wrong service.
const CONDITIONAL_WORDING = /\b(?:only|unless|otherwise|either|if|depends?|depending|whichever|specifie[sd]|requested|asked)\b/i;

const flatten = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// One line at a time: markdown steps and bullets are their own units, and a
// paragraph is split at its sentence ends. A condition has to be found in the
// same breath as the clinic type to count.
function sentencesOf(text) {
  return String(text || '')
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/(?<=[.!?;])\s+/))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// The sentence that makes this clinic type conditional, from the answer's own
// words or from the practice source behind them. Both are checked because the
// failure seen in the chat was an answer that set the condition out correctly in
// its steps — "Extended Scope only if the doctor has asked for it" — and then
// named Extended Scope in the card as though it were settled.
function conditionalClinicType(value, sections, evidence) {
  const needle = flatten(value);
  if (needle.length < 4) return '';
  const texts = sections.map((sec) => `${sec.heading}\n${sec.markdown}`);
  try { for (const chunk of evidence.practiceList()) texts.push(chunk.text); }
  catch (e) { /* a registry that cannot list its sources simply contributes none */ }
  for (const text of texts) {
    for (const sentence of sentencesOf(text)) {
      if (!flatten(sentence).includes(needle)) continue;
      if (CONDITIONAL_WORDING.test(sentence)) return sentence.replace(/[*_`]/g, '').trim();
    }
  }
  return '';
}

// Referral answers have three failure modes that are invisible to the grounding
// checks — every section can be perfectly quoted and the answer still be the
// wrong one to hand a receptionist. Checked here and fed through the same repair
// round as the structure defects.
function referralProblems(sections, question, followUps = [], route = null) {
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
    // A choice of clinic types counts as naming it: the choice IS what the
    // material records, and the card sets it out with the condition.
    const inRoute = !!(route && route.specialty && (route.clinicType || (route.clinicTypeOptions || []).length));
    const body = sections.map((sec) => sec.heading + ' ' + sec.markdown).join('\n');
    const inProse = SPECIALITY.test(body) && CLINIC_TYPE.test(body);
    if (!inRoute && !inProse) {
      problems.push('The answer never says which speciality and which clinic type to set for this referral. Put both in referralRoute — that is what the reader looks for first — and quote the source that records them. If no source records them, say that plainly in the answer instead of leaving it out.');
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
  // The subset worth a second model call: a claim that could not be verified, or
  // a referral that would be sent wrongly. Everything else is presentation, and
  // presentation is not worth making the reader wait twice.
  const mustFix = [];
  const critical = (problem) => { problems.push(problem); mustFix.push(problem); };

  const check = (item, label) => {
    const text = String(item.markdown || '').trim();
    if (!text) return null;
    if (item.basis === 'web') {
      const web = evidence.getWeb(item.ref);
      if (!web) {
        critical(`${label}: cites "${item.ref}", which is not a web page any search returned. Cite a real W-reference or drop it.`);
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
      critical(`${label}: the quote "${String(item.quote || '').slice(0, 60)}…" does not appear in any practice source. Quote exactly, or write this from the web instead, or drop it.`);
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

  const field = (v, max = 80) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const route = {
    requestType: field(draft.referralRoute?.requestType),
    priority: field(draft.referralRoute?.priority),
    specialty: field(draft.referralRoute?.specialty),
    clinicType: field(draft.referralRoute?.clinicType),
    // Every clinic type the material allows when it does not settle on one, and
    // the line that decides between them.
    clinicTypeOptions: [...new Set((draft.referralRoute?.clinicTypeOptions || []).map((v) => field(v)).filter(Boolean))].slice(0, 4),
    clinicTypeCondition: field(draft.referralRoute?.clinicTypeCondition, 200),
    // Unmarked means it came from the practice's own material; the card only
    // adds a caveat when the pairing was matched rather than recorded.
    source: draft.referralRoute?.source === 'suggested' ? 'suggested' : 'practice',
  };
  // A single "option" is not a choice, it is the clinic type. Two or more is a
  // choice the assistant is not entitled to make, so the card shows the choice
  // rather than whichever branch of it the model happened to write down.
  if (route.clinicTypeOptions.length === 1) {
    if (!route.clinicType) route.clinicType = route.clinicTypeOptions[0];
    route.clinicTypeOptions = [];
  } else if (route.clinicTypeOptions.length > 1) {
    route.clinicType = '';
  }

  // The card must never settle a condition the assistant cannot check — it
  // cannot see the doctor's task. When the answer, or the source behind it, only
  // applies this clinic type in certain circumstances, that condition is carried
  // onto the card here and the model is asked to set the choice out properly on
  // the repair round. The carry-over is the safety net for when it does not.
  let unsettled = '';
  if (route.clinicType && !route.clinicTypeCondition) {
    unsettled = conditionalClinicType(route.clinicType, kept, evidence);
    if (unsettled) route.clinicTypeCondition = field(unsettled, 200);
  }

  // Shown only when it says something about where the referral goes — a card
  // holding nothing but "Referral" is noise.
  const referralRoute = (route.specialty || route.clinicType || route.clinicTypeOptions.length || route.priority) ? route : null;

  // Layout defects: recorded, fed back if a repair happens anyway, never the
  // reason one is started.
  problems.push(...structureProblems(kept, question));
  // A referral defect sends the reader to the wrong service, so it is worth the
  // second call on its own.
  for (const problem of referralProblems(kept, question, followUps, referralRoute)) critical(problem);
  if (referralRoute && unsettled) {
    critical(`The e-RS card names "${route.clinicType}" as the clinic type, but the material only applies it conditionally — "${unsettled.slice(0, 120)}". You cannot see the doctor’s task, so you may not pick a side. Leave referralRoute.clinicType empty, list every clinic type the material allows in referralRoute.clinicTypeOptions with the usual one first, and put the condition in referralRoute.clinicTypeCondition.`);
  }

  return { sections: kept, keyPoints, problems, mustFix, messageCite, messageWeb, followUps, referralRoute };
}

// Write an answer, check it, and give the model one chance to fix what failed.
// `onStatus` reports each stage so the browser can show what is happening.
export async function composeVerifiedAnswer({
  model,
  question,
  history,
  evidence,
  onStatus,
  ersSuggestion = null,
  // The references selection judged relevant. Null shows the writer everything.
  selectedRefs = null,
  // Reports what each attempt used, so a question can be priced from what it
  // really cost rather than from the model's advertised rate.
  onUsage,
}) {
  let draft = null;
  let result = null;
  let attempts = 0;
  let feedback = '';
  let repairFailed = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    if (onStatus) onStatus(attempt === 1 ? 'Writing the answer' : 'Tidying the answer up');
    const prompt = composePrompt({ question, history, evidence, feedback, previous: draft, ersSuggestion, selectedRefs });
    const startedAt = Date.now();
    let generated;
    try {
      generated = await generateObject({
        model,
        schema: AnswerSchema,
        temperature: 0.2,
        // The repair round gets one attempt and a deadline, not the SDK's
        // default retries. It improves an answer that already verified, so it is
        // never worth minutes spent on a model that cannot return valid JSON.
        maxRetries: attempt === 1 ? 2 : 0,
        abortSignal: attempt === 1 ? undefined : AbortSignal.timeout(REPAIR_TIMEOUT_MS),
        prompt,
      });
    } catch (e) {
      console.warn(`[compose] attempt ${attempt} failed after ${Date.now() - startedAt}ms: ${String(e).slice(0, 160)}`);
      // Attempt 1 failing means there is no answer at all — that has to surface.
      // A repair failing does not: the previous draft was already checked, and
      // showing it beats replacing a usable answer with an error.
      if (attempt === 1) throw e;
      repairFailed = true;
      break;
    }
    draft = generated.object;
    if (onUsage) onUsage(attempt === 1 ? 'write' : 'repair', generated.usage);
    if (onStatus) onStatus('Checking every claim against its source');
    result = validateDraft(draft, evidence, question);
    if (!result.problems.length) break;
    if (attempt === MAX_ATTEMPTS) break;
    // Only a defect that changes what the reader DOES buys a second write. A
    // heading the model left off, or a fifth section, is recorded in the
    // validation report and shown as it stands — the answer was already checked
    // against its sources, and another twenty seconds of "tidying the answer up"
    // buys the reader nothing they were waiting for.
    if (!result.mustFix.length) break;
    // When a repair is happening anyway, the layout defects go with it — they
    // cost nothing extra once the call is being made.
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
    referralRoute: result.referralRoute,
    validation: {
      attempts,
      checked: (draft.sections || []).length,
      verified: result.sections.length,
      dropped,
      problems: result.problems,
      repairFailed,
    },
  };
}
